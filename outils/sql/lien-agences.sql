-- ═══ Le lien pour les agences (V3.197) ═════════════════════════════════════
-- À passer une fois dans Supabase › SQL Editor. Relançable sans risque :
-- rien n'est effacé, aucune donnée n'est modifiée.
--
-- Alexandre : « quand j'appelle une agence et qu'elle me dit d'aller voir sur
-- son site, comment fluidifier pour que je le reçoive en veille ? ». Chaque
-- recherche a son lien (recherches.token_agences) ; l'agence y colle le lien
-- de son annonce (ou des photos, l'adresse, le prix), et le bien arrive dans
-- l'onglet Veille, lu et analysé : une ligne par bien proposé.
--
--   nouveau → dans l'onglet Veille, « Proposés par des agences »
--   retenu  → le bien est en Sélection (bien_id), avec l'agence et son numéro
--   ecarte  → écarté ; l'agence n'en sait rien

alter table recherches add column if not exists token_agences text;
create unique index if not exists recherches_token_agences_idx on recherches (token_agences) where token_agences is not null;

create table if not exists propositions_agences (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete cascade,
  recherche_id uuid references recherches(id) on delete cascade,
  url text,                                   -- le lien de l'annonce, nettoyé
  portail text,                               -- « SeLoger », « Leboncoin »… ou l'adresse du site
  photos text[] not null default '{}',        -- ses photos, quand le bien n'est pas en ligne
  adresse text, prix numeric, surface numeric,
  mot text,                                   -- son mot pour Alexandre
  agence text, interlocuteur text, tel text, email text,
  lecture text,                               -- ok | partielle | echec | sans_lien
  fiche jsonb,                                -- la fiche lue sur l'annonce, et son analyse
  statut text not null default 'nouveau',     -- nouveau | retenu | ecarte
  bien_id uuid references biens(id) on delete set null,
  decide_le timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists propositions_agences_recherche_idx on propositions_agences (recherche_id, created_at desc);

-- Même serrure que les autres tables : le CRM connecté lit et écrit tout,
-- la clé publique ne voit rien. La page de l'agence passe par le serveur.
alter table propositions_agences enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'propositions_agences' and policyname = 'crm_authentifie') then
    create policy crm_authentifie on propositions_agences for all to authenticated using (true) with check (true);
  end if;
end $$;

-- Vérification : doit renvoyer 1 ligne, avec rls = true, politiques = 1 et colonne = 1.
select c.relname as table_name, c.relrowsecurity as rls,
       (select count(*) from pg_policies p where p.tablename = 'propositions_agences') as politiques,
       (select count(*) from information_schema.columns where table_name = 'recherches' and column_name = 'token_agences') as colonne
from pg_class c where c.relname = 'propositions_agences';
