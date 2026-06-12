import mongoose from "mongoose";
import fs from "fs";
import path from "path";

// Connects to MongoDB. If MONGODB_URI is set (e.g. an Atlas cluster), use it.
// Otherwise spin up an embedded MongoDB via mongodb-memory-server so the app
// runs with zero local install. Data is stored in server/data so it survives
// restarts.
export async function connectDB() {
  let uri = process.env.MONGODB_URI;

  if (!uri) {
    const { MongoMemoryServer } = await import("mongodb-memory-server");
    const dbPath = path.resolve("data", "db");
    fs.mkdirSync(dbPath, { recursive: true });

    const mongod = await MongoMemoryServer.create({
      // launchTimeout is generous because the first start on Windows can be
      // slow (antivirus scan of the fresh binary + wiredTiger init).
      instance: { dbPath, storageEngine: "wiredTiger", port: 27017, launchTimeout: 180000 },
    });
    uri = mongod.getUri("taskflow");
    console.log(`Embedded MongoDB started at ${uri} (data persisted in ${dbPath})`);
  }

  await mongoose.connect(uri);
  console.log("MongoDB connected");
}
