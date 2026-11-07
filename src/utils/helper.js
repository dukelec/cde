/*
 * Software License Agreement (MIT License)
 *
 * Author: Duke Fong <d@d-l.io>
 */

import { Marked } from '../../lib/marked.esm.js';
import hljs from '../../lib/highlight/highlight.min.js';

const marked = new Marked({
    breaks: true,
    renderer: {
        // <input> is dropped by the sanitizer, show task list items as text
        checkbox: ({ checked }) => checked ? '☑ ' : '☐ ',
        code({ text, lang }) {
            let language = (lang || '').trim().split(/\s/)[0];
            if (!language || !hljs.getLanguage(language))
                return false; // default renderer
            let html = hljs.highlight(text, { language, ignoreIllegals: true }).value;
            return `<pre><code class="hljs language-${escape_html(language)}">${html}</code></pre>\n`;
        }
    }
});

// output is not sanitized
function md2html(src) {
    return marked.parse(src);
}

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
    let dat_pad = concat_dat([dat, pad]);
    return new Uint8Array(await crypto.subtle.decrypt({name: 'AES-CBC', iv: iv}, _key, dat_pad));
}

// avoid [...a, ...b], which is very slow and memory hungry for large data
// arrays: a list, not spread arguments, which may exceed the argument limit for many chunks
function concat_dat(arrays) {
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

// text: string or Promise<string>, must be called synchronously in the user gesture
async function copy_text(text) {
    const text_p = Promise.resolve(text);
    // ClipboardItem with a promise keeps the user gesture across async work (needed by safari)
    if (window.ClipboardItem && navigator.clipboard?.write) {
        try {
            const blob_p = text_p.then(text => new Blob([text], {type: 'text/plain'}));
            await navigator.clipboard.write([new ClipboardItem({'text/plain': blob_p})]);
            return true;
        } catch (e) {
            console.log('clipboard.write err:', e);
        }
    }
    text = await text_p;
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch (e) {
        console.log('clipboard.writeText err:', e);
    }
    // fallback for webview without clipboard api
    let ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style = 'position: fixed; top: 0; left: 0; opacity: 0;';
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length); // ios
    let ok = false;
    try {
        ok = document.execCommand('copy');
    } catch (e) {
        console.log('execCommand copy err:', e);
    }
    ta.remove();
    return ok;
}

