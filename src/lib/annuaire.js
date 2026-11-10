/**
 * Annuaire des personnels — jusqu'au 18/10/2026, interrogé en direct à
 * chaque ouverture de formulaire sur un projet Supabase distinct
 * (fllhwnxrisofbgcehnux, "Commande matériel"), qui reste la SEULE source
 * qui écrit — mise à jour par Nico Robert (national matériel) via son
 * propre outil.
 *
 * Depuis le 18/10/2026, les LECTURES passent par un miroir restreint sur la
 * base partagée avec alerte_secours_web (`annuaire_personnel`/
 * `annuaire_sections_externes`), synchronisé une fois par jour
 * (`synchroniser_annuaire_personnel`, `postgres_fdw` + `pg_cron`) — l'autre
 * projet est sur un abonnement gratuit, plus fragile que celui-ci, et les
 * effectifs changent moins de 3 fois par an : un miroir quotidien suffit
 * largement, voir alerte_secours_web/src/lib/annuaire.js pour le détail
 * complet (mise en place identique ici).
 *
 * ⚠ Le miroir ne contient QUE id / nom / prénom / type_personnel /
 *   section_id. La table d'origine expose aussi `email`, `password_hash` et
 *   `access_pin` : ces colonnes ne sont jamais recopiées ici, et ne doivent
 *   toujours jamais descendre dans le navigateur.
 */
import { supabase } from './supabase'
import { chargerGradesSecouristes } from './registre'

// Grade (rang police) de chaque secouriste — demandé par l'utilisateur (02/10/2026) : préfixer le
// nom partout où un secouriste est proposé/inscrit (Effectif engagé, Rédacteur, Signataire,
// Directeur d'enquête), sans changer la façon de le choisir (toujours le même menu par nom). Posé
// sur une table du projet Supabase partagé (pas l'annuaire lui-même), lue via l'Edge Function grist
// — voir chargerGradesSecouristes. La PROMESSE elle-même est cachée (pas seulement le résultat) :
// chargerTousSecouristes et chargerToutPersonnel peuvent être en vol en même temps au premier
// chargement, sans ça chacune relancerait son propre appel réseau en double.
// Les grades ne sont qu'un préfixe : s'ils tardent (fonction grist lente, réseau), la liste de noms
// s'affiche sans eux au bout de DELAI_GRADES_MS plutôt que de laisser les menus vides sans fin.
// Un échec n'est pas mis en cache : le prochain chargement redemandera les grades.
const DELAI_GRADES_MS = 5000
let promesseGrades = null
function gradesUneFois(codesRequete) {
  if (!promesseGrades) {
    const delai = new Promise((_, rejeter) => setTimeout(() => rejeter(new Error('délai dépassé')), DELAI_GRADES_MS))
    promesseGrades = Promise.race([chargerGradesSecouristes(codesRequete), delai]).catch((e) => {
      console.error('Grades des secouristes non chargés :', e)
      promesseGrades = null
      return {}
    })
  }
  return promesseGrades
}

/** Lecture du miroir de l'annuaire : une erreur est signalée (console) et levée, jamais mise en cache. */
async function lireAnnuaire(requetePersonnes, codesRequete) {
  const [personnes, sections, grades] = await Promise.all([
    requetePersonnes,
    supabase.from('annuaire_sections_externes').select('id, nom'),
    gradesUneFois(codesRequete),
  ])
  const erreur = personnes.error ?? sections.error
  if (erreur) {
    console.error('Annuaire non chargé :', erreur)
    throw erreur
  }
  if (personnes.data.length === 0) console.warn('Annuaire : aucune personne renvoyée (droits d’accès ?)')

  const nomDeSection = new Map(sections.data.map((s) => [s.id, s.nom]))
  return personnes.data
    .map((p) => {
      const nom = `${p.nom} ${p.prenom ?? ''}`.trim()
      return { id: p.id, nom, libelle: avecGrade(grades?.[p.id], nom), section: nomDeSection.get(p.section_id) ?? 'Sans affectation' }
    })
    .sort((a, b) => a.libelle.localeCompare(b.libelle, 'fr'))
}
const avecGrade = (grade, nomPrenom) => (grade ? `${grade} ${nomPrenom}` : nomPrenom)

/**
 * Tout le personnel, toutes sections confondues, avec son affectation —
 * pour les champs SNOSM où n'importe quel secouriste peut être désigné
 * (Directeur d'enquête, Rédacteur, Signataire), pas seulement ceux de la
 * section courante.
 */
let cacheTous = null

export async function chargerTousSecouristes(codesRequete) {
  if (cacheTous) return cacheTous

  const liste = await lireAnnuaire(
    supabase.from('annuaire_personnel').select('id, nom, prenom, section_id').eq('type_personnel', 'secouriste'),
    codesRequete
  )
  // Une liste vide n'est pas gardée : elle resterait sinon jusqu'au rechargement de la page.
  if (liste.length > 0) cacheTous = liste
  return liste
}

/**
 * Tout le personnel de l'annuaire, SANS filtrer sur type_personnel — contrairement à
 * chargerTousSecouristes() ci-dessus (réservé au terrain : effectif CRS engagé). Directeur
 * d'enquête/Rédacteur/Signataire sont souvent un cadre, pas un secouriste de terrain : les
 * exclure de la liste proposée était le bug remonté par l'utilisateur (« ne propose pas les
 * secouristes… propose les effectifs de la section »).
 */
let cacheToutPersonnel = null

export async function chargerToutPersonnel(codesRequete) {
  if (cacheToutPersonnel) return cacheToutPersonnel

  // Types techniques exclus : ce ne sont pas des personnes (« MAGASIN STAGIAIRES » = compte
  // budgétaire du magasin central, comptes collectifs de section) — convention base matériel, 10/11/2026.
  const liste = await lireAnnuaire(
    supabase
      .from('annuaire_personnel')
      .select('id, nom, prenom, section_id')
      .not('type_personnel', 'in', '(stagiaire,magasin,collectif)'),
    codesRequete
  )
  if (liste.length > 0) cacheToutPersonnel = liste
  return liste
}
