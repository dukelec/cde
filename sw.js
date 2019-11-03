/*
 * Software License Agreement (MIT License)
 *
 * Author: Duke Fong <d@d-l.io>
 */

// update file list by tool gen_sw.sh under tools/

var cache_name = 'cde-1.3';
var cache_files = [
    "/cde/",
    "/cde/img/icon.png",
    "/cde/manifest.json",
    "/cde/src/lang/lang.js",
    "/cde/src/utils/helper.js",
    "/cde/src/utils/idb.js",
    "/cde/src/app.js",
    "/cde/lib/pell/pell.css",
    "/cde/lib/pell/actions.js",
    "/cde/lib/pell/utilities.js",
    "/cde/lib/pell/pell.js",
    "/cde/lib/bulma.min.css",
    "/cde/lib/fontawesome.js",
    "/cde/lib/msgpack.min.js",
    "/cde/lib/base64js.min.js"
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
