-- ═══ Le chauffage en trois cases (V3.171) ════════════════════════════════════
-- À passer une fois dans Supabase › SQL Editor.
-- Relançable sans risque : rien n'est effacé, rien n'est modifié ailleurs.
--
-- Alexandre (10 octobre 2026) : « si c'est marqué chauffage collectif, bah,
-- par radiateur ou au sol ou au plafond […]. Quand c'est individuel, mettre si
-- c'est électrique, si c'est au gaz ». Un bien porte donc trois réponses :
--
--   chauffage           : collectif ou individuel      (existait déjà sur biens)
--   source_energie      : gaz, électrique, pompe à chaleur, fioul, bois,
--                         réseau urbain, solaire        (existait déjà sur biens)
--   chauffage_emetteurs : radiateurs, plancher chauffant, plafond chauffant,
--                         convecteurs, air pulsé, poêle  (nouveau)
--
-- La veille les dépose sur ses propositions ; « Retenir » les fait suivre au
-- bien ; la fiche, l'espace du client et la page /bien/<id> les affichent.

alter table biens add column if not exists chauffage_emetteurs text;

alter table veille_propositions add column if not exists chauffage text;
alter table veille_propositions add column if not exists source_energie text;
alter table veille_propositions add column if not exists chauffage_emetteurs text;

-- Vérification : doit renvoyer 4 lignes.
select table_name, column_name from information_schema.columns
where (table_name = 'biens' and column_name = 'chauffage_emetteurs')
   or (table_name = 'veille_propositions' and column_name in ('chauffage', 'source_energie', 'chauffage_emetteurs'))
order by table_name, column_name;
