/**
 * Human Insights Analyzer
 *
 * Analyzes prompt patterns, intervention timing, and generates
 * recommendations for improving human-agent collaboration.
 *
 * Part of Phase 1: Foundation improvements
 */

import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import type {
  CommitInfo,
  PromptLogEntry,
  FeedbackLogEntry,
  PromptPattern,
  HumanInsights,
  FixToFeatureRatio,
} from '../types.js';

// Re-export types for backwards compatibility with existing imports
export type { PromptLogEntry, FeedbackLogEntry, PromptPattern, HumanInsights, FixToFeatureRatio };

// InterventionTiming is only used locally, not in types.ts
export interface InterventionTiming {
  sessionId: string;
  timestamp: string;
  detectionDelayEstimate?: number; // in minutes
  trigger?: string;
  correctionType?: string;
}

export class HumanInsightsAnalyzer {
  private promptLogs: PromptLogEntry[] = [];
  private feedbackLogs: FeedbackLogEntry[] = [];
  private promptsPath: string;
  private feedbackPath: string;
  private logsLoaded = false;

  constructor(logsBasePath: string) {
    this.promptsPath = join(logsBasePath, 'prompts');
    this.feedbackPath = join(logsBasePath, 'feedback');
  }

  /**
   * Load all prompt and feedback logs from the filesystem
   */
  loadLogs(): void {
    this.promptLogs = this.loadJsonlFiles<PromptLogEntry>(this.promptsPath);
    this.feedbackLogs = this.loadJsonlFiles<FeedbackLogEntry>(this.feedbackPath);
    this.logsLoaded = true;
  }

  private loadJsonlFiles<T>(dirPath: string): T[] {
    const entries: T[] = [];

    if (!existsSync(dirPath)) {
      return entries;
    }

    try {
      const files = readdirSync(dirPath).filter((f: string) => f.endsWith('.jsonl'));

      for (const file of files) {
        const content = readFileSync(join(dirPath, file), 'utf-8');
        const lines = content.split('\n').filter(Boolean);

        for (const line of lines) {
          try {
            entries.push(JSON.parse(line) as T);
          } catch {
            // Skip malformed lines
          }
        }
      }
    } catch {
      // Directory read error
    }

    return entries;
  }

  /**
   * Analyze prompt patterns to identify effective and problematic approaches
   */
  analyzePromptPatterns(): { effective: PromptPattern[]; problematic: PromptPattern[] } {
    const effective: PromptPattern[] = [];
    const problematic: PromptPattern[] = [];

    // Group prompts by session and correlate with feedback
    const sessionFeedback = new Map<string, FeedbackLogEntry>();
    for (const fb of this.feedbackLogs) {
      sessionFeedback.set(fb.session_id, fb);
    }

    // Analyze prompts with complexity signals
    const promptsWithSignals = this.promptLogs.filter(p => p.complexity_signals);

    if (promptsWithSignals.length === 0) {
      return { effective, problematic };
    }

    // Pattern: File references correlate with better outcomes
    const withFileRefs = promptsWithSignals.filter(p => p.complexity_signals!.file_references > 0);
    const withoutFileRefs = promptsWithSignals.filter(p => p.complexity_signals!.file_references === 0);

    if (withFileRefs.length >= 2) {
      const avgAlignmentWithRefs = this.calculateAvgAlignment(withFileRefs, sessionFeedback);
      const avgAlignmentWithoutRefs = this.calculateAvgAlignment(withoutFileRefs, sessionFeedback);

      if (avgAlignmentWithRefs > avgAlignmentWithoutRefs + 0.3) {
        effective.push({
          pattern: 'file_references',
          description: 'Providing file references in prompts',
          frequency: withFileRefs.length,
          avgAlignmentScore: avgAlignmentWithRefs,
          avgReworkLevel: this.calculateAvgRework(withFileRefs, sessionFeedback),
          examples: withFileRefs.slice(0, 2).map(p => this.truncatePrompt(p.prompt)),
          recommendation: 'Continue referencing specific files when asking for similar patterns',
        });
      }
    }

    // Pattern: Constraints correlate with better outcomes
    const withConstraints = promptsWithSignals.filter(p => p.complexity_signals!.has_constraints);
    const withoutConstraints = promptsWithSignals.filter(p => !p.complexity_signals!.has_constraints);

    if (withConstraints.length >= 2) {
      const avgAlignmentWithCons = this.calculateAvgAlignment(withConstraints, sessionFeedback);
      const avgAlignmentWithoutCons = this.calculateAvgAlignment(withoutConstraints, sessionFeedback);

      if (avgAlignmentWithCons > avgAlignmentWithoutCons + 0.3) {
        effective.push({
          pattern: 'explicit_constraints',
          description: 'Including explicit constraints (only, must, don\'t)',
          frequency: withConstraints.length,
          avgAlignmentScore: avgAlignmentWithCons,
          avgReworkLevel: this.calculateAvgRework(withConstraints, sessionFeedback),
          examples: withConstraints.slice(0, 2).map(p => this.truncatePrompt(p.prompt)),
          recommendation: 'Continue using explicit scope boundaries',
        });
      }
    }

    // Pattern: High ambiguity prompts cause issues
    const highAmbiguity = promptsWithSignals.filter(p => p.complexity_signals!.ambiguity_score > 0.6);

    if (highAmbiguity.length >= 2) {
      const avgAlignment = this.calculateAvgAlignment(highAmbiguity, sessionFeedback);
      const avgRework = this.calculateAvgRework(highAmbiguity, sessionFeedback);

      if (avgAlignment < 3.5 || avgRework > 0.5) {
        problematic.push({
          pattern: 'high_ambiguity',
          description: 'Ambiguous prompts without clear requirements',
          frequency: highAmbiguity.length,
          avgAlignmentScore: avgAlignment,
          avgReworkLevel: avgRework,
          examples: highAmbiguity.slice(0, 2).map(p => this.truncatePrompt(p.prompt)),
          recommendation: 'Add specific file references, constraints, or acceptance criteria',
        });
      }
    }

    // Pattern: Missing acceptance criteria
    const missingCriteria = promptsWithSignals.filter(p => !p.complexity_signals!.has_acceptance_criteria);

    if (missingCriteria.length >= 3) {
      const avgAlignment = this.calculateAvgAlignment(missingCriteria, sessionFeedback);
      const avgRework = this.calculateAvgRework(missingCriteria, sessionFeedback);

      if (avgRework > 0.3) {
        problematic.push({
          pattern: 'missing_acceptance_criteria',
          description: 'Prompts without defined success criteria',
          frequency: missingCriteria.length,
          avgAlignmentScore: avgAlignment,
          avgReworkLevel: avgRework,
          examples: missingCriteria.slice(0, 2).map(p => this.truncatePrompt(p.prompt)),
          recommendation: 'Define "done" criteria: expected outputs, error handling, test cases',
        });
      }
    }

    return { effective, problematic };
  }

