/**
 * Annuaire des personnels — projet Supabase distinct (fllhwnxrisofbgcehnux),
 * repris à l'identique de alerte_secours_web/src/lib/annuaire.js. Interrogé
 * en direct à chaque ouverture du formulaire, jamais recopié dans notre base
 * (mis à jour en permanence par ailleurs).
 *
 * ⚠ On ne sélectionne QUE id / nom / prénom / section_id. La table expose
 *   aussi email, password_hash et access_pin : ces colonnes ne doivent
 *   jamais descendre dans le navigateur.
 */
import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_ANNUAIRE_URL
const anonKey = import.meta.env.VITE_ANNUAIRE_ANON_KEY

export const annuaire = url && anonKey ? createClient(url, anonKey, { auth: { persistSession: false } }) : null

/**
 * Tout le personnel, toutes sections confondues, avec son affectation —
 * pour les champs SNOSM où n'importe quel secouriste peut être désigné
 * (Directeur d'enquête, Rédacteur, Signataire), pas seulement ceux de la
 * section courante.
 */
let cacheTous = null

export async function chargerTousSecouristes() {
  if (cacheTous) return cacheTous
  if (!annuaire) return []

  const [personnes, sections] = await Promise.all([
    annuaire.from('users').select('id, nom, prenom, section_id').eq('type_personnel', 'secouriste'),
    annuaire.from('sections').select('id, nom'),
  ])
  if (personnes.error || sections.error) return []

  const nomDeSection = new Map(sections.data.map((s) => [s.id, s.nom]))

  cacheTous = personnes.data
    .map((p) => ({
      id: p.id,
      libelle: `${p.nom} ${p.prenom ?? ''}`.trim(),
      section: nomDeSection.get(p.section_id) ?? 'Sans affectation',
    }))
    .sort((a, b) => a.libelle.localeCompare(b.libelle, 'fr'))

  return cacheTous
}
