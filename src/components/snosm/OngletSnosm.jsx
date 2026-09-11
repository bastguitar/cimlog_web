import { useState } from 'react'
import { ChampSnosm, ChampCheckbox } from './ChampsSnosm'
import {
  modifierIntervention,
  modifierVictime,
  ajouterEffectifEngage,
  modifierEffectifEngage,
  supprimerEffectifEngage,
  listerEffectifsEngages,
  formatIdentiteVictime,
} from '../../lib/registre'
import { telechargerTelegrammeTO } from '../../lib/telegrammeTO'

const SOUS_ONGLETS = [
  { cle: 'general', label: 'Général' },
  { cle: 'moyens', label: 'Moyens engagés' },
  { cle: 'intervention', label: 'Intervention' },
  { cle: 'renfort', label: 'Renfort' },
  { cle: 'implique', label: 'Impliqué' },
  { cle: 'avis', label: 'Avis' },
  { cle: 'avalanche', label: 'Avalanche' },
]

const GROUPES_GENERAL = [
  {
    titre: 'Alerte',
    champs: [
      { cle: 'snosm_numero_texte', label: 'N° de texte' },
      { cle: 'snosm_origine_alerte', label: 'Origine de l’alerte' },
      { cle: 'snosm_origine_alerte_autre', label: 'Origine — précision si « Autre »' },
      { cle: 'snosm_depart_le', label: 'Départ', type: 'datetime' },
      { cle: 'snosm_arrivee_lieux_le', label: 'Sur les lieux', type: 'datetime' },
      { cle: 'snosm_fin_operation_le', label: 'Fin d’opération', type: 'datetime' },
    ],
  },
  {
    titre: 'Domaine',
    champs: [
      { cle: 'snosm_type_domaine', label: 'Type de domaine' },
      { cle: 'snosm_encadrement', label: 'Encadrement' },
      { cle: 'snosm_diplome_encadrant', label: 'Diplôme encadrant' },
      { cle: 'snosm_localisation_piste', label: 'Localisation piste' },
      { cle: 'snosm_neige', label: 'Neige' },
    ],
  },
]

const GROUPES_MOYENS = [
  {
    titre: 'Opération',
    champs: [
      { cle: 'snosm_type_operation_moyens', label: 'Opération (héliportée / terrestre / mixte)' },
      { cle: 'snosm_ppsm', label: 'PPSM(s)' },
      { cle: 'snosm_helicopteres', label: 'Hélicoptère(s)' },
      { cle: 'snosm_medicalisation', label: 'Médicalisation' },
      { cle: 'snosm_equipes_cynophiles_crs', label: 'Équipe(s) cynophile(s) CRS', type: 'nombre' },
      { cle: 'snosm_emploi_heli_saf', label: 'Emploi hélicoptère du SAF justifié par', type: 'texte-long' },
    ],
  },
]

const GROUPES_INTERVENTION = [
  {
    titre: 'Compte rendu',
    champs: [
      { cle: 'snosm_gestes_secourisme', label: 'Geste(s) de secourisme effectué(s)', type: 'texte-long' },
      { cle: 'snosm_techniques_evacuation', label: 'Technique(s) d’évacuation mise(s) en œuvre', type: 'texte-long' },
    ],
  },
]

const GROUPES_RENFORT = [
  {
    titre: 'Renfort',
    champs: [
      { cle: 'snosm_renfort_gendarmes', label: 'Gendarmerie(s)', type: 'nombre' },
      { cle: 'snosm_renfort_pompiers', label: 'Pompier(s)', type: 'nombre' },
      { cle: 'snosm_renfort_pisteurs', label: 'Pisteur(s)', type: 'nombre' },
      { cle: 'snosm_renfort_medecins', label: 'Médecin(s)', type: 'nombre' },
      { cle: 'snosm_renfort_autres', label: 'Autres personnes', type: 'nombre' },
    ],
  },
  {
    titre: 'Équipes cynophiles',
    champs: [
      { cle: 'snosm_equipes_cynophiles_civiles', label: 'Civiles', type: 'nombre' },
      { cle: 'snosm_equipes_cynophiles_gendarmerie', label: 'Gendarmerie', type: 'nombre' },
      { cle: 'snosm_equipes_cynophiles_pompiers', label: 'Pompiers', type: 'nombre' },
      { cle: 'snosm_equipes_cynophiles_pisteurs', label: 'Pisteurs', type: 'nombre' },
    ],
  },
]

