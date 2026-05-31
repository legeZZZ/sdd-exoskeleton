import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  detectLanguages,
  detectSrcDir,
  detectProjectName,
  getLanguageConfig,
  LanguageConfig,
} from "../../src/analyzers/language.js";

function createTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "sdd-language-test-"));
}

function touchFile(filePath: string, content = ""): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, content, "utf-8");
}

function touchDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

/* ------------------------------------------------------------------ */
/* detectLanguages                                                    */
/* ------------------------------------------------------------------ */
describe("detectLanguages", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTmpDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns an empty array for an empty project directory", () => {
    const languages = detectLanguages(tmpDir);
    expect(languages).toEqual([]);
  });

  it("detects JavaScript when package.json exists without tsconfig.json", () => {
    touchFile(path.join(tmpDir, "package.json"), "{}");
    const languages = detectLanguages(tmpDir);
    expect(languages).toContain("javascript");
    expect(languages).not.toContain("typescript");
  });

  it("detects both TypeScript and JavaScript when package.json and tsconfig.json exist", () => {
    touchFile(path.join(tmpDir, "package.json"), "{}");
    touchFile(path.join(tmpDir, "tsconfig.json"), "{}");
    const languages = detectLanguages(tmpDir);
    expect(languages).toContain("javascript");
    expect(languages).toContain("typescript");
  });

  it("detects Python when pyproject.toml exists", () => {
    touchFile(path.join(tmpDir, "pyproject.toml"), "[project]");
    const languages = detectLanguages(tmpDir);
    expect(languages).toContain("python");
  });

  it("detects Python when setup.py exists", () => {
    touchFile(path.join(tmpDir, "setup.py"));
    const languages = detectLanguages(tmpDir);
    expect(languages).toContain("python");
  });

  it("detects Python once even when both pyproject.toml and setup.py exist", () => {
    touchFile(path.join(tmpDir, "pyproject.toml"));
    touchFile(path.join(tmpDir, "setup.py"));
    const languages = detectLanguages(tmpDir);
    // Should appear exactly once
    expect(languages.filter((l) => l === "python")).toHaveLength(1);
  });

  it("detects Go when go.mod exists", () => {
    touchFile(path.join(tmpDir, "go.mod"), "module example.com");
    const languages = detectLanguages(tmpDir);
    expect(languages).toContain("go");
  });

  it("detects Java when pom.xml exists", () => {
    touchFile(path.join(tmpDir, "pom.xml"), "<project></project>");
    const languages = detectLanguages(tmpDir);
    expect(languages).toContain("java");
  });

  it("detects Java when build.gradle exists", () => {
    touchFile(path.join(tmpDir, "build.gradle"));
    const languages = detectLanguages(tmpDir);
    expect(languages).toContain("java");
  });

  it("detects Java when build.gradle.kts exists", () => {
    touchFile(path.join(tmpDir, "build.gradle.kts"));
    const languages = detectLanguages(tmpDir);
    expect(languages).toContain("java");
  });

  it("detects Kotlin when build.gradle.kts exists", () => {
    touchFile(path.join(tmpDir, "build.gradle.kts"));
    const languages = detectLanguages(tmpDir);
    expect(languages).toContain("kotlin");
  });

  it("detects both Java and Kotlin when build.gradle.kts exists", () => {
    touchFile(path.join(tmpDir, "build.gradle.kts"));
    const languages = detectLanguages(tmpDir);
    expect(languages).toContain("java");
    expect(languages).toContain("kotlin");
  });

  it("detects Rust when Cargo.toml exists", () => {
    touchFile(path.join(tmpDir, "Cargo.toml"), "[package]");
    const languages = detectLanguages(tmpDir);
    expect(languages).toContain("rust");
  });

  it("detects Ruby when Gemfile exists", () => {
    touchFile(path.join(tmpDir, "Gemfile"));
    const languages = detectLanguages(tmpDir);
    expect(languages).toContain("ruby");
  });

  it("detects PHP when composer.json exists", () => {
    touchFile(path.join(tmpDir, "composer.json"), "{}");
    const languages = detectLanguages(tmpDir);
    expect(languages).toContain("php");
  });

  it("detects C# when a .csproj file exists", () => {
    touchFile(path.join(tmpDir, "MyApp.csproj"));
    const languages = detectLanguages(tmpDir);
    expect(languages).toContain("csharp");
  });

  it("detects C# with any .csproj file name", () => {
    touchFile(path.join(tmpDir, "WebApi.csproj"));
    const languages = detectLanguages(tmpDir);
    expect(languages).toContain("csharp");
  });

  it("detects C and C++ when CMakeLists.txt exists", () => {
    touchFile(path.join(tmpDir, "CMakeLists.txt"));
    const languages = detectLanguages(tmpDir);
    expect(languages).toContain("c");
    expect(languages).toContain("cpp");
  });

  it("detects C and C++ when Makefile exists", () => {
    touchFile(path.join(tmpDir, "Makefile"));
    const languages = detectLanguages(tmpDir);
    expect(languages).toContain("c");
    expect(languages).toContain("cpp");
  });

  it("detects Swift when Package.swift exists", () => {
    touchFile(path.join(tmpDir, "Package.swift"));
    const languages = detectLanguages(tmpDir);
    expect(languages).toContain("swift");
  });

  it("detects multiple languages in a polyglot project", () => {
    touchFile(path.join(tmpDir, "package.json"), "{}");
    touchFile(path.join(tmpDir, "tsconfig.json"), "{}");
    touchFile(path.join(tmpDir, "go.mod"));
    touchFile(path.join(tmpDir, "Cargo.toml"));
    touchFile(path.join(tmpDir, "Gemfile"));

    const languages = detectLanguages(tmpDir);
    expect(languages).toContain("javascript");
    expect(languages).toContain("typescript");
    expect(languages).toContain("go");
    expect(languages).toContain("rust");
    expect(languages).toContain("ruby");
  });

  it("does not detect languages from files in subdirectories", () => {
    // Place package.json in a subdir, not at project root
    touchFile(path.join(tmpDir, "subdir", "package.json"), "{}");
    const languages = detectLanguages(tmpDir);
    expect(languages).not.toContain("javascript");
  });

  it("does not detect Kotlin when only build.gradle (not .kts) exists", () => {
    touchFile(path.join(tmpDir, "build.gradle"));
    const languages = detectLanguages(tmpDir);
    expect(languages).toContain("java");
    expect(languages).not.toContain("kotlin");
  });
});

