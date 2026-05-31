import chalk from "chalk";

/**
 * Print an informational message (gray).
 */
export function info(msg: string): void {
  console.log(chalk.gray(msg));
}

/**
 * Print a warning message (yellow with warning prefix).
 */
export function warn(msg: string): void {
  console.log(chalk.yellow(`⚠ ${msg}`));
}

/**
 * Print an error message (red with cross prefix).
 */
export function error(msg: string): void {
  console.error(chalk.red(`✗ ${msg}`));
}

/**
 * Print a success message (green with checkmark prefix).
 */
export function success(msg: string): void {
  console.log(chalk.green(`✓ ${msg}`));
}

/**
 * Print a step message (blue bold).
 */
export function step(msg: string): void {
  console.log(chalk.blue.bold(msg));
}

/**
 * Print a dry-run message (magenta with [DRY RUN] prefix).
 */
export function dryRun(msg: string): void {
  console.log(chalk.magenta(`[DRY RUN] ${msg}`));
}

/**
 * Print a title message (white bold underlined).
 */
export function title(msg: string): void {
  console.log(chalk.white.bold.underline(msg));
}
