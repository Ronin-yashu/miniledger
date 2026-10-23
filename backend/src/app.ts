import express, { NextFunction, Request, Response } from "express";
import cors from "cors";
import jwt from "jsonwebtoken";
import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { Db } from "./db";
import { createLoanSchema, requestOtpSchema, verifyOtpSchema } from "./validation";

export interface AppOptions {
  jwtSecret: string;
  uploadDir: string;
  log?: (msg: string) => void;
  now?: () => Date;
}

interface AuthedRequest extends Request {
  userId?: number;
}

const OTP_TTL_MS = 5 * 60 * 1000;
const MAX_OTP_ATTEMPTS = 5;

const toDateStr = (v: unknown): string =>
  v instanceof Date ? v.toISOString().slice(0, 10) : String(v);

function mapLoan(r: any, today: string) {
  const dueDate = toDateStr(r.due_date);
  const repaid = r.repaid_at != null;
  return {
    id: r.id,
    friendName: r.friend_name,
    amount: Number(r.amount),
    dueDate,
    repaid,
    repaidAt: r.repaid_at ? new Date(r.repaid_at).toISOString() : null,
    overdue: !repaid && dueDate < today,
    receiptUrl: r.receipt_path ? `/uploads/${r.receipt_path}` : null,
    createdAt: new Date(r.created_at).toISOString(),
  };
}

