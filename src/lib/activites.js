/**
 * Pictogramme par activité pratiquée.
 *
 * Sur un téléphone tenu d'une main, en course, l'activité doit se lire avant
 * le texte : elle dit déjà beaucoup de l'intervention à venir — une cascade de
 * glace et une cueillette de champignons n'appellent ni le même matériel ni la
 * même équipe.
 *
 * Les intitulés actuels de `ref_activites` sont ceux d'`activites_nouvelle_liste.sql`
 * (⚠ pas `activites.sql`, un second fichier de migration écrit pour la même
 * table mais jamais exécuté — voir camptocamp.js). PICTOGRAMMES reste malgré
 * tout la liste d'`activites.sql` : la garder ne coûte rien (`cle()` la
 * rapproche déjà de plusieurs intitulés `activites_nouvelle_liste.sql`, ex.
 * « Randonnée pédestre (sur sentier) »), et elle redevient exacte si la
 * liste change à nouveau de ce côté. ANCIENS porte donc, en plus des
 * intitulés hérités de l'ancien logiciel, ceux d'`activites_nouvelle_liste.sql`
 * qu'aucune des deux autres tables n'attrape déjà. Quinze ans de saisie libre
 * ont en plus laissé 135 orthographes différentes dans les fiches reprises :
 * « VTT DH/Enduro », « Ski de randonnée AVALANCHE », « randonnée pedestre »…
 * Toutes gardent leur pictogramme, sans quoi la moitié des repères de la
 * carte porteraient un point d'interrogation.
 *
 * Trois mécanismes, du plus général au plus particulier :
 *   1. une comparaison insensible à la casse, aux accents et à la ponctuation ;
 *   2. le retrait du mot « avalanche », qui s'ajoute à l'activité sans la
 *      changer (« Ski alpin + AVALANCHE ») ;
 *   3. une table des anciens intitulés, pour ce que les deux premiers ne
 *      rattrapent pas.
 *
 * Les valeurs ne sont plus des émoji mais des clés vers le jeu d'icônes en
 * traits de `PictogrammeActivite.jsx` (mobile) — un émoji se dessine
 * différemment d'un téléphone à l'autre (et parfois pas du tout), une icône
 * vectorielle est identique partout.
 */

/** Clé de comparaison : « Ecole d'escalade » et « École d’escalade » se valent. */
const cle = (valeur) =>
  (valeur ?? '')
    .toString()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\bavalanches?\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

/** Liste actuelle, dans l'ordre des familles. */
const PICTOGRAMMES = {
  // Randonnée
  'Chasse - pêche - cueillette': 'chasse',
  'Randonnée pédestre sur sentier': 'sentier',
  Trail: 'course',
  'Randonnée pédestre hors sentier': 'horssentier',

  // Montagne
  Alpinisme: 'alpinisme',
  'Cascade de glace': 'glace',
  'Raquettes à neige': 'raquettes',
  'Ski de montagne': 'montagne',

  // Sport aérien
  Aéronef: 'avion',
  'Base jump': 'basejump',
  'Cerf-volant traction': 'cerfvolant',
  Deltaplane: 'delta',
  Parapente: 'parapente',
  Planeur: 'planeur',
  Speedriding: 'vent',
  ULM: 'ulm',
  Wingsuit: 'wingsuit',

  // Cyclisme
  'Vélo route': 'velo',
  VTT: 'vtt',
  'Autre cycle': 'cycle-autre',

  // Escalade
  'École d’escalade': 'escalade',
  Falaise: 'falaise',

  // Sport aquatique
  Baignade: 'baignade',
  Canyoning: 'canyoning',
  Hydrospeed: 'hydrospeed',
  Kayak: 'kayak',
  Rafting: 'rafting',

  // Divers sport
  'Autre activité sportive': 'sport-autre',
  'PAH - accrobranche': 'accrobranche',
  Équitation: 'equitation',
  Spéléologie: 'speleo',
  'Via-ferrata cordata': 'viaferrata',

  // Travail
  'Travail en hauteur': 'hauteur',
  'Travaux agricoles pastoraux': 'agricole',
  'Travaux forestiers': 'forestier',
  'Autres travaux': 'travaux',

  // Motorisé
  Moto: 'moto',
  Quad: 'quad',
  Voiture: 'voiture',
  Motoneige: 'motoneige',
  'Autre véhicule à moteur': 'vehicule-autre',

  // Divers
  Animaux: 'animal',
  'Autres divers': 'divers',
  'Catastrophe naturelle': 'catastrophe',
  'Refuge tente restaurant altitude': 'refuge',
  Sanitaire: 'sanitaire',
  Suicide: 'alerte-vitale',

  // Stations de ski
  Luge: 'luge',
  'Remontée mécanique': 'remontee',
  'Ski de fond': 'skifond',
  'Ski sur piste': 'skipiste',
  'Ski hors piste': 'skihp',
  'Surf hors piste': 'surf',
  'Autre sport de glisse': 'glisse-autre',
}

