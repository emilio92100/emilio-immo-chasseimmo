# CONTEXTE — Emilio Immo, CRM de chasse immobilière

**Version 3.28 · 29 septembre 2026**

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
clerc, clercTel ; immeuble, horaires, acces ; metier, societe). `archive bool`. Tout passe par
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
    `note`.
  - `biens.bien_vente_id` : la copie d'un bien en vente dans le dossier d'un acheteur (présenté
    dans son espace, ou visité). C'est par elle que la fiche retrouve à qui il a été présenté,
    ce qu'ils en ont dit et leurs visites (table `visites`, comme les autres).
  - Photos : bucket **public** `photos-vente` (`<id du bien>/…`), déposées par le CRM connecté,
    réduites à 1 920 px dans le navigateur. Jamais dans `photos-biens` : retirer un bien du dossier
    d'un acheteur y efface les photos. Pièces du dossier et offres signées : bucket privé
    `mandats`, sous `biens-vente/<id>/`, via `/api/biens-vente`.
  - Documents créés depuis la fiche : `documents.donnees.bienVenteId` = l'id du bien.
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
- **La fiche** : bandeau (photo, prix, étape), onglets Vue d'ensemble · Le bien · Photos ·
  Visites et offres (à partir du mandat) · Acheteurs · Documents · Historique. Vue d'ensemble : le
  bien en bref (tuiles à icône), puis deux colonnes équilibrées. Le bien : l'annonce et les photos
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

