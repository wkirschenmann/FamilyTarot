# Plan — Tarot scoring app (replacing the Excel workbook)

> Repository language: **English** (code, comments, docs, commits, PRs). The app's user interface stays in **French**, as required by the functional specifications.

## Context

The `FamilyTarot` repository started empty (LICENSE, README). Inputs provided:
- **Functional specifications** (scoring rules, Goulasch, passed deals, corrections, statistics, import, acceptance criteria).
- **Technical architecture**: static PWA on GitHub Pages, a single `tarot.json` data file, local IndexedDB first, then Google Drive sync, statistics computed in the browser.
- **`.xlsm` workbook + VBA export**: the source of the rules and of the 114 archived games.

What the workbook analysis confirmed:
- **128 sheets.**
  - `UTILITAIRES`: the 3 rule sets in B7:Q23. They hold the rounding (to 1, 5 or 10, on `pts`, `base` or `total`), the 2/3 split, then the contracts (valid, base, coefficient) and the announcements (valid, base, multiplied, shared, can-fail).
  - `PARTIE EN COURS`, 114 sheets dated `YYYY-MM-DD`, and `STATISTIQUES`, which carries the non-regression values for 75 games: 1744 contracts, of which 800 petites, 779 gardes, 23 gardes sans and 142 gardes contre.
- **Score sheet layout.**
  - Row 4: the rule set, in C4, or in B4 on older sheets.
  - Row 5: the number of players, in C5 or B5.
  - Row 6: headers.
  - Data starts at row 7:
    - B: deal number;
    - C: contract or announcement;
    - D: taker or announcer;
    - E: partner (a partner equal to the taker means a self-call);
    - F-G: dead players (`/` or empty);
    - H-J: calculation bases;
    - K: succeeded;
    - L: point difference;
    - M onward: per-player deal scores;
    - AB onward: running totals.
- **Volumes in the archives**: 1212 Petites, 1055 Gardes, 177 Gardes contre, 26 Gardes sans, 246 Misères, 244 Poignées, 51 Doubles, 2 Triples, 182 Petits au bout and 5 Chelems.
- **VBA rounding**: `Int(x / v + 1/2) * v`, i.e. round to nearest, halves up. Depending on the mode it applies to the point difference alone (`pts`), to B+E (`base`) or to (B+E)×C (`total`) (VBA l.1733-1739).
- **Split**: taker = D × Split × 3, partner = D × (1−Split) × 3. The VBA also offers a 1/2 split, which yields half-points.

## Technical choices ("simplest to maintain over time, no compilation")

- **Single-file application**: `app/index.html` holds all the HTML, CSS and JavaScript, with no build step. Only the files the browser requires to be separate sit next to it: `sw.js` (service worker, for offline use), `manifest.webmanifest` (installation) and the `icon.svg` icon.
- **Internal layout**: the file is organised in labelled `<script>` blocks.
  - `<script id="engine">` holds the pure calculation engine: rules, rounding, contracts, announcements, game, statistics and schema. It exposes `globalThis.TarotEngine` and uses neither the DOM nor any dependency.
  - `<script id="vendor-preact">` holds Preact + htm copied verbatim (about 5 KB, MIT licence kept in the header): components without JSX, without compilation and without a CDN, which is essential offline.
  - `<script type="module" id="app">` holds the IndexedDB storage, Drive and the screens.
- **Excel export**: the only exception to the single file. SheetJS (about 1 MB, Apache 2.0 licence) sits next to it in `app/xlsx.full.min.js` and is loaded only when "Export to Excel" is clicked, so the app stays light. CSV export is built into the main file.
- **Types**: JSDoc comments, for documentation and the editor. No TypeScript to compile.
- **Tests**: `node:test`, built into Node, with no dependency. A small test helper (`tests/load-engine.js`) reads `app/index.html`, extracts the `<script id="engine">` block and runs it in `node:vm`. Tests therefore cover the exact code that runs in the browser.
- **Workbook import script**: Node in JavaScript (rather than TypeScript, to stay compilation-free). It reuses **the same engine** as the app for the recalculation check, extracted from `index.html` the same way. Its only dependency, SheetJS (`xlsx`), is isolated in `tools/import/package.json` and never published.
- **Publication**: a GitHub Action runs the tests, then publishes `app/` to GitHub Pages with `upload-pages-artifact` and `deploy-pages`. There is no build: it is a plain copy.
- **Exact numbers**: scores are stored as **integers of points**, with no division anywhere in the calculation.
  - The split is expressed with integer multipliers: taker ×2, partner ×1, self-call ×4, opponent ×1.
  - The workbook's "2/3" therefore becomes `split: { taker: 2, partner: 1 }`.
  - The VBA's 1/2 split option, never used, is not carried over.
