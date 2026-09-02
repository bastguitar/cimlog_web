import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { dateISO, effectifsDuJour, ajouterEffectif, retirerEffectif } from '../lib/effectifs'
import { secouristesDeSection } from '../lib/annuaire'
import { rolesDeLaSection, ajouterRole } from '../lib/roles'
import { debutSemaine } from '../lib/semaines'
import { couleurSection } from '../lib/sections'
import { useFiltreSections } from '../hooks/useFiltreSections'
import SelecteurSections from '../components/SelecteurSections'
import { exporterMainCourantePdf } from '../lib/exportMainCourantePdf'
import {
  messagesDuJour,
  secoursDuJour,
  envoyerMessageGeneral,
  envoyerMessageChat,
  modifierMessageMc,
  rayerMessageMc,
  DUREE_MODIFICATION_MS,
  TYPES_MENTION_SG,
  estMentionSG,
  STATUTS,
  victimesDesEvenements,
  estMessageIdentite,
  formatIdentiteVictime,
} from '../lib/mainCourante'

const AVIS = ['CODIS', 'CORG', 'C15', 'Préfecture', 'Parquet', 'Mairie', 'Cdt CRS Alpes', 'BIO']

const formatHeure = (iso) => new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
// `events.com` arrive avec le code postal collé ("Commune - 38380") — pas utile ici, seule la commune compte.
const sansCodePostal = (com) => com.replace(/\s*-\s*\d{5}\s*$/, '')

const titreJour = (jour) =>
  jour.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).toUpperCase()

/** « 2026-08-29T15:24 », en heure locale — valeur attendue par un <input type="datetime-local">. */
function versEntreeLocale(d) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Ajoute un modèle au texte déjà tapé, sans l'effacer — plusieurs avis peuvent s'accumuler. */
function ajouterModele(texteActuel, modele) {
  const t = texteActuel.trim()
  if (!t) return modele
  return /[,;]$/.test(t) ? `${t} ${modele}` : `${t}, ${modele}`
}

