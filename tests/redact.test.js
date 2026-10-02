import test from 'node:test';
import assert from 'node:assert/strict';
import { redact, clip, safe } from '../src/redact.js';

test('redacts common secret shapes', () => {
  const cases = [
    'key sk-abcdefghijklmnopqrstuvwx',
    'tok ghp_abcdefghijklmnopqrstuvwxyz0123456789',
    'aws AKIAABCDEFGHIJKLMNOP',
    'Authorization: Bearer abcdefghijklmnop1234',
    'export API_KEY=supersecretvalue123',
    'password: "hunter2hunter2"',
    'jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkw.abcdefghijklmnopqrstu',
  ];
  for (const c of cases) {
    const out = redact(c, '/home/x');
    assert.ok(out.includes('[redacted]'), c);
    assert.ok(!/sk-abcdef|ghp_abcdef|AKIAABCD|abcdefghijklmnop1234|supersecretvalue|hunter2hunter2|eyJzdWIi/.test(out), `leaked: ${out}`);
  }
});

test('keeps the label of key=value secrets', () => {
  assert.equal(redact('API_KEY=supersecretvalue123', '/h'), 'API_KEY=[redacted]');
});

test('shortens the home directory', () => {
  assert.equal(redact('/home/dev/app/src', '/home/dev'), '~/app/src');
});

test('clip and safe', () => {
  assert.equal(clip('a  b\n c', 50), 'a b c');
  assert.equal(clip('x'.repeat(20), 10).length, 10);
  assert.ok(!safe('token=abcdefghijk123', 80).includes('abcdefghijk123'));
});
