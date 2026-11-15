/** Pure helpers for greeting/gallery correspondence. No SillyTavern globals. */
export function greetingSlots(character) {
    if (!character) return [];
    const first = String(character.first_mes ?? character.data?.first_mes ?? '');
    const alternates = Array.isArray(character.data?.alternate_greetings)
        ? character.data.alternate_greetings : [];
    const slots = [];
    // Matches SillyTavern getFirstMessage(): a blank main greeting is omitted
    // whenever at least one alternate greeting exists.
    if (first.length || alternates.length === 0) {
        slots.push({ index: 0, label: 'Main greeting', text: first });
    }
    for (let i = 0; i < alternates.length; i++) {
        slots.push({ index: slots.length, label: `Alternate ${i + 1}`, text: String(alternates[i] ?? '') });
    }
    return slots;
}

function canUseCharacterAvatar(message) {
    // Summaryception marks original messages before /hide sets is_system.
    // They still belong to the same speaker; only their prompt visibility changed.
    const isSummaryceptionGhost = message?.extra?.sc_ghosted === true;
    return Boolean(message && !message.is_user && !message.force_avatar &&
        (!message.is_system || isSummaryceptionGhost));
}

export function selectedGreetingIndex(chat) {
    const first = chat?.[0];
    if (!canUseCharacterAvatar(first)) return null;
    const raw = Number(first.swipe_id ?? 0);
    return Number.isInteger(raw) && raw >= 0 ? raw : 0;
}

export function galleryFolder(character, gallerySettings) {
    if (!character) return '';
    return String(gallerySettings?.folders?.[character.avatar] ?? character.name ?? '');
}

export function isImageFilename(name) {
    return typeof name === 'string' && /\.(?:png|jpe?g|webp|gif|avif|apng|bmp)$/i.test(name) &&
        !name.includes('/') && !name.includes('\\') && name !== '.' && name !== '..';
}

export function galleryImageUrl(sanitizedFolder, filename) {
    if (typeof sanitizedFolder !== 'string' || !sanitizedFolder || !isImageFilename(filename)) {
        return '';
    }
    return `/user/images/${encodeURIComponent(sanitizedFolder)}/${encodeURIComponent(filename)}`;
}

export function isCharacterMessage(message, character) {
    return Boolean(character && canUseCharacterAvatar(message) && message.name === character.name);
}
