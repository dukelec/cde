/*
 * Software License Agreement (MIT License)
 *
 * Author: Duke Fong <d@d-l.io>
 */

/* Message format: 'cde|' + msgpack('message body...') or msgpack:
 *  {
 *      b: 'message body...',
 *      f: {
 *          file_name: {type: 'image/jpeg', data: Uint8Array}
 *      },
 *      // v: 0, // version
 *      // fonts: {
 *      //   font_name: Uint8Array
 *      // }
 *  }
 */

import pell from '../lib/pell/pell.js'
import { L } from './lang/lang.js'
import {
    sha256, aes256, aes256_blk0_d,
    concat_dat, b64_to_dat,
    dat2hex, dat2str, str2dat,
    escape_html, date2num,
    read_file, download,
    readable_size, linkable, sanitize_doc,
    copy_text, select_text } from './utils/helper.js'
import { Idb } from './utils/idb.js';


let first_install = false;
let editor;
let save_timer = null;

let db = null;
let pw_list = []; // password list
let pw_def = null; // default password

let in_prj = { b: '', f: {} };
let in_prj_url_map = {};

let out_pw = null; // password for edit & reply
let out_prj = { b: '', f: {} };
let out_prj_url_map = {}; // filename: blob_url


// only these types are opened inline by blob url, others (e.g. html, svg) may run script in the app origin
const INLINE_TYPES = /^(image\/(?!svg)|video\/|audio\/|text\/plain|application\/pdf)/i;

function file_url(f) {
    // svg: data url has an opaque origin, safe even if opened as a document
    if (/^image\/svg\+xml/i.test(f['type']))
        return `data:image/svg+xml;base64,${base64js.fromByteArray(f['data'])}`;
    let type = INLINE_TYPES.test(f['type']) ? f['type'] : 'application/octet-stream';
    return URL.createObjectURL(new Blob([f['data']], {type: type}));
}

function build_url_map(files, old_map = {}) {
    for (let name in old_map)
        URL.revokeObjectURL(old_map[name]);
    let url_map = {};
    for (let name in files)
        url_map[name] = file_url(files[name]);
    return url_map;
}

// cde2blob: for display, the result is sanitized
function html_blob_conv(html, url_map, cde2blob=true) {
    let parser = new DOMParser()
    let doc = parser.parseFromString(html, "text/html");
    if (cde2blob)
        sanitize_doc(doc);
    for (let a of ['src', 'href', 'poster']) {
        for (let elem of doc.querySelectorAll(`[${a}]`)) {
            let url = elem.getAttribute(a);
            if (cde2blob) {
                if (url.search("cde:") == 0) {
                    let name = url.slice(4);
                    if (!url_map[name]) {
                        console.warn(`lost file: ${name}`);
                        continue;
                    }
                    elem.setAttribute(a, url_map[name]);
                }
            } else {
                // match by value, file url may be blob: or data: (svg)
                let filtered = Object.entries(url_map).filter(([k,v]) => v == url);
                if (filtered.length)
                    elem.setAttribute(a, `cde:${filtered[0][0]}`);
                else if (url.search("blob:") == 0)
                    elem.setAttribute(a, `cde:null`);
            }
        }
    }
    return doc.body.innerHTML;
}

async function to_local() {
    let parser = new DOMParser()
    let doc = parser.parseFromString(editor.content.innerHTML, "text/html");
    for (let a of ['src', 'href', 'poster']) {
        for (let elem of doc.querySelectorAll(`[${a}]`)) {
            let url = elem.getAttribute(a);
            let loc;
            try {
                loc = new URL(url, location.href);
            } catch (e) {
                continue;
            }
            if (!['http:', 'https:', 'data:'].includes(loc.protocol)) // skip blob:, mailto:, etc.
                continue;
            if (Object.values(out_prj_url_map).includes(url)) // already local, e.g. svg data url
                continue;
            if (loc.origin == location.origin && loc.pathname == location.pathname) // anchor link
                continue;
            console.log('to_local:', url);
            try {
                if (loc.protocol == 'http:') {
                    console.log(`to_local: force https: ${loc.href}`)
                    loc.protocol = 'https:';
                }
                const response = await fetch(loc);
                if (!response.ok)
                    throw new Error(`HTTP ${response.status}`);
                const blob = await response.blob();
                const u8a = new Uint8Array(await blob.arrayBuffer());
                let ext = (blob.type.split(/[\/;+]/)[1] || 'bin').trim();
                let idx = Object.keys(out_prj.f).length + 1;
                while (`_${idx}.${ext}` in out_prj.f)
                    idx++;
                let name = `_${idx}.${ext}`;
                out_prj.f[name] = {'type': blob.type, 'data': u8a};
                out_prj_url_map[name] = file_url(out_prj.f[name]);
                elem.setAttribute(a, out_prj_url_map[name]);
            } catch (e) {
                if (!confirm(`${L('Download resource error, continue?\n(Please try browser plug-ins e.g. CORS Unblock.)')}\n${url}: ${e}`))
                    return;
            }
        }
    }
    editor.content.innerHTML = doc.body.innerHTML;
    await save_out_b();
    await db.set('tmp', 'f', out_prj.f);
    update_out_files();
    alert(L('OK'));
}

