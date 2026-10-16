-- V3.203 — Le contact de l'agence sur la fiche du bien : la personne qui gère le dossier, et son mail.
-- V3.205 — Et son numéro à elle, à côté de celui de l'agence (relevé par la veille), qui reste.
-- À passer une fois dans Supabase (SQL Editor). Sans danger si on le repasse (déjà passé en V3.203 : il ajoute juste la dernière colonne).
alter table biens add column if not exists agence_interlocuteur text;
alter table biens add column if not exists agence_email text;
alter table biens add column if not exists agence_interlocuteur_tel text;

-- Vérification : doit renvoyer 3 lignes.
select column_name from information_schema.columns
 where table_name = 'biens' and column_name in ('agence_interlocuteur', 'agence_email', 'agence_interlocuteur_tel');
