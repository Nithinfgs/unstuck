# Security Policy

## What unstuck touches

unstuck reads local agent transcript files and prints or writes summaries. It
makes no network calls, executes nothing from the logs, and never modifies
transcripts. The only files it writes are the ones you ask for (`report -o`,
`suggest --append`).

Transcripts can contain secrets. unstuck redacts common secret shapes (API keys,
tokens, JWTs, `password=` style assignments) and shortens your home directory,
but redaction is pattern-based and best-effort. **Review any report before you
share it.**

## Reporting a vulnerability

Please open a private report through GitHub's
[security advisories](https://github.com/Nithinfgs/unstuck/security/advisories/new)
rather than a public issue. You can expect an acknowledgement within a week.

Examples of in-scope issues: a way for a crafted transcript to execute code, write
outside the requested output file, inject script into the HTML report, or leak a
secret that the documented redaction patterns should have caught.
