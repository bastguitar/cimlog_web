import { useEffect, useRef, useState } from 'react'
import { chargerTousSecouristes, chargerToutPersonnel } from '../../lib/annuaire'
import { effectifsDuJour } from '../../lib/effectifsDuJour'
import { ChampSnosm, ChampCheckbox, ChampDateTime } from './ChampsSnosm'
import SchemaAvalanche from './SchemaAvalanche'
import { ICONES_TYPE_AVALANCHE, ICONES_NIVEAU_RISQUE, COULEURS_TAILLE_AVALANCHE } from './IconesAvalanche'
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
  OPTIONS_TYPE_INTERVENTION,
  snosmTypeOperationDepuis,
  OPTIONS_ORIGINE_ALERTE,
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
  visibleSiActiviteGlisse,
  optionsLocalisationPisteSelonDomaine,
  snosmOrigineDepuis,
  ppsmDepuisSquadCode,
  ppsmDepuisHelicoptere,
  visibleSiHelicoptereSaf,
  OPTIONS_ROLE_EFFECTIF,
  roleSnosmDepuis,
  genererCirconstancesGlobales,
  OPTIONS_GESTES_SECOURISME,
  OPTIONS_TECHNIQUES_EVACUATION,
  snosmStatutDepuis,
  OPTIONS_AUTORITES_AVISEES,
  autoritesAviseesDefaut,
  OPTIONS_OUI_NON,
  OPTIONS_MOYENS_LOCALISATION_AVALANCHE,
  OPTIONS_POSITION_1_AVALANCHE,
  OPTIONS_POSITION_2_AVALANCHE,
  OPTIONS_MATERIEL_AVALANCHE,
  OPTIONS_NATIONALITE,
  sexeDepuis,
} from '../../lib/optionsSnosm'
import {
  modifierIntervention,
  modifierVictime,
  ajouterVictime,
  ajouterEffectifEngage,
  modifierEffectifEngage,
  supprimerEffectifEngage,
  listerEffectifsEngages,
  chargerReferentiels,
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
      // options : voir groupesAvecReferentiels (Cim'Alerte fait foi, ReferentielActivites dans Grist).
      { cle: 'activity', label: 'Nature de l’activité', type: 'liste-si-vide', options: [] },
      { cle: 'alt', label: 'Altitude (m)' },
      // maxSuggestions : les 10 choix météo dépassaient la limite par défaut (8) — certains
      // (Tempête de neige, Venteux) n'apparaissaient jamais dans le menu sans les taper (décision
      // utilisateur : tout le menu doit être visible d'un coup, façon menu déroulant classique).
      { cle: 'snosm_meteo', label: 'Météo', type: 'tags', options: OPTIONS_METEO, maxSuggestions: OPTIONS_METEO.length },
    ],
  },
  {
    // Regroupe les 3 champs liés au ski (décision utilisateur) — Encadrement/Diplôme, sans rapport
    // avec le domaine skiable en soi, est séparé dans son propre groupe juste en dessous.
    titre: 'Domaine',
    champs: [
      {
        cle: 'snosm_type_domaine',
        label: 'Type de domaine',
        type: 'repliable',
        options: OPTIONS_TYPE_DOMAINE,
        visibleSi: visibleSiActiviteGlisse,
      },
      {
        cle: 'snosm_localisation_piste',
        label: 'Localisation piste',
        type: 'repliable',
        options: OPTIONS_LOCALISATION_PISTE,
        visibleSi: visibleSiActiviteGlisse,
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
  {
    titre: 'Encadrement',
    champs: [
      { cle: 'snosm_encadrement', label: 'Encadrement', type: 'bulles', options: OPTIONS_ENCADREMENT, avecFleche: true },
      {
        cle: 'snosm_diplome_encadrant',
        label: 'Diplôme encadrant',
        type: 'repliable',
        options: OPTIONS_DIPLOME_ENCADRANT,
        visibleSi: (bf) => bf.snosm_encadrement === 'encadrement associatif' || bf.snosm_encadrement === 'encadrement professionnel',
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
      {
        cle: 'snosm_ppsm',
        label: 'PPSM(s)',
        type: 'liste-multiple',
        options: OPTIONS_PPSM,
        libelleAjout: 'un autre PPSM',
      },
      {
        // options : voir groupesAvecReferentiels (Cim'Alerte fait foi, ReferentielHelicos dans Grist).
        cle: 'snosm_helicopteres',
        label: 'Hélicoptère(s)',
        type: 'liste-multiple',
        options: [],
        libelleAjout: 'un autre hélicoptère',
      },
      {
        cle: 'snosm_medicalisation',
        label: 'Médicalisation',
        type: 'radio',
        options: OPTIONS_MEDICALISATION,
        pleineLargeur: false,
      },
    ],
  },
]

const GROUPES_MOYENS_APRES_EFFECTIF = [
  {
    titre: '',
    champs: [
      { cle: 'snosm_equipes_cynophiles_crs', label: 'Équipe(s) cynophile(s) CRS', type: 'nombre' },
      { cle: 'snosm_equipes_drones', label: 'Équipe(s) drone(s)', type: 'nombre' },
      {
        cle: 'snosm_emploi_heli_saf',
        label: 'Emploi hélicoptère du SAF justifié par',
        type: 'texte-long',
        visibleSi: visibleSiHelicoptereSaf,
      },
    ],
  },
]

const GROUPES_MOYENS = [...GROUPES_MOYENS_AVANT_EFFECTIF, ...GROUPES_MOYENS_APRES_EFFECTIF]

const GROUPES_INTERVENTION = [
  {
    titre: 'Compte rendu',
    champs: [
      { cle: 'description', label: 'Circonstances / description', type: 'texte-long' },
      {
        cle: 'snosm_gestes_secourisme',
        label: 'Geste(s) de secourisme effectué(s)',
        type: 'tags',
        options: OPTIONS_GESTES_SECOURISME,
      },
      {
        cle: 'snosm_techniques_evacuation',
        label: 'Technique(s) d’évacuation mise(s) en œuvre',
        type: 'tags',
        options: OPTIONS_TECHNIQUES_EVACUATION,
      },
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
      { cle: 'snosm_autorites_avisees', label: 'Autorités avisée(s)', type: 'tags', options: OPTIONS_AUTORITES_AVISEES, pleineLargeur: true },
      { cle: 'snosm_medias_informes', label: 'Médias informés', type: 'radio', options: OPTIONS_MEDIAS_INFORMES },
      { cle: 'snosm_avis_divers', label: 'Avis divers', type: 'texte-long', rows: 2 },
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

// Longueur du dépôt/Largeur cassure/Hauteur cassure/Largeur dépôt/Pente ne sont plus dans les listes
// plates ci-dessous : saisies directement sur le schéma d'avalanche (SchemaAvalanche.jsx), affiché
// juste avant dans l'onglet — toujours les 5 mêmes champs texte libre, juste une présentation différente.
const CHAMPS_SCHEMA_AVALANCHE = [
  'snosm_avalanche_longueur',
  'snosm_avalanche_largeur_cassure',
  'snosm_avalanche_hauteur_cassure',
  'snosm_avalanche_largeur_depot',
  'snosm_avalanche_pente',
]

// Ordre de l'onglet (décision utilisateur) : Niveau de risque puis Type d'avalanche ; les schémas
// (dessin d'avalanche / rose des vents + curseur Taille) côte à côte ; Déclenchement/Point de
// départ/Altitude/Dénivelé ; puis le bilan (impliqués/victimes/blessés/indemnes/décédés).
const CHAMPS_AVALANCHE_NIVEAU_TYPE = [
  { cle: 'snosm_avalanche_niveau_risque', label: 'Niveau de risque', type: 'radio', options: OPTIONS_NIVEAU_RISQUE, icones: ICONES_NIVEAU_RISQUE },
  { cle: 'snosm_avalanche_type', label: 'Type d’avalanche', type: 'radio', options: OPTIONS_TYPE_AVALANCHE, icones: ICONES_TYPE_AVALANCHE },
]
const CHAMP_TAILLE_AVALANCHE = {
  cle: 'snosm_avalanche_taille',
  label: 'Taille d’avalanche',
  type: 'echelle',
  options: OPTIONS_TAILLE_AVALANCHE,
  couleurs: COULEURS_TAILLE_AVALANCHE,
}
const CHAMP_ORIENTATION_AVALANCHE = { cle: 'snosm_avalanche_orientation', label: 'Orientation', type: 'orientation' }
const CHAMPS_AVALANCHE_HORAIRES = [
  { cle: 'snosm_avalanche_declenchement_le', label: 'Déclenchement', type: 'datetime' },
  { cle: 'snosm_avalanche_point_depart_gps', label: 'Point de départ (GPS)' },
  { cle: 'snosm_avalanche_altitude', label: 'Altitude (m)' },
  { cle: 'snosm_avalanche_denivele', label: 'Dénivelé total', type: 'texte-unite', unite: 'm' },
]
const CHAMPS_AVALANCHE_BILAN = [
  { cle: 'snosm_avalanche_nb_impliques', label: 'Nombre d’impliqués', type: 'nombre' },
  { cle: 'snosm_avalanche_nb_victimes', label: 'Nombre de victimes', type: 'nombre' },
  { cle: 'snosm_avalanche_nb_blesses', label: 'Nombre de blessés', type: 'nombre' },
  { cle: 'snosm_avalanche_nb_indemnes', label: 'Nombre d’indemnes', type: 'nombre' },
  { cle: 'snosm_avalanche_nb_decedes', label: 'Nombre de décédés', type: 'nombre' },
]
// Combiné (ordre de l'onglet) — sert à ChampsLecture (mode lecture, simple liste texte) et à
// l'initialisation du brouillon ; le rendu en édition utilise les sous-groupes ci-dessus séparément
// pour la mise en page côte à côte.
const CHAMPS_AVALANCHE_EVENEMENT = [
  ...CHAMPS_AVALANCHE_NIVEAU_TYPE,
  CHAMP_TAILLE_AVALANCHE,
  ...CHAMPS_AVALANCHE_HORAIRES,
  CHAMP_ORIENTATION_AVALANCHE,
  ...CHAMPS_AVALANCHE_BILAN,
]

/**
 * Un seul groupe, tout modifiable (y compris nom/prénom/date de naissance/sexe/nationalité/
 * téléphone, connus via Cim'Alerte mais parfois mal saisis à la prise d'appel — décision
 * utilisateur). Pathologie/Circonstances/Cinétique/Douleur (texte libre Cim'Alerte) ni Âge ne sont
 * affichés ici : les deux premiers redondants avec Circonstances (liste SNOSM) et le compte-rendu
 * généré automatiquement (onglet Intervention), Âge redondant avec Date de naissance.
 * Statut, puis État médical, chacun sur sa propre ligne (décision utilisateur) ; puis le bloc
 * identité (Nom/Prénom/Sexe/adresse/Nationalité/Téléphone/naissance/Profession, dans cet ordre) ;
 * puis blessure, puis destination/prise en charge.
 */
function IconeHomme() {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
      <circle cx="8" cy="4.2" r="2.4" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M8 6.6v6.2M8 9.4h3.2M8 9.4H4.8M8 12.8l-2 2.4M8 12.8l2 2.4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}
function IconeFemme() {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
      <circle cx="8" cy="4.2" r="2.4" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M8 6.6v6M5.6 10.6h4.8M6.2 15v-2.2M9.8 15v-2.2" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}
const ICONES_SEXE = { Homme: <IconeHomme />, Femme: <IconeFemme /> }

/** Petites icônes décoratives dans quelques champs de l'onglet Impliqué — inspirées de la maquette fournie. */
function IconeTelephone() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path
        d="M3.2 2.4c.6-.3 1.3-.1 1.6.5l.8 1.6c.3.5.1 1.1-.3 1.5l-.7.6c.5 1.3 1.6 2.4 2.9 2.9l.6-.7c.4-.4 1-.5 1.5-.3l1.6.8c.6.3.8 1 .5 1.6l-.5 1c-.3.6-1 1-1.7.9-3.9-.5-7-3.6-7.5-7.5-.1-.7.3-1.4.9-1.7z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  )
}
function IconeCalendrier() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <rect x="2" y="3" width="12" height="11" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <path d="M2 6.5h12M5 1.6v2.4M11 1.6v2.4" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  )
}
function IconePin() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path
        d="M8 14.4S3 9.8 3 6.4a5 5 0 0 1 10 0c0 3.4-5 8-5 8z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <circle cx="8" cy="6.3" r="1.7" fill="none" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  )
}
function IconePersonneVictime() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      <circle cx="8" cy="4.6" r="2.6" fill="currentColor" />
      <path d="M2.4 14c.5-3.2 2.9-5 5.6-5s5.1 1.8 5.6 5" fill="currentColor" />
    </svg>
  )
}
function IconeMaison() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path d="M2 8.2 8 3l6 5.2" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3.4 7.2V14h9.2V7.2" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  )
}

