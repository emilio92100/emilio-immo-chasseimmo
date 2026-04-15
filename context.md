# CONTEXTE PROJET — Emilio Immobilier
## Outil de Chasse Immobilière — Version 1.0
### Mis à jour le 15 avril 2026

---

## 0. IDENTITÉ & ACCÈS

| Champ | Valeur |
|---|---|
| Client | Alexandre ROGELET |
| Email | arogelet@emilio-immo.com |
| Téléphone | 06 58 95 76 32 |
| Login outil | alexandre.rogelet / chasseimmo |
| Activité | Chasseur immobilier — Paris & 92 |

---

## 1. STACK TECHNIQUE

| Service | Usage | Statut |
|---|---|---|
| Next.js 16 + TypeScript | Framework frontend | ✅ Déployé |
| Vercel | Hébergement | ✅ Actif |
| Supabase | Base de données | ✅ Connecté |
| GitHub | Repo source | ✅ emilio92100/emilio-immo-chasseimmo |
| Mailjet | Email + SMS | ⏳ Clés à configurer |
| geo.api.gouv.fr | Autocomplétion villes | ✅ Intégré |

**URL prod :** https://emilio-immo-chasseimmo.vercel.app
**Polices :** Plus Jakarta Sans (titres) + DM Sans (corps)

### Supabase
- Project ID : eutxmrdcykztjdyydmuo
- URL : https://eutxmrdcykztjdyydmuo.supabase.co
- Env vars Vercel : NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY ✅

### Design
- Navy principal : #1a2332
- Or accent : #c9a84c
- Sidebar : #344a63
- Fond : #f8fafc
- Border-radius cards : 14-16px

---

## 2. TABLES SUPABASE

`clients`, `biens`, `visites`, `transactions`, `relances`, `envois`, `journal`, `partenaires`, `parametres`

### Type Client (lib/supabase.ts)
```typescript
export interface Client {
  id: string
  reference: string           // EMI-2026-001
  prenom: string
  nom: string
  emails: string[]
  telephones: string[]
  adresse?: string
  statut: 'prospect' | 'actif' | 'suspendu' | 'bien_trouve' | 'perdu'
  chaleur?: string            // tres_chaud | interesse | tiede | froid
  type_bien?: string          // peut contenir "Appartement, Maison"
  budget_min?: number
  budget_max?: number
  surface_min?: number
  surface_max?: number
  nb_pieces_min?: number
  nb_pieces_max?: number
  secteurs?: string[]
  notes?: string
  mandat_date_signature?: string
  mandat_duree?: number
  mandat_honoraires?: string
  mandat_date_expiration?: string
  created_at: string
  updated_at: string
}

export interface Relance {
  id: string
  client_id: string
  bien_id?: string
  type: 'auto' | 'manuelle'
  statut: 'en_attente' | 'cloturee' | 'reportee'
  date_echeance: string
  note?: string
  resultat?: string
  created_at: string
}
```

---

## 3. STRUCTURE FICHIERS

```
src/
├── app/
│   ├── api/
│   │   └── extract-bien/route.ts   ← Extraction URL annonces
│   ├── layout.tsx
│   └── page.tsx
├── components/
│   ├── layout/
│   │   ├── AppLayout.tsx + .module.css    ← Layout principal, routing pages
│   │   ├── Sidebar.tsx + .module.css      ← Menu latéral, compteurs Supabase
│   │   └── Topbar.tsx + .module.css       ← Recherche universelle fonctionnelle
│   ├── dashboard/
│   │   └── Dashboard.tsx + .module.css    ← Dashboard connecté Supabase
│   ├── clients/
│   │   └── Clients.tsx + .module.css      ← Liste clients + création
│   ├── fiche/
│   │   └── FicheClient.tsx + .module.css  ← Fiche client complète
│   └── pages/
│       ├── Page.module.css
│       ├── PageRelances.tsx
│       ├── PageVisites.tsx
│       ├── PageMail.tsx
│       ├── PageActivite.tsx
│       ├── PageParametres.tsx
│       └── PageRecherche.tsx
└── lib/
    └── supabase.ts                         ← Client + types + helpers
```

---

## 4. ÉTAT DES PAGES — CE QUI FONCTIONNE ✅

