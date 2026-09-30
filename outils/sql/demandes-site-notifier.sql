-- ═══ Le mail « Nouvelle demande du site » (V3.37) ════════════════════════════
-- À passer une fois dans Supabase › SQL Editor, APRÈS demandes-site.sql.
-- Relançable sans risque.
--
-- notifie_le : quand le mail qui annonce la demande est parti. Vide = pas
-- encore annoncée. La route /api/demandes-site/notifier ne prend que les
-- demandes vides et reçues depuis moins de deux jours, et se réserve chacune
-- avant d'envoyer : un appel en double n'envoie jamais deux mails.
--
-- Le site ne peut pas écrire cette colonne (elle n'est pas dans ce que la clé
-- publique a le droit de remplir).

alter table contact_submissions add column if not exists notifie_le timestamptz;

-- Les demandes déjà là (les 45 reprises de Lovable, et les autres) ne
-- s'annoncent pas : elles sont marquées comme déjà annoncées.
update contact_submissions set notifie_le = created_at where notifie_le is null;

-- Vérification : « à annoncer » doit valoir 0.
select count(*) filter (where notifie_le is null) as a_annoncer, count(*) as total from contact_submissions;
