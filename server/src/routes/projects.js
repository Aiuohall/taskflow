import { Router } from "express";
import Project from "../models/Project.js";
import Task from "../models/Task.js";
import User from "../models/User.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

const MEMBER_FIELDS = "name email";

async function loadProject(req, res) {
  const project = await Project.findById(req.params.id)
    .populate("owner", MEMBER_FIELDS)
    .populate("members", MEMBER_FIELDS);
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
  await project.deleteOne();
  res.json({ message: "Project deleted" });
});

// POST /api/projects/:id/members — add a member by email
router.post("/:id/members", async (req, res) => {
  const project = await loadProject(req, res);
  if (!project) return;

  const user = await User.findOne({ email: (req.body.email || "").toLowerCase() });
  if (!user) {
    return res.status(404).json({ message: "No user found with that email" });
  }
  if (project.hasAccess(user._id)) {
    return res.status(409).json({ message: "That user is already on this project" });
  }
  project.members.push(user._id);
  await project.save();
  await project.populate("members", MEMBER_FIELDS);
  res.json(project);
});

// DELETE /api/projects/:id/members/:userId
router.delete("/:id/members/:userId", async (req, res) => {
  const project = await loadProject(req, res);
  if (!project) return;
  project.members = project.members.filter(
    (m) => m._id.toString() !== req.params.userId
  );
  await project.save();
  res.json(project);
});

export default router;
