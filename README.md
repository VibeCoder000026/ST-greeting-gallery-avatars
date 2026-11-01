# Greeting Gallery Avatars — SillyTavern extension

**Version 1.1.0** — Settings now use SillyTavern's native collapsible drawer, closed by default.

Choose a different **actual chat avatar** for each first message / alternate greeting. Images come directly from SillyTavern's **existing Character Gallery**, including custom gallery-folder overrides. Changes apply when you swipe the first message and when you reopen a saved chat. No AI image generation, plugins, or server modifications required.


## Usage

1. Select a **single character** (this extension does not target group chats).
2. Open **Character Card → More → Show Gallery**, and add the portraits you want.
3. Open **Extensions → Greeting Gallery Avatars** (or expand **Greeting Gallery Avatars** in the Extensions settings panel, then click **Map greeting images…**).
4. Choose **Main greeting** or an **Alternate greeting** on the left.
5. Click an image on the right to assign it. Choosing **Use original card avatar** clears that greeting's override.
6. Close the mapper, then swipe the **first** message to change the portrait. You can also switch to an existing chat: its current first-message swipe determines the portrait.

Use **Refresh images** after adding or removing gallery images. If a mapped gallery image is deleted, the avatar falls back to the original card image.

## Settings

In the Extensions settings panel, click the **Greeting Gallery Avatars** header or chevron to expand/collapse the options. The section starts **collapsed** to avoid taking up menu space. You can also focus the header and press Enter or Space. Collapsing the settings does **not** disable avatar switching.

- **Enable greeting-based avatars**: globally enable/disable the feature.
- **Apply to all character replies** (default on): use the selected greeting's portrait throughout the conversation; turn off to change only the first message's avatar.
- **Also change selected character-list tile** (default off): temporarily change the selected character's tile as well, without changing the actual card PNG.

## Scope and limitations

- Images are loaded from SillyTavern's `/api/images/list` gallery endpoint and its existing per-character gallery folder setting; they are **not duplicated**.
- Greeting-to-image mappings are saved in SillyTavern's **extension settings** under `greeting-gallery-avatars`, keyed by character avatar filename and greeting swipe index. They are **not embedded** into exported PNG cards or `.charx` files. Back up your SillyTavern settings when migrating installations.
- If you reorder/remove alternate greetings or delete greeting swipes, review the mappings because positions may change. An empty main greeting is skipped if alternates exist, consistent with SillyTavern's greeting swipe order.
- Group chats, impersonated/user/system avatars, and explicitly forced per-message avatars are not changed.
- The original character PNG is never overwritten. The extension swaps displayed chat avatar `img` elements; clicking a mapped chat avatar opens the gallery image in a new tab (SillyTavern's native zoom expects a character-card URL).
- Gallery images do not replace the editor's card-art upload preview.
- The implementation was checked against SillyTavern's `release` branch APIs in October 2026. It is a third-party extension and may need updates if SillyTavern's DOM or gallery API changes. Not tested in a running SillyTavern instance.

## Troubleshooting

- **No images shown:** verify images exist in the current character's Gallery, then hit **Refresh images**. Only still-image files (PNG, JPEG, WEBP, GIF, AVIF, APNG, BMP) are offered, not videos.
- **No image changes:** check the extension is enabled, the selected chat's **first message** is a character greeting, and the mapping is assigned to that greeting. For non-greeting chats, the extension makes no change.
- **Images broken after renaming the gallery folder:** use **Refresh images**, verify the image still exists in the active gallery folder, and reassign if necessary.
- **Can't install from the UI:** copy the folder manually into `public/scripts/extensions/third-party/`, or upload the source files to a Git repository and use that repository URL.

## Privacy and security

Only contacts the same SillyTavern server using the existing authenticated gallery endpoints. There are no external HTTP requests, telemetry, or third-party dependencies.

## License

MIT (see `LICENSE`).
