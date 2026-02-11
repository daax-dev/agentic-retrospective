/**
 * Decision log analyzer for the Agentic Retrospective
 */

import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import type { DecisionRecord } from '../types.js';

export interface DecisionAnalysisResult {
  records: DecisionRecord[];
  byCategory: Map<string, DecisionRecord[]>;
  byActor: Map<string, DecisionRecord[]>;
  byType: Map<string, DecisionRecord[]>;
  oneWayDoors: DecisionRecord[];
  twoWayDoors: DecisionRecord[];
  escalationStats: {
    total: number;
    escalated: number;
    rate: number;
  };
  dataQuality: {
    totalRecords: number;
    validRecords: number;
    malformedRecords: number;
    missingFields: Map<string, number>;
  };
}

export class DecisionAnalyzer {
  private path: string;

  constructor(decisionsPath: string) {
    this.path = decisionsPath;
  }

  /**
   * Analyze all decision logs in the configured path
   */
  analyze(): DecisionAnalysisResult {
    const records = this.loadRecords();
    const validRecords = records.filter(r => this.isValidRecord(r));

    // Group by category
    const byCategory = new Map<string, DecisionRecord[]>();
    for (const record of validRecords) {
      const category = record.category || 'other';
      const existing = byCategory.get(category) || [];
      existing.push(record);
      byCategory.set(category, existing);
    }

    // Group by actor
    const byActor = new Map<string, DecisionRecord[]>();
    for (const record of validRecords) {
      const actor = record.actor || 'unknown';
      const existing = byActor.get(actor) || [];
      existing.push(record);
      byActor.set(actor, existing);
    }

    // Group by type
    const byType = new Map<string, DecisionRecord[]>();
    for (const record of validRecords) {
      const type = record.decision_type || 'unknown';
      const existing = byType.get(type) || [];
      existing.push(record);
      byType.set(type, existing);
    }

    // Identify one-way and two-way doors
    const oneWayDoors = validRecords.filter(r => r.decision_type === 'one_way_door');
    const twoWayDoors = validRecords.filter(r => r.decision_type === 'two_way_door');

    // Calculate escalation stats
    const escalatedOneWayDoors = oneWayDoors.filter(r => r.actor === 'human');
    const escalationStats = {
      total: oneWayDoors.length,
      escalated: escalatedOneWayDoors.length,
      rate: oneWayDoors.length > 0
        ? (escalatedOneWayDoors.length / oneWayDoors.length) * 100
        : 100,
    };

    // Data quality analysis
    const dataQuality = this.analyzeDataQuality(records, validRecords);

    return {
      records: validRecords,
      byCategory,
      byActor,
      byType,
      oneWayDoors,
      twoWayDoors,
      escalationStats,
      dataQuality,
    };
  }

  /**
   * Load all decision records from JSONL files
   */
  private loadRecords(): DecisionRecord[] {
    const records: DecisionRecord[] = [];

    if (!existsSync(this.path)) {
      return records;
    }

    try {
      const files = readdirSync(this.path);

      for (const file of files) {
        if (!file.endsWith('.jsonl')) {
          continue;
        }

        const filePath = join(this.path, file);
        const content = readFileSync(filePath, 'utf-8');

        for (const line of content.split('\n').filter(Boolean)) {
          try {
            const record = JSON.parse(line) as DecisionRecord;
            records.push(this.normalizeRecord(record));
          } catch {
            // Track malformed line but continue
            records.push({ ts: '', _malformed: true } as DecisionRecord);
          }
        }
      }
    } catch (error) {
      console.error('Error loading decision records:', error);
    }

    return records;
  }

  /**
   * Normalize a decision record (handle aliases, set defaults)
   */
  private normalizeRecord(record: DecisionRecord): DecisionRecord {
    return {
      ...record,
      // Handle timestamp alias
      ts: record.ts || record.timestamp || '',
      // Handle decision aliases
      decision: record.decision || record.summary || record.title || '',
      // Handle rationale alias
      rationale: record.rationale || record.reasoning || '',
      // Handle chosen_option alias
      chosen_option: record.chosen_option || record.chosen || '',
    };
  }

  /**
   * Check if a record is valid (has required fields)
   */
  private isValidRecord(record: DecisionRecord): boolean {
    // Must have timestamp
    if (!record.ts && !record.timestamp) {
      return false;
    }

    // Check for malformed marker
    if ((record as unknown as { _malformed?: boolean })._malformed) {
      return false;
    }

    return true;
  }

  /**
   * Analyze data quality of decision logs
   */
  private analyzeDataQuality(
    allRecords: DecisionRecord[],
    validRecords: DecisionRecord[]
  ): DecisionAnalysisResult['dataQuality'] {
    const missingFields = new Map<string, number>();

    // Check for common fields that should be present
    const fieldsToCheck = [
      'category',
      'decision_type',
      'actor',
      'rationale',
      'evidence_refs',
    ];

    for (const record of validRecords) {
      for (const field of fieldsToCheck) {
        if (!record[field as keyof DecisionRecord]) {
          const count = missingFields.get(field) || 0;
          missingFields.set(field, count + 1);
        }
      }
    }

    return {
      totalRecords: allRecords.length,
      validRecords: validRecords.length,
      malformedRecords: allRecords.length - validRecords.length,
      missingFields,
    };
  }

