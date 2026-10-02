# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [0.1.0] - 2026-10-02

### Added
- Claude Code transcript adapter (`~/.claude/projects/**/*.jsonl`) and a generic
  "unstuck JSONL" adapter for converting other agents' logs.
- Detectors: retry loops, flailing (consecutive failures), edit thrash
  (edit→fail→edit cycles and undone edits), unchanged re-reads, output floods,
  user corrections, interruptions, and declined tool calls.
- Cross-session pattern mining: learned fixes (a command failed, a close variant
  worked), repeated corrections, hot files, output hogs.
- Commands: `scan` (default), `suggest` (AGENTS.md/CLAUDE.md lines, optional
  idempotent `--append`), `report` (self-contained HTML), `--json`, `--demo`.
- Secret redaction and home-directory shortening on all output.
