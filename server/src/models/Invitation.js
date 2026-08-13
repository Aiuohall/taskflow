import mongoose from "mongoose";

/**
 * A pending request for someone to join a project.
 *
 * Membership used to be granted the moment an owner typed an email address,
 * which meant anyone could add you to anything without your knowledge. Now an
 * invite creates one of these instead, and the invited person decides.
 */
const invitationSchema = new mongoose.Schema(
  {
    project: { type: mongoose.Schema.Types.ObjectId, ref: "Project", required: true },
    invitedUser: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    status: {
      type: String,
      enum: ["pending", "accepted", "rejected"],
      default: "pending",
    },
    respondedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// The notification bell polls this constantly, so index the exact shape of
// that query: "pending invitations for me, newest first".
invitationSchema.index({ invitedUser: 1, status: 1, createdAt: -1 });

// One live invitation per person per project. The partial filter lets a
// rejected invite be re-sent later without tripping the unique constraint.
invitationSchema.index(
  { project: 1, invitedUser: 1 },
  { unique: true, partialFilterExpression: { status: "pending" } }
);

export default mongoose.model("Invitation", invitationSchema);
