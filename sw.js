/*
 * Software License Agreement (MIT License)
 *
 * Author: Duke Fong <d@d-l.io>
 */

// update file list by tool gen_sw.sh under tools/

var cache_name = 'cde-1.6';
var cache_files = [
    "/",
    "/img/icon/fontello.css",
    "/img/icon/fontello.woff2",
    "/img/icon.png",
    "/manifest.json",
    "/src/lang/lang.js",
    "/src/utils/helper.js",
    "/src/utils/idb.js",
    "/src/app.js",
    "/lib/pell/pell.css",
    "/lib/pell/actions.js",
    "/lib/pell/utilities.js",
    "/lib/pell/pell.js",
    "/lib/bulma.min.css",
    "/lib/msgpack.min.js",
    "/lib/base64js.min.js"
];

self.addEventListener('install', function(event) {
    event.waitUntil(
        caches.open(cache_name).then(function(cache) {
            console.log('sw: cache addAll');
            return cache.addAll(cache_files);
        })
    );
    self.skipWaiting();
});

self.addEventListener('fetch', function(event) {
    event.respondWith(
        caches.open(cache_name).then(function(cache) {
            return cache.match(event.request).then(function(response) {
                return response || fetch(event.request).then(function(response) {
                    let url = event.request.url;
                    if (!url.includes('/cgi-bin/') && !url.includes('/upload/'))
                        cache.put(event.request, response.clone());
                    return response;
                });
            });
        })
    );
});

self.addEventListener('activate', function(event) {
    event.waitUntil(
        caches.keys().then(function(names) {
            return Promise.all(
                names.filter(function(name) {
                    // Return true if you want to remove this cache,
                    // but remember that caches are shared across
                    // the whole origin
                    if (cache_name == name) {
                        console.log(`sw: avoid rm: ${name}`);
                        return false;
                    } else {
                        console.log(`sw: remove: ${name}`);
                        return true;
                    }
                }).map(function(name) {
                    return caches.delete(name);
                })
            );
        })
    );
    event.waitUntil(clients.claim());
});
