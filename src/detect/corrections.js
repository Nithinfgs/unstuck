import { makeFinding } from './finding.js';
import { safe } from '../redact.js';

const CORRECTION_RE =
  /^\s*(no[,.!]\s|nope\b|wrong\b|not that\b|that'?s (not|wrong|incorrect)\b|i (said|told you|asked for)\b|actually[,]|instead[,]|why did you\b|you (didn'?t|forgot|broke|keep|shouldn'?t|should not)\b|use \S+ (instead|not)\b|undo (that|this|it)\b|revert (that|this|it)\b)/i;

/** @param {string} text */
export function looksLikeCorrection(text) {
  const t = text.trim();
  return t.length > 0 && t.length <= 400 && CORRECTION_RE.test(t);
}

/** Normalize a prompt so repeats of the same correction group together. */
export function correctionKey(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

/**
 * User prompts that correct the agent, plus interruptions.
 * @param {import('../model.js').Session} s
 * @param {{correctionMin?: number}} [opts]
 */
export function detectCorrections(s, { correctionMin = 3 } = {}) {
  const out = [];
  const corrections = s.prompts.filter((p, i) => i > 0 && !p.interrupt && looksLikeCorrection(p.text));
  if (corrections.length >= correctionMin) {
    out.push(
      makeFinding(s, {
        kind: 'corrections',
        title: `You corrected the agent ${corrections.length}× in one session`,
        ts: corrections[0].ts,
        wastedCalls: corrections.length,
        evidence: corrections.slice(0, 4).map((p) => safe(p.text, 120)),
      }),
    );
  }
  const interrupts = s.prompts.filter((p) => p.interrupt).length;
  if (interrupts >= 3) {
    out.push(
      makeFinding(s, {
        kind: 'interrupts',
        title: `You interrupted the agent ${interrupts}×`,
        detail: 'Repeated interruptions usually mean the agent was heading the wrong way.',
        wastedCalls: interrupts,
        evidence: [],
      }),
    );
  }
  return out;
}
