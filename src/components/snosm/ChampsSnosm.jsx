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

export function ChampTexteLong({ label, valeur, onChange, rows = 3 }) {
  return (
    <div className="detail-fiche-edition detail-pleine-largeur">
      <span className="etiquette-detail-fiche">{label}</span>
      <textarea value={valeur ?? ''} onChange={(e) => onChange(e.target.value)} rows={rows} />
    </div>
  )
}

export function ChampDate({ label, valeur, onChange }) {
  return (
    <div className="detail-fiche-edition">
      <span className="etiquette-detail-fiche">{label}</span>
      <input type="date" value={(valeur ?? '').slice(0, 10)} onChange={(e) => onChange(e.target.value || null)} />
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

export function ChampListe({ label, valeur, onChange, options, pleineLargeur }) {
  return (
    <div className={`detail-fiche-edition${pleineLargeur ? ' detail-pleine-largeur' : ''}`}>
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

export function ChampRadio({ label, valeur, onChange, options, pleineLargeur = true, avecFleche = false }) {
  return (
    <div className={`detail-fiche-edition${pleineLargeur ? ' detail-pleine-largeur' : ''}`}>
      {avecFleche ? (
        <span className="bouton-repliable-snosm bouton-repliable-snosm-fixe">
          <span className="fleche-repliable-snosm">▾</span> {label}
        </span>
      ) : (
        <span className="etiquette-detail-fiche">{label}</span>
      )}
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

/** Choix unique en boutons bulles (comme le vrai formulaire SNOSM) plutôt qu'en boutons radio — jamais replié. */
export function ChampBulles({ label, valeur, onChange, options }) {
  return (
    <div className="detail-fiche-edition detail-pleine-largeur">
      <span className="etiquette-detail-fiche">{label}</span>
      <div className="champ-bulles-snosm">
        {options.map((o) => (
          <button
            type="button"
            key={o}
            className={`bulle-snosm${valeur === o ? ' selectionnee' : ''}`}
            onClick={() => onChange(valeur === o ? '' : o)}
          >
            {o}
          </button>
        ))}
      </div>
    </div>
  )
}

/**
 * Champ repliable : masqué derrière une flèche tant que `visible` est faux,
 * dépliable manuellement à tout moment. `optionsParDefaut`, si fourni, réduit
 * la liste affichée avant dépliage manuel — dépliée, la liste complète
 * (`options`) redevient accessible : rien de ce qui existait avant n'est
 * jamais rendu impossible à cocher, juste replié par défaut pour ne pas
 * encombrer l'écran. Les choix sont des boutons « bulles » (comme le vrai
 * formulaire SNOSM, ex. « Météo sur place »), pas des boutons radio.
 * Quand `visible` n'est pas imposé par un autre champ, l'en-tête reste
 * cliquable pour replier à nouveau.
 */
export function ChampRepliable({ label, valeur, onChange, options, optionsParDefaut, visible }) {
  const [deplie, setDeplie] = useState(false)
  const estVisible = visible || deplie
  const peutSeReplier = !visible

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
      {peutSeReplier ? (
        <button type="button" className="bouton-repliable-snosm" onClick={() => setDeplie(false)}>
          <span className="fleche-repliable-snosm">▾</span> {label}
        </button>
      ) : (
        <span className="bouton-repliable-snosm bouton-repliable-snosm-fixe">
          <span className="fleche-repliable-snosm">▾</span> {label}
        </span>
      )}
      <div className="champ-bulles-snosm">
        {optionsAffichees.map((o) => (
          <button
            type="button"
            key={o}
            className={`bulle-snosm${valeur === o ? ' selectionnee' : ''}`}
            onClick={() => onChange(valeur === o ? '' : o)}
          >
            {o}
          </button>
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
 * Une valeur principale (généralement préremplie automatiquement, ex.
 * l'hélicoptère/le PPSM déduits de l'alerte) + d'autres valeurs ajoutables au
 * besoin (intervention avec plusieurs hélicos/PPSM engagés) — stockées
 * ensemble dans le même champ texte Grist, séparées par ", ". La valeur
 * préremplie reste modifiable comme les autres. Le nombre de lignes
 * supplémentaires est un état local (pas dans le brouillon) : une ligne
 * ajoutée mais laissée vide n'est jamais écrite, seulement retirée si vidée
 * explicitement pour ne pas décaler les lignes suivantes.
 */
export function ChampListeMultiple({ label, valeur, onChange, options, libelleAjout }) {
  const slotsValeur = (valeur ?? '').split(',').map((v) => v.trim())
  const [nbSupplementaires, setNbSupplementaires] = useState(Math.max(0, slotsValeur.length - 1))
  const total = Math.max(1, nbSupplementaires + 1, slotsValeur.length)
  const slots = Array.from({ length: total }, (_, i) => slotsValeur[i] ?? '')

  const enregistrer = (nouveauxSlots) => {
    const copie = [...nouveauxSlots]
    while (copie.length > 1 && !copie[copie.length - 1]) copie.pop()
    onChange(copie.join(', '))
  }

  return (
    <div className="detail-fiche-edition champ-liste-multiple-snosm">
      <span className="etiquette-detail-fiche">{label}</span>
      <div className="lignes-liste-multiple-snosm">
        {slots.map((v, i) => (
          <div className="ligne-liste-multiple-snosm" key={i}>
            <select
              value={v}
              onChange={(e) => {
                const copie = [...slots]
                copie[i] = e.target.value
                enregistrer(copie)
              }}
            >
              <option value="">—</option>
              {options.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
            {i > 0 && (
              <button
                type="button"
                className="bouton-retirer-liste-multiple-snosm"
                onClick={() => {
                  setNbSupplementaires((n) => Math.max(0, n - 1))
                  enregistrer(slots.filter((_, idx) => idx !== i))
                }}
                aria-label={`Retirer ${label}`}
              >
                ×
              </button>
            )}
          </div>
        ))}
      </div>
      <button type="button" className="lien-ajouter-liste-multiple-snosm" onClick={() => setNbSupplementaires((n) => n + 1)}>
        + Ajouter {libelleAjout ?? 'une valeur'}
      </button>
    </div>
  )
}

/**
 * Champ "tags" (façon Tagify/Gmail) : les valeurs choisies s'affichent en
 * bulles retirables dans le champ lui-même, avec des suggestions filtrées au
 * fil de la frappe. Entrée ou virgule ajoute la valeur tapée — pas seulement
 * celles du vocabulaire connu, plusieurs gestes/techniques pouvant avoir été
 * mis en œuvre et le vocabulaire n'étant qu'un point de départ. Retour
 * arrière sur un champ vide retire la dernière bulle. Valeurs stockées
 * jointes par ", " (même format texte que les autres champs multi-valeurs).
 */
export function ChampTags({ label, valeur, onChange, options }) {
  const [texte, setTexte] = useState('')
  const [ouvert, setOuvert] = useState(false)
  const valeurs = (valeur ?? '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean)
  const filtre = texte.trim().toLowerCase()
  const suggestions = (filtre ? options.filter((o) => o.toLowerCase().includes(filtre)) : options)
    .filter((o) => !valeurs.some((v) => v.toLowerCase() === o.toLowerCase()))
    .slice(0, 8)

  const ajouter = (v) => {
    const nettoye = v.trim()
    if (!nettoye || valeurs.some((existant) => existant.toLowerCase() === nettoye.toLowerCase())) {
      setTexte('')
      return
    }
    onChange([...valeurs, nettoye].join(', '))
    setTexte('')
  }

  const retirer = (v) => onChange(valeurs.filter((existant) => existant !== v).join(', '))

  return (
    <div className="detail-fiche-edition detail-pleine-largeur champ-tags-snosm">
      <span className="etiquette-detail-fiche">{label}</span>
      <div className="zone-tags-snosm">
        {valeurs.map((v) => (
          <span className="tag-snosm" key={v}>
            {v}
            <button type="button" onClick={() => retirer(v)} aria-label={`Retirer ${v}`}>
              ×
            </button>
          </span>
        ))}
        <input
          type="text"
          value={texte}
          placeholder={valeurs.length ? '' : 'Ajouter…'}
          onChange={(e) => {
            setTexte(e.target.value)
            setOuvert(true)
          }}
          onFocus={() => setOuvert(true)}
          onBlur={() => setTimeout(() => setOuvert(false), 150)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault()
              ajouter(texte)
            } else if (e.key === 'Backspace' && !texte && valeurs.length > 0) {
              retirer(valeurs[valeurs.length - 1])
            }
          }}
        />
      </div>
      {ouvert && suggestions.length > 0 && (
        <ul className="suggestions-autocomplete-snosm">
          {suggestions.map((o) => (
            <li key={o}>
              <button type="button" onMouseDown={() => ajouter(o)}>
                {o}
              </button>
            </li>
          ))}
        </ul>
      )}
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

export function ChampDateTime({ label, valeur, onChange, disabled }) {
  return (
    <div className="detail-fiche-edition">
      <span className="etiquette-detail-fiche">{label}</span>
      <input
        type="datetime-local"
        value={formatDateTimeLocal(valeur)}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value ? new Date(e.target.value).toISOString() : null)}
      />
    </div>
  )
}

/** Rendu générique d'un champ, piloté par la description déclarative des onglets SNOSM (voir OngletSnosm). */
export function ChampSnosm({ description, valeur, onChange, secouristes, valeurLiee, onChangeLiee, brouillon }) {
  const { label, type, options, placeholderLie } = description
  // Champ conditionnel simple (pas repliable — masqué complètement, pas de flèche) : ex. "Emploi
  // hélicoptère du SAF" qui ne concerne que YETI 1/YETI 2. Le type 'repliable' gère sa propre
  // visibilité (bouton flèche) et n'est jamais concerné par ce masquage complet.
  if (type !== 'repliable' && description.visibleSi && !description.visibleSi(brouillon ?? {})) return null
  if (type === 'nombre') return <ChampNombre label={label} valeur={valeur} onChange={onChange} />
  if (type === 'checkbox') return <ChampCheckbox label={label} valeur={valeur} onChange={onChange} />
  if (type === 'datetime') return <ChampDateTime label={label} valeur={valeur} onChange={onChange} />
  if (type === 'date') return <ChampDate label={label} valeur={valeur} onChange={onChange} />
  if (type === 'texte-long') return <ChampTexteLong label={label} valeur={valeur} onChange={onChange} rows={description.rows} />
  if (type === 'liste')
    return <ChampListe label={label} valeur={valeur} onChange={onChange} options={options} pleineLargeur={description.pleineLargeur} />
  if (type === 'liste-multiple')
    return (
      <ChampListeMultiple label={label} valeur={valeur} onChange={onChange} options={options} libelleAjout={description.libelleAjout} />
    )
  if (type === 'radio')
    return (
      <ChampRadio
        label={label}
        valeur={valeur}
        onChange={onChange}
        options={options}
        pleineLargeur={description.pleineLargeur ?? true}
        avecFleche={description.avecFleche}
      />
    )
  if (type === 'bulles') return <ChampBulles label={label} valeur={valeur} onChange={onChange} options={options} />
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
  if (type === 'tags') return <ChampTags label={label} valeur={valeur} onChange={onChange} options={options} />
  if (type === 'lecture') return <ChampLecture label={label} valeur={valeur} />
  if (type === 'personnel') return <ChampAutocomplete label={label} valeur={valeur} onChange={onChange} options={secouristes ?? []} />
  return <ChampTexte label={label} valeur={valeur} onChange={onChange} />
}
