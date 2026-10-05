import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Browser-layer files are allowed to touch the DOM; everything else must stay pure.
const BROWSER_LAYER = new Set(['main.ts', 'render.ts', 'input.ts', 'hud.ts']);

const FORBIDDEN = /(\bdocument\b|\bwindow\b|requestAnimationFrame|performance\.now|Math\.random|HTMLCanvasElement)/;

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

function pureFiles(): string[] {
  const files: string[] = [];
  for (const name of readdirSync('src')) {
    if (name.endsWith('.ts') && !BROWSER_LAYER.has(name)) files.push(join('src', name));
  }
  for (const name of readdirSync('src/systems')) {
    if (name.endsWith('.ts')) files.push(join('src', 'systems', name));
  }
  return files;
}

describe('architecture: pure modules stay DOM-free', () => {
  it('sim/route/dispatch/view/config/queries/rng and systems reference no DOM globals', () => {
    const files = pureFiles();
    expect(files.length).toBeGreaterThanOrEqual(8);
    for (const file of files) {
      const code = stripComments(readFileSync(file, 'utf8'));
      const match = code.match(FORBIDDEN);
      expect(match, `${file} must stay pure but matched ${match?.[0]}`).toBeNull();
    }
  });
});
