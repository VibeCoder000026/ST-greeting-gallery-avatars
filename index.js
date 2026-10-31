/**
 * Greeting Gallery Avatars for SillyTavern.
 * Uses the built-in gallery's folder overrides and /api/images/list endpoint.
 * Changes only rendered image elements; does NOT rewrite a card/avatar PNG.
 */
import {
    greetingSlots, selectedGreetingIndex, galleryFolder, isImageFilename,
    galleryImageUrl, isCharacterMessage,
} from './logic.mjs';

const ID = 'greeting-gallery-avatars';
const LOG = '[Greeting Gallery Avatars]';
const folderPromises = new Map();
const imagePromises = new Map();
let modal = null;
let panel = null;
let activePanelAvatar = null;
let selectedSlot = 0;
let galleryFiles = [];
let galleryRequest = 0;
let applyTicket = 0;
let applyScheduled = false;
let chatObserver = null;

const context = () => window.SillyTavern?.getContext?.();

function settings() {
    const ctx = context();
    if (!ctx) return null;
    ctx.extensionSettings[ID] ??= {};
    const s = ctx.extensionSettings[ID];
    s.enabled ??= true;
    s.includeReplies ??= true;
    s.includeListTile ??= false;
    s.mappings ??= {};
    return s;
}
function saveSettings() { context()?.saveSettingsDebounced?.(); }
function toast(message, kind = 'info') {
    if (window.toastr?.[kind]) window.toastr[kind](message, 'Greeting Gallery Avatars');
    else console[kind === 'error' ? 'error' : 'log'](LOG, message);
}
function currentCharacter() {
    const ctx = context();
    if (!ctx || ctx.groupId || ctx.characterId === undefined || ctx.characterId === null) return null;
    const char = ctx.characters?.[ctx.characterId];
    return char?.avatar ? char : null;
}
function mappingsFor(avatar) {
    return settings()?.mappings?.[avatar] ?? {};
}
function mappedFile(char, slot) {
    const value = mappingsFor(char.avatar)[String(slot)];
    return isImageFilename(value) ? value : null;
}
function getActiveMapping() {
    const s = settings();
    const char = currentCharacter();
    const ctx = context();
    if (!s?.enabled || !char || !ctx || !ctx.chat?.length) return null;
    const index = selectedGreetingIndex(ctx.chat);
    if (index === null) return null;
    const slots = greetingSlots(char);
    if (!slots.some(slot => slot.index === index)) return null;
    const filename = mappedFile(char, index);
    if (!filename) return null;
    return { char, ctx, s, index, filename, folder: galleryFolder(char, ctx.extensionSettings.gallery) };
}

async function sanitizeFolder(folder) {
    if (!folder) throw new Error('Gallery folder name is empty');
    if (!folderPromises.has(folder)) {
        const pending = (async () => {
            const ctx = context();
            const res = await fetch('/api/files/sanitize-filename', {
                method: 'POST', headers: ctx.getRequestHeaders(),
                body: JSON.stringify({ fileName: folder }),
            });
            if (!res.ok) throw new Error(`Could not sanitize gallery folder (${res.status})`);
            const data = await res.json();
            if (typeof data.fileName !== 'string' || !data.fileName) throw new Error('Invalid sanitized gallery folder');
            return data.fileName;
        })().catch(error => { folderPromises.delete(folder); throw error; });
        folderPromises.set(folder, pending);
    }
    return folderPromises.get(folder);
}

function imageExists(url) {
    if (!imagePromises.has(url)) {
        const promise = new Promise(resolve => {
            const probe = new Image();
            probe.onload = () => resolve(true);
            probe.onerror = () => resolve(false);
            probe.src = url;
        });
        imagePromises.set(url, promise);
    }
    return imagePromises.get(url);
}

