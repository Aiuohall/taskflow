import mongoose from "mongoose";
import bcrypt from "bcryptjs";

// A short-lived 6-digit code used for two flows:
//  - "register": holds the pending account (name + already-hashed password)
//                until the email is verified, then the real User is created.
//  - "reset":    proves ownership of an existing account to set a new password.
// Documents auto-delete at `expiresAt` via the TTL index below.
const verificationCodeSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    purpose: { type: String, enum: ["register", "reset"], required: true },
    codeHash: { type: String, required: true },
    // Pending-registration payload (only for purpose "register"):
    name: { type: String },
    passwordHash: { type: String },
    attempts: { type: Number, default: 0 },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

// TTL index — MongoDB removes the doc once expiresAt passes.
verificationCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

verificationCodeSchema.methods.compareCode = function (candidate) {
  return bcrypt.compare(candidate, this.codeHash);
};

export default mongoose.model("VerificationCode", verificationCodeSchema);
