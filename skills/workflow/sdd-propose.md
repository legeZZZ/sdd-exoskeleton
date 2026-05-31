---
name: sdd-propose
description: Propose a change using the SDD workflow — describe the change, generate a proposal.md under openspec/changes/active/, and submit for review
type: workflow
---

# SDD Propose

## Purpose

Creates a formal change proposal in the OpenSpec directory structure. The proposal documents what problem the change solves, the approach, affected modules and specs, and a task checklist. This is step 1 of the SDD evolution cycle: propose -> apply -> verify -> archive. The proposal serves as the source of truth that the implementer follows and the reviewer checks against.

## When to Use

- Starting any new feature, bug fix, or refactoring
- When you need to document a design decision before coding
- Before touching code that has an associated OpenSpec spec file
- When multiple approaches are possible and you need team alignment
- As the first step in the sdd-evolve workflow

## Instructions

1. **Describe the change** -- articulate:
   - What problem does this solve?
   - Which modules does it touch?
   - What is the expected outcome?
   - Are there any risks or trade-offs?

2. **Generate the proposal** -- the proposal is created at `openspec/changes/active/<change-name>/proposal.md`. The template (from `createChangeFolder()` in `cli/src/integrations/openspec.ts`) has these sections:

   ```markdown
   # Change: <change-name>

   ## Motivation
   Why this change is needed. Link to issues, user feedback, or architectural decisions.

   ## Approach
   How the change will be implemented. Include before/after diagrams for structural changes.

   ## Tasks
   - [ ] Task 1 — description
   - [ ] Task 2 — description
   - [ ] Task 3 — description
   ```

3. **Identify affected specs** -- list the `openspec/specs/modules/<module>.md` files that will need updating. If the change crosses boundaries, list cross-boundary dependencies.

4. **Check architectural boundaries** -- run sdd-arch-guard to verify the proposed change does not violate architectural boundaries. If it does, either:
   - Adjust the proposal to stay within boundaries
   - Document the intentional boundary crossing in the proposal
   - Update the boundary map if the architecture is intentionally changing

5. **Add implementation details** to the Tasks section:
   - Break down into testable, completable units
   - Order tasks by dependency
   - Include spec update tasks, test tasks, and implementation tasks
   - Estimate effort for each task if needed

6. **Submit for review** -- once the proposal is complete:
   - Share the proposal with the team
   - Run `sdd-review` to check coding standards alignment
   - Run `sdd-cr` if the change modifies existing specs
   - Address feedback before moving to implementation

## Commands Used

- `sdd status` -- check current project state before proposing
- `sdd doctor` -- verify SDD health before starting new work
- (sdd-arch-guard) -- check boundary violations before finalizing proposal

## Proposal Naming Convention

Use kebab-case names that describe the change:
- `add-2fa-authentication`
- `refactor-user-service-split`
- `fix-session-timeout-bug`
- `extract-payment-gateway-interface`
- `migrate-rest-to-graphql`

## File Structure After Proposal

```
openspec/changes/active/<change-name>/
  proposal.md          # The change proposal
  design.md            # (optional) Detailed design doc
  migration.md         # (optional) Migration plan
```

## Example Proposal

```markdown
# Change: extract-string-utils-from-helpers

## Motivation
`src/utils/helpers.ts` has 80 exports (detected as god module by sdd analyze).
String manipulation functions (25 exports) should be extracted to reduce
coupling and improve discoverability.

## Approach
1. Create `src/utils/string/string-utils.ts` with string-related functions
2. Update imports in 12 dependent files
3. Remove extracted functions from `helpers.ts`
4. Update spec: `openspec/specs/modules/helpers.md`
5. Add new spec: `openspec/specs/modules/string-utils.md`

## Tasks
- [ ] Write tests for string-utils.ts (RED)
- [ ] Create src/utils/string/string-utils.ts with extracted functions (GREEN)
- [ ] Update imports in dependent files
- [ ] Remove extracted functions from helpers.ts
- [ ] Run full test suite, confirm coverage >= 80%
- [ ] Update helpers spec (reduce documented exports)
- [ ] Create string-utils spec
- [ ] Run sdd sync to update vault
- [ ] Archive change
```

## Code Location

- Proposal creation: `cli/src/integrations/openspec.ts` (`createChangeFolder()`)
- Proposal template: `cli/src/integrations/openspec.ts` (inline `PROPOSAL_FILE` template)
- Change proposal generator: `cli/src/generators/specs.ts` (`generateChangeProposal()`)
- Archive function: `cli/src/integrations/openspec.ts` (`archiveChange()`)
