import { assertEquals, assertGreater } from '@std/assert';
import { HyperliquidAdapter } from '../src/worker/adapters/hyperliquid.ts';

Deno.test('HyperliquidAdapter: fetchTop10Aggregation against live API', async () => {
  const adapter = new HyperliquidAdapter();
  const agg = await adapter.fetchTop10Aggregation(10);

  assertEquals(agg.top10Count, 10);
  assertGreater(agg.totalVolume, 0);
  assertGreater(agg.averageVolume, 0);
  assertEquals(agg.upCount + agg.downCount <= 10, true);
  assertEquals(agg.topCoins.length, 10);
  // 上昇/下落別の取引量合計は全体の取引量を超えない
  assertEquals(agg.upVolume + agg.downVolume <= agg.totalVolume + 1, true);
  // 全銘柄分の上昇/下落別取引量は TOP10 分以上になる
  assertEquals(agg.allUpVolume >= agg.upVolume, true);
  assertEquals(agg.allDownVolume >= agg.downVolume, true);

  // Validate descending order of top coins by volume
  for (let i = 0; i < agg.topCoins.length - 1; i++) {
    assertEquals(agg.topCoins[i].volume >= agg.topCoins[i + 1].volume, true);
  }
});
