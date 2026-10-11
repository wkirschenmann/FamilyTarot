#!/usr/bin/env node
// One-off import of the legacy "Calcul Scores Tarot" workbook into tarot.json.
//
//   cd tools/import && npm install
//   node import-xlsm.js <workbook.xlsm> [--out ../../data] [--current-date YYYY-MM-DD]
//
// Writes <out>/tarot.json and <out>/import-report.txt. The workbook and its output hold game data: they are
// git-ignored and must never be committed (the repository is public).
//
// Every line is recomputed with the same engine as the app (extracted from app/index.html) and compared with the
// workbook; lines the engine does not reproduce keep their workbook scores, flagged `historical`.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import XLSX from 'xlsx';
import { loadEngine } from '../../tests/load-engine.js';

const E = loadEngine();

const CONTRACTS = { 'Petite': 'petite', 'Pousse': 'pousse', 'Garde': 'garde', 'Garde sans': 'gardeSans', 'Garde contre': 'gardeContre' };
const ANNOUNCEMENTS = {
  'Petit au bout': 'petitAuBout', 'Poignée': 'handful', 'Double Poignée': 'doubleHandful', 'Triple Poignée': 'tripleHandful',
  'Misère': 'misere', 'Chelem Non Annoncé': 'slamUnannounced', 'Chelem Annoncé': 'slamAnnounced',
};
// Until May 2016 the petit au bout was a fixed 10; the import tries both rule sets per deal, this date only breaks ties.
const PETIT_AU_BOUT_CHANGE = '2016-06-01';

function parseArgs(argv) {
  const args = { file: null, out: resolve('../../data'), currentDate: null };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--out') args.out = resolve(argv[++i]);
    else if (argv[i] === '--current-date') args.currentDate = argv[++i];
    else if (!args.file) args.file = argv[i];
  }
  if (!args.file) throw new Error('Usage: node import-xlsm.js <workbook.xlsm> [--out dir] [--current-date YYYY-MM-DD]');
  return args;
}

const slug = (name) => name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const clean = (v) => (typeof v === 'string' ? v.trim() : v);
const isName = (v) => typeof v === 'string' && v.trim() !== '' && v.trim() !== '/' && v.trim() !== '0';
const isScore = (v) => typeof v === 'number';

/** Reads one score sheet into plain lines. */
function readSheet(ws) {
  // Some sheets start at column B: always read from A1 so that column indexes are the same everywhere.
  const range = XLSX.utils.decode_range(ws['!ref']);
  range.s.r = 0;
  range.s.c = 0;
  const grid = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: true, range });
  const header = grid[5] || [];
  const players = [];
  for (let c = 12; c < header.length && isName(header[c]); c += 1) players.push(header[c].trim());
  // second block: running totals, same player names again further right
  let cumulStart = -1;
  for (let c = 12 + players.length; c < header.length; c += 1) if (header[c] === players[0]) { cumulStart = c; break; }
  const lines = [];
  for (let r = 6; r < grid.length; r += 1) {
    const row = grid[r];
    if (!row || row[2] === null || row[2] === undefined) continue;
    lines.push({
      row: r + 1,
      n: row[1],
      type: clean(row[2]),
      who: clean(row[3]),
      called: clean(row[4]),
      dead: [row[5], row[6]].filter(isName).map((x) => x.trim()),
      succeeded: row[10] === 'oui' ? true : row[10] === 'non' ? false : null,
      diff: typeof row[11] === 'number' ? row[11] : null,
      scores: players.map((_, k) => (isScore(row[12 + k]) ? row[12 + k] : null)),
      cumul: cumulStart < 0 ? null : players.map((_, k) => (isScore(row[cumulStart + k]) ? row[cumulStart + k] : null)),
    });
  }
  return { players, lines, label: clean(grid[3][1]) || clean(grid[3][2]) || null, count: grid[4][1] || grid[4][2] || null };
}

const sameInts = (a, b) => a.every((x, k) => x === b[k]);

