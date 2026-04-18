/**
 * GitHub PR and Issue Analyzer
 *
 * Uses gh CLI to fetch PR stats, review comments, and issue data.
 */

import { execSync } from 'child_process';
import type { CIFailureMetrics, PRScopeAnalysis } from '../types.js';

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
  body?: string; // GAP-05: for supersession detection
  files?: string[]; // GAP-06: file paths
  reviews?: Array<{ state: string; author: string }>; // GAP-07: review states
}

export interface PRBottleneck {
  pr: PRInfo;
  issue: 'slow_merge' | 'high_revisions' | 'stale';
  metric: number; // hours for slow_merge, revision count for high_revisions, days for stale
}

// GAP-05: Supersession tracking
export interface PRSupersession {
  prNumber: number;
  supersededBy: number;
  pattern: string;
}

// GAP-06: Test coverage
export interface PRTestCoverageResult {
  prsWithTests: number;
  totalPRs: number;
  coverageRate: number;
  testFilePatterns: string[];
}

// GAP-07: Negative reviews
export interface PRNegativeReviewResult {
  prsWithNegativeReviews: number;
  totalReviewedPRs: number;
  negativeReviewRate: number;
  prsRequestingChanges: Array<{
    prNumber: number;
    title: string;
    reviewCount: number;
  }>;
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
  // GAP-05, 06, 07 additions
  supersessionAnalysis?: {
    supersededPRs: PRSupersession[];
    supersessionRate: number;
    chains: number[][];
  };
  testCoverage?: PRTestCoverageResult;
  negativeReviews?: PRNegativeReviewResult;
  // P3 additions
  ciFailureMetrics?: CIFailureMetrics;
  scopeAnalysis?: PRScopeAnalysis;
}

export class GitHubAnalyzer {
  private cwd: string;

  constructor(cwd: string = process.cwd()) {
    this.cwd = cwd;
  }

  /**
   * Check if gh CLI is available and authenticated
   */
  isAvailable(): boolean {
    try {
      execSync('gh auth status', { stdio: 'pipe', cwd: this.cwd });
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

    // GAP-05, 06, 07: Additional analysis
    const supersessionAnalysis = this.detectSupersession(allPRs);
    const testCoverage = this.analyzeTestCoverage(allPRs);
    const negativeReviews = this.analyzeNegativeReviews(allPRs);

    // P3: CI failure rate and PR scope analysis
    const ciFailureMetrics = this.analyzeCIFailureRate();
    const scopeAnalysis = this.analyzePRScope(allPRs);

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
      supersessionAnalysis,
      testCoverage,
      negativeReviews,
      ciFailureMetrics,
      scopeAnalysis,
    };
  }

