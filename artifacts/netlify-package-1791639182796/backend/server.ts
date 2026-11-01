import "dotenv/config";
import next from "next";
import express from "express";
import helmet from "helmet";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { createApi } from "./src/server/api";
import {
  authenticate,
  customer,
  origin,
  production,
} from "./src/server/security";
import { db } from "./src/server/db";
import { requestBoundary, scriptSources } from "./src/server/hardening";
import { performanceDiagnostics } from './src/server/performance-diagnostics';

process.env.TZ = "UTC";

async function main() {
  const port = Number(process.env.PORT || 3000);
  const app = next({ dev: !production, port, hostname: "0.0.0.0" });
  await app.prepare();
  const expressApp = express();
  if (process.env.TRUST_PROXY === "1") expressApp.set("trust proxy", 1);
  expressApp.disable("x-powered-by");
  expressApp.use(requestBoundary);
  expressApp.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: scriptSources,
          baseUri: ["'none'"],
          formAction: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "https:", "data:", "blob:"],
          connectSrc: [
            "'self'",
            ...(production ? [] : ["ws:", "http://localhost:*"]),
          ],
          fontSrc: ["'self'", "data:"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          upgradeInsecureRequests: production ? [] : null,
        },
      },
      crossOriginEmbedderPolicy: false,
      strictTransportSecurity: production ? undefined : false,
    }),
  );
  const http = createServer(expressApp);
  http.requestTimeout = 30000;
  http.headersTimeout = 15000;
  http.keepAliveTimeout = 5000;
  http.maxHeadersCount = 100;
  const io = new Server(http, {
    cors: { origin, credentials: true },
    maxHttpBufferSize: 10000,
    allowRequest: (req, callback) =>
      callback(
        null,
        req.headers.origin === origin ||
          (!req.headers.origin &&
            req.headers["sec-fetch-site"] === "same-origin" &&
            req.headers.host === new URL(origin).host),
      ),
  });
  io.use(async (socket, done) => {
    try {
      if (socket.handshake.auth.role === "admin") {
        const auth = await authenticate(socket.request.headers.cookie);
        if (!auth || !auth.user.restaurants[0])
          throw new Error("Sign in required");
        socket.data.rooms = [
          `admin:${auth.user.restaurants[0].id}`,
          `auth:${auth.id}`,
        ];
        socket.data.expires = auth.expiresAt.getTime();
      } else {
        const slug = String(socket.handshake.auth.slug || "").slice(0, 80);
        const r = await db.restaurant.findUnique({ where: { slug } });
        if (!r?.isActive || r.onboardingStatus !== "LIVE")
          throw new Error("Restaurant not found");
        socket.data.rooms = [`menu:${r.id}`];
        socket.data.expires = Date.now() + 3600000;
        try {
          const s = await customer(socket.request.headers.cookie, slug, true);
          socket.data.rooms.push(`session:${s.id}`);
          socket.data.expires = s.expiresAt.getTime();
        } catch {
          /* Anonymous viewers receive menu invalidations only. */
        }
      }
      done();
    } catch {
      done(new Error("Connection not authorized"));
    }
  });
  io.on("connection", (socket) => {
    socket.join(socket.data.rooms);
    const timer = setTimeout(
      () => socket.disconnect(true),
      Math.max(1, socket.data.expires - Date.now()),
    );
    socket.on("disconnect", () => clearTimeout(timer));
  });
  expressApp.use(
    "/api",
    express.json({ limit: "100kb", inflate: false }),
    createApi(io),
  );
  expressApp.use(
    "/api",
    (
      error: { status?: number },
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      const status = error.status === 413 ? 413 : 400;
      res.status(status).json({
        error:
          status === 413
            ? "Request body is too large."
            : "Invalid request body.",
      });
    },
  );
  expressApp.use(
    "/uploads",
    express.static("uploads", {
      dotfiles: "deny",
      maxAge: "7d",
      immutable: true,
      setHeaders: (res) => res.setHeader("X-Content-Type-Options", "nosniff"),
    }),
  );
  expressApp.use((req, res) => {
    req.headers["content-security-policy"] = String(
      res.getHeader("Content-Security-Policy"),
    );
    return app.getRequestHandler()(req, res);
  });
  const cleanup = setInterval(() => {
    db.securityThrottle
      .deleteMany({
        where: { expiresAt: { lt: new Date(Date.now() - 3600000) } },
      })
      .catch(() => console.error("Security throttle cleanup failed"));
  }, 15 * 60000);
  cleanup.unref();
  http.listen(port, "0.0.0.0", () =>
    console.log(`TableBabu ready at ${origin}`),
  );
  const stopDiagnostics = performanceDiagnostics(io);
  const stop = () => {
    stopDiagnostics();
    clearInterval(cleanup);
    io.close();
    http.close(async () => {
      await db.$disconnect();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
