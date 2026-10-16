-- V3.203 — Le contact de l'agence sur la fiche du bien : la personne qui gère le dossier, et son mail.
-- À passer une fois dans Supabase (SQL Editor). Sans danger si on le repasse.
alter table biens add column if not exists agence_interlocuteur text;
alter table biens add column if not exists agence_email text;

-- Vérification : doit renvoyer 2 lignes.
select column_name from information_schema.columns
 where table_name = 'biens' and column_name in ('agence_interlocuteur', 'agence_email');
