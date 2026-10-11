import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './load-engine.js';

const E = loadEngine();
// The engine runs in its own vm realm: compare plain JSON copies.
const plain = (x) => JSON.parse(JSON.stringify(x));
const custom = () => E.presetRules().find((r) => r.id === 'custom');
const rulesById = (id) => E.presetRules().find((r) => r.id === id);

// Deterministic ids for readable tests.
let seq = 0;
E.setIdGenerator(() => `id${++seq}`);

const five = ['Ricou', 'Fred', 'Willy', 'Greg', 'Lolo'];
const deal = (extra) => Object.assign({
  type: 'contract', dealer: 'Ricou', players: five, dead: [], announcements: [],
}, extra);

function newGame(playerIds = five, rulesId = 'custom') {
  const doc = E.createDocument();
  const game = E.createGame(doc, { date: '2026-10-11', rulesId, playerIds });
  return { doc, game };
}
const input = (extra) => Object.assign({
  type: 'contract', dealer: 'Ricou', players: five, dead: [], contract: 'petite', taker: 'Willy', partner: 'Fred',
  succeeded: true, pointDiff: 10,
}, extra);

// ------------------------- §8 specification examples -----------------------

test('§8 example 1: garde succeeded, gap 17, taker Willy, partner Fred', () => {
  const s = E.contractScores(custom(), deal({ contract: 'garde', taker: 'Willy', partner: 'Fred', succeeded: true, pointDiff: 17 }));
  assert.deepEqual(plain(s), { Ricou: -84, Fred: 84, Willy: 168, Greg: -84, Lolo: -84 });
});

test('§8 example 2: petite failed, gap 3, taker Fred, partner Lolo', () => {
  const s = E.contractScores(custom(), deal({ contract: 'petite', taker: 'Fred', partner: 'Lolo', succeeded: false, pointDiff: 3 }));
  assert.deepEqual(plain(s), { Ricou: 28, Fred: -56, Willy: 28, Greg: 28, Lolo: -28 });
});

test('§8 example 3: garde contre failed, gap 12, Greg calls himself', () => {
  const s = E.contractScores(custom(), deal({ contract: 'gardeContre', taker: 'Greg', partner: 'Greg', succeeded: false, pointDiff: 12 }));
  assert.deepEqual(plain(s), { Ricou: 222, Fred: 222, Willy: 222, Greg: -888, Lolo: 222 });
});

test('§8 example 4: misère of Ricou at 5 players', () => {
  const s = E.announcementScores(custom(), deal({ contract: 'petite', taker: 'Willy', partner: 'Fred', succeeded: true, pointDiff: 5 }),
    { type: 'misere', beneficiary: 'Ricou' });
  assert.deepEqual(plain(s), { Ricou: 40, Fred: -10, Willy: -10, Greg: -10, Lolo: -10 });
});

test('§8 example 5 / criterion 1: Goulasch, winner Greg, loser Fred', () => {
  const s = E.contractScores(custom(), deal({ type: 'goulasch', winner: 'Greg', loser: 'Fred' }));
  assert.deepEqual(plain(s), { Ricou: 0, Fred: -40, Willy: 0, Greg: 40, Lolo: 0 });
  assert.equal(E.sumScores(s), 0);
});

// ------------------------------- rounding ----------------------------------

test('rounding goes to the nearest multiple, halves up', () => {
  assert.equal(E.roundTo(14, 10), 10);
  assert.equal(E.roundTo(15, 10), 20);
  assert.equal(E.roundTo(12, 5), 10);
  assert.equal(E.roundTo(13, 5), 15);
  assert.equal(E.roundTo(7, 1), 7);
});

test('rounding mode: on points, on base, on total', () => {
  const r = custom();
  r.roundTo = 10;
  r.contracts.garde = { valid: true, base: 25, coef: 2 };
  r.roundOn = 'pts';   // (25 + round(17)) x 2
  assert.equal(E.contractValue(r, 'garde', 17), (25 + 20) * 2);
  r.roundOn = 'base';  // round(25 + 17) x 2
  assert.equal(E.contractValue(r, 'garde', 17), 40 * 2);
  r.roundOn = 'total'; // round(42 x 2)
  assert.equal(E.contractValue(r, 'garde', 17), 80);
  r.roundOn = 'total';
  assert.equal(E.contractValue(r, 'garde', 18), 90);
});

