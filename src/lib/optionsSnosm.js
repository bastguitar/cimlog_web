/**
 * Vocabulaire imposé par le SNOSM pour les champs à choix fermé du
 * formulaire — recoupé entre le référentiel SNOSM fourni par l'utilisateur
 * (tableur) et l'export réel des télégrammes Grigoletto (comptage des
 * valeurs effectivement utilisées), puis validé point par point avec
 * l'utilisateur. Toute cette correspondance vit ici, pas dans l'Edge
 * Function Grist ni dans Supabase : Cim'Log ne change que sa propre
 * présentation, jamais le format d'échange.
 *
 * Exception : hélicoptères et activités ne sont PAS codés en dur ici —
 * Cim'Alerte fait foi sur ces deux vocabulaires (poussés automatiquement dans
 * ReferentielHelicos/ReferentielActivites, voir chargerReferentiels dans
 * src/lib/registre.js et l'action `referentiels` de l'Edge Function grist).
 */
import { groupeDe } from './sections'

// En minuscules (décision utilisateur), sans accent ajouté — même convention que le reste du
// vocabulaire SNOSM déjà passé en minuscules (onglet Avalanche) : lettre pour lettre, pas de
// normalisation orthographique. Cim'Log ne change que sa propre présentation, jamais le format
// d'échange avec le SNOSM.
export const OPTIONS_ENCADREMENT = ['encadrement associatif', 'encadrement professionnel', 'non encadre']

export const OPTIONS_DIPLOME_ENCADRANT = [
  'guide de haute montagne',
  'moniteur / monitrice de ski',
  'amm',
  'dejeps canyonisme',
  'dejeps escalade',
  'autre',
]

// Confirmé directement par l'utilisateur sur le formulaire SNOSM (le
// tableur fourni n'en listait que 3 — il manquait "Autre à préciser" et
// "Village / Fond de vallée", ajoutés à l'app après le tableur).
export const OPTIONS_TYPE_DOMAINE = [
  'Domaine montagne',
  'Domaine skiable sur piste',
  'Domaine skiable hors-piste',
  'Autre à préciser',
  'Village / Fond de vallée',
]

export const OPTIONS_LOCALISATION_PISTE = [
  'competition',
  'hors piste gravitaire',
  'montagne',
  'piste bleue',
  'piste noire',
  'piste rouge',
  'piste verte',
  'snowpark et snowcross',
  'village',
]

export const OPTIONS_NEIGE = [
  'dure',
  'douce',
  'verglacee',
  'humide / de printemps',
  'poudreuse / fraiche',
  'croutee',
  'bosselee',
  'faible enneigement',
]

// Confirmé directement par l'utilisateur — nouveau menu déroulant dédié
// dans l'onglet SNOSM, le champ Cim'Alerte équivalent (TypeOperation) n'est
// jamais alimenté.
export const OPTIONS_NATURE_OPERATION = [
  'Secours en montagne',
  'Mission SAMU',
  'Plan secours spéléologie',
  'Assistance judiciaire',
  'Plan SATER',
]

// Confirmé directement par l'utilisateur : nouveau menu déroulant dédié,
// séparé du champ météo Cim'Alerte (texte libre).
export const OPTIONS_METEO = [
  'AUTRE',
  'BROUILLARD',
  'ENSOLEILLE / BEAU TEMPS',
  'JOUR BLANC',
  'NEIGEUX',
  'NUAGEUX / COUVERT',
  'NUIT',
  'PLUVIEUX',
  'TEMPETE DE NEIGE',
  'VENTEUX',
]

export const OPTIONS_ETAT_MEDICAL = ['Décédé traumatique', 'Décédé non traumatique', 'Blessé', 'Disparu', 'Malade', 'Indemne']

export const OPTIONS_MEDICALISATION = ['Oui', 'Non', 'Non obtenue']
export const OPTIONS_SUIVI_JUDICIAIRE = ['Oui', 'Non', 'Indéterminé']
export const OPTIONS_MEDIAS_INFORMES = ['Oui', 'Non']
export const OPTIONS_STATUT_PERSONNE = ['Victime', 'Témoin', 'Encadrant']