  /**
   * Get decisions that should have been escalated but weren't
   */
  getMissedEscalations(): DecisionRecord[] {
    const result = this.analyze();

    // One-way-door decisions made by agent (should have been human)
    return result.oneWayDoors.filter(r => r.actor === 'agent');
  }

  /**
   * Get trivial escalations (two-way-doors escalated to human)
   */
  getTrivialEscalations(): DecisionRecord[] {
    const result = this.analyze();

    // Two-way-door decisions made by human (could have been agent)
    return result.twoWayDoors.filter(r => r.actor === 'human');
  }

  /**
   * Detect decision thrash (same decision reversed multiple times)
   */
  getDecisionThrash(): Array<{
    topic: string;
    decisions: DecisionRecord[];
    severity: 'high' | 'medium' | 'low';
  }> {
    const result = this.analyze();
    const thrashPatterns: Array<{
      topic: string;
      decisions: DecisionRecord[];
      severity: 'high' | 'medium' | 'low';
    }> = [];

    // Group decisions by category
    for (const [category, decisions] of result.byCategory) {
      if (decisions.length < 2) continue;

      // Look for similar topics within category (simple keyword matching)
      const seen = new Map<string, DecisionRecord[]>();

      for (const decision of decisions) {
        const decisionText = (decision.decision || decision.summary || decision.title || '').toLowerCase();
        const keywords = this.extractKeywords(decisionText);

        for (const keyword of keywords) {
          if (keyword.length < 4) continue; // Skip short words

          const existing = seen.get(keyword) || [];
          existing.push(decision);
          seen.set(keyword, existing);
        }
      }

      // Find keywords with multiple decisions (potential thrash)
      for (const [keyword, relatedDecisions] of seen) {
        if (relatedDecisions.length >= 2) {
          // Check if decisions are within 7 days of each other
          const sorted = [...relatedDecisions].sort((a, b) =>
            new Date(a.ts).getTime() - new Date(b.ts).getTime()
          );

          const first = new Date(sorted[0].ts).getTime();
          const last = new Date(sorted[sorted.length - 1].ts).getTime();
          const daysDiff = (last - first) / (1000 * 60 * 60 * 24);

          if (daysDiff <= 7) {
            const severity = relatedDecisions.length >= 3 ? 'high' :
                            relatedDecisions.length >= 2 ? 'medium' : 'low';

            // Avoid duplicates
            const existingPattern = thrashPatterns.find(p => p.topic === keyword);
            if (!existingPattern) {
              thrashPatterns.push({
                topic: `${category}/${keyword}`,
                decisions: relatedDecisions,
                severity,
              });
            }
          }
        }
      }
    }

    return thrashPatterns;
  }

  /**
   * Extract keywords from decision text
   */
  private extractKeywords(text: string): string[] {
    const stopWords = new Set([
      'the', 'and', 'for', 'with', 'use', 'add', 'new', 'update', 'change',
      'fix', 'implement', 'create', 'delete', 'remove', 'this', 'that', 'from',
      'into', 'will', 'should', 'could', 'would', 'have', 'been', 'being',
    ]);

    return text
      .split(/\s+/)
      .map(w => w.replace(/[^a-z0-9]/gi, '').toLowerCase())
      .filter(w => w.length >= 3 && !stopWords.has(w));
  }

  /**
   * Analyze risk profile of decisions
   */
  analyzeRiskProfile(): {
    byRiskLevel: Map<'high' | 'medium' | 'low', DecisionRecord[]>;
    missingReversibilityPlan: DecisionRecord[];
    missingRiskAssessment: DecisionRecord[];
  } {
    const result = this.analyze();
    const byRiskLevel = new Map<'high' | 'medium' | 'low', DecisionRecord[]>([
      ['high', []],
      ['medium', []],
      ['low', []],
    ]);
    const missingReversibilityPlan: DecisionRecord[] = [];
    const missingRiskAssessment: DecisionRecord[] = [];

    for (const record of result.records) {
      // Group by risk level
      const riskLevel = record.risk_level as 'high' | 'medium' | 'low' | undefined;
      if (riskLevel && byRiskLevel.has(riskLevel)) {
        byRiskLevel.get(riskLevel)!.push(record);
      }

      // Check for one-way-doors missing reversibility plan
      if (record.decision_type === 'one_way_door') {
        if (!record.reversibility_plan) {
          missingReversibilityPlan.push(record);
        }
        if (!record.risk_level) {
          missingRiskAssessment.push(record);
        }
      }
    }

    return {
      byRiskLevel,
      missingReversibilityPlan,
      missingRiskAssessment,
    };
  }
}
