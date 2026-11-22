import { assertEquals, assertGreater } from '@std/assert';
import { MarketDataAdapter } from '../src/worker/adapters/market_data.ts';

Deno.test('MarketDataAdapter: fetchTop20HourlyAggregation produces valid 24h volume data', async () => {
  const adapter = new MarketDataAdapter();
  const agg = await adapter.fetchTop20HourlyAggregation(20);

  assertEquals(agg.topCount, 20);
  assertGreater(agg.totalVolume24h, 0);
  assertGreater(agg.averageVolume24h, 0);
  assertEquals(agg.coins.length, 20);
  assertEquals(agg.upCount + agg.downCount <= 20, true);

  // Validate presence of symbols and volume24h
  for (const coin of agg.coins) {
    assertEquals(typeof coin.name, 'string');
    assertEquals(typeof coin.symbol, 'string');
    assertGreater(coin.volume24h, 0);
    assertGreater(coin.marketCap, 0);
  }
});

Deno.test('MarketDataAdapter: generateSimulatedAggregation works offline with 24h volume', () => {
  const adapter = new MarketDataAdapter();
  const agg = adapter.generateSimulatedAggregation(20);

  assertEquals(agg.topCount, 20);
  assertGreater(agg.totalVolume24h, 0);
  assertEquals(agg.coins.length, 20);
});
