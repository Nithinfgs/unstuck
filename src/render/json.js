/**
 * Machine-readable output. Same redaction as the terminal view.
 * @param {import('../scan.js').ScanResult} result
 * @param {{version?: string}} opts
 */
export function renderJson(result, { version = '' } = {}) {
  return `${JSON.stringify(
    {
      version,
      stats: { sessions: result.sessions.length, ...result.stats },
      findings: result.findings,
      patterns: result.patterns,
    },
    null,
    2,
  )}\n`;
}
