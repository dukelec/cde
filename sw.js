/*
 * Software License Agreement (MIT License)
 *
 * Author: Duke Fong <d@d-l.io>
 */

// update file list by tool gen_sw.sh under tools/

var cache_name = 'cde-1.18';
var cache_files = {
    "/cde/img/icon/fontello.css" : "9143594ce27fc81648d345becdd74ba85cec2b2836908f12789d70e18e38174e",
    "/cde/img/icon/fontello.woff2" : "c6f250032c14345783273890e92bb27611ffc2690afc851a138ac9fe2e275a44",
    "/cde/img/icon.png" : "7160ad0053e77a16333b06123d567195777c67813dfe87d6c17e4df9d6f791b9",
    "/cde/manifest.json" : "33f43fbf0e9077f7ef08b16b731b29b328c01e88289f5ed283d6038579d7e34a",
    "/cde/src/lang/lang.js" : "dfebd527a1c59df65abfcf25c51b4c946b7d702712e9b7d5e2f70f775ca06567",
    "/cde/src/utils/helper.js" : "6e16f8705d2d690ed26ffbc9bb852246ce689bb966756ea0f0fc0bf3aadc728f",
    "/cde/src/utils/idb.js" : "c277349bf34bdf1f8610a9d4cb0bcd6aadb5ae22300861cd87e9597ab597d796",
    "/cde/src/app.js" : "2b972f80dbae62b0517485471189769076725a36eece0eff454caaec7db0df2f",
    "/cde/lib/pell/pell.css" : "dd7012f74f875db0c7f6aa447ec86812914991e07cb8b32cd8db669b531f2e27",
    "/cde/lib/pell/actions.js" : "2ad31c233702a0f9a5aa8cb9c66741b7aec7ae110a3dc94c22a2b8b867bc959a",
    "/cde/lib/pell/utilities.js" : "73d5066c77258f034b604863824e1aa9b96304bbf36c906148def635300da60c",
    "/cde/lib/pell/pell.js" : "b862bb1b70e255e886347fd49e1608965b62241ff2b110e812d8600dfcf84245",
    "/cde/lib/bulma.min.css" : "0fd339cab543a859656bb9e510b0da6192295df1560f2b50b6257e4da1fa1752",
    "/cde/lib/anchorme.min.js" : "87de70486f3fcaded74ac742724f8bf3cefd08b636323c90ee3619f35e958463",
    "/cde/lib/msgpack.min.js" : "c670cb2d82b1285c0b12640ad52919f48ec8c268dd794446b57524ff45a74d1a",
    "/cde/lib/base64js.min.js" : "f549a4c1d0eb4a6140081aea9c009cfff6fc2d0c289336d9e4542a03bf6281f5",
    "/cde/" : "af6e92fd1abc668c6b50ec287f57df8edcd28dbb40f6f858c0d01cd89de8dcd8"
};


async function sha256(dat) {
    const hashBuffer = await crypto.subtle.digest('SHA-256', dat);
    return new Uint8Array(hashBuffer);
}

function dat2hex(dat, join='') {
    const dat_array = Array.from(dat);
    return dat_array.map(b => b.toString(16).padStart(2, '0')).join(join);
}

async function resp_sha(resp) {
    const reader = resp.body.getReader();
    let dat = new Uint8Array();
    while (true) {
        const ret = await reader.read();
        if (ret.value && ret.value.length)
            dat = new Uint8Array([ ...dat, ...ret.value ]);
        if (ret.done)
            break;
    }
    const sha = await sha256(dat);
    return dat2hex(sha);
}


async function cache_all(event) {
    let r = Math.random();
    console.log(`sw: cache add all, r: ${r}`);
    let cache = await caches.open(cache_name);
    for (let k in cache_files) {
        let response = await fetch(`${k}?r=${r}`, {cache: 'no-store'});
        const sha = await resp_sha(response.clone());
        if (sha == cache_files[k])
            cache.put(k, response);
        else
            console.warn(`sw: ${k} hash error: ${sha} != ${cache_files[k]}`);
    }
    console.log('sw: cache add all finished');
}

async function handle_request(event) {
    let loc = new URL(event.request.url);
    let k = loc.pathname;

    let cache = await caches.open(cache_name);
    let response = await cache.match(loc.host == location.host ? k : event.request);
    if (response)
        return response;

    if (k in cache_files) {
        let r = Math.random();
        response = await fetch(`${k}?r=${r}`, {cache: 'no-store'});
        const sha = await resp_sha(response.clone());
        if (sha == cache_files[k]) {
            console.log(`sw: add ${k} to cache`);
            cache.put(k, response.clone());
        } else {
            console.warn(`sw: ${k} hash still error: ${sha} != ${cache_files[k]}`);
        }
    } else {
        if (loc.protocol == 'http:') {
            console.log(`sw: force https: ${loc.href}`)
            loc.protocol = 'https:';
            response = await fetch(loc);
        } else {
            response = await fetch(event.request);
        }
    }
    return response;
}

async function handle_activate(event) {
    let c_keys = await caches.keys();
    for (let c of c_keys) {
        if (c != cache_name) {
            console.log(`sw: del: ${c}`);
            await caches.delete(c);
        } else {
            console.log(`sw: retain: ${c}`);
        }
    }
}


self.addEventListener('install', event => {
    event.waitUntil(cache_all(event));
    self.skipWaiting();
});

self.addEventListener('fetch', event => {
    event.respondWith(handle_request(event));
});

self.addEventListener('activate', event => {
    event.waitUntil(handle_activate(event));
    event.waitUntil(clients.claim());
});

