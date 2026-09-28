# @kufayeka/nexa-component-ui-library — Nexa UI

A themed component library for **Nexa Dashboard**: 30 form, display and feedback components in the spirit of Chakra UI. It is a normal Nexa plugin, built only on the Nexa component SDK, so it is also the example to follow when you **build your own UI library**.

- **Form**: Button, Input, Textarea, Number Input, Password Input, Checkbox, Switch, Radio Group, Segmented Control, Select, Combobox, Slider, Tags Input, Pin Input, Rating.
- **Display & feedback**: Text, Heading, Badge, Tag, Card, Avatar, Stat, Alert, Progress (a bar or a circle), Spinner, Skeleton, Separator, Empty State, Timeline, Fieldset.

In the editor they are in the palette under **UI · Form** and **UI · Display**.

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
   - `variant` (solid / subtle / surface / outline / ghost / plain for a button; outline / subtle / flushed for a field…);
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
```

It covers:

- every component registers and draws, with no console error;
- the two-way value of every form control;
- the zag widgets by pointer and keyboard;
- the theme's palettes, tokens and dark mode;
- the inspector (⛓ / ◆ on the fields, the tabs).