// Vocabulaire du tableur SNOSM (capture d'écran fournie) — quelques fautes de frappe évidentes du
// tableur d'origine corrigées (PREFCTURE -> PREFECTURE).
export const OPTIONS_AUTORITES_AVISEES = [
  'DCCRS',
  'DZCRS SUD',
  'DZCRS SUD-EST',
  'PROCUREUR DE LA REPUBLIQUE',
  'PREFECTURE DES ALPES-MARITIMES',
  'PREFECTURE DE HAUTE SAVOIE',
  'PREFECTURE DE HAUTE GARONNE',
  'PREFECTURE DES HAUTES ALPES',
  'PREFECTURE HAUTES PYRENEES',
  'PREFECTURE ISERE',
  'PREFECTURE PYRENEES ORIENTALES',
  'PREFECTURE SAVOIE',
  'MAIRE DE LA COMMUNE',
  'CONSULAT / AMBASSADE',
  'CRS ALPES',
  'CRS PYRENEES',
  'CORG',
]

// Zone/région/préfecture par section — même correspondance que telegrammeTO.js (voir REGION_PAR_GROUPE
// là-bas), reprise ici pour préremplir "Autorités avisée(s)". Seule la zone Alpes est confirmée sur un
// exemplaire réel : pas de zone par défaut pour les Pyrénées tant que ce n'est pas vérifié, plutôt que deviner.
const REGION_PAR_GROUPE_AUTORITES = { CRS38: 'ALPES', CRS05: 'ALPES', CRS73: 'ALPES', CRS06: 'ALPES', CRS65: 'PYRENEES', CRS66: 'PYRENEES' }
const ZONE_PAR_REGION_AUTORITES = { ALPES: 'DZCRS SUD-EST' }
const PREFECTURE_TAG_PAR_DEPARTEMENT = {
  '06': 'PREFECTURE DES ALPES-MARITIMES',
  '74': 'PREFECTURE DE HAUTE SAVOIE',
  '31': 'PREFECTURE DE HAUTE GARONNE',
  '05': 'PREFECTURE DES HAUTES ALPES',
  '65': 'PREFECTURE HAUTES PYRENEES',
  '38': 'PREFECTURE ISERE',
  '66': 'PREFECTURE PYRENEES ORIENTALES',
  '73': 'PREFECTURE SAVOIE',
}

/** Autorités avisées par défaut selon la section/le département — juste un point de départ, toujours modifiable. */
export function autoritesAviseesDefaut(squadCode, county) {
  const region = REGION_PAR_GROUPE_AUTORITES[groupeDe(squadCode)] ?? null
  const tags = ['DCCRS']
  const zone = region ? ZONE_PAR_REGION_AUTORITES[region] : null
  if (zone) tags.push(zone)
  if (region === 'ALPES') tags.push('CRS ALPES')
  if (region === 'PYRENEES') tags.push('CRS PYRENEES')
  const prefecture = county ? PREFECTURE_TAG_PAR_DEPARTEMENT[county] : null
  if (prefecture) tags.push(prefecture)
  return tags
}

/** StatutPersonne Cim'Alerte (minuscules sans accent : victime/temoin/encadrant) -> libellé du radio SNOSM. */
const STATUT_PERSONNE_PAR_CODE = { victime: 'Victime', temoin: 'Témoin', encadrant: 'Encadrant' }
export const snosmStatutDepuis = (statutPersonne) => STATUT_PERSONNE_PAR_CODE[statutPersonne] ?? null

// Vocabulaire complété par l'utilisateur (liste SNOSM plus complète que la précédente, manquaient
// notamment Bassin/Doigts/Organes génitaux/Rachis (3 zones)/Tibia péroné) — en minuscules avec
// accents (décision utilisateur, même convention que le reste du vocabulaire SNOSM), fautes de
// frappe du tableur d'origine corrigées au passage (pas de changement de sens, juste l'orthographe).
export const OPTIONS_LOCALISATION_BLESSURE = [
  'abdomen',
  'avant-bras',
  'bassin',
  'bras',
  'cheville',
  'clavicule',
  'cou',
  'coude',
  'doigts',
  'épaule',
  'fémur',
  'genou',
  'indemne',
  'main',
  'non traumatique',
  'organes génitaux',
  'pied',
  'poignet',
  'polytraumatismes',
  'rachis cervical',
  'rachis dorsal',
  'rachis lombaire',
  'tête',
  'thorax',
  'tibia péroné',
  'visage',
  'autre',
]

