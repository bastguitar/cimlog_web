/** Champs de saisie réutilisables pour le formulaire SNOSM, pilotés par la description déclarative des groupes (voir FicheSnosm). */
import { useState } from 'react'

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

export function ChampListe({ label, valeur, onChange, options }) {
  return (
    <div className="detail-fiche-edition">
      <span className="etiquette-detail-fiche">{label}</span>
      <select value={valeur ?? ''} onChange={(e) => onChange(e.target.value)}>
        <option value="">—</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  )
}

/**
 * Champ Cim'Alerte réutilisé tel quel (pas un vocabulaire SNOSM) : tant
 * qu'il est vide — alerte mal renseignée à la prise d'appel — propose le
 * menu déroulant Cim'Alerte pour le compléter correctement ici. Dès qu'une
 * valeur existe, redevient un texte libre normal : pas de valeur déjà
 * saisie à forcer dans une liste qui pourrait ne pas la contenir mot pour mot.
 */
export function ChampListeOuTexte({ label, valeur, onChange, options }) {
  if (valeur) return <ChampTexte label={label} valeur={valeur} onChange={onChange} />
  return <ChampListe label={label} valeur={valeur} onChange={onChange} options={options} />
}

/** Affichage seul (ex. l'heure d'alerte Cim'Alerte, à côté de Départ/Sur les lieux/Fin d'opération) — rien à corriger ici. */
export function ChampLecture({ label, valeur }) {
  return (
    <div className="detail-fiche-edition">
      <span className="etiquette-detail-fiche">{label}</span>
      <div className="valeur-lecture-snosm">{valeur || '—'}</div>
    </div>
  )
}

export function ChampRadio({ label, valeur, onChange, options }) {
  return (
    <div className="detail-fiche-edition detail-pleine-largeur">
      <span className="etiquette-detail-fiche">{label}</span>
      <div className="champ-radio-snosm">
        {options.map((o) => (
          <label key={o}>
            <input
              type="radio"
              name={label}
              checked={valeur === o}
              onClick={() => valeur === o && onChange('')}
              onChange={() => onChange(o)}
            />
            {o}
          </label>
        ))}
      </div>
    </div>
  )
}

/**
 * Radio repliable : masqué derrière une flèche tant que `visible` est faux,
 * dépliable manuellement à tout moment (état local, jamais reverrouillé
 * ensuite). `optionsParDefaut`, si fourni, réduit la liste affichée avant
 * dépliage manuel — dépliée, la liste complète (`options`) redevient
 * accessible : rien de ce qui existait avant n'est jamais rendu impossible
 * à cocher, juste replié par défaut pour ne pas encombrer l'écran.
 */
export function ChampRepliable({ label, valeur, onChange, options, optionsParDefaut, visible }) {
  const [deplie, setDeplie] = useState(false)
  const estVisible = visible || deplie

  if (!estVisible) {
    return (
      <button type="button" className="bouton-repliable-snosm" onClick={() => setDeplie(true)}>
        <span className="fleche-repliable-snosm">▸</span> {label}
      </button>
    )
  }

  const optionsAffichees = deplie ? options : (optionsParDefaut ?? options)
  const reduit = !deplie && optionsParDefaut && optionsParDefaut.length < options.length

  return (
    <div className="detail-fiche-edition detail-pleine-largeur">
      <span className="etiquette-detail-fiche">{label}</span>
      <div className="champ-radio-snosm">
        {optionsAffichees.map((o) => (
          <label key={o}>
            <input
              type="radio"
              name={label}
              checked={valeur === o}
              onClick={() => valeur === o && onChange('')}
              onChange={() => onChange(o)}
            />
            {o}
          </label>
        ))}
        {reduit && (
          <button type="button" className="lien-voir-tout-snosm" onClick={() => setDeplie(true)}>
            Voir toutes les options
          </button>
        )}
      </div>
    </div>
  )
}

