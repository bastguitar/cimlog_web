import { supabase } from './supabase'

/** Identité lisible d'une victime — nom, naissance, téléphone, ce qui existe. */
export function formatIdentiteVictime(v) {
  const nom = [v.nom, v.prenom].filter(Boolean).join(' ')
  const naissance = v.date_naissance
    ? `né(e) le ${new Date(v.date_naissance).toLocaleDateString('fr-FR')}${v.lieu_naissance ? ` à ${v.lieu_naissance}` : ''}`
    : v.lieu_naissance
      ? `né(e) à ${v.lieu_naissance}`
      : ''
  return [nom, naissance, v.telephone].filter(Boolean).join(', ')
}

/** Nom de commune sans le code postal accolé (« Village - 38380 » -> « Village »), tel que saisi côté Cim'Alerte. */
export function sansCodePostal(com) {
  return (com ?? '').replace(/\s*-\s*\d{5}\s*$/, '')
}

/**
 * Juste le nom de famille d'un équipier, sans le prénom ni la section entre
 * parenthèses (« TARNOWKA Serge (BRIANCON) » -> « TARNOWKA ») — repose sur la
 * convention NOM (majuscules) Prénom (Section) déjà utilisée côté
 * Cim'Alerte : les mots en tête entièrement en majuscules forment le nom.
 */
export function nomSeul(equipier) {
  const sansSection = (equipier ?? '').split(' (')[0].trim()
  const mots = sansSection.split(' ')
  const nom = []
  for (const mot of mots) {
    if (mot && mot === mot.toUpperCase() && mot !== mot.toLowerCase()) nom.push(mot)
    else break
  }
  return nom.length > 0 ? nom.join(' ') : sansSection
}

/**
 * Point d'entrée unique vers l'Edge Function `grist` (voir
 * supabase/functions/grist) — jamais d'appel direct à l'API Grist depuis le
 * navigateur, la clé n'y est pas exposée. `codesRequete` (toujours un
 * tableau, voir useFiltreSections) est revérifié côté serveur contre la
 * région réelle du poste connecté : ce qu'on envoie ici n'est qu'une
 * demande, jamais une autorisation.
 */
async function appelerGrist(action, params) {
  const { data, error } = await supabase.functions.invoke('grist', { body: { action, params } })
  if (error) throw new Error(`Grist : ${error.message}`)
  if (!data?.ok) {
    const erreur = new Error(data?.motif ?? 'Erreur Grist')
    erreur.codeErreur = data?.codeErreur
    throw erreur
  }
  return data
}

/**
 * Interventions d'une année, les plus récentes d'abord — pour le Registre.
 * `codesRequete` : squad_code à interroger, calculé par useFiltreSections
 * (jamais confié tel quel côté serveur — revérifié contre la région réelle).
 */
export async function listerAnnee(annee, codesRequete) {
  const debut = new Date(annee, 0, 1)
  const fin = new Date(annee + 1, 0, 1)
  const { evenements } = await appelerGrist('evenements', {
    squadCodes: codesRequete,
    debut: debut.toISOString(),
    fin: fin.toISOString(),
  })
  return evenements
}

/** Interventions sur une période arbitraire — pour les Stats (fenêtre glissante, indépendante de l'année parcourue). */
export async function listerPeriode(debut, fin, codesRequete) {
  const { evenements } = await appelerGrist('evenements', {
    squadCodes: codesRequete,
    debut: debut.toISOString(),
    fin: fin.toISOString(),
  })
  return [...evenements].sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
}

/**
 * Fiche d'une intervention — tout ce qui a été saisi à la prise d'alerte
 * côté Cim'Alerte, plus les victimes. Pas les relevés terrain successifs ni
 * les photos (voir ResumeSecours.jsx côté alerte_secours_web pour la fiche
 * complète, orientée saisie et suivi en direct) — ici on relit après coup,
 * on ne suit pas une intervention en cours.
 */
export async function ficheSecours(id, codesRequete) {
  const { evenement } = await appelerGrist('fiche', { squadCodes: codesRequete, eventId: id })
  return evenement
}

/**
 * Modifie les champs généraux d'une intervention (onglet Infos de
 * ModaleFiche) — refusé côté serveur si la fiche est hors de la région du
 * poste connecté, ou si `TOEnvoyeLe` est déjà posé (télégramme officiel déjà
 * envoyé, fiche figée). `champs` porte les mêmes clés que celles lues par
 * ficheSecours (alert_origin, requerant_nom, meteo, …) — la traduction vers
 * les colonnes Grist se fait côté Edge Function, jamais ici.
 */
export async function modifierIntervention(id, codesRequete, champs) {
  await appelerGrist('updateIntervention', { squadCodes: codesRequete, eventId: id, champs })
}

/** Modifie les champs SNOSM d'une victime déjà connue de la fiche — mêmes règles que modifierIntervention. */
export async function modifierVictime(victimeId, eventId, codesRequete, champs) {
  await appelerGrist('updateVictime', { squadCodes: codesRequete, eventId, victimeId, champs })
}

/** Effectif CRS engagé (rôle, personne, dépassement horaire) — répétable, propre à l'onglet SNOSM. */
export async function listerEffectifsEngages(eventId, codesRequete) {
  const { effectifs } = await appelerGrist('listerEffectifs', { squadCodes: codesRequete, eventId })
  return effectifs
}

export async function ajouterEffectifEngage(eventId, codesRequete, champs) {
  const { id } = await appelerGrist('ajouterEffectif', { squadCodes: codesRequete, eventId, champs })
  return id
}

export async function modifierEffectifEngage(effectifId, eventId, codesRequete, champs) {
  await appelerGrist('modifierEffectif', { squadCodes: codesRequete, eventId, effectifId, champs })
}

export async function supprimerEffectifEngage(effectifId, eventId, codesRequete) {
  await appelerGrist('supprimerEffectif', { squadCodes: codesRequete, eventId, effectifId })
}
