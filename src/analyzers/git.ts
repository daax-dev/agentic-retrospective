/**
 * Git repository analyzer for the Agentic Retrospective
 */

import { execSync } from 'child_process';
import type { CommitInfo, FileChange, CommitType, CommitTypeBreakdown, WorkClassification, CommitCadenceMetrics } from '../types.js';

export interface GitAnalysisResult {
  commits: CommitInfo[];
  totalLinesAdded: number;
  totalLinesRemoved: number;
  filesByExtension: Map<string, number>;
  hotspots: Array<{ path: string; changes: number }>;
  // GAP-01, GAP-02, GAP-03 additions
  commitTypeBreakdown: CommitTypeBreakdown;
  checkpointCommits: number;
  workClassification: WorkClassification;
  // P3: Commit cadence
  commitCadence: CommitCadenceMetrics;
}

export class GitAnalyzer {
  private cwd: string;

  constructor(cwd: string = process.cwd()) {
    this.cwd = cwd;
  }

  /**
   * Check if current directory is a git repository
   */
  async isGitRepository(): Promise<boolean> {
    try {
      execSync('git rev-parse --git-dir', { stdio: 'pipe', cwd: this.cwd });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Analyze git history between two refs
   */
  async analyze(fromRef: string, toRef: string = 'HEAD'): Promise<GitAnalysisResult> {
    const resolvedFrom = fromRef || await this.getDefaultFromRef();
    const commits = await this.getCommits(resolvedFrom, toRef);

    // Calculate totals
    let totalLinesAdded = 0;
    let totalLinesRemoved = 0;
    const fileChangeCounts = new Map<string, number>();
    const filesByExtension = new Map<string, number>();

    for (const commit of commits) {
      totalLinesAdded += commit.linesAdded;
      totalLinesRemoved += commit.linesRemoved;

      for (const file of commit.files) {
        // Count changes per file for hotspot detection
        const current = fileChangeCounts.get(file.path) || 0;
        fileChangeCounts.set(file.path, current + 1);

        // Count by extension
        const ext = this.getExtension(file.path);
        const extCount = filesByExtension.get(ext) || 0;
        filesByExtension.set(ext, extCount + 1);
      }
    }

    // Find hotspots (files changed 3+ times)
    const hotspots = Array.from(fileChangeCounts.entries())
      .filter(([_, count]) => count >= 3)
      .map(([path, changes]) => ({ path, changes }))
      .sort((a, b) => b.changes - a.changes)
      .slice(0, 10);

    // GAP-01, GAP-02, GAP-03: Commit classification
    const commitTypeBreakdown = this.calculateCommitTypeBreakdown(commits);
    const checkpointCommits = this.countCheckpointCommits(commits);
    const workClassification = this.calculateWorkClassification(commitTypeBreakdown);

    // P3: Commit cadence analysis
    const commitCadence = this.calculateCommitCadence(commits);

    return {
      commits,
      totalLinesAdded,
      totalLinesRemoved,
      filesByExtension,
      hotspots,
      commitTypeBreakdown,
      checkpointCommits,
      workClassification,
      commitCadence,
    };
  }

  /**
   * Get a reasonable default from ref (2 weeks ago or HEAD~100)
   */
  private async getDefaultFromRef(): Promise<string> {
    try {
      // Try to get commits from last 2 weeks
      const twoWeeksAgo = new Date();
      twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
      const dateStr = twoWeeksAgo.toISOString().slice(0, 10);

      const result = execSync(
        `git log --since="${dateStr}" --reverse --format="%H" | head -1`,
        { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], cwd: this.cwd }
      ).trim();

      if (result) {
        return result;
      }
    } catch {
      // Fall through to default
    }

    // Default to last 100 commits
    return 'HEAD~100';
  }

  /**
   * Get commit information between two refs
   */
  private async getCommits(fromRef: string, toRef: string): Promise<CommitInfo[]> {
    const commits: CommitInfo[] = [];

    try {
      // Get commit hashes
      const hashesOutput = execSync(
        `git log ${fromRef}..${toRef} --format="%H"`,
        { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], cwd: this.cwd }
      ).trim();

      if (!hashesOutput) {
        return commits;
      }

      const hashes = hashesOutput.split('\n').filter(Boolean);

      for (const hash of hashes) {
        const commit = await this.getCommitInfo(hash);
        if (commit) {
          commits.push(commit);
        }
      }
    } catch (error) {
      console.error('Error getting commits:', error);
    }

    return commits;
  }

