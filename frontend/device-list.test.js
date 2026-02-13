/**
 * Device List UI Component Tests
 *
 * TDD tests for device list display in settings modal.
 * Tests verify correct rendering and user interactions.
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6
 * - 2.1: Display device list when settings modal opens
 * - 2.2: Show device name and type
 * - 2.3: Store selection state in session scope
 * - 2.4: Default all devices to unselected
 * - 2.5: Show error message and retry button on failure
 * - 2.6: Show "control target" mark for first device of same type when multiple selected
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the backend-api module
vi.mock('./backend-api.js', () => ({
  getDevices: vi.fn(),
  ApiError: class ApiError extends Error {
    constructor(code, message, status, retryAfter) {
      super(message);
      this.name = 'ApiError';
      this.code = code;
      this.status = status;
      this.retryAfter = retryAfter;
    }
  },
}));

// Import after setting up the mock
const { getDevices, ApiError } = await import('./backend-api.js');
const {
  createDeviceListUI,
  fetchAndDisplayDevices,
  getSelectedDeviceIds,
  getSelectedDevices,
  setDeviceListEnabled,
  setDeviceSelectionCallback,
  restoreDeviceSelection,
} = await import('./device-list.js');

describe('Device List UI', () => {
  let container;

  beforeEach(() => {
    // Create a container element for testing
    container = document.createElement('div');
    container.id = 'deviceListContainer';
    document.body.appendChild(container);
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Clean up the DOM
    document.body.innerHTML = '';
  });

  describe('createDeviceListUI', () => {
    it('should create a device list container element', () => {
      const element = createDeviceListUI();

      expect(element).toBeTruthy();
      expect(element.classList.contains('device-list')).toBe(true);
    });

    it('should include a loading state indicator', () => {
      const element = createDeviceListUI();

      const loadingIndicator = element.querySelector('.device-list-loading');
      expect(loadingIndicator).toBeTruthy();
    });
  });

  describe('fetchAndDisplayDevices', () => {
    it('should fetch devices and display them in the container', async () => {
      const mockDevices = [
        { id: 'light-1', name: 'Living Room Light', type: 'LIGHT' },
        { id: 'ac-1', name: 'Bedroom AC', type: 'AC' },
      ];
      getDevices.mockResolvedValueOnce({ devices: mockDevices });

      const element = createDeviceListUI();
      container.appendChild(element);

      await fetchAndDisplayDevices(element);

      expect(getDevices).toHaveBeenCalledTimes(1);
      const deviceItems = element.querySelectorAll('.device-item');
      expect(deviceItems.length).toBe(2);
    });

    it('should display device name for each device', async () => {
      const mockDevices = [{ id: 'light-1', name: 'Living Room Light', type: 'LIGHT' }];
      getDevices.mockResolvedValueOnce({ devices: mockDevices });

      const element = createDeviceListUI();
      container.appendChild(element);

      await fetchAndDisplayDevices(element);

      const deviceName = element.querySelector('.device-item-name');
      expect(deviceName.textContent).toBe('Living Room Light');
    });

    it('should display device type for each device', async () => {
      const mockDevices = [{ id: 'ac-1', name: 'Office AC', type: 'AC' }];
      getDevices.mockResolvedValueOnce({ devices: mockDevices });

      const element = createDeviceListUI();
      container.appendChild(element);

      await fetchAndDisplayDevices(element);

      const deviceType = element.querySelector('.device-item-type');
      // Should display Japanese label for device type
      expect(deviceType.textContent).toContain('エアコン');
    });

    it('should translate device type to Japanese', async () => {
      const mockDevices = [
        { id: 'light-1', name: 'Light 1', type: 'LIGHT' },
        { id: 'ac-1', name: 'AC 1', type: 'AC' },
        { id: 'tv-1', name: 'TV 1', type: 'TV' },
      ];
      getDevices.mockResolvedValueOnce({ devices: mockDevices });

      const element = createDeviceListUI();
      container.appendChild(element);

      await fetchAndDisplayDevices(element);

      const deviceTypes = element.querySelectorAll('.device-item-type');
      // Check that types are displayed in Japanese
      expect(deviceTypes[0].textContent).toContain('照明');
      expect(deviceTypes[1].textContent).toContain('エアコン');
      expect(deviceTypes[2].textContent).toContain('テレビ');
    });

    it('should display Alexa label for ALEXA device type', async () => {
      const mockDevices = [
        { id: 'alexa-1', name: 'Echo Dot', type: 'ALEXA' },
      ];
      getDevices.mockResolvedValueOnce({ devices: mockDevices });

      const element = createDeviceListUI();
      container.appendChild(element);

      await fetchAndDisplayDevices(element);

      const deviceType = element.querySelector('.device-item-type');
      expect(deviceType.textContent).toContain('Alexa');
    });

    it('should display checkbox for each device', async () => {
      const mockDevices = [{ id: 'light-1', name: 'Light', type: 'LIGHT' }];
      getDevices.mockResolvedValueOnce({ devices: mockDevices });

      const element = createDeviceListUI();
      container.appendChild(element);

      await fetchAndDisplayDevices(element);

      const checkbox = element.querySelector('.device-item-checkbox');
      expect(checkbox).toBeTruthy();
    });

    it('should have all checkboxes unchecked by default', async () => {
      const mockDevices = [
        { id: 'light-1', name: 'Light 1', type: 'LIGHT' },
        { id: 'ac-1', name: 'AC 1', type: 'AC' },
      ];
      getDevices.mockResolvedValueOnce({ devices: mockDevices });

      const element = createDeviceListUI();
      container.appendChild(element);

      await fetchAndDisplayDevices(element);

      const checkboxes = element.querySelectorAll('.device-item-checkbox');
      checkboxes.forEach((checkbox) => {
        expect(checkbox.checked).toBe(false);
      });
    });

    it('should show error message when API fails with NATURE_API_ERROR', async () => {
      getDevices.mockRejectedValueOnce(
        new ApiError('NATURE_API_ERROR', 'Nature Remo API is unavailable', 503)
      );

      const element = createDeviceListUI();
      container.appendChild(element);

      await fetchAndDisplayDevices(element);

      const errorMessage = element.querySelector('.device-list-error');
      expect(errorMessage).toBeTruthy();
      expect(errorMessage.textContent).toContain('デバイス一覧の取得に失敗しました');
    });

    it('should show retry button when API fails', async () => {
      getDevices.mockRejectedValueOnce(
        new ApiError('NATURE_API_ERROR', 'Nature Remo API is unavailable', 503)
      );

      const element = createDeviceListUI();
      container.appendChild(element);

      await fetchAndDisplayDevices(element);

      const retryButton = element.querySelector('.device-list-retry');
      expect(retryButton).toBeTruthy();
      expect(retryButton.textContent).toContain('再試行');
    });

    it('should retry fetching when retry button is clicked', async () => {
      getDevices.mockRejectedValueOnce(
        new ApiError('NATURE_API_ERROR', 'Nature Remo API is unavailable', 503)
      );

      const element = createDeviceListUI();
      container.appendChild(element);

      await fetchAndDisplayDevices(element);

      // Mock success on retry
      const mockDevices = [{ id: 'light-1', name: 'Light', type: 'LIGHT' }];
      getDevices.mockResolvedValueOnce({ devices: mockDevices });

      const retryButton = element.querySelector('.device-list-retry');
      retryButton.click();

      // Wait for async operation
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(getDevices).toHaveBeenCalledTimes(2);
    });

    it('should show rate limit message with retry time when 429 error', async () => {
      getDevices.mockRejectedValueOnce(
        new ApiError('RATE_LIMIT_EXCEEDED', 'Rate limit exceeded', 429, 60)
      );

      const element = createDeviceListUI();
      container.appendChild(element);

      await fetchAndDisplayDevices(element);

      const errorMessage = element.querySelector('.device-list-error');
      expect(errorMessage.textContent).toContain('60');
    });

    it('should hide loading indicator after devices are loaded', async () => {
      const mockDevices = [{ id: 'light-1', name: 'Light', type: 'LIGHT' }];
      getDevices.mockResolvedValueOnce({ devices: mockDevices });

      const element = createDeviceListUI();
      container.appendChild(element);

      await fetchAndDisplayDevices(element);

      const loadingIndicator = element.querySelector('.device-list-loading');
      expect(loadingIndicator.style.display).toBe('none');
    });

    it('should display empty message when no devices registered', async () => {
      getDevices.mockResolvedValueOnce({ devices: [] });

      const element = createDeviceListUI();
      container.appendChild(element);

      await fetchAndDisplayDevices(element);

      const emptyMessage = element.querySelector('.device-list-empty');
      expect(emptyMessage).toBeTruthy();
      expect(emptyMessage.textContent).toContain('登録されているデバイスがありません');
    });
  });

  describe('getSelectedDeviceIds', () => {
    it('should return empty array when no devices selected', async () => {
      const mockDevices = [
        { id: 'light-1', name: 'Light', type: 'LIGHT' },
        { id: 'ac-1', name: 'AC', type: 'AC' },
      ];
      getDevices.mockResolvedValueOnce({ devices: mockDevices });

      const element = createDeviceListUI();
      container.appendChild(element);

      await fetchAndDisplayDevices(element);

      const selectedIds = getSelectedDeviceIds(element);
      expect(selectedIds).toEqual([]);
    });

    it('should return selected device IDs when checkboxes are checked', async () => {
      const mockDevices = [
        { id: 'light-1', name: 'Light', type: 'LIGHT' },
        { id: 'ac-1', name: 'AC', type: 'AC' },
      ];
      getDevices.mockResolvedValueOnce({ devices: mockDevices });

      const element = createDeviceListUI();
      container.appendChild(element);

      await fetchAndDisplayDevices(element);

      // Check the first device checkbox
      const checkboxes = element.querySelectorAll('.device-item-checkbox');
      checkboxes[0].checked = true;

      const selectedIds = getSelectedDeviceIds(element);
      expect(selectedIds).toEqual(['light-1']);
    });

    it('should return all selected IDs when multiple checkboxes are checked', async () => {
      const mockDevices = [
        { id: 'light-1', name: 'Light', type: 'LIGHT' },
        { id: 'ac-1', name: 'AC', type: 'AC' },
        { id: 'tv-1', name: 'TV', type: 'TV' },
      ];
      getDevices.mockResolvedValueOnce({ devices: mockDevices });

      const element = createDeviceListUI();
      container.appendChild(element);

      await fetchAndDisplayDevices(element);

      // Check first and third device checkboxes
      const checkboxes = element.querySelectorAll('.device-item-checkbox');
      checkboxes[0].checked = true;
      checkboxes[2].checked = true;

      const selectedIds = getSelectedDeviceIds(element);
      expect(selectedIds).toEqual(['light-1', 'tv-1']);
    });
  });

  describe('setDeviceListEnabled', () => {
    it('should disable all checkboxes when called with false', async () => {
      const mockDevices = [
        { id: 'light-1', name: 'Light', type: 'LIGHT' },
        { id: 'ac-1', name: 'AC', type: 'AC' },
      ];
      getDevices.mockResolvedValueOnce({ devices: mockDevices });

      const element = createDeviceListUI();
      container.appendChild(element);

      await fetchAndDisplayDevices(element);

      setDeviceListEnabled(element, false);

      const checkboxes = element.querySelectorAll('.device-item-checkbox');
      checkboxes.forEach((checkbox) => {
        expect(checkbox.disabled).toBe(true);
      });
    });

    it('should enable all checkboxes when called with true', async () => {
      const mockDevices = [{ id: 'light-1', name: 'Light', type: 'LIGHT' }];
      getDevices.mockResolvedValueOnce({ devices: mockDevices });

      const element = createDeviceListUI();
      container.appendChild(element);

      await fetchAndDisplayDevices(element);
      setDeviceListEnabled(element, false);
      setDeviceListEnabled(element, true);

      const checkboxes = element.querySelectorAll('.device-item-checkbox');
      checkboxes.forEach((checkbox) => {
        expect(checkbox.disabled).toBe(false);
      });
    });
  });

  // Task 9.2: Device selection state management
  // Requirements: 2.3, 2.6
  describe('Device Selection State Management', () => {
    describe('getSelectedDevices', () => {
      it('should return selected devices with id, name, and type', async () => {
        const mockDevices = [
          { id: 'light-1', name: 'Light', type: 'LIGHT' },
          { id: 'ac-1', name: 'AC', type: 'AC' },
        ];
        getDevices.mockResolvedValueOnce({ devices: mockDevices });

        const element = createDeviceListUI();
        container.appendChild(element);

        await fetchAndDisplayDevices(element);

        // Select the first device
        const checkboxes = element.querySelectorAll('.device-item-checkbox');
        checkboxes[0].checked = true;

        const selectedDevices = getSelectedDevices(element);
        expect(selectedDevices).toEqual([
          { id: 'light-1', name: 'Light', type: 'LIGHT' },
        ]);
      });

      it('should return empty array when no devices selected', async () => {
        const mockDevices = [{ id: 'light-1', name: 'Light', type: 'LIGHT' }];
        getDevices.mockResolvedValueOnce({ devices: mockDevices });

        const element = createDeviceListUI();
        container.appendChild(element);

        await fetchAndDisplayDevices(element);

        const selectedDevices = getSelectedDevices(element);
        expect(selectedDevices).toEqual([]);
      });

      it('should return multiple selected devices', async () => {
        const mockDevices = [
          { id: 'light-1', name: 'Light 1', type: 'LIGHT' },
          { id: 'light-2', name: 'Light 2', type: 'LIGHT' },
          { id: 'ac-1', name: 'AC', type: 'AC' },
        ];
        getDevices.mockResolvedValueOnce({ devices: mockDevices });

        const element = createDeviceListUI();
        container.appendChild(element);

        await fetchAndDisplayDevices(element);

        const checkboxes = element.querySelectorAll('.device-item-checkbox');
        checkboxes[0].checked = true;
        checkboxes[1].checked = true;

        const selectedDevices = getSelectedDevices(element);
        expect(selectedDevices).toHaveLength(2);
        expect(selectedDevices[0].id).toBe('light-1');
        expect(selectedDevices[1].id).toBe('light-2');
      });
    });

    describe('setDeviceSelectionCallback', () => {
      it('should call callback when device selection changes', async () => {
        const mockDevices = [
          { id: 'light-1', name: 'Light', type: 'LIGHT' },
        ];
        getDevices.mockResolvedValueOnce({ devices: mockDevices });

        const element = createDeviceListUI();
        container.appendChild(element);

        const callback = vi.fn();
        setDeviceSelectionCallback(element, callback);

        await fetchAndDisplayDevices(element);

        const checkbox = element.querySelector('.device-item-checkbox');
        checkbox.click();

        expect(callback).toHaveBeenCalledTimes(1);
        expect(callback).toHaveBeenCalledWith([
          { id: 'light-1', name: 'Light', type: 'LIGHT' },
        ]);
      });

      it('should pass updated selection to callback on each change', async () => {
        const mockDevices = [
          { id: 'light-1', name: 'Light', type: 'LIGHT' },
          { id: 'ac-1', name: 'AC', type: 'AC' },
        ];
        getDevices.mockResolvedValueOnce({ devices: mockDevices });

        const element = createDeviceListUI();
        container.appendChild(element);

        const callback = vi.fn();
        setDeviceSelectionCallback(element, callback);

        await fetchAndDisplayDevices(element);

        const checkboxes = element.querySelectorAll('.device-item-checkbox');

        // Select first device
        checkboxes[0].click();
        expect(callback).toHaveBeenLastCalledWith([
          { id: 'light-1', name: 'Light', type: 'LIGHT' },
        ]);

        // Select second device
        checkboxes[1].click();
        expect(callback).toHaveBeenLastCalledWith([
          { id: 'light-1', name: 'Light', type: 'LIGHT' },
          { id: 'ac-1', name: 'AC', type: 'AC' },
        ]);

        // Deselect first device
        checkboxes[0].click();
        expect(callback).toHaveBeenLastCalledWith([
          { id: 'ac-1', name: 'AC', type: 'AC' },
        ]);
      });
    });

    describe('Control Target Mark (Requirement 2.6)', () => {
      it('should show control target mark for first selected device of a type', async () => {
        const mockDevices = [
          { id: 'light-1', name: 'Light 1', type: 'LIGHT' },
          { id: 'light-2', name: 'Light 2', type: 'LIGHT' },
        ];
        getDevices.mockResolvedValueOnce({ devices: mockDevices });

        const element = createDeviceListUI();
        container.appendChild(element);

        await fetchAndDisplayDevices(element);

        const checkboxes = element.querySelectorAll('.device-item-checkbox');
        checkboxes[0].click();
        checkboxes[1].click();

        const items = element.querySelectorAll('.device-item');
        const firstMark = items[0].querySelector('.device-control-target');
        const secondMark = items[1].querySelector('.device-control-target');

        expect(firstMark).toBeTruthy();
        expect(firstMark.style.display).not.toBe('none');
        expect(secondMark.style.display).toBe('none');
      });

      it('should not show control target mark when only one device of type selected', async () => {
        const mockDevices = [
          { id: 'light-1', name: 'Light 1', type: 'LIGHT' },
          { id: 'ac-1', name: 'AC', type: 'AC' },
        ];
        getDevices.mockResolvedValueOnce({ devices: mockDevices });

        const element = createDeviceListUI();
        container.appendChild(element);

        await fetchAndDisplayDevices(element);

        const checkboxes = element.querySelectorAll('.device-item-checkbox');
        checkboxes[0].click();

        const items = element.querySelectorAll('.device-item');
        const lightMark = items[0].querySelector('.device-control-target');

        // Mark should not be visible when only one device of that type is selected
        expect(lightMark.style.display).toBe('none');
      });

      it('should update control target mark when selection changes', async () => {
        const mockDevices = [
          { id: 'light-1', name: 'Light 1', type: 'LIGHT' },
          { id: 'light-2', name: 'Light 2', type: 'LIGHT' },
        ];
        getDevices.mockResolvedValueOnce({ devices: mockDevices });

        const element = createDeviceListUI();
        container.appendChild(element);

        await fetchAndDisplayDevices(element);

        const checkboxes = element.querySelectorAll('.device-item-checkbox');
        const items = element.querySelectorAll('.device-item');

        // Select both lights
        checkboxes[0].click();
        checkboxes[1].click();

        // First light should have the mark
        expect(items[0].querySelector('.device-control-target').style.display).not.toBe('none');
        expect(items[1].querySelector('.device-control-target').style.display).toBe('none');

        // Deselect first light
        checkboxes[0].click();

        // Now second light should have the mark (since it's the only one)
        // But since there's only one, mark should not show
        expect(items[1].querySelector('.device-control-target').style.display).toBe('none');
      });

      it('should show control target mark for each type with multiple selected', async () => {
        const mockDevices = [
          { id: 'light-1', name: 'Light 1', type: 'LIGHT' },
          { id: 'light-2', name: 'Light 2', type: 'LIGHT' },
          { id: 'ac-1', name: 'AC 1', type: 'AC' },
          { id: 'ac-2', name: 'AC 2', type: 'AC' },
        ];
        getDevices.mockResolvedValueOnce({ devices: mockDevices });

        const element = createDeviceListUI();
        container.appendChild(element);

        await fetchAndDisplayDevices(element);

        const checkboxes = element.querySelectorAll('.device-item-checkbox');
        // Select all devices
        checkboxes[0].click();
        checkboxes[1].click();
        checkboxes[2].click();
        checkboxes[3].click();

        const items = element.querySelectorAll('.device-item');

        // First light should have mark, second should not
        expect(items[0].querySelector('.device-control-target').style.display).not.toBe('none');
        expect(items[1].querySelector('.device-control-target').style.display).toBe('none');

        // First AC should have mark, second should not
        expect(items[2].querySelector('.device-control-target').style.display).not.toBe('none');
        expect(items[3].querySelector('.device-control-target').style.display).toBe('none');
      });
    });

    describe('restoreDeviceSelection', () => {
      it('should restore device selection from provided devices', async () => {
        const mockDevices = [
          { id: 'light-1', name: 'Light 1', type: 'LIGHT' },
          { id: 'ac-1', name: 'AC', type: 'AC' },
          { id: 'tv-1', name: 'TV', type: 'TV' },
        ];
        getDevices.mockResolvedValueOnce({ devices: mockDevices });

        const element = createDeviceListUI();
        container.appendChild(element);

        await fetchAndDisplayDevices(element);

        // Restore selection for light-1 and tv-1
        const savedSelection = [
          { id: 'light-1', type: 'LIGHT' },
          { id: 'tv-1', type: 'TV' },
        ];
        restoreDeviceSelection(element, savedSelection);

        const checkboxes = element.querySelectorAll('.device-item-checkbox');
        expect(checkboxes[0].checked).toBe(true); // light-1
        expect(checkboxes[1].checked).toBe(false); // ac-1
        expect(checkboxes[2].checked).toBe(true); // tv-1
      });

      it('should handle empty selection', async () => {
        const mockDevices = [
          { id: 'light-1', name: 'Light', type: 'LIGHT' },
        ];
        getDevices.mockResolvedValueOnce({ devices: mockDevices });

        const element = createDeviceListUI();
        container.appendChild(element);

        await fetchAndDisplayDevices(element);

        restoreDeviceSelection(element, []);

        const checkboxes = element.querySelectorAll('.device-item-checkbox');
        expect(checkboxes[0].checked).toBe(false);
      });

      it('should ignore non-existent device IDs in restore', async () => {
        const mockDevices = [
          { id: 'light-1', name: 'Light', type: 'LIGHT' },
        ];
        getDevices.mockResolvedValueOnce({ devices: mockDevices });

        const element = createDeviceListUI();
        container.appendChild(element);

        await fetchAndDisplayDevices(element);

        // Try to restore with non-existent device
        const savedSelection = [
          { id: 'non-existent', type: 'LIGHT' },
        ];
        restoreDeviceSelection(element, savedSelection);

        const checkboxes = element.querySelectorAll('.device-item-checkbox');
        expect(checkboxes[0].checked).toBe(false);
      });

      it('should update control target marks after restore', async () => {
        const mockDevices = [
          { id: 'light-1', name: 'Light 1', type: 'LIGHT' },
          { id: 'light-2', name: 'Light 2', type: 'LIGHT' },
        ];
        getDevices.mockResolvedValueOnce({ devices: mockDevices });

        const element = createDeviceListUI();
        container.appendChild(element);

        await fetchAndDisplayDevices(element);

        // Restore selection for both lights
        const savedSelection = [
          { id: 'light-1', type: 'LIGHT' },
          { id: 'light-2', type: 'LIGHT' },
        ];
        restoreDeviceSelection(element, savedSelection);

        const items = element.querySelectorAll('.device-item');
        expect(items[0].querySelector('.device-control-target').style.display).not.toBe('none');
        expect(items[1].querySelector('.device-control-target').style.display).toBe('none');
      });
    });
  });
});
