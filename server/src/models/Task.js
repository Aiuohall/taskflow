import mongoose from "mongoose";

export const TASK_STATUSES = ["todo", "in-progress", "review", "done"];
export const TASK_PRIORITIES = ["low", "medium", "high"];

const commentSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    text: { type: String, required: true, trim: true },
  },
  { timestamps: true }
);

const taskSchema = new mongoose.Schema(
  {
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      required: true,
      index: true,
    },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "", trim: true },
    status: { type: String, enum: TASK_STATUSES, default: "todo" },
    priority: { type: String, enum: TASK_PRIORITIES, default: "medium" },
    dueDate: { type: Date, default: null },
    assignee: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    labels: [{ type: String, trim: true }],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    completedAt: { type: Date, default: null },
    comments: [commentSchema],
  },
  { timestamps: true }
);

// Board queries filter by project and group by status; the dashboard sorts by
// recency and scans due/completion dates across every project the user can see.
taskSchema.index({ project: 1, status: 1 });
taskSchema.index({ project: 1, updatedAt: -1 });
taskSchema.index({ project: 1, dueDate: 1 });
taskSchema.index({ project: 1, completedAt: -1 });

export default mongoose.model("Task", taskSchema);
