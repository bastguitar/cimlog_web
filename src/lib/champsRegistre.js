import { estRegulation, estSansMoyen } from './moyens'

/**
 * Contenu des cellules du Registre — partagé par l'écran (pages/Registre.jsx)
 * et l'export PDF (lib/exportRegistrePdf.js), pour que les deux affichent
 * exactement la même chose.
 */

export const formatHeure = (iso) => new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })

export const pathologiesDe = (s) => (s.victimes ?? []).map((v) => v.pathologie).filter(Boolean).join(', ')

// État médical SNOSM de chaque victime (Blessé, Décédé non traumatique…), une ligne par victime,
// dans l'ordre des numéros de victime — doublons gardés (deux blessés = deux lignes).
export const etatsMedicauxDe = (s) =>
  [...(s.victimes ?? [])]
    .sort((a, b) => (a.local_id ?? 0) - (b.local_id ?? 0))
    .map((v) => v.snosm_etat_medical)
    .filter(Boolean)

// Origine de l'alerte : celle de la fiche SNOSM quand elle est renseignée (c'est elle qui part sur
// le TO ; « AUTRE » remplacé par sa précision), sinon la valeur brute saisie dans Track'Alerte.
export const origineDe = (s) =>
  (s.snosm_origine_alerte === 'AUTRE' ? s.snosm_origine_alerte_autre || 'AUTRE' : s.snosm_origine_alerte) ||
  s.alert_origin

// Pastille NON MED : seulement si un moyen CRS a réellement été engagé — sans moyen (ou régulation),
// médicalisé ou non n'a pas de sens.
export const avecMoyenEngage = (s) => !estSansMoyen(s) && !estRegulation(s)

// Cim'Alerte ne remplit plus accident_type (octobre 2026) : le motif est désormais saisi par victime
// (victimes.circonstances). On garde accident_type pour les fiches plus anciennes qui le portent.
export const motifDe = (s) =>
  s.accident_type || [...new Set((s.victimes ?? []).map((v) => v.circonstances?.trim()).filter(Boolean))].join(', ')

/** « RÉGULATION », « MED », « NON MED » ou null — même règle que les pastilles de la colonne Moyen. */
export const pastilleMedDe = (s) => (estRegulation(s) ? 'RÉGULATION' : s.is_med ? 'MED' : avecMoyenEngage(s) ? 'NON MED' : null)