/* ------------------------------------------------------------------ */
/* detectSrcDir                                                       */
/* ------------------------------------------------------------------ */
describe("detectSrcDir", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTmpDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns "src" when src/ exists', () => {
    touchDir(path.join(tmpDir, "src"));
    expect(detectSrcDir(tmpDir)).toBe("src");
  });

  it('returns "lib" when src/ does not exist but lib/ does', () => {
    touchDir(path.join(tmpDir, "lib"));
    expect(detectSrcDir(tmpDir)).toBe("lib");
  });

  it('returns "app" when only app/ exists among candidates', () => {
    touchDir(path.join(tmpDir, "app"));
    expect(detectSrcDir(tmpDir)).toBe("app");
  });

  it('returns "main" when only main/ exists among candidates', () => {
    touchDir(path.join(tmpDir, "main"));
    expect(detectSrcDir(tmpDir)).toBe("main");
  });

  it('returns "." when none of the candidate directories exist', () => {
    expect(detectSrcDir(tmpDir)).toBe(".");
  });

  it("prioritizes src/ over lib/ when both exist", () => {
    touchDir(path.join(tmpDir, "src"));
    touchDir(path.join(tmpDir, "lib"));
    expect(detectSrcDir(tmpDir)).toBe("src");
  });

  it("prioritizes lib/ over app/ when both exist", () => {
    touchDir(path.join(tmpDir, "lib"));
    touchDir(path.join(tmpDir, "app"));
    expect(detectSrcDir(tmpDir)).toBe("lib");
  });

  it("ignores files with the same name (only directories count)", () => {
    touchFile(path.join(tmpDir, "src"), "not-a-directory");
    // src is now a file, not a directory
    expect(detectSrcDir(tmpDir)).toBe(".");
  });
});

