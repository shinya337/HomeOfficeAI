/**
 * Tool Registry - Device Type to Tool Definition Mapping
 *
 * Provides a registry structure for mapping device types to their corresponding
 * Function Calling tool definitions. Designed for extensibility to easily add
 * new device types.
 *
 * Requirements: 5.1 (device type to tool mapping), 5.3 (extensibility)
 */

import { SchemaType } from '@google-cloud/vertexai';
import type { FunctionDeclaration } from '@google-cloud/vertexai';
import type { DeviceType } from '../types/device-types.js';

// =============================================================================
// Light Control Constants and Dynamic Builder
// Requirements: 2.1, 2.2, 2.3, 2.4
// =============================================================================

/** 標準ボタン一覧（常に含まれる） */
export const STANDARD_LIGHT_ACTIONS: readonly string[] = [
  'on', 'off', 'on-100', 'on-favorite', 'night',
  'bright-up', 'bright-down', 'colortemp-up', 'colortemp-down',
] as const;

/** 標準ボタンの操作説明（固定テキスト） */
const STANDARD_ACTION_DESCRIPTIONS =
  'on: 点灯, off: 消灯, on-100: 全灯（集中モード復帰に最適）, on-favorite: お気に入り, night: 常夜灯, bright-up: 明るく, bright-down: 暗く, colortemp-up: 寒色, colortemp-down: 暖色';

/** light_control Tool の基本説明（固定テキスト、シグナル名を含まない） */
const LIGHT_CONTROL_BASE_DESCRIPTION =
  '照明を制御する。居眠り検出時: 覚醒を促すには"on"または"on-100"（OFFは逆効果）。照明がすでにONなら音声呼びかけを優先。continue_monitoringで複数回確認済みの場合のみ選択。作業復帰時: "on-100"で集中用の全灯に戻す。';

/**
 * 照明シグナル情報から動的な light_control FunctionDeclaration を生成する
 *
 * @param signals - ユーザーの照明カスタムシグナル名一覧（空配列可）
 * @returns 標準ボタン + カスタムシグナルを含む FunctionDeclaration
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4
 */
export function buildLightControlDeclaration(
  signals: readonly string[]
): FunctionDeclaration {
  // Build enum: standard buttons + custom signals
  const enumValues = [...STANDARD_LIGHT_ACTIONS, ...signals];

  // Build action description: standard + custom signal descriptions
  let actionDescription = `照明の操作。${STANDARD_ACTION_DESCRIPTIONS}`;
  if (signals.length > 0) {
    const signalDescriptions = signals
      .map((s) => `${s}: カスタムモード`)
      .join(', ');
    actionDescription += `, ${signalDescriptions}`;
  }

  // Build tool description: base + custom signal info
  let toolDescription = LIGHT_CONTROL_BASE_DESCRIPTION;
  if (signals.length > 0) {
    const signalDescriptions = signals
      .map((s) => `${s}: カスタムモード`)
      .join(', ');
    toolDescription += ` カスタムシグナル: ${signalDescriptions}。`;
  }

  return {
    name: 'light_control',
    description: toolDescription,
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        action: {
          type: SchemaType.STRING,
          description: actionDescription,
          enum: enumValues,
        },
        reason: {
          type: SchemaType.STRING,
          description: 'この判断に至った理由（画像から読み取った状況の説明）',
        },
      },
      required: ['action', 'reason'],
    },
  };
}

// =============================================================================
// Tool Declarations
// =============================================================================

/**
 * light_control Tool definition (static, standard buttons only)
 *
 * This is the default declaration with no custom signals.
 * Use buildLightControlDeclaration(signals) for dynamic generation.
 */
export const lightControlDeclaration: FunctionDeclaration =
  buildLightControlDeclaration([]);

/**
 * aircon_control Tool definition
 * Controls air conditioner temperature and mode
 */
export const airconControlDeclaration: FunctionDeclaration = {
  name: 'aircon_control',
  description:
    '明らかに居眠りしている（机に伏せている等）場合にエアコンの温度やモードを変更して覚醒を促す。continue_monitoringで複数回確認済みで居眠りが確実な場合のみ選択すること。',
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      temperature: {
        type: SchemaType.NUMBER,
        description: '設定温度（摂氏）',
      },
      mode: {
        type: SchemaType.STRING,
        description:
          '運転モード（例: "cool", "warm", "auto"）。省略時は現在のモードを維持。',
      },
      reason: {
        type: SchemaType.STRING,
        description: 'この判断に至った理由（画像から読み取った状況の説明）',
      },
    },
    required: ['temperature', 'reason'],
  },
};

