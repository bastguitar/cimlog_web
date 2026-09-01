import { supabase } from './supabase'
import { dateISO } from './effectifs'

/** Minuit du jour donné, heure locale. */
export const debutDuJour = (jour = new Date()) => {
  const d = new Date(jour)
  d.setHours(0, 0, 0, 0)
  return d
}

const estAujourdhui = (jour) => dateISO(jour) === dateISO(new Date())

const SELECT_MESSAGES =
  'id_status, content, origin, type, created_at, event_id, squad_code, barre, ' +
  'events(local_id, squad_code, com, lieu, statut)'

/** Fenêtre pendant laquelle un message reste modifiable — voir edition_main_courante.sql. */
export const DUREE_MODIFICATION_MS = 2 * 60 * 60 * 1000

/**
 * Repères de localisation GPS de l'ancien logiciel — un numéro de téléphone
 * brut (« Localisation +336… ») ou une balise HTML pensée pour l'ancienne
 * interface (icône cliquable vers la carte, jamais interprétée ici). Cim'Alerte
 * ne les produit plus ; le stock existant ne doit apparaître nulle part dans
 * Cim'Log — ni la main courante, ni la vue synoptique, ni l'export PDF.
 */
const estMessageLocalisation = (contenu) =>
  contenu.startsWith('Localisation ') || contenu.includes('fas fa-map') || contenu.includes('Position GPS')

const mapMessage = (m) => ({
  idStatus: m.id_status,
  content: m.content,
  origin: m.origin,
  type: m.type,
  createdAt: m.created_at,
  eventId: m.event_id,
  localId: m.events?.local_id ?? null,
  squadCode: m.squad_code ?? m.events?.squad_code ?? null,
  com: m.events?.com ?? '',
  lieu: m.events?.lieu ?? '',
  statut: m.events?.statut ?? null,
  barre: m.barre ?? false,
})

/**
 * Messages de main courante d'une journée, toutes interventions confondues —
 * la RLS (`par_section` + `par_section_generale`, voir auth_rls.sql et
 * main_courante_generale.sql) restreint déjà aux sections visibles du poste
 * connecté, inutile de refiltrer côté client.
 *
 * Pas de borne haute pour aujourd'hui : un message qui vient d'arriver doit
 * apparaître sans attendre le minuit suivant — même choix que
 * alerte_secours_web/src/lib/alertesCarte.js, messagesDuJour.
 */
export async function messagesDuJour(jour) {
  const debut = debutDuJour(jour)
  const fin = new Date(debut)
  fin.setDate(fin.getDate() + 1)

  let requete = supabase.from('messages').select(SELECT_MESSAGES).gte('created_at', debut.toISOString())
  if (!estAujourdhui(debut)) requete = requete.lt('created_at', fin.toISOString())

  const { data, error } = await requete.order('created_at', { ascending: true })
  if (error) throw new Error(`Main courante du jour : ${error.message}`)

  return (data ?? [])
    .filter((m) => m.events?.statut !== 'brouillon')
    .filter((m) => !m.content.startsWith('***ALERTE SECOURS'))
    .filter((m) => !estMessageLocalisation(m.content))
    .map(mapMessage)
}

/** Messages sur une période arbitraire, bornes incluses/exclue — pour l'export PDF. */
export async function messagesEntre(debut, fin) {
  const { data, error } = await supabase
    .from('messages')
    .select(SELECT_MESSAGES)
    .gte('created_at', debut.toISOString())
    .lt('created_at', fin.toISOString())
    .order('created_at', { ascending: true })
  if (error) throw new Error(`Main courante : ${error.message}`)

  return (data ?? [])
    .filter((m) => m.events?.statut !== 'brouillon')
    .filter((m) => !m.content.startsWith('***ALERTE SECOURS'))
    .filter((m) => !estMessageLocalisation(m.content))
    .map(mapMessage)
}

/** Tous les messages d'une intervention précise, quel que soit le jour — pour le Registre. */
export async function messagesDeEvenement(eventId) {
  const { data, error } = await supabase
    .from('messages')
    .select(SELECT_MESSAGES)
    .eq('event_id', eventId)
    .order('created_at', { ascending: true })
  if (error) throw new Error(`Main courante de l’intervention : ${error.message}`)

  return (data ?? [])
    .filter((m) => !m.content.startsWith('***ALERTE SECOURS'))
    .filter((m) => !estMessageLocalisation(m.content))
    .map(mapMessage)
}

/**
 * Identités des victimes de plusieurs interventions, groupées par
 * intervention — pour afficher le détail sous un message « Identité
 * transmise : N personne(s) » (voir enregistrer_identites, côté
 * Cim'Alerte, qui pose ce message générique sans le détail).
 */
export async function victimesDesEvenements(eventIds) {
  if (eventIds.length === 0) return new Map()
  const { data, error } = await supabase
    .from('victimes')
    .select('event_id, nom, prenom, date_naissance, lieu_naissance, telephone')
    .in('event_id', eventIds)
    .not('nom', 'is', null)
  if (error) throw new Error(`Identités : ${error.message}`)

  const parEvenement = new Map()
  for (const v of data ?? []) {
    if (!parEvenement.has(v.event_id)) parEvenement.set(v.event_id, [])
    parEvenement.get(v.event_id).push(v)
  }
  return parEvenement
}

