<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Emilio Immo — Chasse immobilière : règles de travail

`context.md` = l'histoire complète du projet (architecture, tables, sessions).
**Ce fichier-ci = ce qu'il faut savoir avant d'écrire une seule ligne.** Il est
court exprès. Le lire en entier prend deux minutes et fait gagner des heures.

---

## 1. Comment Alexandre travaille

- **Il colle les fichiers lui-même** dans l'interface web de GitHub.
  **Ne jamais pousser sur le dépôt.** Livrer le **fichier complet modifié**,
  jamais un diff, jamais un extrait, et dire où il va : `src/…/Fichier.tsx`.
- Un fichier livré est un fichier qui compile et qui a été **regardé à l'écran**
  (§3). Il déploie sur Vercel dans la foulée et teste en prod : une régression
  se paie comptant.
- Il parle en vocal, donc ses messages sont parfois décousus. Les relire en
  entier avant de répondre : il y a souvent trois demandes dans un paragraphe.
- Quand il dit « c'est moche » ou « je ne comprends pas », c'est un constat
  d'usage, pas un caprice. Chercher la cause réelle — il y a eu un vrai bug
  derrière chacune de ces phrases.

---

## 2. Les pièges de ce dépôt

Tous ont été rencontrés en vrai et ont coûté une livraison ratée.

### 2.1 L'espace perdu par SWC — le plus coûteux

Un nœud de texte JSX qui **commence par une espace** et **contient un retour à
la ligne** perd cette espace chez SWC (le compilateur de Next), alors
qu'esbuild la garde. Résultat : `annoncesque`, `déposéesici`, `un seulde` en
production — et rien du tout au banc d'essai.

```jsx
{/* ✗ CASSÉ en prod : le texte commence par " que" et va à la ligne */}
<span>Sur les <b>{n} annonces</b> que nous avons lues depuis
  l'ouverture de votre dossier…</span>

{/* ✓ Toujours juste, quel que soit le compilateur */}
<span>Sur les <b>{n} annonces</b>{' '}que nous avons lues depuis
  l'ouverture de votre dossier…</span>
```

**Règle : après une balise ou une expression, jamais d'espace littérale suivie
d'un passage à la ligne. Toujours `{' '}`.** Même chose pour l'espace *avant*
une balise inline en début de ligne.

Le détecteur est dans `outils/espaces-jsx.py` (§5). Le lancer après toute
retouche de texte, et **vérifier dans le code compilé**, pas au banc d'essai :

```bash
npx next build
grep -o '</b>.\{0,3\}[a-zà-ÿ]' .next/static/chunks/*.js | sort -u
```

Une balise fermante immédiatement suivie d'une lettre, sans `" "` entre les deux, est un mot collé.

### 2.2 `gap` dans un conteneur flex coupe les phrases

Dans un `display:flex`, **chaque nœud de texte devient un élément flex** et le
`gap` s'insère entre eux. Un `<b>` au milieu d'une phrase la fait exploser en
morceaux espacés.

```jsx
{/* ✗ */} <div className="puce"><Ico n="check"/>Nous cherchons <b>chaque jour</b> pour vous.</div>
{/* ✓ */} <div className="puce"><Ico n="check"/><span>Nous cherchons <b>chaque jour</b> pour vous.</span></div>
```

Et scoper les règles avec `>` (`.puces > span`), sinon elles descendent dans
les `<span>` internes.

### 2.3 `text-transform: capitalize` met une majuscule à chaque mot

« Mercredi 23 Septembre À 18 H 00 ». Utiliser JS :
`t.charAt(0).toUpperCase() + t.slice(1)`.

### 2.4 Un composant défini dans le rendu se remonte à chaque frappe

Un `function Champ()` déclaré à l'intérieur d'un autre composant est recréé à
chaque rendu : l'`<input>` perd le focus à chaque lettre. **Déclarer au niveau
du module** (voir `ChampNum` dans `EspaceClient.tsx`).

### 2.5 Centrage et bouton « ? »

Un « ? » posé à côté d'un chiffre centre la paire, pas le chiffre. Il doit être
`position:absolute; left:100%` dans un parent `position:relative;
display:inline-block` (classe `.nv`).

### 2.6 Next 16

