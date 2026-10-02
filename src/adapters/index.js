import fs from 'node:fs';
import * as claude from './claude.js';
import * as generic from './generic.js';

const ADAPTERS = [claude, generic];

/** Read the first few non-empty lines of a file without loading all of it. */
function headLines(file, n = 8) {
  const fd = fs.openSync(file, 'r');
  try {
    const buf = Buffer.alloc(65536);
    const read = fs.readSync(fd, buf, 0, buf.length, 0);
    return buf
      .subarray(0, read)
      .toString('utf8')
      .split('\n')
      .filter((l) => l.trim())
      .slice(0, n);
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * Parse a transcript with whichever adapter recognises it.
 * Returns null for files that are not agent transcripts.
 * @param {string} file
 * @returns {Promise<import('../model.js').Session | null>}
 */
export async function parseSession(file) {
  let head;
  try {
    head = headLines(file);
  } catch {
    return null;
  }
  for (const adapter of ADAPTERS) {
    if (adapter.sniff(head)) return adapter.parse(file);
  }
  return null;
}
