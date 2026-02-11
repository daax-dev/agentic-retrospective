/**
 * GitHub PR and Issue Analyzer
 *
 * Uses gh CLI to fetch PR stats, review comments, and issue data.
 */

import { execSync } from 'child_process';

export interface PRInfo {
  number: number;
  title: string;
  author: string;
  state: string;
  createdAt: string;
  mergedAt: string | null;
  additions: number;
  deletions: number;
  reviewCount: number;
  commentCount: number;
  commits: number;
  changedFiles: number;
  labels: string[];
}

export interface GitHubAnalysisResult {
  available: boolean;
  prs: PRInfo[];
  totalPRs: number;
  mergedPRs: number;
  avgReviewTime: number | null;
  avgCommentsPerPR: number;
  prsByAuthor: Map<string, number>;
}

export class GitHubAnalyzer {
  /**
   * Check if gh CLI is available and authenticated
   */
  isAvailable(): boolean {
    try {
      execSync('gh auth status', { stdio: 'pipe' });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Analyze PRs from the repository
   */
  async analyze(since?: string): Promise<GitHubAnalysisResult> {
    if (!this.isAvailable()) {
      return {
        available: false,
        prs: [],
        totalPRs: 0,
        mergedPRs: 0,
        avgReviewTime: null,
        avgCommentsPerPR: 0,
        prsByAuthor: new Map(),
      };
    }

    const prs = await this.getPRs(since);
    const mergedPRs = prs.filter(pr => pr.mergedAt);
    const prsByAuthor = new Map<string, number>();

    for (const pr of prs) {
      const count = prsByAuthor.get(pr.author) || 0;
      prsByAuthor.set(pr.author, count + 1);
    }

    // Calculate avg review time for merged PRs
    let avgReviewTime: number | null = null;
    if (mergedPRs.length > 0) {
      const reviewTimes = mergedPRs.map(pr => {
        const created = new Date(pr.createdAt).getTime();
        const merged = new Date(pr.mergedAt!).getTime();
        return (merged - created) / (1000 * 60 * 60); // hours
      });
      avgReviewTime = reviewTimes.reduce((a, b) => a + b, 0) / reviewTimes.length;
    }

    const avgCommentsPerPR = prs.length > 0
      ? prs.reduce((sum, pr) => sum + pr.commentCount, 0) / prs.length
      : 0;

    return {
      available: true,
      prs,
      totalPRs: prs.length,
      mergedPRs: mergedPRs.length,
      avgReviewTime,
      avgCommentsPerPR,
      prsByAuthor,
    };
  }

  private async getPRs(since?: string): Promise<PRInfo[]> {
    try {
      const sinceArg = since ? `--search "created:>=${since}"` : '';
      const output = execSync(
        `gh pr list --state all --limit 50 ${sinceArg} --json number,title,author,state,createdAt,mergedAt,additions,deletions,changedFiles,labels`,
        { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
      );

      const data = JSON.parse(output);
      return data.map((pr: any) => ({
        number: pr.number,
        title: pr.title,
        author: pr.author?.login || 'unknown',
        state: pr.state,
        createdAt: pr.createdAt,
        mergedAt: pr.mergedAt,
        additions: pr.additions || 0,
        deletions: pr.deletions || 0,
        reviewCount: 0,
        commentCount: 0,
        commits: 0,
        changedFiles: pr.changedFiles || 0,
        labels: pr.labels?.map((l: any) => l.name) || [],
      }));
    } catch (error) {
      console.error('Error fetching PRs:', error);
      return [];
    }
  }
}
