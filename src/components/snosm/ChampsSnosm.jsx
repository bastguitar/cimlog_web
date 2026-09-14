/** Champs de saisie réutilisables pour le formulaire SNOSM, pilotés par la description déclarative des groupes (voir FicheSnosm). */
import { useState } from 'react'

function formatDateTimeLocal(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

/** Classe ajoutée sur un champ texte/date/liste/tags laissé vide — bordure rouge pâle, pour repérer
 * en un coup d'œil ce qui reste à compléter (décision utilisateur, valable sur tout le formulaire). */
const classeVide = (vide) => (vide ? ' champ-vide-snosm' : '')

export function ChampTexte({ label, valeur, onChange, icone }) {
  return (
    <div className={`detail-fiche-edition${classeVide(!valeur)}`}>
      <span className="etiquette-detail-fiche">{label}</span>
      <div className={icone ? 'entree-avec-icone-snosm' : undefined}>
        {icone}
        <input type="text" value={valeur ?? ''} onChange={(e) => onChange(e.target.value)} />
      </div>
    </div>
  )
}

export function ChampTexteLong({ label, valeur, onChange, rows = 3 }) {
  return (
    <div className={`detail-fiche-edition detail-pleine-largeur${classeVide(!valeur)}`}>
      <span className="etiquette-detail-fiche">{label}</span>
      <textarea value={valeur ?? ''} onChange={(e) => onChange(e.target.value)} rows={rows} />
    </div>
  )
}

export function ChampDate({ label, valeur, onChange, icone }) {
  return (
    <div className={`detail-fiche-edition${classeVide(!valeur)}`}>
      <span className="etiquette-detail-fiche">{label}</span>
      <div className={icone ? 'entree-avec-icone-snosm' : undefined}>
        {icone}
        <input type="date" value={(valeur ?? '').slice(0, 10)} onChange={(e) => onChange(e.target.value || null)} />
      </div>
    </div>
  )
}

/** Comme ChampTexte, mais avec une unité affichée dans la case elle-même (ex. « 120 m ») — plus
 * pertinent qu'un compteur +/- pour une mesure qu'on connaît déjà (distance parcourue, profondeur…). */
export function ChampTexteUnite({ label, valeur, onChange, unite }) {
  return (
    <div className={`detail-fiche-edition${classeVide(!valeur)}`}>
      <span className="etiquette-detail-fiche">{label}</span>
      <div className="champ-texte-unite-snosm">
        <input type="text" value={valeur ?? ''} onChange={(e) => onChange(e.target.value)} />
        {unite && <span className="unite-champ-snosm">{unite}</span>}
      </div>
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
    <div className={`detail-fiche-edition${pleineLargeur ? ' detail-pleine-largeur' : ''}${classeVide(!valeur)}`}>
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

export function ChampRadio({ label, valeur, onChange, options, pleineLargeur = true, avecFleche = false, icones }) {
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
            {icones?.[o]}
            {o}
          </label>
        ))}
      </div>
    </div>
  )
}

// Octogone à 8 parts (Nord/Nord-Est/Est/Sud-Est/Sud/Sud-Ouest/Ouest/Nord-Ouest), inspiré d'une rose
// des vents fournie par l'utilisateur — sommets aux angles ±22.5° de chaque direction (arêtes plates
// sur les cardinaux), centre (100, 110). Nord porte son libellé à l'intérieur de sa part, exactement
// comme les 7 autres (pas d'exception à l'extérieur — remarqué par l'utilisateur sur la 1ère version).
const SOMMETS_ORIENTATION = [
  [65.6, 26.85],
  [134.4, 26.85],
  [183.2, 75.6],
  [183.2, 144.4],
  [134.4, 193.2],
  [65.6, 193.2],
  [16.85, 144.4],
  [16.85, 75.6],
]
const PARTS_ORIENTATION = [
  { valeur: 'nord', sommets: [0, 1], label: ['Nord'], position: [100, 54] },
  { valeur: 'nord-est', sommets: [1, 2], label: ['Nord-', 'Est'], position: [141, 69] },
  { valeur: 'est', sommets: [2, 3], label: ['Est'], position: [158, 110] },
  { valeur: 'sud-est', sommets: [3, 4], label: ['Sud-', 'Est'], position: [141, 151] },
  { valeur: 'sud', sommets: [4, 5], label: ['Sud'], position: [100, 168] },
  { valeur: 'sud-ouest', sommets: [5, 6], label: ['Sud-', 'Ouest'], position: [59, 151] },
  { valeur: 'ouest', sommets: [6, 7], label: ['Ouest'], position: [42, 110] },
  { valeur: 'nord-ouest', sommets: [7, 0], label: ['Nord-', 'Ouest'], position: [59, 69] },
]

