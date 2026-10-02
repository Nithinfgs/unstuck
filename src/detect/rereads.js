import { makeFinding } from './finding.js';
import { safe } from '../redact.js';
import { approxTokens, baseName } from '../model.js';

/**
 * Re-reading a file that has not changed since the last read.
 * @param {import('../model.js').Session} s
 * @param {{rereadMin?: number}} [opts]
 */
export function detectRereads(s, { rereadMin = 3 } = {}) {
  /** @type {Map<string, {reads: import('../model.js').Call[], dirty: boolean}>} */
  const state = new Map();
  /** @type {Map<string, import('../model.js').Call[]>} */
  const wasted = new Map();
  for (const c of s.calls) {
    if (!c.path) continue;
    if (c.kind === 'edit' || c.kind === 'write') {
      const st = state.get(c.path);
      if (st) st.dirty = true;
      continue;
    }
    if (c.kind !== 'read' || !c.ok) continue;
    const st = state.get(c.path) ?? { reads: [], dirty: true };
    if (st.reads.length > 0 && !st.dirty) {
      const list = wasted.get(c.path) ?? [st.reads[st.reads.length - 1]];
      list.push(c);
      wasted.set(c.path, list);
    }
    st.reads.push(c);
    st.dirty = false;
    state.set(c.path, st);
  }
  const out = [];
  for (const [file, list] of wasted) {
    if (list.length < rereadMin) continue;
    out.push(
      makeFinding(s, {
        kind: 're-read',
        title: `${baseName(file)} read ${list.length}× with no change in between`,
        ts: list[0].ts,
        wastedCalls: list.length - 1,
        wastedTokens: approxTokens(list.slice(1).reduce((n, c) => n + c.outChars, 0)),
        evidence: [safe(file, 140)],
      }),
    );
  }
  return out;
}
