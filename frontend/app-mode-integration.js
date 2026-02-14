/**
 * App Mode Display Integration Module
 *
 * Provides helper functions for extracting mode information from
 * analysis results and integrating with the mode-display module.
 *
 * Requirement: 5.3 (real-time update of analysis results)
 */

/**
 * Tool names that represent mode actions
 * @type {readonly string[]}
 */
export const MODE_TOOL_NAMES = [
  'focus_mode',
  'break_mode',
  'away_mode',
  'wake_mode',
];

/**
 * Map from tool name suffix to mode key
 * @type {Object.<string, string>}
 */
const TOOL_TO_MODE = {
  focus_mode: 'focus',
  break_mode: 'break',
  away_mode: 'away',
  wake_mode: 'nap',
};

/**
 * Map from mode key to user state text in Japanese
 * @type {Object.<string, string>}
 */
const MODE_TO_USER_STATE = {
  focus: '作業中',
  break: '休憩中',
  away: '離席',
  wake: '作業中',
  nap: '仮眠中',
};

/**
 * Extract mode from analysis result.
 * Checks both the primary action and the actions array for mode tool names.
 *
 * @param {Object} result - Analysis result from API
 * @returns {string|null} Mode key (focus/break/away/wake) or null if no mode action
 */
export function extractModeFromResult(result) {
  // Check primary action first
  const primaryTool = result.action?.tool;
  if (primaryTool && TOOL_TO_MODE[primaryTool]) {
    return TOOL_TO_MODE[primaryTool];
  }

  // Check actions array for mode actions
  const actions = result.actions || [];
  for (const action of actions) {
    if (action.tool && TOOL_TO_MODE[action.tool]) {
      return TOOL_TO_MODE[action.tool];
    }
  }

  return null;
}

/**
 * Get user state text for a given mode.
 *
 * @param {string|null} mode - Mode key (focus/break/away/wake)
 * @returns {string} User state text in Japanese, or empty string if no mode
 */
export function extractUserStateFromResult(mode) {
  if (!mode) return '';
  return MODE_TO_USER_STATE[mode] || '';
}

/**
 * Extract reason text from analysis result.
 * Checks the primary action params and the actions array.
 *
 * @param {Object} result - Analysis result from API
 * @returns {string} Reason text, or empty string if not found
 */
export function extractReasonFromResult(result) {
  // Check primary action reason first
  const primaryReason = result.action?.params?.reason;
  if (primaryReason) {
    return primaryReason;
  }

  // Check actions array for mode actions with reasons
  const actions = result.actions || [];
  for (const action of actions) {
    if (action.tool && TOOL_TO_MODE[action.tool] && action.params?.reason) {
      return action.params.reason;
    }
  }

  return '';
}
