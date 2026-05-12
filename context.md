# CONTEXTE PROJET — Emilio Immobilier
## CRM Immobilier sur mesure — Version 2.0
### Mis à jour le 12 mai 2026

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
Le CRM actuel (Immofacile) ne convient pas en termes d'UX et de design. L'objectif est de **remplacer Immofacile** par ce CRM sur mesure, beau, fluide et adapté au workflow réel de l'agence. Immofacile est conservé **uniquement pour la diffusion portails** (SeLoger, LeBonCoin, Bien'ici, etc.) car ces portails nécessitent des partenariats techniques non reproductibles par un développeur indépendant. À terme, une passerelle de diffusion seule (Ubiflow, Adaptimmo…) pourrait remplacer Immofacile.

### Périmètre du CRM
- **Gestion clients** : acquéreurs, vendeurs, ou les deux — avec critères de recherche (acquéreurs) et biens en mandat (vendeurs)
- **Gestion biens** : biens sourcés (pour la chasse) + biens en mandat (propres à l'agence)
- **Visites, transactions, suivi complet** du cycle de vie
- **Communication** : mails, SMS, PDF de présentation
- **Dashboard & statistiques**
- ❌ **PAS de diffusion portails** — reste sur Immofacile

### Ce qui n'a aucun rapport avec ce projet
Ce CRM est indépendant de Verimo (SaaS d'analyse de documents immo) et de Tonton Immo / Emilio Immo (pages réseaux sociaux). Ce sont des projets distincts.

---

## 1. STACK TECHNIQUE

| Service | Usage | Statut |
|---|---|---|
| Next.js 16 + TypeScript | Framework frontend | ✅ Déployé |
| Vercel | Hébergement | ✅ Actif |
| Supabase | Base de données + Storage | ✅ Connecté |
| GitHub | Repo source | ✅ emilio92100/emilio-immo-chasseimmo |
| Claude API (Anthropic) | Extraction texte + reformulation | ✅ Clé configurée Vercel |
| Mailjet | Email + SMS | ⏳ Clés à configurer |
| geo.api.gouv.fr | Autocomplétion villes | ✅ Intégré |

**URL prod :** https://emilio-immo-chasseimmo.vercel.app
**Polices :** Plus Jakarta Sans (titres) + DM Sans (corps)

### Supabase
- Project ID : eutxmrdcykztjdyydmuo
- Bucket Storage : `photos-biens` (public) ✅ créé
- Env vars Vercel : NEXT_PUBLIC_SUPABASE_URL ✅ · NEXT_PUBLIC_SUPABASE_ANON_KEY ✅ · ANTHROPIC_API_KEY ✅ · SUPABASE_SERVICE_ROLE_KEY ✅

### Design System
- Navy : `#1a2332` · Or : `#c9a84c` · Fond : `#f8fafc`
- Animations modals : fadeIn 0.18s + slideUp 0.22s cubic-bezier(0.34,1.56,0.64,1)
- Avatar client : cercle + initiale prénom + anneau couleur statut

---

## 2. TABLES SUPABASE

`clients`, `biens`, `visites`, `transactions`, `relances`, `envois`, `journal`, `partenaires`, `parametres`

### Colonnes clients étendues (ajoutées cette session)
chambres_min, parking, balcon, terrasse, jardin, cave, ascenseur, gardien, interphone, digicode, rdc_exclu, dernier_etage, etage_min, dpe_max, annee_construction_min

### Format secteurs en BDD
`"Parchamp-Albert Kahn (Boulogne-Billancourt)"` → groupés par ville à l'affichage

### Table envois — type compte_rendu_visite
Corps format : `"Avis : 🔥 Très intéressé | Note : ⭐⭐⭐ | commentaire libre"` (séparateur pipe)

---

## 3. STRUCTURE FICHIERS

```
src/
├── app/api/
│   ├── extract-bien/route.ts        # URL → Claude analyse HTML
│   ├── parse-texte-bien/route.ts    # Copier-coller → Claude structure
│   └── upload-photos/route.ts       # Photos → Supabase Storage
├── components/
│   ├── clients/Clients.tsx          # Liste clients
│   ├── fiche/FicheClient.tsx        # Fichier principal ~1850 lignes
│   ├── layout/ (AppLayout, Sidebar, Topbar)
│   └── pages/
│       ├── PageMail.tsx             # Nouveau mail + messages pré-rédigés
│       ├── PageRecherche.tsx        # Recherche en cours
│       ├── PageVisites.tsx          # Visites globales + CR intégré
│       └── PageRelances/Activite/Parametres.tsx
└── lib/supabase.ts
```

---

## 4. FONCTIONNALITÉS LIVRÉES (V1.2)

### Fiche Client — Structure
- **Header** : avatar (cercle + initiale + anneau statut) · Contact inline cliquable · KPIs · Bouton 📤 Envoyer (popup) · Relance J+5 · Action · Ajouter un bien
- **Bloc critères** (avant onglets) : Type+Budget / Surface+Pièces+Chambres+DPE+Étage+Année / Critères importants (équipements) / Secteurs recherchés (groupés ville→quartiers) / Précisions (notes dorées)
- **Mandat compact** à droite : infos en 15px · "X jours restants"
- **Onglets** : Biens / Visites / Transaction / Historique / Journal

### Onglet Biens
- Ajout URL (Claude analyse HTML) ou copier-coller texte (Claude extrait)
- Photos → Supabase Storage automatique → permanentes
- Photos supprimées du Storage avec le bien
- Drag & drop réordonnement (useRef)
- Bouton ✨ Reformuler description avec IA
- Prix vendeur + commission séparés à l'affichage
- Modal Détail : 4 groupes (Localisation, Caractéristiques, Prix, Agence+Description)

### Onglet Visites
- 2 sections : À venir (bleu) · Effectuées (vert avec CR complet)
- Modal CR : étoiles 1-5 + avis 5 options + commentaire
- CR sauvegardé dans `visites` ET `envois` → visible dans Historique

### Onglet Transaction
- 5 étapes avec données sauvegardées affichées en synthèse
- Contre-offres détaillées (partie + montant + date) dans la synthèse
- Retour étape via modal stylé (plus de confirm() navigateur)
- Statut "Offre écrite" → popup de création d'offre

### Historique
- Mails envoyés + Comptes-rendus visites (icône verte, détail avis+note+commentaire)

### Pages principales
- **Mes Clients** : chips budget/surface/pièces/DPE · villes uniquement · alerte mandat
- **Recherche en cours** : secteurs ville→quartiers · critères chips · alerte mandat
- **Visites globale** : photo bien · date année · CR intégré · sync fiche client
- **Nouveau mail** : objet vide · signature seule · 5 modèles pré-rédigés · tous clients searchables · historique contenu complet

### 🆕 Améliorations session 12 mai 2026

**Journal client — Anti-bruit (FicheClient.tsx)**
- `saveContact` : log uniquement si vrai changement détecté (avec détail du diff prénom/nom/adresse/email/tél)
- `saveCriteres` : skip complet si aucun changement (fini les entrées "Aucun changement détecté")
- `saveMandat` : log uniquement si vrai changement (avec détail signature/durée/honoraires/expiration)
- `changeStatut` : anti-doublon, ignore si le statut est déjà le même

**UI — Bas de page (FicheClient.module.css)**
- `contentWrap` : padding-bottom passé de 16px à 80px pour éviter que les onglets soient tronqués par la barre Windows

**Bugs corrigés (FicheClient.tsx)**
- `agence_tel` manquant dans l'INSERT de `saveBien` → la valeur s'affichait dans le preview mais n'était jamais enregistrée
- `nb_chambres` manquant dans l'UPDATE de `saveFicheBien` → modification non persistée
- ⚠️ Les biens créés avant ces fix ont ces champs vides, à corriger manuellement

---

## 5. RÈGLES D'AFFICHAGE FIGÉES

### Min/Max (partout)
- Min ET max → `32–80m²`
- Seulement min → `min 32m²`
- Seulement max → `max 80m²`
- Jamais de `+` parasite

### Prix
- Acquéreur (gros, doré) + vendeur+commission (petit, gris) sur les cartes biens
- PDF : acquéreur uniquement (vendeur masqué)

### Jours mandat
- "X jours restants" · "Expiré" · Badge alerte si < 15j

### Modals
- Tous animés fadeIn+slideUp · overlay blur
- Critères NON fermable au clic extérieur

---

## 6. API ROUTES

| Route | Fonction | Prérequis |
|---|---|---|
| `/api/extract-bien` | URL → Claude analyse HTML → JSON bien | ANTHROPIC_API_KEY |
| `/api/parse-texte-bien` | Texte collé → Claude structure → JSON bien | ANTHROPIC_API_KEY |
| `/api/upload-photos` | URLs externes → Supabase Storage → URLs permanentes | SUPABASE_SERVICE_ROLE_KEY |
| `/api/bien-from-bookmarklet` | ⚠️ Dormant — tentative bookmarklet Chrome abandonnée le 12/05 | — |

**SeLoger** : bloqué Cloudflare → copier-coller recommandé. LeBonCoin/PAP/Orpi : OK.

### ⚠️ Tentative bookmarklet Chrome abandonnée (12 mai 2026)
3 fichiers créés puis abandonnés à cause de blocages techniques (React bloque `javascript:` URLs, timing fragile sur `postMessage` entre fenêtres) :
- `src/app/api/bien-from-bookmarklet/route.ts`
- `src/app/bookmarklet/page.tsx`
- `src/app/bookmarklet/capture/page.tsx`

Fichiers laissés en place mais inactifs (aucun lien vers eux dans l'app). **Solution retenue** : continuer avec le copier-coller texte existant via `/api/parse-texte-bien`. À durcir : tronquer le texte collé à 4000 chars, prompt strict "ignore biens similaires", détecter les marqueurs "Plus de biens similaires" / "À voir aussi".

### Limites connues SeLoger (copier-coller)
- **DPE en image SVG** : la lettre A-G du bien principal est un graphique, non capturée par Ctrl+A. À saisir manuellement après création (sélecteur A-G dans la fiche modifier)
- **Biens similaires en bas de page** : leur texte (prix, DPE, etc.) peut être confondu avec le bien principal par l'IA si on ne tronque pas le texte collé

---

## 7. À FAIRE — PRIORITÉS

### 🔴 Priorité 1 — Module chasse (en cours)
1. **Génération PDF sélection de biens** (jsPDF + html2canvas déjà dans package.json)
   - Modal : sélection biens avec cases à cocher + choix photos (max 3-4)
   - Page de garde + fiche par bien (prix acquéreur uniquement) + footer
   - Note conseiller par bien
   - Sauvegarde PDF Supabase Storage + relance J+5 auto

2. **Intégration Mailjet** : envoi réel mail + PDF joint + SMS · Clés dans Paramètres

3. **Page connexion** : Supabase Auth · alexandre.rogelet / chasseimmo

### 🟠 Priorité 2 — Extension CRM complet (vendeurs)
4. **Fiche client unifiée vendeur/acheteur** : un client peut être vendeur, acheteur, ou les deux. Ajouter le volet vendeur (bien en mandat, prix de mise en vente, honoraires vendeur, documents du bien)
5. **Gestion des biens en mandat** : biens propres à l'agence (≠ biens sourcés pour la chasse), avec photos, description, prix, statut (disponible, sous offre, compromis, vendu)
6. **Pipeline de vente** : suivi des offres reçues sur les mandats vendeurs

### 🟡 Priorité 3 — Enrichissements
7. **Matching biens → clients** : à l'ajout d'un bien, suggérer clients correspondants
8. **Relances automatiques** post-envoi PDF
9. **KPI "Biens présentés"** incrémenté à l'envoi PDF
10. **Dashboard enrichi** : KPIs, graphiques, pipeline vente + chasse, CA

### 🟢 V3
- PDF C-R visites · PDF Présentation services
- Export Excel mensuel/annuel
- Extension Chrome (photos SeLoger depuis navigateur)
- Multi-utilisateur
- Actions groupées multi-clients
- Clients inactifs +30j · Corbeille archivage J+30
- Statistiques Mon activité (taux transformation, délais, CA)

---

## 8. POINTS DE VIGILANCE TECHNIQUE

- **SeLoger bloqué** : toujours utiliser copier-coller
- **Photos Storage** : SUPABASE_SERVICE_ROLE_KEY requis + bucket `photos-biens` public
- **ANTHROPIC_API_KEY** : requise extraction texte + reformulation
- **saveCompteRendu** : insère dans `visites` ET `envois` (Historique)
- **Chaleur** : en BDD mais non affichée (remplacée par statut)
- **SRU** : alerte J+10 après compromis (dans Transaction)
- **Drag & drop photos** : useRef (pas objet littéral) pour persister entre renders

---

## 9. WORKFLOW PDF COMPLET (À CODER)

1. "📄 Sélection de biens" → modal sélection (cases + miniatures)
2. Par bien : choix photos + note conseiller
3. Prévisualisation PDF
4. Destinataires (emails fiche) + SMS oui/non
5. Envoi → Mailjet → PDF joint
6. Sauvegarde PDF Storage + relance J+5 + journal + historique

**Contenu PDF** : page de garde (logo, nom, référence, date) + par bien (photo principale, titre, localisation, prix acquéreur TTC, specs, description nettoyée, note conseiller, 2-3 autres photos) + footer (logo + coordonnées)

---

## 10. HORS PÉRIMÈTRE

- **Diffusion portails** (SeLoger, LBC, Bien'ici) → reste sur Immofacile
- Scraping automatique portails
- Suppression filigrane photos
- Location (vente uniquement)
- Signature électronique
- Mode hors ligne

---

## 11. DISCUSSIONS HORS-PROJET — Site public Emilio Immo

### SEO local par arrondissement (à traiter sur le site public, PAS sur ce CRM)
Discussion du 12 mai 2026 sur la présence locale d'Emilio Immo dans Paris :
- **Stratégie SEO** : créer des pages dédiées par arrondissement sur le site public (ex `/vendre-appartement-paris-6`) avec contenu unique par zone (prix au m² du quartier, ventes récentes, expertise locale). Délai de ranking Google : 3-6 mois.
- **Google Maps** : pour apparaître sur la map dans un arrondissement, il faut une **adresse physique vérifiée** dans cette zone (Google envoie un courrier de vérification). Solutions légales : coworking (50-150€/mois), domiciliation, bureau partagé. **Un seul profil Google Business par adresse** : pour 3 arrondissements, il faut 3 adresses.
- **Alternative payante rapide** : Google Ads géolocalisé (~500-2000€/mois selon concurrence).

À traiter sur le site public Emilio Immo, **pas sur ce projet CRM interne**.
