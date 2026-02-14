/**
 * Mode Display Module Tests
 *
 * TDD tests for mode display UI component.
 * Tests verify correct rendering and state updates for mode visualization.
 *
 * Requirements: 4.6, 5.1, 5.2
 * - 4.6: Display current mode visually (focus/break/away/wake)
 * - 5.1: Display recognized user state (working/drowsy/resting/away)
 * - 5.2: Display mode transition reason
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  createModeDisplayUI,
  updateModeDisplay,
  resetModeDisplay,
} from './mode-display.js';

describe('Mode Display Module', () => {
  let container;
  let modeDisplayElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    modeDisplayElement = createModeDisplayUI();
    container.appendChild(modeDisplayElement);
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  describe('createModeDisplayUI', () => {
    it('should create a mode display container element', () => {
      const element = createModeDisplayUI();
      expect(element).toBeTruthy();
      expect(element.classList.contains('mode-display')).toBe(true);
    });

    it('should include a current mode label area', () => {
      const modeLabel = modeDisplayElement.querySelector('.mode-display-mode');
      expect(modeLabel).toBeTruthy();
    });

    it('should include a user state area', () => {
      const userState = modeDisplayElement.querySelector('.mode-display-user-state');
      expect(userState).toBeTruthy();
    });

    it('should include a reason area', () => {
      const reason = modeDisplayElement.querySelector('.mode-display-reason');
      expect(reason).toBeTruthy();
    });

    it('should show idle mode as initial state', () => {
      const modeLabel = modeDisplayElement.querySelector('.mode-display-mode');
      expect(modeLabel.textContent).toContain('待機中');
    });
  });

  describe('updateModeDisplay', () => {
    it('should display focus mode text when currentMode is focus', () => {
      updateModeDisplay(modeDisplayElement, {
        currentMode: 'focus',
        userState: '作業中',
        reason: '集中して作業しています',
        previousMode: 'idle',
      });

      const modeLabel = modeDisplayElement.querySelector('.mode-display-mode');
      expect(modeLabel.textContent).toContain('集中');
    });

    it('should display break mode text when currentMode is break', () => {
      updateModeDisplay(modeDisplayElement, {
        currentMode: 'break',
        userState: '休憩中',
        reason: '休憩を取っています',
        previousMode: 'focus',
      });

      const modeLabel = modeDisplayElement.querySelector('.mode-display-mode');
      expect(modeLabel.textContent).toContain('休憩');
    });

    it('should display away mode text when currentMode is away', () => {
      updateModeDisplay(modeDisplayElement, {
        currentMode: 'away',
        userState: '離席',
        reason: '席を離れています',
        previousMode: 'focus',
      });

      const modeLabel = modeDisplayElement.querySelector('.mode-display-mode');
      expect(modeLabel.textContent).toContain('離席');
    });

    it('should display wake mode text when currentMode is wake', () => {
      updateModeDisplay(modeDisplayElement, {
        currentMode: 'wake',
        userState: '作業中',
        reason: '戻ってきました',
        previousMode: 'away',
      });

      const modeLabel = modeDisplayElement.querySelector('.mode-display-mode');
      expect(modeLabel.textContent).toContain('覚醒');
    });

    it('should display user state text', () => {
      updateModeDisplay(modeDisplayElement, {
        currentMode: 'focus',
        userState: '作業中',
        reason: '',
        previousMode: 'idle',
      });

      const userStateEl = modeDisplayElement.querySelector('.mode-display-user-state');
      expect(userStateEl.textContent).toContain('作業中');
    });

    it('should display drowsy user state', () => {
      updateModeDisplay(modeDisplayElement, {
        currentMode: 'break',
        userState: '眠気',
        reason: '眠気を検知しました',
        previousMode: 'focus',
      });

      const userStateEl = modeDisplayElement.querySelector('.mode-display-user-state');
      expect(userStateEl.textContent).toContain('眠気');
    });

    it('should display mode transition reason', () => {
      updateModeDisplay(modeDisplayElement, {
        currentMode: 'break',
        userState: '休憩中',
        reason: '長時間の作業後、休憩を推奨します',
        previousMode: 'focus',
      });

      const reasonEl = modeDisplayElement.querySelector('.mode-display-reason');
      expect(reasonEl.textContent).toContain('長時間の作業後、休憩を推奨します');
    });

    it('should show previous mode in transition info when mode changes', () => {
      updateModeDisplay(modeDisplayElement, {
        currentMode: 'break',
        userState: '休憩中',
        reason: '休憩を推奨',
        previousMode: 'focus',
      });

      const transitionEl = modeDisplayElement.querySelector('.mode-display-transition');
      expect(transitionEl.textContent).toContain('集中');
      expect(transitionEl.textContent).toContain('休憩');
    });

    it('should hide transition info when previousMode is empty', () => {
      updateModeDisplay(modeDisplayElement, {
        currentMode: 'focus',
        userState: '作業中',
        reason: '',
        previousMode: '',
      });

      const transitionEl = modeDisplayElement.querySelector('.mode-display-transition');
      expect(transitionEl.textContent).toBe('');
    });

    it('should set data-mode attribute on container for CSS styling', () => {
      updateModeDisplay(modeDisplayElement, {
        currentMode: 'focus',
        userState: '作業中',
        reason: '',
        previousMode: 'idle',
      });

      expect(modeDisplayElement.dataset.mode).toBe('focus');
    });

    it('should update data-mode attribute when mode changes', () => {
      updateModeDisplay(modeDisplayElement, {
        currentMode: 'focus',
        userState: '作業中',
        reason: '',
        previousMode: 'idle',
      });

      updateModeDisplay(modeDisplayElement, {
        currentMode: 'break',
        userState: '休憩中',
        reason: '休憩を推奨',
        previousMode: 'focus',
      });

      expect(modeDisplayElement.dataset.mode).toBe('break');
    });

    it('should hide reason area when reason is empty', () => {
      updateModeDisplay(modeDisplayElement, {
        currentMode: 'focus',
        userState: '作業中',
        reason: '',
        previousMode: 'idle',
      });

      const reasonEl = modeDisplayElement.querySelector('.mode-display-reason');
      expect(reasonEl.textContent).toBe('');
    });
  });

  describe('resetModeDisplay', () => {
    it('should reset mode to idle state', () => {
      updateModeDisplay(modeDisplayElement, {
        currentMode: 'focus',
        userState: '作業中',
        reason: '集中しています',
        previousMode: 'idle',
      });

      resetModeDisplay(modeDisplayElement);

      const modeLabel = modeDisplayElement.querySelector('.mode-display-mode');
      expect(modeLabel.textContent).toContain('待機中');
    });

    it('should clear user state text', () => {
      updateModeDisplay(modeDisplayElement, {
        currentMode: 'focus',
        userState: '作業中',
        reason: '',
        previousMode: 'idle',
      });

      resetModeDisplay(modeDisplayElement);

      const userStateEl = modeDisplayElement.querySelector('.mode-display-user-state');
      expect(userStateEl.textContent).toBe('');
    });

    it('should clear reason text', () => {
      updateModeDisplay(modeDisplayElement, {
        currentMode: 'focus',
        userState: '作業中',
        reason: '集中しています',
        previousMode: 'idle',
      });

      resetModeDisplay(modeDisplayElement);

      const reasonEl = modeDisplayElement.querySelector('.mode-display-reason');
      expect(reasonEl.textContent).toBe('');
    });

    it('should clear transition info', () => {
      updateModeDisplay(modeDisplayElement, {
        currentMode: 'break',
        userState: '休憩中',
        reason: '休憩推奨',
        previousMode: 'focus',
      });

      resetModeDisplay(modeDisplayElement);

      const transitionEl = modeDisplayElement.querySelector('.mode-display-transition');
      expect(transitionEl.textContent).toBe('');
    });

    it('should set data-mode to idle', () => {
      updateModeDisplay(modeDisplayElement, {
        currentMode: 'focus',
        userState: '作業中',
        reason: '',
        previousMode: 'idle',
      });

      resetModeDisplay(modeDisplayElement);

      expect(modeDisplayElement.dataset.mode).toBe('idle');
    });
  });
});
