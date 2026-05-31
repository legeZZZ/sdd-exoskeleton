import { describe, test, expect } from "vitest";
import { Command } from "commander";
import { initCommand } from "../../src/commands/init.js";
import { syncCommand } from "../../src/commands/sync.js";
import { statusCommand } from "../../src/commands/status.js";
import { doctorCommand } from "../../src/commands/doctor.js";

function createTestProgram(): Command {
  return new Command()
    .name("sdd")
    .description("SDD Exoskeleton — wrap legacy projects with CodeGraph + OpenSpec + Obsidian")
    .version("0.1.0")
    .addCommand(initCommand())
    .addCommand(syncCommand())
    .addCommand(statusCommand())
    .addCommand(doctorCommand())
    .exitOverride();
}

function captureHelp(command: Command): string {
  let output = "";
  command.configureOutput({
    writeOut: (str: string) => {
      output += str;
    },
    writeErr: (str: string) => {
      output += str;
    },
  });
  command.outputHelp();
  return output;
}

describe("CLI entry point", () => {
  test("program can be created without errors", () => {
    expect(() => createTestProgram()).not.toThrow();
  });

  test("--help output contains all 4 command names", () => {
    const program = createTestProgram();
    const help = captureHelp(program);

    expect(help).toContain("init");
    expect(help).toContain("sync");
    expect(help).toContain("status");
    expect(help).toContain("doctor");
  });

  test("--version shows 0.1.0", () => {
    const program = createTestProgram();
    let versionOutput = "";

    program.configureOutput({
      writeOut: (str: string) => {
        versionOutput += str;
      },
      writeErr: () => {},
    });

    // commander 12 throws on --version output - capture via exitOverride
    try {
      program.parse(["--version"], { from: "user" });
    } catch {
      // exitOverride throws CommanderError, version was already written
    }

    expect(versionOutput).toContain("0.1.0");
  });
});
