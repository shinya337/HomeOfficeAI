import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '..');

describe('TypeScript Project Setup', () => {
  describe('package.json', () => {
    it('should have type set to module for ES Modules support', () => {
      const packageJson = JSON.parse(
        readFileSync(resolve(projectRoot, 'package.json'), 'utf-8')
      );
      expect(packageJson.type).toBe('module');
    });

    it('should have required dependencies', () => {
      const packageJson = JSON.parse(
        readFileSync(resolve(projectRoot, 'package.json'), 'utf-8')
      );
      expect(packageJson.dependencies).toHaveProperty('dotenv');
      expect(packageJson.devDependencies).toHaveProperty('typescript');
      expect(packageJson.devDependencies).toHaveProperty('tsx');
    });

    it('should require Node.js 22+', () => {
      const packageJson = JSON.parse(
        readFileSync(resolve(projectRoot, 'package.json'), 'utf-8')
      );
      expect(packageJson.engines?.node).toMatch(/>=\s*22/);
    });
  });

  describe('tsconfig.json', () => {
    it('should have strict mode enabled', () => {
      const tsconfig = JSON.parse(
        readFileSync(resolve(projectRoot, 'tsconfig.json'), 'utf-8')
      );
      expect(tsconfig.compilerOptions.strict).toBe(true);
    });

    it('should use ES Modules configuration', () => {
      const tsconfig = JSON.parse(
        readFileSync(resolve(projectRoot, 'tsconfig.json'), 'utf-8')
      );
      expect(tsconfig.compilerOptions.module).toMatch(/node/i);
      expect(tsconfig.compilerOptions.moduleResolution).toMatch(/node/i);
    });

    it('should target modern JavaScript', () => {
      const tsconfig = JSON.parse(
        readFileSync(resolve(projectRoot, 'tsconfig.json'), 'utf-8')
      );
      // ES2020 or higher
      expect(tsconfig.compilerOptions.target).toMatch(/ES20(2[0-9]|[3-9][0-9])/);
    });
  });

  describe('Project structure', () => {
    it('should have src directory', () => {
      expect(existsSync(resolve(projectRoot, 'src'))).toBe(true);
    });

    it('should have an index entry point', () => {
      expect(existsSync(resolve(projectRoot, 'src/index.ts'))).toBe(true);
    });
  });
});
