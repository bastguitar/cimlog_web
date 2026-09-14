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
 * fonction) — y compris pour les victimes et l'effectif engagé, rattachés à
 * la même intervention.
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

/** Modifie des lignes existantes. */
async function patchGrist(docId: string, apiKey: string, table: string, gristId: number, champs: Record<string, unknown>) {
  const r = await fetch(`https://grist.numerique.gouv.fr/api/docs/${docId}/tables/${table}/records`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ records: [{ id: gristId, fields: champs }] }),
  })
  if (!r.ok) throw new ErreurHttp(502, `Grist : ${r.status} ${await r.text()}`)
}

/** Ajoute une ligne — renvoie son id Grist interne. */
async function postGrist(docId: string, apiKey: string, table: string, champs: Record<string, unknown>) {
  const r = await fetch(`https://grist.numerique.gouv.fr/api/docs/${docId}/tables/${table}/records`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ records: [{ fields: champs }] }),
  })
  if (!r.ok) throw new ErreurHttp(502, `Grist : ${r.status} ${await r.text()}`)
  const { records } = await r.json()
  return records[0].id as number
}

/** Supprime des lignes par id Grist interne. */
async function deleteGrist(docId: string, apiKey: string, table: string, gristIds: number[]) {
  const r = await fetch(`https://grist.numerique.gouv.fr/api/docs/${docId}/tables/${table}/data/delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(gristIds),
  })
  if (!r.ok) throw new ErreurHttp(502, `Grist : ${r.status} ${await r.text()}`)
}

// ---------------------------------------------------------------------------
// Champs SNOSM — une seule table [app-key, colonne Grist, type] par table
// Grist, utilisée à la fois pour lire (SELECT + mapping) et écrire (liste
// blanche + conversion) : évite que les quatre listes dérivent les unes des
// autres sur ~90 champs. Les colonnes Grist restent du texte (le vocabulaire
// fermé du SNOSM est imposé côté client via <select>, voir
// src/lib/optionsSnosm.js — cette Edge Function reste agnostique du contenu
// des menus déroulants, elle ne fait que transporter la valeur choisie).
// ---------------------------------------------------------------------------
type TypeChamp = 'text' | 'int' | 'numeric' | 'bool' | 'datetime'

const CHAMPS_SNOSM_INTERVENTION: Array<[string, string, TypeChamp]> = [
  ['snosm_numero_texte', 'SnosmNumeroTexte', 'text'],
  ['snosm_origine_alerte', 'SnosmOrigineAlerte', 'text'],
  ['snosm_origine_alerte_autre', 'SnosmOrigineAlerteAutre', 'text'],
  ['snosm_alerte_le', 'SnosmAlerteLe', 'datetime'],
  ['snosm_depart_le', 'SnosmDepartLe', 'datetime'],
  ['snosm_arrivee_lieux_le', 'SnosmArriveeLieuxLe', 'datetime'],
  ['snosm_fin_operation_le', 'SnosmFinOperationLe', 'datetime'],
  ['snosm_meteo', 'SnosmMeteo', 'text'],
  ['snosm_nature_operation', 'SnosmNatureOperation', 'text'],
  ['snosm_type_domaine', 'SnosmTypeDomaine', 'text'],
  ['snosm_encadrement', 'SnosmEncadrement', 'text'],
  ['snosm_diplome_encadrant', 'SnosmDiplomeEncadrant', 'text'],
  ['snosm_localisation_piste', 'SnosmLocalisationPiste', 'text'],
  ['snosm_neige', 'SnosmNeige', 'text'],
  ['snosm_type_operation_moyens', 'SnosmTypeOperationMoyens', 'text'],
  ['snosm_ppsm', 'SnosmPPSM', 'text'],
  ['snosm_helicopteres', 'SnosmHelicopteres', 'text'],
  ['snosm_medicalisation', 'SnosmMedicalisation', 'text'],
  ['snosm_equipes_cynophiles_crs', 'SnosmEquipesCynophilesCRS', 'int'],
  ['snosm_equipes_drones', 'SnosmEquipesDrones', 'int'],
  ['snosm_emploi_heli_saf', 'SnosmEmploiHeliSAFJustification', 'text'],
  ['snosm_gestes_secourisme', 'SnosmGestesSecourisme', 'text'],
  ['snosm_techniques_evacuation', 'SnosmTechniquesEvacuation', 'text'],
  ['snosm_renfort_gendarmes', 'SnosmRenfortGendarmes', 'int'],
  ['snosm_renfort_pompiers', 'SnosmRenfortPompiers', 'int'],
  ['snosm_renfort_pisteurs', 'SnosmRenfortPisteurs', 'int'],
  ['snosm_renfort_medecins', 'SnosmRenfortMedecins', 'int'],
  ['snosm_renfort_autres', 'SnosmRenfortAutres', 'int'],
  ['snosm_equipes_cynophiles_civiles', 'SnosmEquipesCynophilesCiviles', 'int'],
  ['snosm_equipes_cynophiles_gendarmerie', 'SnosmEquipesCynophilesGendarmerie', 'int'],
  ['snosm_equipes_cynophiles_pompiers', 'SnosmEquipesCynophilesPompiers', 'int'],
  ['snosm_equipes_cynophiles_pisteurs', 'SnosmEquipesCynophilesPisteurs', 'int'],
  ['snosm_suivi_judiciaire', 'SnosmSuiviJudiciaire', 'text'],
  ['snosm_directeur_enquete', 'SnosmDirecteurEnquete', 'text'],
  ['snosm_autre_service_enquete', 'SnosmAutreServiceEnquete', 'text'],
  ['snosm_autorites_avisees', 'SnosmAutoritesAvisees', 'text'],
  ['snosm_medias_informes', 'SnosmMediasInformes', 'text'],
  ['snosm_avis_divers', 'SnosmAvisDivers', 'text'],
  ['snosm_redacteur', 'SnosmRedacteur', 'text'],
  ['snosm_signataire', 'SnosmSignataire', 'text'],
  ['snosm_avalanche', 'SnosmAvalanche', 'bool'],
  ['snosm_avalanche_type', 'SnosmAvalancheType', 'text'],
  ['snosm_avalanche_taille', 'SnosmAvalancheTaille', 'text'],
  ['snosm_avalanche_niveau_risque', 'SnosmAvalancheNiveauRisque', 'text'],
  ['snosm_avalanche_declenchement_le', 'SnosmAvalancheDeclenchementLe', 'datetime'],
  ['snosm_avalanche_point_depart_gps', 'SnosmAvalanchePointDepartGPS', 'text'],
  // Passées en texte libre côté Grist aussi (colonnes Numeric -> Text) : cliquer un par un jusqu'à
  // 150 avec le compteur +/- n'était pas praticable, décision utilisateur de taper la valeur.
  ['snosm_avalanche_longueur', 'SnosmAvalancheLongueur', 'text'],
  ['snosm_avalanche_largeur_cassure', 'SnosmAvalancheLargeurCassure', 'text'],
  ['snosm_avalanche_hauteur_cassure', 'SnosmAvalancheHauteurCassure', 'text'],
  ['snosm_avalanche_largeur_depot', 'SnosmAvalancheLargeurDepot', 'text'],
  ['snosm_avalanche_altitude', 'SnosmAvalancheAltitude', 'text'],
  // Texte libre côté Grist aussi (Numeric -> Text), comme les 4 autres mesures du schéma d'avalanche
  // (voir plus bas) : maintenant saisie directement sur le schéma, pas au compteur +/-.
  ['snosm_avalanche_pente', 'SnosmAvalanchePente', 'text'],
  ['snosm_avalanche_denivele', 'SnosmAvalancheDenivele', 'numeric'],
  ['snosm_avalanche_orientation', 'SnosmAvalancheOrientation', 'text'],
  ['snosm_avalanche_nb_impliques', 'SnosmAvalancheNombreImpliques', 'int'],
  ['snosm_avalanche_nb_victimes', 'SnosmAvalancheNombreVictimes', 'int'],
  ['snosm_avalanche_nb_blesses', 'SnosmAvalancheNombreBlesses', 'int'],
  ['snosm_avalanche_nb_indemnes', 'SnosmAvalancheNombreIndemnes', 'int'],
  ['snosm_avalanche_nb_decedes', 'SnosmAvalancheNombreDecedes', 'int'],
]

const CHAMPS_SNOSM_VICTIME: Array<[string, string, TypeChamp]> = [
  ['snosm_statut', 'SnosmStatut', 'text'],
  ['snosm_etat_medical', 'SnosmEtatMedical', 'text'],
  ['snosm_lieu_naissance', 'SnosmLieuNaissance', 'text'],
  ['snosm_profession', 'SnosmProfession', 'text'],
  ['snosm_demeurant', 'SnosmDemeurant', 'text'],
  ['snosm_localisation_blessure', 'SnosmLocalisationBlessure', 'text'],
  ['snosm_type_blessure', 'SnosmTypeBlessure', 'text'],
  ['snosm_commune', 'SnosmCommune', 'text'],
  ['snosm_pays', 'SnosmPays', 'text'],
  ['snosm_circonstances_liste', 'SnosmCirconstancesListe', 'text'],
  ['snosm_destination', 'SnosmDestination', 'text'],
  ['snosm_fin_prise_en_charge_le', 'SnosmFinPriseEnChargeLe', 'datetime'],
  ['snosm_avalanche_moyens_localisation', 'SnosmAvalancheMoyensLocalisation', 'text'],
  // Texte libre (Numeric -> Text) : saisie directe avec unité affichée dans la case, plus de compteur +/-.
  ['snosm_avalanche_distance_m', 'SnosmAvalancheDistanceM', 'text'],
  ['snosm_avalanche_profondeur_cm', 'SnosmAvalancheProfondeurCm', 'text'],
  ['snosm_avalanche_duree_mn', 'SnosmAvalancheDureeMn', 'text'],
  ['snosm_avalanche_bouchon_neige', 'SnosmAvalancheBouchonNeige', 'text'],
  ['snosm_avalanche_poche_air', 'SnosmAvalanchePocheAir', 'text'],
  ['snosm_avalanche_position1', 'SnosmAvalanchePosition1', 'text'],
  ['snosm_avalanche_position2', 'SnosmAvalanchePosition2', 'text'],
  ['snosm_avalanche_durete_neige', 'SnosmAvalancheDureteNeige', 'text'],
  ['snosm_avalanche_obstacles', 'SnosmAvalancheObstacles', 'text'],
  ['snosm_avalanche_environnement', 'SnosmAvalancheEnvironnement', 'text'],
  // DVA présent/en marche et Sac airbag : passés de case à cocher à radio oui/non (Bool -> Text),
  // pour un design harmonisé avec les autres radios de ce bloc.
  ['snosm_avalanche_dva_present', 'SnosmAvalancheDVAPresent', 'text'],
  ['snosm_avalanche_dva_en_marche', 'SnosmAvalancheDVAEnMarche', 'text'],
  // Pelle/Sonde/RECCO fusionnés dans un seul champ "Matériel utilisé" à choix multiple — remplace les
  // 3 cases à cocher séparées ci-dessus (colonnes SnosmAvalanchePelle/Sonde/RECCO laissées inutilisées
  // côté Grist plutôt que supprimées).
  ['snosm_avalanche_materiel', 'SnosmAvalancheMateriel', 'text'],
  ['snosm_avalanche_sac_airbag', 'SnosmAvalancheSacAirbag', 'text'],
  ['snosm_avalanche_marque_modele', 'SnosmAvalancheMarqueModele', 'text'],
  ['snosm_avalanche_alimentation', 'SnosmAvalancheAlimentation', 'text'],
  ['snosm_avalanche_gonflage', 'SnosmAvalancheGonflage', 'text'],
  ['snosm_avalanche_position_victime', 'SnosmAvalanchePositionVictime', 'text'],
  ['snosm_avalanche_sac_et_victime', 'SnosmAvalancheSacEtVictime', 'text'],
  // Bascule indépendante de la case "Avalanche" de l'onglet dédié — permet d'afficher le bloc avalanche
  // d'une victime sans devoir cocher la case au niveau de l'intervention entière.
  ['snosm_victime_avalanche', 'SnosmVictimeAvalanche', 'bool'],
  ['snosm_code_postal', 'SnosmCodePostal', 'text'],
]

const CHAMPS_EFFECTIF: Array<[string, string, TypeChamp]> = [
  ['role', 'Role', 'text'],
  ['personne', 'Personne', 'text'],
  ['depassement_horaire', 'DepassementHoraire', 'bool'],
  ['heure_depassement', 'HeureDepassement', 'datetime'],
]

function depuisGrist(valeur: unknown, type: TypeChamp) {
  if (type === 'bool') return Boolean(valeur)
  if (valeur == null || valeur === '') return null
  if (type === 'datetime') return new Date(Number(valeur) * 1000).toISOString()
  return valeur
}

function versGristValeur(valeur: unknown, type: TypeChamp) {
  if (type === 'datetime') return valeur ? Math.floor(new Date(valeur as string).getTime() / 1000) : null
  return valeur
}

const COLONNES_INTERVENTIONS = `id, EventId, Section, NumeroIntervention, Statut, ClotureLe, TOEnvoyeLe,
  OrigineAlerte, AlerteLe, DepartLe, ArriveeLe, FinLe, Massif, Departement, Commune, Lieu, TypeLocalisation, Altitude, CoordonneesGPS,
  TGI, RequerantNom, RequerantTelephone, ContreAppel, Activite, AccidentType, TypeOperation, Helicopter,
  MoyensEngages, SupportUnits, Secouristes, Meteo, Medicalisation, Infirmier, CirconstancesGenerales,
  RecherchePersonne, PersonneRechercheeNom, NombreVictimes, ${CHAMPS_SNOSM_INTERVENTION.map(([, col]) => col).join(', ')}`

/** Même forme que l'ancien row Supabase `events` — pour ne rien changer côté Registre/CarteIGN/Stats/ModaleFiche. */
function versEvenementApp(
  f: Record<string, unknown>,
  victimesParEvent: Map<number, unknown[]>,
  effectifsParEvent: Map<number, unknown[]>
) {
  const [lat, lon] = String(f.CoordonneesGPS ?? '')
    .split(',')
    .map((x) => Number(x.trim()))
  const alerteLe = f.AlerteLe ? new Date(Number(f.AlerteLe) * 1000).toISOString() : null
  const eventId = f.EventId as number
  const base: Record<string, unknown> = {
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
    // Statuts terrain horodatés (main courante Cim'Alerte, premier DEPART/ASL/FIN de l'intervention) — lecture seule, jamais réécrits d'ici.
    depart_le: depuisGrist(f.DepartLe, 'datetime'),
    arrivee_le: depuisGrist(f.ArriveeLe, 'datetime'),
    fin_le: depuisGrist(f.FinLe, 'datetime'),
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
    effectifs_engages: effectifsParEvent.get(eventId) ?? [],
  }
  for (const [appKey, gristCol, type] of CHAMPS_SNOSM_INTERVENTION) base[appKey] = depuisGrist(f[gristCol], type)
  return base
}

function versVictimeApp(f: Record<string, unknown>) {
  const base: Record<string, unknown> = {
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
    statut_personne: f.StatutPersonne,
    // Calculées à l'échelle de l'intervention côté Cim'Alerte (pas par victime) — même valeur sur
    // toutes les lignes Victimes d'une fiche à plusieurs victimes. Correct dans l'immense majorité
    // des cas (une seule victime) ; à corriger à la main si plusieurs victimes d'une même
    // intervention sont parties vers des destinations différentes.
    destination_cim_alerte: f.Destination || null,
    depose_le: depuisGrist(f.DeposeLe, 'datetime'),
    adresse_cim_alerte: f.Adresse || null,
    lieu_naissance_cim_alerte: f.LieuNaissance || null,
    commune_cim_alerte: f.Commune || null,
    code_postal_cim_alerte: f.CodePostal || null,
  }
  for (const [appKey, gristCol, type] of CHAMPS_SNOSM_VICTIME) base[appKey] = depuisGrist(f[gristCol], type)
  return base
}

function versEffectifApp(f: Record<string, unknown>) {
  const base: Record<string, unknown> = { id: f.id }
  for (const [appKey, gristCol, type] of CHAMPS_EFFECTIF) base[appKey] = depuisGrist(f[gristCol], type)
  return base
}

function groupeParEvenement<T>(lignes: Array<Record<string, unknown> & { EventId: number }>, versApp: (f: Record<string, unknown>) => T) {
  const parEvenement = new Map<number, T[]>()
  for (const f of lignes) {
    const eventId = f.EventId
    if (!parEvenement.has(eventId)) parEvenement.set(eventId, [])
    parEvenement.get(eventId)!.push(versApp(f))
  }
  return parEvenement
}

/**
 * Interventions + leurs victimes — deux requêtes lancées EN PARALLÈLE
 * (Promise.all), pas l'une après l'autre : la seconde ne dépend pas du
 * résultat de la première (on filtre les victimes par un JOIN sur les mêmes
 * critères Section/date plutôt que par une liste d'EventId récupérée
 * d'abord), ce qui évite un aller-retour réseau supplémentaire vers Grist à
 * chaque chargement du Registre/Carte IGN/Stats. L'effectif engagé n'est PAS
 * chargé ici (coûteux, inutile pour une liste) — seulement dans ficheEvenement.
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
  const victimes = groupeParEvenement(lignesVictimes as Array<Record<string, unknown> & { EventId: number }>, versVictimeApp)
  const vide = new Map<number, unknown[]>()
  return lignes.map((f) => versEvenementApp(f, victimes, vide))
}

async function ficheEvenement(docId: string, apiKey: string, squadCodes: string[], eventId: number) {
  const placeholders = squadCodes.map(() => '?').join(', ')
  const [lignesEvt, lignesVictimes, lignesEffectifs] = await Promise.all([
    requeteGrist(
      docId,
      apiKey,
      `select ${COLONNES_INTERVENTIONS} from Interventions where EventId = ? and Section in (${placeholders})`,
      [eventId, ...squadCodes]
    ),
    requeteGrist(docId, apiKey, `select * from Victimes where EventId = ?`, [eventId]),
    requeteGrist(docId, apiKey, `select * from EffectifsEngages where EventId = ?`, [eventId]),
  ])
  const f = lignesEvt[0]
  if (!f) return null
  const victimes = groupeParEvenement(lignesVictimes as Array<Record<string, unknown> & { EventId: number }>, versVictimeApp)
  const effectifs = groupeParEvenement(lignesEffectifs as Array<Record<string, unknown> & { EventId: number }>, versEffectifApp)
  return versEvenementApp(f, victimes, effectifs)
}

/** app-key -> colonne Grist, pour les champs modifiables de l'onglet Infos (Phase 2) + SNOSM. */
const CHAMPS_MODIFIABLES_INTERVENTION: Record<string, [string, TypeChamp]> = {
  alert_origin: ['OrigineAlerte', 'text'],
  requerant_nom: ['RequerantNom', 'text'],
  requerant_telephone: ['RequerantTelephone', 'text'],
  contre_appel: ['ContreAppel', 'text'],
  personne_recherchee_nom: ['PersonneRechercheeNom', 'text'],
  county: ['Departement', 'text'],
  massif: ['Massif', 'text'],
  alt: ['Altitude', 'text'],
  tgi: ['TGI', 'text'],
  type_localisation: ['TypeLocalisation', 'text'],
  meteo: ['Meteo', 'text'],
  type_intervention: ['TypeOperation', 'text'],
  activity: ['Activite', 'text'],
  helicopter: ['Helicopter', 'text'],
  support_units: ['SupportUnits', 'text'],
  is_med: ['Medicalisation', 'bool'],
  infirmier: ['Infirmier', 'bool'],
  description: ['CirconstancesGenerales', 'text'],
  com: ['Commune', 'text'],
  lieu: ['Lieu', 'text'],
}
for (const [appKey, gristCol, type] of CHAMPS_SNOSM_INTERVENTION) CHAMPS_MODIFIABLES_INTERVENTION[appKey] = [gristCol, type]

// nom/prenom/date_naissance/sexe/nationalite/telephone/age : connus via Cim'Alerte mais désormais
// modifiables aussi depuis l'onglet Impliqué (décision utilisateur — corrige une saisie erronée à
// la prise d'appel). Volontairement PAS pathologie/circonstances/cinetique/douleur, retirés de cet
// onglet (redondants avec Circonstances SNOSM et le compte-rendu généré automatiquement).
const CHAMPS_MODIFIABLES_VICTIME: Record<string, [string, TypeChamp]> = {
  nom: ['Nom', 'text'],
  prenom: ['Prenom', 'text'],
  date_naissance: ['DateNaissance', 'text'],
  sexe: ['Sexe', 'text'],
  nationalite: ['Nationalite', 'text'],
  telephone: ['Telephone', 'text'],
  age: ['Age', 'int'],
}
for (const [appKey, gristCol, type] of CHAMPS_SNOSM_VICTIME) CHAMPS_MODIFIABLES_VICTIME[appKey] = [gristCol, type]

const CHAMPS_MODIFIABLES_EFFECTIF: Record<string, [string, TypeChamp]> = {}
for (const [appKey, gristCol, type] of CHAMPS_EFFECTIF) CHAMPS_MODIFIABLES_EFFECTIF[appKey] = [gristCol, type]

function traduireChamps(champsDemandes: Record<string, unknown>, dictionnaire: Record<string, [string, TypeChamp]>) {
  const champs: Record<string, unknown> = {}
  for (const [cle, valeur] of Object.entries(champsDemandes ?? {})) {
    const entree = dictionnaire[cle]
    if (entree) champs[entree[0]] = versGristValeur(valeur, entree[1])
  }
  return champs
}

/** Charge la ligne d'intervention et vérifie section + verrou — jamais confié au client. Sert de garde-fou pour TOUTE écriture liée à cette intervention (elle-même, ses victimes, son effectif). */
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
  const champs = traduireChamps(champsDemandes, CHAMPS_MODIFIABLES_INTERVENTION)
  if (Object.keys(champs).length === 0) throw new ErreurHttp(400, 'Aucun champ modifiable fourni.')
  await patchGrist(docId, apiKey, 'Interventions', ligne.id as number, champs)
}

/** Vérifie qu'une victime appartient bien à l'intervention (jamais confié au client) avant de la modifier/supprimer. */
async function verifierVictimeDeEvenement(docId: string, apiKey: string, victimeId: number, eventId: number) {
  const [v] = await requeteGrist(docId, apiKey, `select id from Victimes where id = ? and EventId = ?`, [victimeId, eventId])
  if (!v) throw new ErreurHttp(403, "Cette victime n'appartient pas à cette intervention.")
}

async function updateVictime(
  docId: string,
  apiKey: string,
  squadCodes: string[],
  eventId: number,
  victimeId: number,
  champsDemandes: Record<string, unknown>
) {
  await verifierEcritureAutorisee(docId, apiKey, squadCodes, eventId)
  await verifierVictimeDeEvenement(docId, apiKey, victimeId, eventId)
  const champs = traduireChamps(champsDemandes, CHAMPS_MODIFIABLES_VICTIME)
  if (Object.keys(champs).length === 0) throw new ErreurHttp(400, 'Aucun champ modifiable fourni.')
  await patchGrist(docId, apiKey, 'Victimes', victimeId, champs)
}

async function listerEffectifs(docId: string, apiKey: string, squadCodes: string[], eventId: number) {
  await verifierEcritureAutorisee(docId, apiKey, squadCodes, eventId).catch(() => {
    // Lecture seule tolérée même fiche figée — seule l'écriture doit être bloquée.
  })
  const lignes = await requeteGrist(docId, apiKey, `select * from EffectifsEngages where EventId = ?`, [eventId])
  return lignes.map(versEffectifApp)
}

async function ajouterEffectif(
  docId: string,
  apiKey: string,
  squadCodes: string[],
  eventId: number,
  champsDemandes: Record<string, unknown>
) {
  await verifierEcritureAutorisee(docId, apiKey, squadCodes, eventId)
  const champs = traduireChamps(champsDemandes, CHAMPS_MODIFIABLES_EFFECTIF)
  const gristId = await postGrist(docId, apiKey, 'EffectifsEngages', { EventId: eventId, ...champs })
  return gristId
}

async function modifierEffectif(
  docId: string,
  apiKey: string,
  squadCodes: string[],
  eventId: number,
  effectifId: number,
  champsDemandes: Record<string, unknown>
) {
  await verifierEcritureAutorisee(docId, apiKey, squadCodes, eventId)
  const [e] = await requeteGrist(docId, apiKey, `select id from EffectifsEngages where id = ? and EventId = ?`, [effectifId, eventId])
  if (!e) throw new ErreurHttp(403, "Cet effectif n'appartient pas à cette intervention.")
  const champs = traduireChamps(champsDemandes, CHAMPS_MODIFIABLES_EFFECTIF)
  if (Object.keys(champs).length === 0) throw new ErreurHttp(400, 'Aucun champ modifiable fourni.')
  await patchGrist(docId, apiKey, 'EffectifsEngages', effectifId, champs)
}

async function supprimerEffectif(docId: string, apiKey: string, squadCodes: string[], eventId: number, effectifId: number) {
  await verifierEcritureAutorisee(docId, apiKey, squadCodes, eventId)
  const [e] = await requeteGrist(docId, apiKey, `select id from EffectifsEngages where id = ? and EventId = ?`, [effectifId, eventId])
  if (!e) throw new ErreurHttp(403, "Cet effectif n'appartient pas à cette intervention.")
  await deleteGrist(docId, apiKey, 'EffectifsEngages', [effectifId])
}

/**
 * Référentiels hélicoptères/activités — poussés automatiquement par Cim'Alerte
 * (déclencheur Postgres sur ref_helico/ref_activites + fonction Edge dédiée,
 * voir pousser_referentiel.js côté alerte_secours_web) dans ReferentielHelicos/
 * ReferentielActivites. Cim'Alerte fait foi : Cim'Log ne garde plus aucune copie
 * en dur de ces deux listes, juste ce miroir, filtré sur les lignes actives et
 * trié dans l'ordre attendu par l'appli d'origine.
 */
async function listerReferentiels(docId: string, apiKey: string) {
  const [helicos, activites] = await Promise.all([
    requeteGrist(docId, apiKey, `select Nom from ReferentielHelicos where Actif = ? order by Ordre`, [true]),
    requeteGrist(docId, apiKey, `select Nom from ReferentielActivites where Actif = ? order by Ordre`, [true]),
  ])
  return {
    helicopteres: helicos.map((r) => r.Nom as string),
    activites: activites.map((r) => r.Nom as string),
  }
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
    if (action === 'updateVictime') {
      await updateVictime(docId, apiKey, squadCodes, params.eventId, params.victimeId, params.champs)
      return reponse({ ok: true })
    }
    if (action === 'listerEffectifs') {
      const effectifs = await listerEffectifs(docId, apiKey, squadCodes, params.eventId)
      return reponse({ ok: true, effectifs })
    }
    if (action === 'ajouterEffectif') {
      const id = await ajouterEffectif(docId, apiKey, squadCodes, params.eventId, params.champs)
      return reponse({ ok: true, id })
    }
    if (action === 'modifierEffectif') {
      await modifierEffectif(docId, apiKey, squadCodes, params.eventId, params.effectifId, params.champs)
      return reponse({ ok: true })
    }
    if (action === 'supprimerEffectif') {
      await supprimerEffectif(docId, apiKey, squadCodes, params.eventId, params.effectifId)
      return reponse({ ok: true })
    }
    if (action === 'referentiels') {
      const referentiels = await listerReferentiels(docId, apiKey)
      return reponse({ ok: true, referentiels })
    }

    throw new ErreurHttp(400, 'Action inconnue.')
  } catch (e) {
    const codeErreur = e instanceof ErreurHttp ? e.statut : 500
    return reponse({ ok: false, motif: (e as Error).message, codeErreur })
  }
})
