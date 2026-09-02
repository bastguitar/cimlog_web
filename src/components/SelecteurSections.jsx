/** Légende cliquable par section — voir useFiltreSections. Rien à afficher tant qu'une seule section est visible (rien à filtrer). */
export default function SelecteurSections({ sections, actives, onToggle }) {
  if (sections.length <= 1) return null
  return (
    <div className="selecteur-sections">
      {sections.map((s) => (
        <button
          key={s.code}
          type="button"
          className={actives.has(s.code) ? 'puce-section active' : 'puce-section'}
          onClick={() => onToggle(s.code)}
          title={actives.has(s.code) ? `Masquer ${s.nom}` : `Afficher ${s.nom}`}
        >
          <span className="point-section" style={{ background: s.couleur }} />
          {s.nom}
        </button>
      ))}
    </div>
  )
}
