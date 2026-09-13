/**
 * Pictogrammes pour Type d'avalanche / Niveau de risque — inspirés du
 * document ANENA/EAWS fourni par l'utilisateur (icônes à côté de chaque
 * situation avalancheuse, échelle de danger en pyramides colorées). SVG
 * simple, `currentColor` pour les icônes descriptives (s'adaptent au thème et
 * à la sélection), couleurs fixes pour l'échelle de risque (convention de
 * sécurité, ne doit jamais changer avec le thème clair/sombre).
 */

function IconeNeigeFraiche() {
  return (
    <svg viewBox="0 0 32 32" width="22" height="22" className="icone-avalanche-snosm" aria-hidden="true">
      <path
        d="M9 18a5 5 0 0 1 -.6-9.96 6 6 0 0 1 11.4-1.2A5.5 5.5 0 0 1 23 18z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <g stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
        <path d="M11 22v4M11 22l-1.6 1.2M11 22l1.6 1.2" />
        <path d="M16 24v4M16 24l-1.6 1.2M16 24l1.6 1.2" />
        <path d="M21 22v4M21 22l-1.6 1.2M21 22l1.6 1.2" />
      </g>
    </svg>
  )
}

function IconeNeigeSoufflee() {
  return (
    <svg viewBox="0 0 32 32" width="22" height="22" className="icone-avalanche-snosm" aria-hidden="true">
      <path
        d="M6 12h13a3 3 0 1 0 -3 -3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M6 18h16a3 3 0 1 1 -3 3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path d="M4 25l6-4-6-1" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function IconeCoucheFragile() {
  return (
    <svg viewBox="0 0 32 32" width="22" height="22" className="icone-avalanche-snosm" aria-hidden="true">
      <path d="M4 26 24 8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M9 21 27 5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path
        d="M9 17.5 19 8.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeDasharray="1 3.2"
      />
      <path d="M12 15.5l4 1-1.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function IconeNeigeHumide() {
  return (
    <svg viewBox="0 0 32 32" width="22" height="22" className="icone-avalanche-snosm" aria-hidden="true">
      <circle cx="11" cy="9" r="4" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <g stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
        <path d="M11 2v1.6M11 14.4V16M4 9h1.6M16.4 9H18M6 4l1.2 1.2M14.8 12.8 16 14M6 14l1.2-1.2M14.8 5.2 16 4" />
      </g>
      <path
        d="M22 15c3 4 4 6.5 4 8.5a4 4 0 1 1 -8 0c0-2 1-4.5 4-8.5z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function IconeAvalancheGlissement() {
  return (
    <svg viewBox="0 0 32 32" width="22" height="22" className="icone-avalanche-snosm" aria-hidden="true">
      <path d="M3 27 25 6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M8 22 27 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path
        d="M8 18c2.5 0 4-1.5 6-3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeDasharray="0.5 3"
      />
      <path d="M11 20l4-4-1 5.4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export const ICONES_TYPE_AVALANCHE = {
  'neige fraiche': <IconeNeigeFraiche />,
  'neige soufflee (neige ventee)': <IconeNeigeSoufflee />,
  'neige ancienne(sous couche fragile persistante)': <IconeCoucheFragile />,
  'avalanche mouillee (neige humide)': <IconeNeigeHumide />,
  'avalanche de glissement (avalanche de fond)': <IconeAvalancheGlissement />,
}

/** Petite pyramide colorée — mêmes couleurs que l'échelle européenne de risque d'avalanche (1 à 5). */
function IconeNiveau({ couleur }) {
  return (
    <svg viewBox="0 0 32 32" width="20" height="20" className="icone-avalanche-snosm" aria-hidden="true">
      <path d="M16 6 28 26H4z" fill={couleur} stroke="var(--text-h)" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  )
}

export const ICONES_NIVEAU_RISQUE = {
  '1-FAIBLE': <IconeNiveau couleur="#4d7c0f" />,
  '2-LIMITE': <IconeNiveau couleur="#eab308" />,
  '3-MARQUE': <IconeNiveau couleur="#f97316" />,
  '4-FORT': <IconeNiveau couleur="#dc2626" />,
  '5-TRES FORT': <IconeNiveau couleur="#1a1a1a" />,
}
