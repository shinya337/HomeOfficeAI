/**
 * Result型アダプターのテスト
 *
 * nature-remo の Result型 (success/data/error) を
 * vertex-ai-vision の Result型 (ok/value/error) に変換する。
 *
 * Requirements: 6.2, 6.3
 */
import { describe, it, expect } from 'vitest';
import { adaptNatureRemoResult } from './result-adapter.js';
import { isOk, isErr } from '../../../vertex-ai-vision/src/types/result.js';

describe('adaptNatureRemoResult', () => {
  describe('成功ケース', () => {
    it('success:true の結果を ok:true に変換すること', () => {
      const natureRemoResult = { success: true as const, data: 'test-data' };
      const result = adaptNatureRemoResult(natureRemoResult);

      expect(result.ok).toBe(true);
      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value).toBe('test-data');
      }
    });

    it('オブジェクト値を正しく変換すること', () => {
      const data = { id: '123', name: 'エアコン' };
      const natureRemoResult = { success: true as const, data };
      const result = adaptNatureRemoResult(natureRemoResult);

      expect(result.ok).toBe(true);
      if (isOk(result)) {
        expect(result.value).toEqual(data);
      }
    });

    it('配列値を正しく変換すること', () => {
      const data = [1, 2, 3];
      const natureRemoResult = { success: true as const, data };
      const result = adaptNatureRemoResult(natureRemoResult);

      expect(result.ok).toBe(true);
      if (isOk(result)) {
        expect(result.value).toEqual([1, 2, 3]);
      }
    });
  });

  describe('失敗ケース', () => {
    it('success:false の結果を ok:false に変換すること', () => {
      const error = { code: 'API_ERROR' as const, message: 'API呼び出しに失敗' };
      const natureRemoResult = { success: false as const, error };
      const result = adaptNatureRemoResult(natureRemoResult);

      expect(result.ok).toBe(false);
      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error).toEqual(error);
      }
    });

    it('RATE_LIMIT エラーを正しく変換すること', () => {
      const error = { code: 'RATE_LIMIT' as const, message: 'レート制限' };
      const natureRemoResult = { success: false as const, error };
      const result = adaptNatureRemoResult(natureRemoResult);

      expect(result.ok).toBe(false);
      if (isErr(result)) {
        expect(result.error.code).toBe('RATE_LIMIT');
      }
    });
  });

  describe('型互換性', () => {
    it('変換結果が vertex-ai-vision の isOk/isErr で判定できること', () => {
      const successResult = adaptNatureRemoResult({
        success: true as const,
        data: 42,
      });
      const failResult = adaptNatureRemoResult({
        success: false as const,
        error: { code: 'UNKNOWN' as const, message: 'unknown' },
      });

      expect(isOk(successResult)).toBe(true);
      expect(isErr(successResult)).toBe(false);
      expect(isOk(failResult)).toBe(false);
      expect(isErr(failResult)).toBe(true);
    });
  });
});