export const OPTIONS_TYPE_BLESSURE = [
  'arrêt cardio-respiratoire',
  'brûlure',
  'choc émotionnel',
  'condition physique (fatigue, hypoglycémie)',
  'contusion / hématome',
  "crise d'angoisse / tétanie / spasmophilie",
  "crise d'épilepsie",
  'décès',
  'déficit neurologique (de type avc)',
  'dermabrasion',
  'douleurs thoraciques',
  'gelure',
  'hypothermie associée',
  'hypothermie isolée',
  'indemne',
  'malaise',
  'mam',
  'nausée / vomissement',
  'plaie hémorragique',
  'plaie non hémorragique',
  'problème ophtalmologique',
  'problème respiratoire',
  'problème musculaire',
  'suspicion alcoolémie / drogue',
  'suspicion hémorragie interne',
  'suspicion entorse',
  'suspicion fracture fermée',
  'suspicion fracture ouverte',
  'suspicion de luxation',
  'trauma crânien avec perte de connaissance',
  'trauma crânien sans perte de connaissance',
  'autre',
]

// Europe d'abord (ordre alphabétique), puis le reste du monde (ordre alphabétique) — décision
// utilisateur. Menu déroulant strict (type 'liste', pas de saisie libre) : couvre la quasi-totalité
// des nationalités rencontrées en intervention, "Autre" en dernier recours sinon.
const PAYS_EUROPE = [
  'Albanie',
  'Allemagne',
  'Andorre',
  'Autriche',
  'Belgique',
  'Biélorussie',
  'Bosnie-Herzégovine',
  'Bulgarie',
  'Chypre',
  'Croatie',
  'Danemark',
  'Espagne',
  'Estonie',
  'Finlande',
  'France',
  'Grèce',
  'Hongrie',
  'Irlande',
  'Islande',
  'Italie',
  'Kosovo',
  'Lettonie',
  'Liechtenstein',
  'Lituanie',
  'Luxembourg',
  'Macédoine du Nord',
  'Malte',
  'Moldavie',
  'Monaco',
  'Monténégro',
  'Norvège',
  'Pays-Bas',
  'Pologne',
  'Portugal',
  'République tchèque',
  'Roumanie',
  'Royaume-Uni',
  'Russie',
  'Saint-Marin',
  'Serbie',
  'Slovaquie',
  'Slovénie',
  'Suède',
  'Suisse',
  'Ukraine',
  'Vatican',
]
const PAYS_RESTE_DU_MONDE = [
  'Afghanistan',
  'Afrique du Sud',
  'Algérie',
  'Angola',
  'Arabie saoudite',
  'Argentine',
  'Arménie',
  'Australie',
  'Azerbaïdjan',
  'Bahamas',
  'Bahreïn',
  'Bangladesh',
  'Barbade',
  'Belize',
  'Bénin',
  'Bhoutan',
  'Birmanie',
  'Bolivie',
  'Botswana',
  'Brésil',
  'Brunei',
  'Burkina Faso',
  'Burundi',
  'Cambodge',
  'Cameroun',
  'Canada',
  'Cap-Vert',
  'Centrafrique',
  'Chili',
  'Chine',
  'Colombie',
  'Comores',
  'Congo',
  'Congo (RD)',
  'Corée du Nord',
  'Corée du Sud',
  'Costa Rica',
  "Côte d'Ivoire",
  'Cuba',
  'Djibouti',
  'Dominique',
  'Égypte',
  'Émirats arabes unis',
  'Équateur',
  'Érythrée',
  'États-Unis',
  'Éthiopie',
  'Fidji',
  'Gabon',
  'Gambie',
  'Géorgie',
  'Ghana',
  'Grenade',
  'Guatemala',
  'Guinée',
  'Guinée-Bissau',
  'Guinée équatoriale',
  'Guyana',
  'Haïti',
  'Honduras',
  'Inde',
  'Indonésie',
  'Irak',
  'Iran',
  'Israël',
  'Jamaïque',
  'Japon',
  'Jordanie',
  'Kazakhstan',
  'Kenya',
  'Kirghizistan',
  'Kiribati',
  'Koweït',
  'Laos',
  'Lesotho',
  'Liban',
  'Liberia',
  'Libye',
  'Madagascar',
  'Malaisie',
  'Malawi',
  'Maldives',
  'Mali',
  'Maroc',
  'Îles Marshall',
  'Maurice',
  'Mauritanie',
  'Mexique',
  'Micronésie',
  'Mongolie',
  'Mozambique',
  'Namibie',
  'Nauru',
  'Népal',
  'Nicaragua',
  'Niger',
  'Nigeria',
  'Nouvelle-Zélande',
  'Oman',
  'Ouganda',
  'Ouzbékistan',
  'Pakistan',
  'Palaos',
  'Palestine',
  'Panama',
  'Papouasie-Nouvelle-Guinée',
  'Paraguay',
  'Pérou',
  'Philippines',
  'Qatar',
  'République dominicaine',
  'Rwanda',
  'Saint-Christophe-et-Niévès',
  'Saint-Vincent-et-les-Grenadines',
  'Sainte-Lucie',
  'Îles Salomon',
  'Salvador',
  'Samoa',
  'São Tomé-et-Principe',
  'Sénégal',
  'Seychelles',
  'Sierra Leone',
  'Singapour',
  'Somalie',
  'Soudan',
  'Soudan du Sud',
  'Sri Lanka',
  'Suriname',
  'Syrie',
  'Tadjikistan',
  'Tanzanie',
  'Tchad',
  'Thaïlande',
  'Timor oriental',
  'Togo',
  'Tonga',
  'Trinité-et-Tobago',
  'Tunisie',
  'Turkménistan',
  'Turquie',
  'Tuvalu',
  'Uruguay',
  'Vanuatu',
  'Venezuela',
  'Vietnam',
  'Yémen',
  'Zambie',
  'Zimbabwe',
]
export const OPTIONS_PAYS = [...PAYS_EUROPE, ...PAYS_RESTE_DU_MONDE, 'Autre']

