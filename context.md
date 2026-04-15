# CONTEXTE PROJET — Emilio Immobilier
## Outil de Chasse Immobilière — Version 1.0

---

## 0. CONTEXTE & GENÈSE DU PROJET

### Qui est Alexandre ROGELET ?
Alexandre ROGELET est chasseur immobilier indépendant, opérant sur **Paris et le département 92 (Hauts-de-Seine)**. Son métier consiste à rechercher activement des biens immobiliers pour le compte de ses clients acheteurs, en s'appuyant sur les annonces publiées par les agences confrères et les particuliers sur les grands portails immobiliers.

Il utilise actuellement Immofacile AC3 comme CRM principal, conçu pour la gestion de mandats vendeurs — pas pour le métier de chasseur.

### Le problème
Pas d'outil dédié pour :
- Gérer les clients acheteurs avec leurs critères précis
- Présenter des biens de confrères de façon professionnelle
- Générer des PDFs soignés aux couleurs d'Emilio Immobilier
- Envoyer automatiquement par email et SMS
- Suivre tout le parcours client jusqu'à la signature

### La solution
Un outil web sur mesure, accessible depuis n'importe quel appareil (PC, téléphone, tablette), pensé exclusivement pour le chasseur immobilier solo.

### Zone géographique
- Paris — tous arrondissements
- Hauts-de-Seine 92 — toutes communes

### Périmètre métier
- Vente / Achat uniquement (pas de location)
- Chasseur immobilier (biens issus de confrères et particuliers)
- Utilisateur unique solo en V1
- Langue française uniquement en V1

---

## 0B. EXIGENCES UX — NON NÉGOCIABLES

> **"Quand Alexandre ouvre l'outil le matin, il a envie de l'utiliser."**

- Design premium dès la page de connexion
- Chaque écran agréable visuellement, pas de surcharge
- Animations fluides et transitions douces
- Typographie propre : Plus Jakarta Sans + DM Sans
- Espaces bien aérés — respiration visuelle
- Badges et éléments arrondis
- Micro-interactions satisfaisantes
- Dashboard motivant
- Minimum de clics pour chaque action
- Responsive PC + téléphone + tablette

### Palette & Style
| Élément | Valeur |
|---|---|
| Couleur principale | `#1a2332` — Navy |
| Couleur accent | `#c9a84c` — Or |
| Fond | Blanc / Gris très clair |
| Sidebar | Foncée (navy) avec accent or |
| Style | Sobre, luxe discret, premium |

---

## 1. INFORMATIONS GÉNÉRALES & TECHNIQUE

### Identité
| Champ | Valeur |
|---|---|
| Agence | Emilio Immobilier |
| Conseiller | Alexandre ROGELET |
| Email | arogelet@emilio-immo.com |
| Téléphone | 06 58 95 76 32 |
| Activité | Chasseur immobilier — Vente/Achat |
| Numérotation | EMI-2026-001, EMI-2026-002... |

### Stack Technique
| Service | Usage | Coût |
|---|---|---|
| **Next.js** | Framework frontend | Gratuit |
| **Vercel** | Hébergement | Gratuit |
| **Supabase** | Base de données + fichiers PDF | Gratuit |
| **Mailjet** | Email + SMS | 0,04€/SMS |
| **geo.api.gouv.fr** | Codes postaux + quartiers | Gratuit |

### Accès sécurisé
- Identifiant : `alexandre.rogelet`
- Mot de passe : `chasseimmo`

---

## 2. NAVIGATION — MENU LATÉRAL FIXE (SIDEBAR FONCÉE)

Menu latéral fixe sur toute la hauteur, fond navy `#1a2332`, accent or.

### Structure
```
PRINCIPAL
  ├── Dashboard
  ├── Clients (badge: 12)
  └── Recherche en cours (badge: 8)

SUIVI
  ├── Visites (badge bleu: 3)
  ├── Relances (badge rouge: 5, pulsant)
  └── Nouveau mail

ANALYSE
  ├── Mon activité
  └── Paramètres
```

### Barre de recherche universelle (topbar)
Recherche par : nom, prénom, email, téléphone, secteur/quartier, URL d'annonce, numéro de dossier EMI-XXXX

### Icône relances permanente
Badge rouge avec compteur dans le topbar — reste visible jusqu'à traitement complet.

---

## 3. DASHBOARD

### Welcome Banner
Section distincte en haut avec fond dégradé navy :
> *"Bonjour Alexandre, vous avez X relances aujourd'hui et X visites cette semaine."*

