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
    reversals: DecisionRecord[];
  }> {
    // TODO: Implement decision thrash detection using text similarity
    // Would use this.analyze() results to group similar decisions
    return [];
  }
}
