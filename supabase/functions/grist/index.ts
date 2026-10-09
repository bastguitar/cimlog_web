/**
 * Proxy Grist pour Track'Log — lecture (et écriture) des interventions
 * clôturées, sans jamais exposer la clé API Grist au navigateur.
 *
 * Track'Log va bientôt tourner sur un réseau administratif fermé, sans accès
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
import JSZip from 'npm:jszip@3.10.1'

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
  // Contenu édité du TO (JSON) et date de dernière validation — posés par "Valider et créer le TO"
  // (voir telegrammeTO.js/ModaleTO.jsx). Pas de verrou associé : la fiche reste modifiable après
  // création du TO (décision utilisateur — la vraie synchronisation SNOSM vers Chamonix se fait
  // plusieurs jours après, on peut régénérer un TO à jour entre-temps).
  ['snosm_to_texte', 'SnosmTOTexte', 'text'],
  ['snosm_to_cree_le', 'SnosmTOCreeLe', 'datetime'],
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
  // Texte libre (Numeric -> Text) : même traitement que les autres mesures, saisie avec unité dans la case.
  ['snosm_avalanche_denivele', 'SnosmAvalancheDenivele', 'text'],
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
  RecherchePersonne, PersonneRechercheeNom, NombreVictimes, CosDuJour, TelephonisteDuJour, ${CHAMPS_SNOSM_INTERVENTION.map(([, col]) => col).join(', ')}`

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
    // depuisGrist(..., 'bool') plutôt qu'un passthrough brut : Grist renvoie ces deux colonnes en
    // 0/1 (pas un vrai booléen JS) via l'API SQL — un `{is_med && <Composant/>}` react affichait le
    // "0" littéral au lieu de rien du tout pour une intervention non médicalisée (bug remonté par
    // l'utilisateur, pastille MED du Registre : "Choucas 050" au lieu de "Choucas 05").
    is_med: depuisGrist(f.Medicalisation, 'bool'),
    infirmier: depuisGrist(f.Infirmier, 'bool'),
    support_units: f.SupportUnits,
    type_intervention: f.TypeOperation,
    moyens_engages: f.MoyensEngages,
    recherche_personne: f.RecherchePersonne,
    personne_recherchee_nom: f.PersonneRechercheeNom,
    // Renseignés par Cim'Alerte seulement sur le premier secours clôturé de la journée pour cette
    // section (les suivants du même jour les laissent vides exprès) — voir cosTelephonisteDuJour
    // pour retrouver la valeur du jour quand elle est vide sur CETTE intervention précise.
    cos_du_jour: f.CosDuJour || null,
    telephoniste_du_jour: f.TelephonisteDuJour || null,
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
    profession_cim_alerte: f.Profession || null,
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

/** Ajoute un impliqué saisi à la main (pas connu de Cim'Alerte) — champs vides, tous modifiables ensuite comme n'importe quelle victime. */
async function ajouterVictime(docId: string, apiKey: string, squadCodes: string[], eventId: number) {
  await verifierEcritureAutorisee(docId, apiKey, squadCodes, eventId)
  const existantes = await requeteGrist(docId, apiKey, `select NumeroVictime from Victimes where EventId = ?`, [eventId])
  const prochainNumero = 1 + Math.max(0, ...existantes.map((v) => Number(v.NumeroVictime) || 0))
  const gristId = await postGrist(docId, apiKey, 'Victimes', { EventId: eventId, NumeroVictime: prochainNumero })
  return gristId
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
 * ReferentielActivites. Cim'Alerte fait foi : Track'Log ne garde plus aucune copie
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

/**
 * Grade (rang police) de chaque secouriste, pour préfixer son nom partout où il est proposé/inscrit
 * (Effectif CRS engagé, Rédacteur, Signataire, Directeur d'enquête — décision utilisateur,
 * 02/10/2026). Posé sur `matricules_secouristes` (voir sql/grade_secouristes.sql côté
 * alerte_secours_web), PAS l'annuaire (projet Supabase séparé) — cette table n'a aucune politique
 * RLS (accès normalement réservé à la fonction Edge connexion_matricule), lue ici via le
 * service_role comme pour reglages_techniques. On ne renvoie QUE secouriste_id/grade — jamais le
 * matricule lui-même ni les autres colonnes de cette table.
 */
async function chargerGrades() {
  const { data, error } = await service.from('matricules_secouristes').select('secouriste_id, grade').not('grade', 'is', null)
  if (error) throw new ErreurHttp(500, `matricules_secouristes : ${error.message}`)
  const grades: Record<string, string> = {}
  for (const r of (data ?? []) as Array<{ secouriste_id: string | null; grade: string }>) {
    if (r.secouriste_id) grades[r.secouriste_id] = r.grade
  }
  return grades
}

/**
 * COS/Téléphoniste du jour pour une section — Cim'Alerte ne remplit CosDuJour/TelephonisteDuJour
 * QUE sur le premier secours clôturé de la journée pour cette section (les suivants du même jour
 * les laissent vides exprès, pour ne pas répéter la même valeur sur chaque ligne). Utilisé quand
 * l'intervention consultée n'est pas la première du jour : on va chercher la ligne la plus
 * ancienne du jour pour cette section, `Section` déjà vérifiée contre `squadCodes` par l'appelant.
 */
async function cosTelephonisteDuJour(docId: string, apiKey: string, section: string, debut: number, fin: number) {
  // "is not null" ne suffit pas : Cim'Alerte pousse une CHAÎNE VIDE (pas un vrai NULL) sur les
  // interventions qui ne sont pas la première du jour — sans l'exclure explicitement, la ligne
  // vide (souvent plus proche dans le tri) gagnait sur la vraie valeur (bug trouvé en testant
  // avant déploiement, jamais vu par l'utilisateur).
  const [f] = await requeteGrist(
    docId,
    apiKey,
    `select CosDuJour, TelephonisteDuJour from Interventions where Section = ? and AlerteLe >= ? and AlerteLe < ? and ((CosDuJour is not null and CosDuJour != '') or (TelephonisteDuJour is not null and TelephonisteDuJour != '')) order by AlerteLe asc limit 1`,
    [section, debut, fin]
  )
  return { cos: (f?.CosDuJour as string) || null, telephoniste: (f?.TelephonisteDuJour as string) || null }
}

/**
 * Politique de conservation des données personnelles — Track'Log (décidée avec l'utilisateur,
 * 24-25/09/2026, dossier d'homologation). Contrairement à Cim'Alerte (purge en deux temps : 1 an
 * puis 10 ans — voir sql/purge_identites.sql côté alerte_secours_web), un seul passage à 10 ans ici :
 * les données vivent déjà sur le réseau sécurisé du Ministère (Grist), moins de pression pour agir
 * vite, seule une conservation trop longue reste à borner.
 *
 * Efface, 10 ans après l'alerte (AlerteLe) : tout ce qui identifie directement une personne (nom,
 * coordonnées, date/lieu de naissance) OU la décrit assez pour la reconnaître (récit libre des
 * circonstances). Conserve tout ce qui sert aux statistiques (date, commune de l'INTERVENTION,
 * activité, type d'accident, moyens engagés, sexe/âge/pathologie/gravité des victimes).
 *
 * ⚠ SnosmToTexte (le PDF du TO déjà validé, gardé en JSON pour retéléchargement) contient une copie
 * figée de tout ce qui est effacé ici (nom, circonstances…) — sans le vider aussi, l'anonymisation
 * serait incomplète. Il est donc effacé également ; SnosmTOCreeLe (juste une date) est conservé.
 *
 * ⚠ Rédacteur/Signataire/Directeur d'enquête (SnosmRedacteur/SnosmSignataire/SnosmDirecteurEnquete)
 * NE SONT PAS effacés : ce sont des membres du personnel CRS en service, pas des personnes secourues
 * — même logique que Cim'Alerte, qui ne purge jamais la liste des secouristes engagés. À confirmer
 * avec l'utilisateur si ce n'est pas ce qui est attendu.
 */
const COLONNES_VICTIME_A_ANONYMISER = [
  'Nom', 'Prenom', 'DateNaissance', 'LieuNaissance', 'Nationalite', 'Profession',
  'Telephone', 'Adresse', 'CodePostal', 'Commune', 'Circonstances', 'InfosComplementaires',
  'SnosmLieuNaissance', 'SnosmProfession', 'SnosmDemeurant', 'SnosmCommune', 'SnosmPays', 'SnosmCodePostal',
]
const COLONNES_INTERVENTION_A_ANONYMISER = [
  'RequerantNom', 'RequerantTelephone', 'PersonneRechercheeNom', 'CirconstancesGenerales', 'SnosmTOTexte',
]

/** Vérifie le secret du job planifié (pg_cron -> net.http_post) — jamais un jeton de poste, aucune notion de section/région ici : ce job s'applique à toutes les interventions, quelle que soit leur section. */
async function verifierSecretCron(requete: Request) {
  const { data, error } = await service.from('reglages_techniques').select('valeur').eq('cle', 'grist_cron_secret').maybeSingle()
  if (error || !data?.valeur) throw new ErreurHttp(500, 'grist_cron_secret non configuré (reglages_techniques).')
  const recu = requete.headers.get('X-Cron-Secret') ?? ''
  if (recu !== data.valeur) throw new ErreurHttp(401, 'Secret cron invalide.')
}

async function anonymiserAnciennesInterventions(docId: string, apiKey: string) {
  const limite = Math.floor((Date.now() - 10 * 365.25 * 24 * 3600 * 1000) / 1000)

  const victimes = await requeteGrist(
    docId,
    apiKey,
    `select v.id from Victimes v join Interventions i on i.EventId = v.EventId
     where i.AlerteLe < ? and (${COLONNES_VICTIME_A_ANONYMISER.map((c) => `(v.${c} is not null and v.${c} != '')`).join(' or ')})`,
    [limite]
  )
  const champsVideVictime = Object.fromEntries(COLONNES_VICTIME_A_ANONYMISER.map((c) => [c, null]))
  for (const v of victimes) await patchGrist(docId, apiKey, 'Victimes', v.id as number, champsVideVictime)

  const interventions = await requeteGrist(
    docId,
    apiKey,
    `select id from Interventions
     where AlerteLe < ? and (${COLONNES_INTERVENTION_A_ANONYMISER.map((c) => `(${c} is not null and ${c} != '')`).join(' or ')})`,
    [limite]
  )
  const champsVideIntervention = Object.fromEntries(COLONNES_INTERVENTION_A_ANONYMISER.map((c) => [c, null]))
  for (const i of interventions) await patchGrist(docId, apiKey, 'Interventions', i.id as number, champsVideIntervention)

  return { victimesAnonymisees: victimes.length, interventionsAnonymisees: interventions.length }
}

/**
 * Export périodique vers le SNOSM (Lars Fornel, ENSA Chamonix) — mail automatique avec un ZIP de
 * JSON, remplaçant l'extraction manuelle mensuelle que faisait jusqu'ici Manu Grigoletto depuis la
 * base police. Périmètre volontairement réduit par rapport à l'export actuel (voir échange mail avec
 * Lars, 07-09/10/2026) : Track'Log permet de saisir beaucoup plus d'informations que ce qui est
 * strictement nécessaire au SNOSM, certaines ne servant qu'au télégramme officiel interne — donc PAS
 * exportés : noms des fonctionnaires/secouristes (Rédacteur/Signataire/Directeur d'enquête/Effectif
 * engagé), identité complète des victimes (nom/prénom/adresse précise/téléphone/profession/
 * nationalité — seuls sexe/âge/code postal-commune/destination sont gardés), le compte-rendu
 * narratif (Circonstances), et tout l'onglet Avis (suivi judiciaire/autorités avisées/médias). Les
 * gestes de secourisme et techniques d'évacuation sont gardés (décision utilisateur, 09/10/2026).
 *
 * Valeurs envoyées en TEXTE CLAIR (jamais d'identifiant numérique interne à Track'Log/Grist) — Lars
 * n'a pas encore répondu sur ce point précis, mais c'est l'hypothèse de travail retenue (décision
 * utilisateur, 09/10/2026) : à son système d'import de faire la correspondance avec ses tables de
 * référence (tga_sexe, tga_commune, etc.) de son côté, à confirmer avec lui.
 *
 * Authentifié par le même secret cron que anonymiserAnciennesInterventions (job planifié, pas une
 * session de poste). Couvre TOUTES les sections par défaut (toutes les unités qui alimentent
 * Track'Log/Cim'Alerte) — c'est ce que fait déjà l'export actuel de Manu Grigoletto, que celui-ci
 * remplace (décision utilisateur, 09/10/2026) — voir TOUTES_SECTIONS dans exporterSnosm.
 */
const COLONNES_EXPORT_INTERVENTION = `id, EventId, NumeroIntervention, Statut, ClotureLe, AlerteLe, Departement, Massif, Commune, Lieu,
  SnosmNumeroTexte, SnosmOrigineAlerte, SnosmOrigineAlerteAutre, SnosmAlerteLe, SnosmDepartLe, SnosmArriveeLieuxLe, SnosmFinOperationLe,
  SnosmNatureOperation, Activite, Altitude, SnosmMeteo, SnosmTypeDomaine, SnosmLocalisationPiste, SnosmNeige, SnosmEncadrement, SnosmDiplomeEncadrant,
  SnosmTypeOperationMoyens, SnosmGestesSecourisme, SnosmTechniquesEvacuation,
  SnosmRenfortGendarmes, SnosmRenfortPompiers, SnosmRenfortPisteurs, SnosmRenfortMedecins, SnosmRenfortAutres,
  SnosmEquipesCynophilesCiviles, SnosmEquipesCynophilesGendarmerie, SnosmEquipesCynophilesPompiers, SnosmEquipesCynophilesPisteurs,
  SnosmAvalanche, SnosmAvalancheType, SnosmAvalancheTaille, SnosmAvalancheNiveauRisque, SnosmAvalancheDeclenchementLe, SnosmAvalanchePointDepartGPS,
  SnosmAvalancheLongueur, SnosmAvalancheLargeurCassure, SnosmAvalancheHauteurCassure, SnosmAvalancheLargeurDepot, SnosmAvalancheAltitude, SnosmAvalanchePente, SnosmAvalancheDenivele, SnosmAvalancheOrientation,
  SnosmAvalancheNombreImpliques, SnosmAvalancheNombreVictimes, SnosmAvalancheNombreBlesses, SnosmAvalancheNombreIndemnes, SnosmAvalancheNombreDecedes`

const COLONNES_EXPORT_VICTIME = `v.EventId, v.NumeroVictime, v.Sexe, v.DateNaissance, v.Age, v.SnosmCodePostal, v.SnosmCommune, v.SnosmDestination, v.SnosmVictimeAvalanche,
  v.SnosmAvalancheMoyensLocalisation, v.SnosmAvalancheDistanceM, v.SnosmAvalancheProfondeurCm, v.SnosmAvalancheDureeMn, v.SnosmAvalancheBouchonNeige, v.SnosmAvalanchePocheAir,
  v.SnosmAvalanchePosition1, v.SnosmAvalanchePosition2, v.SnosmAvalancheDureteNeige, v.SnosmAvalancheObstacles, v.SnosmAvalancheEnvironnement, v.SnosmAvalancheMateriel,
  v.SnosmAvalancheSacAirbag, v.SnosmAvalancheMarqueModele, v.SnosmAvalancheAlimentation, v.SnosmAvalancheGonflage, v.SnosmAvalanchePositionVictime, v.SnosmAvalancheSacEtVictime`

/** Âge À LA DATE DE L'INTERVENTION (pas aujourd'hui) — on envoie l'âge, jamais la date de naissance elle-même (trop identifiante). */
function calculerAge(dateNaissanceIso: string | null, dateReferenceIso: string | null): number | null {
  if (!dateNaissanceIso || !dateReferenceIso) return null
  const naissance = new Date(dateNaissanceIso)
  const reference = new Date(dateReferenceIso)
  if (Number.isNaN(naissance.getTime()) || Number.isNaN(reference.getTime())) return null
  let age = reference.getFullYear() - naissance.getFullYear()
  const avantAnniversaire =
    reference.getMonth() < naissance.getMonth() ||
    (reference.getMonth() === naissance.getMonth() && reference.getDate() < naissance.getDate())
  if (avantAnniversaire) age--
  return age
}

function victimeExport(f: Record<string, unknown>, alerteLeIso: string | null, numeroIntervention: unknown) {
  const ageCalcule = calculerAge((f.DateNaissance as string) || null, alerteLeIso)
  return {
    // Corrélation avec interventions.json — jamais l'id interne Grist (EventId), toujours notre
    // numéro d'intervention lisible (même logique que le reste de l'export : rien d'interne à
    // Track'Log/Grist ne doit fuiter dans le fichier envoyé).
    numero_intervention: numeroIntervention,
    numero: f.NumeroVictime,
    sexe: f.Sexe || null,
    age: ageCalcule ?? (f.Age || null),
    code_postal: f.SnosmCodePostal || null,
    commune: f.SnosmCommune || null,
    destination: f.SnosmDestination || null,
    victime_avalanche: depuisGrist(f.SnosmVictimeAvalanche, 'bool'),
    avalanche_moyens_localisation: f.SnosmAvalancheMoyensLocalisation || null,
    avalanche_distance_m: f.SnosmAvalancheDistanceM || null,
    avalanche_profondeur_cm: f.SnosmAvalancheProfondeurCm || null,
    avalanche_duree_mn: f.SnosmAvalancheDureeMn || null,
    avalanche_bouchon_neige: f.SnosmAvalancheBouchonNeige || null,
    avalanche_poche_air: f.SnosmAvalanchePocheAir || null,
    avalanche_position1: f.SnosmAvalanchePosition1 || null,
    avalanche_position2: f.SnosmAvalanchePosition2 || null,
    avalanche_durete_neige: f.SnosmAvalancheDureteNeige || null,
    avalanche_obstacles: f.SnosmAvalancheObstacles || null,
    avalanche_environnement: f.SnosmAvalancheEnvironnement || null,
    avalanche_materiel: f.SnosmAvalancheMateriel || null,
    avalanche_sac_airbag: f.SnosmAvalancheSacAirbag || null,
    avalanche_marque_modele: f.SnosmAvalancheMarqueModele || null,
    avalanche_alimentation: f.SnosmAvalancheAlimentation || null,
    avalanche_gonflage: f.SnosmAvalancheGonflage || null,
    avalanche_position_victime: f.SnosmAvalanchePositionVictime || null,
    avalanche_sac_et_victime: f.SnosmAvalancheSacEtVictime || null,
  }
}

function interventionExport(f: Record<string, unknown>) {
  return {
    numero_intervention: f.NumeroIntervention,
    numero_texte: f.SnosmNumeroTexte || null,
    departement: f.Departement || null,
    massif: f.Massif || null,
    commune: f.Commune || null,
    lieu: f.Lieu || null,
    origine_alerte: f.SnosmOrigineAlerte || null,
    origine_alerte_autre: f.SnosmOrigineAlerteAutre || null,
    alerte_le: depuisGrist(f.SnosmAlerteLe, 'datetime'),
    depart_le: depuisGrist(f.SnosmDepartLe, 'datetime'),
    arrivee_lieux_le: depuisGrist(f.SnosmArriveeLieuxLe, 'datetime'),
    fin_operation_le: depuisGrist(f.SnosmFinOperationLe, 'datetime'),
    nature_operation: f.SnosmNatureOperation || null,
    activite: f.Activite || null,
    altitude: f.Altitude || null,
    meteo: f.SnosmMeteo || null,
    type_domaine: f.SnosmTypeDomaine || null,
    localisation_piste: f.SnosmLocalisationPiste || null,
    neige: f.SnosmNeige || null,
    encadrement: f.SnosmEncadrement || null,
    diplome_encadrant: f.SnosmDiplomeEncadrant || null,
    type_operation: f.SnosmTypeOperationMoyens || null,
    gestes_secourisme: f.SnosmGestesSecourisme || null,
    techniques_evacuation: f.SnosmTechniquesEvacuation || null,
    renfort_gendarmes: f.SnosmRenfortGendarmes || null,
    renfort_pompiers: f.SnosmRenfortPompiers || null,
    renfort_pisteurs: f.SnosmRenfortPisteurs || null,
    renfort_medecins: f.SnosmRenfortMedecins || null,
    renfort_autres: f.SnosmRenfortAutres || null,
    equipes_cynophiles_civiles: f.SnosmEquipesCynophilesCiviles || null,
    equipes_cynophiles_gendarmerie: f.SnosmEquipesCynophilesGendarmerie || null,
    equipes_cynophiles_pompiers: f.SnosmEquipesCynophilesPompiers || null,
    equipes_cynophiles_pisteurs: f.SnosmEquipesCynophilesPisteurs || null,
    avalanche: depuisGrist(f.SnosmAvalanche, 'bool'),
    avalanche_type: f.SnosmAvalancheType || null,
    avalanche_taille: f.SnosmAvalancheTaille || null,
    avalanche_niveau_risque: f.SnosmAvalancheNiveauRisque || null,
    avalanche_declenchement_le: depuisGrist(f.SnosmAvalancheDeclenchementLe, 'datetime'),
    avalanche_point_depart_gps: f.SnosmAvalanchePointDepartGPS || null,
    avalanche_longueur: f.SnosmAvalancheLongueur || null,
    avalanche_largeur_cassure: f.SnosmAvalancheLargeurCassure || null,
    avalanche_hauteur_cassure: f.SnosmAvalancheHauteurCassure || null,
    avalanche_largeur_depot: f.SnosmAvalancheLargeurDepot || null,
    avalanche_altitude: f.SnosmAvalancheAltitude || null,
    avalanche_pente: f.SnosmAvalanchePente || null,
    avalanche_denivele: f.SnosmAvalancheDenivele || null,
    avalanche_orientation: f.SnosmAvalancheOrientation || null,
    avalanche_nb_impliques: f.SnosmAvalancheNombreImpliques || null,
    avalanche_nb_victimes: f.SnosmAvalancheNombreVictimes || null,
    avalanche_nb_blesses: f.SnosmAvalancheNombreBlesses || null,
    avalanche_nb_indemnes: f.SnosmAvalancheNombreIndemnes || null,
    avalanche_nb_decedes: f.SnosmAvalancheNombreDecedes || null,
  }
}

async function construireZip(fichiers: Record<string, unknown>): Promise<Uint8Array> {
  const zip = new JSZip()
  for (const [nom, contenu] of Object.entries(fichiers)) zip.file(nom, JSON.stringify(contenu, null, 2))
  return await zip.generateAsync({ type: 'uint8array' })
}

function versBase64(octets: Uint8Array): string {
  let binaire = ''
  for (const o of octets) binaire += String.fromCharCode(o)
  return btoa(binaire)
}

async function lireConfigEnvoiSnosm() {
  const { data, error } = await service
    .from('reglages_techniques')
    .select('cle, valeur')
    .in('cle', ['resend_api_key', 'snosm_email_expediteur', 'snosm_email_destinataire'])
  if (error) throw new ErreurHttp(500, `reglages_techniques : ${error.message}`)
  const parCle = Object.fromEntries((data ?? []).map((r: { cle: string; valeur: string }) => [r.cle, r.valeur]))
  if (!parCle.resend_api_key || !parCle.snosm_email_expediteur) throw new ErreurHttp(500, 'Envoi SNOSM non configuré (reglages_techniques).')
  return parCle as { resend_api_key: string; snosm_email_expediteur: string; snosm_email_destinataire?: string }
}

async function envoyerEmailSnosm(expediteur: string, destinataire: string, sujet: string, nomFichierZip: string, zipBase64: string) {
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${(await lireConfigEnvoiSnosm()).resend_api_key}` },
    body: JSON.stringify({
      from: expediteur,
      to: destinataire,
      subject: sujet,
      html: `<p>Export automatique Track'Log.</p><p>Fichier joint : ${nomFichierZip}</p>`,
      attachments: [{ filename: nomFichierZip, content: zipBase64 }],
    }),
  })
  if (!r.ok) throw new ErreurHttp(502, `Resend : ${r.status} ${await r.text()}`)
  return await r.json()
}

