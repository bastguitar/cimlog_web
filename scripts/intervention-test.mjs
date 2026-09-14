#!/usr/bin/env node
/**
 * Crée (ou supprime) une intervention de test directement dans Grist — pour tester le formulaire
 * SNOSM/le TO en dev sans avoir à saisir une vraie intervention via Cim'Alerte ni remplir tous les
 * champs à la main. Les données créées sont clairement fictives : EventId/NumeroIntervention dans
 * une plage réservée (900000000+ / 90000-99999), commune "TEST-DEV", pour ne jamais se confondre
 * avec une vraie intervention.
 *
 * N'utilise QUE la clé API Grist en variable d'environnement, jamais codée en dur ici (même
 * principe que l'Edge Function grist : la clé ne doit jamais atterrir dans un fichier commité).
 * Demander la clé (grist_api_key, table reglages_techniques) à qui gère le projet Supabase.
 *
 * Usage :
 *   GRIST_API_KEY=... node scripts/intervention-test.mjs [section]
 *     Crée une intervention de test (+ 1 victime) pour la section donnée (CRS38 par défaut).
 *     Affiche le NumeroIntervention à chercher dans le Registre (barre de recherche libre,
 *     cherche "TEST-DEV" ou le numéro affiché) pour ouvrir la fiche.
 *
 *   GRIST_API_KEY=... node scripts/intervention-test.mjs --supprimer <eventId>
 *     Supprime l'intervention de test (et ses victimes) créée précédemment.
 *
 *   GRIST_API_KEY=... node scripts/intervention-test.mjs --nettoyer
 *     Supprime TOUTES les interventions de test encore présentes (EventId >= 900000000).
 */

const DOC_ID = '9rMpYraJkSiX'
const BASE = `https://grist.numerique.gouv.fr/api/docs/${DOC_ID}`

const apiKey = process.env.GRIST_API_KEY
if (!apiKey) {
  console.error('Variable d’environnement GRIST_API_KEY manquante — demandez la clé grist_api_key (reglages_techniques) avant de lancer ce script.')
  process.exit(1)
}

async function grist(chemin, options = {}) {
  const r = await fetch(`${BASE}${chemin}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}`, ...options.headers },
  })
  const corps = await r.json().catch(() => null)
  if (!r.ok) throw new Error(`Grist ${r.status} : ${JSON.stringify(corps)}`)
  return corps
}

async function sql(requete, args = []) {
  const { records } = await grist('/sql', { method: 'POST', body: JSON.stringify({ sql: requete, args }) })
  return (records ?? []).map((r) => r.fields)
}

async function ajouter(table, lignes) {
  const { records } = await grist(`/tables/${table}/records`, {
    method: 'POST',
    body: JSON.stringify({ records: lignes.map((fields) => ({ fields })) }),
  })
  return records.map((r) => r.id)
}

async function supprimer(table, ids) {
  if (ids.length === 0) return
  await grist(`/tables/${table}/data/delete`, { method: 'POST', body: JSON.stringify(ids) })
}

const NOMS = ['MARTIN', 'BERNARD', 'DUBOIS', 'THOMAS', 'ROBERT', 'PETIT', 'DURAND', 'MOREAU']
const PRENOMS_H = ['Julien', 'Nicolas', 'Alexandre', 'Thomas', 'Mathieu']
const PRENOMS_F = ['Camille', 'Julie', 'Marie', 'Sophie', 'Claire']
const auHasard = (liste) => liste[Math.floor(Math.random() * liste.length)]

async function creerInterventionTest(section) {
  const maintenant = Math.floor(Date.now() / 1000)
  const eventId = 900000000 + Math.floor(Math.random() * 99999999)
  const numeroIntervention = 90000 + Math.floor(Math.random() * 9999)
  const sexe = Math.random() < 0.5 ? 'F' : 'M'
  const prenom = auHasard(sexe === 'F' ? PRENOMS_F : PRENOMS_H)
  const nom = auHasard(NOMS)

  await ajouter('Interventions', [
    {
      EventId: eventId,
      Section: section,
      NumeroIntervention: numeroIntervention,
      Statut: 'terminee',
      ClotureLe: maintenant,
      AlerteLe: maintenant - 3600,
      OrigineAlerte: 'CODIS',
      Commune: 'TEST-DEV - 38000',
      Lieu: 'Lieu de test (script dev)',
      Departement: '38',
      Massif: 'Chartreuse',
      Altitude: 1800,
      Activite: 'Randonnée pédestre sur sentier',
      AccidentType: 'Chute',
      TypeOperation: 'terrestre',
      Helicopter: 'Pas de moyens engagés',
      Secouristes: 'ASTOUL Damien, BEGEL David',
      Meteo: 'Ensoleillé',
      Medicalisation: false,
      CirconstancesGenerales: 'Chute à haute cinétique lors de la descente, engendrant une suspicion de fracture.',
      RequerantNom: 'Témoin Test',
      RequerantTelephone: '0600000000',
    },
  ])

  await ajouter('Victimes', [
    {
      EventId: eventId,
      NumeroVictime: 1,
      Nom: nom,
      Prenom: prenom,
      Sexe: sexe,
      Age: 30 + Math.floor(Math.random() * 30),
      DateNaissance: '1990-05-14',
      Nationalite: 'Française',
      Telephone: '0600000001',
      StatutPersonne: 'victime',
      Blessures: 'Suspicion fracture cheville',
      Circonstances: 'Chute',
      Cinetique: 'haute cinétique',
    },
  ])

  console.log(`Intervention de test créée : n°${numeroIntervention} (EventId ${eventId}), section ${section}, victime ${nom} ${prenom}.`)
  console.log(`Dans Cim'Log : Registre secours -> recherche libre "TEST-DEV" -> ouvrir la fiche.`)
  console.log(`Pour la supprimer : GRIST_API_KEY=... node scripts/intervention-test.mjs --supprimer ${eventId}`)
}

async function supprimerInterventionTest(eventId) {
  const victimes = await sql('select id from Victimes where EventId = ?', [eventId])
  await supprimer('Victimes', victimes.map((v) => v.id))
  const effectifs = await sql('select id from EffectifsEngages where EventId = ?', [eventId])
  await supprimer('EffectifsEngages', effectifs.map((e) => e.id))
  const interventions = await sql('select id from Interventions where EventId = ?', [eventId])
  await supprimer('Interventions', interventions.map((i) => i.id))
  console.log(`Intervention ${eventId} (et ses victimes/effectifs) supprimée.`)
}

async function nettoyerToutesLesInterventionsTest() {
  const interventions = await sql('select EventId from Interventions where EventId >= 900000000')
  if (interventions.length === 0) {
    console.log('Aucune intervention de test à nettoyer.')
    return
  }
  for (const { EventId } of interventions) await supprimerInterventionTest(EventId)
  console.log(`${interventions.length} intervention(s) de test nettoyée(s).`)
}

const argv = process.argv.slice(2)
if (argv[0] === '--supprimer') {
  const eventId = Number(argv[1])
  if (!eventId) {
    console.error('Usage : node scripts/intervention-test.mjs --supprimer <eventId>')
    process.exit(1)
  }
  await supprimerInterventionTest(eventId)
} else if (argv[0] === '--nettoyer') {
  await nettoyerToutesLesInterventionsTest()
} else {
  const section = argv[0] || 'CRS38'
  await creerInterventionTest(section)
}