### Dashboard
- Données réelles Supabase (0 si vide)
- Welcome banner navy
- Stats : clients actifs, sélections, visites, CA
- Blocs : relances, transactions, visites à venir, activité récente
- CTA "Créer votre premier client" si base vide

### Sidebar
- Couleur : #344a63
- Compteurs réels Supabase
- "Recherche en cours" = seulement les Actifs ✅
- Relances badge rouge pulsant si > 0

### Topbar — Recherche universelle ✅
- Recherche temps réel par prénom, nom, référence EMI
- Debounce 300ms
- Dropdown résultats avec statut coloré
- Clic → ouvre directement la fiche client
- Fermeture au clic extérieur

### Page Clients
- Liste avec filtres statut + recherche
- Création modal complet (référence EMI auto)
- Clic sur client → ouvre FicheClient

### FicheClient — COMPLÈTE ✅

**Header :**
- Bouton retour "← Clients"
- Boutons "+ Action" et "+ Ajouter un bien"

**Identité (barre haute) :**
- Avatar initiales, nom, référence, jours de suivi
- Statut : dropdown select (Prospect / Actif / Suspendu / Offre écrite / Bien trouvé / Perdu) ✅
- Chaleur : boutons emoji 🔥👍😐❄️
- Synthèse : Biens / Visites / Offre(s) / Jours suivi

**Blocs info (3 colonnes) :**
1. Contact (éditable) : téléphones, emails, adresse
2. Critères de recherche (modal complet) :
   - Multi-sélection types (Appartement ET Maison) ✅
   - Budget min/max
   - Surface min/max
   - Pièces min/max + chambres min
   - Étage (RDC exclu, dernier étage, étage min)
   - Options : Parking, Cave, Balcon, Terrasse, Jardin, Ascenseur, Gardien, Interphone, Digicode
   - DPE max (A à G)
   - Secteurs : API geo.api.gouv.fr + base Paris/92 intégrée
     - Ville maintenue active pour multi-quartiers ✅
     - Saisie libre (Entrée pour valider)
   - Notes libres
   - Overlay fermable UNIQUEMENT via boutons ✅
3. Mandat de recherche (navy, modal dédié) :
   - Date signature, durée, honoraires
   - Expiration calculée automatiquement
   - Badge Actif/Expiré avec jours restants

**Boutons d'envoi (barre dédiée) :**
- 📄 Sélection de biens (→ PDF à coder)
- 🤝 Présentation services (V2)
- 📋 Compte-rendu visites (→ PDF à coder)
- ✉️ Mail libre

**5 onglets :**
1. **Biens** : cards avec photo, prix acquéreur, specs, badge retour client (dropdown), lien annonce, bouton planifier visite
2. **Visites** : à venir (éditable date/heure/contact) + effectuées, bouton "Marquer effectuée"
3. **Transaction** : workflow 5 étapes (Offre → Négociation → Offre acceptée → Compromis → Acte), SRU J+10, financement, clôture "Bien trouvé"
4. **Historique** : envois tracés (PDF, mails)
5. **Journal** : chronologique, scrollable ✅, actions manuelles (modal grille de types, titre optionnel)

**Modal Ajouter un bien :**
- URL → extraction automatique (SeLoger bloque → message + formulaire vide)
- Formulaire complet : titre, type, source, ville, CP, surface, pièces, étage, DPE, prix vendeur, commission (% ou €), prix acquéreur calculé, agence, description
- Vérification doublon URL

### Pages secondaires
- **Relances** : triées retard/aujourd'hui/à venir, clôturer/reporter +5j
- **Visites** : à venir + effectuées
- **Nouveau mail** : destinataires depuis Supabase, objet, corps avec {{prénom}}, SMS optionnel
- **Mon activité** : stats réelles depuis Supabase
- **Recherche en cours** : seulement les clients Actifs ✅
- **Paramètres** : navigation par sections (Agence, Templates email, SMS & Relances, Sécurité), clés Mailjet configurables

---

## 5. CE QUI RESTE À FAIRE — PRIORITÉS

### 🔴 Priorité haute

**Génération PDF — LE WORKFLOW PRINCIPAL**
C'est le cœur de l'outil. À partir des biens sélectionnés sur une fiche :
1. Alexandre sélectionne les biens à inclure (cases à cocher)
2. Génération PDF mise en page Emilio :
   - Header : logo + coordonnées
   - Pour chaque bien : photo principale, titre, prix acquéreur (vendeur masqué), specs (surface, pièces, étage, parking, DPE), localisation, description nettoyée, note conseiller
   - Footer : coordonnées + "Document confidentiel"
