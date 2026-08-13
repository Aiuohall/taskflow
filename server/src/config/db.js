import mongoose from "mongoose";
import fs from "fs";
import path from "path";

const isProduction = process.env.NODE_ENV === "production";

/** Live DB state, surfaced by GET /api/health. */
export const dbStatus = { mode: null, connected: false, lastError: null };

/**
 * Connects to MongoDB.
 *
 * With MONGODB_URI set (an Atlas cluster) we use it. Without it, we fall back
 * to an embedded mongodb-memory-server so local dev needs zero install.
 *
 * That fallback is REFUSED in production, on purpose. A hosted free tier gives
 * you an ephemeral filesystem and restarts the container regularly, so the
 * embedded database quietly loses every user, project and pending OTP on each
 * restart — the app works for a few days and then "forgets" everyone. Failing
 * loudly at boot is far better than discovering that from your users.
 */
export async function connectDB() {
  let uri = process.env.MONGODB_URI;

  if (!uri) {
    if (isProduction) {
      throw new Error(
        "MONGODB_URI is not set. Production must use a real database (e.g. MongoDB Atlas) — " +
          "the embedded dev database lives on an ephemeral disk and loses all data on every restart."
      );
    }

    const { MongoMemoryServer } = await import("mongodb-memory-server");
    const dbPath = path.resolve("data", "db");
    fs.mkdirSync(dbPath, { recursive: true });

    const mongod = await MongoMemoryServer.create({
      // launchTimeout is generous because the first start on Windows can be
      // slow (antivirus scan of the fresh binary + wiredTiger init).
      instance: { dbPath, storageEngine: "wiredTiger", port: 27017, launchTimeout: 180000 },
    });
    uri = mongod.getUri("taskflow");
    dbStatus.mode = "embedded";
    console.log(`Embedded MongoDB started at ${uri} (data persisted in ${dbPath})`);
  } else {
    dbStatus.mode = "atlas";
  }

  // Keep a warm pool so a cold request doesn't pay for a fresh handshake, and
  // fail fast rather than letting a request hang on an unreachable cluster.
  await mongoose.connect(uri, {
    maxPoolSize: 10,
    minPoolSize: 2,
    serverSelectionTimeoutMS: 10000,
    socketTimeoutMS: 45000,
  });

  mongoose.connection.on("connected", () => {
    dbStatus.connected = true;
    dbStatus.lastError = null;
  });
  mongoose.connection.on("disconnected", () => {
    dbStatus.connected = false;
  });
  mongoose.connection.on("error", (err) => {
    dbStatus.lastError = err.message;
    console.error("[db] connection error:", err.message);
  });

  dbStatus.connected = true;
  console.log(`MongoDB connected (${dbStatus.mode})`);

  // Build the indexes declared on the schemas. Without this the first query on
  // a fresh cluster runs a full collection scan.
  await Promise.all(Object.values(mongoose.models).map((m) => m.syncIndexes().catch(() => {})));
}
