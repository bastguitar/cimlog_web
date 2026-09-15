import { jsPDF } from 'jspdf'
import logoCrsUrl from '../assets/logo-crs.png'
import { groupeDe } from './sections'

/**
 * Génère le « TO » (télégramme officiel, IFSM — Intervention des Formations
 * Spécialisées Montagne) d'une intervention. Deux étapes distinctes :
 *   1. construireModeleTO(fiche, options) — données pures, lues sur les
 *      champs SNOSM réels (formulaire aujourd'hui complet — ce fichier
 *      datait d'avant sa construction, beaucoup de champs restaient
 *      volontairement vides). Consommé par ModaleTO.jsx (formulaire éditable)
 *      ET par genererPdfDepuisModele ci-dessous (même mise en page).
 *   2. genererPdfDepuisModele(modele, fiche) — construit le PDF à partir de
 *      ce modèle (édité ou non par l'utilisateur dans ModaleTO).
 *
 * Le modèle validé (JSON) est sauvegardé sur la fiche (snosm_to_texte,
 * snosm_to_cree_le) — ces retouches ne modifient QUE le texte du PDF, jamais
 * les champs SNOSM d'origine (décision utilisateur). La fiche SNOSM reste
 * modifiable après validation du TO : la vraie synchronisation vers la base
 * SNOSM (Chamonix) se fait plusieurs jours après, on peut donc régénérer un
 * TO à jour entre-temps — pas de verrou associé à snosm_to_cree_le.
 */

const NOIR = [23, 23, 28]
const GRIS = [110, 110, 118]
const GRIS_CLAIR = [225, 226, 230]
const ROUGE_CRS = [182, 36, 44]
const MARGE = 16
const LARGEUR_LABEL = 46

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

