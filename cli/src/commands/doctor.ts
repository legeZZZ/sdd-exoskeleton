import { Command } from "commander";

export function doctorCommand(): Command {
  return new Command("doctor")
    .description("Diagnose configuration and environment issues")
    .action(() => {
      console.log("TODO: sdd doctor");
    });
}
