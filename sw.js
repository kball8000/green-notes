var CACHE_NAME = 'green-kball-notes-v0.1.43';

// var urlsToCache = ['/', '/notes'];

// this.addEventListener('install', function(event){
//     event.waitUntil(
//     caches.open(CACHE_NAME)
//         .then(function(cache){
//             return cache.addAll(urlsToCache);
//         })
//         .then(function(){
//           return self.skipWaiting(); 
//         })
//     );
// });


// Clean up old caches, runs anytime sw.js file is modified.
// self.addEventListener('activate', function(event){
this.addEventListener('activate', function(event){
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

this.addEventListener('fetch', function(event) {
  // let _nonCacheableUrls = ['getuser'];
  // let nonCacheableUrls = _nonCacheableUrls.map(url => this.location.origin + '/' + url);

  // if (!nonCacheableUrls.includes(event.request.url)) {
    event.respondWith(
      caches.match(event.request).then(function(resp) {
        return resp || fetch(event.request).then(function(response) {
          return caches.open(CACHE_NAME).then(function(cache) {
            console.log('event: ', event);
            if (event && event.request.method === 'GET') {
              cache.put(event.request, response.clone());
            }            
            return response;
          });  
        });
      })
    );
  // }
});
