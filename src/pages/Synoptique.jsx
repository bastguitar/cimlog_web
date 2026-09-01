import { Fragment, useEffect, useMemo, useState } from 'react'
import { dateISO, effectifsDuJour } from '../lib/effectifs'
import { rolesDeLaSection } from '../lib/roles'
import { exporterSynoptiquePdf } from '../lib/exportSynoptiquePdf'
import { messagesDuJour, secoursDuJour, estMentionSG, DUREE_MODIFICATION_MS, STATUTS } from '../lib/mainCourante'

const HEURES = Array.from({ length: 24 }, (_, h) => h)

const formatHeureMin = (iso) => new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })

/**
 * Vue synoptique — les mêmes messages que la main courante chronologique,
 * mais en colonnes (un secours = une colonne) plutôt qu'en une seule liste :
 * ce qui se passe en parallèle sur plusieurs interventions se lit d'un coup
 * d'œil, ligne par ligne d'heure, plutôt qu'entrelacé dans un seul fil.
 *
 * Lecture seule : modifier ou rayer un message se fait depuis la main
 * courante chronologique, qui reste l'écran de saisie — celui-ci n'est
 * qu'une autre façon de regarder les mêmes données.
 */
export default function Synoptique({ poste }) {
  const [jour, setJour] = useState(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d
  })
  const aujourdhui = dateISO(jour) === dateISO(new Date())

  const [messages, setMessages] = useState([])
  const [secours, setSecours] = useState([])
  const [erreur, setErreur] = useState(null)
  const [chargement, setChargement] = useState(true)
  const [roles, setRoles] = useState([])
  const [effectifs, setEffectifs] = useState(new Map())

  const [maintenant, setMaintenant] = useState(() => Date.now())
  useEffect(() => {
    const minuteur = setInterval(() => setMaintenant(Date.now()), 60000)
    return () => clearInterval(minuteur)
  }, [])

  useEffect(() => {
    setChargement(true)
    Promise.all([messagesDuJour(jour), secoursDuJour(jour)])
      .then(([m, s]) => {
        setMessages(m)
        setSecours(s)
        setErreur(null)
      })
      .catch((e) => setErreur(e.message))
      .finally(() => setChargement(false))
  }, [jour])

  useEffect(() => {
    if (!poste) return
    Promise.all([rolesDeLaSection(poste.code), effectifsDuJour(poste.code, jour)])
      .then(([r, e]) => {
        setRoles(r)
        setEffectifs(e)
      })
      .catch((e) => setErreur(e.message))
  }, [jour, poste])

  const changerJour = (delta) =>
    setJour((j) => {
      const d = new Date(j)
      d.setDate(d.getDate() + delta)
      return d
    })

  // Une colonne « général » (event_id NULL), puis une par secours du jour,
  // chacune avec ses 24 cases d'heure déjà préparées — plus simple à rendre
  // que de chercher, à chaque case, les messages qui y tombent.
  const grille = useMemo(() => {
    const parColonne = new Map()
    parColonne.set('general', HEURES.map(() => []))
    for (const s of secours) parColonne.set(s.id, HEURES.map(() => []))

    for (const m of messages) {
      const bucket = parColonne.get(m.eventId ?? 'general')
      if (!bucket) continue
      bucket[new Date(m.createdAt).getHours()].push(m)
    }
    return parColonne
  }, [messages, secours])

  function exporter() {
    if (!poste) return
    try {
      exporterSynoptiquePdf({ poste, jour, secours, grille })
    } catch (e) {
      setErreur(e.message)
    }
  }

  return (
    <section className="page page-mc">
      <div className="barre-mc">
        <div className="nav-jour-mc">
          <button type="button" onClick={() => changerJour(-1)} aria-label="Jour précédent">‹</button>
          <input
            type="date"
            value={dateISO(jour)}
            onChange={(e) => e.target.value && setJour(new Date(`${e.target.value}T00:00:00`))}
          />
          <button type="button" onClick={() => changerJour(1)} disabled={aujourdhui} aria-label="Jour suivant">›</button>
          {!aujourdhui && (
            <button type="button" className="bouton-aujourdhui" onClick={() => setJour(new Date(new Date().setHours(0, 0, 0, 0)))}>
              Auj.
            </button>
          )}
        </div>
        <span className="compte-resultats-mc">
          {secours.length} secours {secours.length > 1 ? 'affichés' : 'affiché'}
        </span>
        <button type="button" className="bouton-principal" onClick={exporter} disabled={!poste || secours.length === 0}>
          Exporter PDF
        </button>
      </div>

      {erreur && <p className="erreur">{erreur}</p>}

      {roles.length > 0 && effectifs.size > 0 && (
        <div className="bloc-effectifs-syn">
          <span className="etiquette-effectifs-syn">Effectifs de permanence</span>
          {roles
            .filter((r) => effectifs.get(r)?.length)
            .map((r) => (
              <span className="groupe-effectif-syn" key={r}>
                <span className="role-effectif-syn">{r}</span>
                {effectifs.get(r).map((e) => e.nom).join(', ')}
              </span>
            ))}
        </div>
      )}

      <div className="synoptique-scroll">
        <div
          className="grille-synoptique"
          style={{ gridTemplateColumns: `56px 190px repeat(${secours.length}, 170px)` }}
        >
          <div className="entete-syn entete-heure-syn">Heure</div>
          <div className="entete-syn entete-generales-syn">Infos générales</div>
          {secours.map((s, i) => (
            <div className={`entete-syn entete-secours-syn ${i % 2 === 0 ? 'pair' : 'impair'}`} key={s.id}>
              <span className="badge-secours-syn" style={{ background: STATUTS[s.statut]?.couleur }} />
              <div className="titre-secours-syn">
                <span>n°{s.local_id}</span>
                {s.com && <span>— {s.com}</span>}
              </div>
              {s.activity && <div className="detail-secours-syn">{s.activity}</div>}
              {s.lieu && <div className="detail-secours-syn muet">{s.lieu}</div>}
            </div>
          ))}

          {HEURES.map((h) => (
            <Fragment key={h}>
              <div className="heure-syn">{h}h</div>
              <CelluleSyn messages={grille.get('general')[h]} maintenant={maintenant} generale />
              {secours.map((s) => (
                <CelluleSyn key={s.id} messages={grille.get(s.id)[h]} maintenant={maintenant} />
              ))}
            </Fragment>
          ))}
        </div>
      </div>

      {!chargement && !erreur && secours.length === 0 && (
        <p className="aide">Aucun secours {aujourdhui ? 'aujourd’hui' : 'ce jour-là'}.</p>
      )}
    </section>
  )
}

function CelluleSyn({ messages, maintenant, generale = false }) {
  return (
    <div className={generale ? 'cellule-syn generale' : 'cellule-syn'}>
      {messages.map((m) => {
        const verrouille = maintenant - new Date(m.createdAt).getTime() > DUREE_MODIFICATION_MS
        const classes = ['entree-syn']
        if (m.origin === 'Système') classes.push('systeme')
        else if (estMentionSG(m.content)) classes.push('sg')
        return (
          <div className={classes.join(' ')} key={m.idStatus}>
            <div className="entete-entree-syn">
              <span className="heure-entree-syn">{formatHeureMin(m.createdAt)}</span>
              {m.origin !== 'Système' && (
                <span className="cadenas-syn" title={verrouille ? 'Verrouillé' : 'Modifiable'}>
                  {verrouille ? '🔒' : '🔓'}
                </span>
              )}
            </div>
            <div className="texte-entree-syn">{m.content}</div>
          </div>
        )
      })}
    </div>
  )
}
