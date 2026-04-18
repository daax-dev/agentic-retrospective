#!/usr/bin/env node

/**
 * CLI entry point for agentic-retrospective
 *
 * Usage:
 *   agentic-retrospective [options]
 *   npx @daax-dev/retrospective [options]
 */

import { Command } from 'commander';
import chalk from 'chalk';
import pkg from '../package.json' with { type: 'json' };
import { runRetro } from './runner.js';
import { findRetroConfig } from './config.js';
import type { RetroConfig, RepoConfig } from './types.js';

const program = new Command();

program
  .name('agentic-retrospective')
  .description('Generate evidence-based sprint retrospective analyzing human-agent collaboration')
  .version(pkg.version)
  .option('--from <ref>', 'Git ref for sprint start (commit hash, tag, branch, or relative ref)', '')
  .option('--to <ref>', 'Git ref for sprint end (commit hash, tag, branch, or relative ref)', 'HEAD')
  .option('--sprint <id>', 'Sprint identifier for report naming')
  .option('--decisions <path>', 'Path to decision logs', '.logs/decisions')
  .option('--logs <path>', 'Path to agent logs', '.logs/agents')
  .option('--ci <path>', 'Path to CI results')
  .option('--output <dir>', 'Output directory', 'docs/retrospectives')
  .option('--json', 'Output JSON only (no markdown)')
  .option('--quiet', 'Suppress progress output')
  .option(
    '--repo <path>',
    'Repo path to analyze (repeatable for multi-repo). Overrides [[repos]] in .retro.toml when provided.',
    (v: string, prev: string[]) => [...(prev || []), v],
    [] as string[]
  )
  .action(async (options) => {
    try {
      console.log(chalk.blue('🔄 Starting Agentic Retrospective...\n'));

      // Lower-precedence defaults from .retro.toml
      let toml: ReturnType<typeof findRetroConfig> = null;
      try {
        toml = findRetroConfig();
      } catch (err) {
        console.error(chalk.red('Error reading .retro.toml:'), err instanceof Error ? err.message : err);
        process.exit(1);
      }

      if (toml?.retrospective?.sprint_id && !options.sprint) {
        options.sprint = toml.retrospective.sprint_id;
      }
      if (toml?.retrospective?.output_dir && options.output === 'docs/retrospectives') {
        options.output = toml.retrospective.output_dir;
      }

      // Repos: CLI --repo flags override config-file [[repos]]
      let repos: RepoConfig[] | undefined;
      if (Array.isArray(options.repo) && options.repo.length > 0) {
        repos = (options.repo as string[]).map((p: string, i: number) => ({
          path: p,
          label: `repo-${i + 1}`,
        }));
      } else if (toml?.repos && toml.repos.length > 0) {
        repos = toml.repos;
      }

      const config: RetroConfig = {
        fromRef: options.from || '',
        toRef: options.to,
        sprintId: options.sprint || generateSprintId(),
        decisionsPath: options.decisions,
        agentLogsPath: options.logs,
        ciPath: options.ci,
        outputDir: options.output,
        repos,
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

        // Prompt for feedback (skip in quiet/headless mode)
        if (!options.quiet) {
          await promptForFeedback();
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
  .description('Provide session feedback on agent collaboration quality')
  .option('--alignment <score>', 'How well did the agent understand your intent? (1-5)')
  .option('--rework <level>', 'How much rework was needed? (none/minor/significant)')
  .option('--cycles <number>', 'Number of revision cycles before task completion')
  .option('--worked <text>', 'What worked well?')
  .option('--improve <text>', 'What could be improved?')
  .option('--session <id>', 'Session identifier')
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

    console.log(chalk.blue('\n📝 Micro-Retrospective Feedback\n'));
    console.log(chalk.dim('Rate your collaboration session with the agent.\n'));

    // Collect feedback interactively if not provided via options
    const alignment = options.alignment || await ask(
      chalk.cyan('Alignment (1-5)') + ' - How well did the agent match your intent?\n' +
      chalk.dim('  1=Completely missed, 3=Needed guidance, 5=Exactly right: ')
    );

    const rework = options.rework || await ask(
      chalk.cyan('\nRework needed') + ' - How much code did you have to fix?\n' +
      chalk.dim('  (none/minor/significant): ')
    );

    const cycles = options.cycles || await ask(
      chalk.cyan('\nRevision cycles') + ' - How many times did you need to correct the agent?\n' +
      chalk.dim('  (enter a number): ')
    );

    const worked = options.worked || await ask(
      chalk.cyan('\nWhat worked well?') + '\n' +
      chalk.dim('  (e.g., "Good code structure", "Fast iteration"): ')
    );

    const improve = options.improve || await ask(
      chalk.cyan('\nWhat could be improved?') + '\n' +
      chalk.dim('  (e.g., "Missed edge cases", "Too verbose"): ')
    );

    rl.close();

    // Validate and normalize inputs
    const alignmentScore = Math.max(1, Math.min(5, parseInt(alignment, 10) || 3));
    const reworkLevel = ['none', 'minor', 'significant'].includes(rework?.toLowerCase())
      ? rework.toLowerCase()
      : 'minor';
    const revisionCycles = Math.max(0, parseInt(cycles, 10) || 0);

    const feedback = {
      timestamp: new Date().toISOString(),
      session_id: options.session || `session-${Date.now()}`,
      alignment_score: alignmentScore,
      rework_level: reworkLevel,
      revision_cycles: revisionCycles,
      what_worked: worked || '',
      what_to_improve: improve || '',
    };

    const feedbackFile = join(feedbackPath, `${new Date().toISOString().slice(0, 10)}.jsonl`);
    appendFileSync(feedbackFile, JSON.stringify(feedback) + '\n');

    // Print summary
    console.log(chalk.green('\n✅ Feedback saved!\n'));
    console.log(chalk.bold('Summary:'));
    console.log(`  Alignment:       ${alignmentScore}/5 ${getAlignmentEmoji(alignmentScore)}`);
    console.log(`  Rework:          ${reworkLevel}`);
    console.log(`  Revision cycles: ${revisionCycles}`);
    if (worked) console.log(`  Worked well:     ${worked.slice(0, 50)}${worked.length > 50 ? '...' : ''}`);
    if (improve) console.log(`  To improve:      ${improve.slice(0, 50)}${improve.length > 50 ? '...' : ''}`);
    console.log(`\n📁 Saved to: ${feedbackFile}`);
  });

function getAlignmentEmoji(score: number): string {
  if (score >= 5) return '🎯';
  if (score >= 4) return '👍';
  if (score >= 3) return '😐';
  if (score >= 2) return '👎';
  return '❌';
}

program.parse();
