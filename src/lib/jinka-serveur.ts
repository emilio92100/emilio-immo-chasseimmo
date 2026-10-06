import { createHash } from 'node:crypto';
import SftpClient from 'ssh2-sftp-client';
import type { BienVente } from '@/lib/biens-vente';
import { baseServeur, positionsBiens } from '@/lib/flux-site-serveur';
import { fichierPoliris, type FichierPoliris } from '@/lib/poliris';
import { zip } from '@/lib/zip';

/* ═══ Le dépôt chez Jinka (V3.97) ══════════════════════════════════════════
   Le fichier POLIRIS (lib/poliris.ts), en ISO-8859-1, seul dans un zip,
   déposé en SFTP sur le serveur de Jinka sous un nom temporaire, puis
   renommé (Jinka relève toutes les 5 minutes et ne doit jamais lire un
   fichier à moitié transféré).

   Les accès sont dans Vercel, jamais dans ce dépôt :
     JINKA_SFTP_HOTE, JINKA_SFTP_UTILISATEUR, JINKA_SFTP_MOT_DE_PASSE ;
     facultatifs : JINKA_SFTP_PORT (22), JINKA_SFTP_DOSSIER (la racine),
     JINKA_ZIP (le nom de l'archive, emilio-immo.zip).

   Un dépôt n'a lieu que si le fichier a changé depuis le dernier (son
   empreinte est gardée dans le bucket privé `mandats`, diffusion/jinka.json),
   sauf `forcer` (la nuit, par sécurité). Un fichier vide n'est jamais
   déposé : Jinka l'ignorerait, et ce serait sans doute une erreur. */

const BUCKET = 'mandats';
const ETAT = 'diffusion/jinka.json';

export type EtatJinka = { empreinte: string; le: string; annonces: number; ids: string[]; zip: string } | null;
export type ResultatJinka = {
  ok: boolean; erreur?: string;
  depose?: boolean; inchange?: boolean; vide?: boolean; attente?: 'codes';
  annonces: number; avertissements: string[]; etat: EtatJinka;
};

const acces = () => {
  const hote = process.env.JINKA_SFTP_HOTE?.trim();
  const utilisateur = process.env.JINKA_SFTP_UTILISATEUR?.trim();
  const motDePasse = process.env.JINKA_SFTP_MOT_DE_PASSE;
  if (!hote || !utilisateur || !motDePasse) return null;
  return {
    hote, utilisateur, motDePasse,
    port: Number(process.env.JINKA_SFTP_PORT || 22) || 22,
    dossier: (process.env.JINKA_SFTP_DOSSIER || '').trim().replace(/\/+$/, ''),
    zip: (process.env.JINKA_ZIP || 'emilio-immo.zip').trim(),
  };
};

export async function lireEtatJinka(sb = baseServeur()): Promise<EtatJinka> {
  const { data, error } = await sb.storage.from(BUCKET).download(ETAT);
  if (error || !data) return null;
  try { return JSON.parse(await data.text()) as EtatJinka; } catch { return null; }
}
async function garderEtat(sb: ReturnType<typeof baseServeur>, e: NonNullable<EtatJinka>) {
  const { error } = await sb.storage.from(BUCKET).upload(ETAT, Buffer.from(JSON.stringify(e)), { upsert: true, contentType: 'application/json' });
  if (error) console.error('[jinka] état non gardé :', error.message);
}

/* Le fichier du moment, à partir de la base. */
export async function preparerJinka(sb = baseServeur()): Promise<FichierPoliris & { octets: Buffer; empreinte: string }> {
  const { data, error } = await sb.from('biens_vente').select('*').eq('archive', false).not('donnees->diffusion', 'is', null);
  if (error) throw new Error(error.message);
  const biens = (data || []) as BienVente[];
  const gps = await positionsBiens(sb, biens);
  const f = fichierPoliris(biens, gps);
  const octets = Buffer.from(f.csv, 'latin1');
  return { ...f, octets, empreinte: createHash('sha256').update(octets).digest('hex') };
}

export async function deposerJinka(o: { forcer?: boolean } = {}): Promise<ResultatJinka> {
  const sb = baseServeur();
  const etat = await lireEtatJinka(sb);
  let f: Awaited<ReturnType<typeof preparerJinka>>;
  try { f = await preparerJinka(sb); } catch (e) {
    return { ok: false, erreur: `Les biens n’ont pas pu être lus (${(e as Error).message}).`, annonces: 0, avertissements: [], etat };
  }
  const base = { annonces: f.ids.length, avertissements: f.avertissements, etat };
  if (!f.ids.length) return { ok: true, vide: true, ...base };
  if (!o.forcer && etat?.empreinte === f.empreinte) return { ok: true, inchange: true, ...base };
  const a = acces();
  if (!a) return { ok: true, attente: 'codes', ...base };

  const sftp = new SftpClient('emilio-crm');
  const chemin = (n: string) => (a.dossier ? `${a.dossier}/${n}` : n);
  const final = chemin(a.zip);
  const temporaire = chemin(`${a.zip}.envoi`);
  try {
    await sftp.connect({ host: a.hote, port: a.port, username: a.utilisateur, password: a.motDePasse, readyTimeout: 20000, retries: 1 });
    await sftp.put(zip([{ nom: 'Annonces.csv', contenu: f.octets }]), temporaire);
    /* Remplacer d'un coup quand le serveur le sait (posix-rename), sinon
       retirer l'ancien puis renommer. */
    try { await sftp.posixRename(temporaire, final); } catch {
      if (await sftp.exists(final)) await sftp.delete(final);
      await sftp.rename(temporaire, final);
    }
  } catch (e) {
    return { ok: false, erreur: `Le dépôt chez Jinka n’a pas pu se faire (${(e as Error).message}).`, ...base };
  } finally {
    try { await sftp.end(); } catch { /* déjà fermé */ }
  }
  const nouveau = { empreinte: f.empreinte, le: new Date().toISOString(), annonces: f.ids.length, ids: f.ids, zip: a.zip };
  await garderEtat(sb, nouveau);
  return { ok: true, depose: true, annonces: f.ids.length, avertissements: f.avertissements, etat: nouveau };
}
