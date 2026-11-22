import { assertEquals, assertGreater } from '@std/assert';
import { TrackerDatabase } from '../src/shared/db/database.ts';

Deno.test('TrackerDatabase: Deno KV insert, getLatest, getHistory, getRecordCount', async () => {
  const db = new TrackerDatabase(':memory:');
  await db.init();

  try {
    // 1. Initially empty
    const initialCount = await db.getRecordCount();
    assertEquals(initialCount, 0);

    const initialLatest = await db.getLatest();
    assertEquals(initialLatest, null);

    // 2. Insert record
    const timestamp1 = 1700000000000;
    const record1 = await db.insertRecord({
      timestamp: timestamp1,
      iso_time: '2026-11-13T16:00:00+09:00',
      total_volume_24h: 120_000_000_000,
      average_volume_24h: 6_000_000_000,
      total_volume_1h: 120_000_000_000,
      average_volume_1h: 6_000_000_000,
      top_count: 20,
      up_count: 14,
      down_count: 6,
    });

    assertEquals(record1.id, timestamp1);
    assertEquals(record1.total_volume_24h, 120_000_000_000);

    // 3. Insert second record
    const timestamp2 = 1700003600000;
    await db.insertRecord({
      timestamp: timestamp2,
      iso_time: '2026-11-13T17:00:00+09:00',
      total_volume_24h: 125_000_000_000,
      average_volume_24h: 6_250_000_000,
      total_volume_1h: 125_000_000_000,
      average_volume_1h: 6_250_000_000,
      top_count: 20,
      up_count: 11,
      down_count: 9,
    });

    // 4. Check record count
    const count = await db.getRecordCount();
    assertEquals(count, 2);

    // 5. Check latest
    const latest = await db.getLatest();
    assertEquals(latest?.timestamp, timestamp2);
    assertEquals(latest?.total_volume_24h, 125_000_000_000);

    // 6. Check history ASC
    const historyAsc = await db.getHistory(10, 'asc');
    assertEquals(historyAsc.length, 2);
    assertEquals(historyAsc[0].timestamp, timestamp1);
    assertEquals(historyAsc[1].timestamp, timestamp2);

    // 7. Check history DESC
    const historyDesc = await db.getHistory(10, 'desc');
    assertEquals(historyDesc.length, 2);
    assertEquals(historyDesc[0].timestamp, timestamp2);
    assertEquals(historyDesc[1].timestamp, timestamp1);
  } finally {
    db.close();
  }
});
