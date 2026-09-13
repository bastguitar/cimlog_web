import { useEffect, useState } from 'react'
import { chargerTousSecouristes } from '../../lib/annuaire'
import { effectifsDuJour } from '../../lib/effectifsDuJour'
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
  OPTIONS_PPSM,
  OPTIONS_MEDICALISATION,
  OPTIONS_SUIVI_JUDICIAIRE,
  OPTIONS_MEDIAS_INFORMES,
  OPTIONS_STATUT_PERSONNE,
  OPTIONS_DURETE_NEIGE,
  OPTIONS_OBSTACLES,
  OPTIONS_ENVIRONNEMENT_AVALANCHE,
  OPTIONS_OUI_NON_NE_SAIS_PAS,
  OPTIONS_GONFLAGE,
  OPTIONS_POSITION_VICTIME_AIRBAG,
  OPTIONS_SAC_ET_VICTIME,
  OPTIONS_ALIMENTATION_DVA,
  OPTIONS_TYPE_AVALANCHE,
  OPTIONS_TAILLE_AVALANCHE,
  OPTIONS_NIVEAU_RISQUE,
  OPTIONS_ORIENTATION,
  visibleSiActiviteGlisse,
  optionsLocalisationPisteSelonDomaine,
  snosmOrigineDepuis,
  ppsmDepuisSquadCode,
  snosmStatutDepuis,
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
      {
        cle: 'snosm_origine_alerte',
        label: 'Origine de l’alerte',
        type: 'radio-texte',
        options: OPTIONS_ORIGINE_ALERTE,
        champLie: 'snosm_origine_alerte_autre',
        placeholderLie: 'Précision si « Autre »',
      },
    ],
  },
  {
    titre: 'Horaires',
    champs: [
      { cle: 'snosm_alerte_le', label: 'Alerte', type: 'datetime' },
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
      { cle: 'snosm_nature_operation', label: 'Nature de l’opération', type: 'radio', options: OPTIONS_NATURE_OPERATION },
      { cle: 'activity', label: 'Nature de l’activité', type: 'liste-si-vide', options: OPTIONS_ACTIVITE },
      { cle: 'alt', label: 'Altitude (m)' },
      { cle: 'snosm_meteo', label: 'Météo', type: 'liste', options: OPTIONS_METEO },
    ],
  },
  {
    titre: 'Domaine',
    champs: [
      {
        cle: 'snosm_type_domaine',
        label: 'Type de domaine',
        type: 'repliable',
        options: OPTIONS_TYPE_DOMAINE,
        visibleSi: visibleSiActiviteGlisse,
      },
      { cle: 'snosm_encadrement', label: 'Encadrement', type: 'radio', options: OPTIONS_ENCADREMENT },
      {
        cle: 'snosm_diplome_encadrant',
        label: 'Diplôme encadrant',
        type: 'repliable',
        options: OPTIONS_DIPLOME_ENCADRANT,
        visibleSi: (bf) => bf.snosm_encadrement === 'ENCADREMENT ASSOCIATIF' || bf.snosm_encadrement === 'ENCADREMENT PROFESSIONNEL',
      },
      {
        cle: 'snosm_localisation_piste',
        label: 'Localisation piste',
        type: 'repliable',
        options: OPTIONS_LOCALISATION_PISTE,
        visibleSi: () => true,
        optionsSi: optionsLocalisationPisteSelonDomaine,
      },
      {
        cle: 'snosm_neige',
        label: 'Neige',
        type: 'repliable',
        options: OPTIONS_NEIGE,
        visibleSi: visibleSiActiviteGlisse,
      },
    ],
  },
]

// Scindé en deux : "Effectif CRS Engagé" (rendu à part, tableau répétable)
// s'intercale entre les deux sur le vrai formulaire — juste après
// Médicalisation, avant Équipe(s) cynophile(s) CRS.
const GROUPES_MOYENS_AVANT_EFFECTIF = [
  {
    titre: 'Opération',
    champs: [
      { cle: 'snosm_type_operation_moyens', label: 'Opération', type: 'radio', options: OPTIONS_TYPE_INTERVENTION },
      { cle: 'snosm_ppsm', label: 'PPSM(s)', type: 'liste', options: OPTIONS_PPSM },
      { cle: 'snosm_helicopteres', label: 'Hélicoptère(s)', type: 'liste', options: OPTIONS_HELICOPTERES },
      { cle: 'support_units', label: 'Unités en soutien' },
      { cle: 'snosm_medicalisation', label: 'Médicalisation', type: 'radio', options: OPTIONS_MEDICALISATION },
    ],
  },
]

