'use client';
import { useState, type CSSProperties } from 'react';
import { Ic } from '@/components/documents/ApercuActe';
import { etapeDe, type BienVente } from '@/lib/biens-vente';
import {
  ETAPES_DIFFUSEES, SUPPORTS, SUPPORTS_DEFAUT, etapeHorsVente, lireDiffusion, nomsSupports, nouvelleDiffusion, supportsCoches,
  type Diffusion, type Support,
} from '@/lib/diffusion';
import { Fenetre } from './FenetresBien';
import s from '@/components/documents/Documents.module.css';
import b from './Biens.module.css';

/* ═══ La diffusion d'un bien (V3.91) ═══════════════════════════════════════
   Le bouton du bandeau de la fiche l'ouvre (et « ⋯ › Diffusion de
   l'annonce ») ; elle s'ouvre aussi toute seule quand le mandat vient d'être
   signé (`premiere`). En haut, l'interrupteur « Diffusion en cours / Non
   diffusé » ; dessous, une tuile par support, à cocher. Rien n'est écrit
   avant « Enregistrer » : la fiche range le réglage dans
   `donnees.diffusion` (lib/diffusion.ts).

   V3.96 : hors des étapes de vente (retiré, vendu, estimation…), elle
   s'ouvre depuis « ⋯ › Diffusion de l'annonce » et l'interrupteur dit
   « Diffuser quand même » : le bien part alors comme s'il était en vente,
   jusqu'à ce que son étape change. */

export default function FenDiffusion({ bien, premiere, onFermer, onEnregistrer }: {
  bien: BienVente; premiere?: boolean; onFermer: () => void; onEnregistrer: (d: Diffusion) => void;
}) {
  const avant = lireDiffusion(bien.donnees);
  const hors = etapeHorsVente(bien.etape);
  /* Hors vente, l'interrupteur part éteint, sauf s'il a été allumé à cette étape. */
  const [actif, setActif] = useState(hors ? !!avant && avant.actif && avant.horsEtape === bien.etape : avant ? avant.actif : true);
  const [choix, setChoix] = useState<Record<Support, boolean>>(avant ? avant.supports : SUPPORTS_DEFAUT);
  const et = etapeDe(bien.etape);
  const enPause = bien.etape === 'suspendu';
  const etapeOk = ETAPES_DIFFUSEES.includes(bien.etape);
  const coches = supportsCoches(choix);
  const basculer = (k: Support) => setChoix(c => ({ ...c, [k]: !c[k] }));

  /* En pause, l'interrupteur dit ce qui se passera à la reprise. */
  const vif = actif && (etapeOk || hors);
  const titre = hors ? (actif ? 'Diffusé quand même' : 'Non diffusé') : !etapeOk ? (actif ? 'Diffusion en pause' : 'Non diffusé') : actif ? 'Diffusion en cours' : 'Non diffusé';
  const phrase = hors
    ? (actif
      ? (coches.length ? `Le bien est « ${et.lib} », mais l’annonce part sur ${nomsSupports(coches)} comme s’il était en vente. Si son étape change, la diffusion s’arrête.` : 'Coche au moins un support.')
      : `À l’étape « ${et.lib} », rien ne part. Active pour le diffuser quand même, comme s’il était en vente.`)
    : !etapeOk
    ? (!actif ? 'Coupé à la main : rien ne repartira à la reprise.' : enPause ? `La vente est en pause : rien ne part.${coches.length ? ` À la reprise, l’annonce repartira sur ${nomsSupports(coches)}.` : ''}` : 'À cette étape, rien ne part.')
    : !actif ? 'L’annonce ne part nulle part, quels que soient les supports cochés.'
    : coches.length ? `L’annonce part sur ${nomsSupports(coches)}.` : 'Coche au moins un support.';

  return (
    <Fenetre sur={`${et.lib}${bien.reference ? ` · ${bien.reference}` : ''}`} couleur={et.c} titre={premiere ? 'Le mandat est signé : où part l’annonce ?' : 'La diffusion du bien'}
      sous="Tu peux la changer à tout moment, d’un clic sur le bouton du bandeau." onFermer={onFermer}
      pied={<>
        <button type="button" className={s.btn} onClick={onFermer}>{premiere ? 'Plus tard' : 'Annuler'}</button>
        <button type="button" className={`${s.btn} ${s.btnNavy}`} onClick={() => onEnregistrer(nouvelleDiffusion(actif, choix, hors && actif ? bien.etape : null))}><Ic n="check" t={15} e={2.4} />Enregistrer</button>
      </>}>
      <button type="button" role="switch" aria-checked={actif} className={b.diffInter} data-on={actif ? 'oui' : undefined} data-vif={vif ? 'oui' : undefined} onClick={() => setActif(v => !v)}>
        <span className={b.diffInterIc}><Ic n={vif ? 'megaphone' : 'pause'} t={20} /></span>
        <span className={b.diffInterT}>
          <b>{titre}</b>
          <small>{phrase}</small>
        </span>
        <span className={b.diffBascule} aria-hidden="true"><span /></span>
      </button>

      <div className={b.diffSupports} data-eteint={!vif ? 'oui' : undefined} role="group" aria-label="Les supports">
        {SUPPORTS.map((x, i) => {
          const on = !!choix[x.k];
          return (
            <button key={x.k} type="button" role="checkbox" aria-checked={on} className={b.diffSupport} data-on={on ? 'oui' : undefined}
              style={{ ['--spC' as string]: x.c, ['--spFond' as string]: x.fond, animationDelay: `${i * 45}ms` } as CSSProperties} onClick={() => basculer(x.k)}>
              <span className={b.diffPuce}>{x.court}</span>
              <span className={b.diffSupportT}><b>{x.lib}</b><small>{x.sous}</small></span>
              <span className={b.diffCase}><Ic n="check" t={14} e={3} /></span>
            </button>
          );
        })}
      </div>

      <div className={b.diffNote}>
        <Ic n="horloge" t={16} />
        <span>Ton site suit déjà ces choix (en une minute environ). Les portails reçoivent encore les annonces d’ImmoFacile pour quelques jours : ces choix serviront dès que le CRM les leur enverra, rien à refaire ce jour-là.</span>
      </div>
    </Fenetre>
  );
}
