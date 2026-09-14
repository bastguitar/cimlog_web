/**
 * Schéma d'avalanche annoté — Longueur du dépôt/Largeur cassure/Hauteur cassure/Largeur dépôt/Pente
 * se saisissent directement sur le dessin plutôt que dans une liste de champs texte anonymes, à la
 * manière des schémas pédagogiques d'anatomie d'une avalanche (plaque de neige, point de rupture,
 * dépôt). Champs texte libre (voir CHAMPS_SCHEMA_AVALANCHE dans FicheSnosm.jsx) : ce composant n'est
 * qu'une présentation alternative de ces 5 valeurs. L'unité est affichée dans la case elle-même
 * (décision utilisateur — plus pertinent qu'un libellé externe séparé).
 */
export default function SchemaAvalanche({ valeurs, onChange, lecture = false }) {
  const champ = (cle, x, y, largeur = 78, unite) => (
    <foreignObject x={x - largeur / 2} y={y - 13} width={largeur} height={26}>
      <div className="saisie-schema-avalanche-conteneur">
        <input
          type="text"
          className="saisie-schema-avalanche"
          value={valeurs[cle] ?? ''}
          disabled={lecture}
          onChange={(e) => onChange(cle, e.target.value)}
        />
        {unite && <span className="unite-schema-avalanche">{unite}</span>}
      </div>
    </foreignObject>
  )

  return (
    <div className="schema-avalanche-snosm">
      <svg viewBox="0 0 480 520" role="img" aria-label="Schéma d'avalanche">
        <defs>
          <marker id="fleche-avalanche" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" className="schema-avalanche-pointe" />
          </marker>
        </defs>

        {/* Plaque de neige restée en place, autour de la zone de départ */}
        <polygon points="30,110 300,45 390,65 130,140" className="schema-avalanche-plaque" />

        {/* Trajectoire de l'avalanche : départ étroit -> dépôt évasé */}
        <path
          d="M 70,120 C 40,220 55,320 60,430 L 340,430 C 320,320 300,220 310,120 C 240,150 140,150 70,120 Z"
          className="schema-avalanche-trajectoire"
        />

        {/* Ligne de cassure (point de rupture de la plaque) */}
        <path d="M 62,116 Q 120,100 190,122 Q 250,142 316,116" className="schema-avalanche-cassure" />
        <text x="190" y="106" className="schema-avalanche-legende" textAnchor="middle">
          Point de rupture
        </text>

        {/* Zone de dépôt, en bas de la trajectoire */}
        <path d="M 60,430 Q 200,460 340,430 L 340,438 Q 200,468 60,438 Z" className="schema-avalanche-depot" />
        <text x="200" y="453" className="schema-avalanche-legende" textAnchor="middle">
          Dépôt
        </text>

        {/* Largeur cassure : flèche horizontale au-dessus de la ligne de cassure */}
        <line
          x1="62"
          y1="70"
          x2="316"
          y2="70"
          className="schema-avalanche-cote"
          markerStart="url(#fleche-avalanche)"
          markerEnd="url(#fleche-avalanche)"
        />
        <text x="189" y="58" className="schema-avalanche-legende" textAnchor="middle">
          Largeur cassure
        </text>
        {champ('snosm_avalanche_largeur_cassure', 189, 84, 78, 'm')}

        {/* Hauteur cassure : flèche verticale courte contre le point de rupture */}
        <line
          x1="30"
          y1="116"
          x2="30"
          y2="150"
          className="schema-avalanche-cote"
          markerStart="url(#fleche-avalanche)"
          markerEnd="url(#fleche-avalanche)"
        />
        <text x="0" y="133" className="schema-avalanche-legende" textAnchor="middle" transform="rotate(-90 0 133)">
          Hauteur cassure
        </text>
        {champ('snosm_avalanche_hauteur_cassure', 58, 133, 70, 'cm')}

        {/* Pente : petit repère d'angle (perspective simplifiée) dans la marge libre en haut à droite */}
        <g transform="translate(430, 90)">
          <line x1="-20" y1="20" x2="20" y2="20" className="schema-avalanche-cote" />
          <line x1="-20" y1="20" x2="16" y2="-12" className="schema-avalanche-cote" />
          <path d="M -3 20 A 17 17 0 0 1 9 5" fill="none" className="schema-avalanche-cote" />
        </g>
        <text x="430" y="126" className="schema-avalanche-legende" textAnchor="middle">
          Pente
        </text>
        {champ('snosm_avalanche_pente', 430, 148, 60, '°')}

        {/* Longueur du dépôt : flèche verticale le long de toute la trajectoire, légende et case posées
            bien à l'intérieur du viewBox (auparavant collées au bord droit — coupées visuellement). */}
        <line
          x1="380"
          y1="118"
          x2="380"
          y2="430"
          className="schema-avalanche-cote"
          markerStart="url(#fleche-avalanche)"
          markerEnd="url(#fleche-avalanche)"
        />
        <text x="394" y="245" className="schema-avalanche-legende" textAnchor="start">
          <tspan x="394" dy="0">
            Longueur
          </tspan>
          <tspan x="394" dy="13">
            du dépôt
          </tspan>
        </text>
        {champ('snosm_avalanche_longueur', 420, 300, 78, 'm')}

        {/* Largeur dépôt : flèche horizontale sous la zone de dépôt */}
        <line
          x1="60"
          y1="490"
          x2="340"
          y2="490"
          className="schema-avalanche-cote"
          markerStart="url(#fleche-avalanche)"
          markerEnd="url(#fleche-avalanche)"
        />
        <text x="200" y="512" className="schema-avalanche-legende" textAnchor="middle">
          Largeur dépôt
        </text>
        {champ('snosm_avalanche_largeur_depot', 200, 490, 78, 'm')}
      </svg>
    </div>
  )
}
