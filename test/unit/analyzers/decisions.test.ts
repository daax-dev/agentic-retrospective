/**
 * Unit tests for DecisionAnalyzer
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { DecisionAnalyzer } from '../../../src/analyzers/decisions.js';
import { getFixturePath, createTempDir, type TempDir } from '../../fixtures/index.js';
import { copyFileSync, mkdirSync } from 'fs';
import { join } from 'path';

describe('DecisionAnalyzer', () => {
  let tempDir: TempDir;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    tempDir.cleanup();
  });

  describe('analyze', () => {
    test('returns empty result for non-existent directory', () => {
      const analyzer = new DecisionAnalyzer('/nonexistent/path');
      const result = analyzer.analyze();

      expect(result.records).toHaveLength(0);
      expect(result.byCategory.size).toBe(0);
      expect(result.byActor.size).toBe(0);
      expect(result.byType.size).toBe(0);
    });

    test('populates byCategory Map correctly with full.jsonl', () => {
      // Copy fixture to temp dir
      const decisionsDir = tempDir.createDir('decisions');
      copyFileSync(
        getFixturePath('decisions/full.jsonl'),
        join(decisionsDir, 'full.jsonl')
      );

      const analyzer = new DecisionAnalyzer(decisionsDir);
      const result = analyzer.analyze();

      expect(result.records).toHaveLength(3);

      // Check categories
      expect(result.byCategory.get('architecture')).toHaveLength(1);
      expect(result.byCategory.get('security')).toHaveLength(1);
      expect(result.byCategory.get('deps')).toHaveLength(1);
    });

    test('populates byActor Map correctly', () => {
      const decisionsDir = tempDir.createDir('decisions');
      copyFileSync(
        getFixturePath('decisions/mixed-actors.jsonl'),
        join(decisionsDir, 'mixed.jsonl')
      );

      const analyzer = new DecisionAnalyzer(decisionsDir);
      const result = analyzer.analyze();

      expect(result.byActor.get('human')).toHaveLength(2);
      expect(result.byActor.get('agent')).toHaveLength(2);
      expect(result.byActor.get('system')).toHaveLength(2);
    });

    test('populates byType Map correctly', () => {
      const decisionsDir = tempDir.createDir('decisions');
      copyFileSync(
        getFixturePath('decisions/mixed-actors.jsonl'),
        join(decisionsDir, 'mixed.jsonl')
      );

      const analyzer = new DecisionAnalyzer(decisionsDir);
      const result = analyzer.analyze();

      expect(result.byType.get('one_way_door')).toHaveLength(2);
      expect(result.byType.get('two_way_door')).toHaveLength(2);
      expect(result.byType.get('reversible')).toHaveLength(2);
    });

    test('identifies one-way and two-way doors', () => {
      const decisionsDir = tempDir.createDir('decisions');
      copyFileSync(
        getFixturePath('decisions/one-way-doors.jsonl'),
        join(decisionsDir, 'owd.jsonl')
      );

      const analyzer = new DecisionAnalyzer(decisionsDir);
      const result = analyzer.analyze();

      expect(result.oneWayDoors).toHaveLength(5);
      expect(result.twoWayDoors).toHaveLength(0);
    });

    test('calculates escalation stats correctly', () => {
      const decisionsDir = tempDir.createDir('decisions');
      copyFileSync(
        getFixturePath('decisions/one-way-doors.jsonl'),
        join(decisionsDir, 'owd.jsonl')
      );

      const analyzer = new DecisionAnalyzer(decisionsDir);
      const result = analyzer.analyze();

      // 5 one-way-doors: 3 by human, 2 by agent
      expect(result.escalationStats.total).toBe(5);
      expect(result.escalationStats.escalated).toBe(3); // Human-made
      expect(result.escalationStats.rate).toBe(60); // 3/5 = 60%
    });

    test('handles malformed JSONL gracefully', () => {
      const decisionsDir = tempDir.createDir('decisions');
      copyFileSync(
        getFixturePath('decisions/malformed.jsonl'),
        join(decisionsDir, 'malformed.jsonl')
      );

      const analyzer = new DecisionAnalyzer(decisionsDir);
      const result = analyzer.analyze();

      // malformed.jsonl has: 2 valid with ts, 1 invalid JSON (skipped), 1 missing ts (invalid)
      expect(result.records).toHaveLength(2); // Only valid records
      expect(result.dataQuality.malformedRecords).toBe(2); // 1 invalid JSON + 1 missing ts
    });

    test('tracks data quality metrics', () => {
      const decisionsDir = tempDir.createDir('decisions');
      copyFileSync(
        getFixturePath('decisions/minimal.jsonl'),
        join(decisionsDir, 'minimal.jsonl')
      );

      const analyzer = new DecisionAnalyzer(decisionsDir);
      const result = analyzer.analyze();

      expect(result.dataQuality.totalRecords).toBe(1);
      expect(result.dataQuality.validRecords).toBe(1);
      // Minimal record is missing category, decision_type, actor, rationale, evidence_refs
      expect(result.dataQuality.missingFields.get('category')).toBe(1);
      expect(result.dataQuality.missingFields.get('decision_type')).toBe(1);
      expect(result.dataQuality.missingFields.get('actor')).toBe(1);
    });
  });

  describe('getMissedEscalations', () => {
    test('returns agent one-way-doors (should have been human)', () => {
      const decisionsDir = tempDir.createDir('decisions');
      copyFileSync(
        getFixturePath('decisions/one-way-doors.jsonl'),
        join(decisionsDir, 'owd.jsonl')
      );

      const analyzer = new DecisionAnalyzer(decisionsDir);
      const missed = analyzer.getMissedEscalations();

      // 2 one-way-doors made by agent
      expect(missed).toHaveLength(2);
      expect(missed.every(d => d.actor === 'agent')).toBe(true);
      expect(missed.every(d => d.decision_type === 'one_way_door')).toBe(true);
    });

    test('returns empty array when all one-way-doors are by humans', () => {
      // Create a custom fixture with only human one-way-doors
      const decisionsDir = tempDir.createDir('decisions');
      tempDir.createFile('decisions/human-only.jsonl',
        '{"ts":"2026-02-01T10:00:00Z","actor":"human","decision_type":"one_way_door","decision":"Test"}\n' +
        '{"ts":"2026-02-02T10:00:00Z","actor":"human","decision_type":"one_way_door","decision":"Test 2"}\n'
      );

      const analyzer = new DecisionAnalyzer(decisionsDir);
      const missed = analyzer.getMissedEscalations();

      expect(missed).toHaveLength(0);
    });
  });

  describe('getTrivialEscalations', () => {
    test('returns human two-way-doors (could have been agent)', () => {
      const decisionsDir = tempDir.createDir('decisions');
      copyFileSync(
        getFixturePath('decisions/mixed-actors.jsonl'),
        join(decisionsDir, 'mixed.jsonl')
      );

      const analyzer = new DecisionAnalyzer(decisionsDir);
      const trivial = analyzer.getTrivialEscalations();

      // mix-002 is human + two_way_door
      expect(trivial).toHaveLength(1);
      expect(trivial[0].actor).toBe('human');
      expect(trivial[0].decision_type).toBe('two_way_door');
    });
  });

  describe('getDecisionThrash', () => {
    test('returns empty array when decisions have no topic overlap', () => {
      const decisionsDir = tempDir.createDir('decisions');
      copyFileSync(
        getFixturePath('decisions/full.jsonl'),
        join(decisionsDir, 'full.jsonl')
      );

      const analyzer = new DecisionAnalyzer(decisionsDir);
      const thrash = analyzer.getDecisionThrash();

      // full.jsonl has 3 different decisions with no topic overlap
      expect(thrash).toEqual([]);
    });

    test('detects thrash when same topic has multiple decisions within 7 days', () => {
      const decisionsDir = tempDir.createDir('decisions');
      // Create decisions that should trigger thrash detection
      // Two decisions about "database" in same category within 7 days
      tempDir.createFile('decisions/thrash.jsonl',
        '{"ts":"2026-02-01T10:00:00Z","decision":"Switch to PostgreSQL database","category":"architecture"}\n' +
        '{"ts":"2026-02-03T10:00:00Z","decision":"Revert to MySQL database instead","category":"architecture"}\n'
      );

      const analyzer = new DecisionAnalyzer(decisionsDir);
      const thrash = analyzer.getDecisionThrash();

      expect(thrash.length).toBeGreaterThan(0);
      expect(thrash[0].decisions.length).toBe(2);
      expect(thrash[0].severity).toBe('medium'); // 2 decisions = medium
    });

    test('sets high severity for 3+ conflicting decisions', () => {
      const decisionsDir = tempDir.createDir('decisions');
      tempDir.createFile('decisions/thrash.jsonl',
        '{"ts":"2026-02-01T10:00:00Z","decision":"Use database migration tool A","category":"deps"}\n' +
        '{"ts":"2026-02-02T10:00:00Z","decision":"Switch to database migration tool B","category":"deps"}\n' +
        '{"ts":"2026-02-04T10:00:00Z","decision":"Actually use database migration tool C","category":"deps"}\n'
      );

      const analyzer = new DecisionAnalyzer(decisionsDir);
      const thrash = analyzer.getDecisionThrash();

      expect(thrash.length).toBeGreaterThan(0);
      // Find the thrash pattern for 'database' keyword
      const dbThrash = thrash.find(t => t.topic.includes('database'));
      expect(dbThrash).toBeDefined();
      expect(dbThrash!.severity).toBe('high'); // 3 decisions = high
    });

    test('ignores decisions more than 7 days apart', () => {
      const decisionsDir = tempDir.createDir('decisions');
      tempDir.createFile('decisions/spread.jsonl',
        '{"ts":"2026-01-01T10:00:00Z","decision":"Use PostgreSQL database","category":"architecture"}\n' +
        '{"ts":"2026-02-15T10:00:00Z","decision":"Still using PostgreSQL database","category":"architecture"}\n'
      );

      const analyzer = new DecisionAnalyzer(decisionsDir);
      const thrash = analyzer.getDecisionThrash();

      // Decisions are >7 days apart, should not count as thrash
      expect(thrash).toEqual([]);
    });
  });

  describe('analyzeRiskProfile', () => {
    test('categorizes decisions by risk level', () => {
      const decisionsDir = tempDir.createDir('decisions');
      tempDir.createFile('decisions/risk.jsonl',
        '{"ts":"2026-02-01T10:00:00Z","decision":"Minor CSS change","risk_level":"low"}\n' +
        '{"ts":"2026-02-02T10:00:00Z","decision":"Database schema change","risk_level":"medium"}\n' +
        '{"ts":"2026-02-03T10:00:00Z","decision":"Authentication rewrite","risk_level":"high"}\n'
      );

      const analyzer = new DecisionAnalyzer(decisionsDir);
      const riskProfile = analyzer.analyzeRiskProfile();

      expect(riskProfile.byRiskLevel.get('high')?.length).toBe(1);
      expect(riskProfile.byRiskLevel.get('medium')?.length).toBe(1);
      expect(riskProfile.byRiskLevel.get('low')?.length).toBe(1);
    });

    test('identifies one-way-doors missing reversibility plan', () => {
      const decisionsDir = tempDir.createDir('decisions');
      tempDir.createFile('decisions/risk.jsonl',
        '{"ts":"2026-02-01T10:00:00Z","decision":"Drop legacy table","decision_type":"one_way_door","reversibility_plan":"Restore from backup"}\n' +
        '{"ts":"2026-02-02T10:00:00Z","decision":"Delete user data","decision_type":"one_way_door"}\n' +
        '{"ts":"2026-02-03T10:00:00Z","decision":"Change API contract","decision_type":"one_way_door"}\n'
      );

      const analyzer = new DecisionAnalyzer(decisionsDir);
      const riskProfile = analyzer.analyzeRiskProfile();

      // 2 one-way-doors without reversibility_plan
      expect(riskProfile.missingReversibilityPlan.length).toBe(2);
    });

    test('identifies one-way-doors missing risk assessment', () => {
      const decisionsDir = tempDir.createDir('decisions');
      tempDir.createFile('decisions/risk.jsonl',
        '{"ts":"2026-02-01T10:00:00Z","decision":"Drop legacy table","decision_type":"one_way_door","risk_level":"high"}\n' +
        '{"ts":"2026-02-02T10:00:00Z","decision":"Delete user data","decision_type":"one_way_door"}\n'
      );

      const analyzer = new DecisionAnalyzer(decisionsDir);
      const riskProfile = analyzer.analyzeRiskProfile();

      // 1 one-way-door without risk_level
      expect(riskProfile.missingRiskAssessment.length).toBe(1);
      expect(riskProfile.missingRiskAssessment[0].decision).toBe('Delete user data');
    });

    test('returns empty arrays when no risk issues', () => {
      const decisionsDir = tempDir.createDir('decisions');
      tempDir.createFile('decisions/safe.jsonl',
        '{"ts":"2026-02-01T10:00:00Z","decision":"Minor change","decision_type":"two_way_door"}\n'
      );

      const analyzer = new DecisionAnalyzer(decisionsDir);
      const riskProfile = analyzer.analyzeRiskProfile();

      expect(riskProfile.missingReversibilityPlan.length).toBe(0);
      expect(riskProfile.missingRiskAssessment.length).toBe(0);
    });
  });

  // GAP-04: Decision Quality Score
  describe('calculateQualityScore', () => {
    test('returns 100% when all decisions have rationale AND context', () => {
      const decisionsDir = tempDir.createDir('decisions');
      tempDir.createFile('decisions/quality.jsonl',
        '{"ts":"2026-02-01T10:00:00Z","decision":"Choice A","rationale":"Because X","context":"In situation Y"}\n' +
        '{"ts":"2026-02-02T10:00:00Z","decision":"Choice B","rationale":"Because Z","context":"During sprint"}\n'
      );

      const analyzer = new DecisionAnalyzer(decisionsDir);
      const quality = analyzer.calculateQualityScore();

      expect(quality.qualityScore).toBe(100);
      expect(quality.decisionsWithBoth).toBe(2);
      expect(quality.status).toBe('good');
    });

    test('returns 0% when no decisions have both fields', () => {
      const decisionsDir = tempDir.createDir('decisions');
      tempDir.createFile('decisions/quality.jsonl',
        '{"ts":"2026-02-01T10:00:00Z","decision":"Choice A"}\n' +
        '{"ts":"2026-02-02T10:00:00Z","decision":"Choice B","rationale":"Because Z"}\n'
      );

      const analyzer = new DecisionAnalyzer(decisionsDir);
      const quality = analyzer.calculateQualityScore();

      expect(quality.qualityScore).toBe(0);
      expect(quality.status).toBe('critical');
    });

    test('returns 50% when half have both fields', () => {
      const decisionsDir = tempDir.createDir('decisions');
      tempDir.createFile('decisions/quality.jsonl',
        '{"ts":"2026-02-01T10:00:00Z","decision":"Choice A","rationale":"X","context":"Y"}\n' +
        '{"ts":"2026-02-02T10:00:00Z","decision":"Choice B"}\n'
      );

      const analyzer = new DecisionAnalyzer(decisionsDir);
      const quality = analyzer.calculateQualityScore();

      expect(quality.qualityScore).toBe(50);
      expect(quality.status).toBe('warning');
    });

    test('handles empty decisions array', () => {
      const analyzer = new DecisionAnalyzer('/nonexistent');
      const quality = analyzer.calculateQualityScore();

      expect(quality.qualityScore).toBe(100);
      expect(quality.totalDecisions).toBe(0);
      expect(quality.status).toBe('good');
    });

    test('accepts context as object', () => {
      const decisionsDir = tempDir.createDir('decisions');
      tempDir.createFile('decisions/quality.jsonl',
        '{"ts":"2026-02-01T10:00:00Z","decision":"A","rationale":"X","context":{"file":"test.ts","line":10}}\n'
      );

      const analyzer = new DecisionAnalyzer(decisionsDir);
      const quality = analyzer.calculateQualityScore();

      expect(quality.qualityScore).toBe(100);
      expect(quality.decisionsWithBoth).toBe(1);
    });
  });

  // GAP-08: Testing Discipline
  describe('analyzeTestingDiscipline', () => {
    test('returns 100% when all decisions mention tests', () => {
      const decisionsDir = tempDir.createDir('decisions');
      tempDir.createFile('decisions/testing.jsonl',
        '{"ts":"2026-02-01T10:00:00Z","decision":"Add feature","rationale":"All tests pass"}\n' +
        '{"ts":"2026-02-02T10:00:00Z","decision":"Update API","rationale":"Verified with unit test"}\n'
      );

      const analyzer = new DecisionAnalyzer(decisionsDir);
      const discipline = analyzer.analyzeTestingDiscipline();

      expect(discipline.adherenceRate).toBe(100);
      expect(discipline.status).toBe('good');
    });

    test('returns 0% when no decisions mention tests', () => {
      const decisionsDir = tempDir.createDir('decisions');
      tempDir.createFile('decisions/testing.jsonl',
        '{"ts":"2026-02-01T10:00:00Z","decision":"Add feature","rationale":"Looks good"}\n' +
        '{"ts":"2026-02-02T10:00:00Z","decision":"Update API","rationale":"LGTM"}\n'
      );

      const analyzer = new DecisionAnalyzer(decisionsDir);
      const discipline = analyzer.analyzeTestingDiscipline();

      expect(discipline.adherenceRate).toBe(0);
      expect(discipline.status).toBe('critical');
    });

    test('detects various testing patterns', () => {
      const decisionsDir = tempDir.createDir('decisions');
      tempDir.createFile('decisions/testing.jsonl',
        '{"ts":"2026-02-01T10:00:00Z","decision":"A","rationale":"test coverage at 80%"}\n' +
        '{"ts":"2026-02-02T10:00:00Z","decision":"B","rationale":"e2e tests pass"}\n' +
        '{"ts":"2026-02-03T10:00:00Z","decision":"C","rationale":"verified manually"}\n' +
        '{"ts":"2026-02-04T10:00:00Z","decision":"D","rationale":"looks good"}\n'
      );

      const analyzer = new DecisionAnalyzer(decisionsDir);
      const discipline = analyzer.analyzeTestingDiscipline();

      expect(discipline.decisionsWithTesting).toBe(3);
      expect(discipline.adherenceRate).toBe(75);
      expect(discipline.patternsDetected.length).toBeGreaterThan(0);
    });

    test('handles empty decisions', () => {
      const analyzer = new DecisionAnalyzer('/nonexistent');
      const discipline = analyzer.analyzeTestingDiscipline();

      expect(discipline.adherenceRate).toBe(100);
      expect(discipline.totalDecisions).toBe(0);
    });
  });

  describe('field normalization', () => {
    test('handles timestamp alias', () => {
      const decisionsDir = tempDir.createDir('decisions');
      tempDir.createFile('decisions/alias.jsonl',
        '{"timestamp":"2026-02-01T10:00:00Z","decision":"Using timestamp alias"}\n'
      );

      const analyzer = new DecisionAnalyzer(decisionsDir);
      const result = analyzer.analyze();

      expect(result.records).toHaveLength(1);
      expect(result.records[0].ts).toBe('2026-02-01T10:00:00Z');
    });

    test('handles decision/summary/title aliases', () => {
      const decisionsDir = tempDir.createDir('decisions');
      tempDir.createFile('decisions/alias.jsonl',
        '{"ts":"2026-02-01T10:00:00Z","summary":"Using summary alias"}\n' +
        '{"ts":"2026-02-02T10:00:00Z","title":"Using title alias"}\n'
      );

      const analyzer = new DecisionAnalyzer(decisionsDir);
      const result = analyzer.analyze();

      expect(result.records).toHaveLength(2);
      expect(result.records[0].decision).toBe('Using summary alias');
      expect(result.records[1].decision).toBe('Using title alias');
    });
  });
});
