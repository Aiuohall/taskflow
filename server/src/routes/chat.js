import { Router } from "express";
import mongoose from "mongoose";
import Message from "../models/Message.js";
import ChatRead from "../models/ChatRead.js";
import Project from "../models/Project.js";
import { requireAuth } from "../middleware/auth.js";
import { asString } from "../middleware/sanitize.js";

const router = Router();
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
