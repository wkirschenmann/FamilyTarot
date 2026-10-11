#!/usr/bin/env node
// Compares the statistics computed by the app on the 75 oldest games with the workbook's STATISTIQUES sheet
// (which was frozen on those games). Reads the workbook and the tarot.json produced by import-xlsm.js.
//
//   node verify-stats.js <workbook.xlsm> [--data ../../data/tarot.json] [--games 75]

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import XLSX from 'xlsx';
import { loadEngine } from '../../tests/load-engine.js';

const E = loadEngine();
const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const opt = (name, fallback) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : fallback; };
const doc = JSON.parse(readFileSync(resolve(opt('--data', '../../data/tarot.json')), 'utf8'));
const count = Number(opt('--games', 75));

const wb = XLSX.read(readFileSync(file), { type: 'buffer' });
const ws = wb.Sheets['STATISTIQUES'];
const range = XLSX.utils.decode_range(ws['!ref']);
range.s.r = 0; range.s.c = 0;
const grid = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, range });
const row = (n) => grid[n - 1] || [];

const archived = doc.games.filter((g) => g.state === 'archived').sort((a, b) => a.date.localeCompare(b.date));
const to = archived[count - 1].date;
const st = E.computeStats(doc, { to });
const names = row(2);
const idOf = new Map(doc.players.map((p) => [p.firstName, p.id]));
const columns = [];
for (let c = 2; c < names.length && names[c] !== 'FIN'; c += 1) if (typeof names[c] === 'string' && idOf.has(names[c])) columns.push({ c, name: names[c], id: idOf.get(names[c]) });

let checked = 0;
const diffs = [];
const known = [];
const near = (a, b) => (a === null || a === undefined ? 0 : a) === (b === null || b === undefined ? 0 : b) || Math.abs((a || 0) - (b || 0)) < 0.0006;
// `explained` = difference that comes from the old sheet itself (a bug or a quirk), listed apart from real differences.
function check(label, rowNumber, pick, explained = null) {
  const r = row(rowNumber);
  const out = (msg) => (explained ? known.push(`${msg}  [${explained}]`) : diffs.push(msg));
  const totalExpected = r[1];
  if (typeof totalExpected === 'number') { checked += 1; const v = pick(st.total); if (!near(v, totalExpected)) out(`${label} TOTAL: sheet ${totalExpected} vs app ${v}`); }
  for (const { c, name, id } of columns) {
    const expected = typeof r[c] === 'number' ? r[c] : 0;
    const p = st.players[id];
    const v = p ? pick(p) : null;
    checked += 1;
    if (!near(v, expected)) out(`${label} ${name}: sheet ${expected} vs app ${v}`);
  }
}

const contractRows = { petite: [14, 22, 29, 37, 45], garde: [16, 24, 31, 39, 47], gardeSans: [17, 25, 32, 40, 48], gardeContre: [18, 26, 33, 41, 49] };
check('parties', 4, (p) => p.games);
check('participation', 5, (p) => p.participation);
check('donnes', 8, (p) => p.deals, 'unexplained quirk of the old sheet: 28 deals out of 1744 are not counted per player');
for (const [key, [cnt, share, ok, rate, diff]] of Object.entries(contractRows)) {
  check(`${key} prises`, cnt, (p) => (p.takes.byContract[key] || {}).count || 0);
  check(`${key} répartition`, share, (p) => (p.takes.byContract[key] || {}).share || 0);
  check(`${key} réussites`, ok, (p) => (p.takes.byContract[key] || {}).succeeded || 0);
  check(`${key} taux`, rate, (p) => (p.takes.byContract[key] || {}).rate || 0);
  check(`${key} écart moyen`, diff, (p) => (p.takes.byContract[key] || {}).avgDiff || 0, 'the sheet\'s TOTAL is the mean of the players\' means, not the mean over all takes');
}
check('prises total', 19, (p) => p.takes.count);
check('réussites total', 34, (p) => p.takes.succeeded);
check('taux total', 42, (p) => p.takes.rate || 0);
check('écart moyen total', 50, (p) => p.takes.avgDiff || 0, 'the sheet\'s TOTAL is the mean of the players\' means, not the mean over all takes');
const annRows = { petitAuBout: 54, handful: 55, doubleHandful: 56, tripleHandful: 57, misere: 58, slamAnnounced: 59, slamUnannounced: 60 };
for (const [key, r] of Object.entries(annRows)) check(`annonces ${key}`, r, (p) => p.announcements.byType[key] || 0);
const sheetBug = 'the sheet\'s announcement total leaves out the slams, and its per-game row is misaligned';
check('annonces total', 61, (p) => p.announcements.count, sheetBug);
check('annonces pour 10 donnes', 62, (p) => p.announcements.per10Deals || 0, sheetBug);
check('annonces par partie', 63, (p) => p.announcements.perGame || 0, sheetBug);
check('auto-appels', 76, (p) => p.takes.selfCalls);
check('auto-appels %', 77, (p) => p.takes.selfCallShare || 0);
// partner matrix: row = called player (name in column A), column = taker
for (let r = 79; r <= 94; r += 1) {
  const label = row(r)[0];
  if (!idOf.has(label)) continue;
  const partnerId = idOf.get(label);
  for (const { c, name, id } of columns) {
    const expected = typeof row(r)[c] === 'number' ? row(r)[c] : 0;
    const v = (st.players[id] && st.players[id].partners[partnerId]) || 0;
    checked += 1;
    if (v !== expected) diffs.push(`partenaire appelé ${label} par ${name}: sheet ${expected} vs app ${v}`);
  }
}
console.log(`games up to ${to}: ${st.games}; ${checked} values compared with the workbook sheet`);
console.log(`differences not explained: ${diffs.length}`);
for (const d of diffs.slice(0, 60)) console.log('  ' + d);
console.log(`known differences caused by the old sheet itself (quirks and bugs): ${known.length}`);
const groups = {};
for (const k of known) { const why = k.slice(k.lastIndexOf('[')); groups[why] = (groups[why] || 0) + 1; }
for (const [why, n] of Object.entries(groups)) console.log(`  ${n} ${why}`);