// editor content -> out_prj.b -> db
async function save_out_b() {
    clearTimeout(save_timer);
    save_timer = null;
    out_prj.b = html_blob_conv(editor.content.innerHTML, out_prj_url_map, false);
    await db.set('tmp', 'b', out_prj.b);
}


window.addEventListener('load', async function() {
    console.log("load app");
    if (location.protocol != 'https:' && location.hostname != 'localhost') {
        alert(L('Error: only support https'));
        location.href = location.href.replace("http://", "https://");
        return;
    }
    db = await new Idb();
    pw_list = await db.get('var', 'pw_list');
    pw_def = await db.get('var', 'pw_def');
    if (!pw_list) {
        first_install = true;
        pw_list = [];
        await db.set('var', 'pw_list', pw_list);
    }
    if (!pw_def && pw_list.length) {
        pw_def = pw_list[0];
        await db.set('var', 'pw_def', pw_def);
    }
    out_pw = pw_def; // use default passwd
    update_out_pw();

    out_prj.b = await db.get('tmp', 'b') || '';
    out_prj.f = await db.get('tmp', 'f') || {};
    out_prj_url_map = build_url_map(out_prj.f);

    editor = pell.init({
        element: document.getElementById('editor'),
        onChange: () => { // save after typing pauses
            enc_reset();
            clearTimeout(save_timer);
            save_timer = setTimeout(save_out_b, 500);
        },
        defaultParagraphSeparator: 'p',
        styleWithCSS: false,
        actions: [
            'bold',
            'code',
            'heading1',
            'heading2',
            'image',
            'italic',
            'line',
            'link',
            'olist',
            'paragraph',
            'quote',
            'strikethrough',
            'ulist',
            'underline',
            {
                name: 'backColor',
                icon: '<div style="background-color:pink;">A</div>',
                title: 'Highlight Color',
                result: () => pell.exec('backColor', 'pink')
            },
            {
                name: 'default',
                icon: '<i class="fas fa-eraser"></i>',
                title: 'Remove Format',
                result: () => pell.exec('removeFormat')
            }
        ],
        classes: {
            actionbar: 'pell-actionbar',
            button: 'pell-button',
            content: 'pell-content',
            selected: 'pell-button-selected'
        }
    });

    editor.content.innerHTML = html_blob_conv(out_prj.b, out_prj_url_map);
    update_out_files();

    update_modal_passwd_list();
    update_modal_passwd_sel();

    await decrypt(location.hash.slice(1));
    init_sw();
});

window.addEventListener('pagehide', () => {
    if (save_timer)
        save_out_b();
});

document.addEventListener('click', e => {
    let elem = e.target.closest('[data-modal-open], [data-modal-close]');
    if (!elem)
        return;
    if (elem.dataset.modalOpen)
        modal_open(elem.dataset.modalOpen);
    else
        modal_close(elem.dataset.modalClose);
});

document.getElementById('reload_page').onclick = () => location.reload();
for (let elem of document.getElementsByName('add_passwd'))
    elem.onclick = add_passwd;

document.getElementById('clean_all').onclick = async function() {
    if (!confirm(L('Are you sure you want to clean all?')))
        return;
    await db.clear('var');
    await db.clear('tmp');
    alert(L('Clean all finished'));
    location = location.origin + location.pathname;
};