3. Sauvegarde PDF dans Supabase Storage
4. Envoi email via Mailjet (arogelet@emilio-immo.com) avec PDF joint
5. Envoi SMS de notification simultané
6. Création relance automatique J+5
7. Tracé dans journal et historique envois

**Intégration Mailjet**
- Alexandre doit fournir ses clés API (à saisir dans Paramètres)
- Email depuis arogelet@emilio-immo.com
- SMS via Mailjet (0,04€/SMS)
- Templates configurables dans Paramètres

### 🟡 Priorité moyenne

**Page connexion**
- Login/password (alexandre.rogelet / chasseimmo)
- Protection de l'accès

**Relances automatiques J+5**
- Créées automatiquement après chaque envoi PDF
- Lien vers la fiche client depuis la page Relances

**Matching biens → clients**
- Quand un bien est ajouté → suggestion des clients dont il correspond aux critères

**Export Excel**
- Depuis "Mon activité" : export mensuel/annuel CA

### 🟢 Priorité basse / V2

**PDF Présentation des services**
- Contenu à définir par Alexandre

**PDF Compte-rendu visites**
- CR individuel + bilan récapitulatif

**Réponses emails dans la fiche**
- Configuration DNS

**Actions groupées multi-clients**
- Email groupé, SMS groupé, changement statut en masse

---

## 6. NOTES IMPORTANTES

### Extraction URL annonces
- SeLoger bloque activement les requêtes serveur → message explicatif + formulaire vide
- PAP, LeBonCoin, Bien'ici, Orpi, Century 21 fonctionnent mieux
- L'API tente 3 User-Agents différents avant d'abandonner
- Fallback : extraction ville/type depuis l'URL

### Mailjet — pas encore fonctionnel
Pour activer :
1. Alexandre crée compte sur mailjet.com
2. Copie clé API + clé secrète dans Paramètres → SMS & Relances
3. On code l'intégration dans route.ts

### Secteurs / Quartiers
- API geo.api.gouv.fr pour autocomplétion des villes
- Base Paris (75001-75020) + 92 pré-intégrée dans le code
- La ville reste active pour ajouter plusieurs quartiers
- Saisie libre possible (Entrée pour valider)

### Type de bien
- Stocké en BDD comme string : "Appartement, Maison"
- Affiché en multi-sélection dans le modal critères

### Statuts clients
| Statut | Recherche en cours | Relances |
|---|---|---|
| Prospect | ❌ Non | ❌ Non |
| Actif | ✅ Oui | ✅ Oui |
| Suspendu | ❌ Non | ❌ Non |
| Offre écrite | ❌ Non | ❌ Non |
| Bien trouvé | ❌ Archivé | ❌ Non |
| Perdu | ❌ Archivé | ❌ Non |

---

## 7. HORS PÉRIMÈTRE V1

- Scraping automatique portails (bloqué juridiquement)
- Suppression filigrane photos (illégal)
- Multi-utilisateurs
- Location (vente/achat uniquement)
- Signature électronique mandats
- Mode hors ligne

---

## 8. CE QUI MANQUE ENCORE PAR RAPPORT AU CAHIER DES CHARGES INITIAL

### Fiche client — fonctionnalités non encore codées
- **Section Vendeur** (optionnelle) : si le client est aussi potentiellement vendeur — adresse bien à vendre, type, surface, estimation, statut (Estimé/Mandat signé/Vendu)
- **Jauge de progression** client : Prospect → Actif → Bien trouvé (visuelle)
- **Clients sans activité +30 jours** → badge orange sur dashboard et liste
- **Corbeille / archivage** : suppression → corbeille → destruction auto J+30 ; "Bien trouvé" et "Perdu" → archivés consultables
- **Détection de doublons biens** : même URL = alerte immédiate ; bien similaire (ville, surface ±3m², prix ±2%, pièces) = alerte

### Biens — fonctionnalités non encore codées
- **Sélection photos** : sélection manuelle + réordonnancement drag & drop ; 1ère photo = couverture
- **Note conseiller** par bien (pour le PDF)
- **Agence source** complète : nom, adresse, téléphone, contact agent — pré-remplissage automatique pour les prochains biens de la même agence