test('FFT preset does not round (as in the official rulebook)', () => {
  const fft = rulesById('fft');
  assert.equal(fft.roundTo, 1);
  assert.equal(E.contractValue(fft, 'garde', 17), (25 + 17) * 2);
  assert.equal(E.contractValue(fft, 'gardeContre', 12), (25 + 12) * 6);
});

// --------------------------- contract distribution -------------------------

test('3 and 4 players: taker gets (n - 1) x D, each other pays D', () => {
  const four = ['A', 'B', 'C', 'D'];
  const s = E.contractScores(custom(), deal({ players: four, dealer: 'A', contract: 'petite', taker: 'A', succeeded: true, pointDiff: 5 }));
  assert.deepEqual(plain(s), { A: 90, B: -30, C: -30, D: -30 });
  const three = ['A', 'B', 'C'];
  const t = E.contractScores(custom(), deal({ players: three, dealer: 'A', contract: 'petite', taker: 'A', succeeded: false, pointDiff: 5 }));
  assert.deepEqual(plain(t), { A: -60, B: 30, C: 30 });
});

test('6 players: the dead player scores 0 and the sum stays 0', () => {
  const six = [...five, 'Aude'];
  const s = E.contractScores(custom(), deal({ players: six, dead: ['Aude'], contract: 'garde', taker: 'Willy', partner: 'Fred', succeeded: true, pointDiff: 17 }));
  assert.equal(s.Aude, 0);
  assert.equal(s.Willy, 168);
  assert.equal(E.sumScores(s), 0);
});

test('7 players with 2 dead players', () => {
  const seven = [...five, 'Aude', 'Titou'];
  const s = E.contractScores(custom(), deal({ players: seven, dead: ['Aude', 'Titou'], contract: 'petite', taker: 'Greg', partner: 'Lolo', succeeded: false, pointDiff: 3 }));
  assert.equal(s.Aude, 0);
  assert.equal(s.Titou, 0);
  assert.equal(s.Greg, -56);
  assert.equal(E.sumScores(s), 0);
});

test('passed deal scores 0 for everybody', () => {
  const s = E.contractScores(custom(), deal({ type: 'passed' }));
  assert.equal(E.sumScores(s), 0);
  assert.ok(Object.values(s).every((v) => v === 0));
});

// ------------------------------- announcements -----------------------------

const base5 = (extra) => deal(Object.assign({ contract: 'petite', taker: 'Willy', partner: 'Fred', succeeded: true, pointDiff: 5 }, extra));

test('petit au bout is multiplied by the contract coefficient and shared (taker side)', () => {
  const s = E.announcementScores(custom(), base5({ contract: 'garde' }), { type: 'petitAuBout', beneficiary: 'Willy' });
  // 10 x 2 = 20 : taker +40, partner +20, three opponents -20
  assert.deepEqual(plain(s), { Ricou: -20, Fred: 20, Willy: 40, Greg: -20, Lolo: -20 });
});

test('petit au bout won by the defence keeps its sign whatever the contract result', () => {
  const s = E.announcementScores(custom(), base5({ contract: 'garde', succeeded: true }), { type: 'petitAuBout', beneficiary: 'Greg' });
  // opponents win 20 each, taker pays 40 and partner 20
  assert.deepEqual(plain(s), { Ricou: 20, Fred: -20, Willy: -40, Greg: 20, Lolo: 20 });
  assert.equal(E.sumScores(s), 0);
});

test('petit au bout, self-call: the taker alone carries 4 x the value', () => {
  const d = base5({ taker: 'Willy', partner: 'Willy' });
  const own = E.announcementScores(custom(), d, { type: 'petitAuBout', beneficiary: 'Willy' });
  assert.deepEqual(plain(own), { Ricou: -10, Fred: -10, Willy: 40, Greg: -10, Lolo: -10 });
  const against = E.announcementScores(custom(), d, { type: 'petitAuBout', beneficiary: 'Greg' });
  assert.deepEqual(plain(against), { Ricou: 10, Fred: 10, Willy: -40, Greg: 10, Lolo: 10 });
});

test('handful follows the contract: it costs when the beneficiary side fails', () => {
  const failed = base5({ succeeded: false });
  const taker = E.announcementScores(custom(), failed, { type: 'handful', beneficiary: 'Willy' });
  assert.equal(taker.Willy, -40);
  assert.equal(taker.Fred, -20);
  assert.equal(taker.Greg, 20);
  const defender = E.announcementScores(custom(), failed, { type: 'handful', beneficiary: 'Greg' });
  assert.equal(defender.Greg, 20);
  assert.equal(defender.Willy, -40);
  assert.equal(E.sumScores(defender), 0);
});

