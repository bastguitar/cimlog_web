import { jsPDF } from 'jspdf'
import logoCrsUrl from '../assets/logo-crs.png'
import { groupeDe } from './sections'

/**
 * Génère le « TO » (télégramme officiel, IFSM — Intervention des Formations
 * Spécialisées Montagne) d'une intervention, sur le modèle d'un exemplaire
 * réel fourni par l'utilisateur. Beaucoup de champs de ce document (gestes
 * de secourisme, bilan détaillé, autorités avisées, rédacteur/signataire…)
 * viennent du futur formulaire SNOSM, pas encore construit côté Cim'Log —
 * ils sont donc laissés en blanc ici, à compléter à la main. Ce générateur
 * n'a pas besoin d'attendre ce formulaire pour être utile : il pré-remplit
 * déjà tout ce que Cim'Alerte connaît (lieu, moyens, victimes de base…), le
 * reste se complète au fur et à mesure que le formulaire SNOSM arrive.
 *
 * Ne pose PAS TOEnvoyeLe (la fiche ne se fige pas au simple téléchargement
 * d'un brouillon) — ce verrou reste réservé à un futur envoi réel du TO,
 * mécanisme d'envoi pas encore décidé (voir ModaleFiche/registre.js).
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

/** Best-effort : la colonne pathologie de Cim'Alerte sert parfois de note libre ("retard", "indemne"…), pas toujours une vraie blessure. */
function etatMedical(pathologie) {
  if (!pathologie) return null
  return /indemne/i.test(pathologie) ? 'Indemne' : 'Blessé'
}