function main() {
  const args = parseArgs(process.argv.slice(2));
  const wb = XLSX.read(readFileSync(args.file), { type: 'buffer' });
  const fileDate = (basename(args.file).match(/(\d{4})(\d{2})(\d{2})/) || []).slice(1).join('-') || null;
  const currentDate = args.currentDate || fileDate || E.localDate(new Date());

  const doc = E.createDocument();
  const rulesById = Object.fromEntries(doc.rules.map((r) => [r.id, r]));
  const playerIds = new Map();
  const playerId = (name) => {
    if (!playerIds.has(name)) {
      const id = 'p-' + slug(name);
      playerIds.set(name, id);
      doc.players.push({ id, firstName: name });
    }
    return playerIds.get(name);
  };

  const report = { games: [], mismatches: [], totals: [], warnings: [] };
  const sheetNames = wb.SheetNames.filter((n) => /^\d{4}-\d{2}-\d{2}$/.test(n)).sort();
  const jobs = sheetNames.map((n) => ({ name: n, date: n, state: 'archived' }))
    .concat(wb.SheetNames.includes('PARTIE EN COURS') ? [{ name: 'PARTIE EN COURS', date: currentDate, state: 'in_progress' }] : []);

  for (const job of jobs) {
    const sheet = readSheet(wb.Sheets[job.name]);
    const ids = sheet.players.map(playerId);
    const game = {
      id: `g-${job.name === 'PARTIE EN COURS' ? 'current' : job.date}`, date: job.date, rulesId: null, state: job.state,
      tableOrder: ids.slice(), present: [], deals: [],
    };
    const preference = job.date < PETIT_AU_BOUT_CHANGE ? ['custom-2016', 'custom'] : ['custom', 'custom-2016'];
    const usedRules = new Map();
    let current = null;

    const finishDeal = () => {
      if (!current) return;
      const lines = [current.contractLine].concat(current.annLines);
      let best = null;
      for (const rulesId of preference) {
        const rules = rulesById[rulesId];
        const results = lines.map((line, k) => {
          try {
            const scores = k === 0
              ? E.contractScores(rules, current.deal)
              : E.announcementScores(rules, current.deal, current.deal.announcements[k - 1]);
            return line.scores.every((v, i) => (v === null) === !(ids[i] in scores)) && ids.every((id, i) => v0(line.scores[i]) === (scores[id] || 0));
          } catch (e) { return false; }
        });
        const ok = results.filter(Boolean).length;
        if (!best || ok > best.ok) best = { rulesId, results, ok };
      }
      current.deal.rulesId = best.rulesId;
      usedRules.set(best.rulesId, (usedRules.get(best.rulesId) || 0) + 1);
      const rules = rulesById[best.rulesId];
      lines.forEach((line, k) => {
        const target = k === 0 ? current.deal : current.deal.announcements[k - 1];
        if (best.results[k]) {
          target.scores = k === 0 ? E.contractScores(rules, current.deal) : E.announcementScores(rules, current.deal, target);
        } else {
          target.historical = true;
          target.scores = Object.fromEntries(ids.map((id, i) => [id, line.scores[i] === null ? 0 : Math.round(line.scores[i])]).filter(([id]) => current.deal.players.includes(id)));
          report.mismatches.push(`${job.name} row ${line.row} (${line.type} ${line.who || ''}): workbook ${JSON.stringify(line.scores.map((v) => v === null ? null : Math.round(v * 100) / 100))} vs engine ${JSON.stringify(engineScoresFor(rules, current.deal, target, k, ids))}`);
        }
      });
      game.deals.push(current.deal);
      current = null;
    };

    for (const line of sheet.lines) {
      const players = ids.filter((_, k) => line.scores[k] !== null);
      if (CONTRACTS[line.type]) {
        finishDeal();
        const n = players.length;
        const deal = {
          id: `${game.id}-d${game.deals.length + 1}`, number: 0, dealer: null, type: 'contract', rulesId: null,
          players, dead: line.dead.map(playerId), announcements: [], scores: {},
          contract: CONTRACTS[line.type], taker: playerId(line.who),
          partner: n >= 5 ? playerId(isName(line.called) ? line.called : line.who) : null,
          succeeded: line.succeeded, pointDiff: line.diff,
        };
        current = { deal, contractLine: line, annLines: [] };
      } else if (ANNOUNCEMENTS[line.type]) {
        if (!current) { report.warnings.push(`${job.name} row ${line.row}: announcement without a contract, skipped`); continue; }
        current.annLines.push(line);
        current.deal.announcements.push({ id: `${current.deal.id}-a${current.annLines.length}`, type: ANNOUNCEMENTS[line.type], beneficiary: playerId(line.who), scores: {} });
      } else {
        report.warnings.push(`${job.name} row ${line.row}: unknown line type "${line.type}", skipped`);
      }
    }
    finishDeal();

    const lastLine = sheet.lines[sheet.lines.length - 1];
    game.rulesId = [...usedRules.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || 'custom';
    game.present = lastLine ? ids.filter((_, k) => lastLine.scores[k] !== null) : ids.slice();
    doc.games.push(game);

    // totals check against the workbook's own running totals
    const { totals } = E.recomputeGame(doc, game);
    const wbTotals = lastLine && lastLine.cumul ? lastLine.cumul : null;
    if (wbTotals) {
      const engine = ids.map((id) => totals[id] || 0);
      const expected = wbTotals.map((v) => (v === null ? 0 : Math.round(v)));
      if (!sameInts(engine, expected)) {
        report.totals.push(`${job.name}: workbook ${JSON.stringify(expected)} vs app ${JSON.stringify(engine)} (players ${sheet.players.join(', ')})`);
      }
    }
    report.games.push({ name: job.name, players: sheet.players.length, deals: game.deals.length, lines: sheet.lines.length, label: sheet.label, rules: [...usedRules.entries()] });
  }

  E.migrate(doc);
  doc.rev = 1;
  doc.updatedAt = new Date().toISOString();
  mkdirSync(args.out, { recursive: true });
  writeFileSync(resolve(args.out, 'tarot.json'), JSON.stringify(doc));
  writeFileSync(resolve(args.out, 'import-report.txt'), formatReport(doc, report, args));
  console.log(formatReport(doc, report, args));
}

const v0 = (v) => (v === null ? 0 : Math.round(v));

function engineScoresFor(rules, deal, target, k, ids) {
  try {
    const s = k === 0 ? E.contractScores(rules, deal) : E.announcementScores(rules, deal, target);
    return ids.map((id) => (id in s ? s[id] : null));
  } catch (e) { return 'error: ' + e.message; }
}

function formatReport(doc, report, args) {
  const contracts = doc.games.flatMap((g) => g.deals).filter((d) => d.type === 'contract');
  const anns = doc.games.flatMap((g) => g.deals).flatMap((d) => d.announcements);
  const lines = [];
  lines.push(`Import of ${basename(args.file)}`);
  lines.push(`games ${doc.games.length} (${doc.games.filter((g) => g.state === 'in_progress').length} in progress), players ${doc.players.length}, contracts ${contracts.length}, announcements ${anns.length}`);
  const ok = contracts.filter((d) => d.succeeded).length;
  lines.push(`contracts succeeded: ${ok}/${contracts.length} = ${(100 * ok / contracts.length).toFixed(1)} %`);
  const byRules = {};
  for (const d of doc.games.flatMap((g) => g.deals)) byRules[d.rulesId] = (byRules[d.rulesId] || 0) + 1;
  lines.push(`deals by rule set: ${JSON.stringify(byRules)}`);
  lines.push('');
  lines.push(`Lines not reproduced by the engine (kept as historical): ${report.mismatches.length}`);
  for (const m of report.mismatches) lines.push('  ' + m);
  lines.push('');
  lines.push(`Final totals different from the workbook: ${report.totals.length}`);
  for (const m of report.totals) lines.push('  ' + m);
  if (report.warnings.length) { lines.push(''); lines.push('Warnings:'); for (const w of report.warnings) lines.push('  ' + w); }
  return lines.join('\n');
}

main();
