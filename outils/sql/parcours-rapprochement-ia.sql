-- V3.122 · Deux colonnes, à passer une fois dans Supabase › SQL Editor.
-- Sans danger si déjà passées.

-- 1. « Son parcours » : depuis quand l'acheteur cherche, combien de visites il
--    a faites, ce qui n'a pas convenu (une fois, ou souvent), ce qui lui a plu,
--    et ce qu'il en raconte. Visible d'Alexandre seul : l'espace acheteur ne lit
--    jamais cette colonne.
--      { "depuis": "3_6", "visites": "10_20",
--        "defauts": { "Trop sombre": 2, "Vis-à-vis": 1 },
--        "plu": ["Traversant"], "note": "…" }
alter table public.recherches add column if not exists parcours jsonb;
comment on column public.recherches.parcours is
  'Son parcours (V3.122) : depuis, visites, defauts {libellé: 1|2}, plu [], note. Privé : jamais montré dans l''espace acheteur.';

-- 2. Les avis du rapprochement intelligent, gardés sur le bien, recherche par
--    recherche, avec l'empreinte de ce qui a été lu : relancer ne relit que ce
--    qui a bougé.
--      { "<recherche_id>": { "v": "oui|a_voir|non", "r": "…", "le": "…", "cle": "…" } }
alter table public.biens_vente add column if not exists rapprochement_ia jsonb;
comment on column public.biens_vente.rapprochement_ia is
  'Rapprochement intelligent (V3.122) : avis de l''IA par recherche {v, r, le, cle}.';

-- Vérification : deux lignes doivent apparaître ci-dessous.
select table_name, column_name, data_type from information_schema.columns
 where table_schema = 'public'
   and ((table_name = 'recherches' and column_name = 'parcours')
     or (table_name = 'biens_vente' and column_name = 'rapprochement_ia'));
