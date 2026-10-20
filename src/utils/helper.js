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
    let d = new Date();
    let p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
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
    let dat_pad = concat_dat(dat, pad);
    return new Uint8Array(await crypto.subtle.decrypt({name: 'AES-CBC', iv: iv}, _key, dat_pad));
}

// avoid [...a, ...b], which is very slow and memory hungry for large data
function concat_dat(...arrays) {
    let len = arrays.reduce((sum, a) => sum + a.length, 0);
    let ret = new Uint8Array(len);
    let pos = 0;
    for (let a of arrays) {
        ret.set(a, pos);
        pos += a.length;
    }
    return ret;
}

// accept standard and url-safe base64, tolerate whitespace, percent-encoding and missing padding
function b64_to_dat(str) {
    str = str.replace(/\s/g, '');
    if (str.includes('%'))
        str = decodeURIComponent(str);
    str = str.replace(/-/g, '+').replace(/_/g, '/');
    str += '='.repeat((4 - str.length % 4) % 4);
    return base64js.toByteArray(str);
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
    for (let node of [...el.childNodes]) { // copy, fn may replace node
        if (node.nodeType === 3)
            fn(node);
        else if (node.nodeType === 1 && !['SCRIPT', 'STYLE', 'A'].includes(node.nodeName))
            walk(node, fn);
    }
}

// build link nodes directly, never feed text back as html
function linkable(el) {
    walk(el, function(n) {
        let text = n.textContent;
        let links = anchorme.list(text).filter(l => l.isURL || l.isEmail);
        if (!links.length)
            return;
        let frag = document.createDocumentFragment();
        let pos = 0;
        for (let l of links) {
            frag.append(text.slice(pos, l.start));
            let a = document.createElement('a');
            if (l.isEmail)
                a.href = l.string.startsWith('mailto:') ? l.string : `mailto:${l.string}`;
            else
                a.href = l.protocol ? l.string : `http://${l.string}`;
            a.textContent = l.string;
            frag.append(a);
            pos = l.end;
        }
        frag.append(text.slice(pos));
        n.replaceWith(frag);
    });
}


const SAFE_TAGS = new Set([
    'a', 'abbr', 'audio', 'b', 'blockquote', 'br', 'caption', 'center', 'cite', 'code', 'col', 'colgroup',
    'dd', 'del', 'div', 'dl', 'dt', 'em', 'figcaption', 'figure', 'font', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'hr', 'i', 'img', 'ins', 'kbd', 'li', 'mark', 'ol', 'p', 'pre', 'q', 's', 'small', 'source', 'span',
    'strike', 'strong', 'sub', 'sup', 'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'tr', 'u', 'ul', 'video'
]);
// removed with their content, other unknown tags are unwrapped
const DROP_TAGS = new Set([
    'applet', 'base', 'button', 'embed', 'form', 'frame', 'frameset', 'head', 'iframe', 'input', 'link',
    'math', 'meta', 'noembed', 'noframes', 'noscript', 'object', 'option', 'script', 'select', 'style',
    'svg', 'template', 'textarea', 'title', 'xmp'
]);
const SAFE_ATTRS = new Set([
    'align', 'alt', 'color', 'colspan', 'controls', 'download', 'face', 'height', 'href', 'loop', 'muted',
    'poster', 'rowspan', 'size', 'src', 'start', 'style', 'title', 'type', 'width'
]);
const SAFE_PROTOCOLS = {
    href: ['http:', 'https:', 'mailto:', 'blob:', 'cde:'],
    src: ['http:', 'https:', 'blob:', 'cde:', 'data:'],
    poster: ['http:', 'https:', 'blob:', 'cde:', 'data:']
};

function safe_url(url, attr) {
    try {
        // parse like the browser does, e.g. "java\tscript:" becomes "javascript:"
        return SAFE_PROTOCOLS[attr].includes(new URL(url, document.baseURI).protocol);
    } catch (e) {
        return false;
    }
}

function sanitize_node(el) {
    for (let node of [...el.childNodes]) {
        if (node.nodeType === 3)
            continue;
        if (node.nodeType !== 1) { // comment etc.
            node.remove();
            continue;
        }
        let tag = node.nodeName.toLowerCase();
        if (!SAFE_TAGS.has(tag)) {
            if (DROP_TAGS.has(tag)) {
                node.remove();
            } else {
                sanitize_node(node);
                node.replaceWith(...node.childNodes);
            }
            continue;
        }
        for (let attr of [...node.attributes]) {
            let name = attr.name.toLowerCase();
            if (!SAFE_ATTRS.has(name) || (name in SAFE_PROTOCOLS && !safe_url(attr.value, name)))
                node.removeAttribute(attr.name);
        }
        // attached files must be downloaded, not opened in the app origin
        if (tag == 'a' && /^(blob|cde):/i.test(node.getAttribute('href')?.trim() || '') && !node.hasAttribute('download'))
            node.setAttribute('download', '');
        sanitize_node(node);
    }
}

// sanitize the body of a parsed document in place
function sanitize_doc(doc) {
    sanitize_node(doc.body);
    return doc;
}

export {
    read_file, load_img, date2num,
    sha256, aes256, aes256_blk0_d,
    concat_dat, b64_to_dat,
    dat2hex, dat2str, str2dat,
    cpy,
    download,
    escape_html, readable_size,
    walk, linkable, sanitize_doc
};
