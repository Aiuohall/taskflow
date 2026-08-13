import { Router } from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import User from "../models/User.js";
import VerificationCode, { hashCode } from "../models/VerificationCode.js";
import { requireAuth } from "../middleware/auth.js";
import { loginLimiter, otpLimiter } from "../middleware/rateLimiters.js";
import { sendMail, codeEmail } from "../config/mailer.js";

const router = Router();

const CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_ATTEMPTS = 5; // wrong guesses before the code is burned
const RESEND_COOLDOWN_MS = 60 * 1000; // min gap between codes for one address
const MAX_SENDS = 6; // codes per address per active window

function signToken(userId) {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: "7d" });
}

function publicUser(user) {
  return { id: user._id, name: user.name, email: user.email };
}

// crypto.randomInt is uniform and unpredictable; Math.random is neither, and
// a guessable OTP undermines the whole flow.
function genCode() {
  return String(crypto.randomInt(100000, 1000000)); // 6 digits
}

const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v || "");

/**
 * Per-address send throttle. Deliberately separate from the per-IP limiter so
 * that users sharing an IP (mobile networks, offices) never block each other,
 * while a single address still can't be used to spam someone's inbox.
 * Returns an error payload to send, or null when the send may proceed.
 */
function checkSendThrottle(existing) {
  if (!existing) return null;
  const since = Date.now() - new Date(existing.lastSentAt || 0).getTime();
  if (since < RESEND_COOLDOWN_MS) {
    const wait = Math.ceil((RESEND_COOLDOWN_MS - since) / 1000);
    return { status: 429, body: { message: `Please wait ${wait}s before requesting another code.`, retryAfter: wait } };
  }
  if ((existing.sentCount || 0) >= MAX_SENDS) {
    return {
      status: 429,
      body: { message: "Too many codes requested for this email. Please wait a few minutes and start again." },
    };
  }
  return null;
}

/**
 * Deliver a code, cleaning up the pending record if delivery fails.
 *
 * Leaving the record behind on a failed send is what produced the worst
 * symptom: the cooldown would then reject the user's retry, so they were told
 * to wait for a code that was never actually sent. Returns true on success.
 */
async function deliverCode(res, { to, subject, title, intro, code, pendingDoc }) {
  const { text, html } = codeEmail({ title, intro, code });
  try {
    await sendMail({ to, subject, text, html });
    return true;
  } catch (err) {
    await pendingDoc?.deleteOne().catch(() => {});
    res.status(502).json({
      message:
        "We couldn't send the verification email right now. Please try again in a moment — if it keeps failing, the mail service needs attention.",
    });
    return false;
  }
}

// ───────────────────────── Registration (OTP) ─────────────────────────

