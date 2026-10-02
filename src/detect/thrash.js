import { makeFinding } from './finding.js';
import { safe } from '../redact.js';
import { baseName } from '../model.js';

/**
 * Edit/fail/edit cycles and edits that undo an earlier edit (A → B → A).
 * Raw edit counts are not enough: building a feature legitimately takes many edits.
 * @param {import('../model.js').Session} s
 * @param {{thrashCycles?: number, revertMin?: number}} [opts]
 */
export function detectThrash(s, { thrashCycles = 4, revertMin = 2 } = {}) {
  /** @type {Map<string, {edits: import('../model.js').Call[], cycles: number, sawFailure: boolean}>} */
  const files = new Map();
  for (const c of s.calls) {
    if (c.kind === 'shell' && !c.ok && !c.rejected) {
      for (const st of files.values()) st.sawFailure = true;
      continue;
    }
    if ((c.kind !== 'edit' && c.kind !== 'write') || !c.path || !c.ok) continue;
    const st = files.get(c.path) ?? { edits: [], cycles: 0, sawFailure: false };
    if (st.edits.length > 0 && st.sawFailure) st.cycles++;
    st.sawFailure = false;
    st.edits.push(c);
    files.set(c.path, st);
  }

  const out = [];
  for (const [file, st] of files) {
    let reverts = 0;
    st.edits.forEach((cur, k) => {
      if (k === 0 || !cur.oldText || !cur.newText || cur.newText.length < 12) return;
      if (st.edits.slice(0, k).some((e) => e.newText === cur.oldText && e.oldText === cur.newText)) reverts++;
    });
    if (st.cycles < thrashCycles && reverts < revertMin) continue;
    const parts = [`${st.edits.length} edits`];
    if (st.cycles) parts.push(`${st.cycles} after a failing command`);
    if (reverts) parts.push(`${reverts} ${reverts === 1 ? 'edit' : 'edits'} undone`);
    out.push(
      makeFinding(s, {
        kind: 'edit-thrash',
        title: `${baseName(file)}: ${parts.join(', ')}`,
        detail: reverts ? 'The agent changed this file back to an earlier state.' : 'Edit, fail, edit again: the fix was not landing.',
        ts: st.edits[0].ts,
        wastedCalls: Math.max(reverts * 2, st.cycles),
        evidence: [safe(file, 140)],
      }),
    );
  }
  return out;
}
