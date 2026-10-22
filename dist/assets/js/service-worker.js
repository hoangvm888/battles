self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open("clickmart").then(function (cache) {
      return cache.addAll([
        "home.html",
        "index.html",
        "sign-in.html",
        "sign-up.html",
      ]);
    })
  );
});

self.addEventListener("fetch", function (event) {
  event.respondWith(
    caches.match(event.request).then(function (response) {
      return response || fetch(event.request);
    })
  );
});
