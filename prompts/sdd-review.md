# SDD Code Review Prompt

Review code changes against SDD specifications.

1. Read the relevant spec: `openspec/specs/modules/<module>.md`
2. Compare implementation to spec:
   - Does the code match the documented API?
   - Are new exports documented?
   - Are dependencies correctly tracked?
3. Run `sdd doctor` to check for issues
4. Flag any spec-code mismatches
5. Update spec if implementation intentionally differs
