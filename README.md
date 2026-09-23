# Emilio Immobilier — CRM de chasse immobilière

Outil web sur mesure pour Alexandre Rogelet, chasseur immobilier sur Paris et les Hauts-de-Seine.

Trois faces : le **CRM** (`/`, derrière un code d'accès), la **fiche publique d'un bien**
(`/bien/<id>`) et l'**espace acheteur** (`/espace/<token>`, sans compte — le lien fait
l'identification).

⚠️ Le lien de l'espace appartient au **client**, pas à la recherche : un client = un lien = une
application, quel que soit le nombre de recherches. Voir `AGENTS.md` §3.3.

## Les trois documents du dépôt

| Fichier | Ce qu'il contient | Quand le lire |
|---|---|---|
| **`AGENTS.md`** | Les règles de travail et les pièges du dépôt | **En premier, avant d'écrire une ligne** |
| **`context.md`** | Le produit, le modèle de données, les anomalies connues, l'historique | Quand il faut comprendre l'existant |
| `README.md` | Ce sommaire | Maintenant |

`CLAUDE.md` ne fait que pointer vers `AGENTS.md`.

## Stack

Next.js 16.2.3 + TypeScript · Supabase (base + Storage) · Mailjet · Claude API · Vercel.
Couleurs : marine `#1a2332`, or `#c9a84c`.

## Démarrer en local

```bash
npm install
npm run dev
```

Il faut les variables d'environnement listées dans `context.md` §1 : sans elles, le build compile
mais la collecte des pages échoue sur `supabaseUrl is required`.

## Migrations SQL

À passer dans Supabase → SQL Editor, dans cet ordre. Toutes relançables sans risque.

| Fichier | Ce qu'elle fait | État |
|---|---|---|
| `migration-notifications.sql` | `push_abonnements` | passée |
| `migration-bienvenue.sql` | `recherches.bienvenue_envoye_le` | passée |
| `migration-espace-client.sql` | `clients.token_espace` + reprise des liens existants | passée le 23/09 |

## Outils

```bash
# Détecte les espaces JSX que le compilateur de Next (SWC) supprime silencieusement.
# Voir AGENTS.md §2.1 — ce bug a produit « annoncesque », « 4 500€commission »
# et, le 23 septembre, « Vous en avez 2en cours » en production.
python3 outils/espaces-jsx.py $(find src -name '*.tsx' -o -name '*.ts')
```

Il dégrossit ; **c'est le code compilé qui tranche** (voir `AGENTS.md` §2.1).
