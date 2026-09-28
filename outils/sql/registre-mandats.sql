-- ═══ Le registre des mandats (V3.18) ═══════════════════════════════════════
-- À passer une fois dans Supabase › SQL Editor, AVANT de mettre le code en
-- ligne. Relançable sans risque : rien n'est effacé, rien n'est modifié.
-- Voir src/lib/registre.ts et context.md (V3.18).
--
-- Article 72 du décret du 20 juillet 1972 : les mandats sont inscrits dans
-- l'ordre, avec un numéro qui se suit sans trou, reporté sur l'exemplaire
-- du mandant. Tenu sous forme électronique, le registre doit prouver qu'il
-- n'a pas été retouché (articles 1366 et suivants du Code civil). D'où :
--   · les numéros sont donnés ICI, par la base, un à un, sous verrou ;
--   · une ligne inscrite ne se modifie ni ne s'efface plus : la base le
--     refuse, quel que soit le compte (même la clé du serveur) ;
--   · ce qui arrive ensuite (signé, sans suite, avenant, fin…) s'ajoute en
--     observations, elles aussi ineffaçables ;
--   · chaque ligne porte l'empreinte (SHA-256) de son contenu et de la ligne
--     d'avant : retoucher une ligne casse toutes les suivantes, et
--     registre_verifier() le voit.

create extension if not exists pgcrypto with schema extensions;

-- 1. Le départ : une seule ligne, posée par « Démarrer le registre ».
create table if not exists registre_depart (
  id integer primary key default 1 check (id = 1),
  premier_numero integer not null check (premier_numero > 0),
  demarre_le timestamptz not null default now(),
  reprise text,                                -- « Suite du registre ImmoFacile, dernier n° 4329 »
  empreinte text not null
);

-- 2. Les mandats inscrits. Pas de clé étrangère : effacer un client ou un
--    document ne doit rien toucher ici (et ne le pourrait pas).
create table if not exists registre_mandats (
  id uuid primary key default gen_random_uuid(),
  numero integer not null unique,
  inscrit_le timestamptz not null default now(),
  nature text not null check (nature in ('vente', 'recherche')),
  type_mandat text,                            -- simple · semi · exclusif
  mandants text not null,                      -- nom(s) et adresse(s), au jour de l'inscription
  objet text not null,                         -- le bien à vendre, ou le bien recherché
  source text not null default 'document',     -- document · espace · main
  client_id uuid,
  recherche_id uuid,
  bien_vente_id uuid,
  document_id uuid,
  signature_id uuid,                           -- mandats_signatures (signé depuis l'espace)
  empreinte_prec text not null,
  empreinte text not null
);
create index if not exists registre_mandats_document_idx on registre_mandats (document_id);
create index if not exists registre_mandats_recherche_idx on registre_mandats (recherche_id);
create index if not exists registre_mandats_client_idx on registre_mandats (client_id);

-- 3. Les observations : ce qui arrive à un mandat après son inscription.
create table if not exists registre_observations (
  id uuid primary key default gen_random_uuid(),
  rang bigint generated always as identity unique,
  registre_id uuid not null references registre_mandats(id),
  le timestamptz not null default now(),
  type text not null,                          -- signe · sans_suite · retracte · annule · avenant · fin · vente · delegation · note
  texte text not null,
  document_id uuid,
  empreinte_prec text not null,
  empreinte text not null
);
create index if not exists registre_observations_ligne_idx on registre_observations (registre_id, rang);

-- 4. Rien ne se modifie, rien ne s'efface.
create or replace function registre_immuable() returns trigger language plpgsql as $$
begin
  raise exception 'Le registre des mandats ne se modifie pas et ne s''efface pas : ajoute une observation.';
end $$;
do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'registre_depart_immuable') then
    create trigger registre_depart_immuable before update or delete on registre_depart for each row execute function registre_immuable();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'registre_mandats_immuable') then
    create trigger registre_mandats_immuable before update or delete on registre_mandats for each row execute function registre_immuable();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'registre_observations_immuable') then
    create trigger registre_observations_immuable before update or delete on registre_observations for each row execute function registre_immuable();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'registre_depart_tronque') then
    create trigger registre_depart_tronque before truncate on registre_depart for each statement execute function registre_immuable();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'registre_mandats_tronque') then
    create trigger registre_mandats_tronque before truncate on registre_mandats for each statement execute function registre_immuable();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'registre_observations_tronque') then
    create trigger registre_observations_tronque before truncate on registre_observations for each statement execute function registre_immuable();
  end if;