/**
 * tv_control Tool definition
 * Controls TV power, channel, and volume
 *
 * Requirements: 5.2 (TV tool definition with power ON/OFF, channel change, volume adjustment)
 */
export const tvControlDeclaration: FunctionDeclaration = {
  name: 'tv_control',
  description:
    'テレビを制御する。電源ON/OFF、チャンネル変更、音量調整を行う。',
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      action: {
        type: SchemaType.STRING,
        description: '操作タイプ（"power", "channel", "volume"）',
        enum: ['power', 'channel', 'volume'],
      },
      value: {
        type: SchemaType.STRING,
        description:
          '操作値（powerなら"on"/"off"、channelなら番号、volumeなら"up"/"down"）',
      },
      reason: {
        type: SchemaType.STRING,
        description: 'この判断に至った理由（画像から読み取った状況の説明）',
      },
    },
    required: ['action', 'value', 'reason'],
  },
};

/**
 * continue_monitoring Tool definition
 * Triggers a shorter monitoring interval (10 seconds)
 */
export const continueMonitoringDeclaration: FunctionDeclaration = {
  name: 'continue_monitoring',
  description:
    '状態変化の兆候（居眠り・食事・休憩・離席・復帰）を検出した場合に選択する。5秒後に再度画像を分析して確認する。全てのモード切り替え（break_mode, focus_mode復帰, away_mode, wake_mode）はこのツールで事前確認が必須。1回の判断でいきなりモード切り替えツールを実行してはいけない。セッション開始時のfocus_modeのみ例外。',
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      reason: {
        type: SchemaType.STRING,
        description: 'この判断に至った理由（画像から読み取った状況の説明）',
      },
    },
    required: ['reason'],
  },
};

/**
 * do_nothing Tool definition
 * Maintains normal monitoring interval (5 minutes)
 */
export const doNothingDeclaration: FunctionDeclaration = {
  name: 'do_nothing',
  description:
    'ユーザーが集中して作業中、離席中、または休憩演出が完了した場合に選択する。IoT介入不要。通常の30秒間隔で監視を継続。すでにデバイス制御を実行済みで追加の介入が不要な場合もこれを選ぶこと。',
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      reason: {
        type: SchemaType.STRING,
        description: 'この判断に至った理由（画像から読み取った状況の説明）',
      },
    },
    required: ['reason'],
  },
};

// =============================================================================
// Alexa Tool Declarations
// Requirements: 3.4, 4.3, 5.5, 6.4, 7.4, 10.2, 10.3
// =============================================================================

/**
 * alexa_speak Tool definition
 * Text-to-speech on Alexa device
 *
 * Requirements: 3.4 (alexa_speak tool declaration)
 */
export const alexaSpeakDeclaration: FunctionDeclaration = {
  name: 'alexa_speak',
  description:
    'Alexaデバイスでテキストを音声読み上げする。居眠り検出時: 優しく声をかけて起こす（例:「少し眠くなっていませんか？ストレッチしましょう！」）。食事・休憩検出時: 最初の一声として「ごゆっくりどうぞ」等のリラックスメッセージを読み上げる。',
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      message: {
        type: SchemaType.STRING,
        description: '読み上げるテキストメッセージ（最大250文字）',
      },
      reason: {
        type: SchemaType.STRING,
        description: 'この判断に至った理由（画像から読み取った状況の説明）',
      },
    },
    required: ['message', 'reason'],
  },
};

/**
 * alexa_announcement Tool definition
 * Announcement with voice + screen display on Alexa device
 *
 * Requirements: 4.3 (alexa_announcement tool declaration)
 */
export const alexaAnnouncementDeclaration: FunctionDeclaration = {
  name: 'alexa_announcement',
  description:
    'Alexaデバイスでアナウンスメントを送信する。音声読み上げに加え、画面付きデバイス（Echo Show等）ではテキストも表示する。',
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      message: {
        type: SchemaType.STRING,
        description:
          'アナウンスするテキストメッセージ（音声+画面表示、最大250文字）',
      },
      reason: {
        type: SchemaType.STRING,
        description: 'この判断に至った理由（画像から読み取った状況の説明）',
      },
    },
    required: ['message', 'reason'],
  },
};

/**
 * alexa_routine Tool definition
 * Execute a named Alexa routine
 *
 * Requirements: 5.5 (alexa_routine tool declaration)
 */
export const alexaRoutineDeclaration: FunctionDeclaration = {
  name: 'alexa_routine',
  description:
    'Alexaルーティンを名前指定で実行する。事前定義された複合アクション（BGM再生、定型アクション等）をトリガーする。食事・休憩検出時: リラックス系BGMのルーティンを実行して休憩空間を演出する。',
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      routine_name: {
        type: SchemaType.STRING,
        description: '実行するAlexaルーティンの名前',
      },
      reason: {
        type: SchemaType.STRING,
        description: 'この判断に至った理由（画像から読み取った状況の説明）',
      },
    },
    required: ['routine_name', 'reason'],
  },
};

