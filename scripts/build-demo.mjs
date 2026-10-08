// Build a single-file playable demo from the Vite output in dist/.
// The emitted ES module is inlined into index.html so the result runs by
// double-click (file://) with no server and no dependencies.
//
// Usage: npm.cmd run build:demo   ->  demo/vertical-rush.html

import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');

const html = readFileSync(join(dist, 'index.html'), 'utf8');
const jsFile = readdirSync(join(dist, 'assets')).find((name) => name.endsWith('.js'));
if (jsFile === undefined) throw new Error('build-demo: no JS bundle found in dist/assets');

// Guard against a literal </script> inside the bundle closing the inline tag early.
const js = readFileSync(join(dist, 'assets', jsFile), 'utf8').replace(/<\/script/gi, '<\\/script');

const scriptTag = /<script\b[^>]*\bsrc="[^"]*"[^>]*>\s*<\/script>/i;
if (!scriptTag.test(html)) throw new Error('build-demo: no external script tag found in dist/index.html');
// The app bundle has no imports/exports, so it can be inlined as a classic script;
// unlike an ES module, a classic inline script runs from file:// with no CORS. The
// script must move to the end of <body> so the #game canvas exists when it runs
// (the original module tag was deferred; a classic inline script is not).
const inline = `<script>\n"use strict";\n${js}\n</script>`;
const outHtml = html.replace(scriptTag, '').replace('</body>', `  ${inline}\n  </body>`);

const outDir = join(root, 'demo');
mkdirSync(outDir, { recursive: true });
const outFile = join(outDir, 'vertical-rush.html');
writeFileSync(outFile, outHtml, 'utf8');
console.log(`demo written: ${outFile} (${(outHtml.length / 1024).toFixed(1)} kB)`);
