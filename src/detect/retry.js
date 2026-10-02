import { signature, approxTokens } from '../model.js';
import { makeFinding } from './finding.js';
import { safe } from '../redact.js';

/**
 * Same action failing repeatedly, and runs of consecutive failures.
 * @param {import('../model.js').Session} s
 * @param {{retryMin?: number, flailMin?: number}} [opts]
 */
export function detectRetries(s, { retryMin = 3, flailMin = 4 } = {}) {
  const out = [];

  /** @type {Map<string, import('../model.js').Call[]>} */
  const failures = new Map();
  for (const c of s.calls) {
    if (c.ok || c.rejected) continue;
    const sig = signature(c);
    const list = failures.get(sig) ?? [];
    list.push(c);
    failures.set(sig, list);
  }
  const inLoop = new Set();
  for (const [sig, list] of failures) {
    if (list.length < retryMin) continue;
    list.forEach((c) => inLoop.add(c.index));
    const first = list[0];
    const label = first.kind === 'shell' ? `\`${safe(sig.replace(/^sh:/, ''), 56)}\`` : safe(sig, 60);
    out.push(
      makeFinding(s, {
        kind: 'retry-loop',
        title: `${label} failed ${list.length}× in one session`,
        detail: first.error ? safe(first.error, 120) : '',
        ts: first.ts,
        wastedCalls: list.length - 1,
        wastedTokens: approxTokens(list.reduce((n, c) => n + c.outChars, 0)),
        evidence: [safe(first.command ?? first.path ?? sig.replace(/^sh:/, ''), 140), ...(first.error ? [safe(first.error, 140)] : [])],
      }),
    );
  }

  // Runs of consecutive failures across *different* calls: the agent is flailing.
  let run = [];
  const flush = () => {
    if (run.length >= flailMin && !run.every((c) => inLoop.has(c.index))) {
      out.push(
        makeFinding(s, {
          kind: 'flailing',
          title: `${run.length} failed tool calls in a row`,
          detail: 'Different calls, all failing: the agent was guessing.',
          ts: run[0].ts,
          wastedCalls: run.length,
          wastedTokens: approxTokens(run.reduce((n, c) => n + c.outChars, 0)),
          evidence: run.slice(0, 4).map((c) => safe(`${c.tool}: ${c.error ?? c.command ?? c.path ?? ''}`, 140)),
        }),
      );
    }
    run = [];
  };
  for (const c of s.calls) {
    if (!c.ok && !c.rejected) run.push(c);
    else flush();
  }
  flush();
  return out;
}
