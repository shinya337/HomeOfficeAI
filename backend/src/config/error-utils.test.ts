import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { sanitizeErrorMessage } from './error-utils.js';

describe('sanitizeErrorMessage', () => {
  const originalEnv = process.env['NODE_ENV'];

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env['NODE_ENV'] = originalEnv;
    } else {
      delete process.env['NODE_ENV'];
    }
  });

  describe('production environment', () => {
    beforeEach(() => {
      process.env['NODE_ENV'] = 'production';
    });

    it('should return generic message for Error instance', () => {
      const error = new Error('secret database credentials leaked');
      expect(sanitizeErrorMessage(error)).toBe('サーバー内部エラーが発生しました。');
    });

    it('should return generic message for string error', () => {
      expect(sanitizeErrorMessage('some internal detail')).toBe('サーバー内部エラーが発生しました。');
    });

    it('should return generic message for null', () => {
      expect(sanitizeErrorMessage(null)).toBe('サーバー内部エラーが発生しました。');
    });

    it('should return generic message for undefined', () => {
      expect(sanitizeErrorMessage(undefined)).toBe('サーバー内部エラーが発生しました。');
    });

    it('should return generic message for number', () => {
      expect(sanitizeErrorMessage(42)).toBe('サーバー内部エラーが発生しました。');
    });
  });

  describe('development environment', () => {
    beforeEach(() => {
      process.env['NODE_ENV'] = 'development';
    });

    it('should return Error.message for Error instance', () => {
      const error = new Error('Connection refused');
      expect(sanitizeErrorMessage(error)).toBe('Connection refused');
    });

    it('should return String(value) for non-Error values', () => {
      expect(sanitizeErrorMessage('string-error')).toBe('string-error');
    });

    it('should return String(null) for null', () => {
      expect(sanitizeErrorMessage(null)).toBe('null');
    });
  });

  describe('test environment', () => {
    beforeEach(() => {
      process.env['NODE_ENV'] = 'test';
    });

    it('should return Error.message for Error instance', () => {
      const error = new Error('Test failure');
      expect(sanitizeErrorMessage(error)).toBe('Test failure');
    });

    it('should return String(value) for non-Error values', () => {
      expect(sanitizeErrorMessage('thrown-string')).toBe('thrown-string');
    });
  });

  describe('undefined NODE_ENV', () => {
    beforeEach(() => {
      delete process.env['NODE_ENV'];
    });

    it('should return Error.message for Error instance', () => {
      const error = new Error('No env set');
      expect(sanitizeErrorMessage(error)).toBe('No env set');
    });

    it('should return String(value) for non-Error values', () => {
      expect(sanitizeErrorMessage(12345)).toBe('12345');
    });
  });
});