const GROUPES_MOYENS_APRES_EFFECTIF = [
  {
    titre: '',
    champs: [
      { cle: 'snosm_equipes_cynophiles_crs', label: 'Équipe(s) cynophile(s) CRS', type: 'nombre' },
      { cle: 'snosm_emploi_heli_saf', label: 'Emploi hélicoptère du SAF justifié par', type: 'texte-long' },
    ],
  },
]

const GROUPES_MOYENS = [...GROUPES_MOYENS_AVANT_EFFECTIF, ...GROUPES_MOYENS_APRES_EFFECTIF]

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
      { cle: 'snosm_suivi_judiciaire', label: 'Suivi judiciaire', type: 'radio', options: OPTIONS_SUIVI_JUDICIAIRE },
      { cle: 'snosm_directeur_enquete', label: 'Directeur d’enquête CRS', type: 'personnel' },
      { cle: 'snosm_autre_service_enquete', label: 'Autre service directeur d’enquête' },
    ],
  },
  {
    titre: 'Autorités et médias',
    champs: [
      { cle: 'snosm_autorites_avisees', label: 'Autorités avisée(s)', type: 'texte-long' },
      { cle: 'snosm_medias_informes', label: 'Médias informés', type: 'radio', options: OPTIONS_MEDIAS_INFORMES },
      { cle: 'snosm_avis_divers', label: 'Avis divers', type: 'texte-long' },
    ],
  },
  {
    titre: 'Rédaction',
    champs: [
      { cle: 'snosm_redacteur', label: 'Rédacteur', type: 'personnel' },
      { cle: 'snosm_signataire', label: 'Signataire', type: 'personnel' },
    ],
  },
]

const CHAMPS_AVALANCHE_EVENEMENT = [
  { cle: 'snosm_avalanche_type', label: 'Type d’avalanche', type: 'radio', options: OPTIONS_TYPE_AVALANCHE },
  { cle: 'snosm_avalanche_taille', label: 'Taille d’avalanche', type: 'radio', options: OPTIONS_TAILLE_AVALANCHE },
  { cle: 'snosm_avalanche_niveau_risque', label: 'Niveau de risque', type: 'radio', options: OPTIONS_NIVEAU_RISQUE },
  { cle: 'snosm_avalanche_declenchement_le', label: 'Déclenchement', type: 'datetime' },
  { cle: 'snosm_avalanche_point_depart_gps', label: 'Point de départ (GPS)' },
  { cle: 'snosm_avalanche_longueur', label: 'Longueur (m)', type: 'nombre' },
  { cle: 'snosm_avalanche_largeur_cassure', label: 'Largeur cassure (m)', type: 'nombre' },
  { cle: 'snosm_avalanche_hauteur_cassure', label: 'Hauteur cassure (cm)', type: 'nombre' },
  { cle: 'snosm_avalanche_largeur_depot', label: 'Largeur dépôt (cm)', type: 'nombre' },
  { cle: 'snosm_avalanche_altitude', label: 'Altitude (m)', type: 'nombre' },
  { cle: 'snosm_avalanche_pente', label: 'Pente' },
  { cle: 'snosm_avalanche_denivele', label: 'Dénivelé total (m)', type: 'nombre' },
  { cle: 'snosm_avalanche_orientation', label: 'Orientation', type: 'liste', options: OPTIONS_ORIENTATION },
  { cle: 'snosm_avalanche_nb_impliques', label: 'Nombre d’impliqués', type: 'nombre' },
  { cle: 'snosm_avalanche_nb_victimes', label: 'Nombre de victimes', type: 'nombre' },
  { cle: 'snosm_avalanche_nb_blesses', label: 'Nombre de blessés', type: 'nombre' },
  { cle: 'snosm_avalanche_nb_indemnes', label: 'Nombre d’indemnes', type: 'nombre' },
  { cle: 'snosm_avalanche_nb_decedes', label: 'Nombre de décédés', type: 'nombre' },
]

/** Déjà connu via Cim'Alerte — toujours en lecture seule ici, pas de double saisie. */
const CHAMPS_IMPLIQUE_BASE = [
  { cle: 'nom', label: 'Nom' },
  { cle: 'prenom', label: 'Prénom' },
  { cle: 'date_naissance', label: 'Date de naissance' },
  { cle: 'sexe', label: 'Sexe' },
  { cle: 'nationalite', label: 'Nationalité' },
  { cle: 'telephone', label: 'Téléphone' },
  { cle: 'age', label: 'Âge' },
  { cle: 'pathologie', label: 'Pathologie' },
  { cle: 'circonstances', label: 'Circonstances' },
  { cle: 'cinetique', label: 'Cinétique' },
  { cle: 'douleur', label: 'Douleur (/10)' },
]

