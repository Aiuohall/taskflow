import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import { sessionLimiter, chatLimiter } from "./middleware/rateLimiters.js";
import { sanitizeRequest } from "./middleware/sanitize.js";
import { connectDB, dbStatus } from "./config/db.js";
import { verifyMailer, mailerStatus } from "./config/mailer.js";
import authRoutes from "./routes/auth.js";
import projectRoutes from "./routes/projects.js";
import taskRoutes from "./routes/tasks.js";
import dashboardRoutes from "./routes/dashboard.js";
import invitationRoutes from "./routes/invitations.js";
import chatRoutes from "./routes/chat.js";

const app = express();

// Behind Render's proxy — required so express-rate-limit sees real client IPs.
app.set("trust proxy", Number(process.env.TRUST_PROXY_HOPS || 1));
app.disable("x-powered-by");

app.use(helmet());

// gzip JSON responses. The dashboard payload in particular compresses ~80%.
app.use(compression());

// Lock CORS to the configured frontend origin(s). CLIENT_ORIGIN can be a
// comma-separated list. If unset, allow all (handy for local dev).
const allowedOrigins = (process.env.CLIENT_ORIGIN || "")
  .split(",")
  .map((s) => s.trim().replace(/\/$/, "")) // tolerate a trailing slash in the env var
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      // Allow non-browser clients (curl, health checks) and any origin when
      // no allowlist is configured.
      if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin.replace(/\/$/, ""))) {
        return callback(null, true);
      }
      callback(new Error("Not allowed by CORS"));
    },
    maxAge: 86400, // cache the preflight for a day instead of re-flighting every request
  })
);

app.use(express.json({ limit: "100kb" }));

// Strip MongoDB operators from every request before any route can build a
// query from them. Must sit after the body parser and before the routes.
app.use(sanitizeRequest);

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    uptime: Math.round(process.uptime()),
    db: { mode: dbStatus.mode, connected: dbStatus.connected },
    // Surfaced so a dead Gmail App Password is one curl away from being
    // diagnosed, instead of being invisible until a user complains.
    mail: {
      mode: mailerStatus.mode,
      ready: mailerStatus.ready,
      note: mailerStatus.note,
      sent: mailerStatus.sent,
      failed: mailerStatus.failed,
      lastSentAt: mailerStatus.lastSentAt,
      lastError: mailerStatus.lastError,
      lastErrorAt: mailerStatus.lastErrorAt,
    },
  });
});

app.use("/api/auth", sessionLimiter, authRoutes);
app.use("/api/projects", sessionLimiter, projectRoutes);
app.use("/api/tasks", sessionLimiter, taskRoutes);
app.use("/api/dashboard", sessionLimiter, dashboardRoutes);
app.use("/api/invitations", sessionLimiter, invitationRoutes);
app.use("/api/chat", chatLimiter, chatRoutes);

// Centralized error fallback — log the detail, return a generic message so
// internal errors aren't leaked to the client.
app.use((err, req, res, next) => {
  if (err?.message === "Not allowed by CORS") {
    return res.status(403).json({ message: "Origin not allowed" });
  }
  console.error(err);
  res.status(500).json({ message: "Something went wrong" });
});

const PORT = process.env.PORT || 5000;

connectDB()
  .then(() => {
    // Not awaited: a slow or broken SMTP host must not delay the server
    // accepting traffic. The result lands in the log and in /api/health.
    verifyMailer();
    app.listen(PORT, () => console.log(`TaskFlow API running on http://localhost:${PORT}`));
  })
  .catch((err) => {
    console.error("Failed to connect to database:", err.message);
    process.exit(1);
  });
