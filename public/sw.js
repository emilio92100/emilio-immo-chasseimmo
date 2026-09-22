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
const ICONE = '/icone?t=192';

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

    await self.registration.showNotification(n.titre, {
      body: n.corps,
      icon: ICONE,
      badge: ICONE,
      lang: 'fr',
      /* Même étiquette pour tous : une deuxième notification remplace la
         première au lieu d'en empiler cinq. « renotify » fait quand même
         vibrer le téléphone. */
      tag: 'emilio-espace',
      renotify: true,
      data: { url: n.url },
      actions: [
        { action: 'ouvrir', title: 'Ouvrir' },
        { action: 'fermer', title: 'Plus tard' },
      ],
    });
  })());
});

/* ── le client tape sur la notification ───────────────────────── */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'fermer') return;

  const url = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil((async () => {
    /* Si son espace est déjà ouvert quelque part, on l'y ramène plutôt que
       d'ouvrir une deuxième fenêtre par-dessus. */
    const fenetres = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const f of fenetres) {
      if ('focus' in f) {
        try { if ('navigate' in f) await f.navigate(url); } catch (e) { /* peu importe */ }
        return f.focus();
      }
    }
    return self.clients.openWindow(url);
  })());
});
