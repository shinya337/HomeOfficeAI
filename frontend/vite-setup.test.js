/**
 * Vite Configuration Tests
 *
 * TDD: RED phase - Write tests before implementation
 * Tests for Vite development server configuration (Task 4.1)
 *
 * Requirements covered:
 * - 5.2: Vite dev server on port 5173 with /api proxy to localhost:3001
 */

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('Vite Configuration', () => {
  describe('vite.config.js existence', () => {
    it('should have vite.config.js file', () => {
      const configPath = resolve(__dirname, 'vite.config.js');
      expect(existsSync(configPath)).toBe(true);
    });
  });

  describe('vite.config.js content', () => {
    it('should export valid configuration', async () => {
      const config = await import('./vite.config.js');
      expect(config.default).toBeDefined();
    });

    it('should configure server port as 5173', async () => {
      const config = await import('./vite.config.js');
      expect(config.default.server).toBeDefined();
      expect(config.default.server.port).toBe(5173);
    });

    it('should configure /api proxy to localhost:3001', async () => {
      const config = await import('./vite.config.js');
      expect(config.default.server.proxy).toBeDefined();
      expect(config.default.server.proxy['/api']).toBeDefined();
      expect(config.default.server.proxy['/api'].target).toBe('http://localhost:3001');
    });

    it('should set changeOrigin to true for /api proxy', async () => {
      const config = await import('./vite.config.js');
      expect(config.default.server.proxy['/api'].changeOrigin).toBe(true);
    });
  });

  describe('package.json configuration', () => {
    it('should have package.json file', () => {
      const packagePath = resolve(__dirname, 'package.json');
      expect(existsSync(packagePath)).toBe(true);
    });

    it('should have vite as a dependency or devDependency', () => {
      const packagePath = resolve(__dirname, 'package.json');
      const packageJson = JSON.parse(readFileSync(packagePath, 'utf-8'));
      const hasViteDep = packageJson.dependencies?.vite || packageJson.devDependencies?.vite;
      expect(hasViteDep).toBeDefined();
    });

    it('should have dev script that runs vite', () => {
      const packagePath = resolve(__dirname, 'package.json');
      const packageJson = JSON.parse(readFileSync(packagePath, 'utf-8'));
      expect(packageJson.scripts?.dev).toContain('vite');
    });

    it('should have vitest as a devDependency for testing', () => {
      const packagePath = resolve(__dirname, 'package.json');
      const packageJson = JSON.parse(readFileSync(packagePath, 'utf-8'));
      expect(packageJson.devDependencies?.vitest).toBeDefined();
    });

    it('should have test script that runs vitest', () => {
      const packagePath = resolve(__dirname, 'package.json');
      const packageJson = JSON.parse(readFileSync(packagePath, 'utf-8'));
      expect(packageJson.scripts?.test).toContain('vitest');
    });
  });
});
