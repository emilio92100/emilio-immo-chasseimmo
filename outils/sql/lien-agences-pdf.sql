-- V3.202 — Le lien pour les agences : le PDF, le code au bout du lien, les précisions montrées.
-- À passer une fois dans Supabase (SQL Editor). Sans danger si on le repasse.

-- 1. Le PDF déposé par l'agence, et l'envoi du CRM d'où vient la proposition (le code ?de=)
alter table propositions_agences add column if not exists pdf jsonb;
alter table propositions_agences add column if not exists envoi jsonb;

-- 2. Les précisions montrées aux agences : une COPIE, que tu peux raccourcir (vide = cachées).
--    Ses précisions à lui (recherches.notes) ne changent pas.
alter table recherches add column if not exists precisions_agences text;

-- 3. Le dossier PRIVÉ des PDF : 20 Mo au plus, des PDF seulement. Personne ne le lit de dehors ;
--    le CRM l'ouvre par un lien de quelques minutes.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('agences-pdf', 'agences-pdf', false, 20971520, array['application/pdf'])
on conflict (id) do nothing;

-- Vérification : doit renvoyer 3 lignes, puis 1 ligne avec public = false.
select table_name, column_name from information_schema.columns
 where (table_name = 'propositions_agences' and column_name in ('pdf', 'envoi'))
    or (table_name = 'recherches' and column_name = 'precisions_agences');
select id, public, file_size_limit from storage.buckets where id = 'agences-pdf';
