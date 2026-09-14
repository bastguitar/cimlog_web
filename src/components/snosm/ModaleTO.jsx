import { useState } from 'react'
import { construireModeleTO, telechargerTOModele, nomFichierTO } from '../../lib/telegrammeTO'

function ChampTO({ label, valeur, onChange, multiligne, pleineLargeur }) {
  return (
    <div className={`detail-fiche-edition${multiligne || pleineLargeur ? ' detail-pleine-largeur' : ''}`}>
      <span className="etiquette-detail-fiche">{label}</span>
      {multiligne ? (
        <textarea value={valeur ?? ''} onChange={(e) => onChange(e.target.value)} rows={2} />
      ) : (
        <input type="text" value={valeur ?? ''} onChange={(e) => onChange(e.target.value)} />
      )}
    </div>
  )
}

/**
 * TO éditable — prérempli depuis le vrai formulaire SNOSM (construireModeleTO), modifiable ici
 * juste avant validation. Ces retouches ne changent QUE le texte du PDF, jamais les champs SNOSM
 * d'origine (décision utilisateur) : le modèle édité est sauvegardé à part (snosm_to_texte) pour
 * pouvoir re-télécharger exactement le même PDF plus tard, sans repasser par cet écran.
 */
export default function ModaleTO({ fiche, sectionNom, onValide, onFermer }) {
  const [modele, setModele] = useState(() =>
    fiche.snosm_to_texte ? JSON.parse(fiche.snosm_to_texte) : construireModeleTO(fiche, { sectionNom })
  )
  const [enregistrement, setEnregistrement] = useState(false)
  const [erreur, setErreur] = useState(null)

  const majSection = (section, cle, valeur) => setModele((m) => ({ ...m, [section]: { ...m[section], [cle]: valeur } }))
  const majVictime = (i, cle, valeur) =>
    setModele((m) => ({ ...m, victimes: m.victimes.map((v, idx) => (idx === i ? { ...v, [cle]: valeur } : v)) }))

  async function valider() {
    setEnregistrement(true)
    setErreur(null)
    try {
      await onValide(modele)
      await telechargerTOModele(fiche, modele)
      onFermer()
    } catch (e) {
      setErreur(e.message)
    } finally {
      setEnregistrement(false)
    }
  }

  return (
    <div className="fond-modale" onClick={onFermer}>
      <div className="modale-fiche" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <header className="entete-modale">
          <h3>{nomFichierTO(fiche, modele)}</h3>
          <button type="button" className="fermer-modale" onClick={onFermer} aria-label="Fermer">
            ×
          </button>
        </header>
        <p className="aide">
          Relisez et corrigez le texte avant de valider — ces retouches ne modifient pas les données SNOSM enregistrées,
          seulement ce document.
        </p>
        {erreur && <p className="erreur">{erreur}</p>}

        <div className="section-fiche">
          <h4>En-tête</h4>
          <div className="grille-details-fiche">
            <ChampTO label="De" valeur={modele.entete.de} onChange={(v) => majSection('entete', 'de', v)} />
            <ChampTO label="À" valeur={modele.entete.a} onChange={(v) => majSection('entete', 'a', v)} />
            <ChampTO
              label="Pour information"
              valeur={modele.entete.pourInformation}
              onChange={(v) => majSection('entete', 'pourInformation', v)}
            />
            <ChampTO label="N° de texte" valeur={modele.entete.numeroTexte} onChange={(v) => majSection('entete', 'numeroTexte', v)} />
          </div>
        </div>

        <div className="section-fiche">
          <h4>1. Alerte</h4>
          <div className="grille-details-fiche">
            <ChampTO label="Origine" valeur={modele.alerte.origine} onChange={(v) => majSection('alerte', 'origine', v)} />
            <ChampTO label="Alerte" valeur={modele.alerte.alerteLe} onChange={(v) => majSection('alerte', 'alerteLe', v)} />
            <ChampTO label="Départ" valeur={modele.alerte.departLe} onChange={(v) => majSection('alerte', 'departLe', v)} />
            <ChampTO label="Sur les lieux" valeur={modele.alerte.surLesLieux} onChange={(v) => majSection('alerte', 'surLesLieux', v)} />
            <ChampTO
              label="Fin d’opération"
              valeur={modele.alerte.finOperation}
              onChange={(v) => majSection('alerte', 'finOperation', v)}
            />
          </div>
        </div>

        <div className="section-fiche">
          <h4>2. Localisation</h4>
          <div className="grille-details-fiche">
            <ChampTO
              label="Type de domaine"
              valeur={modele.localisation.typeDomaine}
              onChange={(v) => majSection('localisation', 'typeDomaine', v)}
            />
            <ChampTO
              label="Lieu précis"
              valeur={modele.localisation.lieuPrecis}
              onChange={(v) => majSection('localisation', 'lieuPrecis', v)}
            />
            <ChampTO label="Altitude" valeur={modele.localisation.altitude} onChange={(v) => majSection('localisation', 'altitude', v)} />
            <ChampTO label="Massif" valeur={modele.localisation.massif} onChange={(v) => majSection('localisation', 'massif', v)} />
            <ChampTO label="Commune" valeur={modele.localisation.commune} onChange={(v) => majSection('localisation', 'commune', v)} />
          </div>
        </div>

        <div className="section-fiche">
          <h4>3. Nature de l’opération</h4>
          <div className="grille-details-fiche">
            <ChampTO
              label="Nature de l’intervention"
              valeur={modele.natureOperation.natureIntervention}
              onChange={(v) => majSection('natureOperation', 'natureIntervention', v)}
            />
            <ChampTO
              label="Nature de l’activité"
              valeur={modele.natureOperation.natureActivite}
              onChange={(v) => majSection('natureOperation', 'natureActivite', v)}
            />
          </div>
        </div>

        <div className="section-fiche">
          <h4>4. Circonstances</h4>
          <div className="grille-details-fiche">
            <ChampTO
              label="Circonstances"
              valeur={modele.circonstances.circonstances}
              onChange={(v) => majSection('circonstances', 'circonstances', v)}
              multiligne
            />
          </div>
        </div>

        <div className="section-fiche">
          <h4>5. Moyens engagés</h4>
          <div className="grille-details-fiche">
            <ChampTO label="Opération" valeur={modele.moyens.operation} onChange={(v) => majSection('moyens', 'operation', v)} />
            <ChampTO
              label="Hélicoptère(s)"
              valeur={modele.moyens.helicopteres}
              onChange={(v) => majSection('moyens', 'helicopteres', v)}
            />
            <ChampTO label="PPSM(s)" valeur={modele.moyens.ppsm} onChange={(v) => majSection('moyens', 'ppsm', v)} />
            <ChampTO
              label="Effectif CRS engagé"
              valeur={modele.moyens.effectifEngage}
              onChange={(v) => majSection('moyens', 'effectifEngage', v)}
              pleineLargeur
            />
            <ChampTO
              label="Médicalisation"
              valeur={modele.moyens.medicalisation}
              onChange={(v) => majSection('moyens', 'medicalisation', v)}
            />
          </div>
        </div>

        <div className="section-fiche">
          <h4>6. Compte rendu d’opération</h4>
          <div className="grille-details-fiche">
            <ChampTO
              label="Geste(s) de secourisme"
              valeur={modele.compteRendu.gestesSecourisme}
              onChange={(v) => majSection('compteRendu', 'gestesSecourisme', v)}
              multiligne
            />
            <ChampTO
              label="Technique(s) d’évacuation"
              valeur={modele.compteRendu.techniquesEvacuation}
              onChange={(v) => majSection('compteRendu', 'techniquesEvacuation', v)}
              multiligne
            />
          </div>
        </div>

        <div className="section-fiche">
          <h4>7. Bilan</h4>
          <div className="grille-details-fiche">
            <ChampTO label="Disparu(s)" valeur={modele.bilan.disparus} onChange={(v) => majSection('bilan', 'disparus', v)} />
            <ChampTO label="Assisté(s)" valeur={modele.bilan.assistes} onChange={(v) => majSection('bilan', 'assistes', v)} />
            <ChampTO label="Blessé(s)" valeur={modele.bilan.blesses} onChange={(v) => majSection('bilan', 'blesses', v)} />
            <ChampTO label="Décédé(s)" valeur={modele.bilan.decedes} onChange={(v) => majSection('bilan', 'decedes', v)} />
          </div>
        </div>

        <div className="section-fiche">
          <h4>8. Identité des personnes secourues</h4>
          {modele.victimes.length === 0 && <p className="aide">Aucune victime enregistrée.</p>}
          {modele.victimes.map((v, i) => (
            <div className="grille-details-fiche" key={v.id ?? i} style={{ marginTop: i === 0 ? 0 : 10 }}>
              <ChampTO label="Statut" valeur={v.statut} onChange={(val) => majVictime(i, 'statut', val)} />
              <ChampTO label="Nom" valeur={v.nom} onChange={(val) => majVictime(i, 'nom', val)} />
              <ChampTO label="Prénom" valeur={v.prenom} onChange={(val) => majVictime(i, 'prenom', val)} />
              <ChampTO label="Sexe" valeur={v.sexe} onChange={(val) => majVictime(i, 'sexe', val)} />
              <ChampTO label="Date naissance" valeur={v.dateNaissance} onChange={(val) => majVictime(i, 'dateNaissance', val)} />
              <ChampTO label="Nationalité" valeur={v.nationalite} onChange={(val) => majVictime(i, 'nationalite', val)} />
              <ChampTO label="Téléphone" valeur={v.telephone} onChange={(val) => majVictime(i, 'telephone', val)} />
              <ChampTO label="État médical" valeur={v.etatMedical} onChange={(val) => majVictime(i, 'etatMedical', val)} />
              <ChampTO
                label="Circonstance"
                valeur={v.circonstance}
                onChange={(val) => majVictime(i, 'circonstance', val)}
                pleineLargeur
              />
              <ChampTO
                label="Nature des blessures"
                valeur={v.natureBlessures}
                onChange={(val) => majVictime(i, 'natureBlessures', val)}
                pleineLargeur
              />
              <ChampTO label="Destination" valeur={v.destination} onChange={(val) => majVictime(i, 'destination', val)} />
            </div>
          ))}
        </div>

        <div className="section-fiche">
          <h4>9. Procédure judiciaire</h4>
          <div className="grille-details-fiche">
            <ChampTO
              label="Suivi judiciaire"
              valeur={modele.judiciaire.suiviJudiciaire}
              onChange={(v) => majSection('judiciaire', 'suiviJudiciaire', v)}
            />
            <ChampTO
              label="Directeur d’enquête"
              valeur={modele.judiciaire.directeurEnquete}
              onChange={(v) => majSection('judiciaire', 'directeurEnquete', v)}
            />
          </div>
        </div>

        <div className="section-fiche">
          <h4>10. Autorités avisées et communication médias</h4>
          <div className="grille-details-fiche">
            <ChampTO
              label="Autorités avisées"
              valeur={modele.autorites.autoritesAvisees}
              onChange={(v) => majSection('autorites', 'autoritesAvisees', v)}
              multiligne
            />
            <ChampTO
              label="Médias informés"
              valeur={modele.autorites.mediasInformes}
              onChange={(v) => majSection('autorites', 'mediasInformes', v)}
            />
            <ChampTO
              label="Avis divers"
              valeur={modele.autorites.avisDivers}
              onChange={(v) => majSection('autorites', 'avisDivers', v)}
              multiligne
            />
          </div>
        </div>

        <div className="section-fiche">
          <h4>Stop et fin</h4>
          <div className="grille-details-fiche">
            <ChampTO
              label="Rédacteur"
              valeur={modele.finalisation.redacteur}
              onChange={(v) => majSection('finalisation', 'redacteur', v)}
            />
            <ChampTO
              label="Signataire"
              valeur={modele.finalisation.signataire}
              onChange={(v) => majSection('finalisation', 'signataire', v)}
            />
          </div>
        </div>

        <div className="actions-edition-fiche">
          <button type="button" className="bouton-secondaire" onClick={onFermer} disabled={enregistrement}>
            Annuler
          </button>
          <button type="button" className="bouton-principal" onClick={valider} disabled={enregistrement}>
            {enregistrement ? 'Validation…' : 'Valider et télécharger le PDF'}
          </button>
        </div>
      </div>
    </div>
  )
}
