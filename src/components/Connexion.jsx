import { useEffect, useRef, useState } from 'react'
import { connecter, postesDeConnexion } from '../lib/session'

/**
 * Écran de connexion — mêmes comptes de poste que alerte_secours_web.
 *
 * `erreurInitiale` : la connexion automatique par lien (voir App.jsx) a
 * échoué avant même d'arriver ici — jeton expiré, par exemple. On retombe
 * sur ce formulaire, mais autant dire pourquoi plutôt que de laisser croire
 * à une simple visite normale.
 */
export default function Connexion({ onConnecte, erreurInitiale = null }) {
  const [postes, setPostes] = useState([])
  const [identifiant, setIdentifiant] = useState('')
  const [motDePasse, setMotDePasse] = useState('')
  const [erreur, setErreur] = useState(erreurInitiale)
  const [enCours, setEnCours] = useState(false)
  const champMdp = useRef(null)

  useEffect(() => {
    postesDeConnexion()
      .then(setPostes)
      .catch((e) => setErreur(e.message))
  }, [])

  async function valider(e) {
    e.preventDefault()
    setEnCours(true)
    setErreur(null)
    try {
      onConnecte(await connecter(identifiant, motDePasse))
    } catch (err) {
      setErreur(err.message)
      setMotDePasse('')
      champMdp.current?.focus()
    } finally {
      setEnCours(false)
    }
  }

  return (
    <div className="ecran-connexion">
      <form className="carte-connexion" onSubmit={valider}>
        <h1>Cim'Log</h1>
        <p className="aide-connexion">Suivi post-intervention</p>

        <label>
          <span>Poste</span>
          <select
            value={identifiant}
            onChange={(e) => setIdentifiant(e.target.value)}
            required
          >
            <option value="">Choisir…</option>
            {postes.map((p) => (
              <option key={p.identifiant} value={p.identifiant}>
                {p.nom}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>Mot de passe</span>
          <input
            ref={champMdp}
            type="password"
            value={motDePasse}
            onChange={(e) => setMotDePasse(e.target.value)}
            autoComplete="current-password"
            required
          />
        </label>

        {erreur && <p className="message-erreur">{erreur}</p>}

        <button type="submit" className="bouton-principal" disabled={enCours || !identifiant || !motDePasse}>
          {enCours ? 'Connexion…' : 'Se connecter'}
        </button>
      </form>
    </div>
  )
}
