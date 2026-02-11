# Testing Guide

This document describes the test suite for the Agentic Retrospective tool.

## Quick Start

```bash
# Run all tests
pnpm test

# Run specific test suites
pnpm test:unit         # Unit tests (139 tests)
pnpm test:integration  # Integration tests (53 tests)
pnpm test:snapshot     # Snapshot tests (6 tests)
pnpm test:e2e          # Self-validation tests (9 tests)

# Run with coverage
pnpm test:coverage

# Watch mode (development)
pnpm test:watch

# Full validation (lint + typecheck + tests)
pnpm run validate
```

---

## Test Structure

```
test/
├── fixtures/           # Test data
│   ├── decisions/      # Decision log JSONL files
│   ├── feedback/       # Feedback log JSONL files
│   ├── git/           # Git commit scenarios
│   │   ├── commits.ts
│   │   └── scenarios.ts
│   ├── security/      # Security scan JSON files
│   │   ├── trivy.json
│   │   ├── npm-audit.json
│   │   └── snyk.json
│   └── tools/         # Tool usage JSONL files
├── helpers/           # Test utilities
│   ├── fixture-loader.ts
│   ├── git-mock.ts
│   └── temp-dir.ts
├── unit/              # Unit tests
│   ├── analyzers/
│   └── scoring/
├── integration/       # Integration tests
├── snapshot/          # Snapshot tests
└── e2e/              # End-to-end tests
```

---

## Unit Tests (139 tests)

Unit tests verify individual analyzers and scoring functions in isolation.

### Analyzer Tests

| File | Tests | Description |
|------|-------|-------------|
| `decisions.test.ts` | 25 | Decision parsing, categorization, risk analysis |
| `git.test.ts` | 18 | Commit parsing, hotspots, agent detection |
| `github.test.ts` | 10 | PR analysis, bottleneck detection |
| `human-insights.test.ts` | 20 | Prompt patterns, feedback analysis |
| `rework.test.ts` | 15 | Fix chain detection, rework metrics |
| `security.test.ts` | 11 | Trivy/npm audit/Snyk parsing |
| `tools.test.ts` | 12 | Tool usage analysis |

### Scoring Tests

| File | Tests | Description |
|------|-------|-------------|
| `rubrics.test.ts` | 28 | All scoring functions with edge cases |

### Running Unit Tests

```bash
# All unit tests
pnpm test:unit

# Specific analyzer
pnpm test test/unit/analyzers/decisions.test.ts

# With coverage
pnpm test:unit -- --coverage
```

---

## Integration Tests (53 tests)

Integration tests verify the full pipeline with real git repositories.

### Test Files

| File | Tests | Description |
|------|-------|-------------|
| `runner.test.ts` | 13 | Full pipeline with various data sources |
| `graceful-degradation.test.ts` | 21 | Handling missing/malformed data |
| `cli.test.ts` | 19 | CLI commands end-to-end |

### Key Scenarios

**runner.test.ts:**
- Git-only scenarios (no decisions/logs)
- Git + decisions scenarios
- All sources scenarios
- Output file verification
- Alert generation

**graceful-degradation.test.ts:**
- Missing decisions directory
- Missing agent logs
- Missing test results
- Missing security scans
- Malformed JSONL files
- Empty directories
- Edge cases (single commit, unicode paths)

**cli.test.ts:**
- Default run produces output files
- `--json` flag skips markdown
- `--sprint` flag sets custom ID
- `--output` flag changes directory
- `feedback` command creates files
- Error handling

### Running Integration Tests

```bash
# All integration tests
pnpm test:integration

# Specific test file
pnpm test test/integration/runner.test.ts
```

---

## Snapshot Tests (6 tests)

Snapshot tests verify report structure remains consistent.

### What's Tested

| Snapshot | Description |
|----------|-------------|
| `section-headers` | Markdown section headers |
| `code-hotspots-section` | Hotspots table format |
| `action-items-section` | Action items table format |
| `scoring-table` | Scores summary table format |

### Updating Snapshots

```bash
# Update all snapshots
pnpm test:snapshot -- -u

# Update specific snapshot file
pnpm test test/snapshot/report-structure.test.ts -- -u
```

---

## E2E Self-Validation Tests (9 tests)

Runs the retrospective tool against its own repository to validate real-world behavior.

### What's Validated

| Test | Description |
|------|-------------|
| Valid report generation | Tool produces complete report |
| Commit data extraction | Summary contains real commits |
| Score calculation | Delivery/quality scores are calculated |
| Git metrics population | Hotspots and file distribution |
| Evidence map building | Commits indexed correctly |
| Output file creation | All expected files generated |
| Metadata correctness | Version and schema info |
| Graceful degradation | Handles missing optional data |

### Running E2E Tests

```bash
pnpm test:e2e
```

---

## Test Fixtures

### Decision Fixtures

```
test/fixtures/decisions/
├── minimal.jsonl       # Single valid decision
├── full.jsonl          # All fields populated
├── one-way-doors.jsonl # All one-way-door decisions
├── mixed-actors.jsonl  # Human, agent, system actors
└── malformed.jsonl     # Invalid JSON lines for error handling
```

**Example fixture:**
```jsonl
{"ts":"2026-02-01T10:00:00Z","decision":"Use PostgreSQL","actor":"human","decision_type":"one_way_door","category":"data"}
{"ts":"2026-02-01T11:00:00Z","decision":"Add caching","actor":"agent","decision_type":"two_way_door","category":"architecture"}
```