export default function MainCourante({ poste }) {
  const [jour, setJour] = useState(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d
  })
  const aujourdhui = dateISO(jour) === dateISO(new Date())
  const fSections = useFiltreSections(poste)

  const [messages, setMessages] = useState([])
  const [secours, setSecours] = useState([])
  const [erreur, setErreur] = useState(null)
  const [chargement, setChargement] = useState(true)
  const [victimesParEvenement, setVictimesParEvenement] = useState(new Map())

  const [effectifsOuverts, setEffectifsOuverts] = useState(false)
  const [exportOuvert, setExportOuvert] = useState(false)
  const [roles, setRoles] = useState([])
  const [effectifs, setEffectifs] = useState(new Map())
  const [secouristes, setSecouristes] = useState([])

  const [recherche, setRecherche] = useState('')
  const [filtreNumero, setFiltreNumero] = useState('')
  const [filtreSG, setFiltreSG] = useState(false)

  const [editionId, setEditionId] = useState(null)
  const [texteEdition, setTexteEdition] = useState('')

  // Le plus récent doit rester sous les yeux sans avoir à faire défiler —
  // un message qu'on vient d'envoyer (avis, rappel…) atterrit en bas de la
  // liste, invisible si on reste scrollé plus haut.
  const finListe = useRef(null)
  useEffect(() => {
    finListe.current?.scrollIntoView({ block: 'end' })
  }, [messages.length])

  // Sert à savoir quels messages restent modifiables (moins de 2h) — en
  // state plutôt que lu en direct au rendu, pour que le cadenas passe tout
  // seul au fermé quand le délai s'écoule, sans attendre un rechargement.
  const [maintenant, setMaintenant] = useState(() => Date.now())
  useEffect(() => {
    const minuteur = setInterval(() => setMaintenant(Date.now()), 60000)
    return () => clearInterval(minuteur)
  }, [])

  async function charger() {
    try {
      // secoursDuJour reste toujours sur sa propre section, quel que soit le
      // filtre affiché : c'est la liste du composeur, on ne rédige jamais au
      // nom d'une autre section (voir secoursDuJour, lib/mainCourante.js).
      const [m, s] = await Promise.all([messagesDuJour(jour, fSections.codesRequete), secoursDuJour(jour)])
      setMessages(m)
      setSecours(s)
      setErreur(null)
    } catch (e) {
      setErreur(e.message)
    } finally {
      setChargement(false)
    }
  }

  async function chargerEffectifs() {
    if (!poste) return
    try {
      const [r, e] = await Promise.all([rolesDeLaSection(poste.code), effectifsDuJour(poste.code, jour)])
      setRoles(r)
      setEffectifs(e)
    } catch (err) {
      setErreur(err.message)
    }
  }

  useEffect(() => {
    setChargement(true)
    charger()
    chargerEffectifs()

    if (!aujourdhui) return
    const minuteur = setInterval(charger, 30000)
    const canal = supabase
      .channel('cimlog-main-courante')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, charger)
      .subscribe()
    return () => {
      clearInterval(minuteur)
      supabase.removeChannel(canal)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jour, poste, fSections.codesRequete])

  useEffect(() => {
    if (!poste) return
    secouristesDeSection(poste.annuaire_section_id)
      .then(setSecouristes)
      .catch((e) => setErreur(e.message))
  }, [poste])

  // Le message « Identité transmise : N personne(s) » (posé par
  // enregistrer_identites côté Cim'Alerte) ne dit rien de qui — on va
  // chercher le détail dans victimes pour l'afficher à la place.
  const eventIdsIdentite = useMemo(
    () => [...new Set(messages.filter((m) => estMessageIdentite(m.content) && m.eventId != null).map((m) => m.eventId))],
    [messages]
  )
  useEffect(() => {
    if (eventIdsIdentite.length === 0) {
      setVictimesParEvenement(new Map())
      return
    }
    victimesDesEvenements(eventIdsIdentite, fSections.codesRequete != null)
      .then(setVictimesParEvenement)
      .catch((e) => setErreur(e.message))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventIdsIdentite.join(','), fSections.codesRequete])

  const changerJour = (delta) =>
    setJour((j) => {
      const d = new Date(j)
      d.setDate(d.getDate() + delta)
      return d
    })

  const messagesFiltres = useMemo(() => {
    const mot = recherche.trim().toLowerCase()
    const numero = filtreNumero.trim()
    return messages.filter((m) => {
      if (filtreSG && !estMentionSG(m.content)) return false
      if (numero && String(m.localId ?? '') !== numero) return false
      if (!mot) return true
      return (
        m.content.toLowerCase().includes(mot) ||
        (m.com ?? '').toLowerCase().includes(mot) ||
        (m.lieu ?? '').toLowerCase().includes(mot)
      )
    })
  }, [messages, recherche, filtreNumero, filtreSG])

  function commencerEdition(m) {
    setEditionId(m.idStatus)
    setTexteEdition(m.content)
  }

  async function validerEdition(m) {
    const texte = texteEdition.trim()
    if (!texte) return
    try {
      await modifierMessageMc({ idStatus: m.idStatus, contenu: texte })
      setEditionId(null)
      await charger()
    } catch (e) {
      setErreur(e.message)
    }
  }

  async function basculerBarre(m) {
    try {
      await rayerMessageMc({ idStatus: m.idStatus, barre: !m.barre })
      await charger()
    } catch (e) {
      setErreur(e.message)
    }
  }

  return (
    <section className="page page-mc">
      <datalist id="liste-secouristes-mc">
        {secouristes.map((s) => (
          <option key={s.id} value={s.nom} />
        ))}
      </datalist>

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

        <button
          type="button"
          className={effectifsOuverts ? 'bouton-permanence-mc actif' : 'bouton-permanence-mc'}
          onClick={() => setEffectifsOuverts((v) => !v)}
        >
          <span className="icone-permanence-mc" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M9 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0 2c-3.6 0-7 1.8-7 4.5V20h14v-1.5c0-2.7-3.4-4.5-7-4.5Z" />
              <path d="M16.5 12A3.5 3.5 0 1 0 16.5 5a3.5 3.5 0 0 0 0 7Zm.7 1.6c-.3 0-.6.02-.9.06 1.4.9 2.3 2.2 2.3 3.84V20H23v-1.5c0-2.6-3-4.9-5.8-4.9Z" opacity=".7" />
            </svg>
          </span>
          Effectifs
        </button>

        <input
          className="recherche-mc"
          type="search"
          placeholder="Recherche mots-clés…"
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
        />
        <input
          className="filtre-numero-mc"
          type="text"
          placeholder="N° Secours…"
          value={filtreNumero}
          onChange={(e) => setFiltreNumero(e.target.value)}
        />
        <button
          type="button"
          className={filtreSG ? 'bouton-effectifs actif' : 'bouton-effectifs'}
          title="N’afficher que les mentions de service général"
          onClick={() => setFiltreSG((v) => !v)}
        >
          SG
        </button>

        <div className="groupe-droite-mc">
          <SelecteurSections
            sections={fSections.sections}
            region={fSections.region}
            selection={fSections.selection}
            onSelect={fSections.selectionner}
          />

          <button type="button" className="bouton-principal bouton-exporter-mc" onClick={() => setExportOuvert(true)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3v12" />
              <path d="M7 10l5 5 5-5" />
              <path d="M5 21h14" />
            </svg>
            Exporter
          </button>
          <span className="compte-resultats-mc">{messagesFiltres.length} résultat{messagesFiltres.length > 1 ? 's' : ''}</span>
        </div>
      </div>

      {effectifsOuverts && poste && (
        <ModaleEffectifs
          poste={poste}
          jour={jour}
          roles={roles}
          effectifs={effectifs}
          secouristes={secouristes}
          onChange={chargerEffectifs}
          setRoles={setRoles}
          onFermer={() => setEffectifsOuverts(false)}
        />
      )}

      {exportOuvert && poste && (
        <ModaleExport poste={poste} roles={roles} onFermer={() => setExportOuvert(false)} />
      )}

      <div className="liste-mc">
        <div className="titre-jour-mc">{titreJour(jour)}</div>

        {roles.length > 0 && effectifs.size > 0 && (
          <div className="bloc-effectifs-mc">
            <span className="etiquette-effectifs-mc">Effectifs de permanence</span>
            {roles
              .filter((r) => effectifs.get(r)?.length)
              .map((r) => (
                <span className="groupe-effectif-mc" key={r}>
                  <span className="role-effectif-mc">{r}</span>
                  {effectifs.get(r).map((e) => e.nom).join(', ')}
                </span>
              ))}
          </div>
        )}

        {erreur && <p className="erreur">{erreur}</p>}
        {!chargement && !erreur && messagesFiltres.length === 0 && (
          <p className="aide">Aucun message {aujourdhui ? 'aujourd’hui' : 'ce jour-là'}.</p>
        )}

        <table className="tableau-mc tableau-chrono">
          <colgroup>
            <col className="col-cadenas-mc" />
            <col className="col-heure-mc" />
            <col className="col-secours-mc" />
            <col className="col-origine-mc" />
          </colgroup>
          <thead>
            <tr>
              <th className="colonne-cadenas" />
              <th className="cellule-compacte-mc">Heure</th>
              <th className="cellule-compacte-mc">Secours</th>
              <th className="cellule-compacte-mc">Origine</th>
              <th>Message / Action</th>
            </tr>
          </thead>
          <tbody>
            {messagesFiltres.map((m) => {
              const verrouille = maintenant - new Date(m.createdAt).getTime() > DUREE_MODIFICATION_MS
              const modifiable = !verrouille && m.origin !== 'Système' && !m.barre
              const rayable = m.origin !== 'Système'
              const enEdition = editionId === m.idStatus

              return (
                <tr key={m.idStatus} className={apparence(m) + (m.barre ? ' barre' : '')}>
                  <td className="cellule-cadenas">
                    {m.origin !== 'Système' && (
                      <span
                        className={verrouille ? 'icone-cadenas' : 'icone-cadenas ouvert'}
                        title={verrouille ? 'Verrouillé — plus modifiable (plus de 2h)' : 'Modifiable encore un moment'}
                      >
                        {verrouille ? (
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="5" y="11" width="14" height="10" rx="2" fill="currentColor" stroke="none" />
                            <path d="M8 11V7a4 4 0 0 1 8 0v4" />
                          </svg>
                        ) : (
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="5" y="11" width="14" height="10" rx="2" fill="currentColor" stroke="none" />
                            <path d="M8 11V7a4 4 0 0 1 7.5-2" />
                          </svg>
                        )}
                      </span>
                    )}
                  </td>
                  <td className="cellule-compacte-mc">{formatHeure(m.createdAt)}</td>
                  <td className="cellule-compacte-mc">
                    {m.eventId != null ? (
                      <>
                        {fSections.multiple && (
                          <span className="badge-section" style={{ background: couleurSection(m.squadCode) }} />
                        )}
                        <span className="numero-mc" style={{ color: STATUTS[m.statut]?.couleur }}>
                          n°{m.localId ?? '—'}
                        </span>
                        {m.com && <span className="commune-mc"> — {sansCodePostal(m.com)}</span>}
                      </>
                    ) : (
                      '-'
                    )}
                  </td>
                  <td className="cellule-compacte-mc">{m.origin}</td>
                  <td className="cellule-message-mc">
                    {enEdition ? (
                      <form
                        className="edition-message-mc"
                        onSubmit={(e) => {
                          e.preventDefault()
                          validerEdition(m)
                        }}
                      >
                        <textarea
                          value={texteEdition}
                          onChange={(e) => setTexteEdition(e.target.value)}
                          rows={2}
                          autoFocus
                        />
                        <div className="actions-edition-mc">
                          <button type="submit" className="bouton-principal" disabled={!texteEdition.trim()}>
                            OK
                          </button>
                          <button type="button" className="bouton-secondaire" onClick={() => setEditionId(null)}>
                            Annuler
                          </button>
                        </div>
                      </form>
                    ) : (
                      <div className="ligne-message-mc">
                        <span className="texte-message-mc">
                          {estMessageIdentite(m.content) && victimesParEvenement.get(m.eventId)?.length > 0 ? (
                            <span className="identites-message-mc">
                              {victimesParEvenement.get(m.eventId).map((v, i) => (
                                <span className="identite-victime-mc" key={i}>
                                  {formatIdentiteVictime(v)}
                                </span>
                              ))}
                            </span>
                          ) : (
                            m.content
                          )}
                        </span>
                        <span className="actions-message-mc">
                          {modifiable && (
                            <button type="button" onClick={() => commencerEdition(m)} title="Modifier" aria-label="Modifier">
                              ✎
                            </button>
                          )}
                          {rayable && (
                            <button
                              type="button"
                              onClick={() => basculerBarre(m)}
                              title={m.barre ? 'Rétablir' : 'Rayer'}
                              aria-label={m.barre ? 'Rétablir' : 'Rayer'}
                            >
                              {m.barre ? '↺' : '⌫'}
                            </button>
                          )}
                        </span>
                      </div>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <div ref={finListe} />
      </div>

      {aujourdhui && poste ? (
        <Composeur poste={poste} secours={secours} onEnvoye={charger} />
      ) : (
        <p className="aide-jour-passe">Lecture seule — on n’écrit que dans aujourd’hui.</p>
      )}
    </section>
  )
}

function apparence(m) {
  if (m.origin === 'Système') return 'ligne-mc systeme'
  if (m.type === 'avis') return 'ligne-mc avis'
  if (estMentionSG(m.content)) return 'ligne-mc sg'
  return 'ligne-mc'
}

/**
 * Effectifs de permanence, en fenêtre — le nom du secouriste d'abord, son
 * rôle du jour ensuite : les rôles varient trop (saisonniers, propres à
 * chaque section) pour présenter une grille de cases vides à remplir un
 * rôle à la fois. Un rôle tapé qui n'existe pas encore s'ajoute de
 * lui-même à la liste de la section — pas de formulaire séparé pour ça.
 */
function ModaleEffectifs({ poste, jour, roles, effectifs, secouristes, onChange, setRoles, onFermer }) {
  const [nom, setNom] = useState('')
  const [role, setRole] = useState('')
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState(null)
  const champNom = useRef(null)

  useEffect(() => {
    champNom.current?.focus()
    const surTouche = (e) => e.key === 'Escape' && onFermer()
    window.addEventListener('keydown', surTouche)
    return () => window.removeEventListener('keydown', surTouche)
  }, [onFermer])

  async function ajouter(e) {
    e.preventDefault()
    const nomSaisi = nom.trim()
    const roleSaisi = role.trim()
    if (!nomSaisi || !roleSaisi || enCours) return
    setEnCours(true)
    setErreur(null)
    try {
      let listeRoles = roles
      if (!listeRoles.includes(roleSaisi)) {
        listeRoles = await ajouterRole(poste.code, listeRoles, roleSaisi)
        setRoles(listeRoles)
      }
      const trouve = secouristes.find((s) => s.nom.toLowerCase() === nomSaisi.toLowerCase())
      await ajouterEffectif({
        codeSection: poste.code,
        jour,
        role: roleSaisi,
        nom: trouve?.nom ?? nomSaisi,
        secouristeId: trouve?.id ?? null,
      })
      setNom('')
      setRole('')
      champNom.current?.focus()
      await onChange()
    } catch (err) {
      setErreur(err.message)
    } finally {
      setEnCours(false)
    }
  }

  const rolesAffiches = roles.filter((r) => effectifs.get(r)?.length)
  const total = rolesAffiches.reduce((n, r) => n + effectifs.get(r).length, 0)

  return (
    <div className="fond-modale" onClick={onFermer}>
      <div className="modale-effectifs" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <header className="entete-modale">
          <h3>Effectifs de permanence</h3>
          <button type="button" className="fermer-modale" onClick={onFermer} aria-label="Fermer">
            ×
          </button>
        </header>

        <datalist id="liste-roles-mc">
          {roles.map((r) => (
            <option key={r} value={r} />
          ))}
        </datalist>

        <form className="ligne-ajout-effectif" onSubmit={ajouter}>
          <input
            ref={champNom}
            list="liste-secouristes-mc"
            placeholder="Nom du secouriste…"
            value={nom}
            onChange={(e) => setNom(e.target.value)}
          />
          <input
            list="liste-roles-mc"
            placeholder="Rôle du jour…"
            value={role}
            onChange={(e) => setRole(e.target.value)}
          />
          <button type="submit" className="bouton-principal" disabled={!nom.trim() || !role.trim() || enCours}>
            Ajouter
          </button>
        </form>
        <p className="aide-effectifs">
          Secouristes de la section proposés automatiquement — sinon, tape simplement le nom d’un renfort.
        </p>
        {erreur && <p className="erreur">{erreur}</p>}

        <div className="grille-effectifs">
          {rolesAffiches.length === 0 && <p className="aide">Aucun effectif saisi pour ce jour.</p>}
          {rolesAffiches.map((r) => (
            <div className="carte-role-effectif" key={r}>
              <span className="nom-role-effectif">{r}</span>
              <span className="puces-effectif">
                {effectifs.get(r).map((eff) => (
                  <span className="puce-effectif" key={eff.id}>
                    {eff.nom}
                    <button
                      type="button"
                      onClick={() => retirerEffectif(eff.id).then(onChange).catch((err) => setErreur(err.message))}
                      aria-label={`Retirer ${eff.nom}`}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </span>
            </div>
          ))}
        </div>

        {total > 0 && (
          <p className="total-effectifs">
            {total} personne{total > 1 ? 's' : ''} affectée{total > 1 ? 's' : ''} aujourd’hui
          </p>
        )}

        <div className="actions-sg">
          <button type="button" className="bouton-principal" onClick={onFermer}>
            Valider
          </button>
        </div>
      </div>
    </div>
  )
}

/** Export PDF sur une période choisie — par défaut la semaine de service en cours (lundi 8h) jusqu’à maintenant. */
function ModaleExport({ poste, roles, onFermer }) {
  const [debut, setDebut] = useState(() => versEntreeLocale(debutSemaine(new Date())))
  const [fin, setFin] = useState(() => versEntreeLocale(new Date()))
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState(null)

  useEffect(() => {
    const surTouche = (e) => e.key === 'Escape' && onFermer()
    window.addEventListener('keydown', surTouche)
    return () => window.removeEventListener('keydown', surTouche)
  }, [onFermer])

  async function exporter(e) {
    e.preventDefault()
    setEnCours(true)
    setErreur(null)
    try {
      await exporterMainCourantePdf({ poste, roles, debut: new Date(debut), fin: new Date(fin) })
      onFermer()
    } catch (err) {
      setErreur(err.message)
    } finally {
      setEnCours(false)
    }
  }

  return (
    <div className="fond-modale" onClick={onFermer}>
      <div className="modale-export" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <header className="entete-modale">
          <h3>Exporter en PDF</h3>
          <button type="button" className="fermer-modale" onClick={onFermer} aria-label="Fermer">
            ×
          </button>
        </header>

        <form className="corps-sg" onSubmit={exporter}>
          <label className="champ-sg">
            <span>Du</span>
            <input type="datetime-local" value={debut} onChange={(e) => setDebut(e.target.value)} required />
          </label>
          <label className="champ-sg">
            <span>Au</span>
            <input type="datetime-local" value={fin} onChange={(e) => setFin(e.target.value)} required />
          </label>
          <p className="aide-effectifs">Par défaut : du lundi 8h de la semaine en cours à maintenant.</p>

          {erreur && <p className="erreur">{erreur}</p>}

          <div className="actions-sg">
            <button type="button" className="bouton-secondaire" onClick={onFermer}>
              Annuler
            </button>
            <button type="submit" className="bouton-principal" disabled={enCours}>
              {enCours ? 'Génération…' : 'Exporter en PDF'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

/**
 * Mentions de service général — rappel sur astreinte, rappel sur RC, fin de
 * service. Un même geste peut viser plusieurs secouristes (max 15), chacun
 * recevant sa propre ligne dans la main courante ; l'heure peut être
 * antidatée jusqu'à 3h (revérifié côté base, voir mentions_service_general.sql)
 * pour rattraper une mention notée après coup.
 */
function ModaleSG({ poste, onFermer, onEnvoye }) {
  const [type, setType] = useState(TYPES_MENTION_SG[0])
  const [heure, setHeure] = useState(() => versEntreeLocale(new Date()))
  const [noms, setNoms] = useState([''])
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState(null)

  const [bornes] = useState(() => ({
    min: versEntreeLocale(new Date(Date.now() - 3 * 60 * 60 * 1000)),
    max: versEntreeLocale(new Date()),
  }))

  useEffect(() => {
    const surTouche = (e) => e.key === 'Escape' && onFermer()
    window.addEventListener('keydown', surTouche)
    return () => window.removeEventListener('keydown', surTouche)
  }, [onFermer])

  const changerNom = (i, valeur) => setNoms((n) => n.map((x, idx) => (idx === i ? valeur : x)))
  const ajouterChamp = () => setNoms((n) => (n.length >= 15 ? n : [...n, '']))
  const retirerChamp = (i) => setNoms((n) => (n.length > 1 ? n.filter((_, idx) => idx !== i) : n))

  async function valider(e) {
    e.preventDefault()
    const destinataires = noms.map((n) => n.trim()).filter(Boolean)
    if (!destinataires.length || enCours) return
    setEnCours(true)
    setErreur(null)
    try {
      for (const nom of destinataires) {
        await envoyerMessageGeneral({
          contenu: `${type} : ${nom}`,
          origine: 'SAISIE MANUELLE',
          squadCode: poste.code,
          horodatage: new Date(heure),
        })
      }
      await onEnvoye?.()
      onFermer()
    } catch (err) {
      setErreur(err.message)
    } finally {
      setEnCours(false)
    }
  }

  return (
    <div className="fond-modale" onClick={onFermer}>
      <div className="modale-sg" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <header className="entete-modale entete-sg">
          <h3>Service général (SG)</h3>
          <button type="button" className="fermer-modale" onClick={onFermer} aria-label="Fermer">
            ×
          </button>
        </header>

        <form className="corps-sg" onSubmit={valider}>
          <label className="champ-sg">
            <span>Type de mention</span>
            <select value={type} onChange={(e) => setType(e.target.value)}>
              {TYPES_MENTION_SG.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>

          <label className="champ-sg">
            <span>Heure de la mention (jusqu’à -3h)</span>
            <input
              type="datetime-local"
              value={heure}
              min={bornes.min}
              max={bornes.max}
              onChange={(e) => setHeure(e.target.value)}
            />
          </label>

          <div className="champ-sg">
            <span>Secouristes concernés (max 15)</span>
            <div className="liste-secouristes-sg">
              {noms.map((nom, i) => (
                <div className="ligne-secouriste-sg" key={i}>
                  <input
                    list="liste-secouristes-mc"
                    placeholder="Nom…"
                    value={nom}
                    onChange={(e) => changerNom(i, e.target.value)}
                  />
                  <button
                    type="button"
                    className="retirer-secouriste-sg"
                    onClick={() => retirerChamp(i)}
                    disabled={noms.length === 1}
                    aria-label="Retirer ce secouriste"
                  >
                    🗑
                  </button>
                </div>
              ))}
            </div>
            <button type="button" className="ajouter-secouriste-sg" onClick={ajouterChamp} disabled={noms.length >= 15}>
              + Ajouter un secouriste
            </button>
          </div>

          {erreur && <p className="erreur">{erreur}</p>}

          <div className="actions-sg">
            <button type="button" className="bouton-secondaire" onClick={onFermer}>
              Annuler
            </button>
            <button type="submit" className="bouton-principal" disabled={enCours || !noms.some((n) => n.trim())}>
              {enCours ? 'Envoi…' : 'Valider (Infos Gén.)'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function Composeur({ poste, secours, onEnvoye }) {
  const [cible, setCible] = useState('general')
  const [texte, setTexte] = useState('')
  const [envoiEnCours, setEnvoiEnCours] = useState(false)
  const [erreur, setErreur] = useState(null)
  const [sgOuvert, setSgOuvert] = useState(false)
  // Un message composé à partir d'au moins une puce « Avis » est un avis de
  // main courante, pas un simple échange — voir apparence(), qui le colore
  // en conséquence. Retombe à texte libre dès que la zone est vidée : un
  // « Avis CODIS » effacé puis remplacé par autre chose n'en est plus un.
  const [estAvis, setEstAvis] = useState(false)

  async function envoyer(e) {
    e?.preventDefault()
    const mot = texte.trim()
    if (!mot || envoiEnCours) return
    setEnvoiEnCours(true)
    setErreur(null)
    try {
      if (cible === 'general') {
        await envoyerMessageGeneral({ contenu: mot, origine: poste.code, squadCode: poste.code })
      } else {
        await envoyerMessageChat({ eventId: Number(cible), contenu: mot, origine: poste.code, avis: estAvis })
      }
      setTexte('')
      setEstAvis(false)
      await onEnvoye?.()
    } catch (err) {
      setErreur(err.message)
    } finally {
      setEnvoiEnCours(false)
    }
  }

  // Le plus récent en tête : c'est par là qu'on cherche en premier le
  // secours qui vient de bouger — même ordre que le sélecteur de Cim'Alerte.
  const secoursRecentsDabord = secours.slice().reverse()

  return (
    <>
      <form className="composeur-mc" onSubmit={envoyer}>
        <div className="raccourcis-mc">
          <button type="button" className="bouton-sg" onClick={() => setSgOuvert(true)}>
            SG
          </button>

          <span className="separateur-raccourcis" />

          <span className="etiquette-avis">Avis :</span>
          {AVIS.map((a) => (
            <button
              key={a}
              type="button"
              className="puce-avis"
              onClick={() => {
                setTexte((t) => ajouterModele(t, `Avis ${a}`))
                setEstAvis(true)
              }}
            >
              {a}
            </button>
          ))}
        </div>

        <div className="ligne-composeur-mc">
          <select className="cible-mc" value={cible} onChange={(e) => setCible(e.target.value)} aria-label="Rattacher à">
            <option value="general">Message général</option>
            {secoursRecentsDabord.map((s) => (
              <option key={s.id} value={s.id} style={{ color: STATUTS[s.statut]?.couleur }}>
                n°{s.local_id} — {[s.com, s.activity || s.lieu].filter(Boolean).join(' — ') || 'sans titre'}
              </option>
            ))}
          </select>
          <textarea
            rows={2}
            placeholder="Écrire dans la main courante…"
            value={texte}
            onChange={(e) => {
              setTexte(e.target.value)
              if (!e.target.value.trim()) setEstAvis(false)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) envoyer(e)
            }}
          />
          <button type="submit" className="bouton-principal" disabled={envoiEnCours || !texte.trim()}>
            Envoyer
          </button>
        </div>
        {erreur && <p className="erreur">{erreur}</p>}
      </form>

      {/* Hors du <form> du composeur : ModaleSG porte elle-même un <form>,
          et un <form> imbriqué dans un autre casse la soumission (le
          navigateur ne sait plus lequel valider). */}
      {sgOuvert && <ModaleSG poste={poste} onFermer={() => setSgOuvert(false)} onEnvoye={onEnvoye} />}
    </>
  )
}
