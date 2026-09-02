-- =====================================================================
--  Visibilité inter-section, en LECTURE SEULE, pour Cim'Log — SANS TOUCHER
--  aux policies RLS de base (par_section / lecture_par_section, voir
--  auth_rls.sql), pour que Cim'Alerte (prise d'alerte en direct, appli
--  séparée sur la même base) garde EXACTEMENT son comportement d'origine :
--  chaque section ne gère que la sienne, point final.
--
--  Une première tentative (visibilite_regionale.sql, retirée) ajoutait une
--  policy RLS supplémentaire directement sur events/messages/victimes —
--  correct pour Cim'Log, mais RLS s'applique au RÔLE Postgres, pas à
--  l'application : les deux appuis partagent le même compte par section,
--  donc la policy élargissait aussi ce que Cim'Alerte laissait voir,
--  jamais demandé pour ce logiciel-là.
--
--  Cette fois, la visibilité élargie passe par des fonctions RPC dédiées
--  (cimlog_evenements / cimlog_messages / cimlog_victimes), appelées
--  UNIQUEMENT par Cim'Log. Cim'Alerte n'appelle jamais ces fonctions : son
--  comportement ne change pas d'un octet. La vérification de portée (la
--  région du poste connecté) est faite À L'INTÉRIEUR de chaque fonction,
--  jamais confiée au client — un poste ne peut donc pas demander autre
--  chose que sa propre région, quel que soit ce qu'on lui passe en
--  paramètre.
-- =====================================================================

BEGIN;

-- Région administrative de chaque section — distincte de `groupe`/
-- `parent_code`, qui ne relient qu'une section mère à ses postes rattachés
-- (Grenoble/Grenoble-Huez). Peut déjà exister si visibilite_regionale.sql
-- avait été exécuté avant son retrait — sans effet dans ce cas.
ALTER TABLE sections ADD COLUMN IF NOT EXISTS region text;

UPDATE sections SET region = 'Alpes'
  WHERE code IN ('CRS38', 'CRS38H', 'CRS05', 'CRS73', 'CRS73M', 'CRS73C', 'CRS06', 'CRS06S', 'CRS06V');

UPDATE sections SET region = 'Pyrénées'
  WHERE code IN ('CRS65', 'CRS65G', 'CRS65L', 'CRS65S', 'CRS66', 'CRS66B');

/*
 * Codes de toutes les sections de la même région que le poste connecté —
 * usage interne aux fonctions ci-dessous UNIQUEMENT (jamais dans une policy
 * RLS de table : voir l'entête).
 */
CREATE OR REPLACE FUNCTION cimlog_squad_codes_region()
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  WITH moi AS (
    SELECT region FROM sections WHERE code = section_courante()
  )
  SELECT coalesce(array_agg(s.code), ARRAY[]::text[])
  FROM sections s, moi
  WHERE s.region IS NOT NULL AND s.region = moi.region
$fn$;

/*
 * Interventions d'une ou plusieurs sections de SA région — sur une période,
 * une liste précise d'identifiants, ou les deux à la fois selon ce qui est
 * fourni. Pour le Registre, la Carte IGN, les Stats, la Vue synoptique et la
 * fiche détail de Cim'Log. `p_squad_codes` est rejeté s'il contient un code
 * hors de la région du poste connecté (<@ = "est inclus dans").
 */
CREATE OR REPLACE FUNCTION cimlog_evenements(
  p_squad_codes text[],
  p_debut       timestamptz DEFAULT NULL,
  p_fin         timestamptz DEFAULT NULL,
  p_event_ids   bigint[] DEFAULT NULL
)
RETURNS SETOF events
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT e.*
  FROM events e
  WHERE p_squad_codes <@ cimlog_squad_codes_region()
    AND e.squad_code = ANY (p_squad_codes)
    AND e.statut <> 'brouillon'
    AND (p_event_ids IS NULL OR e.id = ANY (p_event_ids))
    AND (p_debut IS NULL OR e.created_at >= p_debut)
    AND (p_fin IS NULL OR e.created_at < p_fin)
$fn$;

/*
 * Messages de main courante d'une ou plusieurs sections de SA région — pour
 * la MC Chronologique et la Vue synoptique de Cim'Log. Couvre les messages
 * rattachés à une intervention (squad_code de l'intervention) et les
 * messages généraux (squad_code du message lui-même, event_id NULL) — même
 * distinction que main_courante_generale.sql côté RLS.
 */
CREATE OR REPLACE FUNCTION cimlog_messages(
  p_squad_codes text[],
  p_debut       timestamptz DEFAULT NULL,
  p_fin         timestamptz DEFAULT NULL,
  p_event_id    bigint DEFAULT NULL
)
RETURNS SETOF messages
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT m.*
  FROM messages m
  LEFT JOIN events e ON e.id = m.event_id
  WHERE p_squad_codes <@ cimlog_squad_codes_region()
    AND coalesce(e.squad_code, m.squad_code) = ANY (p_squad_codes)
    AND (p_event_id IS NULL OR m.event_id = p_event_id)
    AND (p_debut IS NULL OR m.created_at >= p_debut)
    AND (p_fin IS NULL OR m.created_at < p_fin)
$fn$;

/*
 * Victimes des interventions demandées — seulement celles dont l'intervention
 * appartient à la région du poste connecté (dérivé de l'intervention elle-
 * même, pas d'un paramètre de section séparé : impossible de demander les
 * victimes d'un event_id qu'on n'a pas le droit de lire).
 */
CREATE OR REPLACE FUNCTION cimlog_victimes(p_event_ids bigint[])
RETURNS SETOF victimes
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT v.*
  FROM victimes v
  JOIN events e ON e.id = v.event_id
  WHERE e.squad_code = ANY (cimlog_squad_codes_region())
    AND v.event_id = ANY (p_event_ids)
$fn$;

REVOKE ALL ON FUNCTION cimlog_squad_codes_region() FROM PUBLIC;
REVOKE ALL ON FUNCTION cimlog_evenements(text[], timestamptz, timestamptz, bigint[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION cimlog_messages(text[], timestamptz, timestamptz, bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION cimlog_victimes(bigint[]) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION cimlog_squad_codes_region() TO authenticated;
GRANT EXECUTE ON FUNCTION cimlog_evenements(text[], timestamptz, timestamptz, bigint[]) TO authenticated;
GRANT EXECUTE ON FUNCTION cimlog_messages(text[], timestamptz, timestamptz, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION cimlog_victimes(bigint[]) TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
