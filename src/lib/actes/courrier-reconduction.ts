/* ═══ Le courrier de reconduction (article L215-1) ═══════════════════════
   Un mandat qui se poursuit par périodes oblige l'agence, avant chaque
   échéance, à rappeler au client qu'il peut ne pas le poursuivre :
     · par lettre nominative ou courrier électronique dédiés ;
     · au plus tôt trois mois et au plus tard un mois avant la date limite
       pour refuser la reconduction ;
     · en termes clairs, avec cette date limite dans un encadré apparent.
   Sans ce courrier, le client peut arrêter le mandat gratuitement, à tout
   moment, dès l'échéance passée.

   Il part d'un mandat signé (« Préparer le courrier » dans ses échéances,
   ou Nouveau document › Courrier) : destinataire, numéro, dates, tout est
   repris. Ce n'est pas un contrat : on l'envoie, on ne le fait pas signer.

   ⚠️ Texte écrit pour Emilio, à faire relire par l'avocat d'Alexandre. */

import { type Partie, type Bloc, type Resume } from '@/lib/mandat';
import { type IdentiteAgence } from '@/lib/agence';
import {
  P, Pp, jourLong, aujourdhui, txt, num, plusMois, veille, lirePersonnes, nomComplet, nomsCourts,
  type Donnees, type Modele, type Etape, type Contexte, type Repere, type Source,
} from './commun';
import { TYPES, typeDe as typeVente, echeances } from './mandat-vente';

const ENVOIS: Record<string, string> = {
  email: 'Envoyé par courrier électronique dédié',
  lrar: 'Lettre recommandée avec avis de réception',
  lettre: 'Lettre nominative',
};

/* ══ Les questions ══════════════════════════════════════════════════════ */
const ETAPES: Etape[] = [
  {
    id: 'mandat', titre: 'Le mandat', court: 'Le mandat', sous: 'Repris du mandat signé : vérifie, c’est tout.', ic: 'doc',
    champs: [
      { t: 'choix', cle: 'quoi', lib: 'Un mandat', ic: 'doc', tuiles: true, options: [
        { v: 'vente', l: 'De vente', ic: 'maison' }, { v: 'recherche', l: 'De recherche', ic: 'loupe' },
      ] },
      { t: 'texte', cle: 'mandatNom', lib: 'Le mandat, en toutes lettres', ic: 'plume', large: true, exemple: 'un mandat de vente exclusif', aide: 'Tel qu’il apparaît dans la phrase « vous nous avez confié … ».' },
      { t: 'texte', cle: 'mandatNumero', lib: 'N° du mandat', ic: 'livre', requis: true },
      { t: 'date', cle: 'mandatDate', lib: 'Signé le', ic: 'calendrier', requis: true },
      { t: 'texte', cle: 'bien', lib: 'Le bien', ic: 'lieu', large: true, si: d => d.quoi !== 'recherche', exemple: '12 rue des Lilas, 92100 Boulogne-Billancourt' },
      { t: 'titre', cle: 't-duree', lib: 'Sa durée', ic: 'calendrier' },
      { t: 'nombre', cle: 'periode', lib: 'Il se poursuit par périodes de', ic: 'boucle', unite: 'mois', requis: true },
      { t: 'date', cle: 'finMax', lib: 'Au plus tard jusqu’au', ic: 'drapeau', aide: 'La limite totale prévue au mandat.' },
      { t: 'choix', cle: 'resiliation', lib: 'Le mandat peut être arrêté', ic: 'balance', options: [
        { v: 'art78', l: 'Par recommandé, 15 jours de préavis', ic: 'doc' }, { v: 'libre', l: 'Par recommandé ou e-mail, 15 jours de préavis', ic: 'mail' },
      ], aide: 'Rappelé dans le courrier. Mandat de vente, ou de recherche exclusif : le recommandé (article 78 du décret de 1972).' },
    ],
  },
  {
    id: 'dest', titre: 'Le destinataire', court: 'Destinataire', sous: 'À qui il part, et comment.', ic: 'personne',
    champs: [
      { t: 'texte', cle: 'destNom', lib: 'Nom', ic: 'personne', large: true, requis: true, exemple: 'Madame Claire MARTIN et Monsieur Paul MARTIN' },
      { t: 'zone', cle: 'destAdresse', lib: 'Adresse', ic: 'lieu', large: true, exemple: '12 rue des Lilas\n92100 Boulogne-Billancourt' },
      { t: 'texte', cle: 'destEmail', lib: 'E-mail', ic: 'mail', large: true },
      { t: 'texte', cle: 'appel', lib: 'Formule d’appel', ic: 'bulle', exemple: 'Madame, Monsieur,' },
      { t: 'choix', cle: 'envoi', lib: 'Envoyé par', ic: 'envoyer', tuiles: true, options: [
        { v: 'email', l: 'E-mail dédié', ic: 'ecran' }, { v: 'lrar', l: 'Recommandé', ic: 'doc' }, { v: 'lettre', l: 'Lettre simple', ic: 'plume' },
      ], aide: 'La loi accepte une lettre ou un e-mail, à condition qu’ils ne servent qu’à ça. Garde la preuve de l’envoi : un e-mail envoyé ou un recommandé, c’est plus sûr qu’une lettre simple.' },
    ],
  },
  {
    id: 'dates', titre: 'Les dates', court: 'Les dates', sous: 'L’échéance, et la date limite pour dire non.', ic: 'calendrier', reperesApres: 'date',
    champs: [
      { t: 'date', cle: 'echeance', lib: 'Prochaine échéance', ic: 'chrono', requis: true, aide: 'Le jour où le mandat se prolonge s’il ne dit rien.' },
      { t: 'date', cle: 'dateLimite', lib: 'Date limite pour refuser', ic: 'drapeau', requis: true, aide: 'Imprimée dans l’encadré. Par défaut la veille de l’échéance : il peut dire non jusque-là.' },
      { t: 'texte', cle: 'faitA', lib: 'Fait à', ic: 'lieu', requis: true },
      { t: 'date', cle: 'date', lib: 'Le', ic: 'calendrier', requis: true, aide: 'Le jour de l’envoi.' },
    ],
  },
];