export const OPTIONS_CIRCONSTANCES_VICTIME = [
  'AVALANCHE',
  'CHUTE DE PIERRES',
  'CHUTE DE SERAC',
  'FOUDRE',
  'RUPTURE DE MATERIEL',
  'DECOLLAGE OU ATTERISSAGE',
  'VOL',
  'CONDITION PHYSIQUE INSUFFISANTE',
  'DEVISSAGE (PERSONNE ENCORDEE)',
  'EQUIPEMENT DU SUJET NON ADAPTE',
  "ERREUR D'ITINERAIRE",
  'ERREUR TECHNIQUE',
  'GLISSADE OU CHUTE (NON USAGE DE LA CORDE)',
  'NOYADE',
  'CHUTE EN CREVASSE',
  'TEMPETE',
  'ASPHYXIE HORS AVALANCHE',
  'AUTRES',
  '(DOMAINE SKIABLE) CHUTE SOLITAIRE',
  '(DOMAINE SKIABLE) CHUTE CONTRE OBSTACLE NATUREL',
  '(DOMAINE SKIABLE) CHUTE CONTRE OBSTACLE ARTIFICIEL',
  '(DOMAINE SKIABLE) COLLISION ENTRE USAGERS',
  '(DOMAINE SKIABLE) AVALANCHE DEPART SPONTANE',
  '(DOMAINE SKIABLE) PERSONNE EGAREE',
  '(DOMAINE SKIABLE) SAUT DE BARRES',
  '(DOMAINE SKIABLE) GLISSADE',
  '(DOMAINE SKIABLE) EPUISEMENT',
  '(DOMAINE SKIABLE) HYPOTHERMIE',
  '(DOMAINE SKIABLE) NON TRAUMATIQUE',
  "PATHOLOGIES D'ALTITUDE",
]

// Valeurs Cim'Alerte (pas du vocabulaire SNOSM) — reprises de
// alerte_secours_web/src/lib/moyens.js (TYPES_INTERVENTION), pour compléter
// ce champ ici quand une alerte a été mal renseignée à la prise d'appel.
export const OPTIONS_TYPE_INTERVENTION = ['Héliportée', 'Terrestre', 'Mixte']

// HELIPORTE (sans le "e" final) observé sur des fiches réelles en plus de HELIPORTEE — Cim'Alerte
// n'est pas totalement homogène sur l'accord, les deux variantes sont donc acceptées.
const TYPE_OPERATION_PAR_CODE = { HELIPORTEE: 'Héliportée', HELIPORTE: 'Héliportée', TERRESTRE: 'Terrestre', MIXTE: 'Mixte' }

/**
 * Reclasse la valeur brute Cim'Alerte (`type_intervention`, ex. "mixte",
 * "terrestre" — en pratique poussée en minuscules, sans accent parfois) vers
 * l'une des 3 valeurs exactes du radio ci-dessus. Sans cette reclassification,
 * "mixte" ≠ "Mixte" pour le radio (comparaison stricte) : le champ semblait ne
 * jamais se préremplir alors que la valeur était bien là côté Cim'Alerte —
 * bug remonté par l'utilisateur sur une intervention réelle.
 */