### Métriques clients
- 🟣 Prospects
- 🟢 Actifs
- ⏸️ Suspendus
- Clients sans activité +30 jours → badge orange

### Métriques activité
- Sélections envoyées ce mois
- Visites effectuées ce mois
- PDFs générés

### Blocs dashboard
- 🔴 Relances J+5 — classées : En retard / Aujourd'hui / À venir
- 📅 Visites à venir — toutes fiches confondues, triées par date
- ⚠️ Mandats expirant dans 15 jours — badge orange
- 🏠 Transactions en cours — étape actuelle de chaque dossier
- 🕐 Dernière activité globale
- 📈 Graphiques mensuels

### Tableau de bord financier
- Vue mensuelle : CA HT / CA TTC / Recherches réalisées / Panier moyen
- Vue annuelle : CA HT / CA TTC / Dossiers / Meilleur mois / Panier moyen

---

## 4. STATUTS CLIENTS

| Icône | Statut | Dashboard | Relances |
|---|---|---|---|
| 🟣 | Prospect | ✅ Oui | ❌ Non |
| 🟢 | Actif | ✅ Oui | ✅ Oui |
| ⏸️ | Suspendu | ❌ Non | ❌ Non |
| ✅ | **Bien trouvé — Dossier finalisé** | ❌ Archivé | ❌ Non |
| 🔴 | Perdu | ❌ Archivé | ❌ Non |

### Raisons de perte
Acheté via confrère / Abandon de projet / Budget revu / Parti à la concurrence / Autre (champ libre)

### Indicateur de chaleur (manuel)
🔥 Très chaud / 👍 Intéressé / 😐 Tiède / ❄️ Froid

### Jauge de progression
Auto + manuelle : `Prospect → Actif → Bien trouvé — Dossier finalisé`

---

## 5. FICHE CLIENT — DÉTAIL COMPLET

### Identité client
- Prénom + Nom
- Adresse complète
- Plusieurs emails (envoi PDF aux deux simultanément)
- Plusieurs numéros de téléphone
- Date de première prise de contact (auto à la création)
- Numéro de dossier auto : EMI-2026-XXX
- Durée de suivi : "Suivi depuis X jours"

### Critères de recherche
- Type de bien / Budget min-max / Surface min-max / Nb pièces
- Secteurs/villes : code postal → ville auto + quartiers + champ libre
- Notes libres

### Synthèse chiffrée (en haut de fiche)
Biens présentés / Visites effectuées / Offres faites / Jours de suivi

### Journal de bord automatique
Fil chronologique automatique de toutes les actions :
PDF envoyé, visite planifiée/effectuée, relance, statut modifié, mail envoyé, étape transaction...

### Actions manuelles (bouton "+ Ajouter une action")
Appel passé / Relance manuelle / Visite à planifier / Note libre / Envoi externe / RDV physique

