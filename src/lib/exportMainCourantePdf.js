import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { messagesEntre, estMentionSG } from './mainCourante'
import { effectifsEntre, dateISO } from './effectifs'

/** Bleu des barres de jour, gris-noir de l'en-tête de tableau — repris du modèle CIMELOG. */
const BLEU_JOUR = [37, 71, 199]
const BLEU_EFFECTIF_FOND = [225, 231, 250]
const BLEU_EFFECTIF_TEXTE = [30, 41, 90]
const NOIR_ENTETE = [23, 23, 28]

const formatHeure = (iso) => new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
const formatJourLong = (d) =>
  d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
const formatDateHeure = (d) =>
  d.toLocaleString('fr-FR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })

/** Chaque jour civil entre deux dates, bornes incluses. */
function joursEntre(debut, fin) {
  const jours = []
  const d = new Date(debut)
  d.setHours(0, 0, 0, 0)
  const dernier = new Date(fin)
  dernier.setHours(0, 0, 0, 0)
  while (d <= dernier) {
    jours.push(new Date(d))
    d.setDate(d.getDate() + 1)
  }
  return jours
}

/**
 * Assemble messages et effectifs sur la période, jour par jour — même
 * regroupement que l'écran (voir MainCourante.jsx).
 */
async function assemblerJours({ poste, debut, fin }) {
  const [messages, effectifsParJour] = await Promise.all([
    messagesEntre(debut, fin),
    effectifsEntre(poste.code, debut, fin),
  ])

  return joursEntre(debut, fin).map((date) => {
    const finJour = new Date(date)
    finJour.setDate(finJour.getDate() + 1)
    return {
      date,
      effectifs: effectifsParJour.get(dateISO(date)) ?? new Map(),
      messages: messages.filter((m) => {
        const t = new Date(m.createdAt)
        return t >= date && t < finJour
      }),
    }
  })
}

/**
 * Un seul tableau continu pour toute la période (pas un par jour) : la
 * ligne d'en-tête « Heure / Secours / Origine / Message » se répète alors
 * automatiquement à chaque page (jspdf-autotable, `showHead: 'everyPage'`
 * par défaut), et les jours s'enchaînent comme sur l'écran plutôt que de
 * recommencer un tableau à chaque fois — même mise en page que l'export
 * CIMELOG de référence.
 *
 * Les lignes « jour » et « rôle d'effectif » portent une largeur de 4
 * colonnes (`colSpan`) et un marqueur `_type` lu par `didParseCell` /
 * `didDrawCell` pour leur habillage particulier — le reste est un tableau
 * ordinaire.
 */
function construireCorps(jours, roles) {
  const corps = []

  for (const jour of jours) {
    corps.push([{ content: formatJourLong(jour.date).toUpperCase(), colSpan: 4, _type: 'jour' }])

    const rolesPresents = roles.filter((r) => jour.effectifs.get(r)?.length)
    for (const role of rolesPresents) {
      corps.push([
        {
          content: '',
          colSpan: 4,
          _type: 'effectif',
          _role: role,
          _noms: jour.effectifs.get(role).map((e) => e.nom).join(', '),
        },
      ])
    }

    if (jour.messages.length === 0) {
      corps.push([{ content: 'Aucun message.', colSpan: 4, _type: 'vide' }])
    } else {
      for (const m of jour.messages) {
        corps.push([
          formatHeure(m.createdAt),
          m.eventId != null ? `n°${m.localId ?? '—'}${m.com ? ' — ' + m.com : ''}` : '—',
          m.origin,
          m.content,
        ])
      }
    }
  }

  return corps
}

function dessinerEnTetePage(doc, { sectionNom, debut, fin }) {
  const largeur = doc.internal.pageSize.getWidth()

  doc.setFont(undefined, 'bold')
  doc.setFontSize(14)
  doc.setTextColor(20)
  doc.text('MAIN COURANTE OPÉRATIONNELLE', largeur / 2, 14, { align: 'center' })

  doc.setDrawColor(215)
  doc.line(14, 19, largeur - 14, 19)

  doc.setFontSize(9)
  doc.text(sectionNom ?? '', 14, 26)
  doc.setFont(undefined, 'normal')
  doc.text(`Du ${formatDateHeure(debut)} au ${formatDateHeure(fin)}`, largeur - 14, 26, { align: 'right' })
}

function genererDoc({ jours, roles, sectionNom, debut, fin }) {
  const doc = new jsPDF()
  const corps = construireCorps(jours, roles)

  autoTable(doc, {
    startY: 32,
    head: [['Heure', 'Secours', 'Origine', 'Message / Action']],
    body: corps,
    theme: 'plain',
    styles: { fontSize: 8, cellPadding: 2.2, lineColor: [228, 228, 233], lineWidth: 0.1, valign: 'middle' },
    headStyles: { fillColor: NOIR_ENTETE, textColor: 255, fontStyle: 'bold', fontSize: 8 },
    alternateRowStyles: { fillColor: [249, 249, 251] },
    columnStyles: { 0: { cellWidth: 15 }, 1: { cellWidth: 32 }, 2: { cellWidth: 30 } },
    margin: { left: 14, right: 14, top: 30, bottom: 14 },
    didDrawPage: () => dessinerEnTetePage(doc, { sectionNom, debut, fin }),
    didParseCell: (data) => {
      const raw = data.row.raw[0]
      if (!raw || typeof raw !== 'object') {
        // Ligne de message ordinaire : rouge et gras pour une mention SG
        // (rappels, fin de service…) — reconnue à son contenu, pas à son
        // origine : une simple note manuelle partage la même origine mais
        // reste en noir. Italique et grisé pour un repère système.
        if (data.column.index === 3) {
          const origine = data.row.raw[2]
          const contenu = data.row.raw[3]
          if (estMentionSG(contenu)) {
            data.cell.styles.textColor = [182, 36, 44]
            data.cell.styles.fontStyle = 'bold'
          } else if (origine === 'Système') {
            data.cell.styles.textColor = 140
            data.cell.styles.fontStyle = 'italic'
          }
        }
        return
      }

      if (raw._type === 'jour') {
        data.cell.styles.fillColor = BLEU_JOUR
        data.cell.styles.textColor = 255
        data.cell.styles.fontStyle = 'bold'
        data.cell.styles.halign = 'left'
        data.cell.styles.fontSize = 9.5
        data.cell.styles.cellPadding = { top: 3.5, bottom: 3.5, left: 6, right: 6 }
      } else if (raw._type === 'effectif') {
        data.cell.styles.fillColor = BLEU_EFFECTIF_FOND
        data.cell.styles.fontSize = 7.5
        data.cell.styles.cellPadding = { top: 1.6, bottom: 1.6, left: 8, right: 6 }
      } else if (raw._type === 'vide') {
        data.cell.styles.textColor = 150
        data.cell.styles.fontStyle = 'italic'
      }
    },
    didDrawCell: (data) => {
      const raw = data.row.raw[0]
      if (!raw || raw._type !== 'effectif') return
      const { x, y, width, height } = data.cell
      const milieu = y + height / 2 + 2.2

      doc.setFontSize(7.5)
      doc.setFont(undefined, 'bold')
      doc.setTextColor(...BLEU_EFFECTIF_TEXTE)
      doc.text(raw._role, x + 8, milieu)

      const largeurRole = doc.getTextWidth(raw._role)
      doc.setFont(undefined, 'normal')
      doc.setTextColor(40, 40, 48)
      const texteNoms = doc.splitTextToSize(raw._noms, width - largeurRole - 20)
      doc.text(texteNoms, x + 8 + largeurRole + 4, milieu)
    },
  })

  const nombrePages = doc.internal.getNumberOfPages()
  const largeur = doc.internal.pageSize.getWidth()
  const hauteur = doc.internal.pageSize.getHeight()
  for (let i = 1; i <= nombrePages; i++) {
    doc.setPage(i)
    doc.setFont(undefined, 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(150)
    doc.text('Cim’Log', 14, hauteur - 8)
    doc.text(`Page ${i}/${nombrePages}`, largeur - 14, hauteur - 8, { align: 'right' })
  }

  return doc
}

/** Génère et télécharge le PDF de la main courante sur la période donnée. */
export async function exporterMainCourantePdf({ poste, roles, debut, fin }) {
  const jours = await assemblerJours({ poste, debut, fin })
  const doc = genererDoc({ jours, roles, sectionNom: poste.nom, debut, fin })
  doc.save(`main-courante-${poste.code}-${dateISO(debut)}-${dateISO(fin)}.pdf`)
}
