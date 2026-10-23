# Top 10 Crypto Volume Tracker (Deno)

過去24時間の暗号資産取引量TOP10通貨の合計値・平均値を1時間単位で取得・永続化し、平均取引量の推移をWeb UIチャートで可視化するプロジェクトです。
[`btc-grid-deno`](../btc-grid-deno) の構成（Deno / TypeScript / SQLite / Docker）をベースに設計・実装されています。

---

## 🌟 主な機能・特徴

1. **1時間単位の自動集約 & 永続化**:
   - 毎時00分（正時）の切り替えタイミングで自動的に最新の取引量データを再取得・登録。
   - 過去24H取引量（`dayNtlVlm`）上位10通貨の「合計取引量 (`total_volume`)」と「平均取引量 (`average_volume`)」を算出。
   - TOP10通貨のうち価格上昇した通貨数 (`up_count`) および下落した通貨数 (`down_count`) を同時に集計・登録。
   - 上昇通貨・下落通貨それぞれの24h取引量合計を、TOP10分 (`up_volume` / `down_volume`) と全銘柄分 (`all_up_volume` / `all_down_volume`) で記録。WebUI では1時間ごとの「全銘柄の上昇コイン取引量 ÷ 下落コイン取引量」(倍率) を1本線チャートで表示 (全銘柄分は収集処理の更新後の記録から表示され、過去分は遡れない)。
   - ※データベースには通貨名一覧は保存せず、軽量な数値集約メトリクスのみを永続化（高速・軽量）。

2. **Web UI & 過去線チャート（単一ライン表示）**:
   - 1時間単位の「TOP10通貨取引量平均値 ($ USD)」の推移に特化した過去線チャート（Chart.js）。
   - 最新の平均取引量、合計取引量、価格モメンタム（上昇数🟢/下落数🔴）、最終更新日時（JST）のサマリーカード表示。
   - 24時間 / 7日間 / 全期間のタイムフレーム切り替え対応。
   - 60秒ごとの自動リフレッシュ機能 & 即時更新ボタン。

3. **高信頼・運用性**:
   - HyperliquidパブリックAPIとの直接通信（APIキー不要）。
   - タイムゾーン対応（JST: UTC+9）。
   - クロックドリフト防止ロジックを備えた定期実行スケジューラ。
   - Docker / docker-compose によるワンコマンド起動対応。

---

## 🏗️ システム構成図 (System Architecture)

```text
┌────────────────────────────────────────────────────────┐
│ 外部: Hyperliquid DEX API (POST /info)                 │
└──────────────────────────┬─────────────────────────────┘
                           │ (毎時00分 24H取引量・前日比価格)
                           ▼
┌────────────────────────────────────────────────────────┐
│ Worker コンテナ (top10-volume-tracker-worker)          │
│  ・毎時正時スケジューラ (:00:00 JST ドリフト防止)      │
│  ・Hyperliquid Adapter (24H取引量 & 前日比価格抽出)    │
│  ・TOP10集計サービス (合計値・平均値・上昇/下落数判定) │
└──────────────────────────┬─────────────────────────────┘
                           │
                           │ 定期書き込み (WALモード)
                           ▼
              ┌───────────────────────────┐
              │ 共有ボリューム (./data)   │
              │ SQLite (data/tracker.db)  │
              │ └ records テーブル        │
              └────────────┬──────────────┘
                           │
                           │ 高速読み出し (非ブロッキング)
                           ▼
┌────────────────────────────────────────────────────────┐
│ WebUI コンテナ (top10-volume-tracker-webui)            │
│  ・Deno HTTP サーバー (Port 8003)                      │
│  ・REST API エンドポイント (/api/history, /api/latest) │
│  ・静的ダッシュボード画面配信 (HTML / CSS / JS)        │
└──────────────────────────┬─────────────────────────────┘
                           │
                           │ 画面アセット配信 & 60秒自動更新
                           ▼
┌────────────────────────────────────────────────────────┐
│ クライアント ブラウザ (http://localhost:8003/)         │
│  ・Chart.js 過去線チャート (TOP10平均推移 & 期間平均基準線)│
│  ・サマリーカード (最新平均値・合計値・上昇/下落数)    │
└────────────────────────────────────────────────────────┘
```

---

## 📂 プロジェクト構成

