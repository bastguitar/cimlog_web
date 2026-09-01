import { supabase } from './supabase'

/**
 * Rôles de permanence d'une section (PERMANENCIER, COS, NUIT…) — stockés
 * dans `sections.statuts_mc`, éditables par le poste lui-même (voir
 * effectifs_mc.sql, policy `maj_statuts_mc`). Pas de liste figée dans le
 * code : chaque section a la sienne, comme `ref_secouristes`.
 */
export async function rolesDeLaSection(codeSection) {
  const { data, error } = await supabase
    .from('sections')
    .select('statuts_mc')
    .eq('code', codeSection)
    .single()
  if (error) throw new Error(`Rôles de permanence : ${error.message}`)
  return data?.statuts_mc ?? []
}

async function enregistrerRoles(codeSection, roles) {
  const { error } = await supabase.from('sections').update({ statuts_mc: roles }).eq('code', codeSection)
  if (error) throw new Error(`Rôles de permanence : ${error.message}`)
}

export async function ajouterRole(codeSection, roles, nom) {
  const libelle = nom.trim()
  if (!libelle || roles.includes(libelle)) return roles
  const suivants = [...roles, libelle]
  await enregistrerRoles(codeSection, suivants)
  return suivants
}

export async function retirerRole(codeSection, roles, nom) {
  const suivants = roles.filter((r) => r !== nom)
  await enregistrerRoles(codeSection, suivants)
  return suivants
}

export async function renommerRole(codeSection, roles, ancien, nouveau) {
  const libelle = nouveau.trim()
  if (!libelle || libelle === ancien) return roles
  const suivants = roles.map((r) => (r === ancien ? libelle : r))
  await enregistrerRoles(codeSection, suivants)
  return suivants
}
