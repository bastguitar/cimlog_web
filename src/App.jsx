import { useEffect, useState } from 'react'
import { BrowserRouter, NavLink, Route, Routes } from 'react-router-dom'
import Connexion from './components/Connexion'
import MainCourante from './pages/MainCourante'
import Synoptique from './pages/Synoptique'
import Registre from './pages/Registre'
import CarteIGN from './pages/CarteIGN'
import Stats from './pages/Stats'
import { deconnecter, posteConnecte } from './lib/session'
import { supabase } from './lib/supabase'
import './App.css'

export default function App() {
  const [poste, setPoste] = useState(undefined) // undefined = en cours de vérification
  const [erreurAuto, setErreurAuto] = useState(null)

  useEffect(() => {
    /*
     * Lien direct depuis le site de prise d'alerte (?access_token=...&
     * refresh_token=...) : reprend la session déjà ouverte là-bas plutôt que
     * de redemander le mot de passe — les deux sites partagent le même
     * projet Supabase, donc la même session y est valable. Retirés de la
     * barre d'adresse dès qu'on les a lus : ce sont des jetons de connexion,
     * ils n'ont rien à faire dans un lien qui traîne (historique, favoris…).
     */
    const params = new URLSearchParams(window.location.search)
    const accessToken = params.get('access_token')
    const refreshToken = params.get('refresh_token')

    if (accessToken && refreshToken) {
      const url = new URL(window.location.href)
      url.searchParams.delete('access_token')
      url.searchParams.delete('refresh_token')
      window.history.replaceState({}, '', url)

      supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken }).then(({ error }) => {
        if (error) {
          setErreurAuto('Lien de connexion invalide ou expiré.')
          setPoste(null)
          return
        }
        posteConnecte().then(setPoste).catch(() => setPoste(null))
      })
      return
    }

    posteConnecte()
      .then(setPoste)
      .catch(() => setPoste(null))
  }, [])

  if (poste === undefined) return null
  if (!poste) return <Connexion onConnecte={setPoste} erreurInitiale={erreurAuto} />

  return (
    <BrowserRouter>
      <div className="app">
        <header className="entete">
          <span className="nom-poste">{poste.nom}</span>
          <nav>
            <NavLink to="/" end>Main courante</NavLink>
            <NavLink to="/synoptique">Synoptique</NavLink>
            <NavLink to="/registre">Registre</NavLink>
            <NavLink to="/carte">Carte IGN</NavLink>
            <NavLink to="/stats">Stats</NavLink>
          </nav>
          <button
            type="button"
            className="bouton-deconnexion"
            onClick={() => deconnecter().then(() => setPoste(null))}
          >
            Déconnexion
          </button>
        </header>

        <main>
          <Routes>
            <Route path="/" element={<MainCourante poste={poste} />} />
            <Route path="/synoptique" element={<Synoptique poste={poste} />} />
            <Route path="/registre" element={<Registre />} />
            <Route path="/carte" element={<CarteIGN poste={poste} />} />
            <Route path="/stats" element={<Stats poste={poste} />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}
