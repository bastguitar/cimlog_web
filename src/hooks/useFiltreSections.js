import { useEffect, useMemo, useState } from 'react'
import { sectionsDeLaRegion, groupeDe } from '../lib/sections'

/**
 * Filtre par section — sélection UNIQUE (jamais plusieurs sections isolées
 * à la fois : soit sa propre section, soit une autre section précise, soit
 * toute la région d'un coup). Par défaut, un poste ne voit que sa propre
 * section, comme avant la visibilité régionale (voir visibilite_regionale.sql)
 * — voir ailleurs est un choix volontaire, jamais l'état de départ, et
 * re-cliquer l'option déjà choisie y ramène. Écrire un message reste
 * toujours au nom de sa propre section (poste.code), quoi que ce filtre
 * affiche.
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

  const groupesVisibles = useMemo(() => {
    if (selection === 'REGION') return new Set(sections.map((s) => s.code))
    if (selection) return new Set([selection])
    return new Set([monGroupe])
  }, [selection, sections, monGroupe])

  const estVisible = (squadCode) => groupesVisibles.has(groupeDe(squadCode))
  const filtrer = (liste, cleSection = 'squad_code') => liste.filter((e) => estVisible(e[cleSection]))

  return {
    sections: autresSections,
    region,
    selection,
    selectionner,
    estVisible,
    filtrer,
    multiple: selection === 'REGION',
  }
}