async function exporterSnosm(
  docId: string,
  apiKey: string,
  params: { debut?: string; fin?: string; destinataire?: string; squadCodes?: string[] }
) {
  const config = await lireConfigEnvoiSnosm()
  const destinataire = params.destinataire || config.snosm_email_destinataire
  if (!destinataire) throw new ErreurHttp(400, 'Aucun destinataire (ni params.destinataire, ni snosm_email_destinataire).')

  // Toutes les sections connues (voir GROUPES dans src/lib/sections.js — pas d'import inter-fichier
  // possible ici, déploiement en copier-coller d'un seul fichier) : contrairement à l'intuition
  // initiale, cet export doit couvrir TOUTES les unités qui alimentent Track'Log/Cim'Alerte, pas
  // seulement CRS05 — c'est ce que fait déjà l'export actuel de Manu Grigoletto (toute la base,
  // sans filtre de section), que celui-ci remplace (décision utilisateur, 09/10/2026).
  const TOUTES_SECTIONS = [
    'CRS38', 'CRS38H', 'CRS05', 'CRS73', 'CRS73M', 'CRS73C',
    'CRS06', 'CRS06S', 'CRS06V', 'CRS65', 'CRS65G', 'CRS65L', 'CRS65S', 'CRS66', 'CRS66B',
  ]
  const squadCodes = params.squadCodes?.length ? params.squadCodes : TOUTES_SECTIONS
  const fin = params.fin ? new Date(params.fin) : new Date()
  const debut = params.debut ? new Date(params.debut) : new Date(fin.getTime() - 31 * 24 * 3600 * 1000)
  const debutEpoch = Math.floor(debut.getTime() / 1000)
  const finEpoch = Math.floor(fin.getTime() / 1000)
  const placeholders = squadCodes.map(() => '?').join(', ')

  const [lignesInterventions, lignesVictimes] = await Promise.all([
    requeteGrist(
      docId,
      apiKey,
      `select ${COLONNES_EXPORT_INTERVENTION} from Interventions where Section in (${placeholders}) and Statut != 'brouillon' and ClotureLe is not null and AlerteLe >= ? and AlerteLe < ? order by AlerteLe asc`,
      [...squadCodes, debutEpoch, finEpoch]
    ),
    requeteGrist(
      docId,
      apiKey,
      `select ${COLONNES_EXPORT_VICTIME} from Victimes v join Interventions i on i.EventId = v.EventId where i.Section in (${placeholders}) and i.Statut != 'brouillon' and i.ClotureLe is not null and i.AlerteLe >= ? and i.AlerteLe < ?`,
      [...squadCodes, debutEpoch, finEpoch]
    ),
  ])

  const parEventId = new Map<number, Record<string, unknown>>()
  for (const f of lignesInterventions) parEventId.set(f.EventId as number, f)

  // Deux fichiers séparés dans le ZIP (interventions.json / victimes.json), corrélés par
  // numero_intervention — plus proche dans l'esprit du vrai export (plusieurs fichiers JSON par
  // entité) que notre premier essai (tout imbriqué dans un seul fichier), SANS reprendre les noms
  // de table ni les colonnes à identifiants numériques (CrsAccident.json, tga_sexe_id, etc.) de ce
  // vrai export : on n'a pas les tables de référence pour les remplir correctement (voir mails à
  // Lars, 07-09/10/2026) — risque d'erreur silencieuse côté import si on imite juste le nom de
  // fichier sans le contenu attendu derrière.
  const victimes = (lignesVictimes as Array<Record<string, unknown> & { EventId: number }>).map((v) => {
    const interv = parEventId.get(v.EventId)
    const alerteLeIso = interv ? (depuisGrist(interv.SnosmAlerteLe || interv.AlerteLe, 'datetime') as string | null) : null
    return victimeExport(v, alerteLeIso, interv?.NumeroIntervention ?? null)
  })

  const interventions = lignesInterventions.map((f) => interventionExport(f))

  const periode = `${debut.toISOString().slice(0, 10)}_au_${fin.toISOString().slice(0, 10)}`
  // Préfixe "CRS" + horodatage de génération (pas la période couverte) : convention demandée par
  // Lars, qui reprend le format de l'export actuel (ex. CRS_2026-09-11_122947.zip).
  const maintenant = new Date()
  const iso = maintenant.toISOString()
  const dateDuJour = iso.slice(0, 10) // AAAA-MM-JJ
  const heureDuJour = iso.slice(11, 19).replace(/:/g, '') // HHMMSS
  const nomFichierZip = `CRS_${dateDuJour}_${heureDuJour}.zip`
  const octetsZip = await construireZip({ 'interventions.json': interventions, 'victimes.json': victimes })
  const zipBase64 = versBase64(octetsZip)

  await envoyerEmailSnosm(config.snosm_email_expediteur, destinataire, `Export SNOSM Track'Log — ${periode}`, nomFichierZip, zipBase64)

  return { nombreInterventions: interventions.length, nombreVictimes: victimes.length, destinataire, periode }
}

