import mongoose from "mongoose";

// A chat message inside a project. Visible only to the project's owner/members.
const messageSchema = new mongoose.Schema(
  {
    project: { type: mongoose.Schema.Types.ObjectId, ref: "Project", required: true },
    sender: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    text: { type: String, default: "", trim: true, maxlength: 2000 },
    attachment: {
      fileId: { type: mongoose.Schema.Types.ObjectId },
      name: String,
      size: Number,
      mime: String,
    },
  },
  { timestamps: true }
);

messageSchema.index({ project: 1, createdAt: -1 });

export default mongoose.model("Message", messageSchema);
