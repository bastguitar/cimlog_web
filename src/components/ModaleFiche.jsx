import { useEffect, useMemo, useState } from 'react'
import { ficheSecours, formatIdentiteVictime, modifierIntervention } from '../lib/registre'
import { STATUTS } from '../lib/statuts'
import { groupeDe } from '../lib/sections'
import OngletSnosm from './snosm/OngletSnosm'

/**
 * Champs de l'onglet Infos modifiables en édition — même liste (côté
 * présentation seulement) que CHAMPS_MODIFIABLES_INTERVENTION dans
 * supabase/functions/grist/index.ts, qui reste la seule autorité réelle :
 * un champ absent d'ici n'est simplement pas proposé à l'édition, mais le
 * vrai filtrage se fait côté serveur.
 */
const GROUPES_EDITION_INFOS = [
  {
    titre: 'Origine de l’alerte',
    champs: [
      { cle: 'alert_origin', label: 'Origine' },
      { cle: 'requerant_nom', label: 'Requérant' },
      { cle: 'requerant_telephone', label: 'Téléphone' },
      { cle: 'contre_appel', label: 'Contre-appel' },
      { cle: 'personne_recherchee_nom', label: 'Personne recherchée' },
    ],
  },
  {
    titre: 'Localisation',
    champs: [
      { cle: 'com', label: 'Commune' },
      { cle: 'lieu', label: 'Lieu' },
      { cle: 'county', label: 'Département' },
      { cle: 'massif', label: 'Massif' },
      { cle: 'alt', label: 'Altitude (m)' },
      { cle: 'tgi', label: 'TGI' },
      { cle: 'type_localisation', label: 'Précision' },
      { cle: 'meteo', label: 'Météo' },
    ],
  },
  {
    titre: 'Moyens engagés',
    champs: [
      { cle: 'helicopter', label: 'Hélicoptère' },
      { cle: 'type_intervention', label: 'Type d’intervention' },
      { cle: 'support_units', label: 'Unités en soutien' },
      { cle: 'is_med', label: 'Médicalisée', type: 'bool' },
      { cle: 'infirmier', label: 'Infirmier', type: 'bool' },
    ],
  },
  {
    titre: 'Description',
    champs: [{ cle: 'description', label: 'Description', type: 'texte-long' }],
  },
]

