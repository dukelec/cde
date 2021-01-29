/*
 * Software License Agreement (MIT License)
 *
 * Author: Duke Fong <d@d-l.io>
 */

async function read_file(file) {
    return await new Promise((resolve, reject) => {
        let reader = new FileReader();

        reader.onload = () => {
            resolve(new Uint8Array(reader.result));
        };
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
    })
}

async function load_img(img, url) {
    let ret = -1;
    await new Promise(resolve => {
        img.src = url;
        img.onload = () => { ret = 0; resolve(); };
        img.onerror = () => { console.error(`load_img: ${url}`); resolve(); };
    });
    return ret;
}

function date2num() {
    let d = (new Date()).toLocaleString('en-GB');
    let s = d.split(/[^0-9]/);
    return `${s[2]}${s[1]}${s[0]}${s[4]}${s[5]}${s[6]}`;
}

async function sha256(dat) {
    const hashBuffer = await crypto.subtle.digest('SHA-256', dat);
    return new Uint8Array(hashBuffer);
}

async function aes256(dat, key, type='encrypt') {
    let iv = new Uint8Array(16); // zeros
    let _key = await crypto.subtle.importKey('raw', key, {name: 'AES-CBC'}, false, ['encrypt', 'decrypt']);

    if (type == 'encrypt')
        return new Uint8Array(await crypto.subtle.encrypt({name: 'AES-CBC', iv: iv}, _key, dat));
    else
        return new Uint8Array(await crypto.subtle.decrypt({name: 'AES-CBC', iv: iv}, _key, dat));
}

// decrypt the first block and trick the padding check
async function aes256_blk0_d(dat, key) {
    let iv = new Uint8Array(16); // zeros
    let _key = await crypto.subtle.importKey('raw', key, {name: 'AES-CBC'}, false, ['encrypt', 'decrypt']);

    let pad_dat = new Uint8Array(16);
    for (let i = 0; i < 16; i++)
        pad_dat[i] = 16; // PKCS#7
    let pad_tmp = new Uint8Array(await crypto.subtle.encrypt({name: 'AES-CBC', iv: dat}, _key, pad_dat));
    let pad = pad_tmp.slice(0, 16);
    let dat_pad = new Uint8Array([...dat, ...pad]);
    return new Uint8Array(await crypto.subtle.decrypt({name: 'AES-CBC', iv: iv}, _key, dat_pad));
}

function dat2hex(dat, join='') {
    const dat_array = Array.from(dat);
    return dat_array.map(b => b.toString(16).padStart(2, '0')).join(join);
}

function dat2str(dat) {
    return new TextDecoder().decode(dat);
}

function str2dat(str) {
    let encoder = new TextEncoder();
    return encoder.encode(str);
}

// list: ['x', 'y']
// map: {'rotation': 'r'}
function cpy(dst, src, list, map = {}) {
    for (let i of list) {
        if (i in src)
            dst[i] = src[i];
    }
    for (let i in map) {
        if (i in src)
            dst[map[i]] = src[i];
    }
}

function download_url(data, fileName) {
    var a;
    a = document.createElement('a');
    a.href = data;
    a.download = fileName;
    document.body.appendChild(a);
    a.style = 'display: none';
    a.click();
    a.remove();
};

function download(data, fileName='dat.bin', mimeType='application/octet-stream') {
    var blob, url;
    blob = new Blob([data], {type: mimeType});
    url = window.URL.createObjectURL(blob);
    download_url(url, fileName);
    setTimeout(function() { return window.URL.revokeObjectURL(url); }, 1000);
};

function escape_html(unsafe) {
    return unsafe
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
}

function readable_size(bytes, fixed=3, si=true) {
    var thresh = si ? 1000 : 1024;
    if(Math.abs(bytes) < thresh) {
        return bytes + ' B';
    }
    var units = si
        ? ['kB','MB','GB','TB','PB','EB','ZB','YB']
        : ['KiB','MiB','GiB','TiB','PiB','EiB','ZiB','YiB'];
    var u = -1;
    do {
        bytes /= thresh;
        ++u;
    } while(Math.abs(bytes) >= thresh && u < units.length - 1);
    return bytes.toFixed(fixed)+' '+units[u];
}

function walk(el, fn) {
    for (let i = 0, len = el.childNodes.length; i < len; i++) {
        let node = el.childNodes[i];
        if (node.nodeType === 3)
            fn(node);
        else if (node.nodeType === 1 && node.nodeName !== "SCRIPT")
            walk(node, fn);
    }
}

function linkable(el) {
    walk(el, function(n) {
        let replacementNode = document.createElement('span');
        let newHtml = anchorme(n.textContent);
        n.parentNode.insertBefore(replacementNode, n);
        n.parentNode.removeChild(n);
        replacementNode.outerHTML = newHtml;
    });
}

export {
    read_file, load_img, date2num,
    sha256, aes256, aes256_blk0_d,
    dat2hex, dat2str, str2dat,
    cpy,
    download,
    escape_html, readable_size,
    walk, linkable
};
