/**
 * Mode Display UI Module
 *
 * Provides UI components for displaying current AI mode, user state,
 * and mode transition information.
 *
 * Requirements: 4.6, 5.1, 5.2
 * - 4.6: Display current mode visually (focus/break/away/wake/idle)
 * - 5.1: Display recognized user state (working/drowsy/resting/away)
 * - 5.2: Display mode transition with previous mode and reason
 */

/**
 * Mode name labels in Japanese
 */
const MODE_LABELS = {
  focus: '集中',
  break: '休憩',
  away: '離席',
  wake: '覚醒',
  nap: '仮眠',
  idle: '待機中',
};

/**
 * Create the mode display UI container element
 * @returns {HTMLElement} Mode display container element
 */
export function createModeDisplayUI() {
  const container = document.createElement('div');
  container.className = 'mode-display';
  container.dataset.mode = 'idle';

  // Current mode label
  const modeLabel = document.createElement('div');
  modeLabel.className = 'mode-display-mode';
  modeLabel.textContent = MODE_LABELS.idle;
  container.appendChild(modeLabel);

  // User state
  const userState = document.createElement('div');
  userState.className = 'mode-display-user-state';
  container.appendChild(userState);

  // Transition info (previous -> current)
  const transition = document.createElement('div');
  transition.className = 'mode-display-transition';
  container.appendChild(transition);

  // Reason
  const reason = document.createElement('div');
  reason.className = 'mode-display-reason';
  container.appendChild(reason);

  return container;
}

/**
 * Update the mode display with new state
 * @param {HTMLElement} element - Mode display container
 * @param {Object} state - Mode display state
 * @param {'focus' | 'break' | 'away' | 'wake' | 'idle'} state.currentMode - Current mode
 * @param {string} state.userState - User state text (e.g., '作業中')
 * @param {string} state.reason - Mode change reason
 * @param {string} state.previousMode - Previous mode
 */
export function updateModeDisplay(element, state) {
  const { currentMode, userState, reason, previousMode } = state;

  // Update data attribute for CSS styling
  element.dataset.mode = currentMode;

  // Update mode label
  const modeLabel = element.querySelector('.mode-display-mode');
  modeLabel.textContent = MODE_LABELS[currentMode] || currentMode;

  // Update user state
  const userStateEl = element.querySelector('.mode-display-user-state');
  userStateEl.textContent = userState || '';

  // Update transition info
  const transitionEl = element.querySelector('.mode-display-transition');
  if (previousMode && MODE_LABELS[previousMode]) {
    const prevLabel = MODE_LABELS[previousMode];
    const currLabel = MODE_LABELS[currentMode] || currentMode;
    transitionEl.textContent = `${prevLabel} → ${currLabel}`;
  } else {
    transitionEl.textContent = '';
  }

  // Update reason
  const reasonEl = element.querySelector('.mode-display-reason');
  reasonEl.textContent = reason || '';
}

/**
 * Reset mode display to initial idle state
 * @param {HTMLElement} element - Mode display container
 */
export function resetModeDisplay(element) {
  element.dataset.mode = 'idle';

  const modeLabel = element.querySelector('.mode-display-mode');
  modeLabel.textContent = MODE_LABELS.idle;

  const userStateEl = element.querySelector('.mode-display-user-state');
  userStateEl.textContent = '';

  const transitionEl = element.querySelector('.mode-display-transition');
  transitionEl.textContent = '';

  const reasonEl = element.querySelector('.mode-display-reason');
  reasonEl.textContent = '';
}
