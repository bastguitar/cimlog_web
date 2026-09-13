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

export const OPTIONS_ENCADREMENT = ['ENCADREMENT ASSOCIATIF', 'ENCADREMENT PROFESSIONNEL', 'NON ENCADRE']

export const OPTIONS_DIPLOME_ENCADRANT = [
  'GUIDE DE HAUTE MONTAGNE',
  'MONITEUR / MONITRICE DE SKI',
  'AMM',
  'DEJEPS CANYONISME',
  'DEJEPS ESCALADE',
  'AUTRE',
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
  'COMPETITION',
  'HORS PISTE GRAVITAIRE',
  'MONTAGNE',
  'PISTE BLEUE',
  'PISTE NOIRE',
  'PISTE ROUGE',
  'PISTE VERTE',
  'SNOWPARK ET SNOWCROSS',
  'VILLAGE',
]

export const OPTIONS_NEIGE = [
  'DURE',
  'DOUCE',
  'VERGLACEE',
  'HUMIDE / DE PRINTEMPS',
  'POUDREUSE / FRAICHE',
  'CROUTEE',
  'BOSSELEE',
  'FAIBLE ENNEIGEMENT',
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

/** StatutPersonne Cim'Alerte (minuscules sans accent : victime/temoin/encadrant) -> libellé du radio SNOSM. */
const STATUT_PERSONNE_PAR_CODE = { victime: 'Victime', temoin: 'Témoin', encadrant: 'Encadrant' }
export const snosmStatutDepuis = (statutPersonne) => STATUT_PERSONNE_PAR_CODE[statutPersonne] ?? null

export const OPTIONS_LOCALISATION_BLESSURE = [
  'ABDOMEN',
  'AVANT-BRAS',
  'BASSIN',
  'BRAS',
  'CHEVILLE',
  'CLAVICULE',
  'COU',
  'COUDE',
  'DOIGTS',
  'EPAULE',
  'FEMUR',
  'GENOU',
  'INDEMNE',
  'MAIN',
  'NON TRAUMATIQUE',
  'ORGANES GENITAUX',
  'PIED',
  'POIGNET',
  'POLYTRAUMATISMES',
  'RACHIS CERVICAL',
  'RACHIS DORSAL',
  'RACHIS LOMBAIRE',
  'TETE',
  'THORAX',
  'TIBIA PERONE',
  'VISAGE',
  'AUTRE',
]

export const OPTIONS_TYPE_BLESSURE = [
  'ARRET CARDIO-RESPIRATOIRE',
  'BRULURE',
  'CHOC EMOTIONNEL',
  'CONDITION PHYSIQUE(FATIGUE, HYPOGLYCEMIE)',
  'CONTUSION / HEMATOME',
  "CRISE D'ANGOISSE / TETANIE / SPASMOPHILIE",
  "CRISE D'EPILEPSIE",
  'DECES',
  'DEFICIT NEUROLOGIQUE (DE TYPE AVC)',
  'DERMABRASION',
  'DOULEURS THORACIQUES',
  'GELURE',
  'HYPOTHERMIE ASOCIEE',
  'HYPOTHERMIE ISOLEE',
  'INDEMNE',
  'MALAISE',
  'MAM',
  'NAUSEE / VOMISSEMENT',
  'PLAIE HEMORAGIQUE',
  'PLAIE NON HEMORAGIQUE',
  'PROBLEME OPHTALMOLOGIQUE',
  'PROBLEME RESPIRATOIRE',
  'PROBLEME MUSCULAIRE',
  'SUSPICION ALCOOLEMIE / DROGUE',
  'SUSPICION HEMORRAGIE INTERNE',
  'SUSPICION ENTORSE',
  'SUSPICION FRACTURE FERMEE',
  'SUSPICION FRACTURE OUVERTE',
  'SUSPICION DE LUXATION',
  'TRAUMA CRANIEN AVEC PERTE DE CONNAISSANCE',
  'TRAUMA CRANIEN SANS PERTE DE CONNAISSANCE',
  'AUTRE',
]

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
export const OPTIONS_DURETE_NEIGE = ['FAIBLE (POING)', 'FAIBLE (4 DOIGTS)', 'MOYEN (1 DOIGT)', 'FORTE (1 CRAYON)', 'FORTE (1 COUTEAU)']
export const OPTIONS_OBSTACLES = ['ROCHER', 'ARBRE', 'BARRE ROCHEUSE', 'BARRE DE SERAC', 'COULOIR', 'AUTRE']
export const OPTIONS_ENVIRONNEMENT_AVALANCHE = ['RAVINE', 'THALWEG', 'CREUX', 'DOLINE', 'GYPSIERE', "COURS D'EAU", 'LAC', 'CREVASSE / RIMAYE']

// Valeurs reprises directement des captures du vrai formulaire (pas de
// tableur pour celles-ci, juste Oui/Non/Non plus complexe pour certaines).
export const OPTIONS_OUI_NON_NE_SAIS_PAS = ['Oui', 'Non', 'Ne sais pas']
export const OPTIONS_GONFLAGE = ['Complètement', 'Partiellement', 'Non']
export const OPTIONS_POSITION_VICTIME_AIRBAG = ['Avec ventrale', 'Sans ventrale', 'Non']
export const OPTIONS_SAC_ET_VICTIME = ['Liés', 'Séparés']
export const OPTIONS_ALIMENTATION_DVA = ['Cartouche', 'Électrique']

// Avalanche, niveau événement (comptages déjà recoupés en début de chantier : 5/5/5).
export const OPTIONS_TYPE_AVALANCHE = [
  'NEIGE FRAICHE',
  'NEIGE SOUFFLEE (NEIGE VENTEE)',
  'NEIGE ANCIENNE(SOUS COUCHE FRAGILE PERSISTANTE)',
  'AVALANCHE MOUILLEE (NEIGE HUMIDE)',
  'AVALANCHE DE GLISSEMENT (AVALANCHE DE FOND)',
]
export const OPTIONS_TAILLE_AVALANCHE = [
  'TAILLE 1 : PETITE AVALANCHE (COULEE)',
  'TAILLE 2 : AVALANCHE MOYENNE',
  'TAILLE 3 : GRANDE AVALANCHE',
  'TAILLE 4 : TRES GRANDE AVALANCHE',
  'TAILLE 5 : AVALANCHE EXTREMEMENT GRANDE',
]
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
    return ['COMPETITION', 'PISTE BLEUE', 'PISTE NOIRE', 'PISTE ROUGE', 'PISTE VERTE', 'SNOWPARK ET SNOWCROSS']
  }
  if (bf.snosm_type_domaine === 'Domaine montagne') return ['HORS PISTE GRAVITAIRE', 'MONTAGNE', 'COMPETITION']
  return null
}

function libelleSexe(sexe) {
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
  const sexeAge = [libelleSexe(v.sexe), v.age ? `${v.age} ans` : null].filter(Boolean).join(' ')
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

export const OPTIONS_ORIENTATION = [
  'NORD',
  'NORD-NORD-EST',
  'NORD-EST',
  'EST-NORD-EST',
  'EST',
  'EST-SUD-EST',
  'SUD-EST',
  'SUD-SUD-EST',
  'SUD',
  'SUD-SUD-OUEST',
  'SUD-OUEST',
  'OUEST-SUD-OUEST',
  'OUEST',
  'OUEST-NORD-OUEST',
  'NORD-OUEST',
  'NORD-NORD-OUEST',
]
