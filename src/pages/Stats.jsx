import { useEffect, useMemo, useRef, useState } from 'react'
import { listerAnnee, listerPeriode } from '../lib/registre'
import { useFiltresRegistre, filtrerEvenements } from '../hooks/useFiltresRegistre'
import { ControlesFiltresRegistre, PanneauFiltresRegistre } from '../components/FiltresRegistre'

const MOIS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc']
const JOUR_MS = 24 * 60 * 60 * 1000
const FENETRE_JOURS = 30

const compterParMois = (liste) => {
  const c = Array(12).fill(0)
  for (const s of liste) c[new Date(s.created_at).getMonth()]++
  return c
}

/** Indices régulièrement espacés à afficher en abscisse, pour ne pas entasser les étiquettes. */
function etiquettesEspacees(n, maxAffichees) {
  if (n <= maxAffichees) return [...Array(n).keys()]
  const pas = (n - 1) / (maxAffichees - 1)
  return Array.from({ length: maxAffichees }, (_, i) => Math.round(i * pas))
}

/**
 * Statistiques — bilan de l'année sélectionnée (mois par mois) et des 30
 * derniers jours, avec le même filtre que le Registre et la Carte IGN, et la
 * même règle de comparaison à l'année précédente : tracée mais en retrait,
 * du contexte plutôt qu'une deuxième série à part entière — utile surtout
 * dans quelques années, quand il y aura plusieurs années à comparer.
 */
export default function Stats({ poste }) {
  const [annee, setAnnee] = useState(() => new Date().getFullYear())
  const [evenements, setEvenements] = useState([])
  const [evenementsPrecedents, setEvenementsPrecedents] = useState([])
  const [fenetre, setFenetre] = useState([])
  const [fenetrePrecedente, setFenetrePrecedente] = useState([])
  const [erreur, setErreur] = useState(null)
  const [chargement, setChargement] = useState(true)

  useEffect(() => {
    setChargement(true)
    Promise.all([listerAnnee(annee), listerAnnee(annee - 1)])
      .then(([a, b]) => {
        setEvenements(a)
        setEvenementsPrecedents(b)
        setErreur(null)
      })
      .catch((e) => setErreur(e.message))
      .finally(() => setChargement(false))
  }, [annee])

  useEffect(() => {
    const fin = new Date()
    const debut = new Date(fin.getTime() - FENETRE_JOURS * JOUR_MS)
    const finPrecedente = new Date(fin.getTime() - 365 * JOUR_MS)
    const debutPrecedente = new Date(debut.getTime() - 365 * JOUR_MS)
    Promise.all([listerPeriode(debut, fin), listerPeriode(debutPrecedente, finPrecedente)])
      .then(([a, b]) => {
        setFenetre(a)
        setFenetrePrecedente(b)
      })
      .catch((e) => setErreur(e.message))
  }, [])

  const f = useFiltresRegistre(evenements)
  const precedentsFiltres = useMemo(
    () => filtrerEvenements(evenementsPrecedents, f.filtres, f.recherche),
    [evenementsPrecedents, f.filtres, f.recherche]
  )
  const fenetreFiltree = useMemo(() => filtrerEvenements(fenetre, f.filtres, f.recherche), [fenetre, f.filtres, f.recherche])
  const fenetrePrecedenteFiltree = useMemo(
    () => filtrerEvenements(fenetrePrecedente, f.filtres, f.recherche),
    [fenetrePrecedente, f.filtres, f.recherche]
  )

  const total = f.evenementsFiltres.length
  const totalPrecedent = precedentsFiltres.length
  const delta = totalPrecedent > 0 ? Math.round(((total - totalPrecedent) / totalPrecedent) * 100) : null
  const totalVictimes = f.evenementsFiltres.reduce((n, s) => n + (s.victimes?.length ?? 0), 0)
  const medicalisees = f.evenementsFiltres.filter((s) => s.is_med).length
  const pctMedicalisees = total > 0 ? Math.round((medicalisees / total) * 100) : 0

  const parMois = useMemo(() => compterParMois(f.evenementsFiltres), [f.evenementsFiltres])
  const parMoisPrecedent = useMemo(() => compterParMois(precedentsFiltres), [precedentsFiltres])

  const parJour = useMemo(() => compterParJourGlissant(fenetreFiltree, FENETRE_JOURS), [fenetreFiltree])
  const parJourPrecedent = useMemo(
    () => compterParJourGlissant(fenetrePrecedenteFiltree, FENETRE_JOURS),
    [fenetrePrecedenteFiltree]
  )
  const etiquettesJours = useMemo(() => etiquettesJoursGlissant(FENETRE_JOURS), [])

  const activites = useMemo(() => {
    const compte = new Map()
    for (const s of f.evenementsFiltres) {
      const cle = s.activity || 'Non précisée'
      compte.set(cle, (compte.get(cle) ?? 0) + 1)
    }
    const trie = [...compte.entries()].sort((a, b) => b[1] - a[1]).map(([label, valeur]) => ({ label, valeur }))
    if (trie.length <= 8) return trie
    const tete = trie.slice(0, 7)
    const reste = trie.slice(7).reduce((n, d) => n + d.valeur, 0)
    return [...tete, { label: 'Autres', valeur: reste }]
  }, [f.evenementsFiltres])

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

        <ControlesFiltresRegistre f={f} placeholder="Filtrer les statistiques…" />

        <span className="compte-resultats-mc">
          {total} intervention{total > 1 ? 's' : ''}
        </span>
      </div>

      <PanneauFiltresRegistre f={f} />

      {erreur && <p className="erreur">{erreur}</p>}

      <div className="corps-stats">
        <div className="rangee-tuiles-stats">
          <TuileStat label={`Interventions ${annee}`} valeur={total} delta={delta} />
          <TuileStat label="Victimes" valeur={totalVictimes} />
          <TuileStat label="Médicalisées" valeur={`${pctMedicalisees} %`} sousLabel={`${medicalisees} / ${total}`} />
          <TuileStat
            label="30 derniers jours"
            valeur={fenetreFiltree.length}
            delta={
              fenetrePrecedenteFiltree.length > 0
                ? Math.round(((fenetreFiltree.length - fenetrePrecedenteFiltree.length) / fenetrePrecedenteFiltree.length) * 100)
                : null
            }
          />
        </div>

        <div className="grille-graphiques-stats">
          <CarteGraphique titre="Interventions par mois" sousTitre={poste?.nom}>
            <GraphiqueLignes
              labels={MOIS}
              principal={parMois}
              contexte={totalPrecedent > 0 ? parMoisPrecedent : null}
              etiquetteContexte={`${annee - 1}`}
              maxEtiquettes={12}
            />
          </CarteGraphique>

          <CarteGraphique titre="Interventions par jour" sousTitre="30 derniers jours">
            <GraphiqueLignes
              labels={etiquettesJours}
              principal={parJour}
              contexte={fenetrePrecedenteFiltree.length > 0 ? parJourPrecedent : null}
              etiquetteContexte="il y a 1 an"
              maxEtiquettes={8}
            />
          </CarteGraphique>

          <CarteGraphique titre="Répartition par activité" sousTitre={`${annee}`} pleineLargeur>
            {activites.length === 0 ? (
              <p className="aide">Aucune donnée.</p>
            ) : (
              <GraphiqueBarresHorizontales donnees={activites} />
            )}
          </CarteGraphique>
        </div>

        {!chargement && total === 0 && <p className="aide">Aucune intervention {f.filtresActifs ? 'ne correspond' : 'cette année'}.</p>}
      </div>
    </section>
  )
}

