import { Router } from "express";
import Invitation from "../models/Invitation.js";
import Project from "../models/Project.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

// GET /api/invitations — my pending invitations, for the notification bell.
router.get("/", async (req, res, next) => {
  try {
    const invitations = await Invitation.find({ invitedUser: req.userId, status: "pending" })
      .populate("project", "name color description")
      .populate("invitedBy", "name email")
      .sort("-createdAt")
      .lean();

    // An invitation to a project that has since been deleted is noise — hide
    // it rather than rendering a card that links nowhere.
    res.json(invitations.filter((i) => i.project));
  } catch (err) {
    next(err);
  }
});

/**
 * Load an invitation, enforcing that it belongs to the caller.
 * Only the invited person may act on it — not the sender, not the owner.
 */
async function loadOwnInvitation(req, res) {
  const invitation = await Invitation.findById(req.params.id);
  if (!invitation || invitation.invitedUser.toString() !== req.userId) {
    // Same response whether it doesn't exist or isn't theirs, so the endpoint
    // can't be used to probe for other people's invitations.
    res.status(404).json({ message: "Invitation not found" });
    return null;
  }
  if (invitation.status !== "pending") {
    res.status(409).json({ message: "You've already responded to this invitation" });
    return null;
  }
  return invitation;
}

// POST /api/invitations/:id/accept — join the project.
router.post("/:id/accept", async (req, res, next) => {
  try {
    const invitation = await loadOwnInvitation(req, res);
    if (!invitation) return;

    const project = await Project.findById(invitation.project);
    if (!project) {
      await invitation.deleteOne();
      return res.status(404).json({ message: "That project no longer exists" });
    }

    // $addToSet rather than push: accepting twice (double-click, retry) must
    // not add a duplicate member.
    if (!project.hasAccess(req.userId)) {
      await Project.updateOne({ _id: project._id }, { $addToSet: { members: req.userId } });
    }

    invitation.status = "accepted";
    invitation.respondedAt = new Date();
    await invitation.save();

    res.json({ message: `You've joined ${project.name}`, projectId: project._id });
  } catch (err) {
    next(err);
  }
});

// POST /api/invitations/:id/reject — decline. Membership is never granted.
router.post("/:id/reject", async (req, res, next) => {
  try {
    const invitation = await loadOwnInvitation(req, res);
    if (!invitation) return;

    invitation.status = "rejected";
    invitation.respondedAt = new Date();
    await invitation.save();

    res.json({ message: "Invitation declined" });
  } catch (err) {
    next(err);
  }
});

export default router;
