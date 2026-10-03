# CONTEXTE — Emilio Immo, CRM de chasse immobilière

**Version 3.67 · 4 octobre 2026**

Ce fichier décrit **ce qui existe**, pas ce qu'on aimerait construire.
Les règles de travail (comment livrer, quels pièges éviter) sont dans **`AGENTS.md`** — à lire en premier.

---

## 0. En deux minutes

Alexandre Rogelet dirige **Emilio Immobilier**, agence indépendante sur Paris et les Hauts-de-Seine
(carte professionnelle CPI 9201 2020 000 045 344). Il fait de la vente classique et de la
**chasse immobilière** : un acquéreur lui confie une recherche, il écume le marché pour lui.

Ce dépôt est le CRM sur mesure qui remplace Immofacile — sauf pour la diffusion portails, qui reste
sur Immofacile faute de partenariats techniques reproductibles (le passage au CRM est à l'étude : §7).

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

**Le journal, depuis la V3.20** : il est toujours chargé sur `client_id`, mais `addJournal()` écrit
`recherche_id` quand la ligne parle d'une recherche, et l'onglet Suivi ne montre que la recherche
ouverte **plus** les lignes sans recherche (le contact, le statut, tout l'historique d'avant). Les
lignes d'une autre recherche se rajoutent d'un clic. Voir §6.17. Les `relances` gardent leur
`recherche_id`, lu pour ouvrir la fiche sur la bonne recherche.

### `clients`

Identité et contact : `reference`, `prenom`, `nom`, `adresse`, `emails[]`, `telephones[]`,
`statut`, `chaleur`, `notes`, `est_vendeur`.
**`token_espace`** — le lien permanent de son espace acheteur, posé à la création du client
(`Clients.tsx`), rattrapé à l'ouverture de la fiche s'il manque (`FicheClient.tsx`). Index unique
partiel. C'est **ce** jeton qu'on envoie, jamais celui d'une recherche — voir §2 `recherches` et
`AGENTS.md` §3.3.
**Types de contact (V3.14)** — `types text[]` (défaut `{acheteur}`) : acheteur, vendeur,
proprietaire, notaire, confrere, gardien, partenaire, plusieurs à la fois. `pro jsonb` : ce qui
est propre au type (agence, statutPro, reseau, adresseAgence, siteWeb ; etude, adresseEtude,
clerc, clercTel ; immeuble, horaires, acces ; metier, societe ; depuis la V3.30, `structure` : la
société qu'il représente — `{ denomination, forme, rcs, siege, qualite, associes: [{ id, nom, role,
tel, email }] }`, lue par `lireStructure()`). `archive bool`. Tout passe par
`src/lib/contacts.ts` (`typesDe`, `estAcheteur`, `sansCriteres`, `ligneContact`) : sans le SQL,
un contact sans colonne `types` est un acheteur, comme avant. « Acheteur non filtré » n'est pas
un type : c'est un acheteur dont la recherche n'a aucun critère (`sansCriteres`). Le `statut`
(prospect, actif…) ne concerne que les acheteurs ; les autres sont créés en `prospect`.
Occupation : `statut_occupation` (proprietaire / locataire / heberge / autre) et, si propriétaire,
`bien_actuel_type`, `bien_actuel_surface`, `bien_actuel_valeur`, `bien_actuel_adresse`,
`bien_actuel_a_vendre` (= **mandat de vente potentiel**), `bien_actuel_notes`.

⚠️ **Colonnes de critères mortes.** `type_bien`, `budget_min`, `budget_max`, `secteurs`,
`surface_*`, `chambres_min`, `parking`, `cave`, `mandat_*` et consorts existent encore sur
`clients` mais **ne sont plus écrites depuis la V3.0** — la source de vérité est `recherches`.
`Clients.tsx` compense en fusionnant en mémoire ; `Topbar.tsx` ne les lit plus (§6.11).

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
  - **Les mails** (Paramètres › Templates email, `src/lib/mail-variables.ts`, V3.20) :
    `signature_email` (sinon une signature bâtie sur `conseiller_prenom`, `conseiller_nom`,
    `agence_nom`, `conseiller_telephone`), lue par « Nouveau mail » et les envois de la fiche ;
    `conseiller_prenom` + `conseiller_nom` = `{{conseiller}}` ; `template_email_objet` /
    `template_email_corps` pré-remplissent « Envoyer la sélection ». `delai_relance_jours` (Paramètres ›
    Relances) : le délai de la relance posée après un envoi.
  - Plus aucun secret : les clés Mailjet, `login` et `nouveau_mdp` ne s'écrivent plus (V3.20) ;
    `outils/sql/parametres-secrets.sql` efface les anciennes lignes. Restent, sans usage :
    `sms_sender`, `template_sms`, `template_relance_*`, `conseiller_email`, `site_web`.
  - **L'identité de l'agence** (Paramètres › Agence, `src/lib/agence.ts`) : `agence_identite` (JSON :
    société, carte pro et sa date de fin, argent des clients, assurance, médiateur, signataire,
    coordonnées, autres mentions) et `agence_identite_historique` (chaque modification, datée, avec
    l'ancienne et la nouvelle valeur). Tous les documents la lisent : `redigerMandat(d, identite)`,
    `pdfMandat` / `pdfSigne` (`identite` dans les options). Le mandat de recherche prend celle du
    jour de la signature (`/api/espace/mandat`, étape `signer`) et la garde dans
    `mandats_signatures.contenu.identite` ; un PDF signé ne change plus. Sans ligne enregistrée,
    c'est `IDENTITE_DEFAUT`, mot pour mot l'ancienne identité codée en dur (texte et PDF vérifiés
    identiques octet pour octet). Un champ obligatoire vide retombe sur sa valeur d'origine.
    Deux mois avant la fin de la carte, `RappelCarte` (AppLayout) met un bandeau sur le tableau de
    bord ; expirée, sur tous les écrans. Les honoraires restent dans `src/lib/mandat.ts` (affichés
    en lecture seule) : un mandat de recherche part de **2,5 % TTC** (`HONORAIRES_TAUX`) et peut
    monter jusqu'à **5 %** (`BAREME`) quand Alexandre le décide — c'est lui qui choisit, le CRM ne
    plafonne pas plus bas ; un mandat de vente, **5 % TTC** (`BAREME_VENTE`). Les valeurs par
    défaut suivent : « 2,5% TTC » (et non plus « 3,5% TTC ») pour un mandat saisi à la main, 2,5 %
    (et non plus 3 %) pour les honoraires d'un bien envoyé sans mandat.
- **`documents`** (`outils/sql/documents.sql`, passé le 26 septembre) : les documents juridiques
  rédigés dans le CRM — `modele` (`mandat_vente` · `offre_achat` · `bon_visite`), `categorie`,
  `statut` (`brouillon` · `pret` « À faire signer » · `signe` · `annule`), `donnees` (jsonb, les
  réponses), `identite` (l'identité de l'agence figée à la finalisation), `titre` / `sous_titre` /
  `badge` / `numero` (recalculés depuis le modèle à chaque enregistrement, pour la liste),
  `client_id`, `recherche_id`, `bien_id`, `pdf_chemin`, `signe_chemin`, `finalise_le`, `signe_le`,
  `annule_le`. RLS + `crm_authentifie`, comme les autres. Les fichiers vivent dans le bucket privé
  `mandats`, sous `documents/<id>/`. Le mandat de recherche signé en ligne reste dans
  `mandats_signatures` : la rubrique le montre à côté, en lecture.
  - `documents.signature` (jsonb, `outils/sql/signature-documents.sql`) : la signature en ligne ou
    sur place d'un document — `{ mode, lance_le, agence_le, deroule, empreinte, version, versions,
    seul_chemin, scelle_chemin, scelle_le, assemble_chemin, complet_le, envoye_le, classe_le }`.
    Null : signé à la main (tous les documents d'avant). Le document reste `pret` tant que tout le
    monde n'a pas signé, puis passe `signe` avec `signe_chemin` = le PDF scellé.
  - `documents.envois` (jsonb, `outils/sql/documents-envois.sql`, V3.40) : les projets envoyés en
    relecture avant la signature, du plus ancien au plus récent — `[{ le, a: [{ email, nom }],
    sujet, message, fichier, echecs? }]`, 50 au plus. Écrite par `/api/documents` (action
    `projet`) seulement ; l'éditeur n'y touche pas (son enregistrement ne porte que `donnees`).
  - **`documents_signataires`** (même fichier SQL) : un signataire par ligne, rattaché à
    `document_id`. `cle` = son cadre dans le document (`v0`, `v1`, `sci`, `conjoint`, `a0`…),
    `mode` (`en_ligne` · `sur_place`), `statut` `attendu` (sur place) · `invite` (son lien est parti)
    · `signe` · `annule` (signature arrêtée). `jeton` (`/signer/<jeton>`, 15 jours), `relances`
    (1 et 2 : rappels à J+2 et J+7 ; 3 : Alexandre prévenu de l'expiration), code haché, essais,
    preuves (`ip`, `appareil`, `email_verifie`, `griffe_chemin`) et `deroule`. RLS +
    `crm_authentifie`. Fichiers : `documents/<id>/seul-…`, `scelle-…`, `griffe-…` ; la signature
    de l'agence est `agence/signature.png`.
- **Signer à plusieurs** (`outils/sql/signature-plusieurs.sql`, voir `src/lib/cosignature.ts` et
  `src/lib/foyer.ts`) :
  - `clients.civilite` (la personne 1), `clients.couple`, `clients.conjoint` (jsonb : la personne 2
    `{ civilite, prenom, nom, email, telephone, naissanceDate?, naissanceLieu? }`). Les `emails` et
    `telephones` de la fiche restent ceux de la personne 1. `nomFoyer()` affiche « Paul et Claire
    Martin » (liste, fiche, recherche par le prénom du conjoint).
  - `mandats_signatures.societe` (jsonb `{ denomination, forme, siren, rcsVille, siege, qualite }`),
    `kbis_chemin`, `griffe_chemin` (la signature tracée du premier signataire, gardée pour refaire
    le PDF). `statut` gagne `partiel` : il a signé, on attend les autres.
  - **`mandats_cosignataires`** : un co-signataire par ligne, rattaché à `signature_id`. `statut`
    `prevu` (saisi, le premier n'a pas encore signé) → `invite` (son lien est parti) → `signe` ;
    ou `decline` (« pas concerné »), `annule` (invitation close par Alexandre, ou le premier a
    renoncé), `retracte`. `saisi` = ce que le premier a tapé, `personne` = ce que le co-signataire a
    vérifié ou corrigé. `jeton` (son lien `/signer/<jeton>`), `lien_expire_le` (15 jours),
    `relances` (1 et 2 : rappels ; 3 : Alexandre prévenu du délai), code et preuves comme
    `mandats_signatures`, sa propre `execution_immediate`. RLS + `crm_authentifie`.
- **Biens** (`outils/sql/biens-vente.sql`, voir `src/lib/biens-vente.ts`) :
  - **`biens_vente`** : un bien que l'agence vend ou pourrait vendre. Colonnes de liste (`titre`, `type_bien`,
    `adresse`, `code_postal`, `ville`, `quartier`, `prix`, `surface`, `nb_pieces`, `nb_chambres`,
    `etage`, `mandat_type`, `mandat_numero`, `mandat_fin`, `photo`, `client_id` = le propriétaire)
    recalculées à chaque enregistrement par `colonnesBien()` ; tout le reste dans `donnees` (les
    réponses de l'éditeur, `ETAPES_BIEN`). `etape` (texte libre, pas de contrainte en base) :
    `a_suivre` (V3.13) · `estimation` · `mandat` · `suspendu` (« En pause ») · `offre` ·
    `compromis` · `vendu` · `retire` ; `etape_le`, `en_vente_le`, `vendu_le`, `archive`,
    `reference` (EMI-V-AAAA-NNN), `document_id` (le mandat de vente dans Documents).
  - **`biens_vente_suivi`** : l'historique propre au bien — `type` `visite` (avec quelqu'un hors
    du CRM ; `statut` a_venir · faite · annulee, `avis` = les issues de `src/lib/visites.ts`),
    `offre` (`montant`, `statut` en_attente · acceptee · refusee · contre · retiree, `donnees` :
    validité, financement, fichier), `etape` (`statut` = l'étape atteinte, `donnees` : ce qui a
    été saisi — dates du compromis, raison…), `prix` (`montant` = nouveau, `donnees.ancien`),
    `note`, et depuis la V3.30 `envoi` (des pièces du dossier parties par mail : `qui`,
    `commentaire` = l'objet, `donnees` `{ a, pieces, mode: 'pj' | 'liens', taille }`).
  - Dans `biens_vente.donnees` (V3.30) : `dossier[k].taille` (octets, noté au dépôt), `fichiers`
    (les autres documents : `[{ id, titre, chemin, nom, taille, le }]`, `lireFichiers`),
    `proprioSans` (« Continuer sans propriétaire pour l'instant »).
  - Depuis la V3.31 : `fichiers[i].sorte = 'ddt'` (un dossier de diagnostic technique : un seul
    fichier qui en contient plusieurs), `dossier[k].dans` (l'`id` du fichier qui contient cette
    pièce : la ligne est « Reçu » sans fichier à elle), `piecesPerso` (les pièces ajoutées par
    Alexandre, avec le nom de son choix : `[{ k: 'perso…', l, groupe }]`, `lirePiecesPerso` ;
    `lignesDossier(d)` renvoie les lignes fixes puis celles-ci).
  - `biens.bien_vente_id` : la copie d'un bien en vente dans le dossier d'un acheteur (présenté
    dans son espace, ou visité). C'est par elle que la fiche retrouve à qui il a été présenté,
    ce qu'ils en ont dit et leurs visites (table `visites`, comme les autres).
  - Photos : bucket **public** `photos-vente` (`<id du bien>/…`), déposées par le CRM connecté,
    réduites à 1 920 px dans le navigateur. Jamais dans `photos-biens` : retirer un bien du dossier
    d'un acheteur y efface les photos. Pièces du dossier et offres signées : bucket privé
    `mandats`, sous `biens-vente/<id>/`, via `/api/biens-vente`.
  - Documents créés depuis la fiche : `documents.donnees.bienVenteId` = l'id du bien.
- **`contact_submissions`** (`outils/sql/demandes-site.sql`, V3.34) : les demandes déposées par les
  formulaires du site emilio-immo.com. Colonnes du site, en anglais (le site n'a que son adresse de
  base à changer) : `form_type` (`estimation` · `mandat_recherche` · `rappel_bien` · `contact`),
  `name`, `email` (peut être vide), `phone`, `message` (les réponses « Clé : valeur » de l'estimation
  et de l'accompagnement, une par ligne, relues par `src/lib/demandes-site.ts`), `budget`,
  `property_type`, `desired_location`, `desired_surface`, `timeline`, `property_ref`,
  `property_title`, `created_at`. Colonnes du CRM : `statut` (`nouveau` · `en_cours` · `traite`),
  `statut_le`, `a_rappeler_le` (date), `archive`, `archive_le`, `admin_notes`, `client_id` (le
  contact créé depuis la demande), `is_called` (hérité de Lovable, suit « Traitée »). RLS +
  `crm_authentifie` ; **`anon` n'a que `INSERT`, sur les seules colonnes du site** (politique
  `site_depose` : types connus, tailles bornées) — il ne lit rien et ne touche à aucune colonne du CRM.
- **`geocodes`** (`outils/sql/carte.sql`, V3.26) : la position de chaque adresse déjà cherchée, pour
  la carte — `cle` (l'adresse sans accents ni ponctuation), `adresse`, `lat`, `lng`, `precision`
  (`housenumber` · `street` · `locality` · `municipality` · `aucun`), `score`, `libelle`,
  `cherche_le`. RLS + `crm_authentifie`. Voir `src/lib/carte.ts`.
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
**Principal** — Dashboard · **Contacts** (« Clients » jusqu'à la V3.14) · **Biens** (V3.12, renommée en V3.13) ·
**Carte** (V3.26) ·
**Suivi** — Agenda · Visites · Relances · Documents (sous-menu ouvert par défaut : Créer un document ·
Liste des documents · Registre des mandats, V3.18) · Nouveau mail ·
**Analyse** — Mon activité · Paramètres.
La fiche client s'ouvre depuis une liste, elle n'est pas dans la barre. `/veille/import` n'est
accessible que par son adresse directe.

**Contacts** (`Clients.tsx`, V3.14) — des tuiles par type qui se cumulent (« Acheteurs » +
« Propriétaires » montre les deux ; « Tous » et « Archivés » sont seuls ; « Acheteurs » et
« Acheteurs non filtrés » se remplacent). Quand on ne regarde que des acheteurs : le tableau
détaillé d'avant, avec les rangées « Dossier » (statut) et « Son logement » (situation).
Sinon : une ligne par contact, la même pour tous (`LigneContact` dans
`components/contacts/ChampsContact.tsx`) — qui, types, ce qu'on suit (sa recherche, son bien et
son étape, son agence, son étude…), le joindre, dernier échange. La fiche s'ouvre selon le type
(`components/contacts/FicheContact.tsx`, `FicheSelonType`) : un acheteur a sa fiche d'acheteur,
avec ses types modifiables et « Ses biens » ; les autres ont une fiche de contact (bloc propre au
type, ses biens, notes, historique, « Il cherche aussi à acheter ? » qui ouvre une recherche).

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

**Biens** (`src/components/biens/`, logique dans `src/lib/biens-vente.ts`) — les biens
qu'Alexandre vend ou pourrait vendre pour un propriétaire : un projet à suivre, une estimation, un
mandat, jusqu'à la vente. Voir V3.12 et V3.13.
- **La liste** : une carte par bien (photo, étape, type de mandat, prix ou fourchette d'estimation,
  ligne d'état qui dit ce qui compte à cette étape, acheteurs qui correspondent, visites et
  offres). Catégories (`EnteteRubrique`) : Tous · À suivre · Estimations · Mandats en cours · Sous
  offre · Sous compromis · Vendus, puis En pause et Retirés quand il y en a, et « Archivés ».
  Recherche (adresse, ville, propriétaire, n° de mandat). Le bien ouvert vit dans l'URL :
  `?page=biens&bien=<id>`.
- **Nouveau bien** : une fenêtre demande d'abord où il en est (`FenNouveau`) — à suivre, une
  estimation, un mandat signé — et le bien est créé à cette étape (`creerBien(refs, etape)` ; un
  mandat laisse sa ligne dans le suivi).
- **L'éditeur** (plein écran, même moteur que les documents) : les étapes suivent l'étape de vente
  (`etapesDuBien()`, champ `pour` et titre `avant` de chaque étape) — à suivre : propriétaire, bien,
  notes ; estimation : dix étapes, « L'estimation et le prix » sans le mandat, pas de visite ni
  d'annonce ; à partir du mandat : les onze. Les questions voient l'étape sous `_stade` (jamais
  enregistré) : un champ `si: sousMandat` s'efface avant le mandat. Les questions sont rangées en
  blocs (un par titre de section). Le fil des étapes défile avec deux flèches quand il ne tient
  pas ; « Étape par étape / Tout sur une page » est dans la barre du haut (`biens.mode`). À
  droite, en colonne étroite : la carte, les chiffres, les mentions obligatoires (après le
  mandat). Un bien créé puis refermé vide est supprimé.
- **Les pièces** : une carte par pièce, son icône d'après son nom (`pictoPiece`) ; nom, niveau,
  surface, exposition en huit boutons, commentaire. On ajoute par des tuiles à icône
  (`PIECES_TUILES`), au niveau choisi ; la surface prend le curseur tout de suite. Rangées par
  niveau. Clé `detailPieces` (⚠️ `pieces` est leur nombre).
- **Les charges de copropriété** : champ `eurosAn` — par an ou par mois, l'autre se calcule, le
  trimestre s'affiche. Stocké en annuel (`chargesAn`).
- **La fiche** : bandeau (photo, prix, étape), onglets Vue d'ensemble · Photos · Le bien ·
  Surfaces (V3.30) · Visites et offres (à partir du mandat) · Acheteurs · Documents · Historique. Vue d'ensemble : le
  bien en bref (tuiles à icône), les observations et notes (V3.31), puis deux colonnes équilibrées. Le bien : l'annonce et les photos
  en haut, le détail par thème (lignes à icône, rangées en colonnes équilibrées), les pièces en
  tuiles. Photos : ajouter, ranger, légender sans l'éditeur. Chaque bloc a son « Modifier » qui
  ouvre l'éditeur à la bonne étape. Le bouton d'étape propose ce qui peut arriver ensuite (passer à
  l'estimation, mandat signé, offre, compromis, vente, pause, retrait, prix), chaque fois dans une
  fenêtre qui écrit l'historique.

**La fiche d'un confrère** (V3.19) — « Déléguer un mandat » (en haut) et « Ses délégations »
(`DocumentsDuClient` en mode `confrere` : les délégations dont `donnees.confrereId` est ce contact).
Sa société, sa carte et ses garanties, gardées par sa dernière délégation (`pro.juridique`),
s'affichent sous « Son agence ».

**Documents juridiques** (`src/components/documents/`, modèles dans `src/lib/actes/`) — mandat de
vente (simple, semi-exclusif, exclusif), offre d'achat, bon de visite. Formulaire à gauche, aperçu
« papier » à droite qui suit chaque réponse et défile jusqu'à la section de l'étape. Deux façons
de remplir, retenues dans `localStorage` (`documents.mode`) : **étape par étape** ou **tout sur une
page**. Le brouillon s'enregistre seul (800 ms). « Finaliser » fige le PDF avec l'identité de
l'agence du jour et vérifie que le n° du registre n'a pas déjà servi (autres documents non annulés
et `recherches.mandat_numero`) ; une fois le **registre des mandats** démarré (V3.18), c'est lui qui
donne le numéro à cet instant. Ensuite, selon « Comment sera-t-il signé ? » : **à la main**
(imprimer, faire signer, déposer le scan : « Il est signé »), **en ligne** (« Envoyer les liens de
signature » : un e-mail par signataire, suivi dans le panneau, relances, « Arrêter la signature »)
ou **sur place** (`SignatureSurPlace` : plein écran, chacun son tour avec son code, puis la
timeline de finalisation dont chaque étape est un vrai appel). Voir V3.11. Un mandat signé affiche ses échéances L215-1 (fenêtre d'un à trois mois avant
chaque reconduction). Pastille bleue dans le menu = documents « À faire signer ».
Sur la fiche d'un client (acheteur ou contact vendeur), le bloc **« Ses documents »**
(`DocumentsDuClient.tsx`) liste tout ce qui lui est rattaché (`documents.client_id`, et ses
mandats de recherche signés en ligne), avec l'exemplaire signé ; « + Nouveau document » ouvre
Documents avec ce client déjà choisi (intention `{ nouveau: clientId }`).
- **Les textes sont écrits à partir de la loi, pas copiés** d'un éditeur (Juridoc, Modelo…) :
  à faire relire par l'avocat d'Alexandre avant le premier usage réel.
- Les références de loi sont citées par leur nom (« Textes applicables »), sans annexe : le
  mandat reste court.
- « Mots rayés nuls » n'apparaît que sur un document signé à la main.
- Le mandat de vente guide selon le vendeur : personne seule (situation, accord du conjoint pour
  le logement de la famille, art. 215 C. civ.), couple, plusieurs propriétaires (« Ajouter un
  propriétaire »), SCI (Kbis, statuts, PV d'autorisation). Lots de copropriété en liste, base des
  tantièmes au choix (1 000 · 10 000 · 100 000). Maison : surface habitable et terrain, pas de Carrez.
- Un modèle = un objet `Modele` (étapes, champs, `rediger(d, identite)` → blocs communs au texte et
  au PDF). En ajouter un : un fichier dans `src/lib/actes/`, une ligne dans `MODELES`.
- Depuis le 27 septembre : **mandat de recherche papier** (simple ou exclusif ; une personne, un
  couple, plusieurs acheteurs ou une SCI ; signé, il remplit le bloc Mandat de sa recherche via
  `surRecherche`, et le vide s'il est annulé), **avenant au mandat de vente** (`deriver` : repris
  du mandat signé ; prix, honoraires, durée, bien et lots, actions, texte libre) et **courrier de
  reconduction L215-1** (`courrier: true` : « À envoyer » / « Envoyé », format lettre sans page de
  garde). Un mandat qui se poursuit par périodes reproduit en annexe les articles L215-1 à L215-3
  et L241-3 (obligatoire : article L215-4). Les clauses de l'article 78 (exclusivité, clause de
  suite, clause pénale) sont en CAPITALES. Puis l'**avenant au mandat de recherche** (V3.10), qui
  part d'un mandat signé en ligne ou sur papier et coche d'avance ce que la recherche a changé.
- Depuis la V3.18 : la **délégation de mandat** à un confrère (`lib/actes/delegation.ts` : depuis la
  fiche d'un mandat signé, Nouveau document, ou la fiche du confrère depuis la V3.19), jamais montrée
  dans l'espace du client ; et le **registre des mandats** (Documents › Registre des mandats,
  `PageRegistre.tsx`, `lib/registre.ts`), qui numérote les mandats une fois démarré.

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

**Découvrir — les nouveaux biens, un par un** (V3.44, `src/components/espace/Decouverte.tsx`). Un
bien nouveau, sans réponse et sans visite (`aDecouvrir`), ne s'ouvre plus en fiche : tous les
chemins passent par `ouvrirBien`, qui l'envoie dans « Découvrir », à sa place dans la file
(l'accueil et son bouton doré « Les découvrir un par un », la case « nouveaux biens », le bouton en
tête de « Nouveautés », les cartes de la liste et de la carte, `?bien=` et `?vue=neufs` des mails
et des notifications). Une carte à la fois : photos qui glissent, prix, « Voir le bien » (la fiche
de l'espace, en mode `decouverte` : galerie qui glisse, « Retour », trois grands boutons), puis le
curseur (« Pas pour moi » / « Ça me plaît », les mots se touchent aussi) et « Je veux le visiter »
au-dessus. La question qui suit reprend les PASTILLES ; le commentaire part sous la même forme.
- La réponse ne part qu'au bout de **cinq secondes** (« Annuler mon dernier choix ? », l'anneau
  doré) — ou tout de suite à la réponse suivante, à la fermeture, ou quand la page passe en
  arrière-plan (`envoyer(…, garder)` : keepalive).
- **Rien n'est noté « vu » tant qu'il n'a pas répondu** : celui qui s'en va au milieu retrouve ses
  nouveautés, et la file reprend au premier bien sans réponse, même après un rechargement
  (`sessionStorage` `emilio_decouverte`). C'est la route `retour` qui pose `vu_le` (et compte la
  vue) quand il répond ; « Voir le bien » envoie `vue` avec `apercu` : la ligne « Fiche consultée
  par le client » du CRM, sans toucher `vu_le`.
- Pas de rechargement automatique pendant la question ni pendant les cinq secondes
  (`dataset.decouverte`, comme `dataset.saisie` pendant la signature).
- La visite garde le mandat : `visiteBloquee()` reprend les conditions d'`enregistrerAvis`, qui
  ouvre la signature ; le bien reste à l'écran et s'en va de lui-même quand la demande est partie.
- Ordinateur (≥ 1024 px) : deux colonnes, les photos et leurs vignettes à gauche ; « Voir le bien »
  remplace la colonne de droite. Pas de « mot du conseiller » par bien : la colonne de droite
  montre le début de la description (aucun champ du CRM ne porte un mot par bien pour le client).
- Les classes sont préfixées `dec-` / `dg-` : la feuille de style de l'espace définit des classes
  génériques (`.plein`, `.fait`…) qui avaient d'abord noirci l'écran au banc d'essai.

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
| `POST /api/signer` | **publique** | Le co-signataire, depuis son lien : `afficher`, `code`, `signer`, `pdf`, `renoncer`, `decliner`. Un jeton de `documents_signataires` passe par `signerDocument()` (`afficher`, `code`, `signer`, `pdf`). La serrure est son jeton | Supabase, Mailjet |
| `GET /signer/<jeton>` | **publique** | Sa page (aussi sur `espace.emilio-immo.com/signer/…`) : lire, vérifier ses informations, signer au doigt | Supabase |
| `POST /api/mandat/cosignataire` | portail | Depuis la fiche : `renvoyer` son lien, `relancer` (lien neuf), `clore` l'invitation | `SUPABASE_SERVICE_ROLE_KEY`, Mailjet |
| `GET /api/mandat/relances` | **publique** (`CRON_SECRET`) | Chaque matin à 9 h UTC : rappels à 2 et 7 jours, alerte à Alexandre à 7 jours et à l'expiration du lien ; le 1er du mois, l'archive du registre des mandats | `CRON_SECRET` |
| `POST /api/registre/archive` | portail | L'archive du registre des mandats, à la demande : le PDF rangé dans `mandats/registre/` et envoyé par mail | `SUPABASE_SERVICE_ROLE_KEY`, Mailjet |
| `POST /api/documents/signature` | portail | Signature en ligne ou sur place d'un document : `lancer`, `renvoyer`, `annuler`, `code` et `signer` (sur place), `finaliser` (étapes `verifier` · `assembler` · `sceller` · `envoyer` · `classer`) | `SUPABASE_SERVICE_ROLE_KEY`, Mailjet |
| `POST /api/biens-vente` | portail | Fichiers privés d'un bien en vente : `depot` (sous `biens-vente/<id>/`), `lien` (5 minutes), `retirer`, `tout` (le bien est supprimé) | `SUPABASE_SERVICE_ROLE_KEY` |
| `POST /api/import-immofacile` | portail (badge revérifié) | L'import ImmoFacile : lit par lots (8 au plus) le texte libre de contacts sans nom ni coordonnées (`cle` neutre, statut, critères, précisions, commentaire coupé début + fin à 6 000 caractères) et rend ce que Claude y lit, nettoyé par `lireLecture`. Réponse coupée : les contacts complets sont gardés. N'écrit rien en base | `ANTHROPIC_API_KEY` |
| `POST /api/documents` | portail | Documents juridiques : `depot` (droit de dépôt d'un seul fichier sous `documents/<id>/`, le fichier part ensuite du navigateur), `lien` (5 minutes), `retirer` | `SUPABASE_SERVICE_ROLE_KEY` |

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
chapitre.

**Au 28 septembre (V3.20), les vingt-deux sont réglés ou sans objet** : chacun a été revérifié dans
le code avant d'être marqué ✅. On garde la liste pour ce qu'elle apprend (les mêmes pièges peuvent
revenir). Une anomalie nouvelle s'ajoute à la suite, avec sa date.

### Graves — perte ou corruption de données

1. ✅ **Réglé (constaté le 28 septembre).** `/veille/import` · `veilleMaj(url, champs)` filtrait
   uniquement sur `url`. Il prend maintenant `recherche_id` en troisième argument et **refuse** de
   toucher une annonce proposée à plusieurs recherches sans lui : plus rien n'est écrasé d'un coup.
2. ✅ **Réglé le 28 septembre (V3.17)** — voir §11. Ce qui était constaté :
   **les écritures Supabase sans remontée d'erreur, partout.** `addJournal` ne vérifie jamais rien
   (dix-huit appels). `/api/espace/<action>` ne vérifie **aucune** de ses écritures et répond
   `{ ok: true }` même si toutes ont échoué. Idem dans `FicheClient` (une trentaine de points),
   `ParcoursBien`, `OngletBiens`, `OngletVeille`, `PageRelances`, `PageMail`, `send-mail`.
   `PageVisites` est à moitié corrigé : l'enregistrement du compte rendu remonte son erreur, mais
   ni l'insert dans `envois`, ni l'update du bien, ni l'annulation.
   C'est la famille de bugs qui a rendu les relances muettes pendant des semaines : ça dit
   « enregistré », il n'y a pas d'erreur, et rien ne se passe.
3. ✅ **Réglé le 28 septembre (V3.17)** : « Le contact est créé, mais sa recherche : pas
   enregistré » s'affiche. Ce qui était constaté : **`Clients.tsx` — l'insert de la recherche
   n'était pas vérifié** alors que celui du client l'était.
   En cas d'échec, le client existe **sans aucune recherche** : sa fiche ne peut rien afficher.
4. **`PageParametres` — les valeurs par défaut affichées ne sont jamais persistées** si le champ
   n'est pas touché : le bouton n'enregistre donc pas tout ce qu'on voit. ✅ Réglé le 27 septembre :
   `save()` vérifie l'erreur et n'écrit plus que les clés modifiées (il réécrivait toutes les
   valeurs lues à l'ouverture, écrasant ce qui avait changé entre-temps), et il n'apparaît plus sur
   les rubriques qui s'enregistrent seules (Agence, Point automatique, Alertes mail).

### Sécurité

5. ✅ **RÉGLÉ le 23 septembre 2026.** Le RLS était désactivé sur les 14 tables, et le rôle `anon`
   — dont la clé est lisible dans le code de n'importe quelle page publique — avait `SELECT`,
   `INSERT`, `UPDATE`, `DELETE` **et `TRUNCATE`** sur toutes. N'importe qui pouvait donc copier ou
   vider le fichier clients. Voir la V3.6 au §11 pour ce qui a été fait.
   État vérifié après coup, depuis l'extérieur, avec la clé publique tirée de la page de
   connexion : `clients`, `biens` et `journal` renvoient `[]`.
6. ✅ **Réglé le 28 septembre (V3.20).** Les champs sont partis de l'écran : les clés Mailjet (avec
   toute la carte « SMS Mailjet », jamais branchée), l'identifiant et le « nouveau mot de passe ».
   `outils/sql/parametres-secrets.sql` efface ce qui avait été enregistré (à lancer une fois ; le
   CRM fonctionne sans). Ce qui était constaté : `PageParametres` écrivait ces secrets **en clair**
   dans `parametres.valeur`, et aucun ne servait (connexion par Supabase, mails par Vercel).
7. ✅ **Réglé (constaté le 28 septembre).** La recherche du haut cherche dans le navigateur, sur le
   fichier des contacts ; son filet `.or(ilike)` retire virgules, parenthèses, guillemets, `%` et
   `*`. Ce qui était constaté : la saisie partait telle quelle dans le filtre.

### Écrans morts ou trompeurs

8. ✅ **Réglé le 28 septembre (V3.20).** Les quatre chiffres lisent les dossiers : clients actifs,
   biens présentés ce mois (`biens.envoye_le`), visites faites ce mois, CA HT du mois
   (`src/lib/activite.ts`, voir §11). Les trois cartes aussi : transactions en cours (étape, prix,
   acte prévu ; un clic ouvre l'onglet Transaction de la fiche), les cinq prochaines visites, les
   sept dernières lignes du journal. Ce qui était constaté : `0` en dur et trois blocs vides.
9. ✅ **Réglé le 28 septembre (V3.20).** « CA total HT » additionne les transactions clôturées
   (honoraires HT de l'étape Acte) et les biens « Vendu » (honoraires encaissés TTC ÷ 1,2), avec
   l'année en cours et la part chasse / vente. « Mails envoyés aux clients » ne compte plus les
   comptes rendus de visite ; « Clients acheteurs » ne compte plus les notaires ni les confrères.
   Ce qui était constaté : `0 €` en dur, et des envois gonflés.
10. ✅ **Réglé (constaté le 28 septembre).** « Ouvrir la fiche » ouvre la fiche du client, au bon
    onglet ; « Reporter » fait choisir la date, proposée à aujourd'hui + le délai des Paramètres
    (voulu : une relance en retard revient dans le délai normal).
11. ✅ **Réglé (constaté le 28 septembre).** `Topbar` ne lit plus aucune colonne de critères : nom,
    référence, et ce qui a été trouvé (adresse, mail, téléphone).
12. ✅ **Réglé (constaté le 28 septembre, et V3.20).** La page « Recherche en cours » n'existe plus ;
    la pastille « clients actifs » est partie en V3.14 (sa requête, restée, est retirée en V3.20) ;
    les compteurs se rafraîchissent après chaque action (`EVT_MAJ`), au retour sur l'onglet et
    toutes les 20 s.
13. ✅ **Réglé le 28 septembre (V3.20).** `src/lib/mail-variables.ts` : `{{prénom}}` (ou `{{prenom}}`),
    `{{nom}}`, `{{reference}}`, `{{conseiller}}` — accent, casse et espaces libres, l'objet compris,
    dans les mails libres, de biens et de visites ; une variable inconnue reste visible. La signature
    se lit dans les Paramètres (« Nouveau mail » et les envois de la fiche) ; le modèle « Sélection
    de biens » pré-remplit « Envoyer la sélection » ; « Email de relance J+5 », lu par personne, est
    retiré. La case SMS (fiche et Nouveau mail) est retirée : elle n'envoyait rien. Le message
    pré-rédigé « Sélection de biens » de Nouveau mail aussi : il annonçait des biens qu'un mail libre
    ne contient pas. La version texte des mails ne double plus « Bonjour » ni la signature.
    Ce qui était constaté : seul `{{prénom}}` avec l'accent était remplacé.
14. ✅ **Réglé le 28 septembre (V3.20).** Sans recherche, l'onglet Veille le dit au lieu de charger
    pour toujours ; « Retenir » n'écrit plus qu'une ligne au journal (avec la recherche et le bien) ;
    le `date_annonce` des anciennes propositions sert de `date_publication`.
15. ✅ **Réglé (constaté le 28 septembre, et V3.20).** Les visites annulées ont leur groupe
    « Annulées » ; le compte rendu reste dans `envois` (le Suivi l'affiche comme une communication)
    mais ne compte plus comme un mail dans Mon activité, et ses écritures secondaires (avis sur le
    bien, ligne du suivi, journal) disent leur échec en rouge.
16. ✅ **Réglé le 28 septembre (V3.20).** `offre_ecrite` est dans le type `StatutClient` (ancien
    statut, encore présent sur des fiches) et dans la recherche du haut, qui écrit aussi « bien
    trouvé » sans tiret bas. `raison_perte` sert désormais (clôture). Restent déclarés sans usage,
    sans danger : `Relance.bien_id`, `Relance.resultat`.

17. ✅ **Réglé le 28 septembre (V3.20), les deux ensemble.** `addJournal(…, lien)` écrit
    `recherche_id` (et `bien_id`) quand la ligne parle d'une recherche : les appels de la fiche, du
    mandat en ligne et de l'agenda, et `/api/send-mail`. L'onglet Suivi montre la recherche ouverte
    et les lignes sans recherche ; celles d'une autre recherche se rajoutent d'un clic (« + N d'une
    autre recherche »), marquées de son nom. **Rien ne disparaît.** Venu d'une relance, la ligne visée
    s'affiche même si elle est sur une autre recherche. Ce qui était constaté : `addJournal()`
    n'écrivait ni recherche ni bien, et le Suivi mélangeait les recherches d'un même client.

18. ✅ **Réglé le 28 septembre (V3.20).** Le `.ics` se replie par octets UTF-8, sans couper un
    caractère (75 octets par ligne, espace de reprise compris). Ce qui était constaté : le repli
    comptait les caractères.

19. ✅ **Réglé le 28 septembre (V3.20).** Un mail parti sans recherche (« Nouveau mail ») est rangé,
    envoi et journal, dans la recherche que la fiche du client ouvre d'office : la première dont la
    veille tourne, sinon la première tout court (la fiche suit désormais cette règle, comme la liste
    des contacts). Ce qui était constaté : ces envois n'apparaissaient dans aucun onglet Suivi.

20. ✅ **Sans objet (vérifié le 28 septembre).** `recherches.active` est devenu le drapeau de la
    veille **par recherche** : deux recherches actives d'un même client, ce sont deux veilles voulues.
    `creerRecherche()` vérifie son erreur depuis le 23 septembre. Les écrans qui n'en montrent qu'une
    prennent l'active, sinon la première (liste des contacts, point automatique) : c'est voulu.

21. ✅ **Réglé le 28 septembre (V3.20).** `interphone` et `digicode` sont dans `BOOLEENS` : les
    colonnes suivent ce que le client règle dans son espace.

22. ✅ **Réglé le 28 septembre (V3.20).** `outils/espaces-jsx.py` ne lit plus que les `.tsx`, et
    ignore les commentaires sur plusieurs lignes, les fins d'import, les attributs nus et les
    ternaires : de 71 signalements à 5, tous de vrais textes après une balise sur deux lignes, qui
    portent maintenant `{' '}`. **Il sort en code 0** : il peut servir de barrière avant de livrer.
    (Le code compilé montrait ces cinq espaces bien gardées par le SWC actuel ; `{' '}` ne coûte
    rien.)

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
1. **Données de marché DVF, dans le CRM uniquement** (jamais dans l'espace client) :
   `https://files.data.gouv.fr/geo-dvf/latest/csv/{année}/communes/{dept}/{insee}.csv` — structure
   vérifiée, 2021 à 2025 disponibles. ⚠️ `api.cquest.org` renvoie des 502, écarté.
