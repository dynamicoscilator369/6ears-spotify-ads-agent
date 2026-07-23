/** Shared helpers (JS for zero-build shared package in v0.1). */

export function assertArtistSlug(slug) {
  if (typeof slug !== "string" || !/^[a-z0-9][a-z0-9-]{1,62}$/.test(slug)) {
    throw new Error(
      "Artist slug must be lowercase letters, numbers, hyphens (2–63 chars), e.g. my-artist"
    );
  }
  return slug;
}

export function redactSecrets(obj) {
  if (obj == null || typeof obj !== "object") return obj;
  const banned = /token|secret|password|authorization|api[_-]?key/i;
  const out = Array.isArray(obj) ? [] : {};
  for (const [k, v] of Object.entries(obj)) {
    if (banned.test(k)) out[k] = "[redacted]";
    else if (v && typeof v === "object") out[k] = redactSecrets(v);
    else out[k] = v;
  }
  return out;
}
