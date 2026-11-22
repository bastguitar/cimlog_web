import { jsPDF } from 'jspdf'
import { autoTable } from 'jspdf-autotable'
import logoCrsUrl from '../assets/logo-crs.png'
import { sansCodePostal, nomSeul } from './registre'
import { libelleMoyens } from './moyens'
import { texteImprimable } from './telegrammeTO'
import {
  formatHeure,
  pathologiesDe,
  etatsMedicauxDe,
  origineDe,
  motifDe,
  pastilleMedDe,
} from './champsRegistre'

/**
 * Export PDF du Registre (novembre 2026) — un tableau A4 paysage des
 * interventions affichées à l'écran, filtres compris. On exporte en général
 * un mois (filtre « mois ») : le titre reprend alors le mois, sinon l'année.
 * Mêmes colonnes que l'écran (sauf le bouton TO), le numéro de secours portant
 * la date et l'heure dessous. Interventions dans l'ordre chronologique — on
 * relit un mois du 1er au dernier jour.
 */

const NOIR = [23, 23, 28]
const GRIS = [110, 110, 118]
const GRIS_LIGNE = [222, 223, 228]
const FOND_ALTERNE = [246, 247, 249]
const ROUGE_CRS = [182, 36, 44]
const MARGE = 10

const NOMS_MOIS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']

function chargerImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = url
  })
}

const t = (v) => texteImprimable(v) ?? '—'
const dateCourte = (iso) => new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })

/**
 * @param evenements interventions à exporter (déjà filtrées)
 * @param options.annee année affichée
 * @param options.mois mois filtré (0 = janvier) ou '' / null pour toute l'année
 * @param options.section intitulé de la section (ou de la région) affichée
 * @param options.avecUnite colonne Unité (vue région)
 * @param options.nomUnite (squad_code) => nom de la section
 * @param options.filtresAutres d'autres filtres que le mois sont actifs (signalé sous le titre)
 */
export async function exporterRegistrePdf(evenements, { annee, mois, section, avecUnite, nomUnite, filtresAutres }) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })

  const periode = mois !== '' && mois != null ? `${NOMS_MOIS[Number(mois)]} ${annee}` : `Année ${annee}`
  const secours = [...evenements].sort((a, b) => new Date(a.created_at) - new Date(b.created_at))

  // --- En-tête -----------------------------------------------------------------------------------
  const victimes = secours.flatMap((s) => s.victimes ?? [])
  const etats = victimes.map((v) => v.snosm_etat_medical || '')
  await dessinerEnteteCrs(doc, {
    titre: 'REGISTRE DES SECOURS',
    sousTitre: [section, periode].filter(Boolean).join(' — '),
    note: filtresAutres ? 'Liste filtrée (filtres actifs dans le Registre au moment de l’export)' : null,
    droite: [
      `${secours.length} intervention${secours.length > 1 ? 's' : ''}`,
      `${victimes.length} victime${victimes.length > 1 ? 's' : ''}`,
      `${etats.filter((e) => e === 'Blessé').length} blessé(s)`,
      `${etats.filter((e) => e.startsWith('Décédé')).length} décédé(s)`,
    ].join('  ·  '),
  })

  // --- Tableau -----------------------------------------------------------------------------------
  const colonnes = [
    { cle: 'numero', titre: 'N° / Date', largeur: 17 },
    ...(avecUnite ? [{ cle: 'unite', titre: 'Unité', largeur: 20 }] : []),
    { cle: 'origine', titre: 'Origine alerte', largeur: 20 },
    { cle: 'commune', titre: 'Commune / Massif', largeur: 28 },
    { cle: 'lieu', titre: 'Lieu', largeur: 28 },
    { cle: 'activite', titre: 'Motif / Activité', largeur: 30 },
    { cle: 'etat', titre: 'État médical', largeur: 24 },
    { cle: 'pathologies', titre: 'Pathologies', largeur: 'auto' },
    { cle: 'moyen', titre: 'Moyen', largeur: 24 },
    { cle: 'equipe', titre: 'Équipe', largeur: 30 },
  ]

  const lignes = secours.map((s) => {
    const cellules = {
      numero: `n°${s.local_id}\n${dateCourte(s.created_at)} ${formatHeure(s.created_at)}`,
      unite: t(nomUnite?.(s.squad_code) ?? s.squad_code),
      origine: t(origineDe(s)),
      commune: t([sansCodePostal(s.com), s.massif].filter(Boolean).join('\n')),
      lieu: t(s.lieu),
      activite: t([s.activity, motifDe(s)].filter(Boolean).join('\n')),
      etat: t(etatsMedicauxDe(s).join('\n')),
      pathologies: t(pathologiesDe(s)),
      moyen: t([libelleMoyens(s), pastilleMedDe(s)].filter(Boolean).join('\n')),
      equipe: t((s.team ?? []).map(nomSeul).join(', ')),
    }
    return colonnes.map((c) => cellules[c.cle])
  })

  autoTable(doc, {
    startY: 31,
    margin: { left: MARGE, right: MARGE, top: 14, bottom: 14 },
    head: [colonnes.map((c) => c.titre)],
    body: lignes,
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: 7.5,
      cellPadding: 1.6,
      textColor: NOIR,
      lineColor: GRIS_LIGNE,
      lineWidth: 0.2,
      valign: 'top',
      overflow: 'linebreak',
    },
    headStyles: { fillColor: ROUGE_CRS, textColor: 255, fontStyle: 'bold', fontSize: 7.5, valign: 'middle' },
    alternateRowStyles: { fillColor: FOND_ALTERNE },
    columnStyles: Object.fromEntries(
      colonnes.map((c, i) => [i, { cellWidth: c.largeur, ...(c.cle === 'numero' ? { fontStyle: 'bold' } : {}) }])
    ),
    rowPageBreak: 'avoid',
    showHead: 'everyPage',
  })

  if (secours.length === 0) {
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(10)
    doc.setTextColor(...GRIS)
    doc.text('Aucune intervention sur cette période.', MARGE, 42)
  }

  numeroterPages(doc, `Track'log — Registre des secours — ${[section, periode].filter(Boolean).join(' — ')}`)
  enregistrerPdf(doc, `Registre ${[section, periode].filter(Boolean).join(' ')}`)
}

