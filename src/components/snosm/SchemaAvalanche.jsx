/**
 * Schéma d'avalanche annoté — Longueur/Largeur cassure/Hauteur cassure/Largeur
 * dépôt se saisissent directement sur le dessin plutôt que dans une liste de
 * champs texte anonymes, à la manière des schémas pédagogiques d'anatomie
 * d'une avalanche (plaque de neige, point de rupture, dépôt). Champs texte
 * libre (voir CHAMPS_AVALANCHE_EVENEMENT dans FicheSnosm.jsx) : ce composant
 * n'est qu'une présentation alternative des 4 mêmes valeurs.
 */
export default function SchemaAvalanche({ valeurs, onChange, lecture = false }) {
  const champ = (cle, x, y, largeur = 74) => (
    <foreignObject x={x - largeur / 2} y={y - 13} width={largeur} height={26}>
      <input
        type="text"
        className="saisie-schema-avalanche"
        value={valeurs[cle] ?? ''}
        disabled={lecture}
        onChange={(e) => onChange(cle, e.target.value)}
      />
    </foreignObject>
  )

  return (
    <div className="schema-avalanche-snosm">
      <svg viewBox="0 0 420 520" role="img" aria-label="Schéma d'avalanche">
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
          Largeur cassure (m)
        </text>
        {champ('snosm_avalanche_largeur_cassure', 189, 84)}

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
          Hauteur cassure (cm)
        </text>
        {champ('snosm_avalanche_hauteur_cassure', 58, 133, 66)}

        {/* Longueur : flèche verticale le long de toute la trajectoire */}
        <line
          x1="380"
          y1="118"
          x2="380"
          y2="430"
          className="schema-avalanche-cote"
          markerStart="url(#fleche-avalanche)"
          markerEnd="url(#fleche-avalanche)"
        />
        <text x="410" y="274" className="schema-avalanche-legende" textAnchor="middle" transform="rotate(-90 410 274)">
          Longueur (m) — linéaire haut/bas
        </text>
        {champ('snosm_avalanche_longueur', 380, 274)}

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
          Largeur dépôt (cm)
        </text>
        {champ('snosm_avalanche_largeur_depot', 200, 490)}
      </svg>
    </div>
  )
}
