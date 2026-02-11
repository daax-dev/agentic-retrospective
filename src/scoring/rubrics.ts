/**
 * Scoring rubrics for the Agentic Retrospective
 *
 * Based on the spec's 0-5 scale scoring system with evidence and confidence
 */

import type { Score, ConfidenceLevel, ActionItem } from '../types.js';

/**
 * Score a dimension with evidence and confidence
 */
export function calculateScore(
  value: number | null,
  confidence: ConfidenceLevel,
  evidence: string[],
  details?: string
): Score {
  return {
    score: value,
    confidence,
    evidence,
    details,
  };
}

/**
 * Calculate priority score for an action item
 *
 * Formula: (impact + risk_reduction + recurrence) / effort
 * Higher score = higher priority
 */
export function calculatePriorityScore(item: ActionItem): number {
  const numerator = item.impact + item.risk_reduction;
  const denominator = item.effort || 1; // Prevent division by zero
  return numerator / denominator;
}

/**
 * Score delivery predictability based on commit patterns
 *
 * 0: Constant churn; no plan-to-ship mapping
 * 5: Tight scope discipline; small, frequent, completed increments
 */
export function scoreDeliveryPredictability(data: {
  commitCount: number;
  avgCommitSize: number;
  scopeDriftIncidents: number;
}): Score {
  const { commitCount, avgCommitSize, scopeDriftIncidents } = data;

  if (commitCount === 0) {
    return calculateScore(null, 'none', ['No commits found']);
  }

  let score = 3; // Default
  const evidence: string[] = [];

  // Score based on commit size
  if (avgCommitSize < 50) {
    score = 5;
    evidence.push(`Small commits (avg ${avgCommitSize} lines)`);
  } else if (avgCommitSize < 100) {
    score = 4;
    evidence.push(`Reasonable commit size (avg ${avgCommitSize} lines)`);
  } else if (avgCommitSize < 200) {
    score = 3;
    evidence.push(`Medium commits (avg ${avgCommitSize} lines)`);
  } else {
    score = Math.max(1, score - 2);
    evidence.push(`Large commits (avg ${avgCommitSize} lines)`);
  }

  // Penalize scope drift
  if (scopeDriftIncidents > 0) {
    score = Math.max(1, score - 1);
    evidence.push(`${scopeDriftIncidents} scope drift incidents`);
  }

  return calculateScore(score, 'high', evidence);
}

/**
 * Score test loop completeness (inner loop health)
 *
 * 0: No runnable tests locally; frequent human debugging
 * 5: Agent can run unit+integration reliably; failures are self-served
 */
export function scoreTestLoopCompleteness(data: {
  hasTestResults: boolean;
  passRate?: number;
  testRelatedCommits: number;
  humanDebugEvents?: number;
}): Score {
  const { hasTestResults, passRate, testRelatedCommits, humanDebugEvents } = data;

  if (!hasTestResults) {
    if (testRelatedCommits > 0) {
      return calculateScore(
        3,
        'low',
        [`Inferred ${testRelatedCommits} test-related commits`],
        'No test result artifacts found - score based on commit messages'
      );
    }
    return calculateScore(null, 'none', [], 'No test data available');
  }

  let score = 4; // Default if we have test results
  const evidence: string[] = [];

  if (passRate !== undefined) {
    if (passRate >= 95) {
      score = 5;
      evidence.push(`${passRate.toFixed(1)}% pass rate`);
    } else if (passRate >= 85) {
      score = 4;
      evidence.push(`${passRate.toFixed(1)}% pass rate`);
    } else if (passRate >= 70) {
      score = 3;
      evidence.push(`${passRate.toFixed(1)}% pass rate`);
    } else {
      score = 2;
      evidence.push(`Low pass rate: ${passRate.toFixed(1)}%`);
    }
  }

  if (humanDebugEvents !== undefined && humanDebugEvents > 5) {
    score = Math.max(1, score - 1);
    evidence.push(`${humanDebugEvents} human debug interventions`);
  }

  return calculateScore(score, 'medium', evidence);
}

/**
 * Score code quality and maintainability
 *
 * 0: Large unreviewed diffs; no docs; rising complexity
 * 5: Small diffs; tests added; docs improved; tech debt reduced
 */
export function scoreQualityMaintainability(data: {
  commitCount: number;
  largeCommitCount: number;
  docsCommitCount: number;
  testCommitCount: number;
}): Score {
  const { commitCount, largeCommitCount, docsCommitCount, testCommitCount } = data;

  if (commitCount === 0) {
    return calculateScore(null, 'none', ['No commits found']);
  }

  let score = 3; // Default
  const evidence: string[] = [];

  // Large commits reduce score
  const largePct = (largeCommitCount / commitCount) * 100;
  if (largePct < 5) {
    score = Math.min(5, score + 1);
  } else if (largePct > 30) {
    score = Math.max(1, score - 1);
    evidence.push(`${largePct.toFixed(0)}% large commits`);
  }

  // Docs and tests improve score
  if (docsCommitCount > 0) {
    evidence.push(`${docsCommitCount} documentation commits`);
  }
  if (testCommitCount > 0) {
    evidence.push(`${testCommitCount} test commits`);
    score = Math.min(5, score + 1);
  }

  return calculateScore(score, 'medium', evidence);
}

/**
 * Score security posture
 *
 * 0: New deps + no scans; boundary changes undocumented
 * 5: Changes evaluated; controls executed; decisions logged; least privilege improved
 */
