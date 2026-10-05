// Stats + overlay layer. Drawn on top of the existing frame — never clears the
// canvas and never touches the DOM; only the passed ctx is used.

import { DEFAULT_CONFIG } from './config';
import { completedDays, scoreWorld, starBar, starsForDays } from './score';
import type { Phase, World } from './types';

/** The world runs at 60 ticks/s (kept local: drawHud takes no config arg). */
const TICK_HZ = 60;
const FONT = '13px system-ui';
const TITLE_FONT = '600 20px system-ui';
const TEXT = '#e8edf2';
const MUTED = '#9aa7b4';
const PANEL = 'rgba(20,26,34,0.82)';
const DIM = 'rgba(0,0,0,0.55)';
const PAD = 10;
const INSET = 12;
const LINE = 18;

interface Label {
  text: string;
  font: string;
  color: string;
  /** Vertical slot reserved for this line. */
  advance: number;
}

// Exhaustive over Phase: TS requires every key.
const PHASE_CN: Record<Phase, string> = {
  morning: '清晨',
  midday: '午间',
  evening: '傍晚',
  night: '夜间',
};

function fmtInt(n: number): string {
  return Number.isFinite(n) ? String(Math.round(n)) : '0';
}

function measure(ctx: CanvasRenderingContext2D, label: Label): number {
  ctx.font = label.font;
  return ctx.measureText(label.text).width;
}

function totalAdvance(labels: Label[]): number {
  let sum = 0;
  for (const label of labels) sum += label.advance;
  return sum;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  r: { x: number; y: number; w: number; h: number; radius: number },
): void {
  const { x, y, w, h, radius } = r;
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function drawLabelsCentered(
  ctx: CanvasRenderingContext2D,
  labels: Label[],
  firstCenterY: number,
): void {
  const cx = ctx.canvas.width / 2;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let y = firstCenterY;
  for (const label of labels) {
    ctx.font = label.font;
    ctx.fillStyle = label.color;
    ctx.fillText(label.text, cx, y);
    y += label.advance;
  }
}

function dim(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = DIM;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
}

function drawStats(ctx: CanvasRenderingContext2D, world: World, paused: boolean): void {
  const labels: Label[] = [
    { text: `第 ${fmtInt(world.day)} 天 · ${PHASE_CN[world.phase]}`, font: FONT, color: TEXT, advance: LINE },
    { text: `评级 ${starBar(starsForDays(completedDays(world)))}`, font: FONT, color: TEXT, advance: LINE },
    { text: `送达 ${fmtInt(world.stats.delivered)}`, font: FONT, color: TEXT, advance: LINE },
    { text: `换乘 ${fmtInt(world.stats.transfers)}`, font: FONT, color: TEXT, advance: LINE },
    { text: `最长等待 ${fmtInt(world.stats.maxWaitTicks / TICK_HZ)}s`, font: FONT, color: TEXT, advance: LINE },
  ];
  if (paused) labels.push({ text: '已暂停（空格继续）', font: FONT, color: MUTED, advance: LINE });

  ctx.save();
  let textW = 0;
  for (const label of labels) textW = Math.max(textW, measure(ctx, label));
  ctx.fillStyle = PANEL;
  roundRect(ctx, { x: INSET, y: INSET, w: textW + PAD * 2, h: totalAdvance(labels) + PAD * 2 - 4, radius: 8 });
  ctx.fill();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  labels.forEach((label, i) => {
    ctx.font = label.font;
    ctx.fillStyle = label.color;
    ctx.fillText(label.text, INSET + PAD, INSET + PAD - 1 + i * LINE);
  });
  ctx.restore();
}

function drawGameOver(ctx: CanvasRenderingContext2D, world: World): void {
  const over = world.gameOver;
  if (over === null) return;
  const floor = world.floors.find((f) => f.id === over.floor);
  const grade = scoreWorld(world, DEFAULT_CONFIG);
  ctx.save();
  dim(ctx);
  const labels: Label[] = [
    { text: '电梯系统过载', font: TITLE_FONT, color: TEXT, advance: 34 },
    { text: `瓶颈楼层：${floor === undefined ? String(over.floor) : floor.name}`, font: FONT, color: TEXT, advance: 22 },
    { text: `评价 ${starBar(grade.stars)} · 综合分 ${grade.score}`, font: FONT, color: TEXT, advance: 22 },
    { text: `存活 ${grade.days} 天 · 送达 ${fmtInt(grade.delivered)} 人`, font: FONT, color: MUTED, advance: 22 },
  ];
  const total = totalAdvance(labels);
  drawLabelsCentered(ctx, labels, (ctx.canvas.height - total) / 2 + labels[0].advance / 2);
  ctx.restore();
}

function drawUpgrade(ctx: CanvasRenderingContext2D, world: World): void {
  const offers = world.pendingUpgrade;
  if (offers === null) return;
  ctx.save();
  dim(ctx);
  const labels: Label[] = [{ text: '新的一天', font: TITLE_FONT, color: TEXT, advance: 34 }];
  offers.forEach((offer, i) => {
    labels.push({ text: `${i + 1}. ${offer.label}`, font: FONT, color: TEXT, advance: 22 });
  });
  labels.push({ text: '按 1 / 2 选择', font: FONT, color: MUTED, advance: 22 });

  let textW = 0;
  for (const label of labels) textW = Math.max(textW, measure(ctx, label));
  const w = textW + PAD * 2;
  const h = totalAdvance(labels) + PAD * 2;
  const x = (ctx.canvas.width - w) / 2;
  const y = (ctx.canvas.height - h) / 2;
  ctx.fillStyle = PANEL;
  roundRect(ctx, { x, y, w, h, radius: 10 });
  ctx.fill();
  drawLabelsCentered(ctx, labels, y + PAD + labels[0].advance / 2);
  ctx.restore();
}

export function drawHud(ctx: CanvasRenderingContext2D, world: World, paused: boolean): void {
  drawStats(ctx, world, paused);
  if (world.pendingUpgrade !== null) drawUpgrade(ctx, world);
  if (world.gameOver !== null) drawGameOver(ctx, world);
}
