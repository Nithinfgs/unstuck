/**
 * @typedef {object} Finding
 * @property {string} kind        Detector id, e.g. "retry-loop"
 * @property {string} title       One line, human readable
 * @property {string} [detail]    Extra context
 * @property {string} sessionId
 * @property {string} project
 * @property {number} ts          When it started (epoch ms)
 * @property {number} wastedCalls Tool calls that did not move the work forward
 * @property {number} wastedTokens Approximate tokens spent on those calls' output
 * @property {string[]} evidence  Short, redacted excerpts
 */

/**
 * Heuristic ranking score. It orders findings; it is not a cost measurement.
 * @param {Finding} f
 */
export function impact(f) {
  return f.wastedCalls + f.wastedTokens / 3000;
}

/**
 * @param {import('../model.js').Session} s
 * @param {Partial<Finding> & Pick<Finding,'kind'|'title'>} f
 * @returns {Finding}
 */
export function makeFinding(s, f) {
  return {
    detail: '',
    wastedCalls: 0,
    wastedTokens: 0,
    evidence: [],
    ts: s.start,
    ...f,
    sessionId: s.id,
    project: s.project,
  };
}