/**
 * Reconnaît le message générique posé par enregistrer_identites (« Identité
 * transmise : N personne(s) ») ainsi que la formulation plus ancienne des
 * données reprises de l'ancien logiciel (« Identité victime transmise »).
 */
export const estMessageIdentite = (contenu) => /identité.*transmise/i.test(contenu)

export function formatIdentiteVictime(v) {
  const nom = [v.nom, v.prenom].filter(Boolean).join(' ')
  const naissance = v.date_naissance
    ? `né(e) le ${new Date(v.date_naissance).toLocaleDateString('fr-FR')}${v.lieu_naissance ? ` à ${v.lieu_naissance}` : ''}`
    : v.lieu_naissance
      ? `né(e) à ${v.lieu_naissance}`
      : ''
  return [nom, naissance, v.telephone].filter(Boolean).join(', ')
}

/** Secours à proposer dans le sélecteur du composeur, pour rattacher un message. */
export async function secoursDuJour(jour) {
  const debut = debutDuJour(jour)
  const fin = new Date(debut)
  fin.setDate(fin.getDate() + 1)

  let requete = supabase
    .from('events')
    .select('id, local_id, squad_code, statut, com, lieu, activity, created_at')
    .neq('statut', 'brouillon')
  requete = estAujourdhui(debut)
    ? requete.or(`statut.eq.en_cours,created_at.gte.${debut.toISOString()}`)
    : requete.gte('created_at', debut.toISOString()).lt('created_at', fin.toISOString())

  const { data, error } = await requete.order('created_at', { ascending: true })
  if (error) throw new Error(`Secours du jour : ${error.message}`)
  return data ?? []
}

/**
 * Message non rattaché à une intervention — voir envoyer_message_general
 * (main_courante_generale.sql, étendu par mentions_service_general.sql).
 * `horodatage` : optionnel, pour une mention saisie après coup (jusqu’à 3h
 * dans le passé, vérifié côté base) — omis, le message porte l’heure actuelle.
 */
export async function envoyerMessageGeneral({ contenu, origine, squadCode, horodatage = null }) {
  const { data, error } = await supabase.rpc('envoyer_message_general', {
    p_contenu: contenu,
    p_origine: origine,
    p_squad_code: squadCode,
    p_horodatage: horodatage ? horodatage.toISOString() : null,
  })
  if (error) throw new Error(`Envoi impossible : ${error.message}`)
  if (!data?.ok) throw new Error(data?.motif ?? 'Message refusé par la base.')
  return data
}

/**
 * Message rattaché à une intervention précise. `avis: true` le consigne sans
 * notifier l'équipe engagée — voir envoyer_message_chat (avis_main_courante.sql).
 */
export async function envoyerMessageChat({ eventId, contenu, origine, avis = false }) {
  const { data, error } = await supabase.rpc('envoyer_message_chat', {
    p_event_id: eventId,
    p_contenu: contenu,
    p_origine: origine,
    p_secouriste_id: null,
    p_type: avis ? 'avis' : 'chat',
  })
  if (error) throw new Error(`Envoi impossible : ${error.message}`)
  if (!data?.ok) throw new Error(data?.motif ?? 'Message refusé par la base.')
  return data
}

/** Modifie le contenu d'un message — refusé passé 2h (voir edition_main_courante.sql). */
export async function modifierMessageMc({ idStatus, contenu }) {
  const { data, error } = await supabase.rpc('modifier_message_mc', {
    p_id_status: idStatus,
    p_contenu: contenu,
  })
  if (error) throw new Error(`Modification impossible : ${error.message}`)
  if (!data?.ok) throw new Error(data?.motif ?? 'Modification refusée par la base.')
  return data
}

/** Raye (ou dé-raye) un message — jamais de suppression, seulement cette marque. */
export async function rayerMessageMc({ idStatus, barre = true }) {
  const { data, error } = await supabase.rpc('rayer_message_mc', {
    p_id_status: idStatus,
    p_barre: barre,
  })
  if (error) throw new Error(`Action impossible : ${error.message}`)
  if (!data?.ok) throw new Error(data?.motif ?? 'Action refusée par la base.')
  return data
}

/**
 * Types de mention de service général — voir ModaleSG (MainCourante.jsx) et
 * mentions_service_general.sql. `estMentionSG` reconnaît une mention à son
 * contenu (« Rappel sur RC : … »), pas à son origine : une simple note
 * tapée à la main porte aussi `origin = 'SAISIE MANUELLE'`, mais ne doit
 * pas ressortir en rouge comme une vraie mention SG.
 */
export const TYPES_MENTION_SG = ['Rappel sur astreinte', 'Rappel sur RC', 'Fin de service']

export const estMentionSG = (contenu) => TYPES_MENTION_SG.some((t) => contenu.startsWith(`${t} :`))

/** Couleur par statut de secours — même palette que l'appli secouristes. */
export const STATUTS = {
  brouillon: { libelle: 'Prise d’alerte', couleur: '#64748b' },
  en_cours: { libelle: 'En cours', couleur: '#16a34a' },
  terminee: { libelle: 'Terminée', couleur: '#dc2626' },
}
