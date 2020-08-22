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
    dat2hex, dat2str, str2dat,
    escape_html, date2num,
    read_file, download,
    readable_size, linkable } from './utils/helper.js'
import { Idb } from './utils/idb.js';


let first_install = false;
let editor;
let in_plaintext_ori = ''; // before convert links by anchorme

let db = null;
let pw_list = []; // password list
let pw_def = null; // default password

let in_prj = { b: '', f: {} };
let in_prj_url_map = {};

let out_pw = null; // password for edit & reply
let out_prj = { b: '', f: {} };
let out_prj_url_map = {}; // filename: blob_url


function html_blob_conv(html, url_map, cde2blob=true) {
    let parser = new DOMParser()
    let doc = parser.parseFromString(html, "text/html");
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
                if (url.search("blob:") == 0) {
                    let filtered = Object.entries(url_map).filter(([k,v]) => v == url);
                    let fname = filtered.length ? filtered[0][0] : null;
                    elem.setAttribute(a, `cde:${fname}`);
                }
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
            if (url.search("blob:") == 0)
                continue;
            console.log('to_local:', url);
            try {
                let loc = new URL(url);
                if (loc.protocol == 'http:') {
                    console.log(`to_local: force https: ${loc.href}`)
                    loc.protocol = 'https:';
                }
                const response = await fetch(loc);
                const blob = await response.blob();
                const ab = await new Response(blob).arrayBuffer();
                const u8a = new Uint8Array(ab);
                let sha = await sha256(u8a);
                let name = `_${Object.keys(out_prj.f).length+1}.${blob.type.split('/')[1]}`;
                out_prj_url_map[name] = URL.createObjectURL(blob);
                out_prj.f[name] = {'type': blob.type, 'data': u8a};
                elem.setAttribute(a, out_prj_url_map[name]);
            } catch (e) {
                if (!confirm(`${L('Download resource error, continue?\n(Please try browser plug-ins e.g. CORS Unblock.)')}\n${url}: ${e}`))
                    return;
            }
        }
    }
    editor.content.innerHTML = doc.body.innerHTML;
    out_prj.b = html_blob_conv(editor.content.innerHTML, out_prj_url_map, false);
    await db.set('tmp', 'b', out_prj.b);
    await db.set('tmp', 'f', out_prj.f);
    update_out_files();
    alert(L('OK'));
}


