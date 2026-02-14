/**
 * Device List UI Component
 *
 * Provides UI components for displaying and selecting devices in settings modal.
 * Uses checkbox format for device selection with Japanese type labels.
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6
 * - 2.1: Display device list when settings modal opens
 * - 2.2: Show device name and type
 * - 2.3: Store selection state in session scope
 * - 2.4: Default all devices to unselected
 * - 2.5: Show error message and retry button on failure
 * - 2.6: Show "control target" mark for first device of same type when multiple selected
 */

import { getDevices, ApiError } from './backend-api.js';

/**
 * Device type labels in Japanese
 */
const DEVICE_TYPE_LABELS = {
  LIGHT: '照明',
  AC: 'エアコン',
  TV: 'テレビ',
  IR: 'IRリモコン',
  ALEXA: 'Alexa',
};

/**
 * Tool name to Japanese label and description mapping
 */
const TOOL_LABELS = {
  alexa_speak: { label: '音声読み上げ', desc: 'テキストを音声で読み上げ' },
  alexa_announcement: { label: 'アナウンス', desc: '音声+画面にテキスト表示' },
  alexa_routine: { label: 'ルーティン', desc: 'BGM再生や定型アクションを実行' },
  alexa_volume: { label: '音量調整', desc: '環境に応じた音量を自動設定' },
  alexa_info: { label: '情報再生', desc: '天気予報やニュースを読み上げ' },
  light_control: { label: '照明制御', desc: '作業状態に応じてON/OFF' },
  aircon_control: { label: 'エアコン制御', desc: '温度やモードを自動調整' },
  tv_control: { label: 'テレビ制御', desc: '電源・チャンネル・音量を操作' },
};

/**
 * Device type to tool names mapping
 * Only types with 2+ tools need sub-action UI
 */
const DEVICE_TYPE_TOOLS = {
  ALEXA: ['alexa_speak', 'alexa_announcement', 'alexa_routine', 'alexa_volume', 'alexa_info'],
  LIGHT: ['light_control'],
  AC: ['aircon_control'],
  TV: ['tv_control'],
};

/**
 * Device type icons (emoji)
 */
const DEVICE_TYPE_ICONS = {
  LIGHT: '\u{1F4A1}',
  AC: '\u{2744}\u{FE0F}',
  TV: '\u{1F4FA}',
  IR: '\u{1F4E1}',
  ALEXA: '\u{1F5E3}\u{FE0F}',
};

/**
 * Store callbacks per element using WeakMap
 * @type {WeakMap<HTMLElement, Function>}
 */
const selectionCallbacks = new WeakMap();

/**
 * Store device data per element using WeakMap
 * @type {WeakMap<HTMLElement, Array<{id: string, name: string, type: string}>>}
 */
const deviceDataMap = new WeakMap();

/**
 * Get Japanese label for device type
 * @param {string} type - Device type (LIGHT, AC, TV, IR)
 * @returns {string} Japanese label
 */
function getDeviceTypeLabel(type) {
  return DEVICE_TYPE_LABELS[type] || type;
}

/**
 * Create the device list UI container element
 * @returns {HTMLElement} Device list container element
 */
export function createDeviceListUI() {
  const container = document.createElement('div');
  container.className = 'device-list';

  // Loading indicator
  const loading = document.createElement('div');
  loading.className = 'device-list-loading';
  loading.textContent = '読み込み中...';
  container.appendChild(loading);

  // Device items container
  const itemsContainer = document.createElement('div');
  itemsContainer.className = 'device-list-items';
  container.appendChild(itemsContainer);

  // Error container (hidden by default)
  const errorContainer = document.createElement('div');
  errorContainer.className = 'device-list-error-container';
  errorContainer.style.display = 'none';
  container.appendChild(errorContainer);

  // Empty message (hidden by default)
  const emptyMessage = document.createElement('div');
  emptyMessage.className = 'device-list-empty';
  emptyMessage.textContent = '登録されているデバイスがありません';
  emptyMessage.style.display = 'none';
  container.appendChild(emptyMessage);

  return container;
}

