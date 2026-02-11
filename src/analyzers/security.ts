/**
 * Security scan analyzer for the Agentic Retrospective
 * Parses output from common security scanning tools
 */

import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';

export interface VulnerabilityInfo {
  id: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  package?: string;
  version?: string;
  fixedIn?: string;
  source: string; // Which scanner found it
}

export interface SecurityAnalysisResult {
  hasScans: boolean;
  scanTypes: string[];
  vulnerabilities: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  totalVulnerabilities: number;
  vulnerabilityDetails: VulnerabilityInfo[];
  newDepsCount: number;
  scanTimestamp?: string;
}

export class SecurityAnalyzer {
  private basePath: string;

  constructor(basePath: string = '.logs/security') {
    this.basePath = basePath;
  }

  /**
   * Analyze security scan results
   */
  analyze(): SecurityAnalysisResult {
    const result: SecurityAnalysisResult = {
      hasScans: false,
      scanTypes: [],
      vulnerabilities: { critical: 0, high: 0, medium: 0, low: 0 },
      totalVulnerabilities: 0,
      vulnerabilityDetails: [],
      newDepsCount: 0,
    };

    if (!existsSync(this.basePath)) {
      return result;
    }

    try {
      const files = readdirSync(this.basePath);

      for (const file of files) {
        const filePath = join(this.basePath, file);

        if (file.includes('trivy') && file.endsWith('.json')) {
          this.parseTrivyOutput(filePath, result);
        } else if ((file.includes('npm-audit') || file === 'audit.json') && file.endsWith('.json')) {
          this.parseNpmAuditOutput(filePath, result);
        } else if (file.includes('snyk') && file.endsWith('.json')) {
          this.parseSnykOutput(filePath, result);
        }
      }

      result.hasScans = result.scanTypes.length > 0;
      result.totalVulnerabilities =
        result.vulnerabilities.critical +
        result.vulnerabilities.high +
        result.vulnerabilities.medium +
        result.vulnerabilities.low;
    } catch (error) {
      console.error('Error analyzing security scans:', error);
    }

    return result;
  }

  /**
   * Parse Trivy JSON output
   * https://aquasecurity.github.io/trivy/
   */
  private parseTrivyOutput(filePath: string, result: SecurityAnalysisResult): void {
    try {
      const content = readFileSync(filePath, 'utf-8');
      const data = JSON.parse(content);

      result.scanTypes.push('trivy');

      // Trivy can have multiple Results (one per target/image/fs)
      const results = data.Results || [data];

      for (const scanResult of results) {
        const vulnerabilities = scanResult.Vulnerabilities || [];

        for (const vuln of vulnerabilities) {
          const severity = this.normalizeSeverity(vuln.Severity);
          result.vulnerabilities[severity]++;

          result.vulnerabilityDetails.push({
            id: vuln.VulnerabilityID || vuln.ID || 'unknown',
            severity,
            title: vuln.Title || vuln.Description || 'Unknown vulnerability',
            package: vuln.PkgName,
            version: vuln.InstalledVersion,
            fixedIn: vuln.FixedVersion,
            source: 'trivy',
          });
        }
      }

      // Get scan metadata if available
      if (data.Metadata?.RepoTags) {
        result.scanTimestamp = data.Metadata.CreatedAt;
      }
    } catch (error) {
      console.error(`Error parsing Trivy output from ${filePath}:`, error);
    }
  }

