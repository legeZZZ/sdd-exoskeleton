---
name: sdd-evolve
description: Guide the full SDD evolution cycle — propose a change, get spec approval, apply the implementation, verify correctness, and archive the completed change
type: evolution
---

# SDD Evolve

## Purpose

Orchestrates the full Specification-Driven Development evolution cycle: propose a change under `openspec/changes/active/<name>/`, get the proposal reviewed and approved, implement the change against the approved spec, run tests and linters to verify, run `sdd verify` to check spec-code consistency, and archive the completed change to `openspec/changes/archive/<name>/`. This skill glues together the sdd-propose, sdd-apply, sdd-verify, and sdd-archive skills into a coherent workflow.

## When to Use

- Implementing a new feature that needs a spec before code
- Refactoring a module that has an existing OpenSpec spec file
- Bug fixes that change behavior documented in specs
- Any change that crosses module boundaries (use sdd-arch-guard to check)
- Onboarding new contributors to the SDD workflow

## Instructions

1. **Propose the change** (delegate to sdd-propose skill):
   - Describe the change: what problem it solves, what modules it touches
   - The proposal is created as `openspec/changes/active/<name>/proposal.md`
   - The proposal template includes: Motivation, Approach, and Tasks sections
   - If the change affects multiple modules, list all affected specs

2. **Review and get approval**:
   - Run `sdd-review` to check the proposal against coding standards and naming conventions
   - Run `sdd-cr` to verify the proposal is consistent with existing specs
   - Run `sdd-arch-guard` to check whether the proposed changes cross architectural boundaries
   - Address any violations or conflicts before proceeding

3. **Apply the change** (delegate to sdd-apply skill):
   - Read the approved proposal
   - Implement the changes following TDD: write tests first, then implementation
   - Run the project's linter and formatter on changed files
   - Run the full test suite to verify nothing is broken
   - Update the relevant OpenSpec spec files to reflect new/changed behavior
   - Regenerate Obsidian vault notes for affected modules with `sdd sync`

4. **Verify** (delegate to sdd-verify skill):
   - Run `sdd doctor` to check all SDD subsystems are healthy
   - Run `sdd status` to confirm sync state is up to date
   - Verify that spec files match the actual code behavior
   - Confirm no stale sync entries
   - Check that all tests pass and coverage meets the 80% threshold

5. **Archive** (delegate to sdd-archive skill):
   - Verify the change is fully complete (no open tasks in proposal)
   - Move `openspec/changes/active/<name>/` to `openspec/changes/archive/<name>/`
   - Update `openspec/changes/archive/index.md` to reference the archived change
   - Update the project's CLAUDE.md module map if new modules were added/removed

## Commands Used

- `sdd status` -- check current SDD state before starting
- `sdd sync` -- sync after implementation to update specs and vault
- `sdd doctor` -- diagnose integration health after each phase
- (sdd-propose) -- creates `openspec/changes/active/<name>/proposal.md`
- (sdd-apply) -- implements the change against the spec
- (sdd-verify) -- verifies spec-code consistency
- (sdd-archive) -- moves completed change to archive

## Pre-Flight Checklist

Before starting the evolution cycle:
- [ ] `sdd doctor` passes all checks (config valid, CodeGraph indexed, vault exists)
- [ ] `sdd status` shows no issues (tracked files > 0, specs > 0)
- [ ] Working directory is clean (no uncommitted changes unrelated to this change)
- [ ] Branch is up to date with the target branch

## Post-Cycle Checklist

After completing the evolution cycle:
- [ ] `sdd doctor` reports 0 failures
- [ ] All tests pass (existing + new)
- [ ] Test coverage >= 80% for changed modules
- [ ] Specs accurately reflect the implemented behavior
- [ ] Sync state is consistent (no stale entries)
- [ ] Change is archived with a clear record of what was done

## Code Location

The evolution cycle is orchestrated across multiple skills:
- Proposal creation: `cli/src/integrations/openspec.ts` (`createChangeFolder()`, `archiveChange()`)
- Spec generation: `cli/src/generators/specs.ts` (`generateChangeProposal()`)
- Sync: `cli/src/sync/delta.ts` (`generateDelta()`, `updateSyncState()`)
- Health checks: `cli/src/commands/doctor.ts` (10 diagnostic checks)
- Status: `cli/src/commands/status.ts` (project, codegraph, openspec, sync state)
