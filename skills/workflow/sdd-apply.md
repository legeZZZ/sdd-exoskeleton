---
name: sdd-apply
description: Apply an approved SDD change — read the proposal, implement changes using TDD, run tests, update specs, and sync the vault
type: workflow
---

# SDD Apply

## Purpose

Takes an approved change proposal from `openspec/changes/active/<change-name>/proposal.md` and implements it following Test-Driven Development. The implementer reads the proposal's Motivation, Approach, and Tasks sections, writes tests first (RED), implements the minimal code to pass (GREEN), refactors for quality (IMPROVE), runs the full test suite, updates affected OpenSpec specs to match the new implementation, and syncs the Obsidian vault. This is step 2 of the SDD evolution cycle: propose -> apply -> verify -> archive.

## When to Use

- After a change proposal has been reviewed and approved
- When the Tasks checklist in the proposal is clearly defined
- As part of the sdd-evolve workflow (step 2)
- For any implementation that has a spec file guiding it

## Instructions

1. **Read the proposal** thoroughly:
   - `openspec/changes/active/<change-name>/proposal.md`
   - Understand the Motivation, Approach, and all Tasks
   - Identify all affected specs listed in the proposal
   - Note any architectural boundary considerations

2. **Set up the implementation environment**:
   - Confirm `sdd doctor` passes all checks
   - Confirm `sdd status` shows no pre-existing issues
   - Create a feature branch if using git workflow
   - Ensure all dependencies are installed

3. **Write tests first (RED phase)**:
   - Write unit tests for new functions/classes
   - Write integration tests for new API endpoints
   - If modifying existing behavior, update existing tests to reflect the new expected behavior
   - Run the new tests -- they should FAIL (RED)
   - Follow the AAA pattern: Arrange, Act, Assert

4. **Implement the change (GREEN phase)**:
   - Write the minimal code to make tests pass
   - Follow the project's coding standards (see CLAUDE.md)
   - Use immutable patterns: never mutate parameters, use spread/structuredClone
   - Keep functions small (<50 lines) and files focused (<800 lines)
   - Add proper error handling and input validation
   - Run tests -- they should PASS (GREEN)

5. **Refactor (IMPROVE phase)**:
   - Extract repeated logic into shared utilities
   - Improve naming for clarity
   - Remove any dead code or debug statements
   - Check for deep nesting and simplify with early returns
   - Re-run tests to ensure they still pass

6. **Run the linter and formatter** (delegate to sdd-lint):
   - Run language-appropriate linter on changed files
   - Run formatter in check mode
   - Fix any violations

7. **Update specs** -- modify the affected spec files to match the implementation:
   - Update `openspec/specs/modules/<module>.md` for each affected module
   - Update API signatures if they changed
   - Add/remove classes and dependencies as needed
   - If a spec is auto-generated (contains the sdd-exoskeleton marker), it can be safely regenerated
   - If a spec is manually maintained, update it carefully and preserve manual content

8. **Run the full test suite** -- not just the new tests:
   ```bash
   # TypeScript/JavaScript
   npx vitest run
   # Python
   python -m pytest
   # etc.
   ```
   - Confirm all tests pass (existing + new)
   - Confirm coverage >= 80% for changed modules

9. **Sync SDD state** (delegate to sdd-sync):
   - Run `sdd sync` to detect changes, analyze impact, and update `sync-state.json`
   - Review the generated delta at `openspec/changes/<timestamp>-sync/proposal.md`
   - Resolve any conflicts with manually-edited specs
   - Verify vault notes are updated

10. **Run code review** (delegate to sdd-review and sdd-cr):
    - `sdd-review` for code quality, naming, immutability, security
    - `sdd-cr` for spec compliance -- does the code match what the spec says?

## Commands Used

- `sdd status` -- check project state before and after
- `sdd sync` -- sync changes to specs and vault
- `sdd doctor` -- verify SDD health
- `sdd lint` -- run language linter on changed files
- (sdd-review) -- code quality review
- (sdd-cr) -- spec compliance review

## Pre-Implementation Checklist

- [ ] Proposal approved and Tasks are clear
- [ ] `sdd doctor` passes
- [ ] `sdd status` is healthy
- [ ] Feature branch created
- [ ] Affected specs identified

## Post-Implementation Checklist

- [ ] All new tests pass
- [ ] Existing tests still pass
- [ ] Coverage >= 80% for changed modules
- [ ] Linter and formatter pass
- [ ] Specs updated to match implementation
- [ ] `sdd sync` completed without conflicts
- [ ] `sdd doctor` passes
- [ ] Code review completed (no CRITICAL issues)

## Example: Applying a Change

```
Proposal: extract-string-utils-from-helpers (approved)
Implementation steps:

1. Write tests for string-utils.ts → RED
2. Create src/utils/string/string-utils.ts → GREEN
3. Update 12 dependent files' imports
4. Remove functions from helpers.ts
5. Run full test suite → all pass, coverage 87%
6. Run linter → no issues
7. Update specs:
   - edit openspec/specs/modules/helpers.md (reduce exports)
   - create openspec/specs/modules/string-utils.md
8. sdd sync → delta generated, specs updated, vault notes regenerated
9. sdd-review → no CRITICAL issues
10. sdd-cr → spec and code match
```

## Code Location

- Implementation follows the change proposal
- Specs live in: `openspec/specs/modules/`
- Vault notes in: `sdd-vault/modules/`
- Config: `.sdd-exoskeleton/config.json`
- Sync state: `.sdd-exoskeleton/sync-state.json`
