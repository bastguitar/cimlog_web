import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { listerAnnee, listerPeriode } from '../lib/registre'
import { estHorsCRS, estRegulation, estSansMoyen as sansAucunMoyen } from '../lib/moyens'
import { OPTIONS_ETAT_MEDICAL } from '../lib/optionsSnosm'
import { exporterBilanPdf } from '../lib/exportRegistrePdf'

const MOIS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc']
const JOUR_MS = 24 * 60 * 60 * 1000
const FENETRE_JOURS = 30

// Des fiches créées côté Cim'Alerte sans réel engagement CRS — secours pris
// en charge par le SDIS, ou clôturés sans aucun moyen envoyé. Comptées à
// part (voir les tuiles dédiées), jamais dans le reste des statistiques.
const estSDIS = (s) => s.helicopter === 'SDIS'
const estSansMoyen = (s) => !s.helicopter || s.helicopter === 'Pas de moyens engagés'
const estExclu = (s) => estSDIS(s) || estSansMoyen(s)

const compterParMois = (liste) => {
  const c = Array(12).fill(0)
  for (const s of liste) c[new Date(s.created_at).getMonth()]++
  return c
}

/*
 * Bilan mensuel (demandé le 22/11/2026) — une ligne par item, une colonne par mois, total de l'année.
 *  - Demandes d'intervention : toutes les fiches ouvertes (filtres compris).
 *  - Interventions effectuées : celles où un moyen CRS a été engagé — sans les régulations, les
 *    fiches sans moyen et les secours passés à un service extérieur (SDIS, BT, SAMU…). Même règle
 *    que le filtre « Moyens CRS » du Registre.
 *  - Puis les victimes de ces interventions effectuées, par état médical SNOSM.
 */
const estEffectuee = (s) => !sansAucunMoyen(s) && !estRegulation(s) && !estHorsCRS(s)
const NON_RENSEIGNE = 'Non renseigné'

function bilanMensuel(liste) {
  const lignes = [
    { label: "Demandes d'intervention", valeurs: Array(12).fill(0), principale: true },
    { label: 'Interventions effectuées', valeurs: Array(12).fill(0), principale: true },
  ]
  const parEtat = new Map([...OPTIONS_ETAT_MEDICAL, NON_RENSEIGNE].map((e) => [e, Array(12).fill(0)]))
  for (const s of liste) {
    const m = new Date(s.created_at).getMonth()
    lignes[0].valeurs[m]++
    if (!estEffectuee(s)) continue
    lignes[1].valeurs[m]++
    for (const v of s.victimes ?? []) {
      const etat = parEtat.has(v.snosm_etat_medical) ? v.snosm_etat_medical : NON_RENSEIGNE
      parEtat.get(etat)[m]++
    }
  }
  for (const [label, valeurs] of parEtat) {
    // « Non renseigné » seulement s'il y en a — les états prévus restent affichés même à zéro.
    if (label === NON_RENSEIGNE && valeurs.every((v) => v === 0)) continue
    lignes.push({ label, valeurs, victime: true })
  }
  return lignes.map((l) => ({ ...l, total: l.valeurs.reduce((a, b) => a + b, 0) }))
}

/** « 2026-11-22 » en heure locale — valeur d'un <input type="date">. */
const isoJour = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const formatJour = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString('fr-FR')
const unAnAvant = (d) => {
  const r = new Date(d)
  r.setFullYear(r.getFullYear() - 1)
  return r
}

/**
 * Secours effectués (même règle que le bilan : moyen CRS engagé) par activité et par mois — une
 * ligne par activité, la plus fréquente d'abord (demandé le 22/11/2026, à exporter avec le bilan).
 */
function activitesParMois(liste) {
  const parActivite = new Map()
  for (const s of liste) {
    if (!estEffectuee(s)) continue
    const cle = s.activity?.trim() || 'Non précisée'
    if (!parActivite.has(cle)) parActivite.set(cle, Array(12).fill(0))
    parActivite.get(cle)[new Date(s.created_at).getMonth()]++
  }
  return [...parActivite.entries()]
    .map(([label, valeurs]) => ({ label, valeurs, total: valeurs.reduce((a, b) => a + b, 0) }))
    .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label, 'fr'))
}

