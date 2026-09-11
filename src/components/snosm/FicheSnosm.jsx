import { useState } from 'react'
import { ChampSnosm, ChampCheckbox } from './ChampsSnosm'
import {
  OPTIONS_ENCADREMENT,
  OPTIONS_DIPLOME_ENCADRANT,
  OPTIONS_TYPE_DOMAINE,
  OPTIONS_LOCALISATION_PISTE,
  OPTIONS_NEIGE,
  OPTIONS_NATURE_OPERATION,
  OPTIONS_METEO,
  OPTIONS_ETAT_MEDICAL,
  OPTIONS_LOCALISATION_BLESSURE,
  OPTIONS_TYPE_BLESSURE,
  OPTIONS_CIRCONSTANCES_VICTIME,
  OPTIONS_HELICOPTERES,
  OPTIONS_TYPE_INTERVENTION,
  OPTIONS_ORIGINE_ALERTE,
  OPTIONS_ACTIVITE,
} from '../../lib/optionsSnosm'
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

/**
 * Les 7 onglets SNOSM sont les seuls onglets de la fiche — pas d'onglet
 * "Infos"/"Victimes" séparé : les champs déjà connus via Cim'Alerte (lieu,
 * requérant, équipe engagée, description…) sont fondus directement dans les
 * groupes SNOSM correspondants (Général/Localisation, Moyens engagés,
 * Intervention), pour ne consulter qu'un seul endroit plutôt que de
 * dupliquer la même information sous deux formes.
 */
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
      { cle: 'snosm_origine_alerte', label: 'Origine de l’alerte', type: 'liste', options: OPTIONS_ORIGINE_ALERTE },
      { cle: 'snosm_origine_alerte_autre', label: 'Origine — précision si « Autre »' },
      { cle: 'alert_le_affichage', label: 'Alerte', type: 'lecture' },
      { cle: 'snosm_depart_le', label: 'Départ', type: 'datetime' },
      { cle: 'snosm_arrivee_lieux_le', label: 'Sur les lieux', type: 'datetime' },
      { cle: 'snosm_fin_operation_le', label: 'Fin d’opération', type: 'datetime' },
    ],
  },
  {
    titre: 'Localisation',
    champs: [
      { cle: 'massif', label: 'Massif' },
      { cle: 'com', label: 'Commune' },
      { cle: 'lieu', label: 'Lieu' },
      { cle: 'county', label: 'Département' },
      { cle: 'snosm_nature_operation', label: 'Nature de l’opération', type: 'liste', options: OPTIONS_NATURE_OPERATION },
      { cle: 'activity', label: 'Nature de l’activité', type: 'liste-si-vide', options: OPTIONS_ACTIVITE },
      { cle: 'alt', label: 'Altitude (m)' },
      { cle: 'snosm_meteo', label: 'Météo', type: 'liste', options: OPTIONS_METEO },
    ],
  },
  {
    titre: 'Domaine',
    champs: [
      { cle: 'snosm_type_domaine', label: 'Type de domaine', type: 'liste', options: OPTIONS_TYPE_DOMAINE },
      { cle: 'snosm_encadrement', label: 'Encadrement', type: 'liste', options: OPTIONS_ENCADREMENT },
      { cle: 'snosm_diplome_encadrant', label: 'Diplôme encadrant', type: 'liste', options: OPTIONS_DIPLOME_ENCADRANT },
      { cle: 'snosm_localisation_piste', label: 'Localisation piste', type: 'liste', options: OPTIONS_LOCALISATION_PISTE },
      { cle: 'snosm_neige', label: 'Neige', type: 'liste', options: OPTIONS_NEIGE },
    ],
  },
]

const GROUPES_MOYENS = [
  {
    titre: 'Opération',
    champs: [
      { cle: 'snosm_type_operation_moyens', label: 'Opération (héliportée / terrestre / mixte)' },
      { cle: 'snosm_ppsm', label: 'PPSM(s)' },
      { cle: 'helicopter', label: 'Hélicoptère', type: 'liste-si-vide', options: OPTIONS_HELICOPTERES },
      { cle: 'snosm_helicopteres', label: 'Hélicoptère(s)', type: 'liste', options: OPTIONS_HELICOPTERES },
      { cle: 'type_intervention', label: 'Type d’intervention', type: 'liste-si-vide', options: OPTIONS_TYPE_INTERVENTION },
      { cle: 'support_units', label: 'Unités en soutien' },
      { cle: 'snosm_medicalisation', label: 'Médicalisation' },
      { cle: 'is_med', label: 'Médicalisée', type: 'checkbox' },
      { cle: 'infirmier', label: 'Infirmier', type: 'checkbox' },
      { cle: 'snosm_equipes_cynophiles_crs', label: 'Équipe(s) cynophile(s) CRS', type: 'nombre' },
      { cle: 'snosm_emploi_heli_saf', label: 'Emploi hélicoptère du SAF justifié par', type: 'texte-long' },
    ],
  },
]

