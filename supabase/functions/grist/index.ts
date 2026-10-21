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
 * Export périodique vers le SNOSM (Lars Fornell, ENSA Chamonix) — mail automatique avec un ZIP de
 * JSON au format EXACT attendu par leur import existant (voir CRS_schema_base.pdf, transmis par Lars
 * le 20/10/2026) : une table par fichier, mêmes noms de tables/colonnes que leur base, et des
 * identifiants numériques (pas nos libellés texte) pour les champs à choix fermé — leur import ne
 * fait aucune résolution de son côté. Remplace l'extraction manuelle mensuelle que faisait jusqu'ici
 * Manu Grigoletto depuis la base police.
 *
 * Périmètre toujours volontairement réduit (voir échanges avec Lars, 07-20/10/2026) : PAS exportés —
 * noms des fonctionnaires/secouristes (Rédacteur/Signataire/Directeur d'enquête/Effectif engagé, donc
 * aucune ligne CrsAccidentsFonctionnaire), identité complète des victimes (nom/prénom/adresse précise/
 * téléphone/profession/nationalité/pays — seuls sexe/âge calculé/code postal-commune/destination sont
 * gardés), tout l'onglet Avis SAUF Circonstances (suivi judiciaire/autorités avisées/médias toujours
 * exclus ; Circonstances incluse depuis le 20/10/2026 — Lars l'a signalée prioritaire côté SNOSM,
 * contrairement à notre périmètre initial). Pas de PPSM ni d'autorités avisées (confirmé inutile par Lars).
 *
 * ⚠ tga_commune_id (commune de l'intervention ET du domicile victime) reste VIDE : Lars n'a pas encore
 * transmis le contenu de tga_communes/tga_departements (redemandé le 20/10/2026, "référentiel national
 * standard, disponible sur demande"). Pas un bug — juste une correspondance encore impossible à faire.
 *
 * Authentifié par le même secret cron que anonymiserAnciennesInterventions (job planifié, pas une
 * session de poste). Couvre TOUTES les sections par défaut — voir TOUTES_SECTIONS_SNOSM plus bas.
 */

// ---------------------------------------------------------------------------------------------
// Correspondance vers les identifiants numériques SNOSM (CRS_schema_base.pdf, Lars Fornell, v1.0,
// 20/10/2026) — une paire [id, libellé exact du document] par valeur possible. normTxte() ignore
// accents/casse/ponctuation pour que notre vocabulaire (parfois formulé différemment) retrouve le
// bon id malgré tout ; quand l'ordre de nos propres menus (voir src/lib/optionsSnosm.js) correspond
// déjà exactement à celui du document, idParIndex() est utilisé à la place (plus sûr qu'un
// rapprochement textuel quand le libellé diffère un peu).
// ---------------------------------------------------------------------------------------------
function normTxte(valeur: unknown): string {
  return String(valeur ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
}

function idParTexte(valeur: unknown, paires: Array<[number, string]>, alias: Record<string, number> = {}): number | null {
  const v = normTxte(valeur)
  if (!v) return null
  if (alias[v] != null) return alias[v]
  const trouve = paires.find(([, label]) => normTxte(label) === v)
  return trouve ? trouve[0] : null
}

/** `options` dans le même ordre que le document Lars (vérifié un par un) — id = position + premierId. */
function idParIndex(valeur: unknown, options: string[], premierId = 1): number | null {
  const v = normTxte(valeur)
  if (!v) return null
  const i = options.findIndex((o) => normTxte(o) === v)
  return i === -1 ? null : i + premierId
}

/**
 * Pour les champs "choix multiples" (nos tags/cases séparés par ', ') -> plusieurs id. `alias`
 * couvre les cas où notre libellé (menu src/lib/optionsSnosm.js) et celui de Lars (CRS_schema_base.pdf)
 * désignent la même chose mais avec des mots différents (accord, mot manquant, coquille de son PDF) —
 * le simple rapprochement texte normalisé (idParTexte) ne suffit pas, vérifié un par un par
 * comparaison exhaustive des deux vocabulaires (20/10/2026), voir les dictionnaires ALIAS_* ci-dessous.
 */
function idsParTexteMultiple(valeur: unknown, paires: Array<[number, string]>, alias: Record<string, number> = {}): number[] {
  const valeurs = String(valeur ?? '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean)
  const ids: number[] = []
  for (const v of valeurs) {
    const id = idParTexte(v, paires, alias)
    if (id != null) ids.push(id)
  }
  return ids
}

function entierSi(valeur: unknown): number | null {
  if (valeur == null || valeur === '') return null
  const n = parseInt(String(valeur).replace(/[^0-9-]/g, ''), 10)
  return Number.isFinite(n) ? n : null
}

// crs_unites (p.29) — un id par section mère ou poste nommé ; les postes sans entrée propre
// (CRS38H Huez, CRS06V St-Martin-Vésubie, CRS65G/L/S Gavarnie/Luchon/St-Lary, CRS66B Bolquère)
// retombent sur l'id de leur section mère, faute de ligne dédiée chez Lars.
const CRS_UNITE_ID_PAR_GROUPE: Record<string, number> = { CRS73: 2, CRS05: 3, CRS38: 4, CRS06: 5, CRS65: 6, CRS66: 7 }
const CRS_UNITE_ID_PAR_SQUAD_CODE: Record<string, number> = { CRS73M: 8, CRS73C: 9 }
const GROUPES_SNOSM: Record<string, string> = {
  CRS38: 'CRS38',
  CRS38H: 'CRS38',
  CRS05: 'CRS05',
  CRS73: 'CRS73',
  CRS73M: 'CRS73',
  CRS73C: 'CRS73',
  CRS06: 'CRS06',
  CRS06S: 'CRS06',
  CRS06V: 'CRS06',
  CRS65: 'CRS65',
  CRS65G: 'CRS65',
  CRS65L: 'CRS65',
  CRS65S: 'CRS65',
  CRS66: 'CRS66',
  CRS66B: 'CRS66',
}
function crsUniteId(squadCode: string): number | null {
  return CRS_UNITE_ID_PAR_SQUAD_CODE[squadCode] ?? CRS_UNITE_ID_PAR_GROUPE[GROUPES_SNOSM[squadCode] ?? squadCode] ?? null
}

const CRS_ORIGINES_ORDRE = ['CODIS', 'SAMU', 'CORG', 'VICTIME TEMOIN', 'SERVICE DES PISTES', 'AUTRE']
const CRS_NATURE_OPERATIONS_ORDRE = ['Secours en montagne', 'Mission SAMU', 'Plan secours spéléologie', 'Assistance judiciaire', 'Plan SATER']

const CRS_NATURE_ACTIVITES: Array<[number, string]> = [
  [1, 'AERONEF'], [2, 'ALPINISME MIXTE'], [3, 'ALPINISME NEIGE ET GLACE'], [4, 'ALPINISME ROCHER'], [5, 'ANIMAUX'],
  [6, 'AUTRES ACTIVITES SPORTIVES'], [7, 'AUTRES DIVERS'], [8, 'AUTRES SPORTS DE GLISSE'], [9, 'BAIGNADE'], [10, 'BASE JUMP'],
  [11, 'CANYON'], [12, 'CASCADE DE GLACE'], [13, 'CATASTROPHE NATURELLE'], [14, 'CERF VOLANT TRACTION'],
  [15, 'CHASSE - PECHE - CHAMPIGNONS'], [16, 'CYCLE (AUTRES)'], [17, 'DELTAPLANE'], [18, 'ESCALADE ECOLE'], [19, 'EQUITATION'],
  [20, 'FALAISE (PLUSIEURS LONGUEURS)'], [21, 'HYDROSPEED'], [22, 'KAYAK'], [23, 'LUGE'], [24, 'PARAPENTE'], [25, 'PLANEUR'],
  [26, 'RANDONNEE PEDESTRE HORS SENTIER'], [27, 'RANDONNEE PEDESTRE (SUR SENTIER)'], [28, 'RAQUETTES A NEIGE'],
  [29, "REFUGE - TENTE - RESTAURANT D'ALTITUDE"], [30, 'REMONTEE MECANIQUE'], [31, 'SANITAIRE'], [32, 'SKI DE FOND'],
  [33, 'SKI DE MONTAGNE'], [34, 'SKI DE PENTE RAIDE'], [35, 'SKI DE PISTE'], [36, 'SKI DE RANDONNEE'], [37, 'SKI HORS PISTE'],
  [38, 'SPEEDRIDING'], [39, 'SPELEOLOGIE'], [40, 'SUICIDE'], [41, 'SNOWBOARD HORS PISTE'], [42, 'SNOWBOARD SUR PISTE'],
  [43, 'TRAIL'], [44, 'TRAVAIL EN HAUTEUR'], [45, 'TRAVAUX AGRICOLES'], [46, 'TRAVAUX FORESTIERS'], [47, 'ULM'],
  [48, 'VEHICULE A MOTEUR'], [49, 'VELO DE ROUTE'], [50, 'VIA-FERRATA / VIA CORDATA'], [51, 'VTT CROSS COUNTRY'],
  [52, 'VTT DH/ENDURO'], [53, 'WINGSUIT'], [54, 'AUTRE :'], [55, 'RAFTING'],
]
// ReferentielActivites (Cim'Alerte/Track'Alerte, vérifié en direct sur Grist le 20/10/2026) porte
// "Cycles (autres)" au pluriel, Lars "CYCLE (AUTRES)" au singulier.
const ALIAS_NATURE_ACTIVITE: Record<string, number> = { 'CYCLES AUTRES': 16 }

const TGA_MASSIFS: Array<[number, string]> = [
  [1, 'ALBERES'], [2, 'AURE LOURON'], [3, 'AUTRE'], [4, 'BELLEDONNE'], [5, 'BEVERA-PAILLONS'], [6, 'CANIGOU'], [7, 'CAPCIR'],
  [8, 'CERDAGNE'], [9, 'CHAMPSAUR'], [10, 'CHARTREUSE'], [11, 'CIANS'], [12, 'DEVOLUY'], [13, 'DIOIS'], [14, 'ECRINS'],
  [15, 'EMBRUNNAIS'], [16, 'ESTEREL'], [17, 'ESTERON'], [18, 'FENOUILLEDES ROUSSILLON'], [19, 'GRANDES ROUSSES'],
  [20, 'HAUT VAR'], [21, 'HAUT VERDON'], [22, 'HAUTE ROYA'], [23, 'HAUTE TINEE'], [24, 'HAUTE VESUBIE'], [25, 'HAUTE-BIGORRE'],
  [26, 'LITTORAL'], [27, 'LUCHONNAIS'], [28, 'MAURES'], [29, 'MERCANTOUR'], [30, 'MOYENNE TINEE'], [31, 'PAYS GRASSOIS'],
  [32, 'PAYS MENTONNAIS'], [33, 'PAYS NICOIS'], [34, 'PAYS VENCOIS'], [35, 'PELVOUX'], [36, 'PIEMONT 31'], [37, 'PIEMONT 65'],
  [38, 'PUYMORENS'], [39, 'QUEYRAS'], [40, 'ROYA'], [41, 'TAILLEFER'], [42, 'THABOR'], [43, 'UBAYE'], [44, 'VALLESPIR'],
  [45, 'VAR'], [46, 'VERCORS'], [47, 'VERDON'], [48, 'VESUBIE'], [49, 'BEAUFORTAIN'], [50, 'TARENTAISE'],
  [51, 'HAUTE TARENTAISE'], [52, 'LAUZIERE'], [53, 'ENCOMBRES'], [54, 'VANOISE'], [55, 'MAURIENNE'], [56, 'HAUTE MAURIENNE'],
  [57, 'LES GRANDES ROUSSES'], [58, 'LES CERCES'], [59, 'LE THABOR'], [60, 'LES BAUGES'], [61, 'LE MONT BLANC'],
  [62, 'HURTIERES'], [63, 'ARAVIS'], [64, 'LE CONFLENT'], [65, 'Albanais'], [66, 'Chablais'], [67, 'Giffre'], [68, 'Môle'],
  [69, 'Aiguilles Rouges'], [70, 'Salève'], [71, 'Bassin Chambérien'], [72, 'Jura'],
]

const TGA_ENCADREMENTS: Array<[number, string]> = [[1, 'Non encadré'], [2, 'Encadrement associatif'], [3, 'Encadrement professionnel']]

const TGA_DIPLOME_ENCADRANTS: Array<[number, string]> = [
  [1, 'Guide de haute montagne'],
  [2, 'Moniteur / Monitrice de ski'],
  [3, 'Accompagnateur / Accompagnatrice en moyenne montagne (AMM)'],
  [4, 'DEJEPS Canyonisme'],
  [5, 'DEJEPS Escalade'],
  [6, 'Autres'],
]
/** "amm" chez nous est une abréviation du libellé complet de Lars, "autre" (notre singulier) vs "Autres" (son pluriel) — cas particuliers avant le rapprochement par texte. */
function idDiplomeEncadrant(valeur: unknown): number | null {
  const v = normTxte(valeur)
  if (v === 'AMM') return 3
  if (v === 'AUTRE') return 6
  return idParTexte(valeur, TGA_DIPLOME_ENCADRANTS)
}

const TGA_TYPE_DOMAINES_ORDRE = [
  'Domaine montagne', 'Domaine skiable sur piste', 'Domaine skiable hors-piste', 'Autre à préciser', 'Village / Fond de Vallée',
]

const TGA_LOCPISTES: Array<[number, string]> = [
  [1, 'Piste verte'], [2, 'Piste bleue'], [3, 'Piste rouge'], [4, 'Piste noire'], [5, 'SnowPark et SnowCross'],
  [6, 'Compétition'], [7, 'Hors piste gravitaire'], [8, 'Montagne'], [9, 'Village'],
]

const TGA_NEIGES: Array<[number, string]> = [
  [1, 'Dure'], [2, 'Douce'], [3, 'Verglacée'], [4, 'Humide / de printemps'], [5, 'Poudreuse / fraiche'],
  [6, 'Croutée'], [7, 'Bosselée'], [8, 'Faible enneigement'],
]

// On n'a que 8 directions (rose des vents SNOSM), Lars en a 16 : on prend le point cardinal exact,
// jamais les intermédiaires. Libellés = son champ "point" (déjà en minuscules), pas "name".
const TGA_POINT_CARDINALS: Array<[number, string]> = [
  [1, 'nord'], [3, 'nord-est'], [5, 'est'], [7, 'sud-est'], [9, 'sud'], [11, 'sud-ouest'], [13, 'ouest'], [15, 'nord-ouest'],
]

const TGA_RAS_ORDRE = ['1-FAIBLE', '2-LIMITE', '3-MARQUE', '4-FORT', '5-TRES FORT']
const TGA_AVALANCHE_TYPES_ORDRE = [
  'neige fraiche',
  'neige soufflee (neige ventee)',
  'neige ancienne(sous couche fragile persistante)',
  'avalanche mouillee (neige humide)',
  'avalanche de glissement (avalanche de fond)',
]

/** "Taille d'avalanche" : comparé par le seul numéro 1-5 en tête du libellé — les deux formulations
 * ("coulee (petite avalanche)" chez nous / "Petite avalanche (coulée)" chez Lars) diffèrent sinon. */
function idTailleAvalanche(valeur: unknown): number | null {
  const m = String(valeur ?? '').match(/\d/)
  return m ? parseInt(m[0], 10) : null
}

const TGA_AVALANCHE_DURETES_ORDRE = ['faible (poing)', 'faible (4 doigts)', 'moyen (1 doigt)', 'forte (1 crayon)', 'forte (1 couteau)']
const TGA_AVALANCHE_POSITIONS_ORDRE = [
  'En surface',
  'Enseveli total',
  'Enseveli partiel critique (tête sous la neige)',
  'Enseveli partiel non critique (tête en dehors de la neige)',
]
const TGA_AVALANCHE_POSITION_CORPS_ORDRE = ['Sur le ventre', 'Sur le dos', 'Sur le côté', 'Tête en haut', 'Tête en bas']
const TGA_AVALANCHE_OBSTACLES_ORDRE = ['rocher', 'arbre', 'barre rocheuse', 'barre de serac', 'couloir', 'autre']

// Nos 8 valeurs correspondent aux 7 premières de Lars + "crevasse / rimaye" -> son id 9 (il a en plus
// "Replat", id 8, qu'on n'a pas dans notre menu).
const TGA_AVALANCHE_ENVIRONNEMENTS: Array<[number, string]> = [
  [1, 'ravine'], [2, 'thalweg'], [3, 'creux'], [4, 'doline'], [5, 'gypsiere'], [6, "cours d'eau"], [7, 'lac'], [9, 'crevasse / rimaye'],
]

const TGA_AVALANCHE_MOYENS: Array<[number, string]> = [
  [1, 'DVA'], [2, 'Recco'], [3, 'Chien'], [4, 'Géolocalisation téléphone'], [5, 'Sondage'], [6, 'Indice de surface'], [7, 'Autre'],
]

const CRS_ETAT_MEDICALS_ORDRE = ['Décédé traumatique', 'Décédé non traumatique', 'Blessé', 'Disparu', 'Malade', 'Indemne']
const CRS_STATUTS_ORDRE = ['Victime', 'Témoin', 'Encadrant']

function idSexe(valeur: unknown): number | null {
  const v = normTxte(valeur)
  if (v === 'HOMME') return 1
  if (v === 'FEMME') return 2
  return null
}

const TGA_CIRCONSTANCES: Array<[number, string]> = [
  [1, 'Avalanche'], [2, 'Chute de pierres'], [3, 'Chute de serac'], [4, 'Foudre'], [5, 'Rupture de matériel'],
  [6, 'Décollage ou atterrissage'], [7, 'Vol'], [8, 'Condition physique insuffisante'], [9, 'Dévissage (personne encordée)'],
  [10, 'Equipement du sujet non adapté'], [11, "Erreur d'itinéraire"], [12, 'Erreur technique'],
  [13, 'Glissade ou chute (non usage de la corde)'], [14, 'Noyade'], [15, 'Chute en crevasse'], [16, 'Tempête'],
  [17, 'Asphyxie hors avalanche'], [18, 'Autres'], [19, '(Domaine skiable) Chute solitaire'],
  [20, '(Domaine skiable) Chute contre obstacle naturel'], [21, '(Domaine skiable) Chute contre obstacle artificiel'],
  [22, '(Domaine skiable) Collision entre usagers'], [23, '(Domaine skiable) Avalanche départ spontané'],
  [24, '(Domaine skiable) Avalanche déclenchement provoqué'], [25, '(Domaine skiable) Personne égarée'],
  [26, '(Domaine skiable) Saut de barres'], [27, '(Domaine skiable) Glissade'], [28, '(Domaine skiable) Epuisement'],
  [29, '(Domaine skiable) Hypothermie'], [30, '(Domaine skiable) Non traumatique'], [31, "Pathologies d'altitude"],
]
// Notre option ("tableur SNOSM" historique) a une coquille jamais corrigée : "atterissage" (1 r) au
// lieu de "atterrissage" — on la fait correspondre telle quelle plutôt que de la "corriger" ici (le
// champ reste modifiable en texte libre côté formulaire, toute autre valeur passe par idParTexte).
const ALIAS_CIRCONSTANCE_VICTIME: Record<string, number> = { 'DECOLLAGE OU ATTERISSAGE': 6 }

// Nos libellés viennent désormais de ref_destinations_evac (Supabase, voir chargerDestinationsEvac) —
// texte libre proche mais pas forcément identique mot pour mot à ce que Lars nous a listé ici ; ce qui
// ne matche pas reste simplement non renseigné (jamais deviné), à affiner avec lui après un premier test.
const CRS_DESTINATIONS: Array<[number, string]> = [
  [1, 'CH BRIANÇON'], [2, 'CH DIGNE'], [3, 'CH FOIX'], [4, 'CH GAP'], [5, 'CH LA MURE'], [6, 'CH LANNEMEZAN'], [7, 'CH LOURDES'],
  [8, 'CH PAU'], [9, 'CH PERPIGNAN'], [10, 'CH PUICERDA'], [11, 'CH ST GAUDENS'], [12, 'CH TARBES'], [13, 'CHU AIX MARSEILLE'],
  [14, 'CHU MONTPELLIER'], [15, 'CHU NORD LA TRONCHE'], [16, 'CHU RANGEUIL'], [17, 'CHU SUD GRENOBLE'], [18, 'CLINIQUE BELLEDONNE'],
  [19, 'CLINIQUE CEDRES'], [20, 'CLINIQUE CERET'], [21, 'CLINIQUE PRADES'], [22, 'CHU PASTEUR'], [23, 'CH CANNE'], [24, 'CH GRASSE'],
  [25, 'CHU LENVAL'], [26, 'INSTITUT ARNAUD TZANCK'], [27, 'CABINET MEDICAL'], [28, 'LIBRE'], [29, 'POMPES FUNÈBRES'], [30, 'AUTRE'],
  [31, 'CH ALBERTVILLE'], [32, 'CH ST JEAN DE MAURIENNE'], [33, 'CH CHAMBERY'], [34, 'CH ANNECY'], [35, 'CH LYON'],
  [36, 'CLINIQUE MEDIPOLE'], [37, 'CH GENEVE'], [38, 'CH BOURG ST MAURICE'],
]

// Nos libellés viennent de ReferentielHelicos (Track'Alerte, voir chargerReferentiels), déjà proches des siens.
// ⚠ Vérifié le 20/10/2026 contre le contenu RÉEL de ReferentielHelicos (23 appareils actifs) : 3 ne
// figurent dans AUCUNE des 21 entrées du document de Lars (Choucas 74, Choucas 66, Dragon 13) — appareils
// probablement entrés en service après la rédaction de son schéma. Volontairement laissés NON mappés
// (null) plutôt que devinés — à signaler à Lars.
const CRS_HELICOPTERES: Array<[number, string]> = [
  [1, 'CHOUCAS 04'], [2, 'CHOUCAS 05'], [3, 'CHOUCAS 09'], [4, 'CHOUCAS 65'], [5, 'CHOUCAS 69'], [6, 'CHOUCAS 73'],
  [7, 'DRAGON 34'], [8, 'DRAGON 38-1'], [9, 'DRAGON 38-2'], [10, 'DRAGON 64'], [11, 'DRAGON 65'], [12, 'DRAGON 66'],
  [13, 'DRAGON 69'], [14, 'DRAGON 74'], [15, 'SAMU'], [16, 'AUTRES'], [17, 'DRAGON 06'], [18, 'DRAGON 83'], [19, 'DRAGON 73'],
  [20, 'SAF 145'], [21, 'SAF 135'],
]
// YETI 1/YETI 2 (hélicoptères SAF, voir SnosmEmploiHeliSAFJustification) ne sont pas nommés chez
// Lars, seulement "SAF 145"/"SAF 135" génériques — confirmé par Lars (mail, 20/10/2026) : les deux
// correspondent à SAF 145, le SAF ne vole plus en EC135 (= SAF 135, id 21, donc jamais utilisé ici).
const ALIAS_HELICOPTERE: Record<string, number> = { 'YETI 1': 20, 'YETI 2': 20 }

const TGA_METEOS: Array<[number, string]> = [
  [1, 'Ensoleillé / beau temps'], [2, 'Nuageux / couvert'], [3, 'Pluvieux'], [4, 'Venteux'], [5, 'Neigeux'],
  [6, 'Brouillard'], [7, 'Jour Blanc'], [8, 'Tempête de neige'], [9, 'Nuit'], [10, 'Autre'],
]

// Libellés formulés un peu différemment des nôtres (ex. "POSE D'UNE ATTELLE DE BRAS" chez Lars vs
// "POSE ATTELLE DE BRAS" chez nous) : paires explicites plutôt qu'un rapprochement automatique.
const CRS_SECOURISME_EFFECTUES: Array<[number, string]> = [
  [1, 'POSE ATTELLE DE BRAS'], [2, 'POSE ATTELLE JAMBE'], [3, 'POSE ATTELLE EPAULE'],
  [4, 'POSE ATTELLE CERVICO-THORACIQUE'], [5, 'POSE COLLIER CERVICAL'], [6, 'POSE CEINTURE PELVIENNE'],
  [7, 'CONDITIONNEMENT MATELAS COQUILLE'], [8, 'RELEVAGE/CONDITIONNEMENT PERCHE'], [9, 'AIDE A LA MEDICALISATION'],
  [10, 'MISE EN POSITION LATERALE DE SECURITE'], [11, 'REANIMATION CARDIO-PULMONAIRE'],
  [12, 'POSE PANSEMENT COMPRESSIF / GARROT'], [13, 'REALISATION PANSEMENT'], [14, 'BILAN SECOURISME'], [15, 'NEANT'],
]

const CRS_TECHNIQUES_EVACUATIONS: Array<[number, string]> = [
  [1, "HELITREUILLAGE CULOTTE/SANGLE D'EVACUATION"], [2, 'HELITREUILLAGE PERCHE'], [3, 'RECUPERATION HELITREUILLAGE SUR RELAIS'],
  [4, 'RECUPERATION EN APPUI PATIN'], [5, 'MISE EN OEUVRE MAIN COURANTE'], [6, 'MISE EN OEUVRE TYROLIENNE / BALANCIER'],
  [7, 'EVACUATION EN PAROI / CACOLET'], [8, 'DESCENTE TRAINEAU'], [9, 'PORTAGE/BRANCARDAGE'], [10, 'DEPLACEMENT ENCORDE'],
]
// Notre option "HELITREUILLAGE SUR RELAIS" (OPTIONS_TECHNIQUES_EVACUATION) correspond à son
// "RECUPERATION HELITREUILLAGE SUR RELAIS" (id 3) — mot "RECUPERATION" absent chez nous.
const ALIAS_TECHNIQUES_EVACUATION: Record<string, number> = { 'HELITREUILLAGE SUR RELAIS': 3 }

const TGA_BLESSURES: Array<[number, string]> = [
  [1, 'Suspicion de fracture fermée'], [2, 'Suspicion de luxation'], [3, "Suspicion d'entorse"], [4, 'Plaie hémoragique'],
  [5, 'Suspicion de fracture ouverte'], [6, 'Contusion / Hématome'], [7, 'Brûlure'], [8, 'Gelûre'],
  [9, "Suspicion d'hémorragie interne"], [10, 'Problèmes musculaires'], [11, 'Trauma crânien avec perte de connaissance'],
  [12, 'Trauma crânien sans perte de connaissance'], [13, 'Décifit neurologique (de type AVC)'], [14, 'Malaise'], [15, 'Décès'],
  [16, "Crise d'épilepsie"], [17, "Crise d'angoisse / tétanie / spasmophilie"], [18, 'Nausées / vomissement'],
  [19, 'Condition physique (fatigue, hypoglycémie)'], [20, 'Arrêt cardio-respiratoire (ACR)'], [21, 'Choc émotionnel'],
  [22, 'Problème respiratoire'], [23, 'Autre'], [24, 'Problème ophtalmologique'], [25, "Suspicion d'alcoolémie / drogue"],
  [26, 'Hypothermie associée'], [27, 'Dermabrasion'], [28, 'Douleurs thoraciques'], [29, 'Hypothermie isolée'],
  [30, 'Indemnes'], [31, 'MAM'], [32, 'Plaie non hémoragique'],
]
// Vérifié un par un contre OPTIONS_TYPE_BLESSURE (20/10/2026) : mots manquants côté Lars ou côté nous
// ("de"/"d'"), accords différents (pluriel chez lui, singulier chez nous), coquilles de son PDF
// ("hémoragique" 1 r, "Décifit" au lieu de "Déficit") — rapprochement texte insuffisant, alias explicites.
const ALIAS_BLESSURE: Record<string, number> = {
  'ARRET CARDIO RESPIRATOIRE': 20,
  'DEFICIT NEUROLOGIQUE DE TYPE AVC': 13,
  INDEMNE: 30,
  'NAUSEE VOMISSEMENT': 18,
  'PLAIE HEMORRAGIQUE': 4,
  'PLAIE NON HEMORRAGIQUE': 32,
  'PROBLEME MUSCULAIRE': 10,
  'SUSPICION ALCOOLEMIE DROGUE': 25,
  'SUSPICION HEMORRAGIE INTERNE': 9,
  'SUSPICION ENTORSE': 3,
  'SUSPICION FRACTURE FERMEE': 1,
  'SUSPICION FRACTURE OUVERTE': 5,
}

const TGA_LOCALISATIONBLESSURES: Array<[number, string]> = [
  [1, 'Visage'], [2, 'Cou'], [3, 'Rachis cervical'], [4, 'Tête'], [5, 'Thorax'], [6, 'Rachis lombaire'], [7, 'Abdomen'],
  [8, 'Épaule'], [9, 'Clavicule'], [10, 'Bras'], [11, 'Coude'], [12, 'Poignet'], [13, 'Avant-bras'], [14, 'Main'],
  [15, 'Rachis dorsal'], [16, 'Bassin'], [17, 'Doigts'], [18, 'Fémur'], [19, 'Genou'], [20, 'Tibia péroné'], [21, 'Cheville'],
  [22, 'Pied'], [23, 'Organes génitaux'], [24, 'Indemne'], [25, 'Non traumatique'], [26, 'Polytraumatismes'], [27, 'Autres'],
]
// Notre option "Autre" (OPTIONS_LOCALISATION_BLESSURE) vs son "Autres" au pluriel (id 27).
const ALIAS_LOCALISATION_BLESSURE: Record<string, number> = { AUTRE: 27 }

// ---------------------------------------------------------------------------------------------
// Chargement + construction des objets d'export.
// ---------------------------------------------------------------------------------------------
const COLONNES_EXPORT_INTERVENTION = `id, EventId, Section, NumeroIntervention, Statut, ClotureLe, AlerteLe, Departement, Massif, Commune, Lieu, CoordonneesGPS,
  CirconstancesGenerales,
  SnosmNumeroTexte, SnosmOrigineAlerte, SnosmOrigineAlerteAutre, SnosmAlerteLe, SnosmDepartLe, SnosmArriveeLieuxLe, SnosmFinOperationLe,
  SnosmNatureOperation, Activite, Altitude, SnosmMeteo, SnosmTypeDomaine, SnosmLocalisationPiste, SnosmNeige, SnosmEncadrement, SnosmDiplomeEncadrant,
  SnosmTypeOperationMoyens, SnosmGestesSecourisme, SnosmTechniquesEvacuation, SnosmMedicalisation,
  SnosmRenfortGendarmes, SnosmRenfortPompiers, SnosmRenfortPisteurs, SnosmRenfortMedecins, SnosmRenfortAutres,
  SnosmEquipesCynophilesCiviles, SnosmEquipesCynophilesGendarmerie, SnosmEquipesCynophilesPompiers, SnosmEquipesCynophilesPisteurs,
  SnosmEquipesCynophilesCRS, SnosmHelicopteres, SnosmEmploiHeliSAFJustification,
  SnosmAvalanche, SnosmAvalancheType, SnosmAvalancheTaille, SnosmAvalancheNiveauRisque, SnosmAvalancheDeclenchementLe, SnosmAvalanchePointDepartGPS,
  SnosmAvalancheLongueur, SnosmAvalancheLargeurCassure, SnosmAvalancheHauteurCassure, SnosmAvalancheLargeurDepot, SnosmAvalancheAltitude, SnosmAvalanchePente, SnosmAvalancheDenivele, SnosmAvalancheOrientation,
  SnosmAvalancheNombreImpliques, SnosmAvalancheNombreVictimes, SnosmAvalancheNombreBlesses, SnosmAvalancheNombreIndemnes, SnosmAvalancheNombreDecedes`

const COLONNES_EXPORT_VICTIME = `v.id, v.EventId, v.NumeroVictime, v.Sexe, v.DateNaissance, v.Age, v.Circonstances, v.Cinetique, v.SnosmStatut, v.SnosmEtatMedical,
  v.SnosmCodePostal, v.SnosmCommune, v.SnosmDestination, v.SnosmFinPriseEnChargeLe, v.SnosmCirconstancesListe,
  v.SnosmLocalisationBlessure, v.SnosmTypeBlessure, v.SnosmVictimeAvalanche,
  v.SnosmAvalancheMoyensLocalisation, v.SnosmAvalancheDistanceM, v.SnosmAvalancheProfondeurCm, v.SnosmAvalancheDureeMn, v.SnosmAvalancheBouchonNeige, v.SnosmAvalanchePocheAir,
  v.SnosmAvalanchePosition1, v.SnosmAvalanchePosition2, v.SnosmAvalancheDureteNeige, v.SnosmAvalancheObstacles, v.SnosmAvalancheEnvironnement, v.SnosmAvalancheMateriel,
  v.SnosmAvalancheSacAirbag, v.SnosmAvalancheMarqueModele, v.SnosmAvalancheAlimentation, v.SnosmAvalancheGonflage, v.SnosmAvalanchePositionVictime, v.SnosmAvalancheSacEtVictime,
  v.SnosmAvalancheDVAPresent, v.SnosmAvalancheDVAEnMarche`

/**
 * Format EXACT attendu par Lars pour toute date ("AAAA-MM-JJ HH:MM:SS", heure locale française, voir
 * "Conventions" de CRS_schema_base.pdf) — jamais l'ISO 8601 UTC de depuisGrist() (ex.
 * "2026-10-20T14:30:00.000Z"), qui ne sert qu'en interne à l'app. `epochSecondes` = valeur brute
 * d'une colonne Grist DateTime (secondes depuis epoch, UTC) ; Europe/Paris gère automatiquement
 * l'heure d'été/hiver, pas de décalage fixe à coder en dur.
 */
function versDateSnosm(epochSecondes: unknown): string | null {
  if (epochSecondes == null || epochSecondes === '') return null
  const date = new Date(Number(epochSecondes) * 1000)
  if (Number.isNaN(date.getTime())) return null
  const parties = new Intl.DateTimeFormat('fr-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date)
  const get = (type: string) => parties.find((p) => p.type === type)?.value ?? '00'
  // Certains moteurs JS rendent "24" pour minuit avec hour12:false (quirk connu d'Intl) au lieu de "00".
  const heure = get('hour') === '24' ? '00' : get('hour')
  return `${get('year')}-${get('month')}-${get('day')} ${heure}:${get('minute')}:${get('second')}`
}

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

/**
 * tga_commune_id — référentiel transmis par Lars (mail du 21/10/2026, dump SQL des 39192 communes
 * INSEE), importé dans la table Supabase `ref_tga_communes` (nom, code_postal) plutôt que codé en dur
 * ici (bien trop volumineux pour un fichier collé à la main dans le dashboard). Appariement par
 * (code postal, nom normalisé) — jamais par nom seul (des dizaines de communes françaises partagent
 * le même nom dans des départements différents) : sans code postal fiable, on laisse null plutôt que
 * de deviner.
 */

/** "Village - 38380" (format Commune, niveau intervention, voir sansCodePostal dans src/lib/registre.js) -> {nom, codePostal}. */
function communeEtCodePostal(valeur: unknown): { nom: string; codePostal: string | null } {
  const texte = String(valeur ?? '').trim()
  const m = texte.match(/^(.*?)\s*-\s*(\d{5})\s*$/)
  if (m) return { nom: m[1].trim(), codePostal: m[2] }
  return { nom: texte, codePostal: null }
}

/**
 * Le référentiel de Lars abrège systématiquement "Saint"/"Sainte" en "St"/"Ste" (convention INSEE
 * standard) — jamais chez nous, où le nom est saisi/affiché en toutes lettres. Sans cette
 * normalisation spécifique aux communes, toute commune "Saint-…"/"Sainte-…" (une bonne partie des
 * communes françaises) ne trouvait aucune correspondance — vérifié le 21/10/2026 sur un vrai export
 * (Saint-Sorlin-d'Arves, Saint-Christophe-en-Oisans…). Volontairement séparée de normTxte() (utilisée
 * par toutes les autres listes) pour ne pas risquer d'effet de bord ailleurs.
 */
function normTxteCommune(valeur: unknown): string {
  return normTxte(valeur).replace(/\bSAINTE\b/g, 'STE').replace(/\bSAINT\b/g, 'ST')
}

/** Charge en un seul aller-retour toutes les communes dont on a besoin pour ce lot d'export (pas une requête par ligne). */
async function chargerCommunesParCodePostal(codesPostaux: string[]): Promise<Map<string, number>> {
  const carte = new Map<string, number>()
  if (codesPostaux.length === 0) return carte
  const { data, error } = await service.from('ref_tga_communes').select('id, nom, code_postal').in('code_postal', codesPostaux)
  if (error) throw new ErreurHttp(500, `ref_tga_communes : ${error.message}`)
  // Le dump de Lars contient des lignes dupliquées pour une même commune (même code INSEE, même nom,
  // même code postal, juste un id différent — vérifié le 21/10/2026, ~10% des communes concernées) :
  // on garde toujours le plus petit id, pour un résultat stable d'un export à l'autre plutôt que
  // dépendant de l'ordre de retour de la requête.
  for (const r of (data ?? []) as Array<{ id: number; nom: string; code_postal: string | null }>) {
    if (!r.code_postal) continue
    const cle = `${r.code_postal}|${normTxteCommune(r.nom)}`
    const existant = carte.get(cle)
    if (existant == null || r.id < existant) carte.set(cle, r.id)
  }
  return carte
}

function idCommune(nom: string | null, codePostal: string | null, carteCommunes: Map<string, number>): number | null {
  if (!nom || !codePostal) return null
  return carteCommunes.get(`${codePostal}|${normTxteCommune(nom)}`) ?? null
}

/**
 * Repli quand le champ Commune de Track'Alerte n'a PAS de code postal accolé (arrive régulièrement
 * selon comment la commune a été saisie à la prise d'alerte — pas systématique, vérifié le 21/10/2026
 * sur une vraie intervention de test où ça bloquait tga_commune_id malgré une saisie normale) : on
 * cherche le nom parmi les seules communes du département de l'intervention (Departement, ex. "05") —
 * l'INSEE interdit deux communes du même nom dans un même département, donc un nom unique dans ce
 * périmètre reste fiable sans code postal. tga_departements étant vide chez Lars, on déduit le
 * département directement des deux premiers chiffres de code_postal dans ref_tga_communes (vrai pour
 * toute la France métropolitaine utile ici), pas besoin de cette table.
 */
/**
 * Track'Alerte stocke parfois le département sans le zéro initial ("5" au lieu de "05", vérifié
 * le 21/10/2026) — sans ce padding, la requête par préfixe de code postal visait "5%" (Manche,
 * Calvados…) au lieu de "05%" (Hautes-Alpes) : mauvais département entièrement, pas juste une
 * correspondance manquée. Ne touche pas à la Corse (2A/2B) ni aux codes à 3 chiffres (outre-mer,
 * hors périmètre CRS Alpes/Pyrénées), qui ne matchent pas le format \d{1,2}.
 */
function normDepartement(valeur: unknown): string {
  const d = String(valeur ?? '').trim()
  return /^\d{1,2}$/.test(d) ? d.padStart(2, '0') : d
}

async function chargerCommunesParDepartement(departements: string[]): Promise<Map<string, number>> {
  const carte = new Map<string, number>()
  if (departements.length === 0) return carte
  const motifs = departements.map((d) => `code_postal.like.${d}%`).join(',')
  const { data, error } = await service.from('ref_tga_communes').select('id, nom, code_insee, code_postal').or(motifs)
  if (error) throw new ErreurHttp(500, `ref_tga_communes (département) : ${error.message}`)
  const parCle = new Map<string, Array<{ id: number; codeInsee: string | null }>>()
  for (const r of (data ?? []) as Array<{ id: number; nom: string; code_insee: string | null; code_postal: string | null }>) {
    if (!r.code_postal) continue
    const cle = `${r.code_postal.slice(0, 2)}|${normTxteCommune(r.nom)}`
    if (!parCle.has(cle)) parCle.set(cle, [])
    parCle.get(cle)!.push({ id: r.id, codeInsee: r.code_insee })
  }
  for (const [cle, lignes] of parCle) {
    // Même garde-fou que chargerCommunesParCodePostal : si deux codes INSEE différents partagent le
    // même nom dans ce département (vraie ambiguïté, jamais observée mais possible), on ne devine pas.
    if (new Set(lignes.map((l) => l.codeInsee)).size > 1) continue
    carte.set(cle, Math.min(...lignes.map((l) => l.id)))
  }
  return carte
}

/** Essaie d'abord (code postal, nom) exact, puis par nom seul dans le département de l'intervention. */
function idCommuneIntervention(
  nom: string,
  codePostal: string | null,
  departement: unknown,
  carteCommunesCp: Map<string, number>,
  carteCommunesDept: Map<string, number>
): number | null {
  const direct = idCommune(nom, codePostal, carteCommunesCp)
  if (direct != null) return direct
  const dept = normDepartement(departement)
  if (!dept) return null
  return carteCommunesDept.get(`${dept}|${normTxteCommune(nom)}`) ?? null
}

/**
 * crs_accidents.circonstances — construit TOUJOURS à partir des champs propres et structurés par
 * victime (Circonstances/Cinétique/Sexe/Age, ex. "Chute"/"Faible cinétique") + l'activité, JAMAIS
 * depuis CirconstancesGenerales (= "Informations complémentaires" côté Track'Alerte). Vérifié avec
 * la session Track'Alerte le 21/10/2026 (AlertForm.jsx:2418, commentaire du 09/10/2026) : ce champ
 * est délibérément réservé à des repères logistiques pour l'équipe sur le terrain (nombre de
 * personnes, couleur vestimentaire, emplacement véhicule…), jamais pensé comme une description
 * officielle — en pratique il contient très souvent des numéros de téléphone et noms complets de
 * victimes/témoins/famille (confirmé sur un vrai export de test, 426 interventions). Le prendre pour
 * "circonstances" aurait fait fuir ces données nominatives vers le SNOSM, à l'exact opposé de
 * l'exclusion vie privée déjà en place sur les champs structurés (nom/téléphone/adresse victime).
 * Reprend exactement la logique de genererCirconstancesGlobales()/texteCirconstancesVictime()
 * (src/lib/optionsSnosm.js) — dupliquée ici car l'Edge Function ne peut pas importer le code
 * frontend (runtime Deno séparé).
 */
function sexeDepuisBrut(sexe: unknown): string | null {
  const s = String(sexe ?? '').trim().toUpperCase()
  if (s === 'F' || s === 'FEMME' || s === 'FEMININ') return 'Femme'
  if (s === 'M' || s === 'HOMME' || s === 'MASCULIN') return 'Homme'
  return (sexe as string) || null
}
function circonstanceEtCinetiqueBrut(circonstancesBrut: string, cinetiqueBrut: string): string | null {
  if (!cinetiqueBrut) return circonstancesBrut || null
  if (circonstancesBrut.toLowerCase().includes(cinetiqueBrut.toLowerCase())) return circonstancesBrut || null
  const complement = /cin[ée]tique/i.test(cinetiqueBrut) ? `à ${cinetiqueBrut.toLowerCase()}` : `à ${cinetiqueBrut.toLowerCase()} cinétique`
  return [circonstancesBrut, complement].filter(Boolean).join(' ')
}
function texteCirconstancesVictimeBrut(v: Record<string, unknown>): string {
  const morceaux: string[] = []
  const sexeAge = [sexeDepuisBrut(v.Sexe), v.Age ? `${v.Age} ans` : null].filter(Boolean).join(' ')
  if (sexeAge) morceaux.push(sexeAge)
  const circonstance = circonstanceEtCinetiqueBrut(String(v.Circonstances ?? '').trim(), String(v.Cinetique ?? '').trim())
  if (circonstance) morceaux.push(circonstance)
  return morceaux.join(', ')
}
function genererCirconstancesBrut(victimesDeLIntervention: Array<Record<string, unknown>>, activite: unknown): string | null {
  const phrases = victimesDeLIntervention.map(texteCirconstancesVictimeBrut).filter(Boolean)
  const base = phrases.join(' ; ')
  const resultat = [base, activite ? `en ${activite}` : null].filter(Boolean).join(' ')
  return resultat || null
}

/** Une intervention -> crs_accidents (champs qu'on peut remplir) + les id de ses tables de liaison. */
function construireAccident(
  f: Record<string, unknown>,
  carteCommunesCp: Map<string, number>,
  carteCommunesDept: Map<string, number>,
  victimesParEventId: Map<number, Array<Record<string, unknown>>>
) {
  const { nom: communeNom, codePostal: communeCp } = communeEtCodePostal(f.Commune)
  const accident = {
    // "id" = notre identifiant interne stable (EventId Grist, jamais réattribué) — sert à la fois de
    // clé de liaison dans ce même export et de "identifiant stable" demandé par Lars (20/10/2026) pour
    // mettre à jour une intervention déjà importée.
    id: f.EventId,
    crs_unite_id: crsUniteId(f.Section as string),
    no_texte: f.SnosmNumeroTexte || f.NumeroIntervention || null,
    crs_origine_id: idParIndex(f.SnosmOrigineAlerte, CRS_ORIGINES_ORDRE),
    origine: f.SnosmOrigineAlerteAutre || null,
    gdh_alerte: versDateSnosm(f.SnosmAlerteLe),
    gdh_debut: versDateSnosm(f.SnosmDepartLe),
    gdh_fin: versDateSnosm(f.SnosmFinOperationLe),
    gdh_sur_lieux: versDateSnosm(f.SnosmArriveeLieuxLe),
    tga_massif_id: idParTexte(f.Massif, TGA_MASSIFS),
    tga_commune_id: idCommuneIntervention(communeNom, communeCp, f.Departement, carteCommunesCp, carteCommunesDept),
    lieu_compl: f.Lieu || null,
    // varchar(50), "texte libre (formats variés)" chez Lars — pas de reformatage, on transmet tel quel.
    gps: f.CoordonneesGPS || null,
    crs_nature_operation_id: idParIndex(f.SnosmNatureOperation, CRS_NATURE_OPERATIONS_ORDRE),
    crs_nature_activite_id: idParTexte(f.Activite, CRS_NATURE_ACTIVITES, ALIAS_NATURE_ACTIVITE),
    altitude: entierSi(f.Altitude),
    tga_encadrement_id: idParTexte(f.SnosmEncadrement, TGA_ENCADREMENTS),
    tga_diplome_encadrant_id: idDiplomeEncadrant(f.SnosmDiplomeEncadrant),
    tga_type_domaine_id: idParIndex(f.SnosmTypeDomaine, TGA_TYPE_DOMAINES_ORDRE),
    tga_locpiste_id: idParTexte(f.SnosmLocalisationPiste, TGA_LOCPISTES),
    tga_neige_id: idParTexte(f.SnosmNeige, TGA_NEIGES),
    crs_operation: idParIndex(f.SnosmTypeOperationMoyens, ['Héliportée', 'Terrestre', 'Mixte']),
    medicalisation: idParIndex(f.SnosmMedicalisation, ['Oui', 'Non', 'Non obtenue']),
    cyno_crs: entierSi(f.SnosmEquipesCynophilesCRS),
    helicoptere_prive_raison: f.SnosmEmploiHeliSAFJustification || null,
    circonstances: genererCirconstancesBrut(victimesParEventId.get(f.EventId as number) ?? [], f.Activite),
    sec_pghm: entierSi(f.SnosmRenfortGendarmes),
    sec_pompiers: entierSi(f.SnosmRenfortPompiers),
    sec_pisteurs: entierSi(f.SnosmRenfortPisteurs),
    sec_autres: entierSi(f.SnosmRenfortAutres),
    medecin: entierSi(f.SnosmRenfortMedecins),
    cyno_gie: entierSi(f.SnosmEquipesCynophilesGendarmerie),
    cyno_pompiers: entierSi(f.SnosmEquipesCynophilesPompiers),
    cyno_autres: entierSi(f.SnosmEquipesCynophilesCiviles),
    cyno_pisteurs: entierSi(f.SnosmEquipesCynophilesPisteurs),
    avalanche: depuisGrist(f.SnosmAvalanche, 'bool') ? 1 : 0,
    tga_avalanche_type_depot_id: idTailleAvalanche(f.SnosmAvalancheTaille),
    tga_avalanche_type_id: idParIndex(f.SnosmAvalancheType, TGA_AVALANCHE_TYPES_ORDRE),
    tga_ra_id: idParIndex(f.SnosmAvalancheNiveauRisque, TGA_RAS_ORDRE),
    avalanche_heure_declenchement: versDateSnosm(f.SnosmAvalancheDeclenchementLe),
    avalanche_pd_gps: f.SnosmAvalanchePointDepartGPS || null,
    avalanche_longueur: entierSi(f.SnosmAvalancheLongueur),
    avalanche_largeur: entierSi(f.SnosmAvalancheLargeurCassure),
    avalanche_hauteur_cassure: entierSi(f.SnosmAvalancheHauteurCassure),
    avalanche_largeur_depot: entierSi(f.SnosmAvalancheLargeurDepot),
    avalanche_altitude: entierSi(f.SnosmAvalancheAltitude),
    avalanche_denivele_total: entierSi(f.SnosmAvalancheDenivele),
    avalanche_pente: f.SnosmAvalanchePente || null,
    tga_point_cardinal_id: idParTexte(f.SnosmAvalancheOrientation, TGA_POINT_CARDINALS),
    // "Nombre de victimes" chez Lars (avalanche_nb_participants) — distinct de avalanche_nb_impliques
    // ("Nombre d'impliqués") juste en dessous, deux champs séparés dans son schéma.
    avalanche_nb_participants: entierSi(f.SnosmAvalancheNombreVictimes),
    avalanche_nb_impliques: entierSi(f.SnosmAvalancheNombreImpliques),
    avalanche_nb_blesses: entierSi(f.SnosmAvalancheNombreBlesses),
    avalanche_nb_indemnes: entierSi(f.SnosmAvalancheNombreIndemnes),
    avalanche_nb_decedes: entierSi(f.SnosmAvalancheNombreDecedes),
  }

  const liaisons = {
    helicopteres: idsParTexteMultiple(f.SnosmHelicopteres, CRS_HELICOPTERES, ALIAS_HELICOPTERE),
    meteos: idsParTexteMultiple(f.SnosmMeteo, TGA_METEOS),
    secourismeEffectues: idsParTexteMultiple(f.SnosmGestesSecourisme, CRS_SECOURISME_EFFECTUES),
    techniquesEvacuations: idsParTexteMultiple(f.SnosmTechniquesEvacuation, CRS_TECHNIQUES_EVACUATIONS, ALIAS_TECHNIQUES_EVACUATION),
  }

  return { accident, liaisons }
}

/** Une victime -> crs_victimes (champs qu'on peut remplir) + les id de ses tables de liaison. */
function construireVictime(v: Record<string, unknown>, alerteLeIso: string | null, carteCommunes: Map<string, number>) {
  const ageCalcule = calculerAge((v.DateNaissance as string) || null, alerteLeIso)
  // Pelle/Sonde/RECCO : 3 colonnes séparées chez Lars (crs_victimes), un seul champ "Matériel utilisé"
  // à choix multiple chez nous — 1/2 seulement si le champ a été renseigné (sinon vide, pas "Non" par défaut).
  const materielBrut = String(v.SnosmAvalancheMateriel ?? '').toLowerCase()
  const materielRenseigne = materielBrut.trim().length > 0

  const victime = {
    id: v.id,
    crs_accident_id: v.EventId,
    crs_statut_id: idParIndex(v.SnosmStatut, CRS_STATUTS_ORDRE) ?? 1,
    crs_etat_medical_id: idParIndex(v.SnosmEtatMedical, CRS_ETAT_MEDICALS_ORDRE),
    tga_commune_id: idCommune((v.SnosmCommune as string) || null, (v.SnosmCodePostal as string) || null, carteCommunes),
    // tga_nationalites toujours vide dans le dump de Lars (mail du 21/10/2026) — en attente qu'il nous
    // transmette la table remplie pour construire la correspondance, comme pour les communes.
    tga_nationalite_id: null,
    tga_circonstance_id: idParTexte(v.SnosmCirconstancesListe, TGA_CIRCONSTANCES, ALIAS_CIRCONSTANCE_VICTIME),
    crs_destination_id: idParTexte(v.SnosmDestination, CRS_DESTINATIONS),
    age: ageCalcule ?? entierSi(v.Age),
    tga_sexe_id: idSexe(v.Sexe),
    heure_fin_prise_charge: versDateSnosm(v.SnosmFinPriseEnChargeLe),
    avalanche_distance: entierSi(v.SnosmAvalancheDistanceM),
    avalanche_profondeur: entierSi(v.SnosmAvalancheProfondeurCm),
    avalanche_bouchon: idParIndex(v.SnosmAvalancheBouchonNeige, ['oui', 'non', 'ne sais pas']),
    avalanche_duree: entierSi(v.SnosmAvalancheDureeMn),
    avalanche_poche: idParIndex(v.SnosmAvalanchePocheAir, ['oui', 'non', 'ne sais pas']),
    tga_avalanche_position_id: idParIndex(v.SnosmAvalanchePosition1, TGA_AVALANCHE_POSITIONS_ORDRE),
    tga_avalanche_durete_id: idParIndex(v.SnosmAvalancheDureteNeige, TGA_AVALANCHE_DURETES_ORDRE),
    avalanche_dva: idParIndex(v.SnosmAvalancheDVAPresent, ['oui', 'non']),
    avalanche_dva_en_marche: idParIndex(v.SnosmAvalancheDVAEnMarche, ['oui', 'non']),
    avalanche_pelle: materielRenseigne ? (materielBrut.includes('pelle') ? 1 : 2) : null,
    avalanche_sonde: materielRenseigne ? (materielBrut.includes('sonde') ? 1 : 2) : null,
    avalanche_recco: materielRenseigne ? (materielBrut.includes('recco') ? 1 : 2) : null,
    avalanche_sac_airbag: idParIndex(v.SnosmAvalancheSacAirbag, ['oui', 'non']),
    avalanche_sac_airbag_marque_modele: v.SnosmAvalancheMarqueModele || null,
    avalanche_sac_airbag_alimentation: idParIndex(v.SnosmAvalancheAlimentation, ['cartouche', 'électrique']),
    avalanche_sac_airbag_gonfle: idParIndex(v.SnosmAvalancheGonflage, ['complètement', 'partiellement', 'non']),
    avalanche_sac_airbag_sur_victime: idParIndex(v.SnosmAvalanchePositionVictime, ['avec ventrale', 'sans ventrale', 'non']),
    avalanche_sac_airbag_lies_separes: idParIndex(v.SnosmAvalancheSacEtVictime, ['liés', 'séparés']),
  }

  const liaisons = {
    blessures: idsParTexteMultiple(v.SnosmTypeBlessure, TGA_BLESSURES, ALIAS_BLESSURE),
    localisationsBlessures: idsParTexteMultiple(v.SnosmLocalisationBlessure, TGA_LOCALISATIONBLESSURES, ALIAS_LOCALISATION_BLESSURE),
    environnement: idParTexte(v.SnosmAvalancheEnvironnement, TGA_AVALANCHE_ENVIRONNEMENTS),
    moyen: idParTexte(v.SnosmAvalancheMoyensLocalisation, TGA_AVALANCHE_MOYENS),
    obstacle: idParIndex(v.SnosmAvalancheObstacles, TGA_AVALANCHE_OBSTACLES_ORDRE),
    positionCorps: idParIndex(v.SnosmAvalanchePosition2, TGA_AVALANCHE_POSITION_CORPS_ORDRE),
  }

  return { victime, liaisons }
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

const TOUTES_SECTIONS_SNOSM = [
  'CRS38', 'CRS38H', 'CRS05', 'CRS73', 'CRS73M', 'CRS73C',
  'CRS06', 'CRS06S', 'CRS06V', 'CRS65', 'CRS65G', 'CRS65L', 'CRS65S', 'CRS66', 'CRS66B',
]

/** Construit les fichiers JSON (format Lars) pour une période donnée — utilisé par exporterSnosm (ZIP + mail) et apercuSnosm (debug, sans mail). */
async function construireExportSnosm(docId: string, apiKey: string, params: { debut?: string; fin?: string; squadCodes?: string[] }) {
  const squadCodes = params.squadCodes?.length ? params.squadCodes : TOUTES_SECTIONS_SNOSM
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

  // Groupé avant la boucle des accidents : la génération de "circonstances" (voir genererCirconstancesBrut)
  // a besoin de connaître les victimes de CHAQUE intervention au moment de construire l'accident, pas
  // seulement dans la boucle des victimes qui suit.
  const victimesParEventId = new Map<number, Array<Record<string, unknown>>>()
  for (const v of lignesVictimes as Array<Record<string, unknown> & { EventId: number }>) {
    if (!victimesParEventId.has(v.EventId)) victimesParEventId.set(v.EventId, [])
    victimesParEventId.get(v.EventId)!.push(v)
  }

  // Un seul aller-retour vers ref_tga_communes pour tout le lot (pas une requête par intervention/victime).
  const codesPostauxInterventions = lignesInterventions.map((f) => communeEtCodePostal(f.Commune).codePostal)
  const codesPostauxVictimes = (lignesVictimes as Array<Record<string, unknown>>).map((v) => (v.SnosmCodePostal as string) || null)
  const codesPostauxDistincts = [...new Set([...codesPostauxInterventions, ...codesPostauxVictimes].filter((cp): cp is string => Boolean(cp)))]
  // Départements de TOUTES les interventions (pas seulement celles sans code postal dans le texte) :
  // sert aussi de repli quand le code postal présent dans le texte ne matche pas (ex. article "Le/La"
  // manquant) — toujours plus utile qu'un simple null.
  const departementsDistincts = [...new Set(lignesInterventions.map((f) => normDepartement(f.Departement)).filter(Boolean))]
  const [carteCommunesCp, carteCommunesDept] = await Promise.all([
    chargerCommunesParCodePostal(codesPostauxDistincts),
    chargerCommunesParDepartement(departementsDistincts),
  ])

  const CrsAccident: unknown[] = []
  const CrsAccidentsHelicoptere: unknown[] = []
  const CrsAccidentsMeteo: unknown[] = []
  const CrsAccidentsSecourismeEffectue: unknown[] = []
  const CrsAccidentsTechniquesEvacuation: unknown[] = []
  let idLiaison = 1

  for (const f of lignesInterventions) {
    const { accident, liaisons } = construireAccident(f, carteCommunesCp, carteCommunesDept, victimesParEventId)
    CrsAccident.push(accident)
    for (const helicoId of liaisons.helicopteres)
      CrsAccidentsHelicoptere.push({ id: idLiaison++, crs_accident_id: accident.id, crs_helicoptere_id: helicoId })
    for (const meteoId of liaisons.meteos) CrsAccidentsMeteo.push({ id: idLiaison++, crs_accident_id: accident.id, tga_meteo_id: meteoId })
    for (const gesteId of liaisons.secourismeEffectues)
      CrsAccidentsSecourismeEffectue.push({ id: idLiaison++, crs_accident_id: accident.id, crs_secourisme_effectue_id: gesteId })
    for (const techId of liaisons.techniquesEvacuations)
      CrsAccidentsTechniquesEvacuation.push({ id: idLiaison++, crs_accident_id: accident.id, crs_techniques_evacuation_id: techId })
  }

  const CrsVictime: unknown[] = []
  const CrsVictimesBlessure: unknown[] = []
  const CrsVictimesLocalisationblessure: unknown[] = []
  const CrsVictimesAvalancheEnvironnement: unknown[] = []
  const CrsVictimesAvalancheMoyen: unknown[] = []
  const CrsVictimesAvalancheObstacle: unknown[] = []
  const CrsVictimesAvalanchePositionCorp: unknown[] = []

  for (const v of lignesVictimes as Array<Record<string, unknown> & { EventId: number }>) {
    const interv = parEventId.get(v.EventId)
    const alerteLeIso = interv ? (depuisGrist(interv.SnosmAlerteLe || interv.AlerteLe, 'datetime') as string | null) : null
    const { victime, liaisons } = construireVictime(v, alerteLeIso, carteCommunesCp)
    CrsVictime.push(victime)
    for (const blessureId of liaisons.blessures)
      CrsVictimesBlessure.push({ id: idLiaison++, crs_victime_id: victime.id, tga_blessure_id: blessureId })
    for (const locId of liaisons.localisationsBlessures)
      CrsVictimesLocalisationblessure.push({ id: idLiaison++, crs_victime_id: victime.id, tga_localisationblessure_id: locId })
    if (liaisons.environnement != null)
      CrsVictimesAvalancheEnvironnement.push({ id: idLiaison++, crs_victime_id: victime.id, tga_avalanche_environnement_id: liaisons.environnement })
    if (liaisons.moyen != null)
      CrsVictimesAvalancheMoyen.push({ id: idLiaison++, crs_victime_id: victime.id, tga_avalanche_moyen_id: liaisons.moyen })
    if (liaisons.obstacle != null)
      CrsVictimesAvalancheObstacle.push({ id: idLiaison++, crs_victime_id: victime.id, tga_avalanche_obstacle_id: liaisons.obstacle })
    if (liaisons.positionCorps != null)
      CrsVictimesAvalanchePositionCorp.push({
        id: idLiaison++,
        crs_victime_id: victime.id,
        tga_avalanche_position_corp_id: liaisons.positionCorps,
      })
  }

  return {
    periode: `${debut.toISOString().slice(0, 10)}_au_${fin.toISOString().slice(0, 10)}`,
    fichiers: {
      'CrsAccident.json': CrsAccident,
      'CrsVictime.json': CrsVictime,
      'CrsAccidentsHelicoptere.json': CrsAccidentsHelicoptere,
      'CrsAccidentsMeteo.json': CrsAccidentsMeteo,
      'CrsAccidentsSecourismeEffectue.json': CrsAccidentsSecourismeEffectue,
      'CrsAccidentsTechniquesEvacuation.json': CrsAccidentsTechniquesEvacuation,
      'CrsVictimesBlessure.json': CrsVictimesBlessure,
      'CrsVictimesLocalisationblessure.json': CrsVictimesLocalisationblessure,
      'CrsVictimesAvalancheEnvironnement.json': CrsVictimesAvalancheEnvironnement,
      'CrsVictimesAvalancheMoyen.json': CrsVictimesAvalancheMoyen,
      'CrsVictimesAvalancheObstacle.json': CrsVictimesAvalancheObstacle,
      'CrsVictimesAvalanchePositionCorp.json': CrsVictimesAvalanchePositionCorp,
    },
    nombreInterventions: CrsAccident.length,
    nombreVictimes: CrsVictime.length,
  }
}

async function exporterSnosm(
  docId: string,
  apiKey: string,
  params: { debut?: string; fin?: string; destinataire?: string; squadCodes?: string[] }
) {
  const config = await lireConfigEnvoiSnosm()
  const destinataire = params.destinataire || config.snosm_email_destinataire
  if (!destinataire) throw new ErreurHttp(400, 'Aucun destinataire (ni params.destinataire, ni snosm_email_destinataire).')

  const { periode, fichiers, nombreInterventions, nombreVictimes } = await construireExportSnosm(docId, apiKey, params)

  // Préfixe "CRS" + horodatage de génération (pas la période couverte) : convention demandée par
  // Lars, qui reprend le format de l'export actuel (ex. CRS_2026-09-11_122947.zip).
  const maintenant = new Date()
  const iso = maintenant.toISOString()
  const dateDuJour = iso.slice(0, 10)
  const heureDuJour = iso.slice(11, 19).replace(/:/g, '')
  const nomFichierZip = `CRS_${dateDuJour}_${heureDuJour}.zip`
  const octetsZip = await construireZip(fichiers)
  const zipBase64 = versBase64(octetsZip)

  await envoyerEmailSnosm(config.snosm_email_expediteur, destinataire, `Export SNOSM Track'Log — ${periode}`, nomFichierZip, zipBase64)

  return { nombreInterventions, nombreVictimes, destinataire, periode, fichiers: Object.keys(fichiers) }
}

/** Debug — mêmes données que exporterSnosm, renvoyées directement dans la réponse HTTP (pas de ZIP, pas de mail). */
async function apercuSnosm(docId: string, apiKey: string, params: { debut?: string; fin?: string; squadCodes?: string[] }) {
  const { fichiers, nombreInterventions, nombreVictimes } = await construireExportSnosm(docId, apiKey, params)
  return { fichiers, nombreInterventions, nombreVictimes }
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
