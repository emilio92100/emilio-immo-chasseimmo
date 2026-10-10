-- V3.165 : le numéro de l'agence, relevé par la veille sur l'annonce.
-- « Retenir » le recopie dans biens.agence_tel (la colonne existe déjà) :
-- la carte et la fenêtre « Voir en grand » affichent alors un bouton « Appeler ».
alter table veille_propositions add column if not exists agence_tel text;

-- Vérification : une ligne « agence_tel | text » doit sortir.
select column_name, data_type from information_schema.columns
where table_name = 'veille_propositions' and column_name = 'agence_tel';
