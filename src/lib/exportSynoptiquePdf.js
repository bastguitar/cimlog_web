import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { dateISO } from './effectifs'

const NOIR_ENTETE = [23, 23, 28]

const formatHeureMin = (iso) => new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
const formatJourLong = (d) =>
  d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

const texteCase = (messages) => messages.map((m) => `${formatHeureMin(m.createdAt)} ${m.content}`).join('\n')

/**
 * Export PDF de la vue synoptique telle qu'affichée à l'écran — un secours
 * par colonne, les heures en lignes — pas le format « liste continue » de
 * la main courante chronologique (voir exportMainCourantePdf.js) : deux
 * lectures différentes, deux mises en page différentes.
 *
 * En paysage, et les colonnes de secours de largeur égale calculée à partir
 * de celles qui restent une fois Heure et Infos générales posées : de 5 à
 * 20 colonnes tiennent toujours sur la page, sans jamais déborder — plus il
 * y en a, plus chacune se resserre.
 *
 * `grille` : Map('general' | id du secours -> tableau de 24 cases, chacune
 * la liste des messages de cette heure) — même structure que celle déjà
 * construite pour l'écran (voir Synoptique.jsx), pas recalculée ici.
 */
export function exporterSynoptiquePdf({ poste, jour, secours, grille }) {
  const doc = new jsPDF({ orientation: 'landscape' })
  const largeur = doc.internal.pageSize.getWidth()
  const hauteur = doc.internal.pageSize.getHeight()
  const marge = 8

  doc.setFont(undefined, 'bold')
  doc.setFontSize(13)
  doc.setTextColor(20)
  doc.text('VUE SYNOPTIQUE', largeur / 2, 11, { align: 'center' })
  doc.setFontSize(8.5)
  doc.setFont(undefined, 'normal')
  doc.text(poste?.nom ?? '', marge, 17)
  doc.text(formatJourLong(jour), largeur - marge, 17, { align: 'right' })

  const largeurHeure = 9
  const largeurGenerales = 30
  const largeurUtile = largeur - marge * 2 - largeurHeure - largeurGenerales
  const largeurColonne = secours.length > 0 ? Math.max(largeurUtile / secours.length, 10) : largeurUtile

  const entetes = [
    'Heure',
    'Infos générales',
    ...secours.map((s) => `n°${s.local_id}\n${[s.com, s.activity].filter(Boolean).join('\n')}`),
  ]

  const corps = Array.from({ length: 24 }, (_, h) => [
    `${h}h`,
    texteCase(grille.get('general')?.[h] ?? []),
    ...secours.map((s) => texteCase(grille.get(s.id)?.[h] ?? [])),
  ])

  const columnStyles = {
    0: { cellWidth: largeurHeure, fontStyle: 'bold' },
    1: { cellWidth: largeurGenerales },
  }
  secours.forEach((_, i) => {
    columnStyles[i + 2] = { cellWidth: largeurColonne }
  })

  autoTable(doc, {
    startY: 21,
    head: [entetes],
    body: corps,
    theme: 'grid',
    styles: { fontSize: 6, cellPadding: 1.1, overflow: 'linebreak', valign: 'top', lineColor: [220, 213, 200] },
    headStyles: { fillColor: NOIR_ENTETE, textColor: 255, fontSize: 6, halign: 'center', valign: 'middle' },
    columnStyles,
    margin: { left: marge, right: marge, top: 21, bottom: 10 },
  })

  const nombrePages = doc.internal.getNumberOfPages()
  for (let i = 1; i <= nombrePages; i++) {
    doc.setPage(i)
    doc.setFontSize(7)
    doc.setTextColor(150)
    doc.text('Cim’Log', marge, hauteur - 5)
    doc.text(`Page ${i}/${nombrePages}`, largeur - marge, hauteur - 5, { align: 'right' })
  }

  doc.save(`synoptique-${poste?.code ?? 'section'}-${dateISO(jour)}.pdf`)
}