const CHAMPS_IMPLIQUE = [
  { cle: 'snosm_statut', label: 'Statut', type: 'radio', options: OPTIONS_STATUT_PERSONNE },
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
  { cle: 'snosm_avalanche_bouchon_neige', label: 'Bouchon de neige', type: 'radio', options: OPTIONS_OUI_NON_NE_SAIS_PAS },
  { cle: 'snosm_avalanche_poche_air', label: 'Poche d’air', type: 'radio', options: OPTIONS_OUI_NON_NE_SAIS_PAS },
  { cle: 'snosm_avalanche_position1', label: 'Position 1' },
  { cle: 'snosm_avalanche_position2', label: 'Position 2' },
  { cle: 'snosm_avalanche_durete_neige', label: 'Dureté neige / tête', type: 'radio', options: OPTIONS_DURETE_NEIGE },
  { cle: 'snosm_avalanche_obstacles', label: 'Obstacles / écoulement', type: 'radio', options: OPTIONS_OBSTACLES },
  { cle: 'snosm_avalanche_environnement', label: 'Environnement', type: 'radio', options: OPTIONS_ENVIRONNEMENT_AVALANCHE },
  { cle: 'snosm_avalanche_dva_present', label: 'DVA présent', type: 'checkbox' },
  { cle: 'snosm_avalanche_dva_en_marche', label: 'DVA en marche', type: 'checkbox' },
  { cle: 'snosm_avalanche_pelle', label: 'Pelle', type: 'checkbox' },
  { cle: 'snosm_avalanche_sonde', label: 'Sonde', type: 'checkbox' },
  { cle: 'snosm_avalanche_recco', label: 'RECCO', type: 'checkbox' },
  { cle: 'snosm_avalanche_sac_airbag', label: 'Sac airbag', type: 'checkbox' },
  { cle: 'snosm_avalanche_marque_modele', label: 'Marque et modèle' },
  { cle: 'snosm_avalanche_alimentation', label: 'Alimentation', type: 'radio', options: OPTIONS_ALIMENTATION_DVA },
  { cle: 'snosm_avalanche_gonflage', label: 'Gonflage', type: 'radio', options: OPTIONS_GONFLAGE },
  { cle: 'snosm_avalanche_position_victime', label: 'Position sur la victime', type: 'radio', options: OPTIONS_POSITION_VICTIME_AIRBAG },
  { cle: 'snosm_avalanche_sac_et_victime', label: 'Sac airbag et la victime', type: 'radio', options: OPTIONS_SAC_ET_VICTIME },
]

const TOUS_GROUPES_INTERVENTION = [...GROUPES_GENERAL, ...GROUPES_MOYENS, ...GROUPES_INTERVENTION, ...GROUPES_RENFORT, ...GROUPES_AVIS]

function valeurInitiale(type) {
  if (type === 'checkbox') return false
  if (type === 'nombre') return 0
  return ''
}

function BlocChamps({ groupes, brouillon, majChamp, secouristes }) {
  return groupes.map((groupe, i) => (
    <div className="section-fiche" key={groupe.titre || i}>
      {groupe.titre && <h4>{groupe.titre}</h4>}
      <div className="grille-details-fiche">
        {groupe.champs.map((c) => (
          <ChampSnosm
            key={c.cle}
            description={c}
            valeur={brouillon[c.cle]}
            onChange={(v) => majChamp(c.cle, v)}
            secouristes={secouristes}
            brouillon={brouillon}
            valeurLiee={c.champLie ? brouillon[c.champLie] : undefined}
            onChangeLiee={c.champLie ? (v) => majChamp(c.champLie, v) : undefined}
          />
        ))}
      </div>
    </div>
  ))
}

