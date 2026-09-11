import { useEffect, useMemo, useState } from 'react'
import { listerAnnee, sansCodePostal, nomSeul, ficheSecours } from '../lib/registre'
import { STATUTS } from '../lib/statuts'
import { couleurSection, groupeDe } from '../lib/sections'
import { regrouperParSemaine, libelleSemaine, numeroSemaine, titreJournee } from '../lib/semaines'
import { useFiltresRegistre } from '../hooks/useFiltresRegistre'
import { ControlesFiltresRegistre, PanneauFiltresRegistre } from '../components/FiltresRegistre'
import ModaleFiche from '../components/ModaleFiche'
import { telechargerTelegrammeTO } from '../lib/telegrammeTO'

const formatHeure = (iso) => new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
const pathologiesDe = (s) => (s.victimes ?? []).map((v) => v.pathologie).filter(Boolean).join(', ')

/** Mêmes colonnes pour l'en-tête fixe et chaque table du jour — colgroup partagé pour un alignement garanti. */
function colonnesRegistre(multiple) {
  const colonnes = [
    { cle: 'heure', label: 'Heure', classe: 'col-heure-registre' },
    { cle: 'numero', label: 'N°', classe: 'col-numero-registre' },
  ]
  if (multiple) colonnes.push({ cle: 'unite', label: 'Unité', classe: 'col-unite-registre' })
  colonnes.push(
    { cle: 'commune', label: 'Commune / Massif', classe: 'col-commune-registre' },
    { cle: 'lieu', label: 'Lieu', classe: 'col-lieu-registre' },
    { cle: 'activite', label: 'Motif / Activité', classe: 'col-activite-registre' },
    { cle: 'pathologies', label: 'Pathologies', classe: 'col-pathologies-registre' },
    { cle: 'moyen', label: 'Moyen', classe: 'col-moyen-registre' },
    { cle: 'equipe', label: 'Équipe', classe: 'col-equipe-registre' },
    { cle: 'to', label: '', classe: 'col-to-registre' }
  )
  return colonnes
}

function ColgroupRegistre({ colonnes }) {
  return (
    <colgroup>
      {colonnes.map((c) => (
        <col key={c.cle} className={c.classe} />
      ))}
    </colgroup>
  )
}

/**
 * Registre des secours — toutes les interventions de l'année, les plus
 * récentes d'abord, groupées par semaine de service puis par jour (même
 * découpage que la relève, lundi 8h — voir lib/semaines.js). Cliquer une
 * ligne ouvre sa fiche (infos, victimes, SNOSM) ; la fiche elle-même peut
 * s'éditer tant qu'aucun télégramme officiel n'a été envoyé (ModaleFiche).
 */
