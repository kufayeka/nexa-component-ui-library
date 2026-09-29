# @kufayeka/nexa-component-ui-library — Nexa UI

A themed component library for **Nexa Dashboard**: 31 form, display, feedback and layout components. It is a normal Nexa plugin, built only on the Nexa component SDK, so it is also the example to follow when you **build your own UI library**.

- **Form**: Button, Input, Textarea, Number Input, Password Input, Checkbox, Switch, Radio Group, Segmented Control, Select, Combobox, Slider, Tags Input, Pin Input, Rating.
- **Display & feedback**: Text, Heading, Badge, Tag, Card, Avatar, Stat, Alert, Progress (a bar or a circle), Spinner, Skeleton, Separator, Empty State, Timeline, Fieldset.

- **Layout**: Tabs — each tab has a panel you drop components into (the SDK's *slots*).
- **Embed**: Iframe — another web page (Grafana, a camera, a report), with Logic both ways.

In the editor they are in the palette under **UI · Form**, **UI · Display** and **UI · Layout**.

### Iframe

**Content**
- URL, plus **URL parameters** (a list; each value can be bound, e.g. `{line}` or a tag). An empty value leaves the URL's own value alone.
- Or **HTML instead of a URL** (`srcdoc`).
- Title (screen readers) and name.

**Grafana preset** (the URL parameters Grafana understands)
- Kiosk mode: off / TV / full.
- Theme: *follow the app's colour mode*, light, dark, or Grafana's own.
- From / To, Refresh, orgId, time zone.
- Dashboard variables (`var-…`).

**Loading**
- `loading` Lazy (loads when near the view) or Eager (loads now); fetch priority.
- "Loading…" until it has loaded.
- A timeout (fires **On Timeout**).
- Reload every N seconds.
- Whether the editor shows the page live or a placeholder.

**Security**
- Sandbox on/off, with every `allow-*` token as a checkbox.
- Referrer policy, `csp`, credentialless.

**Permissions** (`allow=`)
- fullscreen, autoplay, clipboard, camera, microphone, geolocation, screen capture…
- A field for any other permission.

**Messages**
- *Accept messages from*: origins. Empty = the embedded page's own origin; `*` = any.
- *Send messages to origin*.

**Logic events**
- **On Load** (`url`, `count`; it fires again on each navigation inside it).
- **On Message**: `data` and `origin` of a `postMessage` from the page.
- **On Error** and **On Timeout**.

**Logic actions** (Update Component → *Run:*)
- **Reload**.
- **Open URL** (`{ url }`).
- **Send a message** (`{ data, targetOrigin }`, or just the payload), sent with `postMessage` into the page.
- **Set URL parameters** (`{ name: value }`; `null` removes one): e.g. a new Grafana time range without rebuilding the URL.
- **Back / Forward**: only for a page of the same origin; the browser allows nothing else.

Grafana must allow embedding: `allow_embedding = true` in `grafana.ini`, and anonymous or proxied auth for the viewers.

### Tabs

- Each tab (Content → Tabs: value, label, icon, disabled) has its own **panel**, a frame of the page. Click a tab header on the canvas to show its panel, then drop components into it. Double click the panel for its auto layout, padding and fill.
- **Value** is the value of the tab shown. Bind it (a variable, a tag) and it works both ways: the binding picks the tab, and a click writes the new value. **On Change** fires when the user switches tab.
- Logic actions: **Show a tab** (`value`), **Next tab**, **Previous tab**.
- Keyboard: ← → (↑ ↓ when the tabs are on the left), Home, End.
- Variants: Line (Carbon), Contained (Carbon), Pills. Tabs on the top or on the left; *Fill the width* makes all tabs the same width.
- A tab's value names its panel. If you rename a value, that tab gets a new, empty panel. The old panel is kept but hidden until the value comes back.

## The look

Nexa UI's look is based on **IBM Carbon**: sharp and clear, made a little softer (4px corners, clear focus rings, a little depth on tiles and menus). You can tell it apart by:

- **fields** with a gray fill and a line along the bottom; a 2px ring when focused;
- **buttons** with the text on the left and the icon on the right (Primary / Secondary / Tertiary / Ghost);
- small, slightly spaced-out **labels** (12px) above the controls;
- a **checkbox** filled with the text colour, a **green toggle**, a **content switcher** whose chosen segment is inverted;
- **notifications** with a coloured bar on the left and a light tint behind them;
- **IBM Plex Sans** for text and **IBM Plex Mono** for numbers and readouts (Stat, the slider's value, times).

IBM Plex comes with the package (`dist/fonts`, SIL Open Font License, see `OFL-IBM-Plex.txt`). The dashboard's default theme uses the Carbon palettes (blue 60 `#0f62fe` as primary, the Carbon grays) and Carbon's White and Gray 100 as light and dark. If you want another look, change the theme (Theme tab) or install another UI-library plugin.

## Install

Put the package next to `@kufayeka/node-red-nexa-dashboard` (it needs the dashboard's SDK) and restart Node-RED:

```
npm install @kufayeka/nexa-component-ui-library   # or: copy the folder into node_modules/@kufayeka/
```

The plugin serves `dist/` to the editor and to every deployed page. Nothing to configure.

## Every property is data-driven

The SDK's property kit does this for every field of every component, with no code in the component:

| In the panel | What it does |
| --- | --- |
| **⛓** | Binds the prop to a **Variable**, a **Tag** (Sparkplug, OPC UA…), the **Message** (`{msg.payload.x}`) or an **Expression** (`"Line {line}: {speed} rpm"`). A bound prop has a **Fallback**, shown while the binding has no value. |
| **📱** | A value **per breakpoint** (xs … 3xl, the Breakpoints tab), e.g. Size `lg` on the desktop and `sm` on a phone. |
| **◆** | A **theme token** instead of a value: colours, font sizes, weights, spacing, radii (`{token:colors.primary.solid}`). It follows the app's theme and light / dark. |

**Form controls read and write their value (two-way):**

- **Value (read)** — a tag, a variable or the message — is what the control shows.
- **Value (write)** is where the user's change goes. Empty: back to Value (read). A Slider bound to `{speed}` changes `{speed}`, and everything bound to `{speed}` follows.
- Unbound, a control keeps its own value, starting at **Default value**.
- Text fields write on Enter (or on leaving the field), with validation, a pending state until the tag confirms it, and a write error shown under the field.
- Every control has **On Change** (Logic) with `msg.payload.value`. Some have more: On Click, On Complete (Pin Input), On Slide, On Open / On Close (Select), On Action (Card, Empty State), On Close (Alert, Tag).

**The field** of a form control is built in: Label (top or left), Helper text, Invalid + Error text (bind Invalid to a check), Required (`*`).

**Options** (Radio Group, Segmented, Select, Combobox) come from the Options list, or from data: bind **Options from data** to an array (strings, or objects with the value / label fields named in Content). The Timeline's steps work the same way.

## How it looks, and how to change it

A component's structure is the library's: accessible (keyboard, focus, ARIA; the Select, Combobox, Slider, Tags / Pin Input and Rating use zag.js through the SDK) and consistent. You change its look in three layers, from the most common to the most special:

1. **Its props**:
   - `variant`:
     - for a button: solid (primary) / secondary / outline (tertiary) / ghost / subtle / plain (link);
     - for a field: filled / outline / flushed;
     - for a checkbox, radio, segmented control or slider: neutral / brand (palette);
     - for an alert: inline / subtle / outline / solid (high contrast);
     - for a card: tile / accent / outline / elevated;
   - `size` (xs … xl: height, padding, font, icons);
   - `colorPalette` (any palette of the theme: primary, gray, red, green…);
   - `radius` (a radius token).
2. **The app's theme** (the Theme tab). Every colour and size here is a design token. Change the primary palette and every primary button follows; switch to dark mode (`$colorMode`) and everything follows.
3. **Custom CSS** (the component's *Custom CSS* tab):
   - the **base CSS**;
   - one CSS per documented **part**, e.g. Button → *The button*, *Its text*; a field → *Root*, *Label*, *Control*, *Helper / error text*, *The box*.

   Write declarations (`letter-spacing: 0.05em;`). They win over the library's own styles. Use the theme's CSS variables to stay themeable: `color: var(--nexa-colors-fg-muted);`.

## Build your own UI library

This package is the template. Keep the same structure, and take **everything** from the SDK, never from npm or a CDN: Lit (`html`, `css`), `defineComponent`, `NexaElement`, `FieldController`, `theme`, `zag`, `assetUrl`.

```
my-nexa-ui/
  package.json              "node-red": { "plugins": { "my-nexa-ui": "widgets/plugin.js" } }
  widgets/plugin.js         require("@kufayeka/node-red-nexa-dashboard/sdk/package")(RED, { id, name, dir, modules: ["index.js"] })
  widgets/plugin.html       <script type="module" src="my-nexa-ui/vendor/index.js"></script>
  dist/index.js             imports your modules
  dist/core.js              your shared pieces (see below)
  dist/form.js, display.js  defineComponent(...) calls
  test/browser.test.js      withHarness(...) from the SDK testkit
```

**`dist/core.js` holds what every component shares.** Use this library's as a start:

- **Common props** — `sizeProp()`, `paletteProp()`, `variantProp()`, `radiusProp()`, `FIELD_PROPS`. Give a size prop `tokens: "fontSizes"` (or `"spacing"`, `"radii"`) and the panel offers the tokens.
- **`BASE_CSS`** — the size scale as CSS variables on `:host([data-size=…])`, the field's layout.
- **`UIElement`** (extends `NexaElement`) — sets `data-size` / `data-variant` on the host and the palette as `--cp-solid`, `--cp-subtle`, `--cp-fg`… (`applyPalette`). It also sets the semantic colours `--fg`, `--bg`, `--bd`… (`applySemantic`), each the theme's CSS variable with its value in the current mode as the fallback.
- **`ValueState`** — the two-way value of a control that is not a text field: bound, pending, local.
- **`field()`** — the label / helper / error around a control. **`part()`** — a Custom CSS part.
- **Icons** as inline SVG. Font Awesome does not reach into a shadow root.

**A component, in short:**

```js
import { defineComponent, html, css } from "../../nexa-sdk/nexa-component-sdk.js";
import { UIElement, BASE_CSS, sizeProp, paletteProp, variantProp, part } from "./core.js";

export const chip = defineComponent({
    id: "my-ui-chip", label: "Chip", category: "My UI", icon: "fa fa-circle", size: { w: 100, h: 32 },
    cssGroup: "Custom CSS", css: "",
    properties: {
        text: { type: "string", default: "Chip", group: "Content" },
        variant: variantProp([{ value: "solid", label: "Solid" }, { value: "subtle", label: "Subtle" }], "subtle"),
        size: sizeProp("sm"), colorPalette: paletteProp("gray"),
        gap: { type: "number", default: "{token:spacing.2}", tokens: "spacing", unit: "px", group: "Style" }
    },
    events: { click: { label: "On Click" } },
    parts: { chip: part("The chip", "chip") },
    view: class extends UIElement {
        static styles = [BASE_CSS, css`
            .c { display: inline-flex; gap: var(--g); padding: 0 var(--px); border-radius: 9999px; }
            :host([data-variant="solid"]) .c { background: var(--cp-solid); color: var(--cp-contrast); }
            :host([data-variant="subtle"]) .c { background: var(--cp-subtle); color: var(--cp-fg); }`];
        render() {
            return html`<span class="c" part="chip" style="--g:${this.p.gap}px" @click=${() => this.fire("click")}>${this.p.text}</span>`;
        }
    }
});
```

**Rules that keep a library consistent:**

- **Colours come from the palette roles or the semantic colours**, never hard-coded: `--cp-solid`, `--cp-contrast`, `--cp-subtle`, `--cp-muted`, `--cp-fg`, `--cp-border`, `--cp-focusRing`; `--fg`, `--fg-muted`, `--bg`, `--bg-muted`, `--bd`, `--panel`, `--err`. Then light / dark and the app's theme work by themselves.
- **Sizes come from the size scale**: `--h`, `--px`, `--gap`, `--fs`, `--icon`, `--r`.
- **Defaults that are design decisions are tokens**: `{token:colors.fg}`, `{token:fontSizes.2xl}`, `{token:radii.md}`. The SDK resolves them in the current mode, also when the host did not.
- **Every visible piece has a `part="…"`** and, if users may restyle it, a `part()` entry.
- **Behaviour** — keyboard, focus, ARIA — comes from the platform (native inputs) or zag.js (`zag.ZagController`, `zag.spread`). See docs/SDK.md §11c of the dashboard.
- **Test in a real browser** with the SDK testkit: `NexaTest.mount`, `setTag`, `setVariable`, `setMode("dark")`, `item().writes / events`.

## Tests

```
node test/browser.test.js      # headless Chrome; build the dashboard first (npm run build there)
node test/tags-e2e.test.js     # tags end to end (~1 min): a real Node-RED, MQTT broker and Sparkplug edge
```

`tags-e2e` starts its own Node-RED in the temp folder on ports 1899 / 1898 and an MQTT broker (aedes) on 1893. It never touches your `data/`. A simulated Sparkplug edge answers each write like a PLC: it applies it and reports it back.

It checks every component that reads or writes a tag, both on the screen and inside a Tabs panel:
- the tag's value is shown;
- a change at the device shows;
- the user's input is written with the right value and format (a tag holding JSON text gets JSON text back);
- the echo is shown;
- when the device dies, the value shows `???`, and it comes back on rebirth.

**Run it after any change to a component's tags.**

It covers:

- every component registers and draws, with no console error;
- the two-way value of every form control;
- the zag widgets by pointer and keyboard;
- the theme's palettes, tokens and dark mode;
- the inspector (⛓ / ◆ on the fields, the tabs).
