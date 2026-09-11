/**
 * Champs de saisie réutilisables pour le formulaire SNOSM — en attendant le
 * contenu réel des menus déroulants (voir Cim'Log), tous les champs à choix
 * sont en texte libre pour l'instant : les colonnes Grist correspondantes
 * sont du texte de toute façon, convertir en vraies listes plus tard ne
 * perdra aucune donnée déjà saisie.
 */

function formatDateTimeLocal(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

export function ChampTexte({ label, valeur, onChange }) {
  return (
    <div className="detail-fiche-edition">
      <span className="etiquette-detail-fiche">{label}</span>
      <input type="text" value={valeur ?? ''} onChange={(e) => onChange(e.target.value)} />
    </div>
  )
}

export function ChampTexteLong({ label, valeur, onChange }) {
  return (
    <div className="detail-fiche-edition detail-pleine-largeur">
      <span className="etiquette-detail-fiche">{label}</span>
      <textarea value={valeur ?? ''} onChange={(e) => onChange(e.target.value)} rows={3} />
    </div>
  )
}

export function ChampNombre({ label, valeur, onChange, min = 0 }) {
  const n = Number(valeur) || 0
  return (
    <div className="detail-fiche-edition">
      <span className="etiquette-detail-fiche">{label}</span>
      <div className="champ-compteur-snosm">
        <button type="button" onClick={() => onChange(Math.max(min, n - 1))} disabled={n <= min} aria-label="Diminuer">
          −
        </button>
        <span>{n}</span>
        <button type="button" onClick={() => onChange(n + 1)} aria-label="Augmenter">
          +
        </button>
      </div>
    </div>
  )
}

export function ChampCheckbox({ label, valeur, onChange }) {
  return (
    <label className="champ-checkbox-snosm">
      <input type="checkbox" checked={Boolean(valeur)} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  )
}

export function ChampDateTime({ label, valeur, onChange }) {
  return (
    <div className="detail-fiche-edition">
      <span className="etiquette-detail-fiche">{label}</span>
      <input
        type="datetime-local"
        value={formatDateTimeLocal(valeur)}
        onChange={(e) => onChange(e.target.value ? new Date(e.target.value).toISOString() : null)}
      />
    </div>
  )
}

/** Rendu générique d'un champ, piloté par la description déclarative des onglets SNOSM (voir OngletSnosm). */
export function ChampSnosm({ description, valeur, onChange }) {
  const { label, type } = description
  if (type === 'nombre') return <ChampNombre label={label} valeur={valeur} onChange={onChange} />
  if (type === 'checkbox') return <ChampCheckbox label={label} valeur={valeur} onChange={onChange} />
  if (type === 'datetime') return <ChampDateTime label={label} valeur={valeur} onChange={onChange} />
  if (type === 'texte-long') return <ChampTexteLong label={label} valeur={valeur} onChange={onChange} />
  return <ChampTexte label={label} valeur={valeur} onChange={onChange} />
}