### Security Fixtures

```
test/fixtures/security/
├── trivy.json     # Trivy container scan output
├── npm-audit.json # npm audit --json output
└── snyk.json      # snyk test --json output
```

### Git Scenarios

Located in `test/fixtures/git/scenarios.ts`:

| Scenario | Commits | Description |
|----------|---------|-------------|
| empty | 0 | No commits |
| single | 5 | Single contributor |
| multi | 15 | Multiple contributors |
| large | 8 | Large commits (>200 lines) |
| drift | 12 | Scope drift pattern |

---

## Test Helpers

### TempDir

Creates temporary directories for integration tests.

```typescript
import { createTempDir, type TempDir } from '../helpers/temp-dir.js';

const tempDir = createTempDir('test-prefix-');
tempDir.createFile('path/to/file.ts', 'content');
tempDir.createDir('some/directory');
tempDir.cleanup(); // Remove temp directory
```

### GitMock

Creates mock git analyzers with predefined results.

```typescript
import { createMockGitAnalyzer, createMockGitResult } from '../helpers/git-mock.js';

const mockAnalyzer = createMockGitAnalyzer(commits);
const mockResult = createMockGitResult({ commits: [...] });
```

### FixtureLoader

Loads JSONL fixture files.

```typescript
import { loadJsonlFixture, loadJsonFixture } from '../helpers/fixture-loader.js';

const decisions = loadJsonlFixture('decisions/full.jsonl');
const trivyScan = loadJsonFixture('security/trivy.json');
```

---

## Coverage Configuration

Coverage is configured in `vitest.config.ts`:

```typescript
coverage: {
  provider: 'v8',
  reporter: ['text', 'json', 'html'],
  exclude: ['test/**', 'dist/**', 'node_modules/**', '*.config.*'],
  thresholds: {
    lines: 60,
    branches: 50,
    functions: 60,
    statements: 60,
  },
}
```

### Viewing Coverage

```bash
# Generate coverage report
pnpm test:coverage

# Open HTML report
open coverage/index.html
```

---

## Test Configuration

### vitest.config.ts

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.test.ts'],
    pool: 'forks',  // Required for process.chdir() in integration tests
    poolOptions: {
      forks: { singleFork: true },
    },
    testTimeout: 30000,
    reporters: ['verbose'],
  },
});
```

### Why `pool: 'forks'`?

Integration tests use `process.chdir()` to change to temporary directories. This is not supported in Vitest's default `threads` pool, so we use `forks` instead.

---

## Writing New Tests

### Unit Test Template

```typescript
import { describe, test, expect } from 'vitest';
import { MyAnalyzer } from '../../../src/analyzers/my-analyzer.js';

describe('MyAnalyzer', () => {
  describe('analyze', () => {
    test('handles empty input', () => {
      const analyzer = new MyAnalyzer();
      const result = analyzer.analyze([]);

      expect(result.items).toHaveLength(0);
    });

    test('calculates metrics correctly', () => {
      const analyzer = new MyAnalyzer();
      const result = analyzer.analyze(testData);

      expect(result.metric).toBe(42);
    });
  });
});
```

### Integration Test Template

```typescript
import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { execSync } from 'child_process';
import { createTempDir, type TempDir } from '../helpers/temp-dir.js';
import { runRetro } from '../../src/runner.js';

describe('My Integration Test', () => {
  let tempDir: TempDir;
  let originalCwd: string;

  beforeEach(() => {
    tempDir = createTempDir('my-test-');
    originalCwd = process.cwd();
    process.chdir(tempDir.path);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    tempDir.cleanup();
  });

  function initGitRepo(): void {
    execSync('git init', { cwd: tempDir.path, stdio: 'pipe' });
    execSync('git config user.email "test@test.com"', { cwd: tempDir.path, stdio: 'pipe' });
    execSync('git config user.name "Test"', { cwd: tempDir.path, stdio: 'pipe' });
  }

  test('scenario name', async () => {
    initGitRepo();
    // Test implementation
  });
});
```

---

## Debugging Tests

### Run Single Test

```bash
# By test name pattern
pnpm test -t "handles empty input"

# By file
pnpm test test/unit/analyzers/decisions.test.ts
```

### Verbose Output

```bash
pnpm test -- --reporter=verbose
```

### Debug Mode

```bash
# Add debugger statement in test
# Then run:
node --inspect-brk ./node_modules/vitest/vitest.mjs run
```

---

## CI Integration

Tests run automatically in CI via GitHub Actions:

```yaml
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'
      - run: pnpm install
      - run: pnpm run validate
```

The `validate` script runs:
1. `pnpm run lint` - ESLint
2. `pnpm run typecheck` - TypeScript
3. `pnpm run test` - All tests

---

## ESLint Configuration

ESLint is configured with TypeScript support in `.eslintrc.json`:

```json
{
  "root": true,
  "parser": "@typescript-eslint/parser",
  "plugins": ["@typescript-eslint"],
  "extends": [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended"
  ],
  "rules": {
    "@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_" }],
    "@typescript-eslint/no-explicit-any": "warn",
    "no-console": "off"
  },
  "ignorePatterns": ["dist/**", "node_modules/**", "coverage/**", "test-output/**"]
}
```

### Key Rules

- **no-unused-vars**: Errors on unused variables, but allows `_` prefix for intentionally unused parameters
- **no-explicit-any**: Warns on `any` type usage (prefer explicit types)
- **no-console**: Disabled (console output is expected in CLI tools)