/**
 * Nom d'un secouriste, filtré au fil de la saisie (Directeur d'enquête,
 * Rédacteur, Signataire — n'importe qui de l'annuaire, pas seulement la
 * section courante, voir chargerTousSecouristes). Reste un texte libre au
 * fond : une personne absente de l'annuaire (départ, mutation) ne doit pas
 * empêcher de taper son nom.
 */
export function ChampAutocomplete({ label, valeur, onChange, options }) {
  const [ouvert, setOuvert] = useState(false)
  const filtre = (valeur ?? '').trim().toLowerCase()
  const suggestions = (filtre ? options.filter((o) => o.toLowerCase().includes(filtre)) : options).slice(0, 8)

  return (
    <div className="detail-fiche-edition champ-autocomplete-snosm">
      <span className="etiquette-detail-fiche">{label}</span>
      <input
        type="text"
        autoComplete="off"
        value={valeur ?? ''}
        onChange={(e) => {
          onChange(e.target.value)
          setOuvert(true)
        }}
        onFocus={() => setOuvert(true)}
        onBlur={() => setTimeout(() => setOuvert(false), 150)}
      />
      {ouvert && suggestions.length > 0 && (
        <ul className="suggestions-autocomplete-snosm">
          {suggestions.map((o) => (
            <li key={o}>
              <button type="button" onMouseDown={() => onChange(o)}>
                {o}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Boutons radio + une case de précision libre sur la même ligne (ex. Origine de l'alerte / « Autre »), comme le vrai formulaire SNOSM. */
export function ChampRadioTexte({ label, valeur, onChange, options, valeurTexte, onChangeTexte, placeholderTexte }) {
  return (
    <div className="detail-fiche-edition detail-pleine-largeur">
      <span className="etiquette-detail-fiche">{label}</span>
      <div className="ligne-radio-texte-snosm">
        <div className="champ-radio-snosm">
          {options.map((o) => (
            <label key={o}>
              <input
                type="radio"
                name={label}
                checked={valeur === o}
                onClick={() => valeur === o && onChange('')}
                onChange={() => onChange(o)}
              />
              {o}
            </label>
          ))}
        </div>
        <input
          type="text"
          placeholder={placeholderTexte}
          value={valeurTexte ?? ''}
          onChange={(e) => onChangeTexte(e.target.value)}
        />
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
export function ChampSnosm({ description, valeur, onChange, secouristes, valeurLiee, onChangeLiee, brouillon }) {
  const { label, type, options, placeholderLie } = description
  if (type === 'nombre') return <ChampNombre label={label} valeur={valeur} onChange={onChange} />
  if (type === 'checkbox') return <ChampCheckbox label={label} valeur={valeur} onChange={onChange} />
  if (type === 'datetime') return <ChampDateTime label={label} valeur={valeur} onChange={onChange} />
  if (type === 'texte-long') return <ChampTexteLong label={label} valeur={valeur} onChange={onChange} />
  if (type === 'liste') return <ChampListe label={label} valeur={valeur} onChange={onChange} options={options} />
  if (type === 'radio') return <ChampRadio label={label} valeur={valeur} onChange={onChange} options={options} />
  if (type === 'repliable')
    return (
      <ChampRepliable
        label={label}
        valeur={valeur}
        onChange={onChange}
        options={options}
        optionsParDefaut={description.optionsSi ? description.optionsSi(brouillon ?? {}) : undefined}
        visible={description.visibleSi ? description.visibleSi(brouillon ?? {}) : true}
      />
    )
  if (type === 'radio-texte')
    return (
      <ChampRadioTexte
        label={label}
        valeur={valeur}
        onChange={onChange}
        options={options}
        valeurTexte={valeurLiee}
        onChangeTexte={onChangeLiee}
        placeholderTexte={placeholderLie}
      />
    )
  if (type === 'liste-si-vide') return <ChampListeOuTexte label={label} valeur={valeur} onChange={onChange} options={options} />
  if (type === 'lecture') return <ChampLecture label={label} valeur={valeur} />
  if (type === 'personnel') return <ChampAutocomplete label={label} valeur={valeur} onChange={onChange} options={secouristes ?? []} />
  return <ChampTexte label={label} valeur={valeur} onChange={onChange} />
}
