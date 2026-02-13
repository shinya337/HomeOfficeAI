# Nature Remo

HomeOffice.ai プロジェクトにおける Nature Remo Cloud API クライアントです。

## 概要

Nature Remo デバイスを CLI から操作するためのツールです。以下の機能をサポートしています：

- デバイス一覧・センサー値の取得
- 登録済み家電の一覧表示
- エアコンの操作（温度・モード・風量）
- 照明のオン/オフ

## セットアップ

### 1. 依存パッケージのインストール

```bash
cd backend/packages/nature-remo
npm install
```

### 2. 環境変数の設定

プロジェクトルートの `backend/.env.sample` を参照して `.env` ファイルを作成し、アクセストークンを設定してください。

```env
# Nature Remo API
# Get your access token from: https://home.nature.global
NATURE_REMO_TOKEN=your_access_token_here
```

アクセストークンは [Nature Remo Home](https://home.nature.global) から取得できます。

## 使い方

### コマンド一覧

```bash
npx tsx src/index.ts <command> [options]
```

| コマンド | 説明 |
|----------|------|
| `devices` | デバイス一覧とセンサー値を表示 |
| `appliances` | 登録済み家電一覧を表示 |
| `aircon <id> [options]` | エアコンを操作 |
| `light <id> <on\|off>` | 照明をオン/オフ |

### 使用例

#### デバイス一覧を取得

```bash
npx tsx src/index.ts devices
```

出力例：
```
[RateLimit] Remaining requests: 29/30
┌─────────┬──────────────────────────────────────────┬─────────────┬────────────────────┬─────────────┬──────────┬──────────────┐
│ (index) │ ID                                       │ Name        │ Firmware           │ Temperature │ Humidity │ Illumination │
├─────────┼──────────────────────────────────────────┼─────────────┼────────────────────┼─────────────┼──────────┼──────────────┤
│ 0       │ '383b75b9-0779-47c3-a483-4380daf552e9'   │ 'Remo nano' │ 'Nature-5W1/1.0.5' │ '-'         │ '-'      │ '-'          │
└─────────┴──────────────────────────────────────────┴─────────────┴────────────────────┴─────────────┴──────────┴──────────────┘
```

#### 家電一覧を取得

```bash
npx tsx src/index.ts appliances
```

#### エアコンを操作

```bash
# 冷房26度に設定
npx tsx src/index.ts aircon <appliance-id> --temp 26 --mode cool

# 暖房22度、風量自動に設定
npx tsx src/index.ts aircon <appliance-id> --temp 22 --mode warm --volume auto

# 電源オフ
npx tsx src/index.ts aircon <appliance-id> --off
```

**Aircon オプション:**

| オプション | 説明 | 有効な値 |
|------------|------|----------|
| `--temp` | 温度設定 | 数値（例: 26） |
| `--mode` | 運転モード | `cool`, `warm`, `dry`, `blow`, `auto` |
| `--volume` | 風量 | `auto`, `1`, `2`, `3`, `4` |
| `--off` | 電源オフ | - |

#### 照明を操作

```bash
# 照明をオン
npx tsx src/index.ts light <appliance-id> on

# 照明をオフ
npx tsx src/index.ts light <appliance-id> off
```

## 開発

### npm スクリプト

```bash
# CLI を実行
npm start

# テストを実行
npm test

# テストをウォッチモードで実行
npm run test:watch

# 型チェック
npm run typecheck
```

### プロジェクト構成

```
src/
├── index.ts              # エントリーポイント
├── main.ts               # メイン処理
├── cli/
│   ├── command-parser.ts # コマンドライン引数のパース
│   └── output-formatter.ts # 出力フォーマット
├── client/
│   ├── nature-remo-client.ts # API クライアント
│   └── rate-limit-monitor.ts # レート制限モニター
├── services/
│   ├── device-service.ts     # デバイス関連
│   ├── appliance-service.ts  # 家電一覧
│   ├── aircon-service.ts     # エアコン操作
│   └── light-service.ts      # 照明操作
├── config/
│   └── config-loader.ts      # 設定読み込み
└── types/
    └── types.ts              # 型定義
```

## API レート制限

Nature Remo Cloud API にはレート制限があります（30リクエスト/5分）。CLI 実行時に残りリクエスト数が表示されます。

## ライセンス

MIT
