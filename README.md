# FamilyTarot

Web app (PWA) for scoring tarot games, replacing the "Calcul Scores Tarot" Excel workbook.

- Published site: https://wkirschenmann.github.io/FamilyTarot/
- Implementation plan: [docs/PLAN.md](docs/PLAN.md)

The repository (code, docs, commits, PRs) is in English; the app's user interface is in French.

## Structure

`app/index.html` is the whole application (HTML, CSS and JavaScript, no build step):

- `<script id="engine">`: the pure scoring engine (`globalThis.TarotEngine`), tested by `tests/` exactly as shipped;
- `<script id="vendor-preact">`: Preact + htm (MIT / Apache-2.0), copied unmodified;
- `<script id="app">`: IndexedDB storage and the screens (French UI).

`sw.js` and `manifest.webmanifest` must stay separate files for the offline install.

## Development

No compilation: the `app/` folder is published as is by GitHub Actions (tests, then deployment from `main` only).

```sh
node --test                     # run tests
python3 -m http.server -d app   # serve the app locally at http://localhost:8000
```

No game data (workbook, JSON exports) must ever be committed: the repository is public.

## License

Apache 2.0, see [LICENSE](LICENSE).