// Statut + Victime avalanche : rendus à part sur une même ligne (Statut à gauche, Victime avalanche
// décalée à droite — décision utilisateur), pas dans les groupes ci-dessous.
const CHAMP_STATUT_IMPLIQUE = { cle: 'snosm_statut', label: 'Statut', type: 'bulles', options: OPTIONS_STATUT_PERSONNE }
const CHAMP_VICTIME_AVALANCHE = { cle: 'snosm_victime_avalanche', label: 'Victime avalanche', type: 'checkbox' }

// Un groupe par sujet — chacun forcé sur sa propre ligne (plutôt qu'un seul gros tas de champs
// laissé au flexbox), pour ne jamais mélanger état médical / identité / coordonnées / blessure /
// devenir (décision utilisateur).
const GROUPES_IMPLIQUE = [
  [{ cle: 'snosm_etat_medical', label: 'État médical', type: 'liste', options: OPTIONS_ETAT_MEDICAL, pleineLargeur: false }],
  [
    { cle: 'nom', label: 'Nom' },
    { cle: 'prenom', label: 'Prénom' },
    { cle: 'sexe', label: 'Sexe', type: 'radio', options: ['Homme', 'Femme'], icones: ICONES_SEXE, pleineLargeur: false },
    { cle: 'date_naissance', label: 'Date de naissance', type: 'date', icone: <IconeCalendrier /> },
  ],
  [
    { cle: 'snosm_lieu_naissance', label: 'Lieu de naissance', icone: <IconePin /> },
    { cle: 'nationalite', label: 'Nationalité', type: 'liste-si-vide', options: OPTIONS_NATIONALITE },
    { cle: 'snosm_profession', label: 'Profession' },
  ],
  [
    { cle: 'snosm_demeurant', label: 'Demeurant', icone: <IconeMaison /> },
    { cle: 'snosm_code_postal', label: 'Code postal' },
    { cle: 'snosm_commune', label: 'Commune' },
    { cle: 'snosm_pays', label: 'Pays' },
    { cle: 'telephone', label: 'Téléphone', icone: <IconeTelephone /> },
  ],
  [
    { cle: 'snosm_localisation_blessure', label: 'Localisation blessure', type: 'tags', options: OPTIONS_LOCALISATION_BLESSURE },
    { cle: 'snosm_type_blessure', label: 'Type de blessure', type: 'tags', options: OPTIONS_TYPE_BLESSURE },
    { cle: 'snosm_circonstances_liste', label: 'Circonstances', type: 'liste', options: OPTIONS_CIRCONSTANCES_VICTIME },
  ],
  [
    { cle: 'snosm_destination', label: 'Destination', icone: <IconeMaison /> },
    { cle: 'snosm_fin_prise_en_charge_le', label: 'Heure fin de prise en charge', type: 'datetime' },
  ],
]

