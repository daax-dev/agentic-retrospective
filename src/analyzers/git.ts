/**
 * Git repository analyzer for the Agentic Retrospective
 */

import { execSync } from 'child_process';
import type { CommitInfo, FileChange, CommitType, CommitTypeBreakdown, WorkClassification } from '../types.js';

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
}

export class GitAnalyzer {
  /**
   * Check if current directory is a git repository
   */
  async isGitRepository(): Promise<boolean> {
    try {
      execSync('git rev-parse --git-dir', { stdio: 'pipe' });
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

    return {
      commits,
      totalLinesAdded,
      totalLinesRemoved,
      filesByExtension,
      hotspots,
      commitTypeBreakdown,
      checkpointCommits,
      workClassification,
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
        { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
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
        { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
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
        { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
      ).trim();

      const lines = formatOutput.split('\n');

      // Get file stats
      const statsOutput = execSync(
        `git diff-tree --no-commit-id --numstat -r ${hash}`,
        { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
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
