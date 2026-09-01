import { numeroSemaine, libelleSemaine } from '../lib/semaines'
import { SANS_MOYEN } from '../hooks/useFiltresRegistre'

/** Recherche libre + bouton « Filtres » — à placer dans la barre principale. */
export function ControlesFiltresRegistre({ f, placeholder = 'Recherche libre…' }) {
  return (
    <>
      <input
        className="recherche-mc"
        type="search"
        placeholder={placeholder}
        value={f.recherche}
        onChange={(e) => f.setRecherche(e.target.value)}
      />
      <button
        type="button"
        className={f.filtresOuverts || f.nombreFiltresActifs > 0 ? 'bouton-effectifs actif' : 'bouton-effectifs'}
        onClick={() => f.setFiltresOuverts((v) => !v)}
      >
        Filtres{f.nombreFiltresActifs > 0 ? ` (${f.nombreFiltresActifs})` : ''}
      </button>
    </>
  )
}

/** Panneau déroulant des filtres détaillés — repliable, affiché sous la barre principale. */
export function PanneauFiltresRegistre({ f }) {
  if (!f.filtresOuverts) return null

  return (
    <div className="barre-mc barre-filtres-registre">
      <select className="filtre-select-registre" value={f.filtres.semaine} onChange={(e) => f.majFiltre('semaine', e.target.value)}>
        <option value="">Toutes les semaines</option>
        {f.semainesAnnee.map((sem) => (
          <option key={sem.cle} value={sem.cle}>
            Semaine {numeroSemaine(sem.debut)} — {libelleSemaine(sem.debut)}
          </option>
        ))}
      </select>
      <input
        className="filtre-numero-mc"
        type="text"
        placeholder="N° secours…"
        value={f.filtres.numero}
        onChange={(e) => f.majFiltre('numero', e.target.value)}
      />
      <input
        className="recherche-mc filtre-commune-registre"
        type="text"
        placeholder="Commune…"
        value={f.filtres.commune}
        onChange={(e) => f.majFiltre('commune', e.target.value)}
      />
      <select
        className="filtre-select-registre"
        value={f.filtres.secouriste}
        onChange={(e) => f.majFiltre('secouriste', e.target.value)}
      >
        <option value="">Tous les secouristes</option>
        {f.secouristes.map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
      <select className="filtre-select-registre" value={f.filtres.moyen} onChange={(e) => f.majFiltre('moyen', e.target.value)}>
        <option value="">Tous les moyens</option>
        <option value={SANS_MOYEN}>Pas de moyen engagé</option>
        {f.moyens.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
      <select
        className="filtre-select-registre"
        value={f.filtres.activite}
        onChange={(e) => f.majFiltre('activite', e.target.value)}
      >
        <option value="">Toutes activités</option>
        {f.activites.map((a) => (
          <option key={a} value={a}>
            {a}
          </option>
        ))}
      </select>
      {f.nombreFiltresActifs > 0 && (
        <button type="button" className="bouton-reset-registre" onClick={f.resetFiltres}>
          Réinitialiser
        </button>
      )}
    </div>
  )
}
