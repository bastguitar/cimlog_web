-- =====================================================================
--  Repeuple Grist (Interventions/Victimes, vidées côté Cim'Log pour éviter
--  les doublons) en appelant pousser_intervention_grist pour chaque
--  intervention clôturée — voir grist_synchronisation_cimlog.sql.
--
--  DÉCOUPÉ EN 5 BLOCS INDÉPENDANTS : le premier essai (script à un seul
--  DO $$...$$) s'est arrêté à mi-chemin (1228 sur ~2459), probablement la
--  limite de temps de l'éditeur SQL Supabase (souvent ~1 minute) sur une
--  seule exécution. Chaque bloc ci-dessous ne traite que 500 interventions
--  — largement sous cette limite.
--
--  À FAIRE : coller et exécuter le Bloc 1 seul, attendre qu'il affiche son
--  message "terminé" dans les logs, PUIS coller et exécuter le Bloc 2, etc.
--  Ne pas coller les 5 blocs d'un coup.
-- =====================================================================

-- --------------------------- BLOC 1 (interventions 1 à 500) ---------------------------
DO $$
DECLARE
  v_id      bigint;
  v_compte  int := 0;
BEGIN
  FOR v_id IN
    SELECT id FROM events WHERE statut = 'terminee' ORDER BY id LIMIT 500 OFFSET 0
  LOOP
    PERFORM pousser_intervention_grist(v_id);
    v_compte := v_compte + 1;
    IF v_compte % 200 = 0 THEN
      RAISE NOTICE 'Bloc 1 : % envoyées', v_compte;
      PERFORM pg_sleep(2);
    END IF;
  END LOOP;
  RAISE NOTICE 'Bloc 1 terminé : % interventions', v_compte;
END $$;

-- --------------------------- BLOC 2 (interventions 501 à 1000) ---------------------------
DO $$
DECLARE
  v_id      bigint;
  v_compte  int := 0;
BEGIN
  FOR v_id IN
    SELECT id FROM events WHERE statut = 'terminee' ORDER BY id LIMIT 500 OFFSET 500
  LOOP
    PERFORM pousser_intervention_grist(v_id);
    v_compte := v_compte + 1;
    IF v_compte % 200 = 0 THEN
      RAISE NOTICE 'Bloc 2 : % envoyées', v_compte;
      PERFORM pg_sleep(2);
    END IF;
  END LOOP;
  RAISE NOTICE 'Bloc 2 terminé : % interventions', v_compte;
END $$;

-- --------------------------- BLOC 3 (interventions 1001 à 1500) ---------------------------
DO $$
DECLARE
  v_id      bigint;
  v_compte  int := 0;
BEGIN
  FOR v_id IN
    SELECT id FROM events WHERE statut = 'terminee' ORDER BY id LIMIT 500 OFFSET 1000
  LOOP
    PERFORM pousser_intervention_grist(v_id);
    v_compte := v_compte + 1;
    IF v_compte % 200 = 0 THEN
      RAISE NOTICE 'Bloc 3 : % envoyées', v_compte;
      PERFORM pg_sleep(2);
    END IF;
  END LOOP;
  RAISE NOTICE 'Bloc 3 terminé : % interventions', v_compte;
END $$;

-- --------------------------- BLOC 4 (interventions 1501 à 2000) ---------------------------
DO $$
DECLARE
  v_id      bigint;
  v_compte  int := 0;
BEGIN
  FOR v_id IN
    SELECT id FROM events WHERE statut = 'terminee' ORDER BY id LIMIT 500 OFFSET 1500
  LOOP
    PERFORM pousser_intervention_grist(v_id);
    v_compte := v_compte + 1;
    IF v_compte % 200 = 0 THEN
      RAISE NOTICE 'Bloc 4 : % envoyées', v_compte;
      PERFORM pg_sleep(2);
    END IF;
  END LOOP;
  RAISE NOTICE 'Bloc 4 terminé : % interventions', v_compte;
END $$;

-- --------------------------- BLOC 5 (interventions 2001 à la fin) ---------------------------
DO $$
DECLARE
  v_id      bigint;
  v_compte  int := 0;
BEGIN
  FOR v_id IN
    SELECT id FROM events WHERE statut = 'terminee' ORDER BY id OFFSET 2000
  LOOP
    PERFORM pousser_intervention_grist(v_id);
    v_compte := v_compte + 1;
    IF v_compte % 200 = 0 THEN
      RAISE NOTICE 'Bloc 5 : % envoyées', v_compte;
      PERFORM pg_sleep(2);
    END IF;
  END LOOP;
  RAISE NOTICE 'Bloc 5 terminé : % interventions', v_compte;
END $$;