export function snosmTypeOperationDepuis(typeBrut) {
  if (!typeBrut) return null
  const t = String(typeBrut)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .trim()
  return TYPE_OPERATION_PAR_CODE[t] ?? null
}

// Valeurs SNOSM exactes (formulaire réel, onglet Général — "Origine de
// l'alerte :") : CODIS / SAMU / CORG / VICTIME TEMOIN / SERVICE DES PISTES /
// AUTRE, accompagnées d'une case de précision libre à part
// (snosm_origine_alerte_autre). Pas de lien avec le référentiel Cim'Alerte
// (`ref_origines_alerte`, bien plus détaillé) — un seul champ SNOSM, pas de
// correspondance à construire.
export const OPTIONS_ORIGINE_ALERTE = ['CODIS', 'SAMU', 'CORG', 'VICTIME TEMOIN', 'SERVICE DES PISTES', 'AUTRE']

/**
 * Reclasse la valeur brute Cim'Alerte (`ref_origines_alerte` : CODIS74,
 * SAMU38, PPSM Versoud, Pisteurs, Témoin en direct…) dans une des 6 cases
 * SNOSM ci-dessus — préremplissage seulement, jamais figé : la valeur reste
 * modifiable ensuite. Ce qui ne rentre dans aucune case reconnue tombe en
 * AUTRE, avec l'intitulé Cim'Alerte reporté tel quel dans la précision plutôt
 * que perdu.
 */
export function snosmOrigineDepuis(origineCimAlerte) {
  if (!origineCimAlerte) return null
  // Accents normalisés : "Témoin"/"Requérant" doivent matcher malgré la casse et les accents variables selon la saisie.
  const o = origineCimAlerte
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
  if (o.startsWith('CODIS')) return 'CODIS'
  if (o.startsWith('SAMU') || o === 'C15') return 'SAMU'
  if (o === 'CORG') return 'CORG'
  if (o.includes('TEMOIN') || o.includes('REQUERANT')) return 'VICTIME TEMOIN'
  if (o.includes('PISTE')) return 'SERVICE DES PISTES'
  return 'AUTRE'
}

// Export réel Grigoletto (table CrsPpsm) — le tableur SNOSM fourni par
// l'utilisateur n'en listait que 17, il manquait BERARDE.
export const OPTIONS_PPSM = [
  'ALBERTVILLE',
  'BASE CANNES',
  'BASE LALOUBERE',
  'BERARDE',
  'BOLQUERE',
  'BRIANCON',
  'COURCHEVEL',
  'GAVARNIE',
  'GRENOBLE',
  'HUEZ',
  'ISOLA',
  'LUCHON',
  'MODANE',
  'NICE',
  'PERPIGNAN',
  'ST LARY',
  'ST MARTIN VESUBIE',
  'TENDE',
  'VERSOUD',
]

/**
 * squad_code Cim'Alerte (poste précis qui a pris l'alerte, pas seulement sa
 * section mère — CRS73C pour Courchevel, CRS38H pour Huez…) -> PPSM. Vérifié
 * en base par la session Cim'Alerte. Un code absent d'ici (poste créé depuis,
 * ou renommé) ne bloque rien : le champ retombe simplement en sélection
 * manuelle, à vérifier auprès de l'utilisateur le cas échéant.
 */
const PPSM_PAR_SQUAD_CODE = {
  CRS05: 'BRIANCON',
  CRS06: 'NICE',
  CRS06V: 'ST MARTIN VESUBIE',
  CRS38: 'GRENOBLE',
  CRS38H: 'HUEZ',
  CRS65: 'ST LARY',
  CRS65L: 'LUCHON',
  CRS65S: 'ST LARY',
  CRS65G: 'GAVARNIE',
  CRS66: 'PERPIGNAN',
  CRS66B: 'BOLQUERE',
  CRS73: 'ALBERTVILLE',
  CRS73C: 'COURCHEVEL',
  CRS73M: 'MODANE',
}

export const ppsmDepuisSquadCode = (squadCode) => PPSM_PAR_SQUAD_CODE[squadCode] ?? null

