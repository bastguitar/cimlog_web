-- =====================================================================
--  Postes rattachés, sur le modèle de Modane/Courchevel (auth_rls.sql) :
--  pas de compte de connexion propre, mais une ligne dans `sections` pour
--  que leur historique reste visible depuis la section mère
--  (`sections_visibles()`, qui inclut déjà les enfants via `parent_code`).
--
--    Albertville (CRS73) -> Modane, Courchevel : déjà en place.
--    Grenoble    (CRS38) -> Alpe d'Huez
--    Nice        (CRS06) -> Saint-Martin-Vésubie
--    Briançon    (CRS05) -> aucun poste
--    Perpignan   (CRS66) -> Bolquère
--    Lannemezan  (CRS65) -> Gavarnie, Luchon, Saint-Lary-Soulan
-- =====================================================================

BEGIN;

INSERT INTO sections (code, nom, groupe, departement_defaut, lat, lon, zoom, type, parent_code) VALUES
  ('CRS38H', 'Alpe d’Huez',            'CRS38', '38', 45.0910, 6.0700,  14, 'poste', 'CRS38'),
  ('CRS06V', 'Saint-Martin-Vésubie',   'CRS06', '06', 44.0700, 7.2580,  14, 'poste', 'CRS06'),
  ('CRS66B', 'Bolquère',               'CRS66', '66', 42.5040, 2.1080,  14, 'poste', 'CRS66'),
  ('CRS65G', 'Gavarnie',               'CRS65', '65', 42.7330, -0.0090, 14, 'poste', 'CRS65'),
  ('CRS65L', 'Luchon',                 'CRS65', '31', 42.7900, 0.5960,  14, 'poste', 'CRS65'),
  ('CRS65S', 'Saint-Lary-Soulan',      'CRS65', '65', 42.8130, 0.3280,  14, 'poste', 'CRS65')
ON CONFLICT (code) DO NOTHING;

COMMIT;

NOTIFY pgrst, 'reload schema';
