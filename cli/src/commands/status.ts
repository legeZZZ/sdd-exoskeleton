import { Command } from "commander";

export function statusCommand(): Command {
  return new Command("status")
    .description("Show sync status and drift summary")
    .action(() => {
      console.log("TODO: sdd status");
    });
}
