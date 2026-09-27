-- ═══ V3.14 · Les types de contact ═══════════════════════════════════════
-- Un contact n'est plus forcément un acheteur : il peut être vendeur,
-- propriétaire, notaire, gardien, confrère (ou agence), partenaire
-- (courtier, diagnostiqueur, artisan…), et plusieurs à la fois.
--
--   types   : les types cochés, ex. {acheteur,vendeur}. Les dossiers déjà
--             créés sont des acheteurs (valeur par défaut).
--   pro     : ce qui est propre à chaque type (l'agence d'un confrère, l'étude
--             d'un notaire, l'immeuble d'un gardien, le métier d'un
--             partenaire). Voir src/lib/contacts.ts.
--   archive : un contact qu'on garde sans le voir dans la liste.
--
-- À lancer une fois dans Supabase (SQL Editor), AVANT de mettre le code en
-- ligne. Sans risque : il ne supprime rien et peut être relancé.

alter table clients add column if not exists types text[] not null default array['acheteur']::text[];
alter table clients add column if not exists pro jsonb not null default '{}'::jsonb;
alter table clients add column if not exists archive boolean not null default false;

-- Les propriétaires créés depuis la fiche d'un bien (est_vendeur) étaient
-- rangés comme des acheteurs « actifs » : ce sont des vendeurs. Ceux qui ont
-- aussi une recherche restent acheteurs.
update clients c
   set types = case when exists (select 1 from recherches r where r.client_id = c.id)
                    then array['acheteur', 'vendeur']::text[]
                    else array['vendeur']::text[] end
 where c.est_vendeur = true
   and c.types = array['acheteur']::text[];

-- Sans recherche, un vendeur n'est pas un dossier d'achat « actif » : il ne
-- compte plus dans les acheteurs actifs, la veille et les points automatiques.
update clients c
   set statut = 'prospect'
 where c.est_vendeur = true
   and c.statut = 'actif'
   and not exists (select 1 from recherches r where r.client_id = c.id);

-- Tout propriétaire relié à un bien de la rubrique Biens est au moins vendeur.
update clients c
   set types = c.types || array['vendeur']::text[]
 where not ('vendeur' = any (c.types))
   and exists (select 1 from biens_vente b where b.client_id = c.id);

-- Vérification : cinq lignes « oui ».
select 'colonne types' as quoi, case when exists (select 1 from information_schema.columns where table_name = 'clients' and column_name = 'types') then 'oui' else 'NON' end as ok
union all
select 'colonne pro', case when exists (select 1 from information_schema.columns where table_name = 'clients' and column_name = 'pro') then 'oui' else 'NON' end
union all
select 'colonne archive', case when exists (select 1 from information_schema.columns where table_name = 'clients' and column_name = 'archive') then 'oui' else 'NON' end
union all
select 'tous les contacts ont un type', case when not exists (select 1 from clients where coalesce(array_length(types, 1), 0) = 0) then 'oui' else 'NON' end
union all
select 'vendeurs des biens rangés', case when not exists (select 1 from biens_vente b join clients c on c.id = b.client_id where not ('vendeur' = any (c.types))) then 'oui' else 'NON' end;
