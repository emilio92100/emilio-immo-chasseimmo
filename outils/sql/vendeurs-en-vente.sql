-- ═══ V3.137 · « Vendeur » = un bien en vente ═════════════════════════════
-- Alexandre : « vendeur, ça veut dire ceux qui vendent ». Avant, tout contact
-- relié à un bien de la rubrique Biens devenait « Vendeur », même en
-- estimation. Désormais :
--   · un bien en mandat, sous offre ou sous compromis : Vendeur (à la place
--     de Propriétaire ; un « Vendeur signé » qui revend redevient Vendeur) ;
--   · sinon, un bien à suivre, en estimation, en pause ou retiré :
--     Propriétaire ;
--   · son seul bien vient d'être vendu : rien ici, « La vente est signée »
--     décide (Vendeur signé) ;
--   · plus aucun bien : il quitte Vendeur (Propriétaire s'il ne lui reste
--     aucun autre type) ;
--   · un contact archivé ne bouge pas.
-- La même règle est écrite dans src/lib/contacts.ts (typesSelonBiens) : les
-- deux doivent rester identiques.
--
-- À lancer une fois dans Supabase › SQL Editor. Relançable sans risque :
-- il ne supprime rien, et ne touche que la colonne clients.types.

-- 1. La règle, pour un contact.
create or replace function emilio_types_vente(cid uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  t text[]; arch boolean; vend boolean; possede boolean; vendu boolean; n text[];
begin
  if cid is null then return; end if;
  select types, coalesce(archive, false) into t, arch from clients where id = cid;
  if not found or arch then return; end if;
  -- Sans type, un contact est un acheteur (comme dans le CRM).
  if t is null or cardinality(t) = 0 then t := array['acheteur']; end if;
  select coalesce(bool_or(etape in ('mandat', 'offre', 'compromis')), false),
         coalesce(bool_or(etape not in ('vendu', 'annonce_type')), false),
         coalesce(bool_or(etape = 'vendu'), false)
    into vend, possede, vendu
    from biens_vente where client_id = cid and coalesce(archive, false) = false;
  if vend then
    n := array_remove(array_remove(t, 'vendeur_signe'), 'proprietaire');
    if not ('vendeur' = any(n)) then n := n || 'vendeur'::text; end if;
  elsif 'vendeur' = any(t) then
    if not possede and vendu then return; end if;
    n := array_remove(t, 'vendeur');
    if (possede or cardinality(n) = 0) and not ('proprietaire' = any(n)) then n := n || 'proprietaire'::text; end if;
  elsif possede and not ('proprietaire' = any(t)) then
    n := t || 'proprietaire'::text;
  else
    return;
  end if;
  if (select array_agg(x order by x) from unnest(n) x) is distinct from (select array_agg(x order by x) from unnest(t) x) then
    update clients set types = n where id = cid;
  end if;
end $$;

-- 2. À chaque bien créé, supprimé, ou dont l'étape, le propriétaire ou
--    l'archivage change : son propriétaire (l'ancien et le nouveau) suit.
create or replace function emilio_types_vente_bien() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op <> 'INSERT' then perform emilio_types_vente(old.client_id); end if;
  if tg_op = 'INSERT' or (tg_op = 'UPDATE' and new.client_id is distinct from old.client_id) then
    perform emilio_types_vente(new.client_id);
  end if;
  return null;
end $$;

drop trigger if exists biens_vente_types_vendeur on biens_vente;
drop trigger if exists biens_vente_types_vendeur_ajout on biens_vente;
drop trigger if exists biens_vente_types_vendeur_maj on biens_vente;
create trigger biens_vente_types_vendeur_ajout
  after insert or delete on biens_vente
  for each row execute function emilio_types_vente_bien();
-- Chaque enregistrement d'une fiche réécrit client_id : seulement quand
-- quelque chose change vraiment.
create trigger biens_vente_types_vendeur_maj
  after update of etape, client_id, archive on biens_vente
  for each row
  when (old.etape is distinct from new.etape or old.client_id is distinct from new.client_id or old.archive is distinct from new.archive)
  execute function emilio_types_vente_bien();

-- Personne ne les appelle de l'extérieur (l'API publique de Supabase
-- expose les fonctions) : seule la base s'en sert.
revoke execute on function emilio_types_vente(uuid) from public, anon, authenticated;
revoke execute on function emilio_types_vente_bien() from public, anon, authenticated;

-- 3. Une fois : les contacts d'aujourd'hui. Les « Vendeurs » sans bien en
--    vente passent Propriétaire ; les propriétaires d'un bien en vente
--    passent Vendeur.
do $$
declare r record;
begin
  for r in select c.id from clients c
           where coalesce(c.archive, false) = false
             and ('vendeur' = any(c.types) or exists (select 1 from biens_vente b where b.client_id = c.id))
  loop
    perform emilio_types_vente(r.id);
  end loop;
end $$;

-- 4. Vérification : combien de Vendeurs et de Propriétaires maintenant
--    (les contacts archivés à part).
select
  count(*) filter (where 'vendeur' = any(types)) as vendeurs,
  count(*) filter (where 'proprietaire' = any(types)) as proprietaires
from clients where coalesce(archive, false) = false;