function typeOperation(helicopter) {
  if (!helicopter || helicopter === 'Pas de moyens engagés' || helicopter === 'SDIS') return null
  return helicopter === 'TERRESTRE' ? 'Terrestre' : 'Héliportée'
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
    this.doc.line(MARGE, 18, this.largeur - MARGE, 18)
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

/** Construit le document — fonction pure, ne télécharge rien (voir telechargerTelegrammeTO). */
export async function genererTelegrammeTO(fiche, { sectionNom } = {}) {
  const doc = new jsPDF()
  const logo = await chargerImage(logoCrsUrl).catch(() => null)

  const groupe = groupeDe(fiche.squad_code)
  const region = REGION_PAR_GROUPE[groupe] ?? null
  const zone = region ? (ZONE_PAR_REGION[region] ?? null) : null
  const prefecture = fiche.county ? (PREFECTURE_PAR_DEPARTEMENT[fiche.county] ?? fiche.county) : null
  const numeroIfsm = fiche.county ? `IFSM-${fiche.county}-${fiche.local_id}` : `IFSM-${fiche.local_id}`
  const nomDe = sectionNom ? `CRS ${region ?? ''} ${sectionNom}`.replace(/\s+/g, ' ').trim().toUpperCase() : null

  const page = new MisePage(doc, logo, `Intervention des Formations Spécialisées Montagne n° ${numeroIfsm}`)

  // ---- En-tête -----------------------------------------------------------
  if (logo) doc.addImage(logo, 'PNG', page.largeur - MARGE - 20, 10, 20, 26)
  doc.setFont(undefined, 'bold')
  doc.setFontSize(13)
  doc.setTextColor(...NOIR)
  doc.text('Intervention des Formations Spécialisées Montagne', MARGE, 18)
  doc.setFontSize(10)
  doc.setTextColor(...ROUGE_CRS)
  doc.text(`n° ${numeroIfsm}`, MARGE, 25)
  doc.setDrawColor(...ROUGE_CRS)
  doc.setLineWidth(0.6)
  doc.line(MARGE, 30, page.largeur - MARGE, 30)
  doc.setLineWidth(0.2)
  page.y = 38

  page.champ('DE :', nomDe)
  page.champ('À :', zone)
  page.champ('Pour information :', prefecture ? `PRÉFECTURE ${prefecture}` : null)
  page.champ('N° DE TEXTE :', null)
  doc.setFont(undefined, 'bold')
  doc.setFontSize(9)
  doc.setTextColor(...NOIR)
  page.espace(7)
  doc.text('OBJET : SECOURS EN MONTAGNE - I.F.S.M. STOP', MARGE, page.y)
  page.y += 10

  // ---- 1. Alerte -----------------------------------------------------------
  page.titreSection(1, 'ALERTE')
  page.champ('Origine :', fiche.alert_origin)
  page.champsDoubles([
    ['Alerte : ', formatDateHeureTO(fiche.alert_at)],
    ['Départ : ', null],
  ])
  page.champsDoubles([
    ['Sur les lieux : ', null],
    ["Fin d'opération : ", formatDateHeureTO(fiche.clotureLe)],
  ])
  page.espaceur()

  // ---- 2. Localisation -------------------------------------------------
  page.titreSection(2, 'LOCALISATION')
  page.champ('Type de domaine :', null)
  page.champ('Lieu précis :', fiche.lieu)
  page.champsDoubles([
    ['Altitude : ', fiche.alt ? `${fiche.alt} m` : null],
    ['Massif : ', fiche.massif],
  ])
  page.champ('Commune :', formatCommuneTO(fiche.com))
  page.espaceur()

  // ---- 3. Nature de l'opération ------------------------------------------
  page.titreSection(3, "NATURE DE L'OPÉRATION")
  page.champ("Nature de l'intervention :", 'SECOURS EN MONTAGNE')
  page.champ("Nature de l'activité ayant donné lieu au déclenchement :", fiche.activity?.toUpperCase())
  page.espaceur()

  // ---- 4. Circonstances -------------------------------------------------
  page.titreSection(4, "CIRCONSTANCES DE L'ACCIDENT")
  page.champ('Circonstances :', fiche.description)
  page.espaceur()

  // ---- 5. Moyens engagés -------------------------------------------------
  page.titreSection(5, 'MOYENS ENGAGÉS')
  page.champ('Opération :', typeOperation(fiche.helicopter))
  page.champ('Hélicoptère(s) :', typeOperation(fiche.helicopter) === 'Héliportée' ? fiche.helicopter : null)
  page.champ('Effectif CRS engagé :', fiche.team?.length ? fiche.team.join(' - ') : null)
  page.champ('Médicalisation :', fiche.is_med == null ? null : fiche.is_med ? 'Oui' : 'Non')
  page.espaceur()

  // ---- 6. Compte rendu d'opération ---------------------------------------
  page.titreSection(6, "COMPTE RENDU D'OPÉRATION")
  page.champ('Geste(s) de secourisme effectué(s) :', null)
  page.champ("Technique(s) d'évacuation(s) mise(s) en œuvre :", null)
  page.espaceur()

  // ---- 7. Bilan -----------------------------------------------------------
  const nbVictimes = fiche.victimes?.length ?? 0
  page.titreSection(7, "BILAN DE L'OPÉRATION")
  page.champsDoubles([
    ['Personne(s) disparue(s) : ', String(fiche.recherche_personne ? 1 : 0)],
    ['Assisté(s) : ', '0'],
  ])
  page.champsDoubles([
    ['Blessé(s) : ', String(nbVictimes)],
    ['Décédé(s) : ', '0'],
  ])
  page.espaceur()

  // ---- 8. Identité des personnes secourues -------------------------------
  page.titreSection(8, 'IDENTITÉ DES PERSONNES SECOURUES')
  if (nbVictimes === 0) {
    page.champ('', 'Aucune victime enregistrée.')
  } else {
    fiche.victimes.forEach((v, i) => {
      if (i > 0) {
        page.espace(6)
        doc.setDrawColor(...GRIS_CLAIR)
        doc.line(MARGE, page.y - 4, page.largeur - MARGE, page.y - 4)
      }
      page.champ('Statut :', 'Victime')
      page.champsDoubles([
        ['Nom : ', v.nom],
        ['Prénom : ', v.prenom],
      ])
      page.champsDoubles([
        ['Sexe : ', v.sexe],
        ['Date naissance : ', v.date_naissance ? new Date(v.date_naissance).toLocaleDateString('fr-FR') : null],
      ])
      page.champ('Nationalité :', v.nationalite)
      page.champ('Téléphone :', v.telephone)
      page.champ('État médical :', etatMedical(v.pathologie))
      page.champ('Circonstance :', v.circonstances)
      page.champ('Nature des blessures :', v.pathologie)
      page.champ('Destination :', null)
    })
  }
  page.espaceur()

  // ---- 9. Procédure judiciaire --------------------------------------------
  page.titreSection(9, 'PROCÉDURE JUDICIAIRE')
  page.champ('Suivi judiciaire :', null)
  page.espaceur()

  // ---- 10. Autorités avisées ----------------------------------------------
  page.titreSection(10, 'AUTORITÉS AVISÉES ET COMMUNICATION MÉDIAS')
  const autoritesDefaut = zone && prefecture && region ? `DCCRS - ${zone} - PRÉFECTURE ${prefecture} - CRS ${region}` : null
  page.champ('Autorités avisées :', autoritesDefaut)
  page.champ('Médias informés :', null)
  page.espaceur(6)

  page.espace(16)
  doc.setDrawColor(...NOIR)
  doc.line(MARGE, page.y - 4, page.largeur - MARGE, page.y - 4)
  doc.setFont(undefined, 'bold')
  doc.setFontSize(10)
  doc.setTextColor(...NOIR)
  doc.text('STOP ET FIN', MARGE, page.y + 2)
  page.y += 10
  page.champ('Rédacteur :', null)
  page.champ('Signataire :', null)

  // ---- Pied de page --------------------------------------------------------
  const nombrePages = doc.internal.getNumberOfPages()
  for (let i = 1; i <= nombrePages; i++) {
    doc.setPage(i)
    doc.setFont(undefined, 'italic')
    doc.setFontSize(7.5)
    doc.setTextColor(...GRIS)
    doc.text(
      'Document généré par Cim’Log — brouillon à vérifier et compléter avant envoi (champs manquants : «……» ).',
      MARGE,
      page.hauteur - 10
    )
    doc.text(`Page ${i}/${nombrePages}`, page.largeur - MARGE, page.hauteur - 10, { align: 'right' })
  }

  return doc
}

/** Génère et télécharge le TO d'une intervention. */
export async function telechargerTelegrammeTO(fiche, options) {
  const doc = await genererTelegrammeTO(fiche, options)
  doc.save(`TO-${fiche.local_id}.pdf`)
}
