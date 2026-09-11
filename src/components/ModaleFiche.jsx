import { useEffect, useMemo, useState } from 'react'
import { ficheSecours } from '../lib/registre'
import { STATUTS } from '../lib/statuts'
import { groupeDe } from '../lib/sections'
import FicheSnosm from './snosm/FicheSnosm'

const formatDateHeure = (iso) =>
  new Date(iso).toLocaleString('fr-FR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })

/**
 * Fiche d'une intervention, en fenêtre — partagée par le Registre (clic sur
 * une ligne) et la Carte IGN (clic sur un repère). Le corps est entièrement
 * porté par FicheSnosm : pas d'onglet "Infos"/"Victimes" séparé, les champs
 * déjà connus via Cim'Alerte sont fondus dans les groupes SNOSM
 * correspondants (voir ce composant) — un seul endroit à consulter, pas de
 * double saisie ni d'information dupliquée sous deux formes.
 */
export default function ModaleFiche({ id, onFermer, codesRequete = null, fSections = null }) {
  const [fiche, setFiche] = useState(null)
  const [erreur, setErreur] = useState(null)
  const [chargement, setChargement] = useState(true)

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
            <p className="dates-fiche">Alerte le {formatDateHeure(fiche.created_at)}</p>

            <FicheSnosm
              fiche={fiche}
              codesRequete={codesRequete}
              onFicheMaj={setFiche}
              sectionNom={nomDeSection.get(groupeDe(fiche.squad_code)) ?? fiche.squad_code}
            />
          </>
        )}
      </div>
    </div>
  )
}
