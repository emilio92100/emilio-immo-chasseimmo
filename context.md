# CONTEXTE PROJET — Emilio Immobilier
## CRM Immobilier sur mesure — Version 3.2
### Mis à jour le 30 juin 2026

> **⚡ Nouveauté majeure V3.0 : architecture multi-recherches.** Un client peut désormais avoir **plusieurs recherches en parallèle** (ex. RP Paris + invest Lyon), chacune avec ses propres critères, biens, visites et envois. Voir §13 pour les détails. Formulaire de création refondu en assistant 3 étapes. Onglets Historique + Journal fusionnés en « Suivi ».

> **🆕 Session 30 juin 2026 (V3.2).** Reformulation IA fiabilisée (endpoint dédié `/api/reformuler-bien` + reformulation auto à la création, retrait du nom de confrère). Prix sourcé = prix affiché en gros (jamais le « hors honoraires »). Onglet Suivi refondu (filtres par type d'action, défaut « Appels », actions rattachables à un bien via `journal.bien_id`). Badges critères corrigés sur les listes Clients + Recherche en cours (lecture depuis `recherches`). En-têtes de blocs de la fiche bien publique en étiquette dorée « à cheval ». Détails en §12.

---

## 0. IDENTITÉ & VISION

| Champ | Valeur |
|---|---|
| Fondateur | Alexandre ROGELET |
| Entreprise | Emilio Immobilier |
| Email | arogelet@emilio-immo.com |
| Téléphone | 06 58 95 76 32 |
| Activité | Agence immobilière — Paris & 92 (vente + chasse immobilière) |

### Contexte métier
Emilio Immobilier est une agence immobilière qui fait de la **vente classique** (mandats vendeurs, mise en vente de biens) et de la **chasse immobilière** (mandats de recherche pour acquéreurs). Un client peut être vendeur, acheteur, ou les deux.

### Pourquoi ce CRM custom
Le CRM actuel (Immofacile) ne convient pas en termes d'UX et de design. L'objectif est de **remplacer Immofacile** par ce CRM sur mesure, beau, fluide et adapté au workflow réel de l'agence. Immofacile est conservé **uniquement pour la diffusion portails** car ces portails nécessitent des partenariats techniques non reproductibles par un développeur indépendant.

### Périmètre du CRM
- **Gestion clients** : acquéreurs, vendeurs, ou les deux — avec critères de recherche (acquéreurs) et biens en mandat (vendeurs)
- **Gestion biens** : biens sourcés (pour la chasse) + biens en mandat (propres à l'agence)
- **Visites, transactions, suivi complet** du cycle de vie
- **Communication** : mails Mailjet + fiches publiques visuelles
- **Dashboard & statistiques**
- ❌ **PAS de diffusion portails** — reste sur Immofacile

### Ce qui n'a aucun rapport
Ce CRM est indépendant de Verimo (SaaS d'analyse) et Tonton/Emilio Immo (réseaux sociaux).

---

## 1. STACK TECHNIQUE

| Service | Usage | Statut |
|---|---|---|
| Next.js 16 + TypeScript | Framework frontend | ✅ Déployé |
| Vercel | Hébergement | ✅ Actif |
| Supabase | Base de données + Storage | ✅ Connecté |
| GitHub | Repo source | ✅ emilio92100/emilio-immo-chasseimmo |
| Claude API (Anthropic) | Extraction texte + reformulation | ✅ Clé configurée Vercel |
| Mailjet | Email transactionnel | ✅ Configuré + DNS validé |
| geo.api.gouv.fr | Autocomplétion villes/communes | ✅ Intégré |
| api-adresse.data.gouv.fr | Autocomplétion adresse client (création) | ✅ Intégré (V3) |

**URL prod :** https://emilio-immo-chasseimmo.vercel.app
**Polices :** Plus Jakarta Sans (titres) + DM Sans (corps) + Inter (page publique bien)

### Supabase
- Project ID : eutxmrdcykztjdyydmuo
- Bucket Storage : `photos-biens` (public) ✅
- Env vars Vercel : NEXT_PUBLIC_SUPABASE_URL ✅ · NEXT_PUBLIC_SUPABASE_ANON_KEY ✅ · ANTHROPIC_API_KEY ✅ · SUPABASE_SERVICE_ROLE_KEY ✅ · **MAILJET_API_KEY ✅** · **MAILJET_API_SECRET ✅** · **MAILJET_FROM_EMAIL ✅** · **MAILJET_FROM_NAME ✅** · **NEXT_PUBLIC_SITE_URL ✅**

### Mailjet — Configuration (session 26 mai 2026)
- Domaine `emilio-immo.com` validé dans Mailjet ✅
- Adresse d'envoi `arogelet@emilio-immo.com` validée et opérationnelle (envois en prod OK)
- **DNS OVH configurés** :
  - TXT validation domaine : `mailjet._57401e37`
  - SPF (type TXT, pas SPF !) : `v=spf1 include:mx.ovh.com include:spf.mailjet.com -all`
  - DKIM : `mailjet._domainkey`
- Coexistence avec Roundcube OVH : maintenue via `include:mx.ovh.com`
- ⚠️ **Piège DNS résolu** : OVH avait par défaut un type **SPF** (déprécié RFC 7208) — recréer en **TXT** pour que Mailjet le reconnaisse

### Délivrabilité Mailjet — RÉSOLU (session 2 juin 2026)
- **DMARC ajouté** dans OVH (formulaire type DMARC → enregistre un TXT sur `_dmarc`) : `v=DMARC1; p=none; pct=100; rua=mailto:arogelet@emilio-immo.com; sp=none; aspf=r`
- **Suivi désactivé** dans `/api/send-mail` (`TrackOpens: 'disabled'` + `TrackClicks: 'disabled'`) → supprime pixel de tracking + réécriture des liens = moins de signaux "Promotions"
- CNAME `bnc3` volontairement **non ajouté** (inutile sans tracking)
- **mail-tester.com = 9,9/10** (SPF/DKIM/DMARC tous verts). Reste éventuel Principal vs Promotions = dépend du comportement client, pas d'un défaut technique.

### Design System
- Navy : `#1a2332` · Or : `#c9a84c` · Fond : `#f8fafc`
- Fiche bien publique : fond crème `#f7f4ed`, arrondis 16-20px (style Airbnb premium)
- Animations modals : fadeIn 0.18s + slideUp 0.22s cubic-bezier(0.34,1.56,0.64,1)

---

## 2. TABLES SUPABASE

`clients`, **`recherches` 🆕**, `biens`, `visites`, `transactions`, `relances`, `envois`, `journal`, `partenaires`, `parametres`

### 🆕 Table `recherches` (V3.0 — 30 mai 2026)
**Le niveau intermédiaire central de l'architecture.** Un client a une ou plusieurs recherches. Tous les **critères de recherche** vivent désormais ici (plus sur `clients`).
- Identité : `id`, `client_id` (FK→clients, CASCADE), `nom` (déf. "Recherche principale"), `active`
- Critères bien : `type_bien` (texte, multi joint par virgule), `budget_min/max`, `surface_min/max`, `nb_pieces_min/max`, `chambres_min`, `surface_sejour_min`, `secteurs` (text[])
- Critères fins : `etage_min/max`, `rdc_exclu`, `dernier_etage`, `dpe_max`, `annee_construction_min`, `etat_souhaite`, `exposition_souhaitee` (multi joint par virgule)
- Équipements : `parking`, `cave`, `balcon`, `terrasse`, `jardin`, `ascenseur`, `gardien`, `interphone`, `digicode`
- Profil d'achat : `urgence`, `financement`, `apport`
- Mandat : `sans_mandat`, `mandat_date_signature`, `mandat_duree`, `mandat_honoraires`, `mandat_date_expiration`
- `notes` (= "Précisions sur la recherche"), `created_at`, `updated_at`

**`recherche_id` ajouté aux 6 tables liées** : `biens`, `visites`, `transactions`, `envois`, `relances` (CASCADE) et `journal` (SET NULL). Tout le contenu d'un dossier est rattaché à une recherche.

Fichier SQL : `migration_recherches.sql` (exécuté en prod le 30 mai — table créée, données migrées : chaque client existant a reçu sa "Recherche principale" avec ses critères recopiés, tous biens/visites/envois rattachés, 0 orphelin).

### 🆕 Colonnes clients — propriétaire/locataire (V3.0)
`statut_occupation` (proprietaire/locataire/heberge/autre), et si propriétaire : `bien_actuel_type`, `bien_actuel_surface`, `bien_actuel_valeur`, `bien_actuel_a_vendre` (= **mandat de vente potentiel**), `bien_actuel_notes`.
Fichier SQL : `migration_clients_occupation.sql`

### Colonnes clients étendues (V2.x — désormais DÉPRÉCIÉES pour les critères)
chambres_min, parking, balcon, terrasse, jardin, cave, ascenseur, gardien, interphone, digicode, rdc_exclu, dernier_etage, etage_min, dpe_max, annee_construction_min, + (V2.2) etage_max, etat_souhaite, exposition_souhaitee, surface_sejour_min, urgence, financement, apport.
⚠️ **Ces colonnes existent toujours sur `clients` (filet de sécurité, non supprimées) mais ne sont plus ni lues ni écrites** — la source de vérité des critères est maintenant `recherches`. Nettoyage à planifier plus tard.

### 🆕 Colonnes biens étendues (session 26 mai 2026)
Migration SQL exécutée pour ajouter à la table `biens` :
- **DPE/GES** : `ges`, `dpe_conso` (kWh/m²/an), `ges_emissions` (kg CO₂/m²/an)
- **Caractéristiques** : `exposition`, `nb_salles_bain`, `nb_wc`, `etage_total`, `annee_construction`, `quartier`, `etat_general`, `traversant`
- **Énergie** : `chauffage`, `source_energie`
- **Surfaces annexes** : `surface_balcon`, `surface_terrasse`, `surface_jardin`
- **Financier** : `charges_trimestrielles`, `taxe_fonciere`
- **Équipements booléens** : `balcon`, `terrasse`, `cave`, `ascenseur`, `gardien`, `cuisine_equipee`, `climatisation`, `jardin`
- **Divers** : `nb_lots`

Fichier SQL : `migration_biens.sql` à la racine du repo

### Format secteurs en BDD
`"Parchamp-Albert Kahn (Boulogne-Billancourt)"` → groupés par ville

### Table envois — types
- `mail_libre` : mail texte simple sans biens
- `envoi_bien` : envoi d'un seul bien
- `selection_biens` : envoi de plusieurs biens
- `compte_rendu_visite` : format `"Avis : 🔥 ... | Note : ⭐⭐⭐ | commentaire"` (pipe)

### 🆕 Colonne `journal.bien_id` (V3.2)
Une action de suivi (journal) peut être rattachée à un bien. Colonne `bien_id` uuid → `biens(id)` **ON DELETE SET NULL** (supprimer un bien ne supprime pas l'historique, le lien se vide) + index `idx_journal_bien_id`. Fichier SQL : `migration_journal_bien.sql`. Renseignée via le sélecteur « 🏠 Concerne un bien » de la modale « Ajouter une action » ; affichée en pastille dorée dans la timeline Suivi. `saveAction` fait un insert direct dans `journal` (avec `recherche_id`) au lieu de passer par `addJournal`.

---

## 3. STRUCTURE FICHIERS

```
src/
├── app/
│   ├── api/
│   │   ├── extract-bien/route.ts
│   │   ├── parse-texte-bien/route.ts       # prix = prix affiché en gros, jamais hors honoraires (V3.2)
│   │   ├── reformuler-bien/route.ts        # 🆕 V3.2 reformulation IA dédiée (retire confrère)
│   │   ├── upload-photos/route.ts
│   │   └── send-mail/route.ts           # + recherche_id stampé sur envois (V3)
│   └── bien/
│       ├── layout.tsx
│       └── [id]/
│           ├── page.tsx                 # REFONTE premium 1 colonne (V3.1) · en-têtes étiquette dorée à cheval (V3.2)
│           ├── PhotoCarousel.tsx        # + plein écran lightbox flèches/clavier (V3.1)
│           └── AboutPliable.tsx         # 🆕 "À propos" pliable (Lire la suite) — client component
├── components/
│   ├── clients/Clients.tsx              # création refondue en wizard 3 étapes + multi-recherches (V3)
│   ├── fiche/FicheClient.tsx            # ~2500 lignes — sélecteur recherche, onglet Suivi, critères→recherches (V3)
│   ├── shared/SecteurPicker.tsx         # 🆕 sélecteur secteurs partagé (création + édition)
│   ├── layout/
│   └── pages/
├── lib/
│   ├── supabase.ts                      # + type Recherche, champs propriétaire (V3)
│   └── secteurs.ts                      # 🆕 données QUARTIERS + recherche commune geo.api.gouv
├── migration_biens.sql
├── migration_clients_criteres.sql       # 🆕 V2.2 (état/expo/séjour/étage max/urgence/financement/apport)
├── migration_recherches.sql             # 🆕 V3.0 (table recherches + migration données)
├── migration_clients_occupation.sql     # 🆕 V3.0 (propriétaire/locataire)
└── migration_journal_bien.sql           # 🆕 V3.2 (journal.bien_id → action liée à un bien)
```

---

## 4. FONCTIONNALITÉS LIVRÉES

### Fiche Client — Structure
- **Header** : avatar (cercle + initiale + anneau statut) · Contact inline cliquable · KPIs · Bouton 📤 Envoyer (popup) · Relance J+5 · Action · Ajouter un bien
- **🆕 Sélecteur « Recherche active ▾ »** (V3) : menu déroulant en haut de fiche pour basculer entre les recherches du client, en créer une nouvelle (prompt nom), renommer, ou supprimer (🗑️ par recherche, visible si ≥2 ; suppression cascade biens/visites/envois avec confirmation ; impossible de supprimer la dernière). Se ferme au clic extérieur.
- **Bloc critères** (lit la recherche active, plus `client.*`)
- **Mandat compact** à droite (gère `sans_mandat`)
- **🆕 Onglets** : Biens / Visites / Transaction / **Suivi** — tous filtrés sur la recherche active, avec animation douce au changement d'onglet et de recherche
- **🆕 Onglet Suivi** (V3, refondu V3.2) : fusion de Historique + Journal. Timeline unique avec **filtres par type d'action** alignés sur la modale « Ajouter une action » : `Tout · 📞 Appels · 🤝 RDV · 📝 Notes · 🔔 Relances · ✉️ Communications · 🔄 Système`, chacun avec son compteur. **Filtre par défaut = 📞 Appels** (usage principal). `✉️ Communications` = envois + journal `email_libre`/`envoi_externe` ; `🔄 Système` = events auto (statut_change, bien_ajoute…). Déduplication : les types de journal faisant doublon avec les envois (`mail_envoye`, `envoi_bien`, `visite_effectuee`) sont exclus. Une action peut être **rattachée à un bien** (`journal.bien_id`) → pastille dorée du bien dans la timeline. État vide contextuel selon le filtre actif.

### Onglet Biens
- Ajout URL (Claude HTML) ou copier-coller texte
- Photos → Supabase Storage permanentes
- Drag & drop réordonnement
- **Reformulation IA de la description** (V3.2) : endpoint dédié `/api/reformuler-bien` (et non plus `parse-texte-bien`, qui était conçu pour *conserver* le texte). Lancée **automatiquement à la création** d'un bien (collage texte ET URL) ET via le bouton ✨ dans la fiche. Le prompt retire le nom du confrère/agence (+ tél, email, réf), supprime les formules commerciales, garde fidèlement le statut « compris dans le prix » / « en sus » **par élément** (sans le transférer ni l'inventer), et ne réécrit jamais le prix/honoraires.
- **🆕 Formulaire d'ajout/édition refondu en 7 sections** :
  - 📍 Identification (titre, type, source, ville, CP, quartier)
  - 📐 Caractéristiques (surface, pièces, chambres, sdb, wc, étage/total, année, expo, état)
  - ✨ Équipements (chips cliquables — parking/ascenseur/cave/balcon/terrasse/jardin/gardien/cuisine éq./clim/traversant)
  - 🔋 Performance énergétique (DPE + conso, GES + émissions, chauffage, source énergie)
  - 💰 Prix & Charges (prix vendeur, commission, prix FAI auto, prix/m² auto, charges trim, taxe foncière)
  - 🏢 Agence / Vendeur
  - 📝 Description
- **🆕 Compte-rendu de visite affiché sous le bien (V3.1 — 2 juin)** : dès qu'un bien a une visite `effectuee`, son CR s'affiche directement dans la liste de l'onglet Biens (encadré vert doux : date, note ⭐/5, pastille avis client, commentaire). Plus besoin d'aller dans l'onglet Visites. Affiche le **dernier** CR + compteur si plusieurs visites. Table de correspondance `AVIS_CR` dans FicheClient.

### 🆕 Envoi de mails (session 26 mai 2026)
Tous branchés sur Mailjet via `/api/send-mail`.

**4 modes d'envoi** :

1. **PageMail** (page "Nouveau mail" globale) : mode `libre`
   - Mail texte avec signature, sans bien
   - Sélection multi-clients

2. **Fiche client → 📤 Envoyer (à côté d'un bien)** : mode `unique`
   - Un bien pré-sélectionné
   - Mail avec carte du bien + bouton "Consulter le bien"

3. **Fiche client → 📤 Envoyer (haut) → Sélection de biens** : mode `multi`
   - Popup avec checkboxes (biens non refusés pré-cochés)
   - Boutons "Tout sélectionner / désélectionner"

4. **Fiche client → 📤 Envoyer (haut) → Mail libre** : mode `libre`

**API `/api/send-mail`** accepte : `client_ids`, `objet`, `corps`, `biens_ids` (optionnel), `mode` (`libre|biens`), `destinataires_override`.
Trace dans `envois` + `journal` après succès Mailjet.

**🆕 Template mail refondu (V3.1 — 2 juin 2026)** dans `buildHtml` :
- **Une seule "feuille" blanche unifiée** sur fond beige `#e7e1d4` (en-tête navy + logo → message → annonce(s) → pied navy, tout lié). Séparations douces (fine barre dorée centrée, filets légers entre biens). ⚠️ Important : les messageries (Gmail) **suppriment les box-shadow** → on sépare par le **contraste** (feuille blanche sur beige), jamais par l'ombre.
- **Logo dans l'en-tête** via `${SITE_URL}/logo_high_resolution_white.png` (repli sur l'alt "Emilio Immobilier" si images bloquées au 1er envoi).
- 1 bien = grand visuel + stats + prix + **bouton "Consulter le bien" pleine largeur** (corrige le bouton tassé sur mobile). Plusieurs biens = liste photo-gauche + lien "Consulter".
- **Textes par défaut reformulés** (FicheClient single + multi, et modèle "Sélection de biens" de PageMail) : ton "Suite à votre projet de recherche, je suis heureux de vous présenter…", ordre **visite → questions → retour pour affiner**.
- Suivi désactivé (cf. §1 délivrabilité).

### 🆕 Fiche bien publique — `/bien/[id]` (REFONTE premium V3.1 — 2 juin 2026)
Page publique accessible à toute personne ayant le lien (pas d'auth).
**Refonte complète** : design premium navy/or sur fond crème `#f3eee3`, chaque section en **carte blanche détachée** (ombre douce). **En-têtes de blocs (V3.2)** : étiquette dorée « à cheval » sur le bord supérieur de la carte (composant `SectionHead` en pastille absolue `top:-16` + style `CARD_SEC` = `position:relative`, `paddingTop:40`, `marginTop:36` pour ne pas chevaucher le bloc du dessus).

⚠️ Changement de layout majeur : passage de 2 colonnes (sidebar sticky) à **UNE seule colonne centrée (max 900px)** — la sidebar laissait un grand vide à droite quand le contenu était long.

Sections (de haut en bas) :
- Header navy avec **logo blanc agrandi** (`/logo_high_resolution_white.png`, hauteur 56px) + badge "SÉLECTION PRIVÉE"
- Titre + localisation (📍 or)
- Carrousel photos `PhotoCarousel.tsx` (nav, compteur, dots) — **clic sur une photo = plein écran** (image en grand, flèches ‹ ›, compteur, fermeture croix/clic/Échap, navigation clavier ←/→). La galerie "Voir tout" ouvre aussi le plein écran au clic d'une vignette. Badge "Coup de cœur" **supprimé**.
- **Barre prix pleine largeur** sous les photos (prix FAI + prix/m² à gauche · boutons "Demander une visite" + téléphone à droite ; passe en colonne sur mobile)
- Carte **Infos rapides** (icônes or au-dessus : surface, pièces, chambres, étage, expo ; passe en grille 3 colonnes sur mobile)
- Carte **À propos** : texte découpé en paragraphes + **"Lire la suite" replié par défaut** (composant `AboutPliable.tsx`, fondu en bas)
- Carte **Équipements** (pastilles dorées + icône)
- Carte **Performance énergétique** (DPE/GES badges colorés + chauffage/énergie)
- Carte **Informations complémentaires** (icône or par ligne : année, état, charges, taxe)
- Section contact navy (avatar AR + nom + CTA tel/mail)
- Footer navy avec **logo agrandi** (44px)

✅ (V3.2 — RÉSOLU) Le nom du confrère source (ex. "Hosman vous propose…") est désormais retiré automatiquement par la reformulation IA déclenchée à la création du bien.

### 🆕 Parsing texte amélioré (`/api/parse-texte-bien`)
Prompt Claude enrichi pour extraire :
- DPE/GES avec conso/émissions, exposition, nb sdb/wc, étage/total, année construction
- Chauffage, source énergie, charges trimestrielles, taxe foncière
- État général, équipements booléens, quartier, surfaces balcon/terrasse

Post-traitement regex pour combler les champs souvent oubliés par l'IA (DPE/GES par lettre, conso kWh, émissions kg CO₂, charges, taxe foncière).

### Autres onglets
- **Visites** : À venir / Effectuées (avec CR : étoiles, avis, commentaire)
- **Transaction** : 5 étapes, contre-offres détaillées
- **Suivi** (ex-Historique + Journal, fusionnés en V3) : voir structure fiche ci-dessus

### Pages principales
- **Mes Clients** · **Recherche en cours** · **Visites globale**
- **Nouveau mail** : 6 modèles pré-rédigés (dont "Sélection de biens"), tous clients searchables

---

## 5. RÈGLES D'AFFICHAGE FIGÉES

### Min/Max
- `32–80m²` (les deux), `min 32m²` ou `max 80m²` (un seul)

### Prix
- Carte bien : Acquéreur (gros, doré) + vendeur+commission (petit, gris)
- Fiche publique `/bien/[id]` : Prix FAI uniquement (vendeur masqué)

### Jours mandat
- "X jours restants" · "Expiré" · Badge alerte si < 15j

### Modals
- fadeIn+slideUp · overlay blur
- **Modales de saisie NON fermables au clic extérieur** (contact, mandat, bien, création client) — fermeture via ✕/Annuler uniquement
- Menu déroulant « Recherche active » : se ferme au clic extérieur (overlay invisible)

---

## 6. API ROUTES

| Route | Fonction | Prérequis |
|---|---|---|
| `/api/extract-bien` | URL → Claude analyse HTML → JSON | ANTHROPIC_API_KEY |
| `/api/parse-texte-bien` | Texte → Claude structure (enrichi) → JSON. **Prix = prix affiché en gros, jamais le « hors honoraires »** (V3.2) | ANTHROPIC_API_KEY |
| `/api/reformuler-bien` 🆕 | Description → Claude reformule (retire confrère, garde compris/en sus, ne touche pas au prix) → texte | ANTHROPIC_API_KEY |
| `/api/upload-photos` | URLs externes → Supabase Storage | SUPABASE_SERVICE_ROLE_KEY |
| `/api/send-mail` | Mailjet envoi mail libre ou avec biens | MAILJET_API_KEY + SECRET |
| `/api/bien-from-bookmarklet` | ⚠️ Dormant (bookmarklet Chrome abandonné) | — |

**SeLoger** : bloqué Cloudflare → copier-coller recommandé. LeBonCoin/PAP/Orpi : OK.

### Limites copier-coller SeLoger
- **DPE en image SVG** : extrait par regex désormais, sinon correction manuelle dans formulaire enrichi
- **Biens similaires en bas** : texte tronqué à ~12000 chars

---

## 7. À FAIRE — PRIORITÉS

### ✅ Priorité 1 — Finitions envoi mail (RÉSOLU — 2 juin 2026)

**1. Délivrabilité Mailjet** ✅ — DMARC ajouté, suivi désactivé, mail-tester 9,9/10 (détail §1 « Délivrabilité Mailjet — RÉSOLU »).

**2. Template mail** ✅ — refondu en une feuille unifiée premium, logo intégré, bouton pleine largeur, textes par défaut reformulés (détail §4 « Template mail refondu »). À retester sur Gmail/iOS/Outlook à chaque évolution.

**3. Fiche bien publique mobile** ✅ — refonte 1 colonne centrée (plus de vide à droite), carrousel + plein écran tactile, "À propos" pliable, stats en grille mobile, logo agrandi (détail §4 « Fiche bien publique »).

### 🟠 Priorité 2 — Génération PDF sélection de biens
- jsPDF + html2canvas (⚠️ **PAS encore dans package.json** — à installer ; la note précédente était erronée)
- Page de garde + fiche par bien + footer
- Note conseiller par bien
- Sauvegarde PDF Storage + relance J+5 auto
- **Joindre le PDF aux mails Mailjet** (attachment)

### 🟠 Priorité 3 — Extension CRM complet (vendeurs)
- Fiche client unifiée vendeur/acheteur
- Gestion des biens en mandat (≠ biens sourcés)
- Pipeline de vente

### 🟡 Priorité 4 — Enrichissements
- **Matching biens → clients** : scoring de compatibilité (voir §14 pour le plan détaillé)
- **Relances automatiques** post-envoi mail/PDF
- **KPI "Biens présentés"** incrémenté à l'envoi
- **Dashboard enrichi** : KPIs, graphiques, pipeline, CA
- **Page connexion** : Supabase Auth

### 🟢 V3
- PDF C-R visites · PDF Présentation services
- Export Excel mensuel/annuel
- Extension Chrome (photos SeLoger)
- Multi-utilisateur
- Actions groupées
- Corbeille archivage J+30
- Stats "Mon activité"

---

## 8. POINTS DE VIGILANCE TECHNIQUE

- **SeLoger bloqué** : toujours copier-coller
- **Photos Storage** : SUPABASE_SERVICE_ROLE_KEY + bucket `photos-biens` public
- **ANTHROPIC_API_KEY** : requise extraction + reformulation
- **MAILJET_API_KEY/SECRET** : requises pour `/api/send-mail` (sinon 500)
- **saveCompteRendu** : insère dans `visites` ET `envois`
- **SRU** : alerte J+10 après compromis
- **Drag & drop photos** : useRef (pas objet littéral)
- **🆕 SPF DNS** : type **TXT** (pas SPF déprécié) pour Mailjet
- **🆕 Page bien publique** : layout dédié `src/app/bien/layout.tsx` qui override `overflow: hidden` du CSS global

---

## 9. WORKFLOW ENVOI MAIL (V2.1 — Mailjet branché)

### Envoi simple bien
1. Fiche client → 📤 Envoyer (à côté d'un bien)
2. Pré-rempli (objet, corps, destinataires = client.emails)
3. Modifiable
4. Envoi → `/api/send-mail` → Mailjet
5. Trace dans `envois` (type `envoi_bien`) + `journal`
6. Mail HTML reçu avec carte bien + bouton "Consulter le bien" → `/bien/[id]`

### Envoi sélection
1. Fiche client → 📤 Envoyer (en haut) → Sélection de biens
2. Popup avec checkboxes (biens non refusés pré-cochés)
3. Modifier sélection + objet/corps
4. Envoi → toutes les cartes dans le mail

### Mail libre
- PageMail : multi-clients, texte simple
- FicheClient → 📤 Envoyer → Mail libre : un client, texte simple

---

## 10. HORS PÉRIMÈTRE

- Diffusion portails → reste Immofacile
- Scraping automatique
- Suppression filigrane photos
- Location (vente uniquement)
- Signature électronique
- Mode hors ligne

---

## 11. DISCUSSIONS HORS-PROJET — Site public Emilio Immo

### SEO local par arrondissement (12 mai 2026)
- Stratégie SEO sur le site public, pas le CRM. Pages dédiées par arrondissement, contenu unique. Délai Google : 3-6 mois.
- Google Maps : adresse physique vérifiée requise (coworking 50-150€/mois, domiciliation, etc.). Un seul profil Google Business par adresse.
- Alternative payante : Google Ads géolocalisé.

---

## 12. HISTORIQUE DES SESSIONS

### Session 12 mai 2026 (V1.2)
- Journal anti-bruit (saveContact, saveCriteres, saveMandat, changeStatut)
- Bug fixes : `agence_tel` manquant dans INSERT saveBien, `nb_chambres` manquant dans UPDATE saveFicheBien
- UI : padding-bottom contentWrap 16→80px
- Bookmarklet Chrome abandonné (3 fichiers laissés dormants)

### Session 26 mai 2026 (V2.1) — Envoi mail + Fiche bien publique
- **Mailjet branché** : DNS OVH configurés (TXT validation + SPF en TXT correct + DKIM), domaine validé
- **API `/api/send-mail`** créée avec support multi-mode (libre/biens, unique/multi)
- **4 modes d'envoi** branchés : PageMail (libre), FicheClient bien unique, FicheClient sélection multi, FicheClient mail libre
- **Page publique `/bien/[id]`** créée avec layout dédié, style Airbnb premium
- **PhotoCarousel** : composant client avec galerie modale plein écran
- **Migration SQL biens** : 24 nouvelles colonnes (DPE/GES détaillés, expo, charges, taxe, équipements...)
- **Parsing texte Claude enrichi** + post-traitement regex
- **Formulaire d'ajout/édition bien refondu** en 7 sections claires
- **Découverte importante** : OVH crée SPF en type "SPF" déprécié → recréer en TXT pour que Mailjet le reconnaisse
- **Bug fix scroll** : layout dédié `bien/layout.tsx` qui override `overflow: hidden` global

### Session 30 mai 2026 (V3.0) — Architecture multi-recherches + refonte création
**Gros chantier validé en prod.** Voir §13 pour les détails complets.
- **Table `recherches`** créée + `recherche_id` sur 6 tables + migration des données existantes (0 perte, 0 orphelin vérifié). Critères déplacés de `clients` vers `recherches`.
- **FicheClient** : sélecteur « Recherche active ▾ » (créer/renommer/supprimer), tous onglets filtrés par recherche active, critères + mandat lus/écrits sur la recherche, inserts (biens/visites/transactions/envois/relances) stampés `recherche_id`.
- **Onglet Suivi** : fusion Historique + Journal (timeline + 3 filtres, déduplication, journal dégraissé).
- **Formulaire de création refondu en wizard 3 étapes** (Identité / Recherche / Profil & mandat) : pop-up animé, transitions entre étapes, menus déroulants stylés (chevron doré, fond blanc), nom non obligatoire, mandat optionnel (toggle "sans mandat").
- **Champs propriétaire/locataire** (statut occupation + bien possédé = mandat de vente potentiel).
- **Enrichissement critères** (V2.2, même session) : état souhaité, exposition (multi-choix), surface séjour min, étage max, urgence, financement, apport. Type de bien en multi-sélection (maison + appartement possibles).
- **Composant partagé `SecteurPicker`** + `lib/secteurs.ts` : autocomplétion ville/CP (geo.api.gouv) + quartiers prédéfinis, message d'aide "cliquez sur Toute la ville". Adresse client en autocomplétion (api-adresse.data.gouv).
- **Mail** : phrase de bas corrigée ("projet de recherche immobilière"), carte bien responsive sur mobile.
- **Modales de saisie** non fermables au clic extérieur (contact, mandat, bien, création).

### Session 2 juin 2026 (V3.1) — Refonte fiche bien publique + mail + CR dans l'onglet Biens
- **Délivrabilité Mailjet finalisée** : DMARC (TXT sur `_dmarc`) + suivi désactivé dans `/api/send-mail` → mail-tester 9,9/10. CNAME `bnc3` écarté (inutile sans tracking).
- **Refonte complète de `/bien/[id]`** en premium navy/or, **une seule colonne centrée** (max 900px) — supprime le grand vide à droite de l'ancienne sidebar. Chaque section en carte blanche détachée + en-tête à icône. Barre prix pleine largeur. Logo **agrandi** en haut (56px) et en bas (44px).
- **`PhotoCarousel`** : ajout du **plein écran** (clic sur une photo → image en grand + flèches ‹ ›, compteur, clavier ←/→/Échap). La galerie "Voir tout" ouvre aussi le plein écran. Badge "Coup de cœur" retiré.
- **`AboutPliable.tsx`** (nouveau composant client) : "À propos" découpé en paragraphes + "Lire la suite" replié par défaut (utile mobile).
- **Mail refondu** en une feuille unifiée (en-tête/message/annonce/pied liés, séparations douces), logo dans l'en-tête, bouton "Consulter" pleine largeur. Leçon clé : Gmail supprime les ombres → séparer par contraste (blanc sur beige), pas par box-shadow.
- **Textes par défaut des mails reformulés** (single + multi FicheClient + modèle PageMail) : ton chaleureux, ordre visite → questions → retour.
- **Compte-rendu de visite affiché sous chaque bien** dans l'onglet Biens (encadré vert : date, ⭐/5, avis, commentaire) — évite l'aller-retour vers l'onglet Visites. Le système visites/CR existait déjà (table `visites` : note_etoiles, commentaire, avis_client) ; seul l'affichage a été ajouté, **aucune migration SQL**.
- **Aucun changement de base de données cette session.**

### Session 30 juin 2026 (V3.2) — Reformulation IA, prix sourcé, Suivi refondu, badges, en-têtes fiche bien
**Pas de changement d'architecture. Une seule migration SQL (`journal.bien_id`).**
- **Reformulation IA fiabilisée** : nouvel endpoint dédié `/api/reformuler-bien`. Avant, le bouton ✨ tapait sur `parse-texte-bien` (conçu pour *conserver* le texte) → il ne reformulait pas. Le nouveau prompt retire le nom du confrère/agence (+ tél, email, réf), supprime les formules commerciales, garde fidèlement « compris dans le prix » / « en sus » **par élément** (sans transfert ni invention), ne réécrit pas le prix/honoraires. **Reformulation automatique à la création** du bien (collage texte ET URL), en plus du bouton ✨ dans la fiche.
- **Prix sourcé = prix affiché en gros** : prompt `parse-texte-bien` corrigé pour toujours prendre le prix annoncé (FAI), jamais le « hors honoraires » même si la ventilation net + commission est détaillée. Raison métier : Alexandre pose SA commission par-dessus (inter avec le confrère, ou mandat de recherche s'il refuse).
- **Honoraires** : à l'ouverture d'une fiche bien, le champ commission ne se force plus à 3,5 % (`commission_val: b.commission_val ?? ''`) → reste vide/0, prix acquéreur = prix vendeur tant que non saisi. (À la création, c'était déjà 0.)
- **Action de suivi rattachable à un bien** : migration `migration_journal_bien.sql` (`journal.bien_id` uuid → biens, ON DELETE SET NULL + index). Sélecteur « 🏠 Concerne un bien » dans la modale, insert direct (avec `recherche_id`), pastille dorée du bien dans la timeline.
- **Onglet Suivi refondu** : filtres = types d'action (`Tout · 📞 Appels · 🤝 RDV · 📝 Notes · 🔔 Relances · ✉️ Communications · 🔄 Système`) avec compteurs, **défaut = Appels**, état vide contextuel. Remplace les anciens filtres Communications/Événements.
- **Badges critères corrigés** (`Clients.tsx` + `PageRecherche.tsx`) : les clients créés en V3 (critères dans `recherches`, plus dans `clients.*`) n'affichaient aucun badge dans les listes. Les deux listes fusionnent désormais les critères de la **recherche active** (sinon la 1ère) du client pour le récap.
- **Fiche bien publique `/bien/[id]`** : en-têtes de blocs en **étiquette dorée « à cheval »** sur le bord supérieur (Option 1 retenue parmi 4 propositions en preview) — `SectionHead` en pastille absolue, style `CARD_SEC` (`position:relative`, `paddingTop:40`, `marginTop:36`).
- **Fichiers** — NEW : `api/reformuler-bien/route.ts`, `migration_journal_bien.sql`. MODIF : `api/parse-texte-bien/route.ts`, `components/fiche/FicheClient.tsx`, `components/clients/Clients.tsx`, `components/pages/PageRecherche.tsx`, `app/bien/[id]/page.tsx`.

### ⚠️ POINT SÉCURITÉ IMPORTANT (soulevé le 30 mai)
**RLS désactivé sur toutes les tables Supabase.** N'importe qui avec la clé anon publique (visible côté client) peut lire/modifier toutes les données clients. Risque RGPD/confidentialité réel. **À traiter en session dédiée** : activer le RLS sur toutes les tables d'un coup avec les bonnes policies, puis vérifier que l'app fonctionne. Même nature que la faille identifiée sur Verimo. La table `recherches` a été créée "without RLS" pour rester cohérente avec l'existant.

### ⏳ Reste à faire en priorité immédiate
1. **Tester en prod** le multi-recherches (créer 2ᵉ recherche, basculer, vérifier non-mélange des biens, suppression).
2. **API d'agrégation d'annonces** (voir §14) : tester essais gratuits Stream Estate / MoteurImmo / Yanport, vérifier couverture Paris/92 + CGU re-stockage/envoi client.
3. **Scoring de compatibilité** (voir §14) : couche 1 (math, gratuit) faisable tout de suite, couche 2 (IA sur description) après branchement API.
4. ~~**Délivrabilité Mailjet**~~ ✅ FAIT (2 juin) : DMARC + suivi désactivé, mail-tester 9,9/10.
5. **RLS** (sécurité, voir ci-dessus).

---

## 13. ARCHITECTURE MULTI-RECHERCHES (V3.0 — référence)

### Modèle
Avant : `Client → biens` (un client = une recherche, critères sur la fiche client).
Maintenant : **`Client → Recherche(s) → biens`**. Un client peut avoir plusieurs recherches parallèles, chacune avec ses critères, biens, visites, envois, transactions.

```
Client (identité, contact, statut, chaleur, propriétaire/locataire)
   └── Recherche 1 « RP Paris 3P »  (budget, secteurs, critères, mandat…)
   │        └── biens / visites / envois / transaction rattachés
   └── Recherche 2 « Invest Lyon »   (autres critères)
            └── ses propres biens / visites / envois
```

### Règles de décision (cadre l'usage)
- **Critères communs quel que soit le type** (ex. maison OU appartement, peu importe, mêmes budget/secteurs) → **une seule recherche**, cocher plusieurs types de bien.
- **Critères différents selon le type** (jardin pour maison, balcon/dernier étage pour appart) → **deux recherches** (une par type). Le formulaire de création affiche un encart d'aide quand >1 type est coché pour le rappeler.

### Affichage
- Liste Clients = **une carte par client** (Option A retenue), pas par recherche. M. Dupont apparaît une fois.
- Bascule entre recherches via **menu déroulant** « Recherche active ▾ » dans la fiche.

### Points techniques clés
- `crit` et `mandat` (états locaux FicheClient) sont **resynchronisés via useEffect** quand `rechercheId` change (lecture depuis `rechercheActive`). États initiaux désormais vides — la recherche active est la source de vérité.
- Alias `cr = rechercheActive || {secteurs:[]}` utilisé dans le bloc d'affichage des critères et du mandat.
- `loadRecherches()` charge les recherches du client ; `load()` charge biens/visites/transaction/envois filtrés sur `recherche_id` (journal reste filtré sur `client_id`).
- Création client (Clients.tsx) : insère le client PUIS crée sa "Recherche principale" avec tous les critères saisis.
- Suppression recherche : cascade SQL (supprime biens/visites/envois/transactions/relances liés), bloquée si c'est la dernière.

---

## 14. PISTES EN COURS — Sourcing annonces & matching (discussions 30 mai 2026)

### API d'agrégation d'annonces (pour sourcer des biens automatiquement)
Objectif : listing temps réel des annonces dans le CRM + import en 1 clic + alertes auto par client, pour réduire le travail manuel de sourcing. Le copier-coller actuel est conservé en secours.

**Faire soi-même le scraping = écarté** : portails (SeLoger/LBC) interdisent le scraping (CGU), défenses anti-bot (Cloudflare), coût/maintenance prohibitifs pour un solo. On achète à une API : le droit d'usage légal + l'infra + la déduplication + du JSON propre.

**Acteurs comparés (mai 2026)** :
- **Stream Estate (ex-Melo.io)** — `docs.stream.estate` / API sur `api.stream.estate` (header `X-API-KEY`). 1500+ sources, déduplication native, **webhooks** (nouvelle annonce, baisse prix, expiration). JSON très riche (prix, surface, pièces, GPS, métro, contact agence, DPE, photos). Concepts : Property (bien unique) / Advert (annonce = 1 publication) / Event (changement) / Search (recherche enregistrée → alertes). Tarif : pay-as-you-go ~0,01€/annonce, Starter ~99€/mois/15000 annonces. API dispo dès le pay-as-you-go. ⚠️ Le comparatif qui le classe n°1 a un conflit d'intérêt déclaré.
- **MoteurImmo** — meilleur rapport qualité/prix pour un chasseur. Dashboard 9/19/39€/mois, 57 plateformes, temps réel, adresse exacte, DVF. API "moins chère du marché", payée à l'annonce, webhook/email. Prix exact après création de compte.
- **Yanport** — **déjà utilisé par Alexandre** pour chercher des biens. Fait aussi du sourcing (produit Agent 360 : veille multi-portails, dédup >95%, alertes temps réel) en plus de l'estimation. A une API. À vérifier côté Alexandre : (1) son offre inclut-elle l'API ? (2) l'API expose-t-elle les annonces elles-mêmes ou seulement les indicateurs de marché ?
- **Fluximmo** — écarté (pas de déduplication).

**Plan recommandé** : tester les dashboards (essais gratuits) sur la zone réelle Paris/92 AVANT de coder, vérifier couverture + fraîcheur + CGU (re-stockage + envoi client en marque blanche autorisés ?), PUIS intégrer l'API du gagnant (clé côté serveur, route `/api/.../search` + bouton importer + mapping JSON→table biens + photos vers Storage + webhooks pour alertes auto).

### Scoring de compatibilité bien ↔ recherche
Afficher un % de compatibilité (et une explication) entre une annonce et les critères d'une recherche.
- **Couche 1 — critères durs (math, gratuit, faisable tout de suite)** : pondération des champs structurés (budget, secteur, pièces, chambres, étage, équipements…). Critères éliminatoires + critères à points. Marche déjà sur les champs structurés.
- **Couche 2 — critères subtils (IA, après branchement API)** : envoyer critères + **notes libres ("Précisions sur la recherche")** + description de l'annonce à Claude pour repérer RDC/expo/état/calme/travaux et scorer + expliquer. Lancée seulement sur les biens ayant passé un seuil en couche 1 (économie d'appels).
- Score final = mélange pondéré couche 1 + couche 2.
- Les notes libres de la recherche sont une **instruction de matching en langage naturel** (ex. "évite RDC et périph, adore les vieux immeubles avec moulures").
- Note granularité secteurs : "Toute la ville" = matching fiable via CP ; "Quartier (Ville)" = matching plus fin, nécessitera de croiser avec GPS de l'annonce.
