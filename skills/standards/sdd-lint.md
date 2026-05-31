---
name: sdd-lint
description: Run language-appropriate linter and formatter based on detected project config — covers TypeScript, Python, Go, Rust, Java, Kotlin, Ruby, PHP, C#, C, C++, Swift
type: standards
---

# SDD Lint

## Purpose

Detects the project's programming languages from `.sdd-exoskeleton/config.json` (or by scanning project config files), then runs the appropriate linter and formatter for each language. The language-to-tool mapping is centralized in `getLanguageConfig()` in `cli/src/analyzers/language.ts`. This skill ensures code quality standards are applied consistently across all languages in a polyglot project.

## When to Use

- Before committing code to ensure it meets project standards
- As part of the sdd-apply workflow after implementing a change
- When setting up CI/CD to run language-appropriate linting
- After `sdd init` to verify the detected tooling works correctly
- When onboarding a new language to the project

## Instructions

1. **Detect project languages** -- read from `.sdd-exoskeleton/config.json` (`project.languages`), or run language detection by checking for project config files:
   - `package.json` -> JavaScript + TypeScript (if `tsconfig.json` exists)
   - `go.mod` -> Go
   - `Cargo.toml` -> Rust
   - `pyproject.toml` or `setup.py` -> Python
   - `pom.xml` or `build.gradle` -> Java (+ Kotlin if `build.gradle.kts`)
   - `Gemfile` -> Ruby
   - `composer.json` -> PHP
   - `*.csproj` -> C#
   - `CMakeLists.txt` or `Makefile` -> C + C++
   - `Package.swift` -> Swift

2. **Look up the language config** -- `getLanguageConfig(lang)` returns the tooling for each detected language:

   | Language     | Linter         | Formatter           | Style Guide                   |
   |-------------|----------------|---------------------|-------------------------------|
   | typescript  | eslint         | prettier            | typescript/coding-style.md    |
   | javascript  | eslint         | prettier            | javascript/coding-style.md    |
   | python      | ruff           | black               | python/coding-style.md        |
   | go          | golangci-lint  | gofmt               | go/coding-style.md            |
   | rust        | clippy         | rustfmt             | rust/coding-style.md          |
   | java        | checkstyle     | google-java-format  | java/coding-style.md          |
   | kotlin      | detekt         | ktlint              | kotlin/coding-style.md        |
   | ruby        | rubocop        | standardrb          | ruby/coding-style.md          |
   | php         | phpstan        | php-cs-fixer        | php/coding-style.md           |
   | csharp      | dotnet format  | dotnet format       | csharp/coding-style.md        |
   | c           | cppcheck       | clang-format        | c/coding-style.md             |
   | cpp         | cppcheck       | clang-format        | cpp/coding-style.md           |
   | swift       | swiftlint      | swift-format        | swift/coding-style.md         |

3. **Run the linter** for each detected language:
   ```bash
   # TypeScript/JavaScript
   npx eslint "src/**/*.{ts,tsx,js,jsx}"

   # Python
   ruff check src/

   # Go
   golangci-lint run ./...

   # Rust
   cargo clippy -- -D warnings

   # Java
   mvn checkstyle:check  # or gradle checkstyleMain

   # Kotlin
   gradle detekt

   # Ruby
   rubocop

   # PHP
   vendor/bin/phpstan analyse src/

   # C#
   dotnet format --verify-no-changes

   # C/C++
   cppcheck --enable=all src/

   # Swift
   swiftlint lint
   ```

4. **Run the formatter** (check mode, not write):
   ```bash
   # TypeScript/JavaScript
   npx prettier --check "src/**/*.{ts,tsx,js,jsx}"

   # Python
   black --check src/

   # Go
   gofmt -l .

   # Rust
   cargo fmt --check

   # etc.
   ```

5. **Report issues** -- aggregate lint warnings/errors and formatting violations across all languages. CI should fail on any error.

## Commands Used

- `sdd status` -- shows detected languages
- `sdd init` -- detects languages and writes them to config.json
- Language-specific linter/formatter commands (see table above)

## Integration with SDD Workflow

- **sdd-apply**: after implementing changes, run sdd-lint to verify code quality
- **sdd-review**: uses lint results as part of the automated code review
- **sdd-doctor**: checks that linters/formatters are installed and configured
- **CI pipeline**: add sdd-lint as a required check before merge

## Code Location

- Language detection + tooling config: `cli/src/analyzers/language.ts`
- `LANGUAGE_CONFIGS` map: 13 languages, each with extensions, linter, formatter, style guide
- `detectLanguages()`: scans project root for known config files
- `getLanguageConfig()`: returns `{ extensions, linter, formatter, styleGuide }` for a given language
