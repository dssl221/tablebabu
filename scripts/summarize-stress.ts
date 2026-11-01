import { readFile, writeFile } from "node:fs/promises";

const [logFile, outputFile, contextFile, runFile] = process.argv.slice(2);
if (!logFile || !outputFile)
  throw new Error(
    "Usage: tsx scripts/summarize-stress.ts logFile outputFile [restaurantContextFile|-] [runFile]",
  );
const bytes = await readFile(logFile);
const text =
  bytes[0] === 255 && bytes[1] === 254
    ? bytes.toString("utf16le")
    : bytes.toString("utf8");
const records: any[] = [];
for (const line of text.split(/\r?\n/)) {
  try {
    records.push(JSON.parse(line));
  } catch {
    /* framework messages are not telemetry */
  }
}
const context =
  contextFile && contextFile !== "-"
    ? JSON.parse(await readFile(contextFile, "utf8"))
    : null;
const ids = context ? new Set(context.restaurants.map((r: any) => r.id)) : null;
const run = runFile ? JSON.parse(await readFile(runFile, "utf8")) : null;
const inRun = (r: any) =>
  !run || (r.timestamp >= run.startedAt && r.timestamp <= run.endedAt);
const orders = records.filter(
  (r) => r.event === "order.transaction" && (!ids || ids.has(r.restaurantId)),
);
const failures = records.filter(
  (r) =>
    r.event === "order.transaction.failure" &&
    (!ids || ids.has(r.restaurantId)),
);
function stats(values: number[]) {
  values.sort((a, b) => a - b);
  const percentile = (n: number) =>
    values.length ? +values[Math.ceil(values.length * n) - 1].toFixed(2) : null;
  return {
    count: values.length,
    p50: percentile(0.5),
    p95: percentile(0.95),
    p99: percentile(0.99),
    max: values.length ? values.at(-1) : null,
  };
}
const stages: Record<string, unknown> = {};
for (const stage of new Set<string>(
  orders.flatMap((r) => Object.keys(r.timings)),
))
  stages[stage] = stats(
    orders.map((r) => r.timings[stage]).filter((n) => typeof n === "number"),
  );
const counts = (values: string[]) =>
  values.reduce<Record<string, number>>(
    (acc, k) => ((acc[k] = (acc[k] || 0) + 1), acc),
    {},
  );
let runtime = records.filter((r) => r.event === "runtime.sample" && inRun(r));
const connections = (state: string) =>
  runtime.map((r) =>
    r.connections
      .filter((c: any) => c.state === state)
      .reduce((n: number, c: any) => n + c.count, 0),
  );
const summary = {
  source: logFile,
  scope: ids
    ? "Recorded platform stress fixture restaurant IDs"
    : "All order transactions in this log",
  transactions: orders.length,
  retriedSuccessfulTransactions: orders.filter((r) => r.attempt > 0).length,
  failedAttempts: failures.length,
  errorCodes: counts(
    failures.map((r) => r.postgresCode || r.prismaCode || r.errorType),
  ),
  elapsedMs: stats(orders.map((r) => r.elapsedMs)),
  stagesMs: stages,
  pool: records.filter((r) => r.event === "database.pool"),
  runtime: {
    window: run
      ? { startedAt: run.startedAt, endedAt: run.endedAt }
      : "Entire log; may include adjacent verification activity",
    samples: runtime.length,
    first: runtime[0],
    last: runtime.at(-1),
    rssMiB: stats(runtime.map((r) => r.memory.rss / 1024 / 1024)),
    heapMiB: stats(runtime.map((r) => r.memory.heapUsed / 1024 / 1024)),
    cpuPercent: stats(runtime.map((r) => r.cpuPercent)),
    eventLoopP99Ms: stats(runtime.map((r) => r.eventLoopP99Ms)),
    activeConnections: stats(connections("active")),
    idleConnections: stats(connections("idle")),
    idleInTransactionConnections: stats(connections("idle in transaction")),
    waitingConnections: stats(
      runtime.map((r) =>
        r.connections
          .filter((c: any) => c.waitEventType === "Lock")
          .reduce((n: number, c: any) => n + c.count, 0),
      ),
    ),
    pendingOrderStarts: stats(
      runtime
        .map((r) => r.orderTransactions?.pendingStarts)
        .filter((n) => typeof n === "number"),
    ),
    peakPendingOrderStarts: Math.max(
      0,
      ...runtime.map((r) => r.orderTransactions?.peakPendingStarts || 0),
    ),
    sockets: stats(runtime.map((r) => r.sockets)),
  },
};
await writeFile(outputFile, JSON.stringify(summary, null, 2));
console.log(
  JSON.stringify({
    transactions: summary.transactions,
    failedAttempts: summary.failedAttempts,
    elapsedMs: summary.elapsedMs,
    stagesMs: summary.stagesMs,
    runtimeSamples: runtime.length,
  }),
);
