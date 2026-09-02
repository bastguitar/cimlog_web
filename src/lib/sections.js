import { supabase } from './supabase'

/**
 * Regroupement section mère / postes secondaires — le même que côté base
 * (voir visibilite_regionale.sql, sections_lecture_region.sql). Un poste
 * secondaire partage toujours la couleur et le filtre de sa mère : inutile
 * de multiplier les entrées de légende pour Grenoble-Huez, Albertville-
 * Modane, etc.
 */
const GROUPES = {
  CRS38: ['CRS38', 'CRS38H'],
  CRS05: ['CRS05'],
  CRS73: ['CRS73', 'CRS73M', 'CRS73C'],
  CRS06: ['CRS06', 'CRS06S', 'CRS06V'],
  CRS65: ['CRS65', 'CRS65G', 'CRS65L', 'CRS65S'],
  CRS66: ['CRS66', 'CRS66B'],
}

const CODE_VERS_GROUPE = new Map()
for (const [groupe, codes] of Object.entries(GROUPES)) {
  for (const code of codes) CODE_VERS_GROUPE.set(code, groupe)
}

/** Code de la section mère d'un squad_code — lui-même s'il n'a pas de mère connue. */
export const groupeDe = (squadCode) => CODE_VERS_GROUPE.get(squadCode) ?? squadCode

/** Tous les squad_code d'un groupe (section mère + postes secondaires) — pour interroger cimlog_evenements/cimlog_messages. */
export const codesDuGroupe = (groupeCode) => GROUPES[groupeCode] ?? [groupeCode]

const PALETTE = ['#3b82c4', '#4d9e5c', '#e08a3c', '#2ba89e', '#8b5fbf', '#c4547e', '#b5a642', '#6b7c93']
const COULEUR_PAR_GROUPE = new Map(Object.keys(GROUPES).map((g, i) => [g, PALETTE[i % PALETTE.length]]))

/** Couleur fixe d'une section (retrouvée via son groupe) — grise si inconnue. */
export const couleurSection = (squadCode) => COULEUR_PAR_GROUPE.get(groupeDe(squadCode)) ?? '#8a8a8a'

/**
 * Sections mères de la région du poste connecté, avec leur couleur — pour la
 * légende/filtre par section. `sections` reste lisible par tout poste
 * connecté (voir auth_rls.sql, policy "lecture") : ce n'est qu'un nom et une
 * région, jamais une intervention.
 */
export async function sectionsDeLaRegion(codeSection) {
  const { data, error } = await supabase.from('sections').select('code, nom, region').eq('code', codeSection).single()
  if (error) throw new Error(`Section : ${error.message}`)
  const region = data.region
  if (!region) return []

  const codesMeres = Object.keys(GROUPES)
  const { data: meres, error: erreurMeres } = await supabase
    .from('sections')
    .select('code, nom, region, lat, lon, zoom')
    .in('code', codesMeres)
    .eq('region', region)
    .order('nom', { ascending: true })
  if (erreurMeres) throw new Error(`Sections : ${erreurMeres.message}`)

  return meres.map((s) => ({ ...s, couleur: couleurSection(s.code) }))
}
