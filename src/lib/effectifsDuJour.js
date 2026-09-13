import { supabase } from './supabase'

/**
 * Effectif de permanence du jour — qui tenait quel rôle (COS, téléphoniste,
 * appelé « PERMANENCIER » ou « RADIO » selon les sections, aucun nom fixe :
 * voir alerte_secours_web/src/lib/roles.js) sur le poste qui a pris
 * l'intervention. Table `effectifs_mc`, déjà accessible en lecture depuis
 * Cim'Log (mis en place pour ça côté base) — lue ici pour proposer
 * l'ajout rapide à l'Effectif CRS Engagé d'une fiche SNOSM, sans ressaisie.
 *
 * Repose sur `squad_code`, pas la section mère : chaque poste (CRS73C,
 * CRS38H…) tient son propre effectif du jour, jamais mutualisé entre eux.
 */

/** « 2026-08-29 », en heure locale — même format que côté Cim'Alerte. */
const dateISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export async function effectifsDuJour(squadCode, jourReference) {
  if (!squadCode || !jourReference) return []
  const { data, error } = await supabase
    .from('effectifs_mc')
    .select('id, role, nom, secouriste_id, ordre')
    .eq('section_code', squadCode)
    .eq('jour', dateISO(new Date(jourReference)))
    .order('ordre', { ascending: true })
  // Silencieux plutôt que de casser l'affichage de la fiche : une section
  // sans effectif saisi ce jour-là, ou hors de portée RLS, n'est pas une erreur.
  if (error) return []
  return data ?? []
}
