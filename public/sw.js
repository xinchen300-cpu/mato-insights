// Vendly's service worker. It shows a notification when something needs a
// decision, keeps Vendly's own files on the phone so the app opens fast on a
// weak signal, and shows a page of its own when there is no connection at all.
// It never keeps a page with someone's data in it: those always come fresh.

// Raise when this file changes how it caches, so the old caches go.
const VERSION = "v2";
const STATIC_CACHE = `vendly-static-${VERSION}`;
const PAGE_CACHE = `vendly-pages-${VERSION}`;
const OFFLINE_URL = "/offline";
// Every deploy brings new file names; the oldest go once there are this many.
const STATIC_LIMIT = 300;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(PAGE_CACHE)
      .then((cache) => cache.add(new Request(OFFLINE_URL, { cache: "reload" })))
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // The page is asked for while this worker starts up, not after: no wait added to opening a page.
      if (self.registration.navigationPreload) await self.registration.navigationPreload.enable();
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key.startsWith("vendly-") && key !== STATIC_CACHE && key !== PAGE_CACHE).map((key) => caches.delete(key)));
      await self.clients.claim();
    })(),
  );
});

/** Files whose name changes with their content (Next's build output): kept as they are. */
function isBuildFile(url) {
  return url.pathname.startsWith("/_next/static/");
}

/** Vendly's own pictures and icons: shown from the phone, refreshed behind it. */
function isOwnPicture(url) {
  return url.pathname.startsWith("/pwa-icon/") || url.pathname.startsWith("/brand/") || url.pathname.startsWith("/machines/") || url.pathname === "/icon.svg";
}

async function trim(cache) {
  const keys = await cache.keys();
  for (const key of keys.slice(0, Math.max(0, keys.length - STATIC_LIMIT))) await cache.delete(key);
}

async function buildFile(request) {
  const cache = await caches.open(STATIC_CACHE);
  const kept = await cache.match(request);
  if (kept) return kept;
  const response = await fetch(request);
  // Only what the server says never changes: in development these files do.
  if (response.ok && (response.headers.get("cache-control") ?? "").includes("immutable")) {
    await cache.put(request, response.clone());
    trim(cache);
  }
  return response;
}

async function ownPicture(request) {
  const cache = await caches.open(STATIC_CACHE);
  const kept = await cache.match(request);
  const fresh = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => kept);
  return kept ?? fresh;
}

async function page(event) {
  try {
    return (await event.preloadResponse) ?? (await fetch(event.request));
  } catch {
    const offline = await caches.match(OFFLINE_URL);
    return offline ?? Response.error();
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  // Other sites (the database, photos in storage) are left to the browser.
  if (url.origin !== self.location.origin) return;
  if (request.mode === "navigate") return event.respondWith(page(event));
  if (isBuildFile(url)) return event.respondWith(buildFile(request));
  if (isOwnPicture(url)) return event.respondWith(ownPicture(request));
  // Everything else (data for a page, actions, the sales feed) goes straight to the server.
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data ? event.data.text() : "" };
  }

  const title = payload.title || "Vendly";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body || "",
      icon: "/pwa-icon/192",
      badge: "/pwa-icon/192",
      tag: payload.tag || "vendly",
      data: { url: payload.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";

  // Bring an open Vendly tab forward rather than opening another one.
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
