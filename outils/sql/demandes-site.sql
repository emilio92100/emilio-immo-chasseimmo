-- ═══ Les demandes du site emilio-immo.com (V3.34) ════════════════════════════
-- À passer une fois dans Supabase › SQL Editor. Relançable sans risque :
-- rien n'est effacé, rien n'est modifié ailleurs.
--
-- Les formulaires du site (contact, accompagnement acheteur, info sur un bien,
-- estimation) déposaient leurs demandes chez Lovable Cloud. Elles arrivent
-- désormais ici, dans la base du CRM.
--
-- Le nom de la table et de ses premières colonnes est celui du site, en
-- anglais : le site n'a ainsi que son adresse de base à changer, pas son code.
--
-- Colonnes écrites par le site :
-- form_type        : contact · mandat_recherche · rappel_bien · estimation
-- name, email, phone, message
-- budget, property_type, desired_location, desired_surface, timeline
--                  (accompagnement acheteur ; l'estimation remplit aussi
--                  desired_location, property_type, desired_surface, timeline)
-- property_ref, property_title  (demande d'info sur un bien)
--
-- Colonnes du CRM (le site ne peut pas les écrire) :
-- statut           : nouveau · en_cours · traite (voir src/lib/demandes-site.ts ;
--                    texte libre, pas de contrainte en base : un statut de plus
--                    ne demande pas de SQL)
-- statut_le        : quand le statut a changé
-- a_rappeler_le    : la date à laquelle rappeler
-- archive, archive_le
-- admin_notes      : les notes d'Alexandre
-- client_id        : la fiche contact créée à partir de la demande
-- is_called        : hérité de Lovable (« appelé »), gardé pour l'import

create table if not exists contact_submissions (
  id uuid primary key default gen_random_uuid(),
  form_type text not null default 'contact',
  name text not null,
  email text not null,
  phone text,
  message text,
  budget text,
  property_type text,
  desired_location text,
  desired_surface text,
  timeline text,
  property_ref text,
  property_title text,
  is_called boolean not null default false,
  admin_notes text,
  created_at timestamptz not null default now()
);

alter table contact_submissions add column if not exists statut text not null default 'nouveau';
alter table contact_submissions add column if not exists statut_le timestamptz;
alter table contact_submissions add column if not exists a_rappeler_le date;
alter table contact_submissions add column if not exists archive boolean not null default false;
alter table contact_submissions add column if not exists archive_le timestamptz;
alter table contact_submissions add column if not exists client_id uuid references clients(id) on delete set null;

create index if not exists contact_submissions_created_at on contact_submissions (created_at desc);

-- ─── La serrure ─────────────────────────────────────────────────────────────
-- Le CRM connecté lit et écrit tout, comme sur les autres tables.
-- La clé publique (celle du site) ne peut que DÉPOSER une demande : elle ne
-- lit rien, ne modifie rien, n'efface rien, et ne touche à aucune colonne
-- du CRM (statut, notes, archive…). Les autres tables restent fermées.
alter table contact_submissions enable row level security;

revoke all on contact_submissions from anon;
grant insert (form_type, name, email, phone, message, budget, property_type,
              desired_location, desired_surface, timeline, property_ref, property_title)
  on contact_submissions to anon;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'contact_submissions' and policyname = 'crm_authentifie') then
    create policy crm_authentifie on contact_submissions for all to authenticated using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'contact_submissions' and policyname = 'site_depose') then
    -- Des tailles raisonnables, pour qu'un robot ne remplisse pas la base.
    -- L'e-mail peut être vide : le formulaire d'estimation court n'en demande pas.
    create policy site_depose on contact_submissions for insert to anon with check (
      form_type in ('contact', 'mandat_recherche', 'rappel_bien', 'estimation')
      and char_length(name) between 1 and 200
      and char_length(email) <= 320
      and coalesce(char_length(phone), 0) <= 50
      and coalesce(char_length(message), 0) <= 5000
      and coalesce(char_length(budget), 0) <= 200
      and coalesce(char_length(property_type), 0) <= 200
      and coalesce(char_length(desired_location), 0) <= 500
      and coalesce(char_length(desired_surface), 0) <= 200
      and coalesce(char_length(timeline), 0) <= 200
      and coalesce(char_length(property_ref), 0) <= 200
      and coalesce(char_length(property_title), 0) <= 500
    );
  end if;
end $$;

-- Vérification : doit renvoyer 3 lignes, toutes à « oui ».
select 'table contact_submissions' as quoi, case when exists (select 1 from pg_class where relname = 'contact_submissions' and relrowsecurity) then 'oui' else 'NON' end as present
union all
select 'droit du CRM', case when exists (select 1 from pg_policies where tablename = 'contact_submissions' and policyname = 'crm_authentifie') then 'oui' else 'NON' end
union all
select 'dépôt par le site', case when exists (select 1 from pg_policies where tablename = 'contact_submissions' and policyname = 'site_depose') then 'oui' else 'NON' end;
