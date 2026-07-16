// Service worker for the Cutout PDF editor.
//
// Strategy: network-first, cache-as-you-go. Rather than hand-maintaining an
// exhaustive precache list (this app pulls in pdf.js, fabric.js, Google
// Fonts, and two ESM packages from esm.sh — pdf-lib and
// @imgly/background-removal, the latter also lazily fetching its own
// WASM/ONNX model files only once actually used), every successful GET
// response is cached opportunistically as it's fetched. The next time the
// page loads without a network connection, whatever got cached on a prior
// online visit is served instead.
//
// Practical effect: open the app online once (and, ideally, paste an image
// at least once so the background-removal model gets cached too), and it
// keeps working offline after that — including opening/annotating/exporting
// PDFs, which don't depend on the AI model at all.
const CACHE_NAME = "cutout-pdf-editor-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return; // never intercept POST/etc.

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const responseCopy = response.clone();
        caches.open(CACHE_NAME)
          .then((cache) => cache.put(event.request, responseCopy))
          .catch(() => {}); // best-effort — never let a caching failure break the real response
        return response;
      })
      .catch(() =>
        caches.match(event.request).then((cached) => {
          if (cached) return cached;
          throw new Error("Offline and not previously cached: " + event.request.url);
        })
      )
  );
});
