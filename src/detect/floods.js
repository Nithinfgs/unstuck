import { makeFinding } from './finding.js';
import { safe } from '../redact.js';
import { approxTokens, commandHead, signature } from '../model.js';

/**
 * Tool results so large they dominate the context window.
 * @param {import('../model.js').Session} s
 * @param {{floodChars?: number}} [opts]
 */
export function detectFloods(s, { floodChars = 30_000 } = {}) {
  /** @type {Map<string, import('../model.js').Call[]>} */
  const groups = new Map();
  for (const c of s.calls) {
    const limit = c.kind === 'shell' ? floodChars : c.kind === 'read' ? floodChars * 3 : Infinity;
    if (c.outChars < limit) continue;
    const sig = signature(c);
    const list = groups.get(sig) ?? [];
    list.push(c);
    groups.set(sig, list);
  }
  const out = [];
  for (const [sig, list] of groups) {
    const chars = list.reduce((n, c) => n + c.outChars, 0);
    const first = list[0];
    const label = first.kind === 'shell' ? `\`${safe(commandHead(first.command ?? ''), 40)}\`` : safe(first.path ?? first.tool, 50);
    out.push(
      makeFinding(s, {
        kind: 'output-flood',
        title: `${label} returned ~${approxTokens(chars).toLocaleString('en-US')} tokens${list.length > 1 ? ` over ${list.length} calls` : ''}`,
        detail: first.kind === 'shell' ? 'Pipe through head/tail/grep or add a quieter flag so the agent sees only the result.' : 'Read a range instead of the whole file.',
        ts: first.ts,
        wastedCalls: 0,
        wastedTokens: approxTokens(chars),
        evidence: [safe(first.command ?? first.path ?? sig, 140)],
      }),
    );
  }
  return out;
}