const GROUPES_INTERVENTION = [
  {
    titre: 'Compte rendu',
    champs: [
      { cle: 'description', label: 'Circonstances / description', type: 'texte-long' },
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

/** Déjà connu via Cim'Alerte — toujours en lecture seule ici, pas de double saisie. */
const CHAMPS_IMPLIQUE_BASE = [
  { cle: 'sexe', label: 'Sexe' },
  { cle: 'age', label: 'Âge' },
  { cle: 'pathologie', label: 'Pathologie' },
  { cle: 'circonstances', label: 'Circonstances' },
  { cle: 'cinetique', label: 'Cinétique' },
  { cle: 'douleur', label: 'Douleur (/10)' },
]

const CHAMPS_IMPLIQUE = [
  { cle: 'snosm_statut', label: 'Statut (victime / témoin / encadrant)' },
  { cle: 'snosm_etat_medical', label: 'État médical', type: 'liste', options: OPTIONS_ETAT_MEDICAL },
  { cle: 'snosm_lieu_naissance', label: 'Lieu de naissance' },
  { cle: 'snosm_profession', label: 'Profession' },
  { cle: 'snosm_demeurant', label: 'Demeurant', type: 'texte-long' },
  { cle: 'snosm_localisation_blessure', label: 'Localisation blessure', type: 'liste', options: OPTIONS_LOCALISATION_BLESSURE },
  { cle: 'snosm_type_blessure', label: 'Type de blessure', type: 'liste', options: OPTIONS_TYPE_BLESSURE },
  { cle: 'snosm_commune', label: 'Commune' },
  { cle: 'snosm_pays', label: 'Pays' },
  { cle: 'snosm_circonstances_liste', label: 'Circonstances', type: 'liste', options: OPTIONS_CIRCONSTANCES_VICTIME },
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

const formatAlerteLe = (iso) =>
  iso ? new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''

function brouillonFicheDepuis(fiche) {
  const bf = {}
  for (const g of TOUS_GROUPES_INTERVENTION) for (const c of g.champs) bf[c.cle] = fiche[c.cle] ?? valeurInitiale(c.type)
  for (const c of CHAMPS_AVALANCHE_EVENEMENT) bf[c.cle] = fiche[c.cle] ?? valeurInitiale(c.type)
  bf.snosm_avalanche = Boolean(fiche.snosm_avalanche)
  // Le n° de texte SNOSM est le n° d'intervention Cim'Alerte — prérempli s'il n'a pas déjà été saisi.
  if (!bf.snosm_numero_texte && fiche.local_id) bf.snosm_numero_texte = String(fiche.local_id)
  // Départ/Sur les lieux/Fin d'opération : préremplis depuis les statuts terrain horodatés de la
  // main courante Cim'Alerte (premier DEPART/ASL/FIN), modifiables ensuite comme n'importe quel champ.
  if (!bf.snosm_depart_le && fiche.depart_le) bf.snosm_depart_le = fiche.depart_le
  if (!bf.snosm_arrivee_lieux_le && fiche.arrivee_le) bf.snosm_arrivee_lieux_le = fiche.arrivee_le
  if (!bf.snosm_fin_operation_le && fiche.fin_le) bf.snosm_fin_operation_le = fiche.fin_le
  // Heure d'alerte Cim'Alerte, affichée à côté de Départ/Sur les lieux/Fin d'opération — lecture seule, déjà fixée à la prise d'appel.
  bf.alert_le_affichage = formatAlerteLe(fiche.created_at)
  return bf
}

function brouillonVictimesDepuis(fiche) {
  const bv = {}
  for (const v of fiche.victimes ?? []) {
    bv[v.id] = {}
    for (const c of [...CHAMPS_IMPLIQUE, ...CHAMPS_AVALANCHE_VICTIME]) bv[v.id][c.cle] = v[c.cle] ?? valeurInitiale(c.type)
  }
  return bv
}

/**
 * Corps entier de la fiche d'intervention — les 7 onglets du formulaire
 * IFSM réel (voir les captures fournies) sont les seuls onglets, plus de
 * niveau "Infos/Victimes/SNOSM" séparé : les champs déjà connus via
 * Cim'Alerte sont fondus directement dans les groupes SNOSM concernés.
 * Édition en bloc, TOUJOURS active tant que le télégramme officiel n'est
 * pas parti — pas de bouton "Modifier" à chercher, pas de sous-onglet à
 * valider avant de passer au suivant : on ouvre la fiche et on rédige,
 * "Enregistrer" écrit d'un coup les champs d'intervention ET ceux de
 * chaque victime modifiée. L'effectif CRS engagé (répétable) reste éditable
 * indépendamment — chaque ligne s'enregistre elle-même.
 */
export default function FicheSnosm({ fiche, codesRequete, onFicheMaj, sectionNom }) {
  const [sousOnglet, setSousOnglet] = useState('general')
  const verrouillee = Boolean(fiche.toEnvoyeLe)
  const [edition, setEdition] = useState(!verrouillee)
  const [brouillonFiche, setBrouillonFiche] = useState(() => (verrouillee ? null : brouillonFicheDepuis(fiche)))
  const [brouillonVictimes, setBrouillonVictimes] = useState(() => (verrouillee ? null : brouillonVictimesDepuis(fiche)))
  const [enregistrement, setEnregistrement] = useState(false)
  const [erreur, setErreur] = useState(null)
  const [effectifs, setEffectifs] = useState(fiche.effectifs_engages ?? [])
  const [generationTO, setGenerationTO] = useState(false)

  function demarrerEdition() {
    setBrouillonFiche(brouillonFicheDepuis(fiche))
    setBrouillonVictimes(brouillonVictimesDepuis(fiche))
    setEdition(true)
    setErreur(null)
  }

  /** Abandonne les modifications non enregistrées — reste en rédaction, juste réinitialisée sur les dernières valeurs connues. */
  function annulerEdition() {
    setBrouillonFiche(brouillonFicheDepuis(fiche))
    setBrouillonVictimes(brouillonVictimesDepuis(fiche))
    setErreur(null)
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
        <div className="actions-entete-snosm">
          {!edition && !verrouillee && (
            <button type="button" className="bouton-secondaire" onClick={demarrerEdition}>
              Modifier
            </button>
          )}
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
            {o.cle === 'implique' && fiche.victimes?.length > 0 && ` (${fiche.victimes.length})`}
          </button>
        ))}
      </div>

      <div className="corps-sous-onglet-snosm">
        {sousOnglet === 'general' && (edition ? <BlocChamps groupes={GROUPES_GENERAL} brouillon={brouillonFiche} majChamp={majChampFiche} /> : <LectureGroupes groupes={GROUPES_GENERAL} fiche={fiche} />)}

        {sousOnglet === 'moyens' && (
          <>
            {edition ? <BlocChamps groupes={GROUPES_MOYENS} brouillon={brouillonFiche} majChamp={majChampFiche} /> : <LectureGroupes groupes={GROUPES_MOYENS} fiche={fiche} />}
            <div className="section-fiche">
              <h4>Équipe (Cim’Alerte)</h4>
              <div className="grille-details-fiche">
                <Detail label="Équipe engagée">{fiche.team?.length > 0 ? fiche.team.join(', ') : '—'}</Detail>
                <Detail label="Moyens engagés (brut)">{fiche.moyens_engages || '—'}</Detail>
              </div>
            </div>
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
                <div className="grille-details-fiche" style={{ marginTop: 8 }}>
                  <ChampsLecture champs={CHAMPS_IMPLIQUE_BASE} source={v} />
                </div>
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

      <div className="actions-edition-fiche">
        {edition && (
          <>
            <button type="button" className="bouton-secondaire" onClick={annulerEdition} disabled={enregistrement}>
              Annuler
            </button>
            <button type="button" className="bouton-principal" onClick={enregistrer} disabled={enregistrement}>
              {enregistrement ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </>
        )}
        <button type="button" className="bouton-principal" onClick={genererTO} disabled={generationTO}>
          {generationTO ? '…' : 'TO'}
        </button>
      </div>
    </div>
  )
}

/** Toujours affiché, même vide (« — ») — un onglet pas encore rempli doit montrer ses champs, pas disparaître. */
function ChampsLecture({ champs, source }) {
  return champs.map((c) => {
    const valeur = source[c.cle]
    // "[]" : jsonb vide côté Cim'Alerte, sérialisé en texte tel quel par Grist — pas une vraie valeur.
    const vide = valeur == null || valeur === '' || valeur === '[]'
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
