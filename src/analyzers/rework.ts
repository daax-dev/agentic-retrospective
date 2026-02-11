/**
 * Rework chain analyzer for the Agentic Retrospective
 * Detects fix commits that reference or follow earlier commits
 */

import type { CommitInfo } from '../types.js';

export interface ReworkChain {
  originalCommit: CommitInfo;
  fixCommits: CommitInfo[];
  filesAffected: string[];
  totalReworkLines: number;
  timeToFix: number; // hours
}

export interface ReworkAnalysisResult {
  chains: ReworkChain[];
  totalReworkCommits: number;
  reworkPercentage: number;
  totalReworkLines: number;
  filesWithMostRework: Array<{ path: string; reworkCount: number }>;
  avgTimeToFix: number | null;
}

export class ReworkAnalyzer {
  /**
   * Detect rework chains from commit history
   */
  detectReworkChains(commits: CommitInfo[]): ReworkAnalysisResult {
    if (commits.length === 0) {
      return {
        chains: [],
        totalReworkCommits: 0,
        reworkPercentage: 0,
        totalReworkLines: 0,
        filesWithMostRework: [],
        avgTimeToFix: null,
      };
    }

    const chains: ReworkChain[] = [];
    const fixCommitHashes = new Set<string>();
    const fileReworkCount = new Map<string, number>();

    // Sort commits by date (oldest first)
    const sortedCommits = [...commits].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    // Look for fix commits and their original commits
    for (let i = 0; i < sortedCommits.length; i++) {
      const commit = sortedCommits[i];

      // Skip if already identified as a fix commit
      if (fixCommitHashes.has(commit.hash)) continue;

      // Check if this is a fix commit
      if (!this.isFixCommit(commit)) continue;

      // Try to find the original commit being fixed
      const originalCommit = this.findOriginalCommit(commit, sortedCommits.slice(0, i));

      if (originalCommit) {
        // Check if there's already a chain for this original
        const existingChain = chains.find(c => c.originalCommit.hash === originalCommit.hash);

        if (existingChain) {
          existingChain.fixCommits.push(commit);
          existingChain.totalReworkLines += commit.linesAdded + commit.linesRemoved;

          // Add affected files
          for (const file of commit.files) {
            if (!existingChain.filesAffected.includes(file.path)) {
              existingChain.filesAffected.push(file.path);
            }
          }
        } else {
          const filesAffected = [
            ...new Set([
              ...originalCommit.files.map(f => f.path),
              ...commit.files.map(f => f.path),
            ]),
          ];

          const timeToFix = (
            new Date(commit.date).getTime() - new Date(originalCommit.date).getTime()
          ) / (1000 * 60 * 60); // hours

          chains.push({
            originalCommit,
            fixCommits: [commit],
            filesAffected,
            totalReworkLines: commit.linesAdded + commit.linesRemoved,
            timeToFix,
          });
        }

        fixCommitHashes.add(commit.hash);

        // Track file rework counts
        for (const file of commit.files) {
          const count = fileReworkCount.get(file.path) || 0;
          fileReworkCount.set(file.path, count + 1);
        }
      }
    }

    // Calculate summary stats
    const totalReworkCommits = chains.reduce((sum, c) => sum + c.fixCommits.length, 0);
    const reworkPercentage = (totalReworkCommits / commits.length) * 100;
    const totalReworkLines = chains.reduce((sum, c) => sum + c.totalReworkLines, 0);

    const filesWithMostRework = Array.from(fileReworkCount.entries())
      .map(([path, reworkCount]) => ({ path, reworkCount }))
      .sort((a, b) => b.reworkCount - a.reworkCount)
      .slice(0, 5);

    const avgTimeToFix = chains.length > 0
      ? chains.reduce((sum, c) => sum + c.timeToFix, 0) / chains.length
      : null;

    return {
      chains,
      totalReworkCommits,
      reworkPercentage,
      totalReworkLines,
      filesWithMostRework,
      avgTimeToFix,
    };
  }

