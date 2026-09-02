-- =====================================================================
--  Visibilité inter-section, en LECTURE SEULE, par région (CRS Alpes /
--  CRS Pyrénées) — pour Cim'Log : voir les secours des autres sections de
--  sa région, pas seulement les siens.
--
--  Volontairement séparée de sections_visibles() (voir auth_rls.sql et
--  sections_visibles_par_groupe.sql) : cette fonction-là sert de garde-fou
--  aussi bien en LECTURE qu'en ÉCRITURE (INSERT/UPDATE/DELETE) sur
--  events/messages/victimes, partagée avec Cim'Alerte, l'appli de prise
--  d'alerte en direct. L'élargir directement à toute la région aurait donné
--  à chaque poste le droit de modifier les interventions des autres
--  sections — pas seulement de les consulter. On ajoute donc une policy
--  SUPPLÉMENTAIRE, en lecture seule (FOR SELECT), qui s'ADDITIONNE à
--  par_section sans y toucher : PostgreSQL combine les policies
--  permissives d'une même table avec OR, donc les droits d'écriture
--  existants restent strictement inchangés.
-- =====================================================================

BEGIN;

-- Région administrative de chaque section — distincte de `groupe`/
-- `parent_code`, qui ne relient qu'une section mère à ses postes rattachés
-- (Grenoble/Grenoble-Huez). Codes et rattachements repris de
-- noms_postes.sql et auth_rls.sql (alerte_secours_web).
ALTER TABLE sections ADD COLUMN IF NOT EXISTS region text;

UPDATE sections SET region = 'Alpes'
  WHERE code IN ('CRS38', 'CRS38H', 'CRS05', 'CRS73', 'CRS73M', 'CRS73C', 'CRS06', 'CRS06S', 'CRS06V');

UPDATE sections SET region = 'Pyrénées'
  WHERE code IN ('CRS65', 'CRS65G', 'CRS65L', 'CRS65S', 'CRS66', 'CRS66B');

/*
 * Codes de toutes les sections de la même région que le poste connecté —
 * pour la lecture inter-section de Cim'Log seulement (voir l'entête).
 */
CREATE OR REPLACE FUNCTION sections_visibles_region()
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

REVOKE ALL ON FUNCTION sections_visibles_region() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sections_visibles_region() TO authenticated;

DROP POLICY IF EXISTS lecture_region ON events;
DROP POLICY IF EXISTS lecture_region ON messages;
DROP POLICY IF EXISTS lecture_region ON victimes;

CREATE POLICY lecture_region ON events
  FOR SELECT TO authenticated
  USING (squad_code = ANY (sections_visibles_region()));

CREATE POLICY lecture_region ON messages
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM events e WHERE e.id = messages.event_id
                   AND e.squad_code = ANY (sections_visibles_region())));

CREATE POLICY lecture_region ON victimes
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM events e WHERE e.id = victimes.event_id
                   AND e.squad_code = ANY (sections_visibles_region())));

COMMIT;

NOTIFY pgrst, 'reload schema';