const MOIS_LONGS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']

/** Colonnes en gras (demandes / effectuées) et séparateur avant le bloc des états médicaux. */
const classeColonneBilan = (bilan, i) =>
  [
    bilan[i].principale ? 'colonne-principale-bilan-stats' : '',
    bilan[i].victime && !bilan[i - 1]?.victime ? 'premiere-victime-bilan-stats' : '',
  ].join(' ')

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
export default function Stats({ poste, fSections }) {
  const [annee, setAnnee] = useState(() => new Date().getFullYear())
  const [evenements, setEvenements] = useState([])
  const [evenementsPrecedents, setEvenementsPrecedents] = useState([])
  const [fenetre, setFenetre] = useState([])
  const [fenetrePrecedente, setFenetrePrecedente] = useState([])
  const [erreur, setErreur] = useState(null)
  const [chargement, setChargement] = useState(true)

  /*
   * Période affichée (22/11/2026) : l'année entière, un mois de cette année, ou une période libre
   * (du … au …, sur plusieurs années si besoin). Toujours comparée à la même période un an plus tôt.
   */
  const [choix, setChoix] = useState('') // '' = année | '0'…'11' = mois | 'periode'
  const [du, setDu] = useState(() => isoJour(new Date(new Date().getFullYear(), new Date().getMonth(), 1)))
  const [au, setAu] = useState(() => isoJour(new Date()))
  const enPeriode = choix === 'periode'
  const periodeValide = enPeriode && du && au && du <= au
  const moisChoisi = /^\d+$/.test(choix) ? Number(choix) : null

  useEffect(() => {
    if (enPeriode && !periodeValide) return
    setChargement(true)
    let requetes
    if (enPeriode) {
      const debut = new Date(`${du}T00:00:00`)
      const fin = new Date(`${au}T00:00:00`)
      fin.setDate(fin.getDate() + 1)
      requetes = [
        listerPeriode(debut, fin, fSections.codesRequete),
        listerPeriode(unAnAvant(debut), unAnAvant(fin), fSections.codesRequete),
      ]
    } else {
      requetes = [listerAnnee(annee, fSections.codesRequete), listerAnnee(annee - 1, fSections.codesRequete)]
    }
    Promise.all(requetes)
      .then(([a, b]) => {
        setEvenements(a)
        setEvenementsPrecedents(b)
        setErreur(null)
      })
      .catch((e) => setErreur(e.message))
      .finally(() => setChargement(false))
  }, [annee, enPeriode, periodeValide, du, au, fSections.codesRequete])

  const libellePeriode = enPeriode
    ? `du ${formatJour(du)} au ${formatJour(au)}`
    : moisChoisi != null
      ? `${MOIS_LONGS[moisChoisi]} ${annee}`
      : `${annee}`
  const libellePrecedent = enPeriode ? 'il y a 1 an' : `${annee - 1}`

  useEffect(() => {
    const fin = new Date()
    const debut = new Date(fin.getTime() - FENETRE_JOURS * JOUR_MS)
    const finPrecedente = new Date(fin.getTime() - 365 * JOUR_MS)
    const debutPrecedente = new Date(debut.getTime() - 365 * JOUR_MS)
    Promise.all([
      listerPeriode(debut, fin, fSections.codesRequete),
      listerPeriode(debutPrecedente, finPrecedente, fSections.codesRequete),
    ])
      .then(([a, b]) => {
        setFenetre(a)
        setFenetrePrecedente(b)
      })
      .catch((e) => setErreur(e.message))
  }, [fSections.codesRequete])

  // Vue Section / Département (en-tête) : identité en vue Section, voir useFiltreSections.
  const { filtrerVue } = fSections
  const evenementsVue = useMemo(() => filtrerVue(evenements), [filtrerVue, evenements])
  const duMois = useCallback(
    (liste) => (moisChoisi == null ? liste : liste.filter((s) => new Date(s.created_at).getMonth() === moisChoisi)),
    [moisChoisi]
  )
  // Toutes les fiches de la période (SDIS et sans moyen compris) — base du bilan mensuel.
  const evenementsPeriode = useMemo(() => duMois(evenementsVue), [duMois, evenementsVue])
  const evenementsVisibles = useMemo(() => evenementsPeriode.filter((s) => !estExclu(s)), [evenementsPeriode])
  const nbSDIS = useMemo(() => evenementsPeriode.filter(estSDIS).length, [evenementsPeriode])
  const nbSansMoyen = useMemo(() => evenementsPeriode.filter(estSansMoyen).length, [evenementsPeriode])

  const precedentsFiltres = useMemo(
    () => duMois(filtrerVue(evenementsPrecedents)).filter((s) => !estExclu(s)),
    [duMois, filtrerVue, evenementsPrecedents]
  )
  // 30 derniers jours : indépendants du mois choisi (sinon vides dès qu'on regarde un autre mois).
  const fenetreFiltree = useMemo(() => filtrerVue(fenetre).filter((s) => !estExclu(s)), [filtrerVue, fenetre])
  const fenetrePrecedenteFiltree = useMemo(
    () => filtrerVue(fenetrePrecedente).filter((s) => !estExclu(s)),
    [filtrerVue, fenetrePrecedente]
  )

  const total = evenementsVisibles.length
  const totalPrecedent = precedentsFiltres.length
  const delta = totalPrecedent > 0 ? Math.round(((total - totalPrecedent) / totalPrecedent) * 100) : null
  const totalVictimes = evenementsVisibles.reduce((n, s) => n + (s.victimes?.length ?? 0), 0)
  const medicalisees = evenementsVisibles.filter((s) => s.is_med).length
  const pctMedicalisees = total > 0 ? Math.round((medicalisees / total) * 100) : 0

  const bilan = useMemo(() => bilanMensuel(evenementsPeriode), [evenementsPeriode])

  // Mois de la période choisie, dans l'ordre de la période (déc. → avr. pour une saison d'hiver).
  const moisPeriode = useMemo(() => {
    if (moisChoisi != null) return [moisChoisi]
    if (!enPeriode || !periodeValide) return [...Array(12).keys()]
    const mois = []
    const d = new Date(`${du}T00:00:00`)
    d.setDate(1)
    const fin = new Date(`${au}T00:00:00`)
    while (d <= fin && mois.length < 12) {
      if (!mois.includes(d.getMonth())) mois.push(d.getMonth())
      d.setMonth(d.getMonth() + 1)
    }
    return mois
  }, [moisChoisi, enPeriode, periodeValide, du, au])

  const parActivite = useMemo(() => activitesParMois(evenementsPeriode), [evenementsPeriode])

  const [exportEnCours, setExportEnCours] = useState(false)
  // Bouton Exporter PDF : menu des deux tableaux exportables (bilan médical / par activité).
  const [menuExportOuvert, setMenuExportOuvert] = useState(false)
  const refMenuExport = useRef(null)
  useEffect(() => {
    if (!menuExportOuvert) return
    const fermerSiExterieur = (e) => {
      if (!refMenuExport.current?.contains(e.target)) setMenuExportOuvert(false)
    }
    document.addEventListener('mousedown', fermerSiExterieur)
    return () => document.removeEventListener('mousedown', fermerSiExterieur)
  }, [menuExportOuvert])
  /** Bilan mensuel + secours par activité en PDF — seulement les mois de la période choisie. */
  async function exporterBilan(contenu) {
    setMenuExportOuvert(false)
    setExportEnCours(true)
    try {
      const [demandes, effectuees] = bilan.map((l) => l.total)
      await exporterBilanPdf({
        contenu,
        lignes: bilan,
        activites: parActivite,
        mois: moisPeriode,
        section: fSections.intitule,
        periode: !enPeriode && moisChoisi == null ? `Année ${annee}` : libellePeriode,
        resume: `${demandes} demande${demandes > 1 ? 's' : ''}  ·  ${effectuees} intervention${effectuees > 1 ? 's' : ''} effectuée${effectuees > 1 ? 's' : ''}`,
      })
    } catch (e) {
      setErreur(`Export PDF : ${e.message}`)
    } finally {
      setExportEnCours(false)
    }
  }
  const parMois = useMemo(() => compterParMois(evenementsVisibles), [evenementsVisibles])
  const parMoisPrecedent = useMemo(() => compterParMois(precedentsFiltres), [precedentsFiltres])

  const parJour = useMemo(() => compterParJourGlissant(fenetreFiltree, FENETRE_JOURS), [fenetreFiltree])
  const parJourPrecedent = useMemo(
    () => compterParJourGlissant(fenetrePrecedenteFiltree, FENETRE_JOURS),
    [fenetrePrecedenteFiltree]
  )
  const etiquettesJours = useMemo(() => etiquettesJoursGlissant(FENETRE_JOURS), [])

  const activites = useMemo(() => {
    const compte = new Map()
    for (const s of evenementsVisibles) {
      const cle = s.activity || 'Non précisée'
      compte.set(cle, (compte.get(cle) ?? 0) + 1)
    }
    const trie = [...compte.entries()].sort((a, b) => b[1] - a[1]).map(([label, valeur]) => ({ label, valeur }))
    if (trie.length <= 8) return trie
    const tete = trie.slice(0, 7)
    const reste = trie.slice(7).reduce((n, d) => n + d.valeur, 0)
    return [...tete, { label: 'Autres', valeur: reste }]
  }, [evenementsVisibles])

  return (
    <section className="page page-mc">
      <div className="barre-mc">
        {/* Seuls choix des Stats (22/11/2026) : année, mois de l'année, ou période libre. */}
        {!enPeriode && (
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
        )}

        <select
          className="filtre-select-registre"
          value={choix}
          onChange={(e) => setChoix(e.target.value)}
          aria-label="Période"
        >
          <option value="">Toute l'année</option>
          {MOIS_LONGS.map((m, i) => (
            <option key={m} value={String(i)}>
              {m}
            </option>
          ))}
          <option value="periode">Période…</option>
        </select>

        {enPeriode && (
          <div className="periode-stats">
            <label>
              du <input type="date" value={du} max={au || undefined} onChange={(e) => setDu(e.target.value)} />
            </label>
            <label>
              au <input type="date" value={au} min={du || undefined} onChange={(e) => setAu(e.target.value)} />
            </label>
          </div>
        )}

        <div className="groupe-droite-mc">
          <span className="compte-resultats-mc">
            {total} intervention{total > 1 ? 's' : ''}
          </span>
          <div className="menu-sections" ref={refMenuExport}>
            <button
              type="button"
              className={menuExportOuvert ? 'bouton-effectifs actif' : 'bouton-effectifs'}
              onClick={() => setMenuExportOuvert((o) => !o)}
              disabled={exportEnCours || chargement}
              aria-haspopup="menu"
              aria-expanded={menuExportOuvert}
            >
              {exportEnCours ? 'Export…' : 'Exporter PDF ▾'}
            </button>
            {menuExportOuvert && (
              <div className="liste-menu-sections" role="menu">
                <button type="button" role="menuitem" className="option-menu-sections" onClick={() => exporterBilan('bilan')}>
                  Bilan mensuel (état médical)
                </button>
                <button type="button" role="menuitem" className="option-menu-sections" onClick={() => exporterBilan('activites')}>
                  Secours par activité
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {erreur && <p className="erreur">{erreur}</p>}

      <div className="corps-stats">
        <div className="rangee-tuiles-stats">
          <TuileStat label={`Interventions ${libellePeriode}`} valeur={total} delta={delta} />
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
          <TuileStat label="Secours donnés au SDIS" valeur={nbSDIS} sousLabel="exclus des statistiques" />
          <TuileStat label="Secours sans moyens engagés" valeur={nbSansMoyen} sousLabel="exclus des statistiques" />
        </div>

        <CarteGraphique titre={`Bilan mensuel ${libellePeriode}`} sousTitre="État médical : victimes des interventions effectuées">
          <div className="defilement-bilan-stats">
            <table className="tableau-bilan-stats">
              {/* Mois en lignes, items en colonnes (retour utilisateur 22/11/2026), total de l'année en bas. */}
              <colgroup>
                <col className="colonne-mois-bilan-stats" />
                {bilan.map((l) => (
                  <col key={l.label} />
                ))}
              </colgroup>
              <thead>
                <tr>
                  <th />
                  {bilan.map((l, i) => (
                    <th key={l.label} className={classeColonneBilan(bilan, i)}>
                      {l.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {MOIS_LONGS.map((mois, m) => (
                  <tr key={mois}>
                    <th scope="row">{mois}</th>
                    {bilan.map((l, i) => (
                      <td
                        key={l.label}
                        className={[classeColonneBilan(bilan, i), l.valeurs[m] === 0 ? 'zero-bilan-stats' : ''].join(' ')}
                      >
                        {l.valeurs[m]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="total-bilan-stats">
                  <th scope="row">Total</th>
                  {bilan.map((l, i) => (
                    <td key={l.label} className={classeColonneBilan(bilan, i)}>
                      {l.total}
                    </td>
                  ))}
                </tr>
              </tfoot>
            </table>
          </div>
        </CarteGraphique>

        {/* Activités en lignes (trop nombreuses pour tenir en colonnes), mois de la période en colonnes. */}
        <CarteGraphique titre={`Secours effectués par activité — ${libellePeriode}`} sousTitre="Moyen CRS engagé">
          {parActivite.length === 0 ? (
            <p className="aide">Aucun secours effectué sur cette période.</p>
          ) : (
            <div className="defilement-bilan-stats">
              <table className="tableau-bilan-stats tableau-activites-stats">
                <colgroup>
                  <col className="colonne-activite-stats" />
                  {moisPeriode.map((m) => (
                    <col key={m} />
                  ))}
                  <col />
                </colgroup>
                <thead>
                  <tr>
                    <th />
                    {moisPeriode.map((m) => (
                      <th key={m}>{MOIS[m]}</th>
                    ))}
                    <th className="colonne-principale-bilan-stats">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {parActivite.map((a) => (
                    <tr key={a.label}>
                      <th scope="row" title={a.label}>
                        {a.label}
                      </th>
                      {moisPeriode.map((m) => (
                        <td key={m} className={a.valeurs[m] === 0 ? 'zero-bilan-stats' : ''}>
                          {a.valeurs[m]}
                        </td>
                      ))}
                      <td className="colonne-principale-bilan-stats">{a.total}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="total-bilan-stats">
                    <th scope="row">Total</th>
                    {moisPeriode.map((m) => (
                      <td key={m}>{parActivite.reduce((n, a) => n + a.valeurs[m], 0)}</td>
                    ))}
                    <td>{parActivite.reduce((n, a) => n + a.total, 0)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CarteGraphique>

        <div className="grille-graphiques-stats">
          <CarteGraphique titre="Interventions par mois" sousTitre={poste?.nom}>
            <GraphiqueLignes
              labels={MOIS}
              principal={parMois}
              contexte={totalPrecedent > 0 ? parMoisPrecedent : null}
              etiquetteContexte={libellePrecedent}
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

          <CarteGraphique titre="Répartition par activité" sousTitre={libellePeriode} pleineLargeur>
            {activites.length === 0 ? (
              <p className="aide">Aucune donnée.</p>
            ) : (
              <GraphiqueBarresHorizontales donnees={activites} />
            )}
          </CarteGraphique>
        </div>

        {!chargement && total === 0 && <p className="aide">Aucune intervention sur cette période.</p>}
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
