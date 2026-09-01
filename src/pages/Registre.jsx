import { useEffect, useMemo, useState } from 'react'
import { listerAnnee } from '../lib/registre'
import { STATUTS } from '../lib/mainCourante'
import { regrouperParSemaine, libelleSemaine, numeroSemaine, titreJournee } from '../lib/semaines'
import { useFiltresRegistre } from '../hooks/useFiltresRegistre'
import { ControlesFiltresRegistre, PanneauFiltresRegistre } from '../components/FiltresRegistre'
import ModaleFiche from '../components/ModaleFiche'

const formatHeure = (iso) => new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })

/**
 * Registre des secours — toutes les interventions de l'année, les plus
 * récentes d'abord, groupées par semaine de service puis par jour (même
 * découpage que la relève, lundi 8h — voir lib/semaines.js). Lecture seule :
 * cliquer une ligne ouvre sa fiche (infos, victimes, main courante complète),
 * pas d'édition ici — la main courante chronologique reste l'écran de saisie.
 */
export default function Registre() {
  const [annee, setAnnee] = useState(() => new Date().getFullYear())
  const [evenements, setEvenements] = useState([])
  const [erreur, setErreur] = useState(null)
  const [chargement, setChargement] = useState(true)
  const [ficheId, setFicheId] = useState(null)

  useEffect(() => {
    setChargement(true)
    listerAnnee(annee)
      .then((d) => {
        setEvenements(d)
        setErreur(null)
      })
      .catch((e) => setErreur(e.message))
      .finally(() => setChargement(false))
  }, [annee])

  const f = useFiltresRegistre(evenements)
  const semaines = useMemo(() => regrouperParSemaine(f.evenementsFiltres), [f.evenementsFiltres])

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

        <ControlesFiltresRegistre f={f} placeholder="Recherche libre (n°, commune, victime…)" />

        <span className="compte-resultats-mc">
          {f.evenementsFiltres.length} intervention{f.evenementsFiltres.length > 1 ? 's' : ''}
        </span>
      </div>

      <PanneauFiltresRegistre f={f} />

      {erreur && <p className="erreur">{erreur}</p>}
      {!chargement && !erreur && f.evenementsFiltres.length === 0 && (
        <p className="aide">Aucune intervention {f.filtresActifs ? 'ne correspond' : 'cette année'}.</p>
      )}

      <div className="liste-mc">
        {semaines.map((semaine) => (
          <div key={semaine.cle}>
            <div className="titre-semaine-registre">
              Semaine {numeroSemaine(semaine.debut)} — {libelleSemaine(semaine.debut)} · {semaine.total} intervention
              {semaine.total > 1 ? 's' : ''}
            </div>
            {semaine.jours.map((jour) => (
              <div key={jour.cle}>
                <div className="titre-jour-mc">{titreJournee(jour.date)}</div>
                <table className="tableau-mc tableau-registre">
                  <tbody>
                    {jour.secours.map((s) => (
                      <tr key={s.id} className="ligne-registre" onClick={() => setFicheId(s.id)}>
                        <td>{formatHeure(s.created_at)}</td>
                        <td>
                          <span className="numero-mc" style={{ color: STATUTS[s.statut]?.couleur }}>
                            n°{s.local_id}
                          </span>
                        </td>
                        <td>{[s.com, s.lieu].filter(Boolean).join(' — ') || '—'}</td>
                        <td>{s.activity || '—'}</td>
                        <td>{(s.team ?? []).join(', ') || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        ))}
      </div>

      {ficheId != null && <ModaleFiche id={ficheId} onFermer={() => setFicheId(null)} />}
    </section>
  )
}