const GROUPES_AVIS = [
  {
    titre: 'Procédure judiciaire',
    champs: [
      { cle: 'snosm_suivi_judiciaire', label: 'Suivi judiciaire' },
      { cle: 'snosm_directeur_enquete', label: 'Directeur d’enquête CRS' },
      { cle: 'snosm_autre_service_enquete', label: 'Autre service directeur d’enquête' },
    ],
  },
  {
    titre: 'Autorités et médias',
    champs: [
      { cle: 'snosm_autorites_avisees', label: 'Autorités avisée(s)', type: 'texte-long' },
      { cle: 'snosm_medias_informes', label: 'Médias informés' },
      { cle: 'snosm_avis_divers', label: 'Avis divers', type: 'texte-long' },
    ],
  },
  {
    titre: 'Rédaction',
    champs: [
      { cle: 'snosm_redacteur', label: 'Rédacteur' },
      { cle: 'snosm_signataire', label: 'Signataire' },
    ],
  },
]

const CHAMPS_AVALANCHE_EVENEMENT = [
  { cle: 'snosm_avalanche_type', label: 'Type d’avalanche' },
  { cle: 'snosm_avalanche_taille', label: 'Taille d’avalanche' },
  { cle: 'snosm_avalanche_niveau_risque', label: 'Niveau de risque' },
  { cle: 'snosm_avalanche_declenchement_le', label: 'Déclenchement', type: 'datetime' },
  { cle: 'snosm_avalanche_point_depart_gps', label: 'Point de départ (GPS)' },
  { cle: 'snosm_avalanche_longueur', label: 'Longueur (m)', type: 'nombre' },
  { cle: 'snosm_avalanche_largeur_cassure', label: 'Largeur cassure (m)', type: 'nombre' },
  { cle: 'snosm_avalanche_hauteur_cassure', label: 'Hauteur cassure (cm)', type: 'nombre' },
  { cle: 'snosm_avalanche_largeur_depot', label: 'Largeur dépôt (cm)', type: 'nombre' },
  { cle: 'snosm_avalanche_altitude', label: 'Altitude (m)', type: 'nombre' },
  { cle: 'snosm_avalanche_pente', label: 'Pente' },
  { cle: 'snosm_avalanche_denivele', label: 'Dénivelé total (m)', type: 'nombre' },
  { cle: 'snosm_avalanche_orientation', label: 'Orientation' },
  { cle: 'snosm_avalanche_nb_impliques', label: 'Nombre d’impliqués', type: 'nombre' },
  { cle: 'snosm_avalanche_nb_victimes', label: 'Nombre de victimes', type: 'nombre' },
  { cle: 'snosm_avalanche_nb_blesses', label: 'Nombre de blessés', type: 'nombre' },
  { cle: 'snosm_avalanche_nb_indemnes', label: 'Nombre d’indemnes', type: 'nombre' },
  { cle: 'snosm_avalanche_nb_decedes', label: 'Nombre de décédés', type: 'nombre' },
]

const CHAMPS_IMPLIQUE = [
  { cle: 'snosm_statut', label: 'Statut (victime / témoin / encadrant)' },
  { cle: 'snosm_etat_medical', label: 'État médical' },
  { cle: 'snosm_lieu_naissance', label: 'Lieu de naissance' },
  { cle: 'snosm_profession', label: 'Profession' },
  { cle: 'snosm_demeurant', label: 'Demeurant', type: 'texte-long' },
  { cle: 'snosm_localisation_blessure', label: 'Localisation blessure' },
  { cle: 'snosm_type_blessure', label: 'Type de blessure' },
  { cle: 'snosm_commune', label: 'Commune' },
  { cle: 'snosm_pays', label: 'Pays' },
  { cle: 'snosm_circonstances_liste', label: 'Circonstances' },
  { cle: 'snosm_destination', label: 'Destination' },
  { cle: 'snosm_fin_prise_en_charge_le', label: 'Heure fin de prise en charge', type: 'datetime' },
]

