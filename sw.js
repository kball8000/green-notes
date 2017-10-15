// Once done, update the javascript and JQuerygoogle doc.
var CACHE_NAME = 'green-kball-notes-v0.1.43';

// Clean up old caches, runs anytime sw.js file is modified.
self.addEventListener('activate', function(event){
  event.waitUntil(
    caches.keys().then( cacheNames => {
      return Promise.all(
        cacheNames.map( cacheName => {
          if (cacheName !== CACHE_NAME){
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// Returns file from cache for a fetch/GET request, not POST, as POST is not supported
// Helpful document: https://developers.google.com/web/fundamentals/primers/service-workers/
this.addEventListener('fetch', function(event) {  
  event.respondWith(
    caches.match(event.request).then(function(resp) {
      return resp || fetch(event.request).then(function(response) {
        return caches.open(CACHE_NAME).then(function(cache) {
          if (event.request.method === 'GET') {    // only difference from help doc above.
            cache.put(event.request, response.clone());
          }            
          return response;
        });  
      });
    })
  );
});