import { useEffect, useState } from 'react'

const DELAI_INACTIVITE_MS = 10 * 1000 // TEST TEMPORAIRE — remettre 5 * 60 * 1000
const DUREE_COMPTE_A_REBOURS_S = 15 // TEST TEMPORAIRE — remettre 30
const EVENEMENTS_ACTIVITE = ['mousemove', 'mousedown', 'keydown', 'wheel', 'touchstart']

/**
 * Garde-fou : consulter une autre section n'est pas censé durer — après 5
 * minutes sans la moindre activité (souris, clavier, molette, écran
 * tactile) alors qu'on regarde ailleurs que sa propre section, un compte à
 * rebours de 30s s'affiche ; sans réaction, retour automatique à sa
 * section. Toute activité pendant le compte à rebours l'annule et fait
 * repartir les 5 minutes à zéro.
 */
export default function GardeInactivite({ actif, nomSection, onExpiration }) {
  const [restant, setRestant] = useState(null) // null = pas de compte à rebours affiché

  useEffect(() => {
    if (!actif) {
      setRestant(null)
      return
    }
    let minuteurInactivite = null
    const surActivite = () => {
      setRestant(null)
      clearTimeout(minuteurInactivite)
      minuteurInactivite = setTimeout(() => setRestant(DUREE_COMPTE_A_REBOURS_S), DELAI_INACTIVITE_MS)
    }
    for (const e of EVENEMENTS_ACTIVITE) document.addEventListener(e, surActivite)
    surActivite()
    return () => {
      for (const e of EVENEMENTS_ACTIVITE) document.removeEventListener(e, surActivite)
      clearTimeout(minuteurInactivite)
    }
  }, [actif])

  useEffect(() => {
    if (restant == null) return
    if (restant === 0) {
      onExpiration()
      return
    }
    const t = setTimeout(() => setRestant((r) => (r == null ? null : r - 1)), 1000)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restant])

  if (restant == null) return null

  return (
    <div className="alerte-inactivite">
      <span>
        Inactivité : retour à <strong>{nomSection}</strong> dans {restant} s
      </span>
      <button type="button" onClick={() => setRestant(null)}>
        Rester ici
      </button>
    </div>
  )
}