/** Rose des vents cliquable à 8 directions — la part choisie se colore en noir. */
export function ChampOrientation({ label, valeur, onChange }) {
  return (
    <div className="detail-fiche-edition detail-pleine-largeur">
      <span className="etiquette-detail-fiche">{label}</span>
      <svg viewBox="0 0 200 200" className="champ-orientation-snosm" role="img" aria-label="Rose des vents">
        {PARTS_ORIENTATION.map((p) => {
          const [i1, i2] = p.sommets
          const points = `100,110 ${SOMMETS_ORIENTATION[i1].join(',')} ${SOMMETS_ORIENTATION[i2].join(',')}`
          const selectionnee = valeur === p.valeur
          return (
            <polygon
              key={p.valeur}
              points={points}
              className={`orientation-part-snosm${selectionnee ? ' selectionnee' : ''}`}
              onClick={() => onChange(selectionnee ? '' : p.valeur)}
            />
          )
        })}
        {PARTS_ORIENTATION.filter((p) => p.label).map((p) => (
          <text
            key={p.valeur}
            x={p.position[0]}
            y={p.position[1]}
            textAnchor="middle"
            className={`orientation-texte-snosm${valeur === p.valeur ? ' selectionnee' : ''}`}
            style={{ pointerEvents: 'none' }}
          >
            {p.label.map((ligne, i) => (
              <tspan key={ligne} x={p.position[0]} dy={i === 0 ? 0 : 12}>
                {ligne}
              </tspan>
            ))}
          </text>
        ))}
        <defs>
          <marker id="fleche-nord" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" className="orientation-fleche-nord-pointe" />
          </marker>
        </defs>
      </svg>
    </div>
  )
}

