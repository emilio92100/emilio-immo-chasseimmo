-- ═══ Documents juridiques : les projets envoyés en relecture (V3.40) ═════
-- À passer une fois dans Supabase › SQL Editor. Relançable sans risque :
-- rien n'est effacé, rien n'est modifié.
--
-- Un brouillon peut partir « en projet », avant toute signature : le PDF
-- marqué « PROJET NON SIGNÉ », à qui l'on choisit (Documents › le brouillon
-- › « Envoyer le projet », ou « Envoyer ce projet » dans l'éditeur). Chaque
-- envoi est noté ici, du plus ancien au plus récent, et la fiche du
-- document le montre dans son historique :
--   [{ le, a: [{ email, nom }], sujet, message, fichier, echecs? }]
--
-- Sans cette colonne, le projet part quand même (et s'inscrit dans
-- l'historique du bien et le Suivi des contacts) ; seule la fiche du
-- document ne le garde pas.

alter table documents add column if not exists envois jsonb not null default '[]'::jsonb;

-- Vérification : doit renvoyer 1 ligne, « envois · jsonb ».
select column_name, data_type
from information_schema.columns
where table_name = 'documents' and column_name = 'envois';
