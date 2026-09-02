/** Légende cliquable par section — voir useFiltreSections. Rien à afficher tant qu'une seule section existe dans la région (rien à filtrer). */
export default function SelecteurSections({ sections, actives, onToggle, onTout, onMaSection }) {
  if (sections.length <= 1) return null
  const toutesActives = sections.every((s) => actives.has(s.code))
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
      <button type="button" className="lien-selecteur-sections" onClick={toutesActives ? onMaSection : onTout}>
        {toutesActives ? 'Ma section' : 'Toute la région'}
      </button>
    </div>
  )
}