  /**
   * Parse npm audit JSON output
   */
  private parseNpmAuditOutput(filePath: string, result: SecurityAnalysisResult): void {
    try {
      const content = readFileSync(filePath, 'utf-8');
      const data = JSON.parse(content);

      result.scanTypes.push('npm-audit');

      // npm audit v7+ format
      if (data.vulnerabilities) {
        for (const [pkgName, vuln] of Object.entries(data.vulnerabilities)) {
          const vulnData = vuln as {
            severity: string;
            via?: Array<{ title?: string; url?: string }> | string[];
            fixAvailable?: { version?: string } | boolean;
            range?: string;
          };
          const severity = this.normalizeSeverity(vulnData.severity);
          result.vulnerabilities[severity]++;

          const viaInfo = Array.isArray(vulnData.via) && vulnData.via.length > 0
            ? (typeof vulnData.via[0] === 'object' ? vulnData.via[0].title : String(vulnData.via[0]))
            : undefined;

          result.vulnerabilityDetails.push({
            id: `npm-${pkgName}`,
            severity,
            title: viaInfo || `Vulnerability in ${pkgName}`,
            package: pkgName,
            version: vulnData.range,
            fixedIn: typeof vulnData.fixAvailable === 'object' ? vulnData.fixAvailable.version : undefined,
            source: 'npm-audit',
          });
        }
      }

      // npm audit v6 format
      if (data.advisories) {
        for (const [, advisory] of Object.entries(data.advisories)) {
          const advData = advisory as {
            severity: string;
            title: string;
            module_name: string;
            vulnerable_versions?: string;
            patched_versions?: string;
            id?: number;
          };
          const severity = this.normalizeSeverity(advData.severity);
          result.vulnerabilities[severity]++;

          result.vulnerabilityDetails.push({
            id: `npm-${advData.id || advData.module_name}`,
            severity,
            title: advData.title,
            package: advData.module_name,
            version: advData.vulnerable_versions,
            fixedIn: advData.patched_versions,
            source: 'npm-audit',
          });
        }
      }

      // Track new dependencies if metadata available
      if (data.metadata?.dependencies) {
        result.newDepsCount = data.metadata.dependencies.total || 0;
      }
    } catch (error) {
      console.error(`Error parsing npm audit output from ${filePath}:`, error);
    }
  }

  /**
   * Parse Snyk JSON output
   * https://snyk.io/
   */
  private parseSnykOutput(filePath: string, result: SecurityAnalysisResult): void {
    try {
      const content = readFileSync(filePath, 'utf-8');
      const data = JSON.parse(content);

      result.scanTypes.push('snyk');

      const vulnerabilities = data.vulnerabilities || [];

      for (const vuln of vulnerabilities) {
        const severity = this.normalizeSeverity(vuln.severity);
        result.vulnerabilities[severity]++;

        result.vulnerabilityDetails.push({
          id: vuln.id || vuln.identifiers?.CVE?.[0] || 'unknown',
          severity,
          title: vuln.title || vuln.description || 'Unknown vulnerability',
          package: vuln.packageName || vuln.moduleName,
          version: vuln.version,
          fixedIn: vuln.fixedIn?.[0],
          source: 'snyk',
        });
      }

      // Get dependency count from Snyk
      if (data.dependencyCount) {
        result.newDepsCount = Math.max(result.newDepsCount, data.dependencyCount);
      }
    } catch (error) {
      console.error(`Error parsing Snyk output from ${filePath}:`, error);
    }
  }

  /**
   * Normalize severity string to our standard levels
   */
  private normalizeSeverity(severity: string): 'critical' | 'high' | 'medium' | 'low' {
    const normalized = (severity || '').toLowerCase();

    if (normalized.includes('critical')) return 'critical';
    if (normalized.includes('high')) return 'high';
    if (normalized.includes('medium') || normalized.includes('moderate')) return 'medium';
    return 'low';
  }

  /**
   * Get summary for report generation
   */
  getSummary(): {
    hasScans: boolean;
    scanTypes: string[];
    total: number;
    bySeverity: { critical: number; high: number; medium: number; low: number };
    topVulnerabilities: VulnerabilityInfo[];
  } {
    const analysis = this.analyze();

    return {
      hasScans: analysis.hasScans,
      scanTypes: analysis.scanTypes,
      total: analysis.totalVulnerabilities,
      bySeverity: analysis.vulnerabilities,
      topVulnerabilities: analysis.vulnerabilityDetails
        .sort((a, b) => {
          const order = { critical: 0, high: 1, medium: 2, low: 3 };
          return order[a.severity] - order[b.severity];
        })
        .slice(0, 5),
    };
  }
}
