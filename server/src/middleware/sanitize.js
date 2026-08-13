/**
 * Strips MongoDB operator syntax out of anything a client sends.
 *
 * MongoDB isn't SQL, but it has the same class of bug. Because queries are
 * built from JSON objects, a request body of
 *
 *   { "email": { "$ne": null }, "password": { "$ne": null } }
 *
 * turns `User.findOne({ email })` into "find any user whose email is not
 * null" — an authentication bypass, with no quoting mistake anywhere in sight.
 * Query strings are just as exposed: `?project[$ne]=` arrives as an object
 * because Express parses bracket notation into nested structures.
 *
 * Mongoose's schema casting rejects most of these already, since it tries to
 * coerce the object to a string or ObjectId and throws. That's a side effect of
 * having a schema, not a security control — it disappears the moment a field is
 * typed loosely, a `.lean()` query skips a cast, or someone adds an endpoint
 * that queries a field not covered by a schema. Stripping the operators at the
 * edge means a payload like the one above can never reach a query builder at
 * all, regardless of what the route does with it.
 *
 * Keys are removed rather than escaped: no legitimate request to this API has
 * a field name beginning with `$` or containing a dot, so there is nothing to
 * preserve.
 */

const isDangerousKey = (key) => key.startsWith("$") || key.includes(".");

function scrub(value, depth = 0) {
  // Bound the recursion so a deeply nested body can't be used to exhaust the
  // stack — express.json's size limit doesn't cap nesting depth.
  if (depth > 20 || value === null || typeof value !== "object") return value;

  if (Array.isArray(value)) return value.map((v) => scrub(v, depth + 1));

  const out = {};
  for (const [key, val] of Object.entries(value)) {
    if (isDangerousKey(key)) continue;
    out[key] = scrub(val, depth + 1);
  }
  return out;
}

/** Scrub an object's own keys in place — for req.query/req.params, which
 *  can't always be reassigned depending on the Express version. */
function scrubInPlace(obj) {
  if (!obj || typeof obj !== "object") return;
  for (const key of Object.keys(obj)) {
    if (isDangerousKey(key)) {
      delete obj[key];
      continue;
    }
    const val = obj[key];
    if (val && typeof val === "object") obj[key] = scrub(val);
  }
}

/**
 * Coerce a request field to a string, or "" if it isn't one.
 *
 * Stripping operators stops the injection, but it leaves `{"email":{"$ne":null}}`
 * as an empty object — and `({}).toLowerCase()` throws, so a blocked attack
 * still produced a 500. Routes should read string input through this so a
 * non-string is treated as absent and answered with the normal validation
 * error instead of a crash.
 */
export const asString = (v) => (typeof v === "string" ? v : "");

export function sanitizeRequest(req, res, next) {
  if (req.body && typeof req.body === "object") req.body = scrub(req.body);
  scrubInPlace(req.query);
  scrubInPlace(req.params);
  next();
}
