/**
 * Couleur/libellé par statut de secours — même palette que l'appli
 * secouristes. Extrait de lib/mainCourante.js (supprimé avec la main
 * courante) : ce référentiel de statuts reste utile au Registre, à la
 * Carte IGN et à la fiche détail, qui n'ont rien à voir avec la main
 * courante elle-même.
 */
export const STATUTS = {
  brouillon: { libelle: 'Prise d’alerte', couleur: '#64748b' },
  en_cours: { libelle: 'En cours', couleur: '#16a34a' },
  terminee: { libelle: 'Terminée', couleur: '#dc2626' },
}
