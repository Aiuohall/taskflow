/** Profile picture, or the first letter of the name when none is set. */
export default function Avatar({ user, size = 36, className = "" }) {
  const box = { width: size, height: size, fontSize: Math.max(11, Math.round(size * 0.4)) };
  if (user?.avatar) {
    return (
      <img
        src={user.avatar}
        alt=""
        style={box}
        className={`shrink-0 rounded-full object-cover ${className}`}
      />
    );
  }
  return (
    <div
      style={box}
      className={`flex shrink-0 items-center justify-center rounded-full bg-indigo-500/20 font-semibold text-indigo-300 ${className}`}
    >
      {user?.name?.[0]?.toUpperCase() || "?"}
    </div>
  );
}