/**
 * Hélicoptère engagé (valeur Cim'Alerte exacte, voir ReferentielHelicos dans
 * Grist, chargée par chargerReferentiels — src/lib/registre.js) -> PPSM.
 * Table fournie directement par l'utilisateur (couvre Savoie,
 * Isère, Hautes-Alpes, Alpes-Maritimes, Pyrénées-Orientales, section de
 * Lannemezan) — prioritaire sur la déduction par squad_code
 * (ppsmDepuisSquadCode ci-dessus) puisque c'est l'hélicoptère réellement
 * engagé, pas le poste qui a pris l'alerte, qui détermine le PPSM. Un
 * hélicoptère absent d'ici (secteurs non couverts, appareil renommé) ne
 * bloque rien : le champ retombe en sélection manuelle.
 */
const PPSM_PAR_HELICOPTERE = {
  'Choucas 73': 'MODANE',
  'YETI 1': 'COURCHEVEL',
  'YETI 2': 'COURCHEVEL',
  'Dragon 74': 'COURCHEVEL',
  'Dragon 38-1': 'VERSOUD',
  'Dragon 38-2': 'HUEZ',
  'Choucas 05': 'BRIANCON',
  'Dragon 06': 'BASE CANNES',
  'Dragon 66': 'PERPIGNAN',
  'Choucas 65': 'BASE LALOUBERE',
  'Dragon 64': 'GAVARNIE',
}

export const ppsmDepuisHelicoptere = (helicoptere) => PPSM_PAR_HELICOPTERE[helicoptere] ?? null

// "Emploi hélicoptère du SAF justifié par" ne concerne que le SAF (YETI 1/YETI 2,
// les seuls appareils SAF de la liste) — masqué tant qu'aucun des deux n'est parmi
// les hélicoptères engagés (snosm_helicopteres, plusieurs valeurs possibles séparées par ", ").
export const visibleSiHelicoptereSaf = (bf) => {
  const valeurs = (bf.snosm_helicopteres ?? '').split(',').map((v) => v.trim().toUpperCase())
  return valeurs.includes('YETI 1') || valeurs.includes('YETI 2')
}

// Rôle dans le tableau "Effectif CRS Engagé" du SNOSM — volontairement réduit à 3
// valeurs fixes (décision utilisateur), à ne pas confondre avec les rôles libres de
// l'effectif du jour Cim'Alerte (COS, SOM, SOM OPJ, PERMANENCIER, RADIO… propres à
// chaque section, voir effectifs_mc) que roleSnosmDepuis() reclasse ci-dessous.
export const OPTIONS_ROLE_EFFECTIF = ['COS', 'Secouriste', 'Téléphoniste']

/**
 * Reclasse un rôle libre de l'effectif du jour dans l'une des 3 valeurs SNOSM —
 * préremplissage seulement à l'ajout depuis une puce "Effectif du jour", toujours
 * modifiable ensuite. Tout ce qui n'est ni COS ni un rôle radio/permanence tombe en
 * Secouriste par défaut (le cas le plus fréquent sur le terrain).
 */
export function roleSnosmDepuis(roleBrut) {
  const r = (roleBrut ?? '').toUpperCase()
  if (r.includes('COS')) return 'COS'
  if (r.includes('PERMANENCIER') || r.includes('RADIO') || r.includes('TELEPHONISTE')) return 'Téléphoniste'
  return 'Secouriste'
}

// Vocabulaire SNOSM (tableur fourni par l'utilisateur) pour le sous-bloc
// avalanche par victime — comptages déjà recoupés en début de chantier
// (DURETE DE LA NEIGE/TETE : 5, OBSTACLES/ECOULEMENT : 6, ENVIRONNEMENT : 8).
// En minuscules (décision utilisateur — sauf Niveau de risque, gardé tel quel) : Cim'Log ne change
// que sa propre présentation, jamais le format d'échange avec le SNOSM.
export const OPTIONS_DURETE_NEIGE = ['faible (poing)', 'faible (4 doigts)', 'moyen (1 doigt)', 'forte (1 crayon)', 'forte (1 couteau)']
export const OPTIONS_OBSTACLES = ['rocher', 'arbre', 'barre rocheuse', 'barre de serac', 'couloir', 'autre']
export const OPTIONS_ENVIRONNEMENT_AVALANCHE = ['ravine', 'thalweg', 'creux', 'doline', 'gypsiere', "cours d'eau", 'lac', 'crevasse / rimaye']

