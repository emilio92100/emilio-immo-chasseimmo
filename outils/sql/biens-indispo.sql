-- ═══ Biens : « Ce bien n'est plus disponible » (V3.164) ═══════════════════
-- À passer une fois dans Supabase › SQL Editor. Relançable sans risque :
-- rien n'est effacé, rien n'est modifié.
--
-- Un bien présenté à un acheteur (trouvé ailleurs que dans les mandats de
-- l'agence) peut être marqué « plus disponible » par Alexandre, après un
-- échange avec l'agence ou le vendeur :
--   { le, motif: 'vendu' | 'compromis' | 'retire' | 'autre', note }
-- `note` est le mot laissé à l'acheteur : il le lit dans son espace, sur le
-- bien, dans « Plus disponibles ». « Remettre disponible » vide la colonne.
--
-- Sans cette colonne, le reste du CRM marche comme avant : seul le bouton
-- « Plus disponible » le dit, au lieu d'enregistrer.

alter table biens add column if not exists indispo jsonb;

-- Vérification : doit renvoyer 1 ligne, « indispo · jsonb ».
select column_name, data_type
from information_schema.columns
where table_name = 'biens' and column_name = 'indispo';
