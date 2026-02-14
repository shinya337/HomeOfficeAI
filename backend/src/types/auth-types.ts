/**
 * Auth Types - Canonical Source for Authentication and Credential Types
 *
 * Defines all authentication-related type definitions including:
 * - AuthenticatedUser: Firebase Auth user information
 * - AuthenticatedRequest: Express Request extended with user field
 * - Credential API request/response types
 * - CredentialError and EncryptionError discriminated union types
 *
 * This module follows the canonical type source pattern.
 * Other modules should import from this file rather than redefining these types.
 *
 * Requirements: 3.1, 3.2
 */

import type { Request } from 'express';

// =============================================================================
// Authentication Types
// =============================================================================

/**
 * Authenticated user information extracted from Firebase ID token.
 * Attached to Express requests by the auth middleware.
 */
export interface AuthenticatedUser {
  readonly uid: string;
  readonly email: string | undefined;
  readonly displayName: string | undefined;
  readonly photoURL: string | undefined;
}

/**
 * Express Request extended with authenticated user information.
 * - `user` is set to AuthenticatedUser when a valid token is provided
 * - `user` is set to null for guest mode (no Authorization header)
 */
export interface AuthenticatedRequest extends Request {
  readonly user: AuthenticatedUser | null;
}

// =============================================================================
// Credential API Types
// =============================================================================

/**
 * Request body for saving an IoT credential (e.g., Nature Remo token).
 * Used with PUT /api/credentials/:service
 */
export interface SaveCredentialRequest {
  readonly token: string;
}

/**
 * Status of a single IoT credential (without exposing the token value).
 * Used in credential status responses.
 */
export interface CredentialStatus {
  readonly service: string;
  readonly configured: boolean;
  readonly updatedAt: string | undefined;
}

/**
 * Response for GET /api/credentials/status.
 * Returns the configuration status of all IoT credentials.
 */
export interface CredentialStatusResponse {
  readonly credentials: readonly CredentialStatus[];
}

// =============================================================================
// Error Types (Discriminated Unions)
// =============================================================================

/**
 * Error type for credential service operations.
 * Discriminated by the `code` field.
 */
export type CredentialError =
  | { readonly code: 'NOT_FOUND'; readonly message: string }
  | { readonly code: 'ENCRYPTION_ERROR'; readonly message: string }
  | { readonly code: 'FIRESTORE_ERROR'; readonly message: string };

/**
 * Error type for encryption service operations.
 * Discriminated by the `code` field.
 */
export type EncryptionError =
  | { readonly code: 'ENCRYPTION_FAILED'; readonly message: string }
  | { readonly code: 'DECRYPTION_FAILED'; readonly message: string }
  | { readonly code: 'INVALID_KEY'; readonly message: string };