// Valeurs reprises directement des captures du vrai formulaire (pas de
// tableur pour celles-ci, juste Oui/Non/Non plus complexe pour certaines).
export const OPTIONS_OUI_NON_NE_SAIS_PAS = ['oui', 'non', 'ne sais pas']
export const OPTIONS_OUI_NON = ['oui', 'non']
export const OPTIONS_GONFLAGE = ['complètement', 'partiellement', 'non']
export const OPTIONS_POSITION_VICTIME_AIRBAG = ['avec ventrale', 'sans ventrale', 'non']
export const OPTIONS_SAC_ET_VICTIME = ['liés', 'séparés']
export const OPTIONS_ALIMENTATION_DVA = ['cartouche', 'électrique']
export const OPTIONS_MOYENS_LOCALISATION_AVALANCHE = ['DVA', 'Recco', 'Chien', 'Sondage', 'Indice de surface', 'Géolocalisation téléphone', 'Autre']
export const OPTIONS_POSITION_1_AVALANCHE = [
  'En surface',
  'Enseveli total',
  'Enseveli partiel critique (tête sous la neige)',
  'Enseveli partiel non critique (tête en dehors de la neige)',
]
export const OPTIONS_POSITION_2_AVALANCHE = ['Sur le ventre', 'Sur le dos', 'Sur le côté', 'Tête en haut', 'Tête en bas']
export const OPTIONS_MATERIEL_AVALANCHE = ['Pelle', 'Sonde', 'RECCO']

export const OPTIONS_NATIONALITE = [
  'Française',
  'Britannique',
  'Allemande',
  'Italienne',
  'Espagnole',
  'Suisse',
  'Belge',
  'Néerlandaise',
  'Portugaise',
  'Autrichienne',
  'Polonaise',
  'Américaine',
  'Canadienne',
  'Irlandaise',
  'Russe',
  'Autre',
]

// Avalanche, niveau événement (comptages déjà recoupés en début de chantier : 5/5/5).
export const OPTIONS_TYPE_AVALANCHE = [
  'neige fraiche',
  'neige soufflee (neige ventee)',
  'neige ancienne(sous couche fragile persistante)',
  'avalanche mouillee (neige humide)',
  'avalanche de glissement (avalanche de fond)',
]
export const OPTIONS_TAILLE_AVALANCHE = [
  'taille 1 : coulee (petite avalanche)',
  'taille 2 : avalanche moyenne',
  'taille 3 : grande avalanche',
  'taille 4 : tres grande avalanche',
  'taille 5 : avalanche exceptionnelle',
]
// Seul champ de l'onglet Avalanche resté en majuscules (décision utilisateur explicite).
export const OPTIONS_NIVEAU_RISQUE = ['1-FAIBLE', '2-LIMITE', '3-MARQUE', '4-FORT', '5-TRES FORT']

// Rose des vents à 16 branches — valeurs universelles, pas du vocabulaire SNOSM propre à vérifier.
// Activités pour lesquelles Type de domaine et Neige se déplient par défaut
// (décision utilisateur) — comparaison insensible à la casse dans
// visibleSiActiviteGlisse ci-dessous, `activity` pouvant porter de la
// casse historique différente (vieilles données Cim'Alerte).
const ACTIVITES_DOMAINE_SKI = [
  'Autres sports de glisse',
  'Luge',
  'Ski de fond',
  'Ski de montagne',
  'Ski de pente raide',
  'Ski de piste',
  'Ski de randonnée',
  'Ski hors piste',
  'Snowboard sur piste',
  'Snowboard hors piste',
]
export const visibleSiActiviteGlisse = (bf) =>
  ACTIVITES_DOMAINE_SKI.some((a) => a.toLowerCase() === String(bf.activity ?? '').toLowerCase())

export const optionsLocalisationPisteSelonDomaine = (bf) => {
  if (bf.snosm_type_domaine === 'Domaine skiable sur piste') {
    return ['competition', 'piste bleue', 'piste noire', 'piste rouge', 'piste verte', 'snowpark et snowcross']
  }
  if (bf.snosm_type_domaine === 'Domaine montagne') return ['hors piste gravitaire', 'montagne', 'competition']
  return null
}

/** Reclasse la valeur brute Cim'Alerte ('F'/'M'/'Feminin'/'Masculin'…) vers 'Femme'/'Homme' (radio SNOSM). */
export function sexeDepuis(sexe) {
  const s = (sexe ?? '').trim().toUpperCase()
  if (s === 'F' || s === 'FEMME' || s === 'FEMININ') return 'Femme'
  if (s === 'M' || s === 'HOMME' || s === 'MASCULIN') return 'Homme'
  return sexe || null
}

