# HomeOffice.ai

AI駆動のホームオフィス環境最適化システム。Webカメラで撮影した画像をAI（Vertex AI Gemini）が分析し、ユーザーの状態（作業中、眠気、休憩、離席）を判定して、照明・エアコン・Alexaなどの IoT デバイスを自律的に制御します。

ブラウザベースの「バーチャルコワーキングスペース」として、ワークセッション中にバックグラウンドで環境モニタリングとインテリジェントなデバイス制御を行います。

## アーキテクチャ

4層構成のクライアント・サーバーアーキテクチャです。

```
フロントエンド (Vite)  -->  バックエンド API (Express)  -->  Vertex AI Gemini (Function Calling)
                                                        -->  Nature Remo Cloud API (照明・エアコン)
                                                        -->  Alexa Remote2 (音声・ルーティン)
```

| 層 | 技術 | 役割 |
|----|------|------|
| フロントエンド | Vanilla JS + Vite | Webカメラキャプチャ、セッション管理UI |
| バックエンド API | TypeScript + Express | REST API、AI分析オーケストレーション |
| AI分析 | Vertex AI Gemini 2.0/2.5 Flash | 画像分析、並列 Function Calling によるマルチアクション判定 |
| IoT制御 | Nature Remo / Alexa Remote2 | 照明モード変更、エアコン温度調整、Alexa音声・アナウンス |

## 前提条件

- **Node.js 20+**
- **Google Cloud CLI** -- `gcloud auth application-default login` で認証済みであること
- **Nature Remo API トークン** -- [home.nature.global](https://home.nature.global/) から取得
- **Alexa Cookie**（任意） -- Amazon Echo の音声制御を使用する場合に必要

## セットアップ

### 1. リポジトリのクローン

```bash
git clone <repository-url>
cd HomeOfficeAI
```

### 2. 依存パッケージのインストール

```bash
# フロントエンド
cd frontend && npm install

# バックエンド API
cd backend && npm install

# バックエンドパッケージ（必要に応じて）
cd backend/packages/nature-remo && npm install
cd backend/packages/iot-ai-agent-loop && npm install
cd backend/packages/alexa-remote2 && npm install
```

### 3. 環境変数の設定

```bash
# テンプレートをコピーして編集する
cp backend/.env.sample backend/.env
```

`.env` ファイルを開き、以下の値を設定します。

| 変数 | 説明 |
|------|------|
| `GOOGLE_CLOUD_PROJECT` | Google Cloud プロジェクト ID |
| `NATURE_REMO_TOKEN` | Nature Remo API トークン |
| `ALEXA_COOKIE_FILE_PATH` | Alexa Cookie ファイルパス（任意） |

## 開発

### フロントエンド

```bash
cd frontend

# 開発サーバー起動（ポート 5173）
npm run dev

# テスト実行
npm test
```

### バックエンド API

```bash
cd backend

# 開発サーバー起動（ポート 3001、ホットリロード付き）
npm run dev

# テスト実行
npm test

# 型チェック
npm run typecheck
```

## API エンドポイント

バックエンド API サーバー（ポート 3001）が提供するエンドポイントです。

| メソッド | パス | 説明 |
|---------|------|------|
| `GET` | `/health` | ヘルスチェック |
| `GET` | `/api/devices` | 登録デバイス一覧 |
| `POST` | `/api/session/start` | ワークセッション開始（許可デバイス指定） |
| `POST` | `/api/session/end` | ワークセッション終了 |
| `GET` | `/api/session/status` | セッション状態取得 |
| `POST` | `/api/analyze` | 画像分析＋IoTアクション実行 |

## ディレクトリ構成

```
HomeOfficeAI/
├── frontend/                          # フロントエンド（Vanilla JS + Vite）
│   ├── app.js                         #   アプリケーションエントリポイント
│   ├── session-controller.js          #   セッションライフサイクル管理
│   ├── backend-api.js                 #   REST APIクライアント
│   └── *.test.js                      #   テストファイル（co-located）
│
├── backend/                           # バックエンド APIサーバー（TypeScript + Express）
│   ├── src/
│   │   ├── handlers/                  #   Expressルートハンドラ
│   │   ├── services/                  #   ビジネスロジックサービス
│   │   ├── dispatcher/                #   AIアクション実行レイヤー
│   │   ├── tools/                     #   Vertex AI Function Calling ツール定義
│   │   ├── types/                     #   TypeScript型定義
│   │   └── config/                    #   設定・環境変数
│   ├── packages/                      #   ドメイン分離パッケージ
│   │   ├── nature-remo/               #     Nature Remo Cloud API クライアント
│   │   ├── iot-ai-agent-loop/         #     AIエージェントコア（Vertex AI連携）
│   │   ├── alexa-remote2/             #     Amazon Alexa制御
│   │   └── vertex-ai-vision/          #     Vision API型定義
│   └── .env.sample                    #   環境変数テンプレート
│
└── README.md                          # 本ファイル
```
