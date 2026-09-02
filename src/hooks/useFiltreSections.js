import { useEffect, useMemo, useState } from 'react'
import { sectionsDeLaRegion, groupeDe, codesDuGroupe } from '../lib/sections'

/**
 * Filtre par section — sélection UNIQUE (jamais plusieurs sections isolées
 * à la fois : soit sa propre section, soit une autre section précise, soit
 * toute la région d'un coup). Par défaut (selection null), un poste ne voit
 * que sa propre section — inchangé, RLS d'origine, aucun appel réseau
 * supplémentaire. Voir une autre section passe par les fonctions RPC
 * cimlog_evenements/cimlog_messages/cimlog_victimes (voir
 * sections_lecture_region.sql) : `codesRequete` porte les squad_code à leur
 * demander, calculé ici, jamais par les pages elles-mêmes.
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

  // null = pas d'appel RPC nécessaire, on reste sur le chemin RLS d'origine.
  const codesRequete = useMemo(() => {
    if (selection === 'REGION') return sections.flatMap((s) => codesDuGroupe(s.code))
    if (selection) return codesDuGroupe(selection)
    return null
  }, [selection, sections])

  return {
    sections: autresSections,
    region,
    selection,
    selectionner,
    codesRequete,
    multiple: selection === 'REGION',
  }
}
