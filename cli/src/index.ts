#!/usr/bin/env node
import { Command } from "commander";
import { initCommand } from "./commands/init.js";
import { syncCommand } from "./commands/sync.js";
import { statusCommand } from "./commands/status.js";
import { doctorCommand } from "./commands/doctor.js";

const program = new Command()
  .name("sdd")
  .description("SDD Exoskeleton — wrap legacy projects with CodeGraph + OpenSpec + Obsidian")
  .version("0.1.0");

program.addCommand(initCommand());
program.addCommand(syncCommand());
program.addCommand(statusCommand());
program.addCommand(doctorCommand());

program.parse();