document.getElementById('out_add_file').onchange = async function() {
    for (let file of this.files) {
        let dat = await read_file(file);
        if (out_prj_url_map[file.name])
            URL.revokeObjectURL(out_prj_url_map[file.name]);
        out_prj.f[file.name] = {'type': file.type, 'data': dat};
        out_prj_url_map[file.name] = file_url(out_prj.f[file.name]);
    }
    update_out_files();
    await db.set('tmp', 'f', out_prj.f);
    this.value = '';
};

function update_out_files() {
    enc_reset();
    let list = document.getElementById('out_files');
    list.innerHTML = '';

    for (let name in out_prj.f) {
        let name_e = escape_html(name);
        let is_image = out_prj.f[name]['type'].startsWith('image');
        let is_video = out_prj.f[name]['type'].startsWith('video');
        let html = `
            <nav style="display: flex; margin-bottom: 10px;">
                <div>
                    <p>
                        <a href="${out_prj_url_map[name]}" download="${name_e}">${name_e}</a>
                        <span class="tag is-light">${readable_size(out_prj.f[name]['data'].length)}</span>
                    </p>
                </div>
                <div style="margin-left: auto; align-self: flex-start;">
                    <button class="button is-small" style="display: ${(is_image||is_video)?'normal':'none'}">${L('Insert')}</button>
                    <button class="button is-small">${L('Remove')}</button>
                </div>
            </nav>`;
        list.insertAdjacentHTML('beforeend', html);
        list.lastElementChild.getElementsByTagName("button")[0].onclick = function() {
            if (is_image) {
                pell.exec('insertImage', out_prj_url_map[name]);
            } else if (is_video) {
                let html = `<video controls><source src="${out_prj_url_map[name]}"></video>`;
                pell.exec('insertHTML', html)
            }
            enc_reset();
        };
        list.lastElementChild.getElementsByTagName("button")[1].onclick = async function() {
            URL.revokeObjectURL(out_prj_url_map[name]);
            delete out_prj.f[name];
            delete out_prj_url_map[name];
            await db.set('tmp', 'f', out_prj.f);
            update_out_files();
        };
    }
}

function update_in_files() {
    let list = document.getElementById('in_files');
    list.innerHTML = '';
    for (let name in in_prj.f) {
        let f = in_prj.f[name];
        let blob_url = in_prj_url_map[name];
        list.innerHTML += `
            <nav style="display: flex; margin-bottom: 10px;">
                <div>
                    <p>
                        <a href="${blob_url}" download="${escape_html(name)}">${escape_html(name)}</a>
                        <span class="tag is-light">${readable_size(f['data'].length)}</span>
                    </p>
                </div>
            </nav>`;
    }
}

function pw_short(pw) {
    return `${pw.slice(0,3)}…`;
}

// click the masked password to show / hide it
function pw_reveal(item, pw) {
    let p = item.getElementsByTagName('p')[0];
    let span = p.getElementsByTagName('span')[0];
    let shown = false;
    p.onclick = () => {
        shown = !shown;
        span.textContent = shown ? pw : pw_short(pw);
    };
}

function update_modal_passwd_list() {
    let list = document.getElementById('passwd_list');
    list.innerHTML = '';

    for (let i = 0; i < pw_list.length; i++) { // escape
        let pw = pw_list[i];
        let html = `
            <nav style="display: flex; margin-bottom: 10px;">
                <div>
                    <p style="cursor: pointer; word-break: break-all;">#${i}: <span>${escape_html(pw_short(pw))}</span></p>
                </div>
                <div style="margin-left: auto; align-self: flex-start;">
                    <button class="button is-small">${L('Remove')}</button>
                </div>
            </nav>`;
        list.insertAdjacentHTML('beforeend', html);
        pw_reveal(list.lastElementChild, pw);
        list.lastElementChild.getElementsByTagName("button")[0].onclick = async function() {
            pw_list = pw_list.filter(val => val != pw);
            await db.set('var', 'pw_list', pw_list);
            if (pw_def == pw) {
                pw_def = null;
                if (pw_list.length)
                    pw_def = pw_list[0];
                await db.set('var', 'pw_def', pw_def);
            }
            if (out_pw == pw) {
                out_pw = pw_def;
                update_out_pw();
            }
            update_modal_passwd_list();
            update_modal_passwd_sel();
        };
    }
}

