/**
 * Tool Calls Analyzer
 *
 * Analyzes agent tool usage patterns from .logs/tools/
 */

import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';

export interface ToolCallEntry {
  timestamp: string;
  session_id: string;
  tool_name: string;
  duration_ms?: number;
  success?: boolean;
  error?: string;
}

export interface ToolUsageStats {
  toolName: string;
  count: number;
  avgDuration: number | null;
  successRate: number;
  errors: string[];
}

export interface ToolsAnalysisResult {
  totalCalls: number;
  uniqueTools: number;
  toolStats: ToolUsageStats[];
  mostUsedTools: string[];
  errorRate: number;
  avgCallsPerSession: number;
  findings: string[];
}

export class ToolsAnalyzer {
  private toolsPath: string;

  constructor(logsBasePath: string) {
    this.toolsPath = join(logsBasePath, 'tools');
  }

  analyze(): ToolsAnalysisResult {
    const entries = this.loadToolCalls();
    const findings: string[] = [];

    if (entries.length === 0) {
      return {
        totalCalls: 0,
        uniqueTools: 0,
        toolStats: [],
        mostUsedTools: [],
        errorRate: 0,
        avgCallsPerSession: 0,
        findings: ['No tool call logs found in .logs/tools/'],
      };
    }

    // Group by tool
    const toolGroups = new Map<string, ToolCallEntry[]>();
    const sessionCounts = new Map<string, number>();

    for (const entry of entries) {
      const group = toolGroups.get(entry.tool_name) || [];
      group.push(entry);
      toolGroups.set(entry.tool_name, group);

      const sessionCount = sessionCounts.get(entry.session_id) || 0;
      sessionCounts.set(entry.session_id, sessionCount + 1);
    }

    // Calculate stats per tool
    const toolStats: ToolUsageStats[] = [];
    let totalErrors = 0;

    for (const [toolName, calls] of toolGroups) {
      const durations = calls.filter(c => c.duration_ms).map(c => c.duration_ms!);
      const avgDuration = durations.length > 0
        ? durations.reduce((a, b) => a + b, 0) / durations.length
        : null;

      const successes = calls.filter(c => c.success !== false).length;
      const successRate = calls.length > 0 ? successes / calls.length : 1;
      const errors = calls.filter(c => c.error).map(c => c.error!);
      totalErrors += errors.length;

      toolStats.push({
        toolName,
        count: calls.length,
        avgDuration,
        successRate,
        errors: errors.slice(0, 5), // Keep top 5 errors
      });
    }

    // Sort by usage
    toolStats.sort((a, b) => b.count - a.count);

    const mostUsedTools = toolStats.slice(0, 5).map(t => t.toolName);
    const errorRate = entries.length > 0 ? totalErrors / entries.length : 0;
    const avgCallsPerSession = sessionCounts.size > 0
      ? entries.length / sessionCounts.size
      : 0;

    // Generate findings
    findings.push(`${entries.length} tool calls across ${toolGroups.size} unique tools`);

    if (errorRate > 0.1) {
      findings.push(`High tool error rate: ${(errorRate * 100).toFixed(1)}%`);
    }

    const heavyTools = toolStats.filter(t => t.count > entries.length * 0.2);
    if (heavyTools.length > 0) {
      findings.push(`Heavy tool usage: ${heavyTools.map(t => `${t.toolName || 'unknown'} (${t.count})`).join(', ')}`);
    }

    return {
      totalCalls: entries.length,
      uniqueTools: toolGroups.size,
      toolStats,
      mostUsedTools,
      errorRate,
      avgCallsPerSession,
      findings,
    };
  }

  private loadToolCalls(): ToolCallEntry[] {
    const entries: ToolCallEntry[] = [];

    if (!existsSync(this.toolsPath)) {
      return entries;
    }

    try {
      const files = readdirSync(this.toolsPath).filter(f => f.endsWith('.jsonl'));

      for (const file of files) {
        const content = readFileSync(join(this.toolsPath, file), 'utf-8');
        const lines = content.split('\n').filter(Boolean);

        for (const line of lines) {
          try {
            entries.push(JSON.parse(line));
          } catch {
            // Skip malformed lines
          }
        }
      }
    } catch {
      // Directory read error
    }

    return entries;
  }
}
