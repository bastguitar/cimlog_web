/**
 * Moyens d'une intervention, un par un — pour la colonne « Moyen » et le
 * filtre du Registre (demandé le 04/11/2026 : un filtre = un moyen, sans
 * les combinaisons, sans tenir compte des majuscules).
 *
 * Deux sources lues ensemble : `helicopter` (texte libre, seule source des
 * fiches importées de l'ancien logiciel — « DRAGON 38-1 », « Dragon 38-1,
 * Dragon 38-2 », « Dragon 38-1 et GMSP 26 »…) et `moyens_engages` (liste
 * Cim'Alerte jointe par « , » — c'est là seulement que figurent SDIS ou les
 * équipes terrestres sur les fiches récentes, `helicopter` y étant vide).
 */

/** Clé de comparaison : sans accents, sans casse, espaces resserrés, « 38.1 » = « 38-1 ». */
export const cleMoyen = (texte) =>
  (texte ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/(\d)\.(\d)/g, '$1-$2')
    .replace(/\s+/g, ' ')
    .trim()

// « Pas de moyens engagés » (ancien logiciel), « Aucun moyen engagé » (Cim'Alerte) : pas un moyen.
const CLES_SANS_MOYEN = new Set(['pas de moyens engages', 'pas de moyen engage', 'aucun moyen engage', 'aucun moyen'])
// Saisi comme « moyen » dans l'ancien logiciel pour une régulation — c'en est une, pas un moyen.
const CLES_REGULATION = new Set(['regulation'])
const CLES_HORS_CRS = new Set(['sdis', 'bt', 'samu routier'])

// Séparateurs explicites (« , », « ; », « + », « / », « et », tiret entouré d'espace), puis
// les combinaisons collées de l'ancien logiciel : « DRAGON 38-1 DRAGON 38-2 », « dragon 83
// gmsp 83 », « DRAGON 38-2 Terrestre » — coupées devant un nouvel indicatif d'appareil, ou
// devant « Terrestre » juste après un numéro (« SDIS en caravane terrestre » reste entier).
const INDICATIFS = /\s+(?=(?:dragon|choucas|gmsp|vitamine|yeti)\b)/i
const TERRESTRE_APRES_NUMERO = /(?<=\d)\s+(?=terrestre\b)/i
const decouper = (texte) =>
  (texte ?? '')
    .split(/\s*(?:,|;|\+|\/|\bet\b)\s*|\s*-\s+|\s+-\s*/i)
    .flatMap((m) => m.split(INDICATIFS))
    .flatMap((m) => m.split(TERRESTRE_APRES_NUMERO))
    .map((m) => m.replace(/\s+/g, ' ').trim())
    .filter(Boolean)

/** Moyens réels (graphie d'origine), sans doublon (comparés par cleMoyen). */
export function moyensDe(s) {
  const vus = new Map()
  for (const m of [...decouper(s.helicopter), ...decouper(s.moyens_engages)]) {
    const cle = cleMoyen(m)
    if (!cle || CLES_SANS_MOYEN.has(cle) || CLES_REGULATION.has(cle)) continue
    if (!vus.has(cle)) vus.set(cle, m)
  }
  return [...vus.values()]
}

export const estSansMoyen = (s) => moyensDe(s).length === 0

/** Régulation alerte : drapeau Cim'Alerte (clôture sans aucun statut), ou « Régulation » saisi comme moyen. */
export const estRegulation = (s) =>
  Boolean(s.regulation) || decouper(s.helicopter).some((m) => CLES_REGULATION.has(cleMoyen(m)))

/** Uniquement des moyens extérieurs (SDIS, BT, SAMU routier) — aucun moyen CRS. */
export const estHorsCRS = (s) => {
  const liste = moyensDe(s)
  return liste.length > 0 && liste.every((m) => CLES_HORS_CRS.has(cleMoyen(m)))
}

/** Texte de la colonne « Moyen » : les moyens un par un, ou « Pas de moyens » pour une régulation sans moyen. */
export function libelleMoyens(s) {
  const liste = moyensDe(s)
  if (liste.length > 0) return liste.join(', ')
  return estRegulation(s) ? 'Pas de moyens' : null
}

/**
 * Liste du filtre « Moyen » : une entrée par moyen (clé sans casse ni
 * accents), affichée sous sa graphie la plus fréquente dans les données.
 */
export function moyensDuFiltre(evenements) {
  const parCle = new Map()
  for (const s of evenements) {
    for (const m of moyensDe(s)) {
      const cle = cleMoyen(m)
      const graphies = parCle.get(cle) ?? new Map()
      graphies.set(m, (graphies.get(m) ?? 0) + 1)
      parCle.set(cle, graphies)
    }
  }
  return [...parCle.entries()]
    .map(([cle, graphies]) => ({
      cle,
      libelle: [...graphies.entries()].sort((a, b) => b[1] - a[1])[0][0],
    }))
    .sort((a, b) => a.libelle.localeCompare(b.libelle, 'fr'))
}

export const aLeMoyen = (s, cle) => moyensDe(s).some((m) => cleMoyen(m) === cle)
