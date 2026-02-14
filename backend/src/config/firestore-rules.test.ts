/**
 * Firestore Security Rules - Structure Validation Tests
 *
 * Validates that the firestore.rules file at the project root contains
 * the correct security rules for the users/{uid} collection and
 * users/{uid}/credentials/{credentialId} subcollection.
 *
 * These are structural/content validation tests. Full integration testing
 * with Firebase Emulator Suite is done separately.
 *
 * Requirements: 7.1
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const RULES_FILE_PATH = resolve(import.meta.dirname, '../../../firestore.rules');

describe('Firestore Security Rules', () => {
  let rulesContent: string;

  beforeAll(() => {
    rulesContent = readFileSync(RULES_FILE_PATH, 'utf-8');
  });

  // =========================================================================
  // File Structure
  // =========================================================================

  describe('file structure', () => {
    it('should exist at project root as firestore.rules', () => {
      expect(rulesContent).toBeDefined();
      expect(rulesContent.length).toBeGreaterThan(0);
    });

    it('should declare rules_version 2', () => {
      expect(rulesContent).toMatch(/rules_version\s*=\s*['"]2['"]/);
    });

    it('should contain a service cloud.firestore block', () => {
      expect(rulesContent).toMatch(/service\s+cloud\.firestore\s*\{/);
    });

    it('should contain a match /databases/{database}/documents block', () => {
      expect(rulesContent).toMatch(
        /match\s+\/databases\/\{database\}\/documents/
      );
    });
  });

  // =========================================================================
  // users/{uid} Document Rules
  // =========================================================================

  describe('users/{uid} document rules', () => {
    it('should contain a match rule for users/{uid}', () => {
      expect(rulesContent).toMatch(/match\s+\/users\/\{uid\}/);
    });

    it('should restrict read access to authenticated owner only', () => {
      // The rules should check request.auth != null AND request.auth.uid == uid
      expect(rulesContent).toContain('request.auth');
      expect(rulesContent).toContain('request.auth.uid == uid');
    });

    it('should restrict write access to authenticated owner only', () => {
      // Write access should require authentication and ownership via isOwner helper
      // The allow statement uses isOwner(uid) which encapsulates request.auth checks
      expect(rulesContent).toMatch(
        /allow\s+read,\s*write:\s*if\s+isOwner\(uid\)/
      );
    });
  });

  // =========================================================================
  // users/{uid}/credentials/{credentialId} Subcollection Rules
  // =========================================================================

  describe('users/{uid}/credentials/{credentialId} subcollection rules', () => {
    it('should contain a match rule for credentials subcollection', () => {
      expect(rulesContent).toMatch(
        /match\s+\/credentials\/\{credentialId\}/
      );
    });

    it('should restrict credentials access to authenticated owner only', () => {
      // The subcollection should inherit or explicitly check uid ownership
      // Since it's nested under users/{uid}, the uid variable should be available
      expect(rulesContent).toContain('request.auth.uid == uid');
    });
  });

  // =========================================================================
  // Default Deny
  // =========================================================================

  describe('default deny policy', () => {
    it('should deny all access by default (no global allow rules)', () => {
      // Should NOT contain a blanket allow rule at the root level
      // e.g., "allow read, write: if true" or "allow read, write;"
      expect(rulesContent).not.toMatch(
        /allow\s+(read|write),?\s*(read|write)?.*:\s*if\s+true/
      );
    });

    it('should not contain any rules allowing unauthenticated access', () => {
      // Every "allow" statement should reference isOwner() or request.auth directly
      // isOwner() encapsulates request.auth != null && request.auth.uid == uid
      const allowStatements = rulesContent.match(/allow\s+[^;]+;/g) ?? [];
      expect(allowStatements.length).toBeGreaterThan(0);
      for (const stmt of allowStatements) {
        const hasAuthCheck =
          stmt.includes('request.auth') || stmt.includes('isOwner');
        expect(hasAuthCheck).toBe(true);
      }
    });
  });

  // =========================================================================
  // Helper Function (isOwner)
  // =========================================================================

  describe('ownership helper', () => {
    it('should define an isOwner helper function for readability', () => {
      // Best practice: define a function like isOwner() to encapsulate the auth check
      expect(rulesContent).toMatch(
        /function\s+isOwner\s*\(/
      );
    });

    it('should check both authentication and uid match in isOwner', () => {
      // The isOwner function should verify request.auth != null && request.auth.uid == uid
      expect(rulesContent).toMatch(
        /request\.auth\s*!=\s*null\s*&&\s*request\.auth\.uid\s*==\s*uid/
      );
    });
  });
});
