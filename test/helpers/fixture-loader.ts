/**
 * Utilities for loading test fixtures
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FIXTURES_DIR = join(__dirname, '..', 'fixtures');

/**
 * Load a JSONL file and parse each line as JSON
 */
export function loadJsonlFixture<T>(relativePath: string): T[] {
  const fullPath = join(FIXTURES_DIR, relativePath);

  if (!existsSync(fullPath)) {
    throw new Error(`Fixture not found: ${relativePath}`);
  }

  const content = readFileSync(fullPath, 'utf-8');
  const lines = content.split('\n').filter(line => line.trim());
  const results: T[] = [];

  for (const line of lines) {
    try {
      results.push(JSON.parse(line) as T);
    } catch {
      // Skip malformed lines (this is intentional for testing error handling)
    }
  }

  return results;
}

/**
 * Load a JSON file
 */
export function loadJsonFixture<T>(relativePath: string): T {
  const fullPath = join(FIXTURES_DIR, relativePath);

  if (!existsSync(fullPath)) {
    throw new Error(`Fixture not found: ${relativePath}`);
  }

  const content = readFileSync(fullPath, 'utf-8');
  return JSON.parse(content) as T;
}

/**
 * Get the absolute path to a fixture file
 */
export function getFixturePath(relativePath: string): string {
  return join(FIXTURES_DIR, relativePath);
}

/**
 * Get the fixtures directory path
 */
export function getFixturesDir(): string {
  return FIXTURES_DIR;
}