test('handful of a defender when the contract succeeds costs the defenders', () => {
  const s = E.announcementScores(custom(), base5({ succeeded: true }), { type: 'handful', beneficiary: 'Greg' });
  assert.equal(s.Greg, -20);
  assert.equal(s.Willy, 40);
  assert.equal(s.Fred, 20);
  assert.equal(E.sumScores(s), 0);
});

test('individual announcement: the beneficiary collects from every other active player', () => {
  const six = [...five, 'Aude'];
  const s = E.announcementScores(custom(), deal({ players: six, dead: ['Aude'], contract: 'petite', taker: 'Willy', partner: 'Fred', succeeded: true, pointDiff: 5 }),
    { type: 'misere', beneficiary: 'Greg' });
  assert.equal(s.Greg, 40);
  assert.equal(s.Aude, 0);
  assert.equal(E.sumScores(s), 0);
});

test('shared announcement at 4 players: team scoring around the taker', () => {
  const four = ['A', 'B', 'C', 'D'];
  const d = deal({ players: four, dealer: 'A', contract: 'petite', taker: 'A', succeeded: true, pointDiff: 5 });
  const own = E.announcementScores(custom(), d, { type: 'handful', beneficiary: 'A' });
  assert.deepEqual(plain(own), { A: 60, B: -20, C: -20, D: -20 });
  const other = E.announcementScores(custom(), d, { type: 'handful', beneficiary: 'B' });
  // beneficiary on the winning-contract opposite side: sign -1 (taker's side won)
  assert.deepEqual(plain(other), { A: 60, B: -20, C: -20, D: -20 });
});

test('a dead player cannot receive an announcement', () => {
  const six = [...five, 'Aude'];
  const d = deal({ players: six, dead: ['Aude'], contract: 'petite', taker: 'Willy', partner: 'Fred', succeeded: true, pointDiff: 5 });
  assert.ok(E.validateAnnouncement(custom(), d, { type: 'misere', beneficiary: 'Aude' }).length > 0);
  assert.equal(E.validateAnnouncement(custom(), d, { type: 'misere', beneficiary: 'Greg' }).length, 0);
});

test('every announcement type keeps the sum at 0', () => {
  const r = custom();
  const six = [...five, 'Aude'];
  for (const players of [five, six, ['A', 'B', 'C', 'D'], ['A', 'B', 'C']]) {
    const dead = players.length === 6 ? [players[5]] : [];
    const active = players.filter((p) => !dead.includes(p));
    for (const succeeded of [true, false]) {
      for (const partnerIsTaker of [false, true]) {
        const d = deal({
          players, dealer: players[0], dead, contract: 'garde', taker: active[0],
          partner: players.length >= 5 ? (partnerIsTaker ? active[0] : active[1]) : null, succeeded, pointDiff: 7,
        });
        for (const type of E.ANNOUNCEMENT_KEYS) {
          for (const beneficiary of active) {
            const s = E.announcementScores(r, d, { type, beneficiary });
            assert.equal(E.sumScores(s), 0, `${players.length}p ${type} ${beneficiary} ok=${succeeded} self=${partnerIsTaker}`);
          }
        }
      }
    }
  }
});

test('pre-2016 rules: petit au bout is a fixed 10', () => {
  const s = E.announcementScores(rulesById('custom-2016'), base5({ contract: 'gardeContre' }), { type: 'petitAuBout', beneficiary: 'Willy' });
  assert.equal(s.Willy, 20);
  const now = E.announcementScores(custom(), base5({ contract: 'gardeContre' }), { type: 'petitAuBout', beneficiary: 'Willy' });
  assert.equal(now.Willy, 120);
});

// ------------------------------ validation ---------------------------------

test('Goulasch: winner and loser must differ and must be alive', () => {
  const r = custom();
  const six = [...five, 'Aude'];
  assert.ok(E.validateDeal(r, deal({ type: 'goulasch', winner: 'Greg', loser: 'Greg' })).length > 0);
  assert.ok(E.validateDeal(r, deal({ type: 'goulasch', players: six, dead: ['Aude'], winner: 'Aude', loser: 'Greg' })).length > 0);
  assert.ok(E.validateDeal(r, deal({ type: 'goulasch', players: six, dead: ['Aude'], winner: 'Greg', loser: 'Aude' })).length > 0);
  assert.equal(E.validateDeal(r, deal({ type: 'goulasch', winner: 'Greg', loser: 'Fred' })).length, 0);
});