/**
 * Ajoute la cinétique à la suite des circonstances, sauf si elle y figure déjà —
 * en pratique, "Circonstances" (Cim'Alerte) contient parfois déjà toute la phrase
 * ("Chute à haute cinétique"), et concaténer "Cinétique" ("Haute cinétique") par-
 * dessus donnait un texte répété ("Chute à haute cinétique à haute cinétique
 * cinétique") — bug remonté par l'utilisateur.
 */
function circonstanceEtCinetique(circonstancesBrut, cinetiqueBrut) {
  if (!cinetiqueBrut) return circonstancesBrut || null
  if (circonstancesBrut.toLowerCase().includes(cinetiqueBrut.toLowerCase())) return circonstancesBrut || null
  const complement = /cin[ée]tique/i.test(cinetiqueBrut) ? `à ${cinetiqueBrut.toLowerCase()}` : `à ${cinetiqueBrut.toLowerCase()} cinétique`
  return [circonstancesBrut, complement].filter(Boolean).join(' ')
}

function texteCirconstancesVictime(v) {
  const morceaux = []
  const sexeAge = [sexeDepuis(v.sexe), v.age ? `${v.age} ans` : null].filter(Boolean).join(' ')
  if (sexeAge) morceaux.push(sexeAge)
  const circonstance = circonstanceEtCinetique(String(v.circonstances ?? '').trim(), String(v.cinetique ?? '').trim())
  if (circonstance) morceaux.push(circonstance)
  return morceaux.join(', ')
}

/**
 * Message de circonstances globales généré depuis les victimes (sexe, âge,
 * circonstances, cinétique — champs Cim'Alerte déjà connus) et l'activité de
 * l'intervention, ex. « Femme 28 ans, Chute à haute cinétique en VTT cross
 * country ». Préremplissage du champ "Circonstances / description" (onglet
 * Intervention) seulement s'il est vide, jamais figé — toujours réécrit à la
 * main ensuite si le brouillon généré ne convient pas.
 */
export function genererCirconstancesGlobales(fiche) {
  const phrases = (fiche.victimes ?? []).map(texteCirconstancesVictime).filter(Boolean)
  const base = phrases.join(' ; ')
  return [base, fiche.activity ? `en ${fiche.activity}` : null].filter(Boolean).join(' ')
}

// Vocabulaire du vrai formulaire SNOSM (tableur fourni par l'utilisateur). Ces deux
// champs sont désormais aussi alimentés directement par Cim'Alerte (saisis en direct
// pendant l'intervention, poussés dans les mêmes colonnes Grist SnosmGestesSecourisme/
// SnosmTechniquesEvacuation) — les menus ci-dessous ne servent qu'à défaut, quand rien
// n'a été renseigné côté Cim'Alerte ni ici.
export const OPTIONS_GESTES_SECOURISME = [
  'POSE ATTELLE DE BRAS',
  'POSE ATTELLE JAMBE',
  'POSE ATTELLE EPAULE',
  'POSE ATTELLE CERVICO-THORACIQUE',
  'POSE COLLIER CERVICAL',
  'POSE CEINTURE PELVIENNE',
  'CONDITIONNEMENT MATELAS COQUILLE',
  'RELEVAGE / CONDITIONNEMENT PERCHE',
  'AIDE A LA MEDICALISATION',
  'MISE EN POSITION LATERALE DE SECURITE',
  'REANIMATION CARDIO-PULMONAIRE',
  'POSE PANSEMENT COMPRESSIF / GARROT',
  'REALISATION PANSEMENT',
  'BILAN SECOURISME',
  'NEANT',
]

export const OPTIONS_TECHNIQUES_EVACUATION = [
  "HELITREUILLAGE CULOTTE/SANGLE D'EVACUATION",
  'HELITREUILLAGE PERCHE',
  'HELITREUILLAGE SUR RELAIS',
  'RECUPERATION EN APPUI PATIN',
  'MISE EN OEUVRE MAIN COURANTE',
  'MISE EN OEUVRE TYROLIENNE / BALANCIER',
  'EVACUATION EN PAROI / CACOLET',
  'DESCENTE TRAINEAU',
  'PORTAGE / BRANCARDAGE',
  'DEPLACEMENT ENCORDE',
]

