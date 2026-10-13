-- =====================================================================
--  Rattrapage du champ Helicopter (colonne « Moyen » du Registre) dans
--  Grist, pour les interventions poussées pendant que la fonction
--  pousser_intervention_grist déployée ne l'envoyait plus (voir
--  ajout_helicopter_grist.sql) — constaté sur ~9-27/09/2026, toutes
--  sections, alors que events.helicopter est bien rempli côté Supabase.
--
--  Règle unique : on ne complète QUE les lignes Grist dont Helicopter est
--  VIDE, avec la valeur de events.helicopter (si elle n'est pas vide).
--  Aucune valeur déjà présente dans Grist n'est touchée — y compris les
--  corrections faites depuis Track'Log.
--
--  EXÉCUTÉ LE 13/10/2026 : 962 lignes Grist sans moyen, dont 138
--  complétées (toutes de septembre 2026, 6 sections) — les autres sont
--  vides aussi dans Supabase. Grist : actionNum 4244.
--
--  EN 4 ÉTAPES, à coller UNE PAR UNE dans l'éditeur SQL Supabase (projet
--  Cim'Alerte). pg_net est asynchrone : la réponse de l'étape 1 n'est
--  lisible qu'après quelques secondes.
-- =====================================================================


-- --------------------------- ÉTAPE 1 : lire les lignes Grist sans moyen ---------------------------
-- Renvoie un numéro de requête (requete_id) — le noter, il sert aux étapes suivantes.
SELECT net.http_get(
  url     := 'https://grist.numerique.gouv.fr/api/docs/'
             || (SELECT valeur FROM reglages_techniques WHERE cle = 'grist_doc_id')
             || '/tables/Interventions/records',
  params  := jsonb_build_object('filter', '{"Helicopter": ["", null]}'),
  headers := jsonb_build_object('Authorization', 'Bearer ' || (SELECT valeur FROM reglages_techniques WHERE cle = 'grist_api_key')),
  timeout_milliseconds := 60000
) AS requete_id;


-- --------------------------- ÉTAPE 2 : vérifier la réponse (attendre ~5 s) ---------------------------
-- Remplacer 123 par le requete_id de l'étape 1. Attendu : status_code = 200 et un nombre de lignes.
SELECT status_code, error_msg, jsonb_array_length(content::jsonb -> 'records') AS lignes_grist_sans_moyen
FROM net._http_response
WHERE id = 123;


-- --------------------------- ÉTAPE 3 : APERÇU (ne modifie rien) ---------------------------
-- Remplacer 123. Liste ce qui sera complété — à relire avant l'étape 4.
WITH grist AS (
  SELECT (r ->> 'id')::bigint AS row_id, (r -> 'fields' ->> 'EventId')::bigint AS event_id
  FROM net._http_response h, jsonb_array_elements(h.content::jsonb -> 'records') r
  WHERE h.id = 123 AND h.status_code = 200
)
SELECT e.squad_code, e.local_id, e.created_at, e.helicopter AS moyen_a_ecrire, g.row_id AS ligne_grist
FROM grist g
JOIN events e ON e.id = g.event_id
WHERE nullif(trim(e.helicopter), '') IS NOT NULL
ORDER BY e.created_at;


-- --------------------------- ÉTAPE 4 : ÉCRITURE dans Grist ---------------------------
-- Remplacer 123 (deux fois). Une seule requête groupée vers Grist pour toutes les lignes de l'aperçu.
WITH grist AS (
  SELECT (r ->> 'id')::bigint AS row_id, (r -> 'fields' ->> 'EventId')::bigint AS event_id
  FROM net._http_response h, jsonb_array_elements(h.content::jsonb -> 'records') r
  WHERE h.id = 123 AND h.status_code = 200
),
a_completer AS (
  SELECT g.row_id, trim(e.helicopter) AS helicopter
  FROM grist g
  JOIN events e ON e.id = g.event_id
  WHERE nullif(trim(e.helicopter), '') IS NOT NULL
)
SELECT net.http_post(
  url     := 'https://grist.numerique.gouv.fr/api/docs/'
             || (SELECT valeur FROM reglages_techniques WHERE cle = 'grist_doc_id')
             || '/apply',
  headers := jsonb_build_object(
               'Content-Type', 'application/json',
               'Authorization', 'Bearer ' || (SELECT valeur FROM reglages_techniques WHERE cle = 'grist_api_key')
             ),
  body    := jsonb_build_array(jsonb_build_array(
               'BulkUpdateRecord',
               'Interventions',
               (SELECT jsonb_agg(row_id ORDER BY row_id) FROM a_completer),
               jsonb_build_object('Helicopter', (SELECT jsonb_agg(helicopter ORDER BY row_id) FROM a_completer))
             )),
  timeout_milliseconds := 60000
) AS requete_ecriture_id
WHERE EXISTS (SELECT 1 FROM a_completer);

-- Puis, après ~5 s (remplacer 456 par requete_ecriture_id) — attendu : status_code = 200.
-- SELECT status_code, error_msg, content FROM net._http_response WHERE id = 456;