test('Goulasch is refused when disabled in the rules', () => {
  assert.ok(E.validateDeal(rulesById('fft'), deal({ type: 'goulasch', winner: 'Greg', loser: 'Fred' })).length > 0);
});

test('point difference is capped to 0..91', () => {
  const r = custom();
  const ok = input({ pointDiff: 91 });
  assert.equal(E.validateDeal(r, ok).length, 0);
  assert.ok(E.validateDeal(r, input({ pointDiff: 92 })).length > 0);
  assert.ok(E.validateDeal(r, input({ pointDiff: -1 })).length > 0);
  assert.ok(E.validateDeal(r, input({ pointDiff: 3.5 })).length > 0);
});

test('dead players: right count, distinct, never taker or partner', () => {
  const r = custom();
  const six = [...five, 'Aude'];
  const seven = [...six, 'Titou'];
  assert.ok(E.validateDeal(r, input({ players: six, dead: [] })).length > 0);
  assert.equal(E.validateDeal(r, input({ players: six, dead: ['Aude'] })).length, 0);
  assert.ok(E.validateDeal(r, input({ players: seven, dead: ['Aude', 'Aude'] })).some((m) => m.includes('2e mort')));
  assert.ok(E.validateDeal(r, input({ players: six, dead: ['Willy'] })).length > 0);
  assert.ok(E.validateDeal(r, input({ players: five, dead: ['Aude'] })).length > 0);
});

test('assisted entry: oudlers and points give success and gap', () => {
  assert.deepEqual(plain(E.assistedResult(0, 56)), { succeeded: true, pointDiff: 0 });
  assert.deepEqual(plain(E.assistedResult(1, 51)), { succeeded: true, pointDiff: 0 });
  assert.deepEqual(plain(E.assistedResult(2, 41)), { succeeded: true, pointDiff: 0 });
  assert.deepEqual(plain(E.assistedResult(3, 36)), { succeeded: true, pointDiff: 0 });
  assert.deepEqual(plain(E.assistedResult(2, 38)), { succeeded: false, pointDiff: 3 });
  assert.deepEqual(plain(E.assistedResult(0, 73)), { succeeded: true, pointDiff: 17 });
});

test('rules validation rejects non-integer values', () => {
  const r = custom();
  assert.equal(E.validateRules(r).length, 0);
  r.contracts.garde.coef = 1.5;
  assert.ok(E.validateRules(r).length > 0);
});

// ------------------------- dealers and passed deals ------------------------

test('dealer follows the table order and skips absent players', () => {
  const { game } = newGame();
  assert.equal(E.expectedDealer(game), 'Ricou');
  assert.equal(E.nextDealer(game, 'Lolo'), 'Ricou');
  game.present = ['Ricou', 'Willy', 'Greg', 'Lolo'];
  assert.equal(E.nextDealer(game, 'Ricou'), 'Willy');
});

test('adding a deal advances the dealer', () => {
  const { doc, game } = newGame();
  E.addDeal(doc, game, input({ dealer: 'Ricou' }));
  assert.equal(E.expectedDealer(game), 'Fred');
});

const fftGame = () => newGame(five, 'fft'); // Goulasch disabled: skipped dealers become passed deals

test('§3 / criterion 7: without Goulasch, a dealer two places later adds passed deals', () => {
  const { doc, game } = fftGame();
  E.addDeal(doc, game, input({ dealer: 'Ricou' }));          // expected next: Fred
  const { passes } = E.addDeal(doc, game, input({ dealer: 'Greg' }));  // skips Fred, Willy
  assert.equal(passes.length, 2);
  assert.deepEqual(plain(passes.map((p) => p.dealer)), ['Fred', 'Willy']);
  assert.deepEqual(plain(game.deals.map((d) => d.type)), ['contract', 'passed', 'passed', 'contract']);
  assert.deepEqual(plain(game.deals.map((d) => d.number)), [1, 2, 3, 4]);
  assert.deepEqual(plain(E.dealerGaps(game)), []);
});

test('§3 example: 5 players, 3rd expected and 2nd chosen -> 4 passed deals, wrapping around', () => {
  const { doc, game } = fftGame();
  E.addDeal(doc, game, input({ dealer: 'Ricou' }));
  E.addDeal(doc, game, input({ dealer: 'Fred' }));            // next expected: Willy (3rd)
  const { passes } = E.addDeal(doc, game, input({ dealer: 'Fred' })); // choose the 2nd
  assert.deepEqual(plain(passes.map((p) => p.dealer)), ['Willy', 'Greg', 'Lolo', 'Ricou']);
});