/**
 * Intitulés de l'ancien logiciel, conservés dans les fiches reprises.
 *
 * Certains n'ont pas d'équivalent dans la liste actuelle — « Recherche »,
 * « Mission police », « Foudroiement » : ils gardent malgré tout un
 * pictogramme, puisqu'ils restent affichés sur la carte et dans l'historique.
 */
const ANCIENS = {
  'Randonnée pédestre': 'sentier',
  'Randonnée pédestre (migrants)': 'sentier',
  'Randonnée pédestre (migrant)': 'sentier',
  'Randonnée pédestre sur sentier/ bivouac': 'sentier',
  'Randonnee pédestre - Consultation médicale': 'sentier',
  'Recherche - Randonnée pédestre': 'sentier',
  'Recherche personne disparue - Randonnée pédestre': 'sentier',
  'Recherche - Randonnée pésdestre': 'sentier',
  'Randonnée pédestre hors sentier/ via ferrata': 'horssentier',
  'Randonnée glaciaire': 'alpinisme',
  'Ski de randonnée': 'montagne',
  'Ski de randonnée - Chute de sérac': 'montagne',
  'Ski alpin': 'skipiste',
  'Ski de piste': 'skipiste',
  'Mission SAMU - Ski de piste': 'skipiste',
  Snowboard: 'surf',
  'Snowboard hors piste': 'surf',
  'Raquette à neige': 'raquettes',
  'Randonnée en raquettes': 'raquettes',
  'Randonnée pédestre raquette': 'raquettes',
  Escalade: 'falaise',
  'escalade grande voie montagne': 'falaise',
  'Via ferrata': 'viaferrata',
  'Via ferrata/via corda': 'viaferrata',
  'Parapente/Deltaplane': 'parapente',
  Speedflying: 'vent',
  'Wing suit': 'wingsuit',
  'Planeur/aeronef': 'avion',
  'Crash planeur': 'planeur',
  'Crash avion': 'avion',
  Aéronefs: 'avion',
  'VTT DH/Enduro': 'vtt',
  'VTT Cross country': 'vtt',
  'Vélo de route': 'velo',
  'cyclisme sur route': 'velo',
  'AVP (vélo)': 'velo',
  'Moto/Quad': 'moto',
  'Moto tout terrain': 'moto',
  'AVP MOTO TRIAL': 'moto',
  'AVP (moto)': 'moto',
  AVP: 'voiture',
  'Accident route': 'voiture',
  Chasse: 'chasse',
  'Chasse - Pêche – Cueillette': 'chasse',
  Champignon: 'champignon',
  Champignons: 'champignon',
  Equitation: 'equitation',
  Speleo: 'speleo',
  'Refuge/Restaurant': 'refuge',
  'Malaise en refuge': 'refuge',
  // Tout ce qui relève du sanitaire pur : missions SAMU, malaises, TIH.
  Malaise: 'sanitaire',
  'Malaise cardiaque': 'sanitaire',
  'Malaise à domicile': 'sanitaire',
  'Mission SAMU': 'sanitaire',
  'Mission SAMU - Malaise': 'sanitaire',
  'Malaise - Mission SAMU': 'sanitaire',
  'Mission SAMU - Consultation médicale': 'sanitaire',
  'MISSION SAMU - TIH': 'sanitaire',
  'MISSION SAMU - Accident domestique': 'sanitaire',
  'Consultation médicale': 'sanitaire',
  'Accident domestique': 'sanitaire',
  'EVACUATION SANITAIRE': 'sanitaire',
  TIH: 'sanitaire',
  'a domicile': 'sanitaire',
  Noyade: 'hydrospeed',
  'Baignade / Malaise': 'baignade',
  Recherche: 'recherche-personne',
  'Mission police': 'police',
  'Mission police - Assistance': 'police',
  'Mission police - Recherche': 'police',
  'droit commun': 'police',
  Migrants: 'sentier',
  Berger: 'agricole',
  Agriculture: 'agricole',
  'Accident travail (Berger)': 'agricole',
  'Accident de travail': 'travaux',
  'Accident du travail': 'travaux',
  'Piqûre guêpes': 'insecte',
  'Piqûre vipère': 'serpent',
  Foudroiement: 'foudre',
  'Trail - Rando': 'course',

  // Intitulés d'activites_nouvelle_liste.sql (la liste réellement en base,
  // voir le commentaire d'en-tête) qu'aucune comparaison `cle()` avec
  // PICTOGRAMMES ne rattrape — trop éloignés dans leur formulation, pas
  // seulement dans leur ponctuation ou leurs accents.
  'Alpinisme mixte': 'alpinisme',
  'Alpinisme neige et glace': 'alpinisme',
  'Alpinisme rocher': 'alpinisme',
  'Autres activités sportives': 'sport-autre',
  'Autres sports de glisse': 'glisse-autre',
  Canyon: 'canyoning',
  'Chasse-pêche-champignons': 'chasse',
  'Cycles (autres)': 'cycle-autre',
  'Escalade école': 'escalade',
  'Falaise (plusieurs longueurs)': 'falaise',
  "Refuge-tente-restaurant d'altitude": 'refuge',
  'Ski de pente raide': 'montagne',
  'Snowboard sur piste': 'surf',
  'Travaux agricoles': 'agricole',
  'Véhicule à moteur': 'vehicule-autre',
  'Via ferrata / via cordata': 'viaferrata',
}

const PAR_CLE = new Map(
  [...Object.entries(ANCIENS), ...Object.entries(PICTOGRAMMES)].map(([nom, ico]) => [cle(nom), ico])
)

/** Icône « inconnue » plutôt que rien : l'absence de pictogramme se remarque. */
export const pictogrammeActivite = (activite) => PAR_CLE.get(cle(activite)) ?? 'inconnu'

/**
 * Couleur et libellé d'un statut.
 *
 * Source unique, partagée par la web-appli et l'application des secouristes :
 * un même secours doit porter la même couleur sur les deux écrans, faute de
 * quoi une consigne donnée par radio (« le rouge ») ne veut plus rien dire.
 *
 * Vert = équipe encore engagée, rouge = secours terminé : c'est ce qui se lit
 * d'un coup d'œil sur la liste du jour, sans avoir à relire chaque libellé.
 */
export const STATUTS = {
  brouillon: { libelle: 'Prise d’alerte', couleur: '#64748b' },
  en_cours: { libelle: 'En cours', couleur: '#16a34a' },
  terminee: { libelle: 'Terminée', couleur: '#dc2626' },
}

export const statutDe = (code) => STATUTS[code] ?? STATUTS.brouillon