- **Licence**: Apache 2.0. The repository's `LICENSE` file already is; it will be mentioned in the README, and the Preact+htm block, MIT-licensed, keeps its header.
- **Language**: the repository (code, comments, identifiers, docs, commits, PRs) is in English. User-facing strings stay in French. Data keys in `tarot.json` are English; the examples below use English names.

## Status

- Iteration 1 (lot 0): done: PWA skeleton published on GitHub Pages.
- Iteration 2 (lots 1 + 2): done: engine (`<script id="engine">`), local UI, IndexedDB, JSON export/import. The engine was replayed against the 3 220 lines of the real workbook (kept out of the repository): 3 213 lines are reproduced exactly (44 of them with the pre-2016 rule set); the 7 others are known oddities of the old file (2 gardes with a gap of −25 on 2015-11-06, 5 petits au bout with an inverted sign) that the import will freeze as `historical`.
- Pousse: the FFT preset follows the official FFT rulebook ([Règlement FFT, donnes libres](https://fftarot.fr/assets/documents/ReglementFFT_DonnesLibres.pdf)), which has no Pousse (Prise ×1, Garde ×2, Garde sans ×4, Garde contre ×6; base 25) and no misère: both stay disabled in that preset. In the other presets the Pousse is disabled with coefficient 1 (the workbook had 1.5 in the custom set, which is not an integer).
- FFT preset, decided: no rounding (the rulebook does not round; the workbook preset rounded to 10 on the base, which the functional specifications still list, so that table is superseded).
- Announced slam that fails (new announcement "Chelem annoncé non réalisé", enabled in every rule set): the attacking side loses 200 per defender (taker 2/3 and partner 1/3, or the taker alone on a self-call), whatever the contract. Not multiplied by the contract, as in the FFT rulebook. Its beneficiary is the announcer, i.e. the taker or the partner.
- Slam inflicted by the defence on the taker (+200 per defender in the FFT rulebook): already handled by "Chelem non annoncé" with a defender as beneficiary; the announcement form says so.
- Half points (FFT rulebook): the assisted entry accepts points to the half point; the half point goes to the winning side (40.5 → failed by 1, 41.5 → made by 1 with 2 oudlers).
- The five worked examples of the FFT rulebook ("La marque en donnes libres") and the 3-player rule are pinned by tests. Audit of the rulebook's scoring: nothing else is missing (misère and Pousse do not exist in it).

- Dark mode: the interface follows the system / browser setting (`prefers-color-scheme`) with no manual switch: palette variables, `color-scheme` for native controls, highlight colours and the browser theme colour all have dark counterparts.

- Rules are configured when a game is created: the presets (FFT, old school, custom) are only default values to start from. The creation screen has a collapsible rules form (rounding, contracts, announcements, Goulasch amount) with a "start from the defaults of…" selector (the presets and the rules of the last game). The configured values are stored as a rule set: reused when identical to a stored one, otherwise added as a new one (named "<preset> (modifié)"), never edited in place. Invalid values (non-integers, no active contract) are refused.

- Workbook import (`tools/import/import-xlsm.js`, Node + SheetJS, never published; the workbook and its output stay out of the repository): every line is recomputed with the app's engine. On the real workbook: 115 games (114 archived + the one in progress), 21 players, 2 470 contracts in the archives (79,0 % succeeded) and 730 announcements; final totals identical to the workbook for every game; 10 lines out of about 3 200 are not reproduced (petit au bout with an inverted sign in 2014-2016, two gardes of 2015-11-06 with a gap of −25) and are kept as `historical` with their workbook scores. The file produced is about 1 MB. The workbook does not record dealers: imported deals have an unknown dealer (`null`), which the app tolerates (no dealer warning, "Donneur : inconnu"). The date of the game in progress is taken from the file name or `--current-date`.
- Statistics (`TarotEngine.computeStats`, "Statistiques" screen): per player and in total, over all games, a year or a date range; computed in about 6 ms on the 115 real games. `tools/import/verify-stats.js` compares them with the workbook's STATISTIQUES sheet on the 75 oldest games: 0 unexplained difference on 919 values (1 744 contracts: 800 petites, 779 gardes, 23 gardes sans, 142 gardes contre). Known differences come from the old sheet itself: its TOTAL of the average gap is the mean of the players' means, its announcement total leaves out the slams (and its per-game row is misaligned), and its per-player "donnes jouées" is lower than the deals the player was in by 28 deals in total (unexplained quirk). Definitions: a game counts for everyone seated at its table; "donnes jouées" = deals where the player is active or dead (passed deals excluded, Goulasch included); wins and last places only on archived games; self-call % = self-calls / the player's takes.

- Evolution chart (`TarotEngine.evolution`, SVG, one colour per seat, legend chips to hide a player) on every game screen.
- Exports: CSV (`;` separator, decimal comma, UTF-8 with BOM, for a French Excel) and Excel (`xlsx.full.min.js`, SheetJS Apache-2.0, loaded only on demand and kept in the offline cache) of a game (same layout as the old sheet: scores and running totals per player) and of the statistics (CSV: the ranking; Excel: ranking, takes, announcements, partners).

- Undo / redo and change log (spec §9, proposed features): every action on a game is written to `doc.log` (time, game, `by` reserved for the Google identity, one French sentence per change with before → after for modifications, built by `TarotEngine.describeChange`) and can be undone / redone (in memory, last 30 actions, cleared on reload or JSON import; the log itself is kept in the document). "Annuler", "Rétablir" and "Journal" buttons on the game in progress.

- JSON import is a merge (`TarotEngine.mergeDocument`): it adds the file's games, players (matched by first name) and rule sets (matched by values) to the local data and never deletes or changes what is already there; a game already present (same id) is left as it is, so importing the same file twice changes nothing; an incoming game in progress is archived if one is already in progress locally.

- Restore and reset (home screen, "Zone sensible"): "Restaurer une sauvegarde…" replaces ALL the data with an exported file, "Tout réinitialiser" erases them; both ask for a confirmation and keep the previous data once in IndexedDB (`safety`), so that "Revenir à l'état d'avant" takes the mistake back (a second restore / reset replaces that copy).

## Repository structure

```
app/
  index.html            # EVERYTHING: CSS + <script id="engine"> + <script id="vendor-preact"> + <script id="app">
  sw.js                 # service worker (must be separate)
  manifest.webmanifest  # PWA installation (must be separate)
  icon.svg
  xlsx.full.min.js      # SheetJS, loaded only for Excel export (iteration 6)
tests/
  load-engine.js        # extracts the engine from index.html
  *.test.js             # node --test
tools/import/           # import-xlsm.js + package.json (xlsx); output in data/ (gitignored)
.github/workflows/pages.yml   # tests then publication of app/; injects config into index.html from secrets
.gitignore              # *.xlsm, *.xlsx, data/, JSON exports
README.md
```

## Data model (`tarot.json`)

```js
{
  schemaVersion: 1, rev: 42, updatedAt,
  players: [{ id, firstName, googleSub? }],
  rules: [{ id, name, roundTo: 1|5|10, roundOn: 'pts'|'base'|'total', split: {taker:2, partner:1},
            contracts: { petite:{valid,base,coef}, pousse, garde, gardeSans, gardeContre,
                         goulasch:{valid, amount:40} },
            announcements: { petitAuBout:{valid,base,multiplied,shared,canFail}, handful,
                             doubleHandful, tripleHandful, misere, slamUnannounced, slamAnnounced } }],
  games: [{ id, date, rulesId, state:'in_progress'|'archived', scorer?, tableOrder:[playerId],
            playerEvents:[{afterDeal, active:[playerId]}],   // arrivals/departures
            deals: [{ id, number, dealer, type:'contract'|'goulasch'|'passed',
                      players:[ids], dead:[ids],
                      contract?, taker?, partner?, succeeded?, pointDiff?,
                      winner?, loser?,
                      announcements:[{ id, type, beneficiary, scores }],
                      scores:{playerId: integer}, historical?:true }] }]
}
```

- Identifiers are stable. The deal `number` is recomputed on every insertion or deletion.
- Announcements are nested in their deal: deleting a contract therefore also deletes its announcements.
- Stored scores feed the statistics. They can always be recomputed by `TarotEngine.recomputeGame()`, except for `historical: true` lines, whose original scores are frozen.

## Calculation engine (core, tested first)

- **`contractScores(rules, deal)`**:
  - D = (B + E) × C, rounded according to `roundOn`.
  - With 5 or more active players and a distinct partner: taker 2D, partner D, opponents −D, with sign s applied to all.
  - Self-call: taker 4D (the partner column is 0).
  - The calculation only uses integer additions and multiplications. Only the rounding divides, by 1, 5 or 10, and its result is always an integer.
  - With 4 or fewer active players: taker (n−1)D.
  - Dead players score 0.
- **Goulasch**: the winner receives +V, the loser −V, the others 0. No rounding.
- **`announcementScores(rules, deal, announcement)`**:
  - Base value: base × coef if the announcement is multiplied.
  - Individual announcement (misère): each of the active players pays, at most 4 payers.
  - Shared announcement: the beneficiary's side splits the gain according to the split, and each member of the opposing side pays the base.
  - Can-fail announcement: the sign follows the contract result for the beneficiary's side.
  - Petit au bout: the sign follows the beneficiary's side, independently of the contract.
- **`recomputeGame(game, rules)`**: recomputes all deals and running totals, then checks that each line sums to 0, with a per-line error flag.
- **Dealer and passed deals**:
  - `expectedDealer` rotates in table order among present players.
  - `insertPassesUntil(dealer)` loops over the table: 4 passed deals in the §3 example.
  - Goulasch disabled: choosing a dealer other than the expected one adds a passed deal for every skipped dealer (acceptance criterion 7).
  - Goulasch enabled: nobody skips a deal (everybody passing means a Goulasch is played), so no passed deal is ever added automatically. The scorer may still pick another dealer, but the app warns that a deal is missing or a player forgot to deal; the sheet marks the deal with ⚠ until the dealer is corrected or the missing deal is inserted.
  - The first deal of a game is free: no dealer is expected for it.
- **Input validation**:
  - The winner must differ from the loser, and a dead player is refused.
  - The point difference is an integer from 0 to 91.
  - The number of dead players must match the number of players.
  - The error message for the 2nd dead player is fixed.
- **Assisted entry** (option): the number of oudlers (bouts) and the points scored give "succeeded" and the difference, with thresholds 56, 51, 41 and 36.

## Interface (mobile first, in French)

1. **Home**: the game in progress and the history, most recent first, with date, players, number of deals and podium.
2. **New game**: the date, the rule set (copied into the game) and the ordered players, chosen from known players or created on the fly.
3. **Score sheet**:
   - a compact table (deal score and running total, dead and absent players greyed out, sum ≠ 0 indicator);
   - the Add, Insert after, Edit and Delete actions, on the deal or on the announcement;
   - the SVG chart of running totals;
   - "Player arrival/departure".
4. **Deal form**:
   - fields are presented as buttons or lists, in the §5 order, and adapt to the contract;
   - passed deals are inserted automatically;
   - changing the type deletes the announcements after confirmation.
5. **Announcement form**: the enabled type and the beneficiary, among active players only.
6. **Rules**: an editor for the game's rules, with the choice "following deals" or "full recalculation".
7. **Statistics**: a period filter, then the per-player tables of §10 (total and average per game, warning under 10 games), plus Goulasch statistics.
8. **Data**: export and import of the JSON file (manual backup before Drive).

**Persistence**:
- Each action is written to IndexedDB transactionally, before the display is updated.
- The app requests `navigator.storage.persist()`.
- The service worker caches the app shell (scope = Pages sub-folder, relative paths).

## Workbook import (`tools/import/import-xlsm.js`)

- **What is read**:
  - the rules from `UTILITAIRES`;
  - each dated sheet and `PARTIE EN COURS`, with the position of the rule set and of the player count (B or C).
- **Line-by-line mapping**:
  - a contract becomes a deal;
  - an announcement attaches to the deal with the same number;
  - active players are deduced from the scores and the dead players; departures are spotted from the hatched or empty columns;
  - a partner equal to the taker gives a self-call.
- **Historical rules**: until May 2016, the import uses the "Custom-2016" variant, where the petit au bout is worth a fixed 10. The exact switch date is detected from the data.
- **Recalculation check**:
  - for each line, the scores recomputed by the engine are compared with the workbook scores rounded to the integer, which removes floating-point residue such as 84.000000000000014;
  - the import produces a discrepancy report;
  - 4 of the known exceptions (2015-11-06 deals 29-30, 2016-11-25 deals 22 and 28) are marked `historical`, with their original scores frozen;
  - the misère of 2014-11-10 (deal 26, 4 active players, +40 and 3 × −13.33) is **corrected** by the normal calculation: +30 for the announcer, −10 for each of the 3 others. It is listed in the report as a deliberate correction, which changes that game's final total compared with the workbook.
- **Output**: `data/tarot.json` and `data/import-report.txt`, never committed. That file is then imported into the app via "Import JSON".

## Iteration 1, first step: "Hello world" on GitHub Pages

Goal: validate the publication chain right away, from the branch to `main`, then the Action and the live page.

Files to create on branch `ccr-352b2f30-paao2e`:
- `app/index.html`: a minimal page, with the publication version injected through a `__BUILD__` marker replaced by the workflow (proof that the injection works, ahead of the secrets).
- `.github/workflows/pages.yml`:
  - triggered on `push` of all branches and on `workflow_dispatch`;
  - `test` job: `node --test`;
  - `deploy` job, only if `github.ref == 'refs/heads/main'`: `actions/configure-pages`, replacement of `__BUILD__` with `sed`, then `actions/upload-pages-artifact` on `app/` and `actions/deploy-pages`;
  - permissions `pages: write`, `id-token: write`, environment `github-pages`.
- `.gitignore`: `*.xlsm`, `*.xlsx`, `data/`, `node_modules/`.

Then:
1. Commit and push to the branch.
2. Open a PR to `main`.
3. After the merge, check the page at `https://wkirschenmann.github.io/FamilyTarot/`.

## Proposed iterations

Each iteration ends with something you can try yourself, on your phone or computer. It is pushed to the branch with green tests in CI. We move on to the next one only after your feedback.

| It. | Lots | What you can try at the end | What I need from you |
|---|---|---|---|
| **1** | 0 | First the published "Hello world" (branch → `main` → Action → Pages chain validated), then the installable, offline PWA skeleton (`sw.js`, manifest, icon) | (Pages already set to "GitHub Actions" ✓) Merge the PR; install the app on Android and relaunch it in airplane mode |
| **2** | 1 + 2 | The calculation engine verified by tests (5 examples, Goulasch, passed deals), then a really playable evening locally: create a game, enter deals, correct, announcements, Goulasch, JSON backup/restore | Try it on a real or simulated game; feedback on entry ergonomics. In parallel, create the Google Cloud project with the guide provided |
| **3** | 3 | Drive sync: the scorer uploads, a second account reads, scorer change, conflict detected | Two Google accounts for testing; the GitHub secrets (`GOOGLE_CLIENT_ID`, `TAROT_DRIVE_FILE_ID`) |
| **4** | 4 | The 114 games and the game in progress in the app, via Drive; import discrepancy report | Run the import script on your machine with the workbook (or provide it in the session, without committing it), then validate the report |
| **5** | 5 | The Statistics screen and the evolution chart, with the non-regression figures reproduced | Compare with your memory and the old sheet |
| **6** | 6 | CSV and Excel exports, undo/redo, change log | Usage feedback |

**Going live**:
- I work on branch `ccr-352b2f30-paao2e`;
- the `github-pages` environment only accepts the main branch by default, so the workflow runs the tests on all branches but only publishes from `main`;
- at the end of an iteration, a pull request is opened, and merging it puts the app online.

The `tarot.json` format (`schemaVersion: 1`) is defined from iteration 1, then frozen at the end of iteration 3. Iterations 4 to 6 no longer change its structure, or go through an automatic migration (the engine's `migrate` function).

## Steps (lot details)

| Lot | Content | Validated by |
|---|---|---|
| 0 | Skeleton: `app/` offline installable PWA, Pages workflow, `.gitignore`, README | Hypothesis 10 (installation and airplane mode, Android and PC) |
| 1 | Calculation engine and tests | The 5 examples of §8, criteria 1, 2, 3 and 7 |
| 2 | v1 local UI: games, entry, announcements, corrections, passed deals, Goulasch, IndexedDB, JSON export/import | Criterion 6, real entry on a phone |
| 3 | Google Drive sync: file designated via GitHub secret, OAuth `drive.file`, Picker, `rev` counter, scorer lock; no dated copies: a single file on Drive, safety net = Drive version history (hypothesis 8) | Prior prototype of hypotheses 1-4, 6, 11 and 12 (Google Cloud project to be created by you) |
| 4 | Workbook import and recalculation report; `tarot.json` produced then placed on Drive as the shared reference file | Criterion 4 (114 totals, apart from the 4 exceptions and the 2014-11-10 correction) |
| 5 | Full statistics and chart | Criterion 5 (2470 contracts, 79.0% succeeded; non-regression on 75 games) |
| 6 | Comfort: **CSV and Excel (.xlsx)** export of a game and of the statistics, undo/redo, change log | Export opened in Excel and LibreOffice |

The `tarot.json` format is frozen at the end of lot 3 (Drive), so that the import (lot 4) directly produces the final file, with no conversion to redo. The Drive prototype (hypotheses 1-3 and 12) can start as soon as the Google Cloud project exists, in parallel with lot 2.

## Verification

- `node --test`:
  - the numerical examples of §8 and the Goulasch;
  - passed deals: with 5 players, 3rd expected and 2nd chosen, 4 passed deals are added;
  - dead players, self-call and announcements (5-player misère +40/−10, failed handful, petit au bout on the defence side);
  - rounding in its 3 modes, and a sum of 0 on every line.
- **Import**: `node tools/import/import-xlsm.js <workbook.xlsm>` must show 0 discrepancies apart from the 4 historical exceptions and the deliberate 2014-11-10 correction (misère +30/−10). The statistics report must give 2470 contracts and 79.0%, and reproduce the values of the STATISTIQUES sheet on the 75 oldest games.
- **App**:
  - serve `app/` locally and drive it with Playwright (preinstalled Chromium): create a game, enter the 5 examples, check the running totals, reload the page (persistence), go offline (service worker);
  - after publication, install the PWA on Android and relaunch it in airplane mode.
- **CI**: tests run on every push, and publication to Pages only happens if they are green.

## Google Drive file (lot 3)

- **Google Cloud project (chosen)**:
  - it is created with your current Google account, free of charge and without a credit card;
  - it carries the Drive API, the Picker API, the consent screen (`drive.file` scope only) and a "Web application" OAuth client ID, restricted to the GitHub Pages address;
  - I will provide a step-by-step guide (`docs/google-cloud.md`) at the start of lot 3.

- **Single file**: one and only one `tarot.json` file on Drive, created once then shared with edit rights with everyone concerned.
  - The app creates **no other file**: no dated copies and no sub-folder, unlike what the architecture document proposed.
  - The safety net is Drive's version history (hypothesis 8, to be checked on the prototype), plus the manual JSON export.
- **Link injection**: its link, or identifier, is stored in a **GitHub secret** (`TAROT_DRIVE_FILE_ID`). The OAuth client ID is there too (`GOOGLE_CLIENT_ID`). At deployment, the Pages workflow replaces markers (`__GOOGLE_CLIENT_ID__`, `__TAROT_DRIVE_FILE_ID__`) in the published copy of `index.html`; nothing is committed. There is still no compilation: it is a plain text replacement (`sed`).
- **Limit to be aware of**:
  - the Pages site is public, so the identifier will be readable in the published page;
  - the secret only avoids writing it in the repository; the real protection is the Drive sharing, since only invited accounts can open the file.
- **Point to check** (hypothesis 1): with the `drive.file` scope, knowing the identifier is not enough. Each player will probably have to designate the file once through the Google Picker, which the app will open directly on that file. If that is too constraining, a broader scope (`drive.readonly` or `drive`) will be needed, subject to Google verification.

## Points to settle later (not blocking for lots 0-3)

- Association between a Google account and a first name (lot 3).
- **Repository now public**, so GitHub Pages is usable for free.
  - `.gitignore` excludes `*.xlsm`, `*.xlsx`, `data/` and the JSON exports: no game data goes into the repository.
  - Tests only use the numerical examples of the specifications, which only contain first names. The specification and architecture files can be added to `docs/` if you wish.
