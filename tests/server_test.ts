import { assertEquals, assertGreater } from '@std/assert';
import { MarketDataAdapter } from '../src/worker/adapters/market_data.ts';
import { TrackerDatabase } from '../src/shared/db/database.ts';
import { TrackerHttpServer } from '../src/webui/server/http_server.ts';
import { TrackerService } from '../src/worker/services/tracker_service.ts';

// Ensure localhost is exempt from proxy in test environment
Deno.env.set('NO_PROXY', 'localhost,127.0.0.1');
Deno.env.set('no_proxy', 'localhost,127.0.0.1');

Deno.test('TrackerHttpServer & API Endpoints with Deno KV', async () => {
  const db = new TrackerDatabase(':memory:');
  await db.init();

  const adapter = new MarketDataAdapter();
  const service = new TrackerService(db, adapter);

  const testPort = 8099;
  const server = new TrackerHttpServer(testPort, service, db);
  server.start();

  try {
    // 1. Health check
    const healthRes = await fetch(`http://localhost:${testPort}/health`);
    assertEquals(healthRes.status, 200);
    const healthJson = await healthRes.json();
    assertEquals(healthJson.success, true);
    assertEquals(healthJson.data.status, 'ok');

    // 2. Initial latest check
    const latestEmptyRes = await fetch(`http://localhost:${testPort}/api/latest`);
    assertEquals(latestEmptyRes.status, 200);

    // 3. Manual collection trigger via /api/collect
    const collectRes = await fetch(`http://localhost:${testPort}/api/collect`, { method: 'POST' });
    assertEquals(collectRes.status, 200);
    const collectJson = await collectRes.json();
    assertEquals(collectJson.success, true);
    assertGreater(collectJson.data.total_volume_24h, 0);
    assertEquals(collectJson.data.top_count, 20);

    // 4. Latest record should now exist
    const latestRes = await fetch(`http://localhost:${testPort}/api/latest`);
    const latestJson = await latestRes.json();
    assertEquals(latestJson.success, true);
    assertEquals(latestJson.data.id, collectJson.data.id);

    // 5. History should contain the record
    const historyRes = await fetch(`http://localhost:${testPort}/api/history?limit=10`);
    const historyJson = await historyRes.json();
    assertEquals(historyJson.success, true);
    assertGreater(historyJson.data.length, 0);
  } finally {
    await server.stop();
    db.close();
  }
});
