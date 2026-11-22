# Top 20 Crypto Hourly Volume Tracker (Deno KV)

暗号資産市場の時価総額TOP20通貨の「1時間単位の取引量（USD）」の合計値・平均値を定期取得・Deno KVへ永続化し、Web UIチャートで可視化するトラッカープロジェクトです。

---

## 🌟 主な機能・特徴

1. **時価総額TOP20通貨の1時間足取引量トラッキング**:
   - 毎時00分（正時）のタイミングで時価総額上位20通貨のデータを集計。
   - 1時間単位の合計取引量（`total_volume_1h`）および平均取引量（`average_volume_1h`）を算出。
   - 1時間内での価格上昇・下落銘柄数（モメンタム比率）を同時に記録。

2. **Deno KV ネイティブ永続化**:
   - `Deno.openKv()` による高速・軽量な組み込みKey-Valueストア採用。
   - キープレフィックス `["records", timestamp]` による時系列レンジクエリと `["latest"]` による最新データ即時取得。

3. **Web UI チャート可視化**:
   - 1時間足のTOP20取引量合計推移チャート（Chart.js）。
   - 最新の合計取引量、平均取引量、騰落比率、最終更新日時のサマリーカード。
   - 24時間 / 7日間 / 全期間のタイムフレーム切り替え & 60秒自動更新。

---

## 🚀 起動方法

### 開発・ローカル実行 (Deno)

```bash
# 全体起動 (Worker + WebUI)
deno task start

# Worker単体起動 (データ収集・KV保存デーモン)
deno task start:worker

# WebUI単体起動 (ダッシュボード & APIサーバー: http://localhost:8003/)
deno task start:webui

# テスト実行
deno task test

# 型チェック
deno task check
```

### Docker 起動

```bash
docker compose up -d --build
```
