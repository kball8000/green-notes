// Once done, update the javascript and JQuerygoogle doc.
var CACHE_NAME = 'green-kball-notes-v0.1.37';

// HOW TO HANDLE POST REQUESTS WITH SERVICE WORKER

var urlsToCache = [
    '/',
    '/notes',
    '/restore',
    '/search',
    '/css/lib/angular-material.min.css',
    '/css/green-notes.css',
    '/favicon.ico',
    '/images/favicon-16x16.png',
    '/images/favicon-32x32.png',
    '/images/btn_google_signin_dark_disabled_web.png',
    '/images/btn_google_signin_dark_focus_web.png',
    '/images/btn_google_signin_dark_normal_web.png',
    '/images/btn_google_signin_dark_pressed_web.png',
    '/js/controllers.js',
    '/js/services.js',
    '/js/filters.js',
    '/js/main.js',
    '/js/lib/angular.min.js',
    '/js/lib/angular.min.js.map',
    '/js/lib/angular-animate.min.js',
    '/js/lib/angular-animate.min.js.map',
    '/js/lib/angular-aria.min.js',
    '/js/lib/angular-aria.min.js.map',
    '/js/lib/angular-material.min.js',
    '/js/lib/angular-messages.min.js',
    '/js/lib/angular-messages.min.js.map',
    '/js/lib/angular-route.min.js',
    '/js/lib/angular-route.min.js.map',
    '/js/lib/angular-sanitize.min.js',
    '/js/lib/angular-sanitize.min.js.map',
    '/partials/login.html',
    '/partials/notes.html',
    '/partials/restore.html',
    '/partials/search.html'
];

self.addEventListener('install', function(event){
  event.waitUntil(
    caches.open(CACHE_NAME)
        .then(function(cache){
            return cache.addAll(urlsToCache);
        })
        .then(function(){
          // combined with self.clients.claim(), this forces 'activate' to fire.
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
  return self.clients.claim();  // ???
});

// Returns file from cache for a fetch/GET request, not POST
self.addEventListener('fetch', function(event) {
  event.respondWith(
    caches.match(event.request)
      .then(function(response) {
        return response || fetch(event.request);
      })
  );
});
