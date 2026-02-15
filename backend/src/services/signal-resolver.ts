/**
 * SignalResolver
 *
 * Pure function module that resolves intent-based signal names from a user's
 * light signal list. Used by ActionDispatcher to find appropriate signals
 * for orchestrated modes (break_mode, focus_mode).
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4, 5.1, 5.2
 */

// =============================================================================
// Keywords (priority order)
// =============================================================================

/** Relax-intent keywords in priority order */
const RELAX_KEYWORDS: readonly string[] = ['安らぎ', 'くつろぎ', 'リラックス', 'おやすみ'];

/** Normal-intent keywords in priority order */
const NORMAL_KEYWORDS: readonly string[] = ['通常', '標準', 'ノーマル', '全灯'];

// =============================================================================
// Resolver Functions
// =============================================================================

/**
 * Find the first signal matching any keyword in priority order.
 * Uses partial matching (signal.includes(keyword)).
 * When multiple keywords match, the keyword with highest priority wins.
 */
function resolveByKeywords(
  signals: readonly string[],
  keywords: readonly string[]
): string | null {
  for (const keyword of keywords) {
    const matched = signals.find((signal) => signal.includes(keyword));
    if (matched !== undefined) {
      return matched;
    }
  }
  return null;
}

/**
 * Resolve a relax-intent signal from the user's signal list.
 * Keywords (priority order): 安らぎ, くつろぎ, リラックス, おやすみ
 *
 * @param signals - User's light custom signal names
 * @returns Matched signal name, or null if no match (caller decides fallback)
 */
export function resolveRelaxSignal(signals: readonly string[]): string | null {
  return resolveByKeywords(signals, RELAX_KEYWORDS);
}

/**
 * Resolve a normal-intent signal from the user's signal list.
 * Keywords (priority order): 通常, 標準, ノーマル, 全灯
 *
 * @param signals - User's light custom signal names
 * @returns Matched signal name, or null if no match (caller decides fallback)
 */
export function resolveNormalSignal(signals: readonly string[]): string | null {
  return resolveByKeywords(signals, NORMAL_KEYWORDS);
}

/**
 * Generate a UI display label from a signal name.
 *
 * @param signalName - Signal name
 * @returns Label in "{signalName}モード" format
 */
export function signalToLabel(signalName: string): string {
  return `${signalName}モード`;
}