`middleware.ts` s'appelle **`src/proxy.ts`** et exporte `proxy()`. Il protège
tout sauf `PUBLIC_PATHS = ['/login','/api/login']` et
`PUBLIC_PREFIXES = ['/bien/','/espace/','/api/espace/']`. Toute nouvelle route
publique doit être ajoutée là, sinon elle redirige vers `/login`.

---

## 3. Deux règles de données qui ne se voient pas

### 3.1 Tout se filtre sur `recherche_id`, jamais sur `client_id`

Depuis la V3.0, un bien, une visite, un envoi, une relance appartiennent à une **recherche**,
pas à un client. Un enregistrement inséré sans `recherche_id` existe en base et **n'apparaît
nulle part** : la fiche ne le charge jamais.

Et pour un bien, `etape` décide de l'onglet : `'selection'` ou `'presente'`. Sans valeur, il
n'est dans aucun des deux.

C'est ce qui a tué le bouton Emilio pendant quatre mois — il disait « enregistré », et le bien
n'existait nulle part à l'écran. Avant d'écrire un `insert` sur `biens`, `visites`, `envois`,
`relances` ou `transactions` : vérifier qu'il porte `recherche_id`.

⚠️ **Deux exceptions subies**, à connaître avant de « corriger » quoi que ce soit : le `journal`
est chargé sur `client_id` (et `addJournal()` n'écrit pas `recherche_id`), et les `relances` ne
sont filtrées sur `recherche_id` nulle part. Les deux erreurs se compensent : corriger l'une sans
l'autre fait disparaître l'historique du client. Voir `context.md` §6.17.

### 3.2 Une écriture Supabase dont l'erreur n'est pas remontée est un bug en attente

```ts
// ✗ Le mode par défaut de ce dépôt, et la cause de ses bugs les plus coûteux
await supabase.from('relances').insert({ … });

// ✓
const { error } = await supabase.from('relances').insert({ … });
if (error) { alert("La relance n'a pas pu être créée.\n\n" + error.message); return; }
```

Les relances n'ont jamais fonctionné pendant des semaines parce qu'un `insert` écrivait dans des
colonnes qui n'existaient pas, sans que personne ne voie rien. `context.md` §6.2 liste la
cinquantaine de points encore concernés. **Ne pas en ajouter.**

---

## 4. La barrière de qualité — obligatoire avant de livrer

```bash
npx tsc --noEmit          # doit être silencieux
npx next build            # doit atteindre « ✓ Compiled successfully »
                          #            puis « Finished TypeScript »
```

`Failed to collect page data … supabaseUrl is required` **est normal en local**
(pas de variables d'environnement) : Vercel les a. Ce n'est pas un échec.

**Et surtout : regarder le résultat.** Compiler ne prouve rien sur l'aspect.
Monter un banc d'essai (esbuild + Playwright headless), rendre le composant
avec des données factices, prendre une capture en **390 px et 1280 px**, et la
lire. Quatre bugs silencieux ont été trouvés comme ça, dont aucun n'avait été
signalé.

```bash
npx esbuild app.tsx --bundle --outfile=app.js --jsx=automatic \
  --loader:.tsx=tsx --loader:.css=local-css \
  --alias:react=./node_modules/react --alias:react-dom=./node_modules/react-dom \
  --alias:@=./src --define:process.env.NODE_ENV='"development"'
# Playwright : /opt/node-tools/… · Chromium : /opt/pw-browsers/chromium
```

⚠️ esbuild et SWC ne traitent pas les espaces JSX pareil (§2.1). Le banc
d'essai juge la mise en page, **pas** la ponctuation.

---

## 5. Règles d'écriture de l'espace acheteur

`/espace/[token]` est lu par le client, pas par Alexandre. Ce sont des règles
de fond, pas de style.

- **Aucun mot de métier.** Pas de « chasse », « chasseur », « veille »,
  « passage », « prospect », « lead ». Le client ne les comprend pas, et
  certains le placent du mauvais côté de la relation.
- **Jamais deux nombres qui peuvent se contredire sur la même page.** Un même
  fait = une seule source. Les « biens retenus » se comptent sur les biens
  réellement présents dans l'espace, pas sur un compteur interne qui dérive.
  Quand plusieurs chiffres se suivent, ils doivent **s'additionner**, quitte à
  en déduire un par soustraction.
- **Un même mot ne désigne pas deux choses.** « annonces lues » depuis
  l'ouverture et « annonces lues » de la dernière recherche : préciser sur
  chaque ligne, pas seulement dans le titre.
- **Tout chiffre qui n'est pas évident porte un « ? »** → `BtnAide` + une
  entrée dans `AIDES` → pop-up `Explication`. Y écrire ce que le chiffre **est**
  et ce qu'il **n'est pas**.
- **Aucun bloc vide sans explication.** Si un graphique n'a pas de données,
  dire pourquoi et quand il arrivera (`.vide-doux`).
- **Ne jamais laisser entendre que le marché lui donne tort** (comparaison de
  prix agressive, « vous payez 7 % au-dessus »). C'est contre-productif pour
  Alexandre. Les données de marché brutes ont leur place dans le CRM, pas dans
  l'espace client.
- **La note du chasseur est en lecture seule** côté client : c'est un message
  d'Alexandre, le client demande une modification, il ne l'écrit pas.

### Langage visuel

- **Marine `#1a2332` + or `#c9a84c` + blanc + gris.** Un seul accent par page :
  l'or souligne le chiffre qui compte, rien d'autre. Quatre cartes de quatre
  couleurs = arc-en-ciel (refusé une fois déjà).
- **Icônes dessinées, pas d'émoji**, dans les nouvelles interfaces : composant
  `Ico` + table `T` en haut de `EspaceClient.tsx`. Les émoji ne rendent pas
  pareil d'un téléphone à l'autre et font amateur. Exception : les émoji déjà
  en place dans « Mes derniers biens consultés », validés.
- Motif de carte réutilisable : `.gr-cadre` + `.gr-tete` + `.gr-note`, variante
  sobre `.c-net`, variantes colorées `.c-or/.c-bleu/.c-vert/.c-prune/.c-brique`
  **où la couleur porte un sens** (un avis client).
- Toujours vérifier en 390 px : c'est là qu'il regarde en premier.

---

## 6. Environnement de développement

- **Réseau sortant très limité** depuis le bac à sable : `supabase.co`,
  `data.gouv.fr`, `geo.api.gouv.fr`, `api.github.com` sont **injoignables**.
  `raw.githubusercontent.com` répond. Ne pas construire une solution qui
  suppose un accès direct à Supabase depuis ici.
- Donc : **impossible de lire la base**. Pour connaître un schéma, demander à
  Alexandre de lancer la requête SQL dans Supabase et de coller le résultat.
  Ne jamais deviner un nom de colonne — une table `relances` mal devinée a fait
  que **pas une seule relance n'a été créée pendant des semaines**, sans erreur
  visible.
- Toute écriture Supabase doit **remonter son erreur** (`if (error) { … }`),
  jamais un `catch` muet : c'est ce qui avait caché le bug ci-dessus.
- Migrations SQL : toujours `if not exists`, livrées en fichier séparé, et
  **dire explicitement à Alexandre qu'il doit les exécuter** dans Supabase.
  Dans l'éditeur SQL, la fenêtre « Unsaved changes » → « Discard changes ».

---

## 7. Outils

| Fichier | Rôle |
|---|---|
| `outils/espaces-jsx.py` | Détecte les espaces JSX mangées par SWC (§2.1) |

```bash
python3 outils/espaces-jsx.py $(find src -name '*.tsx' -o -name '*.ts')
```

⚠️ **Il ne sort jamais en code 0 sur ce dépôt** : quatre faux positifs connus subsistent
(`FicheClient.tsx:1498`, `ParcoursBien.tsx:295`, `send-mail/route.ts:244` et `:317` — des `>` de
comparaison et un attribut de balise). Il n'est donc pas branchable en pré-commit tel quel : on le
lit à l'œil, et on ne regarde que les lignes nouvelles. Mieux vaut ce bruit qu'un oubli.

---

## 8. Où regarder quand quelque chose ne marche pas

`context.md` §6 tient la liste des **anomalies connues et non corrigées**, classées par gravité.
Avant de conclure qu'un écran est cassé « sans raison », la regarder : le Dashboard affiche des
zéros codés en dur, la page Paramètres dit « Sauvegardé » sans rien vérifier, et la recherche
globale lit des colonnes mortes depuis la V3.0.
