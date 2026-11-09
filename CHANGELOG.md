# Changelog

## 1.0.2 — 2026-11-10

- Declare `engines.dsh >= 0.2.2-rc.1` (the version this release was verified on)
  so a market install can refuse an incompatible harness build.
- README: install through the Plugins panel first, since the `dsh` CLI is not on
  every `PATH`; add the verified version, the API-key requirement for Work, and
  the network/region limit of the embedded page.
- Drop the staged `0.0.0-stage` placeholder version from the registry.

## 1.0.1 — 2026-11-10

- Add a frosted transition when switching Chat / Work: the central column is
  covered, the view swaps underneath, then the frost clears
  (250 ms hold + 250 ms fade, ~500 ms total).
- Publish as `dsh-work-chat-switch`: package metadata, MIT licence, README and
  changelog for distribution.

## 1.0.0 — 2026-11-10

- Replace the shipped sidebar New Session button with a Chat / Work pair
  (measured, hidden in place, redrawn in the same rectangle from the overlay).
- Chat: embeds `https://chat.deepseek.com/` in a main-column `webview` guest
  created through the desktop lease bridge; the page refuses iframes
  (`frame-ancestors 'none'`).
- Work: creates the next blank session and selects the API-key provider
  (`deepseek-official`), then shows the Conversation.
- Sandboxed, permissionless guest; the login lives in the app's
  process-lifetime browser partition.
