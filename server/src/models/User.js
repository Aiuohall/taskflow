import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import crypto from "crypto";

// This is deliberately separate from a username: usernames are optional and
// editable, while a profile link must keep resolving after a profile edit.
export const createProfileId = () => crypto.randomBytes(18).toString("base64url");

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: { type: String, required: true, minlength: 6, select: false },
    // Optional handle, unique case-insensitively (stored lowercase). Sparse so
    // the many accounts without one don't collide on "no value". To clear it,
    // $unset the field; never store "" or null.
    username: { type: String, trim: true, lowercase: true, unique: true, sparse: true },
    // A random, permanent identifier used in shareable profile links. It is
    // not derived from an email or username, so neither private data nor a
    // later username change can invalidate a shared link.
    profileId: {
      type: String,
      unique: true,
      sparse: true,
    },
    bio: { type: String, default: "", trim: true, maxlength: 160 },
    jobTitle: { type: String, default: "", trim: true, maxlength: 60 },
    // Small (256px) JPEG/PNG/WebP data URL. Excluded by default so it never
    // rides along on project/member/chat lookups; auth routes opt in.
    avatar: { type: String, select: false },
  },
  { timestamps: true }
);

// Defaults are applied when Mongoose reads old documents too, which would make
// a legacy user appear to have a link without actually persisting it. Generate
// IDs only while creating a new account; loadPublic handles true legacy docs.
userSchema.pre("validate", function (next) {
  if (this.isNew && !this.profileId) this.profileId = createProfileId();
  next();
});

userSchema.pre("save", async function () {
  // Skip hashing when the caller has already provided a bcrypt hash
  // (e.g. a verified pending registration). Set via doc.$locals.passwordAlreadyHashed.
  if (this.isModified("password") && !this.$locals?.passwordAlreadyHashed) {
    this.password = await bcrypt.hash(this.password, 10);
  }
});

userSchema.methods.comparePassword = function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

export default mongoose.model("User", userSchema);
