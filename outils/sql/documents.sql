-- ═══ Documents juridiques : la table des documents ═══════════════════════
-- À passer une fois dans Supabase › SQL Editor. Relançable sans risque.
-- Un document = un modèle (mandat de vente, offre d'achat, bon de visite…)
-- et ses réponses. Voir src/lib/actes/ pour les modèles.

create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  modele text not null,                    -- mandat_vente | offre_achat | bon_visite
  categorie text not null,                 -- mandats_vente | offres | bons_visite
  statut text not null default 'brouillon',-- brouillon | pret | signe | annule
  titre text,                              -- « Mandat exclusif · M. et Mme Martin »
  sous_titre text,                         -- l'adresse du bien
  badge text,                              -- « Exclusif »
  numero text,                             -- n° du registre des mandats
  donnees jsonb not null default '{}',     -- les réponses
  identite jsonb,                          -- l'identité de l'agence, figée à la finalisation
  client_id uuid references clients(id) on delete set null,
  recherche_id uuid references recherches(id) on delete set null,
  bien_id uuid references biens(id) on delete set null,
  pdf_chemin text,                         -- le PDF figé (bucket « mandats », dossier documents/)
  signe_chemin text,                       -- l'exemplaire signé, déposé
  finalise_le timestamptz,
  signe_le timestamptz,
  annule_le timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists documents_categorie_idx on documents (categorie, updated_at desc);
create index if not exists documents_client_idx on documents (client_id);

-- Même serrure que les autres tables : le CRM connecté lit et écrit tout,
-- la clé publique ne voit rien.
alter table documents enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'documents' and policyname = 'crm_authentifie') then
    create policy crm_authentifie on documents for all to authenticated using (true) with check (true);
  end if;
end $$;

-- Vérification : doit renvoyer 1 ligne, avec rls = true.
select c.relname as table_name, c.relrowsecurity as rls,
       (select count(*) from pg_policies p where p.tablename = 'documents') as politiques
from pg_class c where c.relname = 'documents';
