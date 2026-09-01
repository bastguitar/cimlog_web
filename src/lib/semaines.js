/**
 * Semaines de service.
 *
 * Les CRS tiennent la ligne d'alerte par semaines entières, et la relève se
 * fait **le lundi à 8 h**. Une intervention prise le lundi à 3 h du matin
 * appartient donc à la semaine qui s'achève, pas à celle qui commence : c'est
 * l'équipe sortante qui l'a faite, et c'est dans son décompte qu'elle doit
 * figurer.
 *
 * Une semaine civile — lundi minuit à dimanche minuit — couperait au mauvais
 * endroit, et rangerait ces secours de nuit chez ceux qui dormaient encore.
 */

/** Heure de la relève, le lundi. */
const HEURE_RELEVE = 8

const JOURS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche']

/** Lundi 8 h de la semaine de service qui contient cette date. */
export function debutSemaine(date = new Date()) {
  const d = new Date(date)
  // getDay() met dimanche à 0 ; on veut lundi à 0.
  const rang = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - rang)
  d.setHours(HEURE_RELEVE, 0, 0, 0)

  // Lundi avant 8 h : la semaine de service est encore la précédente.
  if (date < d) d.setDate(d.getDate() - 7)
  return d
}

export function finSemaine(debut) {
  const f = new Date(debut)
  f.setDate(f.getDate() + 7)
  return f
}

export const semainePrecedente = (debut) => {
  const d = new Date(debut)
  d.setDate(d.getDate() - 7)
  return d
}

export const semaineSuivante = (debut) => {
  const d = new Date(debut)
  d.setDate(d.getDate() + 7)
  return d
}

/**
 * Numéro de semaine ISO. Les secours se font les semaines impaires : le numéro
 * est ce que les équipes emploient entre elles pour désigner leur tour.
 */
export function numeroSemaine(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  // Jeudi de la même semaine ISO : c'est lui qui donne l'année de référence.
  d.setUTCDate(d.getUTCDate() + 4 - ((d.getUTCDay() + 6) % 7))
  const premier = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil(((d - premier) / 86400000 + 1) / 7)
}

/** « 10 au 17 août » — sans répéter le mois quand c'est le même. */
export function libelleSemaine(debut) {
  const fin = finSemaine(debut)
  const memeMois = debut.getMonth() === fin.getMonth()
  const jour = (d, avecMois) =>
    d.toLocaleDateString('fr-FR', avecMois ? { day: 'numeric', month: 'long' } : { day: 'numeric' })
  return `${jour(debut, !memeMois)} au ${jour(fin, true)}`
}

/** « LUNDI 10 AOÛT » — le titre d'un jour, dans un listing continu. */
export function titreJournee(date) {
  return date
    .toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
    .toUpperCase()
}

/**
 * Range une liste d'interventions (déjà triée, la plus récente d'abord) en
 * semaines de service puis en jours, sans rien supposer de la période
 * couverte — contrairement à `repartirParJour`, qui ne connaît qu'une semaine
 * à la fois. Sert au listing annuel, où l'on veut des séparateurs plutôt qu'un
 * tableau à cases fixes.
 *
 * Chaque groupe porte son décompte : c'est ce qui évite de recompter à la main
 * combien de secours une semaine ou une journée a portés.
 */
export function regrouperParSemaine(secours, dateDe = (s) => new Date(s.created_at)) {
  const semaines = []

  for (const s of secours) {
    const quand = dateDe(s)
    const debut = debutSemaine(quand)
    const cle = debut.getTime()
    const jourCle = quand.toDateString()

    let semaine = semaines.at(-1)
    if (!semaine || semaine.cle !== cle) {
      semaine = { cle, debut, numero: numeroSemaine(debut), jours: [], total: 0 }
      semaines.push(semaine)
    }

    let jour = semaine.jours.at(-1)
    if (!jour || jour.cle !== jourCle) {
      jour = { cle: jourCle, date: quand, titre: titreJournee(quand), secours: [] }
      semaine.jours.push(jour)
    }

    jour.secours.push(s)
    semaine.total += 1
  }

  return semaines
}

/**
 * Les huit tranches d'une semaine de service.
 *
 * Huit et non sept : la semaine commence un lundi à 8 h et se termine le lundi
 * suivant à 8 h. Ce dernier lundi ne contient que la nuit, et il est signalé
 * comme tel — sans quoi deux lignes « LUNDI » se suivraient sans qu'on
 * comprenne pourquoi.
 */
export function joursDeLaSemaine(debut) {
  const jours = []
  for (let i = 0; i < 8; i++) {
    const d = new Date(debut)
    d.setDate(d.getDate() + i)
    d.setHours(0, 0, 0, 0)

    const depart = i === 0 ? new Date(debut) : d
    const arrivee = new Date(d)
    arrivee.setDate(arrivee.getDate() + 1)

    jours.push({
      cle: d.toISOString().slice(0, 10),
      debut: depart,
      fin: i === 7 ? finSemaine(debut) : arrivee,
      nom: JOURS[(d.getDay() + 6) % 7],
      date: d,
      // Le dernier lundi ne couvre que 0 h – 8 h.
      nuit: i === 7,
    })
  }
  return jours
}

/** « LUNDI 10 AOÛT », ou « LUNDI 17 AOÛT (nuit) » pour la dernière tranche. */
export function libelleJour(jour) {
  const date = jour.date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })
  return `${jour.nom} ${date}${jour.nuit ? ' (nuit)' : ''}`
}

/**
 * Range une liste d'interventions dans les tranches d'une semaine.
 *
 * Le classement se fait sur `created_at`, exactement le champ sur lequel la
 * semaine a été demandée à la base. Trier sur un autre — `alert_at`, qui peut
 * en différer de quelques secondes — ferait tomber une fiche hors de toutes les
 * tranches les jours de bascule, et elle disparaîtrait de l'écran sans que rien
 * ne le signale.
 */
export function repartirParJour(secours, debut) {
  const jours = joursDeLaSemaine(debut).map((j) => ({ ...j, secours: [] }))

  for (const s of secours ?? []) {
    const quand = new Date(s.created_at)
    const j = jours.find((x) => quand >= x.debut && quand < x.fin)
    if (j) j.secours.push(s)
  }

  // Du plus ancien au plus récent dans la journée : on relit sa garde dans
  // l'ordre où elle s'est déroulée.
  for (const j of jours) {
    j.secours.sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
  }
  return jours
}

/** Indice de la tranche contenant cette date, ou -1. */
export const indiceDuJour = (jours, date = new Date()) =>
  jours.findIndex((j) => date >= j.debut && date < j.fin)