window.addEventListener('load', async function() {
    console.log("load app");
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
    for (let name in out_prj.f) {
        let f = out_prj.f[name];
        let blob = new Blob([f['data']], {type: f['type']});
        out_prj_url_map[name] = URL.createObjectURL(blob);
    }

    editor = pell.init({
        element: document.getElementById('editor'),
        onChange: async html => {
            out_prj.b = html_blob_conv(html, out_prj_url_map, false);
            await db.set('tmp', 'b', out_prj.b);
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

    if (location.protocol != 'https:' && location.hostname != 'localhost') {
        alert(L('Error: only support https'));
        location.href = location.href.replace("http://", "https://");
    }

    await decrypt(location.hash.slice(1));
    init_sw();
});

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
        out_prj.f[file.name] = {'type': file.type, 'data': dat};
        out_prj_url_map[file.name] = URL.createObjectURL(file);
    }
    update_out_files();
    await db.set('tmp', 'f', out_prj.f);
    this.value = '';
};

function update_out_files() {
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

function update_modal_passwd_list() {
    let list = document.getElementById('passwd_list');
    list.innerHTML = '';

    for (let i = 0; i < pw_list.length; i++) { // escape
        let pw = pw_list[i];
        let html = `
            <nav style="display: flex; margin-bottom: 10px;">
                <div>
                    <p>#${i}: ${escape_html(pw)}</p>
                </div>
                <div style="margin-left: auto; align-self: flex-start;">
                    <button class="button is-small">${L('Remove')}</button>
                </div>
            </nav>`;
        list.insertAdjacentHTML('beforeend', html);
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
                    <p>#${i}: ${escape_html(pw)}</p>
                </div>
                <div style="margin-left: auto; align-self: flex-start;">
                    <button class="button is-small">${L('Set')}</button>
                </div>
            </nav>`;
        list.insertAdjacentHTML('beforeend', html);
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

window.add_passwd = async () => {
    let pw = prompt(L('New password:'));
    if (!pw)
        return;
    await _add_passwd(pw);
};

function update_out_pw() {
    if (out_pw) {
        let pw_e = escape_html(out_pw.slice(0,3));
        let i = pw_list.findIndex(val => val == out_pw);
        document.getElementById('out_pw').innerHTML = `#${i}: ${pw_e}…`;
    } else {
        document.getElementById('out_pw').innerHTML = `--`;
    }
}

// share_url, show_url, share_file, download_file
async function encrypt(method='show_url') {
    if (!out_pw) {
        alert(L('Please set password'));
        return;
    }
    if (!out_prj.b && !Object.keys(out_prj.f).length) {
        alert(L('Please input text'));
        return;
    }
    if (method.startsWith('share') && !navigator.share) {
        alert(L('Sharing is not supported'));
        return;
    }

    const key = await sha256(str2dat(out_pw));
    const header = str2dat('cde|');
    const content = msgpack.encode(Object.keys(out_prj.f).length ? out_prj : out_prj.b);
    const combined = new Uint8Array([...header, ...content]);
    const out = await aes256(combined, key);
    document.getElementById('show_out_url').innerHTML = '';

    if (method.search('url') >= 0 && out.length >= 4000) {
        if (!confirm(L('Data is too large for URL encoding, continue?')))
            return;
    }

    if (method == 'share_url') {
        let b64 = base64js.fromByteArray(out);
        navigator.share({ url: `${location.origin+location.pathname}#${b64}` });
        return;
    }

    if (method == 'show_url') {
        let b64 = base64js.fromByteArray(out);
        let url = `${location.origin+location.pathname}#${b64}`;
        document.getElementById('show_out_url').innerHTML = url;
        navigator.clipboard.writeText(url).then(function() {
            alert(L('Copy to clipboard successed'));
        }, function() {
            alert(L('Copy to clipboard failed'));
        });
        return;
    }

    let fname = document.getElementById('out_fname').value;
    if (!fname)
        fname = date2num();

    if (method == 'share_file') {
        fname += '.txt';

        let file = new File([out], fname, {type: 'text/plain'});
        console.log("share file:", file);
        let data = {files: [file]};

        if (!navigator.canShare || !navigator.canShare(data)) {
            // Search: Web Share API - Level 2, permitted extensions
            // only image, video, audio and text files can be shared
            alert(L('File sharing is not supported'));
            return;
        }

        navigator.share(data)
        .then(() => {
            console.log('Successfully sent share');
        })
        .catch((err) => {
            console.log('Error sharing: ', err);
        });
        return;
    }

    if (method == 'download_file') {
        download(out, fname);
        return;
    }
};

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
        if (str.startsWith('+')) {
            if (str.startsWith('+http') || str.startsWith('+/'))
                await fetch_remote(str.slice(1));
            else
                await fetch_remote('https://' + str.slice(1));
            return;
        }

        try {
            dat = base64js.toByteArray(str);
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

    if (typeof ret == 'string')
        in_prj = { b: ret, f: {} }
    else
        in_prj = ret;
    let pw_e = escape_html(pw.slice(0,3));
    let i = pw_list.findIndex(val => val == pw);
    document.getElementById('in_cur_pw').innerHTML = `#${i}: ${pw_e}…`;
    out_pw = pw;
    update_out_pw();

    in_prj_url_map = {};
    let list = document.getElementById('in_files');
    list.innerHTML = '';
    for (let name in in_prj.f) {
        let f = in_prj.f[name];
        let blob = new Blob([f['data']], {type: f['type']});
        in_prj_url_map[name] = URL.createObjectURL(blob);
    }
    update_in_files();
    in_plaintext_ori = html_blob_conv(in_prj.b, in_prj_url_map);
    document.getElementById('in_plaintext').innerHTML = in_plaintext_ori;
    linkable(document.getElementById('in_plaintext'));
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
        response = await fetch(url, {signal: controller.signal});
    } catch (e) {
        document.getElementById('fetch_status').innerHTML = `${L('Error')}: ${e}`;
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
            document.getElementById('fetch_size').innerHTML =
                    `${L('Received')} ${readable_size(received_len)} / ${readable_size(total_len)}`;
        } catch (e) {
            console.log('fetch read catch', e);
            document.getElementById('fetch_status').innerHTML = `| ${L('Error')}: ${e}`;
            return;
        }
    }
    if (response.status !== 200) {
        document.getElementById('fetch_status').innerHTML = `| ${L('Error')}: ${response.status}`;
        return;
    }
    let dat = new Uint8Array(received_len);
    let pos = 0;
    for(let chunk of chunks) {
        dat.set(chunk, pos);
        pos += chunk.length;
    }
    document.getElementById('fetch_status').innerHTML = `| ${L('Done!')}`;
    document.getElementById("fetch_ok").disabled = false;
    await decrypt(dat);
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

document.getElementById('re_edit').onclick = async function() {
    out_prj_url_map = in_prj_url_map;
    out_prj = in_prj;
    editor.content.innerHTML = in_plaintext_ori;
    update_out_files();
    await db.set('tmp', 'b', out_prj.b);
    await db.set('tmp', 'f', out_prj.f);
    alert(L('OK'));
};

document.getElementById('preview').onclick = async function() {
    in_prj_url_map = out_prj_url_map;
    in_prj = out_prj;
    in_plaintext_ori = editor.content.innerHTML;
    document.getElementById('in_plaintext').innerHTML = in_plaintext_ori;
    linkable(document.getElementById('in_plaintext'));
    update_in_files();
    document.getElementById('in_cur_pw').innerHTML = '--';
    alert(L('OK'));
};


document.getElementById('share_url').onclick = async () => await encrypt('share_url');
document.getElementById('show_url').onclick = async () => await encrypt('show_url');
document.getElementById('share_file').onclick = async () => await encrypt('share_file');
document.getElementById('download_file').onclick = async () => await encrypt('download_file');
document.getElementById('to_local').onclick = async () => await to_local();

window.modal_open = id => document.getElementById(id).classList.add('is-active');
window.modal_close = id => document.getElementById(id).classList.remove('is-active');

function init_sw() {
    console.log('init_sw...');
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js', {
            scope: '/'
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