const formatDateHeure = (iso) =>
  new Date(iso).toLocaleString('fr-FR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })

/** Rendu générique d'un champ dont la forme n'est pas garantie (jsonb libre : tableau, objet, ou simple valeur). */
function renduValeur(v) {
  if (v == null || v === '') return null
  if (Array.isArray(v)) return v.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(', ') || null
  if (typeof v === 'boolean') return v ? 'Oui' : 'Non'
  if (typeof v === 'object') {
    const texte = Object.entries(v)
      .filter(([, val]) => val)
      .map(([k, val]) => `${k} : ${renduValeur(val)}`)
      .join(' · ')
    return texte || null
  }
  return String(v)
}

const ONGLETS_FICHE = [
  { cle: 'infos', libelle: 'Infos' },
  { cle: 'victimes', libelle: 'Victimes' },
  { cle: 'snosm', libelle: 'SNOSM' },
]

/**
 * Fiche d'une intervention, en fenêtre à onglets — partagée par le Registre
 * (clic sur une ligne) et la Carte IGN (clic sur un repère) : même fiche,
 * quel que soit l'écran d'où on l'ouvre.
 */
export default function ModaleFiche({ id, onFermer, codesRequete = null, fSections = null }) {
  const [fiche, setFiche] = useState(null)
  const [erreur, setErreur] = useState(null)
  const [chargement, setChargement] = useState(true)
  const [onglet, setOnglet] = useState('infos')
  const [edition, setEdition] = useState(false)
  const [brouillon, setBrouillon] = useState(null)
  const [enregistrement, setEnregistrement] = useState(false)

  // Nom de la section propriétaire de la fiche, pour l'en-tête « DE : » du TO
  // — pas forcément la section du poste connecté (fiche consultée en vue région).
  const nomDeSection = useMemo(
    () => new Map((fSections?.toutesSections ?? []).map((s) => [s.code, s.nom])),
    [fSections]
  )

  useEffect(() => {
    setChargement(true)
    ficheSecours(id, codesRequete)
      .then((f) => {
        setFiche(f)
        setErreur(null)
      })
      .catch((e) => setErreur(e.message))
      .finally(() => setChargement(false))
    // codesRequete délibérément absent : la fiche garde la portée avec
    // laquelle elle a été ouverte, elle ne se recharge pas si le filtre de
    // section change pendant qu'elle est affichée.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  useEffect(() => {
    const surTouche = (e) => e.key === 'Escape' && onFermer()
    window.addEventListener('keydown', surTouche)
    return () => window.removeEventListener('keydown', surTouche)
  }, [onFermer])

  function demarrerEdition() {
    setBrouillon(Object.fromEntries(GROUPES_EDITION_INFOS.flatMap((g) => g.champs).map(({ cle }) => [cle, fiche[cle] ?? ''])))
    setEdition(true)
    setErreur(null)
  }

  function annulerEdition() {
    setEdition(false)
    setBrouillon(null)
  }

  async function enregistrer() {
    const champs = Object.fromEntries(
      Object.entries(brouillon).filter(([cle, valeur]) => valeur !== (fiche[cle] ?? ''))
    )
    if (Object.keys(champs).length === 0) {
      setEdition(false)
      setBrouillon(null)
      return
    }
    setEnregistrement(true)
    try {
      await modifierIntervention(fiche.id, codesRequete, champs)
      setFiche({ ...fiche, ...champs })
      setEdition(false)
      setBrouillon(null)
      setErreur(null)
    } catch (e) {
      setErreur(e.message)
      if (e.codeErreur === 409) {
        // Figée entre-temps (télégramme officiel envoyé ailleurs) : on
        // ressort de l'édition et on relit la fiche pour refléter l'état réel.
        setEdition(false)
        setBrouillon(null)
        ficheSecours(id, codesRequete).then(setFiche).catch(() => {})
      }
    } finally {
      setEnregistrement(false)
    }
  }

  return (
    <div className="fond-modale" onClick={onFermer}>
      <div className="modale-fiche" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <header className="entete-modale">
          <h3>{fiche ? `Intervention n°${fiche.local_id}` : 'Intervention'}</h3>
          <button type="button" className="fermer-modale" onClick={onFermer} aria-label="Fermer">
            ×
          </button>
        </header>

        {chargement && <p className="aide">Chargement…</p>}
        {erreur && <p className="erreur">{erreur}</p>}

        {fiche && (
          <>
            <div className="entete-fiche">
              <span className="statut-fiche" style={{ color: STATUTS[fiche.statut]?.couleur }}>
                {STATUTS[fiche.statut]?.libelle ?? fiche.statut}
              </span>
              <span>{fiche.activity || fiche.accident_type || 'Activité non précisée'}</span>
              <span>{[fiche.com, fiche.lieu].filter(Boolean).join(' — ')}</span>
            </div>
            {/* Terminée le … reviendra avec ClotureLe une fois Cim'Log branché
                sur Grist (voir sections_lecture_region.sql/registre.js) — pas
                de colonne de clôture côté Supabase, et sa seule source
                jusqu'ici (le dernier statut FIN de la main courante) a
                disparu avec elle. */}
            <p className="dates-fiche">Alerte le {formatDateHeure(fiche.created_at)}</p>

            <div className="onglets-fiche">
              {ONGLETS_FICHE.map((o) => (
                <button
                  key={o.cle}
                  type="button"
                  className={onglet === o.cle ? 'onglet-fiche actif' : 'onglet-fiche'}
                  onClick={() => setOnglet(o.cle)}
                  disabled={edition}
                >
                  {o.libelle}
                  {o.cle === 'victimes' && fiche.victimes?.length > 0 && ` (${fiche.victimes.length})`}
                </button>
              ))}
              {/* Pas de télégramme officiel envoyé : la fiche reste modifiable.
                  Une fois TOEnvoyeLe posé (futur envoi du TO), elle se fige —
                  silencieusement, aucun bouton Modifier n'apparaît plus. */}
              {onglet === 'infos' && !edition && !fiche.toEnvoyeLe && (
                <button type="button" className="bouton-secondaire bouton-modifier-fiche" onClick={demarrerEdition}>
                  Modifier
                </button>
              )}
            </div>

            <div className="corps-fiche">
              {onglet === 'infos' &&
                (edition ? (
                  <OngletInfosEdition brouillon={brouillon} onChange={setBrouillon} />
                ) : (
                  <OngletInfos fiche={fiche} />
                ))}
              {onglet === 'victimes' && <OngletVictimes victimes={fiche.victimes ?? []} />}
              {onglet === 'snosm' && (
                <OngletSnosm
                  fiche={fiche}
                  codesRequete={codesRequete}
                  onFicheMaj={setFiche}
                  sectionNom={nomDeSection.get(groupeDe(fiche.squad_code)) ?? fiche.squad_code}
                />
              )}
            </div>

            {edition && (
              <div className="actions-edition-fiche">
                <button type="button" className="bouton-secondaire" onClick={annulerEdition} disabled={enregistrement}>
                  Annuler
                </button>
                <button type="button" className="bouton-principal" onClick={enregistrer} disabled={enregistrement}>
                  {enregistrement ? 'Enregistrement…' : 'Enregistrer'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function OngletInfosEdition({ brouillon, onChange }) {
  const majChamp = (cle, valeur) => onChange((b) => ({ ...b, [cle]: valeur }))

  return (
    <>
      {GROUPES_EDITION_INFOS.map((groupe) => (
        <div className="section-fiche" key={groupe.titre}>
          <h4>{groupe.titre}</h4>
          <div className="grille-details-fiche">
            {groupe.champs.map(({ cle, label, type }) => (
              <div className={type === 'texte-long' ? 'detail-fiche-edition detail-pleine-largeur' : 'detail-fiche-edition'} key={cle}>
                <span className="etiquette-detail-fiche">{label}</span>
                {type === 'bool' ? (
                  <div className="champ-bool-edition">
                    <button
                      type="button"
                      className={brouillon[cle] ? 'option-bool-edition actif' : 'option-bool-edition'}
                      onClick={() => majChamp(cle, true)}
                    >
                      Oui
                    </button>
                    <button
                      type="button"
                      className={!brouillon[cle] ? 'option-bool-edition actif' : 'option-bool-edition'}
                      onClick={() => majChamp(cle, false)}
                    >
                      Non
                    </button>
                  </div>
                ) : type === 'texte-long' ? (
                  <textarea value={brouillon[cle] ?? ''} onChange={(e) => majChamp(cle, e.target.value)} rows={4} />
                ) : (
                  <input type="text" value={brouillon[cle] ?? ''} onChange={(e) => majChamp(cle, e.target.value)} />
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </>
  )
}

function OngletInfos({ fiche }) {
  return (
    <>
      <div className="section-fiche">
        <h4>Origine de l’alerte</h4>
        <div className="grille-details-fiche">
          {fiche.alert_origin && <Detail label="Origine">{fiche.alert_origin}</Detail>}
          {fiche.alert_at && <Detail label="Alerte reçue le">{formatDateHeure(fiche.alert_at)}</Detail>}
          {fiche.requerant_nom && <Detail label="Requérant">{fiche.requerant_nom}</Detail>}
          {fiche.requerant_telephone && <Detail label="Téléphone">{fiche.requerant_telephone}</Detail>}
          {fiche.contre_appel && <Detail label="Contre-appel">{fiche.contre_appel}</Detail>}
          {fiche.personne_recherchee_nom && (
            <Detail label="Personne recherchée">{fiche.personne_recherchee_nom}</Detail>
          )}
        </div>
      </div>

      <div className="section-fiche">
        <h4>Localisation</h4>
        <div className="grille-details-fiche">
          {fiche.county && <Detail label="Département">{fiche.county}</Detail>}
          {fiche.massif && <Detail label="Massif">{fiche.massif}</Detail>}
          {fiche.alt && <Detail label="Altitude">{fiche.alt} m</Detail>}
          {fiche.tgi && <Detail label="TGI">{fiche.tgi}</Detail>}
          {fiche.type_localisation && <Detail label="Précision">{fiche.type_localisation}</Detail>}
          {fiche.lat && fiche.lon && (
            <Detail label="Coordonnées">
              {fiche.lat}, {fiche.lon}
            </Detail>
          )}
          {fiche.meteo && <Detail label="Météo">{fiche.meteo}</Detail>}
        </div>
      </div>

      <div className="section-fiche">
        <h4>Moyens engagés</h4>
        <div className="grille-details-fiche">
          {fiche.team?.length > 0 && <Detail label="Équipe engagée">{fiche.team.join(', ')}</Detail>}
          {fiche.helicopter && <Detail label="Hélicoptère">{fiche.helicopter}</Detail>}
          {fiche.type_intervention && <Detail label="Type d’intervention">{fiche.type_intervention}</Detail>}
          {fiche.support_units && <Detail label="Unités en soutien">{renduValeur(fiche.support_units)}</Detail>}
          {renduValeur(fiche.moyens_engages) && (
            <Detail label="Moyens">{renduValeur(fiche.moyens_engages)}</Detail>
          )}
          {fiche.is_med != null && <Detail label="Médicalisée">{renduValeur(fiche.is_med)}</Detail>}
          {fiche.infirmier != null && <Detail label="Infirmier">{renduValeur(fiche.infirmier)}</Detail>}
          {fiche.equipe_terrestre != null && (
            <Detail label="Équipe terrestre">{renduValeur(fiche.equipe_terrestre)}</Detail>
          )}
        </div>
      </div>

      {(fiche.description || fiche.pathologies) && (
        <div className="section-fiche">
          <h4>Description</h4>
          {fiche.description && <p>{fiche.description}</p>}
          {fiche.pathologies && <p className="muet">{fiche.pathologies}</p>}
        </div>
      )}
    </>
  )
}

function OngletVictimes({ victimes }) {
  if (victimes.length === 0) return <p className="aide">Aucune victime enregistrée.</p>
  return (
    <div className="section-fiche">
      {victimes.map((v) => (
        <div className="carte-victime" key={v.id}>
          <strong>
            Victime {v.local_id ?? ''} — {v.sexe || '—'}
            {v.age ? `, ${v.age} ans` : ''}
          </strong>
          {v.nom && <p className="identite-victime-fiche">{formatIdentiteVictime(v)}</p>}
          {v.pathologie && <p>{v.pathologie}</p>}
          {v.gravite && <p className="muet">Gravité : {v.gravite}</p>}
          {v.douleur != null && <p className="muet">Douleur : {v.douleur}/10</p>}
          {v.circonstances && <p className="muet">{v.circonstances}</p>}
          {v.cinetique && <p className="muet">{v.cinetique}</p>}
          {v.bilan_terrain && <p className="muet">{v.bilan_terrain}</p>}
        </div>
      ))}
    </div>
  )
}

function Detail({ label, children }) {
  return (
    <div className="detail-fiche">
      <span className="etiquette-detail-fiche">{label}</span>
      <span>{children}</span>
    </div>
  )
}
