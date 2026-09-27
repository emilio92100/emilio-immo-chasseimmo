-- ═══ Les biens en vente (rubrique « Biens en vente » du CRM) ═══════════════
-- À passer une fois dans Supabase › SQL Editor, AVANT de mettre le code en
-- ligne. Relançable sans risque : rien n'est effacé, rien n'est modifié.
-- Voir src/lib/biens-vente.ts.

-- 1. Le bien. Les colonnes servent à la liste et à la recherche ; tout le
--    reste (pièces, énergie, copropriété, visite, annonce, photos, pièces du
--    dossier…) vit dans `donnees`, comme les documents juridiques.
create table if not exists biens_vente (
  id uuid primary key default gen_random_uuid(),
  reference text,                                  -- EMI-V-2026-001
  etape text not null default 'estimation',        -- estimation · mandat · suspendu · offre · compromis · vendu · retire
  archive boolean not null default false,
  client_id uuid references clients(id) on delete set null,       -- le propriétaire, s'il a une fiche
  document_id uuid references documents(id) on delete set null,   -- le mandat de vente (rubrique Documents)
  titre text,
  type_bien text,
  adresse text,
  code_postal text,
  ville text,
  quartier text,
  prix numeric,
  surface numeric,
  nb_pieces integer,
  nb_chambres integer,
  etage integer,
  mandat_type text,                                -- simple · semi · exclusif
  mandat_numero text,
  mandat_fin date,
  photo text,                                      -- la photo principale, pour la liste
  donnees jsonb not null default '{}'::jsonb,
  etape_le timestamptz,                            -- quand il est entré dans son étape
  en_vente_le timestamptz,                         -- le jour du mandat : « 8 j en vente »
  vendu_le date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists biens_vente_etape_idx on biens_vente (archive, etape);
create index if not exists biens_vente_client_idx on biens_vente (client_id);

-- 2. Son suivi : les visites faites avec quelqu'un hors du CRM, les offres,
--    les changements d'étape, les notes. Les visites des acheteurs suivis
--    vivent dans `visites` (voir le 3), comme toutes les autres.
create table if not exists biens_vente_suivi (
  id uuid primary key default gen_random_uuid(),
  bien_id uuid not null references biens_vente(id) on delete cascade,
  type text not null,                              -- visite · offre · etape · note · prix
  le timestamptz not null default now(),           -- la visite : sa date et son heure
  qui text,                                        -- « Couple Nguyen (SeLoger) »
  client_id uuid references clients(id) on delete set null,
  recherche_id uuid references recherches(id) on delete set null,
  montant numeric,
  statut text,                                     -- visite : a_venir · faite · annulee ; offre : en_attente · acceptee · refusee · contre · retiree
  avis text,                                       -- visite : offre · revoir · reflexion · non (les mots de src/lib/visites.ts)
  commentaire text,
  donnees jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists biens_vente_suivi_bien_idx on biens_vente_suivi (bien_id, le desc);

-- 3. Un bien en vente présenté à un acheteur suivi : sa copie dans le dossier
--    de l'acheteur (table biens) garde le lien. C'est par là que la fiche du
--    bien retrouve à qui il a été présenté, ce qu'ils en ont dit et leurs visites.
alter table biens add column if not exists bien_vente_id uuid references biens_vente(id) on delete set null;
create index if not exists biens_bien_vente_idx on biens (bien_vente_id);

-- Même serrure que les autres tables : le CRM connecté lit et écrit tout,
-- la clé publique ne voit rien.
alter table biens_vente enable row level security;
alter table biens_vente_suivi enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'biens_vente' and policyname = 'crm_authentifie') then
    create policy crm_authentifie on biens_vente for all to authenticated using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'biens_vente_suivi' and policyname = 'crm_authentifie') then
    create policy crm_authentifie on biens_vente_suivi for all to authenticated using (true) with check (true);
  end if;
end $$;

-- 4. Les photos : un bucket public à part (les annonces sont publiques),
--    que le CRM connecté remplit. Pas dans « photos-biens » : retirer un bien
--    du dossier d'un acheteur y efface ses photos, et elles sont partagées.
insert into storage.buckets (id, name, public) values ('photos-vente', 'photos-vente', true)
on conflict (id) do nothing;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'photos_vente_crm') then
    create policy photos_vente_crm on storage.objects for all to authenticated
      using (bucket_id = 'photos-vente') with check (bucket_id = 'photos-vente');
  end if;
end $$;

-- Vérification : doit renvoyer 5 lignes, toutes à « oui ».
select 'biens_vente' as quoi, case when exists (select 1 from pg_class where relname = 'biens_vente' and relrowsecurity) then 'oui' else 'NON' end as present
union all
select 'biens_vente_suivi', case when exists (select 1 from pg_class where relname = 'biens_vente_suivi' and relrowsecurity) then 'oui' else 'NON' end
union all
select 'biens.bien_vente_id', case when exists (select 1 from information_schema.columns where table_name = 'biens' and column_name = 'bien_vente_id') then 'oui' else 'NON' end
union all
select 'bucket photos-vente', case when exists (select 1 from storage.buckets where id = 'photos-vente' and public) then 'oui' else 'NON' end
union all
select 'photos : droit d''écrire', case when exists (select 1 from pg_policies where schemaname = 'storage' and policyname = 'photos_vente_crm') then 'oui' else 'NON' end;
