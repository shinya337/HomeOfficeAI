/**
 * Firebase SDK Setup Tests
 *
 * TDD: RED phase - Write tests before implementation
 * Tests for Firebase SDK integration in frontend (Task 1.2)
 *
 * Requirements covered:
 * - 1.1: Firebase SDK package installed in frontend
 * - Vite environment variables for Firebase configuration
 * - Vite optimizeDeps configuration for Firebase modules
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('Firebase SDK Setup (Task 1.2)', () => {
  describe('firebase package installation', () => {
    it('should have firebase as a dependency in package.json', () => {
      const packagePath = resolve(__dirname, 'package.json');
      const packageJson = JSON.parse(readFileSync(packagePath, 'utf-8'));
      const hasFirebase =
        packageJson.dependencies?.firebase ||
        packageJson.devDependencies?.firebase;
      expect(hasFirebase).toBeDefined();
    });

    it('should have firebase version ^12.9.0 or higher', () => {
      const packagePath = resolve(__dirname, 'package.json');
      const packageJson = JSON.parse(readFileSync(packagePath, 'utf-8'));
      const firebaseVersion =
        packageJson.dependencies?.firebase ||
        packageJson.devDependencies?.firebase;
      expect(firebaseVersion).toBeDefined();
      // Verify the major version is at least 12
      const majorMatch = firebaseVersion.match(/(\d+)/);
      expect(majorMatch).not.toBeNull();
      expect(Number(majorMatch[1])).toBeGreaterThanOrEqual(12);
    });
  });

  describe('Vite environment variables (.env.local)', () => {
    it('should have .env.local file with Firebase configuration placeholders', () => {
      const envPath = resolve(__dirname, '.env.local');
      const envContent = readFileSync(envPath, 'utf-8');
      expect(envContent).toBeDefined();
    });

    it('should define VITE_FIREBASE_API_KEY in .env.local', () => {
      const envPath = resolve(__dirname, '.env.local');
      const envContent = readFileSync(envPath, 'utf-8');
      expect(envContent).toContain('VITE_FIREBASE_API_KEY');
    });

    it('should define VITE_FIREBASE_AUTH_DOMAIN in .env.local', () => {
      const envPath = resolve(__dirname, '.env.local');
      const envContent = readFileSync(envPath, 'utf-8');
      expect(envContent).toContain('VITE_FIREBASE_AUTH_DOMAIN');
    });

    it('should define VITE_FIREBASE_PROJECT_ID in .env.local', () => {
      const envPath = resolve(__dirname, '.env.local');
      const envContent = readFileSync(envPath, 'utf-8');
      expect(envContent).toContain('VITE_FIREBASE_PROJECT_ID');
    });
  });

  describe('Vite optimizeDeps configuration', () => {
    it('should configure optimizeDeps in vite.config.js', async () => {
      const config = await import('./vite.config.js');
      expect(config.default.optimizeDeps).toBeDefined();
    });

    it('should include firebase/app in optimizeDeps.include', async () => {
      const config = await import('./vite.config.js');
      expect(config.default.optimizeDeps.include).toContain('firebase/app');
    });

    it('should include firebase/auth in optimizeDeps.include', async () => {
      const config = await import('./vite.config.js');
      expect(config.default.optimizeDeps.include).toContain('firebase/auth');
    });
  });
});
