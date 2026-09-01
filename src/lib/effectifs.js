import { supabase } from './supabase'

/** « 2026-08-29 », en heure locale — pas toISOString() qui bascule en UTC. */
export const dateISO = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** Effectifs déjà saisis pour ce jour, groupés par rôle dans l'ordre de saisie. */
export async function effectifsDuJour(codeSection, jour) {
  const { data, error } = await supabase
    .from('effectifs_mc')
    .select('id, role, nom, secouriste_id, ordre')
    .eq('section_code', codeSection)
    .eq('jour', dateISO(jour))
    .order('ordre', { ascending: true })
  if (error) throw new Error(`Effectifs du jour : ${error.message}`)

  const parRole = new Map()
  for (const ligne of data ?? []) {
    if (!parRole.has(ligne.role)) parRole.set(ligne.role, [])
    parRole.get(ligne.role).push(ligne)
  }
  return parRole
}

/** Effectifs sur une période, groupés par jour (« 2026-08-29 ») puis par rôle — pour l'export PDF. */
export async function effectifsEntre(codeSection, debut, fin) {
  const { data, error } = await supabase
    .from('effectifs_mc')
    .select('id, jour, role, nom, secouriste_id, ordre')
    .eq('section_code', codeSection)
    .gte('jour', dateISO(debut))
    .lte('jour', dateISO(fin))
    .order('ordre', { ascending: true })
  if (error) throw new Error(`Effectifs : ${error.message}`)

  const parJour = new Map()
  for (const ligne of data ?? []) {
    if (!parJour.has(ligne.jour)) parJour.set(ligne.jour, new Map())
    const parRole = parJour.get(ligne.jour)
    if (!parRole.has(ligne.role)) parRole.set(ligne.role, [])
    parRole.get(ligne.role).push(ligne)
  }
  return parJour
}

export async function ajouterEffectif({ codeSection, jour, role, nom, secouristeId = null, ordre = 0 }) {
  const libelle = nom.trim()
  if (!libelle) return
  const { error } = await supabase.from('effectifs_mc').insert({
    section_code: codeSection,
    jour: dateISO(jour),
    role,
    nom: libelle,
    secouriste_id: secouristeId,
    ordre,
  })
  if (error) throw new Error(`Ajout à l’effectif : ${error.message}`)
}

export async function retirerEffectif(id) {
  const { error } = await supabase.from('effectifs_mc').delete().eq('id', id)
  if (error) throw new Error(`Retrait de l’effectif : ${error.message}`)
}
