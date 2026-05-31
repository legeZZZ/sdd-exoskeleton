import { Command } from "commander";

export function initCommand(): Command {
  return new Command("init")
    .description("Initialize SDD Exoskeleton in a project directory")
    .action(() => {
      console.log("TODO: sdd init");
    });
}
