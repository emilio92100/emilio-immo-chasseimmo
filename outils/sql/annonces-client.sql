-- ═══ Les annonces envoyées par le client depuis son espace (V3.184) ═══════
-- À passer une fois dans Supabase › SQL Editor. Relançable sans risque :
-- rien n'est effacé, aucune donnée n'est modifiée.
--
-- Alexandre : « si mon client m'envoie des liens ou des annonces, qu'il
-- puisse le faire depuis son espace ». Le client colle un lien, ou prend une
-- photo (une affiche en vitrine, un panneau « À vendre »), dit ce qui lui
-- plaît et laisse un mot. Une ligne par annonce envoyée.
--
--   nouveau → Alexandre la regarde (onglet Veille de la fiche du client) ;
--             « Remplir la fiche » y garde la fiche préparée (fiche, V3.185)
--   retenu  → il l'a retenue : le bien est en Sélection (bien_id)
--   ecarte  → il l'a écartée, avec un mot que le client lit (reponse)
--
-- Sans cette table, l'espace et le CRM marchent comme avant : la carte
-- « Une annonce repérée ? » ne s'affiche pas.

create table if not exists annonces_client (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete cascade,
  recherche_id uuid references recherches(id) on delete cascade,
  url text,                                   -- le lien, nettoyé (sans #, sans utm_…)
  portail text,                               -- « Leboncoin », « SeLoger »… ou l'adresse du site
  photos text[] not null default '{}',        -- ses photos (bucket photos-biens, annonces/<id>/…)
  aime text[] not null default '{}',          -- « ce qui vous plaît » : Le quartier, La lumière…
  mot text,                                   -- son mot pour Alexandre
  statut text not null default 'nouveau',     -- nouveau | retenu | ecarte
  reponse text,                               -- le mot d'Alexandre quand il l'écarte (lu par le client)
  avis text,                                  -- l'avis d'Alexandre quand il la retient (lu par le client)
  decide_le timestamptz,
  bien_id uuid references biens(id) on delete set null,
  created_at timestamptz not null default now()
);

-- V3.185 : la fiche remplie depuis l'annonce, gardée dans Veille jusqu'à
-- « Retenir » (la ligne `biens` à poser). Pour ceux qui ont déjà passé ce
-- fichier : cette seule ligne suffit.
alter table annonces_client add column if not exists fiche jsonb;

create index if not exists annonces_client_recherche_idx on annonces_client (recherche_id, created_at desc);
create index if not exists annonces_client_bien_idx on annonces_client (bien_id);

-- Même serrure que les autres tables : le CRM connecté lit et écrit tout,
-- la clé publique ne voit rien. L'espace du client passe par le serveur.
alter table annonces_client enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'annonces_client' and policyname = 'crm_authentifie') then
    create policy crm_authentifie on annonces_client for all to authenticated using (true) with check (true);
  end if;
end $$;

-- Une annonce qu'il a envoyée lui-même lui plaît déjà : quand Alexandre
-- envoie le bien (Sélection → Présentés), il arrive dans « Ça lui plaît »,
-- jamais dans « En attente de son retour ». Ça marche quel que soit le
-- bouton d'envoi (mail, lien, envoi groupé, page Biens).
create or replace function annonce_client_presentee() returns trigger
language plpgsql as $$
declare propose_le timestamptz;
begin
  if new.etape = 'presente' and old.etape is distinct from 'presente'
     and (new.badge_retour is null or new.badge_retour = 'propose') then
    select a.created_at into propose_le from annonces_client a
      where a.bien_id = new.id and a.statut = 'retenu'
      order by a.created_at limit 1;
    if propose_le is not null then
      new.badge_retour := 'interesse';
      if new.retour_le is null then new.retour_le := propose_le; end if;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists annonce_client_presentee on biens;
create trigger annonce_client_presentee before update on biens
  for each row execute function annonce_client_presentee();

-- Vérification : doit renvoyer 1 ligne, avec rls = true, politiques = 1 et declencheur = 1.
select c.relname as table_name, c.relrowsecurity as rls,
       (select count(*) from pg_policies p where p.tablename = 'annonces_client') as politiques,
       (select count(*) from pg_trigger t where t.tgname = 'annonce_client_presentee') as declencheur
from pg_class c where c.relname = 'annonces_client';