2. **Découper `recherche-immobiliere-emilio/SKILL.md`** (91 Ko) en `SKILL.md` + `references/`.

Réglés ou abandonnés (28 septembre) : la signature électronique du mandat « avec Yousign » est
faite autrement (signature maison, V3.9 et V3.11) ; les vérifications sur téléphone (notifications
iPhone, avertissement Play Protect) sont abandonnées à la demande d'Alexandre.

### À décider

- **Le mandat de recherche signé en ligne** dit que le budget se modifie « depuis son espace
  personnel » (`src/lib/mandat.ts`) ; le CRM prévient Alexandre quand la recherche dépasse le mandat,
  pour qu'il propose un avenant. Le mandat papier, lui, exige désormais un avenant (V3.20). À
  trancher avec l'avocat, à la relecture des modèles : on ne touche pas au texte en ligne sans lui
  (il change la version du modèle approuvé).

- **Renforcer la preuve des signatures en ligne** (discuté le 28 septembre). Aujourd'hui : signature
  électronique **simple** (code à usage unique par e-mail, signature tracée, IP, appareil, heure du
  serveur, empreinte SHA-256, certificat en dernière page, exemplaire envoyé à chacun). Valable, mais
  sans présomption de fiabilité : en cas de contestation, c'est à l'agence de la prouver (Cass. 3e civ.,
  5 mars 2026, n° 24-21.034). Points faibles : l'agence garde seule les preuves, l'heure vient de son
  serveur, le PDF ne porte pas de sceau cryptographique (le tampon dessiné n'est qu'une image). Pistes,
  par rapport coût / sécurité : (1) **horodatage qualifié eIDAS** de l'empreinte par un tiers (RFC 3161 ;
  on n'envoie que l'empreinte ; ex. Datasure : 199 € de mise en place, 49 €/mois, 0,15 € le jeton) —
  prouve la date **et** l'intégrité ; (2) code SMS en plus du mail ; (3) **cachet électronique** dans le
  PDF avec un certificat d'autorité (Certigna RGS* logiciel, à partir de 307 € HT/an ; qualifié à partir
  de 1 303 € HT/an, sur support dédié) — un certificat fabriqué maison serait « identité inconnue »
  dans Adobe ; (4) Yousign (avancée) pour les documents les plus sensibles. À faire relire par l'avocat
  avec les modèles.

Réglé le 28 septembre (V3.20) : le mandat de recherche **papier** ne dit plus que le prix se change
« par un simple e-mail » ; comme le mandat de vente, il ne change que d'un commun accord, par
avenant écrit signé des parties (l'avenant au mandat de recherche existe depuis la V3.10).

### Les grands chantiers (liste d'Alexandre, 28 septembre)

Chacun est un projet en soi, à ouvrir quand Alexandre le décide :

1. **Diffuser les annonces depuis le CRM** (SeLoger, Leboncoin… et le site emilio-immo.com), à la
   place d'Immofacile. Les faits réunis sont juste en dessous (« À l'étude »). Première étape : poser
   la question aux portails (acceptent-ils un logiciel développé en interne ?), ou choisir un
   multidiffuseur.
2. **Les prix de vente réels dans le CRM** (DVF, data.gouv.fr) : décidé, voir « Décidé, pas encore
   construit » point 1. Dans le CRM seulement, jamais dans l'espace client.
3. **L'atelier d'estimation et l'avis de valeur en PDF** : comparables (DVF + biens suivis), prix au
   m², plus et moins du bien, fourchette, et un avis de valeur signé à remettre au vendeur.
   Gardé de côté depuis la V3.16 ; s'appuie sur le chantier 2.
4. **Le PDF d'une sélection de biens** : jsPDF + html2canvas (⚠️ pas encore dans `package.json`),
   page de garde, une fiche par bien, la note du conseiller, dépôt dans le Storage, pièce jointe
   Mailjet.
5. **Le scoring de compatibilité bien ↔ recherche.** Couche 1 : critères durs, pondération des
   champs structurés, faisable tout de suite et gratuit. Couche 2 : envoyer les critères, **les
   notes libres de la recherche** et la description de l'annonce à Claude pour repérer ce qui ne se
   met pas en colonne (calme, travaux, exposition, état), seulement sur les biens ayant passé un
   seuil en couche 1. Les notes libres sont une consigne de matching en langage naturel.

### À l'étude — diffuser les annonces depuis le CRM, plus depuis Immofacile (28 septembre)

- Pas d'API chez SeLoger ni Leboncoin : une **passerelle** dépose chaque jour un fichier sur leur
  serveur. Format commun : **Poliris** (celui de SeLoger) — un `Annonces.csv` d'environ 300
  colonnes numérotées, séparateur `!#`, CP-1252, plus les photos (ou leurs URL), dans un zip
  déposé par FTP ; identifiant agence et accès fournis par chaque portail après un test.
- Deux voies : en direct (chaque portail doit accepter un logiciel développé en interne — LA
  question à leur poser), ou un multidiffuseur (Ubiflow…) : un seul flux, redistribué ; abonnement
  en plus. Les abonnements pro des portails restent payés à part dans les deux cas.
