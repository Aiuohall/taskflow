import { Router } from "express";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import Message from "../models/Message.js";
import ChatRead from "../models/ChatRead.js";
import Project from "../models/Project.js";
import { requireAuth } from "../middleware/auth.js";
import { asString } from "../middleware/sanitize.js";

// Per-file upload cap. Never below 1 GB: MAX_UPLOAD_MB can raise it, not lower it.
const MAX_BYTES = Math.max(1024, Number(process.env.MAX_UPLOAD_MB) || 1024) * 1024 * 1024;
const limitLabel = () => `${Math.round((MAX_BYTES / 1073741824) * 100) / 100} GB`;
const bucket = () =>
  new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: "chatfiles" });

// Download links are signed with a key derived from JWT_SECRET so a link can
// never be replayed as a login token.
const linkKey = () => `${process.env.JWT_SECRET}:chatfile`;

// Streams one GridFS file, scoped to its project, always as a download so an
// uploaded .html/.svg can never execute in our origin.
async function sendFile(res, next, projectId, fileId) {
  const [file] = await bucket().find({ _id: fileId, "metadata.project": projectId }).toArray();
  if (!file) return res.status(404).json({ message: "File not found" });
  res.set({
    "Content-Type": "application/octet-stream",
    "Content-Length": file.length,
    "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
    "X-Content-Type-Options": "nosniff",
  });
  bucket().openDownloadStream(fileId).on("error", next).pipe(res);
}

const router = Router();

// GET /api/chat/download/:token — registered BEFORE requireAuth on purpose: a
// plain browser download can't send a Bearer header. The token is short-lived,
// and membership is re-checked here.
router.get("/download/:token", async (req, res, next) => {
  try {
    let claims;
    try {
      claims = jwt.verify(req.params.token, linkKey());
    } catch {
      return res.status(401).json({ message: "This download link has expired" });
    }
    const project = isValidId(claims.pid) ? await Project.findById(claims.pid) : null;
    if (!project || !project.hasAccess(claims.uid) || !isValidId(claims.fid)) {
      return res.status(403).json({ message: "Only project members can download files" });
    }
    await sendFile(res, next, project._id, new mongoose.Types.ObjectId(claims.fid));
  } catch (err) {
    next(err);
  }
});

router.use(requireAuth);

const isValidId = (id) => mongoose.isValidObjectId(id);

// Group-only: the caller must own or belong to the project.
async function memberProject(req, res) {
  if (!isValidId(req.params.id)) {
    res.status(400).json({ message: "Invalid project id" });
    return null;
  }
  const project = await Project.findById(req.params.id);
  if (!project) {
    res.status(404).json({ message: "Project not found" });
    return null;
  }
  if (!project.hasAccess(req.userId)) {
    res.status(403).json({ message: "Only project members can use the chat" });
    return null;
  }
  return project;
}

// GET /api/chat/unread — unread message counts per project, for notifications.
router.get("/unread", async (req, res, next) => {
  try {
    const projects = await Project.find({
      $or: [{ owner: req.userId }, { members: req.userId }],
    })
      .select("name color")
      .lean();
    const reads = await ChatRead.find({ user: req.userId }).lean();
    const readMap = Object.fromEntries(reads.map((r) => [r.project.toString(), r.lastReadAt]));

    const out = [];
    for (const p of projects) {
      // Never-opened chats count from the epoch, but cap so history isn't a flood.
      const since = readMap[p._id.toString()] || new Date(0);
      const count = await Message.countDocuments({
        project: p._id,
        createdAt: { $gt: since },
        sender: { $ne: req.userId },
      });
      if (count > 0) out.push({ project: p, count });
    }
    res.json(out);
  } catch (err) {
    next(err);
  }
});

// GET /api/chat/:id/messages?after=<ISO date> — latest 100, or only newer ones.
router.get("/:id/messages", async (req, res, next) => {
  try {
    const project = await memberProject(req, res);
    if (!project) return;

    const filter = { project: project._id };
    const after = asString(req.query.after);
    if (after && !Number.isNaN(Date.parse(after))) filter.createdAt = { $gt: new Date(after) };

    const messages = await Message.find(filter)
      .sort("-createdAt")
      .limit(100)
      .populate("sender", "name")
      .lean();
    res.json(messages.reverse());
  } catch (err) {
    next(err);
  }
});

