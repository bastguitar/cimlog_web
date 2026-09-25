-- =====================================================================
--  Politique de conservation des données personnelles — Cim'Log.
--
--  Décidée avec l'utilisateur (24-25/09/2026), dans le cadre du dossier
--  d'homologation administrative partagé avec Cim'Alerte. Logique
--  différente de Cim'Alerte (voir sql/purge_identites.sql côté
--  alerte_secours_web, purge en DEUX temps : 1 an puis 10 ans) : les
--  interventions closes vivent déjà sur Grist, la « zone sécurisée » du
--  Ministère de l'Intérieur — moins de pression pour effacer vite, seule
--  une conservation trop longue reste à borner. Cim'Log fait donc tout en
--  UN seul passage, à 10 ans.
--
--  10 ans après l'alerte (AlerteLe) : tout ce qui identifie directement
--  une personne (nom, coordonnées, date/lieu de naissance) OU la décrit
--  assez pour la reconnaître (récit libre des circonstances) est effacé —
--  sur les victimes ET le(s) requérant(s)/la personne recherchée. Le
--  reste (date, commune de l'intervention, activité, type d'accident,
--  moyens engagés, sexe/âge/pathologie/gravité des victimes) n'est PAS
--  touché : statistique, ne réidentifie personne à lui seul.
--
--  Le TO déjà validé (SnosmTOTexte, JSON gardé pour retéléchargement à
--  l'identique) contient une copie figée de tout ça — effacé lui aussi
--  au même passage, sans quoi l'anonymisation serait incomplète.
--
--  ⚠ Rédacteur/Signataire/Directeur d'enquête ne sont PAS effacés : ce
--  sont des membres du personnel CRS en service, pas des personnes
--  secourues — même logique que Cim'Alerte qui ne purge jamais la liste
--  des secouristes engagés. Liste exacte des colonnes Grist concernées :
--  voir COLONNES_VICTIME_A_ANONYMISER / COLONNES_INTERVENTION_A_ANONYMISER
--  dans supabase/functions/grist/index.ts (source de vérité unique, cette
--  requête Postgres ne fait que déclencher le job, pas la liste elle-même).
--
--  MÉCANISME : contrairement à Cim'Alerte, ni pg_cron seul ni un accès
--  direct à une base ne s'appliquent à Grist (c'est une API HTTP externe,
--  pas une table Postgres) — le travail réel est fait par une action
--  dédiée de l'Edge Function `grist` (anonymiserAnciennes), déclenchée ICI
--  par pg_cron + pg_net (net.http_post), déjà utilisés par
--  pousser_intervention_grist pour parler à Grist depuis Postgres.
--
--  Authentification de cet appel : PAS un jeton de poste (ce job n'a pas
--  de notion de section/région, il s'applique à toutes les interventions)
--  — un secret dédié (grist_cron_secret) vérifié côté Edge Function, à
--  générer et déposer soi-même :
--
--    INSERT INTO reglages_techniques (cle, valeur) VALUES
--      ('grist_cron_secret', '<une chaîne aléatoire longue, ex. openssl rand -hex 32>')
--    ON CONFLICT (cle) DO UPDATE SET valeur = excluded.valeur;
--
--  L'appel HTTP doit malgré tout porter un jeton signé du projet pour
--  passer la vérification JWT de la plateforme Supabase (« Verify JWT »
--  coché sur cette fonction) — la clé ANON suffit (elle n'est pas secrète,
--  déjà publique dans le bundle du navigateur) : à déposer aussi si pas
--  déjà présente sous ce nom précis :
--
--    INSERT INTO reglages_techniques (cle, valeur) VALUES
--      ('supabase_anon_key', '<VITE_SUPABASE_ANON_KEY, celle du .env frontend>')
--    ON CONFLICT (cle) DO UPDATE SET valeur = excluded.valeur;
--
--  ⚠ À FAIRE AVANT LA PREMIÈRE EXÉCUTION RÉELLE : relire la liste de
--  colonnes dans grist/index.ts (première fois qu'une liste de champs
--  identifiants/narratifs est écrite pour Cim'Log, à faire confirmer),
--  déployer la version à jour de l'Edge Function `grist`, déposer les deux
--  secrets ci-dessus, TESTER manuellement une fois (voir requête manuelle
--  plus bas) avant d'activer le cron.schedule (volontairement laissé en
--  commentaire à la fin de ce fichier).
-- =====================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.anonymiser_grist_apres_10_ans()
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
    RAISE WARNING 'anonymiser_grist_apres_10_ans : reglages_techniques incomplet (supabase_anon_key / grist_cron_secret), appel ignoré';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url     := 'https://xoqcilvsxpprnfukvgwd.supabase.co/functions/v1/grist',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_anon_key,
      'X-Cron-Secret', v_secret
    ),
    body    := jsonb_build_object('action', 'anonymiserAnciennes', 'params', '{}'::jsonb)
  );
END $$;

-- Requête manuelle, pour tester une fois APRÈS avoir déposé les secrets et déployé l'Edge Function,
-- AVANT d'activer le cron.schedule ci-dessous — vérifier ensuite quelques lignes Victimes/
-- Interventions récemment franchies les 10 ans dans Grist (normalement très rares au début).
--   SELECT anonymiser_grist_apres_10_ans();

-- Volontairement PAS planifié — décommenter une fois le test manuel ci-dessus confirmé bon.
-- Une fois par jour, décalé de l'heure ronde (même logique que purge-identites côté Cim'Alerte).
--   SELECT cron.schedule('anonymiser-grist-10-ans', '37 3 * * *', 'SELECT anonymiser_grist_apres_10_ans()');

COMMIT;
