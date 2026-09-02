import { useEffect, useState } from 'react'
import { sectionsDeLaRegion, groupeDe } from '../lib/sections'

/**
 * Filtre par section (Grenoble/Briançon/Albertville/…) — par défaut, un
 * poste ne voit que sa propre section, comme avant la visibilité régionale
 * (voir visibilite_regionale.sql) : voir les autres est un choix volontaire
 * via la légende, jamais l'état de départ. Un poste garde par ailleurs la
 * main sur sa propre main courante quoi qu'il ait sélectionné ici — écrire
 * un message reste toujours au nom de sa propre section (poste.code), ce
 * filtre ne change que ce qui s'affiche.
 */
export function useFiltreSections(poste) {
  const [sections, setSections] = useState([])
  const [actives, setActives] = useState(new Set())

  useEffect(() => {
    if (!poste) return
    sectionsDeLaRegion(poste.code)
      .then((liste) => {
        setSections(liste)
        setActives(new Set([groupeDe(poste.code)]))
      })
      .catch(() => setSections([]))
  }, [poste])

  const toggler = (code) => {
    setActives((a) => {
      const suivant = new Set(a)
      if (suivant.has(code)) suivant.delete(code)
      else suivant.add(code)
      return suivant
    })
  }

  const toutAfficher = () => setActives(new Set(sections.map((s) => s.code)))
  const maSectionSeulement = () => setActives(new Set([groupeDe(poste?.code)]))

  const estVisible = (squadCode) => actives.has(groupeDe(squadCode))
  const filtrer = (liste, cleSection = 'squad_code') => liste.filter((e) => estVisible(e[cleSection]))

  return { sections, actives, toggler, toutAfficher, maSectionSeulement, estVisible, filtrer }
}
