/**
 * PromptBuilder
 *
 * デバイス状態を含む動的システムプロンプトを構築する純粋関数群。
 * 副作用なし。DeviceStateを引数として受け取り、文字列を返す。
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5
 */
import type { DeviceState } from '../services/device-state-service.js';
import type { AgentAction } from '../types/actions.js';

// =============================================================================
// Base Prompt
// =============================================================================

/**
 * 基本システムプロンプト（現在のSYSTEM_PROMPT相当）
 */
export const BASE_PROMPT = `あなたはホームオフィスの監視AIエージェントです。
ユーザーのデスク周りの画像を分析し、ユーザーの作業状態を判断してください。
各Toolのdescriptionに記載された判断基準に従い、適切なToolを選択してください。

**重要: 複数ツールの同時選択が可能です。** 状況に応じて1つまたは複数のToolを同時に選択できます。
特に休憩検出時など、複数のデバイスを一斉に制御すべき場面では、積極的に複数ツールを同時選択してください。

## 状態判定の指針
画像からユーザーの状態を以下のカテゴリのいずれかに分類すること:
- **セッション開始（履歴なし）**: ユーザーが席にいる → **focus_mode**（作業環境セットアップ）
- **居眠り**: 机に伏せている、完全に目を閉じて寝ている、頭が垂れている → continue_monitoring で再確認し、3回以上確認後に **wake_mode**
- **食事・休憩**: 食べ物・飲み物を手に持っている、明確に飲食中 → continue_monitoring で2回以上確認後 → **break_mode**
- **離席**: 席にユーザーがいない → continue_monitoring で2-3回確認後 → **away_mode**
- **復帰（休憩・離席・居眠りから）**: ユーザーが作業に戻った → continue_monitoring で2回以上確認後 → **focus_mode**
- **上記以外すべて（デフォルト）**: → do_nothing（介入不要）

## モード切り替えの共通ルール（確認監視の必須化）
全てのモード切り替えは、continue_monitoringによる事前確認を必須とする（セッション開始時のfocus_modeのみ例外）。
- **break_mode**: continue_monitoringで2回以上確認してから実行
- **focus_mode（復帰時）**: continue_monitoringで2回以上確認してから実行（セッション開始時は即時可）
- **away_mode**: continue_monitoringで2-3回確認してから実行
- **wake_mode**: continue_monitoringで3回以上確認してから実行
**ただしセッション開始時（履歴が空）のfocus_modeだけは即時実行すること。** それ以外は1回の画像分析だけでモード切り替えツールを直接実行してはいけない。

**重要: 「集中しているか判断できない」という理由で continue_monitoring を選んではいけない。**
居眠り・食事・休憩・離席の明確な兆候がない限り、すべて do_nothing を選択すること。
カメラを見ている、上を向いている、横を向いている、ぼんやりしている等はすべて do_nothing。

## セッション開始時の重要ルール
- **アクション履歴が空の場合（＝セッション開始直後）、ユーザーが席にいるなら必ず focus_mode を選択すること。**
- これは作業環境のセットアップ（照明・BGM・挨拶）を行うためであり、迷う必要はない。
- focus_mode は1セッションで1回だけ実行すればよい。履歴に focus_mode がある場合は再実行しない。

## 居眠り検出の慎重さに関するルール
- **明確な眠気の兆候が必要**: 目が閉じかけている、頭が垂れている、机に伏せている等
- 上を見ている、横を向いている、だけでは「眠そう」とは判断しない
- continue_monitoringを最低3回以上連続した上で、同じ兆候が継続している場合にのみデバイス制御に移行する

## 休憩検出時のアクション
食事中や休憩中の兆候を検出した場合、まず **continue_monitoring** で2回以上確認する。確認後 **break_mode** ツールを1つ選ぶだけでOK。
バックエンドが以下を自動で順次実行する:
- 照明を安らぎモードに切り替え
- Alexaで「休憩モードに切り替えます。ごゆっくりどうぞ」とアナウンス
- リラックスBGMを再生

その後のサイクル:
1. continue_monitoring: 休憩が続いているか確認
2. alexa_info: 休憩が続いていれば天気(weather)やニュース(flashbriefing)を再生
3. do_nothing: 休憩演出完了、通常監視に戻る

## 居眠り検出時のアクション
居眠りをcontinue_monitoringで3回以上連続で確認した場合、**wake_mode** ツールを1つ選ぶだけでOK。
バックエンドが以下を自動で順次実行する:
- 【仮眠フェーズ】照明OFF・BGM停止・「仮眠モードに入ります。2分後に起こします」とアナウンス
- 【2分後・覚醒フェーズ】照明を全灯・「起きてストレッチしましょう」とアナウンス・覚醒BGMを再生

wake_mode実行後、ユーザーが起きて作業を始めたら → **focus_mode** で作業環境に切り替える

## 離席検出時のアクション
席にユーザーがいないことを検出した場合、continue_monitoringで2-3回確認した後に **away_mode** ツールを1つ選ぶだけでOK。
バックエンドが以下を自動で順次実行する:
- 照明をOFF
- Alexaで「離席モードに切り替えます」とアナウンス
- BGMを停止
- エアコンをOFF

## 作業開始・復帰検出時のアクション
休憩・離席・居眠りから作業に戻ったことを検出した場合、まず **continue_monitoring** で2回以上確認する。確認後 **focus_mode** ツールを1つ選ぶだけでOK。
**例外: セッション開始時（履歴が空でユーザーが席にいる場合）は即時 focus_mode を実行する。**
バックエンドが以下を自動で順次実行する:
- 照明を全灯（on-100）に切り替え
- Alexaで「集中モードに切り替えます」とアナウンス
- 集中できるジャズBGMを再生`;

