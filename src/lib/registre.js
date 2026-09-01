import { supabase } from './supabase'

/**
 * Interventions d'une année, les plus récentes d'abord — pour le Registre.
 * Même sélection que alerte_secours_web/src/lib/alertesCarte.js, listerAnnee :
 * `team` (l'équipe engagée) et les noms de victimes suffisent pour la liste,
 * le détail complet se charge à part (voir ficheSecours) seulement à
 * l'ouverture d'une fiche.
 */
export async function listerAnnee(annee) {
  const debut = new Date(annee, 0, 1)
  const fin = new Date(annee + 1, 0, 1)
  const { data, error } = await supabase
    .from('events')
    .select(
      'id, local_id, squad_code, com, lieu, activity, statut, created_at, team, helicopter, lat, lon, is_med, ' +
        'victimes(nom, prenom)'
    )
    .neq('statut', 'brouillon')
    .gte('created_at', debut.toISOString())
    .lt('created_at', fin.toISOString())
    .order('created_at', { ascending: false })
  if (error) throw new Error(`Registre : ${error.message}`)
  return data ?? []
}

/** Interventions sur une période arbitraire — pour les Stats (fenêtre glissante, indépendante de l'année parcourue). */
export async function listerPeriode(debut, fin) {
  const { data, error } = await supabase
    .from('events')
    .select(
      'id, local_id, squad_code, com, lieu, activity, statut, created_at, team, helicopter, is_med, ' +
        'victimes(nom, prenom)'
    )
    .neq('statut', 'brouillon')
    .gte('created_at', debut.toISOString())
    .lt('created_at', fin.toISOString())
    .order('created_at', { ascending: true })
  if (error) throw new Error(`Statistiques : ${error.message}`)
  return data ?? []
}

/**
 * Fiche d'une intervention — tout ce qui a été saisi à la prise d'alerte
 * côté Cim'Alerte, plus les victimes. Pas les relevés terrain successifs ni
 * les photos (voir ResumeSecours.jsx côté alerte_secours_web pour la fiche
 * complète, orientée saisie et suivi en direct) — ici on relit après coup,
 * on ne suit pas une intervention en cours.
 */
export async function ficheSecours(id) {
  const { data, error } = await supabase
    .from('events')
    .select(
      'id, local_id, squad_code, com, lieu, activity, accident_type, statut, created_at, team, ' +
        'county, alt, lat, lon, massif, tgi, type_localisation, meteo, ' +
        'requerant_nom, requerant_telephone, contre_appel, alert_origin, alert_at, ' +
        'description, pathologies, is_med, infirmier, equipe_terrestre, ' +
        'helicopter, support_units, type_intervention, moyens_engages, ' +
        'recherche_personne, personne_recherchee_nom, snosm, ' +
        'victimes(id, local_id, sexe, age, pathologie, gravite, circonstances, cinetique, douleur, ' +
        'nom, prenom, date_naissance, lieu_naissance, telephone, bilan_terrain)'
    )
    .eq('id', id)
    .single()
  if (error) throw new Error(`Fiche : ${error.message}`)
  return data
}
