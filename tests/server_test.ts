import { assertEquals, assertGreater } from '@std/assert';
import { HyperliquidAdapter } from '../src/worker/adapters/hyperliquid.ts';
import { TrackerDatabase } from '../src/shared/db/database.ts';
import { TrackerHttpServer } from '../src/webui/server/http_server.ts';
import { TrackerService } from '../src/worker/services/tracker_service.ts';

Deno.test('TrackerHttpServer & API Endpoints', async () => {
  const db = new TrackerDatabase(':memory:');
  const adapter = new HyperliquidAdapter();
  const service = new TrackerService(db, adapter);

  const testPort = 8099;
  const server = new TrackerHttpServer(testPort, service, db);
  const httpServer = server.start();

  try {
    // 1. Health check
    const healthRes = await fetch(`http://localhost:${testPort}/health`);
    assertEquals(healthRes.status, 200);
    const healthJson = await healthRes.json();
    assertEquals(healthJson.success, true);
    assertEquals(healthJson.data.status, 'ok');

    // 2. Initial latest (empty)
    const latestEmptyRes = await fetch(`http://localhost:${testPort}/api/latest`);
    assertEquals(latestEmptyRes.status, 200);
    const latestEmptyJson = await latestEmptyRes.json();
    assertEquals(latestEmptyJson.data, null);

    // 3. Manual collection trigger via /api/collect
    const collectRes = await fetch(`http://localhost:${testPort}/api/collect`, { method: 'POST' });
    assertEquals(collectRes.status, 200);
    const collectJson = await collectRes.json();
    assertEquals(collectJson.success, true);
    assertGreater(collectJson.data.total_volume, 0);

    // 4. Latest record should now exist
    const latestRes = await fetch(`http://localhost:${testPort}/api/latest`);
    const latestJson = await latestRes.json();
    assertEquals(latestJson.success, true);
    assertEquals(latestJson.data.id, collectJson.data.id);

    // 5. History should contain 1 record
    const historyRes = await fetch(`http://localhost:${testPort}/api/history?limit=10`);
    const historyJson = await historyRes.json();
    assertEquals(historyJson.success, true);
    assertEquals(historyJson.data.length, 1);
    assertEquals(historyJson.data[0].id, collectJson.data.id);
  } finally {
    await server.stop();
    db.close();
  }
});
