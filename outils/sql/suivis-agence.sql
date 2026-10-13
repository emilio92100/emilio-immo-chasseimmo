-- ═══ Le suivi avec l'agence, sous chaque bien présenté (V3.182) ═══════════
-- À passer une fois dans Supabase › SQL Editor. Relançable sans risque :
-- rien n'est effacé, rien n'est modifié.
--
-- Alexandre : « un compte rendu que je garde en interne pour chaque bien où
-- il veut visiter, ou même ça lui plaît : qui contacter, ce qui a été dit
-- avec l'agence ou le propriétaire, les créneaux ». Une ligne par note ou
-- par appel, sous le bien (onglet Présentés de la fiche du client).
-- Interne : l'espace du client ne lit jamais cette table.
--
-- Sans cette table, le reste du CRM marche comme avant : le bloc « Mon suivi
-- avec l'agence » dit seulement qu'il est à activer.

create table if not exists suivis_agence (
  id uuid primary key default gen_random_uuid(),
  bien_id uuid not null references biens(id) on delete cascade,
  recherche_id uuid references recherches(id) on delete set null,
  client_id uuid references clients(id) on delete set null,
  genre text not null default 'note',        -- note | appel
  avec text,                                  -- agence | proprietaire | autre
  contact jsonb not null default '{}',        -- { nom, interlocuteur, tel, email }
  reponse text,                               -- repondu | message | sans_reponse
  dispo text,                                 -- disponible | sous_offre | vendu
  texte text,                                 -- ce qui a été dit, ou la note
  creneaux jsonb not null default '[]',       -- [{ "date": "2026-10-16", "heure": "18:00" }]
  ensuite text,                               -- attente | rappeler
  rappel_le date,                             -- « Rappeler le… » (une relance est créée)
  relance_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists suivis_agence_bien_idx on suivis_agence (bien_id, created_at desc);
create index if not exists suivis_agence_recherche_idx on suivis_agence (recherche_id);

-- Même serrure que les autres tables : le CRM connecté lit et écrit tout,
-- la clé publique ne voit rien.
alter table suivis_agence enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'suivis_agence' and policyname = 'crm_authentifie') then
    create policy crm_authentifie on suivis_agence for all to authenticated using (true) with check (true);
  end if;
end $$;

-- Vérification : doit renvoyer 1 ligne, avec rls = true et politiques = 1.
select c.relname as table_name, c.relrowsecurity as rls,
       (select count(*) from pg_policies p where p.tablename = 'suivis_agence') as politiques
from pg_class c where c.relname = 'suivis_agence';