// POST /api/chat/:id/messages
router.post("/:id/messages", async (req, res, next) => {
  try {
    const project = await memberProject(req, res);
    if (!project) return;

    const text = asString(req.body.text).trim().slice(0, 2000);
    if (!text) return res.status(400).json({ message: "Message can't be empty" });

    const msg = await Message.create({ project: project._id, sender: req.userId, text });
    await msg.populate("sender", "name");
    res.status(201).json(msg);
  } catch (err) {
    next(err);
  }
});

/*
 * POST /api/chat/:id/upload — any file type, streamed straight into GridFS
 * (MongoDB), so nothing is buffered in memory and nothing touches the host's
 * ephemeral disk. The raw bytes are the request body; metadata is in headers.
 */
router.post("/:id/upload", async (req, res, next) => {
  try {
    const project = await memberProject(req, res);
    if (!project) return;

    const declared = Number(req.headers["content-length"] || 0);
    if (declared > MAX_BYTES) {
      return res.status(413).json({ message: `File is too large (limit ${limitLabel()})` });
    }
    let name = "file";
    try {
      name = decodeURIComponent(String(req.headers["x-filename"] || "file"));
    } catch {}
    name = name.replace(/[\/\n]/g, "_").slice(0, 200) || "file";
    const mime = String(req.headers["x-filetype"] || "application/octet-stream").slice(0, 100);

    const up = bucket().openUploadStream(name, {
      metadata: { project: project._id, uploader: req.userId, mime },
    });
    let bytes = 0;
    let aborted = false;

    req.on("data", (chunk) => {
      bytes += chunk.length;
      if (bytes > MAX_BYTES && !aborted) {
        aborted = true;
        req.unpipe(up);
        up.abort().catch(() => {});
        res.status(413).json({ message: `File is too large (limit ${limitLabel()})` });
      }
    });
    req.on("aborted", () => {
      if (!aborted) {
        aborted = true;
        up.abort().catch(() => {});
      }
    });
    up.on("error", (err) => {
      if (!aborted && !res.headersSent) next(err);
    });
    up.on("finish", async () => {
      if (aborted) return;
      try {
        if (bytes === 0) {
          await bucket().delete(up.id).catch(() => {});
          return res.status(400).json({ message: "That file is empty" });
        }
        let caption = "";
        try {
          caption = decodeURIComponent(String(req.headers["x-caption"] || ""));
        } catch {}
        const text = caption.trim().slice(0, 2000);
        const msg = await Message.create({
          project: project._id,
          sender: req.userId,
          text,
          attachment: { fileId: up.id, name, size: bytes, mime },
        });
        await msg.populate("sender", "name");
        res.status(201).json(msg);
      } catch (err) {
        next(err);
      }
    });
    req.pipe(up);
  } catch (err) {
    next(err);
  }
});

// GET /api/chat/:id/files/:fileId — members only; always served as a download
// so an uploaded .html/.svg can never execute in our origin.
router.get("/:id/files/:fileId", async (req, res, next) => {
  try {
    const project = await memberProject(req, res);
    if (!project) return;
    if (!isValidId(req.params.fileId)) return res.status(400).json({ message: "Invalid file id" });

    await sendFile(res, next, project._id, new mongoose.Types.ObjectId(req.params.fileId));
  } catch (err) {
    next(err);
  }
});

// POST /api/chat/:id/files/:fileId/link — a 5-minute signed URL for the browser
// to download from directly (streams to disk; nothing is held in memory).
router.post("/:id/files/:fileId/link", async (req, res, next) => {
  try {
    const project = await memberProject(req, res);
    if (!project) return;
    if (!isValidId(req.params.fileId)) return res.status(400).json({ message: "Invalid file id" });
    const fid = req.params.fileId;
    const exists = await bucket().find({ _id: new mongoose.Types.ObjectId(fid), "metadata.project": project._id }).hasNext();
    if (!exists) return res.status(404).json({ message: "File not found" });
    const token = jwt.sign({ pid: String(project._id), uid: String(req.userId), fid }, linkKey(), { expiresIn: "5m" });
    res.json({ path: `/chat/download/${token}` });
  } catch (err) {
    next(err);
  }
});

// POST /api/chat/:id/read — mark the chat as read up to now.
router.post("/:id/read", async (req, res, next) => {
  try {
    const project = await memberProject(req, res);
    if (!project) return;
    await ChatRead.updateOne(
      { user: req.userId, project: project._id },
      { $set: { lastReadAt: new Date() } },
      { upsert: true }
    );
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
