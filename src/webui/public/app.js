/**
 * Crypto TOP 10 Volume Tracker - Frontend Application
 *
 * Requirements:
 * 1. Single historical line chart for 1-hour interval TOP 10 trading volume average
 * 2. Summary stats cards: Latest Average Volume, Latest Total Volume, Momentum (Gainers/Losers), Last Updated
 * 3. Controls: Timeframe filter (24h, 7d, all), 60s auto-refresh toggle & countdown, manual refresh button
 * 4. JST formatting (Asia/Tokyo) for timestamps and currency abbreviations ($M, $B)
 */

'use strict';

(function () {
  // Application State
  const state = {
    timeframe: '24h',       // '24h' | '7d' | 'all'
    autoRefresh: true,
    refreshIntervalSec: 60,
    countdownSec: 60,
    timerId: null,
    countdownTimerId: null,
    isLoading: false,
    chart: null,
    upDownChart: null,
    latestData: null,
    historyData: [],
    lastFetchTime: null
  };

  // DOM Elements Cache
  const elements = {
    // Buttons & Controls
    timeframeBtns: document.querySelectorAll('.btn-timeframe'),
    autoRefreshToggle: document.getElementById('autoRefreshToggle'),
    refreshTimerCountdown: document.getElementById('refreshTimerCountdown'),
    refreshBtn: document.getElementById('refreshBtn'),
    retryBtn: document.getElementById('retryBtn'),
    top10ToggleBtn: document.getElementById('top10ToggleBtn'),
    top10Section: document.getElementById('top10Section'),

    // Stat Cards
    statAvgVolume: document.getElementById('statAvgVolume'),
    statAvgVolumeChange: document.getElementById('statAvgVolumeChange'),
    statTotalVolume: document.getElementById('statTotalVolume'),
    statTotalVolumeChange: document.getElementById('statTotalVolumeChange'),
    statGainers: document.getElementById('statGainers'),
    statLosers: document.getElementById('statLosers'),
    statMomentumBar: document.getElementById('statMomentumBar'),
    statMomentumCaption: document.getElementById('statMomentumCaption'),
    statLastUpdated: document.getElementById('statLastUpdated'),
    statTimeAgo: document.getElementById('statTimeAgo'),


    // Chart & Overlays
    chartCanvas: document.getElementById('volumeChart'),
    upDownChartCanvas: document.getElementById('upDownChart'),
    upDownEmptyOverlay: document.getElementById('upDownEmptyOverlay'),
    loadingOverlay: document.getElementById('loadingOverlay'),
    errorOverlay: document.getElementById('errorOverlay'),
    errorMessage: document.getElementById('errorMessage'),
    emptyOverlay: document.getElementById('emptyOverlay'),

    // Footer
    connectionStatusIndicator: document.getElementById('connectionStatusIndicator'),
    connectionStatusText: document.getElementById('connectionStatusText')
  };

  /* ==========================================================================
     Formatters & Utilities
     ========================================================================== */

  /**
   * Format numbers to compact USD string ($123.45M, $1.23B, etc.)
   * @param {number|null|undefined} num
   * @param {number} decimals
   * @returns {string}
   */
  function formatCurrencyCompact(num, decimals = 0) {
    if (num === null || num === undefined || isNaN(num)) return '--';
    const absVal = Math.abs(num);

    if (absVal >= 1e9) {
      return `$${(num / 1e9).toFixed(decimals)}B`;
    } else if (absVal >= 1e6) {
      return `$${(num / 1e6).toFixed(decimals)}M`;
    } else if (absVal >= 1e3) {
      return `$${(num / 1e3).toFixed(decimals)}K`;
    }
    return `$${num.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
  }

  /**
   * Format standard currency with commas ($123,456,789)
   * @param {number|null|undefined} num
   * @returns {string}
   */
  function formatCurrencyFull(num) {
    if (num === null || num === undefined || isNaN(num)) return '--';
    return `$${Math.round(num).toLocaleString('en-US')}`;
  }

  /**
   * Format price with appropriate decimals
   * @param {number|null|undefined} price
   * @returns {string}
   */
  function formatPrice(price) {
    if (price === null || price === undefined || isNaN(price)) return '--';
    if (price >= 1000) {
      return `$${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    } else if (price >= 1) {
      return `$${price.toFixed(4)}`;
    } else {
      return `$${price.toFixed(6)}`;
    }
  }

  /**
   * Format timestamp into JST Date/Time (Asia/Tokyo)
   * @param {number|string|Date} timestamp
   * @param {'chart'|'full'|'timeOnly'} format
   * @returns {string}
   */
  function formatJST(timestamp, format = 'full') {
    if (!timestamp) return '--';
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) return '--';

    const jstFormatter = new Intl.DateTimeFormat('ja-JP', {
      timeZone: 'Asia/Tokyo',
      year: format === 'full' ? 'numeric' : undefined,
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: format === 'full' ? '2-digit' : undefined,
      hour12: false
    });

    if (format === 'chart') {
      const parts = jstFormatter.formatToParts(date);
      const m = parts.find(p => p.type === 'month')?.value || '00';
      const d = parts.find(p => p.type === 'day')?.value || '00';
      const h = parts.find(p => p.type === 'hour')?.value || '00';
      const min = parts.find(p => p.type === 'minute')?.value || '00';
      return `${m}/${d} ${h}:${min}`;
    }

    return jstFormatter.format(date) + ' JST';
  }

  /**
   * Calculate relative time ago string in Japanese
   * @param {number|string|Date} timestamp
   * @returns {string}
   */
  function formatTimeAgo(timestamp) {
    if (!timestamp) return 'データ待機中...';
    const now = Date.now();
    const past = new Date(timestamp).getTime();
    if (isNaN(past)) return 'データ待機中...';

    const diffSeconds = Math.max(0, Math.floor((now - past) / 1000));
    if (diffSeconds < 15) return 'たった今更新';
    if (diffSeconds < 60) return `${diffSeconds}秒前`;
    const diffMinutes = Math.floor(diffSeconds / 60);
    if (diffMinutes < 60) return `${diffMinutes}分前`;
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours}時間前`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}日前`;
  }

  /**
   * Safely normalize raw API snapshot object
   */
  function normalizeSnapshot(item) {
    if (!item) return null;

    const rawTimestamp = item.timestamp ?? item.createdAt ?? item.time ?? item.date ?? Date.now();
    const timestamp = typeof rawTimestamp === 'string' ? new Date(rawTimestamp).getTime() : rawTimestamp;

    const avgVolume = Number(
      item.average_volume ??
      item.averageVolume ??
      item.avg_volume ??
      item.avgVolume ??
      item.volumeAvg ??
      (item.total_volume ? Number(item.total_volume) / 10 : 0)
    );
    const totalVolume = Number(
      item.total_volume ??
      item.totalVolume ??
      item.sumVolume ??
      (avgVolume * 10)
    );
    const gainersCount = Number(
      item.up_count ??
      item.upCount ??
      item.gainersCount ??
      item.gainers ??
      0
    );
    const losersCount = Number(
      item.down_count ??
      item.downCount ??
      item.losersCount ??
      item.losers ??
      0
    );
    const upVolume = Number(item.up_volume ?? item.upVolume ?? 0);
    const downVolume = Number(item.down_volume ?? item.downVolume ?? 0);
    const allUpVolume = Number(item.all_up_volume ?? item.allUpVolume ?? 0);
    const allDownVolume = Number(item.all_down_volume ?? item.allDownVolume ?? 0);
    const top10 = Array.isArray(item.top10 ?? item.coins ?? item.tokens) ? (item.top10 ?? item.coins ?? item.tokens) : [];

    return {
      timestamp,
      avgVolume,
      totalVolume,
      gainersCount,
      losersCount,
      upVolume,
      downVolume,
      allUpVolume,
      allDownVolume,
      top10
    };
  }

  /* ==========================================================================
     Chart.js Management (Single Historical Line Chart)
     ========================================================================== */

  /**
   * Initialize or update the Chart.js instance
   */
  function renderChart(history) {
    const ctx = elements.chartCanvas.getContext('2d');
    if (!ctx) return;

    if (!history || history.length === 0) {
      if (state.chart) {
        state.chart.destroy();
        state.chart = null;
      }
      elements.emptyOverlay.style.display = 'flex';
      return;
    }

    elements.emptyOverlay.style.display = 'none';

    // Sort chronologically ascending
    const sorted = [...history].sort((a, b) => a.timestamp - b.timestamp);

    const labels = sorted.map(item => formatJST(item.timestamp, 'chart'));
    const dataValues = sorted.map(item => item.avgVolume);

    // Calculate overall average of the TOP10 average values
    const sumAvgVolume = dataValues.reduce((acc, val) => acc + val, 0);
    const overallAvg = dataValues.length > 0 ? Math.round(sumAvgVolume / dataValues.length) : 0;
    const overallAvgData = Array(dataValues.length).fill(overallAvg);

    // Create glowing area gradient
    const gradient = ctx.createLinearGradient(0, 0, 0, 400);
    gradient.addColorStop(0, 'rgba(0, 242, 254, 0.35)');
    gradient.addColorStop(0.5, 'rgba(0, 242, 254, 0.10)');
    gradient.addColorStop(1, 'rgba(0, 242, 254, 0.00)');

    if (state.chart) {
      // Update existing chart
      state.chart.data.labels = labels;
      state.chart.data.datasets[0].data = dataValues;
      state.chart.data.datasets[0].historyRaw = sorted;
      if (!state.chart.data.datasets[1]) {
        state.chart.data.datasets.push({
          label: 'TOP10 期間平均',
          data: overallAvgData,
          borderColor: '#f59e0b',
          borderWidth: 2,
          borderDash: [6, 6],
          pointRadius: 0,
          pointHoverRadius: 4,
          pointBackgroundColor: '#f59e0b',
          fill: false,
          tension: 0
        });
      } else {
        state.chart.data.datasets[1].data = overallAvgData;
      }
      state.chart.update('none');
      return;
    }

    // Create New Chart
    state.chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'TOP10 平均取引量',
            data: dataValues,
            historyRaw: sorted,
            borderColor: '#00f2fe',
            borderWidth: 2.5,
            backgroundColor: gradient,
            fill: true,
            tension: 0.35,
            cubicInterpolationMode: 'monotone',
            pointRadius: sorted.length > 50 ? 0 : 3,
            pointHoverRadius: 6,
            pointBackgroundColor: '#00f2fe',
            pointHoverBackgroundColor: '#ffffff',
            pointBorderColor: '#0b0e14',
            pointBorderWidth: 2,
            pointHoverBorderWidth: 2,
            pointHoverBorderColor: '#00f2fe'
          },
          {
            label: 'TOP10 期間平均',
            data: overallAvgData,
            borderColor: '#f59e0b',
            borderWidth: 2,
            borderDash: [6, 6],
            pointRadius: 0,
            pointHoverRadius: 4,
            pointBackgroundColor: '#f59e0b',
            fill: false,
            tension: 0
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: {
          duration: 600,
          easing: 'easeOutQuart'
        },
        interaction: {
          mode: 'index',
          intersect: false
        },
        plugins: {
          legend: {
            display: false // Clean single chart requirement
          },
          tooltip: {
            enabled: true,
            backgroundColor: 'rgba(15, 20, 31, 0.95)',
            titleColor: '#f8fafc',
            titleFont: {
              family: 'JetBrains Mono, Inter, sans-serif',
              size: 13,
              weight: 'bold'
            },
            bodyColor: '#94a3b8',
            bodyFont: {
              family: 'JetBrains Mono, Inter, sans-serif',
              size: 12
            },
            borderColor: '#233044',
            borderWidth: 1,
            padding: 12,
            boxPadding: 6,
            usePointStyle: true,
            callbacks: {
              title: function (context) {
                const index = context[0]?.dataIndex;
                const rawItem = sorted[index];
                if (rawItem && rawItem.timestamp) {
                  return formatJST(rawItem.timestamp, 'full');
                }
                return context[0]?.label || '';
              },
              label: function (context) {
                const value = context.parsed.y;
                if (context.datasetIndex === 1) {
                  return ` TOP10 期間平均: ${formatCurrencyCompact(value, 0)} (${formatCurrencyFull(value)})`;
                }
                return ` TOP10 平均取引量: ${formatCurrencyCompact(value, 0)} (${formatCurrencyFull(value)})`;
              },
              afterLabel: function (context) {
                if (context.datasetIndex !== 0) return '';
                const index = context.dataIndex;
                const item = sorted[index];
                if (!item) return '';

                const lines = [];
                if (item.totalVolume) {
                  lines.push(` 合計取引量: ${formatCurrencyCompact(item.totalVolume, 0)}`);
                }
                if (item.gainersCount !== undefined && item.losersCount !== undefined) {
                  const total = item.gainersCount + item.losersCount;
                  const ratio = total > 0 ? ((item.gainersCount / total) * 100).toFixed(1) : '50.0';
                  lines.push(` モメンタム: 上昇 🟢 ${item.gainersCount} / 下落 🔴 ${item.losersCount} (上昇率 ${ratio}%)`);
                }
                return lines;
              }
            }
          }
        },
        scales: {
          x: {
            grid: {
              color: 'rgba(255, 255, 255, 0.04)',
              drawBorder: false
            },
            ticks: {
              color: '#64748b',
              font: {
                family: 'JetBrains Mono, monospace',
                size: 11
              },
              maxRotation: 0,
              autoSkip: true,
              maxTicksLimit: 8
            }
          },
          y: {
            position: 'right',
            grid: {
              color: 'rgba(255, 255, 255, 0.06)',
              drawBorder: false
            },
            ticks: {
              color: '#94a3b8',
              font: {
                family: 'JetBrains Mono, monospace',
                size: 11
              },
              callback: function (value) {
                return formatCurrencyCompact(value, 0);
              }
            }
          }
        }
      }
    });
  }

  /* ==========================================================================
     Dashboard Summary Cards & Table Updates
     ========================================================================== */

  /**
   * Update all 4 stat cards with latest snapshot data
   */
  function updateStatCards(latest, previous) {
    if (!latest) {
      elements.statAvgVolume.textContent = '--';
      elements.statTotalVolume.textContent = '--';
      elements.statGainers.textContent = '--';
      elements.statLosers.textContent = '--';
      elements.statLastUpdated.textContent = '--';
      elements.statTimeAgo.textContent = 'データ待機中...';
      return;
    }

    // 1. Average Volume Card
    elements.statAvgVolume.textContent = formatCurrencyCompact(latest.avgVolume, 0);

    if (previous && previous.avgVolume > 0) {
      const diff = latest.avgVolume - previous.avgVolume;
      const pct = (diff / previous.avgVolume) * 100;
      const isUp = diff >= 0;
      elements.statAvgVolumeChange.textContent = `${isUp ? '+' : ''}${pct.toFixed(1)}% (1h)`;
      elements.statAvgVolumeChange.className = `card-change ${isUp ? 'up' : 'down'}`;
    } else {
      elements.statAvgVolumeChange.textContent = '--';
      elements.statAvgVolumeChange.className = 'card-change';
    }

    // 2. Total Volume Card
    elements.statTotalVolume.textContent = formatCurrencyCompact(latest.totalVolume, 0);

    if (previous && previous.totalVolume > 0) {
      const diff = latest.totalVolume - previous.totalVolume;
      const pct = (diff / previous.totalVolume) * 100;
      const isUp = diff >= 0;
      elements.statTotalVolumeChange.textContent = `${isUp ? '+' : ''}${pct.toFixed(1)}% (1h)`;
      elements.statTotalVolumeChange.className = `card-change ${isUp ? 'up' : 'down'}`;
    } else {
      elements.statTotalVolumeChange.textContent = '--';
      elements.statTotalVolumeChange.className = 'card-change';
    }

    // 3. Price Momentum Card
    const gainers = latest.gainersCount || 0;
    const losers = latest.losersCount || 0;
    elements.statGainers.textContent = gainers;
    elements.statLosers.textContent = losers;

    const totalCoins = gainers + losers;
    const gainerRatio = totalCoins > 0 ? (gainers / totalCoins) * 100 : 50;
    elements.statMomentumBar.style.width = `${gainerRatio}%`;

    if (totalCoins > 0) {
      elements.statMomentumCaption.textContent = `上昇率 ${gainerRatio.toFixed(1)}% (${gainers}/${totalCoins} 銘柄が上昇)`;
    } else {
      elements.statMomentumCaption.textContent = 'TOP10通貨の上昇・下落比率';
    }

    // 4. Last Updated Card
    elements.statLastUpdated.textContent = formatJST(latest.timestamp, 'full');
    elements.statTimeAgo.textContent = formatTimeAgo(latest.timestamp);
  }


  /* ==========================================================================
     Data Fetching & API Communication
     ========================================================================== */

  /**
   * Fetch data from backend with fallback support
   */
  async function fetchData() {
    if (state.isLoading) return;
    setLoadingState(true);

    try {
      // Primary endpoint with timeframe param
      const endpoints = [
        `/api/history?timeframe=${encodeURIComponent(state.timeframe)}`,
        `/api/history`,
        `/api/stats`,
        `/api/volume-history`,
        `/api/latest`
      ];

      let rawResult = null;
      let usedEndpoint = '';

      for (const endpoint of endpoints) {
        try {
          const res = await fetch(endpoint, {
            headers: { 'Accept': 'application/json' },
            cache: 'no-store'
          });

          if (res.ok) {
            rawResult = await res.json();
            usedEndpoint = endpoint;
            break;
          }
        } catch (_) {
          // Continue to fallback endpoint
        }
      }

      if (!rawResult) {
        throw new Error('APIサーバーからの応答がありません。バックエンドが稼働中か確認してください。');
      }

      // Parse payload structure
      let historyRaw = [];
      let latestRaw = null;

      if (Array.isArray(rawResult)) {
        historyRaw = rawResult;
        latestRaw = rawResult[rawResult.length - 1];
      } else if (rawResult.data) {
        if (Array.isArray(rawResult.data)) {
          historyRaw = rawResult.data;
          latestRaw = rawResult.data[rawResult.data.length - 1];
        } else {
          historyRaw = rawResult.data.history || [];
          latestRaw = rawResult.data.latest || (historyRaw.length > 0 ? historyRaw[historyRaw.length - 1] : null);
        }
      } else {
        historyRaw = rawResult.history || [];
        latestRaw = rawResult.latest || (historyRaw.length > 0 ? historyRaw[historyRaw.length - 1] : null);
      }

      // Normalize items
      const normalizedHistory = historyRaw.map(normalizeSnapshot).filter(Boolean);
      const normalizedLatest = normalizeSnapshot(latestRaw) || (normalizedHistory.length > 0 ? normalizedHistory[normalizedHistory.length - 1] : null);

      // Filter by timeframe if full history returned without server filter
      const filteredHistory = filterByTimeframe(normalizedHistory, state.timeframe);

      // Compute momentum counts if missing from top10 array
      if (normalizedLatest && normalizedLatest.top10 && normalizedLatest.top10.length > 0) {
        if (!normalizedLatest.gainersCount && !normalizedLatest.losersCount) {
          let g = 0, l = 0;
          for (const coin of normalizedLatest.top10) {
            const chg = Number(coin.priceChange24h ?? coin.change24h ?? 0);
            if (chg >= 0) g++; else l++;
          }
          normalizedLatest.gainersCount = g;
          normalizedLatest.losersCount = l;
        }
      }

      state.historyData = filteredHistory;
      state.latestData = normalizedLatest;
      state.lastFetchTime = Date.now();

      // Find previous item for delta calculation
      let previousItem = null;
      if (filteredHistory.length > 1) {
        previousItem = filteredHistory[filteredHistory.length - 2];
      }

      // Update UI components
      updateStatCards(normalizedLatest, previousItem);
      renderChart(filteredHistory);
      renderUpDownChart(filteredHistory);


      // Update connection status
      setConnectionStatus(true, `正常稼働中 (${usedEndpoint})`);
      hideError();
    } catch (err) {
      console.error('Fetch error:', err);
      showError(err.message || 'データ取得に失敗しました');
      setConnectionStatus(false, 'オフライン / 接続エラー');
    } finally {
      setLoadingState(false);
      resetCountdown();
    }
  }

  /**
   * Filter history array client-side according to timeframe
   */
  function filterByTimeframe(history, timeframe) {
    if (!history || history.length === 0) return [];
    if (timeframe === 'all') return history;

    const now = Date.now();
    const cutoff = timeframe === '24h'
      ? now - (24 * 60 * 60 * 1000)
      : now - (7 * 24 * 60 * 60 * 1000);

    const filtered = history.filter(item => item.timestamp >= cutoff);
    // If filtering eliminates all items but history has entries, return all
    return filtered.length > 0 ? filtered : history;
  }

  /* ==========================================================================
     上昇/下落コイン取引量チャート (1時間ごとの折れ線チャート)
     ========================================================================== */

  /**
   * 全銘柄の上昇コイン取引量合計 ÷ 下落コイン取引量合計 (倍率) の推移を1本の折れ線で描画する。
   * 全銘柄分が未記録 (0) の旧データの時点は除外する。
   * 下落側が0の時点は除算できないため欠測 (線を途切れさせる) とする。
   */
  function renderUpDownChart(history) {
    const ctx = elements.upDownChartCanvas.getContext('2d');
    if (!ctx) return;

    const sorted = [...(history || [])]
      .filter(item => item.allUpVolume + item.allDownVolume > 0)
      .sort((a, b) => a.timestamp - b.timestamp);

    if (sorted.length === 0) {
      if (state.upDownChart) {
        state.upDownChart.destroy();
        state.upDownChart = null;
      }
      elements.upDownEmptyOverlay.style.display = 'flex';
      return;
    }
    elements.upDownEmptyOverlay.style.display = 'none';

    const labels = sorted.map(item => formatJST(item.timestamp, 'chart'));
    // 倍率は小数第2位で丸める。下落0の時点は null (欠測)
    const ratioData = sorted.map(item =>
      item.allDownVolume > 0 ? Math.round((item.allUpVolume / item.allDownVolume) * 100) / 100 : null
    );

    if (state.upDownChart) {
      state.upDownChart.data.labels = labels;
      state.upDownChart.data.datasets[0].data = ratioData;
      state.upDownChart.$sorted = sorted;
      state.upDownChart.update('none');
      return;
    }

    const tickFont = { family: 'JetBrains Mono, monospace', size: 11 };
    const color = '#38bdf8';

    state.upDownChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: '全銘柄 上昇 ÷ 下落 取引量',
          data: ratioData,
          borderColor: color,
          backgroundColor: color,
          borderWidth: 2.5,
          tension: 0.35,
          cubicInterpolationMode: 'monotone',
          spanGaps: false,
          pointRadius: sorted.length > 50 ? 0 : 3,
          pointHoverRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 400 },
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(15, 20, 31, 0.95)',
            titleColor: '#f8fafc',
            bodyColor: '#94a3b8',
            borderColor: '#233044',
            borderWidth: 1,
            padding: 12,
            callbacks: {
              title: (context) => {
                const raw = state.upDownChart.$sorted[context[0]?.dataIndex];
                return raw ? formatJST(raw.timestamp, 'full') : (context[0]?.label || '');
              },
              label: (context) => {
                // 倍率に加え、元の上昇/下落取引量も併記する
                const raw = state.upDownChart.$sorted[context.dataIndex];
                const detail = raw
                  ? ` (上昇 ${formatCurrencyCompact(raw.allUpVolume, 0)} / 下落 ${formatCurrencyCompact(raw.allDownVolume, 0)})`
                  : '';
                return ` 全銘柄 上昇 ÷ 下落: ${context.parsed.y.toFixed(2)} 倍${detail}`;
              }
            }
          }
        },
        scales: {
          x: {
            grid: { color: 'rgba(255, 255, 255, 0.04)' },
            ticks: { color: '#64748b', font: tickFont, maxRotation: 0, autoSkip: true, maxTicksLimit: 8 }
          },
          y: {
            position: 'right',
            beginAtZero: true,
            grid: { color: 'rgba(255, 255, 255, 0.06)' },
            ticks: { color: '#94a3b8', font: tickFont, callback: (v) => `${v}倍` }
          }
        }
      }
    });
    state.upDownChart.$sorted = sorted;
  }

  /* ==========================================================================
     UI State Helpers
     ========================================================================== */

  function setLoadingState(loading) {
    state.isLoading = loading;
    if (loading) {
      elements.refreshBtn.classList.add('loading');
      if (!state.chart) {
        elements.loadingOverlay.style.display = 'flex';
      }
    } else {
      elements.refreshBtn.classList.remove('loading');
      elements.loadingOverlay.style.display = 'none';
    }
  }

  function showError(msg) {
    elements.errorMessage.textContent = msg;
    elements.errorOverlay.style.display = 'flex';
  }

  function hideError() {
    elements.errorOverlay.style.display = 'none';
  }

  function setConnectionStatus(online, text) {
    if (online) {
      elements.connectionStatusIndicator.className = 'status-indicator online';
      elements.connectionStatusText.textContent = text || 'API 正常接続';
    } else {
      elements.connectionStatusIndicator.className = 'status-indicator offline';
      elements.connectionStatusText.textContent = text || 'API 切断中';
    }
  }

  /* ==========================================================================
     Auto-Refresh Timer Management
     ========================================================================== */

  function startTimers() {
    stopTimers();

    state.countdownSec = state.refreshIntervalSec;
    updateCountdownUI();

    // 1-second countdown tick
    state.countdownTimerId = setInterval(() => {
      // Update relative time ago display
      if (state.latestData && state.latestData.timestamp) {
        elements.statTimeAgo.textContent = formatTimeAgo(state.latestData.timestamp);
      }

      if (!state.autoRefresh) return;

      state.countdownSec -= 1;
      if (state.countdownSec <= 0) {
        state.countdownSec = state.refreshIntervalSec;
        fetchData();
      }
      updateCountdownUI();
    }, 1000);
  }

  function stopTimers() {
    if (state.countdownTimerId) {
      clearInterval(state.countdownTimerId);
      state.countdownTimerId = null;
    }
  }

  function resetCountdown() {
    state.countdownSec = state.refreshIntervalSec;
    updateCountdownUI();
  }

  function updateCountdownUI() {
    if (elements.refreshTimerCountdown) {
      elements.refreshTimerCountdown.textContent = `${state.countdownSec}s`;
    }
  }

  /* ==========================================================================
     Event Listeners & Setup
     ========================================================================== */

  function bindEvents() {
    // Timeframe filter buttons
    elements.timeframeBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const tf = e.currentTarget.getAttribute('data-timeframe');
        if (tf && tf !== state.timeframe) {
          elements.timeframeBtns.forEach(b => b.classList.remove('active'));
          e.currentTarget.classList.add('active');
          state.timeframe = tf;
          fetchData();
        }
      });
    });

    // Auto-refresh toggle
    if (elements.autoRefreshToggle) {
      elements.autoRefreshToggle.addEventListener('change', (e) => {
        state.autoRefresh = e.target.checked;
        if (state.autoRefresh) {
          resetCountdown();
        } else {
          if (elements.refreshTimerCountdown) {
            elements.refreshTimerCountdown.textContent = 'OFF';
          }
        }
      });
    }

    // Manual Refresh button
    if (elements.refreshBtn) {
      elements.refreshBtn.addEventListener('click', () => {
        fetchData();
      });
    }

    // Error Retry button
    if (elements.retryBtn) {
      elements.retryBtn.addEventListener('click', () => {
        hideError();
        fetchData();
      });
    }

    // Top 10 drawer collapsible toggle
    if (elements.top10ToggleBtn && elements.top10Section) {
      elements.top10ToggleBtn.addEventListener('click', () => {
        elements.top10Section.classList.toggle('collapsed');
      });
    }
  }

  // Initialization
  function init() {
    bindEvents();
    startTimers();
    fetchData();
  }

  // Kickstart on DOM Ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
