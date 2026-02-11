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

export interface PRBottleneck {
  pr: PRInfo;
  issue: 'slow_merge' | 'high_revisions' | 'stale';
  metric: number; // hours for slow_merge, revision count for high_revisions, days for stale
}

export interface GitHubAnalysisResult {
  available: boolean;
  prs: PRInfo[];
  totalPRs: number;
  mergedPRs: number;
  avgReviewTime: number | null;
  avgCommentsPerPR: number;
  prsByAuthor: Map<string, number>;
  bottlenecks: PRBottleneck[];
  reviewStats: {
    totalReviews: number;
    totalComments: number;
    avgReviewsPerPR: number;
    avgCommitsPerPR: number;
  };
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
        bottlenecks: [],
        reviewStats: { totalReviews: 0, totalComments: 0, avgReviewsPerPR: 0, avgCommitsPerPR: 0 },
      };
    }

    const prs = await this.getPRs(since);

    // Fetch detailed review data for each PR (limit to first 20 to avoid rate limits)
    const prsWithDetails = await Promise.all(
      prs.slice(0, 20).map(pr => this.enrichPRWithReviewData(pr))
    );
    // Add back any PRs beyond the first 20 without enrichment
    const allPRs = [...prsWithDetails, ...prs.slice(20)];

    const mergedPRs = allPRs.filter(pr => pr.mergedAt);
    const prsByAuthor = new Map<string, number>();

    for (const pr of allPRs) {
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

    const avgCommentsPerPR = allPRs.length > 0
      ? allPRs.reduce((sum, pr) => sum + pr.commentCount, 0) / allPRs.length
      : 0;

    // Calculate review stats
    const totalReviews = allPRs.reduce((sum, pr) => sum + pr.reviewCount, 0);
    const totalComments = allPRs.reduce((sum, pr) => sum + pr.commentCount, 0);
    const totalCommits = allPRs.reduce((sum, pr) => sum + pr.commits, 0);

    const reviewStats = {
      totalReviews,
      totalComments,
      avgReviewsPerPR: allPRs.length > 0 ? totalReviews / allPRs.length : 0,
      avgCommitsPerPR: allPRs.length > 0 ? totalCommits / allPRs.length : 0,
    };

    // Detect bottlenecks
    const bottlenecks = this.detectBottlenecks(allPRs);

    return {
      available: true,
      prs: allPRs,
      totalPRs: allPRs.length,
      mergedPRs: mergedPRs.length,
      avgReviewTime,
      avgCommentsPerPR,
      prsByAuthor,
      bottlenecks,
      reviewStats,
    };
  }

  /**
   * Enrich a PR with actual review and comment data
   */
  private async enrichPRWithReviewData(pr: PRInfo): Promise<PRInfo> {
    try {
      // Fetch reviews for this PR
      const reviewsOutput = execSync(
        `gh pr view ${pr.number} --json reviews,comments,commits`,
        { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
      );

      const data = JSON.parse(reviewsOutput);

      return {
        ...pr,
        reviewCount: data.reviews?.length || 0,
        commentCount: data.comments?.length || 0,
        commits: data.commits?.length || 0,
      };
    } catch {
      // If fetching fails, return original PR with zeros
      return pr;
    }
  }

  /**
   * Detect PR bottlenecks
   * - slow_merge: PRs that took > 48 hours to merge
   * - high_revisions: PRs with > 3 commits (multiple revisions)
   * - stale: Open PRs older than 7 days
   */
  detectBottlenecks(prs: PRInfo[]): PRBottleneck[] {
    const bottlenecks: PRBottleneck[] = [];
    const now = Date.now();

    for (const pr of prs) {
      // Check for slow merge (> 48 hours)
      if (pr.mergedAt) {
        const created = new Date(pr.createdAt).getTime();
        const merged = new Date(pr.mergedAt).getTime();
        const hoursToMerge = (merged - created) / (1000 * 60 * 60);

        if (hoursToMerge > 48) {
          bottlenecks.push({
            pr,
            issue: 'slow_merge',
            metric: Math.round(hoursToMerge),
          });
        }
      }

      // Check for high revisions (> 3 commits often means multiple review cycles)
      if (pr.commits > 3) {
        bottlenecks.push({
          pr,
          issue: 'high_revisions',
          metric: pr.commits,
        });
      }

      // Check for stale PRs (open > 7 days)
      if (pr.state === 'OPEN') {
        const created = new Date(pr.createdAt).getTime();
        const daysOpen = (now - created) / (1000 * 60 * 60 * 24);

        if (daysOpen > 7) {
          bottlenecks.push({
            pr,
            issue: 'stale',
            metric: Math.round(daysOpen),
          });
        }
      }
    }

    return bottlenecks;
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
