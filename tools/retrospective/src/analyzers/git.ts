/**
 * Git repository analyzer for the Agentic Retrospective
 */

import { execSync } from 'child_process';
import type { CommitInfo, FileChange } from '../types.js';

export interface GitAnalysisResult {
  commits: CommitInfo[];
  totalLinesAdded: number;
  totalLinesRemoved: number;
  filesByExtension: Map<string, number>;
  hotspots: Array<{ path: string; changes: number }>;
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

    return {
      commits,
      totalLinesAdded,
      totalLinesRemoved,
      filesByExtension,
      hotspots,
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
}