function restoreImage(img) {
    if (!img?.dataset?.ggaOriginalSrc) return;
    const original = img.dataset.ggaOriginalSrc;
    delete img.dataset.ggaOriginalSrc;
    delete img.dataset.ggaMappedSrc;
    if (img.getAttribute('src') !== original) img.setAttribute('src', original);
}
function setImage(img, src) {
    if (!(img instanceof HTMLImageElement)) return;
    if (!img.dataset.ggaOriginalSrc) img.dataset.ggaOriginalSrc = img.getAttribute('src') || '';
    img.dataset.ggaMappedSrc = src;
    if (img.getAttribute('src') !== src) img.setAttribute('src', src);
}
function updateImages(mapping, url) {
    const ctx = context();
    const char = mapping?.char;
    const messages = document.querySelectorAll('#chat .mes[mesid]');
    for (const element of messages) {
        const id = Number(element.getAttribute('mesid'));
        const message = Number.isInteger(id) ? ctx?.chat?.[id] : null;
        const img = element.querySelector('.mesAvatarWrapper .avatar img, .avatar img');
        if (!img) continue;
        const eligible = Boolean(url && mapping && isCharacterMessage(message, char) &&
            (mapping.s.includeReplies || id === 0));
        if (eligible) setImage(img, url);
        else restoreImage(img);
    }
    // Character-list tile is opt-in. Never alter the editor's avatar upload preview,
    // the character record, or other characters' tiles.
    const tile = url && mapping?.s.includeListTile
        ? document.getElementById(`CharID${ctx.characterId}`) : null;
    const tileImage = tile?.querySelector('.avatar img') ?? null;
    for (const img of document.querySelectorAll('#rm_print_characters_block img[data-gga-original-src], #rm_characters_block img[data-gga-original-src]')) {
        if (img !== tileImage) restoreImage(img);
    }
    if (tileImage) setImage(tileImage, url);
}

async function applyAvatars() {
    const ticket = ++applyTicket;
    const mapping = getActiveMapping();
    if (!mapping) {
        updateImages(null, '');
        return;
    }
    try {
        const folder = await sanitizeFolder(mapping.folder);
        const url = galleryImageUrl(folder, mapping.filename);
        if (!url || !(await imageExists(url))) {
            if (ticket === applyTicket) updateImages(null, '');
            return;
        }
        // Don't let a slow image request apply an image to another character/chat/swipe.
        if (ticket !== applyTicket) return;
        const current = getActiveMapping();
        if (!current || current.char.avatar !== mapping.char.avatar || current.filename !== mapping.filename ||
            current.index !== mapping.index || current.folder !== mapping.folder) return;
        updateImages(current, url);
    } catch (error) {
        if (ticket === applyTicket) updateImages(null, '');
        console.warn(LOG, 'Failed to load gallery avatar:', error);
    }
}
function scheduleApply() {
    if (applyScheduled) return;
    applyScheduled = true;
    queueMicrotask(() => {
        applyScheduled = false;
        void applyAvatars();
    });
}

