import { Router } from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import User from "../models/User.js";
import Project from "../models/Project.js";
import Task from "../models/Task.js";
import VerificationCode from "../models/VerificationCode.js";
import { requireAuth } from "../middleware/auth.js";
import { sendMail, codeEmail } from "../config/mailer.js";

const router = Router();

const CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_ATTEMPTS = 5;

function signToken(userId) {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: "7d" });
}

function publicUser(user) {
  return { id: user._id, name: user.name, email: user.email };
}

function genCode() {
  return String(Math.floor(100000 + Math.random() * 900000)); // 6 digits
}

const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v || "");

// ───────────────────────── Registration (OTP) ─────────────────────────

// POST /api/auth/register — step 1: validate + email a verification code.
router.post("/register", async (req, res) => {
  try {
    const name = (req.body.name || "").trim();
    const email = (req.body.email || "").toLowerCase().trim();
    const { password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: "Name, email and password are required" });
    }
    if (!isEmail(email)) {
      return res.status(400).json({ message: "Please enter a valid email address" });
    }
    if (password.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters" });
    }
    if (await User.findOne({ email })) {
      return res.status(409).json({ message: "An account with this email already exists" });
    }

    const code = genCode();
    const [codeHash, passwordHash] = await Promise.all([
      bcrypt.hash(code, 10),
      bcrypt.hash(password, 10),
    ]);

    // One pending registration per email — replace any previous attempt.
    await VerificationCode.findOneAndUpdate(
      { email, purpose: "register" },
      { email, purpose: "register", name, passwordHash, codeHash, attempts: 0, expiresAt: new Date(Date.now() + CODE_TTL_MS) },
      { upsert: true, new: true }
    );

    const { text, html } = codeEmail({
      title: "Verify your email",
      intro: `Welcome to TaskFlow, ${name}! Use the code below to finish creating your account.`,
      code,
    });
    await sendMail({ to: email, subject: "Your TaskFlow verification code", text, html });

    res.status(200).json({ pending: true, message: "Verification code sent to your email" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/auth/register/verify — step 2: check the code, create the account.
router.post("/register/verify", async (req, res) => {
  try {
    const email = (req.body.email || "").toLowerCase().trim();
    const code = (req.body.code || "").trim();
    if (!email || !code) {
      return res.status(400).json({ message: "Email and code are required" });
    }

    const pending = await VerificationCode.findOne({ email, purpose: "register" });
    if (!pending) {
      return res.status(400).json({ message: "No pending registration found. Please sign up again." });
    }
    if (pending.attempts >= MAX_ATTEMPTS) {
      await pending.deleteOne();
      return res.status(429).json({ message: "Too many incorrect attempts. Please sign up again." });
    }
    if (!(await pending.compareCode(code))) {
      pending.attempts += 1;
      await pending.save();
      return res.status(400).json({ message: "Incorrect code. Please try again." });
    }

    // Guard against a race where the email got registered meanwhile.
    if (await User.findOne({ email })) {
      await pending.deleteOne();
      return res.status(409).json({ message: "An account with this email already exists" });
    }

    const user = new User({ name: pending.name, email, password: pending.passwordHash });
    user.$locals.passwordAlreadyHashed = true; // passwordHash is already bcrypt
    await user.save();
    await pending.deleteOne();

    res.status(201).json({ token: signToken(user._id), user: publicUser(user) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/auth/register/resend — re-send the registration code.
router.post("/register/resend", async (req, res) => {
  try {
    const email = (req.body.email || "").toLowerCase().trim();
    const pending = await VerificationCode.findOne({ email, purpose: "register" });
    if (!pending) {
      return res.status(400).json({ message: "No pending registration found. Please sign up again." });
    }
    const code = genCode();
    pending.codeHash = await bcrypt.hash(code, 10);
    pending.attempts = 0;
    pending.expiresAt = new Date(Date.now() + CODE_TTL_MS);
    await pending.save();

    const { text, html } = codeEmail({
      title: "Verify your email",
      intro: `Here's your new TaskFlow verification code.`,
      code,
    });
    await sendMail({ to: email, subject: "Your TaskFlow verification code", text, html });
    res.json({ message: "A new code has been sent" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ───────────────────────────── Login ──────────────────────────────────

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email: (email || "").toLowerCase().trim() }).select("+password");
    if (!user || !(await user.comparePassword(password || ""))) {
      return res.status(401).json({ message: "Invalid email or password" });
    }
    res.json({ token: signToken(user._id), user: publicUser(user) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─────────────────────── Forgot / reset password ──────────────────────

// POST /api/auth/forgot-password — email a reset code. Always responds 200 so
// the endpoint can't be used to discover which emails are registered.
router.post("/forgot-password", async (req, res) => {
  try {
    const email = (req.body.email || "").toLowerCase().trim();
    const user = await User.findOne({ email });
    if (user) {
      const code = genCode();
      await VerificationCode.findOneAndUpdate(
        { email, purpose: "reset" },
        { email, purpose: "reset", codeHash: await bcrypt.hash(code, 10), attempts: 0, expiresAt: new Date(Date.now() + CODE_TTL_MS) },
        { upsert: true }
      );
      const { text, html } = codeEmail({
        title: "Reset your password",
        intro: "Use the code below to set a new password for your TaskFlow account.",
        code,
      });
      await sendMail({ to: email, subject: "Reset your TaskFlow password", text, html });
    }
    res.json({ message: "If an account exists for that email, a reset code has been sent." });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/auth/reset-password — verify the code and set a new password.
router.post("/reset-password", async (req, res) => {
  try {
    const email = (req.body.email || "").toLowerCase().trim();
    const code = (req.body.code || "").trim();
    const { password } = req.body;

    if (!email || !code || !password) {
      return res.status(400).json({ message: "Email, code and new password are required" });
    }
    if (password.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters" });
    }

    const pending = await VerificationCode.findOne({ email, purpose: "reset" });
    if (!pending) {
      return res.status(400).json({ message: "No reset request found or it has expired. Please start again." });
    }
    if (pending.attempts >= MAX_ATTEMPTS) {
      await pending.deleteOne();
      return res.status(429).json({ message: "Too many incorrect attempts. Please start again." });
    }
    if (!(await pending.compareCode(code))) {
      pending.attempts += 1;
      await pending.save();
      return res.status(400).json({ message: "Incorrect code. Please try again." });
    }

    const user = await User.findOne({ email }).select("+password");
    if (!user) {
      await pending.deleteOne();
      return res.status(404).json({ message: "Account not found" });
    }
    user.password = password; // re-hashed by the pre-save hook
    await user.save();
    await pending.deleteOne();

    res.json({ token: signToken(user._id), user: publicUser(user) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─────────────────────────── Demo login ───────────────────────────────

// POST /api/auth/demo — create a throwaway guest account seeded with a sample
// project so recruiters can explore instantly. Each click = a fresh, isolated
// account, so visitors never collide with each other.
router.post("/demo", async (req, res) => {
  try {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const user = await User.create({
      name: "Guest User",
      email: `guest-${id}@demo.taskflow`,
      password: Math.random().toString(36).slice(2) + "A1",
    });

    const project = await Project.create({
      name: "Welcome to TaskFlow 👋",
      description: "A sample project — drag cards between columns, open one to edit it, or create your own project.",
      color: "#6366f1",
      owner: user._id,
      members: [],
    });

    const now = Date.now();
    const day = 86400000;
    await Task.insertMany([
      { project: project._id, title: "Drag me to another column →", status: "todo", priority: "high", createdBy: user._id, labels: ["demo"], dueDate: new Date(now + 2 * day) },
      { project: project._id, title: "Click a card to edit details & add comments", status: "todo", priority: "medium", createdBy: user._id },
      { project: project._id, title: "Set priorities, due dates and assignees", status: "in-progress", priority: "medium", createdBy: user._id, dueDate: new Date(now + 5 * day) },
      { project: project._id, title: "Invite teammates by email", status: "review", priority: "low", createdBy: user._id },
      { project: project._id, title: "Create your own project", status: "done", priority: "low", createdBy: user._id, completedAt: new Date() },
    ]);

    res.status(201).json({ token: signToken(user._id), user: publicUser(user) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ───────────────────────────── Current user ───────────────────────────

router.get("/me", requireAuth, async (req, res) => {
  const user = await User.findById(req.userId);
  if (!user) return res.status(404).json({ message: "User not found" });
  res.json({ user: publicUser(user) });
});

export default router;
