// Stats + overlay layer. Drawn on top of the existing frame — never clears the
// canvas; only the passed ctx (and its canvas metrics) is used. All geometry is
// logical (CSS) px so the HUD scales with the element, not the backing store.

import { DEFAULT_CONFIG, MAX_ELEVATORS } from './config';
import { completedDays, scoreWorld, starBar, starsForDays } from './score';
import type { Phase, World } from './types';
import { CONTROL_BAR_H, controlBarLayout, upgradeOptionRects } from './view';

// The world runs at 60 ticks/s (kept local: drawHud takes no config arg).
const TICK_HZ = 60;
const FONT = '12px system-ui';
const TITLE_FONT = '600 17px system-ui';
const CONTROL_FONT = '600 15px system-ui';
const TEXT = '#1f242b';
const MUTED = '#6b7280';
// Single flat accent for the bottom bar's primary / active controls; dark ink
// on it reads ~4.5:1 (same badge-ink treatment render.ts uses for this blue).
const ACCENT = '#2e86e4';
const ACCENT_INK = '#1a1d22';
// Light frosted panel: translucent white over the scene, thin and quiet.
const PANEL = 'rgba(255,255,255,0.82)';
const DIM = 'rgba(255,255,255,0.62)';
const PAD = 14;
const INSET = 16;
const LINE = 20;
// One-line onboarding legend for the stop / skip language.
const HINT = '圆圈停靠 · 横杠跳过 · 点按格子切换停靠 · 底部栏暂停/倍速';
const HINT_FONT = '10px system-ui';
const HINT_COLOR = 'rgba(107,114,128,0.7)';
// Upgrade cards: whiter than the panel + hairline so they read as tappable.
const CARD_BG = 'rgba(255,255,255,0.95)';
const CARD_STROKE = 'rgba(31,36,43,0.16)';
// Landscape rotate prompt (centered over a light dim).
const ROTATE_TEXT = '请竖屏使用';
const ROTATE_FONT = '600 18px system-ui';

// Logical (CSS-pixel) size every HUD helper positions against.
interface Size {
  width: number;
  height: number;
}

