-- ═══ D'où vient un contact (V3.23) ══════════════════════════════════════════
-- À passer une fois dans Supabase › SQL Editor. Relançable sans risque.
-- Voir src/lib/sources.ts pour les valeurs.
--
-- source        : « recommandation », « pige », « zecible », « maline »… (vide = inconnue)
-- source_detail : la précision (qui l'a recommandé, quelle plateforme…)

alter table clients add column if not exists source text;
alter table clients add column if not exists source_detail text;

-- Vérification : doit renvoyer 2 lignes.
select column_name, data_type from information_schema.columns
where table_name = 'clients' and column_name in ('source', 'source_detail');