/**
 * En-tête commun des PDF Track'log (Registre, bilan des Stats) : logo CRS, titre rouge,
 * sous-titre (section — période), note facultative, et à droite un résumé + la date d'édition.
 * Trait rouge à y = 28 — le contenu commence en dessous (startY ≈ 31).
 */
export async function dessinerEnteteCrs(doc, { titre, sousTitre, note, droite }) {
  const largeurPage = doc.internal.pageSize.getWidth()
  let xTitre = MARGE
  try {
    const logo = await chargerImage(logoCrsUrl)
    const h = 16
    const l = (logo.width / logo.height) * h
    doc.addImage(logo, 'PNG', MARGE, 8, l, h)
    xTitre = MARGE + l + 5
  } catch {
    // Logo introuvable : l'export reste utilisable sans.
  }
  doc.setTextColor(...ROUGE_CRS)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.text(titre, xTitre, 14)
  doc.setTextColor(...NOIR)
  doc.setFontSize(11)
  doc.text(t(sousTitre), xTitre, 20.5)
  if (note) {
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(8)
    doc.setTextColor(...GRIS)
    doc.text(t(note), xTitre, 25)
  }
  doc.setFont('helvetica', 'normal')
  if (droite) {
    doc.setFontSize(9)
    doc.setTextColor(...NOIR)
    doc.text(t(droite), largeurPage - MARGE, 14, { align: 'right' })
  }
  doc.setTextColor(...GRIS)
  doc.setFontSize(8)
  doc.text(`Édité le ${new Date().toLocaleDateString('fr-FR')}`, largeurPage - MARGE, 20.5, { align: 'right' })

  doc.setDrawColor(...ROUGE_CRS)
  doc.setLineWidth(0.6)
  doc.line(MARGE, 28, largeurPage - MARGE, 28)
}

/** Pied de page : intitulé à gauche, « Page n / N » à droite, sur toutes les pages. */
export function numeroterPages(doc, intitule) {
  const largeurPage = doc.internal.pageSize.getWidth()
  const hauteurPage = doc.internal.pageSize.getHeight()
  const nbPages = doc.getNumberOfPages()
  for (let p = 1; p <= nbPages; p++) {
    doc.setPage(p)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(...GRIS)
    doc.text(t(intitule), MARGE, hauteurPage - 7)
    doc.text(`Page ${p} / ${nbPages}`, largeurPage - MARGE, hauteurPage - 7, { align: 'right' })
  }
}