### Section Vendeur (optionnelle)
Si le client est aussi potentiellement vendeur :
- Adresse du bien à vendre (peut différer de l'adresse client)
- Type / Surface + pièces / Estimation prix
- Statut : Estimé / Mandat signé / Vendu
- Notes libres

### Mandat de recherche
Date signature / Durée / Honoraires convenus / Alerte 15 jours avant expiration

### Onglets de la fiche
1. Biens proposés
2. Visites
3. Suivi Transaction
4. Historique envois
5. Journal de bord

### 3 boutons d'envoi
- 📄 **Sélection de biens** — PDF + email(s) + SMS
- 🤝 **Présentation services** — PDF + email(s) + SMS (grisé avec date après 1er envoi)
- 📋 **Compte-rendu / Bilan visites**

### Envoi mail texte libre
Objet libre, texte libre, pièce jointe (tous types), envoi Mailjet, tracé dans le journal.

### Corbeille et archivage
- Suppression → corbeille → destruction auto J+30
- "Bien trouvé" et "Perdu" → archivés, consultables

---

## 6. GESTION DES BIENS

### Ajout par URL
Sources : SeLoger, LeBonCoin, PAP, Bien'ici, Logic-Immo, Figaro Immo, Jinka, Belle Demeure...

Extraction automatique :
- Titre, prix, surface, pièces, description, photos, localisation
- Description nettoyée (nom d'agence retiré)
- Snapshot permanent (archivé même si l'annonce expire)

### Détection de doublons
- Même URL → alerte immédiate
- Bien similaire (ville, surface ±3m², prix ±2%, pièces) → alerte
- Même bien, URL différente → détection par similarité + confirmation

### Sélection des photos
- Sélection manuelle + réordonnancement par glisser-déposer
- 1ère photo = couverture
- Filigrane conservé (protection juridique)

### Prix & Commission
- Prix vendeur détecté
- Commission saisie : % ou montant fixe, bien par bien
- Prix acquéreur calculé automatiquement
- Dans le PDF : prix acquéreur uniquement (prix vendeur masqué)

### Badges retour client
Intéressé / Souhaite visiter / Visité / Offre faite / Refusé + commentaire libre

> Badge "Offre faite" → ouverture automatique du Suivi Transaction

### Agence source
- Détectée automatiquement si possible
- Saisie manuelle : nom, adresse complète, téléphone, contact
- Même agence, adresse différente = entrée distincte
- Pré-remplissage automatique pour les prochains biens

---

## 7. WORKFLOW VISITES

### Progression
Badge "Souhaite visiter" → **Visite à venir** → **Visite effectuée** → Compte-rendu

### Logistique visite
- Adresse exacte du bien
- Contact agence pour confirmer le RDV
- Rappel automatique la veille — notification dans l'outil

### Page Visites (menu)
- Visites à venir — triées chronologiquement
- Visites effectuées — avec note étoiles et résumé

### PDFs Visites
- PDF compte-rendu individuel par visite
- PDF bilan récapitulatif de toutes les visites d'un client

---

## 8. SUIVI TRANSACTION — WORKFLOW COMPLET

Déclenché dès que le badge "Offre faite" est posé. Visible dans l'onglet "Suivi Transaction" ET dans le dashboard. Étapes verrouillées — progression chronologique obligatoire.

### Étape 1 — Offre
Offre sur le prix / Date / Document joint optionnel / Note libre

### Étape 2 — Négociation
Historique complet des contre-offres : montant + date + partie (vendeur/acheteur)
Bouton "+ Ajouter une contre-offre" — nombre illimité

### Étape 3 — Offre acceptée
Prix final accepté / Date d'accord

### Étape 4 — Compromis signé
- Date de signature / Nom du notaire
- Alerte automatique J+10 (délai de rétractation SRU)
- Financement : Prêt (montant, apport, durée, taux, date fin condition suspensive) ou Comptant

### Suivi avancement du prêt
Banque contactée / Offre reçue / Offre acceptée / Alerte si date limite approche

### Étape 5 — Acte définitif
Date prévue / Date effective / Notaire acheteur / Notaire vendeur

### Clôture — Bien trouvé / Dossier finalisé
Fenêtre pré-remplie avec toutes les données saisies :
- Bien acquis : adresse, type, surface, pièces
- Prix affiché / Prix final / Économie négociée (auto)
- Financement détaillé
- Honoraires HT → TVA 20% → TTC (auto)
- Dates clés récapitulatives
- Notes finales

> À la validation : statut "Bien trouvé — Dossier finalisé", fiche archivée, CA et stats mis à jour.

---

## 9. PDFs GÉNÉRÉS — 3 TYPES

### PDF Sélection de biens
- Personnalisé : nom client, référence dossier, date, "Document confidentiel"
- Header : logo + coordonnées conseiller
- Bloc prix acquéreur mis en valeur (prix vendeur masqué)
- Barre de specs : surface, pièces, chambres, étage, parking, DPE
- Localisation + points forts + description nettoyée
- Note personnelle du conseiller
- Photos sélectionnées + carte
- Footer coordonnées
- **Sauvegardé définitivement** — consultable même si l'annonce a expiré

### PDF Présentation de services
Bouton grisé avec date après 1er envoi (re-envoi possible avec confirmation).
Contenu à définir par Alexandre (V2).

### PDF Compte-rendu / Bilan visites
- CR individuel par visite
- Bilan récapitulatif de toutes les visites d'un client

---

## 10. ENVOIS MAILJET — EMAIL + SMS

Un seul bouton → email(s) + SMS simultanés depuis `arogelet@emilio-immo.com`

### Email
- Envoi depuis arogelet@emilio-immo.com
- Si plusieurs emails sur la fiche → envoi aux deux simultanément
- Template modifiable dans Paramètres avec variables `{{prénom}}`, `{{nom}}`...
- PDF joint automatiquement / Signature automatique

### SMS
- Expéditeur : nom alphanumérique (11 car. max, sans espace ni caractère spécial)
- 160 caractères max / **0,04€ par SMS**
- Template modifiable dans Paramètres

### Relance automatique J+5
- Créée après chaque envoi de PDF sélection
- Badge rouge permanent dashboard + icône compteur menu
- Clôture : note résultat + journal / Report ou suppression possibles

### Mail texte libre
- Depuis fiche ou menu "Nouveau mail"
- Objet libre / Texte libre / Pièce jointe tous types
- Recherche destinataire par nom dans la base
- Tracé dans le journal

---

## 11. ACTIONS GROUPÉES MULTI-CLIENTS

Sélection de plusieurs clients → menu d'actions :
- ✉️ **Email groupé** — chaque client reçoit son email individuel (aucun CC visible), prénom personnalisé, pièce jointe possible
- 📱 **SMS groupé** — message court avec prénom auto
- 🔔 **Relance groupée** — même date pour tous
- 📋 **Changement de statut en masse**
- 📤 **Export Excel** des fiches sélectionnées

Chaque action tracée individuellement dans le journal de bord de chaque fiche.

---

## 12. PAGE RELANCES

- 🔴 En retard — J+5 dépassé
- 🔴 Aujourd'hui
- 🟡 À venir
- 🔵 Manuelles

Boutons : Appeler / Voir fiche / Clôturer / Reporter

Icône rouge compteur dans le menu — permanente jusqu'à traitement complet.

---

## 13. PAGE MON ACTIVITÉ — STATISTIQUES

- Délai moyen 1er contact → dossier finalisé
- Délai moyen offre → acte
- Taux de visite : biens proposés vs visités
- Taux de transformation : visites vs offres
- Économie moyenne négociée
- Statistiques agences partenaires
- Tableau financier mensuel : CA HT/TTC / Recherches / Panier moyen
- Tableau financier annuel : CA HT/TTC / Dossiers / Panier moyen / Meilleur mois
- Export Excel mensuel et annuel

---

## 14. ONGLET PARAMÈTRES

- Infos agence : nom, conseiller, email, téléphone, logo, couleurs
- Templates email (objet + corps avec variables) / Template SMS / Signature
- Délai relance par défaut : J+5 (modifiable)
- Sécurité : modification identifiant et mot de passe
- Corbeille : restauration / destruction auto J+30
- Export global Excel

> Toute modification dans Paramètres est répercutée immédiatement sur les prochains envois Mailjet.

---

## 15. GESTION DES SECTEURS / QUARTIERS

- Code postal → ville auto via **API geo.api.gouv.fr** (officielle, gratuite)
- Grande ville → liste déroulante quartiers pré-intégrés
- Autre → champ texte libre
- Plusieurs secteurs sélectionnables par client

### Base pré-intégrée Paris & 92
| Code | Ville | Quartiers |
|---|---|---|
| 92100 | Boulogne-Billancourt | Parchamp-Albert Kahn, Silly-Gallieni, Renault-Billancourt, Point-du-Jour, Vaillant-Marcel Sembat, Jean-Jaurès-Reine, Château-Les-Princes-Marmottan |
| 75006 | Paris 6ème | Saint-Germain-des-Prés, Luxembourg, Vavin, Notre-Dame-des-Champs, Bon Marché, Saint-Sulpice, Quais de Seine, Faubourg Saint-Germain |
| 75015 | Paris 15ème | Grenelle, Javel, Saint-Lambert, Necker, Beaugrenelle, Convention, Commerce, Falguière, Brancion |

---

## 16. STOCKAGE DES PDFs — SUPABASE

- PDFs des clients **Actifs** → conservés dans Supabase Storage
- PDFs des clients **Bien trouvé / Perdu** → supprimés automatiquement après X jours (configurable dans Paramètres : 15 / 30 / 60 jours / Jamais)
- Données texte (prix, dates, historique, CA...) → conservées définitivement
- Avec 5–10 clients actifs en permanence : plan gratuit Supabase (1GB) largement suffisant

---

## 17. FONCTIONNALITÉS PRÉVUES EN V2

- Réponses emails clients dans la fiche (configuration DNS)
- PDF de présentation des services Emilio Immobilier (contenu à définir)
- Intégration flux XML Immofacile AC3
- Matching automatique : bien → clients correspondants
- Extension base quartiers hors Île-de-France
- Diffusion mandats vendeurs via API portails (SeLoger, Jinka, Belle Demeure)

---

## 18. HORS PÉRIMÈTRE V1

- Scraping automatique portails — instable et juridiquement risqué
- Suppression filigrane photos — non légal
- Import automatique clients Immofacile AC3 — saisie manuelle en V1
- Mode hors ligne — outil 100% en ligne
- Multi-utilisateurs — solo en V1
- Location — vente/achat uniquement
- Gestion comptable avancée
- Signature électronique mandats

---

*Document de référence — Emilio Immobilier V1 — Alexandre ROGELET*
