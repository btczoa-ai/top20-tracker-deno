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

  // Validate descending order of top coins by volume
  for (let i = 0; i < agg.topCoins.length - 1; i++) {
    assertEquals(agg.topCoins[i].volume >= agg.topCoins[i + 1].volume, true);
  }
});
