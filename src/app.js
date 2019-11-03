/*
 * Software License Agreement (MIT License)
 *
 * Author: Duke Fong <d@d-l.io>
 */

/* Message format: 'cde|' + 'message body...' or msgpack:
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
    sha256, aes256,
    dat2hex, dat2str, str2dat,
    escape_html, date2num,
    read_file, download, readable_size } from './utils/helper.js'
import { Idb } from './utils/idb.js';


let first_install = false;
let editor;

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

    await decrypt();
    init_sw();
});

document.getElementById('clean_all').onclick = async function() {
    if (!confirm(L('Are you sure you want to clean all?')))
        return;
    await db.clear('var');
    await db.clear('tmp');
    alert(L('Clean all finished'));
    location = location.origin;
};

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


function update_modal_passwd_list() {
    let list = document.getElementById('passwd_list');
    list.innerHTML = '';

    for (let i = 0; i < pw_list.length; i++) { // escape
        let pw = pw_list[i];
        let pw_e = escape_html(pw).replace(/ /g, "&blank;");
        let html = `
            <nav style="display: flex; margin-bottom: 10px;">
                <div>
                    <p>#${i}: ${pw_e}</p>
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
        let pw_e = escape_html(pw).replace(/ /g, "&blank;")
        let html = `
            <nav style="display: flex; margin-bottom: 10px;">
                <div>
                    <p>#${i}: ${pw_e}</p>
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

window.add_passwd = async () => {
    let pw = prompt(L('New password:'));
    if (!pw)
        return;
    // remove exist first: move exist to top
    pw_list = pw_list.filter(val => val != pw);
    pw_list.unshift(pw);
    await db.set('var', 'pw_list', pw_list);
    update_modal_passwd_list();
    update_modal_passwd_sel();
    update_out_pw();
};

function update_out_pw() {
    if (out_pw) {
        let pw_e = escape_html(out_pw.slice(0,3)).replace(/ /g, "&blank;");
        let i = pw_list.findIndex(val => val == out_pw);
        document.getElementById('out_pw').innerHTML = `${L('Password')}: #${i}: ${pw_e}…`;
    } else {
        document.getElementById('out_pw').innerHTML = `${L('Password Select')}`;
    }
}

// share_url, show_url, share_file, download_file
async function encrypt(method='show_url') {
    if (!out_pw) {
        alert(L('Please set password'));
        return;
    }
    if (!out_prj.b) {
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

    if (method == 'share_url') {
        let b64 = base64js.fromByteArray(out);
        navigator.share({ url: `${location.origin}/#${b64}` });
        return;
    }

    if (method == 'show_url') {
        let b64 = base64js.fromByteArray(out);
        let url = `${location.origin}/#${b64}`;
        document.getElementById('show_out_url').innerHTML = url;
        navigator.clipboard.writeText(url).then(function() {
            alert(L('Copy to clipboard successed'));
        }, function() {
            console.log('Copy to clipboard failed');
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
    let combined;
    try {
        combined = await aes256(dat, key, 'decrypt');
    } catch (e) {
        return null;
    }
    let header = combined.slice(0, 4);
    let content = combined.slice(4);
    if (dat2str(header) != 'cde|')
        return null;
    let ret;
    try {
        ret = msgpack.decode(content);
    } catch (e) {
        console.log('msgpack decode err');
        return null;
    }
    return ret;
}

async function decrypt(dat=null) {
    if (!dat) {
        let b64 = location.hash.slice(1);
        /*
        if (!b64) {
            let c = await navigator.clipboard.readText();
            let hash_pos = c.search('#');
            if (hash_pos < 0)
                return;
            b64 = c.slice(hash_pos + 1);
        } */
        if (!b64)
            return null;
        dat = base64js.toByteArray(b64);
    }

    let pw = null;
    let pw_index = -1;
    let ret;
    for (let i = 0; i < pw_list.length; i++) { // escape
        pw = pw_list[i];
        ret = await _decrypt(dat, pw, true);
        if (ret) {
            pw_index = i;
            break;
        }
    }
    if (pw_index == -1) {
        alert(L('No passwd suitable'));
        return;
    }

    if (typeof ret == 'string')
        in_prj = { b: ret, f: {} }
    else
        in_prj = ret;
    let pw_e = escape_html(pw.slice(0,3)).replace(/ /g, "&blank;");
    let i = pw_list.findIndex(val => val == pw);
    document.getElementById('in_cur_pw').innerHTML = `#${i}: ${pw_e}…`;

    in_prj_url_map = {};
    let list = document.getElementById('in_files');
    list.innerHTML = '';
    for (let name in in_prj.f) {
        let f = in_prj.f[name];
        let blob = new Blob([f['data']], {type: f['type']});
        let blob_url = URL.createObjectURL(blob);
        in_prj_url_map[name] = blob_url;
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
    document.getElementById('in_plaintext').innerHTML = html_blob_conv(in_prj.b, in_prj_url_map);
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
    if (!str)
        return null;
    let dat = base64js.toByteArray(str);
    await decrypt(dat);
};

document.getElementById('re_edit').onclick = async function() {
    out_prj_url_map = in_prj_url_map;
    out_prj = in_prj;
    editor.content.innerHTML = document.getElementById('in_plaintext').innerHTML;
    update_out_files();
    await db.set('tmp', 'b', out_prj.b);
    await db.set('tmp', 'f', out_prj.f);
    alert(L('OK'));
};

document.getElementById('share_url').onclick = () => encrypt('share_url');
document.getElementById('show_url').onclick = () => encrypt('show_url');
document.getElementById('share_file').onclick = () => encrypt('share_file');
document.getElementById('download_file').onclick = () => encrypt('download_file');

window.modal_open = id => document.getElementById(id).classList.add('is-active');
window.modal_close = id => document.getElementById(id).classList.remove('is-active');