export function createApp(db: Db, opts: AppOptions) {
  const log = opts.log ?? console.log;
  const now = opts.now ?? (() => new Date());
  const today = () => now().toISOString().slice(0, 10);

  fs.mkdirSync(opts.uploadDir, { recursive: true });

  const upload = multer({
    storage: multer.diskStorage({
      destination: opts.uploadDir,
      filename: (_req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase() || ".jpg";
        cb(null, crypto.randomBytes(16).toString("hex") + ext);
      },
    }),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (_req, file, cb) =>
      file.mimetype.startsWith("image/")
        ? cb(null, true)
        : cb(new Error("Only image uploads are allowed")),
  });

  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "8mb" }));
  app.use("/uploads", express.static(opts.uploadDir));

  app.get("/health", (_req, res) => res.json({ ok: true }));

  // ---- Auth -------------------------------------------------------------
  app.post("/auth/request-otp", async (req, res, next) => {
    try {
      const parsed = requestOtpSchema.safeParse(req.body);
      if (!parsed.success) return validationError(res, parsed.error);
      const { phone } = parsed.data;
      const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
      const expires = new Date(now().getTime() + OTP_TTL_MS);
      await db.query(
        `INSERT INTO otps (phone, code, expires_at, attempts) VALUES ($1,$2,$3,0)
         ON CONFLICT (phone) DO UPDATE SET code=$2, expires_at=$3, attempts=0`,
        [phone, code, expires.toISOString()]
      );
      log(`[MOCK OTP] ${phone} -> ${code} (valid 5 min)`);
      res.json({ message: "OTP sent (check the server log)" });
    } catch (e) {
      next(e);
    }
  });

  app.post("/auth/verify-otp", async (req, res, next) => {
    try {
      const parsed = verifyOtpSchema.safeParse(req.body);
      if (!parsed.success) return validationError(res, parsed.error);
      const { phone, otp } = parsed.data;

      const { rows } = await db.query("SELECT * FROM otps WHERE phone=$1", [phone]);
      const rec = rows[0];
      if (!rec) return res.status(400).json({ error: "Request an OTP first" });
      if (new Date(rec.expires_at) < now()) {
        return res.status(400).json({ error: "OTP expired, request a new one" });
      }
      if (rec.attempts >= MAX_OTP_ATTEMPTS) {
        return res.status(429).json({ error: "Too many attempts, request a new OTP" });
      }
      if (rec.code !== otp) {
        await db.query("UPDATE otps SET attempts = attempts + 1 WHERE phone=$1", [phone]);
        return res.status(400).json({ error: "Incorrect OTP" });
      }
      await db.query("DELETE FROM otps WHERE phone=$1", [phone]);

      await db.query("INSERT INTO users (phone) VALUES ($1) ON CONFLICT (phone) DO NOTHING", [phone]);
      const u = await db.query("SELECT id FROM users WHERE phone=$1", [phone]);
      const userId = u.rows[0].id as number;
      const token = jwt.sign({ sub: userId }, opts.jwtSecret, { expiresIn: "7d" });
      res.json({ token, user: { id: userId, phone } });
    } catch (e) {
      next(e);
    }
  });

  // ---- Auth middleware --------------------------------------------------
  const requireAuth = (req: AuthedRequest, res: Response, next: NextFunction) => {
    const header = req.headers.authorization ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: "Missing token" });
    try {
      const payload = jwt.verify(token, opts.jwtSecret) as unknown as { sub: number };
      req.userId = Number(payload.sub);
      next();
    } catch {
      res.status(401).json({ error: "Invalid or expired token" });
    }
  };

  // ---- Loans ------------------------------------------------------------
  app.get("/loans", requireAuth, async (req: AuthedRequest, res, next) => {
    try {
      const { rows } = await db.query(
        "SELECT * FROM loans WHERE user_id=$1 ORDER BY id DESC",
        [req.userId]
      );
      const t = today();
      const loans = rows.map((r) => mapLoan(r, t));
      // Overdue first, then unpaid by soonest due date, repaid last.
      const rank = (l: ReturnType<typeof mapLoan>) => (l.overdue ? 0 : l.repaid ? 2 : 1);
      loans.sort((a, b) => rank(a) - rank(b) || a.dueDate.localeCompare(b.dueDate));
      res.json({ loans });
    } catch (e) {
      next(e);
    }
  });

  app.post("/loans", requireAuth, upload.single("receipt"), async (req: AuthedRequest, res, next) => {
    try {
      const parsed = createLoanSchema.safeParse(req.body);
      if (!parsed.success) {
        if (req.file) fs.unlink(req.file.path, () => {});
        return validationError(res, parsed.error);
      }
      const { friendName, amount, dueDate } = parsed.data;

      // Receipt: either multipart file (req.file) or base64 string in the JSON body.
      let receiptFile: string | null = req.file?.filename ?? null;
      const b64 = typeof req.body.receiptBase64 === "string" ? req.body.receiptBase64 : null;
      if (!receiptFile && b64) {
        const exts: Record<string, string> = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp" };
        const ext = exts[String(req.body.receiptMime ?? "image/jpeg")];
        const buf = Buffer.from(b64, "base64");
        if (!ext) return res.status(400).json({ error: "Unsupported image type" });
        if (buf.length === 0 || buf.length > 5 * 1024 * 1024)
          return res.status(400).json({ error: "Receipt image must be under 5 MB" });
        receiptFile = crypto.randomBytes(16).toString("hex") + ext;
        await fs.promises.writeFile(path.join(opts.uploadDir, receiptFile), buf);
      }

      const { rows } = await db.query(
        `INSERT INTO loans (user_id, friend_name, amount, due_date, receipt_path)
         VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [req.userId, friendName, amount, dueDate, receiptFile]
      );
      res.status(201).json({ loan: mapLoan(rows[0], today()) });
    } catch (e) {
      next(e);
    }
  });

  app.patch("/loans/:id/repay", requireAuth, async (req: AuthedRequest, res, next) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "Invalid loan id" });
      const { rows } = await db.query(
        `UPDATE loans SET repaid_at=$3 WHERE id=$1 AND user_id=$2 AND repaid_at IS NULL RETURNING *`,
        [id, req.userId, now().toISOString()]
      );
      if (rows.length) return res.json({ loan: mapLoan(rows[0], today()) });

      const existing = await db.query("SELECT * FROM loans WHERE id=$1 AND user_id=$2", [id, req.userId]);
      if (!existing.rows.length) return res.status(404).json({ error: "Loan not found" });
      return res.status(409).json({ error: "Loan already marked as repaid" });
    } catch (e) {
      next(e);
    }
  });

  // ---- Summary ----------------------------------------------------------
  app.get("/summary", requireAuth, async (req: AuthedRequest, res, next) => {
    try {
      const { rows } = await db.query(
        `SELECT
           COALESCE(SUM(amount), 0) AS total_lent,
           COALESCE(SUM(CASE WHEN repaid_at IS NOT NULL THEN amount ELSE 0 END), 0) AS total_repaid,
           COALESCE(SUM(CASE WHEN repaid_at IS NULL AND due_date < $2 THEN amount ELSE 0 END), 0) AS overdue
         FROM loans WHERE user_id=$1`,
        [req.userId, today()]
      );
      const r = rows[0];
      const totalLent = Number(r.total_lent);
      const totalRepaid = Number(r.total_repaid);
      res.json({
        totalLent,
        totalRepaid,
        totalOutstanding: Math.round((totalLent - totalRepaid) * 100) / 100,
        overdueAmount: Number(r.overdue),
      });
    } catch (e) {
      next(e);
    }
  });

  // ---- Errors -----------------------------------------------------------
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof multer.MulterError || err?.message === "Only image uploads are allowed") {
      return res.status(400).json({ error: err.message });
    }
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  });

  return app;
}

function validationError(res: Response, err: import("zod").ZodError) {
  return res.status(400).json({
    error: err.issues[0]?.message ?? "Invalid input",
    details: err.issues.map((i) => ({ field: i.path.join("."), message: i.message })),
  });
}