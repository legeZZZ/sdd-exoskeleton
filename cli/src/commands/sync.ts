import { Command } from "commander";

export function syncCommand(): Command {
  return new Command("sync")
    .description("Sync CodeGraph + OpenSpec + Obsidian state")
    .action(() => {
      console.log("TODO: sdd sync");
    });
}