/**
 * Debug/vérification — mêmes requêtes et mêmes transformations que exporterSnosm, mais renvoyées
 * directement dans la réponse HTTP (pas de ZIP, pas de mail) : sert à inspecter le contenu réel de
 * l'export sans attendre un envoi. Priorise les interventions dont la fiche SNOSM a été remplie dans
 * Track'Log (beaucoup de fiches anciennes n'ont que les champs de base poussés par Cim'Alerte — tout
 * le reste reste vide tant que personne n'a ouvert l'onglet SNOSM de cette intervention précise).
 */
async function apercuSnosm(
  docId: string,
  apiKey: string,
  params: { debut?: string; fin?: string; squadCodes?: string[]; limite?: number }
) {
  const TOUTES_SECTIONS = [
    'CRS38', 'CRS38H', 'CRS05', 'CRS73', 'CRS73M', 'CRS73C',
    'CRS06', 'CRS06S', 'CRS06V', 'CRS65', 'CRS65G', 'CRS65L', 'CRS65S', 'CRS66', 'CRS66B',
  ]
  const squadCodes = params.squadCodes?.length ? params.squadCodes : TOUTES_SECTIONS
  const fin = params.fin ? new Date(params.fin) : new Date()
  const debut = params.debut ? new Date(params.debut) : new Date(fin.getTime() - 31 * 24 * 3600 * 1000)
  const debutEpoch = Math.floor(debut.getTime() / 1000)
  const finEpoch = Math.floor(fin.getTime() / 1000)
  const placeholders = squadCodes.map(() => '?').join(', ')
  const limite = params.limite ?? 5

  const lignesInterventions = await requeteGrist(
    docId,
    apiKey,
    `select ${COLONNES_EXPORT_INTERVENTION} from Interventions where Section in (${placeholders}) and Statut != 'brouillon' and ClotureLe is not null and AlerteLe >= ? and AlerteLe < ? and (SnosmOrigineAlerte is not null and SnosmOrigineAlerte != '') order by AlerteLe desc limit ?`,
    [...squadCodes, debutEpoch, finEpoch, limite]
  )

  const eventIds = lignesInterventions.map((f) => f.EventId as number)
  const lignesVictimes = eventIds.length
    ? await requeteGrist(
        docId,
        apiKey,
        `select ${COLONNES_EXPORT_VICTIME} from Victimes v where v.EventId in (${eventIds.map(() => '?').join(', ')})`,
        eventIds
      )
    : []

  const parEventId = new Map<number, Record<string, unknown>>()
  for (const f of lignesInterventions) parEventId.set(f.EventId as number, f)

  const victimes = (lignesVictimes as Array<Record<string, unknown> & { EventId: number }>).map((v) => {
    const interv = parEventId.get(v.EventId)
    const alerteLeIso = interv ? (depuisGrist(interv.SnosmAlerteLe || interv.AlerteLe, 'datetime') as string | null) : null
    return victimeExport(v, alerteLeIso, interv?.NumeroIntervention ?? null)
  })

  return { interventions: lignesInterventions.map((f) => interventionExport(f)), victimes }
}