function update_modal_passwd_sel() {
    let list = document.getElementById('passwd_sel');
    list.innerHTML = '';

    for (let i = 0; i < pw_list.length; i++) { // escape
        let pw = pw_list[i];
        let html = `
            <nav style="display: flex; margin-bottom: 10px;">
                <div>
                    <p style="cursor: pointer; word-break: break-all;">#${i}: <span>${escape_html(pw_short(pw))}</span></p>
                </div>
                <div style="margin-left: auto; align-self: flex-start;">
                    <button class="button is-small">${L('Set')}</button>
                </div>
            </nav>`;
        list.insertAdjacentHTML('beforeend', html);
        pw_reveal(list.lastElementChild, pw);
        list.lastElementChild.getElementsByTagName("button")[0].onclick = async function() {
            out_pw = pw_def = pw;
            await db.set('var', 'pw_def', pw_def);
            modal_close('modal_passwd_sel');
            update_out_pw();
        };
    }
}

async function _add_passwd(pw) {
    // remove exist first: move exist to top
    pw_list = pw_list.filter(val => val != pw);
    pw_list.unshift(pw);
    await db.set('var', 'pw_list', pw_list);
    update_modal_passwd_list();
    update_modal_passwd_sel();
    if (!out_pw)
        out_pw = pw;
    update_out_pw();
}

async function add_passwd() {
    let pw = prompt(L('New password:'));
    if (!pw)
        return;
    await _add_passwd(pw);
}

function update_out_pw() {
    enc_reset();
    if (out_pw) {
        let i = pw_list.findIndex(val => val == out_pw);
        document.getElementById('out_pw').innerHTML = `#${i}: ${escape_html(pw_short(out_pw))}`;
    } else {
        document.getElementById('out_pw').innerHTML = `--`;
    }
}

const URL_MAX = 4000;
const OUT_BTNS = ['share_url', 'show_url', 'share_file', 'download_file'];
let enc_out = null; // encrypted data for the output buttons, null if out of date
let enc_ver = 0;

// call on any change of content, files or password
function enc_reset() {
    enc_out = null;
    enc_ver++;
    for (let id of OUT_BTNS)
        document.getElementById(id).disabled = true;
    document.getElementById('enc_status').textContent = '--';
    document.getElementById('show_out_url').textContent = '';
}

// encrypt first, then the output buttons can run synchronously in the user gesture (needed by safari)
async function encrypt() {
    // no await before taking enc_ver, any later change makes the result out of date
    save_out_b().catch(e => console.error('save_out_b err:', e)); // out_prj.b is updated synchronously, db writing in background
    if (!out_pw) {
        alert(L('Please set password'));
        return;
    }
    if (!out_prj.b && !Object.keys(out_prj.f).length) {
        alert(L('Please input text'));
        return;
    }
    enc_reset();
    let ver = enc_ver;
    let status = document.getElementById('enc_status');
    status.textContent = L('Encrypting...');
    const out = await encrypt_dat();
    if (ver != enc_ver) // changed while encrypting
        return;
    enc_out = out;
    for (let id of OUT_BTNS)
        document.getElementById(id).disabled = false;
    status.textContent = `${L('Encrypted')}: ${readable_size(out.length)}`;
    if (out_url_len() >= URL_MAX)
        status.textContent += ` | ${L('The URL is too long and may not work in some apps')}`;
}

function out_url() {
    return `${location.origin+location.pathname}#${base64js.fromByteArray(enc_out)}`;
}

function out_url_len() {
    return (location.origin+location.pathname).length + 1 + Math.ceil(enc_out.length / 3) * 4;
}

function out_fname() {
    return document.getElementById('out_fname').value || date2num();
}

async function show_url() {
    let elem = document.getElementById('show_out_url');
    let url = out_url();
    elem.textContent = url;
    let ok = await copy_text(url);
    if (!ok)
        select_text(elem); // for manual copy
    alert(L(ok ? 'Copy to clipboard successed' : 'Copy to clipboard failed'));
}

async function share_url() {
    if (!navigator.share) {
        alert(L('Sharing is not supported'));
        return;
    }
    let url = out_url();
    await share({ url: url }, () => {
        let elem = document.getElementById('show_out_url');
        elem.textContent = url;
        select_text(elem);
    });
}

