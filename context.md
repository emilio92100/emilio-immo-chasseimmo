# CONTEXTE PROJET — Emilio Immobilier
## CRM Immobilier sur mesure — Version 2.1
### Mis à jour le 26 mai 2026

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
| geo.api.gouv.fr | Autocomplétion villes | ✅ Intégré |

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

`clients`, `biens`, `visites`, `transactions`, `relances`, `envois`, `journal`, `partenaires`, `parametres`

### Colonnes clients étendues
chambres_min, parking, balcon, terrasse, jardin, cave, ascenseur, gardien, interphone, digicode, rdc_exclu, dernier_etage, etage_min, dpe_max, annee_construction_min

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
│   │   ├── parse-texte-bien/route.ts    # 🆕 Parsing enrichi (DPE/GES/charges/expo)
│   │   ├── upload-photos/route.ts
│   │   └── send-mail/route.ts           # 🆕 Mailjet (mail libre + biens)
│   └── bien/
│       ├── layout.tsx                   # 🆕 Override overflow CSS global
│       └── [id]/
│           ├── page.tsx                 # 🆕 Fiche bien publique style Airbnb
│           └── PhotoCarousel.tsx        # 🆕 Carrousel photos client
├── components/
│   ├── clients/Clients.tsx
│   ├── fiche/FicheClient.tsx            # ~2350 lignes — formulaire bien étendu
│   ├── layout/
│   └── pages/
│       ├── PageMail.tsx                 # 🆕 Mode 'libre' uniquement
│       ├── PageRecherche.tsx
│       └── ...
├── lib/supabase.ts
└── migration_biens.sql                  # 🆕
```

---

## 4. FONCTIONNALITÉS LIVRÉES

### Fiche Client — Structure
- **Header** : avatar (cercle + initiale + anneau statut) · Contact inline cliquable · KPIs · Bouton 📤 Envoyer (popup) · Relance J+5 · Action · Ajouter un bien
- **Bloc critères** (avant onglets)
- **Mandat compact** à droite
- **Onglets** : Biens / Visites / Transaction / Historique / Journal

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

### Autres onglets (inchangés depuis V1.2)
- **Visites** : À venir / Effectuées (avec CR : étoiles, avis, commentaire)
- **Transaction** : 5 étapes, contre-offres détaillées
- **Historique** : mails envoyés + CR
- **Journal** : anti-bruit (log uniquement si vrai changement)

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
- Critères NON fermable au clic extérieur

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
- jsPDF + html2canvas (déjà dans package.json)
- Page de garde + fiche par bien + footer
- Note conseiller par bien
- Sauvegarde PDF Storage + relance J+5 auto
- **Joindre le PDF aux mails Mailjet** (attachment)

### 🟠 Priorité 3 — Extension CRM complet (vendeurs)
- Fiche client unifiée vendeur/acheteur
- Gestion des biens en mandat (≠ biens sourcés)
- Pipeline de vente

### 🟡 Priorité 4 — Enrichissements
- **Matching biens → clients** : suggérer clients correspondants
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

### ⏳ Reste à faire en priorité immédiate
1. **Délivrabilité Mailjet** : sortir de l'onglet Promotions (DMARC + bnc3 + template + tests)
2. **Améliorer template mail** : aligner sur style Airbnb fiche publique
3. **Valider l'adresse `arogelet@emilio-immo.com`** côté Mailjet (mail de confirmation Roundcube)