end $$;

-- 5. Les empreintes. L'heure est écrite en UTC, au format fixe : la même
--    ligne donne toujours la même empreinte, quel que soit le réglage.
create or replace function registre_heure(t timestamptz) returns text language sql immutable as $$
  select to_char(t at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
$$;
create or replace function registre_sha(t text) returns text language sql immutable set search_path = public, extensions as $$
  select encode(extensions.digest(convert_to(t, 'UTF8'), 'sha256'), 'hex')
$$;
create or replace function registre_empreinte_ligne(r registre_mandats) returns text language sql stable set search_path = public, extensions as $$
  select registre_sha(concat_ws('|', 'mandat', r.numero::text, registre_heure(r.inscrit_le), r.nature, coalesce(r.type_mandat, ''),
    r.mandants, r.objet, r.source, coalesce(r.client_id::text, ''), coalesce(r.recherche_id::text, ''), coalesce(r.bien_vente_id::text, ''),
    coalesce(r.document_id::text, ''), coalesce(r.signature_id::text, ''), r.empreinte_prec))
$$;
create or replace function registre_empreinte_obs(o registre_observations) returns text language sql stable set search_path = public, extensions as $$
  select registre_sha(concat_ws('|', 'observation', o.registre_id::text, registre_heure(o.le), o.type, o.texte, coalesce(o.document_id::text, ''), o.empreinte_prec))
$$;

-- 6. Démarrer le registre (une seule fois).
create or replace function registre_demarrer(p_premier integer, p_reprise text default null)
returns registre_depart language plpgsql security definer set search_path = public, extensions as $$
declare d registre_depart;
begin
  if exists (select 1 from registre_depart) then raise exception 'Le registre est déjà démarré.'; end if;
  if p_premier is null or p_premier < 1 then raise exception 'Le premier numéro doit être un nombre positif.'; end if;
  d.id := 1; d.premier_numero := p_premier; d.demarre_le := now(); d.reprise := nullif(trim(coalesce(p_reprise, '')), '');
  d.empreinte := registre_sha(concat_ws('|', 'depart', p_premier::text, registre_heure(d.demarre_le), coalesce(d.reprise, '')));
  insert into registre_depart values (d.*);
  return d;
end $$;

-- 7. Inscrire un mandat : le numéro suivant, sous verrou (deux mandats au
--    même instant n'ont jamais le même numéro, et aucun n'est sauté).
--    Un document déjà inscrit (repassé en brouillon puis refinalisé) garde
--    son numéro ; un mandat en cours de signature dans l'espace aussi.
create or replace function registre_inscrire(p jsonb)
returns registre_mandats language plpgsql security definer set search_path = public, extensions as $$
declare d registre_depart; r registre_mandats; n integer; prec text;
begin
  perform pg_advisory_xact_lock(7201972);
  select * into d from registre_depart where id = 1;
  if not found then raise exception 'Le registre n''est pas encore démarré.'; end if;
  if nullif(p->>'document_id', '') is not null then
    select * into r from registre_mandats where document_id = (p->>'document_id')::uuid order by numero limit 1;
    if found then return r; end if;
  end if;
  if nullif(p->>'signature_id', '') is not null then
    select * into r from registre_mandats where signature_id = (p->>'signature_id')::uuid order by numero limit 1;
    if found then return r; end if;
  end if;
  if coalesce(p->>'source', '') = 'espace' and nullif(p->>'recherche_id', '') is not null then
    select m.* into r from registre_mandats m
      where m.recherche_id = (p->>'recherche_id')::uuid and m.source = 'espace'
        and not exists (select 1 from registre_observations o where o.registre_id = m.id and o.type in ('signe', 'sans_suite', 'retracte', 'annule', 'fin'))
      order by m.numero desc limit 1;
    if found then return r; end if;
  end if;
  if coalesce(p->>'nature', '') not in ('vente', 'recherche') then raise exception 'Nature du mandat inconnue : vente ou recherche.'; end if;
  if nullif(trim(coalesce(p->>'mandants', '')), '') is null then raise exception 'Les mandants manquent.'; end if;
  if nullif(trim(coalesce(p->>'objet', '')), '') is null then raise exception 'L''objet du mandat manque.'; end if;
  select coalesce(max(numero) + 1, d.premier_numero) into n from registre_mandats;
  select empreinte into prec from registre_mandats order by numero desc limit 1;
  -- L'heure réelle, prise sous le verrou (now() serait celle du début de la
  -- transaction : un numéro pourrait paraître inscrit avant le précédent).
  r.id := gen_random_uuid(); r.numero := n; r.inscrit_le := clock_timestamp();
  r.nature := p->>'nature'; r.type_mandat := nullif(p->>'type_mandat', '');
  r.mandants := trim(p->>'mandants'); r.objet := trim(p->>'objet'); r.source := coalesce(nullif(p->>'source', ''), 'document');
  r.client_id := nullif(p->>'client_id', '')::uuid; r.recherche_id := nullif(p->>'recherche_id', '')::uuid;
  r.bien_vente_id := nullif(p->>'bien_vente_id', '')::uuid; r.document_id := nullif(p->>'document_id', '')::uuid;
  r.signature_id := nullif(p->>'signature_id', '')::uuid;
  r.empreinte_prec := coalesce(prec, d.empreinte);
  r.empreinte := registre_empreinte_ligne(r);
  insert into registre_mandats values (r.*);
  return r;
