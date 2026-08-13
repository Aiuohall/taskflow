import { Router } from "express";
import mongoose from "mongoose";
import Project from "../models/Project.js";
import Task from "../models/Task.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

/*
 * GET /api/dashboard/stats — aggregate stats across all my projects.
 *
 * This used to load every task the user could see — fully populated with
 * assignee and project documents, comments and all — into Node memory, then do
 * every count, filter and sort in JavaScript. It was the slowest endpoint in
 * the app and got worse with each task added.
 *
 * Now a single aggregation pipeline computes the counts, the 7-day trend, the
 * upcoming list and the recent list inside MongoDB with $facet, and only the
 * handful of rows that are actually rendered come back over the wire.
 */
router.get("/stats", async (req, res, next) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.userId);

    const projects = await Project.find({ $or: [{ owner: userId }, { members: userId }] })
      .select("_id")
      .lean();
    const projectIds = projects.map((p) => p._id);

    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - 6);
    weekStart.setHours(0, 0, 0, 0);

    // Fields needed by the "upcoming" / "recent" cards. Notably excludes
    // `comments`, which can be large and is never shown on the dashboard.
    const cardFields = { title: 1, status: 1, priority: 1, dueDate: 1, project: 1, updatedAt: 1 };

    const [facets] = await Task.aggregate([
      { $match: { project: { $in: projectIds } } },
      {
        $facet: {
          byStatus: [{ $group: { _id: "$status", n: { $sum: 1 } } }],
          byPriority: [{ $group: { _id: "$priority", n: { $sum: 1 } } }],
          total: [{ $count: "n" }],
          overdue: [
            { $match: { dueDate: { $ne: null, $lt: now }, status: { $ne: "done" } } },
            { $count: "n" },
          ],
          trend: [
            { $match: { completedAt: { $gte: weekStart } } },
            {
              $group: {
                // Group in the server's timezone so "today" matches what the
                // user sees, rather than always bucketing by UTC.
                _id: {
                  $dateToString: { format: "%Y-%m-%d", date: "$completedAt", timezone: process.env.TZ || "UTC" },
                },
                n: { $sum: 1 },
              },
            },
          ],
          upcoming: [
            { $match: { dueDate: { $ne: null, $gte: now }, status: { $ne: "done" } } },
            { $sort: { dueDate: 1 } },
            { $limit: 5 },
            { $project: cardFields },
          ],
          recent: [{ $sort: { updatedAt: -1 } }, { $limit: 6 }, { $project: cardFields }],
        },
      },
    ]);

    const countMap = (rows, keys) => {
      const out = Object.fromEntries(keys.map((k) => [k, 0]));
      for (const r of rows) if (r._id in out) out[r._id] = r.n;
      return out;
    };

    const byStatus = countMap(facets.byStatus, ["todo", "in-progress", "review", "done"]);
    const byPriority = countMap(facets.byPriority, ["low", "medium", "high"]);

    // Fill the 7-day window so days with no completions still render a bar.
    const trendMap = Object.fromEntries(facets.trend.map((r) => [r._id, r.n]));
    const trend = [];
    for (let i = 6; i >= 0; i--) {
      const day = new Date(now);
      day.setDate(day.getDate() - i);
      day.setHours(0, 0, 0, 0);
      const key = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
      trend.push({ date: key, completed: trendMap[key] || 0 });
    }

    // The cards link to a project and show its name — attach just those two
    // fields for the ≤11 tasks involved, instead of populating every task.
    const shown = [...facets.upcoming, ...facets.recent];
    const neededIds = [...new Set(shown.map((t) => String(t.project)))];
    const projectDocs = await Project.find({ _id: { $in: neededIds } })
      .select("name color")
      .lean();
    const projectMap = Object.fromEntries(projectDocs.map((p) => [String(p._id), p]));
    const attach = (t) => ({ ...t, project: projectMap[String(t.project)] || { _id: t.project, name: "—" } });

    res.json({
      totals: {
        projects: projects.length,
        tasks: facets.total[0]?.n || 0,
        completed: byStatus.done,
        inProgress: byStatus["in-progress"],
        overdue: facets.overdue[0]?.n || 0,
      },
      byStatus,
      byPriority,
      trend,
      upcoming: facets.upcoming.map(attach),
      recent: facets.recent.map(attach),
    });
  } catch (err) {
    next(err);
  }
});

export default router;
