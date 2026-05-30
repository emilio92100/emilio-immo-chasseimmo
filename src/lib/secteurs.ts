// Données et helpers partagés pour la sélection de secteurs de recherche.
// Utilisé par le formulaire de création (Clients.tsx) et d'édition (FicheClient.tsx).

export const QUARTIERS: Record<string, { ville: string; quartiers: string[] }> = {
  '75001': { ville: 'Paris 1er', quartiers: ['Saint-Germain-l\'Auxerrois', 'Les Halles', 'Palais Royal', 'Place Vendôme'] },
  '75006': { ville: 'Paris 6ème', quartiers: ['Saint-Germain-des-Prés', 'Luxembourg', 'Vavin', 'Notre-Dame-des-Champs', 'Saint-Sulpice'] },
  '75007': { ville: 'Paris 7ème', quartiers: ['Saint-Thomas-d\'Aquin', 'Invalides', 'École Militaire', 'Gros-Caillou', 'Tour Eiffel'] },
  '75008': { ville: 'Paris 8ème', quartiers: ['Champs-Élysées', 'Faubourg du Roule', 'Madeleine', 'Europe'] },
  '75015': { ville: 'Paris 15ème', quartiers: ['Grenelle', 'Javel', 'Saint-Lambert', 'Necker', 'Beaugrenelle', 'Convention', 'Commerce', 'Falguière', 'Brancion'] },
  '75016': { ville: 'Paris 16ème', quartiers: ['Auteuil', 'Muette', 'Porte Dauphine', 'Chaillot', 'Victor Hugo', 'Trocadéro'] },
  '75017': { ville: 'Paris 17ème', quartiers: ['Ternes', 'Plaine de Monceau', 'Batignolles', 'Epinettes'] },
  '92100': { ville: 'Boulogne-Billancourt', quartiers: ['Parchamp-Albert Kahn', 'Silly-Gallieni', 'Renault-Billancourt', 'Point-du-Jour', 'Vaillant-Marcel Sembat', 'Jean-Jaurès-Reine'] },
  '92200': { ville: 'Neuilly-sur-Seine', quartiers: ['Neuilly Centre', 'Bagatelle', 'Roule', 'Pont de Neuilly'] },
  '92300': { ville: 'Levallois-Perret', quartiers: ['Centre Levallois', 'Pont de Levallois', 'Victor Hugo'] },
  '92400': { ville: 'Courbevoie', quartiers: ['Becon', 'La Défense', 'Centre Courbevoie'] },
  '92500': { ville: 'Rueil-Malmaison', quartiers: ['Centre Rueil', 'Jonchères', 'Buzenval'] },
  '92600': { ville: 'Asnières-sur-Seine', quartiers: ['Centre Asnières', 'Bords de Seine'] },
  '92800': { ville: 'Puteaux', quartiers: ['Centre Puteaux', 'La Défense', 'Île de Puteaux'] },
};

export type CpSuggestion = { cp: string; ville: string };

// Recherche un code postal ou une ville : d'abord dans QUARTIERS (local),
// sinon via l'API officielle geo.api.gouv.fr.
export async function searchCommune(q: string): Promise<CpSuggestion[]> {
  if (q.trim().length < 2) return [];
  const local = Object.entries(QUARTIERS)
    .filter(([cp, info]) => cp.includes(q) || info.ville.toLowerCase().includes(q.toLowerCase()))
    .map(([cp, info]) => ({ cp, ville: info.ville }));
  if (local.length > 0) return local.slice(0, 6);

  try {
    const isCP = /^\d+$/.test(q.trim());
    const url = isCP
      ? `https://geo.api.gouv.fr/communes?codePostal=${encodeURIComponent(q.trim())}&fields=nom,codesPostaux&format=json`
      : `https://geo.api.gouv.fr/communes?nom=${encodeURIComponent(q.trim())}&fields=nom,codesPostaux&boost=population&limit=6&format=json`;
    const res = await fetch(url);
    const data = await res.json();
    return data
      .flatMap((d: any) => (d.codesPostaux || []).map((cp: string) => ({ cp, ville: d.nom })))
      .slice(0, 6);
  } catch {
    return [];
  }
}
