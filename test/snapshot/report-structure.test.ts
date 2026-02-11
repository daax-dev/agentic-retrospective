/**
 * Snapshot tests for report structure
 *
 * Ensures the report format remains consistent across changes.
 */

import { describe, test, expect } from 'vitest';
import { ReportGenerator } from '../../src/report/generator.js';
import type { RetroReport, Scores, Score, Finding, ActionItem } from '../../src/types.js';

function createMinimalReport(overrides: Partial<RetroReport> = {}): RetroReport {
  const defaultScore: Score = {
    score: 3,
    confidence: 'medium',
    evidence: ['Test evidence'],
  };

  const defaultScores: Scores = {
    delivery_predictability: { ...defaultScore },
    test_loop_completeness: { ...defaultScore },
    quality_maintainability: { ...defaultScore },
    security_posture: { ...defaultScore },
    collaboration_efficiency: { ...defaultScore },
    decision_hygiene: { ...defaultScore },
  };

  return {
    sprint_id: 'test-sprint',
    period: { from: 'abc1234', to: 'def5678' },
    generated_at: '2026-02-01T12:00:00Z',
    data_completeness: {
      percentage: 60,
      sources: { git: true, decisions: true, agent_logs: true, ci: false, tests: false },
      gaps: [],
    },
    summary: {
      commits: 10,
      contributors: 2,
      human_contributors: 1,
      agent_contributors: 1,
      lines_added: 500,
      lines_removed: 100,
      decisions_logged: 5,
      agent_commits: 3,
      agent_commit_percentage: 30,
    },
    scores: defaultScores,
    findings: [],
    wins: [],
    risks: [],
    action_items: [],
    evidence_map: {
      commits: {},
      decisions: {},
      orphans: { commits_without_context: [], decisions_without_implementation: [] },
    },
    metadata: {
      tool_version: '0.3.0',
      schema_version: '1.2',
      generated_by: 'agentic-retrospective',
    },
    ...overrides,
  };
}

