/**
 * Tests for Firebase Admin SDK initialization service
 *
 * Validates the singleton get/reset pattern for Firebase services,
 * following the same pattern as getApplianceService / resetApplianceService.
 *
 * Requirements: 3.1
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Use vi.hoisted to create mocks that are available in vi.mock factories
const {
  mockApplicationDefault,
  mockInitializeApp,
  mockGetAuth,
  mockGetFirestore,
} = vi.hoisted(() => {
  const mockApp = { name: '[DEFAULT]' };
  const mockAuth = { verifyIdToken: vi.fn() };
  const mockFirestore = { collection: vi.fn(), doc: vi.fn() };
  const mockApplicationDefault = vi.fn(() => ({ type: 'adc' }));
  const mockInitializeApp = vi.fn(() => mockApp);
  const mockGetAuth = vi.fn(() => mockAuth);
  const mockGetFirestore = vi.fn(() => mockFirestore);

  return {
    mockApplicationDefault,
    mockInitializeApp,
    mockGetAuth,
    mockGetFirestore,
  };
});

// Mock firebase-admin modular subpath imports
vi.mock('firebase-admin/app', () => ({
  initializeApp: mockInitializeApp,
  applicationDefault: mockApplicationDefault,
}));

vi.mock('firebase-admin/auth', () => ({
  getAuth: mockGetAuth,
}));

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: mockGetFirestore,
}));

// Import after mock setup
import {
  initializeFirebaseServices,
  getFirebaseServices,
  resetFirebaseServices,
} from './firebase-config.js';

describe('firebase-config', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.GOOGLE_CLOUD_PROJECT = 'test-project-id';
    // Reset singleton state before each test
    resetFirebaseServices();
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('initializeFirebaseServices', () => {
    it('should initialize Firebase Admin app with ADC and project ID', () => {
      const services = initializeFirebaseServices();

      expect(mockInitializeApp).toHaveBeenCalledWith({
        credential: expect.anything(),
        projectId: 'test-project-id',
      });
      expect(services).toBeDefined();
      expect(services.app).toBeDefined();
      expect(services.auth).toBeDefined();
      expect(services.firestore).toBeDefined();
    });

    it('should use GOOGLE_CLOUD_PROJECT environment variable for projectId', () => {
      process.env.GOOGLE_CLOUD_PROJECT = 'my-custom-project';

      initializeFirebaseServices();

      expect(mockInitializeApp).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: 'my-custom-project',
        })
      );
    });

    it('should call applicationDefault() for ADC credential', () => {
      initializeFirebaseServices();

      expect(mockApplicationDefault).toHaveBeenCalled();
    });

    it('should call getAuth with the initialized app', () => {
      const services = initializeFirebaseServices();

      expect(mockGetAuth).toHaveBeenCalledWith(services.app);
    });

    it('should call getFirestore with the initialized app', () => {
      const services = initializeFirebaseServices();

      expect(mockGetFirestore).toHaveBeenCalledWith(services.app);
    });

    it('should throw an error when GOOGLE_CLOUD_PROJECT is not set', () => {
      delete process.env.GOOGLE_CLOUD_PROJECT;

      expect(() => initializeFirebaseServices()).toThrow(
        'GOOGLE_CLOUD_PROJECT'
      );
    });

    it('should throw an error when GOOGLE_CLOUD_PROJECT is empty', () => {
      process.env.GOOGLE_CLOUD_PROJECT = '';

      expect(() => initializeFirebaseServices()).toThrow(
        'GOOGLE_CLOUD_PROJECT'
      );
    });

    it('should throw an error when GOOGLE_CLOUD_PROJECT is whitespace only', () => {
      process.env.GOOGLE_CLOUD_PROJECT = '   ';

      expect(() => initializeFirebaseServices()).toThrow(
        'GOOGLE_CLOUD_PROJECT'
      );
    });
  });

  describe('getFirebaseServices - singleton pattern', () => {
    it('should return the same instance on consecutive calls', () => {
      const first = getFirebaseServices();
      const second = getFirebaseServices();

      expect(first).toBe(second);
      // initializeApp should only be called once (lazy init on first get)
      expect(mockInitializeApp).toHaveBeenCalledTimes(1);
    });

    it('should lazily initialize on first call', () => {
      expect(mockInitializeApp).not.toHaveBeenCalled();

      getFirebaseServices();

      expect(mockInitializeApp).toHaveBeenCalledTimes(1);
    });

    it('should return services with app, auth, and firestore', () => {
      const services = getFirebaseServices();

      expect(services).toHaveProperty('app');
      expect(services).toHaveProperty('auth');
      expect(services).toHaveProperty('firestore');
    });
  });

  describe('resetFirebaseServices', () => {
    it('should allow re-initialization after reset', () => {
      getFirebaseServices();
      resetFirebaseServices();
      getFirebaseServices();

      // Should be re-initialized (2 calls)
      expect(mockInitializeApp).toHaveBeenCalledTimes(2);
    });

    it('should not throw when called before any initialization', () => {
      expect(() => resetFirebaseServices()).not.toThrow();
    });

    it('should not throw when called multiple times', () => {
      getFirebaseServices();
      resetFirebaseServices();
      expect(() => resetFirebaseServices()).not.toThrow();
    });
  });

  describe('FirebaseServices interface', () => {
    it('should provide readonly app property', () => {
      const services = getFirebaseServices();

      expect(services.app).toBeDefined();
      expect(services.app.name).toBe('[DEFAULT]');
    });

    it('should provide readonly auth property with verifyIdToken', () => {
      const services = getFirebaseServices();

      expect(services.auth).toBeDefined();
      expect(typeof services.auth.verifyIdToken).toBe('function');
    });

    it('should provide readonly firestore property', () => {
      const services = getFirebaseServices();

      expect(services.firestore).toBeDefined();
      expect(typeof services.firestore.collection).toBe('function');
    });
  });
});