/** Une case du jour la plus récente (aujourd'hui) à la plus ancienne, sur `n` jours. */
function compterParJourGlissant(liste, n) {
  const c = Array(n).fill(0)
  const debut = new Date()
  debut.setHours(0, 0, 0, 0)
  debut.setDate(debut.getDate() - (n - 1))
  for (const s of liste) {
    const jours = Math.floor((new Date(s.created_at).setHours(0, 0, 0, 0) - debut.getTime()) / JOUR_MS)
    if (jours >= 0 && jours < n) c[jours]++
  }
  return c
}

function etiquettesJoursGlissant(n) {
  const jours = []
  const debut = new Date()
  debut.setDate(debut.getDate() - (n - 1))
  for (let i = 0; i < n; i++) {
    const d = new Date(debut)
    d.setDate(d.getDate() + i)
    jours.push(d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }))
  }
  return jours
}

function TuileStat({ label, valeur, sousLabel, delta }) {
  return (
    <div className="tuile-stat">
      <span className="etiquette-tuile-stat">{label}</span>
      <strong className="valeur-tuile-stat">{valeur}</strong>
      {sousLabel && <span className="sous-tuile-stat">{sousLabel}</span>}
      {delta != null && (
        <span className={delta >= 0 ? 'delta-tuile-stat positif' : 'delta-tuile-stat negatif'}>
          {delta >= 0 ? '+' : ''}
          {delta} % vs période précédente
        </span>
      )}
    </div>
  )
}

function CarteGraphique({ titre, sousTitre, pleineLargeur, children }) {
  return (
    <div className={pleineLargeur ? 'carte-graphique pleine-largeur' : 'carte-graphique'}>
      <div className="entete-carte-graphique">
        <h4>{titre}</h4>
        {sousTitre && <span className="sous-titre-carte-graphique">{sousTitre}</span>}
      </div>
      {children}
    </div>
  )
}

/**
 * Ligne + aire pour la série principale, ligne fine grisée pour le contexte
 * (année ou période précédente) — l'accent porte l'information, le gris ne
 * fait que la situer. Une seule valeur étiquetée en permanence (la
 * dernière) ; le reste se lit via le curseur — un survol du graphique fait
 * courir un fil vertical et une infobulle qui affiche la valeur exacte du
 * point le plus proche, tooltip qui complète les étiquettes plutôt que de
 * remplacer le seul moyen de lire une valeur.
 */
