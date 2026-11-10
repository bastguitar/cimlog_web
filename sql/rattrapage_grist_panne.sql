-- =====================================================================
--  Rattrapage après une panne de Grist (504 / timeout, 09/11/2026).
--
--  pousser_intervention_grist envoie chaque intervention UNE SEULE FOIS, à
--  sa clôture, via pg_net (net.http_post, sans attendre la réponse) : si
--  Grist ne répond pas à ce moment-là, l'envoi est perdu sans bruit et
--  jamais retenté. Les fiches restent dans Supabase (events / victimes),
--  seule leur copie Grist manque — donc absentes du Registre Track'Log.
--
--  Principe : on demande à Grist quelles interventions il connaît parmi
--  celles clôturées depuis une date, et on ne renvoie QUE celles qu'il
--  n'a pas. Pas de renvoi aveugle : pendant une panne lente, un envoi peut
--  avoir échoué côté pg_net (délai dépassé) alors que Grist l'a bel et
--  bien enregistré — le renvoyer créerait un doublon.
--
--  ⚠ À lancer seulement quand Grist répond de nouveau normalement (le
--  document s'ouvre en quelques secondes) : sinon les renvois échouent
--  à leur tour, de la même façon.
--
--  Date de départ : '2026-11-08 00:00' ci-dessous (ÉTAPES 1, 3 et 4) —
--  la changer AUX TROIS ENDROITS si la panne a commencé plus tôt.
--
--  Limites connues :
--   - ClotureLe dans Grist vaudra l'heure du rattrapage (la fonction met
--     now()), pas l'heure réelle de clôture.
--   - Intervention présente dans Grist mais SANS ses victimes (seul le 2e
--     envoi a échoué) : signalée à l'étape 3, PAS renvoyée à l'étape 4
--     (la renvoyer dupliquerait la ligne Interventions) — à traiter à part.
--
--  EN 5 ÉTAPES, à coller UNE PAR UNE dans l'éditeur SQL Supabase (projet
--  Cim'Alerte). pg_net est asynchrone : la réponse de l'étape 1 n'est
--  lisible qu'après quelques secondes.
-- =====================================================================


-- --------------------------- ÉTAPE 1 : demander à Grist ce qu'il a déjà ---------------------------
-- Renvoie un numéro de requête (requete_id) — le noter, il sert aux étapes suivantes.
WITH cloturees AS (
  SELECT id FROM events
  WHERE statut = 'terminee'
    AND updated_at >= timestamptz '2026-11-08 00:00 Europe/Paris'
),
liste AS (
  SELECT coalesce(string_agg(id::text, ',' ORDER BY id), '0') AS ids FROM cloturees
)
SELECT net.http_post(
  url     := 'https://grist.numerique.gouv.fr/api/docs/'
             || (SELECT valeur FROM reglages_techniques WHERE cle = 'grist_doc_id')
             || '/sql',
  headers := jsonb_build_object(
               'Content-Type', 'application/json',
               'Authorization', 'Bearer ' || (SELECT valeur FROM reglages_techniques WHERE cle = 'grist_api_key')
             ),
  body    := jsonb_build_object('sql',
               'select EventId, ''I'' as T from Interventions where EventId in (' || (SELECT ids FROM liste) || ')'
               || ' union all '
               || 'select distinct EventId, ''V'' as T from Victimes where EventId in (' || (SELECT ids FROM liste) || ')'
             ),
  timeout_milliseconds := 60000
) AS requete_id;


-- --------------------------- ÉTAPE 2 : vérifier la réponse (attendre ~5 s) ---------------------------
-- Remplacer 123 par le requete_id de l'étape 1.
-- Attendu : status_code = 200, timed_out = false. Sinon Grist ne va pas encore bien : NE PAS continuer.
SELECT status_code, timed_out, error_msg,
       jsonb_array_length(content::jsonb -> 'records') AS lignes_trouvees_dans_grist
FROM net._http_response
WHERE id = 123;


-- --------------------------- ÉTAPE 3 : APERÇU (ne modifie rien) ---------------------------
-- Remplacer 123. Une ligne par intervention clôturée depuis la date :
--   A RENVOYER          -> absente de Grist, sera renvoyée à l'étape 4
--   VICTIMES MANQUANTES -> intervention dans Grist mais pas ses victimes (à traiter à part)
--   ok                  -> rien à faire
WITH grist AS (
  SELECT (r -> 'fields' ->> 'EventId')::bigint AS event_id, r -> 'fields' ->> 'T' AS t
  FROM net._http_response h, jsonb_array_elements(h.content::jsonb -> 'records') r
  WHERE h.id = 123 AND h.status_code = 200
)
SELECT e.squad_code, e.local_id, e.id AS event_id,
       e.alert_at AT TIME ZONE 'Europe/Paris' AS alerte,
       (SELECT count(*) FROM victimes v WHERE v.event_id = e.id) AS victimes_supabase,
       CASE
         WHEN NOT EXISTS (SELECT 1 FROM grist g WHERE g.event_id = e.id AND g.t = 'I') THEN 'A RENVOYER'
         WHEN EXISTS (SELECT 1 FROM victimes v WHERE v.event_id = e.id)
          AND NOT EXISTS (SELECT 1 FROM grist g WHERE g.event_id = e.id AND g.t = 'V') THEN 'VICTIMES MANQUANTES'
         ELSE 'ok'
       END AS etat
FROM events e
WHERE e.statut = 'terminee'
  AND e.updated_at >= timestamptz '2026-11-08 00:00 Europe/Paris'
ORDER BY etat, e.squad_code, e.alert_at;


-- --------------------------- ÉTAPE 4 : RENVOI vers Grist ---------------------------
-- Remplacer 123. Ne renvoie que les lignes « A RENVOYER » de l'aperçu (intervention + victimes).
DO $$
DECLARE
  v_id     bigint;
  v_compte int := 0;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM net._http_response WHERE id = 123 AND status_code = 200) THEN
    RAISE EXCEPTION 'Réponse Grist 123 absente ou en erreur : relancer les étapes 1-2.';
  END IF;

  FOR v_id IN
    SELECT e.id FROM events e
    WHERE e.statut = 'terminee'
      AND e.updated_at >= timestamptz '2026-11-08 00:00 Europe/Paris'
      AND NOT EXISTS (
        SELECT 1
        FROM net._http_response h, jsonb_array_elements(h.content::jsonb -> 'records') r
        WHERE h.id = 123
          AND r -> 'fields' ->> 'T' = 'I'
          AND (r -> 'fields' ->> 'EventId')::bigint = e.id
      )
    ORDER BY e.id
  LOOP
    PERFORM pousser_intervention_grist(v_id);
    v_compte := v_compte + 1;
    IF v_compte % 20 = 0 THEN
      PERFORM pg_sleep(2);
    END IF;
  END LOOP;
  RAISE NOTICE 'Rattrapage : % intervention(s) renvoyée(s) vers Grist', v_compte;
END $$;


-- --------------------------- ÉTAPE 5 : CONTRÔLE ---------------------------
-- Attendre ~30 s, puis relancer les étapes 1, 2 et 3 (avec le NOUVEAU requete_id) :
-- plus aucune ligne « A RENVOYER » ne doit apparaître. S'il en reste, Grist a encore
-- refusé ou laissé tomber l'envoi — réessayer plus tard, ça ne crée pas de doublon.
