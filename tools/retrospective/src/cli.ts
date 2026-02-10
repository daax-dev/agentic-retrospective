#!/usr/bin/env node

/**
 * CLI entry point for @daax/retro
 *
 * Usage:
 *   daax-retro [options]
 *   npx @daax/retro [options]
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { runRetro } from './runner.js';
import type { RetroConfig } from './types.js';

const program = new Command();

program
  .name('daax-retro')
  .description('Generate evidence-based sprint retrospective analyzing human-agent collaboration')
  .version('0.1.0')
  .option('--from <ref>', 'Git ref for sprint start (commit hash, tag, branch, or relative ref)', '')
  .option('--to <ref>', 'Git ref for sprint end (commit hash, tag, branch, or relative ref)', 'HEAD')
  .option('--sprint <id>', 'Sprint identifier for report naming')
  .option('--decisions <path>', 'Path to decision logs', '.logs/decisions')
  .option('--logs <path>', 'Path to agent logs', '.logs/agents')
  .option('--ci <path>', 'Path to CI results')
  .option('--output <dir>', 'Output directory', 'docs/retro')
  .option('--json', 'Output JSON only (no markdown)')
  .option('--verbose', 'Show detailed progress')
  .action(async (options) => {
    try {
      console.log(chalk.blue('🔄 Starting Agentic Retrospective...\n'));

      const config: RetroConfig = {
        fromRef: options.from || '',
        toRef: options.to,
        sprintId: options.sprint || generateSprintId(),
        decisionsPath: options.decisions,
        agentLogsPath: options.logs,
        ciPath: options.ci,
        outputDir: options.output,
      };

      const result = await runRetro(config, {
        verbose: options.verbose,
        jsonOnly: options.json,
      });

      if (result.success) {
        console.log(chalk.green('\n✅ Retrospective complete!\n'));
        console.log(`📄 Report: ${result.outputPath}/retro.md`);
        console.log(`📊 Data: ${result.outputPath}/retro.json`);

        if (result.alerts && result.alerts.length > 0) {
          console.log(chalk.yellow(`\n⚠️  ${result.alerts.length} alerts require attention`));
        }
      } else {
        console.log(chalk.red('\n❌ Retrospective failed'));
        console.log(result.error);
        process.exit(1);
      }
    } catch (error) {
      console.error(chalk.red('Error:'), error);
      process.exit(1);
    }
  });

function generateSprintId(): string {
  const now = new Date();
  return `retro-${now.toISOString().slice(0, 10)}`;
}

program.parse();
