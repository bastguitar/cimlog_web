import { useEffect, useRef, useState } from 'react'

/**
 * Bouton discret + menu déroulant — voir useFiltreSections. Sélection
 * unique : cliquer une option déjà choisie la désélectionne (retour à sa
 * propre section) ; en choisir une autre remplace la précédente, jamais de
 * cumul individuel — seule « Toute la région » combine plusieurs sections.
 */
export default function SelecteurSections({ sections, region, selection, onSelect }) {
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

  if (sections.length === 0) return null

  const etiquetteRegion = region ? `CRS ${region}` : 'Toute la région'
  const sectionActive = selection && selection !== 'REGION' ? sections.find((s) => s.code === selection) : null
  const etiquette = selection === 'REGION' ? etiquetteRegion : (sectionActive?.nom ?? 'Ma section')

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
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 21s-7-6.1-7-11a7 7 0 0 1 14 0c0 4.9-7 11-7 11Z" />
          <circle cx="12" cy="10" r="2.5" />
        </svg>
        {etiquette}
      </button>

      {ouvert && (
        <div className="liste-menu-sections">
          <button
            type="button"
            className={selection === 'REGION' ? 'option-menu-sections active' : 'option-menu-sections'}
            onClick={() => choisir('REGION')}
          >
            {etiquetteRegion}
          </button>
          <div className="separateur-menu-sections" />
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
