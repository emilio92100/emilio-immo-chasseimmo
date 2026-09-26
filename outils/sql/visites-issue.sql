-- ═══ Visites : l'issue après la visite ═══════════════════════════════════
-- À passer une fois dans Supabase › SQL Editor. Relançable sans risque.
-- Voir src/lib/visites.ts pour le sens de chaque colonne.

alter table visites add column if not exists issue text;             -- offre | revoir | reflexion | non
alter table visites add column if not exists issue_par text;         -- client | conseiller
alter table visites add column if not exists issue_le timestamptz;
alter table visites add column if not exists motifs text[];          -- les raisons cochées
alter table visites add column if not exists aime text[];            -- ce qui lui a plu (compte rendu)
alter table visites add column if not exists mot_client text;        -- son mot, depuis l'espace
alter table visites add column if not exists avis_client_le timestamptz; -- quand le client a répondu
alter table visites add column if not exists prix_envisage integer;  -- son prix en tête, pour une offre
alter table visites add column if not exists retenir boolean default true; -- compte pour la recherche

alter table recherches add column if not exists appris_masques text[] default '{}';

-- Vérification : doit renvoyer 10 lignes.
select table_name, column_name from information_schema.columns
where (table_name = 'visites' and column_name in ('issue','issue_par','issue_le','motifs','aime','mot_client','avis_client_le','prix_envisage','retenir'))
   or (table_name = 'recherches' and column_name = 'appris_masques')
order by table_name, column_name;
