import { supabase } from './supabase'

/**
 * Identité du poste — repris à l'identique de alerte_secours_web/src/lib/session.js.
 *
 * Cim'Log utilise les MÊMES comptes que l'application de prise d'alerte : un
 * identifiant de poste (Grenoble, Albertville, Modane…) et son mot de passe.
 * La RLS de la base limite déjà chaque compte à sa section — pas de logique
 * de cloisonnement à reproduire ici, PostgreSQL s'en charge.
 */

const courriel = (identifiant) => `${identifiant.toLowerCase()}@postes.alerte-secours.fr`

/** Paramétrage du poste connecté, tel que la base l'autorise. */
export async function posteConnecte() {
  const { data: session } = await supabase.auth.getSession()
  if (!session.session) return null

  const { data, error } = await supabase
    .from('profils')
    .select('section, sections(code, nom, identifiant, groupe)')
    .single()
  if (error) throw new Error(`Profil du poste introuvable : ${error.message}`)

  return data.sections
}

/** Postes proposés à la connexion : tous ceux qui ont un identifiant propre. */
export async function postesDeConnexion() {
  const { data, error } = await supabase
    .from('sections')
    .select('code, nom, identifiant, groupe')
    .not('identifiant', 'is', null)
    .order('nom')
  if (error) throw new Error(`Liste des postes indisponible : ${error.message}`)
  return data ?? []
}

export async function connecter(identifiant, motDePasse) {
  const { error } = await supabase.auth.signInWithPassword({
    email: courriel(identifiant),
    password: motDePasse,
  })
  // Message volontairement identique pour un poste inconnu et un mot de passe
  // faux : distinguer les deux n'aiderait que quelqu'un qui cherche à deviner.
  if (error) throw new Error('Poste ou mot de passe incorrect.')

  return posteConnecte()
}

export async function deconnecter() {
  await supabase.auth.signOut()
}
