# SDD Init Prompt

You are initializing SDD exoskeleton on a legacy project. Run `sdd init` with appropriate flags.

Before running:
1. Check the project root for existing config files (package.json, go.mod, Cargo.toml, etc.)
2. Determine the primary language(s)
3. Decide vault strategy: embedded (in-project), standalone (separate dir), or hybrid (default)

Run: `sdd init [path] --vault-strategy hybrid`

After init completes:
- Review the generated CLAUDE.md for accuracy
- Check the Obsidian vault structure
- Verify OpenSpec specs match module structure
- Run `sdd status` to confirm everything is healthy
