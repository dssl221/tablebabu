import { monitorEventLoopDelay } from "node:perf_hooks";
import { PrismaClient } from "@prisma/client";
import type { Server } from "socket.io";
import { transactionLoad } from "./transaction-load";

export function performanceDiagnostics(io: Server) {
  if (process.env.ORDER_DIAGNOSTICS !== "1") return () => {};
  const url = new URL(process.env.DATABASE_URL!);
  url.searchParams.set("connection_limit", "1");
  // One observer connection prevents sampling from waiting behind app queries.
  const observer = new PrismaClient({
    datasources: { db: { url: url.toString() } },
  });
  const lag = monitorEventLoopDelay({ resolution: 20 });
  lag.enable();
  let previousCpu = process.cpuUsage(),
    previous = performance.now(),
    busy = false;
  const timer = setInterval(async () => {
    if (busy) return;
    busy = true;
    try {
      const rows = await observer.$queryRaw<
        { state: string; waitEventType: string | null; count: number }[]
      >`SELECT state, wait_event_type AS "waitEventType", count(*)::int AS count FROM pg_stat_activity WHERE datname=current_database() AND backend_type='client backend' GROUP BY state, wait_event_type`;
      const cpu = process.cpuUsage(previousCpu),
        elapsed = performance.now() - previous;
      previousCpu = process.cpuUsage();
      previous = performance.now();
      process.stdout.write(
        JSON.stringify({
          event: "runtime.sample",
          orderTransactions: transactionLoad,
          timestamp: new Date().toISOString(),
          memory: process.memoryUsage(),
          cpuPercent: ((cpu.user + cpu.system) / 1000 / elapsed) * 100,
          eventLoopP99Ms: lag.percentile(99) / 1e6,
          sockets: io.engine.clientsCount,
          connections: rows,
        }) + "\n",
      );
      lag.reset();
    } catch {
      process.stdout.write(
        JSON.stringify({ event: "runtime.sample.failed" }) + "\n",
      );
    } finally {
      busy = false;
    }
  }, 5000);
  timer.unref();
  return () => {
    clearInterval(timer);
    lag.disable();
    void observer.$disconnect();
  };
}
