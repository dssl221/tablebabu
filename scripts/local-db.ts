import "dotenv/config";
import EmbeddedPostgres from "embedded-postgres";
import { existsSync } from "node:fs";
const url = new URL(
  process.env.DATABASE_URL || "postgresql://menu:menu@localhost:5432/tablebabu",
);
if (!["localhost", "127.0.0.1"].includes(url.hostname))
  throw new Error("db:local is only for a localhost development database.");
const pg = new EmbeddedPostgres({
  databaseDir: "./.postgres",
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  port: Number(url.port || 5432),
  persistent: true,
  authMethod: "scram-sha-256",
  postgresFlags: ["-h", "127.0.0.1", "-c", "timezone=UTC"],
  onLog: () => {},
  onError: (message) => console.error(String(message)),
});
async function main() {
  if (!existsSync("./.postgres/PG_VERSION")) await pg.initialise();
  await pg.start();
  const client = pg.getPgClient();
  await client.connect();
  const name = url.pathname.slice(1);
  if (!/^[a-zA-Z0-9_]+$/.test(name)) throw new Error("Invalid database name.");
  const result = await client.query(
    "SELECT 1 FROM pg_database WHERE datname=$1",
    [name],
  );
  if (!result.rowCount) await pg.createDatabase(name);
  await client.end();
  console.log("Local PostgreSQL ready. Keep this terminal open.");
  process.on("SIGINT", async () => {
    await pg.stop();
    process.exit(0);
  });
  process.on("SIGTERM", async () => {
    await pg.stop();
    process.exit(0);
  });
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