function brouillonFicheDepuis(fiche) {
  const bf = {}
  for (const g of TOUS_GROUPES_INTERVENTION)
    for (const c of g.champs) {
      bf[c.cle] = fiche[c.cle] ?? valeurInitiale(c.type)
      if (c.champLie) bf[c.champLie] = fiche[c.champLie] ?? ''
    }
  for (const c of CHAMPS_AVALANCHE_EVENEMENT) bf[c.cle] = fiche[c.cle] ?? valeurInitiale(c.type)
  bf.snosm_avalanche = Boolean(fiche.snosm_avalanche)
  // Le n° de texte SNOSM est le n° d'intervention Cim'Alerte — prérempli s'il n'a pas déjà été saisi.
  if (!bf.snosm_numero_texte && fiche.local_id) bf.snosm_numero_texte = String(fiche.local_id)
  // Origine de l'alerte : reclassée depuis la valeur Cim'Alerte (CODIS74, SAMU38…) dans une des 6 cases
  // du radio SNOSM — ce qui ne rentre dans aucune case connue est reporté en AUTRE avec le texte d'origine en précision.
  if (!bf.snosm_origine_alerte && fiche.alert_origin) {
    const bucket = snosmOrigineDepuis(fiche.alert_origin)
    if (bucket) {
      bf.snosm_origine_alerte = bucket
      if (bucket === 'AUTRE' && !bf.snosm_origine_alerte_autre) bf.snosm_origine_alerte_autre = fiche.alert_origin
    }
  }
  // Nature de l'opération : quasi toujours "Secours en montagne" en pratique — précochée par défaut, modifiable.
  if (!bf.snosm_nature_operation) bf.snosm_nature_operation = 'Secours en montagne'
  // Alerte/Départ/Sur les lieux/Fin d'opération : préremplis depuis Cim'Alerte (heure d'alerte, puis
  // statuts terrain horodatés de la main courante — premier DEPART/ASL/FIN), modifiables ensuite comme
  // n'importe quel champ, jamais réécrits sur Cim'Alerte lui-même (colonnes Snosm* dédiées côté Grist).
  if (!bf.snosm_alerte_le && fiche.created_at) bf.snosm_alerte_le = fiche.created_at
  if (!bf.snosm_depart_le && fiche.depart_le) bf.snosm_depart_le = fiche.depart_le
  if (!bf.snosm_arrivee_lieux_le && fiche.arrivee_le) bf.snosm_arrivee_lieux_le = fiche.arrivee_le
  if (!bf.snosm_fin_operation_le && fiche.fin_le) bf.snosm_fin_operation_le = fiche.fin_le
  // Opération (héliportée/terrestre/mixte) : reprend le type d'intervention Cim'Alerte quand il est renseigné.
  if (!bf.snosm_type_operation_moyens && fiche.type_intervention) bf.snosm_type_operation_moyens = fiche.type_intervention
  // Hélicoptère(s) : reprend l'hélicoptère Cim'Alerte seulement s'il correspond exactement à un appareil
  // connu — le texte libre Cim'Alerte est trop hétérogène pour être fiable au-delà d'une correspondance exacte.
  if (!bf.snosm_helicopteres && OPTIONS_HELICOPTERES.includes(fiche.helicopter)) bf.snosm_helicopteres = fiche.helicopter
  // PPSM : déduit du poste précis qui a pris l'alerte (squad_code, granulaire — CRS73C, CRS38H…), jamais deviné au-delà de cette table.
  if (!bf.snosm_ppsm) {
    const ppsm = ppsmDepuisSquadCode(fiche.squad_code)
    if (ppsm) bf.snosm_ppsm = ppsm
  }
  // Médicalisation : Cim'Alerte ne connaît que Oui/Non (is_med), jamais "Non obtenue" — devinable seulement dans ce sens-là.
  if (!bf.snosm_medicalisation && typeof fiche.is_med === 'boolean') bf.snosm_medicalisation = fiche.is_med ? 'Oui' : 'Non'
  return bf
}

