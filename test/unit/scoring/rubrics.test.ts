/**
 * Unit tests for scoring rubrics
 */

import { describe, test, expect } from 'vitest';
import {
  calculateScore,
  calculatePriorityScore,
  scoreDeliveryPredictability,
  scoreTestLoopCompleteness,
  scoreQualityMaintainability,
  scoreSecurityPosture,
  scoreCollaborationEfficiency,
  scoreDecisionHygiene,
  determineConfidence,
} from '../../../src/scoring/rubrics.js';
import type { ActionItem } from '../../../src/types.js';

describe('Scoring Rubrics', () => {
  describe('calculateScore', () => {
    test('creates Score object with all fields', () => {
      const score = calculateScore(4, 'high', ['evidence 1', 'evidence 2'], 'details');

      expect(score.score).toBe(4);
      expect(score.confidence).toBe('high');
      expect(score.evidence).toEqual(['evidence 1', 'evidence 2']);
      expect(score.details).toBe('details');
    });

    test('handles null score', () => {
      const score = calculateScore(null, 'none', []);

      expect(score.score).toBeNull();
      expect(score.confidence).toBe('none');
    });
  });

  describe('calculatePriorityScore', () => {
    test('calculates priority based on impact and risk_reduction', () => {
      const item: ActionItem = {
        id: '1',
        priority: 'must_do',
        action: 'Test',
        rationale: 'Test',
        owner: null,
        success_metric: 'Test',
        effort: 2,
        impact: 4,
        risk_reduction: 3,
      };

      const score = calculatePriorityScore(item);

      // (4 + 3) / 2 = 3.5
      expect(score).toBe(3.5);
    });

    test('prevents division by zero with effort = 0', () => {
      const item: ActionItem = {
        id: '1',
        priority: 'must_do',
        action: 'Test',
        rationale: 'Test',
        owner: null,
        success_metric: 'Test',
        effort: 0,
        impact: 4,
        risk_reduction: 3,
      };

      const score = calculatePriorityScore(item);

      // (4 + 3) / 1 = 7 (uses 1 as minimum)
      expect(score).toBe(7);
    });
  });

  describe('scoreDeliveryPredictability', () => {
    test('returns 5 for small commits (avg < 50 lines)', () => {
      const score = scoreDeliveryPredictability({
        commitCount: 20,
        avgCommitSize: 30,
        scopeDriftIncidents: 0,
      });

      expect(score.score).toBe(5);
      expect(score.confidence).toBe('high');
      expect(score.evidence.some(e => e.includes('Small commits'))).toBe(true);
    });

    test('returns 4 for reasonable commits (avg 50-100 lines)', () => {
      const score = scoreDeliveryPredictability({
        commitCount: 20,
        avgCommitSize: 75,
        scopeDriftIncidents: 0,
      });

      expect(score.score).toBe(4);
    });

    test('returns 3 for medium commits (avg 100-200 lines)', () => {
      const score = scoreDeliveryPredictability({
        commitCount: 20,
        avgCommitSize: 150,
        scopeDriftIncidents: 0,
      });

      expect(score.score).toBe(3);
    });

    test('returns 1 for huge commits (avg > 200 lines)', () => {
      const score = scoreDeliveryPredictability({
        commitCount: 5,
        avgCommitSize: 600,
        scopeDriftIncidents: 0,
      });

      expect(score.score).toBe(1);
    });

    test('returns null when no commits', () => {
      const score = scoreDeliveryPredictability({
        commitCount: 0,
        avgCommitSize: 0,
        scopeDriftIncidents: 0,
      });

      expect(score.score).toBeNull();
      expect(score.confidence).toBe('none');
    });

    test('penalizes scope drift', () => {
      const withoutDrift = scoreDeliveryPredictability({
        commitCount: 20,
        avgCommitSize: 30,
        scopeDriftIncidents: 0,
      });

      const withDrift = scoreDeliveryPredictability({
        commitCount: 20,
        avgCommitSize: 30,
        scopeDriftIncidents: 3,
      });

      expect(withDrift.score).toBeLessThan(withoutDrift.score!);
      expect(withDrift.evidence.some(e => e.includes('scope drift'))).toBe(true);
    });
  });

  describe('scoreTestLoopCompleteness', () => {
    test('returns null when no test data and no test commits', () => {
      const score = scoreTestLoopCompleteness({
        hasTestResults: false,
        testRelatedCommits: 0,
      });

      expect(score.score).toBeNull();
      expect(score.confidence).toBe('none');
    });

    test('returns 3 with low confidence when only test commits detected', () => {
      const score = scoreTestLoopCompleteness({
        hasTestResults: false,
        testRelatedCommits: 5,
      });

      expect(score.score).toBe(3);
      expect(score.confidence).toBe('low');
      expect(score.details).toContain('commit messages');
    });

    test('returns 5 for high pass rate (>= 95%)', () => {
      const score = scoreTestLoopCompleteness({
        hasTestResults: true,
        passRate: 98,
        testRelatedCommits: 0,
      });

      expect(score.score).toBe(5);
    });

    test('returns 4 for good pass rate (85-95%)', () => {
      const score = scoreTestLoopCompleteness({
        hasTestResults: true,
        passRate: 90,
        testRelatedCommits: 0,
      });

      expect(score.score).toBe(4);
    });

    test('returns 2 for low pass rate (< 70%)', () => {
      const score = scoreTestLoopCompleteness({
        hasTestResults: true,
        passRate: 60,
        testRelatedCommits: 0,
      });

      expect(score.score).toBe(2);
    });

    test('penalizes high human debug events', () => {
      const score = scoreTestLoopCompleteness({
        hasTestResults: true,
        passRate: 95,
        testRelatedCommits: 0,
        humanDebugEvents: 20,
      });

      expect(score.score).toBeLessThan(5);
      expect(score.evidence.some(e => e.includes('human debug'))).toBe(true);
    });
  });

  describe('scoreQualityMaintainability', () => {
    test('returns null when no commits', () => {
      const score = scoreQualityMaintainability({
        commitCount: 0,
        largeCommitCount: 0,
        docsCommitCount: 0,
        testCommitCount: 0,
      });

      expect(score.score).toBeNull();
      expect(score.confidence).toBe('none');
    });

    test('increases score for test commits', () => {
      const withoutTests = scoreQualityMaintainability({
        commitCount: 20,
        largeCommitCount: 0,
        docsCommitCount: 0,
        testCommitCount: 0,
      });

      const withTests = scoreQualityMaintainability({
        commitCount: 20,
        largeCommitCount: 0,
        docsCommitCount: 0,
        testCommitCount: 5,
      });

      expect(withTests.score).toBeGreaterThan(withoutTests.score!);
    });

    test('penalizes high percentage of large commits', () => {
      const fewLarge = scoreQualityMaintainability({
        commitCount: 100,
        largeCommitCount: 2,
        docsCommitCount: 0,
        testCommitCount: 0,
      });

      const manyLarge = scoreQualityMaintainability({
        commitCount: 100,
        largeCommitCount: 40,
        docsCommitCount: 0,
        testCommitCount: 0,
      });

      expect(manyLarge.score).toBeLessThan(fewLarge.score!);
    });
  });

  describe('scoreSecurityPosture', () => {
    test('returns null when no security scans', () => {
      const score = scoreSecurityPosture({
        hasSecurityScans: false,
      });

      expect(score.score).toBeNull();
      expect(score.confidence).toBe('none');
    });

    test('returns 5 for no vulnerabilities', () => {
      const score = scoreSecurityPosture({
        hasSecurityScans: true,
        vulnerabilitiesFound: 0,
      });

      expect(score.score).toBe(5);
    });

    test('returns 4 for few vulnerabilities (1-3)', () => {
      const score = scoreSecurityPosture({
        hasSecurityScans: true,
        vulnerabilitiesFound: 2,
      });

      expect(score.score).toBe(4);
    });

    test('reduces score for many vulnerabilities', () => {
      const score = scoreSecurityPosture({
        hasSecurityScans: true,
        vulnerabilitiesFound: 15,
      });

      expect(score.score).toBeLessThan(4);
    });
  });

  describe('scoreCollaborationEfficiency', () => {
    test('returns null when no agent logs', () => {
      const score = scoreCollaborationEfficiency({
        hasAgentLogs: false,
      });

      expect(score.score).toBeNull();
      expect(score.confidence).toBe('none');
    });

    test('penalizes high human interrupts', () => {
      const lowInterrupts = scoreCollaborationEfficiency({
        hasAgentLogs: true,
        humanInterrupts: 3,
      });

      const highInterrupts = scoreCollaborationEfficiency({
        hasAgentLogs: true,
        humanInterrupts: 25,
      });

      expect(highInterrupts.score).toBeLessThan(lowInterrupts.score!);
    });

    test('penalizes scope drift', () => {
      const noDrift = scoreCollaborationEfficiency({
        hasAgentLogs: true,
        scopeDriftIncidents: 0,
      });

      const withDrift = scoreCollaborationEfficiency({
        hasAgentLogs: true,
        scopeDriftIncidents: 5,
      });

      expect(withDrift.score).toBeLessThan(noDrift.score!);
    });
  });

  describe('scoreDecisionHygiene', () => {
    test('returns null when no decision logs', () => {
      const score = scoreDecisionHygiene({
        hasDecisionLogs: false,
      });

      expect(score.score).toBeNull();
      expect(score.confidence).toBe('none');
    });

    test('returns null when totalDecisions is 0', () => {
      const score = scoreDecisionHygiene({
        hasDecisionLogs: true,
        totalDecisions: 0,
      });

      expect(score.score).toBeNull();
    });

    test('returns 5 for 100% escalation rate', () => {
      const score = scoreDecisionHygiene({
        hasDecisionLogs: true,
        totalDecisions: 10,
        oneWayDoorCount: 3,
        escalatedCount: 3,
      });

      expect(score.score).toBe(5);
      expect(score.confidence).toBe('high');
    });

    test('returns 4 for >= 80% escalation rate', () => {
      const score = scoreDecisionHygiene({
        hasDecisionLogs: true,
        totalDecisions: 10,
        oneWayDoorCount: 5,
        escalatedCount: 4,
      });

      expect(score.score).toBe(4);
    });

    test('returns low score for poor escalation rate', () => {
      const score = scoreDecisionHygiene({
        hasDecisionLogs: true,
        totalDecisions: 10,
        oneWayDoorCount: 5,
        escalatedCount: 1,
      });

      expect(score.score).toBeLessThan(3);
    });

    test('penalizes missing rationale', () => {
      const withRationale = scoreDecisionHygiene({
        hasDecisionLogs: true,
        totalDecisions: 10,
        oneWayDoorCount: 3,
        escalatedCount: 3,
        missingRationale: 0,
      });

      const missingRationale = scoreDecisionHygiene({
        hasDecisionLogs: true,
        totalDecisions: 10,
        oneWayDoorCount: 3,
        escalatedCount: 3,
        missingRationale: 8,
      });

      expect(missingRationale.score).toBeLessThan(withRationale.score!);
    });
  });

  describe('determineConfidence', () => {
    test('returns none when no direct evidence', () => {
      const confidence = determineConfidence({
        hasDirectEvidence: false,
        sampleSize: 100,
        dataQuality: 'good',
      });

      expect(confidence).toBe('none');
    });

    test('returns low when inferred data', () => {
      const confidence = determineConfidence({
        hasDirectEvidence: false,
        sampleSize: 100,
        dataQuality: 'inferred',
      });

      expect(confidence).toBe('low');
    });

    test('returns high for large sample with good quality', () => {
      const confidence = determineConfidence({
        hasDirectEvidence: true,
        sampleSize: 50,
        dataQuality: 'good',
      });

      expect(confidence).toBe('high');
    });

    test('returns medium for moderate sample size', () => {
      const confidence = determineConfidence({
        hasDirectEvidence: true,
        sampleSize: 10,
        dataQuality: 'good',
      });

      expect(confidence).toBe('medium');
    });

    test('returns low for small sample size', () => {
      const confidence = determineConfidence({
        hasDirectEvidence: true,
        sampleSize: 3,
        dataQuality: 'good',
      });

      expect(confidence).toBe('low');
    });
  });
});
