# IoT AI Agent Loop

Vertex AI Gemini の Function Calling を活用し、デスク環境の画像を定期分析して照明・エアコンを自律制御するエージェントループです。

## 概要

1. デスク周辺の画像を定期的に Gemini で分析（集中 / 眠そう / 離席 など）
2. 状態に応じて Nature Remo API 経由で照明 ON/OFF・エアコン温度調整を実行
3. 眠気検知時は監視間隔を 10 秒に短縮、通常時は 5 分間隔で監視

## セットアップ

### 1. 依存パッケージのインストール

```bash
npm install
```

### 2. 環境変数の設定

プロジェクトルートの `backend/.env.sample` を参照して `.env` ファイルを作成し、以下を設定：

```
GOOGLE_CLOUD_PROJECT=your_project_id_here
NATURE_REMO_TOKEN=your_nature_remo_token_here
```

## 使い方

### 基本的な使用方法

```bash
npx tsx src/index.ts --image-dir ./test-images
```

`--light-id` / `--aircon-id` を省略すると、Nature Remo API からアプライアンス一覧を取得し、最初に見つかった LIGHT / AC タイプの ID を自動設定します。

### オプション

| オプション | 必須 | 説明 |
|-----------|------|------|
| `--image-dir <path>` | Yes | 分析対象の画像ディレクトリ |
| `--light-id <id>` | No | 照明のアプライアンス ID（省略時は自動取得） |
| `--aircon-id <id>` | No | エアコンのアプライアンス ID（省略時は自動取得） |
| `--help, -h` | No | ヘルプを表示 |

### 使用例

```bash
# アプライアンス ID を自動取得して起動
npx tsx src/index.ts --image-dir ./test-images

# アプライアンス ID を明示的に指定
npx tsx src/index.ts --image-dir ./test-images --light-id abc123 --aircon-id def456
```

## 実行例

### 起動ログ

```
[Auto-detected] Light: 4492ab0b-... (照明)
[Auto-detected] Aircon: b4a94feb-... (エアコン)
[IoT AI Agent Loop] 監視ループを開始します
  Model: gemini-2.5-flash
  Image Dir: ./test-images-sleepy (5 枚)
  Normal Interval: 300秒 / Short Interval: 10秒
```

### テスト画像と AI の判断結果（`test-images-sleepy`）

デスクで眠そうにしている連続5枚の画像を使用。AI はアクション履歴を参照しながら段階的に判断する。

| 画像 | AI が選択したアクション |
|------|----------------------|
| ![IMG_0304](test-images/IMG_0304.jpg) | `continue_monitoring` — 10秒後に再確認 |
| ![IMG_0305](test-images/IMG_0305.jpg) | `aircon_control`（16℃ / cool）— 冷房で刺激 |
| ![IMG_0306](test-images/IMG_0306.jpg) | `continue_monitoring` — 10秒後に再確認 |
| ![IMG_0307](test-images/IMG_0307.jpg) | `light_control`（on）— 照明で刺激 |
| ![IMG_0308](test-images/IMG_0308.jpg) | `continue_monitoring` — 10秒後に再確認 |

**判断の流れ:**
- 初回は `continue_monitoring` で様子見（瞬きかもしれないため）
- 次の画像でも眠そうなら、履歴を踏まえてデバイス制御にエスカレーション
- デバイス制御後は通常間隔（5分）に復帰し、次のセッションを開始

## AI が選択するアクション

| アクション | 説明 | 監視間隔 |
|-----------|------|---------|
| `light_control` | 照明の ON/OFF | 5 分（通常） |
| `aircon_control` | エアコンの温度・モード設定 | 5 分（通常） |
| `continue_monitoring` | 眠気の兆候あり、短間隔で再分析 | 10 秒（短縮） |
| `do_nothing` | 異常なし、通常監視を継続 | 5 分（通常） |

## 環境変数

| 変数名 | 必須 | デフォルト | 説明 |
|--------|------|-----------|------|
| `GOOGLE_CLOUD_PROJECT` | Yes | - | Google Cloud プロジェクト ID |
| `NATURE_REMO_TOKEN` | Yes | - | Nature Remo Cloud API トークン |
| `VERTEX_AI_LOCATION` | No | `us-central1` | Vertex AI リージョン |
| `GEMINI_MODEL` | No | `gemini-2.0-flash` | 使用する Gemini モデル名 |

## アーキテクチャ

```
画像ディレクトリ
     ↓
 MonitorLoop (5分 / 10秒間隔)
     ↓
 ImageLoader → base64エンコード
     ↓
 DeviceStateService → 現在のデバイス状態取得
     ↓
 PromptBuilder → デバイス状態を含むプロンプト生成
     ↓
 AgentClient (Vertex AI Gemini + Function Calling)
     ↓
 ResponseParser → AgentAction に変換
     ↓
 DedupActions → 重複アクション防止
     ↓
 ActionDispatcher → Nature Remo API 実行
     ↓
 LightService / AirconService
```

## 開発

```bash
# テスト実行
npm test

# テスト（ウォッチモード）
npm run test:watch

# 型チェック
npm run typecheck
```

## 関連プロジェクト

- [nature-remo](../nature-remo/) - Nature Remo API クライアント
- [vertex-ai-vision](../vertex-ai-vision/) - Vertex AI 画像分析
- [google-ai-vision](../google-ai-vision/) - Google AI Studio 画像分析
