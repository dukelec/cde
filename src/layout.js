/*
 * Software License Agreement (MIT License)
 *
 * Author: Duke Fong <d@d-l.io>
 */

import { L } from './lang/lang.js'
let index_template = () => `
<nav class="navbar is-light" role="navigation" aria-label="main navigation">
    <div class="navbar-brand">
        <a href="${location.pathname}" class="navbar-item">
            <img src="img/icon.png"> &nbsp; <strong>CDEncrypt</strong> &nbsp; <small>v1.21</small>
        </a>
    </div>
    <div class="navbar-menu">
        <div class="navbar-end">
            <div class="navbar-item">
                <div class="buttons">
                    <button class="button is-small is-primary" data-modal-open="modal_passwd_list">
                        <i class="fas fa-key"></i> &nbsp; ${L('Passwords')}
                    </button>
                                    
                    <div class="dropdown is-right is-hoverable">
                        <div class="dropdown-trigger">
                            <button class="button is-small" aria-haspopup="true" aria-controls="dropdown-menu3">
                                <i class="fas fa-bars"></i>
                            </button>
                        </div>
                        <div class="dropdown-menu" id="dropdown-menu3" role="menu">
                            <div class="dropdown-content">
                                <a class="dropdown-item">
                                    <input class="file-input" type="file" id="in_add_file">
                                    <i class="fas fa-upload"></i> &nbsp; ${L('Open File')}
                                </a>
                                <a class="dropdown-item" id="in_add_text">
                                    <i class="far fa-comment-alt"></i> &nbsp; ${L('Input Text')}
                                </a>
                                <a class="dropdown-item" id="reload_page">
                                    <i class="fas fa-sync"></i> &nbsp; ${L('Reload Page')}
                                </a>
                                <a class="dropdown-item is-danger" id="clean_all">
                                    <i class="fas fa-sign-out-alt"></i> &nbsp; ${L('Clean All')}
                                </a>
                                <hr class="dropdown-divider">
                                <a href="https://github.com/dukelec/cde" class="dropdown-item">
                                    <i class="fab fa-github"></i> &nbsp; GitHub
                                </a>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</nav>


<section class="section">
    <div class="container">
        <h1 class="title">${L('Plaintext')}</h1>
        <p>${L('Use password')}: <span id="in_cur_pw">--</span></p>
    </div>

    <br>
    <div class="container">
        <h3 class="title is-size-4">${L('Content')}</h3>
        <div class="box" id="in_plaintext"></div>
    </div>

    <br>
    <div class="container">
        <h3 class="title is-size-4">${L('Files')}</h3>
        <div id="in_files"></div>
    </div>

    <br>
    <div class="container">
        <button class="button is-small" id="re_edit">
            <i class="fas fa-arrow-down"></i> &nbsp; ${L('Edit')}
        </button>
        <button class="button is-small" id="preview">
            <i class="fas fa-arrow-up"></i> &nbsp; ${L('Preview')}
        </button>
    </div>
</section>

<section class="section">
    <div class="container">
        <h1 class="title">${L('Edit')} | ${L('Reply')}</h1>
        <div id="editor" class="pell"></div>

        <section class="modal-card-body" id="out_files">
        </section>

        <div class="columns">
            <div class="column">
                <div class="button is-small">
                    <input class="file-input" type="file" id="out_add_file" multiple>
                    <i class="fas fa-upload"></i> &nbsp; ${L('Add File')}
                </div>
                <button class="button is-small" id="to_local">
                    <i class="fas fa-file-download"></i> &nbsp; ${L('Save Resources Locally')}
                </button>
            </div>
        </div>

        <br><br>
        <div class="columns">
            <div class="column">
                <button class="button is-small" data-modal-open="modal_passwd_sel">
                    <i class="fas fa-key"></i> &nbsp; ${L('Password')} &nbsp; <span id="out_pw">--</span>
                </button>
                <button class="button is-small is-primary" id="encrypt">
                    &#128274; &nbsp; ${L('Encrypt')}
                </button>
                <span class="is-size-7" id="enc_status">--</span>
            </div>
            <div class="column">
                <input class="input" type="text" id="out_fname" placeholder="${L('File name, use date if empty')}">
            </div>
        </div>
        <div class="columns">
            <div class="column">
                <button class="button is-small" id="share_url" disabled>
                    <i class="fas fa-share-alt"></i> &nbsp; ${L('Share URL')}
                </button>
                <button class="button is-small" id="show_url" disabled>
                    <i class="far fa-clipboard"></i> &nbsp; ${L('Show URL')}
                </button>
            </div>
            <div class="column">
                <button class="button is-small" id="share_file" disabled>
                    <i class="fas fa-share-alt"></i> &nbsp; ${L('Share File')}
                </button>
                <button class="button is-small" id="download_file" disabled>
                    <i class="fas fa-file-download"></i> &nbsp; ${L('Download File')}
                </button>
            </div>
        </div>

        <p id="show_out_url" style="word-wrap: break-word;"></p>

    </div>
</section>

<div class="modal" id="modal_passwd_list">
    <div class="modal-background" data-modal-close="modal_passwd_list"></div>
    <div class="modal-card">
        <header class="modal-card-head">
            <p class="modal-card-title">${L('Password List')}</p>
            <button class="delete" aria-label="close" data-modal-close="modal_passwd_list"></button>
        </header>
        <section class="modal-card-body" id="passwd_list">
            <!--p>#1: xxx <button class="btn btn-sm float-right">Remove</button></p-->
        </section>
        <footer class="modal-card-foot">
            <button class="button is-small is-success" name="add_passwd">${L('Add')}</button>
            <button class="button is-small" data-modal-close="modal_passwd_list">${L('Cancel')}</button>
        </footer>
    </div>
</div>

<div class="modal" id="modal_passwd_sel">
    <div class="modal-background" data-modal-close="modal_passwd_sel"></div>
    <div class="modal-card">
        <header class="modal-card-head">
            <p class="modal-card-title">${L('Password Select')}</p>
            <button class="delete" aria-label="close" data-modal-close="modal_passwd_sel"></button>
        </header>
        <section class="modal-card-body" id="passwd_sel">
            <!--p>#1: xxx <button class="btn btn-sm float-right">Select</button></p-->
        </section>
        <footer class="modal-card-foot">
            <button class="button is-small is-success" name="add_passwd">${L('Add')}</button>
            <button class="button is-small" data-modal-close="modal_passwd_sel">${L('Cancel')}</button>
        </footer>
    </div>
</div>

<div class="modal" id="modal_fetch">
    <div class="modal-background"></div>
    <div class="modal-card">
        <header class="modal-card-head">
            <p class="modal-card-title">${L('Download Progress')}</p>
            <button class="delete" aria-label="close" name="fetch_cancel"></button>
        </header>
        <section class="modal-card-body">
            <div class="progress-wrapper">
                <progress class="progress is-primary" value="0" max="100" id="fetch_progress"></progress>
                <p class="progress-value" id="fetch_progress_text">0%</p>
            </div>
            <p><span id="fetch_size"></span> <span id="fetch_status"></span></p>
        </section>
        <footer class="modal-card-foot">
            <button class="button is-small is-primary" id="fetch_ok">${L('OK')}</button>
            <button class="button is-small" name="fetch_cancel">${L('Cancel')}</button>
        </footer>
    </div>
</div>`;
document.getElementsByTagName("body")[0].innerHTML = index_template();
