/**
 * Session Handler Tests
 *
 * TDD tests for session API endpoints.
 * Requirements: 1.2, 1.4, 1.6, 5.5, 3.1, 3.2, 3.4
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import express, { Express } from 'express';
import request from 'supertest';
import { createSessionRoutes, type SessionRouteDependencies } from './session-handler.js';
import {
  createSessionManager,
  SessionManagerService,
} from '../services/session-manager.js';
import { resetSessionManager } from '../server.js';
import type { Device } from '../types/device-types.js';

describe('Session Handler', () => {
  let app: Express;
  let sessionManager: SessionManagerService;
  let mockGetCachedDevices: () => readonly Device[] | null;

  const testDevices: readonly Device[] = [
    { id: 'device-1', name: 'Living Light', type: 'LIGHT' },
    { id: 'device-2', name: 'Bedroom AC', type: 'AC' },
    { id: 'device-3', name: 'TV', type: 'TV' },
  ];

  beforeEach(() => {
    // Reset shared session manager to avoid test pollution
    resetSessionManager();
    app = express();
    app.use(express.json());
    sessionManager = createSessionManager();
    mockGetCachedDevices = vi.fn(() => testDevices);
    const deps: SessionRouteDependencies = {
      sessionManager,
      getCachedDevices: mockGetCachedDevices,
    };
    app.use('/api/session', createSessionRoutes(deps));
  });

  afterEach(() => {
    // Clean up after each test
    resetSessionManager();
  });

  describe('POST /api/session/start', () => {
    it('should start a new session and return session data', async () => {
      const response = await request(app).post('/api/session/start').expect(200);

      expect(response.body).toHaveProperty('sessionId');
      expect(response.body.status).toBe('active');
      expect(response.body).toHaveProperty('startedAt');
      expect(response.body).not.toHaveProperty('endedAt');
    });

    it('should return Content-Type: application/json', async () => {
      const response = await request(app).post('/api/session/start').expect(200);

      expect(response.headers['content-type']).toMatch(/application\/json/);
    });

    it('should replace existing active session with new one', async () => {
      // Start first session
      const first = await request(app).post('/api/session/start').expect(200);

      // Start second session
      const second = await request(app).post('/api/session/start').expect(200);

      // Should have different session IDs
      expect(second.body.sessionId).not.toBe(first.body.sessionId);
      expect(second.body.status).toBe('active');
    });
  });

  describe('POST /api/session/end', () => {
    it('should end an active session and return ended session data', async () => {
      // Start a session first
      await request(app).post('/api/session/start').expect(200);

      // End the session
      const response = await request(app).post('/api/session/end').expect(200);

      expect(response.body).toHaveProperty('sessionId');
      expect(response.body.status).toBe('ended');
      expect(response.body).toHaveProperty('startedAt');
      expect(response.body).toHaveProperty('endedAt');
    });

    it('should return 400 error when no active session exists', async () => {
      const response = await request(app).post('/api/session/end').expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error.code).toBe('NO_ACTIVE_SESSION');
      expect(response.body.error.message).toBeDefined();
    });

    it('should return 400 error when trying to end already ended session', async () => {
      // Start and end a session
      await request(app).post('/api/session/start').expect(200);
      await request(app).post('/api/session/end').expect(200);

      // Try to end again
      const response = await request(app).post('/api/session/end').expect(400);

      expect(response.body.error.code).toBe('NO_ACTIVE_SESSION');
    });

    it('should return Content-Type: application/json for error responses', async () => {
      const response = await request(app).post('/api/session/end').expect(400);

      expect(response.headers['content-type']).toMatch(/application\/json/);
    });
  });

  describe('GET /api/session/status', () => {
    it('should return hasActiveSession: false when no session exists', async () => {
      const response = await request(app).get('/api/session/status').expect(200);

      expect(response.body.hasActiveSession).toBe(false);
      expect(response.body.session).toBeNull();
    });

    it('should return hasActiveSession: true with session data when active', async () => {
      // Start a session
      const startResponse = await request(app)
        .post('/api/session/start')
        .expect(200);

      const response = await request(app).get('/api/session/status').expect(200);

      expect(response.body.hasActiveSession).toBe(true);
      expect(response.body.session).not.toBeNull();
      expect(response.body.session.sessionId).toBe(startResponse.body.sessionId);
      expect(response.body.session.status).toBe('active');
    });

    it('should return hasActiveSession: false after session is ended', async () => {
      // Start and end a session
      await request(app).post('/api/session/start').expect(200);
      await request(app).post('/api/session/end').expect(200);

      const response = await request(app).get('/api/session/status').expect(200);

      expect(response.body.hasActiveSession).toBe(false);
      expect(response.body.session).toBeNull();
    });

    it('should return Content-Type: application/json', async () => {
      const response = await request(app).get('/api/session/status').expect(200);

      expect(response.headers['content-type']).toMatch(/application\/json/);
    });
  });

  describe('Error Handling', () => {
    it('should return 500 with JSON error for internal errors', async () => {
      // Create a mock session manager that throws errors
      const errorManager: SessionManagerService = {
        startSession: () => {
          throw new Error('Internal error');
        },
        endSession: () => {
          throw new Error('Internal error');
        },
        getStatus: () => {
          throw new Error('Internal error');
        },
        hasActiveSession: () => false,
        addRecentAction: () => {},
        getRecentActions: () => [],
      };

      const errorApp = express();
      errorApp.use(express.json());
      const errorDeps: SessionRouteDependencies = {
        sessionManager: errorManager,
        getCachedDevices: () => testDevices,
      };
      errorApp.use('/api/session', createSessionRoutes(errorDeps));

      const response = await request(errorApp)
        .post('/api/session/start')
        .expect(500);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toHaveProperty('code');
      expect(response.body.error).toHaveProperty('message');
      expect(response.headers['content-type']).toMatch(/application\/json/);
    });

    it('should return 500 for GET /status internal errors', async () => {
      const errorManager: SessionManagerService = {
        startSession: () => {
          throw new Error('Internal error');
        },
        endSession: () => ({ ok: false, error: { code: 'NO_ACTIVE_SESSION', message: 'error' } }),
        getStatus: () => {
          throw new Error('Internal error');
        },
        hasActiveSession: () => {
          throw new Error('Internal error');
        },
        addRecentAction: () => {},
        getRecentActions: () => [],
      };

      const errorApp = express();
      errorApp.use(express.json());
      const errorDeps: SessionRouteDependencies = {
        sessionManager: errorManager,
        getCachedDevices: () => testDevices,
      };
      errorApp.use('/api/session', createSessionRoutes(errorDeps));

      const response = await request(errorApp)
        .get('/api/session/status')
        .expect(500);

      expect(response.body).toHaveProperty('error');
      expect(response.headers['content-type']).toMatch(/application\/json/);
    });
  });

  /**
   * Tests for allowedDevices feature
   * Requirements: 3.1, 3.2, 3.4
   */
  describe('POST /api/session/start with allowedDeviceIds', () => {
    it('should accept allowedDeviceIds in request body and save to session', async () => {
      const response = await request(app)
        .post('/api/session/start')
        .send({ allowedDeviceIds: ['device-1', 'device-2'] })
        .expect(200);

      expect(response.body).toHaveProperty('sessionId');
      expect(response.body.status).toBe('active');
      expect(response.body).toHaveProperty('allowedDevices');
      expect(response.body.allowedDevices).toHaveLength(2);
      expect(response.body.allowedDevices).toContainEqual({ id: 'device-1', type: 'LIGHT' });
      expect(response.body.allowedDevices).toContainEqual({ id: 'device-2', type: 'AC' });
    });

    it('should return 400 with invalid device IDs when some IDs do not exist', async () => {
      const response = await request(app)
        .post('/api/session/start')
        .send({ allowedDeviceIds: ['device-1', 'invalid-id', 'another-invalid'] })
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error.code).toBe('INVALID_DEVICE_ID');
      expect(response.body.error).toHaveProperty('invalidIds');
      expect(response.body.error.invalidIds).toContain('invalid-id');
      expect(response.body.error.invalidIds).toContain('another-invalid');
      expect(response.body.error.invalidIds).not.toContain('device-1');
    });

    it('should allow empty allowedDeviceIds array (no device control)', async () => {
      const response = await request(app)
        .post('/api/session/start')
        .send({ allowedDeviceIds: [] })
        .expect(200);

      expect(response.body.status).toBe('active');
      expect(response.body.allowedDevices).toEqual([]);
    });

    it('should allow all devices when allowedDeviceIds is not specified (backward compatibility)', async () => {
      const response = await request(app)
        .post('/api/session/start')
        .send({})
        .expect(200);

      expect(response.body.status).toBe('active');
      // allowedDevices should be undefined when not specified (backward compatibility)
      expect(response.body.allowedDevices).toBeUndefined();
    });

    it('should validate device IDs against cached device list', async () => {
      // Mock no cached devices
      const noCacheApp = express();
      noCacheApp.use(express.json());
      const noCacheDeps: SessionRouteDependencies = {
        sessionManager: createSessionManager(),
        getCachedDevices: () => null,
      };
      noCacheApp.use('/api/session', createSessionRoutes(noCacheDeps));

      const response = await request(noCacheApp)
        .post('/api/session/start')
        .send({ allowedDeviceIds: ['device-1'] })
        .expect(503);

      expect(response.body.error.code).toBe('DEVICE_CACHE_UNAVAILABLE');
    });

    it('should include all requested valid device types in response', async () => {
      const response = await request(app)
        .post('/api/session/start')
        .send({ allowedDeviceIds: ['device-1', 'device-2', 'device-3'] })
        .expect(200);

      expect(response.body.allowedDevices).toHaveLength(3);
      const types = response.body.allowedDevices.map((d: { type: string }) => d.type);
      expect(types).toContain('LIGHT');
      expect(types).toContain('AC');
      expect(types).toContain('TV');
    });
  });

  describe('GET /api/session/status with allowedDevices', () => {
    it('should return allowedDevices in session status when session has them', async () => {
      // Start session with allowed devices
      await request(app)
        .post('/api/session/start')
        .send({ allowedDeviceIds: ['device-1'] })
        .expect(200);

      const statusResponse = await request(app)
        .get('/api/session/status')
        .expect(200);

      expect(statusResponse.body.hasActiveSession).toBe(true);
      expect(statusResponse.body.session).toHaveProperty('allowedDevices');
      expect(statusResponse.body.session.allowedDevices).toHaveLength(1);
      expect(statusResponse.body.session.allowedDevices[0]).toEqual({ id: 'device-1', type: 'LIGHT' });
    });

    it('should not include allowedDevices in status when session started without them', async () => {
      // Start session without allowed devices (backward compatibility)
      await request(app)
        .post('/api/session/start')
        .send({})
        .expect(200);

      const statusResponse = await request(app)
        .get('/api/session/status')
        .expect(200);

      expect(statusResponse.body.hasActiveSession).toBe(true);
      expect(statusResponse.body.session.allowedDevices).toBeUndefined();
    });
  });
});
