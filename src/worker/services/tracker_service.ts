/**
 * Top10 Volume Tracker: Aggregator Service & Scheduler
 * Manages periodic data collection, persistence, and hourly schedule coordination.
 */

import type { HyperliquidAdapter } from '../adapters/hyperliquid.ts';
import type { TrackerDatabase } from '../../shared/db/database.ts';
import { getJstIsoString, getMsUntilNextHour } from '../../shared/helpers/time_helper.ts';
import { logger } from '../../shared/logger.ts';
import type { TrackerRecord } from '../../shared/types.ts';

export class TrackerService {
  private db: TrackerDatabase;
  private adapter: HyperliquidAdapter;
  private timerId: ReturnType<typeof setTimeout> | null = null;
  private isCollecting = false;
  private isRunning = false;

  constructor(db: TrackerDatabase, adapter: HyperliquidAdapter) {
    this.db = db;
    this.adapter = adapter;
  }

  /**
   * Fetches latest market data from Hyperliquid, aggregates metrics, and saves to database.
   */
  public async collectAndSave(): Promise<TrackerRecord> {
    if (this.isCollecting) {
      logger.warn('Collection already in progress, skipping duplicate invocation.');
      const latest = this.db.getLatest();
      if (latest) return latest;
      throw new Error('Collection already in progress and no previous records exist');
    }

    this.isCollecting = true;
    const now = new Date();
    const timestamp = now.getTime();
    const isoTime = getJstIsoString(now);

    try {
      logger.info(`Starting volume aggregation collection at [${isoTime}]...`);

      const aggregation = await this.adapter.fetchTop10Aggregation();

      const record = this.db.insertRecord({
        timestamp,
        iso_time: isoTime,
        total_volume: aggregation.totalVolume,
        average_volume: aggregation.averageVolume,
        up_count: aggregation.upCount,
        down_count: aggregation.downCount,
      });

      logger.info(
        `✓ Collection completed successfully: ID=${record.id}, TotalVolume=$${Math.round(record.total_volume).toLocaleString()}, Avg=$${Math.round(record.average_volume).toLocaleString()}, Up=${record.up_count}, Down=${record.down_count}`,
      );

      return record;
    } catch (err) {
      logger.error(`Collection failed at [${isoTime}]:`, err);
      throw err;
    } finally {
      this.isCollecting = false;
    }
  }

  /**
   * Starts the hourly scheduler.
   * If the database has 0 records, triggers an immediate initial collection.
   * Calculates milliseconds until the next top-of-the-hour (:00:00) and schedules recurring execution.
   */
  public startScheduler(): void {
    if (this.isRunning) {
      logger.warn('Scheduler is already active.');
      return;
    }

    this.isRunning = true;
    logger.info('Starting volume tracker hourly scheduler...');

    // If database is empty, trigger an immediate initial collection
    const count = this.db.getRecordCount();
    if (count === 0) {
      logger.info('Database has 0 records. Triggering initial collection immediately...');
      this.collectAndSave().catch((err) => {
        logger.error('Initial immediate collection encountered an error:', err);
      });
    } else {
      logger.info(`Database currently contains ${count} records. Next run will be at top of the hour.`);
    }

    this.scheduleNextRun();
  }

  /**
   * Dynamically schedules the next collection exactly at the next top of the hour (:00:00)
   */
  private scheduleNextRun(): void {
    if (!this.isRunning) return;

    const msUntilNext = getMsUntilNextHour();
    const nextExecutionDate = new Date(Date.now() + msUntilNext);
    const nextJstStr = getJstIsoString(nextExecutionDate);

    logger.info(
      `Next hourly collection scheduled at: ${nextJstStr} (in ${Math.round(msUntilNext / 1000)} seconds)`,
    );

    this.timerId = setTimeout(async () => {
      try {
        await this.collectAndSave();
      } catch (err) {
        logger.error('Scheduled collection run failed:', err);
      } finally {
        if (this.isRunning) {
          this.scheduleNextRun();
        }
      }
    }, msUntilNext);
  }

  /**
   * Stops the scheduler and cancels pending timers.
   */
  public stopScheduler(): void {
    logger.info('Stopping volume tracker scheduler...');
    this.isRunning = false;
    if (this.timerId !== null) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
  }
}