/**
 * Create a single device item element
 * @param {Object} device - Device object with id, name, type
 * @returns {HTMLElement} Device item element
 */
function createDeviceItem(device) {
  const item = document.createElement('div');
  item.className = 'device-item';
  item.dataset.deviceId = device.id;
  item.dataset.deviceType = device.type;
  item.dataset.deviceName = device.name;

  // Checkbox (toggle switch)
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.id = `device-${device.id}`;
  checkbox.className = 'device-item-checkbox';
  checkbox.dataset.deviceId = device.id;
  checkbox.checked = false; // Default unchecked (Requirement 2.4)
  item.appendChild(checkbox);

  // Device type icon
  const icon = document.createElement('span');
  icon.className = 'device-item-icon';
  icon.textContent = DEVICE_TYPE_ICONS[device.type] || '';
  item.appendChild(icon);

  // Label
  const label = document.createElement('label');
  label.className = 'device-item-label';
  label.htmlFor = `device-${device.id}`;

  // Device name
  const name = document.createElement('span');
  name.className = 'device-item-name';
  name.textContent = device.name;
  label.appendChild(name);

  // Device type
  const type = document.createElement('span');
  type.className = 'device-item-type';
  type.textContent = getDeviceTypeLabel(device.type);
  label.appendChild(type);

  // Control target mark (Requirement 2.6)
  const controlTargetMark = document.createElement('span');
  controlTargetMark.className = 'device-control-target';
  controlTargetMark.textContent = '制御対象';
  controlTargetMark.style.display = 'none';
  label.appendChild(controlTargetMark);

  item.appendChild(label);

  // Sub-actions UI (show available tools for all device types)
  const tools = DEVICE_TYPE_TOOLS[device.type] || [];
  if (tools.length >= 1) {
    const subActions = document.createElement('div');
    subActions.className = 'device-sub-actions';
    subActions.style.display = 'none'; // Hidden until parent is checked

    tools.forEach((toolName) => {
      const subItem = document.createElement('div');
      subItem.className = 'device-sub-action-item';

      const subCheckbox = document.createElement('input');
      subCheckbox.type = 'checkbox';
      subCheckbox.id = `tool-${device.id}-${toolName}`;
      subCheckbox.className = 'device-sub-action-checkbox';
      subCheckbox.dataset.toolName = toolName;
      subCheckbox.checked = true; // Default all sub-actions to ON

      const toolInfo = TOOL_LABELS[toolName] || { label: toolName, desc: '' };

      const subLabel = document.createElement('label');
      subLabel.className = 'device-sub-action-label';
      subLabel.htmlFor = `tool-${device.id}-${toolName}`;

      const labelText = document.createElement('span');
      labelText.className = 'device-sub-action-name';
      labelText.textContent = toolInfo.label;
      subLabel.appendChild(labelText);

      if (toolInfo.desc) {
        const descText = document.createElement('span');
        descText.className = 'device-sub-action-desc';
        descText.textContent = toolInfo.desc;
        subLabel.appendChild(descText);
      }

      subItem.appendChild(subCheckbox);
      subItem.appendChild(subLabel);
      subActions.appendChild(subItem);
    });

    item.appendChild(subActions);
  }

  return item;
}

/**
 * Show error state in the device list
 * @param {HTMLElement} element - Device list container
 * @param {Error} error - Error object
 */
function showError(element, error) {
  const errorContainer = element.querySelector('.device-list-error-container');
  const loading = element.querySelector('.device-list-loading');
  const itemsContainer = element.querySelector('.device-list-items');

  loading.style.display = 'none';
  itemsContainer.innerHTML = '';
  errorContainer.style.display = 'block';

  // Error message
  const errorMessage = document.createElement('div');
  errorMessage.className = 'device-list-error';

  if (error.code === 'RATE_LIMIT_EXCEEDED' && error.retryAfter) {
    errorMessage.textContent = `デバイス一覧の取得に失敗しました。${error.retryAfter}秒後に再試行してください。`;
  } else {
    errorMessage.textContent = 'デバイス一覧の取得に失敗しました。';
  }

  // Retry button
  const retryButton = document.createElement('button');
  retryButton.className = 'device-list-retry';
  retryButton.textContent = '再試行';
  retryButton.addEventListener('click', () => {
    errorContainer.style.display = 'none';
    errorContainer.innerHTML = '';
    fetchAndDisplayDevices(element);
  });

  errorContainer.innerHTML = '';
  errorContainer.appendChild(errorMessage);
  errorContainer.appendChild(retryButton);
}

