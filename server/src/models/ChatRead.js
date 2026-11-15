import mongoose from "mongoose";

// When a user last opened a project's chat — drives unread counts.
const chatReadSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  project: { type: mongoose.Schema.Types.ObjectId, ref: "Project", required: true },
  lastReadAt: { type: Date, default: () => new Date() },
});

chatReadSchema.index({ user: 1, project: 1 }, { unique: true });

export default mongoose.model("ChatRead", chatReadSchema);
