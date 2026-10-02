import { detectRetries } from './retry.js';
import { detectThrash } from './thrash.js';
import { detectRereads } from './rereads.js';
import { detectFloods } from './floods.js';
import { detectCorrections } from './corrections.js';
import { detectRejections } from './rejections.js';
import { impact } from './finding.js';

export { impact } from './finding.js';

export const DETECTORS = [detectRetries, detectThrash, detectRereads, detectFloods, detectCorrections, detectRejections];

/**
 * Run every detector over one session.
 * @param {import('../model.js').Session} session
 * @param {object} [opts] thresholds, see each detector
 * @returns {import('./finding.js').Finding[]}
 */
export function analyzeSession(session, opts = {}) {
  return DETECTORS.flatMap((d) => d(session, opts)).sort((a, b) => impact(b) - impact(a));
}