```
top10-volume-tracker-deno/
├── .env.example              # 環境変数テンプレート
├── .gitignore                # Git除外設定
├── .dockerignore             # Docker除外設定
├── docker/                   # サービス別独立Dockerfile
│   ├── Dockerfile.worker     # 【Worker専用コンテナ】
│   └── Dockerfile.webui      # 【WebUI専用コンテナ】
├── docker-compose.yml        # マルチコンテナ設定（worker + webui）
├── deno.json                 # Deno設定（start, start:worker, start:webui）
├── data/                     # SQLiteデータベース配置ディレクトリ (WALモード)
│   └── tracker.db            # 永続化DBファイル (自動生成)
├── src/
│   ├── main.ts               # ローカル開発用・統合エントリポイント
│   ├── worker/               # 【データ取得・集約層】
│   │   ├── main.ts           # Worker独立エントリポイント
│   │   ├── adapters/
│   │   │   └── hyperliquid.ts# 取引所APIクライアント & TOP10抽出
│   │   └── services/
│   │       └── tracker_service.ts# 集計サービス & 毎時正時スケジューラ
│   ├── webui/                # 【WebUI・API提供層】
│   │   ├── main.ts           # WebUI独立エントリポイント
│   │   ├── server/
│   │   │   └── http_server.ts# 静的配信 & REST APIサーバー
│   │   └── public/           # Web UI フロントエンド (HTML / CSS / JS)
│   │       ├── index.html    # ダッシュボード画面
│   │       ├── style.css     # ダークテーマスタイル
│   │       └── app.js        # Chart.js描画 & API通信ロジック
│   └── shared/               # 【共通基盤層】
│       ├── db/
│       │   └── database.ts   # SQLite永続化リポジトリ (WALモード対応)
│       ├── helpers/
│       │   └── time_helper.ts# JST時刻処理 & 次回正時計算
│       ├── constants.ts      # 共通定数・環境設定
│       ├── logger.ts         # タイムゾーン対応ロガー
│       └── types.ts          # 共通TypeScript型定義
├── tests/                    # 単体・結合テスト
│   ├── adapter_test.ts       # APIアダプタ検証
│   ├── database_test.ts      # SQLite CRUD検証
│   ├── helpers_test.ts       # 時刻計算検証
│   └── server_test.ts        # REST API統合検証
└── md/
    └── spec_and_architecture.md # 詳細設計仕様書 (Rule.03 準拠)
```

---

## 🚀 クイックスタート

### 1. ローカルで直接実行する場合 (Deno)

Deno 2.x がインストールされている環境で実行します。

```bash
# プロジェクトディレクトリへ移動
cd /mnt/d/top10-volume-tracker-deno

# テストの実行
deno task test

# 型チェック
deno task check

# アプリケーション起動
deno task start
# 開発モード (コード変更の自動リロード)
deno task dev
```

起動後、ブラウザで [http://localhost:8003/](http://localhost:8003/) にアクセスしてください。

### 2. Docker / Docker Compose で実行する場合

```bash
# コンテナのビルドおよびバックグラウンド起動
docker compose up -d --build

# ログの確認
docker compose logs -f

# 停止
docker compose down
```

---

## 🔌 API エンドポイント

| メソッド | パス | 説明 |
|:---|:---|:---|
| `GET` | `/health` | ヘルスチェック（稼働確認） |
| `GET` | `/api/latest` | 最新の集計レコードを返却 |
| `GET` | `/api/history?limit=100&order=asc` | 履歴レコード一覧を返却（Chart描画用） |
| `POST` / `GET` | `/api/collect` | 手動での即時データ取得・登録トリガー（テスト・検証用） |

---

## 📊 データベース設計 (`data/tracker.db`)

### `records` テーブル
通貨リストは保持せず、集約された数値メトリクスのみを格納します。

| カラム名 | 型 | 説明 |
|:---|:---|:---|
| `id` | `INTEGER PRIMARY KEY AUTOINCREMENT` | 一意識別子 |
| `timestamp` | `INTEGER NOT NULL` | 収集時のUnixタイムスタンプ (ミリ秒) |
| `iso_time` | `TEXT NOT NULL` | JST表記のISO 8601日時文字列 |
| `total_volume` | `REAL NOT NULL` | TOP10通貨の24時間取引量 合計値 ($ USD) |
| `average_volume` | `REAL NOT NULL` | TOP10通貨の24時間取引量 平均値 ($ USD) |
| `up_count` | `INTEGER NOT NULL` | TOP10通貨のうち前日比価格上昇した通貨数 |
| `down_count` | `INTEGER NOT NULL` | TOP10通貨のうち前日比価格下落した通貨数 |
| `up_volume` | `REAL NOT NULL DEFAULT 0` | 上昇通貨の24h取引量合計 (USD)。旧データは 0 |
| `down_volume` | `REAL NOT NULL DEFAULT 0` | 下落通貨の24h取引量合計 (USD)。旧データは 0 |
| `all_up_volume` | `REAL NOT NULL DEFAULT 0` | 全銘柄 (TOP10に限らない) の上昇銘柄の24h取引量合計 (USD)。旧データは 0 |
| `all_down_volume` | `REAL NOT NULL DEFAULT 0` | 全銘柄の下落銘柄の24h取引量合計 (USD)。旧データは 0 |

---

## 📜 ライセンス
MIT License
