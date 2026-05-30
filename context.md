# CONTEXTE PROJET — Emilio Immobilier
## CRM Immobilier sur mesure — Version 3.0
### Mis à jour le 30 mai 2026

> **⚡ Nouveauté majeure V3.0 : architecture multi-recherches.** Un client peut désormais avoir **plusieurs recherches en parallèle** (ex. RP Paris + invest Lyon), chacune avec ses propres critères, biens, visites et envois. Voir §13 pour les détails. Formulaire de création refondu en assistant 3 étapes. Onglets Historique + Journal fusionnés en « Suivi ».

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
- Adresse d'envoi `arogelet@emilio-immo.com` ajoutée (en attente validation par mail Roundcube)
- **DNS OVH configurés** :
  - TXT validation domaine : `mailjet._57401e37`
  - SPF (type TXT, pas SPF !) : `v=spf1 include:mx.ovh.com include:spf.mailjet.com -all`
  - DKIM : `mailjet._domainkey`
- Coexistence avec Roundcube OVH : maintenue via `include:mx.ovh.com`
- ⚠️ **Piège DNS résolu** : OVH avait par défaut un type **SPF** (déprécié RFC 7208) — recréer en **TXT** pour que Mailjet le reconnaisse

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

---

## 3. STRUCTURE FICHIERS

```
src/
├── app/
│   ├── api/
│   │   ├── extract-bien/route.ts
│   │   ├── parse-texte-bien/route.ts
│   │   ├── upload-photos/route.ts
│   │   └── send-mail/route.ts           # + recherche_id stampé sur envois (V3)
│   └── bien/
│       ├── layout.tsx
│       └── [id]/
│           ├── page.tsx                 # responsive mobile corrigé (V3)
│           └── PhotoCarousel.tsx
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
└── migration_clients_occupation.sql     # 🆕 V3.0 (propriétaire/locataire)
```

---

## 4. FONCTIONNALITÉS LIVRÉES

### Fiche Client — Structure
- **Header** : avatar (cercle + initiale + anneau statut) · Contact inline cliquable · KPIs · Bouton 📤 Envoyer (popup) · Relance J+5 · Action · Ajouter un bien
- **🆕 Sélecteur « Recherche active ▾ »** (V3) : menu déroulant en haut de fiche pour basculer entre les recherches du client, en créer une nouvelle (prompt nom), renommer, ou supprimer (🗑️ par recherche, visible si ≥2 ; suppression cascade biens/visites/envois avec confirmation ; impossible de supprimer la dernière). Se ferme au clic extérieur.
- **Bloc critères** (lit la recherche active, plus `client.*`)
- **Mandat compact** à droite (gère `sans_mandat`)
- **🆕 Onglets** : Biens / Visites / Transaction / **Suivi** — tous filtrés sur la recherche active, avec animation douce au changement d'onglet et de recherche
- **🆕 Onglet Suivi** (V3) : fusion de Historique + Journal. Timeline unique avec 3 filtres (Tout / ✉️ Communications / 📌 Événements). Déduplication : les types de journal faisant doublon avec les envois (`mail_envoye`, `envoi_bien`, `visite_effectuee`) sont exclus. Journal dégraissé : ne logue plus les micro-modifs contact/critères/mandat.

### Onglet Biens
- Ajout URL (Claude HTML) ou copier-coller texte
- Photos → Supabase Storage permanentes
- Drag & drop réordonnement
- Bouton ✨ Reformuler description avec IA
- **🆕 Formulaire d'ajout/édition refondu en 7 sections** :
  - 📍 Identification (titre, type, source, ville, CP, quartier)
  - 📐 Caractéristiques (surface, pièces, chambres, sdb, wc, étage/total, année, expo, état)
  - ✨ Équipements (chips cliquables — parking/ascenseur/cave/balcon/terrasse/jardin/gardien/cuisine éq./clim/traversant)
  - 🔋 Performance énergétique (DPE + conso, GES + émissions, chauffage, source énergie)
  - 💰 Prix & Charges (prix vendeur, commission, prix FAI auto, prix/m² auto, charges trim, taxe foncière)
  - 🏢 Agence / Vendeur
  - 📝 Description

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

