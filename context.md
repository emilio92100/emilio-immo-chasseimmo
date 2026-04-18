# CONTEXTE PROJET — Emilio Immobilier
## Outil de Chasse Immobilière — Version 1.2
### Mis à jour le 18 avril 2026

---

## 0. IDENTITÉ & ACCÈS

| Champ | Valeur |
|---|---|
| Client | Alexandre ROGELET |
| Email | arogelet@emilio-immo.com |
| Téléphone | 06 58 95 76 32 |
| Activité | Chasseur immobilier — Paris & 92 |

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

**SeLoger** : bloqué Cloudflare → copier-coller recommandé. LeBonCoin/PAP/Orpi : OK.

---

## 7. À FAIRE — PRIORITÉS

### 🔴 Priorité 1 (bloquant métier)
1. **Génération PDF sélection de biens** (jsPDF + html2canvas déjà dans package.json)
   - Modal : sélection biens avec cases à cocher + choix photos (max 3-4)
   - Page de garde + fiche par bien (prix acquéreur uniquement) + footer
   - Note conseiller par bien
   - Sauvegarde PDF Supabase Storage + relance J+5 auto

2. **Intégration Mailjet** : envoi réel mail + PDF joint + SMS · Clés dans Paramètres

3. **Page connexion** : Supabase Auth · alexandre.rogelet / chasseimmo

### 🟡 Priorité 2
4. **Matching biens → clients** : à l'ajout d'un bien, suggérer clients correspondants
5. **Relances automatiques** post-envoi PDF
6. **KPI "Biens présentés"** incrémenté à l'envoi PDF

### 🟢 V2
- PDF C-R visites · PDF Présentation services
- Export Excel mensuel/annuel
- Extension Chrome (photos SeLoger depuis navigateur)
- Dashboard enrichi (KPIs, graphiques, pipeline)
- Multi-utilisateur
- Actions groupées multi-clients
- Clients inactifs +30j · Corbeille archivage J+30
- Statistiques Mon activité (taux transformation, délais, CA)
- Section vendeur sur fiche client

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

- Scraping automatique portails
- Suppression filigrane photos
- Location (vente uniquement)
- Signature électronique
- Mode hors ligne