  private calculateAvgAlignment(
    prompts: PromptLogEntry[],
    feedbackMap: Map<string, FeedbackLogEntry>
  ): number {
    const alignments: number[] = [];
    for (const p of prompts) {
      const fb = feedbackMap.get(p.session_id);
      if (fb) {
        alignments.push(fb.alignment);
      }
    }
    return alignments.length > 0
      ? alignments.reduce((a, b) => a + b, 0) / alignments.length
      : 3; // Default to neutral
  }

  private calculateAvgRework(
    prompts: PromptLogEntry[],
    feedbackMap: Map<string, FeedbackLogEntry>
  ): number {
    const reworkValues: number[] = [];
    for (const p of prompts) {
      const fb = feedbackMap.get(p.session_id);
      if (fb) {
        const val = fb.rework_needed === 'none' ? 0
          : fb.rework_needed === 'minor' ? 1
          : fb.rework_needed === 'significant' ? 2
          : 0.5;
        reworkValues.push(val);
      }
    }
    return reworkValues.length > 0
      ? reworkValues.reduce((a, b) => a + b, 0) / reworkValues.length
      : 0;
  }

  private truncatePrompt(prompt: string, maxLength = 80): string {
    if (prompt.length <= maxLength) return prompt;
    return prompt.substring(0, maxLength) + '...';
  }

  /**
   * Summarize feedback data
   */
  analyzeFeedback(): HumanInsights['feedbackSummary'] {
    if (this.feedbackLogs.length === 0) {
      return {
        avgAlignment: 0,
        totalSessions: 0,
        reworkDistribution: { none: 0, minor: 0, significant: 0 },
        avgRevisionCycles: 0,
      };
    }

    const alignments = this.feedbackLogs.map(f => f.alignment);
    const avgAlignment = alignments.reduce((a, b) => a + b, 0) / alignments.length;

    const reworkDist = { none: 0, minor: 0, significant: 0 };
    for (const fb of this.feedbackLogs) {
      if (fb.rework_needed === 'none') reworkDist.none++;
      else if (fb.rework_needed === 'minor') reworkDist.minor++;
      else if (fb.rework_needed === 'significant') reworkDist.significant++;
    }

    const revisionCycles = this.feedbackLogs
      .map(f => f.revision_cycles)
      .filter((c): c is number => c !== null && c !== undefined);
    const avgRevisionCycles = revisionCycles.length > 0
      ? revisionCycles.reduce((a, b) => a + b, 0) / revisionCycles.length
      : 0;

    return {
      avgAlignment,
      totalSessions: this.feedbackLogs.length,
      reworkDistribution: reworkDist,
      avgRevisionCycles,
    };
  }

