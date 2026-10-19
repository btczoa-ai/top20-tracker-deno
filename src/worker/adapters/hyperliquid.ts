/**
 * Top10 Volume Tracker: Hyperliquid API Adapter
 * Fetches market metadata and 24h asset contexts, ranks top coins by notional volume,
 * and calculates market statistics (total/avg volume, up/down price counts).
 */

import {
  DEFAULT_TOP_COUNT,
  HYPERLIQUID_API_URL,
  HYPERLIQUID_REQUEST_TIMEOUT_MS,
} from '../../shared/constants.ts';
import { logger } from '../../shared/logger.ts';
import type {
  HyperliquidAssetCtx,
  HyperliquidMeta,
  Top10Aggregation,
  TopCoinInfo,
} from '../../shared/types.ts';

export class HyperliquidAdapter {
  private apiUrl: string;
  private timeoutMs: number;

  constructor(
    apiUrl: string = HYPERLIQUID_API_URL,
    timeoutMs: number = HYPERLIQUID_REQUEST_TIMEOUT_MS,
  ) {
    this.apiUrl = apiUrl;
    this.timeoutMs = timeoutMs;
  }

  /**
   * Fetches meta and asset contexts from Hyperliquid, aggregates the TOP N coins by 24h volume.
   * @param topCount Number of top coins to aggregate (default: 10)
   */
  public async fetchTop10Aggregation(topCount: number = DEFAULT_TOP_COUNT): Promise<Top10Aggregation> {
    logger.debug(`Fetching market data from Hyperliquid: ${this.apiUrl}`);

    try {
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({ type: 'metaAndAssetCtxs' }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (!response.ok) {
        throw new Error(`Hyperliquid API HTTP error: ${response.status} ${response.statusText}`);
      }

      const rawData = await response.json();
      if (!Array.isArray(rawData) || rawData.length < 2) {
        throw new Error('Unexpected Hyperliquid API response shape (expected array of [meta, assetCtxs])');
      }

      const meta: HyperliquidMeta = rawData[0];
      const assetCtxs: HyperliquidAssetCtx[] = rawData[1];

      if (!Array.isArray(meta?.universe) || !Array.isArray(assetCtxs)) {
        throw new Error('Invalid meta.universe or assetCtxs in Hyperliquid response');
      }

      const parsedCoins: TopCoinInfo[] = [];

      for (let i = 0; i < meta.universe.length; i++) {
        const universeItem = meta.universe[i];
        const ctx = assetCtxs[i];

        if (!universeItem || !ctx) continue;
        if (universeItem.isDelisted) continue;

        const volume = Number(ctx.dayNtlVlm ?? 0);
        const markPx = Number(ctx.markPx ?? 0);
        const prevDayPx = Number(ctx.prevDayPx ?? 0);

        // Discard invalid/zero-volume symbols if volume is not a valid positive finite number
        if (!Number.isFinite(volume) || volume <= 0) continue;

        let changePercent = 0;
        if (Number.isFinite(prevDayPx) && prevDayPx > 0 && Number.isFinite(markPx)) {
          changePercent = ((markPx - prevDayPx) / prevDayPx) * 100;
        }

        const isUp = markPx > prevDayPx;
        const isDown = markPx < prevDayPx;

        parsedCoins.push({
          name: universeItem.name,
          volume,
          markPx: Number.isFinite(markPx) ? markPx : 0,
          prevDayPx: Number.isFinite(prevDayPx) ? prevDayPx : 0,
          changePercent: Number.isFinite(changePercent) ? changePercent : 0,
          isUp,
          isDown,
        });
      }

      // Sort descending by 24h notional volume
      parsedCoins.sort((a, b) => b.volume - a.volume);

      const topCoins = parsedCoins.slice(0, topCount);
      const totalVolume = topCoins.reduce((sum, item) => sum + item.volume, 0);
      const averageVolume = topCoins.length > 0 ? totalVolume / topCoins.length : 0;
      const upCount = topCoins.filter((item) => item.isUp).length;
      const downCount = topCoins.filter((item) => item.isDown).length;

      logger.info(
        `Top ${topCoins.length} aggregated: Total Volume=$${Math.round(totalVolume).toLocaleString()}, Up=${upCount}, Down=${downCount}`,
      );

      return {
        totalVolume,
        averageVolume,
        upCount,
        downCount,
        top10Count: topCoins.length,
        topCoins,
        timestamp: Date.now(),
      };
    } catch (error) {
      logger.error('Failed to fetch and aggregate Hyperliquid market data:', error);
      throw error;
    }
  }
}
