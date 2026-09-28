-- ═══ V3.20 · Effacer les secrets gardés en clair dans « parametres » ═══════
--
-- La page Paramètres écrivait en clair, dans la table parametres :
--   · les clés Mailjet (mailjet_api_key, mailjet_secret_key), pour un envoi
--     de SMS qui n'a jamais été branché — les mails utilisent les variables
--     d'environnement de Vercel, pas ces lignes ;
--   · un identifiant et un « nouveau mot de passe » (login, nouveau_mdp), qui
--     ne servaient à rien : la connexion passe par le compte Supabase depuis
--     le 23 septembre.
--
-- La V3.20 retire ces champs de l'écran. Ce script efface ce qui a pu être
-- enregistré avant. Il ne touche à rien d'autre, et peut être relancé sans
-- risque (il ne trouvera simplement plus rien).
--
-- Le CRM fonctionne pareil avec ou sans ce script.

delete from parametres
where cle in ('mailjet_api_key', 'mailjet_secret_key', 'login', 'nouveau_mdp');

-- Vérification : doit répondre 0.
select count(*) as secrets_restants
from parametres
where cle in ('mailjet_api_key', 'mailjet_secret_key', 'login', 'nouveau_mdp');
