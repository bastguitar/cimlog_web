/**
 * Coordonnées GPS en degrés décimaux « lat, lon » (6 décimales ≈ 10 cm), format envoyé au SNOSM
 * (colonne gps, varchar(50) chez Lars) et affiché sur le TO. Cim'Alerte pousse déjà du décimal
 * (CoordonneesGPS = "lat, lon") mais avec toute la précision du float ; un agent peut aussi coller
 * des degrés/minutes/secondes (45°40'12.3"N 6°23'45"E) ou des degrés/minutes décimales — tout est
 * ramené au même format. Même logique que gpsDecimal() dans supabase/functions/grist/index.ts.
 * Renvoie null si vide, le texte d'origine tel quel s'il n'est pas reconnu.
 */
export function gpsDecimal(brut) {
  const texte = String(brut ?? '').trim()
  if (!texte) return null
  // Cas courant (Cim'Alerte) : deux nombres décimaux séparés par une virgule, un point-virgule ou un espace.
  const simple = texte.match(/^(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)$/)
  if (simple) {
    const [lat, lon] = [Number(simple[1]), Number(simple[2])]
    return Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? `${lat.toFixed(6)}, ${lon.toFixed(6)}` : texte
  }
  // Une coordonnée : degrés [minutes [secondes]] [hémisphère], séparateurs °'" ′″ ou espaces.
  const motif = /([NSEOW])?\s*(-?\d+(?:[.,]\d+)?)\s*°?\s*(?:(\d+(?:[.,]\d+)?)\s*['′’]?\s*)?(?:(\d+(?:[.,]\d+)?)\s*(?:["″”]|'')?\s*)?([NSEOW])?/gi
  const valeurs = []
  for (const m of texte.matchAll(motif)) {
    if (!m[2]) continue
    const n = (x) => (x ? Number(x.replace(',', '.')) : 0)
    let v = Math.abs(n(m[2])) + n(m[3]) / 60 + n(m[4]) / 3600
    const hemi = (m[1] || m[5] || '').toUpperCase()
    if (m[2].startsWith('-') || hemi === 'S' || hemi === 'W' || hemi === 'O') v = -v
    valeurs.push(v)
    if (valeurs.length === 2) break
  }
  const [lat, lon] = valeurs
  if (valeurs.length !== 2 || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180)
    return texte
  return `${lat.toFixed(6)}, ${lon.toFixed(6)}`
}
