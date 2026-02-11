#!/usr/bin/env node

/**
 * CLI entry point for agentic-retrospective
 *
 * Usage:
 *   agentic-retrospective [options]
 *   npx @agentic/retrospective [options]
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { runRetro } from './runner.js';
import type { RetroConfig } from './types.js';

const program = new Command();

program
  .name('agentic-retrospective')
  .description('Generate evidence-based sprint retrospective analyzing human-agent collaboration')
  .version('0.1.0')
  .option('--from <ref>', 'Git ref for sprint start (commit hash, tag, branch, or relative ref)', '')
  .option('--to <ref>', 'Git ref for sprint end (commit hash, tag, branch, or relative ref)', 'HEAD')
  .option('--sprint <id>', 'Sprint identifier for report naming')
  .option('--decisions <path>', 'Path to decision logs', '.logs/decisions')
  .option('--logs <path>', 'Path to agent logs', '.logs/agents')
  .option('--ci <path>', 'Path to CI results')
  .option('--output <dir>', 'Output directory', 'docs/retrospectives')
  .option('--json', 'Output JSON only (no markdown)')
  .option('--quiet', 'Suppress progress output')
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
        verbose: !options.quiet,
        jsonOnly: options.json,
      });

      if (result.success) {
        console.log(chalk.green('\n✅ Retrospective complete!\n'));
        console.log(`📄 Report: ${result.outputPath}/retrospective.md`);
        console.log(`📊 Data: ${result.outputPath}/retrospective.json`);

        if (result.alerts && result.alerts.length > 0) {
          console.log(chalk.yellow(`\n⚠️  ${result.alerts.length} alerts require attention`));
        }

        // Prompt for feedback
        await promptForFeedback();
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
  return `retrospective-${now.toISOString().slice(0, 10)}`;
}

async function promptForFeedback(): Promise<void> {
  const { existsSync, mkdirSync, appendFileSync, readFileSync, writeFileSync } = await import('fs');
  const { join } = await import('path');
  const readline = await import('readline');

  console.log(chalk.blue('\n📝 Session Feedback\n'));

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const ask = (question: string): Promise<string> => {
    return new Promise((resolve) => {
      rl.question(question, resolve);
    });
  };

  const alignment = await ask('Alignment (1-5): How well did the agent understand your intent? ');
  const rework = await ask('Rework level (none/minor/significant): ');
  const whatWorked = await ask('What went well? ');
  const whatDidnt = await ask("What didn't work? ");

  // Save feedback
  const feedbackPath = join(process.cwd(), '.logs', 'feedback');
  if (!existsSync(feedbackPath)) {
    mkdirSync(feedbackPath, { recursive: true });
  }

  const feedback = {
    timestamp: new Date().toISOString(),
    session_id: generateSprintId(),
    alignment_score: parseInt(alignment, 10) || 3,
    rework_level: rework || 'minor',
    what_worked: whatWorked || '',
    what_didnt_work: whatDidnt || '',
  };

  const feedbackFile = join(feedbackPath, `${new Date().toISOString().slice(0, 10)}.jsonl`);
  appendFileSync(feedbackFile, JSON.stringify(feedback) + '\n');
  console.log(chalk.green('\n✅ Feedback saved!'));

  // Ask about applying learnings to CLAUDE.md
  const applyLearnings = await ask('\nApply learnings to CLAUDE.md? (y/n): ');
  rl.close();

  if (applyLearnings.toLowerCase() === 'y') {
    const claudeMdPath = join(process.cwd(), 'CLAUDE.md');

    // Generate learnings section
    const learnings: string[] = [];
    if (whatWorked) {
      learnings.push(`- Keep doing: ${whatWorked}`);
    }
    if (whatDidnt) {
      learnings.push(`- Avoid: ${whatDidnt}`);
    }

    if (learnings.length > 0) {
      const learningsSection = `\n## Session Learnings (${new Date().toISOString().slice(0, 10)})\n\n${learnings.join('\n')}\n`;

      if (existsSync(claudeMdPath)) {
        const existing = readFileSync(claudeMdPath, 'utf-8');
        writeFileSync(claudeMdPath, existing + learningsSection);
      } else {
        writeFileSync(claudeMdPath, `# CLAUDE.md\n${learningsSection}`);
      }
      console.log(chalk.green('✅ CLAUDE.md updated with learnings!'));
    }
  }
}

// Feedback command for capturing human input on retrospective quality
program
  .command('feedback')
  .description('Provide feedback on the retrospective and agent collaboration')
  .option('--alignment <score>', 'How well did the agent understand your intent? (1-5)', '3')
  .option('--rework <level>', 'How much rework was needed? (none/minor/significant)', 'minor')
  .option('--worked <text>', 'What worked well?')
  .option('--improve <text>', 'What could be improved?')
  .action(async (options) => {
    const { existsSync, mkdirSync, appendFileSync } = await import('fs');
    const { join } = await import('path');
    const readline = await import('readline');

    const feedbackPath = join(process.cwd(), '.logs', 'feedback');
    if (!existsSync(feedbackPath)) {
      mkdirSync(feedbackPath, { recursive: true });
    }

    // Interactive prompts if not provided via options
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const ask = (question: string): Promise<string> => {
      return new Promise((resolve) => {
        rl.question(question, resolve);
      });
    };

    console.log(chalk.blue('\n📝 Retrospective Feedback\n'));

    const alignment = options.alignment || await ask('Alignment score (1-5, how well did agent understand intent): ');
    const rework = options.rework || await ask('Rework level (none/minor/significant): ');
    const worked = options.worked || await ask('What worked well? ');
    const improve = options.improve || await ask('What could be improved? ');

    rl.close();

    const feedback = {
      timestamp: new Date().toISOString(),
      session_id: generateSprintId(),
      alignment_score: parseInt(alignment, 10) || 3,
      rework_level: rework,
      what_worked: worked,
      what_to_improve: improve,
    };

    const feedbackFile = join(feedbackPath, `${new Date().toISOString().slice(0, 10)}.jsonl`);
    appendFileSync(feedbackFile, JSON.stringify(feedback) + '\n');

    console.log(chalk.green('\n✅ Feedback saved!'));
    console.log(`📁 ${feedbackFile}`);
  });

program.parse();
