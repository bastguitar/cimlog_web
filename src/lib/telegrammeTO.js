import { jsPDF } from 'jspdf'
import logoCrsUrl from '../assets/logo-crs.png'
import { groupeDe } from './sections'

/**
 * Génère le « TO » (télégramme officiel, IFSM — Intervention des Formations
 * Spécialisées Montagne) d'une intervention. Deux étapes distinctes :
 *   1. construireModeleTO(fiche, options) — données pures, lues sur les
 *      champs SNOSM réels (formulaire aujourd'hui complet — ce fichier
 *      datait d'avant sa construction, beaucoup de champs restaient
 *      volontairement vides).
 *   2. genererPdfDepuisModele(modele) — construit le PDF à partir de ce
 *      modèle.
 *
 * Le modèle validé (JSON) est sauvegardé sur la fiche (snosm_to_texte,
 * snosm_to_cree_le) — pour re-télécharger exactement le même PDF plus tard
 * (bouton Registre) sans repasser par une régénération. La fiche SNOSM reste
 * modifiable après validation du TO : la vraie synchronisation vers la base
 * SNOSM (Chamonix) se fait plusieurs jours après, on peut donc régénérer un
 * TO à jour entre-temps — pas de verrou associé à snosm_to_cree_le.
 *
 * Mise en page volontairement dense (espacements/tailles de police réduits,
 * champs courts groupés par 2 ou 3 sur une ligne) pour tenir sur un recto —
 * atteint pour une intervention à une victime avec un texte de circonstances
 * courant ; plusieurs victimes ou un texte long font toujours déborder sur
 * une page suivante (mise en page inchangée pour ces cas-là, rien n'est
 * jamais tronqué).
 */

const NOIR = [23, 23, 28]
const GRIS = [110, 110, 118]
const GRIS_CLAIR = [225, 226, 230]
const ROUGE_CRS = [182, 36, 44]
const MARGE = 14

// Zone/région et préfectures — dérivées à partir de ce que l'utilisateur a
// confirmé sur UN exemplaire réel (Alpes/Albertville). Le cas Pyrénées n'a
// pas encore été vérifié sur un vrai document : laissé à compléter plutôt
// que deviné.
const REGION_PAR_GROUPE = {
  CRS38: 'ALPES',
  CRS05: 'ALPES',
  CRS73: 'ALPES',
  CRS06: 'ALPES',
  CRS65: 'PYRÉNÉES',
  CRS66: 'PYRÉNÉES',
}
const ZONE_PAR_REGION = {
  ALPES: 'DIRECTION ZONALE CRS SUD-EST',
}
const PREFECTURE_PAR_DEPARTEMENT = {
  '04': 'ALPES-DE-HAUTE-PROVENCE',
  '05': 'HAUTES-ALPES',
  '06': 'ALPES-MARITIMES',
  '26': 'DRÔME',
  '38': 'ISÈRE',
  '73': 'SAVOIE',
  '74': 'HAUTE-SAVOIE',
  '09': 'ARIÈGE',
  '31': 'HAUTE-GARONNE',
  '64': 'PYRÉNÉES-ATLANTIQUES',
  '65': 'HAUTES-PYRÉNÉES',
  '66': 'PYRÉNÉES-ORIENTALES',
}

function chargerImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = url
  })
}

const formatDateHeureTO = (iso) => {
  if (!iso) return null
  const d = new Date(iso)
  const jour = String(d.getDate()).padStart(2, '0')
  const mois = String(d.getMonth() + 1).padStart(2, '0')
  const heure = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `Le ${jour}/${mois}/${d.getFullYear()} à ${heure}:${min}`
}

