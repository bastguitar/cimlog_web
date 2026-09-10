/**
 * Proxy Grist pour Cim'Log — lecture (et écriture) des interventions
 * clôturées, sans jamais exposer la clé API Grist au navigateur.
 *
 * Cim'Log va bientôt tourner sur un réseau administratif fermé, sans accès
 * direct à la base Cim'Alerte : les interventions closes sont donc lues
 * depuis Grist (alimenté par pousser_intervention_grist, voir
 * grist_synchronisation*.sql côté alerte_secours_web), jamais directement
 * depuis `events`/`victimes`.
 *
 * Portée par section : mêmes garde-fous que cimlog_evenements/cimlog_victimes
 * (voir sections_lecture_region.sql, cimlog_web). La RPC
 * cimlog_squad_codes_region() est appelée ICI, côté serveur, avec le jeton du
 * poste appelant (jamais avec le service_role) — jamais confiée au client.
 * Les squadCodes demandés sont toujours filtrés contre elle : un poste ne
 * peut donc jamais lire (ni modifier) une section hors de sa région, quel que
 * soit ce qu'il transmet en paramètre. Toute écriture passe en plus par
 * verifierEcritureAutorisee, qui revérifie la section ET le verrou
 * TOEnvoyeLe (une fiche dont le télégramme officiel est déjà parti ne peut
 * plus être modifiée par personne, y compris via un appel direct à cette
 * fonction).
 *
 * La clé Grist elle-même n'est jamais dans ce fichier : elle est lue à
 * chaque appel dans reglages_techniques (même table que
 * pousser_intervention_grist), via le service_role auto-injecté par le
 * runtime Supabase — rien à configurer en plus de ce qui existe déjà.
 *
 * DÉPLOIEMENT (tableau de bord Supabase, aucun outil local requis) :
 *   1. Edge Functions > Deploy a new function > nom : grist
 *   2. Coller ce fichier
 *   3. Laisser « Verify JWT » COCHÉE (à l'inverse de connexion_matricule) :
 *      l'appelant est toujours une session de poste déjà connectée, jamais
 *      un appareil sans session.
 */
import { createClient } from 'npm:@supabase/supabase-js@2'

const url = Deno.env.get('SUPABASE_URL')!
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const service = createClient(url, serviceRoleKey)

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Toujours 200 côté transport, même en cas d'erreur applicative (motif +
// codeErreur dans le corps) : supabase-js traite tout statut non-2xx comme
// une erreur réseau générique (FunctionsHttpError) et n'expose pas le corps
// JSON qu'on aurait renvoyé — inutilisable pour distinguer un 409 (fiche
// figée) d'un 403 (hors région) côté appelant.
const reponse = (corps: unknown) =>
  new Response(JSON.stringify(corps), { status: 200, headers: { 'Content-Type': 'application/json', ...cors } })

class ErreurHttp extends Error {
  statut: number
  constructor(statut: number, message: string) {
    super(message)
    this.statut = statut
  }
}

// Ne change essentiellement jamais en cours de route — mise en cache pour
// la durée de vie de l'instance (les instances Edge Function sont réutilisées
// entre appels tant qu'elles restent "chaudes") pour éviter un aller-retour
// Postgres à chaque requête. Un redéploiement repart d'un cache vide.
let cleGristCache: { docId: string; apiKey: string } | null = null

/** Même table que pousser_intervention_grist — jamais de clé écrite dans ce fichier. */
async function lireCleGrist() {
  if (cleGristCache) return cleGristCache
  const { data, error } = await service.from('reglages_techniques').select('cle, valeur').in('cle', ['grist_doc_id', 'grist_api_key'])
  if (error) throw new ErreurHttp(500, `reglages_techniques : ${error.message}`)
  const parCle = Object.fromEntries((data ?? []).map((r: { cle: string; valeur: string }) => [r.cle, r.valeur]))
  if (!parCle.grist_doc_id || !parCle.grist_api_key) throw new ErreurHttp(500, 'Grist non configuré (reglages_techniques).')
  cleGristCache = { docId: parCle.grist_doc_id as string, apiKey: parCle.grist_api_key as string }
  return cleGristCache
}

/** Seul point de contact en LECTURE avec Grist — SQL paramétré, jamais fourni par le client. */
async function requeteGrist(docId: string, apiKey: string, sql: string, args: unknown[] = []) {
  const r = await fetch(`https://grist.numerique.gouv.fr/api/docs/${docId}/sql`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ sql, args }),
  })
  if (!r.ok) throw new ErreurHttp(502, `Grist : ${r.status} ${await r.text()}`)
  const { records } = await r.json()
  return ((records ?? []) as Array<{ fields: Record<string, unknown> }>).map((rec) => rec.fields)
}

/** Seul point de contact en ÉCRITURE avec Grist. */
async function patchGrist(docId: string, apiKey: string, table: string, gristId: number, champs: Record<string, unknown>) {
  const r = await fetch(`https://grist.numerique.gouv.fr/api/docs/${docId}/tables/${table}/records`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ records: [{ id: gristId, fields: champs }] }),
  })
  if (!r.ok) throw new ErreurHttp(502, `Grist : ${r.status} ${await r.text()}`)
}

