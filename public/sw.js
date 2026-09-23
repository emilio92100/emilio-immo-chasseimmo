/**
 * Le petit programme qui veille quand l'espace est fermé.
 *
 * Il tourne dans le téléphone du client, même application fermée. Il fait
 * deux choses, et rien d'autre :
 *   — afficher la notification quand un bien arrive ;
 *   — ouvrir l'espace sur le bon bien quand le client tape dessus.
 *
 * Le signal envoyé par le serveur ne contient pas de texte (voir
 * src/lib/push.ts). C'est donc ce fichier qui va chercher quoi dire, juste
 * avant de l'afficher : le message est ainsi toujours à jour.
 */

const CONTENU = '/api/espace/push/contenu';

/* Deux images, et surtout pas la même.
     ICONE      la grande, à droite quand on déroule la notification. En couleur.
     SILHOUETTE la minuscule, en haut dans la barre d'état. Android n'en garde
                que la forme : il jette les couleurs et remplit ce qui n'est pas
                transparent. Lui donner l'icône dorée pleine donnait un carré
                blanc — la silhouette d'un carré plein, c'est un carré. */
const ICONE = '/icone?t=192';
const SILHOUETTE = '/icone?t=96&mono=1';

/* Une nouvelle version remplace l'ancienne tout de suite, sans attendre que
   le client ferme tous ses onglets. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

/* ── l'arrivée d'une notification ─────────────────────────────── */
self.addEventListener('push', (event) => {
  event.waitUntil((async () => {
    /* Le repli, si le réseau ne répond pas : on ne peut pas ne rien afficher
       (le navigateur mettrait un message générique à notre place), alors on
       reste vague mais honnête. */
    let n = {
      titre: 'Votre espace a du nouveau',
      corps: 'Ouvrez votre espace pour le découvrir.',
      url: '/',
      pastille: 0,
    };

    try {
      const abonnement = await self.registration.pushManager.getSubscription();
      if (abonnement) {
        const r = await fetch(CONTENU, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: abonnement.endpoint }),
        });
        if (r.ok) {
          const d = await r.json();
          if (d && d.titre) n = d;
        }
      }
    } catch (e) { /* on affichera le repli */ }

    /* Le petit chiffre sur l'icône. Il tombe tout seul à zéro quand le client
       a ouvert ses biens : c'est le serveur qui compte, pas nous. */
    try {
      if (typeof n.pastille === 'number' && self.navigator) {
        if (n.pastille > 0 && self.navigator.setAppBadge) await self.navigator.setAppBadge(n.pastille);
        else if (self.navigator.clearAppBadge) await self.navigator.clearAppBadge();
      }
    } catch (e) { /* tous les téléphones ne savent pas le faire */ }

    /* Si l'espace est ouvert quelque part — au premier plan ou en veille
       derrière une autre application — on le prévient : il se remettra à jour
       tout seul, et le client ne trouvera jamais un écran qui dément la
       notification qu'il vient de lire. */
    try {
      const fenetres = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const f of fenetres) f.postMessage({ type: 'emilio-nouveau' });
    } catch (e) { /* sans effet sur la notification */ }

    await self.registration.showNotification(n.titre, {
      body: n.corps,
      icon: ICONE,
      badge: SILHOUETTE,
      lang: 'fr',
      /* Même étiquette pour tous : une deuxième notification remplace la
         première au lieu d'en empiler cinq. « renotify » fait quand même
         vibrer le téléphone. */
      tag: 'emilio-espace',
      renotify: true,
      /* Une vibration courte. Ce n'est pas qu'un confort : sur Android, une
         notification qui vibre a bien plus de chances d'être affichée en
         bandeau sur l'écran plutôt que rangée en silence dans le tiroir. */
      silent: false,
      vibrate: [120, 60, 120],
      data: { url: n.url },
      actions: [
        { action: 'ouvrir', title: 'Ouvrir' },
        { action: 'fermer', title: 'Plus tard' },
      ],
    });
  })());
});

/* ── le client tape sur la notification ───────────────────────── */
/* Trois choses comptent ici, et chacune a sa raison :
     — on lit l'adresse AVANT de fermer la notification : une fois fermée, ses
       données ne sont plus garanties ;
     — on ramène au premier plan une fenêtre déjà ouverte plutôt que d'en
       empiler une deuxième ;
     — et si quoi que ce soit échoue, on ouvre quand même quelque chose. Un
       client qui tape sur « Ouvrir » et ne voit rien bouger perd confiance
       dans la notification suivante. */
self.addEventListener('notificationclick', (event) => {
  const donnees = event.notification.data || {};
  const action = event.action;
  event.notification.close();
  if (action === 'fermer') return;

  /* Toujours une adresse complète : un chemin relatif se résout mal selon
     d'où le téléphone réveille le veilleur. */
  let cible;
  try { cible = new URL(donnees.url || '/', self.location.origin).href; }
  catch (e) { cible = self.location.origin + '/'; }

  event.waitUntil((async () => {
    let fenetres = [];
    try { fenetres = await self.clients.matchAll({ type: 'window', includeUncontrolled: true }); }
    catch (e) { /* on ouvrira une fenêtre neuve */ }

    for (const f of fenetres) {
      if (!f.url || f.url.indexOf(self.location.origin) !== 0) continue;
      /* Le premier plan d'abord : c'est le geste que le client attend. La
         navigation ensuite, et si elle échoue il est au moins dans son espace
         plutôt que devant un écran qui n'a pas bougé. */
      try { await f.focus(); } catch (e) { /* on tente quand même la suite */ }
      if (f.url !== cible) {
        try { if (typeof f.navigate === 'function') await f.navigate(cible); } catch (e) { /* sans effet */ }
      }
      return;
    }

    try { await self.clients.openWindow(cible); }
    catch (e) {
      /* Dernier recours : la racine de l'espace, qui elle ouvrira toujours. */
      try { await self.clients.openWindow(self.location.origin + '/'); } catch (e2) { /* rien à faire */ }
    }
  })());
});