// Liste à plat — utilisée pour initialiser le brouillon (une seule boucle sur toutes les clés) et par
// l'Edge Function/le reste du code qui n'a pas besoin du découpage par groupe.
const CHAMPS_IMPLIQUE = [CHAMP_STATUT_IMPLIQUE, CHAMP_VICTIME_AVALANCHE, ...GROUPES_IMPLIQUE.flat()]

/** Sous-groupe airbag (marque/alimentation/gonflage/position…), affiché seulement si Sac airbag = oui. */
function visibleSiAirbag(bv) {
  return bv.snosm_avalanche_sac_airbag === 'oui'
}

const CHAMPS_AVALANCHE_VICTIME = [
  { cle: 'snosm_avalanche_moyens_localisation', label: 'Moyens de localisation', type: 'liste', options: OPTIONS_MOYENS_LOCALISATION_AVALANCHE },
  { cle: 'snosm_avalanche_distance_m', label: 'Distance parcourue', type: 'texte-unite', unite: 'm' },
  { cle: 'snosm_avalanche_profondeur_cm', label: 'Profondeur ensevelissement', type: 'texte-unite', unite: 'cm' },
  { cle: 'snosm_avalanche_duree_mn', label: 'Durée ensevelissement', type: 'texte-unite', unite: 'mn' },
  { cle: 'snosm_avalanche_dva_present', label: 'DVA présent', type: 'radio', options: OPTIONS_OUI_NON, pleineLargeur: false },
  { cle: 'snosm_avalanche_dva_en_marche', label: 'DVA en marche', type: 'radio', options: OPTIONS_OUI_NON, pleineLargeur: false },
  { cle: 'snosm_avalanche_bouchon_neige', label: 'Bouchon de neige', type: 'radio', options: OPTIONS_OUI_NON_NE_SAIS_PAS },
  { cle: 'snosm_avalanche_poche_air', label: 'Poche d’air', type: 'radio', options: OPTIONS_OUI_NON_NE_SAIS_PAS },
  { cle: 'snosm_avalanche_position1', label: 'Position 1', type: 'liste', options: OPTIONS_POSITION_1_AVALANCHE },
  { cle: 'snosm_avalanche_position2', label: 'Position 2', type: 'liste', options: OPTIONS_POSITION_2_AVALANCHE },
  { cle: 'snosm_avalanche_durete_neige', label: 'Dureté neige / tête', type: 'radio', options: OPTIONS_DURETE_NEIGE },
  { cle: 'snosm_avalanche_obstacles', label: 'Obstacles / écoulement', type: 'radio', options: OPTIONS_OBSTACLES },
  { cle: 'snosm_avalanche_environnement', label: 'Environnement (où se trouve la victime)', type: 'radio', options: OPTIONS_ENVIRONNEMENT_AVALANCHE },
  { cle: 'snosm_avalanche_materiel', label: 'Matériel utilisé', type: 'cases-multiples', options: OPTIONS_MATERIEL_AVALANCHE },
  { cle: 'snosm_avalanche_sac_airbag', label: 'Sac airbag', type: 'radio', options: OPTIONS_OUI_NON, pleineLargeur: false },
  { cle: 'snosm_avalanche_marque_modele', label: 'Marque et modèle', visibleSi: visibleSiAirbag },
  { cle: 'snosm_avalanche_alimentation', label: 'Alimentation', type: 'radio', options: OPTIONS_ALIMENTATION_DVA, visibleSi: visibleSiAirbag },
  { cle: 'snosm_avalanche_gonflage', label: 'Gonflage', type: 'radio', options: OPTIONS_GONFLAGE, visibleSi: visibleSiAirbag },
  { cle: 'snosm_avalanche_position_victime', label: 'Position sur la victime', type: 'radio', options: OPTIONS_POSITION_VICTIME_AIRBAG, visibleSi: visibleSiAirbag },
  { cle: 'snosm_avalanche_sac_et_victime', label: 'Sac airbag et la victime', type: 'radio', options: OPTIONS_SAC_ET_VICTIME, visibleSi: visibleSiAirbag },
]

