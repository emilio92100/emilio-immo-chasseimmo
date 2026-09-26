# CONTEXTE — Emilio Immo, CRM de chasse immobilière

**Version 3.6 · 23 septembre 2026**

Ce fichier décrit **ce qui existe**, pas ce qu'on aimerait construire.
Les règles de travail (comment livrer, quels pièges éviter) sont dans **`AGENTS.md`** — à lire en premier.

---

## 0. En deux minutes

Alexandre Rogelet dirige **Emilio Immobilier**, agence indépendante sur Paris et les Hauts-de-Seine
(carte professionnelle CPI 9201 2020 000 045 344). Il fait de la vente classique et de la
**chasse immobilière** : un acquéreur lui confie une recherche, il écume le marché pour lui.

Ce dépôt est le CRM sur mesure qui remplace Immofacile — sauf pour la diffusion portails, qui reste
sur Immofacile faute de partenariats techniques reproductibles.

L'outil a **trois faces** :

| Face | Adresse | Qui la voit |
|---|---|---|
| Le CRM | `/` — derrière un code d'accès | Alexandre seul |
| La fiche d'un bien | `/bien/<id>` — publique | Toute personne ayant le lien |
| L'espace acheteur | `/espace/<token>` — publique | Le client, via son lien privé |

Ce dépôt n'a **aucun rapport** avec Verimo (SaaS d'analyse de documents) ni avec les comptes
Tonton Immo / Emilio Immo (réseaux sociaux).

---

## 1. Stack et accès

| Service | Usage |
|---|---|
| Next.js **16.2.3** + TypeScript | Framework |
| Vercel | Hébergement · https://emilio-immo-chasseimmo.vercel.app |
| Supabase | Base de données + Storage · projet `eutxmrdcykztjdyydmuo` |
| GitHub | `emilio92100/emilio-immo-chasseimmo` |
| Claude API | Extraction d'annonces + reformulation |
| Mailjet | Email transactionnel |
| geo.api.gouv.fr · api-adresse.data.gouv.fr | Autocomplétion communes et adresses |

**Polices** : Plus Jakarta Sans (titres) · DM Sans (corps), toutes deux importées dans
`src/styles/globals.css`. ⚠️ La fiche bien publique déclare `Inter` dans sa pile de polices mais
**ne la charge nulle part** : en pratique elle s'affiche dans la police système.
Elle tire par ailleurs les icônes Tabler d'un CDN tiers (`cdn.jsdelivr.net`, version `@latest`
non épinglée) — sur une page vue par les clients.
**Storage** : un seul bucket, `photos-biens` (public). Les PDF y sont aussi déposés, sous le préfixe
`pdf/` — le nom du bucket est donc trompeur.

**Variables d'environnement Vercel** : `NEXT_PUBLIC_SUPABASE_URL` · `NEXT_PUBLIC_SUPABASE_ANON_KEY` ·
`SUPABASE_SERVICE_ROLE_KEY` · `ANTHROPIC_API_KEY` · `MAILJET_API_KEY` · `MAILJET_API_SECRET` ·
`MAILJET_FROM_EMAIL` · `MAILJET_FROM_NAME` · `NEXT_PUBLIC_SITE_URL` · `EMILIO_ACCESS_CODE`.

### Le portail d'accès — `src/proxy.ts`

Next 16 a renommé `middleware.ts` en **`proxy.ts`**, placé dans `src/` au même niveau que `app/`,
et l'export s'appelle `proxy()`. Tout est derrière un code d'accès unique (cookie `emilio_acces`,
haché en SHA-256, code dans `EMILIO_ACCESS_CODE`), **sauf** :

- `PUBLIC_PATHS = ['/login', '/api/login']`
- `PUBLIC_PREFIXES = ['/bien/', '/espace/', '/api/espace/']`

⚠️ **Toute nouvelle route publique doit être ajoutée là**, sinon elle redirige vers `/login`.

### Couleurs

Marine `#1a2332` · Or `#c9a84c` · Fond `#f8fafc` · Fiche bien publique sur crème `#f3eee3`.
Un seul accent par écran : l'or souligne ce qui compte, rien d'autre.

---

## 2. Modèle de données

Les colonnes listées sont celles **réellement lues ou écrites par le code**
(vérifié fichier par fichier, septembre 2026).

### L'architecture, en une phrase

**`Client → Recherche(s) → biens`.** Un client peut mener plusieurs recherches en parallèle
(résidence principale + investissement, par exemple), chacune avec ses propres critères, biens,
visites, envois et transaction.

**Mais l'espace acheteur, lui, appartient au client** (23 septembre) : un seul lien, une seule
application sur son téléphone, et un sélecteur en haut de l'écran pour passer d'une recherche à
l'autre. Voir §3 et `src/lib/espace.ts`.

```
Client (identité, contact, statut, chaleur, propriétaire/locataire)
   ├── Recherche 1 « RP Boulogne »   (budget, secteurs, critères, mandat, token d'espace…)
   │      └── biens · visites · envois · relances · transaction
   └── Recherche 2 « Invest Lyon »
          └── ses propres biens, visites, envois…
```

