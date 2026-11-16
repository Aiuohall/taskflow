import { Router } from "express";
import Project from "../models/Project.js";
import Task from "../models/Task.js";
import User from "../models/User.js";
import Invitation from "../models/Invitation.js";
import mongoose from "mongoose";
import Message from "../models/Message.js";
import { requireAuth } from "../middleware/auth.js";
import { asString } from "../middleware/sanitize.js";

const router = Router();
router.use(requireAuth);

const MEMBER_FIELDS = "name email";
// Single-project lookups also carry avatars; the project list stays light.
const DETAIL_FIELDS = "name email avatar";

const isValidId = (id) => mongoose.isValidObjectId(id);

async function loadProject(req, res) {
  // Reject a malformed id here rather than letting Mongoose throw a CastError
  // that surfaces as a 500 — a bad id is a client mistake, not a server fault.
  if (!isValidId(req.params.id)) {
    res.status(400).json({ message: "Invalid project id" });
    return null;
  }
  const project = await Project.findById(req.params.id)
    .populate("owner", DETAIL_FIELDS)
    .populate("members", DETAIL_FIELDS);
  if (!project) {
    res.status(404).json({ message: "Project not found" });
    return null;
  }
  if (!project.hasAccess(req.userId)) {
    res.status(403).json({ message: "You don't have access to this project" });
    return null;
  }
  return project;
}

// GET /api/projects — projects I own or belong to, with task progress
router.get("/", async (req, res) => {
  const projects = await Project.find({
    $or: [{ owner: req.userId }, { members: req.userId }],
  })
    .populate("owner", MEMBER_FIELDS)
    .populate("members", MEMBER_FIELDS)
    .sort("-updatedAt");

  const counts = await Task.aggregate([
    { $match: { project: { $in: projects.map((p) => p._id) } } },
    {
      $group: {
        _id: "$project",
        total: { $sum: 1 },
        done: { $sum: { $cond: [{ $eq: ["$status", "done"] }, 1, 0] } },
      },
    },
  ]);
  const countMap = Object.fromEntries(counts.map((c) => [c._id.toString(), c]));

  res.json(
    projects.map((p) => {
      const c = countMap[p._id.toString()] || { total: 0, done: 0 };
      return { ...p.toObject(), taskCount: c.total, doneCount: c.done };
    })
  );
});

// POST /api/projects
router.post("/", async (req, res) => {
  const { name, description, color } = req.body;
  if (!name) return res.status(400).json({ message: "Project name is required" });
  const project = await Project.create({
    name,
    description,
    color,
    owner: req.userId,
    members: [],
  });
  await project.populate("owner", MEMBER_FIELDS);
  res.status(201).json(project);
});

// GET /api/projects/:id
router.get("/:id", async (req, res) => {
  const project = await loadProject(req, res);
  if (project) res.json(project);
});

// PUT /api/projects/:id
router.put("/:id", async (req, res) => {
  const project = await loadProject(req, res);
  if (!project) return;
  if (project.owner._id.toString() !== req.userId) {
    return res.status(403).json({ message: "Only the owner can edit this project" });
  }
  const { name, description, color } = req.body;
  if (name !== undefined) project.name = name;
  if (description !== undefined) project.description = description;
  if (color !== undefined) project.color = color;
  await project.save();
  res.json(project);
});

// DELETE /api/projects/:id — owner only, cascades to tasks
router.delete("/:id", async (req, res) => {
  const project = await loadProject(req, res);
  if (!project) return;
  if (project.owner._id.toString() !== req.userId) {
    return res.status(403).json({ message: "Only the owner can delete a project" });
  }
  await Task.deleteMany({ project: project._id });
  await Invitation.deleteMany({ project: project._id });
  // Remove uploaded chat files (GridFS) along with the messages.
  const files = mongoose.connection.db.collection("chatfiles.files");
  const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: "chatfiles" });
  for await (const f of files.find({ "metadata.project": project._id })) {
    await bucket.delete(f._id).catch(() => {});
  }
  await Message.deleteMany({ project: project._id });
  await project.deleteOne();
  res.json({ message: "Project deleted" });
});

/*
 * POST /api/projects/:id/members — invite someone by email.
 *
 * This used to add the person to `members` immediately, meaning anyone could
 * put you on their project without your knowledge or consent. It now creates a
 * pending invitation; the invited person accepts or rejects it themselves, and
 * membership is only granted on acceptance.
 */
router.post("/:id/members", async (req, res, next) => {
  try {
    const project = await loadProject(req, res);
    if (!project) return;

    const email = asString(req.body.email).toLowerCase().trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ message: "Please enter a valid email address" });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({
        message: `No TaskFlow account is registered with ${email}. Ask them to sign up first, then invite them.`,
        notRegistered: true,
      });
    }
    if (project.hasAccess(user._id)) {
      return res.status(409).json({ message: "That user is already on this project" });
    }
    if (user._id.toString() === req.userId) {
      return res.status(400).json({ message: "You're already on this project" });
    }

    const existing = await Invitation.findOne({
      project: project._id,
      invitedUser: user._id,
      status: "pending",
    });
    if (existing) {
      return res.status(409).json({ message: "They already have a pending invitation" });
    }

    await Invitation.create({
      project: project._id,
      invitedUser: user._id,
      invitedBy: req.userId,
    });

    res.status(201).json({
      message: `Invitation sent to ${user.name}. They'll join once they accept.`,
      invited: { name: user.name, email: user.email },
    });
  } catch (err) {
    next(err);
  }
});

/*
 * DELETE /api/projects/:id/members/:userId — remove a member.
 *
 * Previously any member could remove any other member. Now only the owner can
 * remove someone else; a member may still remove themselves, which is how you
 * leave a project you were invited to.
 */
router.delete("/:id/members/:userId", async (req, res, next) => {
  try {
    const project = await loadProject(req, res);
    if (!project) return;

    const isOwner = project.owner._id.toString() === req.userId;
    const isSelf = req.params.userId === req.userId;
    if (!isOwner && !isSelf) {
      return res.status(403).json({ message: "Only the project owner can remove other members" });
    }

    project.members = project.members.filter((m) => m._id.toString() !== req.params.userId);
    await project.save();
    await Invitation.deleteMany({
      project: project._id,
      invitedUser: req.params.userId,
      status: "pending",
    });

    res.json(project);
  } catch (err) {
    next(err);
  }
});

export default router;
