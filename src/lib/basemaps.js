/**
 * Fonds de carte IGN (Géoplateforme) — repris de
 * alerte_secours_web/src/lib/basemaps.js, réduit aux deux fonds (Cim'Log
 * n'a pas besoin des surcouches opérationnelles de la prise d'alerte :
 * pentes, pistes, obstacles, aéronefs… celles-ci restent propres à
 * alerte_secours_web).
 *
 * SCAN25 est une couche protégée : elle exige la clé. Les orthophotos sont
 * publiques et n'en demandent aucune.
 */

const IGN_KEY = import.meta.env.VITE_IGN_API_KEY

const wmts = (base, params) =>
  `${base}?${new URLSearchParams({
    SERVICE: 'WMTS',
    REQUEST: 'GetTile',
    VERSION: '1.0.0',
    STYLE: 'normal',
    TILEMATRIXSET: 'PM',
    ...params,
  }).toString()}&TILEMATRIX={z}&TILECOL={x}&TILEROW={y}`
  // TILEMATRIX/TILECOL/TILEROW ajoutés après coup : URLSearchParams
  // encoderait les accolades des gabarits Leaflet ({z}, {x}, {y}).

const ATTRIBUTION = '<a href="https://www.ign.fr/">IGN</a> — Géoplateforme'

export const BASEMAPS = {
  scan25: {
    id: 'scan25',
    url: wmts('https://data.geopf.fr/private/wmts', {
      apikey: IGN_KEY,
      LAYER: 'GEOGRAPHICALGRIDSYSTEMS.MAPS',
      FORMAT: 'image/jpeg',
    }),
    maxNativeZoom: 18,
    attribution: `Cartes IGN — ${ATTRIBUTION}`,
  },
  satellite: {
    id: 'satellite',
    url: wmts('https://data.geopf.fr/wmts', {
      LAYER: 'ORTHOIMAGERY.ORTHOPHOTOS',
      FORMAT: 'image/jpeg',
    }),
    maxNativeZoom: 19,
    attribution: `Orthophotos — ${ATTRIBUTION}`,
  },
}

export const MAX_ZOOM = 19
