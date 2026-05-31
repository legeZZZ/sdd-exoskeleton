---
name: sdd-verify
description: Verify SDD health and spec-code consistency — run doctor, check sync state, confirm specs match code, and run tests
type: workflow
---

# SDD Verify

## Purpose

Runs a comprehensive verification of the SDD Exoskeleton's health and the consistency between code, specs, and the Obsidian vault. This is step 3 of the SDD evolution cycle: propose -> apply -> verify -> archive. The verification ensures that: all SDD subsystems are healthy (sdd doctor), the sync state is consistent (no stale entries), specs accurately reflect the code (sdd-cr), and tests pass with adequate coverage.

## When to Use

- After applying a change (sdd-apply) and before archiving (sdd-archive)
- Before merging a pull request to ensure SDD integrity
- When `sdd doctor` reports warnings that need investigation
- As a CI check in your pipeline
- Periodically to audit the health of the SDD integration

## Instructions

1. **Run `sdd doctor`** -- executes all 10 diagnostic checks:
   - Git repository detected
   - CodeGraph installed
   - CodeGraph index found
   - Config valid (.sdd-exoskeleton/config.json)
   - OpenSpec directory exists with specs
   - Obsidian vault exists with notes
   - Sync state present (.sdd-exoskeleton/sync-state.json)
   - Sync state consistent (no stale entries pointing to deleted files)
   - CLAUDE.md present
   - .sdd-exoskeleton/ is writable

   Expected output: `9 passed, 1 warnings, 0 failures` (or better).

2. **Check `sdd status`** -- verify the overall SDD state:
   - **Project**: name, languages, srcDir, vault strategy are configured
   - **CodeGraph**: installed and indexed
   - **OpenSpec**: specs exist, no active changes with conflicts
   - **Sync**: last sync ref is recent, tracked files > 0

3. **Verify spec-code consistency** (delegate to sdd-cr):
   - For each module with a spec in `openspec/specs/modules/`:
     - Check that all documented classes exist in the code
     - Check that all documented APIs exist with matching signatures
     - Check that documented dependencies match actual imports
   - Report any gaps (spec says, code doesn't do) or drift (code does, spec doesn't say)

4. **Check sync state consistency**:
   - Open `.sdd-exoskeleton/sync-state.json`
   - For each tracked entry, verify the file exists and its hash matches
   - Run `diffState()` to identify added, modified, and removed entries
   - If stale entries exist, run `sdd sync` to update

5. **Verify vault notes**:
   - Check that `sdd-vault/modules/` contains notes for all detected modules
   - Check that `sdd-vault/index.md` lists all modules
   - Check that frontmatter is valid YAML
   - Check that wikilinks are not broken (target notes exist)

6. **Run the full test suite**:
   ```bash
   # Use the project's test runner
   npx vitest run  # TypeScript/JavaScript
   python -m pytest  # Python
   go test ./...  # Go
   cargo test  # Rust
   ```
   - All tests must pass
   - Coverage must be >= 80% overall

7. **Check for uncommitted changes**:
   ```bash
   git status
   ```
   - Any uncommitted changes that are not part of an active change proposal?
   - Any generated files that should be committed (specs, sync state)?

8. **Report findings** with severity:
   ```
   SDD VERIFICATION REPORT
   =======================

   Doctor: 10 passed, 0 warnings, 0 failures — PASS
   Status: All systems healthy — PASS
   Spec-Code: No gaps or drift detected — PASS
   Sync State: Consistent, 15 files tracked — PASS
   Vault Notes: All modules have notes, no broken links — PASS
   Tests: 142 passed, 0 failed, coverage 87% — PASS

   OVERALL: PASS — Ready to archive
   ```

## Commands Used

- `sdd doctor` -- 10 diagnostic checks
- `sdd status` -- project/codegraph/openspec/sync state
- `sdd sync` -- sync to fix stale entries
- (sdd-cr) -- spec compliance check
- Project test runner -- full test suite

## Verification Severity

| Finding | Action |
|---------|--------|
| Doctor failure | BLOCK -- fix before proceeding |
| Doctor warning | WARN -- investigate and fix or document |
| Spec-code gap | BLOCK -- implement missing feature or update spec |
| Spec-code drift | WARN -- add to spec or remove from code |
| Stale sync entry | WARN -- run `sdd sync` |
| Broken wikilink | INFO -- regenerate vault note |
| Test failure | BLOCK -- fix tests |
| Low coverage | WARN -- add tests |
| Uncommitted changes | INFO -- commit or explain |

## Integration with SDD Evolution Cycle

```
1. sdd-propose  → Create proposal
2. sdd-apply    → Implement change
3. sdd-verify   → ← YOU ARE HERE: verify everything is consistent
4. sdd-archive  → Archive completed change
```

If sdd-verify fails, return to sdd-apply to fix issues before archiving.

## Code Location

- Doctor: `cli/src/commands/doctor.ts` (`runDoctor()`)
- Status: `cli/src/commands/status.ts` (`runStatus()`)
- Sync state: `cli/src/sync-state.ts` (`loadSyncState()`, `diffState()`)
- Spec verification: `cli/src/integrations/openspec.ts`
- Vault verification: `cli/src/integrations/obsidian.ts`
