-- V3.165 : « Nouvelle relance » dans Relances — le pense-bête.
-- Un pense-bête peut ne concerner aucun contact : la relance n'a alors pas
-- de client. Si la colonne l'acceptait déjà, cette ligne ne change rien.
alter table relances alter column client_id drop not null;

-- Vérification : « client_id | YES » doit sortir.
select column_name, is_nullable from information_schema.columns
where table_name = 'relances' and column_name = 'client_id';