/* ------------------------------------------------------------------ */
/* detectProjectName                                                  */
/* ------------------------------------------------------------------ */
describe("detectProjectName", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTmpDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("reads the name from package.json", () => {
    touchFile(
      path.join(tmpDir, "package.json"),
      JSON.stringify({ name: "my-awesome-app" }),
    );
    expect(detectProjectName(tmpDir)).toBe("my-awesome-app");
  });

  it("reads the name from setup.py", () => {
    touchFile(
      path.join(tmpDir, "setup.py"),
      'from setuptools import setup\n\nsetup(\n    name="my-python-lib",\n    version="1.0.0",\n)\n',
    );
    expect(detectProjectName(tmpDir)).toBe("my-python-lib");
  });

  it("reads single-line setup.py name", () => {
    touchFile(
      path.join(tmpDir, "setup.py"),
      "setup(name='oneliner', version='0.1')",
    );
    expect(detectProjectName(tmpDir)).toBe("oneliner");
  });

  it("reads the name from pyproject.toml [project] section", () => {
    touchFile(
      path.join(tmpDir, "pyproject.toml"),
      '[project]\nname = "my-toml-project"\nversion = "2.0.0"\n',
    );
    expect(detectProjectName(tmpDir)).toBe("my-toml-project");
  });

  it("extracts name from pyproject.toml without crossing into another section", () => {
    touchFile(
      path.join(tmpDir, "pyproject.toml"),
      '[project]\nname = "correct-name"\n\n[tool.poetry]\nname = "wrong-name"\n',
    );
    expect(detectProjectName(tmpDir)).toBe("correct-name");
  });

  it("prioritizes package.json over setup.py", () => {
    touchFile(
      path.join(tmpDir, "package.json"),
      JSON.stringify({ name: "npm-name" }),
    );
    touchFile(
      path.join(tmpDir, "setup.py"),
      'setup(name="pip-name")',
    );
    expect(detectProjectName(tmpDir)).toBe("npm-name");
  });

  it("prioritizes setup.py over pyproject.toml", () => {
    touchFile(path.join(tmpDir, "setup.py"), 'setup(name="pip-first")');
    touchFile(
      path.join(tmpDir, "pyproject.toml"),
      '[project]\nname = "toml-second"\n',
    );
    expect(detectProjectName(tmpDir)).toBe("pip-first");
  });

  it("falls back to directory basename when no project files exist", () => {
    expect(detectProjectName(tmpDir)).toBe(path.basename(tmpDir));
  });

  it("falls back to directory basename when package.json has no name field", () => {
    touchFile(path.join(tmpDir, "package.json"), '{"version": "1.0.0"}');
    expect(detectProjectName(tmpDir)).toBe(path.basename(tmpDir));
  });

  it("falls back to directory basename when package.json is malformed", () => {
    touchFile(path.join(tmpDir, "package.json"), "not valid json {{{");
    expect(detectProjectName(tmpDir)).toBe(path.basename(tmpDir));
  });

  it("falls back when package.json name is empty string", () => {
    touchFile(path.join(tmpDir, "package.json"), '{"name": ""}');
    expect(detectProjectName(tmpDir)).toBe(path.basename(tmpDir));
  });

  it("falls back when setup.py has no name parameter", () => {
    touchFile(
      path.join(tmpDir, "setup.py"),
      "setup(version='1.0', description='No name here')",
    );
    expect(detectProjectName(tmpDir)).toBe(path.basename(tmpDir));
  });

  it("falls back when pyproject.toml has no [project] section", () => {
    touchFile(
      path.join(tmpDir, "pyproject.toml"),
      '[tool]\nsomething = "else"\n',
    );
    expect(detectProjectName(tmpDir)).toBe(path.basename(tmpDir));
  });
});

