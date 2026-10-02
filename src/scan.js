import { parseSession } from './adapters/index.js';
import { analyzeSession, impact } from './detect/index.js';
import { aggregate } from './aggregate.js';
import { findTranscripts } from './discover.js';

/**
 * @typedef {object} ScanResult
 * @property {import('./model.js').Session[]} sessions
 * @property {import('./detect/finding.js').Finding[]} findings   ranked, most impactful first
 * @property {ReturnType<typeof aggregate>} patterns
 * @property {{files: number, skipped: number, badLines: number, calls: number}} stats
 */

/**
 * Discover, parse and analyse transcripts.
 * @param {{roots: string[], sinceMs?: number, project?: string, thresholds?: object}} opts
 * @returns {Promise<ScanResult>}
 */
export async function scan({ roots, sinceMs = 0, project, thresholds = {} }) {
  const files = [...new Set(roots.flatMap((r) => findTranscripts(r, sinceMs)))];
  /** @type {import('./model.js').Session[]} */
  const sessions = [];
  let skipped = 0;
  for (const f of files) {
    try {
      const s = await parseSession(f);
      if (!s || s.calls.length === 0) {
        skipped++;
        continue;
      }
      if (project && !`${s.project} ${s.cwd}`.toLowerCase().includes(project.toLowerCase())) continue;
      sessions.push(s);
    } catch {
      skipped++;
    }
  }
  sessions.sort((a, b) => a.start - b.start);
  const findings = sessions.flatMap((s) => analyzeSession(s, thresholds)).sort((a, b) => impact(b) - impact(a));
  return {
    sessions,
    findings,
    patterns: aggregate(sessions),
    stats: {
      files: files.length,
      skipped,
      badLines: sessions.reduce((n, s) => n + s.badLines, 0),
      calls: sessions.reduce((n, s) => n + s.calls.length, 0),
    },
  };
}