Deno.serve(async (requete) => {
  if (requete.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })

  try {
    const { action, params = {} } = await requete.json()

    // Job planifié (pg_cron -> net.http_post), jamais une session de poste : pas de notion de
    // section/région ici (l'anonymisation s'applique à toutes les interventions), donc authentifié
    // par un secret dédié plutôt que par cimlog_squad_codes_region() — vérifié AVANT tout le reste.
    if (action === 'anonymiserAnciennes') {
      await verifierSecretCron(requete)
      const { docId, apiKey } = await lireCleGrist()
      const resultat = await anonymiserAnciennesInterventions(docId, apiKey)
      return reponse({ ok: true, ...resultat })
    }
    if (action === 'exporterSnosm') {
      await verifierSecretCron(requete)
      const { docId, apiKey } = await lireCleGrist()
      const resultat = await exporterSnosm(docId, apiKey, params)
      return reponse({ ok: true, ...resultat })
    }
    if (action === 'apercuSnosm') {
      await verifierSecretCron(requete)
      const { docId, apiKey } = await lireCleGrist()
      const resultat = await apercuSnosm(docId, apiKey, params)
      return reponse({ ok: true, ...resultat })
    }

    const auth = requete.headers.get('Authorization') ?? ''
    const commeAppelant = createClient(url, anonKey, { global: { headers: { Authorization: auth } } })

    const { data: codesRegion, error: erreurRegion } = await commeAppelant.rpc('cimlog_squad_codes_region')
    if (erreurRegion) throw new ErreurHttp(401, 'Poste non identifié.')

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
    if (action === 'ajouterVictime') {
      const id = await ajouterVictime(docId, apiKey, squadCodes, params.eventId)
      return reponse({ ok: true, id })
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
    if (action === 'gradesSecouristes') {
      const grades = await chargerGrades()
      return reponse({ ok: true, grades })
    }
    if (action === 'cosTelephonisteDuJour') {
      if (!squadCodes.includes(params.section)) throw new ErreurHttp(403, 'Hors de votre région.')
      const debut = Math.floor(new Date(params.debut).getTime() / 1000)
      const fin = Math.floor(new Date(params.fin).getTime() / 1000)
      const resultat = await cosTelephonisteDuJour(docId, apiKey, params.section, debut, fin)
      return reponse({ ok: true, ...resultat })
    }

    throw new ErreurHttp(400, 'Action inconnue.')
  } catch (e) {
    const codeErreur = e instanceof ErreurHttp ? e.statut : 500
    return reponse({ ok: false, motif: (e as Error).message, codeErreur })
  }
})
