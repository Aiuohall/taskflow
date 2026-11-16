import mongoose from "mongoose";
import bcrypt from "bcryptjs";

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
    bio: { type: String, default: "", trim: true, maxlength: 160 },
    jobTitle: { type: String, default: "", trim: true, maxlength: 60 },
    // Small (256px) JPEG/PNG/WebP data URL. Excluded by default so it never
    // rides along on project/member/chat lookups; auth routes opt in.
    avatar: { type: String, select: false },
  },
  { timestamps: true }
);

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
