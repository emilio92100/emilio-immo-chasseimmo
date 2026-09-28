'use client';
import { Ic } from '@/components/documents/ApercuActe';

/* « Voir sur la carte » (V3.26), à côté de l'adresse d'une fiche : la
   rubrique Carte s'ouvre en glissant, se pose sur ce contact ou ce bien, et
   ouvre sa carte de visite. `focus` : « c:<id du contact> » ou « b:<id du bien> ». */
export default function BoutonCarte({ focus, onNavigate, sombre = false }: {
  focus: string;
  onNavigate: (page: string, data?: unknown) => void;
  sombre?: boolean;
}) {
  return (
    <button type="button" className={`bouton-carte${sombre ? ' bouton-carte-sombre' : ''}`}
      onClick={() => onNavigate('carte', { focus })}>
      <Ic n="carte" t={14} e={2} /><span>Voir sur la carte</span>
    </button>
  );
}