  /**
   * Get detailed info for a single commit
   */
  private async getCommitInfo(hash: string): Promise<CommitInfo | null> {
    try {
      // Get commit metadata
      const formatOutput = execSync(
        `git log -1 --format="%H%n%h%n%an%n%ae%n%aI%n%s%n%b" ${hash}`,
        { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], cwd: this.cwd }
      ).trim();

      const lines = formatOutput.split('\n');

      // Get file stats
      const statsOutput = execSync(
        `git diff-tree --no-commit-id --numstat -r ${hash}`,
        { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], cwd: this.cwd }
      ).trim();

      const files: FileChange[] = [];
      let linesAdded = 0;
      let linesRemoved = 0;

      if (statsOutput) {
        for (const line of statsOutput.split('\n').filter(Boolean)) {
          const [added, removed, path] = line.split('\t');

          // Handle binary files (shows as '-')
          const additions = added === '-' ? 0 : parseInt(added, 10);
          const deletions = removed === '-' ? 0 : parseInt(removed, 10);

          linesAdded += additions;
          linesRemoved += deletions;

          files.push({
            path,
            additions,
            deletions,
            changeType: this.determineChangeType(additions, deletions, path),
          });
        }
      }

      return {
        hash: lines[0],
        shortHash: lines[1],
        author: lines[2],
        email: lines[3],
        date: lines[4],
        subject: lines[5],
        body: lines.slice(6).join('\n'),
        files,
        linesAdded,
        linesRemoved,
      };
    } catch (error) {
      console.error(`Error getting commit info for ${hash}:`, error);
      return null;
    }
  }

  /**
   * Determine the type of change based on additions/deletions
   */
  private determineChangeType(
    additions: number,
    deletions: number,
    _path: string
  ): FileChange['changeType'] {
    if (additions > 0 && deletions === 0) return 'add';
    if (additions === 0 && deletions > 0) return 'delete';
    return 'modify';
  }

  /**
   * Get file extension
   */
  private getExtension(path: string): string {
    const parts = path.split('.');
    return parts.length > 1 ? `.${parts[parts.length - 1]}` : '(none)';
  }

  /**
   * Detect agent-authored commits based on various patterns
   * Returns commits that were authored or co-authored by AI agents
   */
  detectAgentCommits(commits: CommitInfo[]): CommitInfo[] {
    const agentCommits: CommitInfo[] = [];

    for (const commit of commits) {
      if (this.isAgentCommit(commit)) {
        agentCommits.push(commit);
      }
    }

    return agentCommits;
  }

  /**
   * Check if a commit is agent-authored
   */
  /**
   * Categorize a commit message into a type (GAP-01)
   * Follows conventional commits pattern: type(scope): description
   */
  categorizeCommit(message: string): CommitType {
    const lowerMessage = message.toLowerCase().trim();

    // Conventional commit patterns
    const patterns: Array<{ type: CommitType; regex: RegExp }> = [
      { type: 'feat', regex: /^feat(\(.*?\))?[:\s]/i },
      { type: 'fix', regex: /^fix(\(.*?\))?[:\s]/i },
      { type: 'docs', regex: /^docs(\(.*?\))?[:\s]/i },
      { type: 'test', regex: /^test(\(.*?\))?[:\s]/i },
      { type: 'refactor', regex: /^refactor(\(.*?\))?[:\s]/i },
      { type: 'chore', regex: /^chore(\(.*?\))?[:\s]/i },
    ];

    for (const { type, regex } of patterns) {
      if (regex.test(message)) {
        return type;
      }
    }

    // Fallback heuristics based on common patterns
    // Order matters - more specific patterns first
    if (/^test|^spec|add.*test|test.*add/i.test(lowerMessage)) {
      return 'test';
    }
    if (/^add\b|^implement|^create|^new\b/i.test(lowerMessage)) {
      return 'feat';
    }
    if (/^fix\b|^bug\b|^patch|^hotfix/i.test(lowerMessage)) {
      return 'fix';
    }
    if (/^doc|^readme|^update.*doc|^comment/i.test(lowerMessage)) {
      return 'docs';
    }
    if (/^refactor|^clean|^reorganize|^restructure/i.test(lowerMessage)) {
      return 'refactor';
    }
    if (/^chore|^bump|^update.*dep|^upgrade|^config|^ci\b|^build\b/i.test(lowerMessage)) {
      return 'chore';
    }

    return 'other';
  }

  /**
   * Check if a commit is a checkpoint/WIP commit (GAP-02)
   */
  isCheckpointCommit(message: string): boolean {
    const lowerMessage = message.toLowerCase().trim();

    const checkpointPatterns = [
      /^wip\b/i,
      /^wip:/i,
      /\bwip\b$/i,
      /^save\b/i,
      /^tmp\b/i,
      /^temp\b/i,
      /^checkpoint\b/i,
      /^progress\b/i,
      /^work in progress/i,
      /^saving/i,
      /^backup\b/i,
      /^\.\.\.*$/,  // Just dots
      /^x$/i,       // Single letter placeholders
      /^-$/,
      /^\.$/,
    ];

    return checkpointPatterns.some(pattern => pattern.test(lowerMessage));
  }

  /**
   * Calculate commit type breakdown for a set of commits (GAP-01)
   */
  calculateCommitTypeBreakdown(commits: CommitInfo[]): CommitTypeBreakdown {
    const breakdown: CommitTypeBreakdown = {
      feat: 0,
      fix: 0,
      docs: 0,
      test: 0,
      refactor: 0,
      chore: 0,
      other: 0,
    };

    for (const commit of commits) {
      const type = this.categorizeCommit(commit.subject);
      breakdown[type]++;
    }

    return breakdown;
  }

  /**
   * Calculate work classification (proactive vs reactive) (GAP-03)
   */
  calculateWorkClassification(breakdown: CommitTypeBreakdown): WorkClassification {
    const proactive = breakdown.feat + breakdown.docs + breakdown.test;
    const reactive = breakdown.fix + breakdown.refactor + breakdown.chore;
    const total = proactive + reactive;

    return {
      proactive,
      reactive,
      ratio: total > 0 ? proactive / total : 0,
    };
  }

  /**
   * Count checkpoint commits (GAP-02)
   */
  countCheckpointCommits(commits: CommitInfo[]): number {
    return commits.filter(c => this.isCheckpointCommit(c.subject)).length;
  }

  /**
   * Calculate commit cadence metrics (P3)
   * Analyzes timing patterns and frequency of commits
   */
  calculateCommitCadence(commits: CommitInfo[]): CommitCadenceMetrics {
    const defaultMetrics: CommitCadenceMetrics = {
      averageTimeBetweenCommits: 0,
      medianTimeBetweenCommits: 0,
      maxGapDays: 0,
      minGapHours: 0,
      commitsPerDay: 0,
      commitsPerWeek: 0,
      irregularityScore: 0,
      trend: 'stable',
      busiestDay: 'Monday',
      busiestHour: 9,
    };

    if (commits.length < 2) {
      return defaultMetrics;
    }

    // Sort commits by date (oldest first)
    const sortedCommits = [...commits].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    // Calculate time gaps between consecutive commits
    const gaps: number[] = [];
    for (let i = 1; i < sortedCommits.length; i++) {
      const prevTime = new Date(sortedCommits[i - 1].date).getTime();
      const currTime = new Date(sortedCommits[i].date).getTime();
      const gapHours = (currTime - prevTime) / (1000 * 60 * 60);
      gaps.push(gapHours);
    }

    // Calculate average and median gap
    const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    const sortedGaps = [...gaps].sort((a, b) => a - b);
    const medianGap = sortedGaps[Math.floor(sortedGaps.length / 2)];
    const maxGap = Math.max(...gaps);
    const minGap = Math.min(...gaps);

    // Calculate total time span
    const firstCommitTime = new Date(sortedCommits[0].date).getTime();
    const lastCommitTime = new Date(sortedCommits[sortedCommits.length - 1].date).getTime();
    const totalDays = Math.max(1, (lastCommitTime - firstCommitTime) / (1000 * 60 * 60 * 24));

    // Calculate commits per day/week
    const commitsPerDay = commits.length / totalDays;
    const commitsPerWeek = commitsPerDay * 7;

    // Calculate irregularity score (coefficient of variation)
    const mean = avgGap;
    const variance = gaps.reduce((sum, gap) => sum + Math.pow(gap - mean, 2), 0) / gaps.length;
    const stdDev = Math.sqrt(variance);
    const irregularityScore = mean > 0 ? Math.min(1, stdDev / mean) : 0;

    // Determine trend (compare first half vs second half)
    const halfIndex = Math.floor(gaps.length / 2);
    const firstHalfAvg = gaps.slice(0, halfIndex).reduce((a, b) => a + b, 0) / halfIndex || 0;
    const secondHalfAvg = gaps.slice(halfIndex).reduce((a, b) => a + b, 0) / (gaps.length - halfIndex) || 0;

    let trend: 'increasing' | 'stable' | 'decreasing' = 'stable';
    if (secondHalfAvg < firstHalfAvg * 0.7) {
      trend = 'increasing'; // Gaps getting smaller = more commits
    } else if (secondHalfAvg > firstHalfAvg * 1.3) {
      trend = 'decreasing'; // Gaps getting larger = fewer commits
    }

    // Find busiest day and hour
    const dayCount: Record<string, number> = {
      Sunday: 0, Monday: 0, Tuesday: 0, Wednesday: 0,
      Thursday: 0, Friday: 0, Saturday: 0,
    };
    const hourCount: number[] = new Array(24).fill(0);
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    for (const commit of commits) {
      const date = new Date(commit.date);
      dayCount[dayNames[date.getDay()]]++;
      hourCount[date.getHours()]++;
    }

    const busiestDay = Object.entries(dayCount).reduce(
      (max, [day, count]) => count > max.count ? { day, count } : max,
      { day: 'Monday', count: 0 }
    ).day;

    const busiestHour = hourCount.indexOf(Math.max(...hourCount));

    return {
      averageTimeBetweenCommits: Math.round(avgGap * 100) / 100,
      medianTimeBetweenCommits: Math.round(medianGap * 100) / 100,
      maxGapDays: Math.round((maxGap / 24) * 100) / 100,
      minGapHours: Math.round(minGap * 100) / 100,
      commitsPerDay: Math.round(commitsPerDay * 100) / 100,
      commitsPerWeek: Math.round(commitsPerWeek * 100) / 100,
      irregularityScore: Math.round(irregularityScore * 100) / 100,
      trend,
      busiestDay,
      busiestHour,
    };
  }

  private isAgentCommit(commit: CommitInfo): boolean {
    // Check email patterns
    const botEmailPatterns = [
      /@bot\./i,
      /-bot@/i,
      /noreply@anthropic\.com/i,
      /github-actions/i,
      /dependabot/i,
      /renovate/i,
      /snyk-bot/i,
      /\[bot\]@/i,
    ];

    for (const pattern of botEmailPatterns) {
      if (pattern.test(commit.email)) {
        return true;
      }
    }

    // Check author name patterns
    const botAuthorPatterns = [
      /\[bot\]$/i,
      /^Claude\b/i,
      /^Copilot\b/i,
      /^dependabot/i,
      /^renovate/i,
      /^github-actions/i,
    ];

    for (const pattern of botAuthorPatterns) {
      if (pattern.test(commit.author)) {
        return true;
      }
    }

    // Check commit message/body for co-authorship
    const fullMessage = `${commit.subject}\n${commit.body}`;
    const coAuthorPatterns = [
      /Co-authored-by:\s*Claude/i,
      /Co-authored-by:\s*GitHub Copilot/i,
      /Co-authored-by:.*@anthropic\.com/i,
      /Co-authored-by:.*\[bot\]/i,
    ];

    for (const pattern of coAuthorPatterns) {
      if (pattern.test(fullMessage)) {
        return true;
      }
    }

    // Check for agent session trailers
    const trailerPatterns = [
      /Agent-Session:/i,
      /Daax-Session:/i,
      /Claude-Session:/i,
      /AI-Assisted:/i,
    ];

    for (const pattern of trailerPatterns) {
      if (pattern.test(fullMessage)) {
        return true;
      }
    }

    return false;
  }
}