interface Label {
  text: string;
  font: string;
  color: string;
  // Vertical slot reserved for this line.
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

function logicalSize(ctx: CanvasRenderingContext2D): { width: number; height: number } {
  const width = ctx.canvas.clientWidth || ctx.canvas.width;
  const height = ctx.canvas.clientHeight || ctx.canvas.height;
  return { width, height };
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

function drawLabelsCentered(
  ctx: CanvasRenderingContext2D,
  labels: Label[],
  center: { x: number; y: number },
): void {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let y = center.y;
  for (const label of labels) {
    ctx.font = label.font;
    ctx.fillStyle = label.color;
    ctx.fillText(label.text, center.x, y);
    y += label.advance;
  }
}

function dim(ctx: CanvasRenderingContext2D, size: Size): void {
  ctx.fillStyle = DIM;
  ctx.fillRect(0, 0, size.width, size.height);
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
  ctx.beginPath();
  ctx.roundRect(INSET, INSET, textW + PAD * 2, totalAdvance(labels) + PAD * 2 - 6, 10);
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

// Bottom control bar (pause + 1x/2x). Rects come verbatim from controlBarLayout
// — the same rects input.ts hit-tests — so what is drawn is what is tappable.
// Accent-filled pill = primary/active; outlined pill = available but idle.
function drawControlBar(
  ctx: CanvasRenderingContext2D,
  size: Size,
  ui: { paused: boolean; speed: number },
): void {
  const { bar, buttons } = controlBarLayout(size.width, size.height);
  ctx.save();
  // Subtle frosted strip + hairline separating it from the play field.
  ctx.fillStyle = PANEL;
  ctx.fillRect(bar.x, bar.y, bar.w, bar.h);
  ctx.fillStyle = 'rgba(31,36,43,0.08)';
  ctx.fillRect(bar.x, bar.y, bar.w, 1);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const { id, rect } of buttons) {
    const cx = rect.x + rect.w / 2;
    const cy = rect.y + rect.h / 2;
    ctx.beginPath();
    ctx.roundRect(rect.x, rect.y, rect.w, rect.h, rect.h / 2);
    switch (id) {
      case 'pause': {
        ctx.fillStyle = ACCENT;
        ctx.fill();
        ctx.fillStyle = ACCENT_INK;
        if (ui.paused) {
          // Play triangle: tap to resume.
          ctx.beginPath();
          ctx.moveTo(cx - 4, cy - 7);
          ctx.lineTo(cx + 7, cy);
          ctx.lineTo(cx - 4, cy + 7);
          ctx.closePath();
          ctx.fill();
        } else {
          // Pause glyph: two bars.
          ctx.fillRect(cx - 4.5, cy - 7, 4, 14);
          ctx.fillRect(cx + 0.5, cy - 7, 4, 14);
        }
        break;
      }
      case 'speed1':
      case 'speed2': {
        const speed = id === 'speed1' ? 1 : 2;
        const active = ui.speed === speed;
        ctx.fillStyle = active ? ACCENT : 'rgba(255,255,255,0.72)';
        ctx.fill();
        if (!active) {
          ctx.strokeStyle = 'rgba(31,36,43,0.22)';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
        ctx.font = CONTROL_FONT;
        ctx.fillStyle = active ? ACCENT_INK : MUTED;
        ctx.fillText(`${speed}×`, cx, cy);
        break;
      }
    }
  }
  ctx.restore();
}

// Muted legend just above the control bar; overlays dim it too.
function drawHint(ctx: CanvasRenderingContext2D, size: Size): void {
  ctx.save();
  ctx.font = HINT_FONT;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillStyle = HINT_COLOR;
  ctx.fillText(HINT, size.width / 2, size.height - CONTROL_BAR_H - 8);
  ctx.restore();
}

// Landscape only: light dim + centered rotate prompt. No-op in portrait.
function drawLandscapeHint(ctx: CanvasRenderingContext2D, size: Size): void {
  if (size.width <= size.height) return;
  ctx.save();
  dim(ctx, size);
  ctx.font = ROTATE_FONT;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = MUTED;
  ctx.fillText(ROTATE_TEXT, size.width / 2, size.height / 2);
  ctx.restore();
}

function drawGameOver(ctx: CanvasRenderingContext2D, world: World, size: Size): void {
  const over = world.gameOver;
  if (over === null) return;
  const floor = world.floors.find((f) => f.id === over.floor);
  const grade = scoreWorld(world, DEFAULT_CONFIG);
  ctx.save();
  dim(ctx, size);
  const labels: Label[] = [
    { text: '电梯系统过载', font: TITLE_FONT, color: TEXT, advance: 34 },
    { text: `瓶颈楼层：${floor === undefined ? String(over.floor) : floor.name}`, font: FONT, color: TEXT, advance: 22 },
    { text: `评价 ${starBar(grade.stars)} · 综合分 ${grade.score}`, font: FONT, color: TEXT, advance: 22 },
    { text: `存活 ${grade.days} 天 · 送达 ${fmtInt(grade.delivered)} 人`, font: FONT, color: MUTED, advance: 22 },
  ];
  const total = totalAdvance(labels);
  drawLabelsCentered(ctx, labels, {
    x: size.width / 2,
    y: (size.height - total) / 2 + labels[0].advance / 2,
  });
  ctx.restore();
}

// Day-end upgrade panel. Offer cards are tappable (mobile has no keyboard):
// rects come verbatim from upgradeOptionRects — the same rects input.ts
// hit-tests — with the title above the stack and 楼高 / 点按选择 below it.
function drawUpgrade(ctx: CanvasRenderingContext2D, world: World, size: Size): void {
  const offers = world.pendingUpgrade;
  if (offers === null || offers.length === 0) return;
  const { width, height } = size;
  const cards = upgradeOptionRects(width, height, offers.length);
  ctx.save();
  dim(ctx, size);

  const title: Label = { text: '新的一天', font: TITLE_FONT, color: TEXT, advance: 34 };
  const top = world.floors.reduce((m, f) => (f.id > m ? f.id : m), 0);
  const foot: Label[] = [
    { text: `楼高 ${top}F（记得把新层接入电梯）`, font: FONT, color: MUTED, advance: 22 },
  ];
  if (world.elevators.length >= MAX_ELEVATORS) {
    foot.push({ text: `电梯已达上限（${MAX_ELEVATORS} 部）`, font: FONT, color: MUTED, advance: 22 });
  }
  foot.push({ text: '点按选择', font: FONT, color: MUTED, advance: 22 });
  let textW = measure(ctx, title);
  for (const label of foot) textW = Math.max(textW, measure(ctx, label));

  // Anchor the copy around the card stack (>=1 card by the guard above).
  const lastCard = cards[cards.length - 1];
  const titleCY = cards[0].y - PAD - title.advance / 2;
  const footTop = lastCard.y + lastCard.h + PAD;
  const footCY = footTop + foot[0].advance / 2;
  const blockTop = titleCY - title.advance / 2;
  const blockBottom = footTop + totalAdvance(foot);
  const w = Math.max(textW, cards[0].w) + PAD * 2;
  const x = (width - w) / 2;
  const y = blockTop - PAD;
  ctx.fillStyle = PANEL;
  ctx.beginPath();
  ctx.roundRect(x, y, w, blockBottom - blockTop + PAD * 2, 12);
  ctx.fill();
  drawLabelsCentered(ctx, [title], { x: width / 2, y: titleCY });
  drawLabelsCentered(ctx, foot, { x: width / 2, y: footCY });

  for (const [i, rect] of cards.entries()) {
    ctx.beginPath();
    ctx.roundRect(rect.x, rect.y, rect.w, rect.h, 12);
    ctx.fillStyle = CARD_BG;
    ctx.fill();
    ctx.strokeStyle = CARD_STROKE;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.font = CONTROL_FONT;
    ctx.fillStyle = TEXT;
    ctx.fillText(offers[i].label, rect.x + rect.w / 2, rect.y + rect.h / 2);
  }
  ctx.restore();
}

export function drawHud(ctx: CanvasRenderingContext2D, world: World, ui: { paused: boolean; speed: number }): void {
  const size = logicalSize(ctx);
  drawStats(ctx, world, ui.paused);
  drawHint(ctx, size);
  // Control bar before the overlays so their dim mask covers it too; the
  // overlay and landscape helpers self-guard on their world/size state.
  drawControlBar(ctx, size, ui);
  drawUpgrade(ctx, world, size);
  drawGameOver(ctx, world, size);
  // Rotate prompt sits on top of everything while landscape.
  drawLandscapeHint(ctx, size);
}
