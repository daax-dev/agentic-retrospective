/**
 * Unit tests for SecurityAnalyzer
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { SecurityAnalyzer } from '../../../src/analyzers/security.js';
import { getFixturePath, createTempDir, type TempDir } from '../../fixtures/index.js';
import { copyFileSync, readFileSync } from 'fs';
import { join } from 'path';

describe('SecurityAnalyzer', () => {
  let tempDir: TempDir;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    tempDir.cleanup();
  });

  describe('analyze', () => {
    test('returns empty result for non-existent directory', () => {
      const analyzer = new SecurityAnalyzer('/nonexistent/path');
      const result = analyzer.analyze();

      expect(result.hasScans).toBe(false);
      expect(result.scanTypes).toHaveLength(0);
      expect(result.totalVulnerabilities).toBe(0);
    });

    test('parses Trivy JSON output correctly', () => {
      const securityDir = tempDir.createDir('security');
      copyFileSync(
        getFixturePath('security/trivy.json'),
        join(securityDir, 'trivy.json')
      );

      const analyzer = new SecurityAnalyzer(securityDir);
      const result = analyzer.analyze();

      expect(result.hasScans).toBe(true);
      expect(result.scanTypes).toContain('trivy');
      expect(result.vulnerabilities.critical).toBe(1); // axios
      expect(result.vulnerabilities.high).toBe(1); // lodash
      expect(result.vulnerabilities.medium).toBe(1); // minimist
      expect(result.totalVulnerabilities).toBe(3);
    });

    test('parses npm audit JSON output correctly', () => {
      const securityDir = tempDir.createDir('security');
      copyFileSync(
        getFixturePath('security/npm-audit.json'),
        join(securityDir, 'npm-audit.json')
      );

      const analyzer = new SecurityAnalyzer(securityDir);
      const result = analyzer.analyze();

      expect(result.hasScans).toBe(true);
      expect(result.scanTypes).toContain('npm-audit');
      expect(result.vulnerabilities.high).toBe(1);
      expect(result.vulnerabilities.medium).toBe(1); // moderate = medium
      expect(result.newDepsCount).toBe(155);
    });

    test('parses Snyk JSON output correctly', () => {
      const securityDir = tempDir.createDir('security');
      copyFileSync(
        getFixturePath('security/snyk.json'),
        join(securityDir, 'snyk.json')
      );

      const analyzer = new SecurityAnalyzer(securityDir);
      const result = analyzer.analyze();

      expect(result.hasScans).toBe(true);
      expect(result.scanTypes).toContain('snyk');
      expect(result.vulnerabilities.critical).toBe(1);
      expect(result.vulnerabilities.high).toBe(1);
      expect(result.vulnerabilities.low).toBe(1);
      expect(result.newDepsCount).toBe(200);
    });

    test('aggregates multiple scan sources', () => {
      const securityDir = tempDir.createDir('security');

      // Copy all three fixtures
      copyFileSync(
        getFixturePath('security/trivy.json'),
        join(securityDir, 'trivy.json')
      );
      copyFileSync(
        getFixturePath('security/npm-audit.json'),
        join(securityDir, 'npm-audit.json')
      );
      copyFileSync(
        getFixturePath('security/snyk.json'),
        join(securityDir, 'snyk.json')
      );

      const analyzer = new SecurityAnalyzer(securityDir);
      const result = analyzer.analyze();

      expect(result.hasScans).toBe(true);
      expect(result.scanTypes).toContain('trivy');
      expect(result.scanTypes).toContain('npm-audit');
      expect(result.scanTypes).toContain('snyk');
      expect(result.scanTypes).toHaveLength(3);

      // Should aggregate all vulnerabilities
      expect(result.totalVulnerabilities).toBeGreaterThan(5);
    });

    test('captures vulnerability details correctly', () => {
      const securityDir = tempDir.createDir('security');
      copyFileSync(
        getFixturePath('security/trivy.json'),
        join(securityDir, 'trivy.json')
      );

      const analyzer = new SecurityAnalyzer(securityDir);
      const result = analyzer.analyze();

      const axiosVuln = result.vulnerabilityDetails.find(v => v.package === 'axios');
      expect(axiosVuln).toBeDefined();
      expect(axiosVuln!.id).toBe('CVE-2024-5678');
      expect(axiosVuln!.severity).toBe('critical');
      expect(axiosVuln!.fixedIn).toBe('0.21.2');
      expect(axiosVuln!.source).toBe('trivy');
    });

    test('handles empty security directory', () => {
      const securityDir = tempDir.createDir('security');

      const analyzer = new SecurityAnalyzer(securityDir);
      const result = analyzer.analyze();

      expect(result.hasScans).toBe(false);
      expect(result.totalVulnerabilities).toBe(0);
    });

    test('handles malformed JSON gracefully', () => {
      const securityDir = tempDir.createDir('security');
      tempDir.createFile('security/trivy.json', 'not valid json');

      const analyzer = new SecurityAnalyzer(securityDir);
      const result = analyzer.analyze();

      // Should not crash, just return empty result
      expect(result.hasScans).toBe(false);
    });
  });

  describe('getSummary', () => {
    test('returns top vulnerabilities sorted by severity', () => {
      const securityDir = tempDir.createDir('security');
      copyFileSync(
        getFixturePath('security/snyk.json'),
        join(securityDir, 'snyk.json')
      );

      const analyzer = new SecurityAnalyzer(securityDir);
      const summary = analyzer.getSummary();

      expect(summary.hasScans).toBe(true);
      expect(summary.topVulnerabilities).toHaveLength(3);
      // Critical should be first
      expect(summary.topVulnerabilities[0].severity).toBe('critical');
      // High should be second
      expect(summary.topVulnerabilities[1].severity).toBe('high');
    });

    test('limits top vulnerabilities to 5', () => {
      const securityDir = tempDir.createDir('security');

      // Copy all fixtures to get more than 5 vulnerabilities
      copyFileSync(
        getFixturePath('security/trivy.json'),
        join(securityDir, 'trivy.json')
      );
      copyFileSync(
        getFixturePath('security/snyk.json'),
        join(securityDir, 'snyk.json')
      );

      const analyzer = new SecurityAnalyzer(securityDir);
      const summary = analyzer.getSummary();

      expect(summary.topVulnerabilities.length).toBeLessThanOrEqual(5);
    });
  });

  describe('normalizeSeverity', () => {
    test('normalizes various severity strings', () => {
      const securityDir = tempDir.createDir('security');
      // Create a custom fixture with varied severity strings
      const customData = {
        Results: [{
          Vulnerabilities: [
            { VulnerabilityID: 'v1', Severity: 'CRITICAL', PkgName: 'a' },
            { VulnerabilityID: 'v2', Severity: 'HIGH', PkgName: 'b' },
            { VulnerabilityID: 'v3', Severity: 'MEDIUM', PkgName: 'c' },
            { VulnerabilityID: 'v4', Severity: 'moderate', PkgName: 'd' }, // npm uses moderate
            { VulnerabilityID: 'v5', Severity: 'LOW', PkgName: 'e' },
            { VulnerabilityID: 'v6', Severity: 'info', PkgName: 'f' }, // should normalize to low
          ]
        }]
      };
      tempDir.createFile('security/trivy-varied.json', JSON.stringify(customData));

      const analyzer = new SecurityAnalyzer(securityDir);
      const result = analyzer.analyze();

      expect(result.vulnerabilities.critical).toBe(1);
      expect(result.vulnerabilities.high).toBe(1);
      expect(result.vulnerabilities.medium).toBe(2); // MEDIUM + moderate
      expect(result.vulnerabilities.low).toBe(2); // LOW + info
    });
  });
});