  /**
   * Generate CLAUDE.md suggestions based on learned patterns
   */
  generateClaudeMdSuggestions(): string[] {
    const suggestions: string[] = [];
    const patterns = this.analyzePromptPatterns();

    // Add suggestions based on effective patterns
    for (const pattern of patterns.effective) {
      if (pattern.pattern === 'file_references') {
        suggestions.push('- Always reference existing files when asking for similar patterns');
      }
      if (pattern.pattern === 'explicit_constraints') {
        suggestions.push('- Include explicit scope boundaries: "Only modify files in src/..."');
      }
    }

    // Add suggestions to address problematic patterns
    for (const pattern of patterns.problematic) {
      if (pattern.pattern === 'high_ambiguity') {
        suggestions.push('- Be specific: include file names, function names, or line numbers');
      }
      if (pattern.pattern === 'missing_acceptance_criteria') {
        suggestions.push('- Define success criteria: "Done when tests pass and endpoint returns expected shape"');
      }
    }

    // Extract unique improvements from feedback
    const improvements = this.feedbackLogs
      .filter(f => f.improvement_suggestion && f.improvement_suggestion.length > 5)
      .map(f => f.improvement_suggestion!);

    // Deduplicate similar suggestions using simple keyword matching
    const uniqueImprovements = this.deduplicateSuggestions(improvements);
    for (const imp of uniqueImprovements.slice(0, 3)) {
      suggestions.push(`- ${imp}`);
    }

    return suggestions;
  }

  private deduplicateSuggestions(items: string[]): string[] {
    const seen = new Set<string>();
    const result: string[] = [];

    for (const item of items) {
      const normalized = item.toLowerCase().replace(/[^a-z]/g, '');
      if (!seen.has(normalized) && normalized.length > 10) {
        seen.add(normalized);
        result.push(item);
      }
    }

    return result;
  }

  /**
   * Extract top improvements and successes from feedback
   */
  extractTopInsights(): { improvements: string[]; successes: string[] } {
    const improvements = this.feedbackLogs
      .filter(f => f.improvement_suggestion && f.improvement_suggestion.length > 5)
      .map(f => f.improvement_suggestion!)
      .slice(0, 5);

    const successes = this.feedbackLogs
      .filter(f => f.worked_well && f.worked_well.length > 5)
      .map(f => f.worked_well!)
      .slice(0, 5);

    return {
      improvements: this.deduplicateSuggestions(improvements),
      successes: this.deduplicateSuggestions(successes),
    };
  }

  /**
   * Calculate fix-to-feature ratio from commit history
   * A healthy ratio is typically below 10:1 (10 feature commits per fix)
   */
  static calculateFixToFeatureRatio(commits: CommitInfo[]): FixToFeatureRatio {
    const fixPatterns = [
      /^fix[:\s]/i,
      /^bugfix[:\s]/i,
      /^hotfix[:\s]/i,
      /\bfix\b/i,
      /\bfixes\b/i,
      /\bfixed\b/i,
      /\brevert\b/i,
      /\bpatch\b/i,
    ];

    const featurePatterns = [
      /^feat[:\s]/i,
      /^feature[:\s]/i,
      /^add[:\s]/i,
      /^implement[:\s]/i,
      /\badd(s|ed)?\b/i,
      /\bimplement(s|ed)?\b/i,
      /\bnew\b/i,
    ];

    let fixCommits = 0;
    let featureCommits = 0;

    for (const commit of commits) {
      const subject = commit.subject.toLowerCase();

      const isFix = fixPatterns.some(p => p.test(subject));
      const isFeature = featurePatterns.some(p => p.test(subject));

      if (isFix && !isFeature) {
        fixCommits++;
      } else if (isFeature && !isFix) {
        featureCommits++;
      }
    }

    // Avoid division by zero
    const ratio = featureCommits > 0
      ? fixCommits / featureCommits
      : (fixCommits > 0 ? Infinity : 0);

    const threshold = 0.1; // 10:1 feature-to-fix is healthy (0.1 fix-to-feature)
    const isHealthy = ratio <= threshold;

    return {
      ratio,
      fixCommits,
      featureCommits,
      isHealthy,
      threshold,
    };
  }

  /**
   * Full analysis returning all human insights
   * Note: Calls loadLogs() only if logs haven't been loaded yet
   */
  analyze(): HumanInsights {
    // Only load if not already loaded (use explicit flag for idempotency)
    if (!this.logsLoaded) {
      this.loadLogs();
    }

    const promptPatterns = this.analyzePromptPatterns();
    const feedbackSummary = this.analyzeFeedback();
    const claudeMdSuggestions = this.generateClaudeMdSuggestions();
    const { improvements, successes } = this.extractTopInsights();

    return {
      promptPatterns,
      feedbackSummary,
      claudeMdSuggestions,
      topImprovements: improvements,
      topSuccesses: successes,
    };
  }

  /**
   * Check if we have enough data to provide insights
   */
  hasData(): boolean {
    return this.promptLogs.length > 0 || this.feedbackLogs.length > 0;
  }

  /**
   * Get data availability status
   */
  getDataStatus(): { prompts: number; feedback: number; hasComplexitySignals: boolean } {
    const hasComplexitySignals = this.promptLogs.some(p => p.complexity_signals);
    return {
      prompts: this.promptLogs.length,
      feedback: this.feedbackLogs.length,
      hasComplexitySignals,
    };
  }
}
