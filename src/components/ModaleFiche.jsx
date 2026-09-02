import { useEffect, useState } from 'react'
import { ficheSecours } from '../lib/registre'
import { messagesDeEvenement, STATUTS, formatIdentiteVictime } from '../lib/mainCourante'

const formatHeure = (iso) => new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
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
  { cle: 'mc', libelle: 'Main courante' },
  { cle: 'snosm', libelle: 'SNOSM' },
]

/**
 * Fiche d'une intervention, en fenêtre à onglets — partagée par le Registre
 * (clic sur une ligne) et la Carte IGN (clic sur un repère) : même fiche,
 * quel que soit l'écran d'où on l'ouvre.
 */
export default function ModaleFiche({ id, onFermer, codesRequete = null }) {
  const [fiche, setFiche] = useState(null)
  const [messages, setMessages] = useState([])
  const [erreur, setErreur] = useState(null)
  const [chargement, setChargement] = useState(true)
  const [onglet, setOnglet] = useState('infos')

  useEffect(() => {
    setChargement(true)
    Promise.all([ficheSecours(id, codesRequete), messagesDeEvenement(id, codesRequete)])
      .then(([f, m]) => {
        setFiche(f)
        setMessages(m)
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

  // Pas de colonne de clôture sur `events` : l'heure de fin se relit dans le
  // dernier statut FIN de la main courante — même méthode que ResumeSecours
  // côté alerte_secours_web.
  const fin = [...messages].reverse().find((m) => m.type === 'status' && m.content.startsWith('FIN'))

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
            <p className="dates-fiche">
              Alerte le {formatDateHeure(fiche.created_at)}
              {fin && <> · Terminée le {formatDateHeure(fin.createdAt)}</>}
            </p>

            <div className="onglets-fiche">
              {ONGLETS_FICHE.map((o) => (
                <button
                  key={o.cle}
                  type="button"
                  className={onglet === o.cle ? 'onglet-fiche actif' : 'onglet-fiche'}
                  onClick={() => setOnglet(o.cle)}
                >
                  {o.libelle}
                  {o.cle === 'victimes' && fiche.victimes?.length > 0 && ` (${fiche.victimes.length})`}
                  {o.cle === 'mc' && messages.length > 0 && ` (${messages.length})`}
                </button>
              ))}
            </div>

            <div className="corps-fiche">
              {onglet === 'infos' && <OngletInfos fiche={fiche} />}
              {onglet === 'victimes' && <OngletVictimes victimes={fiche.victimes ?? []} />}
              {onglet === 'mc' && <OngletMainCourante messages={messages} />}
              {onglet === 'snosm' && (
                <p className="aide">
                  Formulaire SNOSM — à venir. La fiche porte déjà l’indicateur « SNOSM :{' '}
                  {renduValeur(fiche.snosm) ?? 'non renseigné'} » côté Cim’Alerte.
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
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

function OngletMainCourante({ messages }) {
  return (
    <div className="fil-fiche">
      {messages.map((m) => (
        <div className="ligne-fil-fiche" key={m.idStatus}>
          <span className="heure-fil-fiche">{formatHeure(m.createdAt)}</span>
          <span className="origine-fil-fiche">{m.origin}</span>
          <span className={m.barre ? 'texte-fil-fiche barre' : 'texte-fil-fiche'}>{m.content}</span>
        </div>
      ))}
      {messages.length === 0 && <p className="aide">Aucun message.</p>}
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
