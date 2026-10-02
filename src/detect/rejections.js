import { makeFinding } from './finding.js';
import { safe } from '../redact.js';
import { commandPrefix } from '../model.js';

/**
 * Tool calls the user declined, grouped by what the agent tried.
 * @param {import('../model.js').Session} s
 * @param {{rejectMin?: number}} [opts]
 */
export function detectRejections(s, { rejectMin = 2 } = {}) {
  /** @type {Map<string, import('../model.js').Call[]>} */
  const groups = new Map();
  for (const c of s.calls) {
    if (!c.rejected) continue;
    const key = c.kind === 'shell' ? commandPrefix(c.command ?? '') : c.tool;
    const list = groups.get(key) ?? [];
    list.push(c);
    groups.set(key, list);
  }
  const out = [];
  for (const [key, list] of groups) {
    if (list.length < rejectMin) continue;
    out.push(
      makeFinding(s, {
        kind: 'rejected',
        title: `You declined \`${safe(key, 50)}\` ${list.length}× and the agent kept proposing it`,
        detail: 'Say what to do instead (or add a permission rule) so it stops asking.',
        ts: list[0].ts,
        wastedCalls: list.length,
        evidence: list.slice(0, 3).map((c) => safe(c.command ?? c.path ?? c.tool, 140)),
      }),
    );
  }
  return out;
}
