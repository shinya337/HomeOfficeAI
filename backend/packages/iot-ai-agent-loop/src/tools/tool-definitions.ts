/**
 * Function Calling Tool定義
 *
 * Vertex AI Gemini API の Function Calling 用に4つの Tool を定義する。
 * - light_control: 照明の ON/OFF 制御
 * - aircon_control: エアコンの温度・モード制御
 * - continue_monitoring: 5秒後の再確認（継続監視）
 * - do_nothing: 通常監視の継続（アクション不要）
 *
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5
 */

import { SchemaType } from '@google-cloud/vertexai';
import type { FunctionDeclaration } from '@google-cloud/vertexai';

/**
 * light_control Tool定義
 * パラメータ: action ("on" | "off")
 * Note: appliance_idはAIに露出せず、ディスパッチ側でconfigから注入する
 */
const lightControlDeclaration: FunctionDeclaration = {
  name: 'light_control',
  description:
    '照明を制御する。ユーザーの作業状態に応じて照明のON/OFFを切り替える。',
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      action: {
        type: SchemaType.STRING,
        description: '照明の操作（"on" または "off"）',
        enum: ['on', 'off'],
      },
    },
    required: ['action'],
  },
};

/**
 * aircon_control Tool定義
 * パラメータ: temperature (number), mode (string, optional)
 * Note: appliance_idはAIに露出せず、ディスパッチ側でconfigから注入する
 */
const airconControlDeclaration: FunctionDeclaration = {
  name: 'aircon_control',
  description:
    'エアコンを制御する。ユーザーの作業状態に応じて温度やモードを調整する。',
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      temperature: {
        type: SchemaType.NUMBER,
        description: '設定温度（摂氏）',
      },
      mode: {
        type: SchemaType.STRING,
        description: '運転モード（例: "cool", "warm", "auto"）。省略時は現在のモードを維持。',
      },
    },
    required: ['temperature'],
  },
};

/**
 * continue_monitoring Tool定義
 * パラメータなし。5秒後に再度画像分析を行う。
 */
const continueMonitoringDeclaration: FunctionDeclaration = {
  name: 'continue_monitoring',
  description:
    '要注意状態を検知。5秒後に再度画像を分析して状態を確認する。即座のIoT介入は不要だが、継続的な監視が必要な場合に選択する。',
};

/**
 * do_nothing Tool定義
 * パラメータなし。通常の監視間隔（30秒）を維持する。
 */
const doNothingDeclaration: FunctionDeclaration = {
  name: 'do_nothing',
  description:
    'ユーザーは正常に作業中。IoT介入不要。通常の30秒間隔で監視を継続する。',
};

/**
 * 全Tool定義を取得する
 *
 * @returns FunctionDeclaration[] - 4つのTool定義の配列
 */
export function getToolDeclarations(): FunctionDeclaration[] {
  return [
    lightControlDeclaration,
    airconControlDeclaration,
    continueMonitoringDeclaration,
    doNothingDeclaration,
  ];
}
