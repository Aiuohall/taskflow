import mongoose from "mongoose";
import crypto from "crypto";

// A short-lived 6-digit code used for two flows:
//  - "register": holds the pending account (name + already-hashed password)
//                until the email is verified, then the real User is created.
//  - "reset":    proves ownership of an existing account to set a new password.
// Documents auto-delete at `expiresAt` via the TTL index below.
const verificationCodeSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, lowercase: true, trim: true },
    purpose: { type: String, enum: ["register", "reset"], required: true },
    codeHash: { type: String, required: true },
    // Pending-registration payload (only for purpose "register"):
    name: { type: String },
    passwordHash: { type: String },
    attempts: { type: Number, default: 0 },
    // Per-email send throttling (see routes/auth.js). Tracked here rather than
    // in the IP rate limiter so users behind a shared NAT don't block each other.
    sentCount: { type: Number, default: 1 },
    lastSentAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

// Every lookup is by (email, purpose) — make it a single compound index and
// keep it unique so concurrent requests can't create duplicate pending rows.
verificationCodeSchema.index({ email: 1, purpose: 1 }, { unique: true });

// TTL index — MongoDB removes the doc once expiresAt passes.
verificationCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

/*
 * Codes are hashed with HMAC-SHA256 rather than bcrypt.
 *
 * bcrypt at cost 10 costs ~100ms per hash and was being paid twice on every
 * signup (once to hash the code, once to verify it) purely to protect a
 * 6-digit number that expires in 10 minutes and allows 5 guesses. HMAC with a
 * server-side secret is instant and just as safe here: an attacker who can't
 * read the secret can't precompute the space, and the attempt cap — not hash
 * cost — is what actually bounds online guessing.
 */
function codeSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET must be set");
  return secret;
}

export function hashCode(code) {
  return crypto.createHmac("sha256", codeSecret()).update(String(code)).digest("hex");
}

verificationCodeSchema.methods.compareCode = function (candidate) {
  const expected = Buffer.from(this.codeHash, "utf8");
  const actual = Buffer.from(hashCode(String(candidate ?? "").trim()), "utf8");
  // Constant-time compare; lengths always match since both are hex SHA-256.
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
};

export default mongoose.model("VerificationCode", verificationCodeSchema);
