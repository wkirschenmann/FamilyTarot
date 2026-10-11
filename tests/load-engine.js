import { readFileSync } from 'node:fs';
import vm from 'node:vm';

/** Loads the engine exactly as shipped: the <script id="engine"> block of app/index.html. */
export function loadEngine() {
  const html = readFileSync(new URL('../app/index.html', import.meta.url), 'utf8');
  const match = html.match(/<script id="engine">([\s\S]*?)<\/script>/);
  if (!match) throw new Error('engine block not found in app/index.html');
  const context = { structuredClone };
  vm.createContext(context);
  vm.runInContext(match[1], context, { filename: 'index.html#engine' });
  return context.TarotEngine;
}
