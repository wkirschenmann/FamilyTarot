# FamilyTarot

Application web (PWA) de comptage des points de tarot, qui remplace le classeur Excel « Calcul Scores Tarot ».

- Site publié : https://wkirschenmann.github.io/FamilyTarot/
- Plan de réalisation : [docs/PLAN.md](docs/PLAN.md)

## Développement

Aucune compilation : le dossier `app/` est publié tel quel par GitHub Actions (tests puis déploiement, depuis `main` uniquement).

```sh
node --test                     # tests
python3 -m http.server -d app   # servir l'app en local sur http://localhost:8000
```

Aucune donnée de jeu (classeur, exports JSON) ne doit être commitée : le dépôt est public.

## Licence

Apache 2.0, voir [LICENSE](LICENSE).
