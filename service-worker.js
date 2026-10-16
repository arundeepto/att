// service-worker.js
const CACHE_NAME = "ihms-v2";
const ASSETS = [
  "index.html",
  "login.html",
  "register.html",
  "dashboard-patient.html",
  "dashboard-doctor.html",
  "dashboard-hospital.html",
  "dashboard-nurse.html",
  "dashboard-pharmacy.html",
  "dashboard-authority.html",
  "css/style.css",
  "js/firebase-config.js",
  "js/auth.js",
  "js/patient.js",
  "js/doctor.js",
  "js/hospital.js",
  "js/nurse.js",
  "js/pharmacy.js",
  "js/authority.js",
  "js/ai-scanner.js",
  "manifest.json"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS).catch(() => {}))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  if (!event.request.url.startsWith("http")) return;

  event.respondWith(
    fetch(event.request)
      .then(res => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});
