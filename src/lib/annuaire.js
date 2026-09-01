import { createClient } from '@supabase/supabase-js'

/**
 * Annuaire des personnels — projet Supabase distinct (fllhwnxrisofbgcehnux),
 * repris à l'identique de alerte_secours_web/src/lib/annuaire.js.
 *
 * La table `users` y est mise à jour en permanence par ailleurs : on ne la
 * recopie donc PAS dans notre base (`ref_secouristes`, créée vide, n'a
 * jamais été alimentée ni lue par aucune des deux applications — inutile de
 * s'y fier). La correspondance entre nos codes section et les identifiants
 * de cet annuaire est stockée dans notre table `sections`, colonne
 * `annuaire_section_id` (voir lib/session.js).
 *
 * ⚠ On ne sélectionne QUE nom / prénom / type_personnel. La table expose
 *   aussi `email`, `password_hash` et `access_pin` : ces colonnes ne doivent
 *   jamais descendre dans le navigateur.
 */

const url = import.meta.env.VITE_ANNUAIRE_URL
const anonKey = import.meta.env.VITE_ANNUAIRE_ANON_KEY

export const annuaire =
  url && anonKey ? createClient(url, anonKey, { auth: { persistSession: false } }) : null

/**
 * Lit l'annuaire par la vue restreinte si elle existe, par la table sinon —
 * la vue `annuaire_secours` (si posée côté annuaire, voir
 * alerte_secours_web/verrouiller_annuaire.sql) n'expose ni adresse ni
 * empreinte de mot de passe ; le repli sur `users` évite de dépendre de sa
 * présence.
 */
async function lireAnnuaire(colonnes, appliquerFiltres) {
  for (const source of ['annuaire_secours', 'users']) {
    const { data, error } = await appliquerFiltres(annuaire.from(source).select(colonnes))
    if (!error) return data ?? []
    // 42P01 : relation inexistante. Toute autre erreur est réelle.
    if (error.code !== '42P01' && !/does not exist|schema cache/i.test(error.message)) {
      throw new Error(`Annuaire : ${error.message}`)
    }
  }
  throw new Error('Annuaire illisible : ni la vue ni la table ne répondent.')
}

/** Secouristes d'une section, triés par nom — pour l'autocomplétion des effectifs. */
export async function secouristesDeSection(annuaireSectionId) {
  if (!annuaire) throw new Error('Annuaire non configuré (VITE_ANNUAIRE_URL manquant).')
  if (!annuaireSectionId) return []

  const data = await lireAnnuaire('id, nom, prenom', (q) =>
    q.eq('section_id', annuaireSectionId).eq('type_personnel', 'secouriste').order('nom')
  )

  return data.map((p) => ({
    id: p.id,
    nom: `${p.nom} ${p.prenom ?? ''}`.trim(),
  }))
}
