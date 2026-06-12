import { Router } from "express";
import Project from "../models/Project.js";
import Task from "../models/Task.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

// GET /api/dashboard/stats — aggregate stats across all my projects
router.get("/stats", async (req, res) => {
  const projects = await Project.find({
    $or: [{ owner: req.userId }, { members: req.userId }],
  }).select("_id name color");
  const projectIds = projects.map((p) => p._id);

  const now = new Date();
  const tasks = await Task.find({ project: { $in: projectIds } })
    .populate("assignee", "name email")
    .populate("project", "name color");

  const byStatus = { todo: 0, "in-progress": 0, review: 0, done: 0 };
  const byPriority = { low: 0, medium: 0, high: 0 };
  let overdue = 0;

  for (const t of tasks) {
    byStatus[t.status]++;
    byPriority[t.priority]++;
    if (t.dueDate && t.dueDate < now && t.status !== "done") overdue++;
  }

  // Tasks completed per day, last 7 days
  const trend = [];
  for (let i = 6; i >= 0; i--) {
    const day = new Date(now);
    day.setDate(day.getDate() - i);
    day.setHours(0, 0, 0, 0);
    const next = new Date(day);
    next.setDate(next.getDate() + 1);
    trend.push({
      date: day.toISOString().slice(0, 10),
      completed: tasks.filter(
        (t) => t.completedAt && t.completedAt >= day && t.completedAt < next
      ).length,
    });
  }

  const upcoming = tasks
    .filter((t) => t.dueDate && t.status !== "done" && t.dueDate >= now)
    .sort((a, b) => a.dueDate - b.dueDate)
    .slice(0, 5);

  const recent = [...tasks]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 6);

  res.json({
    totals: {
      projects: projects.length,
      tasks: tasks.length,
      completed: byStatus.done,
      inProgress: byStatus["in-progress"],
      overdue,
    },
    byStatus,
    byPriority,
    trend,
    upcoming,
    recent,
  });
});

export default router;