/* ------------------------------------------------------------------ */
/* getLanguageConfig                                                  */
/* ------------------------------------------------------------------ */
describe("getLanguageConfig", () => {
  it("returns the TypeScript config", () => {
    const config = getLanguageConfig("typescript");
    expect(config.extensions).toEqual([".ts", ".tsx"]);
    expect(config.linter).toBe("eslint");
    expect(config.formatter).toBe("prettier");
    expect(config.styleGuide).toBe("typescript/coding-style.md");
  });

  it("returns the JavaScript config", () => {
    const config = getLanguageConfig("javascript");
    expect(config.extensions).toContain(".js");
    expect(config.extensions).toContain(".jsx");
  });

  it("returns the Python config", () => {
    const config = getLanguageConfig("python");
    expect(config.linter).toBe("ruff");
    expect(config.formatter).toBe("black");
  });

  it("returns the Go config", () => {
    const config = getLanguageConfig("go");
    expect(config.linter).toBe("golangci-lint");
    expect(config.formatter).toBe("gofmt");
    expect(config.extensions).toEqual([".go"]);
  });

  it("returns the Java config", () => {
    const config = getLanguageConfig("java");
    expect(config.linter).toBe("checkstyle");
    expect(config.formatter).toBe("google-java-format");
    expect(config.extensions).toEqual([".java"]);
  });

  it("returns the Kotlin config", () => {
    const config = getLanguageConfig("kotlin");
    expect(config.linter).toBe("detekt");
    expect(config.formatter).toBe("ktlint");
    expect(config.extensions).toEqual([".kt", ".kts"]);
  });

  it("returns the Rust config", () => {
    const config = getLanguageConfig("rust");
    expect(config.linter).toBe("clippy");
    expect(config.formatter).toBe("rustfmt");
    expect(config.extensions).toEqual([".rs"]);
  });

  it("returns the Ruby config", () => {
    const config = getLanguageConfig("ruby");
    expect(config.linter).toBe("rubocop");
  });

  it("returns the PHP config", () => {
    const config = getLanguageConfig("php");
    expect(config.linter).toBe("phpstan");
    expect(config.formatter).toBe("php-cs-fixer");
    expect(config.extensions).toEqual([".php"]);
  });

  it("returns the C# config", () => {
    const config = getLanguageConfig("csharp");
    expect(config.linter).toBe("dotnet format");
    expect(config.formatter).toBe("dotnet format");
  });

  it("returns the C config", () => {
    const config = getLanguageConfig("c");
    expect(config.extensions).toEqual([".c", ".h"]);
    expect(config.linter).toBe("cppcheck");
  });

  it("returns the C++ config", () => {
    const config = getLanguageConfig("cpp");
    expect(config.extensions).toEqual([".cpp", ".hpp", ".cc", ".cxx"]);
    expect(config.formatter).toBe("clang-format");
  });

  it("returns the Swift config", () => {
    const config = getLanguageConfig("swift");
    expect(config.linter).toBe("swiftlint");
  });

  it("throws for an unsupported language", () => {
    expect(() => getLanguageConfig("haskell")).toThrow(
      "Unsupported language: haskell",
    );
  });

  it("throws for an empty string", () => {
    expect(() => getLanguageConfig("")).toThrow("Unsupported language: ");
  });

  it("returns immutable config copies (mutating returned config does not affect others)", () => {
    const config1 = getLanguageConfig("typescript");
    config1.extensions.push(".mts" as never);
    config1.linter = "none";

    const config2 = getLanguageConfig("typescript");
    expect(config2.extensions).toEqual([".ts", ".tsx"]);
    expect(config2.linter).toBe("eslint");
  });
});
