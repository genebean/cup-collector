// Force-reload all open tabs when a new service worker activates.
// This runs inside the SW context (via importScripts), so it works even when
// the client page has stale JS that never registered a controllerchange
// listener. Without this, clients keep their in-memory JS after a SW update
// and send outdated server action hashes until they manually reload.
self.addEventListener("activate", (event) => {
  event.waitUntil(
    self.clients.claim().then(() =>
      self.clients
        .matchAll({ type: "window" })
        .then((windowClients) =>
          Promise.all(windowClients.map((client) => client.navigate(client.url)))
        )
    )
  );
});