function el(tag, className = '', text = '') {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text) element.textContent = text;
    return element;
}
function button(text, handler, className = '') {
    const b = el('button', `gga-button ${className}`, text);
    b.type = 'button';
    b.addEventListener('click', handler);
    return b;
}
function buildUI() {
    if (!document.getElementById('gga-settings')) {
        const target = document.getElementById('extensions_settings2') ?? document.getElementById('extensions_settings');
        if (target) {
            panel = el('div', 'gga-settings extension_container');
            panel.id = 'gga-settings';
            // Match SillyTavern's own collapsible extension settings drawers.
            // Its delegated .inline-drawer-toggle handler controls the chevron
            // and slides .inline-drawer-content open and closed.
            const drawer = el('div', 'inline-drawer');
            const heading = el('div', 'inline-drawer-toggle inline-drawer-header');
            heading.id = 'gga-settings-toggle';
            heading.setAttribute('role', 'button');
            heading.tabIndex = 0;
            heading.setAttribute('aria-expanded', 'false');
            heading.setAttribute('aria-controls', 'gga-settings-content');
            heading.append(el('b', '', 'Greeting Gallery Avatars'));
            heading.append(el('div', 'inline-drawer-icon fa-solid fa-circle-chevron-down down'));
            heading.addEventListener('click', () => {
                // The actual expand/collapse is provided by SillyTavern's
                // delegated click handler, not a competing custom handler.
                heading.setAttribute('aria-expanded', String(heading.getAttribute('aria-expanded') !== 'true'));
            });
            heading.addEventListener('keydown', event => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    heading.click();
                }
            });
            const content = el('div', 'inline-drawer-content gga-settings-content');
            content.id = 'gga-settings-content';
            content.style.display = 'none'; // Start collapsed to save menu space.
            drawer.append(heading, content);
            panel.append(drawer);
            const enabled = el('label', 'gga-toggle');
            const enabledBox = el('input'); enabledBox.type = 'checkbox'; enabledBox.checked = settings().enabled;
            enabledBox.addEventListener('change', () => {
                settings().enabled = enabledBox.checked; saveSettings(); scheduleApply();
            });
            enabled.append(enabledBox, document.createTextNode(' Enable greeting-based avatars'));
            content.append(enabled);
            const replies = el('label', 'gga-toggle');
            const repliesBox = el('input'); repliesBox.type = 'checkbox'; repliesBox.checked = settings().includeReplies;
            repliesBox.addEventListener('change', () => {
                settings().includeReplies = repliesBox.checked; saveSettings(); scheduleApply();
            });
            replies.append(repliesBox, document.createTextNode(' Apply to all character replies'));
            content.append(replies);
            const tiles = el('label', 'gga-toggle');
            const tilesBox = el('input'); tilesBox.type = 'checkbox'; tilesBox.checked = settings().includeListTile;
            tilesBox.addEventListener('change', () => {
                settings().includeListTile = tilesBox.checked; saveSettings(); scheduleApply();
            });
            tiles.append(tilesBox, document.createTextNode(' Also change selected character-list tile'));
            content.append(tiles);
            content.append(button('Map greeting images…', openMapper));
            content.append(el('p', 'gga-note', 'Images are sourced from the built-in character gallery. Original character cards are not modified.'));
            target.append(panel);
        }
    }
    // Fast access while a character chat is open.
    if (!document.getElementById('gga-menu-entry')) {
        const menu = document.getElementById('extensionsMenu');
        if (menu) {
            const entry = el('div', 'list-group-item flex-container flexGap5');
            entry.id = 'gga-menu-entry';
            entry.append(el('div', 'fa-solid fa-images extensionsMenuExtensionButton'));
            entry.append(el('span', '', 'Greeting Gallery Avatars'));
            entry.setAttribute('role', 'button'); entry.tabIndex = 0;
            entry.addEventListener('click', openMapper);
            entry.addEventListener('keydown', e => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openMapper(); }
            });
            menu.append(entry);
        }
    }
    if (modal) return;
    modal = el('div', 'gga-backdrop'); modal.id = 'gga-modal'; modal.hidden = true;
    modal.innerHTML = `
      <div class="gga-dialog" role="dialog" aria-modal="true" aria-labelledby="gga-title" tabindex="-1">
        <header class="gga-header"><div><h3 id="gga-title">Greeting Gallery Avatars</h3>
          <p id="gga-character" class="gga-subhead"></p></div>
          <button type="button" id="gga-close" class="gga-button" aria-label="Close">✕</button></header>
        <p class="gga-description">Select a greeting, then select an image from that character's SillyTavern Gallery. Changes save automatically.</p>
        <div class="gga-toolbar"><span id="gga-folder"></span>
          <button type="button" id="gga-open-gallery" class="gga-button">Open Gallery</button>
          <button type="button" id="gga-refresh" class="gga-button">Refresh images</button></div>
        <div class="gga-content"><div class="gga-greetings"><h4>Greetings</h4><div id="gga-greeting-list"></div></div>
          <div class="gga-picker"><div class="gga-picker-top"><h4>Gallery images</h4><span id="gga-current"></span></div>
            <div id="gga-image-list" class="gga-images" aria-live="polite"></div></div></div>
        <p id="gga-status" class="gga-note"></p>
      </div>`;
    modal.addEventListener('click', e => { if (e.target === modal) closeMapper(); });
    modal.querySelector('#gga-close').addEventListener('click', closeMapper);
    modal.querySelector('#gga-refresh').addEventListener('click', () => { imagePromises.clear(); void refreshGallery(); });
    modal.querySelector('#gga-open-gallery').addEventListener('click', () => {
        closeMapper();
        const galleryButton = document.getElementById('show_gallery_wand_button');
        if (galleryButton) galleryButton.click();
        else toast('Open the built-in Show Gallery command in SillyTavern, add images, then reopen this picker.');
    });
    document.body.append(modal);
}
function closeMapper() {
    if (!modal || modal.hidden) return;
    modal.hidden = true;
    activePanelAvatar = null;
}
function openMapper() {
    buildUI();
    const char = currentCharacter();
    if (!char) {
        toast('Select a character chat (not a group chat) first.', 'warning');
        return;
    }
    activePanelAvatar = char.avatar;
    const current = selectedGreetingIndex(context().chat);
    selectedSlot = greetingSlots(char).some(it => it.index === current) ? current : 0;
    modal.hidden = false;
    modal.querySelector('#gga-character').textContent = char.name;
    modal.querySelector('.gga-dialog').focus();
    renderGreetingList();
    void refreshGallery();
}
function slotExcerpt(text) {
    const oneLine = String(text).replace(/\s+/g, ' ').trim();
    return oneLine.length > 84 ? `${oneLine.slice(0, 81)}…` : oneLine || '(Empty greeting)';
}
function renderGreetingList() {
    if (!modal || modal.hidden) return;
    const char = currentCharacter();
    if (!char || char.avatar !== activePanelAvatar) { closeMapper(); return; }
    const container = modal.querySelector('#gga-greeting-list');
    container.replaceChildren();
    for (const slot of greetingSlots(char)) {
        const row = button('', () => { selectedSlot = slot.index; renderGreetingList(); renderImageList(); }, 'gga-greeting-row');
        row.classList.toggle('gga-selected', selectedSlot === slot.index);
        row.setAttribute('aria-pressed', String(selectedSlot === slot.index));
        const info = el('div', 'gga-greeting-info');
        info.append(el('strong', '', slot.label));
        info.append(el('span', 'gga-excerpt', slotExcerpt(slot.text)));
        const file = mappedFile(char, slot.index);
        info.append(el('small', 'gga-assigned', file ? `Image: ${file}` : 'Default card avatar'));
        row.append(info);
        container.append(row);
    }
    const selected = greetingSlots(char).find(it => it.index === selectedSlot);
    modal.querySelector('#gga-current').textContent = selected ? `For: ${selected.label}` : '';
}
async function refreshGallery() {
    if (!modal || modal.hidden) return;
    const token = ++galleryRequest;
    const char = currentCharacter();
    if (!char || char.avatar !== activePanelAvatar) return;
    const folderName = galleryFolder(char, context().extensionSettings.gallery);
    modal.querySelector('#gga-folder').textContent = `Folder: ${folderName}`;
    modal.querySelector('#gga-status').textContent = 'Loading gallery images…';
    galleryFiles = [];
    renderImageList();
    try {
        const sanitized = await sanitizeFolder(folderName);
        const response = await fetch('/api/images/list', {
            method: 'POST', headers: context().getRequestHeaders(),
            body: JSON.stringify({ folder: folderName, sortField: 'name', sortOrder: 'asc', type: 1 }),
        });
        if (!response.ok) throw new Error(`Gallery API returned HTTP ${response.status}`);
        const files = await response.json();
        if (!Array.isArray(files)) throw new Error('Gallery API response was not an array');
        if (token !== galleryRequest || modal.hidden || currentCharacter()?.avatar !== char.avatar) return;
        galleryFiles = files.filter(isImageFilename).map(filename => ({
            filename, url: galleryImageUrl(sanitized, filename),
        }));
        modal.querySelector('#gga-status').textContent = galleryFiles.length
            ? `${galleryFiles.length} image(s) in this character's gallery. Click one to assign it.`
            : 'No images found. Use Open Gallery to upload some, then click Refresh images.';
        renderImageList();
    } catch (error) {
        if (token !== galleryRequest || modal.hidden) return;
        modal.querySelector('#gga-status').textContent = `Could not read gallery: ${error.message}`;
        console.error(LOG, error);
        renderImageList();
    }
}
function changeMapping(filename) {
    const char = currentCharacter();
    if (!char || char.avatar !== activePanelAvatar) return;
    const s = settings();
    s.mappings[char.avatar] ??= {};
    if (filename) s.mappings[char.avatar][String(selectedSlot)] = filename;
    else delete s.mappings[char.avatar][String(selectedSlot)];
    if (!Object.keys(s.mappings[char.avatar]).length) delete s.mappings[char.avatar];
    saveSettings();
    scheduleApply();
    renderGreetingList();
    renderImageList();
}
function renderImageList() {
    if (!modal || modal.hidden) return;
    const container = modal.querySelector('#gga-image-list');
    container.replaceChildren();
    const char = currentCharacter();
    if (!char || char.avatar !== activePanelAvatar) return;
    const currentFile = mappedFile(char, selectedSlot);
    const none = button('Use original card avatar', () => changeMapping(null), 'gga-image-option gga-default');
    none.classList.toggle('gga-selected', !currentFile);
    none.setAttribute('aria-pressed', String(!currentFile));
    container.append(none);
    for (const { filename, url } of galleryFiles) {
        const opt = button('', () => changeMapping(filename), 'gga-image-option');
        opt.title = filename;
        opt.setAttribute('aria-label', `Use image ${filename}`);
        opt.setAttribute('aria-pressed', String(filename === currentFile));
        opt.classList.toggle('gga-selected', filename === currentFile);
        const img = el('img'); img.loading = 'lazy'; img.src = url; img.alt = filename;
        opt.append(img, el('span', 'gga-filename', filename));
        container.append(opt);
    }
}
function onGalleryAvatarClick(e) {
    const avatar = e.target.closest?.('#chat .mes .avatar');
    const img = avatar?.querySelector('img[data-gga-mapped-src]');
    if (!img) return;
    // ST's built-in zoom assumes avatar URLs come from /thumbnail?file=...;
    // gallery paths don't follow that format, so intercept those clicks.
    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
    window.open(img.dataset.ggaMappedSrc, '_blank', 'noopener,noreferrer');
}
function onEscape(e) {
    if (e.key === 'Escape' && modal && !modal.hidden) { e.stopPropagation(); closeMapper(); }
}
function onCharacterRename(oldAvatar, newAvatar) {
    const s = settings();
    if (s?.mappings?.[oldAvatar]) {
        s.mappings[newAvatar] = s.mappings[oldAvatar];
        delete s.mappings[oldAvatar];
        saveSettings();
    }
    scheduleApply();
}
function onCharacterDeleted(data) {
    const avatar = data?.character?.avatar;
    if (avatar && settings()?.mappings?.[avatar]) {
        delete settings().mappings[avatar];
        saveSettings();
    }
    scheduleApply();
}
function bindEvents() {
    const ctx = context();
    if (!ctx) { console.warn(LOG, 'SillyTavern context unavailable'); return; }
    const { eventSource, eventTypes } = ctx;
    for (const type of ['MESSAGE_SWIPED', 'CHAT_CHANGED', 'CHAT_LOADED', 'CHAT_CREATED',
        'CHARACTER_MESSAGE_RENDERED', 'CHARACTER_EDITED']) {
        if (eventTypes[type]) eventSource.on(eventTypes[type], () => {
            if (type === 'CHAT_CHANGED') closeMapper();
            scheduleApply();
        });
    }
    if (eventTypes.CHARACTER_RENAMED) eventSource.on(eventTypes.CHARACTER_RENAMED, onCharacterRename);
    if (eventTypes.CHARACTER_DELETED) eventSource.on(eventTypes.CHARACTER_DELETED, onCharacterDeleted);
    // Rendering and editing sometimes mutate an existing avatar <img> without an event.
    const chat = document.getElementById('chat');
    if (chat && !chatObserver) {
        chatObserver = new MutationObserver(records => {
            const avatarWasChanged = records.some(r => {
                if (r.type === 'attributes') {
                    return r.attributeName === 'swipeid' ||
                        (r.attributeName === 'src' && r.target.matches?.('.mesAvatarWrapper .avatar img, .mes .avatar img'));
                }
                // Ignore streaming text mutations; only newly-rendered avatars matter.
                return Array.from(r.addedNodes).some(node => node instanceof Element &&
                    (node.matches('.mes, .mesAvatarWrapper, .avatar') || node.querySelector('.mesAvatarWrapper .avatar img, .mes .avatar img')));
            });
            if (avatarWasChanged) scheduleApply();
        });
        chatObserver.observe(chat, { childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'swipeid'] });
    }
    document.addEventListener('click', onGalleryAvatarClick, true);
    document.addEventListener('keydown', onEscape, true);
}

jQuery(() => {
    try {
        settings();
        buildUI();
        bindEvents();
        scheduleApply();
        console.info(LOG, 'Loaded');
    } catch (error) {
        console.error(LOG, 'Failed to initialize:', error);
        toast(`Unable to initialize: ${error.message}`, 'error');
    }
});