/**
 * alexa_volume Tool definition
 * Adjust Alexa device volume
 *
 * Requirements: 6.4 (alexa_volume tool declaration)
 */
export const alexaVolumeDeclaration: FunctionDeclaration = {
  name: 'alexa_volume',
  description:
    'Alexaデバイスの音量を調整する。環境に応じた適切な音量を0〜100の範囲で設定する。',
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      volume: {
        type: SchemaType.NUMBER,
        description: '音量値（0〜100）',
      },
      reason: {
        type: SchemaType.STRING,
        description: 'この判断に至った理由（画像から読み取った状況の説明）',
      },
    },
    required: ['volume', 'reason'],
  },
};

/**
 * alexa_textcommand Tool definition
 * Send text as if spoken to Alexa (triggers music, skills, etc.)
 */
const alexaTextCommandDeclaration: FunctionDeclaration = {
  name: 'alexa_textcommand',
  description:
    'Alexaにテキストコマンドを送信する。音声で話しかけるのと同じ動作をする。音楽再生（例: "リラックスの音楽をかけて"）、スキル起動、タイマー設定など自由な指示が可能。食事・休憩検出時にはリラックス系BGMの再生に使用する。',
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      text: {
        type: SchemaType.STRING,
        description: 'Alexaに送信するテキストコマンド（例: "リラックスの音楽をかけて"、"ジャズを流して"）',
      },
      reason: {
        type: SchemaType.STRING,
        description: 'この判断に至った理由（画像から読み取った状況の説明）',
      },
    },
    required: ['text', 'reason'],
  },
};

/**
 * break_mode Tool definition
 * Orchestrates lighting + Alexa speak + BGM for break time
 */
export const breakModeDeclaration: FunctionDeclaration = {
  name: 'break_mode',
  description:
    '休憩モードを一括実行する。食事中・休憩中をcontinue_monitoringで2回以上確認した後にこのツールを選択すると、照明を安らぎモードに切り替え、Alexaで「ごゆっくりどうぞ」と声をかけ、リラックスBGMを再生する。3つの操作をバックエンドが順次実行するため、このツール1つで休憩演出が完了する。事前確認なしでの即時実行は禁止。',
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      reason: {
        type: SchemaType.STRING,
        description: 'この判断に至った理由（画像から読み取った状況の説明）',
      },
    },
    required: ['reason'],
  },
};

/**
 * focus_mode Tool definition
 * Orchestrates lighting + Alexa speak + jazz BGM for work start/return
 */
export const focusModeDeclaration: FunctionDeclaration = {
  name: 'focus_mode',
  description:
    '集中モードを一括実行する。セッション開始時（履歴なし）は即時実行可能。休憩・離席・居眠りからの復帰時はcontinue_monitoringで2回以上確認した後にこのツールを選択する。照明を全灯（on-100）に切り替え、Alexaで「集中モードに切り替えます」とアナウンスし、集中できるジャズBGMを再生する。3つの操作をバックエンドが順次実行するため、このツール1つで作業環境の切り替えが完了する。',
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      reason: {
        type: SchemaType.STRING,
        description: 'この判断に至った理由（画像から読み取った状況の説明）',
      },
    },
    required: ['reason'],
  },
};

/**
 * away_mode Tool definition
 * Orchestrates light OFF + announcement + BGM stop + aircon OFF for user away
 */
export const awayModeDeclaration: FunctionDeclaration = {
  name: 'away_mode',
  description:
    '離席モードを一括実行する。ユーザーが席にいないことをcontinue_monitoringで2-3回確認した後にこのツールを選択すると、照明OFF・離席アナウンス・BGM停止・エアコンOFFをバックエンドが順次実行する。このツール1つで離席時の全デバイス制御が完了する。',
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      reason: {
        type: SchemaType.STRING,
        description: 'この判断に至った理由（画像から読み取った状況の説明）',
      },
    },
    required: ['reason'],
  },
};

/**
 * wake_mode Tool definition
 * Orchestrates nap phase → 2min wait → wake phase for drowsiness detection
 */
export const wakeModeDeclaration: FunctionDeclaration = {
  name: 'wake_mode',
  description:
    '覚醒モードを一括実行する。居眠りをcontinue_monitoringで3回以上確認した後にこのツールを選択すると、仮眠フェーズ（照明OFF・BGM停止・「仮眠モードに入ります。2分後に起こします」とアナウンス）→ 2分後に覚醒フェーズ（照明全灯・「起きてストレッチしましょう」とアナウンス・覚醒BGM再生）をバックエンドが自動で順次実行する。このツール1つで仮眠→覚醒の一連の流れが完了する。',
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      reason: {
        type: SchemaType.STRING,
        description: 'この判断に至った理由（画像から読み取った状況の説明）',
      },
    },
    required: ['reason'],
  },
};