/**
 * Show empty state when no devices are registered
 * @param {HTMLElement} element - Device list container
 */
function showEmpty(element) {
  const loading = element.querySelector('.device-list-loading');
  const emptyMessage = element.querySelector('.device-list-empty');
  const itemsContainer = element.querySelector('.device-list-items');

  loading.style.display = 'none';
  itemsContainer.innerHTML = '';
  emptyMessage.style.display = 'block';
}

/**
 * Display devices in the list
 * @param {HTMLElement} element - Device list container
 * @param {Array} devices - Array of device objects
 */
function displayDevices(element, devices) {
  const loading = element.querySelector('.device-list-loading');
  const itemsContainer = element.querySelector('.device-list-items');

  loading.style.display = 'none';
  itemsContainer.innerHTML = '';

  // Store device data for later retrieval
  deviceDataMap.set(element, [...devices]);

  devices.forEach((device) => {
    const item = createDeviceItem(device);

    // Add change listener to checkbox
    const checkbox = item.querySelector('.device-item-checkbox');
    const subActions = item.querySelector('.device-sub-actions');

    checkbox.addEventListener('change', () => {
      // Toggle sub-actions visibility
      if (subActions) {
        subActions.style.display = checkbox.checked ? '' : 'none';
        // Reset sub-action checkboxes to all checked when parent is unchecked
        if (!checkbox.checked) {
          const subCheckboxes = subActions.querySelectorAll('.device-sub-action-checkbox');
          subCheckboxes.forEach((cb) => { cb.checked = true; });
        }
      }

      updateControlTargetMarks(element);
      // Call selection callback if registered
      const callback = selectionCallbacks.get(element);
      if (callback) {
        callback(getSelectedDevices(element));
      }
    });

    // Add change listeners to sub-action checkboxes
    if (subActions) {
      const subCheckboxes = subActions.querySelectorAll('.device-sub-action-checkbox');
      subCheckboxes.forEach((subCb) => {
        subCb.addEventListener('change', () => {
          const callback = selectionCallbacks.get(element);
          if (callback) {
            callback(getSelectedDevices(element));
          }
        });
      });
    }

    itemsContainer.appendChild(item);
  });
}

/**
 * Update control target marks based on current selection
 * Shows mark only on first selected device when multiple devices of same type are selected
 * @param {HTMLElement} element - Device list container
 */
function updateControlTargetMarks(element) {
  const items = element.querySelectorAll('.device-item');
  const selectedByType = new Map(); // type -> array of selected item elements

  // Group selected items by type
  items.forEach((item) => {
    const checkbox = item.querySelector('input[type="checkbox"]');
    const type = item.dataset.deviceType;
    const mark = item.querySelector('.device-control-target');

    // Hide all marks initially
    if (mark) {
      mark.style.display = 'none';
    }

    if (checkbox && checkbox.checked) {
      if (!selectedByType.has(type)) {
        selectedByType.set(type, []);
      }
      selectedByType.get(type).push(item);
    }
  });

  // Show mark only for first device of each type with multiple selected
  selectedByType.forEach((itemsOfType) => {
    if (itemsOfType.length > 1) {
      const firstItem = itemsOfType[0];
      const mark = firstItem.querySelector('.device-control-target');
      if (mark) {
        mark.style.display = '';
      }
    }
  });
}

/**
 * Fetch devices from backend and display them
 * @param {HTMLElement} element - Device list container
 */