/* La fin de la période qui s'ouvre si le client ne dit rien. */
function finSuivante(d: Donnees): string {
  const e = txt(d, 'echeance');
  if (!e) return '';
  const p = plusMois(e, num(d, 'periode') ?? 3);
  const max = txt(d, 'finMax');
  return max && max < p ? max : p;
}

/* ══ Le texte ═══════════════════════════════════════════════════════════ */
function rediger(d: Donnees, A: IdentiteAgence): Partie[] {
  const numero = txt(d, 'mandatNumero');
  const appel = txt(d, 'appel') || 'Madame, Monsieur,';
  const periode = num(d, 'periode') ?? 3;
  const echeance = txt(d, 'echeance'), limite = txt(d, 'dateLimite');
  const suite = finSuivante(d);
  const L = (ymd: string) => (ymd ? jourLong(ymd) : '……………');

  const blocs: Bloc[] = [
    { t: 'fiches', items: [
      { ic: 'agence', titre: A.nom.toUpperCase(), lignes: [`${A.adresse}, ${A.cp} ${A.ville}`, [A.tel, A.mail].filter(Boolean).join(' · ')] },
      { ic: 'personne', titre: txt(d, 'destNom') || '……………', lignes: [
        ...txt(d, 'destAdresse').split(/\n+/).map(x => x.trim()).filter(Boolean),
        ...(d.envoi === 'email' && txt(d, 'destEmail') ? [txt(d, 'destEmail')] : []),
      ] },
    ] },
    Pp(`${txt(d, 'faitA') || '……………'}, le ${L(txt(d, 'date'))} · ${ENVOIS[String(d.envoi)] || ENVOIS.lettre}`),
    P(appel),
    P(`Le ${L(txt(d, 'mandatDate'))}, vous nous avez confié ${txt(d, 'mandatNom') || 'un mandat'} n° ${numero || '……'}${d.quoi !== 'recherche' && txt(d, 'bien') ? `, pour le bien situé ${txt(d, 'bien')}` : ''}. Ce mandat prévoit qu’à chaque échéance, il se poursuit pour une nouvelle période de ${periode} mois${txt(d, 'finMax') ? `, au plus tard jusqu’au ${jourLong(txt(d, 'finMax'))}` : ''}, sauf si l’une des parties y met fin.`),
    P(`Sa prochaine échéance est le ${L(echeance)}. Comme le prévoit l’article L215-1 du Code de la consommation, nous vous informons que vous pouvez choisir de ne pas le poursuivre au-delà de cette date.`),
    P(`DATE LIMITE POUR NE PAS POURSUIVRE LE MANDAT : ${limite ? jourLong(limite).toUpperCase() : '……………'}. Jusqu’à cette date incluse (la date d’envoi faisant foi), il vous suffit de nous l’écrire, par lettre ou par e-mail à ${A.mail} : le mandat prendra alors fin le ${L(echeance)}.`, true),
    P(`Sans demande de votre part, le mandat se poursuivra aux mêmes conditions${suite ? ` jusqu’au ${jourLong(suite)}` : ''}.`),
    P(d.resiliation === 'libre'
      ? 'Vous gardez par ailleurs la faculté d’y mettre fin à tout moment, par lettre recommandée avec avis de réception ou par e-mail, avec un préavis de quinze jours.'
      : 'Passé les trois premiers mois du mandat, vous gardez par ailleurs la faculté d’y mettre fin à tout moment, par lettre recommandée avec avis de réception, avec un préavis de quinze jours (article 78 du décret du 20 juillet 1972).'),
    P(d.quoi === 'recherche'
      ? 'Nous restons à votre disposition pour faire le point avec vous sur votre recherche.'
      : 'Nous restons à votre disposition pour faire le point avec vous sur la vente de votre bien.'),
    P(`Veuillez agréer, ${appel.replace(/[\s,]+$/, '')}, l’expression de nos salutations distinguées.`),
    { t: 'sigs', cases: [{ qui: 'Pour l’Agence', nom: A.nom.toUpperCase(), lignes: [`${A.signataireNom}, ${A.signataireQualite}`] }] },
  ];
  return [{
    titre: `Votre mandat n° ${numero || '……'} : le poursuivre ou non`,
    court: 'Le courrier',
    sous: 'Information prévue par l’article L215-1 du Code de la consommation',
    ic: 'calendrier',
    sections: [{ blocs }],
  }];
}

