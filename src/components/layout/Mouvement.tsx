'use client';

/* Le mouvement du CRM (V3.152, style « C · Depuis le bouton ») : monté une
   fois, dans AppLayout. Tout se passe dans src/lib/mouvement.ts, qui dit
   comment ça marche et comment s'en retirer (`data-emi-anim="non"`). */

import { useEffect } from 'react';
import { demarrerMouvement } from '@/lib/mouvement';

export default function Mouvement() {
  useEffect(() => demarrerMouvement(), []);
  return null;
}
