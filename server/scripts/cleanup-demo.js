/**
 * Deletes leftover guest accounts from the removed demo-login feature, along
 * with the projects and tasks they created.
 *
 *   cd server
 *   node scripts/cleanup-demo.js            # dry run — shows what WOULD go
 *   node scripts/cleanup-demo.js --confirm  # actually deletes
 *
 * Needs MONGODB_URI in server/.env (the same Atlas string Render uses).
 *
 * Deleting the users alone would orphan their projects and tasks, which are
 * the bulk of the storage — so this walks the chain: guest users → their
 * projects → those projects' tasks, and removes them in reverse order so a
 * failure part-way through never leaves a project pointing at nothing.
 */
import "dotenv/config";
import mongoose from "mongoose";
import User from "../src/models/User.js";
import Project from "../src/models/Project.js";
import Task from "../src/models/Task.js";
import Invitation from "../src/models/Invitation.js";

const CONFIRMED = process.argv.includes("--confirm");

// Demo accounts were always created as guest-<id>@demo.taskflow — a domain no
// real user can register, so this can't match a genuine account.
const DEMO_EMAIL = /@demo\.taskflow$/;

if (!process.env.MONGODB_URI) {
  console.error(
    "\n✗ MONGODB_URI is not set in server/.env\n" +
      "  Copy it from Render → Environment → MONGODB_URI (click the eye icon to reveal).\n"
  );
  process.exit(1);
}

await mongoose.connect(process.env.MONGODB_URI);
console.log("Connected to MongoDB\n");

const users = await User.find({ email: { $regex: DEMO_EMAIL } }).select("_id email").lean();
const userIds = users.map((u) => u._id);

if (users.length === 0) {
  console.log("No demo accounts found — nothing to clean up.");
  await mongoose.disconnect();
  process.exit(0);
}

const projects = await Project.find({ owner: { $in: userIds } }).select("_id").lean();
const projectIds = projects.map((p) => p._id);
const taskCount = await Task.countDocuments({ project: { $in: projectIds } });

console.log("Found:");
console.log(`  ${users.length} guest accounts`);
console.log(`  ${projects.length} projects owned by them`);
console.log(`  ${taskCount} tasks in those projects`);

if (!CONFIRMED) {
  console.log("\nDRY RUN — nothing was deleted.");
  console.log("Re-run with --confirm to delete:\n");
  console.log("  node scripts/cleanup-demo.js --confirm\n");
  await mongoose.disconnect();
  process.exit(0);
}

console.log("\nDeleting…");
// Children first: if this stops half-way, what remains is still consistent.
const t = await Task.deleteMany({ project: { $in: projectIds } });
console.log(`  tasks       : ${t.deletedCount}`);
const i = await Invitation.deleteMany({
  $or: [{ project: { $in: projectIds } }, { invitedUser: { $in: userIds } }],
});
console.log(`  invitations : ${i.deletedCount}`);
const p = await Project.deleteMany({ _id: { $in: projectIds } });
console.log(`  projects    : ${p.deletedCount}`);
const u = await User.deleteMany({ _id: { $in: userIds } });
console.log(`  users       : ${u.deletedCount}`);

console.log("\n✓ Done. Storage is reclaimed by Atlas within a few minutes.");
await mongoose.disconnect();
process.exit(0);
