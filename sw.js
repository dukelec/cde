/*
 * Software License Agreement (MIT License)
 *
 * Author: Duke Fong <d@d-l.io>
 */

// update file list by tool gen_sw.sh under tools/

var cache_files = {
    "/img/icon/fontello.css" : "9143594ce27fc81648d345becdd74ba85cec2b2836908f12789d70e18e38174e",
    "/img/icon/fontello.woff2" : "c6f250032c14345783273890e92bb27611ffc2690afc851a138ac9fe2e275a44",
    "/img/icon.png" : "7160ad0053e77a16333b06123d567195777c67813dfe87d6c17e4df9d6f791b9",
    "/manifest.json" : "6dc026408ccd23b671ec0c205309d77e54f11081fc224c1f6fed66a8863adb97",
    "/src/lang/lang.js" : "50895d04d003497dad8d61cc4f30968322c12ff447b6565c27cab7521316e06e",
    "/src/utils/helper.js" : "d1c6a8b3488cf93a6e105151913da9d7f3d1ad32f844bf1670c698465ee47524",
    "/src/utils/idb.js" : "c277349bf34bdf1f8610a9d4cb0bcd6aadb5ae22300861cd87e9597ab597d796",
    "/src/app.js" : "1a53202e1fd0f12ded05ceec94841143dd9b44e97a8c1b04e0fdde47d3f8908e",
    "/src/layout.js" : "499146e59f087a5c5504c59f57d858a932153ccdc1ff3ac87ff11b475d31d476",
    "/lib/pell/pell.css" : "dd7012f74f875db0c7f6aa447ec86812914991e07cb8b32cd8db669b531f2e27",
    "/lib/pell/actions.js" : "2ad31c233702a0f9a5aa8cb9c66741b7aec7ae110a3dc94c22a2b8b867bc959a",
    "/lib/pell/utilities.js" : "73d5066c77258f034b604863824e1aa9b96304bbf36c906148def635300da60c",
    "/lib/pell/pell.js" : "b862bb1b70e255e886347fd49e1608965b62241ff2b110e812d8600dfcf84245",
    "/lib/bulma.min.css" : "0fd339cab543a859656bb9e510b0da6192295df1560f2b50b6257e4da1fa1752",
    "/lib/anchorme.min.js" : "87de70486f3fcaded74ac742724f8bf3cefd08b636323c90ee3619f35e958463",
    "/lib/msgpack.min.js" : "c670cb2d82b1285c0b12640ad52919f48ec8c268dd794446b57524ff45a74d1a",
    "/lib/base64js.min.js" : "f549a4c1d0eb4a6140081aea9c009cfff6fc2d0c289336d9e4542a03bf6281f5",
    "/" : "fac73b65b2d7fc1b85b708cf883d93402732e23018a86d44ea80346a17910e80"
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
    const sha = await sha256(await resp.arrayBuffer());
    return dat2hex(sha);
}

// fnv-1a, cheap synchronous hash to name the cache after the file list,
// so every build gets its own cache without bumping a version string by hand
function fnv1a(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16).padStart(8, '0');
}
var cache_name = `cde-${fnv1a(JSON.stringify(cache_files))}`;


// all or nothing: fetch and verify every file first, then write the cache,
// so the app never runs with files from different versions
async function cache_all(event) {
    let r = Math.random();
    console.log(`sw: cache add all, r: ${r}, cache: ${cache_name}`);
    let verified = {};
    for (let k in cache_files) {
        let response = await fetch(`${k}?r=${r}`, {cache: 'no-store'});
        if (!response.ok)
            throw new Error(`sw: ${k} http error: ${response.status}`);
        const sha = await resp_sha(response.clone());
        if (sha != cache_files[k])
            throw new Error(`sw: ${k} hash error: ${sha} != ${cache_files[k]}`);
        verified[k] = response;
    }
    let cache = await caches.open(cache_name);
    for (let k in verified)
        await cache.put(k, verified[k]);
    console.log('sw: cache add all finished');
}

async function handle_request(event) {
    let loc = new URL(event.request.url);
    let k = loc.pathname;

    let cache = await caches.open(cache_name);
    let response = await cache.match(loc.host == location.host ? k : event.request);
    if (response)
        return response;

    if (loc.host == location.host && (k in cache_files)) {
        let r = Math.random();
        response = await fetch(`${k}?r=${r}`, {cache: 'no-store'});
        const sha = await resp_sha(response.clone());
        if (sha == cache_files[k]) {
            console.log(`sw: add ${k} to cache`);
            await cache.put(k, response.clone());
        } else {
            console.warn(`sw: ${k} hash still error: ${sha} != ${cache_files[k]}`);
        }
    } else {
        if (loc.protocol == 'http:') {
            console.log(`sw: force https: ${loc.href}`)
            loc.protocol = 'https:';
            response = await fetch(loc);
        } else {
            console.log(`sw: fetch: ${event.request.url}`);
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
    // install fails if any file is missing or mismatched, the old version keeps running
    event.waitUntil(cache_all(event).then(() => self.skipWaiting()));
});

self.addEventListener('fetch', event => {
    event.respondWith(handle_request(event));
});

self.addEventListener('activate', event => {
    event.waitUntil(handle_activate(event));
    event.waitUntil(clients.claim());
});

