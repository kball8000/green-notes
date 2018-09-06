// Once done, update the javascript and JQuerygoogle doc.
var CACHE_NAME = 'green-kball-notes-v0.1.46.1';

// added these manually since favicons are always strange and only cache 
// when they want to, so I am forcing them here.
let urlsToCache = [
  '/notes',
  '/css/green-notes.css',
  '/favicon.ico',
  '/images/favicon-16x16.png',
  '/images/favicon-32x32.png',
  '/js/controllers.js',
  '/js/filters.js',
  '/js/main.js',
  '/js/services.js',
  '/partials/login.html',
  '/partials/notes.html',
  '/partials/restore.html',
  '/partials/search.html'
]

self.addEventListener('install', function(event){
  // At the moment, this is just to cache favicons.
  event.waitUntil(
    caches.open(CACHE_NAME)
        .then(function(cache){
            return cache.addAll(urlsToCache);
        })
        .then(function(){
          return self.skipWaiting(); 
        })
    );
});

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