### Visites — fonctionnalités non encore codées
- **Rappel automatique la veille** (notification dans l'outil)
- **Note étoiles** après visite (1 à 5)
- **Commentaire visite** 

### Envois — fonctionnalités non encore codées
- **Snapshot permanent des biens** : archivage même si annonce expire
- **Sélection des photos à inclure** dans le PDF par bien
- **Prix vendeur masqué** dans le PDF (acquéreur uniquement visible)

### Dashboard — blocs non encore codés
- **Mandats expirant dans 15 jours** → badge orange
- **Graphiques mensuels** activité
- **Tableau financier** : CA HT / CA TTC / Recherches / Panier moyen (mensuel + annuel)

### Page Mon activité — stats non encore codées
- Délai moyen 1er contact → dossier finalisé
- Délai moyen offre → acte
- Taux de visite : biens proposés vs visités
- Taux de transformation : visites vs offres
- Économie moyenne négociée
- Statistiques agences partenaires
- Export Excel mensuel et annuel

### Actions groupées multi-clients (page Clients)
- Sélection de plusieurs clients → menu d'actions
- Email groupé (prénom personnalisé, aucun CC visible)
- SMS groupé
- Relance groupée même date
- Changement statut en masse
- Export Excel des fiches sélectionnées

### Relances — améliorations prévues
- Lien direct vers fiche client depuis la page Relances
- Bouton "Appeler" sur chaque relance
- Relances automatiques créées après chaque envoi PDF (pas encore implémenté)

### Page connexion
- Écran login avant accès à l'outil
- Identifiant : alexandre.rogelet / Mot de passe : chasseimmo
- Non encore codé — l'outil est accessible sans authentification pour l'instant

### Paramètres — sections à compléter
- Corbeille : restauration / destruction auto J+30
- Export global Excel
- Délai conservation PDFs archivés (15 / 30 / 60 jours / Jamais)

---

## 9. DÉCISIONS DE DESIGN IMPORTANTES

- **Modal critères** : overlay NON fermable au clic extérieur (uniquement Annuler/Sauvegarder)
- **Statut client** : dropdown select (pas boutons) — inclut "Offre écrite" ✅
- **Chaleur** : boutons emoji uniquement 🔥👍😐❄️
- **Badge retour bien** : dropdown inline sur chaque bien
- **Prix** : prix acquéreur affiché, prix vendeur masqué (important pour le PDF)
- **Commission** : saisie % ou montant fixe → prix acquéreur calculé automatiquement
- **Référence dossier** : EMI-2026-001, EMI-2026-002... (auto à la création)
- **Relance J+5** : créée automatiquement après chaque envoi PDF (à implémenter)
- **SRU** : alerte automatique J+10 après signature compromis

---

## 10. WORKFLOW PDF — DÉTAIL COMPLET (À CODER)

### Déclencheur
Bouton "📄 Sélection de biens" sur la fiche client

### Étapes
1. Modal de sélection : liste des biens avec cases à cocher, aperçu miniature
2. Pour chaque bien sélectionné : choisir les photos à inclure (max 3-4 par bien), réordonner
3. Option : ajouter note personnelle du conseiller par bien
4. Prévisualisation PDF avant envoi
5. Choix destinataires : emails de la fiche (1 ou 2), SMS oui/non
6. Envoi → Mailjet → PDF joint + SMS
7. Sauvegarde PDF dans Supabase Storage
8. Création relance J+5 automatique
9. Tracé dans journal + historique envois

### Contenu PDF
- **Page de garde** : logo Emilio, nom client, référence dossier, date, "Document confidentiel"
- **Par bien** :
  - Photo principale (grande)
  - Titre + localisation
  - Prix acquéreur TTC (en gras, mis en valeur — prix vendeur masqué)
  - Barre specs : surface, pièces, chambres, étage, parking, DPE
  - Description nettoyée (nom agence retiré si mentionné)
  - Note du conseiller (encadrée)
  - Autres photos (2-3)
- **Footer** : logo + coordonnées Alexandre ROGELET + "Emilio Immobilier"

### Librairie recommandée
jsPDF + html2canvas (déjà installé dans package.json)
