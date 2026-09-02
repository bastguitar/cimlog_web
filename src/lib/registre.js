import { supabase } from './supabase'

/**
 * Victimes de plusieurs interventions, groupées par intervention — via la
 * RPC cimlog_victimes (voir sections_lecture_region.sql), qui ne rend que
 * les victimes d'interventions déjà dans la région du poste connecté :
 * aucun contrôle supplémentaire à faire côté client.
 */
async function victimesParEvenement(eventIds) {
  if (eventIds.length === 0) return new Map()
  const { data, error } = await supabase.rpc('cimlog_victimes', { p_event_ids: eventIds })
  if (error) throw new Error(`Victimes : ${error.message}`)
  const parEvenement = new Map()
  for (const v of data ?? []) {
    if (!parEvenement.has(v.event_id)) parEvenement.set(v.event_id, [])
    parEvenement.get(v.event_id).push(v)
  }
  return parEvenement
}

/**
 * Interventions d'une année, les plus récentes d'abord — pour le Registre.
 * Même sélection que alerte_secours_web/src/lib/alertesCarte.js, listerAnnee :
 * `team` (l'équipe engagée) et les noms de victimes suffisent pour la liste,
 * le détail complet se charge à part (voir ficheSecours) seulement à
 * l'ouverture d'une fiche.
 *
 * `codesRequete` : `null` (par défaut) garde le chemin d'origine, RLS
 * standard, sa propre section seulement. Un tableau de squad_code passe par
 * la RPC cimlog_evenements (voir sections_lecture_region.sql) — pour voir
 * une autre section ou toute sa région, choix explicite de l'utilisateur
 * (voir useFiltreSections), jamais le comportement par défaut.
 */
export async function listerAnnee(annee, codesRequete = null) {
  const debut = new Date(annee, 0, 1)
  const fin = new Date(annee + 1, 0, 1)

  if (!codesRequete) {
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

  const { data: evenements, error } = await supabase.rpc('cimlog_evenements', {
    p_squad_codes: codesRequete,
    p_debut: debut.toISOString(),
    p_fin: fin.toISOString(),
  })
  if (error) throw new Error(`Registre : ${error.message}`)
  const victimes = await victimesParEvenement((evenements ?? []).map((e) => e.id))
  return (evenements ?? [])
    .map((e) => ({ ...e, victimes: victimes.get(e.id) ?? [] }))
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
}

/** Interventions sur une période arbitraire — pour les Stats (fenêtre glissante, indépendante de l'année parcourue). */
export async function listerPeriode(debut, fin, codesRequete = null) {
  if (!codesRequete) {
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

  const { data: evenements, error } = await supabase.rpc('cimlog_evenements', {
    p_squad_codes: codesRequete,
    p_debut: debut.toISOString(),
    p_fin: fin.toISOString(),
  })
  if (error) throw new Error(`Statistiques : ${error.message}`)
  const victimes = await victimesParEvenement((evenements ?? []).map((e) => e.id))
  return (evenements ?? [])
    .map((e) => ({ ...e, victimes: victimes.get(e.id) ?? [] }))
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
}

/**
 * Fiche d'une intervention — tout ce qui a été saisi à la prise d'alerte
 * côté Cim'Alerte, plus les victimes. Pas les relevés terrain successifs ni
 * les photos (voir ResumeSecours.jsx côté alerte_secours_web pour la fiche
 * complète, orientée saisie et suivi en direct) — ici on relit après coup,
 * on ne suit pas une intervention en cours.
 *
 * `codesRequete` : voir listerAnnee — la fiche d'une intervention hors de sa
 * propre section (ouverte depuis une vue en mode région) doit passer par la
 * même RPC que la liste qui l'a affichée.
 */
export async function ficheSecours(id, codesRequete = null) {
  if (!codesRequete) {
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

  const { data: evenements, error } = await supabase.rpc('cimlog_evenements', {
    p_squad_codes: codesRequete,
    p_event_ids: [id],
  })
  if (error) throw new Error(`Fiche : ${error.message}`)
  const evenement = evenements?.[0]
  if (!evenement) throw new Error('Fiche : intervention introuvable.')
  const victimes = await victimesParEvenement([id])
  return { ...evenement, victimes: victimes.get(id) ?? [] }
}
