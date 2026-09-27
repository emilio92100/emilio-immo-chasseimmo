-- ═══ Signer le mandat à plusieurs, ou via une société ═══════════════════
-- À passer une fois dans Supabase › SQL Editor, AVANT de mettre le code en
-- ligne. Relançable sans risque : rien n'est effacé, rien n'est modifié.
-- Voir src/lib/cosignature.ts et src/lib/foyer.ts.

-- 1. La fiche client : une personne, ou un couple.
--    civilite : la personne 1 (le contact principal) ; conjoint : la
--    personne 2 { civilite, prenom, nom, email, telephone, naissanceDate?,
--    naissanceLieu? }. Les e-mails et téléphones de la fiche restent ceux
--    de la personne 1.
alter table clients add column if not exists civilite text;
alter table clients add column if not exists couple boolean not null default false;
alter table clients add column if not exists conjoint jsonb;

-- 2. La signature du mandat : la société qu'il représente, son Kbis, et sa
--    signature tracée au doigt (gardée pour refaire le PDF à chaque
--    nouvelle signature). Le statut gagne deux valeurs, sans contrainte à
--    changer : 'partiel' (il a signé, on attend les autres) et, pour mémoire,
--    'abandonne'.
alter table mandats_signatures add column if not exists societe jsonb;
alter table mandats_signatures add column if not exists kbis_chemin text;
alter table mandats_signatures add column if not exists griffe_chemin text;

-- 3. Ceux qui signent avec lui : un par ligne, chacun son lien et son code.
--    statut : prevu · invite · signe · decline · annule · retracte
create table if not exists mandats_cosignataires (
  id uuid primary key default gen_random_uuid(),
  signature_id uuid not null references mandats_signatures(id) on delete cascade,
  recherche_id uuid references recherches(id) on delete set null,
  rang integer not null default 2,               -- 2 = le premier co-signataire
  statut text not null default 'prevu',
  saisi jsonb not null default '{}'::jsonb,       -- ce que le premier a saisi pour lui
  personne jsonb not null default '{}'::jsonb,    -- ce qu'il a vérifié (et corrigé) lui-même
  jeton text unique,                              -- son lien : /signer/<jeton>
  lien_expire_le timestamptz,
  invite_le timestamptz,
  ouvert_le timestamptz,
  relances integer not null default 0,            -- 1 et 2 : les rappels ; 3 : Alexandre prévenu du délai
  relance_le timestamptz,
  code_hash text,
  code_expire_le timestamptz,
  code_essais integer not null default 0,
  codes_envoyes integer not null default 0,
  code_envoye_le timestamptz,
  signe_le timestamptz,
  ip text,
  appareil text,
  email_verifie text,
  execution_immediate boolean,                    -- sa propre demande : la mission commence dès sa signature
  griffe_chemin text,
  decline_le timestamptz,
  retracte_le timestamptz,
  deroule jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

-- (au cas où la table aurait été créée par une version précédente de ce fichier)
alter table mandats_cosignataires add column if not exists execution_immediate boolean;

create index if not exists mandats_cosignataires_signature_idx on mandats_cosignataires (signature_id, rang);
create index if not exists mandats_cosignataires_statut_idx on mandats_cosignataires (statut);

-- Même serrure que les autres tables : le CRM connecté lit et écrit tout,
-- la clé publique ne voit rien. La page du co-signataire lit côté serveur.
alter table mandats_cosignataires enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'mandats_cosignataires' and policyname = 'crm_authentifie') then
    create policy crm_authentifie on mandats_cosignataires for all to authenticated using (true) with check (true);
  end if;
end $$;

-- Vérification : doit renvoyer 3 lignes, toutes à « oui ».
select 'clients.couple' as quoi, case when exists (select 1 from information_schema.columns where table_name = 'clients' and column_name = 'couple') then 'oui' else 'NON' end as present
union all
select 'mandats_signatures.societe', case when exists (select 1 from information_schema.columns where table_name = 'mandats_signatures' and column_name = 'societe') then 'oui' else 'NON' end
union all
select 'mandats_cosignataires (RLS)', case when exists (select 1 from pg_class where relname = 'mandats_cosignataires' and relrowsecurity) then 'oui' else 'NON' end;