/** « Village - 38380 » -> « 38380 VILLAGE », convention des télégrammes officiels. */
function formatCommuneTO(com) {
  if (!com) return null
  const m = com.match(/^(.*?)\s*-\s*(\d{5})\s*$/)
  if (!m) return com.toUpperCase()
  return `${m[2]} ${m[1].toUpperCase()}`
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
  const numeroIfsm = fiche.county ? `IFSM-${fiche.county}-${fiche.local_id}` : `IFSM-${fiche.local_id}`
  const nomDe = sectionNom ? `CRS ${region ?? ''} ${sectionNom}`.replace(/\s+/g, ' ').trim().toUpperCase() : null
  const autoritesDefaut = zone && prefecture && region ? `DCCRS - ${zone} - PRÉFECTURE ${prefecture} - CRS ${region}` : null
  const victimes = fiche.victimes ?? []

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
      natureActivite: fiche.activity ? fiche.activity.toUpperCase() : null,
    },
    circonstances: {
      circonstances: fiche.description,
    },
    moyens: {
      operation: fiche.snosm_type_operation_moyens,
      helicopteres: fiche.snosm_helicopteres,
      ppsm: fiche.snosm_ppsm,
      effectifEngage: (fiche.effectifs_engages ?? []).map((e) => e.personne).filter(Boolean).join(' - ') || null,
      medicalisation: fiche.snosm_medicalisation,
    },
    compteRendu: {
      gestesSecourisme: fiche.snosm_gestes_secourisme,
      techniquesEvacuation: fiche.snosm_techniques_evacuation,
    },
    bilan: {
      disparus: String(fiche.recherche_personne ? 1 : 0),
      assistes: String(victimes.filter((v) => v.snosm_etat_medical === 'Indemne').length),
      blesses: String(victimes.filter((v) => v.snosm_etat_medical === 'Blessé').length),
      decedes: String(victimes.filter((v) => (v.snosm_etat_medical || '').startsWith('Décédé')).length),
    },
    victimes: victimes.map((v) => ({
      id: v.id,
      statut: v.snosm_statut || 'Victime',
      nom: v.nom,
      prenom: v.prenom,
      sexe: v.sexe,
      dateNaissance: v.date_naissance ? new Date(v.date_naissance).toLocaleDateString('fr-FR') : null,
      nationalite: v.nationalite,
      telephone: v.telephone,
      etatMedical: v.snosm_etat_medical,
      circonstance: v.snosm_circonstances_liste,
      natureBlessures: [v.snosm_localisation_blessure, v.snosm_type_blessure].filter(Boolean).join(' — ') || null,
      destination: v.snosm_destination,
    })),
    judiciaire: {
      suiviJudiciaire: fiche.snosm_suivi_judiciaire,
      directeurEnquete: fiche.snosm_directeur_enquete,
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
    if (this.y + h > this.hauteur - 18) {
      this.doc.addPage()
      this.y = MARGE
      this.enTeteCourant()
    }
    return this.y
  }

  enTeteCourant() {
    if (this.logo) this.doc.addImage(this.logo, 'PNG', this.largeur - MARGE - 14, 10, 14, 18)
    this.doc.setFont(undefined, 'bold')
    this.doc.setFontSize(9)
    this.doc.setTextColor(...GRIS)
    this.doc.text(this.titreCourt, MARGE, 14)
    this.doc.setDrawColor(...GRIS_CLAIR)
    // Le logo va de y=10 à y=28 (hauteur 18) sur les pages suivantes : même correction que
    // l'en-tête principal, la ligne passe en dessous plutôt que de le traverser.
    this.doc.line(MARGE, 29, this.largeur - MARGE, 29)
    this.y = 34
  }

  titreSection(numero, titre) {
    this.espace(14)
    this.doc.setFillColor(...ROUGE_CRS)
    this.doc.rect(MARGE, this.y - 4, 5, 5, 'F')
    this.doc.setFont(undefined, 'bold')
    this.doc.setFontSize(10.5)
    this.doc.setTextColor(...NOIR)
    this.doc.text(`${numero} — ${titre}`, MARGE + 8, this.y)
    this.doc.setDrawColor(...GRIS_CLAIR)
    this.doc.line(MARGE, this.y + 3, this.largeur - MARGE, this.y + 3)
    this.y += 10
  }

  /**
   * Un champ « Label : valeur ». Si le libellé est court, la valeur suit sur
   * la même ligne (colonne fixe) ; s'il est trop long pour cette colonne
   * (« Nature de l'activité ayant donné lieu au déclenchement : », par ex.),
   * la valeur passe sur la ligne suivante plutôt que de chevaucher le texte.
   */
  champ(label, valeur) {
    const texte = valeur || '……………………………'
    this.doc.setFont(undefined, 'bold')
    this.doc.setFontSize(9)
    const empile = this.doc.getTextWidth(label) > LARGEUR_LABEL - 2
    const xValeur = empile ? MARGE : MARGE + LARGEUR_LABEL
    const largeurValeur = this.largeur - MARGE - xValeur
    const lignes = this.doc.splitTextToSize(texte, largeurValeur)
    this.espace((empile ? 5 : 0) + 6 * lignes.length + 2)
    this.doc.setTextColor(...NOIR)
    this.doc.text(label, MARGE, this.y)
    if (empile) this.y += 5
    this.doc.setFont(undefined, valeur ? 'normal' : 'italic')
    this.doc.setTextColor(...(valeur ? NOIR : GRIS))
    this.doc.text(lignes, xValeur, this.y)
    this.y += 6 * lignes.length + 3
  }

  /** Deux champs courts côte à côte (dates, altitude/massif…). */
  champsDoubles(paires) {
    this.espace(8)
    const y = this.y
    const largeurColonne = (this.largeur - MARGE * 2) / 2
    paires.forEach(([label, valeur], i) => {
      const x = MARGE + i * largeurColonne
      this.doc.setFont(undefined, 'bold')
      this.doc.setFontSize(9)
      this.doc.setTextColor(...NOIR)
      this.doc.text(label, x, y)
      const largeurLabel = this.doc.getTextWidth(label) + 2
      this.doc.setFont(undefined, valeur ? 'normal' : 'italic')
      this.doc.setTextColor(...(valeur ? NOIR : GRIS))
      this.doc.text(valeur || '……………', x + largeurLabel, y)
    })
    this.y += 9
  }

  espaceur(h = 3) {
    this.y += h
  }
}

