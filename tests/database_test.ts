import { assertEquals, assertNotEquals } from '@std/assert';
import { TrackerDatabase } from '../src/shared/db/database.ts';

Deno.test('TrackerDatabase: insert, getLatest, getHistory, getRecordCount', () => {
  const db = new TrackerDatabase(':memory:');

  try {
    assertEquals(db.getRecordCount(), 0);
    assertEquals(db.getLatest(), null);
    assertEquals(db.getHistory().length, 0);

    const record1 = db.insertRecord({
      timestamp: 1729000000000,
      iso_time: '2026-10-19T07:00:00.000+09:00',
      total_volume: 5000000000,
      average_volume: 500000000,
      up_count: 7,
      down_count: 3,
    });

    assertNotEquals(record1.id, 0);
    assertEquals(db.getRecordCount(), 1);

    const latest1 = db.getLatest();
    assertEquals(latest1?.timestamp, 1729000000000);
    assertEquals(latest1?.total_volume, 5000000000);
    assertEquals(latest1?.up_count, 7);

    const record2 = db.insertRecord({
      timestamp: 1729003600000,
      iso_time: '2026-10-19T08:00:00.000+09:00',
      total_volume: 6000000000,
      average_volume: 600000000,
      up_count: 4,
      down_count: 6,
    });

    assertEquals(db.getRecordCount(), 2);

    const latest2 = db.getLatest();
    assertEquals(latest2?.id, record2.id);
    assertEquals(latest2?.timestamp, 1729003600000);

    const ascHistory = db.getHistory(10, 'asc');
    assertEquals(ascHistory.length, 2);
    assertEquals(ascHistory[0].timestamp, 1729000000000);
    assertEquals(ascHistory[1].timestamp, 1729003600000);

    const descHistory = db.getHistory(10, 'desc');
    assertEquals(descHistory.length, 2);
    assertEquals(descHistory[0].timestamp, 1729003600000);
    assertEquals(descHistory[0].total_volume, 6000000000);
  } finally {
    db.close();
  }
});
