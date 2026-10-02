import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** Default places agents keep their logs. Only Claude Code is built in today. */
export function defaultRoots() {
  const env = process.env.CLAUDE_CONFIG_DIR;
  const roots = [path.join(env || path.join(os.homedir(), '.claude'), 'projects')];
  return roots.filter((r) => fs.existsSync(r));
}

/**
 * Recursively list *.jsonl files under `root` modified at or after `sinceMs`.
 * @param {string} root file or directory
 * @param {number} sinceMs
 * @returns {string[]}
 */
export function findTranscripts(root, sinceMs = 0) {
  /** @type {string[]} */
  const out = [];
  const walk = (p, depth) => {
    let st;
    try {
      st = fs.statSync(p);
    } catch {
      return;
    }
    if (st.isFile()) {
      if (p.endsWith('.jsonl') && st.mtimeMs >= sinceMs) out.push(p);
      return;
    }
    if (!st.isDirectory() || depth > 6) return;
    for (const name of fs.readdirSync(p)) walk(path.join(p, name), depth + 1);
  };
  walk(root, 0);
  return out;
}

/**
 * Parse "30d", "12h", "2w" or an ISO date into an epoch-ms lower bound.
 * @param {string} spec
 * @param {number} [now]
 */
export function parseSince(spec, now = Date.now()) {
  const m = /^(\d+)\s*([hdw])$/i.exec(spec.trim());
  if (m) {
    const unit = { h: 3600e3, d: 86400e3, w: 7 * 86400e3 }[m[2].toLowerCase()];
    return now - Number(m[1]) * unit;
  }
  const t = Date.parse(spec);
  if (Number.isNaN(t)) throw new Error(`Cannot understand --since "${spec}". Try 30d, 12h, 2w or 2026-09-01.`);
  return t;
}
