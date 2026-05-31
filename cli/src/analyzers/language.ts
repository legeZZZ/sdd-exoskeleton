import * as path from "node:path";
import * as fs from "node:fs";
import { safeRead, listDir } from "../utils/fs.js";

export interface LanguageConfig {
  extensions: string[];
  linter: string;
  formatter: string;
  styleGuide: string;
}

const LANGUAGE_CONFIGS: Record<string, LanguageConfig> = {
  typescript: {
    extensions: [".ts", ".tsx"],
    linter: "eslint",
    formatter: "prettier",
    styleGuide: "typescript/coding-style.md",
  },
  javascript: {
    extensions: [".js", ".jsx"],
    linter: "eslint",
    formatter: "prettier",
    styleGuide: "javascript/coding-style.md",
  },
  python: {
    extensions: [".py"],
    linter: "ruff",
    formatter: "black",
    styleGuide: "python/coding-style.md",
  },
  go: {
    extensions: [".go"],
    linter: "golangci-lint",
    formatter: "gofmt",
    styleGuide: "go/coding-style.md",
  },
  java: {
    extensions: [".java"],
    linter: "checkstyle",
    formatter: "google-java-format",
    styleGuide: "java/coding-style.md",
  },
  kotlin: {
    extensions: [".kt", ".kts"],
    linter: "detekt",
    formatter: "ktlint",
    styleGuide: "kotlin/coding-style.md",
  },
  rust: {
    extensions: [".rs"],
    linter: "clippy",
    formatter: "rustfmt",
    styleGuide: "rust/coding-style.md",
  },
  ruby: {
    extensions: [".rb"],
    linter: "rubocop",
    formatter: "standardrb",
    styleGuide: "ruby/coding-style.md",
  },
  php: {
    extensions: [".php"],
    linter: "phpstan",
    formatter: "php-cs-fixer",
    styleGuide: "php/coding-style.md",
  },
  csharp: {
    extensions: [".cs"],
    linter: "dotnet format",
    formatter: "dotnet format",
    styleGuide: "csharp/coding-style.md",
  },
  c: {
    extensions: [".c", ".h"],
    linter: "cppcheck",
    formatter: "clang-format",
    styleGuide: "c/coding-style.md",
  },
  cpp: {
    extensions: [".cpp", ".hpp", ".cc", ".cxx"],
    linter: "cppcheck",
    formatter: "clang-format",
    styleGuide: "cpp/coding-style.md",
  },
  swift: {
    extensions: [".swift"],
    linter: "swiftlint",
    formatter: "swift-format",
    styleGuide: "swift/coding-style.md",
  },
};

/**
 * Detect programming languages used in a project by checking for well-known
 * project config files (package.json, go.mod, Cargo.toml, etc.).
 */
export function detectLanguages(projectDir: string): string[] {
  const entries = new Set(listDir(projectDir));
  const languages: string[] = [];

  // JavaScript / TypeScript
  if (entries.has("package.json")) {
    languages.push("javascript");
    if (entries.has("tsconfig.json")) {
      languages.push("typescript");
    }
  }

  // Python
  if (entries.has("pyproject.toml") || entries.has("setup.py")) {
    languages.push("python");
  }

  // Go
  if (entries.has("go.mod")) {
    languages.push("go");
  }

  // Java
  if (
    entries.has("pom.xml") ||
    entries.has("build.gradle") ||
    entries.has("build.gradle.kts")
  ) {
    languages.push("java");
  }

  // Kotlin (build.gradle.kts signals Kotlin, may coexist with Java)
  if (entries.has("build.gradle.kts")) {
    languages.push("kotlin");
  }

  // Rust
  if (entries.has("Cargo.toml")) {
    languages.push("rust");
  }

  // Ruby
  if (entries.has("Gemfile")) {
    languages.push("ruby");
  }

  // PHP
  if (entries.has("composer.json")) {
    languages.push("php");
  }

  // C# — any .csproj file
  const hasCsproj = [...entries].some((entry) => entry.endsWith(".csproj"));
  if (hasCsproj) {
    languages.push("csharp");
  }

  // C / C++
  if (entries.has("CMakeLists.txt") || entries.has("Makefile")) {
    languages.push("c");
    languages.push("cpp");
  }

  // Swift
  if (entries.has("Package.swift")) {
    languages.push("swift");
  }

  return languages;
}

/**
 * Detect the source directory for a project using common conventions.
 * Priority: src/ > lib/ > app/ > main/ > . (project root)
 */
export function detectSrcDir(projectDir: string): string {
  const candidates = ["src", "lib", "app", "main"];

  for (const candidate of candidates) {
    const fullPath = path.join(projectDir, candidate);
    try {
      if (fs.statSync(fullPath).isDirectory()) {
        return candidate;
      }
    } catch {
      // Directory does not exist or is not accessible — try next candidate
    }
  }

  return ".";
}

/**
 * Extract the project name from standard project files.
 * Priority: package.json name > setup.py name > pyproject.toml name > directory basename
 */
export function detectProjectName(projectDir: string): string {
  // 1. Try package.json
  const pkgJson = safeRead(path.join(projectDir, "package.json"));
  if (pkgJson !== null) {
    try {
      const pkg = JSON.parse(pkgJson);
      if (typeof pkg.name === "string" && pkg.name.length > 0) {
        return pkg.name;
      }
    } catch {
      // Malformed JSON — fall through to next strategy
    }
  }

  // 2. Try setup.py — extract name from setup(name=...) call
  const setupPy = safeRead(path.join(projectDir, "setup.py"));
  if (setupPy !== null) {
    const nameMatch = setupPy.match(/name\s*=\s*["']([^"']+)["']/);
    if (nameMatch !== null) {
      return nameMatch[1];
    }
  }

  // 3. Try pyproject.toml — extract name from [project] section
  const pyprojectToml = safeRead(path.join(projectDir, "pyproject.toml"));
  if (pyprojectToml !== null) {
    // Match name under [project] without crossing into another TOML section
    const nameMatch = pyprojectToml.match(
      /\[project\](?:(?!\[)[\s\S])*?name\s*=\s*["']([^"']+)["']/,
    );
    if (nameMatch !== null) {
      return nameMatch[1];
    }
  }

  // 4. Fall back to directory name
  return path.basename(projectDir);
}

/**
 * Get the language configuration (extensions, linter, formatter, style guide)
 * for a given language identifier.
 */
export function getLanguageConfig(lang: string): LanguageConfig {
  const config = LANGUAGE_CONFIGS[lang];
  if (config === undefined) {
    throw new Error(`Unsupported language: ${lang}`);
  }
  return structuredClone(config);
}
