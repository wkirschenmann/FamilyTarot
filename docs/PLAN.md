# Plan — Application de scores de Tarot (remplacement du classeur Excel)

## Contexte

Le dépôt `FamilyTarot` est vide (LICENSE, README). Les entrées fournies sont :
- **Spécifications fonctionnelles** (règles de calcul, Goulasch, tours passés, corrections, statistiques, import, critères d'acceptation).
- **Architecture technique** : PWA statique sur GitHub Pages, un fichier `tarot.json` unique, d'abord IndexedDB local, puis synchronisation Google Drive (étape 4), statistiques calculées dans le navigateur.
- **Classeur `.xlsm` + export VBA** : la source des règles et des 114 parties archivées.

Ce que l'analyse du classeur a confirmé :
- **128 onglets.**
  - `UTILITAIRES` : les 3 jeux de règles en B7:Q23. On y trouve l'arrondi (à 1, 5 ou 10, sur `pts`, `base` ou `total`), le partage 2/3, puis les contrats (valide, base, coefficient) et les annonces (valide, base, multiplié, partagé, chutable).
  - `PARTIE EN COURS`, 114 onglets datés `AAAA-MM-JJ`, et `STATISTIQUES`, qui porte les valeurs de non-régression sur 75 parties : 1744 contrats, dont 800 petites, 779 gardes, 23 gardes sans et 142 gardes contre.
- **Disposition d'une feuille de score.**
  - Ligne 4 : le jeu de règles, en C4, ou en B4 sur les anciennes feuilles.
  - Ligne 5 : le nombre de joueurs, en C5 ou en B5.
  - Ligne 6 : les en-têtes.
  - Les données commencent ligne 7 :
    - B : n° de donne ;
    - C : contrat ou annonce ;
    - D : preneur ou annonceur ;
    - E : partenaire (un partenaire égal au preneur signale un auto-appel) ;
    - F-G : morts (`/` ou vide) ;
    - H-J : bases de calcul ;
    - K : réalisé ;
    - L : écart ;
    - M et suivantes : scores de la donne par joueur ;
    - AB et suivantes : cumuls.
- **Volumes dans les archives** : 1212 Petites, 1055 Gardes, 177 Gardes contre, 26 Gardes sans, 246 Misères, 244 Poignées, 51 Doubles, 2 Triples, 182 Petits au bout et 5 Chelems.
- **Arrondi VBA** : `Int(x / v + 1/2) * v`, soit l'arrondi au plus proche, demi vers le haut. Selon le mode, il porte sur l'écart seul (`pts`), sur B+E (`base`) ou sur (B+E)×C (`total`) (VBA l.1733-1739).
- **Partage** : preneur = D × Partage × 3, partenaire = D × (1−Partage) × 3. Le VBA propose aussi un partage 1/2, qui donne des demi-points.

## Choix techniques (« le plus simple à maintenir, sans compilation »)

- **Application en un seul fichier** : `app/index.html` contient tout le HTML, le CSS et le JavaScript, sans étape de build. À côté ne restent que les fichiers que le navigateur exige séparés : `sw.js` (service worker, pour le hors-ligne), `manifest.webmanifest` (installation) et l'icône `icon.svg`.
- **Découpage interne** : le fichier est organisé en blocs `<script>` balisés.
  - `<script id="engine">` contient le moteur de calcul pur : règles, arrondi, contrats, annonces, partie, statistiques et schéma. Il expose `globalThis.TarotEngine` et n'utilise ni DOM ni dépendance.
  - `<script id="vendor-preact">` contient Preact + htm recopiés tels quels (environ 5 Ko, licence MIT conservée en en-tête) : des composants sans JSX, sans compilation et sans CDN, ce qui est indispensable hors ligne.
  - `<script type="module" id="app">` contient le stockage IndexedDB, Drive et les écrans.
- **Export Excel** : seule exception au fichier unique. SheetJS (environ 1 Mo, licence Apache 2.0) est mis à côté dans `app/xlsx.full.min.js` et chargé uniquement au clic sur « Exporter en Excel », pour ne pas alourdir l'app. L'export CSV est intégré au fichier.
- **Types** : des commentaires JSDoc, pour la documentation et l'éditeur. Pas de TypeScript à compiler.
- **Tests** : `node:test`, intégré à Node, sans aucune dépendance. Un petit utilitaire de test (`tests/load-engine.js`) lit `app/index.html`, extrait le bloc `<script id="engine">` et l'exécute dans `node:vm`. Les tests portent ainsi sur le code exact qui tourne dans le navigateur.
- **Script d'import du classeur** : du Node en JavaScript (plutôt que du TypeScript, pour rester sans compilation). Il réutilise **le même moteur** que l'app pour le contrôle de recalcul, extrait de `index.html` de la même façon. Sa seule dépendance, SheetJS (`xlsx`), est isolée dans `tools/import/package.json` et n'est jamais publiée.
- **Publication** : une GitHub Action lance les tests, puis publie `app/` sur GitHub Pages avec `upload-pages-artifact` et `deploy-pages`. Il n'y a pas de build : c'est une simple copie.
- **Nombres exacts** : les scores sont stockés en **entiers de points**, sans aucune division dans le calcul.
  - Le partage est exprimé par des multiplicateurs entiers : preneur ×2, partenaire ×1, auto-appel ×4, adversaire ×1.
  - Le « 2/3 » du classeur devient donc `partage: { preneur: 2, partenaire: 1 }`.
  - L'option de partage 1/2 du VBA, jamais utilisée, n'est pas reprise.
- **Licence** : Apache 2.0. Le fichier `LICENSE` du dépôt l'est déjà ; elle sera mentionnée dans le README, et le bloc Preact+htm, sous licence MIT, gardera son en-tête.

## Structure du dépôt

```
app/
  index.html            # TOUT : CSS + <script id="engine"> + <script id="vendor-preact"> + <script id="app">
  sw.js                 # service worker (obligatoirement séparé)
  manifest.webmanifest  # installation PWA (obligatoirement séparé)
  icon.svg
  xlsx.full.min.js      # SheetJS, chargé seulement pour l'export Excel (itération 6)
tests/
  load-engine.js        # extrait le moteur de index.html
  *.test.js             # node --test
tools/import/           # import-xlsm.js + package.json (xlsx) ; sortie dans data/ (gitignoré)
.github/workflows/pages.yml   # tests puis publication de app/ ; écrit config dans index.html depuis les secrets
.gitignore              # *.xlsm, *.xlsx, data/, exports JSON
README.md
```

## Modèle de données (`tarot.json`)

```js
{
  schemaVersion: 1, rev: 42, updatedAt,
  joueurs: [{ id, prenom, googleSub? }],
  regles: [{ id, nom, arrondiA: 1|5|10, arrondiSur: 'pts'|'base'|'total', partage: {preneur:2, partenaire:1},
             contrats: { petite:{valide,base,coef}, pousse, garde, gardeSans, gardeContre,
                         goulasch:{valide, montant:40} },
             annonces: { petitAuBout:{valide,base,multiplie,partage,chutable}, poignee, doublePoignee,
                         triplePoignee, misere, chelemNonAnnonce, chelemAnnonce } }],
  parties: [{ id, date, reglesId, etat:'en_cours'|'archivee', scoreur?, ordreTable:[joueurId],
              evenementsJoueurs:[{apresDonne, actifs:[joueurId]}],   // arrivées/départs
              donnes: [{ id, numero, donneur, type:'contrat'|'goulasch'|'passe',
                         joueurs:[ids], morts:[ids],
                         contrat?, preneur?, partenaire?, realise?, ecart?,
                         gagnant?, perdant?,
                         annonces:[{ id, type, beneficiaire, scores }],
                         scores:{joueurId: entier}, historique?:true }] }]
}
```

- Les identifiants sont stables. Le `numero` est recalculé à chaque insertion ou suppression.
- Les annonces sont imbriquées dans leur donne : supprimer un contrat supprime donc aussi ses annonces.
- Les scores stockés servent aux statistiques. Ils sont toujours recalculables par `TarotEngine.recomputeGame()`, sauf pour les lignes `historique: true`, dont les scores d'origine sont figés.

## Moteur de calcul (cœur, testé en premier)

- **`contractScores(regles, donne)`** :
  - D = (B + E) × C, arrondi selon `arrondiSur`.
  - À 5 joueurs actifs ou plus, avec un partenaire distinct : preneur 2D, partenaire D, adversaires −D, le signe s étant appliqué à tous.
  - En auto-appel : preneur 4D.
  - Le calcul ne fait que des additions et des multiplications entières. Seul l'arrondi divise, par 1, 5 ou 10, et son résultat est toujours entier.
  - À 4 joueurs actifs ou moins : preneur (n−1)D.
  - Les morts marquent 0.
- **Goulasch** : le gagnant reçoit +V, le perdant −V, les autres 0. Aucun arrondi.
- **`announceScores(regles, donne, annonce)`** :
  - Valeur de base : base × coef si l'annonce est multipliée.
  - Annonce individuelle (misère) : chacun des actifs paie, 4 payeurs au plus.
  - Annonce partagée : le camp du bénéficiaire répartit le gain selon le partage, et chaque membre du camp adverse paie la base.
  - Annonce chutable : le signe suit le résultat du contrat pour le camp du bénéficiaire.
  - Petit au bout : le signe suit le camp du bénéficiaire, indépendamment du contrat.
- **`recomputeGame(partie, regles)`** : il recalcule toutes les donnes et les cumuls, puis contrôle que chaque ligne somme à 0, avec un indicateur d'erreur par ligne.
- **Donneur et tours passés** :
  - `expectedDealer` tourne dans l'ordre de la table parmi les joueurs présents.
  - `insertPassesUntil(dealer)` boucle sur la table : 4 tours passés dans l'exemple §3.
  - Le Goulasch remplace le tour passé quand il est actif.
- **Validation de saisie** :
  - Le gagnant doit différer du perdant, et un mort est refusé.
  - L'écart est un entier de 0 à 91.
  - Le nombre de morts doit correspondre au nombre de joueurs.
  - Le message d'erreur du 2e mort est corrigé.
- **Saisie assistée** (option) : les bouts et les points donnent « réalisé » et l'écart, avec les seuils 56, 51, 41 et 36.

## Interface (mobile d'abord, en français)

1. **Accueil** : la partie en cours et l'historique, du plus récent au plus ancien, avec la date, les joueurs, le nombre de donnes et le podium.
2. **Nouvelle partie** : la date, le jeu de règles (copié dans la partie) et les joueurs ordonnés, choisis parmi les joueurs connus ou créés à la volée.
3. **Feuille de score** :
   - un tableau compact (score de la donne et cumul, morts et absents grisés, indicateur de somme ≠ 0) ;
   - les actions Ajouter, Rajouter après, Modifier et Supprimer, sur la donne ou sur l'annonce ;
   - le graphique d'évolution des cumuls, en SVG ;
   - « Arrivée/départ de joueurs ».
4. **Formulaire de donne** :
   - les champs sont présentés en boutons ou en listes, dans l'ordre §5, et s'adaptent au contrat ;
   - les tours passés sont insérés automatiquement ;
   - changer de type supprime les annonces après confirmation.
5. **Formulaire d'annonce** : le type actif et le bénéficiaire, parmi les joueurs actifs uniquement.
6. **Règles** : un éditeur des règles de la partie, avec le choix « donnes suivantes » ou « recalcul complet ».
7. **Statistiques** : un filtre de période, puis les tableaux par joueur de la §10 (total et moyenne par partie, avertissement sous 10 parties), plus les statistiques Goulasch.
8. **Données** : l'export et l'import du fichier JSON (sauvegarde manuelle avant Drive).

**Persistance** :
- Chaque action est écrite dans IndexedDB de façon transactionnelle, avant toute mise à jour de l'affichage.
- L'app demande `navigator.storage.persist()`.
- Le service worker met en cache l'app shell (portée = sous-dossier Pages, chemins relatifs).

## Import du classeur (`tools/import/import-xlsm.js`)

- **Ce qui est lu** :
  - les règles de `UTILITAIRES` ;
  - chaque onglet daté et `PARTIE EN COURS`, avec la position du jeu de règles et du nombre de joueurs (B ou C).
- **Correspondance ligne par ligne** :
  - un contrat devient une donne ;
  - une annonce s'attache à la donne de même n° ;
  - les joueurs actifs se déduisent des scores et des morts ; les départs se repèrent aux colonnes hachurées ou vides ;
  - un partenaire égal au preneur donne un auto-appel.
- **Règles historiques** : jusqu'en mai 2016, l'import utilise la variante « Personnalisé-2016 », où le petit au bout vaut 10 fixes. La date exacte de bascule se détecte sur les données.
- **Contrôle de recalcul** :
  - pour chaque ligne, les scores recalculés par le moteur sont comparés aux scores du classeur arrondis à l'entier, ce qui élimine les résidus flottants du type 84.000000000000014 ;
  - l'import produit un rapport des écarts ;
  - 4 des exceptions connues (2015-11-06 donnes 29-30, 2016-11-25 donnes 22 et 28) sont marquées `historique`, avec leurs scores d'origine figés ;
  - la misère du 2014-11-10 (donne 26, 4 joueurs actifs, +40 et 3 × −13,33) est **corrigée** par le calcul normal : +30 pour l'annonceur, −10 pour chacun des 3 autres. Elle est listée dans le rapport comme correction volontaire, ce qui fait évoluer le total final de cette partie par rapport au classeur.
- **Sortie** : `data/tarot.json` et `data/rapport-import.txt`, jamais commités. Ce fichier s'importe ensuite dans l'app par « Importer JSON ».

## Itération 1, première étape : « Hello world » sur GitHub Pages

But : valider tout de suite la chaîne de publication, de la branche à `main`, puis l'Action et la page en ligne.

Fichiers à créer sur la branche `ccr-352b2f30-paao2e` :
- `app/index.html` : une page minimale en français, « Tarot — Hello world », avec la date de publication injectée et un test de la variable `__BUILD__` remplacée par le workflow (preuve que l'injection marche, en vue des secrets).
- `.github/workflows/pages.yml` :
  - déclenché sur `push` de toutes les branches et sur `workflow_dispatch` ;
  - job `test` : `node --test` (aucun test au début, donc la commande passe) ;
  - job `deploy`, uniquement si `github.ref == 'refs/heads/main'` : `actions/configure-pages`, remplacement de `__BUILD__` par `sed`, puis `actions/upload-pages-artifact` sur `app/` et `actions/deploy-pages` ;
  - permissions `pages: write`, `id-token: write`, environnement `github-pages`.
- `.gitignore` : `*.xlsm`, `*.xlsx`, `data/`, `node_modules/`.

Ensuite :
1. Commit et push sur la branche.
2. Proposer une PR vers `main`, que je crée si tu le confirmes.
3. Après fusion, vérifier la page sur `https://wkirschenmann.github.io/FamilyTarot/`.

## Itérations proposées

Chaque itération se termine par quelque chose que tu peux essayer toi-même, sur ton téléphone ou ton ordinateur. Elle est poussée sur la branche, avec des tests verts en CI. On ne passe à la suivante qu'après ton retour.

| It. | Lots | Ce que tu peux essayer à la fin | Ce dont j'ai besoin de toi |
|---|---|---|---|
| **1** | 0 | D'abord le « Hello world » publié (chaîne branche → `main` → Action → Pages validée), puis le squelette PWA installable et hors ligne (`sw.js`, manifeste, icône) | (Pages déjà configuré sur « GitHub Actions » ✓) Fusionner la PR ; installer l'app sur Android et la relancer en mode avion |
| **2** | 1 + 2 | Le moteur de calcul vérifié par tests (5 exemples, Goulasch, tours passés), puis une vraie soirée jouable en local : créer une partie, saisir, corriger, annonces, Goulasch, sauvegarde/restauration du JSON | Tester sur une partie réelle ou simulée ; retours sur l'ergonomie de saisie. En parallèle, créer le projet Google Cloud avec le guide fourni |
| **3** | 3 | Synchronisation Drive : le scoreur envoie, un second compte lit, changement de scoreur, conflit détecté | Deux comptes Google pour le test ; les secrets GitHub (`GOOGLE_CLIENT_ID`, `TAROT_DRIVE_FILE_ID`) |
| **4** | 4 | Les 114 parties et la partie en cours dans l'app, via Drive ; rapport d'écarts de l'import | Lancer le script d'import sur ton poste avec le classeur (ou me le fournir dans la session, sans commit), puis valider le rapport |
| **5** | 5 | L'écran Statistiques et le graphique d'évolution, avec les chiffres de non-régression retrouvés | Comparer avec tes souvenirs et l'ancien onglet |
| **6** | 6 | Exports CSV et Excel, annuler/rétablir, journal des modifications | Retours d'usage |

**Mise en ligne** :
- je travaille sur la branche `ccr-352b2f30-paao2e` ;
- l'environnement `github-pages` n'accepte par défaut que la branche principale, donc le workflow lance les tests sur toutes les branches mais ne publie que depuis `main` ;
- en fin d'itération, je te propose une pull request, et sa fusion met l'app en ligne.

Le format `tarot.json` (`schemaVersion: 1`) est défini dès l'itération 1, puis figé à la fin de l'itération 3. Les itérations 4 à 6 n'en changent plus la structure, ou passent par une migration automatique (fonction `migrate` du moteur).

## Étapes (détail des lots)

| Lot | Contenu | Validé par |
|---|---|---|
| 0 | Squelette : `app/` PWA installable et hors ligne, workflow Pages, `.gitignore`, README | Hypothèse 10 (installation et mode avion, Android et PC) |
| 1 | Moteur de calcul et tests | Les 5 exemples §8, critères 1, 2, 3 et 7 |
| 2 | v1 UI locale : parties, saisie, annonces, corrections, tours passés, Goulasch, IndexedDB, export/import JSON | Critère 6, saisie réelle sur téléphone |
| 3 | Synchronisation Google Drive : fichier désigné par secret GitHub, OAuth `drive.file`, Picker, compteur `rev`, verrou par scoreur ; aucune copie datée : un seul fichier sur Drive, filet de sécurité = historique des versions de Drive (hypothèse 8) | Prototype préalable des hypothèses 1-4, 6, 11 et 12 (projet Google Cloud à créer par toi) |
| 4 | Import du classeur et rapport de recalcul ; `tarot.json` produit puis déposé sur Drive comme fichier partagé de référence | Critère 4 (114 totaux, hors les 4 exceptions et la correction du 2014-11-10) |
| 5 | Statistiques complètes et graphique | Critère 5 (2470 contrats, 79,0 % réalisés ; non-régression sur 75 parties) |
| 6 | Confort : export **CSV et Excel (.xlsx)** d'une partie et des statistiques, annuler/rétablir, journal des modifications | Export ouvert dans Excel et LibreOffice |

Le format `tarot.json` est figé à la fin du lot 3 (Drive), pour que l'import (lot 4) produise directement le fichier définitif, sans conversion à refaire. Le prototype Drive (hypothèses 1-3 et 12) peut démarrer dès que le projet Google Cloud existe, en parallèle du lot 2.

## Vérification

- `node --test` :
  - les exemples chiffrés §8 et le Goulasch ;
  - les tours passés : à 5 joueurs, avec 3e attendu et 2e choisi, 4 tours sont ajoutés ;
  - les morts, l'auto-appel et les annonces (misère 5 joueurs +40/−10, poignée chutée, petit au bout côté défense) ;
  - l'arrondi dans ses 3 modes, et la somme à 0 sur chaque ligne.
- **Import** : `node tools/import/import-xlsm.js <classeur.xlsm>` doit afficher 0 écart hors des 4 exceptions historiques et de la correction volontaire du 2014-11-10 (misère +30/−10). Le rapport de statistiques doit donner 2470 contrats et 79,0 %, et retrouver les valeurs de l'onglet STATISTIQUES sur les 75 plus anciennes parties.
- **App** :
  - servir `app/` en local et la piloter avec Playwright (Chromium préinstallé) : créer une partie, saisir les 5 exemples, vérifier les cumuls, recharger la page (persistance), passer hors ligne (service worker) ;
  - après publication, installer la PWA sur Android et la relancer en mode avion.
- **CI** : les tests sont lancés à chaque push, et la publication sur Pages n'a lieu que s'ils sont verts.

## Fichier Google Drive (lot 3)

- **Projet Google Cloud (retenu)** :
  - il est créé avec ton compte Google actuel, gratuitement et sans carte bancaire ;
  - il porte l'API Drive, l'API Picker, l'écran de consentement (droit `drive.file` seul) et un identifiant client OAuth « application Web », limité à l'adresse GitHub Pages ;
  - je fournirai un guide pas à pas (`docs/google-cloud.md`) au début du lot 3.

- **Fichier unique** : un seul et unique fichier `tarot.json` sur Drive, créé une fois puis partagé en modification avec toutes les personnes concernées.
  - L'app ne crée **aucun autre fichier** : pas de copies datées ni de sous-dossier, contrairement à ce que proposait le document d'architecture.
  - Le filet de sécurité est l'historique des versions de Drive (hypothèse 8, à vérifier au prototype), plus l'export manuel du JSON.
- **Injection du lien** : son lien, ou son identifiant, est stocké dans un **secret GitHub** (`TAROT_DRIVE_FILE_ID`). L'identifiant client OAuth y est aussi (`GOOGLE_CLIENT_ID`). Au déploiement, le workflow Pages remplace des marqueurs (`__GOOGLE_CLIENT_ID__`, `__TAROT_DRIVE_FILE_ID__`) dans la copie publiée de `index.html` ; rien n'est commité. Il n'y a toujours aucune compilation : c'est un simple remplacement de texte (`sed`).
- **Limite à connaître** :
  - le site Pages est public, donc l'identifiant sera lisible dans la page publiée ;
  - le secret évite seulement de l'écrire dans le dépôt ; la vraie protection est le partage Drive, puisque seuls les comptes invités peuvent ouvrir le fichier.
- **Point à vérifier** (hypothèse 1) : avec le droit `drive.file`, connaître l'identifiant ne suffit pas. Chaque joueur devra sans doute désigner le fichier une fois via le Google Picker, que l'app ouvrira directement sur ce fichier. Si c'est trop contraignant, il faudra un droit plus large (`drive.readonly` ou `drive`), soumis à validation Google.

## Points à trancher plus tard (non bloquants pour les lots 0-3)

- Association compte Google ↔ prénom (lot 3).
- **Dépôt désormais public**, donc GitHub Pages est utilisable gratuitement.
  - Le `.gitignore` exclut `*.xlsm`, `*.xlsx`, `data/` et les exports JSON : aucune donnée de jeu ne va dans le dépôt.
  - Les tests utilisent uniquement les exemples chiffrés des spécifications, qui ne contiennent que des prénoms. Les fichiers de spécification et d'architecture peuvent être ajoutés dans `docs/` si tu le souhaites.