function select_text(elem) {
    let range = document.createRange();
    range.selectNodeContents(elem);
    let sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
}

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
// only highlight.js classes, e.g. "hljs-title class_"
const SAFE_CLASS = /^(hljs(-[\w-]+)?|language-[\w+#.-]+|[a-z]+_+)$/;
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
            if (name == 'class') {
                let cls = attr.value.split(/\s+/).filter(c => SAFE_CLASS.test(c)).join(' ');
                if (cls)
                    node.setAttribute(attr.name, cls);
                else
                    node.removeAttribute(attr.name);
            } else if (!SAFE_ATTRS.has(name) || (name in SAFE_PROTOCOLS && !safe_url(attr.value, name)))
                node.removeAttribute(attr.name);
            else if (name == 'style' && /url\s*\(|expression\s*\(|@import|behavior\s*:/i.test(attr.value))
                node.removeAttribute(attr.name); // no external resource loading from css
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


const BLOCK_TAGS = new Set([
    'ADDRESS', 'ARTICLE', 'ASIDE', 'BLOCKQUOTE', 'CAPTION', 'DD', 'DIV', 'DL', 'DT', 'FIGCAPTION', 'FIGURE',
    'FOOTER', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'HEADER', 'HR', 'LI', 'MAIN', 'NAV', 'OL', 'P', 'PRE',
    'SECTION', 'TABLE', 'TBODY', 'TD', 'TFOOT', 'TH', 'THEAD', 'TR', 'UL'
]);
const MEDIA_TAGS = new Set(['IMG', 'VIDEO', 'AUDIO']);
const is_block = n => n.nodeType === 1 && BLOCK_TAGS.has(n.nodeName);

// lines as displayed: one per block or <br>, empty lines kept, a trailing <br> is only a placeholder
// line: array of strings and media nodes, other formatting is dropped
function to_lines(nodes) {
    let lines = [];
    let cur = null;
    let add = x => (cur ??= []).push(x);
    let br = () => { lines.push(cur || []); cur = null; };
    let end_line = () => { if (cur) lines.push(cur); cur = null; };
    let walk = (n, pre) => {
        if (n.nodeType === 3) {
            let t = n.data;
            if (!pre) { // collapse like the browser does, nbsp is kept (code indentation)
                t = t.replace(/[ \t\r\n]+/g, ' ');
                if (!cur)
                    t = t.replace(/^ /, '');
            }
            t = t.replace(/\u00a0/g, ' ');
            t.split('\n').forEach((s, i) => {
                if (i)
                    br();
                if (s)
                    add(s);
            });
        } else if (n.nodeType === 1) {
            if (n.nodeName === 'BR')
                return br();
            if (MEDIA_TAGS.has(n.nodeName))
                return add(n);
            let blk = is_block(n);
            if (blk)
                end_line();
            for (let c of n.childNodes)
                walk(c, pre || n.nodeName === 'PRE');
            if (blk)
                end_line();
        }
    };
    for (let n of nodes)
        walk(n, false);
    end_line();
    return lines;
}

// replace the blocks touched by the selection with one <pre>
// execCommand formatBlock drops empty lines, and insertHTML merges the following paragraph
function code_block(root) {
    let sel = getSelection();
    if (!sel.rangeCount)
        return false;
    let range = sel.getRangeAt(0);
    if (!root.contains(range.commonAncestorContainer))
        return false;

    let top = range.commonAncestorContainer;
    while (top != root && !is_block(top))
        top = top.parentNode;
    let nodes;
    if (top != root && ![...top.children].some(is_block)) {
        // within one paragraph, keep list items and table cells
        nodes = /^(LI|DT|DD|TD|TH|CAPTION)$/.test(top.nodeName) ? [...top.childNodes] : [top];
        if (!nodes.length) {
            nodes = [document.createElement('br')];
            top.append(nodes[0]);
        }
    } else {
        let child_of = (n, offset, is_end) => {
            if (n == top)
                return top.childNodes[is_end ? offset - 1 : offset];
            while (n.parentNode != top)
                n = n.parentNode;
            return n;
        };
        let a = child_of(range.startContainer, range.startOffset, false);
        let b = child_of(range.endContainer, range.endOffset, true);
        if (!a || !b)
            return false;
        // selection ends at the start of b, e.g. triple click
        let r = document.createRange();
        r.setStart(b, 0);
        r.setEnd(range.endContainer, range.endOffset);
        if (b != a && !r.toString() && !r.cloneContents().querySelector('img, video, audio, br'))
            b = b.previousSibling;
        nodes = [];
        for (let n = a; n; n = n.nextSibling) {
            nodes.push(n);
            if (n == b)
                break;
        }
    }
    // lists and tables are replaced as a whole
    while (nodes[0].parentNode != root && /^(UL|OL|DL|TABLE|THEAD|TBODY|TFOOT|TR)$/.test(nodes[0].parentNode.nodeName))
        nodes = [nodes[0].parentNode];

    let lines = to_lines(nodes);
    let pre = document.createElement('pre');
    nodes[0].before(pre);
    for (let n of nodes)
        n.remove();
    lines.forEach((l, i) => {
        if (i)
            pre.append(document.createElement('br'));
        pre.append(...l);
    });
    if (!lines.length || !lines.at(-1).length)
        pre.append(document.createElement('br')); // placeholder, keeps the last empty line
    pre.normalize();
    let r = document.createRange();
    r.selectNodeContents(pre);
    sel.removeAllRanges();
    sel.addRange(r);
    return true;
}

export {
    md2html, to_lines, code_block,
    read_file, load_img, date2num,
    sha256, aes256, aes256_blk0_d,
    concat_dat, b64_to_dat,
    dat2hex, dat2str, str2dat,
    cpy,
    download, copy_text, select_text,
    escape_html, readable_size,
    walk, linkable, sanitize_doc
};
