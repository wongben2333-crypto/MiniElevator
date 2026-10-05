// Run grading: survival-based stars plus a 0..100 composite quality score.
// Pure logic — no DOM, no randomness. See docs/01 §6.8 and docs/06 (M3).

import { SCORE_TARGETS } from './config';
import type { SimConfig, World } from './types';

export interface ScoreBreakdown {
  /** Completed days survived (day 1 in progress counts as 0). */
  days: number;
  /** Survival stars, 0..3. */
  stars: number;
  /** Composite quality score, 0..100. */
  score: number;
  delivered: number;
  avgWaitSeconds: number;
  energy: number;
  transfers: number;
}

function clamp01(x: number): number {
  if (!Number.isFinite(x) || x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

/** Completed days = current day minus the in-progress day (never negative). */
export function completedDays(world: World): number {
  return Math.max(0, world.day - 1);
}

/** 1★ per completed day, capped at 3 (survive a day / two / three+). */
export function starsForDays(days: number): number {
  if (days >= 3) return 3;
  if (days >= 2) return 2;
  if (days >= 1) return 1;
  return 0;
}

/**
 * Composite score: 40% throughput, 30% (low) average wait, 20% (low) energy,
 * 10% (low) transfer rate. A run with zero deliveries always scores 0.
 */
export function scoreWorld(world: World, cfg: SimConfig): ScoreBreakdown {
  const s = world.stats;
  const delivered = s.delivered;
  const denom = Math.max(1, delivered);
  const avgWaitSeconds = s.totalWaitTicks / cfg.simHz / denom;
  const energyPerDelivery = s.energy / denom;
  const transferRate = s.transfers / denom;

  let raw = 0;
  if (delivered > 0) {
    const throughput = clamp01(delivered / SCORE_TARGETS.delivered);
    const wait = 1 - clamp01(avgWaitSeconds / SCORE_TARGETS.waitSeconds);
    const energy = 1 - clamp01(energyPerDelivery / SCORE_TARGETS.energyPerDelivery);
    const transfers = 1 - clamp01(transferRate / SCORE_TARGETS.transferRate);
    raw = 40 * throughput + 30 * wait + 20 * energy + 10 * transfers;
  }

  const days = completedDays(world);
  return {
    days,
    stars: starsForDays(days),
    score: Math.max(0, Math.min(100, Math.round(raw))),
    delivered,
    avgWaitSeconds,
    energy: s.energy,
    transfers: s.transfers,
  };
}

/** A 3-glyph star bar, e.g. ★★☆. */
export function starBar(stars: number): string {
  const clamped = Math.max(0, Math.min(3, Math.floor(stars)));
  return '★'.repeat(clamped) + '☆'.repeat(3 - clamped);
}