end $$;

-- 8. Ajouter une observation. La ligne se retrouve par son id, son
--    document, sa signature en ligne ou son numéro ; aucune ligne (un mandat
--    d'avant le registre) : rien n'est écrit, et on rend null. Une même
--    observation pour un même document n'est écrite qu'une fois.
create or replace function registre_observer(p jsonb)
returns registre_observations language plpgsql security definer set search_path = public, extensions as $$
declare l registre_mandats; o registre_observations; prec text; d registre_depart;
begin
  perform pg_advisory_xact_lock(7201973);
  if nullif(p->>'registre_id', '') is not null then select * into l from registre_mandats where id = (p->>'registre_id')::uuid;
  elsif nullif(p->>'document_id_mandat', '') is not null then select * into l from registre_mandats where document_id = (p->>'document_id_mandat')::uuid order by numero limit 1;
  elsif nullif(p->>'signature_id', '') is not null then select * into l from registre_mandats where signature_id = (p->>'signature_id')::uuid order by numero limit 1;
  elsif nullif(p->>'numero', '') is not null and (p->>'numero') ~ '^\d+$' then select * into l from registre_mandats where numero = (p->>'numero')::integer;
  end if;
  if l.id is null then return null; end if;
  if nullif(trim(coalesce(p->>'type', '')), '') is null or nullif(trim(coalesce(p->>'texte', '')), '') is null then
    raise exception 'Une observation a un type et un texte.';
  end if;
  if nullif(p->>'document_id', '') is not null then
    select * into o from registre_observations where registre_id = l.id and type = p->>'type' and document_id = (p->>'document_id')::uuid limit 1;
    if found then return o; end if;
  end if;
  select * into d from registre_depart where id = 1;
  select empreinte into prec from registre_observations order by rang desc limit 1;
  insert into registre_observations (registre_id, le, type, texte, document_id, empreinte_prec, empreinte)
    values (l.id, clock_timestamp(), trim(p->>'type'), trim(p->>'texte'), nullif(p->>'document_id', '')::uuid, coalesce(prec, d.empreinte), 'calculée par le déclencheur')
    returning * into o;
  return o;
end $$;

-- L'empreinte d'une observation dépend de son heure et de son identifiant,
-- connus seulement à l'insertion : on la calcule juste avant, par un
-- déclencheur (qui passe avant celui qui interdit les modifications).
create or replace function registre_obs_empreinte() returns trigger language plpgsql set search_path = public, extensions as $$
begin
  new.empreinte := registre_empreinte_obs(new);
  return new;
end $$;
do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'registre_observations_empreinte') then
    create trigger registre_observations_empreinte before insert on registre_observations for each row execute function registre_obs_empreinte();
  end if;
