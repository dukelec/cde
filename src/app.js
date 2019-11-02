/*
 * Software License Agreement (MIT License)
 *
 * Author: Duke Fong <d@d-l.io>
 */

import { L }        from './utils/lang.js'
import { sha256, aes256, dat2hex, dat2str, str2dat, read_file, escape_html, date2num, download } from './utils/helper.js'
import { Idb }      from './utils/idb.js';
import  pell      from '../lib/pell/pell.js'

let first_install = false;
let db = null;

let pw_list = []; // password list
let pw_def = null; // default password

let pw_in = null;
let ciphertext_in = null;
let plaintext_in = null; // 'cde|data...'
let prj_in = null;
/* prj: {
 *   b: '',
 *   f: {
 *     file_name: {type: 'image/jpeg', data: Uint8Array}
 *   },
 *   // v: "0.0",
 *   // fonts: {
 *   //   font_name: Uint8Array
 *   // }
 * }
 */

let pw_out = null;
let ciphertext_out = null;
let plaintext_out = null; // 'cde|data...'
let prj_out = {
    b: '',
    f: {}
};
let prj_out_blob_url = {}; // number: blob_url


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
    pw_out = pw_def;////
    update_pw_out();
    //router();
    //init_sw();
    update_modal_passwd_list();////
    update_modal_passwd_sel();////
    decrypt();///
});

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



//import pell from 'pell'

const editor = pell.init({
    element: document.getElementById('editor'),
    onChange: html => {
        let parser = new DOMParser()
        let doc = parser.parseFromString(html, "text/html");
        for (let a of ['src', 'href', 'poster']) {
            for (let elem of doc.querySelectorAll(`[${a}]`)) {
                let url = elem.getAttribute(a);
                if (url.search("blob:") == 0) {
                    let filtered = Object.entries(prj_out_blob_url).filter(([k,v]) => v == url);
                    let fname = filtered.length ? filtered[0][0] : null;
                    elem.setAttribute(a, `cde:${fname}`);
                }
            }
        }
        prj_out.b = doc.body.innerHTML;
    },
    defaultParagraphSeparator: 'p',
    styleWithCSS: true,
    actions: [
        'bold',
        'underline',
        {
            name: 'italic',
            result: () => pell.exec('italic')
        },
        {
            name: 'backColor',
            icon: '<div style="background-color:pink;">A</div>',
            title: 'Highlight Color',
            result: () => pell.exec('backColor', 'pink')
        },
        {
            name: 'image',
            result: () => {
                const url = window.prompt('Enter the image URL')
                if (url) pell.exec('insertImage', url)
            }
        },
        {
            name: 'link',
            result: () => {
                const url = window.prompt('Enter the link URL')
                if (url) pell.exec('createLink', url)
            }
        }
    ],
    classes: {
        actionbar: 'pell-actionbar-custom-name',
        button: 'pell-button-custom-name',
        content: 'pell-content-custom-name',
        selected: 'pell-button-selected-custom-name'
    }
});

//editor.content.innerHTML = '<b><u><i>Initial content!</i></u></b>';

document.getElementById('out_add_file').onchange = async function() {
    for (let file of this.files) {
        let dat = await read_file(file);
        prj_out.f[file.name] = {'type': file.type, 'data': dat};
        prj_out_blob_url[file.name] = URL.createObjectURL(file);
    }
    update_out_files();
};

function update_out_files() {
    let list = document.getElementById('out_files');
    list.innerHTML = '';
    
    for (let name in prj_out.f) {
        let name_e = escape_html(name);
        let html = `
            <nav class="level">
                <div class="level-left">
                    <p><a href="${prj_out_blob_url[name]}" download>${name_e}</a></p>
                </div>
                <div class="level-right">
                    <button class="button is-small">Insert</button>
                    <button class="button is-small">Remove</button>
                </div>
            </nav>`;
        list.insertAdjacentHTML('beforeend', html);
        list.lastElementChild.getElementsByTagName("button")[0].onclick = function() {
            pell.exec('insertImage', prj_out_blob_url[name]);
            //let html = `<video controls><source src="${prj_out_blob_url[name]}"></video>`;
            //pell.exec('insertHTML', html)
        };
        list.lastElementChild.getElementsByTagName("button")[1].onclick = function() {
            URL.revokeObjectURL(prj_out_blob_url[name]);
            delete prj_out.f[name];
            delete prj_out_blob_url[name];
            update_out_files();
        };
    }
}


window.modal_open = id => document.getElementById(id).classList.add('is-active');
window.modal_close = id => document.getElementById(id).classList.remove('is-active');