export async function fetchAndDisplayDevices(element) {
  const loading = element.querySelector('.device-list-loading');
  const errorContainer = element.querySelector('.device-list-error-container');
  const emptyMessage = element.querySelector('.device-list-empty');

  // Show loading state
  loading.style.display = 'block';
  errorContainer.style.display = 'none';
  emptyMessage.style.display = 'none';

  try {
    const response = await getDevices();
    const devices = response.devices;

    if (devices.length === 0) {
      showEmpty(element);
    } else {
      displayDevices(element, devices);
    }
  } catch (error) {
    showError(element, error);
  }
}

/**
 * Get IDs of selected devices
 * @param {HTMLElement} element - Device list container
 * @returns {string[]} Array of selected device IDs
 */
export function getSelectedDeviceIds(element) {
  const checkboxes = element.querySelectorAll('.device-item-checkbox:checked');
  return Array.from(checkboxes).map((checkbox) => checkbox.dataset.deviceId);
}

/**
 * Enable or disable device selection
 * @param {HTMLElement} element - Device list container
 * @param {boolean} enabled - Whether to enable selection
 */
export function setDeviceListEnabled(element, enabled) {
  const checkboxes = element.querySelectorAll('.device-item-checkbox, .device-sub-action-checkbox');
  checkboxes.forEach((checkbox) => {
    checkbox.disabled = !enabled;
  });
}

/**
 * Get selected devices with full device information and allowed tools
 * @param {HTMLElement} element - Device list container
 * @returns {Array<{id: string, name: string, type: string, allowedTools?: string[]}>} Array of selected device objects
 */
export function getSelectedDevices(element) {
  const devices = deviceDataMap.get(element) || [];
  const selectedIds = getSelectedDeviceIds(element);

  return devices
    .filter((device) => selectedIds.includes(device.id))
    .map((device) => {
      const tools = DEVICE_TYPE_TOOLS[device.type] || [];
      if (tools.length < 1) {
        return device;
      }

      // Get checked sub-action tools for this device
      const deviceItem = element.querySelector(`.device-item[data-device-id="${device.id}"]`);
      if (!deviceItem) return device;

      const subCheckboxes = deviceItem.querySelectorAll('.device-sub-action-checkbox:checked');
      const allowedTools = Array.from(subCheckboxes).map((cb) => cb.dataset.toolName);

      // If all tools are checked, no need for allowedTools (backward compat)
      if (allowedTools.length === tools.length) {
        return device;
      }

      return { ...device, allowedTools };
    });
}

/**
 * Set callback to be called when device selection changes
 * @param {HTMLElement} element - Device list container
 * @param {Function} callback - Callback function that receives array of selected devices
 */
export function setDeviceSelectionCallback(element, callback) {
  selectionCallbacks.set(element, callback);
}

/**
 * Restore device selection from saved state
 * @param {HTMLElement} element - Device list container
 * @param {Array<{id: string, type: string}>} savedSelection - Array of saved device selections
 */
export function restoreDeviceSelection(element, savedSelection) {
  const savedMap = new Map(savedSelection.map((d) => [d.id, d]));

  const items = element.querySelectorAll('.device-item');
  items.forEach((item) => {
    const deviceId = item.dataset.deviceId;
    const checkbox = item.querySelector('.device-item-checkbox');
    const savedDevice = savedMap.get(deviceId);
    const isSelected = !!savedDevice;

    checkbox.checked = isSelected;

    // Restore sub-action state
    const subActions = item.querySelector('.device-sub-actions');
    if (subActions) {
      subActions.style.display = isSelected ? '' : 'none';

      if (isSelected && savedDevice.allowedTools) {
        const allowedSet = new Set(savedDevice.allowedTools);
        const subCheckboxes = subActions.querySelectorAll('.device-sub-action-checkbox');
        subCheckboxes.forEach((cb) => {
          cb.checked = allowedSet.has(cb.dataset.toolName);
        });
      }
    }
  });

  // Update control target marks after restoration
  updateControlTargetMarks(element);
}
