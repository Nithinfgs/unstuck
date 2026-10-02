import { normalizeCommand, commandHead, approxTokens, signature } from './model.js';
import { correctionKey, looksLikeCorrection } from './detect/corrections.js';
import { safe } from './redact.js';

/**
 * @typedef {object} LearnedFix
 * @property {string} failed      Command that failed
 * @property {string} worked      Command that worked afterwards
 * @property {string} error       Typical error line
 * @property {number} count       Times the pair was seen
 * @property {number} sessions    Distinct sessions it appeared in
 * @property {string[]} projects
 */

const FIX_WINDOW = 6;

/** Token-set similarity between two commands, 0..1. */
export function similarity(a, b) {
  const ta = new Set(normalizeCommand(a).split(/\s+/));
  const tb = new Set(normalizeCommand(b).split(/\s+/));
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared++;
  return shared / Math.max(ta.size, tb.size, 1);
}

/**
 * Find "failed, then a close variant succeeded" pairs inside one session.
 * @param {import('./model.js').Session} s
 */
export function fixPairs(s) {
  const pairs = [];
  const shell = s.calls.filter((c) => c.kind === 'shell' && c.command && !c.rejected);
  for (let i = 0; i < shell.length; i++) {
    const bad = shell[i];
    if (bad.ok) continue;
    for (let j = i + 1; j < Math.min(shell.length, i + 1 + FIX_WINDOW); j++) {
      const good = shell[j];
      if (!good.ok) continue;
      const a = normalizeCommand(bad.command ?? '');
      const b = normalizeCommand(good.command ?? '');
      if (a === b) break; // plain flaky retry, not a fix
      if (similarity(a, b) >= 0.5) {
        pairs.push({ failed: a, worked: b, error: bad.error ?? '' });
        break;
      }
    }
  }
  return pairs;
}

/**
 * Cross-session patterns: fixes that recur, corrections repeated, files read everywhere.
 * @param {import('./model.js').Session[]} sessions
 */
export function aggregate(sessions) {
  /** @type {Map<string, LearnedFix & {sessionSet: Set<string>, projectSet: Set<string>}>} */
  const fixes = new Map();
  /** @type {Map<string, {text: string, count: number, sessionSet: Set<string>}>} */
  const corrections = new Map();
  /** @type {Map<string, Set<string>>} */
  const fileReads = new Map();
  /** @type {Map<string, {sig: string, label: string, chars: number, calls: number}>} */
  const hogs = new Map();

  for (const s of sessions) {
    for (const p of fixPairs(s)) {
      const key = `${p.failed}\u0000${p.worked}`;
      const f = fixes.get(key) ?? { failed: p.failed, worked: p.worked, error: p.error, count: 0, sessions: 0, projects: [], sessionSet: new Set(), projectSet: new Set() };
      f.count++;
      f.sessionSet.add(s.id);
      f.projectSet.add(s.project);
      if (!f.error && p.error) f.error = p.error;
      fixes.set(key, f);
    }
    s.prompts.forEach((p, i) => {
      if (i === 0 || p.interrupt || !looksLikeCorrection(p.text)) return;
      const key = correctionKey(p.text);
      if (!key) return;
      const c = corrections.get(key) ?? { text: p.text, count: 0, sessionSet: new Set() };
      c.count++;
      c.sessionSet.add(s.id);
      corrections.set(key, c);
    });
    for (const c of s.calls) {
      if (c.kind === 'read' && c.path && c.ok) {
        const rel = s.cwd && c.path.startsWith(s.cwd) ? c.path.slice(s.cwd.length).replace(/^[\\/]+/, '') : c.path;
        const key = `${s.project}\u0000${rel}`;
        const set = fileReads.get(key) ?? new Set();
        set.add(s.id);
        fileReads.set(key, set);
      }
      if (c.outChars >= 8000 && c.kind === 'shell') {
        const sig = signature(c);
        const h = hogs.get(sig) ?? { sig, label: commandHead(c.command ?? ''), chars: 0, calls: 0 };
        h.chars += c.outChars;
        h.calls++;
        hogs.set(sig, h);
      }
    }
  }

  const learnedFixes = [...fixes.values()]
    .map((f) => ({ failed: safe(f.failed, 140), worked: safe(f.worked, 140), error: safe(f.error, 140), count: f.count, sessions: f.sessionSet.size, projects: [...f.projectSet] }))
    .filter((f) => f.count >= 2)
    .sort((a, b) => b.sessions - a.sessions || b.count - a.count);

  const repeatedCorrections = [...corrections.values()]
    .filter((c) => c.count >= 2)
    .map((c) => ({ text: safe(c.text, 140), count: c.count, sessions: c.sessionSet.size }))
    .sort((a, b) => b.count - a.count);

  const hotFiles = [...fileReads.entries()]
    .filter(([, set]) => set.size >= 3)
    .map(([key, set]) => {
      const [project, file] = key.split('\u0000');
      return { project, file: safe(file, 100), sessions: set.size };
    })
    .sort((a, b) => b.sessions - a.sessions)
    .slice(0, 8);

  const outputHogs = [...hogs.values()]
    .map((h) => ({ command: h.label, calls: h.calls, tokens: approxTokens(h.chars) }))
    .sort((a, b) => b.tokens - a.tokens)
    .slice(0, 5);

  return { learnedFixes, repeatedCorrections, hotFiles, outputHogs };
}
