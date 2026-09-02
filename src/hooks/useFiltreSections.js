import { useEffect, useMemo, useState } from 'react'
import { sectionsDeLaRegion, groupeDe } from '../lib/sections'

/**
 * Filtre par section (Grenoble/Briançon/Albertville/…), partagé par toutes
 * les pages qui lisent maintenant les interventions de toute la région
 * (voir visibilite_regionale.sql) — sans lui, une seule liste mélangerait
 * silencieusement les sections sans moyen de les distinguer ou de revenir
 * à la sienne seule.
 */
export function useFiltreSections(poste) {
  const [sections, setSections] = useState([])
  const [actives, setActives] = useState(null) // null = toutes actives

  useEffect(() => {
    if (!poste) return
    sectionsDeLaRegion(poste.code)
      .then(setSections)
      .catch(() => setSections([]))
  }, [poste])

  const ensembleActif = useMemo(() => actives ?? new Set(sections.map((s) => s.code)), [actives, sections])

  const toggler = (code) => {
    setActives((a) => {
      const base = a ?? new Set(sections.map((s) => s.code))
      const suivant = new Set(base)
      if (suivant.has(code)) suivant.delete(code)
      else suivant.add(code)
      return suivant
    })
  }

  const estVisible = (squadCode) => ensembleActif.has(groupeDe(squadCode))
  const filtrer = (liste, cleSection = 'squad_code') => liste.filter((e) => estVisible(e[cleSection]))

  return { sections, actives: ensembleActif, toggler, estVisible, filtrer }
}
