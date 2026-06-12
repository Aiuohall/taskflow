import mongoose from "mongoose";

const projectSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, default: "", trim: true },
    color: { type: String, default: "#6366f1" },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    members: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  },
  { timestamps: true }
);

// True when the given user owns the project or is a member.
// Works whether owner/members are raw ObjectIds or populated documents.
projectSchema.methods.hasAccess = function (userId) {
  const id = userId.toString();
  const idOf = (ref) => (ref._id ?? ref).toString();
  return idOf(this.owner) === id || this.members.some((m) => idOf(m) === id);
};

export default mongoose.model("Project", projectSchema);
