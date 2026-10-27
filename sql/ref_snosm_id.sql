-- =====================================================================
--  Correspondance stable EventId/victime -> id SNOSM compact — Track'Log.
--
--  Remplace le décalage arithmétique (DECALAGE_ID_SNOSM = 1 000 000 000)
--  mis en place le 24/10/2026 : Lars a confirmé le 27/10/2026 que tous les
--  id SNOSM sont des entiers 32 bits non signés (max 4 294 967 295) — un
--  simple décalage ne suffit pas, nos EventId Grist pouvant déjà être très
--  grands (vérifié : pas de plage garantie, voir scripts/intervention-test.mjs).
--
--  Nouvelle règle de Lars (27/10/2026, remplace sa demande du 23/10) :
--    - CrsAccident.id / CrsVictime.id : à partir de 20 000.
--    - Tables de liaison : à partir de 100 000, formule = id_parent * 1000 + id_choix
--      (automatiquement >= 20 000 000 si le parent est déjà >= 20 000, donc toujours
--      au-dessus de son plancher de 100 000 sans calcul supplémentaire).
--    - Toujours <= 4 294 967 295, et surtout : TOUJOURS LE MÊME id d'un export à
--      l'autre pour la même intervention/victime.
--
--  Mécanisme : une table de correspondance par type (intervention/victime), clé =
--  identifiant Grist stable (EventId / id interne Victimes), valeur = petit entier
--  attribué une seule fois via une séquence démarrant à 20 000, jamais réattribué.
--  La première fois qu'un EventId/victime est exporté, une ligne est créée ; toutes
--  les fois suivantes, la MÊME ligne est relue — garantit la stabilité demandée par
--  Lars même si l'EventId Grist source est arbitrairement grand.
-- =====================================================================

create sequence ref_snosm_id_intervention_seq start with 20000;
create table ref_snosm_id_intervention (
  event_id bigint primary key,
  snosm_id integer not null unique default nextval('ref_snosm_id_intervention_seq')
);
alter sequence ref_snosm_id_intervention_seq owned by ref_snosm_id_intervention.snosm_id;
alter table ref_snosm_id_intervention enable row level security;
-- Aucune policy : seul le service_role (Edge Function grist) y accède, même logique
-- que reglages_techniques / ref_tga_communes.

create sequence ref_snosm_id_victime_seq start with 20000;
create table ref_snosm_id_victime (
  victime_id bigint primary key,
  snosm_id integer not null unique default nextval('ref_snosm_id_victime_seq')
);
alter sequence ref_snosm_id_victime_seq owned by ref_snosm_id_victime.snosm_id;
alter table ref_snosm_id_victime enable row level security;
