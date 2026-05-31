# SDD Sync Prompt

Sync code changes to the SDD specification layer.

Before syncing:
1. Review changed files: `git diff --name-only HEAD~1`
2. Understand the nature of changes (refactor, feature, bug fix)
3. Determine if changes affect public APIs or internal-only

Run: `sdd sync --since HEAD~1`

After syncing:
- Review generated delta proposal
- Update affected Obsidian notes if needed
- Verify no conflicts: `sdd sync --dry-run`
- Commit the updated specs
