import { useMemo, useState } from 'react'
import { regrouperParSemaine, debutSemaine } from '../lib/semaines'

/** Repéré par le sélecteur « Moyen » — voir estSansMoyen ci-dessous. */
export const SANS_MOYEN = '__sans_moyen__'
// Valeur littérale posée côté Cim'Alerte quand rien n'est engagé — pas une
// colonne vide : le filtre doit reconnaître ce texte précis.
const AUCUN_MOYEN_TEXTE = 'Pas de moyens engagés'
const estSansMoyen = (helicopter) => !helicopter || helicopter === AUCUN_MOYEN_TEXTE

const FILTRES_VIDES = {
  semaine: '',
  numero: '',
  commune: '',
  secouriste: '',
  moyen: '',
  activite: '',
}

/** Un texte se retrouve dans une intervention — numéro exact, ou sous-chaîne d'un des champs. */
function correspond(s, mot) {
  if (String(s.local_id) === mot) return true
  const cible = [s.com, s.lieu, s.activity, ...(s.victimes ?? []).flatMap((v) => [v.nom, v.prenom])]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  return cible.includes(mot)
}

/**
 * La même règle de filtrage, en fonction pure — pour l'appliquer à une
 * seconde liste (l'année N-1, par exemple) avec exactement les mêmes
 * critères que ceux choisis pour l'année affichée par le hook.
 */
export function filtrerEvenements(evenements, filtres, recherche = '') {
  const mot = recherche.trim().toLowerCase()
  const communeMot = filtres.commune.trim().toLowerCase()
  const numeroMot = filtres.numero.trim()

  return evenements.filter((s) => {
    if (mot && !correspond(s, mot)) return false
    if (numeroMot && String(s.local_id) !== numeroMot) return false
    if (communeMot && !(s.com ?? '').toLowerCase().includes(communeMot)) return false
    if (filtres.secouriste && !(s.team ?? []).includes(filtres.secouriste)) return false
    if (filtres.activite && s.activity !== filtres.activite) return false
    if (filtres.moyen) {
      if (filtres.moyen === SANS_MOYEN ? !estSansMoyen(s.helicopter) : s.helicopter !== filtres.moyen) return false
    }
    if (filtres.semaine && debutSemaine(new Date(s.created_at)).getTime() !== Number(filtres.semaine)) return false
    return true
  })
}

/**
 * Filtres d'une liste d'interventions — partagés par le Registre et la
 * Carte IGN, qui lisent tous deux `listerAnnee` et proposent les mêmes
 * critères (semaine, n°, commune, secouriste, moyen, activité, recherche
 * libre) sur les mêmes données.
 */
export function useFiltresRegistre(evenements) {
  const [recherche, setRecherche] = useState('')
  const [filtres, setFiltres] = useState(FILTRES_VIDES)
  const [filtresOuverts, setFiltresOuverts] = useState(false)

  const semainesAnnee = useMemo(() => regrouperParSemaine(evenements), [evenements])
  const secouristes = useMemo(
    () => [...new Set(evenements.flatMap((s) => s.team ?? []))].sort((a, b) => a.localeCompare(b, 'fr')),
    [evenements]
  )
  const moyens = useMemo(
    () =>
      [...new Set(evenements.map((s) => s.helicopter).filter((h) => h && h !== AUCUN_MOYEN_TEXTE))].sort((a, b) =>
        a.localeCompare(b, 'fr')
      ),
    [evenements]
  )
  const activites = useMemo(
    () => [...new Set(evenements.map((s) => s.activity).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr')),
    [evenements]
  )

  const majFiltre = (cle, valeur) => setFiltres((f) => ({ ...f, [cle]: valeur }))
  const resetFiltres = () => setFiltres(FILTRES_VIDES)
  const nombreFiltresActifs = Object.values(filtres).filter(Boolean).length
  const filtresActifs = nombreFiltresActifs > 0 || recherche.trim() !== ''

  const evenementsFiltres = useMemo(
    () => filtrerEvenements(evenements, filtres, recherche),
    [evenements, recherche, filtres]
  )

  return {
    recherche,
    setRecherche,
    filtres,
    majFiltre,
    resetFiltres,
    filtresOuverts,
    setFiltresOuverts,
    nombreFiltresActifs,
    filtresActifs,
    semainesAnnee,
    secouristes,
    moyens,
    activites,
    evenementsFiltres,
  }
}