### 🆕 Fiche bien publique — `/bien/[id]`
Page publique accessible à toute personne ayant le lien (pas d'auth).
**Style Airbnb premium** : fond crème, arrondis 16-20px, sidebar sticky avec prix + CTA.

Sections :
- Header navy avec logo Emilio + badge "SÉLECTION PRIVÉE"
- Titre + localisation + badge "Coup de cœur Emilio"
- Carrousel photos (`PhotoCarousel.tsx`) avec navigation, compteur, dots, galerie modale plein écran
- Infos rapides avec séparateurs verticaux (surface, pièces, chambres, étage, expo)
- Description complète
- Équipements (grid cartes blanches arrondies + icône dorée)
- Performance énergétique (DPE + GES côte à côte avec étiquettes officielles)
- Informations complémentaires (table année/état/charges/taxe)
- Sidebar sticky droite : prix FAI + prix/m² + CTA "Demander une visite" + tel + avatar AR
- Section contact bas
- Footer navy

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
| `/api/parse-texte-bien` | Texte → Claude structure (enrichi) → JSON | ANTHROPIC_API_KEY |
| `/api/upload-photos` | URLs externes → Supabase Storage | SUPABASE_SERVICE_ROLE_KEY |
| `/api/send-mail` | Mailjet envoi mail libre ou avec biens | MAILJET_API_KEY + SECRET |
| `/api/bien-from-bookmarklet` | ⚠️ Dormant (bookmarklet Chrome abandonné) | — |

**SeLoger** : bloqué Cloudflare → copier-coller recommandé. LeBonCoin/PAP/Orpi : OK.

### Limites copier-coller SeLoger
- **DPE en image SVG** : extrait par regex désormais, sinon correction manuelle dans formulaire enrichi
- **Biens similaires en bas** : texte tronqué à ~12000 chars

---

## 7. À FAIRE — PRIORITÉS

### 🔴 Priorité 1 — Finitions envoi mail (en cours)

**1. Améliorer la délivrabilité Mailjet** ⚠️ CRITIQUE
- Les mails arrivent actuellement dans l'**onglet "Promotions" de Gmail**
- Causes possibles : trop d'images, mots commerciaux dans l'objet, ratio texte/HTML, absence de DMARC, présence de boutons type marketing
- Actions à tenter :
  - **Ajouter DMARC** dans DNS OVH : `_dmarc TXT v=DMARC1; p=none; rua=mailto:arogelet@emilio-immo.com; aspf=r`
  - **Ajouter CNAME `bnc3`** pointant vers `bnc3.mailjet.com.` (tracking bounces, comme sur Verimo)
  - **Revoir le template HTML** : réduire les images, augmenter le ratio texte/code, supprimer les boutons trop marketing
  - **Tester sur mail-tester.com** pour obtenir le score de délivrabilité (objectif > 9/10)
  - **Éviter mots-piège** dans l'objet : pas de "GRATUIT", "OFFRE", emojis en début, mots commerciaux
  - **Vérifier SPF strict** : `-all` (déjà fait) plutôt que `~all`
  - Tester d'envoyer depuis une **adresse pro** vraiment validée (attendre validation `arogelet@emilio-immo.com`)
  - Considérer **chauffer le domaine** : envoyer peu de mails au début, monter progressivement

**2. Améliorer l'affichage du mail / template envoyé**
- Le mail HTML actuel a un design simple. À enrichir pour matcher le style Airbnb premium de la fiche bien publique
- Travailler la cohérence visuelle mail ↔ page `/bien/[id]`
- Tester sur Gmail web, iOS Mail, Outlook web

**3. Améliorer la fiche bien publique mobile**
- Vérifier que la navigation tactile du carrousel fonctionne
- S'assurer que la modal "Voir tout" galerie reste utilisable
- Tester le responsive du grid 2 colonnes (sidebar sticky)

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

### ⚠️ POINT SÉCURITÉ IMPORTANT (soulevé le 30 mai)
**RLS désactivé sur toutes les tables Supabase.** N'importe qui avec la clé anon publique (visible côté client) peut lire/modifier toutes les données clients. Risque RGPD/confidentialité réel. **À traiter en session dédiée** : activer le RLS sur toutes les tables d'un coup avec les bonnes policies, puis vérifier que l'app fonctionne. Même nature que la faille identifiée sur Verimo. La table `recherches` a été créée "without RLS" pour rester cohérente avec l'existant.

### ⏳ Reste à faire en priorité immédiate
1. **Tester en prod** le multi-recherches (créer 2ᵉ recherche, basculer, vérifier non-mélange des biens, suppression).
2. **API d'agrégation d'annonces** (voir §14) : tester essais gratuits Stream Estate / MoteurImmo / Yanport, vérifier couverture Paris/92 + CGU re-stockage/envoi client.
3. **Scoring de compatibilité** (voir §14) : couche 1 (math, gratuit) faisable tout de suite, couche 2 (IA sur description) après branchement API.
4. **Délivrabilité Mailjet** (toujours en attente) : DMARC + bnc3 + tests.
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