async function share_file() {
    let file = new File([enc_out], `${out_fname()}.txt`, {type: 'text/plain'});
    console.log("share file:", file);
    let data = {files: [file]};

    if (!navigator.canShare || !navigator.canShare(data)) {
        // Search: Web Share API - Level 2, permitted extensions
        // only image, video, audio and text files can be shared
        alert(L('File sharing is not supported'));
        return;
    }
    await share(data);
}

async function encrypt_dat() {
    const key = await sha256(str2dat(out_pw));
    const header = str2dat('cde|');
    const content = msgpack.encode(Object.keys(out_prj.f).length ? out_prj : out_prj.b);
    return await aes256(concat_dat([header, content]), key);
}

async function share(data, on_fail = null) {
    try {
        await navigator.share(data);
        console.log('Successfully sent share');
    } catch (e) {
        if (e.name == 'AbortError') // canceled by user
            return;
        console.log('Error sharing: ', e);
        if (on_fail)
            on_fail();
        alert(`${L('Sharing failed')}: ${e.name}`);
    }
}

async function _decrypt(dat, pw) {
    let key = await sha256(str2dat(pw));
    let content;
    try {
        let blk0 = await aes256_blk0_d(dat.slice(0, 16), key); // try to decrypt the first block
        let header = blk0.slice(0, 4);
        if (dat2str(header) != 'cde|')
            return null;
        let combined = await aes256(dat, key, 'decrypt');
        content = combined.slice(4);
    } catch (e) {
        console.log('decrypt err');
        return null;
    }

    try {
        return msgpack.decode(content);
    } catch (e) {
        console.log('msgpack decode err');
        return null;
    }
}

// normalize decoded msgpack to { b: '', f: {} }, null if invalid
function to_prj(ret) {
    if (typeof ret == 'string')
        return { b: ret, f: {} };
    if (!ret || typeof ret != 'object')
        return null;
    let prj = { b: ret.b ?? '', f: ret.f ?? {} };
    if (typeof prj.b != 'string' || typeof prj.f != 'object')
        return null;
    for (let name in prj.f) {
        let f = prj.f[name];
        if (!f || !ArrayBuffer.isView(f.data))
            return null;
        if (typeof f.type != 'string')
            f.type = '';
    }
    return prj;
}

function show_in_prj() {
    in_prj_url_map = build_url_map(in_prj.f, in_prj_url_map);
    update_in_files();
    let elem = document.getElementById('in_plaintext');
    elem.innerHTML = html_blob_conv(in_prj.b, in_prj_url_map);
    linkable(elem);
}

async function decrypt(dat) {
    if (typeof dat == 'string') {
        let str = dat;
        /*
        if (!str) {
            let c = await navigator.clipboard.readText();
            let hash_pos = c.search('#');
            if (hash_pos < 0)
                return;
            str = c.slice(hash_pos + 1);
        } */
        if (!str)
            return;
        if (str.startsWith(':')) {
            if (str.startsWith(':http') || str.startsWith(':/') || str.startsWith(':.'))
                await fetch_remote(str.slice(1));
            else
                await fetch_remote('https://' + str.slice(1));
            return;
        }

        try {
            dat = b64_to_dat(str);
        } catch (e) {
            alert(L('The Base64 string is invalid'));
            return;
        }
    }

    let pw = null;
    let pw_index = -1;
    let ret;
    for (let i = 0; i < pw_list.length; i++) {
        pw = pw_list[i];
        ret = await _decrypt(dat, pw);
        if (ret) {
            pw_index = i;
            break;
        }
    }
    if (pw_index == -1) {
        while (true) {
            pw = prompt(L('No password suitable, add new password:'));
            if (!pw)
                return;
            ret = await _decrypt(dat, pw);
            if (ret) {
                modal_close('modal_fetch');
                break;
            }
        }
        await _add_passwd(pw);
        pw_index = 0;
    }

    let prj = to_prj(ret);
    if (!prj) {
        alert(L('Invalid data format'));
        return;
    }
    in_prj = prj;
    let i = pw_list.findIndex(val => val == pw);
    document.getElementById('in_cur_pw').innerHTML = `#${i}: ${escape_html(pw_short(pw))}`;
    out_pw = pw;
    update_out_pw();
    show_in_prj();
}

