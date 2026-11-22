import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  sectionsDeLaRegion,
  groupeDe,
  codesDuGroupe,
  couleurSection,
  sousGroupesDe,
  positionsSousGroupes,
  departementDeSection,
  departementDe,
} from '../lib/sections'

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

  // Groupe découpé par département (Lannemezan, voir SOUS_GROUPES dans
  // lib/sections.js) : le poste arrive sur le département du sien, le menu ne
  // propose que l'autre département et toute la région (« CRS Pyrénées ») —
  // pas les autres sections une à une (Perpignan retiré, demandé le 08/11/2026).
  const sousGroupes = sousGroupesDe(poste?.code)
  const maPartie = sousGroupes?.find((g) => g.codes.includes(poste?.code)) ?? null
  const [positions, setPositions] = useState({})
  useEffect(() => {
    setPositions({})
    if (sousGroupes) positionsSousGroupes(sousGroupes).then(setPositions)
  }, [sousGroupes])

  const autresSections = useMemo(() => {
    if (sousGroupes) {
      return sousGroupes
        .filter((g) => g !== maPartie)
        .map((g) => ({ ...positions[g.poste], code: g.code, nom: g.nom, couleur: couleurSection(g.codes[0]) }))
    }
    return sections.filter((s) => s.code !== monGroupe)
  }, [sections, monGroupe, sousGroupes, maPartie, positions])

  // `null` = retour à sa propre section (option en tête du menu).
  const selectionner = (code) => setSelection((s) => (code === null || s === code ? null : code))

  /** Retour forcé à sa propre section — voir GardeInactivite (App.jsx). */
  const reinitialiser = () => setSelection(null)

  // Codes de la section regardée (la sienne, ou celle choisie dans le menu), toute la région sinon.
  const codesSection = useMemo(() => {
    if (selection === 'REGION') return sections.flatMap((s) => codesDuGroupe(s.code))
    const partieChoisie = sousGroupes?.find((g) => g.code === selection)
    if (partieChoisie) return partieChoisie.codes
    if (selection) return codesDuGroupe(selection)
    if (maPartie) return maPartie.codes
    return codesDuGroupe(monGroupe)
  }, [selection, sections, monGroupe, sousGroupes, maPartie])

  /*
   * Vue « Département » (demandée le 22/11/2026) : une section intervient chez elle mais part aussi
   * en renfort ailleurs. Vue Section (défaut) = tout ce qu'a fait la section, dans son département
   * et hors ; vue Département = tout ce qui s'est passé dans le département de la section, qu'elle
   * l'ait fait elle-même ou une autre section de la région. On charge alors toute la région (même
   * droit de consultation que « CRS Alpes ») et on ne garde que les interventions du département.
   */
  const [vueDepartement, setVueDepartement] = useState(false)
  const departementVue = selection === 'REGION' ? null : departementDeSection(codesSection[0])
  const enVueDepartement = vueDepartement && departementVue != null
  useEffect(() => {
    setVueDepartement(false)
  }, [poste])

  const codesRegion = useMemo(() => sections.flatMap((s) => codesDuGroupe(s.code)), [sections])
  const codesRequete = enVueDepartement && codesRegion.length > 0 ? codesRegion : codesSection

  /** Applique la vue choisie à une liste chargée avec codesRequete — identité en vue Section. */
  const filtrerVue = useCallback(
    (evenements) => (enVueDepartement ? evenements.filter((s) => departementDe(s) === departementVue) : evenements),
    [enVueDepartement, departementVue]
  )

  return {
    sections: autresSections,
    // Nom affiché sur le bouton quand le poste regarde ses propres secours —
    // avec le département pour un groupe découpé (« Gavarnie · Hautes-Pyrénées (65) »).
    couleurPropre: couleurSection(poste?.code),
    // Section mère du poste connecté — une fiche d'un autre groupe s'ouvre en lecture seule (ModaleFiche).
    monGroupe: poste ? monGroupe : null,
    nomPropre: poste ? (maPartie ? `${poste.nom} · ${maPartie.nom}` : poste.nom) : null,
    // Non filtrée (la sienne comprise) — pour retrouver le nom d'une section
    // à partir d'un squad_code quelconque (colonne "Unité" du Registre en
    // vue région), sans dupliquer sectionsDeLaRegion ailleurs.
    toutesSections: sections,
    region,
    selection,
    selectionner,
    reinitialiser,
    codesRequete,
    filtrerVue,
    // Département de la section regardée (null en vue région ou section sans département connu).
    departementVue,
    vueDepartement: enVueDepartement,
    basculerVueDepartement: () => setVueDepartement((v) => !v),
    // Intitulé de ce qui est affiché — en tête des PDF exportés (Registre, bilan des Stats).
    intitule: enVueDepartement
      ? `Département ${departementVue}`
      : selection === 'REGION'
        ? `Région ${region ?? ''}`.trim()
        : selection
          ? (autresSections.find((x) => x.code === selection)?.nom ?? selection)
          : poste
            ? maPartie
              ? `${poste.nom} · ${maPartie.nom}`
              : poste.nom
            : null,
    // Colonne Unité : plusieurs sections apparaissent (région, ou département en vue Département).
    multiple: selection === 'REGION' || enVueDepartement,
  }
}
