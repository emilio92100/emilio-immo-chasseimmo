'use client';
import { useState, type CSSProperties } from 'react';
import { Ic } from '@/components/documents/ApercuActe';
import { etapeDe, type BienVente } from '@/lib/biens-vente';
import {
  ETAPES_DIFFUSEES, SUPPORTS, SUPPORTS_DEFAUT, lireDiffusion, nomsSupports, nouvelleDiffusion, supportsCoches,
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
   `donnees.diffusion` (lib/diffusion.ts). */

export default function FenDiffusion({ bien, premiere, onFermer, onEnregistrer }: {
  bien: BienVente; premiere?: boolean; onFermer: () => void; onEnregistrer: (d: Diffusion) => void;
}) {
  const avant = lireDiffusion(bien.donnees);
  const [actif, setActif] = useState(avant ? avant.actif : true);
  const [choix, setChoix] = useState<Record<Support, boolean>>(avant ? avant.supports : SUPPORTS_DEFAUT);
  const et = etapeDe(bien.etape);
  const enPause = bien.etape === 'suspendu';
  const etapeOk = ETAPES_DIFFUSEES.includes(bien.etape);
  const coches = supportsCoches(choix);
  const basculer = (k: Support) => setChoix(c => ({ ...c, [k]: !c[k] }));

  /* En pause, l'interrupteur dit ce qui se passera à la reprise. */
  const titre = !etapeOk ? (actif ? 'Diffusion en pause' : 'Non diffusé') : actif ? 'Diffusion en cours' : 'Non diffusé';
  const phrase = !etapeOk
    ? (!actif ? 'Coupé à la main : rien ne repartira à la reprise.' : enPause ? `La vente est en pause : rien ne part.${coches.length ? ` À la reprise, l’annonce repartira sur ${nomsSupports(coches)}.` : ''}` : 'À cette étape, rien ne part.')
    : !actif ? 'L’annonce ne part nulle part, quels que soient les supports cochés.'
    : coches.length ? `L’annonce part sur ${nomsSupports(coches)}.` : 'Coche au moins un support.';

  return (
    <Fenetre sur={`${et.lib}${bien.reference ? ` · ${bien.reference}` : ''}`} couleur={et.c} titre={premiere ? 'Le mandat est signé : où part l’annonce ?' : 'La diffusion du bien'}
      sous="Tu peux la changer à tout moment, d’un clic sur le bouton du bandeau." onFermer={onFermer}
      pied={<>
        <button type="button" className={s.btn} onClick={onFermer}>{premiere ? 'Plus tard' : 'Annuler'}</button>
        <button type="button" className={`${s.btn} ${s.btnNavy}`} onClick={() => onEnregistrer(nouvelleDiffusion(actif, choix))}><Ic n="check" t={15} e={2.4} />Enregistrer</button>
      </>}>
      <button type="button" role="switch" aria-checked={actif} className={b.diffInter} data-on={actif ? 'oui' : undefined} data-vif={actif && etapeOk ? 'oui' : undefined} onClick={() => setActif(v => !v)}>
        <span className={b.diffInterIc}><Ic n={actif && etapeOk ? 'megaphone' : 'pause'} t={20} /></span>
        <span className={b.diffInterT}>
          <b>{titre}</b>
          <small>{phrase}</small>
        </span>
        <span className={b.diffBascule} aria-hidden="true"><span /></span>
      </button>

      <div className={b.diffSupports} data-eteint={!actif || !etapeOk ? 'oui' : undefined} role="group" aria-label="Les supports">
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
        <span>Pour quelques jours encore, le site et les portails reçoivent les annonces d’ImmoFacile. Ces choix serviront dès que le CRM les enverra lui-même : rien à refaire ce jour-là.</span>
      </div>
    </Fenetre>
  );
}
