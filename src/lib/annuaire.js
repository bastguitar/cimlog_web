/**
 * Annuaire des personnels — projet Supabase distinct (fllhwnxrisofbgcehnux),
 * repris à l'identique de alerte_secours_web/src/lib/annuaire.js. Interrogé
 * en direct à chaque ouverture du formulaire, jamais recopié dans notre base
 * (mis à jour en permanence par ailleurs).
 *
 * ⚠ On ne sélectionne QUE id / nom / prénom / section_id. La table expose
 *   aussi email, password_hash et access_pin : ces colonnes ne doivent
 *   jamais descendre dans le navigateur.
 */
import { createClient } from '@supabase/supabase-js'
import { chargerGradesSecouristes } from './registre'

const url = import.meta.env.VITE_ANNUAIRE_URL
const anonKey = import.meta.env.VITE_ANNUAIRE_ANON_KEY

export const annuaire = url && anonKey ? createClient(url, anonKey, { auth: { persistSession: false } }) : null

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
  if (!annuaire) return []

  const [personnes, sections, grades] = await Promise.all([
    annuaire.from('users').select('id, nom, prenom, section_id').eq('type_personnel', 'secouriste'),
    annuaire.from('sections').select('id, nom'),
    gradesUneFois(codesRequete),
  ])
  if (personnes.error || sections.error) return []

  const nomDeSection = new Map(sections.data.map((s) => [s.id, s.nom]))

  cacheTous = personnes.data
    .map((p) => ({
      id: p.id,
      libelle: avecGrade(grades[p.id], `${p.nom} ${p.prenom ?? ''}`.trim()),
      section: nomDeSection.get(p.section_id) ?? 'Sans affectation',
    }))
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
  if (!annuaire) return []

  const [personnes, sections, grades] = await Promise.all([
    annuaire.from('users').select('id, nom, prenom, section_id'),
    annuaire.from('sections').select('id, nom'),
    gradesUneFois(codesRequete),
  ])
  if (personnes.error || sections.error) return []

  const nomDeSection = new Map(sections.data.map((s) => [s.id, s.nom]))

  cacheToutPersonnel = personnes.data
    .map((p) => ({
      id: p.id,
      libelle: avecGrade(grades[p.id], `${p.nom} ${p.prenom ?? ''}`.trim()),
      section: nomDeSection.get(p.section_id) ?? 'Sans affectation',
    }))
    .sort((a, b) => a.libelle.localeCompare(b.libelle, 'fr'))

  return cacheToutPersonnel
}
