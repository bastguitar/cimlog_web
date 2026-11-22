import { useEffect, useMemo, useState } from 'react'
import { listerAnnee, sansCodePostal, nomSeul, ficheSecours } from '../lib/registre'
import { STATUTS } from '../lib/statuts'
import { couleurSection, groupeDe } from '../lib/sections'
import { regrouperParSemaine, libelleSemaine, numeroSemaine, titreJournee } from '../lib/semaines'
import { useFiltresRegistre, estATraiter } from '../hooks/useFiltresRegistre'
import { ControlesFiltresRegistre, PanneauFiltresRegistre } from '../components/FiltresRegistre'
import ModaleFiche from '../components/ModaleFiche'
import { estRegulation, libelleMoyens } from '../lib/moyens'
import { telechargerTelegrammeTO } from '../lib/telegrammeTO'

import {
  formatHeure,
  pathologiesDe,
  etatsMedicauxDe,
  origineDe,
  avecMoyenEngage,
  motifDe,
} from '../lib/champsRegistre'
import { exporterRegistrePdf } from '../lib/exportRegistrePdf'

/** Mêmes colonnes pour l'en-tête fixe et chaque table du jour — colgroup partagé pour un alignement garanti. */
function colonnesRegistre(multiple) {
  const colonnes = [
    { cle: 'numero', label: 'N° / Heure', classe: 'col-numero-registre' },
  ]
  if (multiple) colonnes.push({ cle: 'unite', label: 'Unité', classe: 'col-unite-registre' })
  colonnes.push(
    { cle: 'origine', label: 'Origine alerte', classe: 'col-origine-registre' },
    { cle: 'commune', label: 'Commune / Massif', classe: 'col-commune-registre' },
    { cle: 'lieu', label: 'Lieu', classe: 'col-lieu-registre' },
    { cle: 'activite', label: 'Motif / Activité', classe: 'col-activite-registre' },
    { cle: 'etatMedical', label: 'État médical', classe: 'col-etat-medical-registre' },
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

  // Intitulé de ce qui est affiché — en tête du PDF exporté.
  const intituleSection =
    fSections.selection === 'REGION'
      ? `Région ${fSections.region ?? ''}`.trim()
      : fSections.selection
        ? (fSections.sections.find((x) => x.code === fSections.selection)?.nom ?? fSections.selection)
        : fSections.nomPropre
  const [exportEnCours, setExportEnCours] = useState(false)
  const [erreurExport, setErreurExport] = useState(null)

  /** Exporte en PDF les interventions affichées (filtres compris — en général un mois). */
  async function exporterPdf() {
    setExportEnCours(true)
    setErreurExport(null)
    try {
      const { mois, ...autres } = f.filtres
      await exporterRegistrePdf(evenementsVisibles, {
        annee,
        mois,
        section: intituleSection,
        avecUnite: fSections.multiple,
        nomUnite: (code) => nomDeSection.get(groupeDe(code)) ?? code,
        filtresAutres: Object.values(autres).some(Boolean) || f.recherche.trim() !== '',
      })
    } catch (err) {
      setErreurExport(err.message)
    } finally {
      setExportEnCours(false)
    }
  }

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
          <button
            type="button"
            className="bouton-effectifs"
            onClick={exporterPdf}
            disabled={exportEnCours || evenementsVisibles.length === 0}
            title="Exporter en PDF la liste affichée (choisir un mois dans Filtres pour un export mensuel)"
          >
            {exportEnCours ? 'Export…' : 'Exporter PDF'}
          </button>
        </div>
      </div>

      <PanneauFiltresRegistre f={f} />

      {erreur && <p className="erreur">{erreur}</p>}
      {erreurTO && <p className="erreur">TO : {erreurTO}</p>}
      {erreurExport && <p className="erreur">Export PDF : {erreurExport}</p>}
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

      <div className="liste-mc liste-registre">
        {semaines.map((semaine) => (
          <div key={semaine.cle}>
            <div className="titre-semaine-registre">
              Semaine {numeroSemaine(semaine.debut)} — {libelleSemaine(semaine.debut)}
            </div>
            {semaine.jours.map((jour) => (
              <div key={jour.cle}>
                <div className="titre-jour-mc">{titreJournee(jour.date)}</div>
                <table className="tableau-mc tableau-registre">
                  <ColgroupRegistre colonnes={colonnes} />
                  <tbody>
                    {jour.secours.map((s) => (
                      <tr
                        key={s.id}
                        // Rouge seulement pour une intervention à traiter (même règle que le
                        // compteur « À traiter ») : neutre pour celles d'avant le lancement.
                        className={`ligne-registre ${s.snosm_to_cree_le ? 'ligne-traitee-registre' : estATraiter(s) ? 'ligne-a-traiter-registre' : ''}`}
                        onClick={() => setFicheId(s.id)}
                      >
                        <td>
                          <span className="numero-mc" style={{ color: STATUTS[s.statut]?.couleur }}>
                            n°{s.local_id}
                          </span>
                          <div className="cellule-sous-registre">{formatHeure(s.created_at)}</div>
                        </td>
                        {fSections.multiple && (
                          <td>
                            <span className="badge-section" style={{ background: couleurSection(s.squad_code) }} />
                            {nomDeSection.get(groupeDe(s.squad_code)) ?? s.squad_code}
                          </td>
                        )}
                        <td>{origineDe(s) || '—'}</td>
                        <td>
                          <div className="cellule-principale-registre">{sansCodePostal(s.com) || '—'}</div>
                          {s.massif && <div className="cellule-sous-registre">{s.massif}</div>}
                        </td>
                        <td>{s.lieu || '—'}</td>
                        <td>
                          <div className="cellule-principale-registre cellule-activite-registre">{s.activity || '—'}</div>
                          {motifDe(s) && <div className="cellule-sous-registre">{motifDe(s)}</div>}
                        </td>
                        <td>
                          {etatsMedicauxDe(s).length > 0
                            ? etatsMedicauxDe(s).map((e, i) => <div key={i}>{e}</div>)
                            : '—'}
                        </td>
                        <td>{pathologiesDe(s) || '—'}</td>
                        <td>
                          {libelleMoyens(s) || '—'}
                          {/* Régulation alerte (demandé le 04/11/2026) : aucun moyen CRS engagé, la
                              décision (pas de moyens, SDIS…) est le texte juste au-dessus. */}
                          {estRegulation(s) ? (
                            <span className="pastille-med-registre pastille-regulation-registre">RÉGULATION</span>
                          ) : s.is_med ? (
                            <span className="pastille-med-registre">MED</span>
                          ) : (
                            avecMoyenEngage(s) && (
                              <span className="pastille-med-registre pastille-non-med-registre">NON MED</span>
                            )
                          )}
                        </td>
                        <td>{(s.team ?? []).map(nomSeul).join(', ') || '—'}</td>
                        <td>
                          <button
                            type="button"
                            className="bouton-secondaire bouton-to-registre"
                            onClick={(e) => telechargerTO(s, e)}
                            disabled={genererTOId === s.id}
                            aria-label={s.snosm_to_cree_le ? 'Télécharger le TO' : 'Créer le TO'}
                          >
                            {genererTOId === s.id ? (
                              '…'
                            ) : (
                              <>
                                {s.snosm_to_cree_le && (
                                  <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
                                    <path
                                      d="M8 1.8v7.6M8 9.4 5 6.4M8 9.4l3-3"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="1.4"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                    />
                                    <path
                                      d="M2.5 11.7v1.6a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-1.6"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="1.4"
                                      strokeLinecap="round"
                                    />
                                  </svg>
                                )}
                                TO
                              </>
                            )}
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
