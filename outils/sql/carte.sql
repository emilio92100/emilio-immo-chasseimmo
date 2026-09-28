-- ═══ La carte : où se trouve chaque adresse (V3.26) ══════════════════════════
-- À passer une fois dans Supabase › SQL Editor. Relançable sans risque :
-- rien n'est effacé, rien n'est modifié ailleurs. Voir src/lib/carte.ts.
--
-- Une adresse cherchée une fois ne se cherche plus : sa position est gardée
-- ici, quel que soit le contact ou le bien qui la porte. Une adresse modifiée
-- sur une fiche est une nouvelle clé, cherchée à son tour à l'ouverture de
-- la carte.
--
-- cle        : l'adresse en minuscules, sans accents ni ponctuation
-- adresse    : telle qu'elle a été cherchée
-- lat, lng   : la position (vide si l'adresse est introuvable)
-- precision  : housenumber (le numéro) · street (la rue) · locality (un
--              lieu-dit) · municipality (la ville seule) · aucun (introuvable)
-- score      : la confiance du géocodeur, de 0 à 1
-- libelle    : l'adresse reconnue (« 38 Rue Fessart 92100 Boulogne-Billancourt »)

create table if not exists geocodes (
  cle text primary key,
  adresse text,
  lat double precision,
  lng double precision,
  precision text not null default 'aucun',
  score real,
  libelle text,
  cherche_le timestamptz not null default now()
);

-- Même serrure que les autres tables : le CRM connecté lit et écrit, la clé
-- publique ne voit rien. L'espace acheteur passe par le serveur.
alter table geocodes enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'geocodes' and policyname = 'crm_authentifie') then
    create policy crm_authentifie on geocodes for all to authenticated using (true) with check (true);
  end if;
end $$;

-- Vérification : doit renvoyer 2 lignes, toutes à « oui ».
select 'table geocodes' as quoi, case when exists (select 1 from pg_class where relname = 'geocodes' and relrowsecurity) then 'oui' else 'NON' end as present
union all
select 'droit du CRM', case when exists (select 1 from pg_policies where tablename = 'geocodes' and policyname = 'crm_authentifie') then 'oui' else 'NON' end;
