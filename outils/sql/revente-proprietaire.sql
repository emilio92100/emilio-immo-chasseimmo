-- ═══ V3.207 · « Revente possible » = aussi Propriétaire ═══════════════════
-- Avant la V3.207, cocher « Revente possible après l'achat » ne classait pas
-- le contact Propriétaire, et laissait sa situation vide. Le CRM le fait
-- maintenant à la création et dans « Modifier » ; ce fichier rattrape les
-- fiches d'avant, avec la même règle (src/lib/contacts.ts, typesAvecRevente) :
--   · ni un Vendeur (son bien est déjà en vente avec nous),
--   · ni un Vendeur signé (il a vendu : la case ne veut plus rien dire),
--   · ni un contact déjà Propriétaire.
-- Une seule requête : la liste qui s'affiche, ce sont les fiches corrigées.
-- Le relancer ne change rien (liste vide).

update clients c
   set types = case
                 when c.types && array['proprietaire', 'vendeur']::text[] then c.types
                 else (case when coalesce(array_length(c.types, 1), 0) = 0 then array['acheteur']::text[] else c.types end)
                      || array['proprietaire']::text[]
               end,
       statut_occupation = case when coalesce(c.statut_occupation, '') = '' then 'proprietaire' else c.statut_occupation end
 where c.bien_actuel_a_vendre = true
   and not ('vendeur_signe' = any (c.types))
   and (not (c.types && array['proprietaire', 'vendeur']::text[]) or coalesce(c.statut_occupation, '') = '')
returning c.prenom, c.nom, c.types, c.statut_occupation;
