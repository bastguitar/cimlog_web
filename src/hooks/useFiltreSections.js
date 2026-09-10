import { useEffect, useMemo, useState } from 'react'
import { sectionsDeLaRegion, groupeDe, codesDuGroupe } from '../lib/sections'

/**
 * Filtre par section — sélection UNIQUE (jamais plusieurs sections isolées
 * à la fois : soit sa propre section, soit une autre section précise, soit
 * toute la région d'un coup). Par défaut (selection null), un poste ne voit
 * que sa propre section. `codesRequete` porte toujours un tableau explicite
 * de squad_code — jamais `null` : Grist (proxy Edge Function `grist`, voir
 * supabase/functions/grist) n'a pas de RLS sur laquelle s'appuyer comme
 * Supabase, donc pas de "chemin par défaut implicite" possible. Le vrai
 * garde-fou de sécurité reste côté serveur (cimlog_squad_codes_region,
 * revérifiée dans l'Edge Function) — ce que ce hook calcule n'est qu'une
 * demande, jamais une autorisation.
 */
export function useFiltreSections(poste) {
  const [sections, setSections] = useState([]) // sections de la région, la sienne comprise
  const [region, setRegion] = useState(null)
  const [selection, setSelection] = useState(null) // null = sa section | code | 'REGION'

  useEffect(() => {
    setSelection(null)
    if (!poste) return
    sectionsDeLaRegion(poste.code)
      .then((liste) => {
        setSections(liste)
        setRegion(liste[0]?.region ?? null)
      })
      .catch(() => setSections([]))
  }, [poste])

  const monGroupe = groupeDe(poste?.code)
  const autresSections = useMemo(() => sections.filter((s) => s.code !== monGroupe), [sections, monGroupe])

  const selectionner = (code) => setSelection((s) => (s === code ? null : code))

  /** Retour forcé à sa propre section — voir GardeInactivite (App.jsx). */
  const reinitialiser = () => setSelection(null)

  const codesRequete = useMemo(() => {
    if (selection === 'REGION') return sections.flatMap((s) => codesDuGroupe(s.code))
    if (selection) return codesDuGroupe(selection)
    return codesDuGroupe(monGroupe)
  }, [selection, sections, monGroupe])

  return {
    sections: autresSections,
    // Non filtrée (la sienne comprise) — pour retrouver le nom d'une section
    // à partir d'un squad_code quelconque (colonne "Unité" du Registre en
    // vue région), sans dupliquer sectionsDeLaRegion ailleurs.
    toutesSections: sections,
    region,
    selection,
    selectionner,
    reinitialiser,
    codesRequete,
    multiple: selection === 'REGION',
  }
}
