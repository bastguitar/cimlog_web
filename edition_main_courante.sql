-- =====================================================================
--  Modification et « rayage » des messages de main courante, côté Cim'Log.
--
--  Cim'Log est le registre officiel post-intervention : on ne réécrit pas
--  l'histoire, mais une erreur de saisie doit pouvoir se corriger dans la
--  foulée. D'où deux droits distincts, plus stricts que le tchat en direct
--  (modifier_message_chat.sql, sans limite de temps mais réservé au type
--  'chat') :
--
--    - modifier le contenu : possible seulement dans les 2h qui suivent la
--      création (`verrouille_le` matérialise cette fenêtre, voir plus bas).
--      Passé ce délai, le message est verrouillé — c'est ce que le petit
--      cadenas de chaque ligne affiche côté Cim'Log (ouvert et vert tant que
--      modifiable).
--    - rayer / dé-rayer : jamais de suppression, seulement une marque
--      visuelle (colonne `barre`) — l'entrée reste dans le registre, barrée
--      plutôt qu'effacée. Possible à tout moment, verrouillé ou non : ça ne
--      réécrit pas le contenu, juste sa validité.
--
--  Les deux se limitent aux messages qu'on a le droit de voir
--  (sections_visibles(), même logique que par_section / par_section_generale
--  dans auth_rls.sql et main_courante_generale.sql), et laissent de côté les
--  repères automatiques (origin = 'Système') : rien à corriger ni à rayer
--  sur une ligne que personne n'a écrite à la main.
-- =====================================================================

BEGIN;

ALTER TABLE messages ADD COLUMN IF NOT EXISTS barre boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION modifier_message_mc(
  p_id_status bigint,
  p_contenu   text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_contenu text := trim(coalesce(p_contenu, ''));
  v_rows    integer;
BEGIN
  IF v_contenu = '' THEN
    RETURN jsonb_build_object('ok', false, 'motif', 'message vide');
  END IF;

  UPDATE messages m
     SET content = v_contenu, updated_at = now()
   WHERE m.id_status = p_id_status
     AND m.origin <> 'Système'
     AND m.created_at > now() - interval '2 hours'
     AND (
       (m.event_id IS NULL AND m.squad_code = ANY (sections_visibles()))
       OR EXISTS (SELECT 1 FROM events e WHERE e.id = m.event_id AND e.squad_code = ANY (sections_visibles()))
     );

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN
    RETURN jsonb_build_object('ok', false, 'motif', 'message introuvable, ou verrouillé (plus de 2h)');
  END IF;

  RETURN jsonb_build_object('ok', true);
END $$;

CREATE OR REPLACE FUNCTION rayer_message_mc(
  p_id_status bigint,
  p_barre     boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_rows integer;
BEGIN
  UPDATE messages m
     SET barre = p_barre, updated_at = now()
   WHERE m.id_status = p_id_status
     AND m.origin <> 'Système'
     AND (
       (m.event_id IS NULL AND m.squad_code = ANY (sections_visibles()))
       OR EXISTS (SELECT 1 FROM events e WHERE e.id = m.event_id AND e.squad_code = ANY (sections_visibles()))
     );

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN
    RETURN jsonb_build_object('ok', false, 'motif', 'message introuvable');
  END IF;

  RETURN jsonb_build_object('ok', true);
END $$;

REVOKE ALL ON FUNCTION modifier_message_mc(bigint, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION rayer_message_mc(bigint, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION modifier_message_mc(bigint, text) TO authenticated;
GRANT EXECUTE ON FUNCTION rayer_message_mc(bigint, boolean) TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
