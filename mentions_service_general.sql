-- =====================================================================
--  Mentions de service général (SG) — rappel sur astreinte, rappel sur RC,
--  fin de service : des messages généraux comme les autres
--  (envoyer_message_general, main_courante_generale.sql), avec deux
--  différences :
--
--    - un horodatage choisi, pas forcément « maintenant » : on saisit
--      souvent ces mentions après coup (le rappel a eu lieu à 12h18, on ne
--      le note qu'à 15h18) — plafonné à 3h dans le passé pour que ça reste
--      un oubli rattrapé, pas une réécriture de la main courante ;
--    - un même geste peut viser plusieurs secouristes (jusqu'à 15, voir
--      ModaleSG côté cimlog_web) : chacun reçoit sa propre ligne, avec le
--      même horodatage.
--
--  `p_horodatage` est optionnel et par défaut NULL (= maintenant), pour que
--  les appels existants d'alerte_secours_web (3 arguments) continuent de
--  fonctionner sans rien changer de leur côté.
-- =====================================================================

BEGIN;

-- Signature différente (un paramètre de plus) : DROP explicite pour éviter
-- que PostgREST hésite entre deux fonctions de même nom, comme déjà fait
-- pour enregistrer_statut (intervenants.sql).
DROP FUNCTION IF EXISTS envoyer_message_general(text, text, text);

CREATE FUNCTION envoyer_message_general(
  p_contenu     text,
  p_origine     text,
  p_squad_code  text,
  p_horodatage  timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_contenu text := trim(coalesce(p_contenu, ''));
  v_quand   timestamptz := coalesce(p_horodatage, now());
BEGIN
  IF v_contenu = '' THEN
    RETURN jsonb_build_object('ok', false, 'motif', 'message vide');
  END IF;

  IF p_squad_code IS NULL OR NOT (p_squad_code = ANY (sections_visibles())) THEN
    RETURN jsonb_build_object('ok', false, 'motif', 'section hors de votre périmètre');
  END IF;

  IF v_quand > now() OR v_quand < now() - interval '3 hours' THEN
    RETURN jsonb_build_object('ok', false, 'motif', 'horodatage hors limite (jusqu’à 3h dans le passé)');
  END IF;

  INSERT INTO messages (id_status, event_id, squad_code, content, origin, created_at, type, updated_at)
  VALUES ((extract(epoch from clock_timestamp()) * 1000)::bigint,
          NULL, p_squad_code, v_contenu, coalesce(nullif(trim(p_origine), ''), 'Poste'),
          v_quand, 'chat', now());

  RETURN jsonb_build_object('ok', true);
END $$;

REVOKE ALL ON FUNCTION envoyer_message_general(text, text, text, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION envoyer_message_general(text, text, text, timestamptz) TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
