/**
 * Top10 Volume Tracker: Main Entrypoint
 * Coordinates database initialization, scheduler launch, and HTTP server startup.
 */

import '@std/dotenv/load';
import { HyperliquidAdapter } from './worker/adapters/hyperliquid.ts';
import {
  DEFAULT_DB_PATH,
  DEFAULT_PORT,
  HYPERLIQUID_API_URL,
} from './shared/constants.ts';
import { TrackerDatabase } from './shared/db/database.ts';
import { type LogLevel, logger, setLogLevel } from './shared/logger.ts';
import { TrackerHttpServer } from './webui/server/http_server.ts';
import { TrackerService } from './worker/services/tracker_service.ts';

async function main(): Promise<void> {
  const logLevelEnv = Deno.env.get('LOG_LEVEL')?.toUpperCase() as LogLevel | undefined;
  if (logLevelEnv) {
    setLogLevel(logLevelEnv);
  }

  logger.info('========================================================');
  logger.info('   Top10 Volume Tracker (Deno) - Starting Up');
  logger.info('========================================================');

  const port = Number(Deno.env.get('PORT') ?? DEFAULT_PORT);
  const dbPath = Deno.env.get('DB_PATH') ?? DEFAULT_DB_PATH;
  const apiUrl = Deno.env.get('HYPERLIQUID_API_URL') ?? HYPERLIQUID_API_URL;

  logger.info(`Configuration: Port=${port}, DB=${dbPath}, API=${apiUrl}`);

  // 1. Initialize SQLite Database
  const db = new TrackerDatabase(dbPath);

  // 2. Initialize Hyperliquid Adapter
  const adapter = new HyperliquidAdapter(apiUrl);

  // 3. Initialize Tracker Service & start Scheduler
  const trackerService = new TrackerService(db, adapter);
  trackerService.startScheduler();

  // 4. Start HTTP Server
  const server = new TrackerHttpServer(port, trackerService, db);
  server.start();

  // 5. Graceful shutdown handler
  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}. Shutting down gracefully...`);
    trackerService.stopScheduler();
    await server.stop();
    db.close();
    logger.info('Shutdown complete.');
    Deno.exit(0);
  };

  Deno.addSignalListener('SIGINT', () => shutdown('SIGINT'));
  Deno.addSignalListener('SIGTERM', () => shutdown('SIGTERM'));
}

if (import.meta.main) {
  main().catch((err) => {
    logger.error('Fatal error during application startup:', err);
    Deno.exit(1);
  });
}
