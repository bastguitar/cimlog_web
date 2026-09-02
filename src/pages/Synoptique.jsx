import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { dateISO, effectifsDuJour } from '../lib/effectifs'
import { rolesDeLaSection } from '../lib/roles'
import { couleurSection } from '../lib/sections'
import { useFiltreSections } from '../hooks/useFiltreSections'
import SelecteurSections from '../components/SelecteurSections'
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

  const fSections = useFiltreSections(poste)

  useEffect(() => {
    setChargement(true)
    Promise.all([messagesDuJour(jour, fSections.codesRequete), secoursDuJour(jour, fSections.codesRequete)])
      .then(([m, s]) => {
        setMessages(m)
        setSecours(s)
        setErreur(null)
      })
      .catch((e) => setErreur(e.message))
      .finally(() => setChargement(false))
  }, [jour, fSections.codesRequete])

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

  const secoursVisibles = secours

  // Une colonne « général » (event_id NULL), puis une par secours du jour,
  // chacune avec ses 24 cases d'heure déjà préparées — plus simple à rendre
  // que de chercher, à chaque case, les messages qui y tombent. `messages`
  // et `secours` sont déjà scopés à la bonne section/région dès la requête
  // (messagesDuJour/secoursDuJour, codesRequete) — rien à refiltrer ici.
  const grille = useMemo(() => {
    const parColonne = new Map()
    parColonne.set('general', HEURES.map(() => []))
    for (const s of secoursVisibles) parColonne.set(s.id, HEURES.map(() => []))

    for (const m of messages) {
      const bucket = parColonne.get(m.eventId ?? 'general')
      if (!bucket) continue
      bucket[new Date(m.createdAt).getHours()].push(m)
    }
    return parColonne
  }, [messages, secoursVisibles])

  // Toutes les heures avant le premier message sont vides (34px chacune,
  // aucune n'est jamais plus grande) — un simple décalage vertical vers
  // cette rangée-là évite de partir de 0h et de devoir tout dérouler.
  const premiereHeureAvecMessages = useMemo(() => {
    for (let h = 0; h < 24; h++) {
      if (grille.get('general')[h].length > 0) return h
      if (secoursVisibles.some((s) => grille.get(s.id)[h].length > 0)) return h
    }
    return null
  }, [grille, secoursVisibles])

  const scrollRef = useRef(null)
  useEffect(() => {
    const conteneur = scrollRef.current
    if (!conteneur || premiereHeureAvecMessages == null) return
    const cible = conteneur.querySelector(`[data-heure="${premiereHeureAvecMessages}"]`)
    const entete = conteneur.querySelector('.entete-syn')
    if (!cible) return
    conteneur.scrollTop = cible.offsetTop - (entete?.getBoundingClientRect().height ?? 0)
  }, [premiereHeureAvecMessages, jour])

  function exporter() {
    if (!poste) return
    try {
      exporterSynoptiquePdf({ poste, jour, secours: secoursVisibles, grille })
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
        <div className="groupe-droite-mc">
          <SelecteurSections
            sections={fSections.sections}
            region={fSections.region}
            selection={fSections.selection}
            onSelect={fSections.selectionner}
          />

          <button
            type="button"
            className="bouton-principal bouton-exporter-mc"
            onClick={exporter}
            disabled={!poste || secoursVisibles.length === 0}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3v12" />
              <path d="M7 10l5 5 5-5" />
              <path d="M5 21h14" />
            </svg>
            Exporter
          </button>
          <span className="compte-resultats-mc">
            {secoursVisibles.length} secours {secoursVisibles.length > 1 ? 'affichés' : 'affiché'}
          </span>
        </div>
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

      <div className="synoptique-scroll" ref={scrollRef}>
        <div
          className="grille-synoptique"
          style={{
            // `repeat(0, 170px)` est une valeur invalide : le navigateur la
            // rejette silencieusement et garde l'ancienne valeur en mémoire
            // (grille désalignée en zigzag) — d'où la branche à part quand
            // il n'y a aucun secours, Heure/Infos générales restant seules.
            gridTemplateColumns:
              secoursVisibles.length > 0 ? `56px 190px repeat(${secoursVisibles.length}, 170px)` : '56px 190px',
          }}
        >
          <div className="entete-syn entete-heure-syn">Heure</div>
          <div className="entete-syn entete-generales-syn">Infos générales</div>
          {secoursVisibles.map((s, i) => (
            <div className={`entete-syn entete-secours-syn ${i % 2 === 0 ? 'pair' : 'impair'}`} key={s.id}>
              <span className="badge-secours-syn" style={{ background: STATUTS[s.statut]?.couleur }} />
              <div className="titre-secours-syn">
                {fSections.multiple && (
                  <span className="badge-section" style={{ background: couleurSection(s.squad_code) }} />
                )}
                <span>n°{s.local_id}</span>
                {s.com && <span>— {s.com}</span>}
              </div>
              {s.activity && <div className="detail-secours-syn">{s.activity}</div>}
              {s.lieu && <div className="detail-secours-syn muet">{s.lieu}</div>}
            </div>
          ))}

          {HEURES.map((h) => (
            <Fragment key={h}>
              <div className="heure-syn" data-heure={h}>{h}h</div>
              <CelluleSyn messages={grille.get('general')[h]} maintenant={maintenant} generale />
              {secoursVisibles.map((s) => (
                <CelluleSyn key={s.id} messages={grille.get(s.id)[h]} maintenant={maintenant} />
              ))}
            </Fragment>
          ))}
        </div>
      </div>

      {!chargement && !erreur && secoursVisibles.length === 0 && (
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
