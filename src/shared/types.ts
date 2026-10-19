/**
 * Top10 Volume Tracker: Core Types and Interfaces
 */

/**
 * SQLite Database Record schema for `records` table
 * Note: Per project requirements, coin lists are not stored in the database.
 */
export interface TrackerRecord {
  id: number;
  timestamp: number;      // Unix timestamp in milliseconds
  iso_time: string;       // Formatted ISO string (JST / UTC)
  total_volume: number;   // Sum of 24h notional volume across TOP 10 coins (USD)
  average_volume: number; // Average 24h volume across TOP 10 coins (USD)
  up_count: number;       // Number of coins where markPx > prevDayPx
  down_count: number;     // Number of coins where markPx < prevDayPx
}

/**
 * Input payload for inserting a new tracker record into the database
 */
export type NewTrackerRecord = Omit<TrackerRecord, 'id'>;

/**
 * Top 10 coin snapshot item calculated during aggregation
 */
export interface TopCoinInfo {
  name: string;
  volume: number;
  markPx: number;
  prevDayPx: number;
  changePercent: number;
  isUp: boolean;
  isDown: boolean;
}

/**
 * Aggregation result returned by Hyperliquid adapter
 */
export interface Top10Aggregation {
  totalVolume: number;
  averageVolume: number;
  upCount: number;
  downCount: number;
  top10Count: number;
  topCoins: TopCoinInfo[];
  timestamp: number;
}

/**
 * Hyperliquid Meta Universe element
 */
export interface HyperliquidUniverseItem {
  name: string;
  szDecimals: number;
  maxLeverage?: number;
  marginTableId?: number;
  isDelisted?: boolean;
}

/**
 * Hyperliquid Meta response
 */
export interface HyperliquidMeta {
  universe: HyperliquidUniverseItem[];
}

/**
 * Hyperliquid Asset Context element
 */
export interface HyperliquidAssetCtx {
  funding?: string;
  openInterest?: string;
  prevDayPx?: string;
  dayNtlVlm?: string;
  premium?: string;
  oraclePx?: string;
  markPx?: string;
  midPx?: string;
  impactPxs?: string[];
  dayBaseVlm?: string;
}

/**
 * Generic API response format
 */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  count?: number;
  timestamp?: number;
}