  /**
   * Check if a commit is a fix/rework commit
   */
  private isFixCommit(commit: CommitInfo): boolean {
    const subject = commit.subject.toLowerCase();
    const body = (commit.body || '').toLowerCase();
    const fullMessage = `${subject} ${body}`;

    // Common fix patterns
    const fixPatterns = [
      /^fix\b/i,
      /^fix:/i,
      /^fixup\b/i,
      /^hotfix\b/i,
      /\bfix\s+(bug|issue|error|typo)\b/i,
      /^revert\b/i,
      /^wip\b/i,
      /^amend\b/i,
      /\bquick fix\b/i,
      /\bpatch\b/i,
      /\bcorrect\b/i,
      /\boops\b/i,
      /\bforgot\b/i,
      /\bmissed\b/i,
    ];

    for (const pattern of fixPatterns) {
      if (pattern.test(fullMessage)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Find the original commit that a fix commit is addressing
   */
  private findOriginalCommit(
    fixCommit: CommitInfo,
    priorCommits: CommitInfo[]
  ): CommitInfo | null {
    // Check for explicit reference in message
    const explicitRef = this.findExplicitReference(fixCommit);
    if (explicitRef) {
      const match = priorCommits.find(c =>
        c.hash.startsWith(explicitRef) || c.shortHash === explicitRef
      );
      if (match) return match;
    }

    // Look for file overlap within 48 hours
    const fixFiles = new Set(fixCommit.files.map(f => f.path));
    const fixTime = new Date(fixCommit.date).getTime();

    for (let i = priorCommits.length - 1; i >= 0; i--) {
      const candidate = priorCommits[i];
      const candidateTime = new Date(candidate.date).getTime();
      const hoursDiff = (fixTime - candidateTime) / (1000 * 60 * 60);

      // Only consider commits within 48 hours
      if (hoursDiff > 48) continue;

      // Don't match with other fix commits
      if (this.isFixCommit(candidate)) continue;

      // Calculate file overlap
      const candidateFiles = new Set(candidate.files.map(f => f.path));
      const overlap = [...fixFiles].filter(f => candidateFiles.has(f)).length;
      const overlapPct = overlap / Math.max(fixFiles.size, 1);

      // If >50% file overlap, consider this the original
      if (overlapPct > 0.5) {
        return candidate;
      }
    }

    return null;
  }

  /**
   * Find explicit commit reference in message
   */
  private findExplicitReference(commit: CommitInfo): string | null {
    const fullMessage = `${commit.subject} ${commit.body || ''}`;

    // Match patterns like "fixes abc123", "reverts abc123", "fix for abc123"
    const patterns = [
      /(?:fixes?|reverts?|undoes?|addresses|for)\s+([a-f0-9]{7,40})/i,
      /\(([a-f0-9]{7,40})\)/,  // (abc1234)
      /#([a-f0-9]{7,40})/,     // #abc1234
    ];

    for (const pattern of patterns) {
      const match = fullMessage.match(pattern);
      if (match) {
        return match[1];
      }
    }

    return null;
  }

  /**
   * Get summary for reporting
   */
  getSummary(commits: CommitInfo[]): {
    hasRework: boolean;
    reworkCommits: number;
    reworkPercentage: number;
    reworkLines: number;
    avgTimeToFix: string;
    topFiles: string[];
  } {
    const result = this.detectReworkChains(commits);

    return {
      hasRework: result.chains.length > 0,
      reworkCommits: result.totalReworkCommits,
      reworkPercentage: Math.round(result.reworkPercentage),
      reworkLines: result.totalReworkLines,
      avgTimeToFix: result.avgTimeToFix !== null
        ? `${result.avgTimeToFix.toFixed(1)} hours`
        : 'N/A',
      topFiles: result.filesWithMostRework.map(f => f.path),
    };
  }
}