const CHAMPS_AVALANCHE_VICTIME = [
  { cle: 'snosm_avalanche_moyens_localisation', label: 'Moyens de localisation' },
  { cle: 'snosm_avalanche_distance_m', label: 'Distance parcourue (m)', type: 'nombre' },
  { cle: 'snosm_avalanche_profondeur_cm', label: 'Profondeur ensevelissement (cm)', type: 'nombre' },
  { cle: 'snosm_avalanche_duree_mn', label: 'Durée ensevelissement (mn)', type: 'nombre' },
  { cle: 'snosm_avalanche_bouchon_neige', label: 'Bouchon de neige' },
  { cle: 'snosm_avalanche_poche_air', label: 'Poche d’air' },
  { cle: 'snosm_avalanche_position1', label: 'Position 1' },
  { cle: 'snosm_avalanche_position2', label: 'Position 2' },
  { cle: 'snosm_avalanche_durete_neige', label: 'Dureté neige / tête' },
  { cle: 'snosm_avalanche_obstacles', label: 'Obstacles / écoulement' },
  { cle: 'snosm_avalanche_environnement', label: 'Environnement' },
  { cle: 'snosm_avalanche_dva_present', label: 'DVA présent', type: 'checkbox' },
  { cle: 'snosm_avalanche_dva_en_marche', label: 'DVA en marche', type: 'checkbox' },
  { cle: 'snosm_avalanche_pelle', label: 'Pelle', type: 'checkbox' },
  { cle: 'snosm_avalanche_sonde', label: 'Sonde', type: 'checkbox' },
  { cle: 'snosm_avalanche_recco', label: 'RECCO', type: 'checkbox' },
  { cle: 'snosm_avalanche_sac_airbag', label: 'Sac airbag', type: 'checkbox' },
  { cle: 'snosm_avalanche_marque_modele', label: 'Marque et modèle' },
  { cle: 'snosm_avalanche_alimentation', label: 'Alimentation (cartouche / électrique)' },
  { cle: 'snosm_avalanche_gonflage', label: 'Gonflage' },
  { cle: 'snosm_avalanche_position_victime', label: 'Position sur la victime' },
  { cle: 'snosm_avalanche_sac_et_victime', label: 'Sac airbag et la victime' },
]

const TOUS_GROUPES_INTERVENTION = [...GROUPES_GENERAL, ...GROUPES_MOYENS, ...GROUPES_INTERVENTION, ...GROUPES_RENFORT, ...GROUPES_AVIS]

function valeurInitiale(type) {
  if (type === 'checkbox') return false
  if (type === 'nombre') return 0
  return ''
}

function BlocChamps({ groupes, brouillon, majChamp }) {
  return groupes.map((groupe) => (
    <div className="section-fiche" key={groupe.titre}>
      <h4>{groupe.titre}</h4>
      <div className="grille-details-fiche">
        {groupe.champs.map((c) => (
          <ChampSnosm key={c.cle} description={c} valeur={brouillon[c.cle]} onChange={(v) => majChamp(c.cle, v)} />
        ))}
      </div>
    </div>
  ))
}

/**
 * Onglet SNOSM — 7 sous-onglets sur le modèle du formulaire IFSM réel (voir
 * les captures fournies). Édition en bloc (comme l'onglet Infos) : un
 * "Modifier" ouvre tous les sous-onglets en édition à la fois, un seul
 * "Enregistrer" écrit les champs d'intervention ET ceux de chaque victime
 * modifiée. L'effectif CRS engagé (répétable, pas encore connu à l'ouverture
 * de la fiche) reste éditable indépendamment — chaque ligne s'enregistre
 * elle-même, pas besoin d'attendre le bouton Enregistrer général.
 */