const COLONNES_INTERVENTIONS = `id, EventId, Section, NumeroIntervention, Statut, ClotureLe, TOEnvoyeLe,
  OrigineAlerte, AlerteLe, Massif, Departement, Commune, Lieu, TypeLocalisation, Altitude, CoordonneesGPS,
  TGI, RequerantNom, RequerantTelephone, ContreAppel, Activite, AccidentType, TypeOperation, Helicopter,
  MoyensEngages, SupportUnits, Secouristes, Meteo, Medicalisation, Infirmier, CirconstancesGenerales,
  RecherchePersonne, PersonneRechercheeNom, NombreVictimes`

/** Même forme que l'ancien row Supabase `events` — pour ne rien changer côté Registre/CarteIGN/Stats/ModaleFiche. */
function versEvenementApp(f: Record<string, unknown>, victimesParEvent: Map<number, unknown[]>) {
  const [lat, lon] = String(f.CoordonneesGPS ?? '')
    .split(',')
    .map((x) => Number(x.trim()))
  const alerteLe = f.AlerteLe ? new Date(Number(f.AlerteLe) * 1000).toISOString() : null
  const eventId = f.EventId as number
  return {
    id: eventId,
    _gristId: f.id,
    local_id: f.NumeroIntervention,
    squad_code: f.Section,
    statut: f.Statut,
    com: f.Commune,
    lieu: f.Lieu,
    activity: f.Activite,
    accident_type: f.AccidentType,
    created_at: alerteLe,
    alert_at: alerteLe,
    alert_origin: f.OrigineAlerte,
    clotureLe: f.ClotureLe ? new Date(Number(f.ClotureLe) * 1000).toISOString() : null,
    toEnvoyeLe: f.TOEnvoyeLe ? new Date(Number(f.TOEnvoyeLe) * 1000).toISOString() : null,
    team: String(f.Secouristes ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    helicopter: f.Helicopter || null,
    county: f.Departement,
    massif: f.Massif,
    alt: f.Altitude,
    lat: Number.isFinite(lat) ? lat : null,
    lon: Number.isFinite(lon) ? lon : null,
    tgi: f.TGI,
    type_localisation: f.TypeLocalisation,
    meteo: f.Meteo,
    requerant_nom: f.RequerantNom,
    requerant_telephone: f.RequerantTelephone,
    contre_appel: f.ContreAppel,
    description: f.CirconstancesGenerales,
    is_med: f.Medicalisation,
    infirmier: f.Infirmier,
    support_units: f.SupportUnits,
    type_intervention: f.TypeOperation,
    moyens_engages: f.MoyensEngages,
    recherche_personne: f.RecherchePersonne,
    personne_recherchee_nom: f.PersonneRechercheeNom,
    victimes: victimesParEvent.get(eventId) ?? [],
  }
}

function versVictimeApp(f: Record<string, unknown>) {
  return {
    id: f.id,
    local_id: f.NumeroVictime,
    sexe: f.Sexe,
    age: f.Age,
    pathologie: f.Blessures,
    circonstances: f.Circonstances,
    cinetique: f.Cinetique,
    douleur: f.Douleur,
    nom: f.Nom,
    prenom: f.Prenom,
    date_naissance: f.DateNaissance || null,
    nationalite: f.Nationalite,
    telephone: f.Telephone,
  }
}

function groupeParEvenement(lignesVictimes: Record<string, unknown>[]) {
  const parEvenement = new Map<number, unknown[]>()
  for (const f of lignesVictimes) {
    const eventId = f.EventId as number
    if (!parEvenement.has(eventId)) parEvenement.set(eventId, [])
    parEvenement.get(eventId)!.push(versVictimeApp(f))
  }
  return parEvenement
}

/**
 * Interventions + leurs victimes — deux requêtes lancées EN PARALLÈLE
 * (Promise.all), pas l'une après l'autre : la seconde ne dépend pas du
 * résultat de la première (on filtre les victimes par un JOIN sur les mêmes
 * critères Section/date plutôt que par une liste d'EventId récupérée
 * d'abord), ce qui évite un aller-retour réseau supplémentaire vers Grist à
 * chaque chargement du Registre/Carte IGN/Stats.
 */
async function listerEvenements(
  docId: string,
  apiKey: string,
  squadCodes: string[],
  { debut, fin }: { debut?: string; fin?: string }
) {
  const placeholders = squadCodes.map(() => '?').join(', ')
  const args: unknown[] = [...squadCodes]
  let filtre = ` and Statut != 'brouillon'`
  if (debut) {
    filtre += ' and AlerteLe >= ?'
    args.push(Math.floor(new Date(debut).getTime() / 1000))
  }
  if (fin) {
    filtre += ' and AlerteLe < ?'
    args.push(Math.floor(new Date(fin).getTime() / 1000))
  }

  const [lignes, lignesVictimes] = await Promise.all([
    requeteGrist(
      docId,
      apiKey,
      `select ${COLONNES_INTERVENTIONS} from Interventions where Section in (${placeholders})${filtre} order by AlerteLe desc`,
      args
    ),
    requeteGrist(
      docId,
      apiKey,
      `select v.* from Victimes v join Interventions i on i.EventId = v.EventId where i.Section in (${placeholders})${filtre}`,
      args
    ),
  ])
  const victimes = groupeParEvenement(lignesVictimes)
  return lignes.map((f) => versEvenementApp(f, victimes))
}

async function ficheEvenement(docId: string, apiKey: string, squadCodes: string[], eventId: number) {
  const placeholders = squadCodes.map(() => '?').join(', ')
  const [lignesEvt, lignesVictimes] = await Promise.all([
    requeteGrist(
      docId,
      apiKey,
      `select ${COLONNES_INTERVENTIONS} from Interventions where EventId = ? and Section in (${placeholders})`,
      [eventId, ...squadCodes]
    ),
    requeteGrist(docId, apiKey, `select * from Victimes where EventId = ?`, [eventId]),
  ])
  const f = lignesEvt[0]
  if (!f) return null
  return versEvenementApp(f, groupeParEvenement(lignesVictimes))
}

/** app-key -> colonne Grist, pour les champs modifiables de l'onglet Infos (Phase 2). */
const CHAMPS_MODIFIABLES_INTERVENTION: Record<string, string> = {
  alert_origin: 'OrigineAlerte',
  requerant_nom: 'RequerantNom',
  requerant_telephone: 'RequerantTelephone',
  contre_appel: 'ContreAppel',
  personne_recherchee_nom: 'PersonneRechercheeNom',
  county: 'Departement',
  massif: 'Massif',
  alt: 'Altitude',
  tgi: 'TGI',
  type_localisation: 'TypeLocalisation',
  meteo: 'Meteo',
  type_intervention: 'TypeOperation',
  activity: 'Activite',
  helicopter: 'Helicopter',
  support_units: 'SupportUnits',
  is_med: 'Medicalisation',
  infirmier: 'Infirmier',
  description: 'CirconstancesGenerales',
  com: 'Commune',
  lieu: 'Lieu',
}

/** Charge la ligne et vérifie section + verrou — jamais confié au client. */
async function verifierEcritureAutorisee(docId: string, apiKey: string, squadCodes: string[], eventId: number) {
  const placeholders = squadCodes.map(() => '?').join(', ')
  const [f] = await requeteGrist(
    docId,
    apiKey,
    `select id, Section, TOEnvoyeLe from Interventions where EventId = ? and Section in (${placeholders})`,
    [eventId, ...squadCodes]
  )
  if (!f) throw new ErreurHttp(403, 'Hors de votre région.')
  if (f.TOEnvoyeLe) throw new ErreurHttp(409, 'Télégramme officiel déjà envoyé — fiche figée.')
  return f
}

async function updateIntervention(
  docId: string,
  apiKey: string,
  squadCodes: string[],
  eventId: number,
  champsDemandes: Record<string, unknown>
) {
  const ligne = await verifierEcritureAutorisee(docId, apiKey, squadCodes, eventId)
  const champs: Record<string, unknown> = {}
  for (const [cle, valeur] of Object.entries(champsDemandes ?? {})) {
    const colonne = CHAMPS_MODIFIABLES_INTERVENTION[cle]
    if (colonne) champs[colonne] = valeur
  }
  if (Object.keys(champs).length === 0) throw new ErreurHttp(400, 'Aucun champ modifiable fourni.')
  await patchGrist(docId, apiKey, 'Interventions', ligne.id as number, champs)
}

Deno.serve(async (requete) => {
  if (requete.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })

  try {
    const auth = requete.headers.get('Authorization') ?? ''
    const commeAppelant = createClient(url, anonKey, { global: { headers: { Authorization: auth } } })

    const { data: codesRegion, error: erreurRegion } = await commeAppelant.rpc('cimlog_squad_codes_region')
    if (erreurRegion) throw new ErreurHttp(401, 'Poste non identifié.')

    const { action, params = {} } = await requete.json()
    const squadCodesDemandes: string[] = params.squadCodes ?? []
    const squadCodes = squadCodesDemandes.filter((c) => (codesRegion ?? []).includes(c))
    if (squadCodes.length === 0) throw new ErreurHttp(403, 'Aucune section autorisée.')

    const { docId, apiKey } = await lireCleGrist()

    if (action === 'evenements') {
      const evenements = await listerEvenements(docId, apiKey, squadCodes, params)
      return reponse({ ok: true, evenements })
    }
    if (action === 'fiche') {
      const evenement = await ficheEvenement(docId, apiKey, squadCodes, params.eventId)
      if (!evenement) throw new ErreurHttp(404, 'Intervention introuvable.')
      return reponse({ ok: true, evenement })
    }
    if (action === 'updateIntervention') {
      await updateIntervention(docId, apiKey, squadCodes, params.eventId, params.champs)
      return reponse({ ok: true })
    }

    throw new ErreurHttp(400, 'Action inconnue.')
  } catch (e) {
    const codeErreur = e instanceof ErreurHttp ? e.statut : 500
    return reponse({ ok: false, motif: (e as Error).message, codeErreur })
  }
})
