-- ═══ Signer les documents en ligne ou sur place ═════════════════════════════
-- À passer une fois dans Supabase › SQL Editor, AVANT de mettre le code en
-- ligne. Relançable sans risque : rien n'est effacé, rien n'est modifié.
-- Voir src/lib/signature-documents.ts.

-- 1. Le document : quand la signature a été lancée (et l'agence a signé),
--    et la dernière version scellée. { mode, lance_le, agence_le, deroule,
--    empreinte, version, versions, seul_chemin, scelle_chemin, scelle_le,
--    assemble_chemin, complet_le, envoye_le, classe_le }
alter table documents add column if not exists signature jsonb;

-- 2. Ceux qui signent : un par ligne, chacun son code (et, en ligne, son
--    lien). statut : attendu (sur place) · invite (son lien est parti) ·
--    signe · annule (signature arrêtée).
create table if not exists documents_signataires (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents(id) on delete cascade,
  cle text not null,                               -- son cadre dans le document : v0, v1, conjoint, a0, sci…
  rang integer not null default 1,
  role text,                                       -- « Le mandant », « Le conjoint », « L’acquéreur »…
  nom text,                                        -- le nom imprimé dans son cadre
  mode text not null default 'en_ligne',           -- en_ligne · sur_place
  statut text not null default 'invite',
  personne jsonb not null default '{}'::jsonb,     -- { civilite, prenom, nom, email, telephone, adresse }
  jeton text unique,                               -- en ligne : son lien /signer/<jeton>
  lien_expire_le timestamptz,
  invite_le timestamptz,
  ouvert_le timestamptz,
  relances integer not null default 0,             -- 1 et 2 : les rappels ; 3 : Alexandre prévenu du délai
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
  griffe_chemin text,                              -- sa signature tracée, dans le dossier privé
  deroule jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists documents_signataires_document_idx on documents_signataires (document_id, rang);
create index if not exists documents_signataires_statut_idx on documents_signataires (statut);

-- Même serrure que les autres tables : le CRM connecté lit et écrit tout,
-- la clé publique ne voit rien. La page du signataire lit côté serveur.
alter table documents_signataires enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'documents_signataires' and policyname = 'crm_authentifie') then
    create policy crm_authentifie on documents_signataires for all to authenticated using (true) with check (true);
  end if;
end $$;

-- Vérification : doit renvoyer 2 lignes, toutes à « oui ».
select 'documents.signature' as quoi, case when exists (select 1 from information_schema.columns where table_name = 'documents' and column_name = 'signature') then 'oui' else 'NON' end as present
union all
select 'documents_signataires (RLS)', case when exists (select 1 from pg_class where relname = 'documents_signataires' and relrowsecurity) then 'oui' else 'NON' end;