test('passed deals are numbered but score nothing', () => {
  const { doc, game } = fftGame();
  E.addDeal(doc, game, input({ dealer: 'Ricou' }));
  E.addDeal(doc, game, input({ dealer: 'Willy' }));
  const { rows, totals } = E.recomputeGame(doc, game);
  const passed = rows.filter((r) => r.deal.type === 'passed');
  assert.equal(passed.length, 1);
  assert.equal(passed[0].number, 2);
  assert.equal(E.sumScores(passed[0].scores), 0);
  assert.equal(E.sumScores(totals), 0);
});

test('with the Goulasch enabled, no passed deal is added: the gap is only reported', () => {
  const { doc, game } = newGame(); // custom rules: Goulasch enabled
  assert.ok(E.goulaschEnabled(E.rulesFor(doc, game)));
  E.addDeal(doc, game, input({ dealer: 'Ricou' }));
  const ok = E.addDeal(doc, game, input({ dealer: 'Fred' }));
  assert.equal(ok.dealerWarning, false);
  const skipped = E.addDeal(doc, game, input({ dealer: 'Greg' })); // Willy was expected
  assert.equal(skipped.passes.length, 0);
  assert.equal(skipped.dealerWarning, true);
  assert.deepEqual(plain(game.deals.map((d) => d.type)), ['contract', 'contract', 'contract']);
  assert.deepEqual(plain(E.dealerGaps(game)), [skipped.deal.id]);
});

test('the scorer can still correct the dealer afterwards: the warning disappears', () => {
  const { doc, game } = newGame();
  E.addDeal(doc, game, input({ dealer: 'Ricou' }));
  const second = E.addDeal(doc, game, input({ dealer: 'Willy' })).deal; // Fred expected
  assert.equal(E.dealerGaps(game).length, 1);
  E.updateDeal(doc, game, second.id, input({ dealer: 'Fred' }));
  assert.equal(E.dealerGaps(game).length, 0);
});

test('a forgotten deal inserted in the gap also clears the warning', () => {
  const { doc, game } = newGame();
  const first = E.addDeal(doc, game, input({ dealer: 'Ricou' })).deal;
  E.addDeal(doc, game, input({ dealer: 'Willy' })); // Fred was forgotten
  assert.equal(E.dealerGaps(game).length, 1);
  E.insertDealAfter(doc, game, first.id, input({ dealer: 'Fred' }));
  assert.equal(E.dealerGaps(game).length, 0);
});

test('the first deal of a game is free: no passed deal and no warning before it', () => {
  for (const rulesId of ['custom', 'fft']) {
    const { doc, game } = newGame(five, rulesId);
    const r = E.addDeal(doc, game, input({ dealer: 'Greg' }));
    assert.equal(r.passes.length, 0);
    assert.equal(r.dealerWarning, false);
    assert.equal(E.expectedDealer(game), 'Lolo');
  }
});

// --------------------------- corrections (§9) ------------------------------

test('every line of a game sums to 0 and totals are cumulative', () => {
  const { doc, game } = newGame();
  const a = E.addDeal(doc, game, input({ dealer: 'Ricou', contract: 'garde', pointDiff: 17 })).deal;
  E.addAnnouncement(doc, game, a.id, { type: 'misere', beneficiary: 'Ricou' });
  E.addDeal(doc, game, input({ dealer: 'Fred', type: 'goulasch', winner: 'Greg', loser: 'Fred', taker: undefined }));
  const { rows, totals } = E.recomputeGame(doc, game);
  assert.equal(rows.length, 3);
  assert.ok(rows.every((r) => r.balanced));
  assert.equal(rows[0].cumulative.Willy, 168);
  assert.equal(rows[2].cumulative.Greg, rows[2].scores.Greg + rows[1].cumulative.Greg);
  assert.equal(E.sumScores(totals), 0);
});

test('modifying a contract recalculates its announcements and the totals', () => {
  const { doc, game } = newGame();
  const a = E.addDeal(doc, game, input({ dealer: 'Ricou', contract: 'garde', succeeded: true, pointDiff: 10 })).deal;
  E.addAnnouncement(doc, game, a.id, { type: 'handful', beneficiary: 'Willy' });
  assert.equal(game.deals[0].announcements[0].scores.Willy, 40);
  E.updateDeal(doc, game, a.id, input({ dealer: 'Ricou', contract: 'garde', succeeded: false, pointDiff: 10 }));
  assert.equal(game.deals[0].announcements[0].scores.Willy, -40);
  assert.equal(E.sumScores(E.recomputeGame(doc, game).totals), 0);
});

