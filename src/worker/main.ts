/**
 * Top10 Volume Tracker: Worker Service Main Entrypoint
 * Standalone daemon process responsible for periodic market data fetching,
 * ranking TOP 10 currencies by 24h volume, and persisting aggregations to SQLite.
 */

import '@std/dotenv/load';
import { HyperliquidAdapter } from './adapters/hyperliquid.ts';
import {
  DEFAULT_DB_PATH,
  HYPERLIQUID_API_URL,
} from '../shared/constants.ts';
import { TrackerDatabase } from '../shared/db/database.ts';
import { type LogLevel, logger, setLogLevel } from '../shared/logger.ts';
import { TrackerService } from './services/tracker_service.ts';

async function main(): Promise<void> {
  const logLevelEnv = Deno.env.get('LOG_LEVEL')?.toUpperCase() as LogLevel | undefined;
  if (logLevelEnv) {
    setLogLevel(logLevelEnv);
  }

  logger.info('========================================================');
  logger.info('   Top10 Volume Tracker [Worker Service] - Starting');
  logger.info('========================================================');

  const dbPath = Deno.env.get('DB_PATH') ?? DEFAULT_DB_PATH;
  const apiUrl = Deno.env.get('HYPERLIQUID_API_URL') ?? HYPERLIQUID_API_URL;

  logger.info(`Worker Config: DB=${dbPath}, API=${apiUrl}`);

  // 1. Initialize SQLite Database (WAL mode enabled)
  const db = new TrackerDatabase(dbPath);

  // 2. Initialize Hyperliquid Adapter
  const adapter = new HyperliquidAdapter(apiUrl);

  // 3. Initialize Tracker Service & start Scheduler
  const trackerService = new TrackerService(db, adapter);
  trackerService.startScheduler();

  logger.info('✓ Worker daemon is actively monitoring. Press Ctrl+C to terminate.');

  // 4. Graceful shutdown handler
  const shutdown = (signal: string) => {
    logger.info(`Received ${signal}. Shutting down worker gracefully...`);
    trackerService.stopScheduler();
    db.close();
    logger.info('Worker shutdown complete.');
    Deno.exit(0);
  };

  Deno.addSignalListener('SIGINT', () => shutdown('SIGINT'));
  Deno.addSignalListener('SIGTERM', () => shutdown('SIGTERM'));
}

if (import.meta.main) {
  main().catch((err) => {
    logger.error('Fatal error during worker startup:', err);
    Deno.exit(1);
  });
}