export default function OngletSnosm({ fiche, codesRequete, onFicheMaj, sectionNom }) {
  const [sousOnglet, setSousOnglet] = useState('general')
  const [edition, setEdition] = useState(false)
  const [brouillonFiche, setBrouillonFiche] = useState(null)
  const [brouillonVictimes, setBrouillonVictimes] = useState(null)
  const [enregistrement, setEnregistrement] = useState(false)
  const [erreur, setErreur] = useState(null)
  const [effectifs, setEffectifs] = useState(fiche.effectifs_engages ?? [])
  const [generationTO, setGenerationTO] = useState(false)

  const verrouillee = Boolean(fiche.toEnvoyeLe)

  function demarrerEdition() {
    const bf = {}
    for (const g of TOUS_GROUPES_INTERVENTION) for (const c of g.champs) bf[c.cle] = fiche[c.cle] ?? valeurInitiale(c.type)
    for (const c of CHAMPS_AVALANCHE_EVENEMENT) bf[c.cle] = fiche[c.cle] ?? valeurInitiale(c.type)
    bf.snosm_avalanche = Boolean(fiche.snosm_avalanche)
    setBrouillonFiche(bf)

    const bv = {}
    for (const v of fiche.victimes ?? []) {
      bv[v.id] = {}
      for (const c of [...CHAMPS_IMPLIQUE, ...CHAMPS_AVALANCHE_VICTIME]) bv[v.id][c.cle] = v[c.cle] ?? valeurInitiale(c.type)
    }
    setBrouillonVictimes(bv)
    setEdition(true)
    setErreur(null)
  }

  function annulerEdition() {
    setEdition(false)
    setBrouillonFiche(null)
    setBrouillonVictimes(null)
  }

  function majChampFiche(cle, valeur) {
    setBrouillonFiche((b) => ({ ...b, [cle]: valeur }))
  }

  function majChampVictime(victimeId, cle, valeur) {
    setBrouillonVictimes((b) => ({ ...b, [victimeId]: { ...b[victimeId], [cle]: valeur } }))
  }

  async function enregistrer() {
    setEnregistrement(true)
    try {
      const champsFiche = {}
      for (const [cle, valeur] of Object.entries(brouillonFiche)) {
        if (valeur !== (fiche[cle] ?? (typeof valeur === 'boolean' ? false : typeof valeur === 'number' ? 0 : '')))
          champsFiche[cle] = valeur
      }
      if (Object.keys(champsFiche).length > 0) await modifierIntervention(fiche.id, codesRequete, champsFiche)

      const victimesMaj = []
      for (const v of fiche.victimes ?? []) {
        const bv = brouillonVictimes[v.id] ?? {}
        const champsV = {}
        for (const [cle, valeur] of Object.entries(bv)) {
          if (valeur !== (v[cle] ?? (typeof valeur === 'boolean' ? false : typeof valeur === 'number' ? 0 : '')))
            champsV[cle] = valeur
        }
        if (Object.keys(champsV).length > 0) {
          await modifierVictime(v.id, fiche.id, codesRequete, champsV)
          victimesMaj.push({ id: v.id, champsV })
        }
      }

      onFicheMaj((f) => ({
        ...f,
        ...champsFiche,
        victimes: (f.victimes ?? []).map((v) => {
          const maj = victimesMaj.find((m) => m.id === v.id)
          return maj ? { ...v, ...maj.champsV } : v
        }),
      }))
      setEdition(false)
      setBrouillonFiche(null)
      setBrouillonVictimes(null)
      setErreur(null)
    } catch (e) {
      setErreur(e.message)
      if (e.codeErreur === 409) {
        setEdition(false)
        setBrouillonFiche(null)
        setBrouillonVictimes(null)
      }
    } finally {
      setEnregistrement(false)
    }
  }

  async function genererTO() {
    setGenerationTO(true)
    try {
      await telechargerTelegrammeTO(fiche, { sectionNom })
    } catch (e) {
      setErreur(e.message)
    } finally {
      setGenerationTO(false)
    }
  }

  async function rafraichirEffectifs() {
    const liste = await listerEffectifsEngages(fiche.id, codesRequete)
    setEffectifs(liste)
  }

  async function ajouterLigneEffectif() {
    try {
      await ajouterEffectifEngage(fiche.id, codesRequete, { role: '', personne: '', depassement_horaire: false, heure_depassement: null })
      await rafraichirEffectifs()
    } catch (e) {
      setErreur(e.message)
    }
  }

  async function majEffectif(id, champs) {
    try {
      await modifierEffectifEngage(id, fiche.id, codesRequete, champs)
      setEffectifs((es) => es.map((e) => (e.id === id ? { ...e, ...champs } : e)))
    } catch (e) {
      setErreur(e.message)
    }
  }

  async function supprimerLigneEffectif(id) {
    try {
      await supprimerEffectifEngage(id, fiche.id, codesRequete)
      setEffectifs((es) => es.filter((e) => e.id !== id))
    } catch (e) {
      setErreur(e.message)
    }
  }

  return (
    <div className="onglet-snosm-racine">
      <div className="entete-snosm">
        <p className="aide">Brouillon pré-rempli avec ce que Cim’Alerte connaît déjà ; les menus déroulants sont en texte libre pour l’instant.</p>
        <div className="actions-entete-snosm">
          {!edition && !verrouillee && (
            <button type="button" className="bouton-secondaire" onClick={demarrerEdition}>
              Modifier
            </button>
          )}
          <button type="button" className="bouton-principal" onClick={genererTO} disabled={generationTO}>
            {generationTO ? 'Génération…' : 'Télécharger le TO (brouillon)'}
          </button>
        </div>
      </div>

      {erreur && <p className="erreur">{erreur}</p>}

      <div className="sous-onglets-snosm">
        {SOUS_ONGLETS.map((o) => (
          <button
            key={o.cle}
            type="button"
            className={sousOnglet === o.cle ? 'onglet-fiche actif' : 'onglet-fiche'}
            onClick={() => setSousOnglet(o.cle)}
          >
            {o.label}
          </button>
        ))}
      </div>

      <div className="corps-sous-onglet-snosm">
        {sousOnglet === 'general' && (edition ? <BlocChamps groupes={GROUPES_GENERAL} brouillon={brouillonFiche} majChamp={majChampFiche} /> : <LectureGroupes groupes={GROUPES_GENERAL} fiche={fiche} />)}

        {sousOnglet === 'moyens' && (
          <>
            {edition ? <BlocChamps groupes={GROUPES_MOYENS} brouillon={brouillonFiche} majChamp={majChampFiche} /> : <LectureGroupes groupes={GROUPES_MOYENS} fiche={fiche} />}
            <div className="section-fiche">
              <h4>Effectif CRS engagé</h4>
              <TableauEffectifs
                effectifs={effectifs}
                verrouillee={verrouillee}
                onAjouter={ajouterLigneEffectif}
                onMaj={majEffectif}
                onSupprimer={supprimerLigneEffectif}
              />
            </div>
          </>
        )}

        {sousOnglet === 'intervention' &&
          (edition ? <BlocChamps groupes={GROUPES_INTERVENTION} brouillon={brouillonFiche} majChamp={majChampFiche} /> : <LectureGroupes groupes={GROUPES_INTERVENTION} fiche={fiche} />)}

        {sousOnglet === 'renfort' &&
          (edition ? <BlocChamps groupes={GROUPES_RENFORT} brouillon={brouillonFiche} majChamp={majChampFiche} /> : <LectureGroupes groupes={GROUPES_RENFORT} fiche={fiche} />)}

        {sousOnglet === 'avis' && (edition ? <BlocChamps groupes={GROUPES_AVIS} brouillon={brouillonFiche} majChamp={majChampFiche} /> : <LectureGroupes groupes={GROUPES_AVIS} fiche={fiche} />)}

        {sousOnglet === 'avalanche' && (
          <div className="section-fiche">
            <h4>Avalanche</h4>
            {edition ? (
              <>
                <ChampCheckbox label="Avalanche" valeur={brouillonFiche.snosm_avalanche} onChange={(v) => majChampFiche('snosm_avalanche', v)} />
                {brouillonFiche.snosm_avalanche && (
                  <div className="grille-details-fiche" style={{ marginTop: 10 }}>
                    {CHAMPS_AVALANCHE_EVENEMENT.map((c) => (
                      <ChampSnosm key={c.cle} description={c} valeur={brouillonFiche[c.cle]} onChange={(v) => majChampFiche(c.cle, v)} />
                    ))}
                  </div>
                )}
              </>
            ) : fiche.snosm_avalanche ? (
              <div className="grille-details-fiche">
                <ChampsLecture champs={CHAMPS_AVALANCHE_EVENEMENT} source={fiche} />
              </div>
            ) : (
              <p className="aide">Pas d’avalanche renseignée pour cette intervention.</p>
            )}
          </div>
        )}

        {sousOnglet === 'implique' && (
          <>
            {(fiche.victimes ?? []).length === 0 && <p className="aide">Aucune victime enregistrée.</p>}
            {(fiche.victimes ?? []).map((v) => (
              <div className="carte-victime" key={v.id}>
                <strong>
                  Victime {v.local_id ?? ''} — {formatIdentiteVictime(v) || 'identité non renseignée'}
                </strong>
                {edition ? (
                  <>
                    <div className="grille-details-fiche" style={{ marginTop: 8 }}>
                      {CHAMPS_IMPLIQUE.map((c) => (
                        <ChampSnosm key={c.cle} description={c} valeur={brouillonVictimes[v.id]?.[c.cle]} onChange={(val) => majChampVictime(v.id, c.cle, val)} />
                      ))}
                    </div>
                    {brouillonFiche.snosm_avalanche && (
                      <>
                        <h4 style={{ marginTop: 12 }}>Avalanche — cette victime</h4>
                        <div className="grille-details-fiche">
                          {CHAMPS_AVALANCHE_VICTIME.map((c) => (
                            <ChampSnosm key={c.cle} description={c} valeur={brouillonVictimes[v.id]?.[c.cle]} onChange={(val) => majChampVictime(v.id, c.cle, val)} />
                          ))}
                        </div>
                      </>
                    )}
                  </>
                ) : (
                  <div className="grille-details-fiche" style={{ marginTop: 8 }}>
                    <ChampsLecture champs={CHAMPS_IMPLIQUE} source={v} />
                    {fiche.snosm_avalanche && <ChampsLecture champs={CHAMPS_AVALANCHE_VICTIME} source={v} />}
                  </div>
                )}
              </div>
            ))}
          </>
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
    </div>
  )
}

/** Toujours affiché, même vide (« — ») — un onglet pas encore rempli doit montrer ses champs, pas disparaître. */
function ChampsLecture({ champs, source }) {
  return champs.map((c) => {
    const valeur = source[c.cle]
    const vide = valeur == null || valeur === ''
    return (
      <Detail key={c.cle} label={c.label}>
        {c.type === 'checkbox' ? (valeur ? 'Oui' : 'Non') : vide ? '—' : String(valeur)}
      </Detail>
    )
  })
}

function LectureGroupes({ groupes, fiche }) {
  return groupes.map((groupe) => (
    <div className="section-fiche" key={groupe.titre}>
      <h4>{groupe.titre}</h4>
      <div className="grille-details-fiche">
        <ChampsLecture champs={groupe.champs} source={fiche} />
      </div>
    </div>
  ))
}

function Detail({ label, children }) {
  return (
    <div className="detail-fiche">
      <span className="etiquette-detail-fiche">{label}</span>
      <span>{children}</span>
    </div>
  )
}

function TableauEffectifs({ effectifs, verrouillee, onAjouter, onMaj, onSupprimer }) {
  return (
    <div className="tableau-effectifs-snosm">
      {effectifs.length === 0 && <p className="aide">Aucun effectif renseigné.</p>}
      {effectifs.map((e) => (
        <LigneEffectif key={e.id} effectif={e} verrouillee={verrouillee} onMaj={onMaj} onSupprimer={onSupprimer} />
      ))}
      {!verrouillee && (
        <button type="button" className="bouton-secondaire" onClick={onAjouter}>
          + Ajouter un effectif
        </button>
      )}
    </div>
  )
}

function LigneEffectif({ effectif, verrouillee, onMaj, onSupprimer }) {
  const [role, setRole] = useState(effectif.role ?? '')
  const [personne, setPersonne] = useState(effectif.personne ?? '')

  return (
    <div className="ligne-effectif-snosm">
      <input
        type="text"
        placeholder="Rôle (secouriste, téléphoniste, COS…)"
        value={role}
        disabled={verrouillee}
        onChange={(e) => setRole(e.target.value)}
        onBlur={() => role !== effectif.role && onMaj(effectif.id, { role })}
      />
      <input
        type="text"
        placeholder="Personne"
        value={personne}
        disabled={verrouillee}
        onChange={(e) => setPersonne(e.target.value)}
        onBlur={() => personne !== effectif.personne && onMaj(effectif.id, { personne })}
      />
      <label className="champ-checkbox-snosm">
        <input
          type="checkbox"
          checked={Boolean(effectif.depassement_horaire)}
          disabled={verrouillee}
          onChange={(e) => onMaj(effectif.id, { depassement_horaire: e.target.checked })}
        />
        Dépassement horaire
      </label>
      {!verrouillee && (
        <button type="button" className="fermer-modale" onClick={() => onSupprimer(effectif.id)} aria-label="Supprimer cet effectif">
          ×
        </button>
      )}
    </div>
  )
}