function update_modal_passwd_list() {
    let list = document.getElementById('passwd_list');
    list.innerHTML = '';
    
    for (let i = 0; i < pw_list.length; i++) { // escape
        let pw = pw_list[i];
        let pw_e = escape_html(pw).replace(/ /g, "&blank;");
        let html = `
            <nav class="level">
                <div class="level-left">
                    <p>#${i}: ${pw_e}</p>
                </div>
                <div class="level-right">
                    <button class="button is-small">Remove</button>
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
            if (pw_out == pw) {
                pw_out = pw_def;
                update_pw_out();
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
            <nav class="level">
                <div class="level-left">
                    <p>#${i}: ${pw_e}</p>
                </div>
                <div class="level-right">
                    <button class="button is-small">Set</button>
                </div>
            </nav>`;
        list.insertAdjacentHTML('beforeend', html);
        list.lastElementChild.getElementsByTagName("button")[0].onclick = async function() {
            pw_out = pw_def = pw;
            await db.set('var', 'pw_def', pw_def);
            modal_close('modal_passwd_sel');
            update_pw_out();
        };
    }
}

window.add_passwd = async () => {
    let pw = prompt('New password:');
    if (!pw)
        return;
    pw_list.unshift(pw);
    await db.set('var', 'pw_list', pw_list);
    update_modal_passwd_list();
    update_modal_passwd_sel();
};

function update_pw_out() {
    if (pw_out) {
        let pw_e = escape_html(pw_out.slice(0,3)).replace(/ /g, "&blank;");
        let i = pw_list.findIndex(val => val == pw_out);
        console.log('iiii', i);
        document.getElementById('pw_out').innerHTML = `Password: #${i}: ${pw_e}…`;
    } else {
        document.getElementById('pw_out').innerHTML = `Password Select`;
    }
}

// share_url, show_url, share_file, download_file
async function encrypt(method='show_url') {
    if (!pw_out) {
        alert("Please set password");
        return;
    }
    if (!prj_out.b) {
        alert("Please input text");
        return;
    }
    if (method.startsWith('share') && !navigator.share) {
        alert('Sharing is not supported');
        return;
    }
    
    const key = await sha256(str2dat(pw_out));
    const header = str2dat('cde|');
    const content = msgpack.encode(prj_out);
    const combined = new Uint8Array([...header, ...content]);
    const out = await aes256(combined, key);
    
    if (method == 'share_url') {
        let b64 = base64js.fromByteArray(out);
        navigator.share({
            title: document.title, ///
            text: 'Hello World',
            url: `${location.origin}/#${b64}`,
        });
        return;
    }
    
    if (method == 'show_url') {
        let b64 = base64js.fromByteArray(out);
        let url = `${location.origin}/#${b64}`;
        document.getElementById('show_out_url').innerHTML = url;
        navigator.clipboard.writeText(url).then(function() {
            alert('Copy to clipboard successed');
        }, function() {
            console.log('Copy to clipboard failed');
        });
        return;
    }
    
    let fname = document.getElementById('fname_out').value;
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
            alert('File sharing is not supported');
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
        if (!b64) {
            let c = await navigator.clipboard.readText();
            let hash_pos = c.search('#');
            if (hash_pos < 0)
                return;
            b64 = c.slice(hash_pos + 1);
        }
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
        alert("no passwd suitable");
        return;
    }
    
    let pw_e = escape_html(pw.slice(0,3)).replace(/ /g, "&blank;");
    let i = pw_list.findIndex(val => val == pw);
    document.getElementById('in_cur_pw').innerHTML = `#${i}: ${pw_e}…`;

    let parser = new DOMParser()
    let doc = parser.parseFromString(ret.b, "text/html");
    for (let a of ['src', 'href', 'poster']) {
        for (let elem of doc.querySelectorAll(`[${a}]`)) {
            let url = elem.getAttribute(a);
            if (url.search("cde:") == 0) {
                let name = url.slice(4);
                let f = ret.f[name];
                if (!f) {
                    console.warn(`lost file: ${name}`);
                    continue;
                }
                let blob = new Blob([f['data']], {type: f['type']});
                let blob_url = URL.createObjectURL(blob);
                elem.setAttribute(a, blob_url);
            }
        }
    }
    document.getElementById('in_plaintext').innerHTML = doc.body.innerHTML;

    let list = document.getElementById('in_files');
    list.innerHTML = '';
    for (let name in ret.f) {
        list.innerHTML += `
            <nav class="level">
                <div class="level-left">
                    <p><a href="${name}" download>${name}</a></p>
                </div>
            </nav>`;
    }
}

document.getElementById('in_add_file').onchange = async function() {
    if (!this.files.length)
        return;
    let dat = await read_file(this.files[0]);
    await decrypt(dat);
};

document.getElementById('share_url').onclick = () => encrypt('share_url');
document.getElementById('show_url').onclick = () => encrypt('show_url');
document.getElementById('share_file').onclick = () => encrypt('share_file');
document.getElementById('download_file').onclick = () => encrypt('download_file');


/*
document.getElementById('index_menu').innerText =  L('Menu');
document.getElementById('index_home').innerText =  L('Home');
document.getElementById('index_setting').innerText =  L('Setting');
*/
