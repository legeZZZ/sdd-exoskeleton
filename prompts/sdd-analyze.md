# SDD Analyze Prompt

Analyze project structure and architecture health.

Run: `sdd init --skip codegraph,openspec,obsidian,constitution --depth standard`

Review the health report:
- Circular dependencies: refactor immediately
- God modules (>50 exports): consider splitting
- Orphan modules: verify they are still needed
- Deep nesting: flatten where possible

For each issue found, create an OpenSpec change proposal to address it.
