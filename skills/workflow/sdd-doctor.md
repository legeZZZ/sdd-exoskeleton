---
name: sdd-doctor
description: Diagnose and fix SDD integration issues — runs 10 health checks, identifies failures and warnings, and provides actionable fixes for each issue
type: workflow
---

# SDD Doctor

## Purpose

Diagnoses the health of the SDD Exoskeleton integration by running 10 targeted checks across all subsystems: git, CodeGraph, config, OpenSpec, Obsidian vault, sync state, CLAUDE.md, and file permissions. Each check returns pass (ok), warn (warning, non-blocking), or fail (error, blocking). The skill analyzes failures and provides concrete, actionable fixes for each issue.

## When to Use

- After `sdd init` to verify initialization succeeded
- When `sdd status` reports issues
- Before starting any SDD evolution cycle
- When sync fails or produces unexpected results
- As a first troubleshooting step for any SDD-related problem
- Periodically to audit SDD health

## Instructions

1. **Run `sdd doctor`** -- this executes all 10 checks automatically:

   | # | Check | What it verifies | Failure means |
   |---|-------|-----------------|---------------|
   | 1 | Git repository | `.git` directory exists in or above the project | Core SDD features require git |
   | 2 | CodeGraph installed | `npx @colbymchenry/codegraph --version` succeeds | Module detection uses fallback |
   | 3 | CodeGraph indexed | `.codegraph/` exists and is non-empty | Module detection uses fallback |
   | 4 | Config valid | `.sdd-exoskeleton/config.json` parses and validates | SDD cannot operate |
   | 5 | OpenSpec exists | `openspec/` directory with spec files | Can't track spec-code consistency |
   | 6 | Obsidian vault exists | Vault directory with `.obsidian/` config | Can't generate module notes |
   | 7 | Sync state present | `.sdd-exoskeleton/sync-state.json` exists | Can't track change deltas |
   | 8 | Sync state consistent | No sync entries pointing to deleted files | Stale tracking data |
   | 9 | CLAUDE.md present | `CLAUDE.md` exists in project root | Missing project constitution |
   | 10 | Writable | `.sdd-exoskeleton/` is writable | SDD can't save state |

2. **Analyze the output** -- the doctor prints results in this format:
   ```
   SDD Doctor — /path/to/project
   Checks:
     ✓ Git repository detected
     ✓ CodeGraph installed
     ⚠ CodeGraph index not found — run 'sdd init' first
     ✓ Config valid
     ⚠ OpenSpec directory not found — run 'sdd init' first
     ⚠ Obsidian vault not found — run 'sdd init' first
     ⚠ Sync state not found — run 'sdd init' first
     ⚠ Sync state consistency check skipped (no sync state)
     ⚠ CLAUDE.md not found — run 'sdd init' to generate
     ✓ .sdd-exoskeleton/ is writable

   Summary: 4 passed, 6 warnings, 0 failures
   ```

3. **Fix each issue** systematically:

   **FAILURES (must fix)**:
   - **Git not detected**: run `git init` in the project root, or verify you are inside a git working tree. CodeGraph requires git.
   - **Config invalid**: open `.sdd-exoskeleton/config.json`, check for JSON syntax errors, verify required fields (`project.name`, `project.languages`, `project.rootDir`, `project.srcDir`). Run `sdd init --force` to regenerate.
   - **Not writable**: check filesystem permissions on `.sdd-exoskeleton/`. Run `chmod u+w .sdd-exoskeleton/` or check for disk space issues.

   **WARNINGS (should fix)**:
   - **CodeGraph not installed**: run `npx @colbymchenry/codegraph --version` to pull the package. Check network connectivity and npm registry access.
   - **CodeGraph index not found**: run `sdd init . --depth deep` or `npx @colbymchenry/codegraph index`.
   - **OpenSpec/vault/sync-state/CLAUDE.md missing**: run `sdd init` to regenerate all outputs. If only some are missing, use `--skip` for the parts that exist: `sdd init --skip codegraph,obsidian` to regenerate only OpenSpec + constitution.
   - **Sync state stale entries**: run `sdd sync` to update hashes and remove entries for deleted files.

4. **Re-run doctor** after applying fixes to confirm all issues are resolved. Expected healthy output:
   ```
   Summary: 10 passed, 0 warnings, 0 failures
   ```

5. **For persistent issues** -- check the underlying filesystem and tooling:
   - **CodeGraph**: try `npx @colbymchenry/codegraph index` directly and check stderr
   - **Config**: validate JSON with `cat .sdd-exoskeleton/config.json | python -m json.tool`
   - **Vault**: verify `.obsidian/app.json` exists and is valid JSON
   - **Sync state**: verify `.sdd-exoskeleton/sync-state.json` is valid JSON
   - **Permissions**: check that `.sdd-exoskeleton/` and all parent dirs allow write

## Commands Used

- `sdd doctor` -- run all 10 diagnostic checks
- `sdd init --force` -- regenerate config and all outputs
- `sdd init . --skip codegraph,obsidian` -- regenerate OpenSpec + constitution only
- `sdd sync` -- update sync state to fix stale entries
- `npx @colbymchenry/codegraph index` -- manually rebuild CodeGraph index

## Doctor Result Type

```typescript
interface DoctorResult {
  passed: number;    // Number of checks that passed (ok)
  warnings: number;  // Number of warnings (non-blocking issues)
  failures: number;  // Number of failures (blocking issues)
}
```

The doctor command sets `process.exitCode = 1` when `failures > 0`, making it suitable for CI checks:
```bash
sdd doctor || echo "SDD health check failed"
```

## Common Issues and Fixes

| Issue | Likely Cause | Fix |
|-------|-------------|-----|
| "Config invalid: project.name is required" | Corrupted config or manual edit | `sdd init --force` |
| "OpenSpec directory not found" | `--skip openspec` was used during init | `sdd init . --skip codegraph,obsidian,constitution` |
| "Sync state has N stale entries" | Files deleted without running sync | `sdd sync` |
| "CLAUDE.md not found" | `--skip constitution` was used during init | `sdd init . --skip codegraph,openspec,obsidian` |
| "CodeGraph not installed" | Network issue or npm not available | Check `npm` is installed, run `npx @colbymchenry/codegraph --version` |
| ".sdd-exoskeleton/ is not writable" | Permission issue or disk full | `ls -la .sdd-exoskeleton/`, check disk space with `df -h` |

## Code Location

- Doctor command: `cli/src/commands/doctor.ts` (`runDoctor()`, `doctorCommand()`)
- 10 checks implemented in `runDoctor()` using: `isRepo()`, `isInstalled()`, `isIndexed()`, `loadConfig()`, `validateConfig()`, `loadSyncState()`, filesystem checks, permission tests
- Helper functions: `countVaultNotes()`, `resolveVaultPath()`, `ok()`, `fail()`, `maybe()` formatters
