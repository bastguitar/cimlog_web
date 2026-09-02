import { useEffect, useMemo, useState } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { listerAnnee } from '../lib/registre'
import { STATUTS } from '../lib/mainCourante'
import { couleurSection } from '../lib/sections'
import { BASEMAPS, MAX_ZOOM } from '../lib/basemaps'
import { useFiltresRegistre } from '../hooks/useFiltresRegistre'
import { useFiltreSections } from '../hooks/useFiltreSections'
import { ControlesFiltresRegistre, PanneauFiltresRegistre } from '../components/FiltresRegistre'
import SelecteurSections from '../components/SelecteurSections'
import ModaleFiche from '../components/ModaleFiche'

const formatDate = (iso) => new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })

/** Coordonnées par défaut (Grenoble) si le poste connecté n'en porte pas encore. */
const CENTRE_DEFAUT = [45.1885, 5.7245]
const ZOOM_DEFAUT = 11

/**
 * Un repère par intervention, numéro visible directement dessus — pas une
 * simple pastille de couleur : c'est ce numéro qui permet de rapprocher un
 * point de la carte d'une ligne du Registre sans avoir à cliquer chaque
 * repère un par un.
 */
const icones = new Map() // "couleur|anneau" -> Map(local_id -> L.DivIcon)
function iconeNumero(local_id, couleur, anneau = null) {
  const cle = `${couleur}|${anneau ?? ''}`
  if (!icones.has(cle)) {
    icones.set(
      cle,
      new Map() // local_id -> icône, la couleur ne change pas mais le numéro si
    )
  }
  const parCouleur = icones.get(cle)
  if (!parCouleur.has(local_id)) {
    const style = anneau
      ? `background:${couleur};box-shadow:0 0 0 2.5px ${anneau}, 0 1px 4px rgba(0,0,0,.45)`
      : `background:${couleur}`
    parCouleur.set(
      local_id,
      L.divIcon({
        className: 'icone-secours-carte',
        html: `<span style="${style}">${local_id}</span>`,
        iconSize: null,
      })
    )
  }
  return parCouleur.get(local_id)
}

/**
 * Recentre/zoome la carte quand la section choisie change — `MapContainer`
 * n'écoute ses props `center`/`zoom` qu'au montage, il faut passer par la
 * carte Leaflet elle-même (useMap) pour la déplacer après coup.
 */
function RecentrageCarte({ centre, zoom, limites }) {
  const carte = useMap()
  useEffect(() => {
    if (limites) carte.fitBounds(limites, { padding: [40, 40] })
    else carte.setView(centre, zoom)
  }, [centre, zoom, limites, carte])
  return null
}

/**
 * Carte IGN — les interventions de l'année, positionnées géographiquement.
 * Mêmes fonds de carte que Cim'Alerte (Géoplateforme IGN, clé SCAN25 comprise
 * — voir lib/basemaps.js), réduits aux deux fonds : pas besoin des
 * surcouches opérationnelles (pentes, obstacles, aéronefs…) propres à la
 * prise d'alerte en direct, ici on relit après coup. La fiche ouverte au
 * clic sur un repère est la même que celle du Registre.
 */
