-- V3.113 : la règle des types d'envoi (table envois, colonne type).
--
-- Ce qui était constaté : « Le mail est parti, mais son suivi : pas
-- enregistré. L'envoi (communications) : new row for relation "envois"
-- violates check constraint "envois_type_check" ». Le mail part bien ; c'est
-- sa trace (l'onglet Communications de la fiche) que la base refusait.
--
-- Le CRM écrit quatre types, et seulement ceux-là :
--   mail_libre          un mail sans bien (bienvenue, lien, « Nouveau mail »)
--   envoi_bien          un seul bien
--   selection_biens     plusieurs biens
--   compte_rendu_visite le compte rendu d'une visite
-- La règle en base, plus ancienne, en refusait au moins un.
--
-- À passer une fois dans Supabase › SQL Editor (« Unsaved changes » →
-- « Discard changes » si la fenêtre s'ouvre). Sans risque : rien n'est
-- effacé, les lignes déjà là ne sont pas revérifiées (not valid).
--
-- Le résultat affiche une ligne : l'ancienne règle, et les types présents
-- dans la table. Copie-la à Claude, qu'il la note dans context.md.

drop table if exists pg_temp.ancienne_regle;
create temp table ancienne_regle as
  select coalesce(
    (select pg_get_constraintdef(oid) from pg_constraint where conname = 'envois_type_check' limit 1),
    'aucune') as regle;

alter table envois drop constraint if exists envois_type_check;
alter table envois add constraint envois_type_check
  check (type in ('mail_libre', 'envoi_bien', 'selection_biens', 'compte_rendu_visite')) not valid;

select
  (select regle from ancienne_regle) as ancienne_regle,
  (select string_agg(type || ' : ' || n, ' · ' order by n desc)
     from (select type, count(*) as n from envois group by type) t) as types_dans_la_table;
