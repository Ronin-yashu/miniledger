import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { newDb } from "pg-mem";
import os from "os";
import path from "path";
import fs from "fs";
import { createApp } from "../src/app";
import { migrate } from "../src/db";

const PHONE = "+919876543210";
let app: ReturnType<typeof createApp>;
let otpLog: string[];

async function login(phone = PHONE) {
  await request(app).post("/auth/request-otp").send({ phone });
  const otp = otpLog[otpLog.length - 1].match(/-> (\d{6})/)![1];
  const res = await request(app).post("/auth/verify-otp").send({ phone, otp });
  return res.body.token as string;
}

beforeEach(async () => {
  const { Pool } = newDb().adapters.createPg();
  const pool = new Pool();
  await migrate(pool);
  otpLog = [];
  app = createApp(pool, {
    jwtSecret: "test",
    uploadDir: fs.mkdtempSync(path.join(os.tmpdir(), "ml-")),
    log: (m) => otpLog.push(m),
    now: () => new Date("2026-10-23T10:00:00Z"),
  });
});

describe("auth", () => {
  it("logs OTP to the server log and issues a token on correct OTP", async () => {
    const token = await login();
    expect(otpLog[0]).toContain(PHONE);
    expect(token).toBeTruthy();
  });
  it("rejects wrong OTP and invalid phone", async () => {
    await request(app).post("/auth/request-otp").send({ phone: PHONE });
    const bad = await request(app).post("/auth/verify-otp").send({ phone: PHONE, otp: "000000" });
    expect([400]).toContain(bad.status);
    const invalid = await request(app).post("/auth/request-otp").send({ phone: "abc" });
    expect(invalid.status).toBe(400);
  });
  it("blocks unauthenticated access", async () => {
    expect((await request(app).get("/loans")).status).toBe(401);
  });
});

describe("loans", () => {
  it("validates input", async () => {
    const token = await login();
    const auth = { Authorization: `Bearer ${token}` };
    const r1 = await request(app).post("/loans").set(auth).send({ friendName: "", amount: 10, dueDate: "2026-11-01" });
    const r2 = await request(app).post("/loans").set(auth).send({ friendName: "A", amount: -5, dueDate: "2026-11-01" });
    const r3 = await request(app).post("/loans").set(auth).send({ friendName: "A", amount: 5, dueDate: "2026-02-31" });
    expect([r1.status, r2.status, r3.status]).toEqual([400, 400, 400]);
  });

  it("creates, flags overdue, repays, and summarises", async () => {
    const token = await login();
    const auth = { Authorization: `Bearer ${token}` };
    const a = await request(app).post("/loans").set(auth).send({ friendName: "Rahul", amount: 500, dueDate: "2026-10-01" });
    await request(app).post("/loans").set(auth).send({ friendName: "Priya", amount: 250.5, dueDate: "2026-12-01" });
    const c = await request(app).post("/loans").set(auth).send({ friendName: "Amit", amount: 100, dueDate: "2026-09-01" });
    expect(a.status).toBe(201);
    expect(a.body.loan.overdue).toBe(true);

    let summary = await request(app).get("/summary").set(auth);
    expect(summary.body).toMatchObject({ totalLent: 850.5, totalRepaid: 0, overdueAmount: 600 });

    const repay = await request(app).patch(`/loans/${c.body.loan.id}/repay`).set(auth);
    expect(repay.body.loan.repaid).toBe(true);
    expect((await request(app).patch(`/loans/${c.body.loan.id}/repay`).set(auth)).status).toBe(409);

    summary = await request(app).get("/summary").set(auth);
    expect(summary.body).toMatchObject({ totalLent: 850.5, totalRepaid: 100, overdueAmount: 500 });

    const list = await request(app).get("/loans").set(auth);
    expect(list.body.loans[0].friendName).toBe("Rahul"); // overdue first
    expect(list.body.loans[2].repaid).toBe(true); // repaid last
  });

  it("isolates data between users", async () => {
    const t1 = await login(PHONE);
    const t2 = await login("+919111111111");
    const created = await request(app).post("/loans").set({ Authorization: `Bearer ${t1}` })
      .send({ friendName: "X", amount: 10, dueDate: "2026-12-01" });
    const other = await request(app).patch(`/loans/${created.body.loan.id}/repay`).set({ Authorization: `Bearer ${t2}` });
    expect(other.status).toBe(404);
    expect((await request(app).get("/loans").set({ Authorization: `Bearer ${t2}` })).body.loans).toHaveLength(0);
  });

  it("accepts a receipt image and rejects non-images", async () => {
    const token = await login();
    const auth = { Authorization: `Bearer ${token}` };
    const ok = await request(app).post("/loans").set(auth)
      .field("friendName", "Sam").field("amount", "40").field("dueDate", "2026-12-05")
      .attach("receipt", Buffer.from("fake"), { filename: "r.jpg", contentType: "image/jpeg" });
    expect(ok.status).toBe(201);
    expect(ok.body.loan.receiptUrl).toMatch(/^\/uploads\//);
    const bad = await request(app).post("/loans").set(auth)
      .field("friendName", "Sam").field("amount", "40").field("dueDate", "2026-12-05")
      .attach("receipt", Buffer.from("x"), { filename: "r.txt", contentType: "text/plain" });
    expect(bad.status).toBe(400);
  });

  it("accepts a base64 receipt in a JSON body", async () => {
    const token = await login();
    const auth = { Authorization: `Bearer ${token}` };
    const ok = await request(app).post("/loans").set(auth).send({
      friendName: "Sam", amount: 40, dueDate: "2026-12-05",
      receiptBase64: Buffer.from("fake-image").toString("base64"), receiptMime: "image/jpeg",
    });
    expect(ok.status).toBe(201);
    expect(ok.body.loan.receiptUrl).toMatch(/\.jpg$/);
    const bad = await request(app).post("/loans").set(auth).send({
      friendName: "Sam", amount: 40, dueDate: "2026-12-05", receiptBase64: "aGk=", receiptMime: "text/html",
    });
    expect(bad.status).toBe(400);
  });
});