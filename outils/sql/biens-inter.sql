-- ═══ Biens : le partage d'un inter-cabinet (V3.145) ═══════════════════════
-- À passer une fois dans Supabase › SQL Editor. Relançable sans risque :
-- rien n'est effacé, rien n'est modifié.
--
-- Quand Alexandre présente un bien « avec inter » (une autre agence vend
-- le bien et partage ses honoraires), il peut noter le partage, pour lui
-- seul — jamais montré au client :
--   { agenceType: 'pourcentage' | 'fixe', agenceVal, part }
--   (les honoraires de l'agence, en % du prix de l'annonce ou en euros, et
--    sa part, en %).
--
-- Sans cette colonne, tout le reste marche (avec inter, sans inter,
-- particulier, l'affichage chez le client) : seul le partage n'est pas
-- gardé, et la fenêtre le dit.

alter table biens add column if not exists inter jsonb;

-- Vérification : doit renvoyer 1 ligne, « inter · jsonb ».
select column_name, data_type
from information_schema.columns
where table_name = 'biens' and column_name = 'inter';
