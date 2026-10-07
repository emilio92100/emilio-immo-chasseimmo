-- ═══ Les demandes des portails dans « Demandes Internet » (V3.100) ═══════════
-- À passer une fois dans Supabase › SQL Editor, APRÈS demandes-site.sql.
-- Relançable sans risque : rien n'est effacé, rien n'est modifié ailleurs.
--
-- Les demandes de contact reçues sur SeLoger, Logic-Immo et Belles Demeures
-- (API « Seeker Leads » d'AVIV) arrivent dans la même table que celles du
-- site, relevées par le serveur du CRM (src/lib/seloger-contacts-serveur.ts).
--
-- source  : d'où vient la demande — seloger · logicimmo · bellesdemeures ;
--           vide = le site (toutes les demandes d'avant).
-- lead_id : le numéro de la demande chez AVIV. Unique : une demande relevée
--           deux fois n'est rangée qu'une fois.
--
-- Le site ne peut écrire ni l'une ni l'autre (elles ne sont pas dans ce que
-- la clé publique a le droit de remplir).

alter table contact_submissions add column if not exists source text;
alter table contact_submissions add column if not exists lead_id text;

create unique index if not exists contact_submissions_lead_id on contact_submissions (lead_id);

-- Vérification : doit renvoyer 2 lignes, puis « index : oui ».
select column_name, data_type from information_schema.columns
where table_name = 'contact_submissions' and column_name in ('source', 'lead_id');
select 'index' as quoi, case when exists (select 1 from pg_indexes where indexname = 'contact_submissions_lead_id') then 'oui' else 'NON' end as present;