describe('Report Structure Snapshots', () => {
  const generator = new ReportGenerator();

  test('minimal report structure matches snapshot', () => {
    const report = createMinimalReport();
    const markdown = generator.generateMarkdown(report);

    // Verify key sections exist
    expect(markdown).toContain('# Sprint Retrospective: test-sprint');
    expect(markdown).toContain('## Executive Summary');
    expect(markdown).toContain('## Scoring Summary');
    expect(markdown).toContain('## Action Items');

    // Snapshot the section headers
    const sectionHeaders = markdown
      .split('\n')
      .filter(line => line.startsWith('## '))
      .join('\n');

    expect(sectionHeaders).toMatchSnapshot('section-headers');
  });

  test('report with all sections matches snapshot', () => {
    const report = createMinimalReport({
      git_metrics: {
        hotspots: [
          { path: 'src/runner.ts', changes: 5, concernLevel: 'high' },
          { path: 'src/types.ts', changes: 3, concernLevel: 'medium' },
        ],
        filesByExtension: [
          { extension: '.ts', count: 20, percentage: 80 },
          { extension: '.md', count: 5, percentage: 20 },
        ],
        totalFilesChanged: 25,
      },
      tools_summary: {
        totalCalls: 50,
        uniqueTools: 5,
        byTool: [
          { tool: 'Read', calls: 20, percentage: 40, avgDuration: 50, successRate: 1, errors: [] },
          { tool: 'Edit', calls: 15, percentage: 30, avgDuration: 100, successRate: 0.95, errors: ['No match'] },
        ],
        overallErrorRate: 0.02,
        avgCallsPerSession: 10,
      },
      decision_analysis: {
        byCategory: [
          { category: 'architecture', count: 3, percentage: 60, decisions: ['DB choice', 'API design'] },
        ],
        byActor: [
          { actor: 'human', count: 3, percentage: 60, oneWayDoors: 2 },
          { actor: 'agent', count: 2, percentage: 40, oneWayDoors: 0 },
        ],
        byType: [
          { type: 'one_way_door', count: 2, percentage: 40 },
          { type: 'two_way_door', count: 3, percentage: 60 },
        ],
        escalationCompliance: {
          rate: 100,
          total: 2,
          escalated: 2,
          status: 'compliant',
        },
      },
    });

    const markdown = generator.generateMarkdown(report);

    // Verify new sections exist
    expect(markdown).toContain('## Code Hotspots');
    expect(markdown).toContain('## Tool Performance');
    expect(markdown).toContain('## Decisions Analysis');

    // Snapshot key sections
    const hotspotsSection = markdown.match(/## Code Hotspots[\s\S]*?(?=\n---\n|$)/)?.[0] || '';
    expect(hotspotsSection).toMatchSnapshot('code-hotspots-section');
  });

  test('report with findings matches snapshot', () => {
    const findings: Finding[] = [
      {
        id: 'finding-1',
        severity: 'critical',
        category: 'decision_gap',
        title: 'Agent made one-way-door decision',
        summary: 'Agent made irreversible decision without approval',
        evidence: ['decision:dec-001'],
        confidence: 'high',
        recommendation: 'Escalate one-way-door decisions',
      },
      {
        id: 'finding-2',
        severity: 'medium',
        category: 'quality',
        title: 'High rework detected',
        summary: '25% of commits are fixes',
        evidence: ['commit:abc1234'],
        confidence: 'medium',
      },
    ];

    const report = createMinimalReport({ findings });
    const markdown = generator.generateMarkdown(report);

    expect(markdown).toContain('Agent made one-way-door decision');
    expect(markdown).toContain('High rework detected');
  });

  test('report with action items matches snapshot', () => {
    const actionItems: ActionItem[] = [
      {
        id: 'action-1',
        priority: 'must_do',
        action: 'Fix telemetry gap: missing_decisions',
        rationale: 'Cannot evaluate decision quality',
        owner: null,
        success_metric: 'Decisions logged',
        effort: 2,
        impact: 4,
        risk_reduction: 3,
      },
      {
        id: 'action-2',
        priority: 'next_sprint',
        action: 'Add security scanning',
        rationale: 'No vulnerability data',
        owner: 'DevOps',
        success_metric: 'Security score populated',
        effort: 3,
        impact: 5,
        risk_reduction: 5,
      },
    ];

    const report = createMinimalReport({ action_items: actionItems });
    const markdown = generator.generateMarkdown(report);

    expect(markdown).toContain('Fix telemetry gap');
    expect(markdown).toContain('Add security scanning');

    const actionSection = markdown.match(/## Action Items[\s\S]*?(?=\n---\n|$)/)?.[0] || '';
    expect(actionSection).toMatchSnapshot('action-items-section');
  });

  test('report with telemetry gaps matches snapshot', () => {
    const report = createMinimalReport({
      data_completeness: {
        percentage: 40,
        sources: { git: true, decisions: true, agent_logs: false, ci: false, tests: false },
        gaps: [
          {
            gap_type: 'missing_agent_logs',
            severity: 'medium',
            impact: 'Cannot analyze collaboration patterns',
            recommendation: 'Enable agent logging',
          },
          {
            gap_type: 'missing_test_results',
            severity: 'medium',
            impact: 'Cannot analyze test coverage',
            recommendation: 'Add JUnit output',
          },
        ],
      },
    });

    const markdown = generator.generateMarkdown(report);

    expect(markdown).toContain('## Telemetry Gaps');
    expect(markdown).toContain('Missing Agent Logs');
    expect(markdown).toContain('Missing Test Results');
  });

  test('scoring table format matches snapshot', () => {
    const report = createMinimalReport({
      scores: {
        delivery_predictability: { score: 5, confidence: 'high', evidence: ['50 small commits'] },
        test_loop_completeness: { score: null, confidence: 'none', evidence: [] },
        quality_maintainability: { score: 4, confidence: 'medium', evidence: ['10% large commits'] },
        security_posture: { score: 3, confidence: 'high', evidence: ['2 medium vulns'] },
        collaboration_efficiency: { score: null, confidence: 'none', evidence: [] },
        decision_hygiene: { score: 5, confidence: 'high', evidence: ['100% escalation'] },
      },
    });

    const markdown = generator.generateMarkdown(report);

    const scoringTable = markdown.match(/## Scoring Summary[\s\S]*?(?=\n---\n|$)/)?.[0] || '';
    expect(scoringTable).toMatchSnapshot('scoring-table');
  });
});