/** Télécharge le PDF — nom de fichier nettoyé, repris comme titre du document (onglet du lecteur PDF). */
export function enregistrerPdf(doc, nom) {
  const nomFichier = nom.replace(/[\\/:*?"<>|]/g, '').trim()
  doc.setProperties({ title: nomFichier })
  doc.save(`${nomFichier}.pdf`)
}

/**
 * Bilan des Stats en PDF (22/11/2026) — le tableau tel qu'à l'écran : mois en lignes, items en
 * colonnes, total en bas. `lignes` = [{ label, valeurs: [12 nombres] }], `mois` = indices des mois
 * à imprimer (tous, ou le seul mois choisi). `activites` = [{ label, valeurs }] — secours effectués
 * par activité (mois en colonnes, total par ligne et par mois).
 * `contenu` : 'bilan' (bilan mensuel / état médical) ou 'activites' — un PDF par tableau, au choix
 * depuis le bouton Exporter des Stats (demandé le 22/11/2026).
 */
export async function exporterBilanPdf({ contenu = 'bilan', lignes, activites, mois, section, periode, resume }) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const parActivite = contenu === 'activites'
  await dessinerEnteteCrs(doc, {
    titre: parActivite ? 'SECOURS PAR ACTIVITÉ' : 'BILAN DES SECOURS',
    sousTitre: [section, periode].filter(Boolean).join(' — '),
    note: parActivite
      ? 'Secours effectués (moyen CRS engagé) — hors régulations, fiches sans moyen et secours passés au SDIS / BT / SAMU'
      : 'État médical : victimes des interventions effectuées (moyen CRS engagé)',
    droite: resume,
  })

  const indexPremiereVictime = lignes.findIndex((l) => l.victime)
  if (!parActivite) autoTable(doc, {
    startY: 33,
    margin: { left: MARGE, right: MARGE, bottom: 14 },
    head: [['', ...lignes.map((l) => t(l.label))]],
    body: mois.map((m) => [NOMS_MOIS[m], ...lignes.map((l) => String(l.valeurs[m]))]),
    foot: [['Total', ...lignes.map((l) => String(l.valeurs.reduce((a, b) => a + b, 0)))]],
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: 9,
      cellPadding: 2.2,
      halign: 'center',
      valign: 'middle',
      textColor: NOIR,
      lineColor: GRIS_LIGNE,
      lineWidth: 0.2,
    },
    headStyles: { fillColor: ROUGE_CRS, textColor: 255, fontStyle: 'bold', fontSize: 8 },
    footStyles: { fillColor: [235, 238, 244], textColor: NOIR, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: FOND_ALTERNE },
    columnStyles: {
      0: { halign: 'left', fontStyle: 'bold', cellWidth: 28 },
      1: { fontStyle: 'bold' },
      2: { fontStyle: 'bold' },
    },
    didParseCell: (data) => {
      // Zéros grisés dans le corps, comme à l'écran.
      if (data.section === 'body' && data.column.index > 0 && data.cell.raw === '0') data.cell.styles.textColor = [170, 170, 176]
    },
    didDrawCell: (data) => {
      // Trait vertical avant le bloc des états médicaux.
      if (indexPremiereVictime >= 0 && data.column.index === indexPremiereVictime + 1) {
        doc.setDrawColor(...GRIS)
        doc.setLineWidth(0.5)
        doc.line(data.cell.x, data.cell.y, data.cell.x, data.cell.y + data.cell.height)
      }
    },
  })

  // --- Secours effectués par activité et par mois ----------------------------------------------------
  if (parActivite && !activites?.length) {
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(10)
    doc.setTextColor(...GRIS)
    doc.text('Aucun secours effectué sur cette période.', MARGE, 42)
  }
  if (parActivite && activites?.length) {
    autoTable(doc, {
      startY: 33,
      margin: { left: MARGE, right: MARGE, top: 14, bottom: 14 },
      head: [['Activité', ...mois.map((m) => NOMS_MOIS[m].slice(0, 4) + (NOMS_MOIS[m].length > 4 ? '.' : '')), 'Total']],
      body: activites.map((a) => [t(a.label), ...mois.map((m) => String(a.valeurs[m])), String(mois.reduce((n, m) => n + a.valeurs[m], 0))]),
      foot: [
        [
          'Total',
          ...mois.map((m) => String(activites.reduce((n, a) => n + a.valeurs[m], 0))),
          String(activites.reduce((n, a) => n + mois.reduce((k, m) => k + a.valeurs[m], 0), 0)),
        ],
      ],
      theme: 'grid',
      showHead: 'everyPage',
      rowPageBreak: 'avoid',
      styles: {
        font: 'helvetica',
        fontSize: 8.5,
        cellPadding: 1.8,
        halign: 'center',
        valign: 'middle',
        textColor: NOIR,
        lineColor: GRIS_LIGNE,
        lineWidth: 0.2,
      },
      headStyles: { fillColor: ROUGE_CRS, textColor: 255, fontStyle: 'bold', fontSize: 8 },
      footStyles: { fillColor: [235, 238, 244], textColor: NOIR, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: FOND_ALTERNE },
      columnStyles: { 0: { halign: 'left', cellWidth: 62 }, [mois.length + 1]: { fontStyle: 'bold' } },
      didParseCell: (data) => {
        if (data.section === 'body' && data.column.index > 0 && data.cell.raw === '0') data.cell.styles.textColor = [170, 170, 176]
      },
    })
  }

  const libelle = parActivite ? 'Secours par activité' : 'Bilan des secours'
  numeroterPages(doc, `Track'log — ${libelle} — ${[section, periode].filter(Boolean).join(' — ')}`)
  enregistrerPdf(doc, `${parActivite ? 'Activites' : 'Bilan'} ${[section, periode].filter(Boolean).join(' ')}`)
}
