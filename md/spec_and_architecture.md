# TOP10 取引量トラッカー 詳細設計・仕様書

- **プロジェクト名**: `top10-volume-tracker-deno`
- **作成日**: 2026-10-19
- **保存場所**: `md/` 配下 (Rule.03 準拠)

---

## 1. 概要と目的

本システムは、暗号資産市場における流動性上位10通貨の取引量動向を定点観測するためのトラッカーシステムです。
毎時正時（:00:00）に過去24時間の取引量上位10通貨のデータを集計・永続化し、Web UI上に平均取引量の推移チャートを提供します。

---

## 2. システム構成図とアーキテクチャ

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
│  ・Chart.js 過去線チャート (TOP10平均取引量 単一ライン)│
│  ・サマリーカード (最新平均値・合計値・上昇/下落数)    │
└────────────────────────────────────────────────────────┘
```

### 2.1 責務分離アーキテクチャ (`worker` / `webui` / `shared`)
- **Worker層 (`src/worker/`)**: バックグラウンドでのデータ取得・集約・登録を担当。
  - `adapters/hyperliquid.ts`: 取引所APIとの通信、データ正規化、TOP10ランキング抽出。
  - `services/tracker_service.ts`: 毎時正時（:00:00）スケジューリング、重複実行ガード、DB登録。
- **WebUI層 (`src/webui/`)**: ユーザーインターフェースおよびデータ配信APIを担当。
  - `server/http_server.ts`: 静的ファイル配信およびJSON REST API (`/health`, `/api/latest`, `/api/history`, `/api/collect`)。
  - `public/`: Chart.jsを用いた単一ライン過去線チャートおよびステータスカード (HTML / CSS / JS)。
- **Shared層 (`src/shared/`)**: システム共通の永続化・ユーティリティ・型定義を提供。
  - `db/database.ts`: SQLite (`@db/sqlite`) を利用した永続化。64ビット整数タイムスタンプに対応。
  - `helpers/time_helper.ts`: JST時刻処理および正時タイマー計算。
  - `constants.ts`, `logger.ts`, `types.ts`: 共通定数・ロガー・型定義。

### 2.2 データ永続化方針（通貨リスト除外）
ユーザー要件に基づき、個別の通貨リストは保存せず、以下の集約数値のみをテーブルに記録します。
```sql
CREATE TABLE IF NOT EXISTS records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp INTEGER NOT NULL,
  iso_time TEXT NOT NULL,
  total_volume REAL NOT NULL,
  average_volume REAL NOT NULL,
  up_count INTEGER NOT NULL,
  down_count INTEGER NOT NULL,
  up_volume REAL NOT NULL DEFAULT 0,
  down_volume REAL NOT NULL DEFAULT 0,
  all_up_volume REAL NOT NULL DEFAULT 0,
  all_down_volume REAL NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_records_timestamp ON records(timestamp);
```

### 2.3 スケジューリングとクロックドリフト防止
- `getMsUntilNextHour()` により、現在時刻から次の正時（`:00:00.000`）までのミリ秒差分を動的に計算。
- 実行完了後に再計算して次のタイマーを設定するため、長期連続稼働時にもズレ（クロックドリフト）が発生しません。

### 2.4 マルチコンテナ分離設計 (Worker & WebUI)
- **`docker/Dockerfile.worker`**: 外部API通信とDB書き込みを行う軽量バックグラウンドデーモン。
- **`docker/Dockerfile.webui`**: 静的HTML/CSS/JS配信およびDB読み取りAPIを提供するHTTPサーバー。
- **SQLite WALモード**: 複数コンテナが `./data:/app/data` をボリューム共有し、Workerの書き込み中もWebUIがブロッキングされずに即座に応答可能。

---

## 3. Web UI チャート設計

- **対象指標**: 1時間ごとのTOP10通貨取引量平均値（`average_volume`）の過去線チャートのみ（単一ライン）。
- **グラデーションとアクセント**: サイアン〜エメラルドのネオン発光エフェクトを適用。
- **X軸**: JST時刻（`MM/DD HH:mm`）。
- **Y軸**: 米ドル表記（`$123.45M`, `$1.23B` などコンパクト表記）。
- **ツールチップ**: 日時、平均取引量、合計取引量、上昇/下落通貨数を表示。

### 全銘柄 上昇 ÷ 下落コイン 取引量チャート
- **対象指標**: 1時間ごとの全銘柄 (TOP10に限らない、上場廃止銘柄を除き24h取引量が正の銘柄) の上昇コイン取引量合計 (`all_up_volume`) ÷ 下落コイン取引量合計 (`all_down_volume`) の倍率 (1本線)。
- **収集**: worker が `metaAndAssetCtxs` の全銘柄から、`markPx > prevDayPx` を上昇、`markPx < prevDayPx` を下落として毎時集計する (TOP10分の `up_volume` / `down_volume` も従来どおり記録)。
- **過去データ**: 全銘柄分は収集処理の更新後から蓄積される。それ以前の行 (0) はチャートから除外し、遡及はできない。
- **下落0の扱い**: 下落合計が0の時点は除算できないため欠測 (線を途切れさせる)。
- **Y軸**: 倍率 (`0倍` 〜)。
- **ツールチップ**: 日時、倍率、上昇/下落それぞれの取引量 (コンパクト表記)。

---

## 4. 品質保証と検証結果 (PDCA)

- **自動テスト (`deno task test`)**:
  - `adapter_test.ts`: 実API通信、TOP10抽出、合計/平均値計算の妥当性 (OK)
  - `database_test.ts`: インメモリSQLiteでのCRUDおよびソート検証 (OK)
  - `helpers_test.ts`: JST時刻変換およびミリ秒タイマー計算検証 (OK)
  - `server_test.ts`: HTTPサーバー起動、静的配信、`/api/latest`, `/api/history`, `/api/collect` 疎通検証 (OK)
- **静的解析 (`deno task check`)**: エラー 0 件。
