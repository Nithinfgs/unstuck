import os from 'node:os';

const SECRET_PATTERNS = [
  /\bsk-[A-Za-z0-9_-]{16,}/g,
  /\bgh[pousr]_[A-Za-z0-9]{20,}/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}/g,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
  /(Bearer\s+)[A-Za-z0-9._~+/=-]{12,}/gi,
  /((?:password|passwd|secret|token|api[_-]?key)\s*[=:]\s*)["']?[^\s"']{6,}/gi,
];

/**
 * Mask likely secrets and shorten the home directory.
 * Everything unstuck prints or writes goes through this function.
 * @param {string} text
 * @param {string} [home]
 */
export function redact(text, home = os.homedir()) {
  let out = String(text);
  for (const re of SECRET_PATTERNS) {
    out = out.replace(re, (m, prefix) => (typeof prefix === 'string' && m.startsWith(prefix) ? `${prefix}[redacted]` : '[redacted]'));
  }
  if (home && home.length > 1) out = out.split(home).join('~');
  return out;
}

/** Collapse whitespace and cut to `max` characters. */
export function clip(text, max = 110) {
  const t = String(text).replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

/** Redact then clip: the standard way to show user content in output. */
export function safe(text, max = 110) {
  return clip(redact(text), max);
}