function brouillonVictimesDepuis(fiche) {
  const bv = {}
  for (const v of fiche.victimes ?? []) {
    bv[v.id] = {}
    for (const c of [...CHAMPS_IMPLIQUE, ...CHAMPS_AVALANCHE_VICTIME]) bv[v.id][c.cle] = v[c.cle] ?? valeurInitiale(c.type)
    // Statut (victime/témoin/encadrant) : reclassé depuis StatutPersonne (Cim'Alerte, minuscules sans accent).
    if (!bv[v.id].snosm_statut) {
      const statut = snosmStatutDepuis(v.statut_personne)
      if (statut) bv[v.id].snosm_statut = statut
    }
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
  // Tout l'annuaire (toutes sections) — Directeur d'enquête/Rédacteur/Signataire peuvent être n'importe qui, pas seulement la section courante.
  const [secouristes, setSecouristes] = useState([])
  useEffect(() => {
    chargerTousSecouristes()
      .then((liste) => setSecouristes(liste.map((s) => s.libelle)))
      .catch(() => {})
  }, [])
  // Effectif de permanence du poste, le jour de l'intervention (COS, téléphoniste/permanencier…) —
  // pour ajouter rapidement à l'Effectif CRS Engagé sans ressaisir un nom déjà connu.
  const [effectifJour, setEffectifJour] = useState([])
  useEffect(() => {
    effectifsDuJour(fiche.squad_code, fiche.created_at).then(setEffectifJour).catch(() => {})
  }, [fiche.squad_code, fiche.created_at])

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

  async function ajouterLigneEffectif(role = '', personne = '') {
    try {
      await ajouterEffectifEngage(fiche.id, codesRequete, { role, personne, depassement_horaire: false, heure_depassement: null })
      await rafraichirEffectifs()
    } catch (e) {
      setErreur(e.message)
    }
  }

  /** Ajoute une personne de l'effectif du jour tel quel — jamais deux fois la même. */
  async function ajouterDepuisEffectifJour(entree) {
    if (effectifs.some((e) => e.personne === entree.nom && e.role === entree.role)) return
    await ajouterLigneEffectif(entree.role, entree.nom)
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
            {edition ? (
              <BlocChamps groupes={GROUPES_MOYENS_AVANT_EFFECTIF} brouillon={brouillonFiche} majChamp={majChampFiche} />
            ) : (
              <LectureGroupes groupes={GROUPES_MOYENS_AVANT_EFFECTIF} fiche={fiche} />
            )}
            <div className="section-fiche">
              <h4>Équipe</h4>
              <div className="grille-details-fiche">
                <Detail label="Équipe engagée">{fiche.team?.length > 0 ? fiche.team.join(', ') : '—'}</Detail>
                <Detail label="Moyens engagés (brut)">{fiche.moyens_engages || '—'}</Detail>
              </div>
            </div>
            <div className="section-fiche">
              <h4>Effectif CRS engagé</h4>
              {effectifJour.length > 0 && (
                <div className="effectif-jour-snosm">
                  <span className="etiquette-effectif-jour-snosm">Effectif du jour — cliquer pour ajouter :</span>
                  {effectifJour.map((e) => (
                    <button
                      type="button"
                      key={e.id}
                      className="puce-effectif-jour-snosm"
                      disabled={verrouillee}
                      onClick={() => ajouterDepuisEffectifJour(e)}
                    >
                      {e.nom} <span className="role-effectif-jour-snosm">{e.role}</span>
                    </button>
                  ))}
                </div>
              )}
              <TableauEffectifs
                effectifs={effectifs}
                verrouillee={verrouillee}
                onAjouter={() => ajouterLigneEffectif()}
                onMaj={majEffectif}
                onSupprimer={supprimerLigneEffectif}
              />
            </div>
            {edition ? (
              <BlocChamps groupes={GROUPES_MOYENS_APRES_EFFECTIF} brouillon={brouillonFiche} majChamp={majChampFiche} />
            ) : (
              <LectureGroupes groupes={GROUPES_MOYENS_APRES_EFFECTIF} fiche={fiche} />
            )}
          </>
        )}

        {sousOnglet === 'intervention' &&
          (edition ? <BlocChamps groupes={GROUPES_INTERVENTION} brouillon={brouillonFiche} majChamp={majChampFiche} /> : <LectureGroupes groupes={GROUPES_INTERVENTION} fiche={fiche} />)}

        {sousOnglet === 'renfort' &&
          (edition ? <BlocChamps groupes={GROUPES_RENFORT} brouillon={brouillonFiche} majChamp={majChampFiche} /> : <LectureGroupes groupes={GROUPES_RENFORT} fiche={fiche} />)}

        {sousOnglet === 'avis' &&
          (edition ? (
            <BlocChamps groupes={GROUPES_AVIS} brouillon={brouillonFiche} majChamp={majChampFiche} secouristes={secouristes} />
          ) : (
            <LectureGroupes groupes={GROUPES_AVIS} fiche={fiche} />
          ))}

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
    const valeurLiee = c.champLie ? source[c.champLie] : null
    return (
      <Detail key={c.cle} label={c.label}>
        {c.type === 'checkbox' ? (valeur ? 'Oui' : 'Non') : vide ? '—' : String(valeur)}
        {valeurLiee ? ` (${valeurLiee})` : ''}
      </Detail>
    )
  })
}

function LectureGroupes({ groupes, fiche }) {
  return groupes.map((groupe, i) => (
    <div className="section-fiche" key={groupe.titre || i}>
      {groupe.titre && <h4>{groupe.titre}</h4>}
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