/** Choix unique en boutons bulles (comme le vrai formulaire SNOSM) plutôt qu'en boutons radio — jamais replié. */
export function ChampBulles({ label, valeur, onChange, options, avecFleche = false }) {
  return (
    <div className="detail-fiche-edition detail-pleine-largeur">
      {avecFleche ? (
        <span className="bouton-repliable-snosm bouton-repliable-snosm-fixe">
          <span className="fleche-repliable-snosm">▾</span> {label}
        </span>
      ) : (
        <span className="etiquette-detail-fiche">{label}</span>
      )}
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
 * Échelle horizontale à curseur (façon jauge colorée) — un choix ordonné (ex. Taille d'avalanche 1→5)
 * où la couleur porte elle-même la gravité (jaune → rouge), comme la pièce jointe fournie par
 * l'utilisateur. `<input type="range">` natif (drag + clic + flèches clavier) posé sur une piste
 * dégradée ; les graduations en dessous restent cliquables directement (pas besoin de faire glisser).
 */
export function ChampEchelle({ label, valeur, onChange, options, couleurs }) {
  const index = options.indexOf(valeur)
  return (
    <div className="detail-fiche-edition detail-pleine-largeur champ-echelle-snosm">
      <span className="etiquette-detail-fiche">{label}</span>
      <div className="piste-echelle-snosm" style={{ backgroundImage: `linear-gradient(to right, ${couleurs.join(', ')})` }}>
        <input
          type="range"
          min={0}
          max={options.length - 1}
          step={1}
          value={index === -1 ? 0 : index}
          onChange={(e) => onChange(options[Number(e.target.value)])}
          className={`curseur-echelle-snosm${index === -1 ? ' curseur-echelle-snosm-vide' : ''}`}
          aria-label={label}
        />
      </div>
      <div className="graduation-echelle-snosm">
        {options.map((o, i) => (
          <button
            type="button"
            key={o}
            className={`graduation-echelle-snosm-item${i === index ? ' selectionnee' : ''}`}
            onClick={() => onChange(o)}
          >
            {i + 1}
          </button>
        ))}
      </div>
      <div className="valeur-echelle-snosm">{index === -1 ? '—' : options[index]}</div>
    </div>
  )
}

/** Choix multiple en bulles à vocabulaire fixe (contrairement à ChampTags, pas de saisie libre) — ex. « Matériel utilisé ». */
export function ChampCasesMultiples({ label, valeur, onChange, options }) {
  const valeurs = (valeur ?? '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean)
  const basculer = (o) => onChange((valeurs.includes(o) ? valeurs.filter((v) => v !== o) : [...valeurs, o]).join(', '))
  return (
    <div className="detail-fiche-edition detail-pleine-largeur">
      <span className="etiquette-detail-fiche">{label}</span>
      <div className="champ-bulles-snosm">
        {options.map((o) => (
          <button
            type="button"
            key={o}
            className={`bulle-snosm${valeurs.includes(o) ? ' selectionnee' : ''}`}
            onClick={() => basculer(o)}
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
 * dépliable manuellement à tout moment — et repliable à nouveau d'un clic sur
 * l'en-tête, même quand c'est `visible` (ex. l'activité) qui l'a ouvert au
 * départ : un clic sur l'en-tête prime toujours sur `visible` une fois que
 * l'utilisateur a explicitement choisi un état (ouvertManuel), jusqu'au
 * prochain clic. `optionsParDefaut`, si fourni, réduit la liste affichée tant
 * qu'on n'a pas cliqué « Voir toutes les options » — la liste complète
 * (`options`) reste toujours accessible d'un clic, rien n'est perdu, juste
 * replié par défaut pour ne pas encombrer l'écran. Choix en boutons « bulles »
 * (comme le vrai formulaire SNOSM, ex. « Météo sur place »), pas radio.
 */
export function ChampRepliable({ label, valeur, onChange, options, optionsParDefaut, visible }) {
  const [ouvertManuel, setOuvertManuel] = useState(null)
  const [toutAffiche, setToutAffiche] = useState(false)
  const estVisible = ouvertManuel ?? visible

  if (!estVisible) {
    return (
      <button type="button" className="bouton-repliable-snosm" onClick={() => setOuvertManuel(true)}>
        <span className="fleche-repliable-snosm">▸</span> {label}
      </button>
    )
  }

  const optionsAffichees = toutAffiche ? options : (optionsParDefaut ?? options)
  const reduit = !toutAffiche && optionsParDefaut && optionsParDefaut.length < options.length

  return (
    <div className="detail-fiche-edition detail-pleine-largeur">
      <button type="button" className="bouton-repliable-snosm" onClick={() => setOuvertManuel(false)}>
        <span className="fleche-repliable-snosm">▾</span> {label}
      </button>
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
          <button type="button" className="lien-voir-tout-snosm" onClick={() => setToutAffiche(true)}>
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
export function ChampTags({ label, valeur, onChange, options, pleineLargeur = false, maxSuggestions = 8 }) {
  const [texte, setTexte] = useState('')
  const [ouvert, setOuvert] = useState(false)
  const valeurs = (valeur ?? '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean)
  const filtre = texte.trim().toLowerCase()
  const suggestions = (filtre ? options.filter((o) => o.toLowerCase().includes(filtre)) : options)
    .filter((o) => !valeurs.some((v) => v.toLowerCase() === o.toLowerCase()))
    .slice(0, maxSuggestions)

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
    <div className={`detail-fiche-edition champ-tags-snosm${pleineLargeur ? ' detail-pleine-largeur' : ''}${classeVide(valeurs.length === 0)}`}>
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
    <div className={`detail-fiche-edition champ-autocomplete-snosm${classeVide(!valeur)}`}>
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
    <div className={`detail-fiche-edition${classeVide(!valeur)}`}>
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
  if (type === 'date') return <ChampDate label={label} valeur={valeur} onChange={onChange} icone={description.icone} />
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
        icones={description.icones}
      />
    )
  if (type === 'bulles')
    return <ChampBulles label={label} valeur={valeur} onChange={onChange} options={options} avecFleche={description.avecFleche} />
  if (type === 'cases-multiples') return <ChampCasesMultiples label={label} valeur={valeur} onChange={onChange} options={options} />
  if (type === 'echelle') return <ChampEchelle label={label} valeur={valeur} onChange={onChange} options={options} couleurs={description.couleurs} />
  if (type === 'texte-unite') return <ChampTexteUnite label={label} valeur={valeur} onChange={onChange} unite={description.unite} />
  if (type === 'orientation') return <ChampOrientation label={label} valeur={valeur} onChange={onChange} />
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
  if (type === 'tags')
    return (
      <ChampTags
        label={label}
        valeur={valeur}
        onChange={onChange}
        options={options}
        pleineLargeur={description.pleineLargeur}
        maxSuggestions={description.maxSuggestions}
      />
    )
  if (type === 'lecture') return <ChampLecture label={label} valeur={valeur} />
  if (type === 'personnel') return <ChampAutocomplete label={label} valeur={valeur} onChange={onChange} options={secouristes ?? []} />
  return <ChampTexte label={label} valeur={valeur} onChange={onChange} icone={description.icone} />
}
