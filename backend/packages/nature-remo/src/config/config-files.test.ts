import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '../..');
const repoRoot = resolve(projectRoot, '../../..');

describe('Configuration Files', () => {
  describe('.env.example (deleted - consolidated to backend/.env.sample)', () => {
    it('should NOT exist (removed in project cleanup)', () => {
      expect(existsSync(resolve(projectRoot, '.env.example'))).toBe(false);
    });

    it('should have central .env.sample in backend', () => {
      expect(existsSync(resolve(repoRoot, 'backend/.env.sample'))).toBe(true);
    });
  });

  describe('.gitignore (managed at repository root)', () => {
    it('should exist at repository root', () => {
      expect(existsSync(resolve(repoRoot, '.gitignore'))).toBe(true);
    });

    it('should exclude .env files from git at repository root', () => {
      const content = readFileSync(resolve(repoRoot, '.gitignore'), 'utf-8');
      expect(content).toContain('.env');
    });

    it('should exclude node_modules from git at repository root', () => {
      const content = readFileSync(resolve(repoRoot, '.gitignore'), 'utf-8');
      expect(content).toContain('node_modules');
    });
  });
});