function GraphiqueLignes({ labels, principal, contexte, etiquetteContexte, maxEtiquettes = 8 }) {
  const largeur = 600
  const hauteur = 170
  const padGauche = 6
  const padDroite = 6
  const padHaut = 16
  const padBas = 22
  const n = labels.length
  const maxY = Math.max(1, ...principal, ...(contexte ?? []))
  const xPas = n > 1 ? (largeur - padGauche - padDroite) / (n - 1) : 0
  const xDe = (i) => padGauche + i * xPas
  const yDe = (v) => hauteur - padBas - (v / maxY) * (hauteur - padHaut - padBas)
  const chemin = (valeurs) => valeurs.map((v, i) => `${i === 0 ? 'M' : 'L'} ${xDe(i).toFixed(1)} ${yDe(v).toFixed(1)}`).join(' ')
  const aire = (valeurs) =>
    `${chemin(valeurs)} L ${xDe(valeurs.length - 1).toFixed(1)} ${hauteur - padBas} L ${xDe(0).toFixed(1)} ${hauteur - padBas} Z`
  const dernier = n - 1
  const indicesEtiquettes = etiquettesEspacees(n, maxEtiquettes)

  const svgRef = useRef(null)
  const [survol, setSurvol] = useState(null)

  const deplacer = (e) => {
    const rect = svgRef.current.getBoundingClientRect()
    if (rect.width === 0 || xPas === 0) return
    const xSvg = ((e.clientX - rect.left) / rect.width) * largeur
    const i = Math.round((xSvg - padGauche) / xPas)
    setSurvol(Math.min(dernier, Math.max(0, i)))
  }

  const iSurvol = survol ?? dernier
  const xPct = (xDe(iSurvol) / largeur) * 100
  const cotePlein = xPct > 65

  return (
    <div className="conteneur-graphique-lignes">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${largeur} ${hauteur}`}
        className="graphique-lignes"
        preserveAspectRatio="none"
        role="img"
        aria-label={labels[dernier]}
        onMouseMove={deplacer}
        onMouseLeave={() => setSurvol(null)}
      >
        <line x1={padGauche} y1={hauteur - padBas} x2={largeur - padDroite} y2={hauteur - padBas} className="axe-graphique" />

        {contexte && <path d={chemin(contexte)} className="ligne-contexte" fill="none" />}
        <path d={aire(principal)} className="aire-principale" stroke="none" />
        <path d={chemin(principal)} className="ligne-principale" fill="none" />

        {survol != null && (
          <line
            x1={xDe(survol)}
            y1={padHaut}
            x2={xDe(survol)}
            y2={hauteur - padBas}
            className="fil-survol-graphique"
          />
        )}

        {contexte && survol != null && (
          <circle cx={xDe(survol)} cy={yDe(contexte[survol])} r={4} className="point-contexte" />
        )}
        <circle
          cx={xDe(iSurvol)}
          cy={yDe(principal[iSurvol])}
          r={survol == null ? 4 : 5}
          className="point-principal"
        />

        <text x={xDe(dernier)} y={yDe(principal[dernier]) - 9} className="etiquette-graphique" textAnchor="end">
          {principal[dernier]}
        </text>
      </svg>

      {survol != null && (
        <div className="infobulle-graphique" style={{ left: `${xPct}%`, ...(cotePlein ? { transform: 'translateX(-100%)' } : {}) }}>
          <span className="titre-infobulle-graphique">{labels[survol]}</span>
          <span className="ligne-infobulle-graphique principal">
            <i /> Période en cours <b>{principal[survol]}</b>
          </span>
          {contexte && (
            <span className="ligne-infobulle-graphique contexte">
              <i /> {etiquetteContexte} <b>{contexte[survol]}</b>
            </span>
          )}
        </div>
      )}

      <div className="axe-x-graphique">
        {indicesEtiquettes.map((i) => (
          <span key={i} style={{ left: `${(xDe(i) / largeur) * 100}%` }}>
            {labels[i]}
          </span>
        ))}
      </div>
      {contexte && (
        <div className="legende-graphique">
          <span className="cle-legende principal">Période en cours</span>
          <span className="cle-legende contexte">{etiquetteContexte}</span>
        </div>
      )}
    </div>
  )
}

/** Une seule teinte : la longueur porte l'information, pas la couleur (catégories nominales, une seule série). */
function GraphiqueBarresHorizontales({ donnees }) {
  const max = Math.max(1, ...donnees.map((d) => d.valeur))
  return (
    <div className="barres-horizontales">
      {donnees.map((d) => (
        <div className="ligne-barre-h" key={d.label}>
          <span className="etiquette-barre-h" title={d.label}>{d.label}</span>
          <div className="piste-barre-h">
            <div className="remplissage-barre-h" style={{ width: `${Math.max((d.valeur / max) * 100, 3)}%` }} />
          </div>
          <span className="valeur-barre-h">{d.valeur}</span>
        </div>
      ))}
    </div>
  )
}