// =============================================================================
// Formatting Helpers
// =============================================================================

/**
 * 照明の状態をフォーマットする
 */
function formatLightState(light: DeviceState['light']): string {
  if (light === null) {
    return '- 照明: 不明';
  }
  return `- 照明: ${light.power === 'on' ? 'ON' : 'OFF'}`;
}

/**
 * エアコンの状態をフォーマットする
 */
function formatAirconState(aircon: DeviceState['aircon']): string {
  if (aircon === null) {
    return '- エアコン: 不明';
  }
  return `- エアコン: 設定温度 ${aircon.temperature}℃ / モード ${aircon.mode}`;
}

/**
 * Alexaの状態をフォーマットする
 */
function formatAlexaState(alexa: DeviceState['alexa']): string | null {
  if (alexa === undefined || alexa === null) {
    return null;
  }
  if (!alexa.connected) {
    return '- Alexa: 未接続';
  }
  const playerLabel = alexa.playerState === 'PLAYING' ? '再生中'
    : alexa.playerState === 'PAUSED' ? '一時停止'
    : 'アイドル';
  return `- Alexa: 接続中 / ${playerLabel}`;
}

/**
 * AgentAction を1行の文字列にフォーマットする
 */
function formatAction(action: AgentAction): string {
  const reason = action.params.reason;
  const reasonSuffix = reason ? `, reason="${reason}"` : '';
  switch (action.tool) {
    case 'light_control':
      return `light_control(action=${action.params.action}${reasonSuffix})`;
    case 'aircon_control':
      return `aircon_control(temperature=${action.params.temperature}, mode=${action.params.mode ?? 'auto'}${reasonSuffix})`;
    case 'break_mode':
      return `break_mode(${reason ? `reason="${reason}"` : ''})`;
    case 'focus_mode':
      return `focus_mode(${reason ? `reason="${reason}"` : ''})`;
    case 'away_mode':
      return `away_mode(${reason ? `reason="${reason}"` : ''})`;
    case 'wake_mode':
      return `wake_mode(${reason ? `reason="${reason}"` : ''})`;
    case 'continue_monitoring':
      return `continue_monitoring(${reason ? `reason="${reason}"` : ''})`;
    case 'do_nothing':
      return `do_nothing(${reason ? `reason="${reason}"` : ''})`;
    default:
      return `${action.tool}(${JSON.stringify(action.params)})`;
  }
}

/**
 * 直近のアクション履歴をフォーマットする
 */
function formatActionHistory(actions: AgentAction[]): string {
  if (actions.length === 0) return '';
  const lines = actions.map((a, i) => `${i + 1}. ${formatAction(a)}`);
  return `

## 直近のアクション履歴（古い順）
${lines.join('\n')}

**履歴の解釈ルール:**
- 履歴が空（セッション開始直後）: ユーザーが席にいるなら **focus_mode** を即時選択（例外: 確認不要）
- focus_mode実行済み → 通常の判断フローに移行（デフォルトは do_nothing）
- continue_monitoringが3回以上連続 かつ 毎回居眠り兆候が確認できる: **wake_mode** を選択
- continue_monitoringが2-3回連続 かつ 席にユーザーがいない: **away_mode** を選択
- continue_monitoringが2回以上連続 かつ 毎回食事・休憩の兆候が確認できる: **break_mode** を選択
- すでにデバイス制御を実行済みなら、追加の介入は不要。do_nothingを選ぶ
- 食事・休憩を検出済みの場合は、上記「休憩検出時のアクション手順」の次のステップに進む
- break_modeの後、休憩から復帰した場合: continue_monitoringで2回以上確認後 → **focus_mode** を選択
- away_mode実行後にユーザーが戻った場合: continue_monitoringで2回以上確認後 → **focus_mode** を選択
- wake_mode実行後にユーザーが起きて作業を始めた場合: continue_monitoringで2回以上確認後 → **focus_mode** を選択`;
}

// =============================================================================
// Public API
// =============================================================================

/**
 * デバイス状態とアクション履歴を含む動的システムプロンプトを構築する。
 *
 * - deviceState が undefined の場合は基本プロンプトのみを返す（Req 2.4）
 * - deviceState が提供された場合は末尾にデバイス状態セクションを追加する（Req 2.1）
 * - デバイスの状態が null の場合は「不明」として表記する
 * - recentActions が提供された場合は直近のアクション履歴を追加する
 *
 * @param deviceState - デバイスの現在状態（undefinedの場合は状態なし）
 * @param recentActions - 直近のアクション履歴（undefinedの場合は履歴なし）
 * @returns 構築されたシステムプロンプト文字列
 */
export function buildPrompt(deviceState?: DeviceState, recentActions?: AgentAction[]): string {
  let prompt = BASE_PROMPT;

  if (deviceState !== undefined) {
    const alexaLine = formatAlexaState(deviceState.alexa);
    prompt += `

## 現在のデバイス状態
${formatLightState(deviceState.light)}
${formatAirconState(deviceState.aircon)}${alexaLine ? '\n' + alexaLine : ''}`;
  }

  if (recentActions !== undefined && recentActions.length > 0) {
    prompt += formatActionHistory(recentActions);
  }

  return prompt;
}