export function scoreSecurityPosture(data: {
  hasSecurityScans: boolean;
  newDepsCount?: number;
  securityDecisionsLogged?: number;
  vulnerabilitiesFound?: number;
}): Score {
  const { hasSecurityScans, securityDecisionsLogged, vulnerabilitiesFound } = data;

  if (!hasSecurityScans) {
    return calculateScore(null, 'none', [], 'No security scan data available');
  }

  let score = 4; // Default if we have scans
  const evidence: string[] = [];

  evidence.push('Security scans executed');

  if (vulnerabilitiesFound !== undefined) {
    if (vulnerabilitiesFound === 0) {
      score = 5;
      evidence.push('No vulnerabilities found');
    } else if (vulnerabilitiesFound <= 3) {
      score = 4;
      evidence.push(`${vulnerabilitiesFound} vulnerabilities found`);
    } else {
      score = Math.max(2, 4 - Math.floor(vulnerabilitiesFound / 3));
      evidence.push(`${vulnerabilitiesFound} vulnerabilities found`);
    }
  }

  if (securityDecisionsLogged && securityDecisionsLogged > 0) {
    evidence.push(`${securityDecisionsLogged} security decisions logged`);
  }

  return calculateScore(score, 'medium', evidence);
}

/**
 * Score collaboration efficiency
 *
 * 0: Repeated human interrupts; agent asks trivial questions; rework loops
 * 5: Agent handles routine choices; escalates only meaningful decisions
 */
export function scoreCollaborationEfficiency(data: {
  hasAgentLogs: boolean;
  agentCommitCount?: number;
  humanInterrupts?: number;
  scopeDriftIncidents?: number;
  trivialEscalations?: number;
}): Score {
  const { hasAgentLogs, agentCommitCount, humanInterrupts, scopeDriftIncidents } = data;

  if (!hasAgentLogs) {
    return calculateScore(null, 'none', [], 'No agent logs available');
  }

  let score = 4; // Default if we have logs
  const evidence: string[] = [];

  if (agentCommitCount !== undefined) {
    evidence.push(`${agentCommitCount} agent commits`);
  }

  if (humanInterrupts !== undefined) {
    if (humanInterrupts <= 5) {
      evidence.push(`${humanInterrupts} human interrupts (efficient)`);
    } else if (humanInterrupts <= 15) {
      score = Math.max(3, score - 1);
      evidence.push(`${humanInterrupts} human interrupts`);
    } else {
      score = Math.max(2, score - 2);
      evidence.push(`${humanInterrupts} human interrupts (high)`);
    }
  }

  if (scopeDriftIncidents !== undefined && scopeDriftIncidents > 0) {
    score = Math.max(2, score - 1);
    evidence.push(`${scopeDriftIncidents} scope drift incidents`);
  }

  return calculateScore(score, 'medium', evidence);
}

/**
 * Score decision hygiene
 *
 * 0: One-way-door changes unlogged; rationale missing
 * 5: Decisions logged with options, rationale, rollback plan, owners
 */
export function scoreDecisionHygiene(data: {
  hasDecisionLogs: boolean;
  totalDecisions?: number;
  oneWayDoorCount?: number;
  escalatedCount?: number;
  missingRationale?: number;
}): Score {
  const { hasDecisionLogs, totalDecisions, oneWayDoorCount, escalatedCount, missingRationale } = data;

  if (!hasDecisionLogs || totalDecisions === 0) {
    return calculateScore(null, 'none', [], 'No decision logs found');
  }

  let score = 4; // Default if we have logs
  const evidence: string[] = [];

  evidence.push(`${totalDecisions} decisions logged`);

  // Calculate escalation rate
  if (oneWayDoorCount !== undefined && oneWayDoorCount > 0) {
    const escalationRate = ((escalatedCount || 0) / oneWayDoorCount) * 100;

    if (escalationRate === 100) {
      score = 5;
      evidence.push(`${oneWayDoorCount}/${oneWayDoorCount} one-way-doors escalated`);
    } else if (escalationRate >= 80) {
      score = 4;
      evidence.push(`${escalationRate.toFixed(0)}% escalation rate`);
    } else {
      score = Math.max(2, Math.floor(escalationRate / 25));
      evidence.push(`Low escalation rate: ${escalationRate.toFixed(0)}%`);
    }
  }

  // Penalize missing rationale
  if (missingRationale !== undefined && missingRationale > 0) {
    const missingPct = (missingRationale / (totalDecisions || 1)) * 100;
    if (missingPct > 50) {
      score = Math.max(2, score - 1);
      evidence.push(`${missingPct.toFixed(0)}% missing rationale`);
    }
  }

  return calculateScore(score, 'high', evidence);
}

/**
 * Determine confidence level based on data availability
 */
export function determineConfidence(factors: {
  hasDirectEvidence: boolean;
  sampleSize: number;
  dataQuality: 'good' | 'partial' | 'inferred';
}): ConfidenceLevel {
  const { hasDirectEvidence, sampleSize, dataQuality } = factors;

  if (!hasDirectEvidence) {
    return dataQuality === 'inferred' ? 'low' : 'none';
  }

  if (sampleSize >= 20 && dataQuality === 'good') {
    return 'high';
  }

  if (sampleSize >= 5) {
    return 'medium';
  }

  return 'low';
}