/**
 * alexa_info Tool definition
 * Play weather or flash briefing on Alexa device
 *
 * Requirements: 7.4 (alexa_info tool declaration)
 */
export const alexaInfoDeclaration: FunctionDeclaration = {
  name: 'alexa_info',
  description:
    'Alexaデバイスで情報を再生する。天気予報またはフラッシュブリーフィング（ニュース等）を読み上げる。食事・休憩が続いている場合に天気やニュースを再生して有益な情報を提供する。',
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      info_type: {
        type: SchemaType.STRING,
        description: '再生する情報の種類（"weather": 天気予報、"flashbriefing": フラッシュブリーフィング）',
        enum: ['weather', 'flashbriefing'],
      },
      reason: {
        type: SchemaType.STRING,
        description: 'この判断に至った理由（画像から読み取った状況の説明）',
      },
    },
    required: ['info_type', 'reason'],
  },
};

// =============================================================================
// Mapping Structures
// =============================================================================

/**
 * Device type to tool definition mapping
 *
 * Maps each device type to its corresponding FunctionDeclaration.
 * Not all device types have tools (e.g., IR devices are passthrough).
 *
 * To add a new device type:
 * 1. Define the FunctionDeclaration above
 * 2. Add the mapping here: DEVICE_TYPE_TO_TOOL_MAP.set('NEW_TYPE', newToolDeclaration)
 */
export const DEVICE_TYPE_TO_TOOL_MAP: ReadonlyMap<
  DeviceType,
  FunctionDeclaration
> = new Map<DeviceType, FunctionDeclaration>([
  ['LIGHT', lightControlDeclaration],
  ['AC', airconControlDeclaration],
  ['TV', tvControlDeclaration],
  // Note: IR devices do not have a dedicated tool - they use raw IR signals
]);

/**
 * Tools that are always included regardless of allowed devices
 *
 * These tools are essential for the monitoring loop:
 * - continue_monitoring: For situations requiring closer attention
 * - do_nothing: For normal operation
 */
export const ALWAYS_INCLUDED_TOOLS: readonly FunctionDeclaration[] = [
  continueMonitoringDeclaration,
  doNothingDeclaration,
  breakModeDeclaration,
  focusModeDeclaration,
  awayModeDeclaration,
  wakeModeDeclaration,
];

/**
 * Alexa tool declarations array
 *
 * Managed separately from DEVICE_TYPE_TO_TOOL_MAP because ALEXA maps to
 * multiple tools (1-to-many pattern), unlike other device types (1-to-1).
 * Used by DynamicToolBuilder when 'ALEXA' is in allowedDevices.
 *
 * Requirements: 3.4, 4.3, 5.5, 6.4, 7.4, 10.2, 10.3
 */
export const ALEXA_TOOLS: readonly FunctionDeclaration[] = [
  alexaSpeakDeclaration,
  alexaAnnouncementDeclaration,
  alexaRoutineDeclaration,
  alexaTextCommandDeclaration,
  alexaVolumeDeclaration,
  alexaInfoDeclaration,
];

// =============================================================================
// API Functions
// =============================================================================

/**
 * Get the tool definition for a specific device type
 *
 * @param type - The device type to get the tool for
 * @returns The FunctionDeclaration for the device type, or undefined if none exists
 */
export function getToolForDeviceType(
  type: DeviceType
): FunctionDeclaration | undefined {
  return DEVICE_TYPE_TO_TOOL_MAP.get(type);
}

/**
 * Get all always-included tools
 *
 * @returns Array of FunctionDeclarations that should always be included
 */
export function getAlwaysIncludedTools(): readonly FunctionDeclaration[] {
  return [...ALWAYS_INCLUDED_TOOLS];
}

/**
 * Get all Alexa tool declarations
 *
 * Returns a new array each time for immutability.
 * Used by DynamicToolBuilder to include Alexa tools when ALEXA device is allowed.
 *
 * @returns Array of FunctionDeclarations for all Alexa tools
 */
export function getAlexaTools(): readonly FunctionDeclaration[] {
  return [...ALEXA_TOOLS];
}

/**
 * Get all device types that have tool mappings
 *
 * @returns Array of DeviceTypes that have associated tools
 */
export function getAllDeviceTypes(): DeviceType[] {
  return Array.from(DEVICE_TYPE_TO_TOOL_MAP.keys());
}
