---
name: sdd-archive
description: Archive a completed SDD change — verify completion, move from active to archive directory, and update the archive index
type: workflow
---

# SDD Archive

## Purpose

Archives a completed change by moving it from `openspec/changes/active/<name>/` to `openspec/changes/archive/<name>/`. This is the final step of the SDD evolution cycle: propose -> apply -> verify -> archive. Archiving maintains a permanent record of every change that went through the SDD process, enabling future developers to understand why and how the codebase evolved.

## When to Use

- After implementing, testing, and verifying a change (sdd-apply + sdd-verify pass)
- When all tasks in the proposal's checklist are checked off
- When the change has been merged to the main branch
- As the final step of the sdd-evolve workflow
- Before starting a new change that depends on this one

## Instructions

1. **Verify completion** -- confirm all criteria are met before archiving:
   - All tasks in `openspec/changes/active/<name>/proposal.md` are checked off (`[x]`)
   - `sdd verify` passes (specs match code, sync state consistent, tests pass)
   - `sdd doctor` reports 0 failures
   - `sdd status` shows no issues
   - Code review (sdd-review + sdd-cr) is approved with no CRITICAL issues
   - Test coverage meets the 80% threshold for changed modules

2. **Check for uncommitted changes** -- ensure the active change is fully committed:
   ```bash
   git status  # should show clean working tree for the changed files
   ```
   Uncommitted changes related to this proposal should be committed before archiving.

3. **Move the change to archive** -- the `archiveChange()` function in `cli/src/integrations/openspec.ts`:
   - Moves `openspec/changes/active/<name>/` to `openspec/changes/archive/<name>/`
   - Uses `fs.renameSync()` (atomic operation on most filesystems)
   - Throws if the active directory does not exist

4. **Update the archive index** -- create or update `openspec/changes/archive/index.md`:
   ```markdown
   # Archived Changes

   ## 2026-05
   - **[extract-string-utils-from-helpers](./extract-string-utils-from-helpers)** — Extracted string utilities from god module helpers.ts
   - **[add-2fa-authentication](./add-2fa-authentication)** — Added two-factor authentication to login flow
   ```
   This index provides a chronological record of all changes.

5. **Update CLAUDE.md if needed** -- if the change added or removed modules, update the Module Map section in CLAUDE.md:
   - New modules: add to the module list
   - Removed modules: remove from the list
   - If CLAUDE.md is auto-generated (contains the sdd-exoskeleton marker), it will be updated on the next `sdd sync`

6. **Tag the commit** (optional but recommended):
   ```bash
   git tag "sdd/<change-name>" -m "SDD archived change: <change-name>"
   ```
   Tags create a permanent reference point for each archived change.

7. **Notify the team** -- the archived change is now part of the project's permanent record. Team members can reference it for context on why code was structured a certain way.

## Commands Used

- `sdd status` -- verify project state before archiving
- `sdd doctor` -- confirm all checks pass
- `sdd verify` -- run full verification (specs, sync state, tests)
- `git status` -- ensure clean working tree

## Archive Directory Structure

```
openspec/changes/archive/
  index.md                        # Chronological index of archived changes
  extract-string-utils/           # Archived change folder
    proposal.md                   # Original proposal
    design.md                     # (optional) Design document
    migration.md                  # (optional) Migration plan
  add-2fa-authentication/         # Another archived change
    proposal.md
```

## Archive Function

The `archiveChange()` function in `cli/src/integrations/openspec.ts`:

```typescript
export function archiveChange(openspecPath: string, name: string): void {
  const sourceDir = path.join(openspecPath, "changes", "active", name);
  const targetDir = path.join(openspecPath, "changes", "archive", name);

  if (!fs.existsSync(sourceDir)) {
    throw new Error(`Cannot archive "${name}": folder does not exist at ${sourceDir}`);
  }

  ensureDir(path.join(openspecPath, "changes", "archive"));
  fs.renameSync(sourceDir, targetDir);
}
```

## Pre-Archive Checklist

- [ ] All proposal tasks are `[x]` complete
- [ ] `sdd verify` passes
- [ ] `sdd doctor` shows 0 failures
- [ ] `sdd status` shows no issues
- [ ] Code review approved (no CRITICAL issues)
- [ ] Test coverage >= 80%
- [ ] Changes committed to git
- [ ] No uncommitted files related to this change

## Post-Archive Checklist

- [ ] Change folder moved to `openspec/changes/archive/<name>/`
- [ ] Archive index updated with the change entry
- [ ] CLAUDE.md updated if module structure changed
- [ ] Git tag created (optional)
- [ ] Team notified

## Code Location

- Archive function: `cli/src/integrations/openspec.ts` (`archiveChange()`)
- Active changes directory: `openspec/changes/active/`
- Archive directory: `openspec/changes/archive/`
- Change folder creation: `cli/src/integrations/openspec.ts` (`createChangeFolder()`)
