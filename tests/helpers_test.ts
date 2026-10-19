import { assertEquals, assertGreater } from '@std/assert';
import { getJstIsoString, getJstLogString, getMsUntilNextHour } from '../src/shared/helpers/time_helper.ts';

Deno.test('time_helper: getJstIsoString formats properly with +09:00', () => {
  const testDate = new Date('2026-10-19T00:00:00.000Z');
  const iso = getJstIsoString(testDate, 9);
  assertEquals(iso, '2026-10-19T09:00:00.000+09:00');
});

Deno.test('time_helper: getJstLogString formats properly', () => {
  const testDate = new Date('2026-10-19T00:00:00.000Z');
  const logStr = getJstLogString(testDate, 9);
  assertEquals(logStr, '2026-10-19 09:00:00');
});

Deno.test('time_helper: getMsUntilNextHour returns positive milliseconds', () => {
  const now = new Date('2026-10-19T07:15:30.000Z');
  const ms = getMsUntilNextHour(now, 0);
  assertEquals(ms, 2670000);
  assertGreater(ms, 0);
});