function resume(): Resume { return []; }

function reperes(d: Donnees, etape: string): Repere[] {
  const out: Repere[] = [];
  if (etape !== 'dates') return out;
  const limite = txt(d, 'dateLimite'), echeance = txt(d, 'echeance'), envoi = txt(d, 'date');
  if (limite && echeance && limite >= echeance) out.push({ l: 'Date limite', v: 'Elle doit tomber avant l’échéance : la veille, au plus tard.', ton: 'alerte' });
  if (limite) {
    const tot = plusMois(limite, -3), tard = plusMois(limite, -1);
    out.push({ l: 'À envoyer entre', v: `le ${jourLong(tot)} et le ${jourLong(tard)}` });
    if (envoi && envoi < tot) out.push({ l: 'Trop tôt', v: `La loi demande trois mois au plus avant la date limite : pas avant le ${jourLong(tot)}.`, ton: 'alerte' });
    if (envoi && envoi > tard) out.push({ l: 'Trop tard', v: 'Moins d’un mois avant la date limite : le client pourra arrêter le mandat à tout moment après l’échéance.', ton: 'alerte' });
    if (envoi && envoi >= tot && envoi <= tard) out.push({ l: 'Dans les temps', v: 'La date d’envoi respecte la fenêtre légale.', ton: 'ok' });
  }
  return out;
}

function manques(d: Donnees): string[] {
  const out: string[] = [];
  if (!txt(d, 'mandatNumero') || !txt(d, 'mandatDate')) out.push('Le numéro et la date du mandat');
  if (!num(d, 'periode')) out.push('La durée des périodes');
  if (!txt(d, 'destNom')) out.push('Le destinataire');
  if (d.envoi === 'email' ? !txt(d, 'destEmail') : !txt(d, 'destAdresse')) out.push(d.envoi === 'email' ? 'L’e-mail du destinataire' : 'L’adresse du destinataire');
  if (!txt(d, 'echeance') || !txt(d, 'dateLimite')) out.push('L’échéance et la date limite');
  if (!txt(d, 'faitA') || !txt(d, 'date')) out.push('Le lieu et la date');
  return out;
}