  /**
   * Enrich a PR with actual review and comment data
   */
  private async enrichPRWithReviewData(pr: PRInfo): Promise<PRInfo> {
    try {
      // Fetch reviews, comments, commits, files, and body for this PR
      const reviewsOutput = execSync(
        `gh pr view ${pr.number} --json reviews,comments,commits,files,body`,
        { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], cwd: this.cwd }
      );

      const data = JSON.parse(reviewsOutput);

      return {
        ...pr,
        reviewCount: data.reviews?.length || 0,
        commentCount: data.comments?.length || 0,
        commits: data.commits?.length || 0,
        body: data.body || '',
        files: data.files?.map((f: { path: string }) => f.path) || [],
        reviews: data.reviews?.map((r: { state: string; author: { login: string } }) => ({
          state: r.state,
          author: r.author?.login || 'unknown',
        })) || [],
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

  /**
   * Detect PR supersession patterns (GAP-05)
   * Looks for: "Supersedes #X", "Replaces #X", "v2/v3" in title
   */
  detectSupersession(prs: PRInfo[]): {
    supersededPRs: PRSupersession[];
    supersessionRate: number;
    chains: number[][];
  } {
    const supersededPRs: PRSupersession[] = [];
    const supersessionPatterns = [
      { regex: /supersedes?\s*#?(\d+)/i, name: 'Supersedes' },
      { regex: /replaces?\s*#?(\d+)/i, name: 'Replaces' },
      { regex: /closes?\s*#?(\d+)/i, name: 'Closes' },
      { regex: /instead\s*of\s*#?(\d+)/i, name: 'Instead of' },
    ];

    const prNumbers = new Set(prs.map(pr => pr.number));

    for (const pr of prs) {
      const textToSearch = `${pr.title} ${pr.body || ''}`;

      // Check for explicit supersession patterns
      for (const { regex, name } of supersessionPatterns) {
        const match = textToSearch.match(regex);
        if (match) {
          const supersededNumber = parseInt(match[1], 10);
          // Only count if the referenced PR exists in our set
          if (prNumbers.has(supersededNumber)) {
            supersededPRs.push({
              prNumber: supersededNumber,
              supersededBy: pr.number,
              pattern: name,
            });
          }
        }
      }

      // Check for v2/v3 pattern in title
      const versionMatch = pr.title.match(/\b(?:v(\d+)|version\s*(\d+))\b/i);
      if (versionMatch) {
        const version = parseInt(versionMatch[1] || versionMatch[2], 10);
        if (version > 1) {
          // Look for earlier PRs with similar title (without version)
          const baseTitle = pr.title.replace(/\s*\bv\d+\b|\bversion\s*\d+\b/gi, '').trim().toLowerCase();
          for (const otherPR of prs) {
            if (otherPR.number < pr.number) {
              const otherBaseTitle = otherPR.title.replace(/\s*\bv\d+\b|\bversion\s*\d+\b/gi, '').trim().toLowerCase();
              if (baseTitle === otherBaseTitle || baseTitle.includes(otherBaseTitle) || otherBaseTitle.includes(baseTitle)) {
                supersededPRs.push({
                  prNumber: otherPR.number,
                  supersededBy: pr.number,
                  pattern: `v${version}`,
                });
                break;
              }
            }
          }
        }
      }
    }

    // Build chains
    const chains: number[][] = [];
    const visited = new Set<number>();

    for (const supersession of supersededPRs) {
      if (visited.has(supersession.prNumber)) continue;

      const chain: number[] = [supersession.prNumber];
      let current = supersession.supersededBy;

      while (current) {
        chain.push(current);
        visited.add(current);
        const nextSupersession = supersededPRs.find(s => s.prNumber === current);
        current = nextSupersession?.supersededBy ?? 0;
      }

      if (chain.length > 1) {
        chains.push(chain);
      }
    }

    const supersessionRate = prs.length > 0
      ? Math.round((supersededPRs.length / prs.length) * 100)
      : 0;

    return {
      supersededPRs,
      supersessionRate,
      chains,
    };
  }

  /**
   * Detect test files in PRs (GAP-06)
   */
  analyzeTestCoverage(prs: PRInfo[]): PRTestCoverageResult {
    const testFilePatterns = [
      /\.test\.[jt]sx?$/,
      /\.spec\.[jt]sx?$/,
      /_test\.go$/,
      /test_.*\.py$/,
      /.*_test\.py$/,
      /^test\//,
      /^tests\//,
      /__tests__\//,
    ];

    let prsWithTests = 0;
    const patternCounts = new Map<string, number>();

    for (const pr of prs) {
      if (!pr.files || pr.files.length === 0) continue;

      let hasTestFile = false;
      for (const file of pr.files) {
        for (const pattern of testFilePatterns) {
          if (pattern.test(file)) {
            hasTestFile = true;
            const patternStr = pattern.source;
            patternCounts.set(patternStr, (patternCounts.get(patternStr) || 0) + 1);
          }
        }
      }

      if (hasTestFile) {
        prsWithTests++;
      }
    }

    const prsWithFiles = prs.filter(pr => pr.files && pr.files.length > 0).length;
    const coverageRate = prsWithFiles > 0
      ? Math.round((prsWithTests / prsWithFiles) * 100)
      : 0;

    const testFilePatternsList = Array.from(patternCounts.keys());

    return {
      prsWithTests,
      totalPRs: prsWithFiles,
      coverageRate,
      testFilePatterns: testFilePatternsList,
    };
  }

  /**
   * Analyze negative reviews (CHANGES_REQUESTED) (GAP-07)
   */
  analyzeNegativeReviews(prs: PRInfo[]): PRNegativeReviewResult {
    const prsRequestingChanges: Array<{
      prNumber: number;
      title: string;
      reviewCount: number;
    }> = [];

    let prsWithNegativeReviews = 0;
    let totalReviewedPRs = 0;

    for (const pr of prs) {
      if (!pr.reviews || pr.reviews.length === 0) continue;
      totalReviewedPRs++;

      const negativeReviews = pr.reviews.filter(
        r => r.state === 'CHANGES_REQUESTED' || r.state === 'REQUEST_CHANGES'
      );

      if (negativeReviews.length > 0) {
        prsWithNegativeReviews++;
        prsRequestingChanges.push({
          prNumber: pr.number,
          title: pr.title,
          reviewCount: negativeReviews.length,
        });
      }
    }

    const negativeReviewRate = totalReviewedPRs > 0
      ? Math.round((prsWithNegativeReviews / totalReviewedPRs) * 100)
      : 0;

    return {
      prsWithNegativeReviews,
      totalReviewedPRs,
      negativeReviewRate,
      prsRequestingChanges: prsRequestingChanges.sort((a, b) => b.reviewCount - a.reviewCount),
    };
  }

  /**
   * Analyze CI/workflow failure rate (P3)
   * Uses gh run list to get recent workflow runs
   */
  analyzeCIFailureRate(): CIFailureMetrics | undefined {
    try {
      const output = execSync(
        'gh run list --limit 100 --json status,conclusion,name,createdAt,databaseId,headBranch',
        { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], cwd: this.cwd }
      );

      const runs = JSON.parse(output);

      if (!runs || runs.length === 0) {
        return undefined;
      }

      let successfulRuns = 0;
      let failedRuns = 0;
      let cancelledRuns = 0;
      const workflowStats = new Map<string, { runs: number; failures: number }>();
      const recentFailures: CIFailureMetrics['recentFailures'] = [];

      for (const run of runs) {
        const workflow = run.name || 'unknown';
        const stats = workflowStats.get(workflow) || { runs: 0, failures: 0 };
        stats.runs++;

        if (run.conclusion === 'success') {
          successfulRuns++;
        } else if (run.conclusion === 'failure') {
          failedRuns++;
          stats.failures++;
          if (recentFailures.length < 5) {
            recentFailures.push({
              workflow,
              branch: run.headBranch || 'unknown',
              conclusion: run.conclusion,
              createdAt: run.createdAt,
            });
          }
        } else if (run.conclusion === 'cancelled') {
          cancelledRuns++;
        }

        workflowStats.set(workflow, stats);
      }

      const totalRuns = runs.length;
      const failureRate = totalRuns > 0 ? Math.round((failedRuns / totalRuns) * 100) : 0;
      const successRate = totalRuns > 0 ? Math.round((successfulRuns / totalRuns) * 100) : 0;

      const byWorkflow = Array.from(workflowStats.entries())
        .map(([workflow, stats]) => ({
          workflow,
          runs: stats.runs,
          failures: stats.failures,
          failureRate: stats.runs > 0 ? Math.round((stats.failures / stats.runs) * 100) : 0,
        }))
        .sort((a, b) => b.failureRate - a.failureRate);

      return {
        totalRuns,
        successfulRuns,
        failedRuns,
        cancelledRuns,
        failureRate,
        successRate,
        avgDurationSeconds: null, // gh run list doesn't provide duration
        byWorkflow,
        recentFailures,
      };
    } catch {
      // gh run list may not be available or may fail
      return undefined;
    }
  }

  /**
   * Analyze PR scope/size for scope creep detection (P3)
   */
  analyzePRScope(prs: PRInfo[]): PRScopeAnalysis | undefined {
    if (prs.length === 0) {
      return undefined;
    }

    // Calculate lines changed for each PR
    const prSizes = prs.map(pr => ({
      pr,
      linesChanged: pr.additions + pr.deletions,
      filesChanged: pr.changedFiles,
    }));

    const linesChangedValues = prSizes.map(p => p.linesChanged).sort((a, b) => a - b);
    const filesChangedValues = prSizes.map(p => p.filesChanged).sort((a, b) => a - b);

    // Calculate statistics
    const totalLines = linesChangedValues.reduce((a, b) => a + b, 0);
    const avgLines = totalLines / linesChangedValues.length;
    const medianLines = linesChangedValues[Math.floor(linesChangedValues.length / 2)];
    const maxLines = linesChangedValues[linesChangedValues.length - 1];
    const minLines = linesChangedValues[0];

    const totalFiles = filesChangedValues.reduce((a, b) => a + b, 0);
    const avgFiles = totalFiles / filesChangedValues.length;

    // Calculate 90th percentile as "large PR" threshold
    const percentile90Index = Math.floor(linesChangedValues.length * 0.9);
    const largePRThreshold = Math.max(500, linesChangedValues[percentile90Index] || 500);

    // Identify large PRs
    const largePRs: PRScopeAnalysis['largePRs'] = prSizes
      .filter(p => p.linesChanged >= largePRThreshold)
      .map(p => {
        let concernLevel: 'critical' | 'high' | 'medium' = 'medium';
        if (p.linesChanged >= largePRThreshold * 2) {
          concernLevel = 'critical';
        } else if (p.linesChanged >= largePRThreshold * 1.5) {
          concernLevel = 'high';
        }
        return {
          prNumber: p.pr.number,
          title: p.pr.title,
          linesChanged: p.linesChanged,
          filesChanged: p.filesChanged,
          concernLevel,
        };
      })
      .sort((a, b) => b.linesChanged - a.linesChanged)
      .slice(0, 10); // Top 10 largest

    const scopeCreepRate = prs.length > 0
      ? Math.round((largePRs.length / prs.length) * 100)
      : 0;

    return {
      averageLinesChanged: Math.round(avgLines),
      medianLinesChanged: medianLines,
      maxLinesChanged: maxLines,
      minLinesChanged: minLines,
      averageFilesChanged: Math.round(avgFiles * 10) / 10,
      largePRThreshold,
      largePRs,
      scopeCreepRate,
    };
  }

  private async getPRs(since?: string): Promise<PRInfo[]> {
    try {
      const sinceArg = since ? `--search "created:>=${since}"` : '';
      const output = execSync(
        `gh pr list --state all --limit 50 ${sinceArg} --json number,title,author,state,createdAt,mergedAt,additions,deletions,changedFiles,labels`,
        { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], cwd: this.cwd }
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