end $$;

-- 9. Vérifier tout le registre : les numéros se suivent, chaque empreinte
--    correspond à son contenu et à la précédente. Une ligne par problème ;
--    aucune ligne : le registre est intact.
create or replace function registre_verifier()
returns table (quoi text, numero integer, probleme text) language plpgsql security definer set search_path = public, extensions as $$
declare d registre_depart; r registre_mandats; o registre_observations; attendu integer; prec text;
begin
  select * into d from registre_depart where id = 1;
  if not found then return; end if;
  if d.empreinte <> registre_sha(concat_ws('|', 'depart', d.premier_numero::text, registre_heure(d.demarre_le), coalesce(d.reprise, ''))) then
    quoi := 'depart'; numero := d.premier_numero; probleme := 'Le départ du registre a été modifié.'; return next;
  end if;
  attendu := d.premier_numero; prec := d.empreinte;
  for r in select * from registre_mandats order by numero loop
    if r.numero <> attendu then quoi := 'mandat'; numero := r.numero; probleme := format('Numéro attendu : %s. Un numéro manque ou a été sauté.', attendu); return next; end if;
    if r.empreinte_prec <> prec then quoi := 'mandat'; numero := r.numero; probleme := 'Le lien avec la ligne précédente est rompu.'; return next; end if;
    if r.empreinte <> registre_empreinte_ligne(r) then quoi := 'mandat'; numero := r.numero; probleme := 'Le contenu de la ligne ne correspond plus à son empreinte.'; return next; end if;
    attendu := r.numero + 1; prec := r.empreinte;
  end loop;
  prec := d.empreinte;
  for o in select * from registre_observations order by rang loop
    if o.empreinte_prec <> prec or o.empreinte <> registre_empreinte_obs(o) then
      quoi := 'observation'; select m.numero into numero from registre_mandats m where m.id = o.registre_id;
      probleme := 'Une observation ne correspond plus à son empreinte.'; return next;
    end if;
    prec := o.empreinte;
  end loop;
end $$;

-- 10. Qui peut quoi. Le CRM connecté LIT les trois tables, et n'écrit qu'en
--     passant par les fonctions ci-dessus. La clé publique ne voit rien.
alter table registre_depart enable row level security;
alter table registre_mandats enable row level security;
alter table registre_observations enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'registre_depart' and policyname = 'crm_lecture') then
    create policy crm_lecture on registre_depart for select to authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'registre_mandats' and policyname = 'crm_lecture') then
    create policy crm_lecture on registre_mandats for select to authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'registre_observations' and policyname = 'crm_lecture') then
    create policy crm_lecture on registre_observations for select to authenticated using (true);
  end if;
end $$;
revoke all on function registre_demarrer(integer, text) from public, anon;
revoke all on function registre_inscrire(jsonb) from public, anon;
revoke all on function registre_observer(jsonb) from public, anon;
revoke all on function registre_verifier() from public, anon;
grant execute on function registre_demarrer(integer, text) to authenticated, service_role;
grant execute on function registre_inscrire(jsonb) to authenticated, service_role;
grant execute on function registre_observer(jsonb) to authenticated, service_role;
grant execute on function registre_verifier() to authenticated, service_role;

-- Vérification : doit renvoyer 3 lignes, toutes à « oui ».
select 'registre_depart' as quoi, case when exists (select 1 from pg_class where relname = 'registre_depart' and relrowsecurity) then 'oui' else 'NON' end as present
union all
select 'registre_mandats', case when exists (select 1 from pg_class where relname = 'registre_mandats' and relrowsecurity) then 'oui' else 'NON' end
union all
select 'registre_observations', case when exists (select 1 from pg_class where relname = 'registre_observations' and relrowsecurity) then 'oui' else 'NON' end;
