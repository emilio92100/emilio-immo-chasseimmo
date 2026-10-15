-- V3.193 : ce que le client voit de ton suivi avec l'agence.
-- Chaque appel noté peut s'afficher, en étape neutre, dans l'espace du client
-- (« Alexandre a laissé un message au vendeur »), avec un mot de toi si tu
-- en écris un. Jamais ce qui a été dit, ni l'agence, ni son numéro.
--   montrer    : la case « Lui montrer l'étape » (cochée par défaut)
--   mot_client : « Un mot pour … » (facultatif)
alter table suivis_agence add column if not exists montrer boolean not null default true;
alter table suivis_agence add column if not exists mot_client text;

-- Vérification : deux lignes doivent sortir, « montrer | boolean » et « mot_client | text ».
select column_name, data_type from information_schema.columns
where table_name = 'suivis_agence' and column_name in ('montrer', 'mot_client')
order by column_name;
