import rateLimit from "express-rate-limit";

/*
 * Rate limiting, split by risk.
 *
 * The original setup put 20 requests / 15 min on ALL of /api/auth — including
 * GET /api/auth/me, which the app calls on every page load. A normal browsing
 * session burned the budget, and registration then returned "Too many
 * attempts" instead of sending a code. Visitors sharing an IP (mobile
 * carriers, offices, campus wifi) shared a single budget, so one active user
 * could block everyone else. That is a primary reason codes stopped arriving.
 *
 * Now: session endpoints get a generous limit, credential guessing gets a
 * moderate one, and only the endpoints that actually send mail are tight.
 * Per-email cooldowns live in routes/auth.js so one noisy IP behind a NAT
 * can't lock out every other user sharing it.
 */

const common = { standardHeaders: true, legacyHeaders: false };

/** Broad limit for ordinary authenticated traffic (/me, projects, tasks…). */
export const sessionLimiter = rateLimit({
  ...common,
  windowMs: 15 * 60 * 1000,
  max: 300,
  message: { message: "Too many requests. Please slow down." },
});

/** Password guessing. Successful sign-ins don't count toward the cap. */
export const loginLimiter = rateLimit({
  ...common,
  windowMs: 15 * 60 * 1000,
  max: 40,
  skipSuccessfulRequests: true,
  message: { message: "Too many sign-in attempts. Please try again in a few minutes." },
});

/** Endpoints that send email. Per-IP backstop; per-email limits are in the route. */
export const otpLimiter = rateLimit({
  ...common,
  windowMs: 60 * 60 * 1000,
  max: 15,
  message: { message: "Too many verification emails requested. Please try again in a little while." },
});
