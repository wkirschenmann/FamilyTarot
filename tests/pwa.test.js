import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const app = (name) => new URL(`../app/${name}`, import.meta.url);

test('manifest is valid and points to existing relative files', () => {
  const manifest = JSON.parse(readFileSync(app('manifest.webmanifest'), 'utf8'));
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.start_url, './');
  const sizes = manifest.icons.map((i) => i.sizes);
  assert.ok(sizes.includes('192x192') && sizes.includes('512x512'));
  for (const icon of manifest.icons) {
    assert.ok(!icon.src.startsWith('/'), `absolute path: ${icon.src}`);
    assert.ok(existsSync(app(icon.src)), `missing ${icon.src}`);
  }
});

test('every file of the service worker shell exists', () => {
  const sw = readFileSync(app('sw.js'), 'utf8');
  const shell = sw.match(/const SHELL = \[(.*?)\];/s)[1].match(/'([^']+)'/g).map((s) => s.slice(1, -1));
  assert.ok(shell.length > 0);
  for (const file of shell) {
    if (file !== './') assert.ok(existsSync(app(file)), `missing ${file}`);
  }
});

test('index.html links the manifest and registers the service worker with relative paths', () => {
  const html = readFileSync(app('index.html'), 'utf8');
  assert.match(html, /<link rel="manifest" href="manifest\.webmanifest">/);
  assert.match(html, /serviceWorker\.register\('sw\.js'\)/);
  assert.doesNotMatch(html, /(href|src)="\//);
});

test('service worker carries the build marker replaced at deployment', () => {
  assert.match(readFileSync(app('sw.js'), 'utf8'), /__BUILD__/);
});

test('dark mode follows the system setting (no hard-coded light-only colours)', () => {
  const html = readFileSync(app('index.html'), 'utf8');
  assert.match(html, /color-scheme: light dark/);
  assert.match(html, /<meta name="color-scheme" content="light dark">/);
  assert.match(html, /<meta name="theme-color" content="[^"]+" media="\(prefers-color-scheme: dark\)">/);
  assert.match(html, /@media \(prefers-color-scheme: dark\) \{\s*:root \{/);
  // every light-only highlight colour must have a dark counterpart
  for (const selector of ['.error', '.info', '.warn', '.sheet tr.bad td']) {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    assert.match(html, new RegExp(`@media \\(prefers-color-scheme: dark\\) \\{ ${escaped} \\{`), `no dark variant for ${selector}`);
  }
});
