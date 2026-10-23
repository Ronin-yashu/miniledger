import "dotenv/config";
import path from "path";
import { createPool, migrate } from "./db";
import { createApp } from "./app";

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required (see .env.example)");
  const pool = createPool(databaseUrl);
  await migrate(pool);

  const app = createApp(pool, {
    jwtSecret: process.env.JWT_SECRET ?? "dev-secret",
    uploadDir: path.join(process.cwd(), "uploads"),
  });
  const port = Number(process.env.PORT ?? 4000);
  app.listen(port, "0.0.0.0", () => console.log(`MiniLedger API listening on :${port}`));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});