export default function Registre({ fSections }) {
  const [annee, setAnnee] = useState(() => new Date().getFullYear())
  const [evenements, setEvenements] = useState([])
  const [erreur, setErreur] = useState(null)
  const [chargement, setChargement] = useState(true)
  const [ficheId, setFicheId] = useState(null)
  const [genererTOId, setGenererTOId] = useState(null)
  const [erreurTO, setErreurTO] = useState(null)

  // Rafraîchissement périodique — pensé pour un poste laissé ouvert en
  // continu sur un écran, qui doit voir arriver les nouvelles interventions
  // sans qu'on ait à recharger la page. Silencieux (pas de "Chargement…" à
  // chaque tour, seulement au premier chargement/changement d'année) pour ne
  // pas faire clignoter l'écran ; la fiche ouverte (ModaleFiche) charge ses
  // propres données à part, ce rafraîchissement ne la perturbe pas.
  useEffect(() => {
    let vivant = true
    setChargement(true)
    const charger = (silencieux) =>
      listerAnnee(annee, fSections.codesRequete)
        .then((d) => {
          if (!vivant) return
          setEvenements(d)
          setErreur(null)
        })
        .catch((e) => vivant && setErreur(e.message))
        .finally(() => {
          if (vivant && !silencieux) setChargement(false)
        })

    charger(false)
    const intervalle = setInterval(() => charger(true), 30000)
    return () => {
      vivant = false
      clearInterval(intervalle)
    }
  }, [annee, fSections.codesRequete])

  const f = useFiltresRegistre(evenements)
  const evenementsVisibles = f.evenementsFiltres
  const semaines = useMemo(() => regrouperParSemaine(evenementsVisibles), [evenementsVisibles])
  const colonnes = useMemo(() => colonnesRegistre(fSections.multiple), [fSections.multiple])
  // Nom d'une section à partir de son squad_code, sections secondaires
  // ramenées à leur section mère (même regroupement que le sélecteur).
  const nomDeSection = useMemo(
    () => new Map((fSections.toutesSections ?? []).map((s) => [s.code, s.nom])),
    [fSections.toutesSections]
  )

  /** Génère et télécharge le TO d'une ligne sans ouvrir sa fiche — la fiche complète (victimes incluses) n'est chargée qu'ici, à la demande. */
  async function telechargerTO(s, e) {
    e.stopPropagation()
    setGenererTOId(s.id)
    setErreurTO(null)
    try {
      const fiche = await ficheSecours(s.id, fSections.codesRequete)
      await telechargerTelegrammeTO(fiche, { sectionNom: nomDeSection.get(groupeDe(s.squad_code)) ?? s.squad_code })
    } catch (err) {
      setErreurTO(err.message)
    } finally {
      setGenererTOId(null)
    }
  }

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

        <div className="groupe-droite-mc">
          <span className="compte-resultats-mc">
            {evenementsVisibles.length} intervention{evenementsVisibles.length > 1 ? 's' : ''}
          </span>
        </div>
      </div>

      <PanneauFiltresRegistre f={f} />

      {erreur && <p className="erreur">{erreur}</p>}
      {erreurTO && <p className="erreur">TO : {erreurTO}</p>}
      {!chargement && !erreur && evenementsVisibles.length === 0 && (
        <p className="aide">Aucune intervention {f.filtresActifs ? 'ne correspond' : 'cette année'}.</p>
      )}

      {evenementsVisibles.length > 0 && (
        <table className="tableau-mc tableau-registre tableau-entete-registre" aria-hidden="true">
          <ColgroupRegistre colonnes={colonnes} />
          <thead>
            <tr>
              {colonnes.map((c) => (
                <th key={c.cle}>{c.label}</th>
              ))}
            </tr>
          </thead>
        </table>
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
                  <ColgroupRegistre colonnes={colonnes} />
                  <tbody>
                    {jour.secours.map((s) => (
                      <tr key={s.id} className="ligne-registre" onClick={() => setFicheId(s.id)}>
                        <td>{formatHeure(s.created_at)}</td>
                        <td>
                          <span className="numero-mc" style={{ color: STATUTS[s.statut]?.couleur }}>
                            n°{s.local_id}
                          </span>
                        </td>
                        {fSections.multiple && (
                          <td>
                            <span className="badge-section" style={{ background: couleurSection(s.squad_code) }} />
                            {nomDeSection.get(groupeDe(s.squad_code)) ?? s.squad_code}
                          </td>
                        )}
                        <td>
                          <div className="cellule-principale-registre">{sansCodePostal(s.com) || '—'}</div>
                          {s.massif && <div className="cellule-sous-registre">{s.massif}</div>}
                        </td>
                        <td>{s.lieu || '—'}</td>
                        <td>
                          <div className="cellule-principale-registre cellule-activite-registre">{s.activity || '—'}</div>
                          {s.accident_type && <div className="cellule-sous-registre">{s.accident_type}</div>}
                        </td>
                        <td>{pathologiesDe(s) || '—'}</td>
                        <td>{s.helicopter || '—'}</td>
                        <td>{(s.team ?? []).map(nomSeul).join(', ') || '—'}</td>
                        <td>
                          <button
                            type="button"
                            className="bouton-principal bouton-to-registre"
                            onClick={(e) => telechargerTO(s, e)}
                            disabled={genererTOId === s.id}
                          >
                            {genererTOId === s.id ? '…' : 'TO'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        ))}
      </div>

      {ficheId != null && (
        <ModaleFiche
          id={ficheId}
          onFermer={() => setFicheId(null)}
          codesRequete={fSections.codesRequete}
          fSections={fSections}
        />
      )}
    </section>
  )
}
