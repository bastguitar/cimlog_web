-- =====================================================================
--  Homogénéisation de `events.helicopter` — le filtre « Moyen » du Registre
--  (cimlog_web) en tire sa liste de valeurs, et une même ressource écrite de
--  plusieurs façons (« DRAGON 38-1 », « Dragon 38 1 », « Dragon 38.1 »…)
--  ressortait comme autant d'entrées différentes.
--
--  Ne touche qu'à la casse/ponctuation d'un intitulé déjà identifié en base
--  (vérifié par comptage avant d'écrire ce fichier) — pas aux lignes qui
--  décrivent plusieurs moyens à la fois (« DRAGON 38-2, Terrestre »), qui
--  restent des cas particuliers légitimes, pas des doublons à fusionner.
--
--  ⚠ DÉJÀ EXÉCUTÉ (le 1ᵉʳ septembre 2026, par connexion directe — voir plus
--    bas) : conservé ici pour mémoire, à titre de documentation du
--    changement. Idempotent (chaque UPDATE ne trouve plus rien à corriger
--    une fois passé), donc sans risque à rejouer si besoin.
--
--  La plupart de ces fiches sont closes, et `refuser_modification_close`
--  (cloture.sql) interdit d'y toucher. Le contournement qu'il prévoit lui-même
--  (réglage de session `app.import`, pour les reprises depuis l'ancien
--  logiciel) n'a fonctionné qu'une fois exécuté par une connexion Postgres
--  directe (`psql`/client `pg`) — l'éditeur SQL du dashboard Supabase semble
--  exécuter chaque instruction dans sa propre transaction, ce qui fait
--  retomber `SET LOCAL` avant l'UPDATE suivant. Piste écartée en cours de
--  route : faire passer les fiches par une réouverture temporaire
--  (`statut = 'en_cours'` puis retour à `'terminee'`) — deux autres
--  déclencheurs réagissent au changement de `statut`
--  (`apres_validation_alerte`, qui notifierait toute la section comme pour
--  une vraie alerte ; `purger_positions_intervention`, qui supprimerait
--  l'historique GPS à la fermeture) : à éviter absolument pour une simple
--  correction de texte.
-- =====================================================================

BEGIN;
SET LOCAL app.import = 'on';

UPDATE events SET helicopter = trim(helicopter) WHERE helicopter IS NOT NULL AND helicopter <> trim(helicopter);

UPDATE events SET helicopter = 'DRAGON 38-1' WHERE helicopter IN ('Dragon 38 1', 'Dragon 38.1');
UPDATE events SET helicopter = 'TERRESTRE' WHERE helicopter IN ('terrestre', 'Terrestre');
UPDATE events SET helicopter = 'CHOUCAS 73' WHERE helicopter = 'Choucas 73';
UPDATE events SET helicopter = 'DRAGON 73' WHERE helicopter IN ('dragon 73', 'Dragon 73');
UPDATE events SET helicopter = 'Pas de moyens engagés' WHERE helicopter = 'PAS DE MOYENS ENGAGES';

-- Faute de frappe isolée dans une ligne qui liste plusieurs moyens.
UPDATE events SET helicopter = replace(helicopter, 'DRANGON', 'DRAGON')
 WHERE helicopter LIKE '%DRANGON%';

COMMIT;

NOTIFY pgrst, 'reload schema';
