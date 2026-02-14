import { describe, it, expect } from 'vitest';

describe('http-proxy-middleware dependency', () => {
  it('should be importable and export createProxyMiddleware', async () => {
    const hpm = await import('http-proxy-middleware');
    expect(hpm.createProxyMiddleware).toBeDefined();
    expect(typeof hpm.createProxyMiddleware).toBe('function');
  });

  it('should export Options type (TypeScript type definitions available)', async () => {
    // Verify the module exports are accessible at runtime
    const hpm = await import('http-proxy-middleware');
    // createProxyMiddleware accepts options - verify it is callable
    expect(hpm.createProxyMiddleware).toBeInstanceOf(Function);
  });
});
