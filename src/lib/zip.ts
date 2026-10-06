import { deflateRawSync } from 'node:zlib';

/* ═══ Une archive zip, sans dépendance (V3.97) ═════════════════════════════
   Pour le dépôt chez Jinka : un seul fichier (Annonces.csv), à la racine de
   l'archive, compressé (deflate). Le format zip le plus simple : un en-tête
   local par fichier, le répertoire central, la fin du répertoire. Serveur
   seulement (node:zlib). */

const TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
export function crc32(o: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < o.length; i++) c = TABLE[(c ^ o[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/* L'heure au format DOS, celle qu'on lit dans un zip. */
function dos(d: Date): { heure: number; jour: number } {
  return {
    heure: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    jour: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

export function zip(fichiers: { nom: string; contenu: Uint8Array }[], quand = new Date()): Buffer {
  const { heure, jour } = dos(quand);
  const locaux: Buffer[] = [];
  const centraux: Buffer[] = [];
  let decalage = 0;
  for (const f of fichiers) {
    const nom = Buffer.from(f.nom, 'utf8');
    const brut = Buffer.from(f.contenu);
    const comp = deflateRawSync(brut, { level: 9 });
    const crc = crc32(brut);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);           // version nécessaire
    local.writeUInt16LE(0, 6);            // drapeaux
    local.writeUInt16LE(8, 8);            // deflate
    local.writeUInt16LE(heure, 10);
    local.writeUInt16LE(jour, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(comp.length, 18);
    local.writeUInt32LE(brut.length, 22);
    local.writeUInt16LE(nom.length, 26);
    local.writeUInt16LE(0, 28);
    locaux.push(local, nom, comp);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);         // créé par
    central.writeUInt16LE(20, 6);         // version nécessaire
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(heure, 12);
    central.writeUInt16LE(jour, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(comp.length, 20);
    central.writeUInt32LE(brut.length, 24);
    central.writeUInt16LE(nom.length, 28);
    central.writeUInt16LE(0, 30);         // extra
    central.writeUInt16LE(0, 32);         // commentaire
    central.writeUInt16LE(0, 34);         // disque
    central.writeUInt16LE(0, 36);         // attributs internes
    central.writeUInt32LE(0, 38);         // attributs externes
    central.writeUInt32LE(decalage, 42);
    centraux.push(central, nom);
    decalage += local.length + nom.length + comp.length;
  }
  const rep = Buffer.concat(centraux);
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0);
  fin.writeUInt16LE(0, 4);
  fin.writeUInt16LE(0, 6);
  fin.writeUInt16LE(fichiers.length, 8);
  fin.writeUInt16LE(fichiers.length, 10);
  fin.writeUInt32LE(rep.length, 12);
  fin.writeUInt32LE(decalage, 16);
  fin.writeUInt16LE(0, 20);
  return Buffer.concat([...locaux, rep, fin]);
}