// POST /api/auth/register — step 1: validate + email a verification code.
router.post("/register", otpLimiter, async (req, res, next) => {
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
    if (await User.findOne({ email }).lean()) {
      return res.status(409).json({ message: "An account with this email already exists" });
    }

    const existing = await VerificationCode.findOne({ email, purpose: "register" });
    const throttled = checkSendThrottle(existing);
    if (throttled) return res.status(throttled.status).json(throttled.body);

    const code = genCode();
    const passwordHash = await bcrypt.hash(password, 10);

    // One pending registration per email — replace any previous attempt.
    const pending = await VerificationCode.findOneAndUpdate(
      { email, purpose: "register" },
      {
        $set: {
          email,
          purpose: "register",
          name,
          passwordHash,
          codeHash: hashCode(code),
          attempts: 0,
          lastSentAt: new Date(),
          expiresAt: new Date(Date.now() + CODE_TTL_MS),
        },
        $inc: { sentCount: 1 },
      },
      { upsert: true, new: true, setDefaultsOnInsert: false }
    );

    const sent = await deliverCode(res, {
      to: email,
      subject: "Your TaskFlow verification code",
      title: "Verify your email",
      intro: `Welcome to TaskFlow, ${name}! Use the code below to finish creating your account.`,
      code,
      pendingDoc: pending,
    });
    if (!sent) return;

    res.status(200).json({ pending: true, message: "Verification code sent to your email" });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/register/verify — step 2: check the code, create the account.
router.post("/register/verify", async (req, res, next) => {
  try {
    const email = (req.body.email || "").toLowerCase().trim();
    const code = (req.body.code || "").trim();
    if (!email || !code) {
      return res.status(400).json({ message: "Email and code are required" });
    }

    const pending = await VerificationCode.findOne({ email, purpose: "register" });
    if (!pending) {
      return res.status(400).json({ message: "That code has expired. Please sign up again to get a new one." });
    }
    if (pending.attempts >= MAX_ATTEMPTS) {
      await pending.deleteOne();
      return res.status(429).json({ message: "Too many incorrect attempts. Please sign up again." });
    }
    if (!pending.compareCode(code)) {
      pending.attempts += 1;
      await pending.save();
      const left = MAX_ATTEMPTS - pending.attempts;
      return res.status(400).json({
        message: left > 0 ? `Incorrect code. ${left} attempt${left === 1 ? "" : "s"} remaining.` : "Incorrect code.",
      });
    }

    // Guard against a race where the email got registered meanwhile.
    if (await User.findOne({ email }).lean()) {
      await pending.deleteOne();
      return res.status(409).json({ message: "An account with this email already exists" });
    }

    const user = new User({ name: pending.name, email, password: pending.passwordHash });
    user.$locals.passwordAlreadyHashed = true; // passwordHash is already bcrypt
    await user.save();
    await pending.deleteOne();

    res.status(201).json({ token: signToken(user._id), user: publicUser(user) });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/register/resend — re-send the registration code.
router.post("/register/resend", otpLimiter, async (req, res, next) => {
  try {
    const email = (req.body.email || "").toLowerCase().trim();
    const pending = await VerificationCode.findOne({ email, purpose: "register" });
    if (!pending) {
      return res.status(400).json({ message: "No pending registration found. Please sign up again." });
    }

    const throttled = checkSendThrottle(pending);
    if (throttled) return res.status(throttled.status).json(throttled.body);

    const code = genCode();
    // Snapshot the previous state so a failed send can be rolled back rather
    // than leaving the user holding a code that was never delivered.
    const previous = { codeHash: pending.codeHash, expiresAt: pending.expiresAt, attempts: pending.attempts };

    pending.codeHash = hashCode(code);
    pending.attempts = 0;
    pending.sentCount = (pending.sentCount || 0) + 1;
    pending.lastSentAt = new Date();
    pending.expiresAt = new Date(Date.now() + CODE_TTL_MS);
    await pending.save();

    const { text, html } = codeEmail({
      title: "Verify your email",
      intro: "Here's your new TaskFlow verification code.",
      code,
    });

    try {
      await sendMail({ to: email, subject: "Your TaskFlow verification code", text, html });
    } catch {
      Object.assign(pending, previous);
      pending.sentCount = Math.max(0, (pending.sentCount || 1) - 1);
      await pending.save().catch(() => {});
      return res.status(502).json({
        message: "We couldn't send the email right now. Please try again in a moment.",
      });
    }

    res.json({ message: "A new code has been sent" });
  } catch (err) {
    next(err);
  }
});

// ───────────────────────────── Login ──────────────────────────────────

router.post("/login", loginLimiter, async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email: (email || "").toLowerCase().trim() }).select("+password");
    if (!user || !(await user.comparePassword(password || ""))) {
      return res.status(401).json({ message: "Invalid email or password" });
    }
    res.json({ token: signToken(user._id), user: publicUser(user) });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────── Forgot / reset password ──────────────────────

// POST /api/auth/forgot-password — email a reset code. Always responds 200 so
// the endpoint can't be used to discover which emails are registered.
router.post("/forgot-password", otpLimiter, async (req, res, next) => {
  try {
    const email = (req.body.email || "").toLowerCase().trim();
    const genericOk = {
      message: "If an account exists for that email, a reset code has been sent.",
    };
    if (!isEmail(email)) return res.json(genericOk);

    const user = await User.findOne({ email }).lean();
    if (!user) return res.json(genericOk);

    const existing = await VerificationCode.findOne({ email, purpose: "reset" });
    const throttled = checkSendThrottle(existing);
    if (throttled) return res.status(throttled.status).json(throttled.body);

    const code = genCode();
    const pending = await VerificationCode.findOneAndUpdate(
      { email, purpose: "reset" },
      {
        $set: {
          email,
          purpose: "reset",
          codeHash: hashCode(code),
          attempts: 0,
          lastSentAt: new Date(),
          expiresAt: new Date(Date.now() + CODE_TTL_MS),
        },
        $inc: { sentCount: 1 },
      },
      { upsert: true, new: true }
    );

    const sent = await deliverCode(res, {
      to: email,
      subject: "Reset your TaskFlow password",
      title: "Reset your password",
      intro: "Use the code below to set a new password for your TaskFlow account.",
      code,
      pendingDoc: pending,
    });
    if (!sent) return;

    res.json(genericOk);
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/reset-password — verify the code and set a new password.
router.post("/reset-password", async (req, res, next) => {
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
      return res.status(400).json({ message: "That reset code has expired. Please start again." });
    }
    if (pending.attempts >= MAX_ATTEMPTS) {
      await pending.deleteOne();
      return res.status(429).json({ message: "Too many incorrect attempts. Please start again." });
    }
    if (!pending.compareCode(code)) {
      pending.attempts += 1;
      await pending.save();
      const left = MAX_ATTEMPTS - pending.attempts;
      return res.status(400).json({
        message: left > 0 ? `Incorrect code. ${left} attempt${left === 1 ? "" : "s"} remaining.` : "Incorrect code.",
      });
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
    next(err);
  }
});

// ───────────────────────────── Current user ───────────────────────────

router.get("/me", requireAuth, async (req, res, next) => {
  try {
    const user = await User.findById(req.userId).lean();
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json({ user: publicUser(user) });
  } catch (err) {
    next(err);
  }
});

export default router;
