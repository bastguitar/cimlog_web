#!/usr/bin/env node
/**
 * Crée (ou supprime) une intervention de test directement dans Grist — pour tester le formulaire
 * SNOSM/le TO en dev sans avoir à saisir une vraie intervention via Cim'Alerte ni remplir tous les
 * champs à la main. Marqueur de test : commune "TEST-DEV" — c'est le SEUL signal utilisé pour
 * identifier une intervention de test avant de la supprimer, jamais une plage d'EventId.
 *
 * ⚠ Une plage d'EventId "réservée" (900000000-999999999) a été utilisée un temps pour --nettoyer,
 * abandonnée après avoir trouvé DEUX vraies interventions historiques dans cette plage (les EventId
 * Cim'Alerte ne sont pas garantis >= 1000000000 comme supposé au départ) — --nettoyer aurait pu les
 * supprimer. La commune ne peut jamais coïncider avec une vraie intervention, contrairement à un
 * nombre : c'est le seul filtre utilisé maintenant, y compris pour --supprimer (garde-fou si jamais
 * un mauvais EventId est passé à la main).
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
 *     Supprime l'intervention de test (et ses victimes) créée précédemment — refuse si la commune
 *     de cet EventId n'est pas "TEST-DEV" (protection contre un mauvais numéro tapé à la main).
 *
 *   GRIST_API_KEY=... node scripts/intervention-test.mjs --nettoyer
 *     Supprime TOUTES les interventions dont la commune est "TEST-DEV" (et elles seules).
 */

const DOC_ID = '9rMpYraJkSiX'
const BASE = `https://grist.numerique.gouv.fr/api/docs/${DOC_ID}`
const COMMUNE_TEST = 'TEST-DEV - 38000'

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

/** EventId aléatoire, mais vérifié inutilisé avant insertion (pas de plage supposée libre : on
 * vient de découvrir que les EventId réels ne suivent pas un schéma prévisible). */
async function eventIdLibre() {
  for (let essai = 0; essai < 10; essai++) {
    const candidat = 100000000 + Math.floor(Math.random() * 899999999)
    const [existant] = await sql('select EventId from Interventions where EventId = ?', [candidat])
    if (!existant) return candidat
  }
  throw new Error('Impossible de trouver un EventId libre après 10 essais — réessayez.')
}

async function creerInterventionTest(section) {
  const maintenant = Math.floor(Date.now() / 1000)
  const eventId = await eventIdLibre()
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
      Commune: COMMUNE_TEST,
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
  const [ligne] = await sql('select id, Commune from Interventions where EventId = ?', [eventId])
  if (!ligne) {
    console.log(`Aucune intervention avec EventId ${eventId} — rien à supprimer.`)
    return
  }
  if (ligne.Commune !== COMMUNE_TEST) {
    console.error(
      `EventId ${eventId} a pour commune "${ligne.Commune}", pas "${COMMUNE_TEST}" — ce n'est probablement pas une intervention de ce script. Suppression refusée (utilisez l'interface Grist directement si c'est volontaire).`
    )
    process.exit(1)
  }
  const victimes = await sql('select id from Victimes where EventId = ?', [eventId])
  await supprimer('Victimes', victimes.map((v) => v.id))
  const effectifs = await sql('select id from EffectifsEngages where EventId = ?', [eventId])
  await supprimer('EffectifsEngages', effectifs.map((e) => e.id))
  await supprimer('Interventions', [ligne.id])
  console.log(`Intervention ${eventId} (et ses victimes/effectifs) supprimée.`)
}

async function nettoyerToutesLesInterventionsTest() {
  const interventions = await sql('select EventId from Interventions where Commune = ?', [COMMUNE_TEST])
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
