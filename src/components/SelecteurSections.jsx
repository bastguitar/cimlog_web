import { useEffect, useRef, useState } from 'react'

/**
 * Nom du poste, en haut à droite de l'en-tête — cliquable dès qu'il y a
 * d'autres sections dans sa région (voir useFiltreSections, appelé une
 * seule fois dans App.jsx : la sélection survit à la navigation entre
 * onglets). Sélection unique : cliquer une option déjà choisie la
 * désélectionne (retour à sa propre section) ; en choisir une autre
 * remplace la précédente, jamais de cumul individuel. « CRS Alpes »/« CRS
 * Pyrénées » (selon la région du poste connecté) est une option de la
 * liste comme les autres — cliquer dessus donne toutes les sections de
 * cette région à la fois, c'est la seule façon d'en voir plusieurs en même
 * temps.
 */
export default function SelecteurSections({ sections, region, selection, onSelect, nomPropre }) {
  const [ouvert, setOuvert] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!ouvert) return
    const fermerSiExterieur = (e) => {
      if (!ref.current?.contains(e.target)) setOuvert(false)
    }
    document.addEventListener('mousedown', fermerSiExterieur)
    return () => document.removeEventListener('mousedown', fermerSiExterieur)
  }, [ouvert])

  // Rien à choisir (poste sans région connue, ou seul de sa région) : juste
  // son nom, comme avant, sans faire croire qu'il y a un menu.
  if (!region || sections.length === 0) {
    return nomPropre ? <span className="nom-poste">{nomPropre}</span> : null
  }

  const etiquetteRegion = `CRS ${region}`
  const sectionActive = selection && selection !== 'REGION' ? sections.find((s) => s.code === selection) : null
  const etiquette = selection === 'REGION' ? etiquetteRegion : (sectionActive?.nom ?? nomPropre ?? 'Ma section')

  const choisir = (code) => {
    onSelect(code)
    setOuvert(false)
  }

  return (
    <div className="menu-sections" ref={ref}>
      <button
        type="button"
        className={selection ? 'bouton-sections actif' : 'bouton-sections'}
        onClick={() => setOuvert((o) => !o)}
        title="Voir les secours d'une autre section"
      >
        {etiquette}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {ouvert && (
        <div className="liste-menu-sections">
          <button
            type="button"
            className={selection === 'REGION' ? 'option-menu-sections active' : 'option-menu-sections'}
            onClick={() => choisir('REGION')}
          >
            <span className="point-section point-section-region" />
            {etiquetteRegion}
          </button>
          {sections.map((s) => (
            <button
              key={s.code}
              type="button"
              className={selection === s.code ? 'option-menu-sections active' : 'option-menu-sections'}
              onClick={() => choisir(s.code)}
            >
              <span className="point-section" style={{ background: s.couleur }} />
              {s.nom}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
