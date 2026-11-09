# dsh-work-chat-switch · 聊天 / 工作

ChatGPT-style switch in the top-left corner of the DeepSeek Harness sidebar,
plus an embedded official web chat in the main column.

| Button | Tooltip | What it does |
| --- | --- | --- |
| 聊天 / Chat | 无限制使用 / Unlimited use | Switches the central column to `https://chat.deepseek.com/`, embedded in a desktop `<webview>` guest |
| 工作 / Work | 使用API额度 / Uses API quota | Switches back to the Conversation and creates the next blank session with the API-key provider (`deepseek-official`) |

## Install

```bash
dsh plugin add dsh-work-chat-switch
```

Or install the directory as a bundle (Plugins → Add → local path) from a
checkout. The bundle inserts one Host row and loads its Client half
immediately.

## How it works

### The switch

The shipped New Session button is drawn by `@deepseek-ai/dsh-client-ui-sidebar`
and has no plugin slot. This bundle measures that button, hides it with
`visibility: hidden` (its layout box stays, so nothing below moves), and draws
the Chat / Work pair in the exact same rectangle from `shell.overlay`. If the
button cannot be found — another build, a shell without it, or the collapsed
sidebar rail — the original is restored untouched and the plugin draws nothing.

Switching covers the central column with a frosted layer, swaps the view
underneath it, and clears the frost: 250 ms hold + 250 ms fade. Both buttons are
disabled while the switch runs.

### The Chat panel

`chat.deepseek.com` answers with `Content-Security-Policy: frame-ancestors 'none'`,
so it cannot be iframed. The Desktop app creates browser guests only through its
own lease-gated bridge, and this panel uses that same bridge:

1. `dshDesktop.browser.acquire(partitionKey)` reserves a guest and returns a
   lease plus the approved partition.
2. A `<webview name="<lease>" partition="<approved>" src="about:blank#<lease>">`
   is attached; the main process rejects any guest without a matching lease.
3. After `dom-ready` the element navigates to the chat page.

The guest is sandboxed, permissionless, download-blocked, and confined to
http(s) navigation. The partition is the app's **process-lifetime** browser
storage: a login entered in the panel survives until the app quits and is shared
by every Chat panel in that run, but it is not written to disk. That is a
property of the desktop browser, not of this plugin.

### Work

Work uses the regular Host session API: `uiWorkspace.connectWorkspace`,
`remote.session.selectModel`, `uiWorkspace.openSession`. If no API-key model is
routable, it falls back to the deployment default model and shows a short notice
under the buttons.

## Requirements and limitations

- **Desktop app only** for the embedded page: the web build has no lease bridge,
  and the page refuses iframes. Without it the panel shows a message.
- The Chat login is per app run (process-lifetime partition), as above.
- The switch replaces shipped sidebar chrome; a DSH upgrade that renames or
  replaces that button can break the replacement (the fallback keeps the app
  usable but the pair may not appear).
- The New Session keyboard shortcut still starts a session with the deployment
  default model; the switch only applies to the two buttons.

## Files

| File | Purpose |
| --- | --- |
| `package.json` | Bundle manifest: patch, Client half, locale and icon exports |
| `cordis.patch.yml` | Inserts the Host row |
| `index.js` | Host half — no Host behavior |
| `client.js` | Sidebar replacement, embedded Chat panel, Work session flow |
| `locale/*.json` | Plugin Manager display metadata |
| `icon.svg` | Bundle icon |

## License

MIT. See `LICENSE`.
