/**
 * SignalResolver Tests
 *
 * Tests for the pure function module that resolves intent-based signal names
 * from a user's light signal list.
 * Requirements: 3.1, 3.3, 5.1, 5.2
 */
import { describe, it, expect } from 'vitest';
import {
  resolveRelaxSignal,
  resolveNormalSignal,
  signalToLabel,
} from './signal-resolver.js';

// =============================================================================
// resolveRelaxSignal Tests
// =============================================================================

describe('resolveRelaxSignal', () => {
  it('should return signal name containing "安らぎ"', () => {
    const signals = ['読書', '安らぎ', '家事'];
    expect(resolveRelaxSignal(signals)).toBe('安らぎ');
  });

  it('should return signal name containing "くつろぎ"', () => {
    const signals = ['読書', 'くつろぎモード', '家事'];
    expect(resolveRelaxSignal(signals)).toBe('くつろぎモード');
  });

  it('should return signal name containing "リラックス"', () => {
    const signals = ['リラックスタイム', '読書'];
    expect(resolveRelaxSignal(signals)).toBe('リラックスタイム');
  });

  it('should return signal name containing "おやすみ"', () => {
    const signals = ['通常', 'おやすみ'];
    expect(resolveRelaxSignal(signals)).toBe('おやすみ');
  });

  it('should prioritize keywords in order: 安らぎ > くつろぎ > リラックス > おやすみ', () => {
    const signals = ['おやすみモード', 'リラックスタイム', 'くつろぎ', '安らぎ'];
    expect(resolveRelaxSignal(signals)).toBe('安らぎ');
  });

  it('should return second priority keyword when first is not present', () => {
    const signals = ['リラックス', 'くつろぎ'];
    expect(resolveRelaxSignal(signals)).toBe('くつろぎ');
  });

  it('should return null when no relax keywords match', () => {
    const signals = ['読書', '家事', '通常'];
    expect(resolveRelaxSignal(signals)).toBeNull();
  });

  it('should return null for empty array', () => {
    expect(resolveRelaxSignal([])).toBeNull();
  });

  it('should match partial signal names (部分一致)', () => {
    const signals = ['夜の安らぎモード'];
    expect(resolveRelaxSignal(signals)).toBe('夜の安らぎモード');
  });

  it('should handle backward compatibility with existing "安らぎ" signal (Req 5.1)', () => {
    const signals = ['安らぎ', '通常', '読書', '家事'];
    expect(resolveRelaxSignal(signals)).toBe('安らぎ');
  });
});

// =============================================================================
// resolveNormalSignal Tests
// =============================================================================

describe('resolveNormalSignal', () => {
  it('should return signal name containing "通常"', () => {
    const signals = ['安らぎ', '通常', '読書'];
    expect(resolveNormalSignal(signals)).toBe('通常');
  });

  it('should return signal name containing "標準"', () => {
    const signals = ['読書', '標準モード'];
    expect(resolveNormalSignal(signals)).toBe('標準モード');
  });

  it('should return signal name containing "ノーマル"', () => {
    const signals = ['ノーマル', '読書'];
    expect(resolveNormalSignal(signals)).toBe('ノーマル');
  });

  it('should return signal name containing "全灯"', () => {
    const signals = ['安らぎ', '全灯'];
    expect(resolveNormalSignal(signals)).toBe('全灯');
  });

  it('should prioritize keywords in order: 通常 > 標準 > ノーマル > 全灯', () => {
    const signals = ['全灯モード', 'ノーマル', '標準', '通常'];
    expect(resolveNormalSignal(signals)).toBe('通常');
  });

  it('should return second priority keyword when first is not present', () => {
    const signals = ['ノーマル', '標準'];
    expect(resolveNormalSignal(signals)).toBe('標準');
  });

  it('should return null when no normal keywords match', () => {
    const signals = ['安らぎ', '読書', '家事'];
    expect(resolveNormalSignal(signals)).toBeNull();
  });

  it('should return null for empty array', () => {
    expect(resolveNormalSignal([])).toBeNull();
  });

  it('should match partial signal names (部分一致)', () => {
    const signals = ['通常の明るさ'];
    expect(resolveNormalSignal(signals)).toBe('通常の明るさ');
  });

  it('should handle backward compatibility with existing "通常" signal (Req 5.2)', () => {
    const signals = ['安らぎ', '通常', '読書', '家事'];
    expect(resolveNormalSignal(signals)).toBe('通常');
  });
});

// =============================================================================
// signalToLabel Tests
// =============================================================================

describe('signalToLabel', () => {
  it('should generate label with "モード" suffix', () => {
    expect(signalToLabel('安らぎ')).toBe('安らぎモード');
  });

  it('should generate label for any signal name', () => {
    expect(signalToLabel('読書')).toBe('読書モード');
  });

  it('should handle signal names already containing "モード"', () => {
    // Even if the signal name already has "モード", the function appends it
    // This is the defined contract
    expect(signalToLabel('くつろぎモード')).toBe('くつろぎモードモード');
  });

  it('should handle empty string', () => {
    expect(signalToLabel('')).toBe('モード');
  });
});