/** « 15/09/2026 21:45 » — date + heure de fin de service d'un dépassement horaire (décision utilisateur : la date seule ne suffit pas, un dépassement peut se terminer après minuit). */
const formatDateHeureFinService = (iso) => {
  if (!iso) return null
  const d = new Date(iso)
  const jour = String(d.getDate()).padStart(2, '0')
  const mois = String(d.getMonth() + 1).padStart(2, '0')
  const heure = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${jour}/${mois}/${d.getFullYear()} ${heure}:${min}`
}

/** 1ère lettre en majuscule, le reste en minuscule — même convention que le reste du TO (nationalité,
 * blessures…), décision utilisateur. */
function premiereMajusculeSeule(texte) {
  if (!texte) return texte
  return texte.charAt(0).toUpperCase() + texte.slice(1).toLowerCase()
}

/** « Village - 38380 » -> « 38380 Village », convention des télégrammes officiels. */
function formatCommuneTO(com) {
  if (!com) return null
  const m = com.match(/^(.*?)\s*-\s*(\d{5})\s*$/)
  if (!m) return premiereMajusculeSeule(com)
  return `${m[2]} ${premiereMajusculeSeule(m[1])}`
}

/** « HAUTES-ALPES » -> « Hautes-Alpes » — pour le nom de fichier, pas le PDF (qui reste en majuscules). */
function versTitreCase(texteMajuscule) {
  return texteMajuscule
    .toLowerCase()
    .split(/([\s-])/)
    .map((partie) => (/[\s-]/.test(partie) ? partie : partie.charAt(0).toUpperCase() + partie.slice(1)))
    .join('')
}

function departementNom(fiche) {
  if (!fiche.county) return ''
  return PREFECTURE_PAR_DEPARTEMENT[fiche.county] ?? fiche.county
}

/** « IFSM <n°> <Département> <Nom de la victime principale> » — nom du fichier téléchargé seulement
 * (décision utilisateur : le n° IFSM affiché EN-TÊTE du document reste le code court IFSM-<dépt>-<n°>,
 * ne pas répéter le nom de la victime sur chaque page — seul le fichier téléchargé a besoin d'être
 * identifiable sans l'ouvrir). */
function nomFichierIfsm(fiche, premiereVictimeNom) {
  const departement = departementNom(fiche)
  const morceaux = [`IFSM ${fiche.local_id ?? ''}`.trim(), departement ? versTitreCase(departement) : '', premiereVictimeNom || ''].filter(
    Boolean
  )
  return morceaux.join(' ')
}

// Emoji (drapeaux compris) retirés avant affichage sur le TO — jsPDF ne les rend pas (case vide ou
// glyphe manquant). Tout code point au-delà de 0x2000 est un emoji/symbole dans ce contexte (les
// caractères accentués français utiles restent tous en-dessous, y compris Latin Extended-A/B).
function retirerEmoji(texte) {
  return Array.from(String(texte ?? ''))
    .filter((car) => car.codePointAt(0) < 0x2000)
    .join('')
    .trim()
}

// Ponctuation typographique utilisée volontairement dans ce fichier (tiret cadratin entre
// localisation/type de blessure, par ex.) — gardée en plus de la plage Latin de base ci-dessous.
const PONCTUATION_AUTORISEE = new Set(['—', '–', '’', '‘', '“', '”', '…'])

/**
 * Dernier filet avant impression jsPDF : retire tout caractère que la police par défaut
 * (WinAnsiEncoding) ne sait pas dessiner — emoji en tête — quelle que soit l'origine du texte
 * (saisie directe, ou un TO déjà validé et sauvegardé AVANT ce filet, voir snosm_to_texte). Sans
 * ça, jsPDF n'affiche ni case vide ni erreur : il dessine des caractères illisibles à la place
 * (bug remonté par l'utilisateur sur le champ Nationalité). Latin-1 Supplément + Latin Extended-A
 * (0x017F) couvrent tous les caractères accentués français utiles.
 */
function texteImprimable(valeur) {
  if (valeur == null) return valeur
  const nettoye = Array.from(String(valeur))
    .filter((car) => car.codePointAt(0) <= 0x017f || PONCTUATION_AUTORISEE.has(car))
    .join('')
    .trim()
  return nettoye || null
}

// Vocabulaire du menu déroulant Pays de l'onglet Impliqué (voir OPTIONS_PAYS, optionsSnosm.js) ->
// nationalité (adjectif). Couvre les nationalités les plus fréquentes en intervention ; ce qui n'y
// figure pas (ou est déjà un adjectif, ex. valeur déjà corrigée à la main) est renvoyé tel quel,
// juste nettoyé de tout emoji.
const NATIONALITE_PAR_PAYS = {
  FRANCE: 'Française',
  ALLEMAGNE: 'Allemande',
  ITALIE: 'Italienne',
  ESPAGNE: 'Espagnole',
  SUISSE: 'Suisse',
  BELGIQUE: 'Belge',
  'PAYS-BAS': 'Néerlandaise',
  PORTUGAL: 'Portugaise',
  AUTRICHE: 'Autrichienne',
  POLOGNE: 'Polonaise',
  'ROYAUME-UNI': 'Britannique',
  'ETATS-UNIS': 'Américaine',
  CANADA: 'Canadienne',
  IRLANDE: 'Irlandaise',
  RUSSIE: 'Russe',
}

/** null si 0 (le champ disparaît alors de la mise en page), sinon le nombre en texte. */
function nombreSi(n) {
  return n > 0 ? String(n) : null
}

/** Nationalité affichée sur le TO par le pays (« française », pas « France ») — voir le mot de l'utilisateur en tête de fichier. */
function nationaliteDepuisPays(brut) {
  const nettoye = retirerEmoji(brut)
  if (!nettoye) return null
  const cle = nettoye
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
  return NATIONALITE_PAR_PAYS[cle] ?? nettoye
}

/**
 * Modèle éditable du TO — fonction pure, pas de PDF ici. Chaque champ vient
 * maintenant du vrai formulaire SNOSM (voir FicheSnosm.jsx) plutôt que d'un
 * champ vide comme dans la première version de ce générateur.
 */
export function construireModeleTO(fiche, { sectionNom } = {}) {
  const groupe = groupeDe(fiche.squad_code)
  const region = REGION_PAR_GROUPE[groupe] ?? null
  const zone = region ? (ZONE_PAR_REGION[region] ?? null) : null
  const prefecture = fiche.county ? departementNom(fiche) : null
  const nomDe = sectionNom ? `CRS ${region ?? ''} ${sectionNom}`.replace(/\s+/g, ' ').trim().toUpperCase() : null
  const autoritesDefaut = zone && prefecture && region ? `DCCRS - ${zone} - PRÉFECTURE ${prefecture} - CRS ${region}` : null
  const victimes = fiche.victimes ?? []
  const numeroIfsm = fiche.county ? `IFSM-${fiche.county}-${fiche.local_id}` : `IFSM-${fiche.local_id}`

  return {
    numeroIfsm,
    entete: {
      de: nomDe,
      a: zone,
      pourInformation: prefecture ? `PRÉFECTURE ${prefecture}` : null,
      numeroTexte: fiche.snosm_numero_texte || (fiche.local_id != null ? String(fiche.local_id) : null),
    },
    alerte: {
      origine: fiche.snosm_origine_alerte === 'AUTRE' ? fiche.snosm_origine_alerte_autre : fiche.snosm_origine_alerte,
      alerteLe: formatDateHeureTO(fiche.snosm_alerte_le || fiche.alert_at),
      departLe: formatDateHeureTO(fiche.snosm_depart_le),
      surLesLieux: formatDateHeureTO(fiche.snosm_arrivee_lieux_le),
      finOperation: formatDateHeureTO(fiche.snosm_fin_operation_le || fiche.clotureLe),
    },
    localisation: {
      typeDomaine: fiche.snosm_type_domaine,
      lieuPrecis: fiche.lieu,
      altitude: fiche.alt ? `${fiche.alt} m` : null,
      massif: fiche.massif,
      commune: formatCommuneTO(fiche.com),
    },
    natureOperation: {
      natureIntervention: fiche.snosm_nature_operation || 'Secours en montagne',
      natureActivite: fiche.activity ? premiereMajusculeSeule(fiche.activity) : null,
    },
    circonstances: {
      circonstances: fiche.description,
    },
    moyens: {
      operation: fiche.snosm_type_operation_moyens,
      helicopteres: fiche.snosm_helicopteres,
      ppsm: fiche.snosm_ppsm,
      // Dépassement horaire signalé entre parenthèses, date + heure de fin de service — décision
      // utilisateur : cette information doit remonter sur le TO, pas seulement dans la fiche.
      effectifEngage:
        (fiche.effectifs_engages ?? [])
          .filter((e) => e.personne)
          .map((e) => {
            if (!e.depassement_horaire) return e.personne
            const dateHeure = formatDateHeureFinService(e.heure_depassement)
            return dateHeure ? `${e.personne} (Fin de service à ${dateHeure})` : `${e.personne} (Fin de service)`
          })
          .join(' - ') || null,
      medicalisation: fiche.snosm_medicalisation,
      // Affichés seulement si > 0 (décision utilisateur, même règle que le Bilan) — absents du TO jusqu'ici.
      equipesCynophilesCRS: nombreSi(Number(fiche.snosm_equipes_cynophiles_crs) || 0),
      equipesDrones: nombreSi(Number(fiche.snosm_equipes_drones) || 0),
    },
    compteRendu: {
      gestesSecourisme: fiche.snosm_gestes_secourisme,
      techniquesEvacuation: fiche.snosm_techniques_evacuation,
    },
    bilan: {
      // Affichés seulement si > 0 (décision utilisateur) — null plutôt que "0" pour que la mise en
      // page (qui masque déjà tout champ vide) les fasse disparaître sans logique spécifique ici.
      disparus: fiche.recherche_personne ? '1' : null,
      assistes: nombreSi(victimes.filter((v) => v.snosm_etat_medical === 'Indemne').length),
      blesses: nombreSi(victimes.filter((v) => v.snosm_etat_medical === 'Blessé').length),
      decedes: nombreSi(victimes.filter((v) => (v.snosm_etat_medical || '').startsWith('Décédé')).length),
    },
    victimes: victimes.map((v) => ({
      id: v.id,
      statut: v.snosm_statut || 'Victime',
      nom: v.nom,
      prenom: v.prenom,
      sexe: v.sexe,
      dateNaissance: v.date_naissance ? new Date(v.date_naissance).toLocaleDateString('fr-FR') : null,
      nationalite: nationaliteDepuisPays(v.nationalite),
      telephone: v.telephone,
      etatMedical: v.snosm_etat_medical,
      // Minuscules (décision utilisateur) — la mise en majuscules ne sert qu'aux menus de saisie.
      circonstance: v.snosm_circonstances_liste ? v.snosm_circonstances_liste.toLowerCase() : null,
      natureBlessures: [v.snosm_localisation_blessure, v.snosm_type_blessure].filter(Boolean).join(' — ').toLowerCase() || null,
      destination: v.snosm_destination,
    })),
    judiciaire: {
      suiviJudiciaire: fiche.snosm_suivi_judiciaire,
      // Pas de directeur d'enquête à afficher si aucun suivi judiciaire (décision utilisateur).
      directeurEnquete: fiche.snosm_suivi_judiciaire === 'Non' ? null : fiche.snosm_directeur_enquete,
    },
    autorites: {
      autoritesAvisees: fiche.snosm_autorites_avisees || autoritesDefaut,
      mediasInformes: fiche.snosm_medias_informes,
      avisDivers: fiche.snosm_avis_divers,
    },
    finalisation: {
      redacteur: fiche.snosm_redacteur,
      signataire: fiche.snosm_signataire,
    },
  }
}

/**
 * Classe utilitaire : place le curseur vertical, gère les sauts de page (en
 * redessinant un en-tête compact + le logo sur chaque nouvelle page) et
 * fournit les blocs de mise en page (titre de section, champ label/valeur,
 * paire de champs sur une ligne).
 */
class MisePage {
  constructor(doc, logo, titreCourt) {
    this.doc = doc
    this.logo = logo
    this.titreCourt = titreCourt
    this.largeur = doc.internal.pageSize.getWidth()
    this.hauteur = doc.internal.pageSize.getHeight()
    this.y = MARGE
  }

  /** Réserve `h` mm ; saute de page avant si nécessaire. */
  espace(h) {
    if (this.y + h > this.hauteur - 12) {
      this.doc.addPage()
      this.y = MARGE
      this.enTeteCourant()
    }
    return this.y
  }

  enTeteCourant() {
    if (this.logo) this.doc.addImage(this.logo, 'PNG', this.largeur - MARGE - 12, 9, 12, 15)
    this.doc.setFont(undefined, 'bold')
    this.doc.setFontSize(8)
    this.doc.setTextColor(...GRIS)
    this.doc.text(this.titreCourt, MARGE, 13)
    this.doc.setDrawColor(...GRIS_CLAIR)
    // La ligne s'arrête avant l'écusson plutôt que de courir sur toute la largeur en-dessous.
    this.doc.line(MARGE, 18, this.largeur - MARGE - 12 - 5, 18)
    this.y = 24
  }

  titreSection(numero, titre) {
    this.espace(8)
    this.doc.setFillColor(...ROUGE_CRS)
    this.doc.rect(MARGE, this.y - 3, 3.5, 3.5, 'F')
    this.doc.setFont(undefined, 'bold')
    this.doc.setFontSize(9)
    this.doc.setTextColor(...NOIR)
    this.doc.text(`${numero} — ${titre}`, MARGE + 6, this.y)
    this.doc.setDrawColor(...GRIS_CLAIR)
    this.doc.line(MARGE, this.y + 2, this.largeur - MARGE, this.y + 2)
    this.y += 5.5
  }

  /**
   * Un champ « Label : valeur » — la valeur suit toujours le label sur la
   * même ligne, juste après les deux-points (décision utilisateur : plus de
   * renvoi à la ligne suivante même pour un label long, la colonne de valeur
   * s'ajuste à la largeur du label au lieu d'une colonne fixe). Rien n'est
   * dessiné si la valeur est vide — un champ non renseigné n'apparaît pas du
   * tout sur le TO plutôt que de laisser des pointillés à remplir à la main.
   */
  champ(label, valeurBrute) {
    const valeur = texteImprimable(valeurBrute)
    if (!valeur) return
    this.doc.setFont(undefined, 'bold')
    this.doc.setFontSize(7.5)
    const labelAvecEspace = label.endsWith(' ') ? label : `${label} `
    // + 1 : un espace en fin de chaîne ne se voit pas toujours à l'affichage (largeur mesurée mais
    // visuellement collée à la valeur suivante selon la police) — même filet que champsDoubles, qui
    // ajoute sa propre marge fixe plutôt que de compter sur le seul espace texte.
    const xValeur = MARGE + this.doc.getTextWidth(labelAvecEspace) + 1
    const largeurValeur = this.largeur - MARGE - xValeur
    const lignes = this.doc.splitTextToSize(valeur, largeurValeur)
    this.espace(4.2 * lignes.length + 1)
    this.doc.setTextColor(...NOIR)
    this.doc.text(labelAvecEspace, MARGE, this.y)
    this.doc.setFont(undefined, 'normal')
    this.doc.text(lignes, xValeur, this.y)
    this.y += 4.2 * lignes.length + 1
  }

  /** Deux ou trois champs courts côte à côte (dates, altitude/massif, opération/hélico/PPSM…) — ceux
   * sans valeur sont retirés de la ligne (même règle que champ() ci-dessus), la ligne entière est
   * sautée si plus aucun des champs du groupe n'est renseigné. */
  champsDoubles(pairesBrutes) {
    const remplies = pairesBrutes.map(([label, valeur]) => [label, texteImprimable(valeur)]).filter(([, valeur]) => valeur)
    if (remplies.length === 0) return
    this.espace(5.5)
    const y = this.y
    const largeurColonne = (this.largeur - MARGE * 2) / remplies.length
    remplies.forEach(([label, valeur], i) => {
      const x = MARGE + i * largeurColonne
      this.doc.setFont(undefined, 'bold')
      this.doc.setFontSize(7.5)
      this.doc.setTextColor(...NOIR)
      this.doc.text(label, x, y)
      const largeurLabel = this.doc.getTextWidth(label) + 1.5
      this.doc.setFont(undefined, 'normal')
      this.doc.text(valeur, x + largeurLabel, y)
    })
    this.y += 5.5
  }

  /** Comme champsDoubles, mais TOUJOURS affiché même vide (pointillés à défaut) — réservé au bloc de
   * signature final (Rédacteur/Signataire) : contrairement au reste du TO, cette ligne doit rester
   * visible même non renseignée, pour être complétée à la main sur le document imprimé. */
  champsDoublesToujours(pairesBrutes) {
    this.espace(5.5)
    const y = this.y
    const largeurColonne = (this.largeur - MARGE * 2) / pairesBrutes.length
    pairesBrutes.forEach(([label, valeurBrute], i) => {
      const valeur = texteImprimable(valeurBrute)
      const x = MARGE + i * largeurColonne
      this.doc.setFont(undefined, 'bold')
      this.doc.setFontSize(7.5)
      this.doc.setTextColor(...NOIR)
      this.doc.text(label, x, y)
      const largeurLabel = this.doc.getTextWidth(label) + 1.5
      this.doc.setFont(undefined, valeur ? 'normal' : 'italic')
      this.doc.setTextColor(...(valeur ? NOIR : GRIS))
      this.doc.text(valeur || '……………', x + largeurLabel, y)
    })
    this.y += 5.5
  }

  espaceur(h = 1.5) {
    this.y += h
  }
}

/** Construit le PDF à partir d'un modèle (édité ou non par l'utilisateur) — fonction pure, ne télécharge rien. */
export async function genererPdfDepuisModele(modele) {
  const doc = new jsPDF()
  const logo = await chargerImage(logoCrsUrl).catch(() => null)
  const page = new MisePage(doc, logo, `Intervention des Formations Spécialisées Montagne n° ${modele.numeroIfsm}`)

  // ---- En-tête ------------------------------------------------------------
  // Mise en page dense (voir commentaire en tête de fichier) : logo et police réduits, DE/À et
  // Pour information/N° de texte groupés par 2 au lieu de 4 lignes séparées.
  if (logo) doc.addImage(logo, 'PNG', page.largeur - MARGE - 16, 8, 16, 21)
  doc.setFont(undefined, 'bold')
  doc.setFontSize(11)
  doc.setTextColor(...NOIR)
  doc.text('Intervention des Formations Spécialisées Montagne', MARGE, 15)
  doc.setFontSize(9)
  doc.setTextColor(...ROUGE_CRS)
  doc.text(`n° ${modele.numeroIfsm}`, MARGE, 21)
  doc.setDrawColor(...ROUGE_CRS)
  doc.setLineWidth(0.6)
  // La ligne s'arrête avant l'écusson plutôt que de courir sur toute la largeur en-dessous.
  doc.line(MARGE, 25, page.largeur - MARGE - 16 - 5, 25)
  doc.setLineWidth(0.2)
  page.y = 30

  page.champsDoubles([
    ['DE : ', modele.entete.de],
    ['À : ', modele.entete.a],
  ])
  page.champsDoubles([
    ['Pour information : ', modele.entete.pourInformation],
    ['N° de texte : ', modele.entete.numeroTexte],
  ])
  doc.setFont(undefined, 'bold')
  doc.setFontSize(7.5)
  doc.setTextColor(...NOIR)
  page.espace(4)
  doc.text('OBJET : SECOURS EN MONTAGNE - I.F.S.M. STOP', MARGE, page.y)
  page.y += 5.5

  // ---- 1. Alerte -----------------------------------------------------------
  page.titreSection(1, 'ALERTE')
  page.champ('Origine :', modele.alerte.origine)
  page.champsDoubles([
    ['Alerte : ', modele.alerte.alerteLe],
    ['Départ : ', modele.alerte.departLe],
  ])
  page.champsDoubles([
    ['Sur les lieux : ', modele.alerte.surLesLieux],
    ["Fin d'opération : ", modele.alerte.finOperation],
  ])
  page.espaceur()

  // ---- 2. Localisation -------------------------------------------------
  page.titreSection(2, 'LOCALISATION')
  page.champ('Type de domaine :', modele.localisation.typeDomaine)
  page.champ('Lieu précis :', modele.localisation.lieuPrecis)
  page.champsDoubles([
    ['Altitude : ', modele.localisation.altitude],
    ['Massif : ', modele.localisation.massif],
  ])
  page.champ('Commune :', modele.localisation.commune)
  page.espaceur()

  // ---- 3. Nature de l'opération ------------------------------------------
  page.titreSection(3, "NATURE DE L'OPÉRATION")
  page.champ("Nature de l'intervention :", modele.natureOperation.natureIntervention)
  page.champ("Nature de l'activité ayant donné lieu au déclenchement :", modele.natureOperation.natureActivite)
  page.espaceur()

  // ---- 4. Circonstances -------------------------------------------------
  page.titreSection(4, "CIRCONSTANCES DE L'ACCIDENT")
  page.champ('Circonstances :', modele.circonstances.circonstances)
  page.espaceur()

  // ---- 5. Moyens engagés -------------------------------------------------
  page.titreSection(5, 'MOYENS ENGAGÉS')
  page.champsDoubles([
    ['Opération : ', modele.moyens.operation],
    ['Hélicoptère(s) : ', modele.moyens.helicopteres],
    ['PPSM(s) : ', modele.moyens.ppsm],
  ])
  page.champ('Effectif CRS engagé :', modele.moyens.effectifEngage)
  page.champsDoubles([
    ['Médicalisation : ', modele.moyens.medicalisation],
    ['Équipe(s) cynophile(s) CRS : ', modele.moyens.equipesCynophilesCRS],
    ['Équipe(s) drone(s) : ', modele.moyens.equipesDrones],
  ])
  page.espaceur()

  // ---- 6. Compte rendu d'opération ---------------------------------------
  page.titreSection(6, "COMPTE RENDU D'OPÉRATION")
  page.champ('Geste(s) de secourisme effectué(s) :', modele.compteRendu.gestesSecourisme)
  page.champ("Technique(s) d'évacuation(s) mise(s) en œuvre :", modele.compteRendu.techniquesEvacuation)
  page.espaceur()

  // ---- 7. Bilan -----------------------------------------------------------
  page.titreSection(7, "BILAN DE L'OPÉRATION")
  page.champsDoubles([
    ['Disparu(s) : ', modele.bilan.disparus],
    ['Assisté(s) : ', modele.bilan.assistes],
    ['Blessé(s) : ', modele.bilan.blesses],
    ['Décédé(s) : ', modele.bilan.decedes],
  ])
  page.espaceur()

  // ---- 8. Identité des personnes secourues -------------------------------
  page.titreSection(8, 'IDENTITÉ DES PERSONNES SECOURUES')
  if (modele.victimes.length === 0) {
    page.champ('', 'Aucune victime enregistrée.')
  } else {
    modele.victimes.forEach((v, i) => {
      if (i > 0) {
        page.espace(3.5)
        doc.setDrawColor(...GRIS_CLAIR)
        doc.line(MARGE, page.y - 2, page.largeur - MARGE, page.y - 2)
      }
      page.champsDoubles([
        ['Statut : ', v.statut],
        ['Nom : ', v.nom],
        ['Prénom : ', v.prenom],
      ])
      page.champsDoubles([
        ['Sexe : ', v.sexe],
        ['Date naissance : ', v.dateNaissance],
        ['Nationalité : ', v.nationalite],
      ])
      page.champsDoubles([
        ['Téléphone : ', v.telephone],
        ['État médical : ', v.etatMedical],
        ['Destination : ', v.destination],
      ])
      page.champ('Circonstance :', v.circonstance)
      page.champ('Nature des blessures :', v.natureBlessures)
    })
  }
  page.espaceur()

  // ---- 9. Procédure judiciaire --------------------------------------------
  page.titreSection(9, 'PROCÉDURE JUDICIAIRE')
  page.champsDoubles([
    ['Suivi judiciaire : ', modele.judiciaire.suiviJudiciaire],
    ['Directeur d’enquête : ', modele.judiciaire.directeurEnquete],
  ])
  page.espaceur()

  // ---- 10. Autorités avisées ----------------------------------------------
  page.titreSection(10, 'AUTORITÉS AVISÉES ET COMMUNICATION MÉDIAS')
  page.champ('Autorités avisées :', modele.autorites.autoritesAvisees)
  page.champ('Médias informés :', modele.autorites.mediasInformes)
  page.champ('Avis divers :', modele.autorites.avisDivers)
  page.espaceur(6)

  page.espace(9)
  doc.setDrawColor(...NOIR)
  doc.line(MARGE, page.y - 2.5, page.largeur - MARGE, page.y - 2.5)
  doc.setFont(undefined, 'bold')
  doc.setFontSize(8.5)
  doc.setTextColor(...NOIR)
  doc.text('STOP ET FIN', MARGE, page.y + 1.5)
  page.y += 5.5
  page.champsDoublesToujours([
    ['Rédacteur : ', modele.finalisation.redacteur],
    ['Signataire : ', modele.finalisation.signataire],
  ])

  // ---- Pied de page --------------------------------------------------------
  const nombrePages = doc.internal.getNumberOfPages()
  for (let i = 1; i <= nombrePages; i++) {
    doc.setPage(i)
    doc.setFont(undefined, 'italic')
    doc.setFontSize(7.5)
    doc.setTextColor(...GRIS)
    doc.text(`Page ${i}/${nombrePages}`, page.largeur - MARGE, page.hauteur - 10, { align: 'right' })
  }

  return doc
}

/** « IFSM <n°> <Département> <Nom de la victime principale>.pdf » — nom du fichier téléchargé, indépendant du n° IFSM affiché en en-tête du document (voir nomFichierIfsm ci-dessus). */
export function nomFichierTO(fiche, modele) {
  const premiereVictime = modele.victimes[0]?.nom || ''
  const nom = nomFichierIfsm(fiche, premiereVictime).replace(/[\\/:*?"<>|]/g, '').trim()
  return `${nom || 'IFSM'}.pdf`
}

/** Génère + télécharge un TO à partir d'un modèle déjà construit (édité ou non). */
export async function telechargerTOModele(fiche, modele) {
  const doc = await genererPdfDepuisModele(modele)
  const nom = nomFichierTO(fiche, modele)
  // Métadonnée PDF "Titre" — la plupart des lecteurs PDF intégrés aux navigateurs (Chrome/Edge)
  // nomment l'onglet d'après elle plutôt que d'après l'URL blob, sinon illisible (décision utilisateur).
  doc.setProperties({ title: nom.replace(/\.pdf$/, '') })
  doc.save(nom)
}

/**
 * Génère et télécharge le TO d'une intervention — la dernière version
 * validée (snosm_to_texte) si elle existe, sinon un modèle frais depuis les
 * données SNOSM actuelles (jamais encore validé). Utilisé par le bouton TO/
 * Télécharger TO du Registre, et par ModaleTO pour la première ouverture.
 */
export async function telechargerTelegrammeTO(fiche, options) {
  const modele = fiche.snosm_to_texte ? JSON.parse(fiche.snosm_to_texte) : construireModeleTO(fiche, options)
  await telechargerTOModele(fiche, modele)
}