test('criterion 6: deleting a contract deletes its announcements and renumbers', () => {
  const { doc, game } = newGame();
  const a = E.addDeal(doc, game, input({ dealer: 'Ricou' })).deal;
  E.addAnnouncement(doc, game, a.id, { type: 'misere', beneficiary: 'Greg' });
  const b = E.addDeal(doc, game, input({ dealer: 'Fred' })).deal;
  E.deleteDeal(doc, game, a.id);
  assert.equal(game.deals.length, 1);
  assert.equal(game.deals[0].id, b.id);
  assert.equal(game.deals[0].number, 1);
  const { rows } = E.recomputeGame(doc, game);
  assert.equal(rows.length, 1);
});

test('deleting an announcement removes it alone', () => {
  const { doc, game } = newGame();
  const a = E.addDeal(doc, game, input({ dealer: 'Ricou' })).deal;
  const m1 = E.addAnnouncement(doc, game, a.id, { type: 'misere', beneficiary: 'Greg' });
  E.addAnnouncement(doc, game, a.id, { type: 'misere', beneficiary: 'Lolo' });
  E.deleteAnnouncement(doc, game, a.id, m1.id);
  assert.equal(game.deals[0].announcements.length, 1);
  assert.equal(game.deals[0].announcements[0].beneficiary, 'Lolo');
});

test('inserting a forgotten deal renumbers the next ones and does not move the dealer', () => {
  const { doc, game } = newGame();
  const a = E.addDeal(doc, game, input({ dealer: 'Ricou' })).deal;
  const b = E.addDeal(doc, game, input({ dealer: 'Fred' })).deal;
  const before = E.expectedDealer(game);
  const c = E.insertDealAfter(doc, game, a.id, input({ dealer: 'Greg' }));
  assert.deepEqual(plain(game.deals.map((d) => d.id)), [a.id, c.id, b.id]);
  assert.deepEqual(plain(game.deals.map((d) => d.number)), [1, 2, 3]);
  assert.equal(E.expectedDealer(game), before);
});

test('changing a contract into a Goulasch removes its announcements', () => {
  const { doc, game } = newGame();
  const a = E.addDeal(doc, game, input({ dealer: 'Ricou' })).deal;
  E.addAnnouncement(doc, game, a.id, { type: 'misere', beneficiary: 'Greg' });
  E.updateDeal(doc, game, a.id, input({ dealer: 'Ricou', type: 'goulasch', winner: 'Greg', loser: 'Fred' }));
  assert.equal(game.deals[0].type, 'goulasch');
  assert.equal(game.deals[0].announcements.length, 0);
  assert.equal(game.deals[0].scores.Greg, 40);
});

test('an announcement cannot be attached to a Goulasch', () => {
  const { doc, game } = newGame();
  const g = E.addDeal(doc, game, input({ dealer: 'Ricou', type: 'goulasch', winner: 'Greg', loser: 'Fred' })).deal;
  assert.throws(() => E.addAnnouncement(doc, game, g.id, { type: 'misere', beneficiary: 'Greg' }));
});

test('a rejected deal leaves the game untouched', () => {
  const { doc, game } = newGame();
  E.addDeal(doc, game, input({ dealer: 'Ricou' }));
  assert.throws(() => E.addDeal(doc, game, input({ dealer: 'Fred', pointDiff: 200 })));
  assert.equal(game.deals.length, 1);
});

test('departures and arrivals: absent players keep their column but are not dealers', () => {
  const { doc, game } = newGame();
  E.addDeal(doc, game, input({ dealer: 'Ricou' }));
  E.setPresentPlayers(game, ['Ricou', 'Fred', 'Greg', 'Lolo']);
  assert.ok(game.tableOrder.includes('Willy'));
  assert.equal(E.expectedDealer(game), 'Fred');
  E.addPlayerToTable(game, 'Aude', 'Fred');
  assert.deepEqual(plain(game.tableOrder), ['Ricou', 'Fred', 'Aude', 'Willy', 'Greg', 'Lolo']);
  assert.deepEqual(plain(game.present), ['Ricou', 'Fred', 'Aude', 'Greg', 'Lolo']);
});

