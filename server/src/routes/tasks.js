import { Router } from "express";
import Task, { TASK_STATUSES } from "../models/Task.js";
import Project from "../models/Project.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

const POPULATE = [
  { path: "assignee", select: "name email" },
  { path: "createdBy", select: "name email" },
  { path: "comments.user", select: "name email" },
];

async function assertProjectAccess(projectId, userId, res) {
  const project = await Project.findById(projectId);
  if (!project) {
    res.status(404).json({ message: "Project not found" });
    return null;
  }
  if (!project.hasAccess(userId)) {
    res.status(403).json({ message: "You don't have access to this project" });
    return null;
  }
  return project;
}

async function loadTask(req, res) {
  const task = await Task.findById(req.params.id).populate(POPULATE);
  if (!task) {
    res.status(404).json({ message: "Task not found" });
    return null;
  }
  const project = await assertProjectAccess(task.project, req.userId, res);
  return project ? task : null;
}

function applyStatus(task, status) {
  task.status = status;
  task.completedAt = status === "done" ? task.completedAt || new Date() : null;
}

// GET /api/tasks?project=<id>
router.get("/", async (req, res) => {
  const { project: projectId } = req.query;
  if (!projectId) return res.status(400).json({ message: "project query param is required" });
  if (!(await assertProjectAccess(projectId, req.userId, res))) return;

  const tasks = await Task.find({ project: projectId })
    .populate(POPULATE)
    .sort("createdAt");
  res.json(tasks);
});

// POST /api/tasks
router.post("/", async (req, res) => {
  const { project: projectId, title, description, status, priority, dueDate, assignee, labels } = req.body;
  if (!projectId || !title) {
    return res.status(400).json({ message: "project and title are required" });
  }
  if (!(await assertProjectAccess(projectId, req.userId, res))) return;

  const task = new Task({
    project: projectId,
    title,
    description,
    priority,
    dueDate: dueDate || null,
    assignee: assignee || null,
    labels: labels || [],
    createdBy: req.userId,
  });
  applyStatus(task, TASK_STATUSES.includes(status) ? status : "todo");
  await task.save();
  await task.populate(POPULATE);
  res.status(201).json(task);
});

// PUT /api/tasks/:id
router.put("/:id", async (req, res) => {
  const task = await loadTask(req, res);
  if (!task) return;

  const { title, description, status, priority, dueDate, assignee, labels } = req.body;
  if (title !== undefined) task.title = title;
  if (description !== undefined) task.description = description;
  if (priority !== undefined) task.priority = priority;
  if (dueDate !== undefined) task.dueDate = dueDate || null;
  if (assignee !== undefined) task.assignee = assignee || null;
  if (labels !== undefined) task.labels = labels;
  if (status !== undefined && TASK_STATUSES.includes(status)) applyStatus(task, status);

  await task.save();
  await task.populate(POPULATE);
  res.json(task);
});

// PATCH /api/tasks/:id/move — kanban drag & drop
router.patch("/:id/move", async (req, res) => {
  const task = await loadTask(req, res);
  if (!task) return;

  const { status } = req.body;
  if (!TASK_STATUSES.includes(status)) {
    return res.status(400).json({ message: "Invalid status" });
  }
  applyStatus(task, status);
  await task.save();
  await task.populate(POPULATE);
  res.json(task);
});

// DELETE /api/tasks/:id
router.delete("/:id", async (req, res) => {
  const task = await loadTask(req, res);
  if (!task) return;
  await task.deleteOne();
  res.json({ message: "Task deleted" });
});

// POST /api/tasks/:id/comments
router.post("/:id/comments", async (req, res) => {
  const task = await loadTask(req, res);
  if (!task) return;

  const text = (req.body.text || "").trim();
  if (!text) return res.status(400).json({ message: "Comment text is required" });

  task.comments.push({ user: req.userId, text });
  await task.save();
  await task.populate(POPULATE);
  res.status(201).json(task);
});

export default router;
