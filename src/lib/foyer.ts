/* ══ Une personne, ou un couple ═══════════════════════════════════════════

   Une fiche client peut réunir deux personnes : « Un couple », choisi à la
   création ou dans « Modifier le contact », ou posé tout seul quand le client
   ajoute son conjoint en signant son mandat dans son espace.

     clients.civilite   'Monsieur' | 'Madame' — la personne 1, le contact principal
     clients.couple     vrai : la fiche réunit deux personnes
     clients.conjoint   la personne 2 { civilite, prenom, nom, email, telephone,
                        naissanceDate?, naissanceLieu? }

   Les e-mails et téléphones de la fiche (emails, telephones) restent ceux de
   la personne 1 : c'est elle qui reçoit les mails et qui a l'espace. La
   personne 2 signe le mandat avec son propre lien.

   Colonnes posées par outils/sql/signature-plusieurs.sql : avant ce SQL,
   elles n'existent pas, et tout se lit comme « une personne ».
   ════════════════════════════════════════════════════════════════════════ */

export type Conjoint = {
  civilite?: string; prenom?: string; nom?: string; email?: string; telephone?: string;
  naissanceDate?: string; naissanceLieu?: string;
};

export function conjointDe(v: unknown): Conjoint | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const t = (x: unknown) => (typeof x === 'string' ? x.trim() : '');
  const c: Conjoint = {
    civilite: t(o.civilite), prenom: t(o.prenom), nom: t(o.nom), email: t(o.email), telephone: t(o.telephone),
    ...(t(o.naissanceDate) ? { naissanceDate: t(o.naissanceDate) } : {}),
    ...(t(o.naissanceLieu) ? { naissanceLieu: t(o.naissanceLieu) } : {}),
  };
  return c.prenom || c.nom ? c : null;
}

/* « Paul et Claire Martin », « Paul Martin et Claire Durand », ou « Paul Martin ». */
export function nomFoyer(c: { prenom?: string | null; nom?: string | null; couple?: boolean | null; conjoint?: unknown }): string {
  const p = `${c.prenom || ''} ${c.nom || ''}`.trim();
  const j = c.couple ? conjointDe(c.conjoint) : null;
  if (!j) return p;
  const memeNom = (j.nom || '').toLowerCase() === String(c.nom || '').trim().toLowerCase();
  if (memeNom && c.prenom && j.prenom) return `${c.prenom} et ${j.prenom} ${c.nom || ''}`.trim();
  return `${p} et ${`${j.prenom || ''} ${j.nom || ''}`.trim()}`;
}