async function fetch_remote(url) {
    modal_open('modal_fetch');
    let controller = new AbortController();
    document.getElementById('fetch_progress').value = 0;
    document.getElementById('fetch_progress_text').innerHTML = '0%';
    document.getElementById('fetch_size').innerHTML = '';
    document.getElementById('fetch_status').innerHTML = '';
    document.getElementById("fetch_ok").disabled = true;
    for (let elem of document.getElementsByName('fetch_cancel')) {
        elem.onclick = () => {
            modal_close('modal_fetch');
            controller.abort();
        }
    }
    let response;
    try {
        console.log(`fetch_remote: ${url}`);
        response = await fetch(url, {signal: controller.signal});
    } catch (e) {
        document.getElementById('fetch_status').textContent = `${L('Error')}: ${e}`;
        return;
    }
    if (!response.ok) {
        document.getElementById('fetch_status').textContent = `${L('Error')}: ${response.status}`;
        return;
    }
    const reader = response.body.getReader();
    const total_len = +response.headers.get('Content-Length');
    let received_len = 0;
    let chunks = [];
    while(true) {
        try {
            const {done, value} = await reader.read();
            if (done)
                break;
            chunks.push(value);
            received_len += value.length;
            if (total_len > 0) {
                let progress = Math.round(received_len / total_len * 100);
                document.getElementById('fetch_progress').value = progress;
                document.getElementById('fetch_progress_text').innerHTML = `${progress}%`;
            }
            document.getElementById('fetch_size').innerHTML = `${L('Received')} ${readable_size(received_len)}` +
                    (total_len > 0 ? ` / ${readable_size(total_len)}` : '');
        } catch (e) {
            console.log('fetch read catch', e);
            document.getElementById('fetch_status').textContent = `| ${L('Error')}: ${e}`;
            return;
        }
    }
    let dat = concat_dat(chunks);
    document.getElementById('fetch_status').innerHTML = `| ${L('Done!')}`;
    document.getElementById("fetch_ok").disabled = false;
    document.getElementById("fetch_ok").onclick = async () => {
        await decrypt(dat);
        modal_close('modal_fetch');
    };
}

document.getElementById('in_add_file').onchange = async function() {
    if (!this.files.length)
        return;
    let dat = await read_file(this.files[0]);
    await decrypt(dat);
    this.value = '';
};

document.getElementById('in_add_text').onclick = async function() {
    let str = prompt(L('Input URL or Base64 string:'));
    if (!str)
        return;
    let hash_pos = str.search('#');
    if (hash_pos >= 0)
        str = str.slice(hash_pos + 1);
    await decrypt(str);
};

// copy, don't share objects and blob urls between in & out
document.getElementById('re_edit').onclick = async function() {
    out_prj = { b: in_prj.b, f: { ...in_prj.f } };
    out_prj_url_map = build_url_map(out_prj.f, out_prj_url_map);
    editor.content.innerHTML = html_blob_conv(out_prj.b, out_prj_url_map);
    update_out_files();
    await save_out_b();
    await db.set('tmp', 'f', out_prj.f);
    alert(L('OK'));
};

document.getElementById('preview').onclick = async function() {
    await save_out_b();
    in_prj = { b: out_prj.b, f: { ...out_prj.f } };
    show_in_prj();
    document.getElementById('in_cur_pw').innerHTML = '--';
    alert(L('OK'));
};


document.getElementById('encrypt').onclick = encrypt;
// keep synchronous before copy / share
document.getElementById('share_url').onclick = () => enc_out && share_url();
document.getElementById('show_url').onclick = () => enc_out && show_url();
document.getElementById('share_file').onclick = () => enc_out && share_file();
document.getElementById('download_file').onclick = () => enc_out && download(enc_out, out_fname());
document.getElementById('to_local').onclick = async () => await to_local();

function modal_open(id) {
    document.getElementById(id).classList.add('is-active');
}
function modal_close(id) {
    document.getElementById(id).classList.remove('is-active');
}

function init_sw() {
    console.log('init_sw...');
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js', { // relative path, support sub-directory
            scope: './'
        }).then(function(reg) {
            if (reg.installing) {
                console.log('Service worker installing');
            } else if (reg.waiting) {
                console.log('Service worker installed');
            } else if (reg.active) {
                console.log('Service worker active');
            }
        }).catch(function(error) {
            console.log('Registration failed with ' + error);
        });

        navigator.serviceWorker.addEventListener('controllerchange', () => {
            if (!first_install) {
                alert(L('Switching APP to new version.'));
                location.reload();
            }
        });
    }
}
