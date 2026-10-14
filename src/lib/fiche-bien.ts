/* ═══ La ligne `biens` tirée du formulaire « Ajouter un bien » ═══════════
   V3.185 : sortie de FicheClient (saveBien) pour servir aussi aux annonces
   envoyées par le client. « Remplir la fiche » garde cette ligne sur
   l'annonce (annonces_client.fiche) ; « Retenir » la pose dans `biens`,
   exactement comme « Ajouter un bien » (AnnoncesClient).

   Sans client, recherche, étape ni retour : celui qui l'enregistre les
   ajoute. Rien ici ne lit ni n'écrit la base. */

/* Le prix acquéreur : le prix vendeur plus la commission (en % ou en €). */
export function prixAcquereurDe(f: Record<string, any>): number {
  const pv = parseFloat(f?.prix_vendeur) || 0;
  const cv = parseFloat(f?.commission_val) || 0;
  return f?.commission_type === 'pourcentage' ? Math.round(pv * (1 + cv / 100)) : pv + cv;
}

export function ligneBienDepuisFormulaire(f: Record<string, any>, photos: string[]): Record<string, unknown> {
  return {
    url: f.url || null,
    titre: f.titre,
    ville: f.ville,
    code_postal: f.code_postal,
    quartier: f.quartier || null,
    // V3.186 : les transports et l'environnement cités par l'annonce
    situation: String(f.situation || '').trim() || null,
    type_bien: f.type_bien,
    surface: parseFloat(f.surface) || null,
    surface_sejour: parseFloat(f.surface_sejour) || null,
    nb_pieces: parseInt(f.nb_pieces) || null,
    nb_chambres: parseInt(f.nb_chambres) || null,
    nb_salles_bain: parseInt(f.nb_salles_bain) || null,
    nb_wc: parseInt(f.nb_wc) || null,
    etage: f.etage !== '' && f.etage !== null && f.etage !== undefined ? parseInt(f.etage) : null,
    etage_total: parseInt(f.etage_total) || null,
    annee_construction: parseInt(f.annee_construction) || null,
    exposition: f.exposition || null,
    // DPE / GES
    dpe: f.dpe || null,
    dpe_conso: parseInt(f.dpe_conso) || null,
    ges: f.ges || null,
    ges_emissions: parseInt(f.ges_emissions) || null,
    chauffage: f.chauffage || null,
    source_energie: f.source_energie || null,
    chauffage_emetteurs: f.chauffage_emetteurs || null,
    // Caractéristiques booléennes
    parking: f.parking || false,
    balcon: f.balcon || false,
    terrasse: f.terrasse || false,
    jardin: f.jardin || false,
    cave: f.cave || false,
    ascenseur: f.ascenseur || false,
    gardien: f.gardien || false,
    cuisine_equipee: f.cuisine_equipee || false,
    climatisation: f.climatisation || false,
    traversant: f.traversant || false,
    // Surfaces annexes
    surface_balcon: parseFloat(f.surface_balcon) || null,
    surface_terrasse: parseFloat(f.surface_terrasse) || null,
    // État
    etat_general: f.etat_general || null,
    // Description et prix
    description: f.description,
    prix_vendeur: parseFloat(f.prix_vendeur) || null,
    commission_type: f.commission_type,
    commission_val: parseFloat(f.commission_val) || null,
    prix_acquereur: prixAcquereurDe(f) || null,
    charges_trimestrielles: parseInt(f.charges_trimestrielles) || null,
    charges_comprises: String(f.charges_comprises || '').trim() || null,
    taxe_fonciere: parseInt(f.taxe_fonciere) || null,
    // Photos et source
    photos,
    source_portail: f.source_portail,
    agence_nom: f.agence_nom,
    agence_tel: f.agence_tel || null,
  };
}