/** Construit le PDF à partir d'un modèle (édité ou non par l'utilisateur) — fonction pure, ne télécharge rien. */
export async function genererPdfDepuisModele(modele) {
  const doc = new jsPDF()
  const logo = await chargerImage(logoCrsUrl).catch(() => null)
  const page = new MisePage(doc, logo, `Intervention des Formations Spécialisées Montagne n° ${modele.numeroIfsm}`)

  // ---- En-tête -----------------------------------------------------------
  if (logo) doc.addImage(logo, 'PNG', page.largeur - MARGE - 20, 10, 20, 26)
  doc.setFont(undefined, 'bold')
  doc.setFontSize(13)
  doc.setTextColor(...NOIR)
  doc.text('Intervention des Formations Spécialisées Montagne', MARGE, 18)
  doc.setFontSize(10)
  doc.setTextColor(...ROUGE_CRS)
  doc.text(`n° ${modele.numeroIfsm}`, MARGE, 25)
  doc.setDrawColor(...ROUGE_CRS)
  doc.setLineWidth(0.6)
  // Le logo va de y=10 à y=36 (hauteur 26) : la ligne doit passer EN DESSOUS, pas la traverser
  // (bug remonté par l'utilisateur — la ligne barrait l'insigne CRS sur le PDF).
  doc.line(MARGE, 39, page.largeur - MARGE, 39)
  doc.setLineWidth(0.2)
  page.y = 46

  page.champ('DE :', modele.entete.de)
  page.champ('À :', modele.entete.a)
  page.champ('Pour information :', modele.entete.pourInformation)
  page.champ('N° DE TEXTE :', modele.entete.numeroTexte)
  doc.setFont(undefined, 'bold')
  doc.setFontSize(9)
  doc.setTextColor(...NOIR)
  page.espace(7)
  doc.text('OBJET : SECOURS EN MONTAGNE - I.F.S.M. STOP', MARGE, page.y)
  page.y += 10

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
  page.champ('Opération :', modele.moyens.operation)
  page.champ('Hélicoptère(s) :', modele.moyens.helicopteres)
  page.champ('PPSM(s) :', modele.moyens.ppsm)
  page.champ('Effectif CRS engagé :', modele.moyens.effectifEngage)
  page.champ('Médicalisation :', modele.moyens.medicalisation)
  page.espaceur()

  // ---- 6. Compte rendu d'opération ---------------------------------------
  page.titreSection(6, "COMPTE RENDU D'OPÉRATION")
  page.champ('Geste(s) de secourisme effectué(s) :', modele.compteRendu.gestesSecourisme)
  page.champ("Technique(s) d'évacuation(s) mise(s) en œuvre :", modele.compteRendu.techniquesEvacuation)
  page.espaceur()

  // ---- 7. Bilan -----------------------------------------------------------
  page.titreSection(7, "BILAN DE L'OPÉRATION")
  page.champsDoubles([
    ['Personne(s) disparue(s) : ', modele.bilan.disparus],
    ['Assisté(s) : ', modele.bilan.assistes],
  ])
  page.champsDoubles([
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
        page.espace(6)
        doc.setDrawColor(...GRIS_CLAIR)
        doc.line(MARGE, page.y - 4, page.largeur - MARGE, page.y - 4)
      }
      page.champ('Statut :', v.statut)
      page.champsDoubles([
        ['Nom : ', v.nom],
        ['Prénom : ', v.prenom],
      ])
      page.champsDoubles([
        ['Sexe : ', v.sexe],
        ['Date naissance : ', v.dateNaissance],
      ])
      page.champ('Nationalité :', v.nationalite)
      page.champ('Téléphone :', v.telephone)
      page.champ('État médical :', v.etatMedical)
      page.champ('Circonstance :', v.circonstance)
      page.champ('Nature des blessures :', v.natureBlessures)
      page.champ('Destination :', v.destination)
    })
  }
  page.espaceur()

  // ---- 9. Procédure judiciaire --------------------------------------------
  page.titreSection(9, 'PROCÉDURE JUDICIAIRE')
  page.champ('Suivi judiciaire :', modele.judiciaire.suiviJudiciaire)
  page.champ('Directeur d’enquête :', modele.judiciaire.directeurEnquete)
  page.espaceur()

  // ---- 10. Autorités avisées ----------------------------------------------
  page.titreSection(10, 'AUTORITÉS AVISÉES ET COMMUNICATION MÉDIAS')
  page.champ('Autorités avisées :', modele.autorites.autoritesAvisees)
  page.champ('Médias informés :', modele.autorites.mediasInformes)
  page.champ('Avis divers :', modele.autorites.avisDivers)
  page.espaceur(6)

  page.espace(16)
  doc.setDrawColor(...NOIR)
  doc.line(MARGE, page.y - 4, page.largeur - MARGE, page.y - 4)
  doc.setFont(undefined, 'bold')
  doc.setFontSize(10)
  doc.setTextColor(...NOIR)
  doc.text('STOP ET FIN', MARGE, page.y + 2)
  page.y += 10
  page.champ('Rédacteur :', modele.finalisation.redacteur)
  page.champ('Signataire :', modele.finalisation.signataire)

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

/** « IFSM <n°> <Département> <Nom de la victime principale>.pdf » — décision utilisateur. */
export function nomFichierTO(fiche, modele) {
  const departement = departementNom(fiche)
  const premiereVictime = modele.victimes[0]?.nom || ''
  const morceaux = [`IFSM ${fiche.local_id ?? ''}`.trim(), departement ? versTitreCase(departement) : '', premiereVictime].filter(
    Boolean
  )
  const nom = morceaux.join(' ').replace(/[\\/:*?"<>|]/g, '').trim()
  return `${nom || 'IFSM'}.pdf`
}

/** Génère + télécharge un TO à partir d'un modèle déjà construit (édité ou non). */
export async function telechargerTOModele(fiche, modele) {
  const doc = await genererPdfDepuisModele(modele)
  doc.save(nomFichierTO(fiche, modele))
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
