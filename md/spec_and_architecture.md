# TOP20 取引量トラッカー 詳細設計・仕様書

- **プロジェクト名**: `top10-volume-tracker-deno` (TOP20 1時間取引量 Deno KV エディション)
- **改修日**: 2026-11-13
- **保存場所**: `md/` 配下 (Rule.03 準拠)

---

## 1. 概要と目的

本システムは、暗号資産市場における時価総額上位20通貨（TOP 20）の1時間単位の取引量（USD）合計・平均を定点観測するためのトラッカーシステムです。
毎時正時（:00:00）に時価総額TOP20通貨の取引量データを集計し、**Deno KV** に時系列永続化を行い、Web UI上に1時間足のチャートと主要統計カードを提供します。

---

## 2. システム構成とアーキテクチャ

### 2.1 データフロー & コンポーネント
- **Worker サービス (`src/worker/`)**:
  - `adapters/market_data.ts`: 時価総額上位20銘柄の特定および1時間取引量データの取得（CoinGecko / CoinCap / フォールバックシミュレーション）。
  - `services/tracker_service.ts`: 毎時正時スケジューリング（JSTドリフト防止）および Deno KV へのトランザクション保存。
- **Shared 永続化層 (`src/shared/db/database.ts`)**:
  - SQLiteから **Deno KV (`Deno.openKv()`)** へ移行。
  - キー構造:
    - `["records", timestamp]`: 1時間ごとの時系列スナップショット (`TrackerRecord`)。
    - `["latest"]`: 最新のスナップショットレコード。
- **WebUI サーバー & フロントエンド (`src/webui/`)**:
  - `server/http_server.ts`: Deno KV をソースとする REST API (`/health`, `/api/latest`, `/api/history`, `/api/collect`) および静的ファイル配信。
  - `public/`: Chart.js による TOP20 1時間取引量合計推移グラフ、サマリー統計カード、自動更新機能。

---

## 3. Deno KV データスキーマ (`TrackerRecord`)

```typescript
export interface TrackerRecord {
  id: number;                 // Unixタイムスタンプ (ミリ秒)
  timestamp: number;          // Unixタイムスタンプ (ミリ秒)
  iso_time: string;           // JST / UTC フォーマット済み文字列
  total_volume_1h: number;    // TOP20通貨の1時間取引量合計 (USD)
  average_volume_1h: number;  // TOP20通貨の1時間取引量平均 (USD)
  top_count: number;          // 集計銘柄数 (20)
  up_count?: number;          // 1時間で上昇した銘柄数
  down_count?: number;        // 1時間で下落した銘柄数
  coins?: TopCoinInfo[];      // 銘柄別詳細スナップショット
}
```
