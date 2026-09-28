-- ═══ Suspendu jusqu'au… : la date de reprise d'un dossier (V3.22) ═══════════
-- À passer une fois dans Supabase › SQL Editor. Relançable sans risque.
-- Voir src/lib/suspension.ts pour le sens de la colonne.
--
-- { "jusqu_au": "AAAA-MM-JJ", "recherches": [id…], "le": date de la pause }
-- Vide (null) : pas de reprise prévue, le dossier reste suspendu jusqu'à ce
-- qu'Alexandre le repasse en « Actif ».

alter table clients add column if not exists suspension jsonb;

-- Vérification : doit renvoyer 1 ligne.
select table_name, column_name, data_type from information_schema.columns
where table_name = 'clients' and column_name = 'suspension';
