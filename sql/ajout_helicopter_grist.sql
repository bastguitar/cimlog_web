-- =====================================================================
--  Ajoute le champ Helicopter à la synchronisation Grist (Cim'Log en a
--  besoin pour les Stats et le filtre « Moyen »). Reprend la version
--  ACTUELLEMENT déployée (avec l'interrupteur grist_push_actif ajouté
--  depuis côté Cim'Alerte) — la version précédente de ce fichier avait été
--  écrasée par ce déploiement, d'où l'absence de Helicopter malgré son
--  exécution.
--
--  À FAIRE VALIDER PAR LA SESSION CIM'ALERTE avant exécution. Un seul
--  changement réel par rapport à la version déployée : la ligne
--  `'Helicopter', v_event.helicopter,` insérée après `'TypeOperation'`.
--  Tout le reste (y compris l'interrupteur grist_push_actif) est préservé
--  à l'identique.
-- =====================================================================

BEGIN;

CREATE OR REPLACE FUNCTION pousser_intervention_grist(p_event_id bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_doc_id   text;
  v_cle      text;
  v_actif    text;
  v_event    events%ROWTYPE;
  v_base     text;
  v_victimes jsonb;
BEGIN
  SELECT valeur INTO v_actif FROM reglages_techniques WHERE cle = 'grist_push_actif';
  -- Absente : on n'a jamais coupé l'envoi, comportement inchangé.
  IF v_actif = 'false' THEN
    RETURN;
  END IF;

  SELECT valeur INTO v_doc_id FROM reglages_techniques WHERE cle = 'grist_doc_id';
  SELECT valeur INTO v_cle    FROM reglages_techniques WHERE cle = 'grist_api_key';
  IF v_doc_id IS NULL OR v_cle IS NULL THEN
    RAISE WARNING 'pousser_intervention_grist : reglages_techniques incomplet, envoi Grist ignoré';
    RETURN;
  END IF;

  SELECT * INTO v_event FROM events WHERE id = p_event_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_base := 'https://grist.numerique.gouv.fr/api/docs/' || v_doc_id || '/tables/';

  PERFORM net.http_post(
    url     := v_base || 'Interventions/records',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_cle),
    body    := jsonb_build_object(
      'records', jsonb_build_array(jsonb_build_object('fields', jsonb_build_object(
        'EventId',              v_event.id,
        'Section',              v_event.squad_code,
        'NumeroIntervention',   v_event.local_id,
        'Statut',               v_event.statut,
        'ClotureLe',            extract(epoch from now()),
        'OrigineAlerte',        v_event.alert_origin,
        'AlerteLe',             extract(epoch from v_event.alert_at),
        'Massif',               v_event.massif,
        'Departement',          v_event.county,
        'Commune',              v_event.com,
        'Lieu',                 v_event.lieu,
        'TypeLocalisation',     v_event.type_localisation,
        'Altitude',             v_event.alt,
        'CoordonneesGPS',       CASE WHEN v_event.lat IS NOT NULL AND v_event.lon IS NOT NULL
                                      THEN v_event.lat::text || ', ' || v_event.lon::text
                                      ELSE NULL END,
        'TGI',                  v_event.tgi,
        'RequerantNom',         v_event.requerant_nom,
        'RequerantTelephone',   v_event.requerant_telephone,
        'ContreAppel',          v_event.contre_appel,
        'Activite',             v_event.activity,
        'AccidentType',         v_event.accident_type,
        'TypeOperation',        v_event.type_intervention,
        'Helicopter',           v_event.helicopter,
        'MoyensEngages',        (SELECT string_agg(m, ', ') FROM jsonb_array_elements_text(v_event.moyens_engages) m),
        'SupportUnits',         v_event.support_units,
        'Secouristes',          (SELECT string_agg(s, ', ') FROM jsonb_array_elements_text(v_event.team) s),
        'Meteo',                v_event.meteo,
        'Medicalisation',       coalesce(v_event.is_med, false),
        'Infirmier',            coalesce(v_event.infirmier, false),
        'CirconstancesGenerales', v_event.description,
        'RecherchePersonne',    coalesce(v_event.recherche_personne, false),
        'PersonneRechercheeNom', v_event.personne_recherchee_nom,
        'NombreVictimes',       (SELECT count(*) FROM victimes WHERE event_id = p_event_id)
      )))
    )
  );

  SELECT jsonb_agg(jsonb_build_object('fields', jsonb_build_object(
    'EventId',              p_event_id,
    'NumeroVictime',        v.rang,
    'Sexe',                 v.sexe,
    'Age',                  v.age,
    'Circonstances',        v.circonstances,
    'Cinetique',            v.cinetique,
    'Blessures',            v.pathologie,
    'InfosComplementaires', v.infos_complementaires,
    'Douleur',              v.douleur,
    'Nom',                  v.nom,
    'Prenom',               v.prenom,
    'DateNaissance',        v.date_naissance::text,
    'Nationalite',          v.nationalite,
    'Telephone',            v.telephone
  )))
  INTO v_victimes
  FROM (
    SELECT *, row_number() OVER (ORDER BY id) AS rang
    FROM victimes
    WHERE event_id = p_event_id
  ) v;

  IF v_victimes IS NOT NULL THEN
    PERFORM net.http_post(
      url     := v_base || 'Victimes/records',
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_cle),
      body    := jsonb_build_object('records', v_victimes)
    );
  END IF;
END $$;

COMMIT;