export default function CarteIGN({ poste }) {
  const [annee, setAnnee] = useState(() => new Date().getFullYear())
  const [evenements, setEvenements] = useState([])
  const [erreur, setErreur] = useState(null)
  const [melange, setMelange] = useState(0)
  const [ficheId, setFicheId] = useState(null)

  const fSections = useFiltreSections(poste)

  useEffect(() => {
    listerAnnee(annee, fSections.codesRequete)
      .then(setEvenements)
      .catch((e) => setErreur(e.message))
  }, [annee, fSections.codesRequete])

  const f = useFiltresRegistre(evenements)

  const points = useMemo(
    () =>
      f.evenementsFiltres
        .map((s) => ({ ...s, lat: Number(s.lat), lon: Number(s.lon) }))
        .filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lon) && (s.lat !== 0 || s.lon !== 0)),
    [f.evenementsFiltres]
  )

  const centre = poste?.lat && poste?.lon ? [Number(poste.lat), Number(poste.lon)] : CENTRE_DEFAUT
  const zoom = poste?.zoom ?? ZOOM_DEFAUT
  const pourcent = Math.round(melange * 100)

  // Centre/zoom de la section choisie dans le menu — sur toute la région
  // (CRS Alpes/Pyrénées), on cadre plutôt sur les repères réellement affichés,
  // qui en disent plus que le centre d'une seule section.
  const sectionActive =
    fSections.selection && fSections.selection !== 'REGION'
      ? fSections.sections.find((s) => s.code === fSections.selection)
      : null
  const centreCarte = sectionActive?.lat && sectionActive?.lon ? [Number(sectionActive.lat), Number(sectionActive.lon)] : centre
  const zoomCarte = sectionActive?.zoom ?? zoom
  const limitesRegion = fSections.selection === 'REGION' && points.length > 0 ? points.map((p) => [p.lat, p.lon]) : null

  return (
    <section className="page page-mc">
      <div className="barre-mc">
        <div className="nav-jour-mc">
          <button type="button" onClick={() => setAnnee((a) => a - 1)} aria-label="Année précédente">‹</button>
          <span className="annee-registre">{annee}</span>
          <button
            type="button"
            onClick={() => setAnnee((a) => a + 1)}
            disabled={annee >= new Date().getFullYear()}
            aria-label="Année suivante"
          >
            ›
          </button>
        </div>

        <ControlesFiltresRegistre f={f} placeholder="Recherche libre…" />

        <div className="groupe-droite-mc">
          <SelecteurSections
            sections={fSections.sections}
            region={fSections.region}
            selection={fSections.selection}
            onSelect={fSections.selectionner}
          />

          <span className="compte-resultats-mc">
            {points.length} secours localisé{points.length > 1 ? 's' : ''}
          </span>
        </div>
      </div>

      <PanneauFiltresRegistre f={f} />

      {erreur && <p className="erreur">{erreur}</p>}

      <div className="cadre-carte-ign">
        <MapContainer center={centre} zoom={zoom} maxZoom={MAX_ZOOM} className="carte-ign">
          <RecentrageCarte centre={centreCarte} zoom={zoomCarte} limites={limitesRegion} />
          {melange < 1 && (
            <TileLayer
              key={BASEMAPS.scan25.id}
              url={BASEMAPS.scan25.url}
              attribution={BASEMAPS.scan25.attribution}
              maxNativeZoom={BASEMAPS.scan25.maxNativeZoom}
              maxZoom={MAX_ZOOM}
              zIndex={1}
            />
          )}
          {melange > 0 && (
            <TileLayer
              key={BASEMAPS.satellite.id}
              url={BASEMAPS.satellite.url}
              attribution={BASEMAPS.satellite.attribution}
              maxNativeZoom={BASEMAPS.satellite.maxNativeZoom}
              maxZoom={MAX_ZOOM}
              opacity={melange}
              zIndex={2}
            />
          )}

          {points.map((s) => (
            <Marker
              key={s.id}
              position={[s.lat, s.lon]}
              icon={iconeNumero(
                s.local_id,
                STATUTS[s.statut]?.couleur ?? '#64748b',
                fSections.multiple ? couleurSection(s.squad_code) : null
              )}
            >
              <Popup>
                <strong>
                  n°{s.local_id} — {s.activity || 'Activité non précisée'}
                </strong>
                <br />
                {[s.com, s.lieu].filter(Boolean).join(' — ')}
                <br />
                {formatDate(s.created_at)}
                {s.team?.length > 0 && (
                  <>
                    <br />
                    {s.team.join(', ')}
                  </>
                )}
                <br />
                <button type="button" className="bouton-fiche-popup" onClick={() => setFicheId(s.id)}>
                  Voir la fiche
                </button>
              </Popup>
            </Marker>
          ))}
        </MapContainer>

        <div className="fondu-fond-ign">
          <button type="button" className={melange === 0 ? 'extremite-ign actif' : 'extremite-ign'} onClick={() => setMelange(0)}>
            Carte
          </button>
          <input
            type="range"
            min="0"
            max="100"
            step="5"
            value={pourcent}
            onChange={(e) => setMelange(Number(e.target.value) / 100)}
            aria-label={`Mélange carte / satellite : ${pourcent} % de satellite`}
            title={`${100 - pourcent} % carte — ${pourcent} % satellite`}
          />
          <button type="button" className={melange === 1 ? 'extremite-ign actif' : 'extremite-ign'} onClick={() => setMelange(1)}>
            Satellite
          </button>
        </div>
      </div>

      {ficheId != null && (
        <ModaleFiche id={ficheId} onFermer={() => setFicheId(null)} codesRequete={fSections.codesRequete} />
      )}
    </section>
  )
}
