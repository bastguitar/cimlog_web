-- =====================================================================
--  Envoi automatique mensuel du SNOSM à Lars Fornell — Track'Log.
--
--  Décidé avec l'utilisateur après le retour de Lars du 24/10/2026 (point
--  6) : fréquence MENSUELLE, fenêtre glissante des 3 DERNIERS MOIS à
--  chaque envoi (pas seulement les nouvelles interventions depuis le
--  dernier envoi) — son import est idempotent côté SNOSM grâce aux id
--  stables (voir DECALAGE_ID_SNOSM / idLiaisonStable dans
--  supabase/functions/grist/index.ts), donc renvoyer 3 mois à chaque fois
--  ne crée pas de doublons, et rattrape une intervention complétée en
--  retard par un secouriste.
--
--  ⚠ Ce job NE DOIT PAS être activé avant la fin des tests en cours avec
--  Lars (bascule par unité pas encore faite, cf. échanges du 24/10/2026) —
--  décision explicite de l'utilisateur. Le cron.schedule reste donc
--  volontairement en commentaire, comme pour anonymiser_grist_apres_10_ans
--  (sql/anonymiser_grist_apres_10_ans.sql, même mécanisme pg_cron + pg_net).
--
--  L'export lui-même (construireExportSnosm) ne prend déjà que les
--  interventions dont SnosmTOCreeLe n'est pas vide, c'est-à-dire
--  effectivement complétées/validées par un secouriste dans Track'Log —
--  jamais une intervention juste clôturée côté Track'Alerte et pas encore
--  traitée (décision utilisateur, 24/10/2026).
--
--  Mêmes secrets que anonymiser_grist_apres_10_ans (déjà déposés si ce
--  job-là est en place) :
--    - reglages_techniques.supabase_anon_key
--    - reglages_techniques.grist_cron_secret
--  Et pour l'envoi d'email lui-même (déjà utilisés par exporterSnosm) :
--    - reglages_techniques.resend_api_key / snosm_email_expediteur /
--      snosm_email_destinataire
-- =====================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.exporter_snosm_mensuel()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_anon_key text;
  v_secret   text;
BEGIN
  SELECT valeur INTO v_anon_key FROM reglages_techniques WHERE cle = 'supabase_anon_key';
  SELECT valeur INTO v_secret   FROM reglages_techniques WHERE cle = 'grist_cron_secret';
  IF v_anon_key IS NULL OR v_secret IS NULL THEN
    RAISE WARNING 'exporter_snosm_mensuel : reglages_techniques incomplet (supabase_anon_key / grist_cron_secret), appel ignoré';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url     := 'https://xoqcilvsxpprnfukvgwd.supabase.co/functions/v1/grist',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_anon_key,
      'X-Cron-Secret', v_secret
    ),
    body    := jsonb_build_object(
      'action', 'exporterSnosm',
      'params', jsonb_build_object(
        'debut', to_char(now() - interval '3 months', 'YYYY-MM-DD"T"HH24:MI:SS'),
        'fin',   to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS')
      )
    )
  );
END $$;

-- Requête manuelle, pour tester une fois AVANT d'activer le cron.schedule — vérifier le mail reçu
-- (destinataire = reglages_techniques.snosm_email_destinataire) et le contenu du zip joint.
--   SELECT exporter_snosm_mensuel();

-- Volontairement PAS planifié — ne décommenter qu'une fois les tests avec Lars terminés et le feu
-- vert explicite de l'utilisateur donné. Le 1er de chaque mois à 4h (même heure que l'ancien export
-- SNOSM quotidien de Manu Grigoletto, mentionné par Lars le 24/10/2026 — pas de raison de changer).
--   SELECT cron.schedule('exporter-snosm-mensuel', '0 4 1 * *', 'SELECT exporter_snosm_mensuel()');

COMMIT;
