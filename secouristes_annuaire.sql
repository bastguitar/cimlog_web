-- =====================================================================
--  Les secouristes d'une section ne viennent pas de `ref_secouristes` (créée
--  vide dans ref_schema.sql, jamais alimentée ni lue par aucune des deux
--  applications) mais de l'annuaire du personnel — projet Supabase distinct
--  (fllhwnxrisofbgcehnux, table `users`), tenu à jour par ailleurs. Voir
--  cimlog_web/src/lib/annuaire.js.
--
--  `effectifs_mc.secouriste_id` doit donc porter l'identifiant DE CET
--  ANNUAIRE (un uuid), pas celui de `ref_secouristes` (un bigint) — même
--  choix que `intervenants.secouriste_id` et `matricules_secouristes.
--  secouriste_id` côté alerte_secours_web : pas de clé étrangère, l'annuaire
--  vit dans un autre projet Supabase.
-- =====================================================================

BEGIN;

ALTER TABLE effectifs_mc DROP CONSTRAINT IF EXISTS effectifs_mc_secouriste_id_fkey;

-- USING NULL : la fonctionnalité vient d'être posée, aucune valeur bigint
-- existante n'a de correspondance côté annuaire — rien à préserver.
ALTER TABLE effectifs_mc ALTER COLUMN secouriste_id TYPE uuid USING NULL;

COMMENT ON COLUMN effectifs_mc.secouriste_id IS
  'Identifiant dans l’annuaire du personnel (autre projet Supabase) — pas de clé étrangère.';

COMMIT;

NOTIFY pgrst, 'reload schema';
