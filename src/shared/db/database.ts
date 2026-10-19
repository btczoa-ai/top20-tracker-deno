/**
 * Top10 Volume Tracker: Database Layer (SQLite)
 * Handles persistence for aggregated 24h volume records.
 * Note: Per project requirements, coin lists are not stored in the database.
 */

import { Database } from '@db/sqlite';
import { DB_TABLE_RECORDS, DEFAULT_DB_PATH } from '../constants.ts';
import { logger } from '../logger.ts';
import type { NewTrackerRecord, TrackerRecord } from '../types.ts';

export class TrackerDatabase {
  private db: Database;
  private dbPath: string;

  constructor(dbPath: string = DEFAULT_DB_PATH) {
    this.dbPath = dbPath;
    this.ensureDirectoryExists(dbPath);
    // int64: true ensures 64-bit Unix millisecond timestamps are not truncated to 32-bit signed ints
    this.db = new Database(dbPath, { int64: true });
    this.init();
  }

  /**
   * Ensure parent directory of database file exists
   */
  private ensureDirectoryExists(filePath: string): void {
    const lastSlash = filePath.lastIndexOf('/');
    if (lastSlash > 0) {
      const dir = filePath.slice(0, lastSlash);
      try {
        Deno.mkdirSync(dir, { recursive: true });
      } catch (err) {
        if (!(err instanceof Deno.errors.AlreadyExists)) {
          logger.error(`Failed to create database directory ${dir}:`, err);
        }
      }
    }
  }

  /**
   * Initializes database schema and indexes
   */
  public init(): void {
    logger.info(`Initializing SQLite database at: ${this.dbPath}`);
    if (this.dbPath !== ':memory:') {
      this.db.exec('PRAGMA journal_mode = WAL;');
      this.db.exec('PRAGMA busy_timeout = 5000;');
    }
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS ${DB_TABLE_RECORDS} (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp INTEGER NOT NULL,
        iso_time TEXT NOT NULL,
        total_volume REAL NOT NULL,
        average_volume REAL NOT NULL,
        up_count INTEGER NOT NULL,
        down_count INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_records_timestamp ON ${DB_TABLE_RECORDS} (timestamp);
    `);
  }

  /**
   * Inserts an aggregated volume record into the database
   */
  public insertRecord(record: NewTrackerRecord): TrackerRecord {
    const stmt = this.db.prepare(`
      INSERT INTO ${DB_TABLE_RECORDS} (
        timestamp,
        iso_time,
        total_volume,
        average_volume,
        up_count,
        down_count
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      record.timestamp,
      record.iso_time,
      record.total_volume,
      record.average_volume,
      record.up_count,
      record.down_count,
    );

    const insertedId = Number(this.db.lastInsertRowId);

    const createdRecord: TrackerRecord = {
      id: insertedId,
      ...record,
    };

    logger.debug(`Record inserted with ID ${insertedId}: [${record.iso_time}] Total Volume: $${record.total_volume.toLocaleString()}`);
    return createdRecord;
  }

  /**
   * Retrieves historical records sorted by timestamp
   * @param limit Maximum number of records to return (default: 100)
   * @param order 'asc' (oldest to newest) or 'desc' (newest to oldest)
   */
  public getHistory(limit: number = 100, order: 'asc' | 'desc' = 'asc'): TrackerRecord[] {
    const sortOrder = order.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
    const stmt = this.db.prepare(`
      SELECT
        id,
        timestamp,
        iso_time,
        total_volume,
        average_volume,
        up_count,
        down_count
      FROM ${DB_TABLE_RECORDS}
      ORDER BY timestamp ${sortOrder}
      LIMIT ?
    `);

    const rows = stmt.all<TrackerRecord>(limit);
    return rows;
  }

  /**
   * Retrieves the most recent record
   */
  public getLatest(): TrackerRecord | null {
    const stmt = this.db.prepare(`
      SELECT
        id,
        timestamp,
        iso_time,
        total_volume,
        average_volume,
        up_count,
        down_count
      FROM ${DB_TABLE_RECORDS}
      ORDER BY timestamp DESC
      LIMIT 1
    `);

    const row = stmt.get<TrackerRecord>();
    return row ?? null;
  }

  /**
   * Returns total count of stored records
   */
  public getRecordCount(): number {
    const stmt = this.db.prepare(`SELECT COUNT(*) as count FROM ${DB_TABLE_RECORDS}`);
    const result = stmt.get<{ count: number }>();
    return result ? Number(result.count) : 0;
  }

  /**
   * Closes database connection cleanly
   */
  public close(): void {
    logger.info('Closing SQLite database connection.');
    this.db.close();
  }
}
