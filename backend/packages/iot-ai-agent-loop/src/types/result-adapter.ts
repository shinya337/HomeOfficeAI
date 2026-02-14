/**
 * Result型アダプター
 *
 * nature-remo の Result型 (success/data/error) を
 * vertex-ai-vision の Result型 (ok/value/error) に変換する。
 *
 * Requirements: 6.2
 */
import type { Result } from '../../../vertex-ai-vision/src/types/result.js';
import { ok, err } from '../../../vertex-ai-vision/src/types/result.js';

/**
 * nature-remo 形式の Result 型
 */
type NatureRemoResult<T, E> =
  | { success: true; data: T }
  | { success: false; error: E };

/**
 * nature-remo 形式の Result を ok/value/error 形式に変換する
 */
export function adaptNatureRemoResult<T, E>(result: NatureRemoResult<T, E>): Result<T, E> {
  if (result.success) {
    return ok(result.data);
  }
  return err(result.error);
}