function defaut(c: Contexte): Donnees {
  const cl = c.client;
  return {
    quoi: 'vente', mandatNom: 'un mandat de vente exclusif', mandatNumero: '', mandatDate: '', bien: '',
    periode: 3, finMax: '', resiliation: 'art78',
    destNom: cl ? [cl.prenom, (cl.nom || '').toUpperCase()].filter(Boolean).join(' ') : '', destAdresse: cl?.adresse || '', destEmail: cl?.emails?.[0] || '',
    appel: 'Madame, Monsieur,', envoi: 'email',
    echeance: '', dateLimite: '', faitA: c.identite.ville, date: aujourdhui(),
  };
}

/* Depuis un mandat signé (vente, ou recherche sur papier) : le
   destinataire, le mandat, et l'échéance visée (ou la prochaine). */
function deriver(src: Source, _id: IdentiteAgence, o: { echeance?: string } = {}): Donnees {
  const s = src.donnees || {};
  const vente = src.modele === 'mandat_vente';
  const personnes = lirePersonnes(vente ? s.vendeurs : s.acquereurs);
  const jour = String(src.signe_le || s.date || '').slice(0, 10);
  const valide = /^\d{4}-\d{2}-\d{2}$/.test(jour);
  const prochaine = valide ? echeances(s, jour).find(e => e.du && e.le >= aujourdhui()) : undefined;
  const echeance = o.echeance || prochaine?.le || '';
  const exclusif = s.type === 'exclusif';
  const civ = new Set(personnes.map(p => p.civilite).filter(Boolean));
  const appel = s.qui === 'sci' || civ.size !== 1 ? 'Madame, Monsieur,' : civ.has('Madame') ? 'Madame,' : 'Monsieur,';
  const sci = s.qui === 'sci';
  return {
    quoi: vente ? 'vente' : 'recherche',
    mandatNom: vente ? `un mandat de vente ${TYPES[typeVente(s)].nom}` : `un mandat de recherche ${exclusif ? 'exclusif' : 'simple'}`,
    mandatNumero: src.numero || txt(s, 'numero'), mandatDate: valide ? jour : '',
    bien: vente ? [txt(s, 'adresse'), [txt(s, 'cp'), txt(s, 'ville')].filter(Boolean).join(' ')].filter(Boolean).join(', ') : '',
    periode: num(s, 'periode') ?? 3,
    finMax: valide ? plusMois(jour, num(s, 'dureeMax') ?? 12) : '',
    resiliation: vente || exclusif ? 'art78' : 'libre',
    destNom: sci ? `${txt(s, 'sciNom') || 'La société'}, à l’attention de ${nomComplet(personnes[0] || lirePersonnes([{}])[0])}` : personnes.map(nomComplet).join(' et '),
    destAdresse: sci ? txt(s, 'sciSiege') : (personnes[0]?.adresse || '').replace(/,\s*(\d{5})/, '\n$1'),
    destEmail: personnes[0]?.email || '',
    appel,
    echeance, dateLimite: echeance ? veille(echeance) : '',
    sourceId: src.id,
    nomCourt: sci ? txt(s, 'sciNom') : nomsCourts(personnes),
  };
}

export const COURRIER_RECONDUCTION: Modele = {
  id: 'courrier_reconduction',
  categorie: 'courriers',
  titre: 'Courrier de reconduction',
  description: 'Avant chaque échéance d’un mandat qui se poursuit : la date limite pour dire non, dans l’encadré que la loi exige (L215-1).',
  ic: 'boucle',
  signataires: 'L’agence seule : il s’envoie, il ne se fait pas signer',
  etapes: ETAPES,
  defaut,
  titreDoc: d => `Courrier de reconduction · ${txt(d, 'nomCourt') || txt(d, 'destNom') || '…'}`,
  sousTitre: d => [txt(d, 'mandatNumero') ? `Mandat n° ${txt(d, 'mandatNumero')}` : '', txt(d, 'echeance') ? `échéance le ${jourLong(txt(d, 'echeance'))}` : ''].filter(Boolean).join(' · '),
  pour: d => txt(d, 'destNom'),
  rediger,
  resume,
  garde: d => ({ titre: 'Courrier', sous: 'reconduction du mandat', etiquette: `MANDAT N° ${txt(d, 'mandatNumero') || '…'}`, lettre: true }),
  entete: d => `Mandat n° ${txt(d, 'mandatNumero') || '…'} · information L215-1`,
  manques,
  badge: () => 'L215-1',
  reperes,
  lien: 'mandat',
  deriver: { de: ['mandat_vente', 'mandat_recherche'], fn: deriver },
  courrier: true,
};