**Règle de décision** : critères communs quel que soit le type de bien → **une seule recherche**,
plusieurs types cochés. Critères différents selon le type (jardin pour la maison, balcon pour
l'appartement) → **deux recherches**. Le formulaire de création rappelle cette règle quand plus
d'un type est coché.

⚠️ **Biens, visites, transactions et envois se filtrent sur `recherche_id`.** Un de ces
enregistrements inséré sans `recherche_id` existe en base et n'apparaît nulle part — c'est le bug
qui a tué le bouton Emilio pendant quatre mois.

**Deux exceptions, subies et non voulues** : l'onglet Suivi charge le `journal` sur `client_id`
(il mélange donc les recherches d'un même client), et les `relances` ne sont filtrées sur
`recherche_id` nulle part — la colonne est écrite et jamais lue. Voir §6.17, où les deux se
compensent.

### `clients`

Identité et contact : `reference`, `prenom`, `nom`, `adresse`, `emails[]`, `telephones[]`,
`statut`, `chaleur`, `notes`, `est_vendeur`.
**`token_espace`** — le lien permanent de son espace acheteur, posé à la création du client
(`Clients.tsx`), rattrapé à l'ouverture de la fiche s'il manque (`FicheClient.tsx`). Index unique
partiel. C'est **ce** jeton qu'on envoie, jamais celui d'une recherche — voir §2 `recherches` et
`AGENTS.md` §3.3.
Occupation : `statut_occupation` (proprietaire / locataire / heberge / autre) et, si propriétaire,
`bien_actuel_type`, `bien_actuel_surface`, `bien_actuel_valeur`, `bien_actuel_adresse`,
`bien_actuel_a_vendre` (= **mandat de vente potentiel**), `bien_actuel_notes`.

⚠️ **Colonnes de critères mortes.** `type_bien`, `budget_min`, `budget_max`, `secteurs`,
`surface_*`, `chambres_min`, `parking`, `cave`, `mandat_*` et consorts existent encore sur
`clients` mais **ne sont plus écrites depuis la V3.0** — la source de vérité est `recherches`.
`Clients.tsx` compense en fusionnant en mémoire ; `Topbar.tsx` non, et affiche donc des critères
périmés dans la recherche globale (voir §6).

### `recherches` — le pivot

- Identité : `id`, `client_id` (FK, CASCADE), `nom`, `active`
- Bien : `type_bien` (multi, joint par virgule), `budget_min/max`, `surface_min/max`,
  `surface_sejour_min`, `nb_pieces_min/max`, `chambres_min`, `secteurs` (text[])
- Fins : `etage_min/max`, `etage_max_sans_ascenseur`, `rdc_exclu`, `dernier_etage`, `dpe_max`,
  `annee_construction_min`, `etat_souhaite`, `exposition_souhaitee`, `cuisine_type`,
  `exterieur_surface_min`
- Équipements booléens : `parking`, `cave`, `balcon`, `terrasse`, `jardin`, `ascenseur`,
  `gardien`, `interphone`, `digicode`
- **`exigences`** (jsonb) : le niveau de chaque équipement —
  `{ parking: 'indispensable', terrasse: 'souhaite' }`. Les booléens ci-dessus en sont dérivés.
- Transports : `transport_minutes`, `transport_lignes` (text[]),
  `transport_arrets` (jsonb : `{nom, ville, lignes[], minutes}`)
- Profil d'achat : `urgence`, `financement`, `apport`
- Mandat : `sans_mandat`, `mandat_date_signature`, `mandat_duree`, `mandat_honoraires`,
  `mandat_date_expiration`
- Espace acheteur : **`token_espace`** (l'adresse **interne** de la recherche — voir ci-dessous),
  `espace_actif`, `espace_ouvert_le`, `historique_vu_le`
- **`bienvenue_envoye_le`** — posé par `/api/send-mail` après l'accusé de Mailjet. C'est lui qui
  grise le bouton : le mail de mise en route ne part qu'une fois par recherche.
- `notes` (= « Précisions sur la recherche »), `created_at`, `updated_at`

⚠️ **`token_espace` n'est plus le lien du client.** Depuis le 23 septembre, le lien est sur
`clients.token_espace`. Celui-ci reste écrit à la création d'une recherche et garde deux rôles :
les routes `/api/espace/` s'en servent pour identifier la recherche dont parle l'espace, et les
liens envoyés avant la bascule continuent d'ouvrir le bon dossier (`page.tsx` les redirige vers le
lien permanent). Deux générations de format cohabitent : 64 caractères pour les anciens,
`dupont-k3n8vq2fab` pour les nouveaux — `src/lib/jeton.ts` choisit l'adresse en conséquence.

### `biens`

Un bien appartient à une recherche et traverse des **étapes** :

| `etape` | Signification | Où il s'affiche |
|---|---|---|
| `selection` | Retenu, pas encore envoyé | Onglet Sélection |
| `presente` | Déposé dans l'espace du client | Onglet Présentés + espace acheteur |

`badge_retour` porte la réponse du client :
`propose` → `interesse` · `souhaite_visiter` · `visite` · `offre_faite` · `refuse`.

Suivi de lecture : `envoye_le`, `vu_le` (première ouverture seulement), `nb_vues`,
`retour_client` (son commentaire), `retour_le`.
Descriptif : titre, ville, CP, quartier, adresse, surfaces, pièces, chambres, étage, exposition,
DPE/GES avec conso et émissions, chauffage, équipements booléens, charges, taxe foncière,
prix vendeur / commission / prix acquéreur, photos, plans (`plans`, rangés à part des photos),
agence source.
Marché (rempli par la veille) : `date_publication`, `prix_initial`, `nb_baisses`, `nb_agences`,
`historique_prix`, `date_derniere_baisse`, `score`, `points_forts`, `points_attention`.
PDF : `pdf_statut`, `pdf_demande_le`, `pdf_pret_le`, `pdf_url`, `pdf_message`.
Divers : `url` (clé de tous les contrôles de doublon), `canal_envoi`, `source_portail`,
`est_particulier`, `adresse_probable`, `situation`, `nb_lots`, `nb_parking`, `surface_exterieur`.

### `veille_propositions` — les annonces en attente de tri

`client_id`, `recherche_id`, `url`, `portail`, `statut` (`nouveau` / `retenu` / `ecarte`),
`motif_ecart`, `decide_le`, `bien_id` (rempli quand on retient), plus tout le descriptif de
l'annonce et les infos de marché.
« Retenir » crée le bien (ou retrouve celui qui a la même URL) et passe la proposition à `retenu`.
Tout le descriptif suit le bien, charges, taxe foncière et plans compris (depuis le 24 septembre
2026 ; avant, les charges et la taxe foncière se perdaient à ce moment-là).

### `veille_passages` — le compteur de travail

Une ligne par tour de veille : `recherche_id`, `demarre_le`, `termine_le`, `nb_lues`,
`nb_proposees`, `nb_ecartees`, `statut`, `message`.
C'est la source des chiffres « annonces lues » de l'espace acheteur.

⚠️ **Deux sortes d'écarts, à ne pas confondre.** Quand Alexandre écarte une proposition à la main
dans l'onglet Veille, le motif est conservé (`veille_propositions.motif_ecart`), réaffiché, et
renvoyé à la veille suivante pour qu'elle en tienne compte. En revanche, **les annonces écartées
automatiquement ne sont que comptées** (`nb_ecartees`) : celles-là n'existent nulle part
individuellement. C'est pourquoi l'espace acheteur ne peut pas dire *pourquoi* telle annonce a été
écartée — il ne peut que dire combien.

### `espace_evenements` — ce que le client fait chez lui

`recherche_id`, `client_id`, `bien_id`, `type` (`ouverture`, `fiche`, `avis`, `criteres`,
`message`, `partage`), `detail`, `created_at`.
Les ouvertures sont limitées à une écriture par demi-heure pour ne pas gonfler la table.

### Les autres

- **`visites`** : `recherche_id`, `bien_id`, `statut` (`a_venir` / `effectuee` / `annulee`),
  `date_visite`, `heure`, `contact_agence`, `commentaire`, `note_etoiles`, `avis_client`
  - **L'issue** (`outils/sql/visites-issue.sql`, voir `src/lib/visites.ts`) : `issue`
    (`offre` · `revoir` · `reflexion` · `non`), `issue_par` (`client` · `conseiller`), `issue_le`,
    `motifs[]`, `aime[]`, `mot_client`, `avis_client_le`, `prix_envisage`, `retenir`.
    Le client la donne depuis son espace (`POST /api/espace/visite`, une seule fois),
    Alexandre dans le compte rendu (`CompteRenduVisite`, commun à la fiche et à la page Visites).
    `avis_client` reste rempli (`AVIS_HERITE`) ; les anciennes visites en déduisent leur issue (`issueDe`).
  - `recherches.appris_masques[]` : les lignes de « Ce que ses visites ont appris » retirées par
    Alexandre. La synthèse part aussi à la veille (`veilleLire` → `appris_visites`).
- **`journal`** : le fil de suivi — `client_id`, `recherche_id`, `bien_id`, `type`, `titre`,
  `description`, `metadata`
- **`envois`** : `type` (`mail_libre` · `envoi_bien` · `selection_biens` · `compte_rendu_visite`),
  `objet`, `corps`, `destinataires`, `biens_ids`, `sms_envoye`
- **`relances`** : `type`, `statut`, **`date_echeance`**, **`note`**
  ⚠️ Le type déclare `en_attente | cloturee | **reportee**`, mais `reportee` n'est **jamais écrite**
  et aucun écran ne la lit : le bouton « Reporter » ne déplace que `date_echeance`. Qui se fierait
  au type et écrirait `reportee` ferait disparaître la relance de toutes les listes.
  ⚠️ Les noms de colonnes sont `date_echeance` et `note`, **pas** `date_relance` ni `motif`, et
  les lecteurs filtrent sur `statut = 'en_attente'`. Une erreur ici ne se voit pas : la relance
  n'est simplement jamais créée.
- **`transactions`** : 5 étapes, offre, contre-offres, compromis, SRU, prêt, acte, honoraires
- **`parametres`** : couples `cle` / `valeur`
- **`partenaires`** : déclarée, pas utilisée par le code actuel

### Colonnes écrites mais jamais relues

`biens.yanport_id`, `biens.score` / `points_forts` / `points_attention` (copiés depuis la veille
mais affichés seulement côté `veille_propositions`), `biens.nb_salles_bain` / `nb_wc` / `agence_tel`
(relus dans le formulaire d'édition, mais affichés dans **aucune** vue en lecture : ni la carte, ni
la fiche publique, ni le mail), `transactions.honoraires_ttc` (recalculé à l'écran),
`envois.biens_ids` et `envois.sms_envoye`, `veille_passages.statut` et `message`,
`clients.est_vendeur`, `parametres.updated_at`.
Rien d'urgent, mais à savoir avant de bâtir dessus.

### ⚠️ Les types TypeScript ne décrivent plus le schéma

`src/lib/supabase.ts` ne déclare que trois interfaces (`Client`, `Recherche`, `Relance`) et elles
ont pris du retard : `Recherche` n'a ni `token_espace`, ni `espace_actif`, ni `espace_ouvert_le` ;
`Client` n'a pas `bien_actuel_adresse`. D'où les `(client as any)` semés dans `FicheClient.tsx`.
**Conséquence** : le contrôle de type ne protège plus contre une faute de frappe sur ces colonnes —
exactement le scénario qui a rendu les relances muettes. Toutes les autres tables sont utilisées
sans typage, en `select('*')`.

---

## 3. Les écrans

### Le CRM

Navigation (`Sidebar.tsx`), en trois sections :
**Principal** — Dashboard · Clients · Recherche en cours ·
**Suivi** — Visites · Relances · Nouveau mail ·
**Analyse** — Mon activité · Paramètres.
La fiche client s'ouvre depuis une liste, elle n'est pas dans la barre. `/veille/import` n'est
accessible que par son adresse directe.

**Fiche client** — le cœur de l'outil.
En-tête (avatar, contact cliquable, indicateurs, Envoyer, Relance J+5, Action, Ajouter un bien),
sélecteur **« Recherche active ▾ »** (bascule, création, renommage, suppression en cascade —
impossible de supprimer la dernière), bloc critères, mandat compact, puis les onglets :

| Onglet | Contenu |
|---|---|
| **Veille** | Les propositions à trier : Retenir → crée le bien en Sélection · Écarter avec motif |
| **Sélection** | Biens retenus, pas encore envoyés. Demande de PDF, envoi au client |
| **Présentés** | Biens déposés dans l'espace, **regroupés par réponse du client** |
| **Visites** | À venir / Effectuées, avec compte rendu (étoiles, avis, commentaire) |
| **Transaction** | 5 étapes, contre-offres détaillées |
| **Suivi** | Fil unique. Sept filtres : Tout · Appels · RDV · Notes · Relances · **Messages client** (venus de l'espace) · Communications · Système. **Défaut = Appels.** Une action peut être rattachée à un bien |

L'**assistant de critères** s'ouvre depuis le bloc critères : 9 étapes, dans cet ordre —
`bien · surfaces · étage · équipements · énergie · lieu · transports · budget · contexte`.
**Le budget est à la fin**, avec le secteur et les transports : c'est un choix d'Alexandre, ne pas
le remonter. Bascule « tout d'un coup / étape par étape » retenue dans `localStorage`.
Chaque équipement a trois niveaux : rien · souhaité · indispensable.

**Le bouton Emilio** (`/bookmarklet`) — **supprimé le 21 septembre**. Jamais utilisé, et sa route
d'extraction acceptait un appel depuis n'importe quel site (`Access-Control-Allow-Origin: *`) tout
en consommant `ANTHROPIC_API_KEY` : risque de facture pour personne. Supprimés : `src/app/bookmarklet/`
et `src/app/api/bien-from-bookmarklet/`. La saisie d'un bien passe par « Ajouter un bien » dans la
fiche client, ou par la veille.

### La fiche bien publique — `/bien/<id>`

**Refaite le 21 septembre à la trame de l'espace acheteur** : mêmes cartes, mêmes rubriques, mêmes
jetons de couleur, mêmes icônes SVG. C'est volontaire — cette page est celle que le client partage
avec son conjoint ou son courtier depuis l'espace, et les deux doivent se ressembler.

760 px de large, fond `--fond`, header navy avec logo. Carrousel (glissement au doigt, ruban qui
suit le geste, résistance aux bords) · prix en or avec le prix au m² · titre et localisation · une
grille de cases à icône dorée (surface, pièces, chambres, étage, exposition, séjour, extérieur,
construction) · « Performance énergétique » (DPE et GES en lettres colorées) · la description en
paragraphes repliés derrière « Lire la suite » · « Ce que le bien comprend » en cartes à icône ·
« Charges et énergie » en tuiles · bloc de contact navy · mentions non contractuelles · pied de
page nommant l'agence.

**La différence avec l'espace : pas de boutons d'avis.** Celui qui reçoit ce lien n'est pas le
client, il n'a rien à répondre — on lui donne de quoi appeler.

⚠️ **Le découpage du texte en paragraphes existe en double** : `AboutPliable.tsx` pour cette page,
et `decoupeTexte()` dans `EspaceClient.tsx` pour l'espace. Même logique, deux copies. Les changer
séparément ferait diverger les deux pages — à sortir dans un fichier commun un jour.

Le prix affiché est `prix_acquereur || prix_vendeur` : **si la commission n'a pas été saisie, c'est
le prix vendeur qui s'affiche**, sous le libellé « Prix ». Ce n'est donc « FAI uniquement » que si
la commission est renseignée.

### L'espace acheteur — `/espace/<token>`

Sans compte ni mot de passe : le lien **est** l'identification. Tout est lu côté serveur ; le
navigateur du client ne reçoit que ce qui le regarde.

**Un client = un lien = une application** (23 septembre). Le jeton est sur `clients.token_espace`.
`src/lib/espace.ts` — `ouvrirEspace(token, ?r)` — accepte aussi bien ce jeton que l'ancienne adresse
d'une recherche, et rend toujours : le client, **toutes ses recherches visibles**
(`espace_actif ≠ false`), et celle qu'il faut afficher.

Laquelle par défaut, dans l'ordre : celle que `?r=` demande → celle dont le lien a servi à entrer →
**celle où il a des biens non lus** → la plus récemment alimentée. Le client qui rouvre son
application tombe donc sur ce qu'il n'a pas encore vu.

**Le sélecteur de recherche** — une ligne sous son nom, dans l'en-tête, **et seulement s'il a
plusieurs recherches** : `« 1 sur 2 · RECHERCHE EN COURS »`, le nom de la recherche, et le nombre de
biens non lus sur les autres. Il appuie, une feuille « Vos recherches » monte, il choisit ; la page
se recharge avec `?r=<id>`. Le rechargement est volontaire : rien ne peut rester à cheval sur deux
recherches. Le nom montré n'est pas celui du CRM quand il ne dit rien au client
(« Recherche 2 ») — on retombe alors sur ses critères (« Studio · Levallois-Perret »),
voir `nommerRecherche()`.

**Trois écrans quand il n'y a rien à montrer**, à ne pas confondre :

| Fichier | Quand | Ce qu'il dit |
|---|---|---|
| `loading.tsx` | pendant le chargement | l'icône + « Ouverture de votre espace… » |
| `preparation.tsx` | le lien est bon, mais le client n'a **aucune** recherche visible | « Votre espace est en préparation », avec le téléphone d'Alexandre |
| `not-found.tsx` | le jeton ne correspond **à personne** : fiche supprimée, lien tronqué | « Ce lien n'est plus actif » |

⚠️ Supprimer une recherche — même la dernière — ne tue plus l'espace : le client bascule sur celle
qui reste, ou voit l'écran de préparation.

Accueil : la prochaine visite (avec ajout à l'agenda) · trois chiffres avec leur « ? » ·
Nouveaux biens · Mes derniers biens consultés · Le marché sur vos critères · Rappel de ma recherche.

**Mes derniers biens consultés** — regroupés par réponse, chaque groupe dans un cadre de couleur :
En attente · À visiter · Visités · Ça me plaît · Pas pour moi. Le client donne son avis
(`interesse` / `souhaite_visiter` / `refuse`), puis une question adaptée lui est posée
(« Qu'est-ce qui vous a plu ? », « Quelles sont vos disponibilités ? »).

**Le marché sur vos critères** — trois chiffres qui **s'additionnent** : annonces lues → écartées →
retenues, les écartées calculées par soustraction pour qu'ils ne puissent pas se contredire.
Puis la dernière recherche en entonnoir, les prix des biens retenus, et le rythme jour par jour.
Chaque chiffre porte un « ? » qui dit ce qu'il est et ce qu'il n'est pas.

**Agenda** — `/api/espace/agenda` sert un `.ics` (RFC 5545 : CRLF, échappement, repli des lignes
longues sinon Outlook refuse, heure locale flottante, rappel à ‑2 h), plus un lien Google Agenda.
⚠️ Le repli compte les **caractères**, pas les octets : un titre ou une adresse chargés en accents
peut encore dépasser les 75 octets de la norme. Voir §6.18.

**La note du chasseur est en lecture seule** : c'est un message d'Alexandre. Le client demande une
modification, il ne la fait pas.

---

## 4. Règles d'écriture de l'espace acheteur

Ce sont des règles de fond, pas de style. Elles sont reprises dans `AGENTS.md`.

- **Aucun mot de métier** : ni « chasse », ni « chasseur », ni « veille », ni « passage », ni
  « prospect ». Le client ne les comprend pas, et certains le placent du mauvais côté de la relation.
- **Jamais deux nombres qui peuvent se contredire sur la même page.** Un fait, une source.
- **Un même mot ne désigne pas deux choses** : « annonces lues » depuis l'ouverture et « annonces
  lues » de la dernière recherche se distinguent sur chaque ligne, pas seulement dans le titre.
- **Tout chiffre non évident porte un « ? »** avec une explication qui dit ce qu'il n'est pas.
- **Aucun bloc vide sans explication** : dire pourquoi, et quand il se remplira.
- **Ne jamais laisser entendre que le marché lui donne tort.** Les comparaisons de prix agressives
  sont contre-productives pour Alexandre. Les données de marché brutes ont leur place dans le CRM,
  pas dans l'espace client.

---

## 5. Routes API

| Route | Accès | Rôle | Exige |
|---|---|---|---|
| `POST /api/login` · `DELETE` | **publique** | Vérifie le code, pose le cookie SHA-256 | `EMILIO_ACCESS_CODE` |
| `POST /api/espace/<action>` | **publique** | Tout ce que l'espace acheteur écrit ; la serrure est le token | Supabase |
| `GET /api/espace/agenda` | **publique** | Le `.ics` d'une visite, si elle appartient au token | Supabase |
| `POST /api/extract-bien` | portail | URL d'annonce → Claude → JSON (repli regex) | `ANTHROPIC_API_KEY` facultative |
| `POST /api/parse-texte-bien` | portail | Texte collé → Claude → JSON. **Prix = prix affiché en gros**, jamais le « hors honoraires » | idem |
| `POST /api/reformuler-bien` | portail | Réécrit la description : retire confrère, téléphone, formules commerciales. Ne touche pas au prix | `ANTHROPIC_API_KEY` |
| `POST /api/send-mail` | portail | Envoi Mailjet. `mode` : `libre` · `biens` · **`bienvenue`** | Mailjet |
| `POST /api/espace/push` | **publique** | Abonnement/désabonnement aux notifications | Supabase |
| `POST /api/espace/push/contenu` | **publique** | Le texte de la notification, calculé à la seconde par `public/sw.js`. La serrure est l'adresse de poussée | Supabase |
| `GET /espace/<token>/manifeste` | **publique** | Le manifeste PWA du dossier. `start_url` porte **le jeton du client** | Supabase |
| `GET /icone?t=<taille>` | **publique** | L'icône de l'écran d'accueil, générée | — |
| `POST /api/notifier` | portail | « Préviens le client, un bien est parti. » Réveille **tous les appareils du client**, pas ceux d'une recherche | clés VAPID |
| `POST /api/upload-photos` | portail | Rapatrie les photos externes dans le Storage | `SUPABASE_SERVICE_ROLE_KEY` |
| `POST /api/upload-pdf` | portail | Dépose un PDF base64 dans le Storage | `SUPABASE_SERVICE_ROLE_KEY` |

### Les actions de `/api/espace/<action>`

Préalable commun : `token` de 12 à 128 caractères, `recherches.token_espace` existant,
`espace_actif` différent de `false`. ⚠️ C'est bien le jeton de la **recherche** que l'espace envoie
ici (`page.tsx` le lui passe en `token`), pas celui du client — voir `AGENTS.md` §3.3.

| Action | Effet |
|---|---|
| `vue` | Incrémente `nb_vues`, pose `vu_le` à la première ouverture seulement, écrit un événement au plus une fois par bien et par demi-heure |
| `retour` | L'avis du client : `badge_retour`, `retour_client`, `retour_le`, une ligne de journal, un événement |
| `criteres` | Met à jour la recherche. Sémantique : **absent = on ne touche à rien, null = on efface**, pour toutes les colonnes. Quatre exceptions toujours présentes à l'écran client — `surface_min`, `nb_pieces_min`, `chambres_min`, `budget_max` — où un `null` est ignoré. Si l'envoi ne contient rien d'exploitable, la route ne écrit rien du tout |
| `message` | Texte libre (1500 caractères max) → journal + **relance à J+1** + événement |
| `partage` | Envoie la fiche d'un bien à un tiers par Mailjet. Plafonné à 5 partages par lien et par 24 h. **Seule action à exiger `MAILJET_API_KEY` et `MAILJET_API_SECRET`** — sans elles, 500 |

### `/api/send-mail`, mode `bienvenue`

Deux textes, choisis **en base** et non par le CRM, pour que les deux ne puissent pas se
contredire : si une autre recherche du même client porte déjà `bienvenue_envoye_le`, c'est le mot
court (« Une deuxième recherche, Camille ») ; sinon c'est le mail de mise en route complet, avec le
lien et l'invitation à poser l'espace sur l'écran d'accueil. `apercu: true` envoie sans rien écrire
en base — pour se faire un test sans griller le bouton d'un vrai client.

Les trois mails partagent la même trame HTML. Sur téléphone (`@media max-width:600px`), la carte
passe **bord à bord** : le liseré beige disparaît, les marges tombent de 28 à 18 px, le pied se
range en deux lignes. Tout est en tableaux et en emoji — pas de SVG (Gmail les retire), pas d'image
hébergée pour un pictogramme (bloquée tant que le client n'affiche pas les images).

**Sourcing** : SeLoger bloque le téléchargement direct (Cloudflare) → copier-coller ou bouton Emilio.
LeBonCoin, PAP, Orpi passent. Le DPE en image SVG est récupéré par regex, sinon saisie manuelle.

---

## 6. Anomalies connues

Relevé du 20 septembre 2026, vérifié ligne par ligne dans le code, puis **recontrôlé par une
seconde lecture indépendante** qui a trouvé quinze erreurs dans la première version de ce
chapitre. Sauf mention contraire, **rien de ceci n'est corrigé**.

### Graves — perte ou corruption de données

1. **`/veille/import` · `veilleMaj(url, champs)` filtre uniquement sur `url`**, sans
   `recherche_id`. Une annonce proposée à deux clients voit **toutes ses lignes écrasées d'un coup**,
   alors que tout le reste du flux est cloisonné par recherche.
2. **Les écritures Supabase sans remontée d'erreur, partout.** `addJournal` ne vérifie jamais rien
   (dix-huit appels). `/api/espace/<action>` ne vérifie **aucune** de ses écritures et répond
   `{ ok: true }` même si toutes ont échoué. Idem dans `FicheClient` (une trentaine de points),
   `ParcoursBien`, `OngletBiens`, `OngletVeille`, `PageRelances`, `PageMail`, `send-mail`.
   `PageVisites` est à moitié corrigé : l'enregistrement du compte rendu remonte son erreur, mais
   ni l'insert dans `envois`, ni l'update du bien, ni l'annulation.
   C'est la famille de bugs qui a rendu les relances muettes pendant des semaines : ça dit
   « enregistré », il n'y a pas d'erreur, et rien ne se passe.
3. **`Clients.tsx` — l'insert de la recherche n'est pas vérifié** alors que celui du client l'est.
   En cas d'échec, le client existe **sans aucune recherche** : sa fiche ne peut rien afficher.
4. **`PageParametres` — `save()` ne vérifie rien** et affiche « ✅ Sauvegardé ! » quoi qu'il arrive.
   Pire : les valeurs par défaut affichées à l'écran ne sont jamais persistées si le champ n'est pas
   touché — le bouton n'enregistre donc pas ce qu'on voit.

### Sécurité

5. ✅ **RÉGLÉ le 23 septembre 2026.** Le RLS était désactivé sur les 14 tables, et le rôle `anon`
   — dont la clé est lisible dans le code de n'importe quelle page publique — avait `SELECT`,
   `INSERT`, `UPDATE`, `DELETE` **et `TRUNCATE`** sur toutes. N'importe qui pouvait donc copier ou
   vider le fichier clients. Voir la V3.6 au §11 pour ce qui a été fait.
   État vérifié après coup, depuis l'extérieur, avec la clé publique tirée de la page de
   connexion : `clients`, `biens` et `journal` renvoient `[]`.
6. **`PageParametres` écrit des secrets en clair** dans `parametres.valeur` : le mot de passe
   (`login`, `nouveau_mdp`) **et les clés Mailjet** (`mailjet_api_key`, `mailjet_secret_key`).
   Aucun n'est utilisé — l'authentification repose depuis le 23 septembre sur un compte Supabase
   (voir §11, V3.6), et l'envoi de mails sur les variables d'environnement. Ces champs sont donc
   morts et trompeurs. Ils ne sont plus lisibles de l'extérieur depuis que le RLS est actif, mais
   **ils restent à supprimer** : un secret en clair dans une table n'a aucune raison d'exister.
7. **La recherche globale de `Topbar`** injecte la saisie telle quelle dans un filtre
   `.or(...ilike...)` sans échapper les virgules ni les parenthèses.

### Écrans morts ou trompeurs

8. **Dashboard** : « Sélections ce mois », « Visites effectuées » et « CA mois en cours » affichent
   `0` en dur, sans aucune requête. Les cartes « Transactions en cours », « Visites à venir » et
   « Activité récente » sont des blocs vides permanents — alors que les données existent et sont
   déjà requêtées ailleurs.
9. **Mon activité** : « CA total HT » est `0 €` en dur. « Envois réalisés » compte **toutes** les
   lignes de `envois`, y compris les comptes rendus de visite qui ne sont jamais envoyés — le
   chiffre est gonflé.
10. **Relances** : le bouton « Voir fiche » ouvre la **liste** des clients, jamais la fiche du
    client concerné. Et « Reporter +5j » repart d'aujourd'hui, pas de l'échéance existante.
11. **Topbar** : lit `clients.type_bien`, `budget_min`, `budget_max`, `secteurs` — colonnes mortes
    depuis la V3.0. Affiche donc des critères périmés dans la recherche globale.
12. **Sidebar et page « Recherche en cours »** : le badge compte les **clients actifs**, pas les
    recherches. Les compteurs ne se rafraîchissent qu'au changement de page, jamais après une
    action. Et la page elle-même n'affiche **qu'une recherche par client** (l'active, sinon la
    première) : les recherches secondaires y sont invisibles, sans le moindre indice.
13. **Les variables de personnalisation des mails ne fonctionnent pas.** `/api/send-mail` ne
    remplace que **`{{prénom}}`, avec l'accent**. Or la page Paramètres annonce `{{prenom}}`,
    `{{nom}}`, `{{reference}}` et `{{conseiller}}` — **aucune de ces quatre n'est jamais
    substituée**. Un mail bâti sur un modèle des Paramètres part chez le client avec
    `{{prenom}}` écrit en toutes lettres.
    Par ailleurs `PageMail` code sa signature en dur et ignore le paramètre `signature_email` de la
    base ; et la case « SMS » n'envoie rien, elle écrit seulement une trace dans le journal.
14. **`OngletVeille`** : si `rechercheId` est vide, l'onglet reste bloqué sur « Chargement… »
    indéfiniment. Double journalisation à chaque « Retenir » (un insert direct **plus** un
    `addJournal`). Et `date_annonce` est perdu au passage proposition → bien
    (`charges_trimestrielles` et `taxe_fonciere` sont recopiés depuis le 24 septembre 2026).
15. **`PageVisites`** : l'insert d'un `compte_rendu_visite` dans `envois` n'envoie rien mais pollue
    le compteur d'envois. Les visites `annulee` ne s'affichent nulle part tout en comptant dans le
    total, donc l'état vide ne s'affiche pas si la seule visite est annulée.
16. **Incohérences de type** : le statut `offre_ecrite` est écrit par `FicheClient` et filtré par
    `PageMail`, mais absent du type `StatutClient` et de la table de couleurs de `Topbar`.
    `Client.raison_perte`, `Relance.bien_id` et `Relance.resultat` sont déclarés et jamais utilisés.

17. **Le journal et les relances échappent à `recherche_id`, et les deux erreurs se compensent.**
    `addJournal()` n'écrit **ni** `recherche_id` **ni** `bien_id` (ses dix-huit appels produisent
    donc des lignes orphelines), et l'onglet Suivi charge le journal sur `client_id` — ce qui les
    rattrape par accident, au prix de mélanger toutes les recherches d'un même client.
    ⚠️ **Corriger l'un sans l'autre fait disparaître l'historique.** Les relances, elles, portent un
    `recherche_id` qui n'est jamais relu.

18. **Le repli des lignes du `.ics` compte les caractères, pas les octets.** Un titre ou une adresse
    chargés en accents peut donc produire une ligne de plus de 75 octets — exactement ce
    qu'Outlook refuse, et la raison pour laquelle ce repli a été écrit.

19. **Des envois partent sans `recherche_id`** depuis `PageMail`, qui n'en envoie jamais. Ces
    lignes n'apparaîtront dans aucun onglet Suivi. (Le compte rendu de visite de `PageVisites`
    porte le dossier depuis le 26 septembre.)

20. **Plusieurs recherches peuvent être `active` en même temps.** `creerRecherche()` insère
    `active: true` sans passer les autres à `false` (et sans vérifier son erreur). Les écrans qui
    font `find(r => r.active)` prennent alors la première venue, et `/veille/import` renvoie
    **toutes** les recherches actives — donc la veille peut tourner deux fois sur le même client.

21. **L'espace acheteur peut désynchroniser `interphone` et `digicode`.** Ces deux clés sont
    acceptées dans `exigences` par l'API mais absentes de la table `BOOLEENS` : les colonnes
    booléennes restent figées sur ce que le CRM avait écrit, et divergent du jsonb.

22. **`outils/espaces-jsx.py` ne sort jamais en code 0** sur ce dépôt : quatre faux positifs connus
    subsistent (`FicheClient.tsx:1498`, `ParcoursBien.tsx:295`, `send-mail/route.ts:244` et `:317`
    — des `>` de comparaison et un attribut de balise). Inutilisable tel quel en pré-commit ; à
    lire à l'œil.

---

## 7. Ce qui reste à faire

### ✅ Corrigé le 20 septembre

**L'espace acheteur effaçait le budget minimum et le temps de transport du client.** Dans
`/api/espace/criteres`, six colonnes étaient écrites sans condition : un champ absent de l'envoi
valait `null`, donc « efface ». Quatre étaient repêchées, **`budget_min` et `transport_minutes` ne
l'étaient pas**. Le bug était *latent* — l'assistant envoie aujourd'hui l'objet complet, donc rien
n'a été perdu — mais le premier envoi partiel aurait vidé ces deux champs sans un mot. Les six
passent désormais par le même mécanisme que les autres, et un envoi vide n'écrit plus rien.

### ✅ Corrigé le 21 septembre

**Le portail bloquait toutes les images du dossier `public/`.** `src/proxy.ts` n'excluait que
`_next/static` et `_next/image`. Or quand `next/image` optimise `/logo_high_resolution_white.png`,
il redemande le fichier au site **par une requête HTTP** — qui repassait par le portail, sans
cookie, et se faisait rediriger vers `/login`. L'optimiseur recevait du HTML au lieu d'une image :
**le logo n'apparaissait sur aucune page publique.** Le matcher exclut désormais les extensions de
fichier statique.

**Le bien passait en « Présenté » avant l'envoi.** Choisir « par mail » appelait `marquer('mail')`
*avant* d'ouvrir la fenêtre de rédaction : annuler ne changeait plus rien. Désormais le clic
n'enregistre que les honoraires ; le passage en « Présenté » se fait dans `saveEnvoiBien`, quand
Mailjet confirme. **Et renvoyer un bien déjà présenté ne remet plus `badge_retour` à `propose`** —
sans ça, un renvoi effaçait l'avis du client.

**Le PDF remplaçait le lien d'envoi.** `const lien = bien.pdf_url || …` : dès qu'une fiche PDF
existait, WhatsApp et « copier le lien » envoyaient le fichier au lieu de la page vivante. Le
client recevait un document mort, sans aucun moyen de répondre. Le `pdf_url ||` est retiré.

**Le mail menait à la fiche publique, en lecture seule.** `/api/send-mail` pointait sur
`/bien/<id>`, où il n'y a aucun bouton de réponse. Il pointe maintenant sur
`/espace/<token>?bien=<id>`. Le jeton est lu depuis `recherches.token_espace` ; s'il manque, le
lien retombe sur la page publique.

**L'avis du client ne pouvait pas se désélectionner**, et un avis déjà envoyé restait modifiable en
rouvrant le bien — un deuxième retour écrasait le premier et doublait la ligne au journal.
Désormais : bascule tant que rien n'est parti, figé dès l'envoi.

**`envoye` était calculé sur `!!b.avis`**, alors qu'un bien présenté sans réponse porte déjà
`badge_retour = 'propose'`. Tous les biens en attente arrivaient donc figés. Seules les quatre
valeurs d'`ETIQ` comptent comme un vrai retour.

**Le mail de partage n'avait pas de photo** — juste un titre et une ligne. La requête
`bienDeLaRecherche` ne remontait ni `photos` ni `quartier`.

### ✅ Corrigé le 23 septembre

**Un client avec deux recherches recevait deux liens** et installait deux applications pour un seul
dossier. Le lien est remonté sur le client ; voir la V3.5 au §11.

**Supprimer la dernière recherche laissait la fiche inutilisable.** La corbeille venait d'être
ouverte sur la dernière recherche, sans regarder ce qu'il y avait derrière : `saveCriteres()`
commençait par `if (!rechercheId) return;`. Plus de recherche, donc plus de cible, donc
« Enregistrer » ne faisait **rien, et ne disait rien** — Alexandre ne pouvait repartir qu'en
supprimant la fiche. Désormais, remplir les critères quand il n'y a plus de recherche **en crée
une**, et `creerRecherche()` remonte ses erreurs au lieu de mourir en silence.

**Quatre mots collés en production** (`AGENTS.md` §2.1), dont un écrit le jour même :
« Vous en avez 2en cours » (repéré par Alexandre), « 2.Les alertes », « clientse remplissent »,
« dessousdisparaissent ». Tous vérifiés dans le code compilé après correction.

**Les mails étaient illisibles sur téléphone** : le liseré beige mangeait les côtés, et le bloc
« Le conseil qui change tout » posait sa phrase dans une colonne de cent pixels, à côté d'une
icône en largeur fixe. Carte bord à bord sur mobile, icône et titre sur une ligne, phrase en
dessous sur toute la largeur.

### Décidé, pas encore construit

0. **Double authentification sur les comptes Supabase, Vercel et GitHub.** Depuis que le RLS est
   actif, ce sont eux les vraies clés : entrer dans le compte Supabase permet de rééteindre le RLS
   en deux clics. Gratuit, cinq minutes chacun, et c'est aujourd'hui le meilleur rapport
   sécurité/effort du projet. À faire aussi : passer `SUPABASE_SERVICE_ROLE_KEY` en variable
   sensible sur Vercel (il le signale déjà en « Needs Attention »).
1. **SMS à chaque dépôt de bien** — un SMS au client quand un bien arrive dans son espace, avec le
   lien. Voie retenue : **API SMS d'OVH** (~0,045 € le SMS), **un seul SMS groupé par client et par
   fenêtre de 2 h**, case à cocher dans la fenêtre d'envoi.
   ❌ **WhatsApp écarté** : la plateforme Business exige une vérification d'entreprise Meta et des
   modèles de message approuvés hors de la fenêtre de 24 h.
3. **Données de marché DVF, dans le CRM uniquement** (jamais dans l'espace client) :
   `https://files.data.gouv.fr/geo-dvf/latest/csv/{année}/communes/{dept}/{insee}.csv` — structure
   vérifiée, 2021 à 2025 disponibles. ⚠️ `api.cquest.org` renvoie des 502, écarté.
4. **Mandat de recherche avec signature électronique** (Yousign) — nécessite un avis juridique
   (loi Hoguet).
5. **Confirmer les notifications sur iPhone.** Le parcours a été testé sur iPhone le 23 septembre
   et fonctionne. Reste à confirmer le point le plus fragile d'iOS : les notifications n'arrivent
   que si l'espace a été posé sur l'écran d'accueil, jamais depuis Safari.
6. **L'avertissement Play Protect** à l'installation, sur un deuxième téléphone Android : jamais
   reproduit, jamais infirmé.
7. **Découper `recherche-immobiliere-emilio/SKILL.md`** (91 Ko) en `SKILL.md` + `references/`.

### Plus tard

- **PDF d'une sélection de biens** : jsPDF + html2canvas (⚠️ pas encore dans `package.json`),
  page de garde, fiche par bien, note du conseiller, dépôt dans le Storage, pièce jointe Mailjet.
- **Scoring de compatibilité bien ↔ recherche.** Couche 1 : critères durs, pondération des champs
  structurés, faisable tout de suite et gratuit. Couche 2 : envoyer les critères, **les notes libres
  de la recherche** et la description de l'annonce à Claude pour repérer ce qui ne se met pas en
  colonne (calme, travaux, exposition, état), seulement sur les biens ayant passé un seuil en
  couche 1. Les notes libres sont une consigne de matching en langage naturel.
- **Extension du CRM aux vendeurs** : fiche unifiée, biens en mandat, pipeline de vente.
- Relances automatiques après envoi · Dashboard réellement branché · Export Excel ·
  Corbeille avec archivage à J+30 · Multi-utilisateur.

### Sourcing automatique d'annonces — comparatif de mai 2026

Le scraping maison est **écarté** : CGU des portails, défenses anti-bot, coût de maintenance
prohibitif en solo. On achète à une API le droit d'usage, l'infrastructure, la déduplication.

- **Stream Estate** (ex-Melo.io) — 1500+ sources, déduplication native, webhooks (nouvelle annonce,
  baisse de prix, expiration). ~0,01 €/annonce, Starter ~99 €/mois. ⚠️ Le comparatif qui le classe
  premier a un conflit d'intérêt déclaré.
- **MoteurImmo** — meilleur rapport qualité/prix pour un chasseur. 9/19/39 €/mois, 57 plateformes,
  adresse exacte, DVF.
- **Yanport** — **déjà utilisé par Alexandre**. À vérifier auprès de lui : son offre inclut-elle
  l'API, et cette API expose-t-elle les annonces ou seulement les indicateurs de marché ?
- **Fluximmo** — écarté, pas de déduplication.

Avant de coder : tester les essais gratuits sur Paris/92, vérifier la couverture réelle, la
fraîcheur, et les CGU (le re-stockage et l'envoi au client en marque blanche sont-ils autorisés ?).

---

## 8. Mailjet — la configuration qui a coûté cher

Domaine `emilio-immo.com` validé, envois depuis `arogelet@emilio-immo.com`.

**DNS chez OVH** : TXT de validation `mailjet._57401e37` · SPF **de type TXT**
`v=spf1 include:mx.ovh.com include:spf.mailjet.com -all` · DKIM `mailjet._domainkey` ·
DMARC sur `_dmarc` : `v=DMARC1; p=none; pct=100; rua=mailto:arogelet@emilio-immo.com; sp=none; aspf=r`.

⚠️ **Le piège** : OVH propose par défaut un enregistrement de type **SPF**, déprécié depuis la
RFC 7208. Mailjet ne le reconnaît pas — il faut le recréer en **TXT**.
La coexistence avec la messagerie OVH tient grâce à `include:mx.ovh.com`.

**Suivi désactivé** dans `/api/send-mail` (`TrackOpens` et `TrackClicks` sur `disabled`) : cela
supprime le pixel de traçage et la réécriture des liens, donc moins de signaux « Promotions ».
Le CNAME `bnc3` n'a volontairement pas été ajouté, inutile sans traçage.
Résultat mail-tester : **9,9/10**.

**Le gabarit** : une seule feuille blanche sur fond beige `#e7e1d4`, en-tête navy avec logo, puis
le message, puis les biens, puis le pied navy. ⚠️ Gmail **supprime les ombres portées** : on sépare
par le contraste, jamais par l'ombre. Un bien = grand visuel + bouton pleine largeur ;
plusieurs biens = liste photo à gauche.

---

## 9. Règles d'affichage figées

- **Min/max** : `32–80 m²` si les deux, `min 32 m²` ou `max 80 m²` si un seul.
- **Prix** : carte bien = prix acquéreur en gros doré, prix vendeur + commission en petit gris.
  Fiche publique = prix FAI seulement.
- **Jours de mandat** : « X jours restants » · « Expiré » · alerte sous 15 jours.
- **Modales de saisie non fermables au clic extérieur** (contact, mandat, bien, création client) —
  fermeture par ✕ ou Annuler uniquement. Le menu « Recherche active », lui, se ferme au clic
  extérieur.
- **Le prix sourcé est le prix affiché en gros** (FAI), jamais le « hors honoraires », même quand
  la ventilation net + commission est détaillée. Raison métier : Alexandre pose **sa** commission
  par-dessus.

---

## 10. Hors périmètre

- **Pas de diffusion portails** — reste sur Immofacile, faute de partenariats techniques
  reproductibles par un développeur indépendant.
- Pas de comptabilité, pas de signature électronique (pour l'instant), pas de multi-agence.

---

## 11. Historique

### V1 → V2 (mai 2026)
Journal anti-bruit. Envoi de mails branché sur Mailjet avec quatre modes (libre, un bien, sélection,
mail libre depuis la fiche). Fiche bien publique `/bien/[id]`. Colonnes `biens` étendues
(DPE/GES détaillés, caractéristiques, énergie, surfaces annexes, financier, équipements).

### V3.0 — 30 mai 2026 · architecture multi-recherches
Le changement structurant. Les critères quittent `clients` pour la nouvelle table `recherches`,
et `recherche_id` est ajouté à `biens`, `visites`, `transactions`, `envois`, `relances` (CASCADE)
et `journal` (SET NULL). Migration exécutée en production : chaque client a reçu sa
« Recherche principale » avec ses critères recopiés, zéro orphelin.
Création client refondue en assistant 3 étapes. Historique + Journal fusionnés en « Suivi ».
Liste Clients = une carte par client, pas par recherche.

### V3.1 — 2 juin 2026
Délivrabilité Mailjet résolue (DMARC, suivi désactivé, 9,9/10). Gabarit de mail refondu en feuille
unifiée. Fiche bien publique repassée de deux colonnes à **une seule colonne centrée** — la barre
latérale laissait un grand vide à droite sur les contenus longs.

### V3.2 — 30 juin 2026
Reformulation IA fiabilisée : endpoint dédié `/api/reformuler-bien` (le bouton tapait avant sur
`parse-texte-bien`, conçu pour *conserver* le texte — il ne reformulait donc pas). Le prix sourcé
devient le prix affiché en gros. Onglet Suivi refondu avec filtres par type d'action. Action
rattachable à un bien (`journal.bien_id`). En-têtes de la fiche bien publique en étiquette dorée
à cheval.

### V3.3 — 19-20 septembre 2026 · l'espace acheteur

Le plus gros ajout depuis la V3.0. Le client n'est plus seulement destinataire de mails : il a son
espace.

- **Espace acheteur `/espace/<token>`** (~3 000 lignes dans `EspaceClient.tsx`) — voir §3.
- **Avis client** remontant dans l'onglet Présentés, regroupés par réponse.
- **Agenda `.ics`** + lien Google Agenda.
- **Assistant de critères en 9 étapes**, budget à la fin, disponible côté CRM et côté client.
- **Exigences à 3 niveaux**, étage maximum sans ascenseur, cuisine ouverte ou séparée, surface
  minimale d'extérieur.
- **`SecteurPicker` réécrit** : un bloc par commune, tiroir « + Quartier ». Format de stockage
  inchangé (`"Quartier (Ville)"`).
- **Transports** : `ArretPicker`, `lib/lignes.ts`, `lib/arrets.ts`.
- **Veille outillée** : `veille_passages`, `veille_propositions`, onglet Veille, `/veille/import`.
- **Historique client** : `historique_vu_le` + pastille « non lu » sur les changements venus de
  l'espace.

**Six bugs silencieux trouvés en vérifiant, aucun signalé par Alexandre :**

1. L'onglet par défaut de la fiche pointait sur un identifiant (`biens`) qui n'existait plus.
2. `nb_vues` ne pouvait jamais dépasser 1 : l'envoi était conditionné à `etat === 'neuf'`.
3. Les insertions dans `relances` utilisaient `date_relance` / `motif` / `statut:'a_faire'` au lieu
   de `date_echeance` / `note` / `en_attente` → **aucune relance n'avait jamais été créée**, sans
   la moindre erreur visible.
4. `saveCriteres` avalait ses erreurs et refermait la fenêtre comme si tout allait bien.
5. **Le bouton Emilio était mort depuis le 30 mai** : il enregistrait le bien sans `recherche_id`
   ni `etape`. Le bien partait en base et n'apparaissait nulle part.
6. **Les espaces JSX mangées par SWC** (voir `AGENTS.md`) : 20 endroits dans 7 fichiers, dont
   « suivi depuis 21jours », « 4 500€commission », et « 3· Voir tout » sur la fiche bien publique.

**Refonte de « Le marché sur vos critères »**, en plusieurs passes sur retour direct : trois
chiffres qui s'additionnent, un « ? » sur chacun, état vide expliqué, palette ramenée à marine +
or + blanc, émojis remplacés par les icônes dessinées.

**Nouveaux fichiers** : `app/espace/[token]/page.tsx` · `components/espace/EspaceClient.tsx` ·
`app/api/espace/[action]/route.ts` · `app/api/espace/agenda/route.ts` ·
`components/shared/ArretPicker.tsx` · `lib/arrets.ts` · `lib/lignes.ts` · `src/proxy.ts` ·
`outils/espaces-jsx.py`.

### V3.4 — 21 septembre 2026 · le circuit d'envoi, remis d'aplomb

Pas de nouvelle fonction : une journée à réparer le chemin entre un bien retenu et la réponse du
client. Sept bugs silencieux, tous détaillés au §7.

**Le circuit, tel qu'il est maintenant.** Le mail ne sert qu'à prévenir : chaque bouton mène à
`/espace/<jeton>?bien=<id>`, la fiche du bien dans l'espace, avec les trois boutons de réponse.
Le bien ne bascule en « Présenté » qu'à l'envoi réel. La fiche publique `/bien/<id>` reste, pour le
partage à un tiers qui n'a pas de lien d'espace, et adopte la même trame.

**Côté espace acheteur** : deux rubriques de plus sous la description — « Ce que le bien comprend »
en cartes à icône, « Charges et énergie » en tuiles — avec neuf icônes dessinées pour l'occasion.
DPE et GES passés en cartes, année de construction montée dans la rangée de chiffres. Description
découpée en paragraphes et repliée derrière « Lire la suite ». Accueil réorganisé : deux cartes
d'action côte à côte, puis le rappel de recherche et le marché sur toute la largeur. Bouton
« Télécharger la fiche » en attente, avec une pop-up qui annonce ce qui arrive.

**Côté CRM** : « Préparer le PDF » renommé **« Demander une fiche soignée »**, et son état d'attente
« En attente · prochaine session » — l'ancien libellé laissait croire à une action immédiate, alors
que c'est une demande déposée en base, honorée à la session suivante. « Observation » renommé
**« Noter son retour »** : la fonction existait, personne ne la trouvait.

**Deux migrations SQL** : `retour_par` sur `biens` (`client` / `conseiller`, pour que l'espace
n'écrive plus « Votre commentaire » sous une phrase saisie par Alexandre), et la renumérotation des
dossiers clients à partir de 100 (`EMI-2026-100`).

⚠️ **Toujours pas poussé sur GitHub au 21 septembre** : `src/components/clients/Clients.tsx`
(espaces JSX) et le dossier `outils/`. Le bouton Emilio, lui, n'est plus à pousser : il a été
supprimé (voir plus haut).

**La veille et l'URL** — `window.veilleMaj(url, champs, recherche_id)` prend désormais la recherche
en troisième argument. Une même annonce peut être proposée à plusieurs clients : la table porte une
ligne par recherche, toutes avec la même URL, et filtrer sur la seule URL écrivait chez tout le
monde à la fois. Sans `recherche_id`, la mise à jour n'est acceptée que si l'URL ne désigne qu'une
seule ligne ; sinon elle est refusée et la liste des recherches concernées est renvoyée.

### V3.5 — 22-23 septembre 2026 · l'espace appartient au client

**Le problème, trouvé par Alexandre.** Le lien de l'espace était posé sur la recherche. Un client
qui ouvrait une deuxième recherche recevait donc un deuxième lien et se retrouvait avec **deux
applications sur son téléphone pour un seul dossier**. Ce n'était pas un bug d'affichage : c'était
le modèle qui était faux.

**La bascule.** `clients.token_espace` devient le lien — un par client, définitif. La reprise SQL
(`migration-espace-client.sql`) donne à chaque client le jeton de sa **plus ancienne** recherche :
c'est celui qu'il a reçu par mail et posé sur son écran d'accueil, donc **aucun lien déjà envoyé ne
casse et personne n'a rien à réinstaller**. Les jetons de recherche restent valables et redirigent.

Tout ce qui en découle :

- **Le sélecteur de recherche** dans l'en-tête de l'espace, invisible tant qu'il n'y a qu'une
  recherche — c'est-à-dire pour l'immense majorité des clients. Voir §3.
- **Les notifications suivent le client** : `/api/notifier` réveille les appareils par `client_id`,
  et `/api/espace/push/contenu` compte les biens non lus **toutes recherches confondues**. Sans ça,
  la pastille de l'icône aurait menti dès qu'un bien serait arrivé sur la deuxième recherche.
- **Le manifeste PWA** porte le jeton du client : l'icône survit à la fin d'une recherche.
- **Le mail de bienvenue** a un jumeau court pour les recherches suivantes — le client a déjà son
  espace, on ne lui renvoie pas un lien.
- **Supprimer la dernière recherche devient possible.** Ce qui appartient à la recherche part
  (biens, photos, visites, envois, veille) ; **le suivi de dossier reste** — un appel, un RDV, une
  note, un message du client sont détachés au niveau du client au lieu d'être effacés, même quand
  la ligne portait le numéro de la recherche.
- **`preparation.tsx`** : l'écran d'un client qui n'a plus aucune recherche. Il lisait « ce lien
  n'est plus actif », ce qui était faux et inquiétant.

**Avant ça, le 22 septembre** — les réponses en un geste sur la fiche d'un bien (pastilles
pré-écrites avec icônes, barre collante en bas de l'écran), le bouton « Mail de bienvenue », et
`depuis()` réécrit : « à l'instant » tenait une heure entière, un client qui revenait dix minutes
plus tard lisait encore « à l'instant ».

**Deux règles de vocabulaire violées en production, trouvées au passage** : « Votre conseiller
organise la visite avec l'agence ou le propriétaire » dans l'espace (le client ne doit jamais avoir
l'impression qu'il y a un autre intermédiaire) et « Chasse immobilière sur mesure » dans le pied de
**tous** les mails. Corrigées.

**Nouveaux fichiers** : `src/lib/espace.ts` · `app/espace/[token]/preparation.tsx` ·
`app/espace/[token]/not-found.tsx` · `outils/espaces-jsx.py` (promis depuis la V3.3, jamais poussé).
**Migrations** : `migration-espace-client.sql`, `migration-bienvenue.sql` — **passées le
23 septembre**, `clients_sans_lien = 0`.

L'iPhone a été testé le 23 septembre et fonctionne.

### V3.6 — 23 septembre 2026 · la base se referme

**Le point le plus vieux de ce document, réglé en une soirée.** Le §6.5 disait depuis mai que le
RLS était probablement désactivé et qu'il fallait une session dédiée. Vérifié dans Supabase ce
soir-là : les **14 tables** étaient ouvertes, et le rôle `anon` — dont la clé est lisible dans le
code de n'importe quelle page publique — avait `SELECT`, `INSERT`, `UPDATE`, `DELETE` et
`TRUNCATE` sur chacune. Copier le fichier clients, ou le vider, tenait en une requête.

**Pourquoi on ne pouvait pas simplement allumer le RLS.** Le CRM lit la base depuis le navigateur
avec cette même clé : la base ne faisait aucune différence entre Alexandre et un visiteur. Fermer
sans rien d'autre l'aurait mis dehors avec les robots. Il fallait donc d'abord lui donner une
identité que la base reconnaisse.

**Ce qui a été fait, dans l'ordre :**

1. Un compte Supabase (`arogelet@emilio-immo.com`), créé à la main — c'est le seul du projet, il
   n'y a aucune inscription ouverte.
2. `/login` ne demande plus un code mais un mail et un mot de passe, vérifiés par Supabase.
   `/api/login` revalide le jeton **côté serveur** avant de poser le cookie que `proxy.ts` attend :
   `proxy.ts` n'a pas changé d'une ligne, et `EMILIO_ACCESS_CODE` sert désormais de secret du
   cookie plutôt que de mot de passe.
3. `/bien/<id>` lisait encore la base avec la clé publique : basculée sur la clé de service. La
   page est rendue par le serveur, la clé ne quitte jamais Vercel.
4. `AppLayout` renvoie vers la connexion si la session Supabase a disparu — sans ça, une session
   expirée donnait des écrans vides sans le moindre message.
5. `migration-rls.sql` : RLS actif sur les 14 tables, une politique `crm_authentifie` pour le rôle
   `authenticated`. Le retour arrière est dans le même fichier.

**Deux serrures désormais, et elles ne servent pas à la même chose** : le cookie autorise
l'affichage des pages, la session Supabase autorise la lecture des données. Le cookie seul ne
donne accès à rien.

**Vérification faite depuis l'extérieur**, en refaisant le geste d'un robot : la clé publique a été
extraite du code de la page de connexion — elle y est toujours, c'est normal et inévitable — puis
utilisée pour interroger `clients`, `biens` et `journal`. Les trois renvoient `[]`. Le même appel,
le matin même, rendait le fichier clients entier.

**Ce que ça n'a PAS changé, et c'est voulu** : l'espace acheteur et les routes `/api/espace/`
passent par le serveur avec la clé de service, qui ignore le RLS. Aucun client n'a rien vu, rien à
réinstaller, aucun lien cassé.

⚠️ **Ce qui reste** : la double authentification sur Supabase, Vercel et GitHub (§7). Ce sont eux
les vraies clés maintenant — qui entre dans le compte Supabase peut rééteindre le RLS.