- Les photos des biens sont déjà dans un bucket public (`photos-vente`) : le flux donne leurs URL.
- Les mentions obligatoires sont déjà des champs de la fiche (DPE, GES, valeurs, date, dépenses
  d'énergie, lots, charges, procédure, honoraires) : reste à faire la table de correspondance.
- Le site emilio-immo.com lit aujourd'hui un **flux XML d'Immofacile** (ses mandats en cours) : le
  CRM publierait le sien, idéalement au même format pour que le site n'ait qu'une adresse à
  changer. Ce flux Immofacile peut aussi servir une fois à importer les biens en cours.

### Plus tard

- **SMS à chaque dépôt de bien** (API SMS d'OVH, un SMS groupé par client et par fenêtre de 2 h) :
  pas utile pour le moment (Alexandre, 28 septembre). WhatsApp écarté (vérification Meta, modèles
  approuvés).
- Un **mail de relance automatique** après un envoi (aujourd'hui, la relance est une tâche pour
  Alexandre ; le modèle « Email de relance J+5 », lu par personne, a été retiré en V3.20) ·
  Export Excel · Corbeille avec archivage à J+30 · Multi-utilisateur. (L'extension aux vendeurs
  est faite : V3.12 à V3.14 ; le tableau de bord est branché : V3.20.)

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
- **Pas de noir dans le CRM** (demande d'Alexandre, 27 septembre) : le marine `#1a2332`, qui se
  lit comme du noir, a laissé la place au **bleu Emilio**, celui des en-têtes de rubrique
  (`src/styles/globals.css`) : `--emilio` (`#34496e`) pour les titres, les noms et le texte fort,
  `--emilio-fond` (le dégradé `#3a5178 → #2e4166`) pour les pastilles, les icônes et les boutons
  pleins, `--emilio-clair` au survol. **Le noir discret ne reste que sur les filtres** (situation,
  tri « dernière modif », « Tout » des Documents, pastilles des en-têtes) et sur l'aperçu papier des
  documents, qui imite le PDF. L'espace client, l'écran de connexion et les mails gardent leur
  marine. Tout nouvel écran du CRM prend `var(--emilio)`, jamais `#1a2332`.
- **Les montants s'écrivent en entier** (demande d'Alexandre, 28 septembre) : `1 500 000 €`,
  `380 000 €`, avec les séparateurs de milliers — **jamais** `1,5 M€`, `1,5 M` ni `380 k€`. Le chiffre
  complet se voit mieux. Forme : `Math.round(n).toLocaleString('fr-FR')` suivi de ` €`. Vaut pour tout
  le CRM (budgets, prix, filtres, graphiques) ; les textes des documents juridiques étaient déjà en
  entier.

---

## 10. Hors périmètre

- **Pas de diffusion portails** — reste sur Immofacile, faute de partenariats techniques
  reproductibles par un développeur indépendant.
- Pas de comptabilité, pas de signature électronique (pour l'instant), pas de multi-agence.

---

## 11. Historique

V3.0 à V3.11 dans l'ordre ; à partir de la V3.12, la plus récente en premier.

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

### V3.7 — 26-27 septembre 2026 · les documents juridiques

**Une rubrique Documents dans le menu**, entre Relances et Nouveau mail : mandat de vente
(simple, semi-exclusif, exclusif), offre d'achat, bon de visite, rédigés depuis le CRM et signés
sur papier. Détail au §3 (« Documents juridiques ») ; table `documents` au §2 ; route
`/api/documents` au §5.

**Ce qui a été construit autour :** `src/lib/mandat-pdf.ts` sait faire une page de garde, un
en-tête et des cadres de signature papier pour n'importe quel document (le PDF du mandat de
recherche en ligne est resté identique octet pour octet, vérifié) ; `src/lib/actes/` contient les
modèles et leurs règles (charge des honoraires vendeur/acquéreur, prix en lettres, durée modifiable,
échéances L215-1).

**Migration** : `outils/sql/documents.sql` — **passée le 26 septembre** (`rls = true`, 1 politique).

**À venir, dans cet ordre** : le mandat de recherche papier (simple et exclusif), l'avenant au
mandat de vente (baisse de prix, prolongation), le courrier L215-1 au vendeur ; puis la signature
en ligne de ces documents et leur place dans l'espace client (« Mes documents »).

### V3.8 — 27 septembre 2026 · mandat de recherche papier, avenant, courrier de reconduction

**Trois modèles de plus** dans Documents (détail au §3). Le mandat de recherche papier ne remplace
pas celui en ligne : il couvre l'exclusif, les couples, les SCI et la signature sur place.

**Relu par un second agent** avant la mise en ligne. Corrigé à cette occasion, sur le mandat de
vente aussi :
- la clause de suite devient une indemnité (clause pénale), non cumulable avec la clause pénale
  de l'exclusivité — elle disait « les honoraires restent dus », ce qui est faux sans entremise ;
- les clauses de l'article 78 passent en capitales (les encadrés gras ne suffisaient plus à les
  distinguer : CA Amiens, 6 janvier 2022) ;
- préemption (Cass. 3e civ., 19 décembre 2024), non-cumul des honoraires si l'agence a aussi le
  mandat de vente, acquisition par une société constituée pour l'achat ;
- le mandat dit comment s'opposer à la reconduction (par écrit, au plus tard la veille) ;
- l'échéancier L215-1 se compte depuis la date limite de refus (échéance le 1er du mois) ;
- l'avenant ouvre la rétractation dès qu'il est signé hors de l'agence, quel que soit son objet ;
  un mandat terminé ne se prolonge pas par avenant.

**À faire relire par l'avocat**, en plus des textes : l'article L215-1-1 (résiliation en ligne)
pourrait imposer, puisque l'agence fait signer en ligne, d'ouvrir aussi une résiliation en ligne
pour tous ses mandats ; la couverture géographique de l'assurance RCP n'est pas indiquée dans
l'information précontractuelle (article R111-2).

**Chantier suivant, décidé avec Alexandre** (fait en V3.9) : la signature en ligne à plusieurs. Fiche client
« une personne / un couple » ; dans l'espace, « J'achète via une société » et « Ajouter un
co-acquéreur » (chacun son lien et son code, le mandat n'est complet qu'aux deux signatures,
relances J+2 et J+7) ; signer seul reste la voie par défaut, avec un rappel clair et une case
« je certifie que les informations sont exactes ». Puis la signature en ligne des avenants (vente
et recherche) dans l'espace du client, et l'avenant au mandat de recherche.

### V3.9 — 27 septembre 2026 · signer le mandat à plusieurs, ou via une société

**Dans l'espace (étape 2 de la signature)** : « Vous achetez : en mon nom / via une société » et
« Qui signe le mandat ? ». Signer seul reste la voie par défaut, avec un encadré « Vous signez
seul » (son engagement vaut aussi pour la personne avec qui il achète et pour sa société) et une
case obligatoire « Je certifie que les informations que j'ai renseignées sont exactes et
complètes… ». « Ajouter mon conjoint ou un co-acquéreur » : civilité, nom, naissance, e-mail,
téléphone facultatif, « même adresse que moi » (4 personnes au plus). Une fiche « couple » arrive
pré-remplie avec la personne 2. « Via une société » : il la retrouve dans le registre public
(`src/lib/entreprises.ts`, API Recherche d'entreprises de l'État, appelée du navigateur) — nom,
forme, SIREN (vérifié), siège, greffe quand le département n'en a qu'un, sa fonction s'il figure
parmi les dirigeants ; Kbis facultatif (photo réduite dans le navigateur, 3 Mo au plus).

**À sa signature** (`/api/espace/mandat`, étape `signer`) : la ligne passe en `partiel`, chaque
co-signataire reçoit son lien, le PDF (« en attente de Claire ») lui est envoyé, la recherche porte
le mandat (ses visites peuvent partir : le texte l'engage dès sa signature), la fiche passe en
couple. « Mon mandat » montre qui a signé et qui on attend, avec « Renvoyer le lien » et
« Corriger son e-mail » (lien neuf, l'ancien ne marche plus) ; l'accueil le dit aussi.

**Le co-signataire** (`/signer/<jeton>`, `src/components/signer/SignatureCosignataire.tsx`) :
accueil, récapitulatif, ses informations (il corrige ce que le premier a saisi — noté au
déroulé), son code (15 minutes à partir de sa demande), son choix d'exécution, sa signature au
doigt. « Je ne suis pas concerné » ferme son invitation. À chaque signature le PDF est refait et
scellé ; le certificat liste chaque signataire et cite l'empreinte des versions précédentes.

**Délais** : lien valable 15 jours ; rappels à 2 et 7 jours (cron `/api/mandat/relances`, qui a
besoin de `CRON_SECRET` sur Vercel, comme le point automatique) ; à l'expiration, Alexandre choisit
dans la fenêtre « Mandat de recherche » : lien neuf, ou clore (le mandat continue au seul nom des
signataires, version définitive envoyée). Rétractation : 14 jours après SA signature, prolongés si
un autre signe pendant qu'ils courent (`finRetractationPour`). `finRetractation` compte désormais
les jours fériés (L221-19).

**Relu par un second agent** : case d'exécution immédiate propre à chaque signataire, « premier
signataire » défini, solidarité limitée aux honoraires d'un achat commun, un invité qui décline
n'est pas partie (sa fiche et son cadre disparaissent), formulaire de rétractation au modèle
« Je/nous (*) », variante société sans solidarité personnelle (risque de cautionnement) mais avec
son engagement propre et un porte-fort adapté aux associés.

**À faire relire par l'avocat** : la rétractation du premier signataire qui met fin au mandat pour
tous ; une seule signature pour la société et en son nom personnel ; rendre le Kbis obligatoire
(pouvoirs, obligations anti-blanchiment) — laissé facultatif à la demande d'Alexandre.

**Corrigé en passant** : après six codes, un client restait bloqué pour toujours (le compteur
repart après une heure sans code) ; « Mon mandat » disait « renouvelé chaque mois » alors que le
mandat en ligne dure 12 mois sans reconduction ; un certificat de deux pages faussait le « 3 / 8 »
du pied des pages du mandat (on refait le mandat avec le bon compte).

**Vérifié** : texte et PDF du signataire seul identiques octet pour octet ; 45 contrôles de bout en
bout sur un Supabase en mémoire (seul sans le SQL, à deux, corrections, relances, déclin,
clôture, société, renonciation, compteur de codes) ; captures 390 et 1280 de chaque écran.

**Ajouté le 27 septembre** : le rappel des 7 jours devient « Dernier rappel » (sujet et texte
différents, avec le nombre de jours qui restent avant que le lien ne marche plus).

### V3.10 — 27 septembre 2026 · l'avenant au mandat de recherche

**Un modèle de plus dans Documents** (`src/lib/actes/avenant-recherche.ts`). Il modifie un mandat
de recherche signé, **en ligne ou sur papier** : prix maximum, bien recherché (types, pièces,
chambres, surface, critères), secteurs, honoraires (taux ou forfait, jamais au-dessus du
barème), durée (prolongation avant le terme), et une **clause particulière en texte libre**. Le
reste du mandat est inchangé, l'avenant se rattache au numéro du registre du mandat.

**D'où partent ses réponses** (`preparerDepuis`, dans `components/documents/outils.ts`) : le
modèle vierge avec le client et la **recherche du moment** (le « nouveau »), ce que le **mandat**
dit (l'« actuel » ; un mandat en ligne est lu dans `mandats_signatures` et ses co-signataires par
`donneesMandatEnLigne`), puis ce que les **avenants déjà signés** à ce mandat y ont changé
(`Modele.enchainer`, aussi écrit pour l'avenant de vente), enfin `Modele.preparer` : ce qui
diffère entre l'actuel et le nouveau est **coché d'avance** (le client a monté son budget,
ajouté Issy : prix et secteurs sont cochés). L'avenant prend le numéro suivant de ceux déjà faits
à ce mandat (hors annulés), filtré sur `donnees->>mandatNumero`.

**Trois portes** : la fiche client (fenêtre « Mandat de recherche » : « Préparer un avenant »
sur le mandat signé, en ligne ou hors ligne, et « Préparer l'avenant » dans l'encadré « Sa
recherche dépasse son mandat signé » ; s'il y en a déjà un en route, « Ouvrir l'avenant en
cours ») — elle ouvre Documents avec une intention (`IntentionDocuments`, passée par
`AppLayout`) ; le panneau d'un mandat dans Documents (en ligne ou papier) ; et « Nouveau
document › Avenant… » qui demande **d'abord le mandat** (`mandatsPour` : tous les mandats,
cherchés par nom, numéro, adresse ; le client vient avec) — vaut aussi pour l'avenant de vente et
le courrier de reconduction. « Aucun mandat : je saisirai tout » reste possible.

**Signé** (papier, « Il est signé ») : `surRecherche` met à jour la fin du mandat et ses
honoraires sur la recherche s'ils changent (jamais le numéro ni la date ; l'annuler ne vide rien).
Les limites du mandat en ligne tiennent compte des avenants signés (`contenuApresAvenants`) :
l'encadré « dépasse » de la fiche et le mail d'alerte (`alerteHorsMandat`, qui propose désormais
un avenant plutôt qu'un nouveau mandat) ne sonnent plus pour ce qu'un avenant a déjà couvert.

**Relu par un second agent** : assiette des honoraires reprise du mandat (« du prix d'achat »
en ligne), nom « non exclusif » pour le mandat en ligne, extension aux critères qui évoluent
rappelée après la nouvelle description, indemnités égales aux honoraires recalculées et
exclusivité prolongée (en capitales, mandat papier), rétractation comptée depuis la dernière
signature et qui met fin à l'avenant pour tous, droit de rétractation conservé même avec
application immédiate (la rétractation a été retirée des avenants en V3.11). Contrôles ajoutés : mandat pas encore signé, mandat en ligne encore en
attente d'un co-signataire, mandat en ligne « exclusif », avenant daté avant le mandat,
prolongation qui ne s'appliquerait qu'après la fin du mandat, clause libre qui parle
d'exclusivité ou de prolongation. **À faire relire par l'avocat** avec le reste.

**Chantier suivant, décidé avec Alexandre** : chaque document au choix **à la main** (imprimé,
« mots rayés nuls » comme aujourd'hui), **en ligne** (un lien par signataire, code par e-mail,
signature au doigt, PDF scellé et certificat, relances) ou **sur place** (sur l'ordinateur ou la
tablette d'Alexandre, chaque signataire à son tour avec son code reçu sur son propre e-mail,
grand cadre de signature, puis une timeline de finalisation d'une quinzaine de secondes dont
chaque étape est réelle). Pour le mandat de vente, les avenants, le mandat de recherche papier,
l'offre d'achat ; le bon de visite sur place, au doigt pendant la visite. Les vendeurs signent
par lien (l'espace vendeur viendra plus tard).

### V3.11 — 27 septembre 2026 · chaque document se signe à la main, en ligne ou sur place

⚠️ **À passer dans Supabase avant de mettre le code en ligne** : `outils/sql/signature-documents.sql`
(colonne `documents.signature`, table `documents_signataires`). Sans elle, le panneau le dit et
propose la signature à la main.

**La question « Comment sera-t-il signé ? »** (`CHAMP_SIGNATURE`, `src/lib/actes/commun.ts`) dans
les six modèles : **à la main** (le papier d'avant, octet pour octet), **en ligne**, **sur place**.
Par défaut : papier pour les deux mandats, en ligne pour les avenants et l'offre, sur place pour
le bon de visite. Un document enregistré avant cette question se signe à la main. En électronique,
« Date et signatures » dit comment chacun signe et les cadres se remplissent au fil des signatures
(`blocsSignature`) ; chaque modèle donne ses cadres (`Modele.cases` : vendeurs, société,
conjoint, acquéreurs, visiteurs, agence) et la case à cocher qui remplace la mention manuscrite
(`Modele.accepter(d, cle)` — le conjoint donne son accord, il ne devient pas mandant).

**En ligne** : `src/lib/signature-documents.ts` (serveur) et `/api/documents/signature`.
L'agence signe au lancement ; un lien par signataire (e-mail demandé avant l'envoi s'il manque),
code à 6 chiffres par e-mail, signature au doigt ; à chaque signature, version scellée (empreinte
SHA-256 + certificat) envoyée au signataire et alerte `document_signe` à Alexandre ; à la
dernière, exemplaire complet à chacun, document `signe`, `surRecherche` et journal. Rappels J+2
et J+7, puis Alexandre prévenu à l'expiration (`relancerDocuments`, dans le cron
`/api/mandat/relances`). La page du signataire est `/signer/<jeton>`
(`components/signer/SignatureDocument.tsx`) ; l'acheteur voit aussi « Un document vous attend »
et « Vos documents signés » dans son espace (`CarteDocuments`).

**Sur place** (`components/documents/SignatureSurPlace.tsx`) : chacun son tour sur l'écran
d'Alexandre, relit l'essentiel, reçoit un code sur **sa propre** adresse, coche, signe dans un
grand cadre ; « X signera plus tard » lui envoie son lien. Puis la finalisation : cinq étapes
réelles (vérifier, assembler, sceller, envoyer, classer), 3,2 s minimum chacune, reprise à
l'étape qui a échoué.

**Relu par un second agent, puis corrigé** : case à part pour commencer avant 14 jours
(`demandeExpresse` : L221-25, la demande doit venir du client, pas du choix écrit d'avance ;
refusée côté serveur si elle manque), texte propre au conjoint, « Réponse du vendeur » de l'offre
en ligne (l'Agence reçoit l'acceptation pour l'acquéreur ; une contre-proposition vaut refus),
mention électronique exacte pour l'agence, « adresse e-mail vérifiée » (et non « identité »),
« Certificat de signature » (sans « électronique », pour ne pas évoquer un prestataire qualifié),
formulaire « Conclu le » = dernière signature. Les 14 jours ne s'annoncent que si le document
les contient (`aRetractation`).

**Les avenants n'ouvrent plus de délai de rétractation** (décision d'Alexandre, à confirmer par
son avocat) : ils modifient un mandat dont les 14 jours ont déjà couru. Ni clause, ni formulaire,
ni choix « appliquer avant 14 jours », ni question « Où sera-t-il signé ? ». Un « avenant » qui
refait tout le contrat est un nouveau mandat.

**Couleurs** : le CRM n'a plus de noir (§9) ; l'écran sur place est en bleu Emilio. La page du
signataire et l'espace gardent leur marine.

**À faire relire par l'avocat** avant le premier usage réel : toutes les mentions électroniques,
les cases à cocher, la réponse du vendeur, le certificat.

### V3.67 — 4 octobre 2026 · espace acheteur : « Ma recherche » refaite, aux couleurs d'Emilio

Rien à passer dans Supabase.

Alexandre n'aimait pas la présentation de « Ma recherche » (neuf cartes pareilles, empilées, le budget
tout en bas, des émoji). Maquettes sur une planche (A à G) ; choix : « le A, l'essentiel d'abord », aux
couleurs d'Emilio, avec du B « ce qui ferait la différence », « ce que vous évitez », « noté par
Alexandre », et « des icônes partout, pour que ce soit plus vivant ». Rien d'inventé : tout vient de la
recherche du CRM, une rubrique sans rien à dire ne s'affiche pas.

- **`Recherche`** (`EspaceClient.tsx`, réécrite) : un bandeau bleu Emilio (`#1b365d`, la couleur du logo,
  et le logo blanc `/logos/logo-emilio-blanc-800.png`) avec la phrase (`morceauxResume`, nombres
  insécables) et jusqu'à trois cases à icône (surface minimum, pièces et chambres, budget) ; puis « Où
  vous cherchez » (villes, quartiers, arrêts et leurs lignes), « Le bien » (une ligne à icône par
  critère : type, état, année, séjour, surface et pièces maximum, dernier étage), « Indispensable » et
  « Ce qui ferait la différence » (les niveaux `exigences` du CRM : indispensable / souhaité ;
  équipements, extérieur, cuisine, exposition), « Ce que vous évitez » (étages exclus, au-dessus du Xe
  sans ascenseur, les lettres du DPE écartées), le projet (échéance, financement, apport, une icône
  chacun), le mot d'Alexandre (« Noté par Alexandre », en lecture seule ; « Ajouter une précision »
  ouvre le message), « Mes critères ont évolué ». Sur ordinateur, deux colonnes (`.mr-cols`).
- Icônes ajoutées à `T` : `balcon`, `banque`, `portefeuille`. Partis : `CatE`, `Fait`, `PastilleE`,
  `ICONE_TYPE` (ne servaient qu'à l'ancienne vue). Styles : `.mr-*`.

### V3.66 — 3 octobre 2026 · Documents : l'onglet choisi en intercalaire, et l'arrivée sur « Signatures en cours »

Rien à passer dans Supabase.

Alexandre, sur la liste des documents : « quand on arrive, il faut que ça arrive sur Signatures en cours
s'il y en a, sinon dans Tous » ; « pourquoi le Tous est à droite tout seul ? collé aux autres » ; « des
petites fragmentations » entre l'onglet choisi et la bande des états (captures : le pont de la V3.61, plus
étroit que l'onglet, laissait des marches) ; « quand on clique sur Signatures en cours, faut que ça soit
mieux géré ».

- **L'arrivée** (`PageDocuments.tsx`, `vuePosee`) : à la première lecture, « Signatures en cours » s'il y a
  un document à faire signer ou en signature (hors courriers), sinon « Tous ». Posé une fois, avant
  l'affichage (`useLayoutEffect`) ; un clic l'emporte.
- **« Tous »** en dernier, collé aux autres (plus de `margin-left: auto`).
- **L'intercalaire** (`Documents.module.css`, `.vuesBloc`) : plus de pont mesuré à part. La pastille de
  la barre des sortes (OngletsGlissants) est arrondie en haut seulement, descend jusqu'à la bande et s'y
  évase par deux coins creusés (`::before`, `::after`, dégradés radiaux). Une seule forme, qui glisse d'un
  bloc. Près d'un bord de la bande (le premier onglet ; au téléphone, la barre qui défile), la bande perd
  ce coin-là et l'intercalaire son évasement de ce côté (`bords`, mesuré : `data-g`, `data-d`).
- **« Signatures en cours » a sa bande** : Tous · On attend des signatures (liens partis) · Prêts à faire
  signer. Sans elle, l'onglet choisi restait suspendu. Chaque choix a son message quand il est vide.

### V3.65 — 3 octobre 2026 · import ImmoFacile : on voit que la lecture tourne

Rien à passer dans Supabase.

Alexandre : « il y a marqué lecture des commentaires, 0 sur 20, mais rien ne montre que c'est en
cours ; on ne pourrait pas mettre un spinner ? ».
- Le bloc de lecture : un cercle qui tourne, « Claude lit les commentaires : 8 sur 20 », le temps
  écoulé à la seconde (`Chrono`, son propre état : la liste n'est pas redessinée chaque seconde), une
  barre qui luit même tant qu'aucun contact n'est revenu, « Ne pas attendre », et une idée de la
  durée selon le nombre de contacts.
- Chaque contact pas encore lu porte un petit cercle qui tourne ; le bouton du bas aussi.
- Des lots de 4 contacts, 4 à la fois (au lieu de 6 et 3) : les premiers résultats arrivent plus
  tôt et la barre avance plus souvent.

### V3.64 — 3 octobre 2026 · « Retirer la proposition » du mandat de recherche : le client prévenu

Rien à passer dans Supabase.

Le cas laissé de côté par la V3.63 : sur la fiche d'un acheteur (fenêtre « Mandat de recherche »), le
bouton **« Retirer la proposition »** du mandat proposé dans l'espace client ne prévenait personne. Le
client l'apprenait en rouvrant son espace. Alexandre : « règle aussi ce problème, la meilleure des façons ».

- **Le mail** (`/api/mandat/retrait`, nouveau, derrière le code d'accès) : appelé par la fiche une fois la
  proposition retirée ; il refuse tant que `mandat_propose_le` est rempli. « À propos de votre mandat de
  recherche », au nom d'Alexandre : la proposition est retirée pour le moment, rien à faire, « s'il faut en
  signer un plus tard, je vous le dirai », son téléphone. S'il avait commencé à signer (`signatureId`, ligne
  passée « abandonne ») : la signature est arrêtée, le code ne marche plus, et l'adresse saisie pour signer
  est prévenue aussi. Un e-mail par adresse de la fiche. La ligne « 📋 Proposition de mandat retirée » du
  suivi dit qui a été prévenu, ou pourquoi personne.
- **La fenêtre qui explique** (`FenetreConfirmer`, dans `MandatEnLigne.tsx`) remplace le `confirm()` :
  ce qui va se passer (plus de carte « Votre mandat est prêt », les rappels s'arrêtent, la signature
  commencée s'arrête, le mandat type approuvé qui lui permet encore de signer seul, le numéro « sans
  suite » au registre ou à marquer dans ImmoFacile, le mail), « Et ensuite », un conseil (« tu veux
  seulement changer les honoraires ? Mettre à jour »). La case **« Prévenir … par e-mail »** est cochée
  d'office s'il a pu voir la proposition, relu au clic (`demanderRetrait`) : signature commencée, mail
  « Votre mandat est prêt » parti depuis (`envois`, corps « Mandat de recherche prêt à signer… »), rappel
  automatique (`journal.metadata.rappelMandat`), espace ouvert depuis (`recherches.espace_ouvert_le`).
  Sinon décochée, et la fenêtre dit pourquoi (« il ne l'a sans doute pas vue »).
- **L'espace** (`EspaceClient.tsx`) : le lien « Lire et signer mon mandat » d'un ancien mail
  (`?mandat=1`) ne rouvre plus de signature quand la proposition est retirée, même si le mandat type
  approuvé lui permet de signer seul : une fenêtre « Ce mandat n'est plus à signer » (`MANDAT_RETIRE`,
  la même que les « ? »). Rien quand un mandat est signé ou qu'un mandat de Documents l'attend.
- Pas couvert : « Supprimer le mandat » (FicheClient, `supprimerMandat`) retire aussi une proposition en
  ligne, sans mail et sans arrêter une signature commencée. Fait pour effacer un mandat saisi à la main.

### V3.63 — 3 octobre 2026 · arrêter, annuler, modifier : une fenêtre qui explique, et les signataires prévenus

Rien à passer dans Supabase. Les commits portent « V3.61 (1/8) » à « (8/8) » : la V3.61 et la V3.62
(l'import ImmoFacile) ont été écrites en même temps, dans une autre session. Les commentaires du code
qui disent « V3.61 » pour Documents (FenetreConfirmer, la bande des états) renvoient à cette entrée.

Alexandre : « quand j'arrête une signature, ce n'est pas à moi d'avertir les signataires : il faut qu'ils
soient prévenus, pour tout type de document » ; « pour chaque chose que je veux faire, un petit message de
rappel qui montre ce qui va être fait, ce que je dois faire ensuite, des recommandations » ; « Ouvrir (ou
le modifier) porte à confusion » ; et sur la liste Documents : « Tous tout à droite ; le sous-filtre doit
être avec Mandats de vente, juste en dessous, dans la même couleur ».

- **Les signataires prévenus** (`/api/documents/signature`, action `annuler` ; `mailArret`,
  `prevenirArret`, `src/lib/signature-documents.ts`) : chacun de ceux qui avaient reçu leur lien ou déjà
  signé reçoit un e-mail au nom d'Alexandre. Signature arrêtée : « … : la signature est interrompue »
  (le lien ne marche plus, rien à faire pour l'instant, un nouveau lien suivra si besoin ; une signature
  déjà faite ne compte plus). Document annulé (`pourquoi: 'annulation'`) : « … a été annulé(e) », plus
  rien à signer. Pas celui qui devait signer sur place sans avoir rien reçu. `prevenir: false` : personne
  (la case décochée). La réponse rend `prevenus` et `echecs` ; le suivi du client dit qui a été prévenu.
  Vaut pour tous les documents de la rubrique (mandats, avenants, offres, bons de visite). Le mandat de
  recherche proposé dans l'espace (« Retirer la proposition ») n'envoie toujours rien.
- **`FenetreConfirmer`** (nouveau, `src/components/documents/FenetreConfirmer.tsx`) remplace les
  `confirm()` : « Ce qui va se passer » (un picto par effet, en rouge ce qui ne se rattrape pas), une case
  à cocher (« Prévenir les 8 signataires par e-mail », cochée d'office), « Et ensuite », un conseil en
  encadré bleu, « Ne rien faire » / le geste. Utilisée pour : **Arrêter la signature**
  (`SignatureEnLigne.tsx`), **Annuler le document** / **Marquer annulé** hors mandat signé (qui garde
  `FenetreFinMandat`), **Supprimer le brouillon**, **Dupliquer** un document en signature
  (`PageDocuments.tsx`), **Modifier** = repasser en brouillon (`EditeurDocument.tsx`).
- **« Ouvrir »** au lieu de « Ouvrir (ou le modifier) » ; dessous : « pour le modifier, arrête d'abord la
  signature » (en signature) ou « pour le relire ou le modifier ». Dans l'éditeur, en signature, plus de
  bouton « Modifier » : un bandeau dit comment faire (arrêter, puis revenir « Modifier »).
- **Documents, la barre** : « Tous » passe tout à droite (`margin-left: auto`). La barre des états n'est
  plus une barre grise à part : une **bande bleue** (`.sousBande`) collée sous la barre des sortes, dans le
  même bloc blanc (`.vuesBloc`), et un **pont** de la même couleur (`.pont`, mesuré dans PageDocuments,
  glisse avec la pastille et suit le défilement au téléphone) relie l'onglet choisi à la bande : ils ne
  font qu'une forme. Pastille de l'onglet choisi en bleu uni (`--emilio`) ; dans la bande, la pastille de
  l'état choisi est blanche.

### V3.62 — 3 octobre 2026 · import ImmoFacile : les précisions et « À savoir » lus pour de bon, un détail qui se déplie en douceur

Rien à passer dans Supabase.

Alexandre, sur un vrai contact de l'aperçu : « pourquoi à droite, sa recherche, il n'y a pas de
précision ? et le commentaire, est-ce qu'il sera pris en compte ? » ; « le menu déplié, c'est trop
brut ».
- La cause : la lecture rendait parfois une liste en une seule chaîne (« "precisions": "Box fermé.
  Calme." »), et `lireLecture` ne gardait que les tableaux. Les précisions, les lignes « À savoir »,
  les états acceptés tombaient en silence ; le bien et les équipements (des objets) passaient. Toute
  liste est maintenant acceptée en tableau ou en chaîne (découpée en phrases, ou aux virgules), un
  équipement peut être un simple mot ; et la consigne envoyée à Claude dit « un tableau » partout.
- Un propriétaire qui vend seulement (Alexandre : « elle souhaitera juste vendre, pourquoi revente
  après achat ? ») : plus de case « Revente possible après l'achat », qui parle d'un achat. Son
  logement (description, adresse, prix espéré) et son projet vont dans « À savoir », le rappel noté
  se pose sur lui. La case reste pour celui qui achète et revendra après.
- « 3ch (3ème peut être petite) » dans la précision, « 2 à 3 chambres » dans les colonnes : le CRM
  garde 2 chambres minimum (les colonnes, pour que la veille ne rate pas un 2 chambres avec un
  bureau), et la lecture doit maintenant écrire la nuance en phrase (« Trois chambres, la troisième
  peut être petite. ») au lieu de la perdre.
- L'aperçu montre toujours la ligne « Précisions » d'un acheteur (ce que le client lira, ou pourquoi
  il n'y a rien) et dit ce qui est recopié tel quel dans « À savoir » (la précision de sa recherche,
  son commentaire).
- Une ligne de l'aperçu se déplie et se replie en glissant (hauteur 0fr → 1fr, fondu), la flèche
  tourne en douceur, la ligne ne rétrécit plus au clic (`button:active` de globals.css) ; les
  corrections apparaissent en fondu. Rien de tout ça avec « réduire les animations ».

### V3.61 — 3 octobre 2026 · « Importer depuis ImmoFacile »

Rien à passer dans Supabase. La lecture des commentaires utilise `ANTHROPIC_API_KEY` (déjà sur
Vercel) ; sans elle, l'import marche avec les colonnes seules.

Alexandre quitte ImmoFacile (AC3 facture la reprise 500 €) : « il faut qu'ensuite ce soit bien
traduit sur la fiche : propriétaire, acheteur, les critères de recherche, les précisions de la
recherche, l'observation générale au niveau de l'historique du client, pas de la recherche ».

**Le parcours** (Contacts › « Importer depuis ImmoFacile » : `ImportImmoFacile.tsx`)
1. Il dépose un ou plusieurs exports « Contacts » d'ImmoFacile (.csv, UTF-8 ou Windows-1252).
2. L'aperçu, rien n'est écrit : une ligne par contact (rôles, recherche, bien « À suivre »,
   étiquettes), le détail « Dans ImmoFacile → Ce qui sera créé », des corrections (rôles, critères
   lus en trop, bien « À suivre » et date du rappel, « ce n'est pas la même personne », « ne pas
   importer »), des onglets (Acheteurs, Propriétaires, Tirées d'un commentaire, Déjà dans le CRM,
   À vérifier, Pas importés). La lecture des commentaires par Claude tourne en fond, par lots ;
   « Ne pas attendre » reprend les autres avec leurs colonnes seulement.
3. L'écriture, contact par contact (`import-ecriture.ts`), comme une saisie à la main.
4. Le bilan : ce qui a manqué, « Réessayer » (le CRM est relu avant), « Voir les contacts
   importés » (Contacts filtré « Importés d'ImmoFacile »).

**Les règles** (`src/lib/import-immofacile.ts`)
- Une même personne présente deux fois (deux exports, « Propriétaire » dans l'un et « Demandeur »
  dans l'autre) est regroupée : même nom complet, même e-mail ou même téléphone. Deux noms complets
  différents ne se fondent jamais (un couple qui partage un fixe : deux fiches, « À vérifier ») ; un
  numéro ou un e-mail présent sous trois noms ou plus (l'agence) ne relie personne ; les numéros
  bidons (« 06 00 00 00 00 ») tombent.
- Rôles : une recherche remplie ou décrite dans le commentaire → acheteur, même si ImmoFacile dit
  seulement « Propriétaire » ; « Propriétaire », « Vendeur », « Bailleur » → propriétaire ; Notaire,
  Agence, Gardien, Courtier… → le type pro. Rien de reconnu (« Locataire », vide) : acheteur sans
  critères (le type par défaut du CRM), « À vérifier », jamais « Actif », et ce rôle n'est jamais
  ajouté à une fiche qui existe déjà.
- La recherche : les colonnes d'abord (types, budget — « 850K », « 1,1 M€ » compris —, surfaces,
  pièces, chambres, secteurs du CRM), le texte pour ce qui manque, et les critères en plus cochés
  (balcon, terrasse, pas de RDC, étage, ascenseur, cuisine, exposition, état, financement, délai).
  Ses « Précisions » ne reçoivent que des phrases réécrites (le client les lit dans son espace) :
  **jamais la « Précision » d'ImmoFacile brute**, qui va dans « À savoir ».
- « À savoir » (pour Alexandre seul) : « Repris d'ImmoFacile : fiche créée le …, suivie par …,
  origine … », ce que Claude a lu sur la personne, la précision et le commentaire d'origine en
  entier, un refus noté dans ImmoFacile, un e-mail mal écrit.
- Son bien (Alexandre : « la fiche du bien, c'est quand j'ai vu le logement ») : un projet de vente
  lu dans le commentaire (« vente après avoir trouvé », « rappeler pour estimation ») coche
  « Revente possible après l'achat (mandat vendeur potentiel) » (`bien_actuel_a_vendre`, avec type,
  surface, prix espéré, adresse, notes) et pose le rappel noté sur le contact (Relances, note
  « Projet de vente — recontacter … », jamais en double). **Aucune fiche bien n'est créée
  d'office** : « Créer aussi sa fiche bien « À suivre » » dans les corrections, quand il a vu le
  logement (le rappel suit alors le bien, et le type « Vendeur » n'est posé qu'une fois le bien
  créé). Un rappel déjà passé (« rappeler en juin ») est posé pour aujourd'hui, « en retard, prévu
  en juin 2026 ».
- Les acheteurs arrivent « À qualifier » (prospect, recherche arrêtée : ni veille, ni point
  automatique, ni alertes). « Actifs » : statut actif et recherche en marche — sauf ceux de
  « À vérifier », dont ceux qui ont refusé les e-mails ou les propositions dans ImmoFacile.
- Déjà dans le CRM (même e-mail, téléphone, personne 2 comprise, ou même nom) : pas recréé, sa fiche
  est relue juste avant d'écrire et seul ce qui manque est ajouté. Reconnu par la personne 2, ou par
  une coordonnée sous un autre nom : ses coordonnées ne sont pas recopiées, le bloc « À savoir » dit
  de qui il vient. Même nom mais d'autres coordonnées des deux côtés : un homonyme, créé à part
  (« À vérifier »). Un bien vendu, retiré ou archivé n'empêche pas un nouveau bien « À suivre ».
- Une ligne au Suivi : « Fiche reprise d'ImmoFacile le … (créée le … chez ImmoFacile) », ou
  « Fiche complétée depuis ImmoFacile », `metadata.source = 'import_immofacile'` et le lot.
- Ce qui part chez Claude : ni nom, ni téléphone, ni e-mail, une clé neutre (`k1`, `k2`…). Un
  e-mail ou un téléphone lu n'est gardé que s'il est écrit dans le texte de CE contact ; une clé
  rendue deux fois tombe.

### V3.60 — 3 octobre 2026 · Documents : « Signatures en cours », les états dans chaque sorte, des onglets qui glissent

Rien à passer dans Supabase.

Alexandre : « un onglet Signatures en cours, où tout se met quand une signature ou des signataires sont en
attente » ; « dans Mandats de vente, Mandats de recherche… une sous-catégorie brouillon, signature en
cours, signé, que ce soit bien précisé et joli » ; « quand on passe de Mandats de vente à Offres d'achat,
c'est un peu brut : de la fluidité entre chaque onglet, et un meilleur affichage des onglets ».

- **La barre des sortes** (`PageDocuments.tsx`) : `BarreOnglets` / `CorpsOnglet` (OngletsGlissants, comme
  les fiches) au lieu des pastilles : la pastille glisse, le contenu arrive en fondu du côté où l'on va.
  « **Signatures en cours** » · « **Tous** » · une par sorte, avec leur nombre. Une sorte sans aucun
  document n'a pas d'onglet (il revient au premier document).
- **« Signatures en cours »** : tout document `pret` hors courriers, en deux groupes : « On attend des
  signatures » (liens partis ou signature sur place commencée, avec « Qui a signé ? ») et « Prêts à faire
  signer » (finalisés : liens à envoyer, ou papier). Le mandat de recherche signé dans l'espace et qui
  attend un co-signataire y figure aussi.
- **Les états dans chaque sorte** (et dans « Tous ») : une seconde barre, plus légère (`.sousVues` : fond
  gris, pastille blanche) : Tous · Signature en cours · Brouillons · Signés · Annulés (Annulés seulement
  s'il y en a ; pour les courriers : À envoyer · Envoyés). Sur « Tous », la liste est rangée en groupes
  titrés (`TeteGroupe`, `.grT` : un point de couleur, le nom, le nombre) ; sur un état, la liste seule.
  Changer de sorte remet l'état sur « Tous ».
- **Les tuiles d'état du bandeau** (Tous, Brouillons, À faire signer, Signés, Annulés) sont parties : elles
  faisaient la même chose que la seconde barre. La phrase du bandeau reste (« 1 en signature · … »).

### V3.59 — 3 octobre 2026 · la fiche d'un vendeur ou d'un contact en rubriques

Rien à passer dans Supabase.

Alexandre, sur la fiche de Christine (vendeuse, associée d'une SCI) : « il n'y a pas le petit menu à cheval
sur la ligne blanche, comme pour un acheteur » ; « il y a trop d'infos sur une seule page, on est obligé
de descendre tout en bas pour voir le suivi » ; « on a déjà l'info sur la partie bleue, je ne vois pas
l'utilité de la remettre en dessous » ; « pour le En bref, mettre À savoir sur Christine ».

- **Les rubriques** (`FicheContact.tsx`, `BarreOnglets` / `CorpsOnglet` de `OngletsGlissants.tsx`, comme la
  fiche d'un bien) à cheval sur le bas du bandeau (`.heroOnglets`, `.ongletsCheval`) :
  « **À savoir sur Christine** » (« À savoir » sur téléphone, `.ongletLong`) : sa société, la carte
  « À savoir », les blocs du métier (agence, étude, immeuble, activité), « Il cherche aussi à acheter ? » ;
  « **Documents** » (le nombre en pastille ; « **Délégations** » pour un confrère) ; « **Suivi** » (le
  nombre d'éléments ; la frise seule, sans la bande « Le suivi »). Ouvre sur « À savoir ».
  Un notaire, un gardien, un partenaire n'ont pas l'onglet Documents (comme avant : pas de bloc).
- Les tuiles du bandeau d'un pro (« 1 échange », « Aucune relance ») ouvrent l'onglet Suivi ; « Il agit
  pour une société ? Ajouter » ouvre « À savoir », où le bloc se déplie.
- **« Ses biens » n'est plus répété sous le bandeau** : les biens y sont déjà (`BiensHero`). Au bout de
  leur rang, « **+ Nouveau bien** » (`.heroBienAjout`) ; au-delà de quatre biens, « + N autres biens » les
  déplie dans le bandeau (avant : renvoyait à « Ses biens », plus bas). `BiensDuContact` n'est plus
  utilisé par la fiche (toujours exporté par `ChampsContact.tsx`). Les biens archivés ne se voient plus
  sur la fiche (la tuile le dit quand il n'y a qu'eux) : rubrique Biens, filtre Archivés.
- L'avis « contact archivé » et les erreurs passent sous la barre des rubriques.

### V3.58 — 3 octobre 2026 · la signature en ligne : un seul mail à la fin, et qui a signé sous la ligne dans Documents

Rien à passer dans Supabase. (V3.56 et V3.57 sont des retouches notées dans le code de la V3.55.)

Alexandre, après avoir lancé un mandat de vente pour une SCI de huit associés : « comment je suis au
courant quand c'est signé ? » ; « il ne faut pas envoyer un mail à chaque personne qui signe, sinon il
y aurait trop de mails : juste un mail quand le contrat est signé » ; « dans Documents je ne vois que
En signature » ; « pas encore ouvert, est-ce que c'est vraiment à jour ? ».

- **Un seul mail, quand tout le monde a signé** (`api/signer`, `signerDocument`) : « ✅ Signé par tous :
  Mandat simple · SCI … (n° …) », la liste des signatures avec leur heure (l'agence au lancement
  comprise), le PDF complet joint. Une signature au milieu n'envoie plus rien, sauf un souci à régler
  (un exemplaire pas parti, le document pas mis à jour) : « ⚠️ … : un souci à la signature de … ».
  Même règle pour le mandat de recherche à plusieurs : le premier signataire (`api/espace/mandat`)
  n'envoie plus de mail sauf souci (copie, fiche, lien non parti, autre conjoint sur la fiche) ; le
  mail part quand le dernier co-signataire signe (`api/signer`, « · complet »). Le numéro pris dans la
  réserve garde son propre mail (`mandat_numero`). Textes des Paramètres › Alertes mail à jour
  (`alertes.ts`) ; « C'est parti » dit « Tu recevras un seul mail, quand tout le monde aura signé ».
- **Documents, la liste** (`PageDocuments.tsx`) : sous la ligne d'un document en signature (et d'un
  mandat de recherche en ligne qui attend un co-signataire), la ligne dépliable de la fiche client
  (`SuiviSignature`) : « Signature en ligne · 2 sur 8 », « On attend Paul Durand, Claire Morel et
  4 autres », un point par signataire, « Qui a signé ? » qui déplie chacun (signé quand, lien envoyé,
  ouvert quand, rappels, renvoyer le lien, corriger l'e-mail, et l'agence au lancement). Relue quand
  la liste change, au retour sur l'onglet et chaque minute tant qu'on attend quelqu'un.
- **« Ouvert »** : `ouvert_le` est noté quand la page `/signer/<jeton>` s'affiche chez le signataire
  (étape `afficher`, déclenchée par la page elle-même : un aperçu de lien par un antivirus de
  messagerie ne compte pas). Il s’affiche maintenant avec l’heure (« ouvert le 3 octobre à 19 h 52 »),
  dans le panneau et dans le suivi. Le panneau de signature d'un document (`BlocSignature`) se relit
  seul toutes les 30 secondes et au retour sur l'onglet (avant : une seule lecture, à l'ouverture).
- Au-delà de trois personnes, « On attend » et « Lien expiré pour » disent « A, B et N autres »
  (`prenoms`, `SuiviSignature.tsx`) ; sur téléphone, à partir de quatre signataires, les points ont
  leur ligne et le texte repart du bord.

### V3.55 — 3 octobre 2026 · le mandat de recherche dans l'espace suit le CRM, et la signature en ligne est verrouillée

Rien à passer dans Supabase.

Alexandre : « son espace doit être à jour par rapport à ce que je mets côté CRM : si je dis que c'est
signé, c'est signé, et c'est à moi de joindre le PDF signé » ; « un petit avertissement pour ne pas
oublier le PDF signé, sinon le client ne le voit pas » ; et « si je relance une signature déjà en
cours, depuis Documents, la fiche d'un client ou d'un bien, est-ce que ça m'arrête ? si j'annule,
est-ce que le lien ne marche plus ? ».

**L'espace et le mandat fait dans Documents** (`src/lib/documents-espace.ts`, nouveau ;
`mandat-serveur.ts`, `espace/[token]/page.tsx`, `SignatureMandat.tsx`, `EspaceClient.tsx`,
`api/espace/[action]`, `api/espace/mandat`)
- Le couple : chacun son lien. Le client est reconnu par SES adresses (puis par son prénom, jamais
  celui du conjoint : `laSienne`) ; avant, l'espace pouvait lui donner le lien de sa conjointe. Une
  fois qu'il a signé, l'accueil dit « Votre mandat de recherche attend la signature de Claire », avec
  qui a signé ; Claire a son propre lien, nommé. Il peut demander des visites dès sa signature (comme
  le mandat signé dans l'espace) ; le serveur applique la même règle.
- « Mon mandat de recherche » dit la vérité selon l'état : en préparation (et comment il se
  signera), prêt à signer sur papier ou au rendez-vous, envoyé (« Signer mon mandat »), lien expiré
  (« Alexandre en est prévenu : il revient vers vous »), signature arrêtée, signé (« Télécharger mon
  mandat »). Plus jamais « vous le recevrez très vite par e-mail » quand ce n'est pas le cas.
- « Vos documents signés » et le téléchargement acceptent l'exemplaire déposé à la main (scan ou
  photo, `signe_chemin`), pas seulement les documents signés en ligne. Une seule règle dit ce que
  voit l'acheteur (`pourEspaceAcheteur`) : mandats de recherche et avenants, offres, bons de visite ;
  jamais un document du côté vendeur, interne ou un courrier. Le mandat signé dans l'espace y figure
  aussi.
- Renoncer au mandat (délai de rétractation, 14 jours, calculé comme pour le mandat signé dans
  l'espace) : possible aussi pour un mandat de Documents signé EN LIGNE. Le document passe annulé
  (`donnees.retracte_le`), registre, bloc Mandat vidé s'il le porte encore, mails (client, autres
  signataires, Alexandre), relance « À rappeler ». Pas pour le papier ni le « sur place » (à voir avec
  l'avocat). L'accusé de réception n'est annoncé au client que s'il est vraiment parti.
- L'alerte « au-delà du mandat » tient compte d'un mandat de Documents, de ses seuls avenants, et
  compare les types par familles (loft, duplex, studio = appartement).
- « Mes bons de visite » (Alexandre : « quand il y en a plusieurs, qu'il s'y retrouve ») : dans « Vos
  documents signés », un bon de visite seul a sa ligne (« Bon de visite du … », l'adresse, le
  logement) ; à partir de deux, ils se rangent dans « Mes bons de visite » (leur nombre, la dernière
  visite), qui se déplie : une ligne par visite, la plus récente en haut, avec « Voir » (ouvert dans
  le navigateur : `voir: true` sur l'action `document`) et « Télécharger ». Les bons de visite, c'est
  Alexandre qui les prépare (Documents, ou la fiche du bien : « Nouveau bon », ou « Bon de visite »
  sur une visite) ; l'acheteur les signe.
- Agenda, vue Semaine (« le jaune n'est pas en continu, il y a un décalage ») : les deux lignes
  d'en-tête (les jours, « Journée ») n'avaient pas la barre de défilement de la grille des heures
  (8 px) ; chaque colonne du haut était un peu plus large, et la colonne d'aujourd'hui se décalait.
  Elles en gardent maintenant la place (`.ag-gouttiere`, `scrollbar-gutter: stable`).

**La signature en ligne des documents** (`api/documents/signature`, `signature-documents.ts`,
`api/signer`, `signer/[jeton]`, `SignatureEnLigne.tsx`, `EditeurDocument.tsx`, `PageDocuments.tsx`)
- Une seule signature à la fois : le lancement réserve le document (deux clics, deux onglets : un
  seul passe) ; une copie (« Dupliquer », « Préparer une offre ») ne peut pas partir en signature
  tant que l'autre y est (`autreEnSignature` : même bien et même acquéreur pour une offre — deux
  acquéreurs différents restent possibles —, même mandat pour un avenant…) : « … est déjà en
  signature depuis le … : arrête d'abord sa signature dans Documents, puis lance celle-ci. »
- « Modifier » un document en signature est refusé par la base, pas seulement par la page (un onglet
  resté ouvert ne rouvre plus les anciens liens sur un nouveau texte).
- Arrêter : les liens gardent leur jeton, en « annulé » ; l'ancien lien affiche « … ne vous attend
  plus · Alexandre a arrêté la signature », et rien du document. La confirmation dit que personne
  n'est prévenu par e-mail. Une fois l'exemplaire complet envoyé à tous, on ne peut plus arrêter
  (« finaliser »).
- Courses entre une signature et un arrêt : écritures conditionnelles ; « Corriger l'e-mail »
  repris à la relance suivante, sans écraser une adresse corrigée depuis dans l'éditeur.
- Papier : la fenêtre « Signé » demande l'exemplaire signé ; sans lui, elle prévient que le client
  ne le verra pas dans son espace. Tant qu'il manque : « Exemplaire signé à déposer : ton client ne
  le voit pas encore dans son espace » (Documents, fiche client, fiche du bien, fenêtre Mandat).
- Fiche client, fenêtre Mandat : « Retirer la proposition » arrête aussi une signature commencée dans
  l'espace ; le titre dit où le mandat a été signé (en ligne, sur place, sur papier, hors du CRM) ;
  le bon mandat est choisi par son numéro après un renouvellement.

### V3.54 — 3 octobre 2026 · la pastille du propriétaire : une croix, « Créer sa fiche », et plus de carte en bas

Rien à passer dans Supabase.

Alexandre, sur la V3.53 : « il n'y a pas de petite croix en haut, comme “Retirer du bien” en bas » ;
« la partie Le propriétaire, en bas, on peut l'enlever, ça ne sert à rien » ; et, sur une
propriétaire saisie sans fiche : « il y a marqué Relier une fiche, je n'ai pas compris pourquoi ».
- `PastilleProprio` : une petite croix au bout de la pastille, derrière un trait. Un clic ouvre, à
  la place du panneau, « Retirer <nom> de ce bien ? » (sa fiche reste dans les contacts ; sans
  fiche, son nom et ses coordonnées notés sur le bien sont effacés), « Retirer du bien » /
  « Annuler ». FicheBien : `retirerProprio`, sans le `confirm()` d'avant.
- Un nom saisi sur le bien sans fiche dans les contacts (les biens d'avant la V3.30) : le panneau le
  dit (« Pas encore de fiche dans tes contacts : ses coordonnées sont notées sur ce bien
  seulement… ») et propose « Créer sa fiche » au lieu de « Relier une fiche » (qui ouvrait
  l'éditeur sans dire pourquoi). FicheBien, `creerFicheProprioBien` : la première personne saisie
  devient un contact « vendeur » (`creerFicheProprio`), relié au bien ; si elle est déjà dans les
  contacts (même e-mail, même téléphone, mêmes prénom et nom : `doublonsContact`), on propose de
  relier cette fiche-là (`marquerVendeur`). L'enregistrement attendu, la liste se relit.
- La carte « Le propriétaire » de la Vue d'ensemble est retirée (`CarteProprio` et ses styles
  supprimés de VueBien) ; sa ligne « motif · Venu par · Notaire » passe dans le panneau de la
  pastille (`plus`). Les cartes : deux (avant le mandat : Pour la visite, Acheteurs ; ensuite :
  Visites et offres, Pour la visite), une une fois vendu — `Kpis` accepte `n` = 2 et 1.
- Les boutons du panneau passent à la ligne quand ils n'ont pas la place (« Relier une fiche »
  débordait de son bouton).

### V3.53 — 2 octobre 2026 · le propriétaire à cheval sur le haut du bandeau d'un bien

Rien à passer dans Supabase.

Alexandre : « le propriétaire, il est en bas, c'est un bloc en bas ; qu'on voie à qui appartient ce
logement, qu'on soit dans Photos, Surfaces… ». Trois maquettes ; la 3 retenue (« la barre du haut
qui indique le propriétaire, j'aime bien »), puis : « qu'il empiète sur le bloc bleu, vers le haut,
que ce soit plus visible ». `PastilleProprio` (`src/components/biens/`) : sur tous les onglets, une
pastille « Propriétaire · <nom> » (« Propriétaires » pour un couple, la mallette pour une SCI),
bordée d'or, posée à cheval sur le haut du bandeau bleu, alignée sur la photo — comme les rubriques
à cheval sur le bas. FicheBien la met dans `.proprioCheval`, juste avant le bandeau ; la marge
du bas vaut −(écart de la fiche + moitié de la pastille), et `.proprioCheval + .hero` descend le
contenu du bandeau d'autant. Un clic ouvre un panneau : son rôle (gérant de la SCI…), son
motif, téléphone et e-mail cliquables, et « Appeler », « Écrire » (la fenêtre de Nouveau mail,
`FenetreMail`, quand sa fiche a une adresse ; sinon la messagerie de l'ordinateur), « Sa fiche » (ou
« Relier une fiche »). Sans propriétaire : « À renseigner », qui ouvre l'éditeur sur le propriétaire.
Échap ou un clic à côté referment. Sur téléphone, même place (un nom trop long finit en « … »), et
le panneau prend la largeur du bandeau. La carte « Le propriétaire » de la Vue d'ensemble reste.

### V3.52 — 2 octobre 2026 · le mandat de vente : une précision sous les honoraires, les textes libres en paragraphes

Retour d'une propriétaire sur un projet de mandat (forfait de 55 000 €) : « vos honoraires sont-ils
fixes quel que soit le prix de vente, ou recalculés ? ». La phrase du modèle, « Si la vente se fait
à un autre prix, ils sont calculés de la même façon sur le prix obtenu », laissait croire qu'un
forfait se recalculait. Et Alexandre : « pourquoi tout va dans la clause particulière ? », « c'est
affiché en vrac, sans paragraphe ».
- `mandat-vente.ts` : nouvelle question `honoNote`, « Précision sur les honoraires » (étape Prix et
  honoraires), imprimée juste sous les honoraires et reprise dans l'information précontractuelle
  (« Le prix du service »). La phrase « autre prix » dépend du mode : un pourcentage se recalcule
  sur le prix obtenu ; un forfait « reste le même si la vente se fait à un autre prix », sauf
  s'il y a une précision, qui dit alors ce qui se passe.
- `commun.ts` : `paragraphes()` et `lignesLibres()` : un texte libre devient un paragraphe par
  ligne, avec les montants tapés à la main gardés d'un bloc (espaces insécables). Utilisés pour
  la clause particulière et les « Précision : » du mandat de vente et du mandat de recherche.
- Banc d'essai : aperçu 1280 et 390 px, clic sur la précision → sa question.

### V3.51 — 2 octobre 2026 · écrire à un contact depuis sa fiche, demander des documents depuis un bien

Rien à passer dans Supabase.

**« Envoyer un mail » sur la fiche d'un contact** (Alexandre : « un petit bouton, ça affiche la trame
de Nouveau mail mais en restant sur la fiche, comme ça je n'ai pas à remettre le nom »). La rédaction
de « Nouveau mail » est devenue un composant (`Redaction`, `PageMail.tsx`) ; `FenetreMail` l'ouvre
dans une fenêtre, le contact déjà en destinataire. Ni Échap ni un clic à côté ne la ferment (un mail
commencé ne se perd pas), la croix demande avant. Fiche d'un contact : bouton dans la barre, à côté
de « Modifier ». Fiche d'un acheteur : « ✉️ Mail » dans la barre, et « Envoyer › Mail libre » ouvre la
même fenêtre (l'ancien formulaire texte n'est plus utilisé) ; l'envoi se range dans la recherche
affichée (`/api/mail`, `recherches`).

**« Demander des documents… » dans l'onglet Documents d'un bien** (Alexandre : « je sélectionne ce
que je souhaite, et il y a un texte préfait : suite à nos échanges, voici les documents pour
l'estimation ou pour la vente »). `FenDemandeDocuments` (`DossierBien.tsx`) : le motif (l'estimation,
la mise en vente, le compromis — proposé selon l'étape), ce qui manque au dossier à cocher par groupe,
des pièces à ajouter (ou les idées habituelles : pièces d'identité, livret de famille…), à qui (le
propriétaire d'office), l'objet et le message, rédigés tout seuls et modifiables. L'envoi
(`/api/biens-vente`, action `demander`) part à son nom, sans pièce jointe ; les pièces passent
« Demandé » dans le dossier (les ajoutées y entrent), l'historique du bien dit « Documents demandés à
… », le Suivi du propriétaire « 📋 Documents demandés ».

### V3.50 — 2 octobre 2026 · tout le CRM relu : le chiffre d'affaires, l'estimation, les visites, les documents, la fiche acheteur, l'agenda, les contacts

Rien à passer dans Supabase.

Alexandre : « fais le même diagnostic sur documents, fiches acheteurs, agenda, les relances… tout »,
puis « la phase quand je crée un bien à suivre, l'estimation, les rentrées quand on fait un acte, si
le chiffre d'affaires rentre bien, les visites ». Six relectures (documents, fiche acheteur, agenda
et relances, contacts, chiffre d'affaires, biens), environ 80 points ; tout ce qui pouvait fausser
l'argent, perdre une donnée ou dire faux à un client est corrigé. Quatre relectures adverses ensuite,
une quinzaine de retouches.

**Des outils communs, une seule façon de faire** :
- `lib/annuler-visites.ts` · `annulerVisites(ids, { pourquoi })` : annuler une visite d'acheteur
  partout pareil (statut, son rappel « Rendez-vous : Visite … » fermé s'il ne sert plus, la ligne
  « Visite annulée » dans sa recherche). Agenda, page Visites, fiche acheteur, fiche du bien.
- `lib/relances.ts` · `solderRelancesAcheteur(clientId, rechercheId?)` : les relances d'un acheteur
  dont le dossier se clôt, sans toucher à ses relances de vendeur, ni aux rappels d'un compromis en
  cours (« Compromis … »), ni à ceux de l'agenda (« Rendez-vous : … ») — `lib/relances-garder.ts`.
- `lib/demandes-visite.ts` · `solderRelancesRetourVisite` : « Veut faire une offre / Veut revoir /
  Il réfléchit — <bien> » se ferment quand la suite arrive (offre notée, 2e visite, compte rendu,
  bien vendu ou retiré).
- `lib/montant.ts` · `lireMontant` : « 8 333,33 », « 42.500 », « 850k ». Les honoraires d'une
  transaction lisaient « 8 333,33 » comme 833 333 €.
- `lib/rdv-bien.ts` : un rendez-vous de l'agenda relié à un bien (visite hors CRM, estimation) se
  déplace et s'annule des deux côtés.

**Le chiffre d'affaires** (`lib/activite.ts`) :
- encaissé : les actes signés ; une transaction de chasse sur une copie d'un bien de l'agence ne
  compte pas deux fois ; une lecture ratée s'affiche « — » au lieu de 0 € ; mois à l'heure de Paris ;
- à venir (`honorairesPrevus`) : compromis signés (agence et chasse), sans les dossiers perdus ou
  archivés — tableau de bord et Mon activité ;
- « C'est vendu » exige les honoraires (ou « Vente sans honoraires »), les recalcule avec le prix ;
  « Corriger l'acte… » sur un bien vendu ; un bien vendu ne se supprime plus ; tout est marqué TTC
  côté biens, HT côté chiffre d'affaires ;
- fiche acheteur : un seul chemin de clôture (`clore()`) pour Clôturer, Bien trouvé / Perdu et Acte
  signé ; l'acte demande sa date et prévient si les honoraires manquent ; « Acte signé » n'arrête que
  sa recherche ; Réinitialiser garde une vente signée ; supprimer un dossier qui a une vente signée
  (ou un propriétaire de bien) est refusé ; un bien de l'agence ne crée plus de transaction côté
  chasse (carte « Ouvrir la fiche du bien »).

**L'estimation** : le rendez-vous a une heure et va dans l'agenda (`rdvEstimationHeure`,
`rdvEstimationRdv`) ; chaque jalon (bien créé, rendez-vous, visite sur place, avis de valeur, mise de
côté) a sa ligne dans le Suivi du propriétaire ; relances « faire le point » (avis + 7 jours) et
« recontacter » (date de reprise), fermées au mandat ; « Repartir de zéro » à la reprise ; la visite
sur place n'est notée faite qu'à la première réponse ; doublons signalés (adresse, propriétaire,
contact) ; « Un mandat signé » à la création ouvre la fenêtre du mandat ; brouillons vides rangés à
part.

**Les visites** : « Déplacer » (acheteur suivi ou hors CRM, agenda compris), « Planifier une 2e
visite », « Créer sa fiche » pour un visiteur hors CRM, créneau déjà pris ou passé signalé, visites
passées sans compte rendu comptées « à faire », « Le point vendeur » (texte prêt à envoyer au
propriétaire, noté dans son Suivi). Un bien vendu, retiré ou en pause ne se visite plus depuis
l'agenda ni la fiche acheteur.

**Documents** : signature simultanée des deux derniers signataires, erreur de lecture, finalisation
depuis deux onglets, annulation depuis une page pas à jour ; l'avenant de vente signé s'applique au
bien (`lib/documents-avenant-bien.ts`) ; une offre d'achat ne se signe plus après sa validité ;
registre : Rétracté / Fin / Annulé, correction avant signature notée ; rappels du matin journalisés
après envoi, alerte mail en cas d'échec.

**Contacts et le reste** : retirer « Acheteur » arrête ses mails automatiques ; supprimer un contact
relié à des biens ou documents est refusé ; la page publique d'un bien dit « vendu / sous compromis /
plus en vente » ; « Nouveau mail » par lots Mailjet (plus de 504 à moitié envoyé) ; le lien
« Ouvrir dans le CRM » survit à la connexion ; « Vendeurs signés » sur la carte ; doublons de
contacts signalés ; demandes du site reliées avec leur type et leurs critères ; Ctrl/⌘ K ; mail de
bienvenue écrit une fois dans le Suivi et protégé du double clic. Tableau de bord : « Relances à
venir » sur 3 jours, dates à l'heure de Paris.

### V3.49 — 2 octobre 2026 · un bien cohérent d'un bout à l'autre : chaque étape dit ce qu'elle permet, et accompagne

Rien à passer dans Supabase.

Alexandre : « est-ce qu'on peut faire des visites quand le bien est vendu ? […] tout doit être
bridé, mais je dois être accompagné : qu'un message me dise quoi faire ». Un diagnostic complet
(trois relectures : le parcours du bien, le formulaire de l'estimation au mandat, l'espace
acheteur) a trouvé qu'avant, toute action était possible à toute étape.

**Les règles, en un seul endroit** (`permisBien`, `lib/biens-vente.ts`) et **l'accompagnement**
(`garde` dans `FicheBien`, fenêtre `FenGuide`). Une visite, une offre, un changement de prix, un
envoi aux acheteurs ou un archivage que l'étape ne permet pas ouvre une fenêtre : ce qui se passe,
et les boutons qui y mènent.

| Étape | Visite, offre, envoi | Prix | Archiver |
|---|---|---|---|
| À suivre, estimation | « Pas encore en vente » → Le mandat est signé… / Préparer le mandat | → Définir l'estimation / Le mandat est signé… | → Le propriétaire renonce… |
| En vente, sous offre | oui | oui | → Mandat terminé sans vente… / L'offre est tombée… |
| Sous compromis | « Continuer quand même » (offre de secours, contre-visite) ou Le compromis est tombé… | idem | → Le compromis est tombé… |
| En pause | Remettre en vente… ou continuer | idem | → Mandat terminé sans vente… |
| Vendu | → Une nouvelle vente de ce bien… | figé (celui de l'acte) | oui |
| Retiré | → Remettre en vente… (ou « Le mandat est signé… » s'il ne l'a jamais été) | idem | oui |
| Archivé | → Sortir des archives | idem | — |

Le reste du parcours :
- **« Une offre est arrivée »** ne fait passer « Sous offre » que depuis « En vente » ou « En
  pause » ; sous compromis, c'est « Une offre de secours », sans toucher au compromis.
- **Les cartes d'offre se figent** sur un bien vendu, retiré ou archivé : « Le bien n'est plus en
  vente : cette offre n'appelle plus de réponse. »
- **Une seule offre acceptée à la fois.** En accepter une autre demande confirmation, et la
  première passe « retirée ».
- **« Déjà signé ? »** (Documents) ne ramène plus un bien sous offre, sous compromis ou vendu à
  « En vente » : à ces étapes, il ouvre l'éditeur sur le mandat.
- **Le Documents dit « compromis signé » seulement pour le compromis en cours** (pas un compromis
  tombé), avec sa date de signature.
- **Les visites prévues s'annulent** (case cochée d'office) quand le bien est vendu, retiré, ou
  quand le compromis tombe avec retrait. En pause, la case est décochée.
  - Concerné : les visites des acheteurs suivis et les visites hors CRM, rendez-vous de l'agenda
    compris (`annulerVisitesPrevues`).
  - L'acheteur le lit dans son Suivi.
- **À la vente, les offres restées ouvertes passent « refusées »**, leurs relances closes.
- **Au retrait, les offres en jeu passent « retirées »** (case cochée). « Le vendeur retire le
  bien… » se fait aussi directement depuis « Sous offre ».
- **Les offres qui se ferment** (refusées au compromis, tombées) laissent une ligne au Suivi de
  l'acheteur suivi.
- **Changer de propriétaire en cours de route** (`changementProprio`, déclenché par
  `enregistrerBien`) :
  - les relances du bien (réponse à une offre, rappels du compromis) passent au nouveau ;
  - l'ancien perd « Vendeur » s'il n'a pas d'autre bien en vente ;
  - les deux Suivis le disent.
  - Dans l'éditeur, « Changer de fiche » ne délie plus l'ancien avant le choix du nouveau (avant :
    ses noms restaient, prêts à créer un doublon). Le nouveau remplace noms et coordonnées.
- **Un mandat de vente signé à la main** laisse sa ligne au Suivi du vendeur, comme la signature
  en ligne.

**L'éditeur du bien**
- **Fermer pendant un enregistrement l'attend** : avant, s'il échouait, rien ne le disait et la
  saisie était perdue.
- **Un nouveau bien à moitié rempli ne se supprime plus** à la fermeture (`bienVide` : tout
  contenu compte, pas seulement le type, l'adresse ou le prix).
- **Sous offre, sous compromis ou vendu, le prix et les honoraires sont figés dans l'éditeur.**
  Un mot renvoie à « Changer le prix ».
- **Le brouillon d'annonce n'invente plus « honoraires à la charge du vendeur »** quand ils sont à
  la charge de l'acquéreur sans taux saisi.
- **« Changer le prix » remplace l'ancien prix dans le texte de l'annonce**, chez nous et dans la
  description des copies chez les acheteurs (`majPrixDansAnnonces`). La note de la fenêtre disait
  à tort que les acheteurs gardaient l'ancien prix.
- **La loggia montre sa surface** ; box, garage et piscine ne disent plus « Surface non saisie ».
- **Un bien créé directement « En vente »** ne se dit plus « Mandat signé » dans l'historique.
  Un mandat noté après un retrait avant tout mandat ne se dit plus « Remis en vente » (`reprise`
  dans l'étape) ; son parcours s'arrête à l'estimation.
- **Un projet mis en attente** ne montre plus son ancien rendez-vous d'estimation.
- **Une nouvelle vente** ne reprend pas les notes de l'ancien vendeur, et la case « La visite »
  attend la visite de cette vente-ci.

**L'espace acheteur**
- **Son offre, telle que le CRM la tient** (`offreParBien` dans `page.tsx`, `etatOffre`) : offre
  envoyée, acceptée, non retenue, retirée, vente non conclue (compromis tombé), compromis signé,
  votre achat. Avant : « Offre envoyée » pour toujours.
- **Le serveur refuse** (`409 plus_dispo`, route `/api/espace/[action]`) :
  - une demande de visite sur un bien sous compromis, vendu, retiré ou en pause ;
  - « Je veux faire une offre » ou « le revoir » après une visite d'un bien vendu ou retiré.

  L'écran le dit (« Ce bien n'est plus disponible »). Avant, une page restée ouverte envoyait le
  mail, la relance, et ouvrait même le mandat.
- **« Pas pour moi » n'efface plus une offre faite** (`badge_retour` reste `offre_faite`).
- **Un bien vendu à un autre ou retiré ne montre plus de visite à venir.** Sous compromis, une
  visite reste (contre-visite, acheteur de secours).
- **Plus de « Je veux le visiter », « Je veux faire une offre » ni « le revoir »** sur un bien qui
  n'est plus disponible.
- **Un bien en pause** a son ruban « En pause » et se range dans « Plus disponibles ».
- **Des chiffres qui s'additionnent :**
  - « biens consultés » à l'accueil = « Tout » dans Consultés ;
  - l'aperçu de la carte ne montre plus les biens vendus à un autre ;
  - le compteur « nouveaux » du sélecteur de recherches ne compte plus les biens indisponibles
    (`lib/espace.ts`).
- **Sous compromis, la recherche est souvent en pause** : « Rien de nouveau » et « Nouveautés »
  ne disent plus « votre recherche continue » quand elle est arrêtée.
- **Les mots :**
  - « la signature définitive chez le notaire » au lieu de « l'acte » ;
  - « Ce bien n'est plus proposé à la vente » (sans dire qui l'a retiré) ;
  - « Plus disponibles » court, avec la note qui explique.

### V3.48 — 1er octobre 2026 · le bien vendu : retour à la liste, « Vendu le … à … », une nouvelle vente du même bien ; huit bugs du parcours de vente

Rien à passer dans Supabase.

**Après « C'est vendu »** (Alexandre : « il ne se passe rien ; qu'on ait l'impression que
l'action a été prise en compte »). La fiche se ferme et ramène sur « Mes mandats en cours », avec
un bandeau vert : la date de l'acte, le prix, l'acquéreur, et ce qui a suivi (« Vendeur signé »,
dossier finalisé). Il propose « Voir la fiche » et « Voir les vendus », et s'efface au bout de
20 s. Code : `BandeauVendu` dans `PageBiens.tsx`, `FicheBien.onVendu`, et `FenVendu.onFait(b,
texte)`.

**Le bien vendu se lit d'entrée** :
- **Le bandeau bleu** (`CoteVendu`) : « Vendu le 22 mai 2026 », le prix de l'acte, le vendeur et
  l'acquéreur.
- **L'historique du bien**, comme le Suivi des contacts :
  - « Vendu — acte authentique le … · prix » donne le vendeur, l'acquéreur, les notaires et les
    honoraires. `FenVendu` les garde dans l'étape : `vendeur`, `notaireVendeur`,
    `notaireAcquereur`.
  - « Compromis signé le … » donne l'acquéreur, les dates et les notaires.
  - « Compromis tombé — remis en vente / retiré » et « Offre tombée » donnent le pourquoi.
- **Le parcours** prend les vraies dates : signature du mandat, première offre, signature du
  dernier compromis, et l'acte (`vendu_le`) au lieu du jour où l'étape a été notée.
- « Dernièrement » ne montre que la première ligne du détail.

**Une nouvelle vente de ce bien** (Alexandre : « si dans 5 ans le bien revient à la vente ? »).
Elle se lance depuis le menu d'étape d'un bien vendu, ou le lien du bandeau.
- `nouvelleVente` (`outils.ts`) crée une **nouvelle fiche**. Elle reprend la description : les
  parties `bien`, `interieur`, `exterieur`, `pieces`, `energie`, `copro`, `observations` de
  `ETAPES_BIEN`, plus `gps`.
- Le propriétaire, le prix, le mandat, les infos de visite, l'annonce et les photos repartent de
  zéro.
- Propriétaire proposé : l'ancien acquéreur, qui passe « Vendeur ».
- L'ancienne fiche ne bouge pas (historique, honoraires). Les deux se citent : `venteAvant` dans
  la nouvelle, `venteSuivante` dans l'ancienne, dont le bandeau dit « Revendu : voir la nouvelle
  fiche ».
- **Un « Vendeur signé » qui revend** redevient « Vendeur » (`marquerVendeur` retire
  `vendeur_signe`). On peut aussi changer son type à la main sur sa fiche.

**Huit bugs trouvés en relisant tout le parcours de vente**, corrigés :
1. **« Votre achat » dans le mauvais espace.** L'espace d'un autre acheteur pouvait l'afficher
   (son offre acceptée puis tombée). `page.tsx` lit maintenant l'offre retenue au dernier
   compromis ; à défaut, la seule offre acceptée du bien. Une autre recherche du même client
   compte aussi (`client_id`). Au compromis, une autre offre restée « acceptée » passe « retirée »
   (`retirerAutresAcceptees`).
2. **Les relances de vendeur soldées à l'achat.** L'acte d'achat (ou « Il arrête ») soldait aussi
   ses relances de vendeur. S'il vend un bien avec nous, seules les relances de ses recherches se
   soldent (`solderRelancesAcheteur`).
3. **« Compléter le compromis » : les rappels ne suivaient pas une date changée.** Ils la suivent
   maintenant. Sur un bien déjà vendu, plus aucun rappel n'est posé.
4. **« Vendeur signé » trop tôt.** Ce type n'enlève plus « Vendeur » s'il a un autre bien en vente.
5. **« L'offre est tombée » laissait les offres en jeu.** `FenMandat` propose (case cochée) de les
   passer « retirées » et clôt leurs relances (`offresTombees`).
6. **« Annuler l'acceptation » ne laissait pas de trace.** Une ligne « Acceptation annulée »
   s'écrit dans les deux Suivis (`noterAcceptationAnnulee`).
7. **Compromis tombé : l'acquéreur ne revenait pas exactement comme avant.** Il revient tel
   qu'avant le compromis : `pauseAcquereur` garde `activeAvant`. Déjà « Suspendu », il le reste ;
   une recherche déjà arrêtée ne repart pas.
8. **Ordre des écritures au compromis.** `FenCompromis` change l'étape avant d'accepter l'offre :
   une étape qui échoue ne laisse plus une offre « acceptée » sans compromis.

**Un bien retiré de la vente** ne s'affiche plus comme disponible dans les espaces acheteurs :
ruban « Plus en vente », rangé dans « Plus disponibles ».

### V3.47 — 1er octobre 2026 · le compromis complet, la fin du parcours (vendeur signé, acheteur finalisé), les étapes de la vente dans le Suivi ; l'annonce, les surfaces

Alexandre, devant un compromis repris d'Immofacile : « comment je retrouve les notaires et
tout ? Il y a juste « La vente est signée » ». Puis : « si on veut modifier, un pop-up joli, avec
des icônes, des petites couleurs ».
- **La carte d'un compromis** (`CarteOffreB`, `NotairesCompromis`, `OngletsBien.tsx`) :
  - à gauche, les deux notaires (vendeur, acquéreur) avec Appeler · Mail · Sa fiche, et le
    compromis signé (« Joindre le PDF » / « Voir ») ;
  - à droite, les quatre dates, « À renseigner » quand l'une manque, les rappels programmés et
    « Compléter » / « Modifier ».
- **La fenêtre du compromis** (`FenCompromis`, `FenetresBien.tsx`) sert aussi à le compléter
  (`existant` : la ligne « compromis » du suivi). Elle a des rubriques colorées :
  - l'offre retenue ;
  - le compromis (signé le, prix, honoraires) ;
  - les dates, chacune sa couleur, avec « Calculer depuis la signature » quand elles manquent ;
  - les notaires (`ChoixNotaire` : contacts « Notaire », ou créés sur place par `creerNotaire`) ;
  - les rappels.
- **Les rappels** (`poserRappels`) sont proposés d'après les dates, cochés d'office s'ils sont à
  venir, et vont dans les Relances. Il y en a trois :
  - le lendemain de la fin de rétractation ;
  - 7 jours avant la condition de prêt (décoché pour un achat comptant) ;
  - 7 jours avant l'acte.

  Ils vont chez le propriétaire (ou l'acquéreur pour le prêt). Leurs ids et leurs dates sont
  gardés dans le compromis (`rappels`, `rappelsLe`) : une date qui bouge les déplace. Ils se
  closent à la vente signée (`FenVendu`) et quand le compromis tombe (`FenMandat` depuis
  « Sous compromis ») : `cloreRappelsCompromis`.
- **Le compromis, dans `donnees`** (rien en SQL) : `notaireVendeur` et `notaireAcquereur`
  (`{ id, nom, etude, tel, email }`). `notaireAcq` (le texte d'avant) reste écrit.
- **« Le vendeur a déjà accepté »** dans « Une offre est arrivée… » : l'offre arrive acceptée,
  sans relance.
- **L'annonce** (`CarteAnnonce`) : le texte s'affiche d'office, avec les mentions obligatoires en
  petit à côté ; « Replier le texte ».
- **Les surfaces** : « Modifier » ouvre l'éditeur sur « Les surfaces » (`etapeDepart`
  `bien:t-surf`, la partie s'éclaire), au lieu du haut de l'étape « Le bien ».
- **« Pour la visite »** : une ligne longue (contact sur place) prend toute la largeur, le
  numéro sur sa ligne et cliquable. Dans une colonne de 100 px, il se coupait mot à mot.

**La fin du parcours** (Alexandre : « au vendeur qui a signé, avoir un choix : vendeur signé ;
l'acheteur pareil, finalisé »). Chaque geste est une case cochée d'office dans la fenêtre, et
jamais bloquant.
- **Au compromis** (`FenCompromis`, rubrique « Et ensuite ») :
  - « Mettre la recherche de X en pause » (`pauseAcquereur`) : l'acquéreur passe « Suspendu »
    et sa recherche `active = false`. Ce qu'il était avant est gardé dans le compromis
    (`acqPause`). Si le compromis tombe, `compromisTombe` le rend (si on le choisit, voir
    ci-dessous).
  - « Les autres offres passent en refusées » (`refuserAutresOffres`).
- **À l'acte** (`FenVendu`, refaite en rubriques) :
  - « Dossier de X finalisé » (`finaliserAcquereur`) : « Bien trouvé », toutes ses recherches
    arrêtées, ses relances en attente soldées, comme « L'acte est signé » d'une chasse ;
  - « X passe en « Vendeur signé » » (`vendeurSigne`).
  Ces fonctions n'écrivent plus de ligne au journal : la ligne de l'étape le dit (ci-dessous).
- **Nouveau type de contact `vendeur_signe`** (« Vendeur signé », `src/lib/contacts.ts`) : il
  remplace « vendeur » dans `clients.types`, en gardant les autres types. Il a sa tuile dans
  Contacts. Pas de SQL : `types` est un `text[]` sans contrainte. `aUnBien()` : vendeur, vendeur
  signé ou propriétaire. Ses biens, sa société et ses documents restent sur sa fiche.
- **Le compromis est tombé** (`FenCompromisTombe`, menu d'étape « Le compromis est tombé… » ;
  avant, c'était la fenêtre du mandat). Alexandre : « soit reprendre la recherche de l'acheteur,
  peut-être qu'il n'est plus en recherche ; soit le vendeur ne veut plus vendre ».
  - Le pourquoi (refus de prêt, rétractation, condition non levée, le vendeur se retire…).
  - Le bien : « Il repasse En vente » (le mandat continue, même prix) ou « Le vendeur ne veut
    plus vendre » (« Retiré »).
  - L'acquéreur : sa recherche reprend (ce qu'il était avant), reste en pause (« Suspendu »), ou
    s'arrête (dossier clos « A renoncé », `perdu`, comme « Clôturer » sur sa fiche).
  - L'offre retenue passe `retiree` + `donnees.compromisTombe { le, raison }` : la carte et la
    ligne disent « Compromis tombé », elle ne se propose plus pour un compromis.
- **L'espace acheteur** : un bien de l'agence sous compromis ou vendu le dit.
  - `page.tsx` lit l'étape du bien en vente (`vente` : `{ etat, vous }`). `vous` : l'offre
    acceptée porte sa recherche.
  - Sur la carte, un ruban : « Sous compromis » / « Vendu » ; « Votre compromis » / « Votre
    achat » pour celui qui l'achète.
  - Sur la fiche, une phrase, et plus de barre « Qu'en pensez-vous ? ».
  - Dans « Consultés », deux rubriques : « Votre achat » en tête, « Sous compromis ou vendus » à
    la fin.
  - Un bien vendu à un autre sort des nouveautés, des avis à donner, de « Découvrir » et de la
    carte.
  - Seulement pour les biens des mandats de l'agence. Les annonces de la veille, le CRM ne sait
    pas quand elles se vendent.

**Les étapes de la vente dans le Suivi** (Alexandre : « achat signé, acte authentique ; pareil
pour le vendeur, avec la date et tout, pour qu'on le retrouve dans le suivi »). `noterJalon`
(`biens/outils.ts`) écrit une ligne chez le vendeur (son Suivi général : ni recherche, ni bien)
et chez l'acquéreur suivi (sa recherche, `bien_id` = sa copie du bien). Toujours, sans case à
cocher ; jamais bloquant.

| Étape | Où | Vendeur | Acquéreur |
|---|---|---|---|
| Mandat signé (pas une remise en vente) | `FenMandat` | « 📋 Mandat de vente signé le … » : type, n°, fin, prix | — |
| Offre notée | `enregistrerOffre` | « 💶 Offre reçue — X € » | « 💶 Offre à X € — bien » (la ligne d'avant, datée) |
| Offre acceptée | « Il accepte » (`noterOffreAcceptee`), ou « déjà acceptée » | « 🤝 Offre acceptée — X € », l'offre de départ si négociée | pareil |
| Compromis | `FenCompromis` (nouveau, pas « Compléter ») | « ✍️ Compromis signé le … » : prix, acquéreur, les trois dates, les notaires | pareil, + « recherche en pause » si cochée |
| Compromis tombé | `FenCompromisTombe` (`compromisTombe`) | « ↩️ Compromis tombé » + le pourquoi, remis en vente ou retiré | pareil, + reprend / en pause / arrête |
| Acte | `FenVendu` | « 🔑 Vente signée — acte authentique le … » : prix, acquéreur, notaires, « Vendeur signé » | « 🔑 Achat signé — acte authentique le … » (`dossier_finalise` si finalisé) |

- La date de l'étape est **dans le titre** : la ligne s'écrit le jour où on la note.
- Type `etape_transaction` (`mandat` pour le mandat) ; `metadata.jalon` (+ `cote`,
  `bien_vente_id`). Pas de SQL.
- `FriseSuivi` : une ligne qui porte `metadata.jalon` est une **carte** à la couleur de l'étape
  (`JALONS`, liseré à gauche, `.carteJalon`), plus une ligne « Système » discrète coupée à deux
  lignes. Icônes ajoutées : `cle`, `signature`, `accord`.
- Les fenêtres le disent : « Une ligne datée dans leur suivi » (`Trace`) dans « Et ensuite ».

### V3.46 — 1er octobre 2026 · l'éditeur des documents : l'aperçu qui mène à la question, deux colonnes à régler, les zones de texte qui s'agrandissent

Demandes d'Alexandre en reprenant le mandat SCI AVIENA :
- « Quand on clique sur un paragraphe de l'aperçu, que ça amène directement à la modif » ;
- « une ligne au milieu pour réduire soit le champ de texte, soit l'aperçu » ;
- « un petit bouton qui permet de masquer l'aperçu » ;
- « la clause particulière est toute petite : un petit truc en bas pour l'étendre ».

Ce qui a été fait :
- `versQuestion.ts` (nouveau, pur) : le passage cliqué → la question. Aucun modèle n'a rien à
  déclarer : on cherche dans le texte du passage les réponses déjà données (noms, adresses,
  montants mis en forme, dates en toutes lettres, cases des lots) ; la plus longue gagne (un
  texte compte dès 6 signes, un nombre dès 4 : « 75016 » ou « 3 mois » ne désignent rien).
  Sinon la rubrique décide : une question au même nom (« Clause particulière », « Durée »),
  une petite table (`RUBRIQUES` : « Il a été convenu… » → le type de mandat, « Pouvoirs »,
  « Droit de rétractation », « Informations »), l'étape dont `vers` est la rubrique, et à
  défaut la rubrique d'avant. Testé sur les 8 modèles.
- `ApercuActe.tsx` : `data-bloc` sur chaque passage, `data-si` (rang de la rubrique, toutes
  parties confondues) et `data-titre` sur les cartes du résumé ; `cliquable` : contour or au
  survol.
- `ChampsActe.tsx` : `data-cle` sur chaque question (l'éditeur la retrouve) ; `ZoneTexte` pour
  les champs `zone` (clause particulière, précisions, et les notes de l'éditeur des biens, qui
  réutilise `ChampActe`) : la zone grandit avec le texte jusqu'à 260 px puis défile ; dessous,
  une poignée à tirer (double-clic : taille d'origine) et « Agrandir » / « Réduire ». La mesure
  garde la page en place (pas de saut en tapant).
- `EditeurDocument.tsx` : au clic, l'étape s'ouvre, les questions défilent jusqu'à la bonne,
  qui s'allume (`.vise`), et le curseur s'y pose (souris seulement) ; l'aperçu ne bouge pas
  pendant 1,6 s (`calme`). Barre entre les colonnes (`--part`, de 340 px à l'une comme à
  l'autre ; clavier ← → ; double-clic : moitié-moitié), retenue dans `documents.partage`.
  « Masquer » (en-tête de l'aperçu, collé en haut) : les questions prennent toute la largeur,
  un rail « Afficher l'aperçu » à droite, retenu dans `documents.apercu` ; masqué, l'aperçu
  n'est plus rédigé (la frappe va plus vite). Au téléphone, rien ne change : les onglets
  Questions / Aperçu, et toucher un passage ouvre sa question.
- Les styles sont portés par `.edCorpsDoc` : l'éditeur des biens partage `.edCorps`,
  `.edApercu` et `.edApercuT` et ne doit rien en voir.
- Banc d'essai : 41 vérifications en 1280 et 390 px (personne, prix, clause, lot, carte du
  résumé, étape par étape, document figé, barre, clavier, masquer, zone longue, poignée) ; une
  relecture indépendante, ses constats corrigés (styles qui débordaient sur l'éditeur des biens,
  rubrique cachée sous l'en-tête collé, « 1 000 » trouvé dans « 51 000 », titre de partie,
  réglage venu d'un écran plus large, aperçu masqué puis fenêtre élargie).

### V3.45 — 1er octobre 2026 · les offres : la négociation, la suite, le document ; l'onglet Acheteurs plus juste

Remarques d'Alexandre en reprenant ses fiches d'Immofacile :
- « Visites et offres, il est où le bouton pour passer en compromis ou dire si l'offre est
  acceptée ? »
- « L'offre écrite, on ne comprend pas. »
- « Il n'y a pas l'année. »
- « S'il y a quatre contre-offres, ça fait quatre blocs ? »
- « Les prochaines visites traînent toutes seules : en haut, et qu'on puisse replier. »
- « L'onglet Acheteurs montre des gens sans rapport. »

- **La carte d'une offre** (`CarteOffreB`, `OngletsBien.tsx`) : un bloc par acquéreur, en deux
  moitiés quand la place le permet (requête de conteneur à 720 px).
  - À gauche : le montant sur la table, l'acquéreur, et la négociation ligne à ligne.
  - À droite : quatre étapes (Reçue · Réponse du vendeur ou Négociation · Acceptée · Compromis
    signé), une question « Et maintenant ? » avec ses réponses, puis le document.
  - Les réponses :
    - « Il accepte / Contre-offre… / Il refuse » ;
    - puis « Il accepte / Nouvelle proposition… / Il renonce » ;
    - puis « Le compromis est signé → » (`FenCompromis` s'ouvre sur cette offre) ;
    - puis les dates du compromis et « La vente est signée → ».
  - Le montant se tape dans la carte : fini le `prompt()`.
  - Chaque carte se replie sur une ligne.
- **La négociation** : `donnees.echanges` (`{ le, par: 'acquereur' | 'vendeur', montant }`).
  - `apresReponse` (`src/lib/biens-vente.ts`) calcule le statut et les réponses. `'en_attente'` =
    au vendeur, `'contre'` = à l'acquéreur.
  - `accepte_a` = le prix convenu, repris par `FenCompromis` (`prixRetenu` → `montantActuel`).
  - Les offres d'avant se lisent avec `echangesDe` (montant + `contre`).
- **Le document** de l'offre est relié à elle (`donnees.offreSuiviId`). Ceux d'avant sont
  retrouvés par l'acquéreur et le prix. La carte rouvre le document au lieu d'en créer un à chaque
  clic. L'offre signée peut se joindre après coup (`joindreOffreSignee`).
- **« Corriger l'offre »** : `FenOffre` en mode `existante` (`modifierOffre`). La relance suit le
  nouveau délai.
- **« Avec un prêt »** n'est plus coché d'office : le financement reste vide tant qu'on ne le sait
  pas (les pastilles se décochent d'un second clic).
- **La relance « réponse à donner »** du propriétaire :
  - elle garde son id dans l'offre (`relance_id`) ;
  - elle se clôt à la première réponse et à la signature du compromis (`cloreRelanceOffre` ; pour
    les anciennes offres, par sa note) ;
  - elle n'est plus créée quand le délai est déjà passé (une offre notée après coup tombait tout
    de suite « 231 j de retard »).
- **L'onglet Visites et offres** (`VisitesOffres.tsx`) :
  - Trois rubriques dans l'ordre visite → offre, chacune repliable sur une ligne avec son résumé.
    Le choix est gardé dans ce navigateur : `emilio.visitesOffres.plis`.
    - Les visites : comptes rendus à faire et prochaines visites.
    - Les offres : celle de la vente (compromis, vendu) d'abord, puis celles en cours.
    - L'historique.
  - L'encart « Une offre est acceptée… » disparaît : le bouton est sur la carte.
- **L'année partout** dans la fiche d'un bien : `dateCourte` (lib), `dateCourteMois`, les pavés
  de date, « Reçue le 12 février 2026 ».
- **L'onglet Acheteurs** : `raisonEcart` (`src/lib/ecart-acheteur.ts`) écarte d'office une
  recherche qui rate nettement un critère essentiel, quelle que soit sa note. Il sert à
  `acheteursTries`, aux alertes « Un mandat / un acheteur arrive » (`alertes-rappro.ts`) et aux
  mandats proposés à un client (`rapprochement.ts`) ; l'espace de l'acheteur garde la note telle
  quelle. Les cas :
  - budget dépassé de plus de 10 % ;
  - une autre ville ;
  - moins de 90 % de la surface ;
  - moins de chambres ;
  - un indispensable absent, seulement si la fiche remplit ses annexes (ou son immeuble) :
    `equipConnus`.

  Les villes se comparent comme les communes (« Paris 16e » = « Paris 16ème », `cleCommune`).

  La liste le dit en une ligne (`phraseEcartes`). Sur téléphone, l'avatar ne se cachait plus
  (style en ligne d'`AvatarContact`) et écrasait les noms dans une colonne de 24 px : corrigé.
- **Le calendrier** (`ChoixDate`) passe au-dessus de toute fenêtre (z-index 20000). Il s'ouvrait
  derrière « Ajouter une action ».

### V3.44 — 1er octobre 2026 · « Découvrir » : les nouveaux biens, un par un

Alexandre a validé les maquettes V2 (téléphone et ordinateur) et demandé de les mettre en place
pour les nouveaux biens, « sans rien casser ». Le détail est au §3, « L'espace acheteur ».
- `Decouverte.tsx` (nouveau) : l'écran, le curseur, la question, « Annuler mon dernier choix ? »,
  l'écran de fin ; il exporte aussi `GalerieGlisse`, reprise par la fiche ouverte d'ici.
- `EspaceClient.tsx` : `ouvrirBien` envoie les biens `aDecouvrir` dans « Découvrir » ; les
  entrées (bouton doré de l'accueil et de « Nouveautés », case « nouveaux biens », `?vue=neufs`),
  la reprise après rechargement, `enregistrerDecouverte` (route `retour`, sans le grand « C'est
  noté » ; erreurs `mandat` / `mandat_document` comme `poserAvis`), `envoyer(…, garder)`,
  `FicheBien` en mode `decouverte`, la page `inert` sous l'écran.
- Route `/api/espace/retour` : pose `vu_le` (et `nb_vues` + 1) si le bien n'avait jamais été
  ouvert. Sans ça, un bien répondu depuis « Découvrir » restait « nouveau » (ETAT de page.tsx,
  pastille des notifications). Route `vue` : `apercu` compte l'ouverture dans l'historique sans
  poser `vu_le`.
- Notification de plusieurs nouveaux biens : `?vue=neufs` ouvre directement « Découvrir ».
- Banc d’essai : 45 vérifications (5 secondes mesurées, annulation, arrière-plan, rechargement,
  échec d'envoi, mandat, clavier, Échap) en 390, 375 × 553, 768, 1024, 1280 et 1440 px ; deux
  relectures indépendantes, leurs constats corrigés (pastille qui restait après un envoi anticipé,
  carte coupée sur un petit téléphone, compteur doublé après un échec, rechargement pendant les
  cinq secondes, ouverture de fiche invisible pour le conseiller).

### V3.43 — 30 septembre 2026 · le diagnostic : sécurité et cohérence

Alexandre : « fais un diagnostic du code, sécurité ou autre ». Trois relectures (accès, fichiers et
fuites, cohérence des données), chaque constat revérifié dans le code. Rien de critique ni
d'ouvert au public ; ce qui suit est corrigé.
- **Les données**
  - `enregistrerBien(id, d, base)` et `changerEtape` ne réécrivent plus toute la fiche depuis
    l'écran : seules les clés changées depuis `base` sont posées sur la fiche relue en base
    (`fusion`, biens/outils.ts). Avant, la fiche ouverte sur l'ordinateur effaçait la visite saisie
    sur la tablette, ou le mandat noté par la signature en ligne. Les appels passent leur base :
    FicheBien (`prev.donnees`), EditeurBien et VisiteSurPlace (`vu`, mis à jour à chaque
    enregistrement), FenDefinirEstimation, FenPrix.
  - Les photos d'un bien en vente (`photos-vente`) ne sont plus effacées quand des acheteurs ont
    reçu le bien (`bienPartage`) : leur copie montre les mêmes fichiers. Supprimer un bien : la ligne
    d'abord, les fichiers ensuite.
  - V3.42 corrigée : `finDuMandat` prend la limite totale pour tout mandat prorogé (exclusif compris ;
    la liste disait « Exclusivité terminée » au bout de trois mois) ; `bienConcerne` couvre aussi
    sous offre et sous compromis (« Ne rien changer » proposé d'office).
  - Documents : supprimer un brouillon relit d'abord son état, supprime la ligne (vérifiée), puis
    ses fichiers ; l'action `retirer` de /api/documents refuse les fichiers d'un document qui n'est
    plus un brouillon.
  - Listes au-delà de 1 000 lignes (`toutLire`) : recherche de la barre du haut, tableau de bord,
    Nouveau mail, carte, contacts des biens, Nouveau document, Documents (500 documents et 300
    mandats en ligne avant), noms des clients par paquets de 150.
  - `genererReference` : le plus grand numéro de l'année, plus le tri alphabétique (cassé à 1000).
  - Le mail du point automatique : la ligne du suivi est écrite avant l'envoi, retirée si le mail ne
    part pas (un échec d'écriture renvoyait le mail chaque jour).
  - Fin du mandat de recherche : `ajouterMois` (lib/mandat.ts) partout, en mois comme le texte
    (plus 365 jours ; la saisie manuelle de FicheClient décalait d'un jour au passage de l'heure
    d'été). `finRetractation` : 23 h 59 à l'heure de Paris du jour (l'été, la limite tombait à
    0 h 59 le lendemain et « jusqu'au » affichait le lendemain).
  - Espace : un avis de visite ne s'enregistre qu'une fois (`avis_client_le` encore vide) ; « Je
    veux visiter » ne prévient pas une deuxième fois tant que la relance « Veut visiter » de ce
    bien est encore ouverte (d'abord « une fois par jour » en lisant le journal : après « Remettre
    en attente », une vraie nouvelle demande restait muette — corrigé à la relecture).
  - Honoraires à la charge du vendeur : le pourcentage affiché est sur le prix (5 %, plus 5,26 %).
- **La signature en ligne**
  - L'essai du code est réservé avant la comparaison, en une requête qui compare puis écrit
    (`code_essais` égal à ce qu'on a lu) : documents (`validerSignature`), co-signataires
    (/api/signer), mandat de recherche (/api/espace/mandat). Des essais lancés tous en même temps
    passaient la limite de cinq ; un double clic signait deux fois.
  - Le co-signataire du mandat de recherche reçoit son code à l'adresse qui a reçu son lien, jamais
    à une adresse tapée sur la page (champ en lecture seule, `Champ lecture`). Le certificat dit
    « Adresse indiquée par <premier signataire> ».
  - Un lien de signature qui ne sert plus (expiré, refusé, fini) n'envoie plus le mandat ni les
    coordonnées des signataires à la page ; un document, plus son texte.
  - Le certificat ne dit « signature tracée » que si le tracé a été rangé.
- **Les accès**
  - proxy.ts : une action du CRM (méthode autre que GET) venue d'un autre site (en-tête Origin d'un
    autre hôte) est refusée (403). Sans Origin, le badge suffit, comme avant.
  - /api/login refuse une session anonyme. La page de connexion refuse un « suite » avec blanc,
    tabulation ou barre inverse (redirection vers un autre site).
  - /api/point-auto (mode `etat`) ne renvoie plus le lien d'espace de chaque client.
  - /api/upload-photos : http(s) vers une adresse publique seulement (DNS vérifié, pas de réseau
    privé ni localhost), redirections revérifiées (trois au plus), une vraie image reconnue à ses
    premiers octets, 15 Mo au plus, `bien_id` contrôlé. `photos.ts` ne reconnaît « nos » photos
    qu'à leur adresse complète (notre serveur, le chemin du bucket, sans paramètre). Une entrée =
    une sortie, dans l'ordre : ce qui n'est pas rangé chez nous (refusé, illisible, au-delà de 40)
    garde son adresse d'origine, sans que le serveur aille la chercher.
  - Les routes publiques de l'espace ne renvoient plus le texte des erreurs internes.
  - /bien/<id> : `noindex`.
- **Relecture après mise en ligne** (deux relectures indépendantes de tout le lot, le soir même)
  - upload-photos rendait une liste plus courte quand une adresse était refusée : la fiche d'un
    bien acheteur (`saveFicheBien`, FicheClient), qui apparie par rang, y laissait un trou (`null`),
    puis plantait au clic suivant. Corrigé dans la route (une sortie par entrée) et chez l'appelant
    (`urlsUploadees[idx] || p`).
  - FicheBien : un enregistrement raté (connexion coupée) n'était plus rattrapé par le clic
    suivant, qui n'envoyait que sa propre clé. `enregistrerDansLOrdre` garde les clés ratées
    (`aReprendre`) et les renvoie avec le clic suivant.
  - FicheClient : l'aperçu « Expiration calculée » compte aussi avec `ajouterMois` (il disait le
    3 mars quand l'enregistrement disait le 28 février).
  - Documents : supprimer un brouillon déjà supprimé dans un autre onglet le retire de la liste,
    sans message d'erreur.
  - « Et la fiche du bien ? » dit « En vente », « Sous offre »… (`etapeDe().court`).
  - Laissé : un code juste compte pour un essai même si la signature échoue ensuite côté serveur
    (panne de stockage) ; cinq pannes de suite demandent un nouveau code.
- **Laissé tel quel, en connaissance de cause**
  - Le badge de connexion vaut 30 jours et la déconnexion ne l'annule pas ailleurs : changer
    `EMILIO_ACCESS_CODE` dans Vercel déconnecte tout le monde. `EMILIO_MAILS_AUTORISES` doit contenir
    l'adresse d'Alexandre (sinon tout compte Supabase du projet entre).
  - Clore les relances « Veut visiter » se fait sur le titre du bien (deux biens au même titre chez
    le même client : les deux se closent) ; il faudrait une colonne `relances.bien_id` (SQL).
  - Le partage d'une fiche depuis l'espace (5 par jour) n'est pas atomique.

### V3.42 — 30 septembre 2026 · le mandat de vente relié à la fiche du bien

Alexandre : « quand j'annule un mandat, il y a toujours les informations du mandat sur les
fiches, c'est quoi ce bug ? Pourquoi je suis obligé de passer par Supabase ? ». Le mandat vivait à
deux endroits qui ne se parlaient pas : le document (Documents) et ce qui est noté sur le bien
(étape, `mandat_type`, `mandat_numero`, `mandat_fin`, `donnees.mandat*`). Signer ou annuler l'un
laissait l'autre tel quel ; `changerEtape` n'efface jamais les champs du mandat.
- **`src/lib/mandat-bien.ts`** (nouveau, isomorphe : il reçoit le client Supabase) :
  `mandatSigneSurBien` (signé dans Documents → le bien passe « En vente » avec le n°, le type, la
  date, la fin, le prix et les honoraires du document, `document_id` rattaché, une ligne d'étape
  `source: 'documents'` ; sous offre, en pause ou sous compromis, il garde son étape et reçoit une
  note ; vendu, rien), `retirerMandatDuBien` (le mandat quitte la fiche : étape choisie,
  `en_vente_le` vidé, prix conseillé remis si voulu, honoraires effacés si voulu, ligne d'étape
  `annule: true`), `terminerMandatDuBien` (« Retiré »), `bienConcerne`, `etapeAvantMandat`,
  `finDuMandat` (simple : la limite totale s'il se prolonge ; exclusif ou semi : la première
  période, celle de l'exclusivité).
- **Signé** : à la main (`apresSignature`, documents/outils.ts), en ligne ou sur place
  (`classer`, signature-documents.ts, côté serveur). Le bouton « Passer le bien en vente » de la
  fiche reste, si la mise à jour a échoué.
- **Annulé ou brouillon supprimé** dans Documents : quand la fiche du bien en dépend encore
  (`bienConcerne` : le bien « En vente » ou en pause, et le mandat signé, ou le même numéro, ou
  aucun mandat signé noté), la fenêtre « Et la fiche du bien ? » (`SuiteMandatBien.tsx`)
  propose : le mandat est terminé (« Retiré »), il avait été fait par erreur (retour à
  l'estimation), ne rien changer.
- **Sur la fiche** : « Annuler ce mandat… » dans le menu d'étape (en vente ou en pause), et dans la
  carte du mandat (onglet Documents) quand il a été noté à la main. Fenêtre `FenAnnulerMandat`
  (FenetresBien.tsx) : revenir à l'estimation ou à « À suivre », le prix conseillé ou le prix
  actuel, garder ou effacer les honoraires, la raison. Signé dans Documents, elle renvoie vers
  Documents (« Marquer annulé »). Passé « En vente » sans mandat signé noté : « Le mandat n'est pas
  encore signé… », même fenêtre, qui ramène le bien en arrière.
- **Plus de « Mandat en cours » pour un mandat en rédaction** : la liste lit les mandats de vente
  de Documents (`chargerListe` → `mandats`, quelques colonnes, `mandatsParBien`), et `ligneEtat`
  dit « Mandat en préparation », « Mandat en signature », « Mandat prêt à signer », « Mandat pas
  encore signé » ou « Mandat signé le … ». Le bandeau de la fiche (`CoteMandat`), le bouton d'étape
  et le fil disent pareil (« En vente » tant que rien n'est signé).
- **La liste, colonne de droite refaite** : l'état avec son dessin, puis des puces (visites
  faites, prévues, offres, acheteurs ; un zéro en tirets pâles ; avant la vente, le mandat en
  route). Les cartes ont les mêmes puces.
- Corrigé au passage : un mandat signé puis annulé comptait encore comme « signé » dans l'onglet
  Documents de la fiche (`mandatSigne` ignore maintenant les annulés).
- Aucun SQL : `biens_vente.document_id` et `documents.signature` existent déjà.

### V3.41 — 30 septembre 2026 · « Nouveau mail » refait : style, mise en forme, pièces jointes, aperçu

La page Nouveau mail (`PageMail.tsx`, `PageMail.module.css`) ne passait plus par la coque des
sélections de biens : un simple message partait avec « SÉLECTION PRIVÉE » en en-tête et « Je ne
suis plus en recherche » en pied, même adressé à un vendeur.
- **À qui** : tous les contacts non archivés (acheteurs, vendeurs, notaires, confrères…), cherchés
  par nom, référence ou adresse ; ou une **adresse libre**, tapée puis Entrée. Un contact sans
  adresse est grisé. Un contact reçoit sur toutes ses adresses, dans un seul mail.
- **Le style**, au choix : « Simple » (le mail tel qu'on l'écrit dans sa messagerie, par défaut) ou
  « Avec l'en-tête Emilio » (bandeau marine au logo, nom et téléphone du conseiller en pied,
  mentions de l'agence dessous ; ni étiquette ni lien de sortie).
- **Le texte** : un éditeur (gras, italique, souligné, listes, liens, bouton « Prénom »), le
  collage arrive en texte seul ; messages pré-rédigés gardés (ils proposent aussi un objet). Le
  message de départ laisse une ligne pour écrire, où le curseur se pose au premier clic.
- **Pièces jointes** : PDF, images, Word, Excel, texte (25 Mo par fichier), déposées tout de suite
  dans le bucket privé `mandats`, sous `mails/<aaaa-mm>/` ; jusqu'à 10 Mo jointes, au-delà des
  liens valables 7 jours.
- **Aperçu avant envoi** : le mail exact, destinataire par destinataire ({{prénom}} remplacé),
  en largeur ordinateur ou téléphone ; l'envoi se fait depuis l'aperçu, qui dit ce qui manque.
- Tout le HTML passe par `src/lib/mail-libre.ts`, commun à l'écran et au serveur :
  `nettoyerHtml` (ne garde que div, p, br, b, i, u, a[href http/https/mailto/tel], listes,
  citation), `htmlVersTexte`, `personnaliserHtml` (valeurs échappées ; « Bonjour {{prénom}}, »
  sans prénom devient « Bonjour, »), `personnaliserObjet`, `mailLibreHtml` (les deux styles).
- Le serveur : `/api/mail` (`depot` pour une pièce, `envoyer`). Un mail par destinataire, au nom
  d'Alexandre. Pour chaque contact du CRM, choisi ou retrouvé par son adresse : `envois`
  (`mail_libre`) et `journal` (`mail_envoye`, « ✉️ Mail envoyé — objet »), rangés dans sa
  recherche ouverte s'il en a une. Une adresse hors CRM ne laisse aucune trace.
- `/api/send-mail` : « SÉLECTION PRIVÉE » n'apparaît plus que sur un mail qui porte des biens
  (le mail simple de l'Agenda passe encore par là).

### V3.40 — 30 septembre 2026 · envoyer le projet d'un document, avant la signature

Un brouillon part en relecture à qui l'on choisit, sans lancer la signature : plus besoin
d'« annuler, corriger, renvoyer » quand les vendeurs demandent un changement.
- Deux portes : **« Envoyer le projet »** dans la fiche du document (Documents › un brouillon,
  sous « Reprendre le brouillon ») et **« Envoyer ce projet »** dans la barre de l'éditeur, à côté
  de « Aperçu PDF » (au téléphone, l'icône seule). Pas pour les courriers.
- La fenêtre (`FenetreProjet`, `src/components/documents/EnvoiProjet.tsx`) : les signataires du
  document (cadres `m.cases`, l'agence mise à part) avec l'adresse saisie dans le document, puis la
  fiche client ; une adresse ne figure qu'une fois (la gérante qui est aussi associée). Personne
  n'est coché d'office, sauf un signataire seul. Une adresse manquante se tape sur place ; « Ou une
  autre adresse » en prend plusieurs, séparées par une virgule. Objet et message proposés
  (« Bonjour {{prénom}}, … »), modifiables ; « Le voir » ouvre le PDF qui partira.
- Le serveur (`/api/documents`, action `projet`) relit le brouillon **enregistré** (l'éditeur
  enregistre d'abord ce qui est en attente), fabrique le PDF « PROJET NON SIGNÉ » (`pdfDocument`,
  `projet: true`, l'identité de l'agence du jour : le même que « Aperçu PDF »), et envoie **un mail
  par personne**, la pièce jointe `Projet-<titre>.pdf`, `{{prénom}}` remplacé pour chacun.
- La trace : `documents.envois` (colonne neuve, SQL à passer) ; l'historique du bien en vente
  (`biens_vente_suivi`, `type: 'envoi'`, `donnees.projet: true` → « Projet envoyé à … » dans la
  fiche du bien) ; le Suivi des contacts du CRM retrouvés par leur adresse (`mail_envoye`).
- La fiche du document gagne une carte **Historique** (créé, projets envoyés, finalisé, signature
  lancée, signé, annulé ; du plus récent au plus ancien) ; « Informations » ne garde que le
  modèle, le numéro, « Modifié » et les signataires. Dans l'éditeur, sous le titre : « Projet
  envoyé le … à … », et « modifié depuis » si le brouillon a changé après.
- Le document reste un brouillon : rien n'est figé, aucun numéro n'est pris au registre.

### V3.39 — 30 septembre 2026 · le mandat de vente d'une SCI, signé aussi par ses associés

Pour une SCI familiale aux statuts anciens (le premier cas : huit associés, dont une branche
venue d'une succession), le gérant signe le mandat pour la société, et les associés le signent **pour accord**. Ils ne
deviennent pas mandants : la société seule vend.
- Étape « Qui vend », en mode SCI : **« Les associés signent-ils aussi ? »** (`sciAssocies`, non par
  défaut). Oui ouvre « Le gérant qui signe est-il aussi associé ? » (`sciGerantAssocie`), la liste
  **« Les autres associés »** (`associes`, cartes courtes : civilité, nom, adresse, e-mail,
  téléphone ; 12 au plus), « Avec le gérant, sont-ils tous les associés ? » (`sciTous`) et un
  **prix net vendeur minimum** facultatif (`sciPrixMin`). Tout dans `mandat-vente.ts`.
- Le texte : sous les parties, « Interviennent au présent mandat, en qualité d'associés… pour donner
  leur accord », la liste, puis l'accord (vente autorisée, au prix minimum s'il est donné). Tous
  les associés : « Cet accord vaut décision unanime des associés (article 1854 du Code civil) ».
- Les signatures : un cadre par associé (`cle` `associe0`, `associe1`…, « Associé » ou
  « Associée », « Pour accord »), entre la société et l'agence, sur papier comme en ligne et sur
  place. Le gérant associé ne signe qu'une fois : son cadre porte « Et en son nom, en qualité
  d'associé(e), pour accord ». Mention papier : « bon pour accord » pour les associés. Le nombre
  d'exemplaires les compte.
- `accepter` : une phrase à part pour les associés. `demandeExpresse` (`commun.ts`) ne leur demande
  pas de commencer avant les 14 jours : ils ne sont pas mandants.
- Pas repris dans l'avenant ni dans la délégation : l'avenant reste signé par le gérant seul.
- Vérifié au banc (éditeur et aperçu, 390 et 1280 px) et en PDF (papier et en ligne, 9 cadres sur
  deux pages) ; les mandats déjà écrits ne changent pas (`sciAssocies` absent = non).

### V3.38 — 30 septembre 2026 · les tantièmes sur un autre total ; le site branché

**Tantièmes** (mandat de vente, son avenant, la délégation qui le reprend) : « Les tantièmes sont
comptés sur » gagne **« Un autre total »** (`TANTIEMES_BASES`, `commun.ts`), qui ouvre **« Sur
combien ? »** (`tantiemesTotal`, obligatoire, `champTotalTantiemes` dans `mandat-vente.ts`). Pour
une copropriété au total pas rond (2 347, 9 856…).
- `baseTantiemes(d)` rend ce total ; `totalTantiemes(d)` l'écrit avec ses espaces (« 2 347 ») ;
  `tantiemes()` écrit « 145/2 347es », ou « 145/… » tant que le total manque.
- Un lot compté sur un autre total s'écrit en entier dans sa case (« 12/500 ») : gardé tel quel, et
  sa case ne montre plus le « / 2 347 » commun (`ChampLignes`, `ChampsActe.tsx`).
- Jusqu'à 40 lots (12 avant). `tantiemesTotal` suit `tantiemesBase` partout où il est repris
  (avenant : `REPRIS` et la mise à jour du mandat ; délégation : `REPRIS_VENTE`).

**Le site est branché** (dépôt `emilio92100/emilio-immo.modernelovable`, commit « Site branché sur
le Supabase du CRM ») : `.env` pointe sur le projet du CRM (`eutxmrdcykztjdyydmuo`, clé publique
`sb_publishable_…`), `vercel.json` aussi. Les quatre fonctions du site tournent dans le projet du
CRM, **« Verify JWT » coupé** (une clé `sb_publishable_` n'est pas un jeton) : `send-contact-email`
(le relais de la V3.37), `fetch-properties` (le flux immo-facile), `dvf-estimate`, `sitemap`.
Lovable Cloud ne reçoit plus rien (45 demandes, toutes reprises, la dernière du 9 septembre).
- Vérifié : les quatre formulaires s'enregistrent en visiteur anonyme, qui ne peut rien relire
  (essai SQL sous `set local role anon`, annulé) ; le site lit ses 29 biens sur le projet du CRM.
- Le sitemap que lit Google est le fichier `public/sitemap.xml` du site : Vercel sert un fichier
  existant avant ses réécritures, et la fonction `sitemap` n'a jamais été lue. Rien n'a changé pour
  Google.
- `dvf-estimate` répond « pas assez de ventes » sur les codes essayés, **comme chez Lovable** : les
  sources DVF qu'il appelle ne rendent plus rien. Non corrigé (hors demande).
- Les pages `/admin` du site sont obsolètes : la rubrique « Demandes du site » les remplace.
- **L'anti-robots du site** (`src/lib/antiBot.ts`, dépôt du site) ne jette plus rien à cause du
  contenu : l'ancien filtre écartait en silence « Marc Schmitt », « Anne Schwartz » (des mots longs,
  peu de voyelles). Il n'écarte plus que sur le comportement : le champ piège (renommé `ei_x7q`,
  un nom neutre que le remplissage automatique du navigateur ne touche pas), moins de 3 secondes,
  aucun vrai clic ni touche sur la page. Tout le reste arrive : le CRM repère les robots (`robot()`,
  `demandes-site.ts`), les range à part et n'envoie pas de mail pour eux ; Alexandre fait le tri.
  Les téléphones étrangers (+32…) sont acceptés.

### V3.37 — 30 septembre 2026 · le mail « Nouvelle demande du site »

Le site prévenait Alexandre par Resend, branché par Lovable (clé cachée chez Lovable). Il passe
par Mailjet, comme le reste du CRM, sans aucune clé nouvelle :

- Le site appelle, après chaque formulaire, la fonction `send-contact-email` du projet Supabase du
  CRM. Elle ne fait qu'appeler **`POST /api/demandes-site/notifier`** (publique, `src/proxy.ts`).
- La route lit elle-même les demandes pas encore annoncées (`contact_submissions.notifie_le` vide,
  reçues depuis moins de deux jours), **se réserve chacune** (mise à jour sous condition « encore
  vide ») puis envoie le mail avec `envoyerMailjet` (`src/lib/point-auto.ts`). Elle ne reçoit rien :
  l'appeler en boucle n'envoie rien de plus. Un robot est marqué annoncé sans mail ; un envoi raté
  remet la demande « à annoncer ».
- Destinataire : `DEMANDES_EMAIL`, sinon `ALERTES_EMAIL`, sinon `MAILJET_FROM_EMAIL`, sinon
  arogelet@emilio-immo.com. Lien « Ouvrir dans le CRM » : `CRM_URL` (par défaut l'adresse Vercel)
  `/?page=demandes&demande=<id>`.
- Le mail (`src/lib/demandes-site-mail.ts`) : type, nom, coordonnées, réponses rangées comme dans la
  rubrique, estimation DVF du site, message, « Ouvrir dans le CRM » et « Appeler ». Heure de Paris.
- `outils/sql/demandes-site-notifier.sql` : la colonne `notifie_le`, et les demandes déjà en base
  marquées annoncées (sinon le premier appel aurait envoyé les 45 reprises de Lovable).

### V3.36 — 30 septembre 2026 · le menu en quatre rubriques

Le menu de gauche (`src/components/layout/Sidebar.tsx`), rangé à la demande d'Alexandre pour qu'on
s'y retrouve d'un coup d'œil :

- **PRINCIPAL** : Dashboard, Contacts, Biens.
- **SUIVI** : Demandes du site, Agenda, Visites, Relances — ce qui se traite au jour le jour.
- **OUTILS** (nouvelle) : Carte, Documents, Nouveau mail — ce qu'on ouvre pour faire quelque chose.
- **ANALYSE** : Mon activité, Paramètres.

Rien d'autre ne change : mêmes entrées, mêmes pastilles, mêmes sous-menus ; la barre du bas du
téléphone est la même.

### V3.35 — 30 septembre 2026 · la barre des fiches ouvertes, le menu réduit

Deux gênes du quotidien, signalées par Alexandre (`src/components/layout/AppLayout.tsx`) :

- **Fermer la fiche qu'on regarde** (× dans la barre des fiches ouvertes, ou « tout fermer ») ramène
  à sa liste : Contacts pour un contact, Biens pour un bien. Avant, la fiche sortait de la barre mais
  restait à l'écran. Fermer une autre fiche que celle affichée ne change pas d'écran (`fermerFiche`,
  `toutFermer`).
- **Le menu réduit reste réduit** : le bouton de la barre du haut enregistre le choix
  (`localStorage` `menu.reduit`), qui tient d'un écran à l'autre et après un rechargement. Avant,
  chaque changement d'écran le redépliait. L'agenda s'ouvre toujours réduit ; l'y déplier ne vaut
  que le temps d'y rester (`agendaDeplie`).

### V3.34 — 30 septembre 2026 · les demandes du site arrivent dans le CRM

Le site emilio-immo.com (dépôt `emilio92100/emilio-immo.modernelovable`, fait avec Lovable)
déposait ses formulaires dans Lovable Cloud. Pour pouvoir arrêter Lovable, ils arrivent désormais
dans la base du CRM, et se traitent dans une nouvelle rubrique.

- **La table** `contact_submissions` (`outils/sql/demandes-site.sql`, passé le 30 septembre) : voir
  §2. Les 45 demandes reçues chez Lovable y ont été importées (statut « Traitée » pour celles
  marquées « appelé », « Nouvelle » sinon). Le fichier d'import contenait des coordonnées de
  clients : il n'est **pas** dans le dépôt.
- **Demandes du site** (menu Suivi, `?page=demandes`, `src/components/demandes/PageDemandesSite.tsx`) :
  en-tête `EnteteRubrique` (Toutes · Nouvelles · En cours · Traitées · Archivées), une pastille par
  formulaire (Estimations, Accompagnements, Infos sur un bien, Messages), la liste par période, la
  demande ouverte à droite (≥ 1 200 px) ou dans un tiroir. Dans la demande : téléphone, « Écrire »
  (mailto, objet selon le formulaire), « Copier » ; le statut ; « À rappeler » (`ChoixDate`) ;
  l'estimation DVF que le site a montrée ; les réponses en rubriques, codes du site traduits
  (« pret_obtenu » → « Prêt obtenu ») ; le message ; les notes (enregistrées en quittant le champ) ;
  « Créer le contact », « Archiver » (avec « Annuler »), « Supprimer définitivement ».
  `?page=demandes&demande=<id>` ouvre une demande précise.
- **Les robots** : des formulaires remplis de lettres au hasard (« ncgloKTWasSFnLzKxi »).
  `robot()` les repère (un mot sans espace dont la casse change sans arrêt), ils sont grisés et
  marqués « Robot ? », et un bandeau propose de les supprimer d'un coup. Jamais supprimés tout seuls.
- **« Créer la fiche contact »** (en haut de la demande) : une question d'abord, qui montre ce qui
  sera repris et les contacts qui lui ressemblent déjà (même e-mail, même téléphone, même nom) —
  « Relier la demande » évite un doublon. Puis la fenêtre Nouveau contact de Contacts s'ouvre, seule,
  par-dessus la rubrique (prop `fenetre` de `Clients` : ni liste, ni lecture des contacts), remplie —
  prénom, nom, téléphone, e-mail, type (vendeur pour une estimation, acheteur pour un accompagnement
  ou une question sur un bien), source « Site, estimation en ligne · Formulaire « … » », et le
  résumé de la demande dans les notes (`preRemplissage`). On reste dans la rubrique : « Créer son
  bien » part décoché. Une fois le contact créé, la demande lui est reliée (`client_id`) et passe
  « Traitée » ; la demande affiche alors « Voir sa fiche contact ».
- La rubrique s'ouvre **toujours sur « Nouvelles »**, même vide (demande d'Alexandre).
- **Le menu** : « Demandes du site » en tête de Suivi, pastille rouge = demandes nouvelles non
  archivées (`PictoBoite`, dessinée à part : `Icone` n'a pas de boîte de réception).
- **Reste à faire, côté site** : remplacer dans son `.env` l'adresse et la clé publique de Lovable
  Cloud par celles de ce projet ; y installer ses 4 fonctions (`send-contact-email` avec les secrets
  `RESEND_API_KEY` et `CONTACT_EMAIL`, `fetch-properties`, `dvf-estimate`, `sitemap` en
  `verify_jwt = false`) et changer l'adresse du plan du site dans son `vercel.json` ; reprendre
  chez Lovable les demandes arrivées entre l'import et la bascule ; puis retirer Lovable Cloud. La
  page `/admin` du site, qui lisait la table `user_roles` de Lovable, est remplacée par cette rubrique.

### V3.33 — 30 septembre 2026 · le point complet du code, et ce qu'il a corrigé

Relecture de tout le dépôt (sécurité, données, santé du code, fonctionnel). Ce qui a été corrigé :

- **Sécurité.**
  - **Inscriptions Supabase fermées** (Authentication › Sign In / Providers › « Allow new users to
    sign up » : désactivé, vérifié le 30 septembre ; un seul compte, celui d'Alexandre). Elles
    étaient ouvertes par défaut : avec la clé publique, n'importe qui pouvait se créer un compte, et
    le RLS laisse tout lire à tout compte connecté. **Ne jamais les rouvrir.**
  - **Le badge du CRM** (`src/lib/badge.ts`) : le cookie `emilio_acces` valait l'empreinte fixe de
    `EMILIO_ACCESS_CODE`, calculable par qui devinait ce code, et plusieurs routes `/api` lisent la
    base avec la clé de service sur sa seule foi. C'est désormais `v1.<fin>.<HMAC>` : signé avec le
    code **et** la clé de service, valable 30 jours. `proxy.ts` et `/api/login` passent par ce
    fichier. Conséquence : une reconnexion au premier passage après la mise en ligne.
  - **Next 16.2.3 → 16.3.7** (et `eslint-config-next`) : plusieurs failles publiées permettaient de
    contourner le proxy. Reste `maplibre-gl` 5 (faille dans une fonction que le CRM n'utilise pas ;
    la 6 change l'API, à faire à part).
  - En-têtes sur toutes les pages (`next.config.ts`) : pas d'affichage dans le cadre d'un autre site,
    `nosniff`, `Referrer-Policy`.
  - `/login?suite=` n'accepte plus qu'une page du CRM. Le mail « partager ce bien » échappe le
    titre et le prénom. « Corriger l'adresse » d'un co-signataire : 5 par jour. « Message » depuis
    l'espace : 20 par jour, et une seule relance en attente à la fois.
- **Données.**
  - **Le prix suit chez les acheteurs** : un bien présenté est copié dans `biens`, prix compris, et
    l'espace comme `/bien/<id>` lisent la copie. `enregistrerBien` appelle `repercuterPrix`
    (`biens/outils.ts`), qui met à jour les copies dont le prix diffère (`prixCopie`,
    `lib/biens-vente.ts`, sert aussi à `versBienAcheteur`).
  - **« Expiré » la veille** : la fiche client comptait en heures depuis minuit UTC. `joursRestants()`
    (`lib/mandat.ts`) compte jour à jour à l'heure de Paris ; « Dernier jour », « Dernier jour
    demain ». Les comparaisons « mandat encore valable » et les dates du jour écrites en base
    (vendu le, réponse à une offre, contre-offre, fichiers du dossier, relances du tableau de bord)
    passent par `jourParis()`.
  - **Listes coupées à 1 000 lignes** (le plafond de Supabase par requête, quoi que dise
    `.limit()`) : Contacts (contacts, recherches, compteurs, dernier geste), Visites, Agenda, Biens
    lisent par pages avec `toutLire` (`lib/registre.ts`). Contacts ne met plus la liste de tous les
    identifiants dans l'adresse (trop longue au-delà de quelques centaines de fiches) ; les visites
    des biens en vente se lisent par paquets de 100.
  - **Photos effacées à tort** (`lib/photos.ts`) : un bien venu de la veille ou du rapprochement
    partage ses fichiers avec la proposition (et parfois avec un autre dossier). Retirer, supprimer
    un bien, une recherche ou un client n'efface plus que les fichiers que plus personne n'utilise,
    et toujours **après** la ligne en base.
  - **Signature bloquée sans alerte** (`api/signer`) : si le PDF ne peut pas être scellé après une
    signature, Alexandre reçoit un mail avec le geste qui débloque (« Tout le monde a signé :
    finaliser »).
  - Cron du matin : une lecture ratée des co-signataires ne fait plus sauter les relances des
    documents. Mandat en ligne : un co-signataire retiré ne peut plus être invité si son effacement
    a échoué. « Contact agence » d'une visite s'enregistre en quittant le champ, plus à chaque lettre.

- **Le bandeau d'un vendeur, en tuiles** (`FicheContact.tsx`, `ActiviteHero` ; Alexandre : « 1 en
  gros, bien en petit dessous… c'est moche », et « quand il y a zéro, ce n'est pas la peine que ça
  arrive quelque part »). Trois tuiles : « 2 biens · dont 1 en vente », « 3 visites · dont 1 à
  venir », « 1 offre · en attente de réponse ». À zéro (« Aucune visite · pour l'instant »), la
  tuile est grisée, en pointillés, et ne se clique pas. Une visite ou une offre sur un seul bien
  ouvre ce bien sur « Visites et offres » (`demanderOngletBien`) ; sur plusieurs, la liste en
  dessous, où chaque bien dit ses visites et ses offres. « Suivi depuis » passe en une ligne
  discrète. Un pro (notaire, confrère…) : « 4 échanges · le dernier… », « 1 relance à venir · la
  prochaine le… ». Sur téléphone, les tuiles tiennent sur une ligne. Côté acheteur, un compteur à
  zéro ne se clique plus non plus (`FicheClient`).

- **Le bandeau bleu de chaque fiche, sans vide** (Alexandre : « que l'espace bleu ne soit pas
  vide sur le côté, en bas, à gauche »). Les tuiles sont partagées (`src/components/shared/Tuiles.tsx`)
  entre la fiche d'un contact et celle d'un acheteur : elles se partagent toute la largeur, et
  prennent la hauteur qui reste quand les coordonnées sont plus hautes (`grandit`). Quatre tuiles :
  quatre de front, ou deux et deux, jamais trois et une. Le panneau des coordonnées prend toute la
  hauteur du bandeau, son geste en bas ; chez un acheteur, « Son espace » y passe (tant que les
  coordonnées tiennent sans dépliage). Les biens d'un vendeur ont leur propre rang, sur toute la
  largeur, côte à côte ; un seul dit ses visites et offres en pastilles ; sans bien, « Créer son bien »
  prend toute la largeur. Fiche d'un bien : la carte de droite descend jusqu'aux étapes.
- **Une visite se dit toujours faite ou prévue** (Alexandre : « 3 visites, on ne comprend pas »).
  `libelleVisites()` (`lib/visites.ts`) : « 2 visites faites · 1 prévue ». Faite = marquée faite, ou
  date passée (comme la fiche du bien) ; prévue = à venir. Partout : tuiles vendeur et acheteur,
  biens du vendeur, cartes et lignes de la page Biens (`nbPrevues`), « Visites et offres » de la
  fiche d'un bien, résumé de l'agenda, « visites faites » d'un bien chez l'acheteur, critères appris
  des visites. « N visites » de l'espace d'un acheteur (ses ouvertures) devient « ouvert N fois ».

- **Le niveau se voit, dans la saisie des pièces** (`Biens.module.css`, Alexandre : « niveau
  principal, niveau bas… pour bien le voir, plus gros »). Le même titre doré en capitales, juste plus
  grand (15 px au lieu de 11), le trait un peu plus marqué, « 4 pièces · 43,27 m² » en 14 px. Un
  premier essai en bandeau crème avec une icône a été refusé : l'icône faisait doublon avec celles
  des pièces.

- **Les documents de la vente, repliables** (fiche d'un bien › Documents, Alexandre : « pouvoir
  replier les documents de la vente pour ne pas qu'ils prennent tout, avoir juste une synthèse, et le
  dossier de diagnostics plus facilement accessible »). Replié (par défaut, et le choix est gardé dans
  le navigateur, `emi-docs-vente`) : une pastille par étape — mandat, bons de visite, offres,
  compromis — dans la couleur de son état (`SyntheseDocs`, `OngletsBien.tsx`) ; un clic déplie.
  Déplié : le détail avec ses boutons et « Tous les documents préparés ».
- **« Retirer » un fichier du dossier du bien le supprime vraiment** (vérifié) : `/api/biens-vente`
  (action `retirer`) l'efface du stockage Supabase avec la clé de service, puis la ligne du bien est
  vidée et enregistrée. Un brouillon supprimé dans Documents perd aussi ses fichiers
  (`/api/documents`, action `retirer`) ; un document signé ne se supprime pas.

- **Ce qui se plie : le bouton à côté du titre, jamais tout à droite** (Alexandre : « voir le
  détail, il faut qu'il soit à côté du nom, pas collé, un espace ; pareil pour tout ce qui se plie »).
  Une pastille partagée, `src/components/shared/Pli.tsx` : `BoutonPli` (le bouton, quand le titre ne
  se clique pas) et `PastillePli` (le repère, dans un en-tête déjà cliquable), « Voir le détail » /
  « Replier ». Posée : documents de la vente, « Tous les documents préparés » (« Voir la liste »),
  groupes du dossier de diagnostics (et « Tout replier / Tout déplier » à côté des filtres), « Ses
  biens » et « Ses documents » d'un contact (`BlocRepliable`), « Qui a signé ? » (`SuiviSignature`),
  « Tout voir » des coordonnées, « Changer » d'une pièce (le champ du nom a la largeur du nom).
  Laissés tels quels : les « Lire la suite » / « Voir les N autres » posés sous leur contenu.

Relevé mais pas corrigé (à décider) : fichiers très longs à découper (`EspaceClient` 7 500 lignes,
`FicheClient` 5 900, `ParcoursBien` 2 900) ; coordonnées de l'agence écrites en dur à une
vingtaine d'endroits ; ~20 façons d'écrire un prix ; premier chargement du CRM lourd (le PDF du
registre chargé d'office) ; polices chargées depuis Google sur les pages clients ; pas de mentions
légales sur `/espace`, `/bien`, `/signer` ; `/bien/<id>` indexable ; pas de lien de désinscription
dans le point automatique ; aucune page publique ne crée encore de contact (projet QR codes).

### V3.32 — 29 septembre 2026 · documents repliés, rapprochement en onglet, projet en attente

Retours d'Alexandre du soir. Rien à passer dans Supabase.

- **Les documents de la vente** (onglet Documents d'un bien ; remplace « Les documents à signer »,
  tuiles puis version repliée) : une liste dans l'ordre de la vente — le mandat, les bons de
  visite, les offres d'achat, le compromis (`EtapesDocs`, OngletsBien.tsx) —, chacun avec son état
  (fait en vert, à faire en or, en cours, libre, plus tard en gris), une phrase et ses boutons.
  « Tous les documents préparés pour ce bien · N » se déplie dessous.
- **Le mandat signé, indiqué et retéléchargeable** : une pastille dit comment il a été signé
  (« Signature électronique », « Signé sur la tablette », « Signé à la main », « Signé hors du
  CRM », « … · scan joint ») ; « Le mandat signé » ouvre l'exemplaire signé (`signe_chemin` du
  document, via /api/documents « lien ») ou le scan joint au bien. Signé hors du CRM : « Joindre le
  mandat signé » (et « Remplacer le scan ») dépose le fichier (/api/biens-vente « depot »,
  `donnees.mandatFichier` = { chemin, nom, taille, le }) ; la fenêtre « Le mandat est signé » a
  aussi son champ « Le mandat signé (scan ou PDF) · facultatif ». `documentsDuBien` lit
  désormais `*` (la colonne `signature` n'existe qu'après le SQL de la signature en ligne).
- **Tout se déplie en douceur** (`src/components/shared/Depliant.tsx`) : la hauteur glisse
  (grille 0fr → 1fr), le contenu arrive en fondu ; rendu à la première ouverture seulement ;
  `ecart` reprend le `gap` du parent quand c'est replié ; le débordement redevient visible une fois
  ouvert ; `prefers-reduced-motion` respecté. Branché sur : les groupes du dossier, la liste des
  documents préparés, « Tout voir » de « Pour la visite », « Voir les N associés », « Voir les N
  autres » documents d'un contact, le choix du type de pièce (éditeur), « Lire le texte » de
  l'annonce, la société qui apparaît sous le bandeau (fiche contact et fiche acheteur, remontée à
  chaque « Ajouter »). Déjà fluides avant : `BlocRepliable`, les sous-menus, `NoteRiche`.
- **Le dossier du vendeur** (`biens-vente.ts`, `DOSSIER`) : trois lignes selon le bien — « Bail en
  cours et dernier avis d'échéance » (bien loué), « Permis de construire et certificat de
  conformité » (maison), « Dispositif de sécurité de la piscine » (annexe piscine). Les idées de
  pièces du vendeur s'enrichissent (identité, livret de famille ou contrat de mariage, plans,
  garanties décennales, prêt en cours pour la mainlevée, entretien de la chaudière) et en montrent
  jusqu'à huit.
- **Surfaces** : les chiffres des tuiles du haut passent de 26 à 20 px (17 px sur téléphone).
- **L'estimation reste lisible après le mandat** (onglet Le bien) : la carte « Prix et honoraires »
  garde, sous un trait, « L'estimation · avis de valeur du … » : la fourchette, le prix conseillé
  (et l'écart du prix affiché), ce que le propriétaire espérait. `FenMandat` range le prix
  conseillé dans `donnees.prixConseille` au moment où le mandat est signé (« prix » devient le prix
  affiché) ; pour les biens déjà en mandat avant la V3.32, seuls la fourchette et le prix espéré
  s'affichent. Avant le mandat, la carte montre aussi « Le propriétaire espère ».
- **Mettre un projet en attente** : à l'estimation, le menu d'étape propose « Le propriétaire veut
  attendre… » → le bien repasse « À suivre » (raison, date « Le recontacter vers le »), l'estimation
  est gardée ; la carte dit « En attente · raison · à recontacter vers le … », l'historique « Projet
  mis en attente ». « Le vendeur renonce… » reste le retrait (Retiré). Un bien retiré **avant tout
  mandat** propose « Reprendre l'estimation… » et « Le mandat est signé… » au lieu de « Remettre en
  vente ». Après le mandat, rien ne change : « Mettre la vente en pause… » (En pause), puis
  « Remettre en vente… » ou « Mandat terminé sans vente… ».
- **Le propriétaire qui agit pour une société** (Vue d'ensemble d'un bien, carte « Le propriétaire ») :
  la personne en titre (son avatar), et dessous une pastille « Associée de la SCI AVIENA » (son rôle
  pris dans « Sa société » de sa fiche, premier mot de la qualité) ou « Pour la SCI AVIENA ». La
  société vient du bien (« Une SCI » + son nom) ou de la fiche du contact (`pro.structure`) : la
  liste des biens charge désormais `clients.pro` (`CLIENT_COLS`). Pour l'envoi des documents, le
  destinataire s'annonce « Pour SCI AVIENA ».
- **La Vue d'ensemble après le mandat, allégée** : plus de grosse carte « Le mandat » — il passe dans
  le bandeau, à droite, discret (`CoteMandat` : « Mandat en cours » ou « Mandat · vente en pause »,
  type et n°, signé le, jusqu'au, « encore N j » ; sous le prix en dessous de 1180 px, en deux
  lignes sur téléphone), et le badge « SEMI-EXCLUSIF · n° » du haut ne se répète plus. « Les
  acheteurs » quitte la Vue d'ensemble (onglet Acheteurs). La rangée : Visites et offres, Le
  propriétaire, Pour la visite (remontée ; le bloc « Les indications de visite » du bas est retiré).
- **L'onglet « Visites et offres », refait** (`VisitesOffres.tsx`, `OngletVisitesOffres`) : en haut, une
  carte avec les deux gestes — « Organiser une visite » (marine) et « Enregistrer une offre » (or) —
  et quatre chiffres (visites faites, à venir, comptes rendus à faire — en orange s'il y en a —,
  offres en cours avec la meilleure). Vide : « Comment ça se passe », le chemin en trois étapes
  (visite, compte rendu, offre et réponse). Puis, côte à côte, « À faire » (offres en attente de
  réponse ou en contre-offre, offre acceptée tant que le compromis n'est pas signé, comptes rendus
  en retard ; les cartes `CarteOffreB` / `CarteVisiteB`) et « Les prochaines visites ». Enfin
  « L'historique » : visites et offres passées mêlées par date, en frise (date, pastille violette
  pour une visite, or pour une offre, verte acceptée, grise annulée), filtre Tout / Visites /
  Offres. Une visite dont le compte rendu dit « Veut faire une offre » propose « Enregistrer son
  offre » : `FenOffre` s'ouvre avec l'acheteur choisi (prop `pour`), sauf s'il en a déjà fait une.
  `ListeVisites` (OngletsBien) est retiré.
- **La fiche des autres contacts, comme celle d'un acheteur** (`FicheContact.tsx`) : les coordonnées
  passent dans le panneau crème à droite du bandeau (`Coordonnees`, désormais exporté par
  `FicheClient.tsx` : trois lignes, copier, « Tout voir », « Voir sur la carte ») ; « Il agit pour
  une société ? Ajouter » (ou « Pour SCI AVIENA · Associée ») monte à droite du nom — une ligne de
  moins ; la ligne de sous-titre ne répète plus la société.
- **Le net vendeur, en interne** (fenêtre « Le mandat est signé ») : sous la phrase de l'annonce,
  une ligne « En interne : net vendeur 304 000 € (349 000 € − 45 000 € d'honoraires TTC, soit
  12,9 % du prix) » — aussi quand les honoraires sont à la charge du vendeur, où l'annonce ne dit que
  le prix. Le bandeau du bien ajoute « · net vendeur … » dans ce cas.
- **L'étage** (Le bien › L'immeuble) : « 1er étage sur 5 », « 5e étage sur 5 · dernier étage »,
  « Rez-de-chaussée · immeuble de 5 étages » quand « Étages en tout » est noté.
- **Fiche d'un acheteur** (`FicheClient.tsx`) : **un onglet « Rapprochement »** (dès qu'il a une
  recherche ; pastille = nombre de vos mandats qui lui correspondent) : le bandeau « Des biens pour
  … » avec « Faire / Refaire un rapprochement » et la date du dernier, « Vos mandats qui lui
  correspondent » (un clic ouvre le bien, « Les lui proposer » lance le rapprochement sur eux,
  cochés) et « Les rapprochements faits » (date, biens trouvés, où). La Vue d'ensemble ne garde que
  l'essentiel : la prochaine visite s'il y en a une, la société, « À savoir », sa situation, ses
  biens, sa recherche en bref. Ni le rapprochement, ni la relance (déjà dans le bandeau et le
  Suivi), ni « Dernièrement » (le Suivi).
- **« + Nouveau document » depuis une fiche contact** (`DocumentsDuClient.tsx`) : la fenêtre du choix
  s'ouvre sur la fiche, sans basculer dans la rubrique Documents ; une fois le document créé, on part
  dans Documents, sur lui (intention `{ ouvrir }`). Idem pour « + Déléguer un mandat » d'un confrère.
- **Page Documents** : les modèles tiennent sur une ligne chacun (description en une ligne,
  entière au survol), deux par ligne sur téléphone ; la liste des documents remonte d'autant.
- **Un seul mandat en cours** (`src/lib/coherence.ts`) : un mandat de vente par bien, un mandat de
  recherche par recherche (un acheteur qui a deux recherches peut avoir deux mandats). « En cours »
  = en préparation (brouillon), en signature (prêt), ou signé — ni annulé, ni rétracté.
  `mandatVenteEnCours(bien)` regarde les documents `mandat_vente` du bien
  (`donnees->>bienVenteId`), le document rattaché (`biens_vente.document_id`) et le mandat noté
  signé hors du CRM (`donnees.mandatDate` quand le bien est en mandat, offre, compromis ou pause) ;
  un bien retiré ou vendu libère son mandat signé. `mandatRechercheEnCours(rechercheId)` regarde les
  documents `mandat_recherche`, `mandats_signatures` (signé, partiel, en cours, non rétracté) et
  `recherches.mandat_date_signature`. `phraseMandat` / `conseilMandat` : la même phrase partout.
  Branché sur : « Nouveau document » (l'encadré « Un mandat de vente est déjà en cours sur ce
  bien… » ; « Reprendre ce mandat » s'il n'est pas signé, « Faire un avenant » — modèle avenant,
  mandat choisi d'avance — et « Voir le mandat en cours » s'il l'est ; « Créer » grisé « Déjà un
  mandat en cours ») ; « Dupliquer » dans Documents (seulement un mandat annulé, et s'il n'y en a
  pas d'autre en cours) ; « Préparer le mandat » sur la fiche du bien (un brouillon existant
  s'ouvre) ; `creerDocument` refuse de lui-même en dernier garde-fou. Un avenant n'est jamais
  bloqué. Le mandat signé en ligne depuis l'espace était déjà protégé (/api/espace/mandat,
  « deja »). Avant : rien n'empêchait un second mandat par « Nouveau document » ou « Dupliquer ».
  L'ancienne remarque « Le nouveau le remplacera une fois signé » est retirée.
- **Où en est la signature, partout** (`src/components/documents/SuiviSignature.tsx`) : une ligne
  « Signature en ligne · 1 sur 2 · on attend Pierre » avec un point par signataire (vert signé, or
  attendu, rouge lien expiré), qui se déplie sur chacun : signé quand, lien envoyé, ouvert ou pas,
  rappels, et « Renvoyer le lien », « Corriger l'e-mail », « Il signera plus tard, par lien »
  (documents, /api/documents/signature), « Renvoyer le lien » / « Envoyer un lien neuf » / « Copier
  son lien » (co-signataires du mandat de l'espace, /api/mandat/cosignataire), « Lui renvoyer le
  mail » (mandat proposé dans l'espace, /api/send-mail mode mandat). `lireSuivis` lit en trois
  requêtes : `documents_signataires`, `mandats_cosignataires`, et le journal des rappels.
- **« Ses documents » rangés par état** (`DocumentsDuClient.tsx`, `DocsParEtat`, fiche acheteur et
  fiche contact) : En attente de signature (chacun dans sa carte, avec son suivi ; pastille « En
  signature » quand les liens sont partis), En préparation (brouillons, courriers à envoyer),
  Signés (avec « PDF signé »), les annulés repliés. Le mandat proposé dans l'espace et pas encore
  commencé y figure aussi (« Proposé dans son espace le … »). Un mandat de l'espace signé par le
  premier, en attente du second, est « En attente de signature » (il était « Signé »).
- **Onglet Documents d'un bien** : la ligne « Le mandat de vente » dit « Envoyé pour signature »
  (ou « Prêt : à faire signer à la main / sur place », « les liens ne sont pas encore partis »)
  avec le suivi dépliable dessous (`EtapeDoc.suite`) — elle disait « En préparation » jusqu'à la
  signature, et comptait un mandat annulé comme en préparation. « Tous les documents préparés »
  utilise la même liste rangée par état (`DocsParEtat`).
- **Plus de second mandat de recherche par l'espace** : `mandatDocumentEnRoute`
  (`src/lib/mandat-serveur.ts`) trouve un mandat de recherche de Documents en brouillon ou en
  signature pour la recherche, et le lien de signature du client (une de ses adresses). Tant qu'il
  est là : l'espace ne propose pas son mandat en ligne (page.tsx : `etat` à « sans_numero »,
  `mandat.enRoute`) ; « Mon mandat » dit « Alexandre vous l'a envoyé à signer » avec « Signer mon
  mandat » ; « Je souhaite le visiter » ouvre « Avant la visite · Votre mandat de recherche vous
  attend » (`AvantVisiteDocument`) et garde la demande une semaine — elle part toute seule au retour
  dans l'espace, une fois signé ; le serveur répond « mandat_document » (avec le lien) à une demande
  de visite, et /api/espace/mandat refuse « document » ; sans lien pour lui (brouillon, lien expiré,
  autre adresse), la demande passe et le mail d'Alexandre dit pourquoi (`pasDeMandat`). La page du
  signataire (/signer) propose « Revenir à mon espace » quand c'est le client du document.
- **Côté CRM** : « Proposer au client » (fenêtre « Mandat de recherche ») est bloqué quand un mandat
  de Documents est en route ; `mandatRechercheEnCours` compte aussi la proposition dans l'espace
  (« déjà proposé dans son espace : il ne l'a pas encore signé ») et libère un mandat arrivé à son
  terme ; le bouton du mandat de la fiche acheteur dit « envoyé, en attente de signature » ou « en
  préparation dans Documents » au lieu de « non renseigné ».
- **Rappels du mandat proposé dans l'espace** (cron /api/mandat/relances, `relancerPropositions`) :
  l'acheteur qui n'a pas signé reçoit un rappel 2 jours après la proposition, un second à 7 jours (au
  moins 3 jours après le premier) ; Alexandre est prévenu avec le second. Chaque rappel est une ligne
  du journal (type « mandat », `metadata.rappelMandat` = la date de la proposition) : pas de SQL, et
  une nouvelle proposition repart de zéro. Rien pour une proposition de plus de 15 jours, une
  recherche arrêtée ou fermée à l'espace, ou quand un mandat de Documents est en route.
- **Vue d'ensemble d'un bien, sans blancs** : « Le bien en bref » passe en tête (avant le mandat,
  juste sous le parcours de l'estimation). Les trois cartes : « Visites et offres » dit la
  prochaine visite et a ses deux gestes (« Organiser une visite », « Enregistrer une offre ») ; « Le
  propriétaire » montre son téléphone et son e-mail en clair ; « Pour la visite » met ses trois
  premières indications côte à côte, et le chemin prend jusqu'à six lignes quand il est seul (le
  rognage se fait sur la ligne intérieure : la 3e ligne débordait dans le bas du cadre).
- **Onglet « Le bien » : une icône par ligne** (`Kv`, table `IC_KV` d'OngletsBien.tsx, trouvée par
  le mot de la ligne), teintée de la couleur de la carte : état, cuisine, chauffage, étage,
  ascenseur, lot, exposition, vue, charges, taxe foncière, prix, net vendeur, honoraires…
- **« Changer le prix ou les honoraires »** (`FenPrix`) : la case « Les honoraires changent aussi »
  ouvre le taux ou le forfait ; le net vendeur se recalcule. L'historique dit « Prix et honoraires
  changés : … » ou « Honoraires changés : 45 000 € → 40 000 € » (`donnees.honoAvant`, `honoApres`
  de la ligne `prix`). Mandat signé dans le CRM : « Préparer l'avenant au mandat » (cochée) crée le
  brouillon de l'avenant (`creerAvenantVente`, biens/outils.ts : le mandat, ses avenants signés,
  puis `objets` prix/honoraires, `nouveauPrix`, `charge2`…) et l'ouvre dans Documents.
- **Le récapitulatif de ce qui a été signé** : sous chaque étape des « Documents de la vente »
  (`ChaineDocs`), ses documents dans l'ordre — le mandat puis ses avenants (en retrait, avec ce
  qu'ils changent : « prix 829 000 €, honoraires 40 000 € ») et courriers de reconduction ; les
  bons de visite (qui, visite du…) ; les offres écrites — chacun avec son état et « PDF » quand il
  est signé. Les annulés ne comptent plus. Sur la fiche d'un contact, un avenant est rangé sous son
  mandat (`enChaine`) et dit « Au mandat n° 34 ». Les avenants portent désormais `bienVenteId`
  (`REPRIS`, avenant-vente.ts), et `documentsDuBien` retrouve aussi ceux d'avant par le numéro du
  mandat (avenants, courriers de reconduction, délégations).
- **Le bandeau d'un contact qui n'est pas acheteur, rempli** (`ActiviteHero`, FicheContact.tsx) :
  comme pour l'acheteur, sous le nom, ses chiffres et « Suivi depuis ». Vendeur ou propriétaire :
  biens, en vente, visites, offres (sur ses biens, `biens_vente_suivi`), puis chacun de ses biens en
  une ligne (photo, étape, prix ; un clic ouvre le bien ; « Créer son bien » s'il n'en a pas).
  Les autres (notaire, confrère, gardien…) : échanges et relances à venir, le dernier échange et la
  prochaine relance. La société reste à droite du nom, son détail juste sous le bandeau — pareil que
  pour l'acheteur.

### V3.31 — 29 septembre 2026 · le dossier de diagnostics, la page Documents, les observations

Suite des retours d'Alexandre sur le dossier DESNOULEZ. Rien à passer dans Supabase : tout vit
dans `biens_vente.donnees`.

- **Un seul fichier pour tous les diagnostics** (`DossierBien.tsx`) : au dépôt, « Dossier de
  diagnostics complet (plusieurs en un fichier)… » ; on coche ce qu'il contient (DPE, amiante,
  plomb…, « Tout » / « Aucun »). Il est rangé une fois (`fichiers`, `sorte: 'ddt'`) et chaque
  diagnostic coché passe « Reçu » avec `dans` = ce fichier. Il s'affiche en tête des
  diagnostics, en carte : son nom, ses pastilles (ce qu'il contient), « Ce qu'il contient… » pour
  corriger. Une pièce qui est dedans porte « Dans le DDT » (✕ pour l'en détacher). Le retirer
  remet « À réunir » les pièces qui n'avaient que lui.
- **Ajouter une pièce avec le nom de son choix** : « Ajouter une pièce » au bout de chaque groupe
  (des idées proposées : Kbis, statuts et PV d'AG de la SCI quand une société vend…), ou « Autre
  document, avec le nom de mon choix… » au dépôt. Ces pièces (`piecesPerso`) se renomment (crayon)
  et se retirent (croix) ; les « Autres documents » se renomment aussi.
- **Les groupes se replient** (Diagnostics, Copropriété, Vendeur, Autres) : un clic sur leur tête ;
  replié, la tête garde le compte, une jauge et ce qui manque. Un groupe complet se replie seul ;
  « Tout replier / Tout déplier » ; le choix est retenu sur l'appareil (`emilio.dossier.replis`).
- **Les liens de téléchargement** (rappel, pour Alexandre) : au-delà de 10 Mo de pièces jointes,
  le serveur crée tout seul, pour chaque fichier, un lien privé et temporaire (Supabase,
  `createSignedUrl`, 7 jours) mis en boutons dans le mail. Personne ne l'écrit ; le fichier reste
  privé ; passé 7 jours, renvoyer.
- **Documents, avant le mandat** : le bloc de droite « Le mandat » répétait la tuile « Mandat de
  vente » et laissait un blanc au milieu. Une seule section « Les documents à signer » sur toute
  la largeur : la tuile du mandat (dorée tant que rien n'est préparé : « Préparer le mandat »,
  « Déjà signé ? » ; marine une fois signé : n°, échéance, honoraires) puis, en pointillés, ceux
  qui viendront (offre d'achat, bons de visite, compromis). `BlocMandat` n'existe plus.
- **Observations et notes** : rangées comme dans « Modifier » — une carte « Le logement »
  (sinistres, travaux réalisés, « Autres remarques sur les travaux »), une carte « La
  copropriété » (gros travaux votés, réalisés, à venir, « Autres remarques sur la copropriété »),
  une carte « Tes notes » (sur toute la largeur quand elles sont longues). Le texte libre
  `travaux` s'affichait « Travaux » tout seul, sous la liste des travaux : on ne savait pas ce que
  c'était. Chaque travail est une ligne numérotée, la date dans une pastille (dessous sur le
  téléphone). Le bloc remonte juste sous « Le bien en bref ». Dans « Le bien », les remarques de
  copropriété s'appellent aussi « Autres remarques sur la copropriété ».
- **« Le dossier » n'est plus résumé dans la Vue d'ensemble** : il doublait l'onglet Documents.
- **« Le bien » sans trous** (`Familles`, `OngletsBien.tsx`) : les cartes étaient en grille, et
  chaque rangée prenait la hauteur de sa plus haute carte — « L'intérieur » encore à décrire
  laissait un grand blanc sous lui, « L'immeuble » aussi. Elles sont maintenant distribuées en
  colonnes (1re, 2e, 3e, puis on recommence ; 3 colonnes, 2 sous 1 180 px, 1 sous 720 px) et
  chaque colonne empile les siennes. Déplier les remarques d'une carte ne fait pas sauter les
  autres d'une colonne à l'autre. Le texte `travaux` y porte aussi son nom : « Autres remarques
  sur les travaux ».
- **Contacts, « Tous » et les autres types** (`LigneContact`, `ChampsContact.tsx`) : chaque ligne
  porte le même petit personnage que la liste des acheteurs (`AvatarContact` : deux pour un
  couple, une mallette pour un professionnel), à la couleur de son type — elle montrait ses
  initiales.
- **Plus d'initiales nulle part dans le CRM** : le même petit personnage (`AvatarContact`) dans
  la recherche du haut, le bandeau d'une fiche vendeur / propriétaire / pro et celui d'un
  acheteur, l'aperçu au survol de la liste des acheteurs, « Le propriétaire » d'un bien (carte et
  bloc ; une SCI a la mallette), la fiche reliée dans l'éditeur, les acheteurs d'un bien, les
  offres, les associés d'une société (« Madame » devinée d'après le rôle : Gérante, Associée…),
  les relances, l'agenda, le choix des destinataires d'un mail. `libre` laisse la feuille de style
  décider de la taille et de la forme (elles changent sur le téléphone) ; `teinteDe(c)` donne la
  couleur de son type ; `personneDe(nom, role)` pour une personne sans fiche. Seule la page de
  signature du mandat (côté client) garde ses initiales.
- **« Sa société », plus tôt et plus haut** : dès la création d'un vendeur ou d'un propriétaire
  (et dans « Modifier »), une section « Sa société » : « En son nom » ou « Pour une société » —
  son nom, sa forme, son rôle (`ChampsPro` ; `structurePropre` garde la société si elle a un nom,
  la retire sinon). Sur la fiche, le bloc passe juste sous le bandeau bleu, sur toute la largeur,
  ses associés sur deux colonnes ; sans société, le bandeau propose « Il / Elle agit pour une
  société (SCI…) ? Ajouter », qui ouvre le formulaire là, prérempli de « À savoir » s'il en nomme
  une. Le bouton en pointillés du bas de la fiche a disparu.
- **Vue d'ensemble avant le mandat, refaite (maquette B validée par Alexandre)** : la carte « Le
  rendez-vous d'estimation » du haut et le bloc « L'estimation » du bas disaient la même chose.
  À la place, **« Le parcours de l'estimation »** (`ParcoursEstimation`, `VueBien.tsx` ;
  `BlocParcours`, `FicheBien.tsx`) sur toute la largeur sous les onglets : cinq jalons en frise —
  rendez-vous, visite sur place, montant, avis de valeur, mandat — le jalon en cours en or (un
  jalon franchi plus loin coche ceux d'avant), le montant et la jauge quand il est donné, ce qu'on
  a retenu de la visite, puis « Ensuite : … » avec le bouton qui fait avancer (noter le rendez-vous,
  définir l'estimation, avis de valeur envoyé, préparer le mandat ; « Passer à l'estimation » à
  « À suivre ») et « Le mandat est déjà signé ? ». En colonne sur le téléphone. Dessous, trois
  cartes : le propriétaire, **« Pour la visite »** (`CartePourLaVisite` : les trois premières
  indications, le chemin, « Tout voir »), les acheteurs potentiels ; puis le bien en bref, les
  observations, « Dernièrement ». **« Chez le propriétaire ? Commencer la visite »** passe dans le
  bandeau bleu, à droite (`CoteVisite`, avant le mandat seulement ; « Reprendre la visite » une
  fois faite) ; le bouton « Visite sur place » de la barre du haut disparaît. Dans « Le bien », le
  « Modifier » de « Estimation et prix » ouvre la fenêtre de l'estimation, et non plus tout l'éditeur.
- **Surfaces, les niveaux** : en liste comme en cartes, chaque niveau a son bandeau (escalier,
  nom, nombre de pièces, surface) dès qu'il y en a plusieurs, ou que ce n'est pas « Niveau
  principal » ; « 2 niveaux » s'ajoute au résumé.
- **« Sa société » pour un acheteur aussi** : « Il achète en son nom / Pour une société » à la
  création ; sur sa fiche, « Achète pour SCI … · Gérant » dans le bandeau (ou « Pour une société
  (SCI…) ? Ajouter »), et le bloc « Sa société » en tête de la Vue d'ensemble.
- **Les photos en grand** (`biens/Visionneuse.tsx`) : dans l'onglet Photos (et l'éditeur), un clic
  sur une photo l'ouvre sur tout l'écran — flèches (qui reviennent au début après la dernière),
  clavier ← → et Échap, glisser du doigt sur le téléphone, sa légende et les vignettes en bas.
  Posée dans `document.body` (une fenêtre ne la rogne pas), `z-index` 2000.
- **« Le bien » sans la bande de photos** : elle doublait l'onglet Photos. Il commence par
  l'annonce (après le mandat) ou directement par les cartes.
- **« Le propriétaire », une seule fois** dans la Vue d'ensemble : le bloc du bas doublait la
  carte du haut, il est retiré. La carte reprend ce qu'il disait de plus (pourquoi il vend, son
  délai, venu par, son notaire : une petite ligne sous le nom), l'e-mail remplace le SMS, et
  **« Retirer du bien »** (en haut à droite de la carte, après confirmation) fait comme l'éditeur :
  plus de fiche reliée, ni nom, ni coordonnées (`clientId`, `proprietaires`, `qui`, `sciNom`
  vidés, `client_id` à null) ; sa fiche reste dans les contacts, la carte repasse à « Pas encore
  renseigné ».
- **Téléphone : plus de barre « Fiches ouvertes »** en bas (`FichesOuvertes.module.css`,
  ≤ 900 px) ; elle reste sur l'ordinateur.
- **Mise en ligne** : le 29 septembre, une ancienne mise en ligne (commit « 2/7 ») avait été
  relancée sur Vercel après la dernière et l'avait remplacée en production — la fiche semblait
  revenue en arrière. Réglé par « Promote » sur le dernier commit. Une mise en ligne « Canceled »
  est normale (une plus récente l'a remplacée) : ne jamais faire « Redeploy » sur une ancienne.

### V3.30 — 29 septembre 2026 · la fiche d'un bien et celle d'un vendeur, rangées

Retours d'Alexandre sur le dossier DESNOULEZ (un appartement avenue d'Iéna vendu par la SCI
AVIENA, estimation en cours). Rien à passer dans Supabase : tout vit dans `biens_vente.donnees`,
`clients.pro` et `biens_vente_suivi` (colonne `type` en texte libre).

- **Un texte long, rangé en blocs** (`shared/NoteRiche.tsx`) : chaque paragraphe (séparé par une
  ligne vide) devient un bloc ; « Vendeur : … » en tête de paragraphe lui donne son titre ;
  « Kbis du … : » au début d'une ligne passe en gras ; « – » fait une liste ; e-mails et
  téléphones deviennent des liens. Les blocs se rangent en deux colonnes quand il y a la place, et
  au-delà d'une hauteur le texte se replie (« Déplier, tout lire » / « Replier »). Rien n'est
  réécrit en base. Servent : les observations d'un bien, les remarques de copropriété, « À
  savoir » d'un contact (acheteur compris).
- **Vue d'ensemble d'un bien** : « Qui pourrait l'acheter » n'est plus répété sous la carte
  « Acheteurs potentiels » (la liste entière est dans l'onglet Acheteurs). « Le bien en bref » est
  une carte blanche, ses tuiles blanches avec une icône teintée par famille (elles étaient grises
  sur le gris de la page). « Observations et notes » passe sous les deux colonnes, sur toute la
  largeur ; il reste là à toutes les étapes, de « À suivre » à la vente.
- **Onglets du bien, dans l'ordre voulu** : Vue d'ensemble, Photos, Le bien, **Surfaces**,
  (Visites et offres), Acheteurs, Documents, Historique. **Surfaces** (`OngletSurfaces`,
  `OngletsBien.tsx`) : surface habitable (et le contrôle avec la somme des pièces), Carrez (« À
  mesurer » en copropriété), séjour, pièces ; « Comment se partage la surface » (pièces de vie,
  chambres, cuisine, eau, entrée) ; les pièces en liste ou en cartes (sorties de « Le bien ») ;
  les annexes. « Le bien » garde un lien vers Surfaces.
- **Copropriété, dans « Le bien »** : le champ `travauxVotes` s'appelle « Autres remarques sur la
  copropriété » dans l'éditeur, mais s'affichait « Travaux votés », en gras, calé à droite — un
  paragraphe entier en colonne de trois mots. Il s'affiche maintenant « Remarques », replié ; les
  vrais travaux votés (`coproVotes`) ont leur petite liste. Toute valeur longue d'une carte
  (`Kv`) passe sous son libellé, calée à gauche.
- **Documents d'un bien** (`biens/DossierBien.tsx`) : le dossier passe sur toute la largeur, une
  tuile par pièce en grille, par groupe, avec filtres (Tout · À réunir · Demandés · Reçus).
  **Déposer** : on glisse ou on choisit plusieurs fichiers ; le CRM devine ce que c'est d'après le
  nom (`DEVINE` : DPE, amiante, PV d'AG, règlement…), on corrige, « Enregistrer » range chacun à
  sa ligne (passée « Reçu », datée) ou dans « Autres documents » (`donnees.fichiers`). **Envoyer** :
  on coche des fichiers (une barre suit en bas), « Envoyer par mail… » ouvre une fenêtre : à qui
  (le propriétaire, les autres propriétaires saisis, les acheteurs du bien, ou une adresse tapée),
  les documents, l'objet et le message déjà écrits et modifiables. `/api/biens-vente`, action
  `envoyer` : un mail par destinataire au nom d'Alexandre, les fichiers joints jusqu'à 10 Mo en
  tout, au-delà des liens de téléchargement valables 7 jours ; une ligne `envoi` dans l'historique
  du bien, une ligne `mail_envoye` dans le Suivi de chaque contact du CRM destinataire.
- **Fiche d'un vendeur, d'un propriétaire** (`FicheContact.tsx`) : « À savoir » en tête, sur toute
  la largeur, rangé en blocs et replié ; dessous, les blocs en grille (deux colonnes). « Voir sur la
  carte » dans le bandeau : le mot du bouton prenait lui aussi l'allure d'une pastille (règle
  `.heroCoord span` sans `>`).
- **« Sa société »** (`contacts/BlocSociete.tsx`, choix d'Alexandre : la personne reste un
  contact, sa fiche porte la société) : nom, forme (SCI, SARL, SAS…), RCS, siège, son rôle, et
  les associés avec leur rôle, téléphone, e-mail — les gérants d'abord, « Voir les N » au-delà de
  quatre. Un associé qui a déjà sa fiche (même e-mail ou même téléphone) a « Sa fiche ».
  « Reprendre ce qui est noté dans « À savoir » » pré-remplit le formulaire (`structureDepuisNotes`).
  La ligne sous le nom dit « Associée · SCI AVIENA » (`ligneContact`). Dans l'éditeur d'un bien,
  relier un contact qui représente une société propose « Qui vend ? Une société » et son nom.
- **L'étape « Le propriétaire » de l'éditeur, refaite** (`ChampProprio`) : Alexandre ne comprenait
  pas le parcours (« Créer sa fiche » ouvrait la suite, il fallait descendre écrire le nom puis
  remonter ; « Délier » détachait la fiche mais laissait le nom sur le bien). Maintenant : chercher
  dans ses contacts, ou **« Nouveau contact »** — un petit formulaire sur place (civilité, prénom,
  nom, téléphone, e-mail) qui crée la fiche et la relie d'un clic ; ou « Continuer sans
  propriétaire pour l'instant ». Relié : **« Changer de fiche »** (on relie quelqu'un d'autre, le
  reste ne bouge pas) ou **« Retirer du bien »** (plus de fiche, ni nom, ni coordonnées ; sa fiche
  reste dans les contacts). Des noms saisis sans fiche (biens d'avant) : « Créer sa fiche » à
  partir d'eux. La carte « Le propriétaire » d'une SCI dit « Interlocutrice : … ».
- **Menu de gauche** : le sous-onglet ouvert (Mes acheteurs, Mes estimations…) prend la teinte
  claire de sa couleur sur toute la ligne, son mot passe dans sa couleur, et un petit trait de la
  même couleur se pose à gauche — l'icône qui s'anime seule ne suffisait pas à voir où l'on est.

### V3.29 — 29 septembre 2026 · la fiche contact en rubriques

Maquettes validées par Alexandre (variante B de l'en-tête), puis codées.

- **La fiche contact se range en cinq rubriques** (`vue` dans `FicheClient.tsx`, barre
  `BarreOnglets` de `shared/OngletsGlissants`, à cheval sur le bas du bloc bleu) : **Vue
  d'ensemble**, **Sa recherche** (ou « Ses recherches » s'il en a plusieurs), **Son espace**,
  **Documents**, **Suivi**. Les étapes du dossier (Veille, Sélection, Présentés, Visites,
  Transaction) sont les sous-onglets de « Sa recherche », sous « Où en est la recherche ». Le Suivi
  est sa propre rubrique. `setTab` garde son nom et son usage partout : une étape ouvre « Sa
  recherche », `'suivi'` ouvre le Suivi (une relance qui mène au Suivi y arrive donc toujours).
- **Rubrique d'arrivée** : un contact qui n'est qu'acheteur s'ouvre sur « Sa recherche » ; un
  contact qui est aussi vendeur, propriétaire… sur « Vue d'ensemble ».
- **Le bloc bleu (variante B)** : le nom et l'état, ses types et sa référence, quatre chiffres
  sans cadre (en sélection, présentés, visites **effectuées** — une visite prévue peut être
  annulée —, offres ; un clic ouvre l'étape), « Suivi depuis » dans un petit bloc à droite des
  chiffres, et « Son espace · ouvert il y a 2 h » (`recherches.espace_ouvert_le`).
- **Les coordonnées** (`Coordonnees`, en tête du fichier) : un panneau de trois lignes dans le bloc
  bleu, avec copie en un clic. Dans un couple, chaque ligne dit à qui elle est : « (Madame) »,
  « (Monsieur) », ou le prénom si les deux ont la même civilité. Au-delà de trois, « Tout voir · N
  coordonnées » déplie tout **par-dessus les onglets** : le bloc bleu ne grandit jamais.
- **Vue d'ensemble** : « À venir » (prochaine visite, prochaine relance), « À savoir », « Sa
  situation » (sortie du bloc bleu, où elle empiétait), ses biens s'il vend, « Sa recherche en
  bref », « Dernièrement » (les quatre dernières lignes du Suivi).
- **Son espace** : le lien (`LienEspace`), le mail de bienvenue, le point automatique
  (`PointAuto`, sorti du bloc des critères). **Documents** : `DocumentsDuClient` ouvert d'emblée
  (nouvelle option `ouvert`) ; le nombre de documents est compté pour l'onglet.
- Nouvelles icônes dans `TRAITS` (`ParcoursBien.tsx`) : `copie`, `oeil`, `mobile`, `doc`.
- **Le rapprochement, depuis la fiche d'un acheteur** (`src/lib/rapprochement.ts`,
  `fiche/Rapprochement.tsx`) : « Faire un rapprochement » (bandeau de la Vue d'ensemble, et bouton
  doré dans l'en-tête « Où en est la recherche »). Une fenêtre en trois temps : **où chercher**
  (mes mandats en cours — `biens_vente` à l'étape `mandat`, sauf ceux du client —, les biens des
  veilles des autres clients — `veille_propositions` des autres recherches, statuts `nouveau` et
  `retenu`, sur 1, 3, 6 mois ou depuis le début —, ou les deux) ; **ça cherche** (un sourire,
  1,4 s au moins) ; **les biens trouvés**, notés par `correspondance()` (la note de l'espace) :
  70 % et plus « correspondent » (cochés d'office), 50 à 69 % « en partie », rien en dessous. Ce
  qui est déjà dans son dossier (même `url`, ou même `bien_vente_id`) est mis de côté et compté.
  Une annonce trouvée pour plusieurs clients n'apparaît qu'une fois. Un aperçu simple par bien
  (photos, prix, critère par critère, lien vers l'annonce ou la fiche du bien), puis **Mettre en
  sélection** (ligne `biens` à l'étape `selection`, avec `recherche_id`) ou **Envoyer par mail**
  (les mêmes, puis le mail d'envoi habituel `openEnvoiMulti`, qui les passe « Présenté »).
  Au Suivi : `rapprochement` (le rapprochement, avec `metadata.n`) et `rapprochement_bien` (chaque
  bien posé). Le bandeau lit le dernier `rapprochement` de la recherche : grand avant, une ligne
  « Dernier rapprochement le … · Refaire » après. Il annonce aussi, sans rien lancer, les mandats
  qui lui correspondent déjà (`mandatsPour`, 70 % et plus).
- **Le petit message après l'enregistrement des critères** (`toastRappro`, `FicheClient.tsx`) :
  si un de vos mandats lui correspond déjà, « Recherche de … enregistrée · « 4 pièces… » lui
  correspond à 89 % » et « Voir », qui lance le rapprochement sur vos mandats, ceux-là cochés
  (prop `depart` de `Rapprochement`).
- **La fiche bien, côté acheteurs** (`biens/AcheteursBien.tsx`) : l'onglet Acheteurs liste les
  recherches qui correspondent (filtres Tous · Correspondent · En partie), avec appeler, SMS,
  mail, l'état de chacun (« Nouveau : recherche ouverte hier », « Dans sa sélection depuis… »,
  « Présenté le … · l'a ouvert · veut visiter ») et **« Sélection ou envoi… »** : le mettre dans
  leur sélection (`mettreEnSelection`, ligne `biens` à l'étape `selection`, rien ne part), l'envoyer
  dans leur espace (`envoyerDansEspace`, qui présente maintenant aussi un bien resté en
  sélection), ou, pour un seul acheteur, **« Envoyer par mail… »** : sa fiche s'ouvre sur le mail
  d'envoi habituel, ce bien choisi (`OuvertureFiche.envoi`). Avant le mandat (à suivre,
  estimation) : la même liste sans envoi, « L'envoi s'ouvre au mandat ». En pause, vendu, retiré :
  en lecture. « Aussi dans leur dossier » garde ceux qui ont le bien sans plus correspondre.
- **La Vue d'ensemble d'un bien** (`biens/VueBien.tsx`) : quatre cartes (le mandat et le temps
  qui reste — ou, avant lui, le rendez-vous puis l'estimation —, les acheteurs, les visites et
  offres avec ce qu'en disent les comptes rendus, le propriétaire à appeler), le bien en bref,
  les prochaines visites, « Dernièrement » (quatre lignes de l'historique). Avant le mandat,
  « Qui pourrait l'acheter » s'affiche dès la Vue d'ensemble.
- **Les alertes de rapprochement** (`src/lib/alertes-rappro.ts`, en tête de la page Relances) :
  « Un acheteur arrive » (une recherche de moins de trois semaines à qui un de vos mandats
  correspond, pas encore dans son dossier ; « Voir » ouvre sa fiche et lance le rapprochement, ces
  mandats cochés ; disparaît dès qu'un rapprochement est fait) et « Un mandat arrive » (un bien en
  vente depuis moins de trois semaines, et des acheteurs qui lui correspondent sans l'avoir ;
  « Voir les acheteurs » ouvre la fiche du bien sur l'onglet Acheteurs, `demanderOngletBien`).
  Rien en base : tout se calcule à la lecture ; « Plus tard » les met de côté une semaine, noté
  dans les `donnees` du bien (`alerteAcheteurs`, `alertesRecherches`).
- **La fiche d'un bien, les autres onglets refaits** (`biens/OngletsBien.tsx`, maquettes 13 à 17
  du canevas ; FicheBien prépare les données et branche les actions) :
  - **Le bien** : l'annonce avec un anneau (le texte compte pour 60 %, les mentions obligatoires
    pour le reste : pas écrite, jamais plus de 40 %), les photos en bande (« + N »), puis une
    carte par famille, chacune de sa couleur (intérieur bleu, immeuble violet, copropriété
    sarcelle, extérieur vert, énergie ambre avec les sept lettres, charges ardoise, prix or). « En
    bref » n'y est plus : il reste dans la Vue d'ensemble.
  - **Les pièces** : en liste (jauge de surface, exposition, un mot) ou en cartes ; le choix est
    gardé dans le navigateur (`localStorage`, clé `emilio.pieces.vue`).
  - **Visites et offres** : la date en pavé (la prochaine en marine), « À venir · Passées ·
    Toutes » ; chaque offre dit son écart au prix, ses étapes (reçue, réponse, compromis) et le
    délai de réponse (`donnees.jusquau`). Les offres ouvertes d'abord.
  - **Documents** : une tuile par sorte (mandat, offres d'achat, bons de visite, compromis — celle-ci
    s'ouvre quand une offre est acceptée), la liste des documents, le mandat en détail ; à
    droite le dossier avec un anneau (reçus + non concernés sur le total). « Non concerné »
    s'allume en gris.
  - **Historique** : la frise du Suivi d'un contact (mêmes styles, `FriseSuivi.module.css`),
    « À venir » en haut (visites prévues, réponses d'offre attendues), filtres à pastilles de
    couleur ; ce que le CRM note tout seul (bien créé, document préparé, fiche ouverte) en ligne
    discrète. À côté, le parcours du bien (étapes datées d'après l'historique) et « En N jours de
    vente » (visites faites, offres, acheteurs présentés, fiches ouvertes).
- **L'Historique d'un bien lit aussi le Suivi des contacts** (`journalDuBien`, `outils.ts`) : une
  action notée chez un acheteur avec « Concerne un bien » (`journal.bien_id` = sa copie du bien), et
  le Suivi général du propriétaire (`client_id` du bien, ni `bien_id` ni `recherche_id`). Seulement
  ce qu'on écrit ou ce que le client dit (`TYPES_JOURNAL_BIEN` : appel, rendez-vous, note, relance,
  mail, message, demande de rappel) — présentations, visites et envois ont déjà leur ligne. Filtre
  « Contacts » ; l'étiquette « Dans le Suivi de… » ouvre sa fiche. « Ajouter une note » sur le bien
  reste une note simple (texte seul), rangée dans `biens_vente_suivi`.
- **Fiche contact, les coordonnées** : sur fond crème doré (variante C choisie par Alexandre), dépliage
  compris ; « Voir sur la carte » en version claire.
- **L'étape « Le propriétaire » de l'éditeur d'un bien** (`ChampProprio`, `proprioOuvert`) : d'abord
  « Ce propriétaire est-il déjà dans le CRM ? » avec la recherche (un choix relie la fiche et reprend
  ses coordonnées, après accord si un autre nom était déjà saisi). Sinon « Créer sa fiche » : ce qui
  était tapé devient son nom, la suite s'ouvre sur fond clair (`donnees.proprioNouveau`), et « Créer
  la fiche de … » la crée et la relie. Tant que rien n'est choisi (ni fiche, ni nom, ni création
  demandée), la suite de l'étape reste grisée et inerte.
- **« Pourquoi il vend »** en tuiles : pour plus grand, pour plus petit (valeurs `plusGrand`,
  `plusPetit`, nouvelles icônes `agrandir` et `reduire`), il achète ailleurs, mutation, succession,
  séparation, investissement, autre — chacune avec une ligne d'explication.
- **Les logos de l'agence** sont rangés dans `public/logos/` : les originaux d'Alexandre (le E
  blanc sur bleu, le E bleu sur blanc, en 1000 px) et leurs déclinaisons — `e-180`, `e-192`,
  `e-512` (écran d'accueil), `e-maskable-512` (Android découpe l'icône en rond : le E y est
  réduit), `e-silhouette-96` (la barre d'état d'Android, le E seul sans fond),
  `logo-emilio-800` et `logo-emilio-blanc-800` (le logo complet, 800 × 336, tiré de
  `public/logo_high_resolution*.png`). Une nouvelle image d'icône se dépose là, rien d'autre à
  toucher que les chemins qui la citent.
- **Le CRM** : l'onglet du navigateur montre le E (`src/app/favicon.ico`, `icon.tsx` — l'image y
  est écrite en clair, parce que ce fichier est rendu à la construction —, `apple-icon.png` pour
  l'iPhone). En haut du menu, le logo complet remplace « EI Emilio IMMOBILIER » ; le E seul quand
  le menu est réduit à ses icônes. La page de connexion affiche le logo blanc.
- **L'espace acheteur** : l'icône posée sur l'écran d'accueil, celle de l'onglet et celles du
  manifeste sont le E. `/icone` n'est plus qu'un renvoi vers `public/logos/` (les notifications et
  les icônes posées avant la V3.29 le connaissent). L'écran d'ouverture (`loading.tsx`) est clair
  (`#f4f6fa`, le même fond que `background_color` du manifeste, pour qu'Android n'ait pas de
  coupure), avec le logo et « Chargement en cours… » sur une fine barre qui file.
- **Espace acheteur, la barre de défilement sur ordinateur** : elle ne s'appliquait pas chez
  Alexandre, dont l'ordinateur est une tablette Windows à écran tactile — « (pointer:fine) » y est
  faux. Réglée maintenant sur `(min-width:900px), (any-pointer:fine)`, plus large (20 px) et bleu
  marine (`#34496e` sur `#dfe4ec`), sur la page comme sur la fiche d'un bien (`.feuille`,
  `.pop-carte`). ⚠️ Pour viser « l'ordinateur », ne jamais compter sur `pointer:fine` seul.

### V3.28 — 29 septembre 2026 · la carte du CRM sur téléphone, plus de place

- **La barre du haut du CRM s'efface sur la carte, au téléphone** (`.surCarte` dans
  `AppLayout.module.css`) : la carte monte jusqu'en haut de l'écran. Sa propre recherche prend,
  à gauche, le bouton du menu (☰, `onMenu` de `PageCarte`), qui ouvre le tiroir comme celui de la
  barre.
- **Les fiches qu'on fait glisser tiennent sur une ligne** (62 px au lieu d'environ 130) :
  l'avatar (ou la vignette du bien), le nom, l'étiquette ou le prix et la rue ; à droite, appeler
  (ou l'itinéraire, quand il n'y a pas de numéro) et la flèche qui ouvre la fiche. Le cadrage et le
  centre des vols suivent (la bande est plus fine).
- **Carte du CRM, les filtres** : une catégorie s'affiche dès qu'elle existe dans le CRM (`nbCrm`),
  même si aucun n'a d'adresse placée — « Mandats en cours 0 », en pâle ; un appui dit pourquoi et
  ouvre la liste de ceux qui manquent. Avant, des mandats sans adresse faisaient disparaître toute
  la section « Biens ». Chaque pastille a son icône (celle du type de contact, ou de l'étape du
  bien : œil, euro, panneau, poignée de main, pause, clé, croix).
- **Carte du CRM sur téléphone** : sous la recherche, deux boutons côte à côte, « Mes contacts » et
  « Mes biens » (« N sur la carte ») ; chacun déplie ses pastilles sur plusieurs lignes, avec
  « Tous / Aucun ». Plus de bande à faire défiler, plus de pastille « N sans adresse » : un point
  d'information (ⓘ), à droite de la recherche, dit qui est sur la carte et liste ceux qui n'y sont
  pas. Un appui sur la carte replie les filtres.
- **Fiches ouvertes** : quand des fiches dépassent d'un côté, la bande s'y estompe (masque en
  dégradé) au lieu d'être tranchée net ; sur téléphone, elle va jusqu'au bord arrondi.
  « Tout fermer » devient un petit bloc avec son icône (rouge au survol).
- **Carte du CRM sur ordinateur** : elle s'arrête au-dessus de la barre des fiches ouvertes (sa
  hauteur se mesure jusqu'au bas de la zone qui défile, remesurée quand la barre apparaît) — le
  bouton « − » n'est plus mangé ; et l'écran ne défile plus sur la carte (`.surCarte .content`),
  seule la carte bouge. Cadre un peu remonté.
- **Carte du CRM, « qui est sur la carte »** : plus de bloc ni de liste de ceux qui manquent
  (« 5 n'y sont pas », « Voir lesquels », les noms) — Alexandre n'en voyait pas l'intérêt. Une
  seule phrase, derrière un ⓘ : sur ordinateur dans l'en-tête des filtres (à côté du bouton qui
  replie), au téléphone à droite de la recherche. Le sous-titre n'est plus que « N adresses sur la
  carte » (« la liste suit la carte » est déjà dit au pied de la liste).
- **Le petit message du bas de la carte** apparaissait à droite puis sautait au milieu : il était
  centré par `transform`, que son animation d'entrée écrasait. Centré désormais par
  `left/right: 0; margin: auto; width: fit-content`. Une icône, un titre et une phrase ; sur une
  pastille pâle : « En pause : 0 sur la carte » et pourquoi. Au téléphone, toute la largeur,
  au-dessus des fiches ; les deux boutons ronds s'effacent le temps qu'il est là.
- **Espace acheteur, la carte : le prix au milieu de sa zone, en court** (« 995 k€ », « 1,25 M€ »,
  `PRIX_COURT`) — le prix entier reste sur la fiche du bas. Avant, l'étiquette était au bord haut
  du cercle et on touchait la zone sans que rien ne s'ouvre : toucher la zone choisit désormais le
  bien, comme toucher le prix (la plus proche quand deux zones se chevauchent) ; au survol, la main
  et la zone s'éclaire. L'étiquette d'une visite calée reste sur son point exact.
- **Espace acheteur, la carte dit quand un bien n'y est pas** : un bandeau posé en haut de la
  carte, juste sous les filtres (au téléphone, sous la mention OpenFreeMap), « 1 bien n'est pas sur la carte — son secteur n'est pas encore
  assez précis pour le placer », avec « Voir le bien » (un seul) ou « Les voir dans la liste ». Il
  suit le filtre, se ferme d'une croix, et n'apparaît pas quand aucun bien n'est placé (la carte le
  dit déjà). Remplace la petite ligne sous la liste de l'ordinateur, trop discrète ; au téléphone
  il n'y avait rien. Jamais d'emplacement au hasard : le client le prendrait pour le vrai.
- **Les fiches qu'on fait glisser sous les cartes (espace acheteur et CRM, téléphone)** : leur ombre
  était coupée net par le bas de la bande qui défile (`overflow-x: auto` coupe aussi en hauteur),
  d'où un liseré gris sous chaque fiche. La bande a un bas plus large, repris par une marge
  négative : les fiches ne bougent pas. Dans l'espace, plus de bordure transparente autour de la
  fiche (elle dessinait un cadre blanc autour de la photo) : la fiche choisie a un contour doré
  (`outline`) posé par-dessus.
- **Carte de l'espace acheteur, les biens qu'un filtre écarte ne disparaissent plus d'un coup** :
  leur étiquette s'allume à sa couleur (lueur), tremble, lance des étincelles et s'éteint en
  0,95 s (classes `.sort` et `.etinc` ; on anime l'étiquette, jamais l'enveloppe du repère, dont
  MapLibre tient la position par `transform`). Leurs zones scintillent deux fois puis s'éteignent
  (couche `zones-sortie`, opacité animée par `setPaintProperty`). Un bien qui revient avant la fin
  est gardé. Mouvement réduit : un simple fondu.
- **Fiche d'un bien, des onglets qui glissent** (`src/components/shared/OngletsGlissants.tsx`,
  `BarreOnglets` et `CorpsOnglet`) : la pastille de l'onglet choisi glisse jusqu'au nouvel onglet
  (mesurée sur le bouton, suivie par un `ResizeObserver`), et le contenu arrive en fondu, glissé
  du côté où l'on va. Au téléphone, la barre défile pour montrer l'onglet choisi. La dernière image
  de l'animation ne garde aucun `transform` (les fenêtres fixes du contenu restent fixes). Prévu
  pour la future fiche contact en onglets.
- **Les fiches qu'on fait glisser sous les cartes : un geste = une fiche** (`scroll-snap-stop:
  always` sur `.fb` et `.carteTel`) : un glissement un peu vif sautait deux ou trois biens.
- **Accueil de l'espace, au téléphone : la carte monte et coiffe « Vos derniers retours »**
  (`ApercuCarte` avec `fondu`, dans `DerniersRetours`) : elle était tout en bas, après la visite.
  Le plan, plus haut, porte l'étiquette « Vos biens sur la carte » ; son bas se fond dans la
  liste des retours, d'un seul tenant, et le premier retour remonte un peu dessus. Sans retour,
  l'aperçu seul se pose au même endroit (`.ac-tel`). Sur ordinateur, rien ne change : il reste
  en haut de la colonne de droite (`.ac-pc`), les retours en trois cartes.
- **Espace, sur ordinateur : la barre de défilement se voit enfin** (page et fiche d'un bien) :
  17 px de large, poignée de 11 px en gris ardoise (`#64748b`, plus foncé au survol), 64 px de
  long au minimum. Avant : une poignée de 8 px gris clair, que les clients ne voyaient pas.
- **Nouveautés, sur ordinateur : la phrase de la dernière recherche est centrée** (`.relance-pc`),
  comme le cadre « Rien de nouveau » (`.relance-centre`, dont le cadre est lui aussi centré).
- **Carte de l'espace, sur ordinateur : les filtres sont posés sur la carte** (`filtresPc`, classes
  `.filtresPc`, `.fp`, `.fpOn`) : une seule barre blanche en haut au milieu, un trait fin entre
  chaque choix, et le choix actif à la couleur de sa catégorie (« Tous » en bleu). Le message, le
  bandeau « pas sur la carte » et le chargement descendent dessous (`.avecFiltres`, top 66 px).
  Au téléphone, rien ne change.
- **Espace acheteur, « Nouveautés » a aussi sa carte** (« Liste | Carte », comme « Consultés ») :
  les biens arrivés nouveaux (`idsNouveaux`, lus à l'ouverture) tant qu'ils n'ont pas d'avis. Un
  bien seulement regardé y reste ; un avis donné depuis sa fiche l'en retire au retour sur la
  carte, qui se met à jour sans recharger. Pas de filtres (une seule couleur), titre « Vos
  nouveautés » ; l'onglet « Nouveautés » reste allumé. Quand tout a reçu un avis, la carte le dit.
- **« Nouveautés » vide** : un seul message (« Rien de nouveau pour le moment », avec une loupe qui
  cherche doucement) au lieu de la phrase sous le titre plus le cadre, qui disaient la même chose.
  « Vous n'êtes pas en attente » passe à la ligne ; le cadre de la dernière recherche, dessous, est
  centré lui aussi. Sur téléphone, les titres de rubrique passent à 20 px (icône 40 px) : « Nouveaux
  biens pour vous » tient sur une ligne.

### V3.27 — 29 septembre 2026 · la carte de l'espace acheteur, la barre des fiches qu'on range

- **Espace acheteur : ses biens sur la carte** (`src/components/espace/CarteEspace.tsx`, vue
  `carte` d'`EspaceClient`). Chaque bien présenté est une **petite zone ronde** à la couleur de son
  avis (vert « Ça me plaît », bleu « Visités », violet « À visiter », or « En attente », brique
  atténuée « Pas pour moi »), avec son prix ; de loin, les prix se replient en points. Filtres par
  avis en pastilles. **Téléphone** : bandeau bleu Emilio d'une ligne (« Vos biens · <ville> » +
  « Liste | Carte »), la carte en plein écran sous la barre du bas, et en bas les biens de la zone
  qu'on fait glisser — la carte suit la fiche qu'on glisse, la bande suit la carte qu'on déplace.
  **Ordinateur** : la carte et, à côté, « Dans cette zone ». Première ouverture : un mot dit que
  l'adresse exacte vient avec la visite.
- **Les zones sont fabriquées par le serveur** (`/api/espace/carte?token=`, jeton de la recherche) :
  adresse, puis adresse probable, puis quartier, jusqu'à une précision utile (numéro → rayon
  115 m, rue → 170 m, quartier → 340 m ; la ville seule n'est pas dessinée). Le centre est décalé
  d'une distance fixe dans une direction tirée de l'id du bien (`decaler`, toujours la même : on ne
  peut pas moyenner en rechargeant) ; l'immeuble est dans la zone, jamais au centre. **Seule une
  visite calée et pas encore passée donne le point exact** (étiquette « Visite jeu. 10 h »,
  itinéraire). Un bien en vente de l'agence (`bien_vente_id`) prend son `donnees.gps`. Positions
  gardées dans `geocodes` (la clé du serveur y écrit).
- **Où l'ouvrir** (pas de sixième onglet sur téléphone) : « Liste | Carte » en tête de
  « Consultés » (l'onglet reste allumé sur la carte), « Voir sur la carte » sur la fiche d'un bien
  (la carte se pose sur lui), l'aperçu « Vos biens sur la carte » de l'accueil (un dessin, pas une
  vraie carte : la bibliothèque ne se charge qu'à l'ouverture), « La carte » dans le menu de
  l'ordinateur (qui se resserre entre 1024 et 1440 px pour tenir sur une ligne).
- **« Consultés » : « Visite prévue » et « À visiter » ne font plus qu'un filtre** (« À visiter »),
  les deux cadres restent dessous. Les filtres sont **repliés d'office** : « Tout » (ou le filtre
  choisi, avec sa croix pour revenir à tout) et « Filtrer mes biens », qui déplie en douceur les
  pastilles — leur icône, à la couleur de chaque avis. Plus de grand cadre à deux colonnes.
- **CRM, la carte garde sa place** : ouvrir une fiche depuis la carte y pose un bloc « Carte »
  dans la barre des fiches ouvertes (« près de <rue> » du repère choisi). Un clic la rouvre
  exactement où on l'a laissée : vue (`carte.vue`), repère choisi et recherche (`carte.retour`
  dans sessionStorage, lu une fois). La hauteur de la carte se remesure aussi à la fin du
  glissement d'entrée (elle dépassait parfois du bas).
- **CRM, les fiches ouvertes se rangent à la main** (`FichesOuvertes.tsx`) : à la souris, on
  attrape un bloc et on le glisse ; au doigt, appui d'un tiers de seconde (le téléphone vibre) puis
  glisser — un glissement rapide fait toujours défiler la bande. Les autres blocs s'écartent, la
  bande défile près des bords, l'ordre est gardé (`fiches.ouvertes`).

### V3.26 — 28 septembre 2026 · la carte du CRM

- **Rubrique Carte** (`src/components/carte/PageCarte.tsx`, entrée « Carte » sous Biens) : les
  contacts et les biens en vente, là où ils sont. Fond OpenFreeMap « Bright » (tiré
  d'OpenStreetMap, gratuit, sans clé, usage commercial permis ; mention due, en petit gris) dessiné
  par MapLibre GL 5.24 (`maplibre-gl`, chargé seulement à l'ouverture d'une carte :
  `FondCarte.tsx`). Commerces et numéros de rue masqués.
- **Ordinateur** : à gauche les filtres (types de contact, « Reventes possibles » =
  `bien_actuel_a_vendre`, étapes des biens ; vendus et retirés éteints d'office), à droite « Dans
  cette zone » (la liste suit la carte, recherche par nom ou adresse, « Aller à … » pour une adresse
  tapée). Chaque panneau se replie (pastille « Filtres », onglet à droite), l'état se retient
  (`carte.filtres`, `carte.panneaux`, et la dernière vue `carte.vue`). Un repère ouvre sa carte de
  visite : ouvrir la fiche, itinéraire (Google Maps), « Voir son bien » / « Voir son domicile ».
  Les repères proches se regroupent en amas jusqu'au zoom 14 ; plusieurs à la même adresse
  s'écartent en couronne.
- **Téléphone** : recherche et filtres en bande en haut ; en bas, les fiches de la zone qu'on fait
  glisser — la carte suit la fiche, la liste suit la carte. Autour de moi, tout voir, appeler.
- **Où est un contact** : un professionnel à son étude, son agence ou son immeuble
  (`pro.adresseEtude`, `adresseAgence`, `immeuble`), un particulier chez lui (`adresse`) ; un
  propriétaire dont le bien est ailleurs (`bien_actuel_adresse`) a un second repère, « Son bien ».
  Un bien en vente : `donnees.gps` quand l'adresse a été choisie dans la liste, sinon son adresse.
- **Seuls les contacts et biens dont l'adresse est connue sont sur la carte** : la carte le dit, avec
  le nombre qui manque et leur liste (clic → la fiche, pour compléter). Une adresse trouvée à la
  ville seule n'est pas posée.
- **Géocodage** (`src/lib/carte.ts`) : la Géoplateforme de l'IGN (`data.geopf.fr/geocodage`, qui a
  repris l'API Adresse de data.gouv.fr ; l'ancien domaine ne devait tenir que jusqu'en janvier
  2026). Une adresse cherchée une fois est gardée dans **`geocodes`** (`outils/sql/carte.sql` :
  `cle` normalisée, `lat`, `lng`, `precision`, `libelle`, `cherche_le`) ; introuvable, elle se
  recherche au bout de deux mois. Sans la table, la carte marche mais recherche tout à chaque
  ouverture (elle le signale).
- **« Voir sur la carte »** (`BoutonCarte.tsx`) à côté de l'adresse : fiche d'un acheteur, fiche
  d'un contact, fiche d'un bien en vente. La carte s'ouvre en glissant, vole jusqu'au repère et
  ouvre sa carte de visite (`?page=carte&focus=c:<id>` ou `b:<id>`).
- L'autocomplétion d'adresse (nouveau contact, éditeur de bien) passe aussi par la Géoplateforme.

### V3.25 — 28 septembre 2026 · le menu de gauche, et des listes qui arrivent en douceur

- **Sous-menus Contacts et Biens**, comme Documents : Mes acheteurs, Mes vendeurs, Mes propriétaires ;
  Mes biens à suivre, Mes estimations, Mes mandats en cours (l'étape `mandat`). Chaque entrée a sa
  pastille à la couleur du type ou de l'étape ; celle qui est affichée s'allume (pastille pleine, une
  onde qui s'en échappe). La rubrique elle-même ouvre « Tous ». Les rubriques ont leur pictogramme
  dessiné sur ordinateur aussi (plus de symboles ⊞ ◎ ◇).
- **Plié ou déplié** : ouvert par défaut sur ordinateur, tout plié sur téléphone ; l'état se retient
  dans le navigateur (`menu.<rubrique>` sur ordinateur, `menu.tel.<rubrique>` sur téléphone).
- **La vue d'une rubrique** (`src/lib/intentions.ts`) : la page annonce sa catégorie (`annoncerVue`,
  dans l'adresse `?vue=` et dans la session), le menu l'écoute (`EVT_VUE`) ; à l'ouverture, la page
  lit `vueDemandee`. Déjà sur la page, le menu change la catégorie sur place (`demanderVue`,
  `EVT_DEMANDE_VUE`) : pas de rechargement, la page remonte doucement. Revenir d'une fiche retrouve
  la catégorie qu'on avait.
- **La flèche qui plie** ratait un clic sur deux : elle était centrée par `transform`, que la règle
  générale des boutons efface au clic. Piège noté dans AGENTS.md §2.7.
- **Listes** (`globals.css`) : `.cascade` fait arriver les éléments l'un après l'autre quand la
  catégorie change (avec une `key` sur le conteneur) ; `.squelette` / `.sq-*` remplacent
  « Chargement… » par la silhouette de la liste (Contacts, Biens). Les tuiles des en-têtes arrivent
  aussi en douceur.
- **Mes contacts** : on arrive sur « Tous ». Tuiles dans l'ordre Tous, Acheteurs, Vendeurs,
  Propriétaires, puis le reste ; une tuile à zéro ne s'affiche pas, sauf si elle est allumée.
  « Tous » est mis en avant (pastille dorée, trait de séparation), ici et dans Biens.

### V3.23 — 28 septembre 2026 · le suivi pour tous les contacts, la source d'un contact

- **Le suivi** (la frise des acheteurs) sur la fiche de tout contact qui n'est pas acheteur
  (`FicheContact.tsx`, `FenetreAction.tsx`) : appels en un clic, notes, relances. Lignes du journal et
  relances avec `recherche_id: null` (le journal est lu sur `client_id`, §6.17).
- **D'où vient ce contact** (facultatif) : `clients.source` et `clients.source_detail`
  (`outils/sql/source-contact.sql`, **à passer dans Supabase**), valeurs dans `src/lib/sources.ts`.
  Sans le SQL, la création marche et un message dit de le lancer.
- **« À savoir sur… »** (`CarteASavoir.tsx`) : la note tapée à la création (`clients.notes`)
  s'affiche enfin en haut de la fiche d'un acheteur ; elle remplace « Notes » sur les autres fiches.
- **Nouveau contact** : sections avec pictogramme, aperçu de la fiche, champs vides (plus de faux
  exemples, plus de durée ni d'honoraires de mandat pré-remplis), 2e téléphone ou e-mail à la demande.
- **Ses biens** d'un contact : replié par défaut ; déplié, chaque bien avec sa photo et ses infos,
  un clic l'ouvre.

### V3.22 — 28 septembre 2026 · le certificat de signature dit ce qu'il prouve

- Le certificat du mandat de recherche signé en ligne écrivait « Identité vérifiée par un code à usage
  unique » : c'était trop fort, le code prouve l'accès à la boîte mail, pas l'identité. Il dit
  maintenant « Adresse e-mail (du mandant / de chaque signataire) vérifiée par un code à usage unique,
  reçu sur sa propre adresse », comme les autres documents. Ne vaut que pour les signatures à venir.
- L'encadré vert du certificat grandit avec son contenu : avec deux signataires, la dernière preuve
  débordait sous son bord (`pdfSigne`, `mandat-pdf.ts`).
- Les pistes pour renforcer la preuve (horodatage qualifié, cachet, SMS) sont au §7, « À décider ».

### V3.21 — 28 septembre 2026 · les montants en entier

Plus aucun montant abrégé dans le CRM (règle au §9) : le budget de la fiche client (`budgetLisible`,
`fourchetteBudget` dans `FicheClient.tsx`), la colonne « Budget max » de la liste des contacts
(`budgetCourt`, `Clients.tsx`), le résumé de la recherche sur une fiche contact (`court`,
`ChampsContact.tsx`), les filtres de budget de la page Biens (`FiltresBiens.tsx`) et les étiquettes du
graphique des prix d'un bien (`GraphePrix`, `ParcoursBien.tsx`, tenues un peu plus loin des bords).
Rien à passer dans Supabase.

### V3.20 — 28 septembre 2026 · les anomalies connues, toutes revues

Les vingt-deux anomalies du §6 ont été revérifiées une à une dans le code : dix étaient déjà
réglées par les versions précédentes (marquées « constaté »), une est sans objet (§6.20), les
autres sont corrigées ici.

**SQL à lancer une fois** (le CRM fonctionne sans) : `outils/sql/parametres-secrets.sql`, qui
efface les clés Mailjet et le mot de passe gardés en clair dans `parametres`.

- **Le mandat de recherche papier** : le prix maximum ne change plus « par un simple e-mail » mais,
  comme pour le mandat de vente, d'un commun accord, par avenant écrit signé des parties. Seul son
  texte change (dumps de régression : une ligne, `mandat_recherche`).
- **Tableau de bord** : chiffres et cartes branchés (§6.8). **Mon activité** : le vrai CA (§6.9).
  Le CA se lit dans `src/lib/activite.ts` (`honorairesEncaisses`) : transactions clôturées, date de
  l'acte (`acte_date_prevue` ; « Acte signé — clôturer » la pose au jour même quand elle n'a pas été
  saisie) ; biens vendus, date `vendu_le`, honoraires de la dernière ligne « Vendu » de leur
  historique. Mon activité lit les contacts page par page (au-delà de 1 000, rien ne se perd).
- **La fiche d'un client à plusieurs recherches** s'ouvre sur la première dont la veille tourne
  (avant : la plus ancienne, même close), comme la liste des contacts et les documents.
- **Les mails** : variables, signature et modèle lus dans les Paramètres, case SMS retirée, version
  texte sans doublon, mails de « Nouveau mail » rangés dans une recherche (§6.13, §6.19).
- **Paramètres** : plus aucun secret à l'écran ; « SMS & Relances » devient « Relances » ;
  « Sécurité » dit où se gère le mot de passe (Supabase › Authentication › Users).
- **Le Suivi d'un client à plusieurs recherches** (§6.17) ; **la veille sans recherche** (§6.14) ;
  **le `.ics`** (§6.18) ; **interphone et digicode** (§6.21) ; **la recherche du haut** et
  `offre_ecrite` (§6.16) ; **l'outil des espaces JSX**, qui sort en code 0 (§6.22).
- **Écritures silencieuses rattrapées** : `src/components/biens/outils.ts` (onze `console.error` sur
  des écritures : rendez-vous, photos, journal, badges, relance du propriétaire, lien du mandat) et
  le compte rendu de visite (trois) passent par `signalerEchec` : un échec s'affiche en rouge.

### V3.19 — 28 septembre 2026 · déléguer un mandat depuis la fiche d'un confrère

Rien à passer dans Supabase : tout vit dans `clients.pro` et `documents.donnees`.

- **Sur la fiche d'un confrère** : « Déléguer un mandat » (en haut, en or) et le bloc « Ses
  délégations » (déplié, avec « + Déléguer un mandat »). Le bouton ouvre Documents sur Nouveau
  document › Délégation, le confrère déjà choisi (`IntentionDocuments.delegation`).
- **Dans Nouveau document › Délégation**, « Le confrère » se choisit dans tes contacts (un nom, une
  agence, un réseau), ou « Pas dans mes contacts : je le saisirai ».
- **Ce qui se remplit** (`depuisConfrere`) : son agence, l'adresse de l'agence, lui (civilité,
  nom, e-mail, téléphone) comme signataire ; et, s'il a déjà eu une délégation, sa société, sa
  forme, son capital, son RCS, sa carte et sa CCI, sa garantie, son assurance, sa qualité. Un guide
  le dit en tête de l'étape « Le confrère » ; un autre prévient, pour un mandataire (IAD, SAFTI…),
  que la carte est celle du réseau et qu'il signe comme agent commercial habilité.
- **Ce qui est gardé** : à la finalisation, ces informations s'écrivent sur sa fiche
  (`clients.pro.juridique`, avec la date), pour la délégation suivante ; la fiche les montre sous
  « Son agence ». Un échec s'affiche en rouge (« La fiche du confrère : pas enregistré »), sans
  bloquer la délégation.
- La délégation reste rangée sur la fiche du mandant (`client_id`) et se retrouve sur celle du
  confrère par `donnees.confrereId`.

### V3.18 — 28 septembre 2026 · le registre des mandats, la délégation, l'éditeur repensé

⚠️ **À passer dans Supabase avant de déployer** : `outils/sql/registre-mandats.sql` (tables,
déclencheurs, fonctions ; relançable sans risque). Sans lui, tout marche comme avant : le registre
se lit « pas démarré » (`registreAbsent`, par le code de l'erreur), numéro saisi à la main et
réserve de l'espace inchangés.

**Le registre des mandats** (Documents › Registre des mandats, `components/documents/PageRegistre.tsx`,
`lib/registre.ts`). Article 72 du décret de 1972 : chaque mandat, dans l'ordre, sous un numéro
qui se suit sans trou, reporté sur le mandat AVANT sa signature.
- **Alexandre le démarre** (bouton « Démarrer le registre ») : le dernier numéro de son registre
  ImmoFacile, la mention de reprise, une case « j'ai exporté mon ancien registre ». Un départ qui
  retombe sur un numéro que le CRM connaît déjà (documents, recherches, mandats en ligne, réserve)
  demande une confirmation de plus. Le départ ne se change plus.
- **Le numéro est pris par la base**, sous verrou (`registre_inscrire`, `pg_advisory_xact_lock`) :
  en finalisant un mandat dans Documents (`finaliser(…, { registre })`, avant que le PDF soit
  figé), ou quand un acheteur demande son code pour signer seul dans son espace
  (`/api/espace/mandat`, étape `code`). Idempotent : même document, même numéro ; même signature
  en ligne, même numéro ; une signature commencée dans l'espace pour cette recherche et jamais
  close, même numéro. Un numéro d'avant le registre (`numeroAncien` : plus petit que le premier)
  reste celui de son mandat ; un numéro de mandat fini ne resert pas.
- **Rien ne se modifie, rien ne s'efface** : déclencheurs sur UPDATE, DELETE et TRUNCATE des trois
  tables. Ce qui arrive ensuite s'ajoute en **observations** (`registre_observer`) : « Signé »
  (à la main, en ligne, sur place, dans l'espace, co-signatures en note), « Sans suite »
  (document annulé ou brouillon numéroté supprimé), « Rétracté », « Annulé », avenant signé,
  délégation signée ; à la main depuis la page : signé, sans suite, fin, vente, annulé,
  délégation, observation.
- **Empreintes chaînées** (SHA-256, heure en UTC au format fixe) : chaque ligne et chaque
  observation porte l'empreinte de son contenu et de la précédente. `registre_verifier()` dit si
  un numéro manque ou si une ligne a été retouchée ; la page le vérifie à chaque ouverture.
- **La page** : une frise de haut en bas (pastilles numérotées reliées par un trait, couleur =
  état, groupées par mois, le prochain numéro en haut et le départ en bas ; « Plus récents en
  haut » / « Dans l'ordre »), recherche, tuiles d'état, « Inscrire à la main » (un mandat fait
  hors du CRM), « Exporter en PDF » (`lib/registre-pdf.ts`), « M'envoyer l'archive ».
- **L'archive** (`lib/registre-archive.ts`) : le PDF complet, rangé dans `mandats/registre/` et
  envoyé par mail à Alexandre ; chaque 1er du mois par le cron des relances (pas de cron de plus),
  ou à la demande (`POST /api/registre/archive`). Lecture par pages de 1 000 (`toutLire`).
- **Ailleurs** : l'éditeur remplace le champ du numéro par un guide (« ce sera le 4336 ») et
  refuse de finaliser tant que l'état du registre n'est pas lu ; le bloc Mandat de la fiche
  (`MandatEnLigne`) ne demande plus de numéro ni de réserve, dit d'où viendra le numéro, et
  propose de laisser un numéro d'avant le registre ; un « Signé » ou « Rétracté » que le registre
  n'a pas pu noter part en alerte mail.
- Les bons de visite, offres et courriers ne vont pas au registre. Les avenants et les
  délégations n'ont pas de ligne à eux : une observation sur celle de leur mandat.

**Le menu** : sous « Documents », un sous-menu ouvert par défaut (sa flèche le replie, retenu
dans `localStorage`, `menu.documents`) : « Créer un document » et « Liste des documents »
(`IntentionDocuments.ancre` : la page descend à l'endroit), « Registre des mandats »
(`?page=registre`). Menu réduit : la rubrique seule.

**La délégation de mandat** (`lib/actes/delegation.ts`, rubrique « Délégations »). Confier un
mandat signé à un confrère : « Déléguer à un confrère » sur la fiche d'un mandat signé (papier ou
en ligne), ou Nouveau document › Délégation (mandats signés seulement). Elle reprend le mandat,
avenants signés compris (`Modele.avenantsDe`, appliqué par `preparerDepuis`) ; on saisit le
confrère (agence, société, siège, RCS, carte et CCI, garantie ou non-détention de fonds, RCP,
signataire), la mission (toute ou une partie), sa fin (au plus tard celle du mandat), ses
engagements, les annonces, le partage des honoraires (part du confrère, qui encaisse). Signée
par le confrère puis l'agence, à la main, en ligne ou sur place. Refusée si le mandat ne
l'autorise pas (un avenant d'abord). `Modele.interne` : jamais dans l'espace du client, ni en
lecture ni en téléchargement.

**La clause de délégation** : cochée d'office dans les pouvoirs du mandat de vente et du mandat
de recherche, réécrite (« déléguer tout ou partie de sa mission à un autre professionnel
titulaire de la carte… ; l'Agence reste responsable… (article 1994 du Code civil) et l'informe
de toute délégation »). Seul changement dans les textes des modèles.

**L'éditeur repensé** : plus d'étapes (mandat de vente : 8 ; de recherche : 6), chaque question
dans sa carte avec un grand libellé et son pictogramme, des pictogrammes sur tous les choix, le
fil des étapes et la bascule « Étape par étape / Tout sur une page » en haut, comme l'éditeur
d'un bien (`FilEtapes.tsx`, partagé). L'aperçu ne change pas. Grille des modèles : trois
colonnes.

**La fiche client** : « Ses documents » et « Ses biens » repliés d'office, côte à côte, avec leur
nombre et une flèche qui invite à déplier (`BlocRepliable.tsx`) ; le lien de l'espace juste sous
le bloc du nom ; « Où en est votre recherche ? » au pied du bloc de la recherche.

**À faire relire par l'avocat** avant le premier usage réel : le texte de la délégation, la
clause des pouvoirs, la tenue électronique du registre (mentions de l'en-tête du PDF).

### V3.17 — 28 septembre 2026 · plus rien ne se perd sans le dire

Rien à passer dans Supabase.

**Les écritures vérifiées** (`src/lib/ecritures.ts`). Ce qui disait « enregistré » sans l'être
(§6, anomalies 2 et 3) : chaque écriture lit maintenant sa réponse.
- Côté CRM : `verifie(quoi, requete, { ligne })` affiche un message rouge en bas à droite
  (`Avertissements`, monté dans `AppLayout` : « <quoi> : pas enregistré. » + la raison, trois au
  plus, refermables) et rend `false` pour que l'appelant s'arrête. `ligne: true` (la requête finit
  par `.select('id')`) attrape le refus muet de la base fermée : 0 ligne touchée = session expirée.
  `verifieTout(quoi, [() => req, …])` enchaîne des écritures qui dépendent l'une de l'autre et
  **s'arrête au premier échec** (supprimer une recherche : l'historique protégé est mis à l'abri
  avant qu'on efface le reste). `signalerEchec(quoi, detail)` pour les cas faits à la main.
  `addJournal` est vérifié ; un type refusé par la liste fermée de la base (code 23514) est gardé
  sous `statut_change`, le type voulu dans `metadata.type_voulu`.
- Côté serveur : `ecritServeur(quoi, requete, avertissements?)` note l'échec dans les journaux de
  Vercel. L'écriture principale d'une route fait échouer la route (`500 { ok:false, error:
  'enregistrement' }`) ; les secondaires (historique, suivi de l'espace, relances) sont notées.
  `/api/send-mail` rend `avertissements[]` : le CRM dit « Le mail est parti, mais son suivi : … ».
  Le cron des relances n'envoie plus l'alerte si la marque « déjà prévenu » ne s'écrit pas (sinon
  elle repartirait chaque jour).
- Dans l'espace acheteur, un envoi qui échoue laisse la fenêtre ouverte avec ce qu'il a saisi
  (message, critères) et le dit sous le bouton (`EchecEnvoi`).
- **Règle pour la suite** : plus d'écriture nue. `verifie` dans le navigateur, `ecritServeur` sur
  le serveur, `const { error }` quand il faut faire autre chose de l'échec.

**Documents.** « Nouveau mandat de vente » propose les biens que le client **vend** (`biens_vente`),
et non plus ceux trouvés pour lui comme acheteur. Le noir `#1a2332` des Documents et du PDF devient le bleu
Emilio (`--emilio-fond`, `#34496e`, texte `#2e4166`). Les statuts (brouillon, à faire signer, signé,
annulé) sont en gras, plus francs, avec leur dessin (`Pastille`, dans `DocumentsDuClient.tsx`).
Bloc « Ses documents » sur la fiche client (voir §3).

**Mandat de vente** : le prix ne change que par avenant écrit (plus « un simple e-mail ») ;
l'aide de la durée explique la mention de l'article 78 ; l'information précontractuelle peut être
« jointe », « remise à part » ou **« ni jointe, ni mentionnée »** (le mandat seul) ; un encadré
« Ce que le document contiendra » annonce les annexes (reconduction, formulaire de rétractation).
Le mandat de **recherche** garde « un simple e-mail suffit » pour son prix (à aligner si Alexandre
le veut).

**Biens** : un affichage en lignes (photo réduite), au choix avec les cartes, retenu dans
`localStorage` (`biens.vue`).

### V3.16 — 28 septembre 2026 · la visite sur place, sur tablette

Rien à passer dans Supabase : tout vit dans `biens_vente.donnees`.

**« Visite sur place »** (`components/biens/VisiteSurPlace.tsx`), sur la fiche d'un bien à suivre
ou en estimation (bouton en haut, et le bloc « Chez le propriétaire ? » de la vue d'ensemble) :
plein écran, gros boutons, sept écrans — le bien et son propriétaire, les chiffres, pièce par
pièce, l'intérieur et l'extérieur, l'accès, ce qu'on retient, la fin de visite. Les questions sont celles
de la fiche (`ETAPES_BIEN`, rendues en grand par `.grandeSaisie` de Documents.module.css) ;
seules les pièces et « ce qu'on retient » ont leur écran propre.

**Une pièce** : nom, surface, exposition (boussole), niveau (duplex, maison), état, sol, ce
qu'elle a, un mot, et ses photos prises à la tablette (rangées sous le nom de la pièce, dans
`photos[].legende`). Nouveaux champs d'une pièce : `etat`, `sol`, `atouts` (`lirePieces` les
garde). **Ce qu'on retient** : `visiteAtouts`, `visiteDefauts`, `visiteNote`, `prixSouhaite`
(affiché dans « L'estimation » de la fiche) ; `visiteLe` et, s'il manque, `rdvEstimation` se
posent à l'ouverture. **Fin de visite** : les pièces du dossier à demander au propriétaire
(passent « demandé »), puis « Passer en estimation », « Le mandat est signé », « Préparer le
mandat à signer » ou « Terminer ».

**Rien ne se perd** : enregistrement 0,7 s après chaque touche, et un brouillon dans la tablette
(`localStorage`, `emi-visite-<id>`) repris s'il est plus récent que la fiche ; sans réseau, la
visite continue, l'envoi et les photos repartent au retour du réseau (`online`, et toutes les 20 s).
L'écran reste allumé pendant la visite quand l'appareil le permet (`wakeLock`).

**L'écran « Accès »** (occupé ou libre, les clés, le chemin jusqu'à la
porte, qui appeler) se place entre « Intérieur, extérieur » et « À retenir » ; « À retenir » pose aussi les
travaux, les sinistres et la copropriété (voir « Les observations » plus bas).

**Une saisie plus vivante** (demandé par Alexandre : « pas assez d'icônes, pas assez jolies ») :
chaque question et chaque réponse de la fiche d'un bien a son dessin (`ic` sur les champs et les
options de `ETAPES_BIEN` ; une quarantaine de pictos ajoutés dans `documents/pictos.ts`, dont les
huit flèches de l'exposition `dirN`…`dirNO`). Les questions à choix deviennent de petites cartes,
un choix « saute » quand on le prend : tout est porté par `.saisieVive` + `.chQ`
(Documents.module.css), posés seulement par l'éditeur des biens, la visite et les fenêtres
d'estimation — **l'éditeur des documents n'en voit rien**. Le fil des étapes montre le dessin de
chacune (coche verte en coin quand elle est remplie) ; l'étape qui arrive glisse en place, avec
une jauge. **La partie « Pièces » n'a pas bougé** (demandé : « il ne faut pas toucher »).

**Les indications de visite dès l'ajout du bien** : l'étape `pratique` (« Les indications de
visite ») n'attend plus le mandat. Nouvelles clés : `accesBas` (gardien, vigile, interphone,
digicode, badge, porte ouverte), `accesAscenseur` (gauche, droite, en face, pas d'ascenseur),
`itineraire` (le chemin jusqu'à la porte, en clair). Le bloc de la fiche se montre à toutes les
étapes (sauf vendu).

**Les observations** (nouvelle étape `observations`, pour Alexandre seul, jamais dans une annonce
ni un espace client) : les travaux réalisés (`travauxFaits`), un sinistre (`sinistre` oui/non, puis
`sinistres`, chacun « réglé » ou « en cours »), et en copropriété ce que disent les PV d'AG
(`coproVotes`, `coproFaits`, `coproAVenir`). Chaque liste est un nouveau type de champ, `journal`
(`ChampJournal` dans ChampsBien.tsx) : `[{ id, nature, quand, note, enCours? }]`, `quand` en
clair (« 2022 », « AG de juin 2025 »), des idées à cliquer. Y ont déménagé : `notes` (quitte
l'étape « Annonce », qui n'existe plus avant le mandat), `travaux` (quitte l'intérieur) et
`travauxVotes` (quitte la copro) — mêmes clés, rien de perdu. Sur la fiche, « Observations et
notes » résume tout, un sinistre en cours en rouge en tête.

**L'estimation change vraiment quelque chose** (Alexandre : « quand je le passe en estimation, il
n'y a rien qui change ») :
- en passant en estimation, la fenêtre demande le montant (« Je le donne maintenant » / « Plus
  tard ») : fourchette, prix conseillé (le milieu proposé d'un clic), prix espéré par le
  propriétaire avec l'écart en %, le prix au m², une jauge ; et « Pour bien estimer » (ce que la
  fiche dit déjà, ce qui manque : `pretPourEstimer`) ;
- sur la fiche, « L'estimation » montre le chemin jusqu'au mandat (rendez-vous, visite, montant,
  avis de valeur, qui se cochent seuls) et, sans montant, un bouton « Définir l'estimation »
  (`FenDefinirEstimation`) — un changement de montant laisse une note dans l'historique ;
- la carte ne dit plus « À estimer » : « Estimation à définir », puis la fourchette ; avant le
  mandat, la fourchette passe devant le prix conseillé (`prixCarte`). Le montant ne s'efface
  jamais, retiré ou en pause compris.
- l'atelier d'estimation (comparables, prix au m², plus et moins) est **pour plus tard** :
  Alexandre l'a gardé de côté ; l'avis de valeur en PDF aussi.

**Affiner la liste des biens** (`components/biens/FiltresBiens.tsx`) : une ligne sous les
catégories — type, surface, pièces, budget, DPE au plus — et le tri (par étape, prix croissant
ou décroissant, surface, les plus récents). Le budget lit le prix affiché, sinon le milieu de la
fourchette (`prixDe`). Les filtres comptent comme la recherche : les nombres des catégories les
suivent ; « 3 biens sur 8 · Effacer ». Classes `.aff*` (`.filtres` était déjà pris par
l'historique de la fiche).

### V3.15 — 28 septembre 2026 · saisir un bien plus simplement

Rien à passer dans Supabase.

**« À suivre » peut tout remplir** : intérieur, extérieur, pièces, énergie, copro, photos. Seules
l'estimation (fourchette, prix conseillé) attend l'étape « estimation », et la visite (clés, codes)
le mandat. Avant, « Modifier » sur un bloc masqué ouvrait l'éditeur ailleurs sans un mot ; il dit
maintenant pourquoi (`Notice` dans `EditeurBien.tsx`). Un titre de section masqué ne coupe plus
ses questions (`groupes`) : « L'immeuble » pour un appartement, « La construction » pour une
maison, mêmes questions.

**La saisie** : compteurs – / + (`t: 'compteur'`, `ChampCompteur`) pour pièces, chambres, salles
de bains et d'eau, WC, niveaux, étage, étages, places de parking ; « Les surfaces » puis « Les
pièces » ; l'adresse proposée pendant la frappe (`t: 'adresse'`, base adresse nationale : rue,
code postal, ville, et `gps` gardé pour plus tard) ; une icône sur chaque champ. Nouveaux champs :
`niveaux` (appartement, duplex, loft : 2 = duplex, 3 = triplex), `constructible` et `viabilise`
(terrain). `etages` reste « les niveaux » pour une maison, « les étages en tout » en immeuble.

**Le mandat signé** (`FenMandat`) demande aussi la charge, le taux ou le forfait, et montre la
mention de l'annonce en direct ; à la charge de l'acquéreur, « Mettre en vente » attend le taux ou
le forfait (le % et le prix hors honoraires sont obligatoires dans l'annonce).

**« Nouveau bien »** dans le « + » du téléphone et sur le tableau de bord
(`demanderNouveauBien()` sans propriétaire, événement `EVT_NOUVEAU_BIEN`).

**Nouveau contact au téléphone** : la fenêtre s'ouvre dès le premier affichage (plus de liste
entrevue) et vit sur `<body>` (l'animation d'entrée de la page la faisait glisser puis sauter) ;
l'en-tête tient en deux lignes (nom et types, puis l'étape en cours), le pied en une.

**« Une nouvelle version du CRM est prête — Recharger »** (`NouvelleVersion.tsx`) : la version
gravée à la construction (`EMI_VERSION`, `next.config.ts`, le commit Vercel) comparée à
`/api/version` au retour sur l'onglet et toutes les dix minutes. Un téléphone gardait l'ancienne
version des heures après une mise en ligne.

### V3.14 — 27 septembre 2026 · les types de contact

⚠️ **À passer dans Supabase avant de mettre le code en ligne** : `outils/sql/types-contact.sql`
(colonnes `clients.types`, `pro`, `archive` ; les propriétaires déjà créés depuis un bien
deviennent vendeurs ; vérification : cinq lignes « oui »). Sans lui, la liste s'affiche comme
avant et la création d'un non-acheteur demande de lancer le SQL.

**« Clients » devient « Contacts »** (barre latérale, barre du bas, recherche globale, boutons),
et le chiffre « actifs » à côté disparaît. Un contact porte un ou plusieurs types : acheteur,
vendeur, propriétaire, notaire, confrère ou agence (salarié, mandataire et son réseau, à son
compte), gardien, partenaire (courtier, diagnostiqueur…). **Nouveau contact** commence par « Qui
est-ce ? » (tuiles à cocher) ; un acheteur garde ses étapes recherche et mandat (ses critères
peuvent attendre : acheteur non filtré) ; un vendeur ou un propriétaire peut enchaîner sur
« Nouveau bien », lui déjà propriétaire ; un professionnel n'a que son identité, son bloc
(agence, étude, immeuble, activité) et ses coordonnées. La page et les fiches : voir §3.

**Un couple** (même jour, après la mise en ligne) : dans « Nouveau contact » et « Modifier le
contact », chaque personne a son e-mail et son téléphone dans son cadre (ceux de la personne 1
étaient plus bas, dans « Contact », et on ne les trouvait pas) ; il reste un bloc « Autres
coordonnées » facultatif. La fiche montre les coordonnées de chacun sous son prénom. Un vendeur
ou un propriétaire peut aussi être un couple (« + Un couple » dans sa fiche). Le nom affiché ne
change pas : « Paul et Claire Martin », ou « Paul Martin et Claire Durand » (`nomFoyer`).

### V3.13 — 27 septembre 2026 · « Biens » : à suivre, estimation, mandat

Rien à passer dans Supabase : `etape` est un texte libre.

**La rubrique devient « Biens »** : tous les biens, pas seulement ceux en vente, avec des
catégories cliquables (Tous · À suivre · Estimations · Mandats en cours · Sous offre · Sous
compromis · Vendus ; En pause et Retirés quand il y en a). **Une étape « À suivre »** avant
l'estimation : un propriétaire qui pense vendre. Le bouton d'étape d'un bien à suivre propose
« On passe à l'estimation » (rendez-vous facultatif), « Le mandat est signé », « Le propriétaire
renonce ».

**Nouveau bien demande d'abord où il en est**, et l'éditeur ne pose que les questions utiles :
pas de mandat à l'estimation, pas de pièces pour un simple projet. L'ancienne fenêtre « Où en est
ce bien ? » à la fin disparaît.

**L'éditeur** : le fil des étapes ne déborde plus (libellés courts, flèches quand il ne tient
pas), le choix du mode est dans la barre du haut, les questions prennent plus de place et sont
rangées en blocs, l'aperçu est en colonne étroite. **Les pièces** : une carte par pièce avec son
icône, l'exposition en boutons, des tuiles à icône pour ajouter. **Les charges** : par an ou par
mois, l'autre se calcule. **Les dépenses d'énergie** du DPE sont nommées comme telles (montant bas,
montant haut) : ce n'est pas la copropriété.

**La fiche** : vue d'ensemble équilibrée (le bien en bref en tuiles à icône, deux colonnes),
onglet « Le bien » avec l'annonce et les photos en haut et des icônes partout (chauffage, eau
chaude, cuisine, pièces…), onglet « Photos » à part.

### V3.12 — 27 septembre 2026 · les biens en vente

⚠️ **À passer dans Supabase avant de mettre le code en ligne** : `outils/sql/biens-vente.sql`
(tables `biens_vente` et `biens_vente_suivi`, colonne `biens.bien_vente_id`, bucket public
`photos-vente`). Sans lui, la rubrique affiche le message d'installation et le menu reste sans
pastille.

**Une rubrique « Biens en vente »** dans le menu (pastille = en vente, sous offre, sous
compromis), sur les maquettes du 26 septembre. Créer un bien soi-même, étape par étape ou tout
sur une page, avec tout ce qu'une fiche d'agence contient : le propriétaire (relié à sa fiche
client, ou créée depuis le bien), le bien, l'intérieur, l'extérieur, **les pièces une à une**
(niveau, pièce, surface, exposition, commentaire — pour la future fiche PDF), **l'énergie**
(lettres DPE et GES, leurs valeurs en kWh/m²/an et kg CO₂/m²/an, coût annuel), **la
copropriété** (lots, procédure, syndic, fonds et travaux votés) puis **les charges et taxes**
(charges par an et par mois, taxe foncière — qui n'est pas la copropriété —, loyer si loué),
le prix et le mandat, la visite (clés, codes, contact), l'annonce (brouillon écrit depuis la
fiche avec les mentions obligatoires, et leur contrôle), les photos et le dossier (diagnostics
et pièces, reçus/demandés, fichiers privés).

**La fiche d'un bien** : les acheteurs qui correspondent (la note de l'espace, déplacée dans
`src/lib/correspondance.ts` et partagée avec `EspaceClient`), « Envoyer dans son espace » (copie
dans `biens`, journal, relance, notification), les visites (acheteur suivi : table `visites` et
son dossier ; hors CRM : suivi du bien et rendez-vous dans l'agenda), les comptes rendus (la
fenêtre commune `CompteRenduVisite`), les offres côte à côte (acceptée, refusée, contre-offre,
retirée ; relance du propriétaire à la fin du délai), les étapes (mandat, offre, compromis avec
ses dates, vente avec les honoraires, pause, retrait, changement de prix), les documents
préremplis (mandat de vente, offre d'achat, bon de visite, qui s'ouvrent dans Documents :
intention `{ ouvrir }`) et **un onglet Historique** : tout ce qui s'est passé sur le bien,
filtrable.

