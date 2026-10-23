import { assertEquals, assertNotEquals } from '@std/assert';
import { Database } from '@db/sqlite';
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
      up_volume: 3500000000,
      down_volume: 1500000000,
      all_up_volume: 9000000000,
      all_down_volume: 3000000000,
    });

    assertNotEquals(record1.id, 0);
    assertEquals(db.getRecordCount(), 1);

    const latest1 = db.getLatest();
    assertEquals(latest1?.timestamp, 1729000000000);
    assertEquals(latest1?.total_volume, 5000000000);
    assertEquals(latest1?.up_count, 7);
    assertEquals(latest1?.up_volume, 3500000000);
    assertEquals(latest1?.down_volume, 1500000000);
    assertEquals(latest1?.all_up_volume, 9000000000);
    assertEquals(latest1?.all_down_volume, 3000000000);

    const record2 = db.insertRecord({
      timestamp: 1729003600000,
      iso_time: '2026-10-19T08:00:00.000+09:00',
      total_volume: 6000000000,
      average_volume: 600000000,
      up_count: 4,
      down_count: 6,
      up_volume: 2000000000,
      down_volume: 4000000000,
      all_up_volume: 5000000000,
      all_down_volume: 8000000000,
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

Deno.test('TrackerDatabase: 旧スキーマのDBに上昇/下落取引量カラム (TOP10分・全銘柄分) を追加するマイグレーション', () => {
  const path = Deno.makeTempFileSync({ suffix: '.db' });
  try {
    // 旧スキーマ (up_volume / down_volume 無し) を再現
    const legacy = new Database(path);
    legacy.exec(`CREATE TABLE records (
      id INTEGER PRIMARY KEY AUTOINCREMENT, timestamp INTEGER NOT NULL, iso_time TEXT NOT NULL,
      total_volume REAL NOT NULL, average_volume REAL NOT NULL,
      up_count INTEGER NOT NULL, down_count INTEGER NOT NULL
    )`);
    legacy.exec(`INSERT INTO records (timestamp, iso_time, total_volume, average_volume, up_count, down_count)
      VALUES (1729000000000, 'x', 100, 10, 5, 5)`);
    legacy.close();

    const db = new TrackerDatabase(path);
    try {
      const latest = db.getLatest();
      assertEquals(latest?.up_volume, 0);
      assertEquals(latest?.down_volume, 0);
      assertEquals(latest?.all_up_volume, 0);
      assertEquals(latest?.all_down_volume, 0);
    } finally {
      db.close();
    }
  } finally {
    Deno.removeSync(path);
  }
});
