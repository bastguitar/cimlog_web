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
let promesseGrades = null
function gradesUneFois(codesRequete) {
  if (!promesseGrades) promesseGrades = chargerGradesSecouristes(codesRequete).catch(() => ({}))
  return promesseGrades
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

  const [personnes, sections, grades] = await Promise.all([
    supabase.from('annuaire_personnel').select('id, nom, prenom, section_id').eq('type_personnel', 'secouriste'),
    supabase.from('annuaire_sections_externes').select('id, nom'),
    gradesUneFois(codesRequete),
  ])
  if (personnes.error || sections.error) return []

  const nomDeSection = new Map(sections.data.map((s) => [s.id, s.nom]))

  cacheTous = personnes.data
    .map((p) => {
      const nom = `${p.nom} ${p.prenom ?? ''}`.trim()
      return { id: p.id, nom, libelle: avecGrade(grades[p.id], nom), section: nomDeSection.get(p.section_id) ?? 'Sans affectation' }
    })
    .sort((a, b) => a.libelle.localeCompare(b.libelle, 'fr'))

  return cacheTous
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

  const [personnes, sections, grades] = await Promise.all([
    supabase.from('annuaire_personnel').select('id, nom, prenom, section_id'),
    supabase.from('annuaire_sections_externes').select('id, nom'),
    gradesUneFois(codesRequete),
  ])
  if (personnes.error || sections.error) return []

  const nomDeSection = new Map(sections.data.map((s) => [s.id, s.nom]))

  cacheToutPersonnel = personnes.data
    .map((p) => {
      const nom = `${p.nom} ${p.prenom ?? ''}`.trim()
      return { id: p.id, nom, libelle: avecGrade(grades[p.id], nom), section: nomDeSection.get(p.section_id) ?? 'Sans affectation' }
    })
    .sort((a, b) => a.libelle.localeCompare(b.libelle, 'fr'))

  return cacheToutPersonnel
}