test('a new game archives the game in progress', () => {
  const { doc, game } = newGame();
  const next = E.createGame(doc, { date: '2026-10-18', rulesId: 'custom', playerIds: five });
  assert.equal(game.state, 'archived');
  assert.equal(E.currentGame(doc).id, next.id);
});

// ------------------------------ rule versioning ----------------------------

test('changing rules for the following deals keeps the earlier deals untouched', () => {
  const { doc, game } = newGame();
  E.addDeal(doc, game, input({ dealer: 'Ricou', contract: 'garde', pointDiff: 10 }));
  const before = game.deals[0].scores.Willy;
  const edited = E.presetRules().find((r) => r.id === 'custom');
  edited.contracts.garde.coef = 3;
  E.changeRules(doc, game, edited, 'following');
  E.addDeal(doc, game, input({ dealer: 'Fred', contract: 'garde', pointDiff: 10 }));
  assert.equal(game.deals[0].scores.Willy, before);
  assert.equal(game.deals[1].scores.Willy, (25 + 10) * 3 * 2);
  assert.notEqual(game.deals[0].rulesId, game.deals[1].rulesId);
});

test('changing rules with a full recalculation updates every deal', () => {
  const { doc, game } = newGame();
  E.addDeal(doc, game, input({ dealer: 'Ricou', contract: 'garde', pointDiff: 10 }));
  const edited = E.presetRules().find((r) => r.id === 'custom');
  edited.contracts.garde.coef = 3;
  E.changeRules(doc, game, edited, 'all');
  assert.equal(game.deals[0].scores.Willy, (25 + 10) * 3 * 2);
  assert.equal(doc.rules.find((r) => r.id === 'custom').contracts.garde.coef, 2, 'the original rule set is never modified');
});

test('historical lines keep their frozen scores until edited', () => {
  const { doc, game } = newGame();
  const d = E.addDeal(doc, game, input({ dealer: 'Ricou' })).deal;
  d.historical = true;
  d.scores = { Ricou: 1, Fred: 2, Willy: 3, Greg: 4, Lolo: 5 };
  E.recomputeGame(doc, game);
  assert.equal(game.deals[0].scores.Willy, 3);
});

// ------------------------------- documents ---------------------------------

test('document: presets, migrate, players', () => {
  const doc = E.createDocument();
  assert.deepEqual(plain(doc.rules.map((r) => r.id)), ['fft', 'old-school', 'custom', 'custom-2016']);
  assert.doesNotThrow(() => E.migrate(plain(doc)));
  assert.throws(() => E.migrate({ schemaVersion: 99, players: [], rules: [], games: [] }));
  assert.throws(() => E.migrate({}));
  const a = E.findOrAddPlayer(doc, ' Greg ');
  const b = E.findOrAddPlayer(doc, 'greg');
  assert.equal(a.id, b.id);
  assert.equal(doc.players.length, 1);
});

test('ranking orders players by total', () => {
  const { doc, game } = newGame();
  E.addDeal(doc, game, input({ dealer: 'Ricou', contract: 'garde', pointDiff: 17 }));
  const r = E.ranking(doc, game);
  assert.equal(r[0].playerId, 'Willy');
  assert.equal(r[0].total, 168);
});

test('FFT preset follows the official FFT rulebook (no Pousse, no misère)', () => {
  const fft = rulesById('fft');
  const c = fft.contracts;
  assert.deepEqual(plain([c.petite, c.garde, c.gardeSans, c.gardeContre].map((x) => [x.valid, x.base, x.coef])),
    [[true, 25, 1], [true, 25, 2], [true, 25, 4], [true, 25, 6]]);
  assert.equal(c.pousse.valid, false);
  assert.equal(c.goulasch.valid, false);
  const a = fft.announcements;
  assert.deepEqual(plain([a.handful, a.doubleHandful, a.tripleHandful].map((x) => [x.base, x.shared, x.canFail, x.multiplied])),
    [[20, true, true, false], [30, true, true, false], [40, true, true, false]]);
  assert.deepEqual(plain([a.petitAuBout.base, a.petitAuBout.multiplied, a.petitAuBout.shared, a.petitAuBout.canFail]), [10, true, true, false]);
  assert.deepEqual(plain([a.slamUnannounced.base, a.slamAnnounced.base, a.slamFailed.base]), [200, 400, 200]);
  assert.equal(a.misere.valid, false);
  assert.deepEqual(plain(E.validContracts(fft)), ['petite', 'garde', 'gardeSans', 'gardeContre']);
});