const TOUS_GROUPES_INTERVENTION = [...GROUPES_GENERAL, ...GROUPES_MOYENS, ...GROUPES_INTERVENTION, ...GROUPES_RENFORT, ...GROUPES_AVIS]

/**
 * Injecte les options des 2 champs dont Cim'Alerte fait foi (activité,
 * hélicoptère(s)) au moment du rendu — plutôt que de les coder en dur dans
 * les groupes déclaratifs ci-dessus, qui restent une source unique partagée
 * entre lecture et édition.
 */
function groupesAvecReferentiels(groupes, referentiels) {
  return groupes.map((g) => ({
    ...g,
    champs: g.champs.map((c) => {
      if (c.cle === 'activity') return { ...c, options: referentiels.activites }
      if (c.cle === 'snosm_helicopteres') return { ...c, options: referentiels.helicopteres }
      return c
    }),
  }))
}

function valeurInitiale(type) {
  if (type === 'checkbox') return false
  if (type === 'nombre') return 0
  return ''
}

function BlocChamps({ groupes, brouillon, majChamp, secouristes, classeGrille = '' }) {
  return groupes.map((groupe, i) => (
    <div className="section-fiche" key={groupe.titre || i}>
      {groupe.titre && <h4>{groupe.titre}</h4>}
      <div className={`grille-details-fiche${classeGrille ? ' ' + classeGrille : ''}`}>
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

function brouillonFicheDepuis(fiche, referentiels) {
  const bf = {}
  for (const g of TOUS_GROUPES_INTERVENTION)
    for (const c of g.champs) {
      bf[c.cle] = fiche[c.cle] ?? valeurInitiale(c.type)
      if (c.champLie) bf[c.champLie] = fiche[c.champLie] ?? ''
    }
  for (const c of CHAMPS_AVALANCHE_EVENEMENT) bf[c.cle] = fiche[c.cle] ?? valeurInitiale(c.type)
  for (const cle of CHAMPS_SCHEMA_AVALANCHE) bf[cle] = fiche[cle] ?? ''
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
  // Opération (héliportée/terrestre/mixte) : reprend le type d'intervention Cim'Alerte (reclassé —
  // poussé en minuscules côté Cim'Alerte, "mixte" ≠ "Mixte" pour la comparaison stricte du radio).
  if (!bf.snosm_type_operation_moyens) {
    const type = snosmTypeOperationDepuis(fiche.type_intervention)
    if (type) bf.snosm_type_operation_moyens = type
  }
  // Hélicoptère(s) : reprend l'hélicoptère Cim'Alerte seulement s'il correspond exactement à un appareil
  // connu — le texte libre Cim'Alerte est trop hétérogène pour être fiable au-delà d'une correspondance exacte.
  if (!bf.snosm_helicopteres && referentiels.helicopteres.includes(fiche.helicopter)) bf.snosm_helicopteres = fiche.helicopter
  // PPSM : déduit en priorité de l'hélicoptère engagé (c'est lui qui détermine le PPSM sur le terrain, pas
  // le poste qui a pris l'alerte) ; à défaut retombe sur le squad_code (poste précis — CRS73C, CRS38H…).
  if (!bf.snosm_ppsm) {
    const premierHelico = (bf.snosm_helicopteres ?? '').split(',')[0].trim()
    const ppsm = ppsmDepuisHelicoptere(premierHelico) ?? ppsmDepuisSquadCode(fiche.squad_code)
    if (ppsm) bf.snosm_ppsm = ppsm
  }
  // Médicalisation : Cim'Alerte ne connaît que Oui/Non (is_med), jamais "Non obtenue" — devinable seulement dans ce
  // sens-là. `is_med` peut arriver en booléen strict ou en équivalent (chaîne/0-1) selon ce que Grist renvoie —
  // comparaison volontairement large plutôt que `typeof … === 'boolean'`, qui ratait le préremplissage si ce n'était pas le cas.
  if (!bf.snosm_medicalisation && fiche.is_med != null) bf.snosm_medicalisation = fiche.is_med === true || fiche.is_med === 'true' || fiche.is_med === 1 ? 'Oui' : 'Non'
  // Circonstances / description (onglet Intervention) : brouillon généré depuis les victimes (sexe/âge/circonstances/
  // cinétique) et l'activité — juste un point de départ, jamais réécrit si déjà rempli, toujours modifiable ensuite.
  if (!bf.description) {
    const genere = genererCirconstancesGlobales(fiche)
    if (genere) bf.description = genere
  }
  // Autorités avisées : point de départ selon la section/le département (DCCRS, zone, CRS région,
  // préfecture du département de l'intervention) — juste un point de départ, toujours modifiable.
  if (!bf.snosm_autorites_avisees) {
    const defaut = autoritesAviseesDefaut(fiche.squad_code, fiche.county)
    if (defaut.length) bf.snosm_autorites_avisees = defaut.join(', ')
  }
  return bf
}

/** Brouillon d'une seule victime — factorisé pour être réutilisé aussi bien à l'ouverture de la fiche
 * qu'à l'ajout à la volée d'un impliqué saisi à la main (voir ajouterImplique). */
function brouillonUneVictimeDepuis(v) {
  const bv = {}
  for (const c of [...CHAMPS_IMPLIQUE, ...CHAMPS_AVALANCHE_VICTIME]) bv[c.cle] = v[c.cle] ?? valeurInitiale(c.type)
  // Statut (victime/témoin/encadrant) : reclassé depuis StatutPersonne (Cim'Alerte, minuscules sans accent).
  if (!bv.snosm_statut) {
    const statut = snosmStatutDepuis(v.statut_personne)
    if (statut) bv.snosm_statut = statut
  }
  // Destination / Heure fin de prise en charge : reprises de Cim'Alerte (calculées à l'échelle de
  // l'intervention, pas par victime — même valeur sur toutes les victimes d'une fiche à plusieurs
  // victimes, à corriger à la main si elles sont parties vers des endroits différents).
  if (!bv.snosm_destination && v.destination_cim_alerte) bv.snosm_destination = v.destination_cim_alerte
  if (!bv.snosm_fin_prise_en_charge_le && v.depose_le) bv.snosm_fin_prise_en_charge_le = v.depose_le
  // Adresse / Code postal / Lieu de naissance / Commune : repris de Cim'Alerte (par victime, contrairement à destination/dépose ci-dessus).
  if (!bv.snosm_demeurant && v.adresse_cim_alerte) bv.snosm_demeurant = v.adresse_cim_alerte
  if (!bv.snosm_code_postal && v.code_postal_cim_alerte) bv.snosm_code_postal = v.code_postal_cim_alerte
  if (!bv.snosm_lieu_naissance && v.lieu_naissance_cim_alerte) bv.snosm_lieu_naissance = v.lieu_naissance_cim_alerte
  if (!bv.snosm_commune && v.commune_cim_alerte) bv.snosm_commune = v.commune_cim_alerte
  // Sexe : reclassé depuis la valeur brute Cim'Alerte ('F'/'M'…) vers 'Femme'/'Homme' (radio SNOSM).
  if (bv.sexe) bv.sexe = sexeDepuis(bv.sexe) ?? bv.sexe
  return bv
}

function brouillonVictimesDepuis(fiche) {
  const bv = {}
  for (const v of fiche.victimes ?? []) bv[v.id] = brouillonUneVictimeDepuis(v)
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
export default function FicheSnosm({ fiche, codesRequete, onFicheMaj, sectionNom, onFermer }) {
  const [sousOnglet, setSousOnglet] = useState('general')
  const verrouillee = Boolean(fiche.toEnvoyeLe)
  const [edition, setEdition] = useState(!verrouillee)
  // Référentiels hélicoptères/activités : Cim'Alerte fait foi (voir optionsSnosm.js), plus aucune
  // copie en dur ici — déclaré avant brouillonFiche pour que son préremplissage hélicoptère/PPSM
  // (ci-dessous) puisse s'appuyer dessus dès le premier rendu.
  const [referentiels, setReferentiels] = useState({ helicopteres: [], activites: [] })
  useEffect(() => {
    chargerReferentiels(codesRequete).then(setReferentiels).catch(() => {})
  }, [codesRequete])
  const [brouillonFiche, setBrouillonFiche] = useState(() => (verrouillee ? null : brouillonFicheDepuis(fiche, referentiels)))
  const [brouillonVictimes, setBrouillonVictimes] = useState(() => (verrouillee ? null : brouillonVictimesDepuis(fiche)))
  const [enregistrement, setEnregistrement] = useState(false)
  const [erreur, setErreur] = useState(null)
  const [confirmerAnnulation, setConfirmerAnnulation] = useState(false)
  const [effectifs, setEffectifs] = useState(fiche.effectifs_engages ?? [])
  const [generationTO, setGenerationTO] = useState(false)
  // Tout l'annuaire (toutes sections) — Directeur d'enquête/Rédacteur/Signataire peuvent être n'importe qui, pas seulement la section courante.
  // Dédoublonné sur le libellé (nom + prénom, sans la section) : une même personne peut apparaître
  // plusieurs fois côté annuaire (affectations multiples), mais ne doit être proposée qu'une fois ici.
  // Ceux de la section de l'intervention (sectionNom) sont mis en premier — annuaire et sections
  // Cim'Log utilisent des casses/accents différents ("BRIANCON" vs "Briançon"), d'où la comparaison
  // normalisée. Le reste de l'annuaire suit, rien n'est retiré de la liste.
  const [secouristes, setSecouristes] = useState([])
  // Directeur d'enquête/Rédacteur/Signataire : liste distincte de l'effectif CRS engagé ci-dessus —
  // souvent un cadre, pas un secouriste de terrain, donc pas filtrée sur type_personnel (décision
  // utilisateur : proposer tout le personnel de la section en premier, le reste de l'annuaire ensuite).
  const [personnel, setPersonnel] = useState([])
  useEffect(() => {
    const normalise = (s) =>
      (s ?? '')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toUpperCase()
    const sectionCible = normalise(sectionNom)
    const trierSectionDabord = (liste) => {
      const vus = new Set()
      const dedoublonnes = liste.filter((s) => (vus.has(s.libelle) ? false : vus.add(s.libelle)))
      const memeSection = dedoublonnes.filter((s) => normalise(s.section) === sectionCible)
      const autres = dedoublonnes.filter((s) => normalise(s.section) !== sectionCible)
      return [...memeSection, ...autres].map((s) => s.libelle)
    }
    chargerTousSecouristes()
      .then((liste) => setSecouristes(trierSectionDabord(liste)))
      .catch(() => {})
    chargerToutPersonnel()
      .then((liste) => setPersonnel(trierSectionDabord(liste)))
      .catch(() => {})
  }, [sectionNom])
  // Effectif de permanence du poste, le jour de l'intervention (COS, téléphoniste/permanencier…) —
  // pour ajouter rapidement à l'Effectif CRS Engagé sans ressaisir un nom déjà connu.
  const [effectifJour, setEffectifJour] = useState([])
  useEffect(() => {
    effectifsDuJour(fiche.squad_code, fiche.created_at).then(setEffectifJour).catch(() => {})
  }, [fiche.squad_code, fiche.created_at])
  // Rattrapage : le tout premier rendu calcule brouillonFiche avant que chargerReferentiels() ait pu
  // revenir (referentiels vaut encore {helicopteres: [], activites: []}) — dès que la liste arrive,
  // retente le préremplissage hélicoptère/PPSM une seule fois, sans jamais écraser une valeur déjà saisie.
  useEffect(() => {
    if (referentiels.helicopteres.length === 0) return
    if (!referentiels.helicopteres.includes(fiche.helicopter)) return
    setBrouillonFiche((bf) => {
      if (!bf || bf.snosm_helicopteres) return bf
      const ppsm = bf.snosm_ppsm || ppsmDepuisHelicoptere(fiche.helicopter) || ppsmDepuisSquadCode(fiche.squad_code)
      return { ...bf, snosm_helicopteres: fiche.helicopter, ...(ppsm ? { snosm_ppsm: ppsm } : {}) }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [referentiels])

  function demarrerEdition() {
    setBrouillonFiche(brouillonFicheDepuis(fiche, referentiels))
    setBrouillonVictimes(brouillonVictimesDepuis(fiche))
    setEdition(true)
    setErreur(null)
  }

  /** Abandonne les modifications non enregistrées et referme la fenêtre — le bouton « Annuler » est
   * au même niveau que « Enregistrer »/« TO » dans la barre d'actions, il doit donc agir comme eux
   * sur la fenêtre entière, pas seulement réinitialiser des champs en silence (bug remonté par
   * l'utilisateur : le bouton semblait « ne rien faire »). Passe par une confirmation (setConfirmerAnnulation)
   * pour ne jamais perdre une saisie par un clic accidentel.
   */
  function annulerEdition() {
    setBrouillonFiche(brouillonFicheDepuis(fiche, referentiels))
    setBrouillonVictimes(brouillonVictimesDepuis(fiche))
    setErreur(null)
    setConfirmerAnnulation(false)
    onFermer?.()
  }

  function majChampFiche(cle, valeur) {
    setBrouillonFiche((b) => ({ ...b, [cle]: valeur }))
  }

  function majChampVictime(victimeId, cle, valeur) {
    setBrouillonVictimes((b) => {
      const victime = { ...b[victimeId], [cle]: valeur }
      // Témoin/Encadrant : présumé indemne par défaut (rarement blessé), jamais écrasé si déjà renseigné.
      if (cle === 'snosm_statut' && (valeur === 'Témoin' || valeur === 'Encadrant') && !b[victimeId]?.snosm_etat_medical) {
        victime.snosm_etat_medical = 'Indemne'
      }
      return { ...b, [victimeId]: victime }
    })
  }

  /** Ajoute un impliqué saisi à la main (champs vierges) — pas connu de Cim'Alerte, ex. un témoin
   * arrivé sur place et jamais remonté par l'appli mobile. Créé tout de suite côté Grist (même
   * logique que + Ajouter un effectif), pas seulement en local le temps d'un futur Enregistrer. */
  async function ajouterImplique() {
    try {
      const id = await ajouterVictime(fiche.id, codesRequete)
      const prochainNumero = 1 + Math.max(0, ...(fiche.victimes ?? []).map((v) => Number(v.local_id) || 0))
      const victimeVide = { id, local_id: prochainNumero }
      onFicheMaj((f) => ({ ...f, victimes: [...(f.victimes ?? []), victimeVide] }))
      setBrouillonVictimes((b) => ({ ...(b ?? {}), [id]: brouillonUneVictimeDepuis(victimeVide) }))
    } catch (e) {
      setErreur(e.message)
    }
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

  /**
   * Ajoute une personne de l'effectif du jour — jamais deux fois la même. Le rôle
   * libre de l'effectif du jour (COS, SOM OPJ, PERMANENCIER…) est reclassé dans l'une
   * des 3 valeurs du tableau SNOSM, toujours modifiable ensuite si le classement ne convient pas.
   */
  async function ajouterDepuisEffectifJour(entree) {
    if (effectifs.some((e) => e.personne === entree.nom)) return
    await ajouterLigneEffectif(roleSnosmDepuis(entree.role), entree.nom)
  }

  /** Secouristes engagés sur CETTE intervention côté Cim'Alerte (fiche.team) — pas de rôle connu, Secouriste par défaut. */
  async function ajouterDepuisEquipe(nom) {
    if (effectifs.some((e) => e.personne === nom)) return
    await ajouterLigneEffectif('Secouriste', nom)
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
        {sousOnglet === 'general' &&
          (edition ? (
            <BlocChamps groupes={groupesAvecReferentiels(GROUPES_GENERAL, referentiels)} brouillon={brouillonFiche} majChamp={majChampFiche} />
          ) : (
            <LectureGroupes groupes={GROUPES_GENERAL} fiche={fiche} />
          ))}

        {sousOnglet === 'moyens' && (
          <>
            {edition ? (
              <BlocChamps
                groupes={groupesAvecReferentiels(GROUPES_MOYENS_AVANT_EFFECTIF, referentiels)}
                brouillon={brouillonFiche}
                majChamp={majChampFiche}
              />
            ) : (
              <LectureGroupes groupes={GROUPES_MOYENS_AVANT_EFFECTIF} fiche={fiche} />
            )}
            <div className="section-fiche">
              <h4>Effectif CRS engagé</h4>
              {fiche.team?.length > 0 && (
                <div className="effectif-jour-snosm">
                  <span className="etiquette-effectif-jour-snosm">Secouristes engagés (Cim'Alerte) — cliquer pour ajouter :</span>
                  {fiche.team.map((nom) => (
                    <button
                      type="button"
                      key={nom}
                      className="puce-effectif-jour-snosm"
                      disabled={verrouillee}
                      onClick={() => ajouterDepuisEquipe(nom)}
                    >
                      {nom}
                    </button>
                  ))}
                </div>
              )}
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
                secouristes={secouristes}
                secouristesConnus={(fiche.team?.length ?? 0) > 0 || effectifJour.length > 0}
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
          (edition ? (
            <BlocChamps groupes={GROUPES_RENFORT} brouillon={brouillonFiche} majChamp={majChampFiche} classeGrille="grille-renfort-snosm" />
          ) : (
            <LectureGroupes groupes={GROUPES_RENFORT} fiche={fiche} classeGrille="grille-renfort-snosm" />
          ))}

        {sousOnglet === 'avis' &&
          (edition ? (
            <BlocChamps groupes={GROUPES_AVIS} brouillon={brouillonFiche} majChamp={majChampFiche} secouristes={personnel} />
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
                  <>
                    <div className="grille-details-fiche" style={{ marginTop: 10 }}>
                      {CHAMPS_AVALANCHE_NIVEAU_TYPE.map((c) => (
                        <ChampSnosm key={c.cle} description={c} valeur={brouillonFiche[c.cle]} onChange={(v) => majChampFiche(c.cle, v)} />
                      ))}
                    </div>
                    <div className="schemas-avalanche-cote-a-cote">
                      <SchemaAvalanche valeurs={brouillonFiche} onChange={majChampFiche} />
                      <div className="schemas-avalanche-colonne">
                        <ChampSnosm
                          description={CHAMP_ORIENTATION_AVALANCHE}
                          valeur={brouillonFiche.snosm_avalanche_orientation}
                          onChange={(v) => majChampFiche('snosm_avalanche_orientation', v)}
                        />
                        <ChampSnosm
                          description={CHAMP_TAILLE_AVALANCHE}
                          valeur={brouillonFiche.snosm_avalanche_taille}
                          onChange={(v) => majChampFiche('snosm_avalanche_taille', v)}
                        />
                      </div>
                    </div>
                    <div className="grille-details-fiche" style={{ marginTop: 10 }}>
                      {CHAMPS_AVALANCHE_HORAIRES.map((c) => (
                        <ChampSnosm key={c.cle} description={c} valeur={brouillonFiche[c.cle]} onChange={(v) => majChampFiche(c.cle, v)} />
                      ))}
                    </div>
                    <div className="grille-details-fiche" style={{ marginTop: 10 }}>
                      {CHAMPS_AVALANCHE_BILAN.map((c) => (
                        <ChampSnosm key={c.cle} description={c} valeur={brouillonFiche[c.cle]} onChange={(v) => majChampFiche(c.cle, v)} />
                      ))}
                    </div>
                  </>
                )}
              </>
            ) : fiche.snosm_avalanche ? (
              <>
                <SchemaAvalanche valeurs={fiche} onChange={() => {}} lecture />
                <div className="grille-details-fiche">
                  <ChampsLecture champs={CHAMPS_AVALANCHE_EVENEMENT} source={fiche} />
                </div>
              </>
            ) : (
              <p className="aide">Pas d’avalanche renseignée pour cette intervention.</p>
            )}
          </div>
        )}

        {sousOnglet === 'implique' && (
          <>
            {edition && !verrouillee && (
              <button type="button" className="bouton-secondaire" onClick={ajouterImplique} style={{ marginBottom: 12 }}>
                + Ajouter un impliqué
              </button>
            )}
            {(fiche.victimes ?? []).length === 0 && <p className="aide">Aucune victime enregistrée.</p>}
            {(fiche.victimes ?? []).map((v) => {
              const avalancheVictime = edition
                ? brouillonFiche.snosm_avalanche || brouillonVictimes[v.id]?.snosm_victime_avalanche
                : fiche.snosm_avalanche || v.snosm_victime_avalanche
              return (
                <div className="carte-victime" key={v.id}>
                  <div className="entete-carte-victime">
                    <IconePersonneVictime />
                    <strong>Impliqué(e) {v.local_id ?? ''}</strong>
                  </div>
                  {edition ? (
                    <>
                      <div className="ligne-statut-avalanche-snosm">
                        <ChampSnosm
                          description={CHAMP_STATUT_IMPLIQUE}
                          valeur={brouillonVictimes[v.id]?.snosm_statut}
                          onChange={(val) => majChampVictime(v.id, 'snosm_statut', val)}
                        />
                        <ChampSnosm
                          description={CHAMP_VICTIME_AVALANCHE}
                          valeur={brouillonVictimes[v.id]?.snosm_victime_avalanche}
                          onChange={(val) => majChampVictime(v.id, 'snosm_victime_avalanche', val)}
                        />
                      </div>
                      {GROUPES_IMPLIQUE.map((groupe, i) => (
                        <div className="grille-details-fiche" style={{ marginTop: i === 0 ? 8 : 10 }} key={i}>
                          {groupe.map((c) => (
                            <ChampSnosm
                              key={c.cle}
                              description={c}
                              valeur={brouillonVictimes[v.id]?.[c.cle]}
                              onChange={(val) => majChampVictime(v.id, c.cle, val)}
                              brouillon={brouillonVictimes[v.id]}
                            />
                          ))}
                        </div>
                      ))}
                      {avalancheVictime && (
                        <>
                          <h4 style={{ marginTop: 12 }}>Avalanche — cette victime</h4>
                          <div className="grille-details-fiche">
                            {CHAMPS_AVALANCHE_VICTIME.map((c) => (
                              <ChampSnosm
                                key={c.cle}
                                description={c}
                                valeur={brouillonVictimes[v.id]?.[c.cle]}
                                onChange={(val) => majChampVictime(v.id, c.cle, val)}
                                brouillon={brouillonVictimes[v.id]}
                              />
                            ))}
                          </div>
                        </>
                      )}
                    </>
                  ) : (
                    <>
                      <div className="ligne-statut-avalanche-snosm">
                        <Detail label="Statut">{v.snosm_statut || '—'}</Detail>
                        <Detail label="Victime avalanche">{v.snosm_victime_avalanche ? 'Oui' : 'Non'}</Detail>
                      </div>
                      {GROUPES_IMPLIQUE.map((groupe, i) => (
                        <div className="grille-details-fiche" style={{ marginTop: i === 0 ? 8 : 10 }} key={i}>
                          <ChampsLecture champs={groupe} source={v} />
                        </div>
                      ))}
                      {avalancheVictime && (
                        <div className="grille-details-fiche">
                          <ChampsLecture champs={CHAMPS_AVALANCHE_VICTIME} source={v} />
                        </div>
                      )}
                    </>
                  )}
                </div>
              )
            })}
          </>
        )}
      </div>

      <div className="actions-edition-fiche">
        {edition && (
          <>
            <button type="button" className="bouton-secondaire" onClick={() => setConfirmerAnnulation(true)} disabled={enregistrement}>
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

      {confirmerAnnulation && (
        <div className="fond-confirmation-snosm" onClick={() => setConfirmerAnnulation(false)}>
          <div className="boite-confirmation-snosm" role="alertdialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <p>Fermer sans enregistrer les modifications ?</p>
            <div className="actions-confirmation-snosm">
              <button type="button" className="bouton-secondaire" onClick={() => setConfirmerAnnulation(false)}>
                Non, continuer
              </button>
              <button type="button" className="bouton-principal" onClick={annulerEdition}>
                Oui, fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/** Toujours affiché, même vide (« — ») — un onglet pas encore rempli doit montrer ses champs, pas disparaître. */
function ChampsLecture({ champs, source }) {
  return champs
    .filter((c) => !c.visibleSi || c.visibleSi(source))
    .map((c) => {
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

function LectureGroupes({ groupes, fiche, classeGrille = '' }) {
  return groupes.map((groupe, i) => (
    <div className="section-fiche" key={groupe.titre || i}>
      {groupe.titre && <h4>{groupe.titre}</h4>}
      <div className={`grille-details-fiche${classeGrille ? ' ' + classeGrille : ''}`}>
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

function TableauEffectifs({ effectifs, verrouillee, onAjouter, onMaj, onSupprimer, secouristes, secouristesConnus }) {
  return (
    <div className="tableau-effectifs-snosm">
      {/* Masqué quand des secouristes Cim'Alerte/effectif du jour sont déjà proposés juste au-dessus
          (boutons à cliquer pour les ajouter) — « aucun effectif » y serait trompeur : quelqu'un est
          bien connu sur cette intervention, juste pas encore ajouté comme ligne d'effectif ici. */}
      {effectifs.length === 0 && !secouristesConnus && <p className="aide">Aucun effectif renseigné.</p>}
      {effectifs.map((e) => (
        <LigneEffectif key={e.id} effectif={e} verrouillee={verrouillee} onMaj={onMaj} onSupprimer={onSupprimer} secouristes={secouristes} />
      ))}
      {!verrouillee && (
        <button type="button" className="bouton-secondaire" onClick={onAjouter}>
          + Ajouter un effectif
        </button>
      )}
    </div>
  )
}

/**
 * Ordre Personne (avec suggestions au fil de la saisie, tout l'annuaire) puis Rôle
 * (3 valeurs fixes, jamais de texte libre) — décision utilisateur, dans cet ordre-là
 * précisément. Dépassement horaire déplie une heure de fin quand coché.
 */
function LigneEffectif({ effectif, verrouillee, onMaj, onSupprimer, secouristes }) {
  const [personne, setPersonne] = useState(effectif.personne ?? '')
  const [ouvert, setOuvert] = useState(false)
  // Le clic sur une suggestion (onMouseDown) enregistre déjà la valeur choisie ; sans
  // ce drapeau, le blur qui suit immédiatement après relirait "personne" tel qu'il
  // était avant le clic (fermeture de closure figée sur l'ancien rendu) et écraserait
  // la sélection avec le texte tapé juste avant — une vraie régression déjà observée.
  const selectionViaSuggestionRef = useRef(false)
  const filtre = personne.trim().toLowerCase()
  const suggestions = (filtre ? (secouristes ?? []).filter((s) => s.toLowerCase().includes(filtre)) : secouristes ?? []).slice(0, 8)

  return (
    <div className="ligne-effectif-snosm">
      <div className="champ-personne-effectif-snosm">
        <input
          type="text"
          placeholder="Personne"
          value={personne}
          disabled={verrouillee}
          autoComplete="off"
          onChange={(e) => {
            setPersonne(e.target.value)
            setOuvert(true)
          }}
          onFocus={() => setOuvert(true)}
          onBlur={() => {
            setTimeout(() => setOuvert(false), 150)
            if (selectionViaSuggestionRef.current) {
              selectionViaSuggestionRef.current = false
              return
            }
            if (personne !== effectif.personne) onMaj(effectif.id, { personne })
          }}
        />
        {ouvert && suggestions.length > 0 && (
          <ul className="suggestions-autocomplete-snosm">
            {suggestions.map((s) => (
              <li key={s}>
                <button
                  type="button"
                  onMouseDown={() => {
                    selectionViaSuggestionRef.current = true
                    setPersonne(s)
                    onMaj(effectif.id, { personne: s })
                  }}
                >
                  {s}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <select value={effectif.role ?? ''} disabled={verrouillee} onChange={(e) => onMaj(effectif.id, { role: e.target.value })}>
        <option value="">Rôle —</option>
        {OPTIONS_ROLE_EFFECTIF.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>
      <div className="depassement-effectif-snosm">
        <label className="champ-checkbox-snosm">
          <input
            type="checkbox"
            checked={Boolean(effectif.depassement_horaire)}
            disabled={verrouillee}
            onChange={(e) => {
              const coche = e.target.checked
              // Précoche la date du jour (modifiable) pour qu'il n'y ait plus que l'heure à ajuster.
              const heure_depassement = coche ? (effectif.heure_depassement ?? new Date().toISOString()) : null
              onMaj(effectif.id, { depassement_horaire: coche, heure_depassement })
            }}
          />
          Dépassement horaire
        </label>
        {effectif.depassement_horaire && (
          <ChampDateTime
            label="Heure de fin de service"
            valeur={effectif.heure_depassement}
            onChange={(v) => onMaj(effectif.id, { heure_depassement: v })}
            disabled={verrouillee}
          />
        )}
      </div>
      {!verrouillee && (
        <button type="button" className="fermer-modale" onClick={() => onSupprimer(effectif.id)} aria-label="Supprimer cet effectif">
          ×
        </button>
      )}
    </div>
  )
}
