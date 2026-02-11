/**
 * Artifacts Analyzer
 *
 * Detects and analyzes spec-driven development artifacts:
 * - Specifications (PRDs, specs)
 * - ADRs (Architecture Decision Records)
 * - API schemas (OpenAPI, GraphQL)
 * - Test coverage reports
 */

import { existsSync, readdirSync, statSync } from 'fs';
import { join, extname } from 'path';

export interface ArtifactInfo {
  type: 'spec' | 'adr' | 'api_schema' | 'test_report' | 'coverage';
  path: string;
  name: string;
  size: number;
  modifiedAt: Date;
}

export interface ArtifactsAnalysisResult {
  specs: ArtifactInfo[];
  adrs: ArtifactInfo[];
  apiSchemas: ArtifactInfo[];
  testReports: ArtifactInfo[];
  coverageReports: ArtifactInfo[];
  specDrivenScore: number; // 0-5 score based on artifacts
  findings: string[];
}

export class ArtifactsAnalyzer {
  private projectRoot: string;

  constructor(projectRoot: string = process.cwd()) {
    this.projectRoot = projectRoot;
  }

  analyze(): ArtifactsAnalysisResult {
    const specs = this.findSpecs();
    const adrs = this.findADRs();
    const apiSchemas = this.findAPISchemas();
    const testReports = this.findTestReports();
    const coverageReports = this.findCoverageReports();
    const findings: string[] = [];

    // Calculate spec-driven score
    let score = 0;

    if (specs.length > 0) {
      score += 1;
      findings.push(`Found ${specs.length} specification documents`);
    } else {
      findings.push('No specification documents found - consider adding docs/specs/ or docs/prd/');
    }

    if (adrs.length > 0) {
      score += 1;
      findings.push(`Found ${adrs.length} ADRs documenting architectural decisions`);
    } else {
      findings.push('No ADRs found - consider adding docs/adr/ for decision records');
    }

    if (apiSchemas.length > 0) {
      score += 1;
      findings.push(`Found ${apiSchemas.length} API schema definitions`);
    }

    if (testReports.length > 0) {
      score += 1;
      findings.push(`Found ${testReports.length} test result files`);
    } else {
      findings.push('No test reports found - configure CI to output JUnit XML');
    }

    if (coverageReports.length > 0) {
      score += 1;
      findings.push(`Found ${coverageReports.length} coverage reports`);
    }

    return {
      specs,
      adrs,
      apiSchemas,
      testReports,
      coverageReports,
      specDrivenScore: score,
      findings,
    };
  }

  private findSpecs(): ArtifactInfo[] {
    const paths = [
      'docs/specs',
      'docs/prd',
      'docs/spec',
      'docs/specifications',
      'specs',
      '.flowspec/specs',
    ];
    return this.findArtifacts(paths, 'spec', ['.md', '.txt', '.yaml', '.yml']);
  }

  private findADRs(): ArtifactInfo[] {
    const paths = [
      'docs/adr',
      'docs/adrs',
      'docs/decisions',
      'adr',
      'ADR',
    ];
    return this.findArtifacts(paths, 'adr', ['.md', '.txt']);
  }

  private findAPISchemas(): ArtifactInfo[] {
    const paths = [
      'docs/api',
      'api',
      'schemas',
      'openapi',
    ];
    const artifacts = this.findArtifacts(paths, 'api_schema', ['.yaml', '.yml', '.json']);

    // Also search for openapi/swagger files in root
    const rootFiles = ['openapi.yaml', 'openapi.yml', 'openapi.json', 'swagger.yaml', 'swagger.json'];
    for (const file of rootFiles) {
      const fullPath = join(this.projectRoot, file);
      if (existsSync(fullPath)) {
        const stat = statSync(fullPath);
        artifacts.push({
          type: 'api_schema',
          path: fullPath,
          name: file,
          size: stat.size,
          modifiedAt: stat.mtime,
        });
      }
    }

    return artifacts;
  }

  private findTestReports(): ArtifactInfo[] {
    const paths = [
      'test-results',
      'test-reports',
      'coverage',
      'junit',
      '.pytest_cache',
    ];
    return this.findArtifacts(paths, 'test_report', ['.xml', '.json']);
  }

  private findCoverageReports(): ArtifactInfo[] {
    const paths = [
      'coverage',
      'htmlcov',
      '.nyc_output',
    ];
    const artifacts = this.findArtifacts(paths, 'coverage', ['.json', '.xml', '.html']);

    // Check for coverage files in root
    const rootFiles = ['coverage.json', '.coverage', 'lcov.info'];
    for (const file of rootFiles) {
      const fullPath = join(this.projectRoot, file);
      if (existsSync(fullPath)) {
        const stat = statSync(fullPath);
        artifacts.push({
          type: 'coverage',
          path: fullPath,
          name: file,
          size: stat.size,
          modifiedAt: stat.mtime,
        });
      }
    }

    return artifacts;
  }

  private findArtifacts(
    searchPaths: string[],
    type: ArtifactInfo['type'],
    extensions: string[]
  ): ArtifactInfo[] {
    const artifacts: ArtifactInfo[] = [];

    for (const searchPath of searchPaths) {
      const fullPath = join(this.projectRoot, searchPath);
      if (!existsSync(fullPath)) continue;

      try {
        const stat = statSync(fullPath);
        if (!stat.isDirectory()) continue;

        const files = readdirSync(fullPath);
        for (const file of files) {
          const ext = extname(file).toLowerCase();
          if (extensions.includes(ext)) {
            const filePath = join(fullPath, file);
            const fileStat = statSync(filePath);
            if (fileStat.isFile()) {
              artifacts.push({
                type,
                path: filePath,
                name: file,
                size: fileStat.size,
                modifiedAt: fileStat.mtime,
              });
            }
          }
        }
      } catch {
        // Skip directories we can't read
      }
    }

    return artifacts;
  }
}
