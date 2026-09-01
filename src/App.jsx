import { useEffect, useState } from 'react'
import { BrowserRouter, NavLink, Route, Routes } from 'react-router-dom'
import Connexion from './components/Connexion'
import MainCourante from './pages/MainCourante'
import Synoptique from './pages/Synoptique'
import Registre from './pages/Registre'
import CarteIGN from './pages/CarteIGN'
import Stats from './pages/Stats'
import { deconnecter, posteConnecte } from './lib/session'
import './App.css'

export default function App() {
  const [poste, setPoste] = useState(undefined) // undefined = en cours de vérification

  useEffect(() => {
    posteConnecte()
      .then(setPoste)
      .catch(() => setPoste(null))
  }, [])

  if (poste === undefined) return null
  if (!poste) return <Connexion onConnecte={setPoste} />

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
            <Route path="/" element={<MainCourante />} />
            <Route path="/synoptique" element={<Synoptique />} />
            <Route path="/registre" element={<Registre />} />
            <Route path="/carte" element={<CarteIGN />} />
            <Route path="/stats" element={<Stats />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}