test('FFT rulebook example: garde of +8 with 25 base gives 66 per opponent unit, petit au bout 10 x 2', () => {
  // "25 (contrat) + 8 = 33 multiplié par 2 (garde) = 66", petit au bout "10 X 2 = 20"
  const r = rulesById('fft');
  assert.equal(E.contractValue(r, 'garde', 8), 66);
  const d = deal({ contract: 'garde', taker: 'Willy', partner: 'Fred', succeeded: true, pointDiff: 8 });
  const pab = E.announcementScores(r, d, { type: 'petitAuBout', beneficiary: 'Willy' });
  assert.equal(pab.Greg, -20);
});

// -------------------------- announced slam that fails ----------------------

test('announced slam that fails: the attacking side pays 200 to each defender', () => {
  const d = base5({ contract: 'garde', succeeded: true });
  const s = E.announcementScores(custom(), d, { type: 'slamFailed', beneficiary: 'Willy' });
  // base 200, not multiplied by the contract: taker -400, partner -200, three defenders +200
  assert.deepEqual(plain(s), { Ricou: 200, Fred: -200, Willy: -400, Greg: 200, Lolo: 200 });
  assert.equal(E.sumScores(s), 0);
});

test('announced slam that fails: self-call and 4 players', () => {
  const self = E.announcementScores(custom(), base5({ taker: 'Willy', partner: 'Willy' }), { type: 'slamFailed', beneficiary: 'Willy' });
  assert.deepEqual(plain(self), { Ricou: 200, Fred: 200, Willy: -800, Greg: 200, Lolo: 200 });
  const four = ['A', 'B', 'C', 'D'];
  const s = E.announcementScores(custom(), deal({ players: four, dealer: 'A', contract: 'garde', taker: 'A', succeeded: false, pointDiff: 5 }),
    { type: 'slamFailed', beneficiary: 'A' });
  assert.deepEqual(plain(s), { A: -600, B: 200, C: 200, D: 200 });
});

test('announced slam that fails: only the taker or the partner can be the beneficiary', () => {
  const d = base5({});
  assert.equal(E.validateAnnouncement(custom(), d, { type: 'slamFailed', beneficiary: 'Willy' }).length, 0);
  assert.equal(E.validateAnnouncement(custom(), d, { type: 'slamFailed', beneficiary: 'Fred' }).length, 0);
  assert.ok(E.validateAnnouncement(custom(), d, { type: 'slamFailed', beneficiary: 'Greg' }).length > 0);
  assert.deepEqual(plain(E.attackingTeam(base5({ taker: 'Willy', partner: 'Willy' }))), ['Willy']);
});

test('announced slam that fails is available, with 200 points, in every rule set', () => {
  for (const r of E.presetRules()) {
    assert.deepEqual(plain([r.announcements.slamFailed.valid, r.announcements.slamFailed.base]), [true, 200], r.id);
    assert.ok(E.validAnnouncements(r).includes('slamFailed'), r.id);
  }
});

test('announced slam that fails goes through a game and its recalculation', () => {
  const { doc, game } = newGame();
  const a = E.addDeal(doc, game, input({ dealer: 'Ricou', contract: 'garde', pointDiff: 5 })).deal;
  E.addAnnouncement(doc, game, a.id, { type: 'slamFailed', beneficiary: 'Willy' });
  const { rows, totals } = E.recomputeGame(doc, game);
  assert.ok(rows.every((r) => r.balanced));
  assert.equal(totals.Willy, (25 + 5) * 2 * 2 - 400);
  assert.throws(() => E.addAnnouncement(doc, game, a.id, { type: 'slamFailed', beneficiary: 'Greg' }));
});

test('migrate completes old rule sets and refreshes unused presets', () => {
  const doc = plain(E.createDocument());
  // simulate a document written before the announcement existed, with an old FFT preset
  for (const r of doc.rules) delete r.announcements.slamFailed;
  doc.rules.find((r) => r.id === 'fft').roundTo = 10;
  const game = { id: 'g', date: '2026-01-01', rulesId: 'custom', state: 'archived', tableOrder: [], present: [], deals: [] };
  doc.games.push(game);
  const migrated = E.migrate(doc);
  const byId = (id) => migrated.rules.find((r) => r.id === id);
  assert.equal(byId('fft').roundTo, 1, 'unused preset refreshed');
  assert.equal(byId('custom').announcements.slamFailed.base, 200, 'used rule set completed, not replaced');
  assert.equal(byId('old-school').announcements.slamFailed.valid, true);
});
