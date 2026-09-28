// Nexa UI — form controls: Button, Input, Textarea, Number Input, Password Input, Checkbox,
// Switch, Radio Group, Segmented Control, Select, Combobox, Slider, Tags Input, Pin Input,
// Rating. Text fields run on the SDK's FieldController (edit -> validate -> write -> ack);
// the widgets with a keyboard model of their own on zag.js (from the SDK).
import { defineComponent, FieldController, html, css, nothing, zag } from "../../nexa-sdk/nexa-component-sdk.js";
import {
    CATEGORY_FORM, PREFIX, BASE_CSS, UIElement, field, FIELD_PROPS, FIELD_PARTS, CSS_GROUP, part,
    sizeProp, paletteProp, variantProp, radiusProp, disabledProp, iconProp, icon, spinner, starIcon,
    VALUE_IO, VALUE_EVENTS, ValueState, OPTION_PROPS, OPTION_INPUT, optionsOf, parseValue, num
} from "./core.js";

const { ZagController, spread } = zag;
const CAPS = { resizable: true, rotatable: false, flippable: false, lockable: true };
const common = { category: CATEGORY_FORM, capabilities: CAPS, cssGroup: CSS_GROUP, css: "" };
const boolOf = (v) => v === true || v === 1 || v === "1" || (typeof v === "string" && v.trim().toLowerCase() === "true") || v === "on";
const toArray = (v) => {
    if (Array.isArray(v)) return v.map(String);
    if (v === null || v === undefined || v === "") return [];
    if (typeof v === "string") { const t = v.trim(); if (t.charAt(0) === "[") { try { const a = JSON.parse(t); if (Array.isArray(a)) return a.map(String); } catch (e) { /* text */ } } return t.split(",").map((s) => s.trim()).filter(Boolean); }
    return [String(v)];
};

// =================================================================================================
// Button
// =================================================================================================
const BUTTON_CSS = css`
    .btn { all: unset; box-sizing: border-box; width: 100%; height: 100%; display: inline-flex; align-items: center; justify-content: center;
        gap: var(--gap); padding: 0 var(--px); border-radius: var(--r); border: 1px solid transparent; font: inherit; font-weight: 600;
        cursor: pointer; user-select: none; -webkit-user-select: none; white-space: nowrap; overflow: hidden;
        transition: background-color 0.15s, border-color 0.15s, color 0.15s, filter 0.15s; }
    .text { overflow: hidden; text-overflow: ellipsis; }
    .btn:focus-visible { outline: 2px solid var(--ring); outline-offset: 2px; }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .btn:active:not(:disabled) { transform: translateY(1px); }
    :host([data-variant="solid"]) .btn { background: var(--cp-solid); color: var(--cp-contrast); }
    :host([data-variant="solid"]) .btn:hover:not(:disabled) { background: color-mix(in srgb, var(--cp-solid) 86%, #000); }
    :host([data-variant="subtle"]) .btn { background: var(--cp-subtle); color: var(--cp-fg); }
    :host([data-variant="subtle"]) .btn:hover:not(:disabled) { background: var(--cp-muted); }
    :host([data-variant="surface"]) .btn { background: var(--cp-subtle); color: var(--cp-fg); border-color: var(--cp-muted); }
    :host([data-variant="surface"]) .btn:hover:not(:disabled) { background: var(--cp-muted); }
    :host([data-variant="outline"]) .btn { background: transparent; color: var(--cp-fg); border-color: var(--cp-border); }
    :host([data-variant="outline"]) .btn:hover:not(:disabled) { background: var(--cp-subtle); }
    :host([data-variant="ghost"]) .btn { background: transparent; color: var(--cp-fg); }
    :host([data-variant="ghost"]) .btn:hover:not(:disabled) { background: var(--cp-subtle); }
    :host([data-variant="plain"]) .btn { background: transparent; color: var(--cp-fg); padding: 0; }
    :host([data-variant="plain"]) .btn:hover:not(:disabled) { text-decoration: underline; }
`;
export const button = defineComponent({
    ...common,
    id: PREFIX + "button", label: "Button", icon: "fa fa-hand-pointer-o", size: { w: 120, h: 40 },
    help: "A button. On Click (Logic), and optionally writes a value on click (Data).",
    properties: {
        text: { type: "string", default: "Button", group: "Content", label: "Text" },
        iconLeft: iconProp("Icon before the text"),
        iconRight: iconProp("Icon after the text"),
        loading: { type: "boolean", default: false, group: "Content", label: "Loading (a spinner; not clickable)" },
        loadingText: { type: "string", default: "", group: "Content", label: "Text while loading", visibleWhen: (p) => !!p.loading },
        variant: variantProp(["solid", "subtle", "surface", "outline", "ghost", "plain"].map((v) => ({ value: v, label: v })), "solid"),
        size: sizeProp(), colorPalette: paletteProp(), radius: radiusProp("md"),
        disabled: disabledProp(),
        clickValue: { type: "string", default: "true", group: "Data", label: "Value written on click", help: "true / false / a number / text / JSON. Written to Write on click." }
    },
    outputs: { value: { label: "Write on click", help: "Where the value goes on a click (a tag, a variable). Empty = nothing is written." } },
    events: {
        click: { label: "On Click", payload: { value: "any" } },
        press: { label: "On Press (pointer down)" },
        release: { label: "On Release (pointer up)" }
    },
    parts: { control: part("The button", "control"), text: part("Its text", "text") },
    view: class extends UIElement {
        static styles = [BASE_CSS, BUTTON_CSS];
        _click() {
            if (this.isEditor || this.p.disabled || this.p.loading) return;
            const v = parseValue(this.p.clickValue);
            this.emit("click", { value: v });
            if (this.out.canWrite("value")) this.out.write("value", v).catch(() => {});
        }
        render() {
            const p = this.p, busy = !!p.loading;
            return html`<button class="btn" part="control" type="button" ?disabled="${p.disabled || busy}" aria-busy="${busy ? "true" : "false"}"
                @click="${this._click}" @pointerdown="${() => this.fire("press")}" @pointerup="${() => this.fire("release")}">
                ${busy ? spinner() : icon(p.iconLeft)}<span class="text" part="text">${busy && p.loadingText ? p.loadingText : p.text}</span>${busy ? nothing : icon(p.iconRight)}
            </button>`;
        }
    }
});

// =================================================================================================
// Text fields: Input, Textarea, Number Input, Password Input (FieldController)
// =================================================================================================
const BOX_CSS = css`
    .box { flex: 1 1 auto; min-height: 0; width: 100%; display: flex; align-items: center; gap: var(--gap);
        padding: 0 calc(var(--px) * 0.75); background: var(--bg); color: var(--fg); border: 1px solid var(--bd);
        border-radius: var(--r); overflow: hidden; transition: border-color 0.15s, box-shadow 0.15s; }
    .box.textarea { align-items: stretch; padding-top: 8px; padding-bottom: 8px; }
    :host([data-variant="subtle"]) .box { background: var(--bg-muted); border-color: transparent; }
    :host([data-variant="flushed"]) .box { border-width: 0 0 1px 0; border-radius: 0; padding-left: 0; padding-right: 0; background: transparent; }
    .box.focused, .box:focus-within { border-color: var(--cp-solid); box-shadow: 0 0 0 1px var(--cp-solid); }
    :host([data-variant="flushed"]) .box.focused, :host([data-variant="flushed"]) .box:focus-within { box-shadow: 0 1px 0 0 var(--cp-solid); }
    .box.invalid, .box.error, .field.invalid .box { border-color: var(--err-bd); }
    .box.invalid.focused, .field.invalid .box:focus-within { box-shadow: 0 0 0 1px var(--err-bd); }
    .box.unknown { color: var(--fg-subtle); }
    .box.pending { color: var(--fg-muted); font-style: italic; }
    .box.readonly { background: var(--bg-subtle); }
    .box.disabled, .box[aria-disabled="true"] { opacity: 0.5; cursor: not-allowed; }
    input, textarea { flex: 1 1 auto; min-width: 0; width: 100%; height: 100%; border: none; outline: none; background: transparent;
        font: inherit; color: inherit; text-align: inherit; padding: 0; margin: 0; }
    input:focus-visible, textarea:focus-visible { outline: none; }
    textarea { resize: none; }
    input::placeholder, textarea::placeholder { color: var(--fg-subtle); }
    .affix, .start { color: var(--fg-muted); white-space: nowrap; flex: 0 0 auto; }
    .tool { all: unset; flex: 0 0 auto; display: inline-flex; align-items: center; justify-content: center; color: var(--fg-muted); cursor: pointer; border-radius: 4px; }
    .tool:hover { color: var(--fg); }
    .stepper { flex: 0 0 auto; align-self: stretch; display: flex; flex-direction: column; margin-right: calc(var(--px) * -0.75); border-left: 1px solid var(--bd); }
    .stepper button { all: unset; flex: 1 1 0; display: flex; align-items: center; justify-content: center; padding: 0 6px; color: var(--fg-muted); cursor: pointer; }
    .stepper button + button { border-top: 1px solid var(--bd); }
    .stepper button:hover { background: var(--bg-muted); color: var(--fg); }
    .counter { flex: 0 0 auto; align-self: flex-end; font-size: 0.8em; color: var(--fg-subtle); }
`;
const TEXT_STATES = { normal: { label: "Normal" }, focus: { label: "Focus" }, invalid: { label: "Invalid" }, disabled: { label: "Disabled" } };
const textIO = {
    inputs: { value: { type: "any", label: "Value (read)", help: "What it shows: a tag, a variable, the message. Empty = a local field." } },
    outputs: { value: { fallback: "value", label: "Value (write)", help: "Written on Enter (or on leaving the field). Empty = back to Value (read): two-way." } }
};
const textProps = (codec, extra) => FieldController.properties(codec, Object.assign({}, FIELD_PROPS, {
    variant: variantProp([{ value: "outline", label: "Outline" }, { value: "subtle", label: "Subtle" }, { value: "flushed", label: "Flushed" }], "outline"),
    size: sizeProp(), colorPalette: paletteProp(), radius: radiusProp("md"),
    startIcon: iconProp("Icon at the start", "", "Display"),
    defaultValue: { type: "string", default: "", group: "Data", label: "Default value (unbound)", help: "Its value until the user changes it, when Value (read) is empty." }
}, extra || {}));

class TextFieldView extends UIElement {
    static styles = [BASE_CSS, BOX_CSS];
    get control() { return this.renderRoot ? this.renderRoot.querySelector("input, textarea") : null; }
    willUpdate(changed) {
        if (super.willUpdate) super.willUpdate(changed);
        // unbound: it starts at its Default value
        const f = this.field, d = this.p.defaultValue;
        if (!this._started && !f.opts.sensitive) {
            this._started = true;
            if (!this.status("value").bound && f.s.localValue === null && d !== undefined && d !== null && String(d) !== "") {
                const r = f.codec.parse(String(d), this.p);
                if (r.ok) f.s.localValue = r.value;
            }
        }
    }
    updated(changed) { super.updated(changed); this.field.sync(this.control); }
    inputType() { return "text"; }
    tools() { return nothing; }
    render() {
        const f = this.field, p = this.p;
        const on = { focus: f.onFocus, blur: f.onBlur, input: f.onInput, keydown: f.onKeyDown };
        const ctl = f.opts.multiline
            ? html`<textarea part="control" aria-label="${p.label || nothing}" placeholder="${p.placeholder || ""}" maxlength="${f.maxLength || nothing}" ?disabled="${p.disabled}" ?readonly="${p.readonly}"
                @focus="${on.focus}" @blur="${on.blur}" @input="${on.input}" @keydown="${on.keydown}"></textarea>`
            : html`<input part="control" aria-label="${p.label || nothing}" type="${this.inputType()}" inputmode="${f.inputMode}" autocomplete="${f.opts.sensitive ? "new-password" : "off"}" spellcheck="false"
                placeholder="${p.placeholder || ""}" maxlength="${f.maxLength || nothing}" ?disabled="${p.disabled}" ?readonly="${p.readonly}"
                @focus="${on.focus}" @blur="${on.blur}" @input="${on.input}" @keydown="${on.keydown}" />`;
        const box = html`<div class="box ${f.classes}" part="box" style="text-align: ${f.align}" title="${f.message || nothing}">
            ${icon(p.startIcon, "start")}${p.prefix ? html`<span class="affix" part="prefix">${p.prefix}</span>` : nothing}
            ${ctl}${p.suffix ? html`<span class="affix" part="suffix">${p.suffix}</span>` : nothing}${this.tools()}
        </div>`;
        return field(this, box, f.message);
    }
}
const textParts = Object.assign({}, FIELD_PARTS, { box: part("The box around the text", "box") });

export const input = defineComponent({
    ...common, ...textIO,
    id: PREFIX + "input", label: "Input", icon: "fa fa-i-cursor", size: { w: 220, h: 40 },
    properties: textProps("text", {
        inputType: { type: "enum", default: "text", group: "Display", label: "Kind", options: ["text", "email", "url", "tel", "search"].map((v) => ({ value: v, label: v })) },
        clearable: { type: "boolean", default: false, group: "Display", label: "Clear button (×)" }
    }),
    events: FieldController.events(), states: TEXT_STATES, parts: textParts,
    view: class extends TextFieldView {
        field = new FieldController(this, { codec: "text" });
        inputType() { return this.p.inputType || "text"; }
        tools() {
            const f = this.field;
            if (!this.p.clearable || this.p.disabled || this.p.readonly || f.value === null || f.value === undefined || f.value === "") return nothing;
            return html`<button class="tool" type="button" tabindex="-1" title="Clear" @mousedown="${(e) => e.preventDefault()}"
                @click="${() => { if (this.isEditor) return; f.cancel(); f._write("", ""); }}">${icon("x")}</button>`;
        }
    }
});

export const textarea = defineComponent({
    ...common, ...textIO,
    id: PREFIX + "textarea", label: "Textarea", icon: "fa fa-align-left", size: { w: 260, h: 96 },
    outputs: { value: { ...textIO.outputs.value, help: "Written on Ctrl+Enter (Enter = a new line) or on leaving it. Empty = back to Value (read)." } },
    properties: textProps("text", {
        commitOnBlur: { type: "boolean", default: true, group: "Behaviour", label: "Write when it loses focus" },
        showCount: { type: "boolean", default: false, group: "Display", label: "Character count (with a max length)" }
    }),
    events: FieldController.events(), states: TEXT_STATES, parts: textParts,
    view: class extends TextFieldView {
        field = new FieldController(this, { codec: "text", multiline: true });
        tools() {
            const f = this.field;
            if (!this.p.showCount || !f.maxLength) return nothing;
            const len = f.editing && this.control ? this.control.value.length : String(f.value || "").length;
            return html`<span class="counter" part="counter">${len} / ${f.maxLength}</span>`;
        }
    }
});

export const numberInput = defineComponent({
    ...common, ...textIO,
    id: PREFIX + "number-input", label: "Number Input", icon: "fa fa-sort-numeric-asc", size: { w: 160, h: 40 },
    properties: textProps("float", {
        step: { type: "number", default: 1, min: 0, group: "Behaviour", label: "Step (± buttons, arrow keys)" },
        stepper: { type: "boolean", default: true, group: "Display", label: "± buttons" }
    }),
    events: FieldController.events(), states: TEXT_STATES, parts: Object.assign({}, textParts, { stepper: part("The ± buttons", "stepper") }),
    view: class extends TextFieldView {
        field = new FieldController(this, { codec: "float" });
        connectedCallback() {
            super.connectedCallback();
            // arrow keys step while editing
            this.listen(this.renderRoot || this, "keydown", (e) => {
                if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
                e.preventDefault();
                this.step(e.key === "ArrowUp" ? 1 : -1, true);
            });
        }
        step(dir, fromKey) {
            const f = this.field, p = this.p;
            if (this.isEditor || p.disabled || p.readonly) return;
            const cur = f.editing && this.control ? f.codec.parse(this.control.value, p) : { ok: true, value: f.value };
            let n = num(cur.ok ? cur.value : 0, 0) + dir * num(p.step, 1);
            if (p.min !== "" && isFinite(Number(p.min))) n = Math.max(Number(p.min), n);
            if (p.max !== "" && isFinite(Number(p.max))) n = Math.min(Number(p.max), n);
            const decimals = num(p.decimals, -1);
            if (decimals >= 0) n = Number(n.toFixed(decimals)); else n = Number(n.toFixed(10));
            if (fromKey && f.editing && this.control) { this.control.value = f.codec.editText(n, p); f.input(this.control.value); return; }
            f.begin();
            f.commit(f.codec.editText(n, p));
        }
        tools() {
            if (!this.p.stepper) return nothing;
            const hold = (e) => e.preventDefault();
            return html`<div class="stepper" part="stepper">
                <button type="button" tabindex="-1" title="+" @mousedown="${hold}" @click="${() => this.step(1)}">${icon("chevron-up")}</button>
                <button type="button" tabindex="-1" title="−" @mousedown="${hold}" @click="${() => this.step(-1)}">${icon("chevron-down")}</button>
            </div>`;
        }
    }
});

const { pattern: _pt, patternMessage: _pm, ...passwordText } = textProps("text");
export const passwordInput = defineComponent({
    ...common, ...textIO,
    id: PREFIX + "password-input", label: "Password Input", icon: "fa fa-key", size: { w: 220, h: 40 },
    properties: Object.assign({}, passwordText, {
        revealToggle: { type: "boolean", default: true, group: "Display", label: "Show / hide button (eye)" },
        clearAfterWrite: { type: "boolean", default: true, group: "Display", label: "Empty again after it is written" }
    }),
    events: FieldController.events(), states: TEXT_STATES, parts: textParts,
    view: class extends TextFieldView {
        field = new FieldController(this, { codec: "text", sensitive: true });
        inputType() { return this.field.revealed ? "text" : "password"; }
        tools() {
            const f = this.field;
            if (this.p.revealToggle === false) return nothing;
            return html`<button class="tool" type="button" tabindex="-1" title="${f.revealed ? "Hide" : "Show"}" @mousedown="${(e) => e.preventDefault()}"
                @click="${f.toggleReveal}">${icon(f.revealed ? "eye-off" : "eye")}</button>`;
        }
    }
});

// =================================================================================================
// Checkbox, Switch
// =================================================================================================
const CHECK_CSS = css`
    .row { display: inline-flex; align-items: center; gap: var(--gap); cursor: pointer; user-select: none; min-width: 0; max-width: 100%; position: relative; }
    .row.start { flex-direction: row-reverse; }
    .row.disabled { opacity: 0.5; cursor: not-allowed; }
    .native { position: absolute; opacity: 0; width: 1px; height: 1px; margin: 0; pointer-events: none; }
    .text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .native:focus-visible + .ctl { outline: 2px solid var(--ring); outline-offset: 2px; }
    .unknown .ctl { opacity: 0.55; border-style: dashed; }
    /* checkbox */
    .cb { flex: 0 0 auto; width: calc(var(--icon) + 4px); height: calc(var(--icon) + 4px); border: 1.5px solid var(--bd-strong); border-radius: 4px;
        display: inline-flex; align-items: center; justify-content: center; color: transparent; background: var(--bg); transition: background-color 0.15s, border-color 0.15s; }
    .cb .icon svg { width: var(--icon); height: var(--icon); stroke-width: 3; }
    .checked .cb, .mixed .cb { background: var(--cp-solid); border-color: var(--cp-solid); color: var(--cp-contrast); }
    :host([data-variant="outline"]) .checked .cb, :host([data-variant="outline"]) .mixed .cb { background: transparent; color: var(--cp-fg); }
    :host([data-variant="subtle"]) .cb { background: var(--cp-subtle); border-color: var(--cp-muted); }
    :host([data-variant="subtle"]) .checked .cb, :host([data-variant="subtle"]) .mixed .cb { background: var(--cp-subtle); border-color: var(--cp-muted); color: var(--cp-fg); }
    /* switch */
    .sw { flex: 0 0 auto; width: calc(var(--icon) * 2.25); height: calc(var(--icon) * 1.25); border-radius: 9999px; background: var(--bg-muted);
        border: 1px solid var(--bd); position: relative; transition: background-color 0.2s, border-color 0.2s; }
    .sw::after { content: ""; position: absolute; top: 50%; left: 2px; width: calc(var(--icon) * 1.25 - 6px); height: calc(var(--icon) * 1.25 - 6px);
        border-radius: 50%; background: var(--nexa-colors-white, #fff); transform: translateY(-50%); box-shadow: 0 1px 2px rgba(0,0,0,0.3); transition: left 0.2s; }
    .checked .sw { background: var(--cp-solid); border-color: var(--cp-solid); }
    .checked .sw::after { left: calc(100% - (var(--icon) * 1.25 - 6px) - 2px); }
    :host([data-variant="raised"]) .sw::after { box-shadow: 0 2px 4px rgba(0,0,0,0.35); }
`;
const boolProps = (label, variants, d) => Object.assign({}, FIELD_PROPS, {
    text: { type: "string", default: label, group: "Content", label: "Text next to it" },
    textPosition: { type: "enum", default: "end", group: "Content", label: "Text", style: "segmented", options: [{ value: "end", label: "After" }, { value: "start", label: "Before" }] },
    defaultValue: { type: "boolean", default: false, group: "Data", label: "Default value (unbound)" },
    variant: variantProp(variants, d), size: sizeProp(), colorPalette: paletteProp(),
    disabled: disabledProp(), readonly: { type: "boolean", default: false, group: "Behaviour", label: "Read-only" }
});
const boolIO = { inputs: { value: { ...VALUE_IO.inputs.value, type: "boolean" } }, outputs: VALUE_IO.outputs };
class BoolView extends UIElement {
    static styles = [BASE_CSS, CHECK_CSS];
    vs = new ValueState(this, { coerce: boolOf });
    kind() { return "checkbox"; }
    render() {
        const p = this.p, v = this.vs.value === true, mixed = this.kind() === "checkbox" && !!p.indeterminate && !v;
        const cls = [v ? "checked" : "", mixed ? "mixed" : "", this.vs.unknown ? "unknown" : "", p.disabled ? "disabled" : "", p.textPosition === "start" ? "start" : ""].join(" ");
        const ctl = this.kind() === "switch"
            ? html`<span class="ctl sw" part="control"></span>`
            : html`<span class="ctl cb" part="control">${icon(mixed ? "minus" : "check")}</span>`;
        const row = html`<label class="row ${cls}">
            <input class="native" type="checkbox" role="${this.kind() === "switch" ? "switch" : nothing}" .checked="${v}" .indeterminate="${mixed}" ?disabled="${p.disabled}"
                aria-readonly="${p.readonly ? "true" : "false"}" @click="${(e) => { if (p.readonly || this.isEditor) e.preventDefault(); }}"
                @change="${(e) => this.vs.set(e.target.checked)}" />
            ${ctl}${p.text ? html`<span class="text" part="text">${p.text}</span>` : nothing}
        </label>`;
        return field(this, html`<div style="flex:1 1 auto;display:flex;align-items:center;min-height:0">${row}</div>`);
    }
}
export const checkbox = defineComponent({
    ...common, ...boolIO,
    id: PREFIX + "checkbox", label: "Checkbox", icon: "fa fa-check-square-o", size: { w: 160, h: 32 },
    properties: Object.assign(boolProps("Checkbox", [{ value: "solid", label: "Solid" }, { value: "outline", label: "Outline" }, { value: "subtle", label: "Subtle" }], "solid"), {
        indeterminate: { type: "boolean", default: false, group: "Content", label: "Indeterminate (–) while unchecked" }
    }),
    events: VALUE_EVENTS, parts: Object.assign({}, FIELD_PARTS, { text: part("Its text", "text") }),
    view: class extends BoolView { kind() { return "checkbox"; } }
});
export const switchControl = defineComponent({
    ...common, ...boolIO,
    id: PREFIX + "switch", label: "Switch", icon: "fa fa-toggle-on", size: { w: 160, h: 32 },
    properties: boolProps("Switch", [{ value: "solid", label: "Solid" }, { value: "raised", label: "Raised" }], "solid"),
    events: VALUE_EVENTS, parts: Object.assign({}, FIELD_PARTS, { text: part("Its text", "text") }),
    view: class extends BoolView { kind() { return "switch"; } }
});

// =================================================================================================
// Radio Group, Segmented Control
// =================================================================================================
const CHOICE_CSS = css`
    .group { display: flex; gap: calc(var(--gap) * 1.5); min-width: 0; }
    .group.vertical { flex-direction: column; gap: var(--gap); }
    .item { display: inline-flex; align-items: center; gap: var(--gap); cursor: pointer; user-select: none; position: relative; min-width: 0; }
    .item.disabled { opacity: 0.5; cursor: not-allowed; }
    .native { position: absolute; opacity: 0; width: 1px; height: 1px; margin: 0; pointer-events: none; }
    .dot { flex: 0 0 auto; width: calc(var(--icon) + 4px); height: calc(var(--icon) + 4px); border-radius: 50%; border: 1.5px solid var(--bd-strong);
        background: var(--bg); display: inline-flex; align-items: center; justify-content: center; transition: border-color 0.15s, background-color 0.15s; }
    .dot::after { content: ""; width: 45%; height: 45%; border-radius: 50%; background: transparent; }
    .checked .dot { border-color: var(--cp-solid); background: var(--cp-solid); }
    .checked .dot::after { background: var(--cp-contrast); }
    :host([data-variant="outline"]) .checked .dot { background: var(--bg); }
    :host([data-variant="outline"]) .checked .dot::after { background: var(--cp-solid); }
    :host([data-variant="subtle"]) .checked .dot { background: var(--cp-subtle); border-color: var(--cp-muted); }
    :host([data-variant="subtle"]) .checked .dot::after { background: var(--cp-fg); }
    .native:focus-visible + .dot, .native:focus-visible + .seg-text { outline: 2px solid var(--ring); outline-offset: 2px; }
    .text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    /* segmented */
    .seg { flex: 1 1 auto; min-height: 0; display: flex; padding: 3px; gap: 2px; background: var(--bg-muted); border-radius: var(--r); }
    .seg .item { flex: 1 1 0; justify-content: center; border-radius: calc(var(--r) - 2px); color: var(--fg-muted); padding: 0 var(--gap); font-weight: 500; transition: background-color 0.15s, color 0.15s; }
    .seg .item:hover:not(.disabled) { color: var(--fg); }
    .seg .item.checked { background: var(--bg); color: var(--fg); box-shadow: 0 1px 3px rgba(0,0,0,0.12); }
    :host([data-variant="solid"]) .seg .item.checked { background: var(--cp-solid); color: var(--cp-contrast); }
    .seg-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; border-radius: 3px; }
`;
const choiceProps = (extra) => Object.assign({}, FIELD_PROPS, OPTION_PROPS, {
    defaultValue: { type: "string", default: "a", group: "Data", label: "Default value (unbound)" },
    size: sizeProp(), colorPalette: paletteProp(), disabled: disabledProp()
}, extra || {});
const choiceIO = { inputs: Object.assign({ value: { ...VALUE_IO.inputs.value, type: "any" } }, OPTION_INPUT), outputs: VALUE_IO.outputs };
let radioSeq = 0;
class ChoiceView extends UIElement {
    static styles = [BASE_CSS, CHOICE_CSS];
    vs = new ValueState(this, { coerce: (v) => (v === null || v === undefined ? "" : String(v)) });
    name = "nx-ui-radio-" + (++radioSeq);
    items(opts, v, cls) {
        const p = this.p;
        return opts.map((o) => {
            const on = o.value === v, off = p.disabled || o.disabled;
            return html`<label class="item ${on ? "checked" : ""} ${off ? "disabled" : ""}" part="item">
                <input class="native" type="radio" name="${this.name}" value="${o.value}" .checked="${on}" ?disabled="${off}" @change="${() => this.vs.set(o.value)}" />
                ${cls === "seg" ? html`<span class="seg-text">${o.label}</span>` : html`<span class="dot" part="indicator"></span><span class="text">${o.label}</span>`}
            </label>`;
        });
    }
}
export const radioGroup = defineComponent({
    ...common, ...choiceIO,
    id: PREFIX + "radio-group", label: "Radio Group", icon: "fa fa-dot-circle-o", size: { w: 260, h: 40 },
    properties: choiceProps({
        orientation: { type: "enum", default: "horizontal", group: "Style", label: "Direction", style: "segmented", options: [{ value: "horizontal", label: "Row" }, { value: "vertical", label: "Column" }] },
        variant: variantProp([{ value: "solid", label: "Solid" }, { value: "outline", label: "Outline" }, { value: "subtle", label: "Subtle" }], "solid")
    }),
    events: VALUE_EVENTS, parts: Object.assign({}, FIELD_PARTS, { item: part("An option", "item"), indicator: part("Its circle", "indicator") }),
    view: class extends ChoiceView {
        render() {
            const v = this.vs.value;
            return field(this, html`<div class="group ${this.p.orientation === "vertical" ? "vertical" : ""}" role="radiogroup" part="control">${this.items(optionsOf(this), v)}</div>`);
        }
    }
});
export const segmented = defineComponent({
    ...common, ...choiceIO,
    id: PREFIX + "segmented", label: "Segmented Control", icon: "fa fa-columns", size: { w: 260, h: 40 },
    properties: choiceProps({
        variant: variantProp([{ value: "surface", label: "Surface" }, { value: "solid", label: "Solid" }], "surface"),
        radius: radiusProp("md")
    }),
    events: VALUE_EVENTS, parts: Object.assign({}, FIELD_PARTS, { item: part("A segment", "item") }),
    view: class extends ChoiceView {
        render() {
            return field(this, html`<div class="seg" role="radiogroup" part="control">${this.items(optionsOf(this), this.vs.value, "seg")}</div>`);
        }
    }
});

// =================================================================================================
// Select, Combobox (zag)
// =================================================================================================
const MENU_CSS = css`
    .trigger { all: unset; box-sizing: border-box; flex: 1 1 auto; min-width: 0; height: 100%; display: flex; align-items: center; gap: var(--gap); cursor: pointer; }
    .trigger:focus-visible { outline: none; }
    .val { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .val.placeholder { color: var(--fg-subtle); }
    .chev { color: var(--fg-muted); }
    [data-state="open"] .chev { transform: rotate(180deg); }
    .positioner { z-index: var(--nexa-zIndex-popover, 1500); }
    .menu { margin: 0; padding: 4px; list-style: none; background: var(--panel); color: var(--fg); border: 1px solid var(--bd);
        border-radius: var(--r); box-shadow: var(--nexa-shadows-lg, 0 10px 15px -3px rgba(0,0,0,0.1)); max-height: 260px; overflow-y: auto; outline: none; min-width: 120px; }
    .menu[hidden] { display: none; }
    .opt { display: flex; align-items: center; gap: var(--gap); padding: 6px 8px; border-radius: 4px; cursor: pointer; user-select: none; }
    .opt[data-highlighted] { background: var(--bg-muted); }
    .opt[data-disabled] { opacity: 0.5; cursor: not-allowed; }
    .opt-text { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .opt .ind { color: var(--cp-solid); visibility: hidden; }
    .opt[data-state="checked"] .ind { visibility: visible; }
    .empty { padding: 6px 8px; color: var(--fg-subtle); }
`;
const menuProps = (extra) => Object.assign({}, FIELD_PROPS, OPTION_PROPS, {
    placeholder: { type: "string", default: "Select…", group: "Content", label: "Placeholder" },
    defaultValue: { type: "string", default: "", group: "Data", label: "Default value (unbound)" },
    variant: variantProp([{ value: "outline", label: "Outline" }, { value: "subtle", label: "Subtle" }], "outline"),
    size: sizeProp(), colorPalette: paletteProp(), radius: radiusProp("md"), disabled: disabledProp()
}, extra || {});
const MENU_PARTS = Object.assign({}, FIELD_PARTS, { box: part("The box", "box"), menu: part("The list", "menu") });
const collectionCache = new WeakMap();
function collectionFor(el, mod, items) {
    const key = JSON.stringify(items);
    const c = collectionCache.get(el);
    if (c && c.key === key) return c.value;
    const value = mod.collection({ items, itemToValue: (o) => o.value, itemToString: (o) => o.label, isItemDisabled: (o) => !!o.disabled });
    collectionCache.set(el, { key, value });
    return value;
}
function menuList(api, items, empty) {
    return html`<div ${spread(api.getPositionerProps())} class="positioner">
        <ul ${spread(api.getContentProps())} class="menu" part="menu">
            ${items.length ? items.map((o) => html`<li ${spread(api.getItemProps({ item: o }))} class="opt" part="option">
                <span ${spread(api.getItemTextProps({ item: o }))} class="opt-text">${o.label}</span>
                <span ${spread(api.getItemIndicatorProps({ item: o }))} class="ind">${icon("check")}</span>
            </li>`) : html`<li class="empty">${empty}</li>`}
        </ul>
    </div>`;
}

export const select = defineComponent({
    ...common, ...choiceIO,
    id: PREFIX + "select", label: "Select", icon: "fa fa-caret-square-o-down", size: { w: 220, h: 40 },
    properties: menuProps({
        multiple: { type: "boolean", default: false, group: "Behaviour", label: "Several at once (the value is an array)" },
        clearable: { type: "boolean", default: false, group: "Behaviour", label: "Clear button (×)" }
    }),
    events: Object.assign({}, VALUE_EVENTS, { open: { label: "On Open" }, close: { label: "On Close" } }), parts: MENU_PARTS,
    view: class extends UIElement {
        static styles = [BASE_CSS, BOX_CSS, MENU_CSS];
        vs = new ValueState(this, { coerce: (v) => (this.p && this.p.multiple ? toArray(v) : (v === null || v === undefined ? "" : String(v))) });
        sel = new ZagController(this, zag.select, () => {
            const p = this.p, v = this.vs.value;
            return {
                collection: collectionFor(this, zag.select, optionsOf(this)),
                value: Array.isArray(v) ? v : (v === "" || v === null ? [] : [v]),
                multiple: !!p.multiple, disabled: !!p.disabled || this.isEditor, closeOnSelect: !p.multiple,
                positioning: { sameWidth: true, placement: "bottom-start", strategy: "fixed" },
                onValueChange: (d) => this.vs.set(p.multiple ? d.value : (d.value[0] === undefined ? "" : d.value[0])),
                onOpenChange: (d) => this.fire(d.open ? "open" : "close")
            };
        });
        render() {
            const api = this.sel.api, p = this.p;
            const text = api.valueAsString;
            const box = html`<div ${spread(api.getRootProps())} style="flex:1 1 auto;min-height:0;display:flex;flex-direction:column">
                <div ${spread(api.getControlProps())} class="box ${this.vs.unknown ? "unknown" : ""}" part="box" aria-disabled="${p.disabled ? "true" : "false"}">
                    <button ${spread(api.getTriggerProps())} class="trigger" part="control">
                        <span class="val ${text ? "" : "placeholder"}">${text || (this.vs.unknown ? "???" : p.placeholder)}</span>
                        <span class="chev">${icon("chevron-down")}</span>
                    </button>
                    ${p.clearable && api.hasSelectedItems && !p.disabled ? html`<button ${spread(api.getClearTriggerProps())} class="tool" title="Clear">${icon("x")}</button>` : nothing}
                </div>
                ${menuList(api, optionsOf(this), "No options")}
            </div>`;
            return field(this, box);
        }
    }
});

export const combobox = defineComponent({
    ...common, ...choiceIO,
    id: PREFIX + "combobox", label: "Combobox", icon: "fa fa-search", size: { w: 220, h: 40 },
    help: "A text field that filters its options as you type.",
    properties: menuProps({
        placeholder: { type: "string", default: "Search…", group: "Content", label: "Placeholder" },
        allowCustomValue: { type: "boolean", default: false, group: "Behaviour", label: "Any text (not only an option): Enter takes what is typed" },
        openOnClick: { type: "boolean", default: true, group: "Behaviour", label: "Open on a click" }
    }),
    events: Object.assign({}, VALUE_EVENTS, { input: { label: "On Typing", payload: { text: "string" } } }), parts: MENU_PARTS,
    view: class extends UIElement {
        static styles = [BASE_CSS, BOX_CSS, MENU_CSS];
        vs = new ValueState(this, { coerce: (v) => (v === null || v === undefined ? "" : String(v)) });
        query = "";
        filtered() {
            const q = this.query.trim().toLowerCase(), all = optionsOf(this);
            return q ? all.filter((o) => o.label.toLowerCase().indexOf(q) !== -1) : all;
        }
        cb = new ZagController(this, zag.combobox, () => {
            const p = this.p, v = this.vs.value;
            return {
                collection: collectionFor(this, zag.combobox, this.filtered()),
                value: v === "" || v === null ? [] : [v],
                disabled: !!p.disabled || this.isEditor, allowCustomValue: !!p.allowCustomValue, openOnClick: p.openOnClick !== false,
                positioning: { sameWidth: true, placement: "bottom-start", strategy: "fixed" },
                onInputValueChange: (d) => { this.query = d.inputValue; this.fire("input", { text: d.inputValue }); this.requestUpdate(); },
                onValueChange: (d) => { if (d.value[0] !== undefined) this.vs.set(d.value[0]); }
            };
        });
        render() {
            const api = this.cb.api, p = this.p;
            const box = html`<div ${spread(api.getRootProps())} style="flex:1 1 auto;min-height:0;display:flex;flex-direction:column">
                <div ${spread(api.getControlProps())} class="box" part="box" aria-disabled="${p.disabled ? "true" : "false"}">
                    <input ${spread(api.getInputProps())} part="control" placeholder="${p.placeholder || ""}"
                        @keydown="${(e) => { if (e.key === "Enter" && p.allowCustomValue && !api.highlightedValue) this.vs.set(e.target.value); }}" />
                    <button ${spread(api.getTriggerProps())} class="tool chev">${icon("chevron-down")}</button>
                </div>
                ${menuList(api, this.filtered(), "Nothing matches")}
            </div>`;
            return field(this, box);
        }
    }
});

// =================================================================================================
// Slider (zag)
// =================================================================================================
const SLIDER_CSS = css`
    .top { display: flex; align-items: baseline; gap: var(--gap); }
    .top .label { flex: 1 1 auto; }
    .out { font-variant-numeric: tabular-nums; color: var(--fg-muted); }
    .root { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; justify-content: center; gap: 6px; }
    .control { position: relative; display: flex; align-items: center; height: calc(var(--icon) + 4px); cursor: pointer; touch-action: none; }
    .track { position: relative; flex: 1 1 auto; height: calc(var(--icon) * 0.35); border-radius: 9999px; background: var(--bg-emph); overflow: hidden; }
    .range { position: absolute; top: 0; bottom: 0; background: var(--cp-solid); border-radius: inherit; }
    .thumb { width: calc(var(--icon) + 4px); height: calc(var(--icon) + 4px); border-radius: 50%; background: var(--nexa-colors-white, #fff);
        border: 2px solid var(--cp-solid); box-shadow: 0 1px 3px rgba(0,0,0,0.25); outline: none; }
    .thumb:focus-visible { box-shadow: 0 0 0 3px color-mix(in srgb, var(--ring) 40%, transparent); }
    :host([data-variant="solid"]) .thumb { background: var(--cp-solid); border-color: var(--nexa-colors-white, #fff); }
    .markers { position: relative; height: 1.2em; font-size: 0.8em; color: var(--fg-muted); }
    .marker { position: absolute; transform: translateX(-50%); white-space: nowrap; }
    [data-disabled] .control { opacity: 0.5; cursor: not-allowed; }
`;
export const slider = defineComponent({
    ...common, inputs: { value: { ...VALUE_IO.inputs.value, type: "number" } }, outputs: { value: { ...VALUE_IO.outputs.value, help: "Written when you let go. Empty = back to Value (read): two-way." } },
    id: PREFIX + "slider", label: "Slider", icon: "fa fa-sliders", size: { w: 240, h: 48 },
    properties: Object.assign({}, FIELD_PROPS, {
        min: { type: "number", default: 0, group: "Data", label: "Min" },
        max: { type: "number", default: 100, group: "Data", label: "Max" },
        step: { type: "number", default: 1, min: 0, group: "Data", label: "Step" },
        defaultValue: { type: "number", default: 40, group: "Data", label: "Default value (unbound)" },
        showValue: { type: "boolean", default: true, group: "Display", label: "Show the value" },
        decimals: { type: "number", default: -1, min: -1, max: 10, group: "Display", label: "Decimals shown (-1: as it is)" },
        unit: { type: "string", default: "", group: "Display", label: "Unit" },
        marks: { type: "list", default: [], group: "Display", label: "Marks (values under the track)", item: { type: "number", default: 0 } },
        variant: variantProp([{ value: "outline", label: "Outline" }, { value: "solid", label: "Solid" }], "outline"),
        size: sizeProp(), colorPalette: paletteProp(), disabled: disabledProp()
    }),
    events: Object.assign({}, VALUE_EVENTS, { slide: { label: "On Slide (while dragging)", payload: { value: "number" } } }),
    parts: Object.assign({}, FIELD_PARTS, { track: part("The track", "track"), thumb: part("The thumb", "thumb") }),
    view: class extends UIElement {
        static styles = [BASE_CSS, SLIDER_CSS];
        vs = new ValueState(this, { coerce: (v) => num(v, 0) });
        dragging = undefined;
        sl = new ZagController(this, zag.slider, () => {
            const p = this.p;
            const shown = this.dragging !== undefined ? this.dragging : num(this.vs.value, num(p.min, 0));
            return {
                min: num(p.min, 0), max: num(p.max, 100), step: num(p.step, 1) || 1, value: [shown], disabled: !!p.disabled || this.isEditor,
                thumbAlignment: "center",
                onValueChange: (d) => { this.dragging = d.value[0]; this.fire("slide", { value: d.value[0] }); this.requestUpdate(); },
                onValueChangeEnd: (d) => { this.dragging = undefined; this.vs.set(d.value[0]); }
            };
        });
        render() {
            const api = this.sl.api, p = this.p;
            const v = api.value[0];
            const shown = this.vs.unknown && this.dragging === undefined ? "???" : (num(p.decimals, -1) >= 0 ? this.format(v, { decimals: num(p.decimals, 0) }) : String(v)) + (p.unit ? " " + p.unit : "");
            const marks = (Array.isArray(p.marks) ? p.marks : []).map(Number).filter((m) => isFinite(m));
            const label = p.label || p.showValue ? html`<div class="top">
                ${p.label ? html`<span class="label" part="label">${p.label}${p.required ? html`<span class="req">*</span>` : nothing}</span>` : html`<span style="flex:1"></span>`}
                ${p.showValue ? html`<span class="out" part="value">${shown}</span>` : nothing}
            </div>` : nothing;
            const err = p.invalid && p.errorText ? p.errorText : "";
            return html`<div class="field" part="root">
                ${label}
                <div ${spread(api.getRootProps())} class="root">
                    <div ${spread(api.getControlProps())} class="control" part="control">
                        <div ${spread(api.getTrackProps())} class="track" part="track"><div ${spread(api.getRangeProps())} class="range"></div></div>
                        <div ${spread(api.getThumbProps({ index: 0 }))} class="thumb" part="thumb"><input ${spread(api.getHiddenInputProps({ index: 0 }))} /></div>
                    </div>
                    ${marks.length ? html`<div ${spread(api.getMarkerGroupProps())} class="markers">${marks.map((m) => html`<span ${spread(api.getMarkerProps({ value: m }))} class="marker">${m}</span>`)}</div>` : nothing}
                </div>
                ${err || p.helperText ? html`<div class="helper ${err ? "error" : ""}" part="helper">${err || p.helperText}</div>` : nothing}
            </div>`;
        }
    }
});

// =================================================================================================
// Tags Input, Pin Input, Rating (zag)
// =================================================================================================
const TAGS_CSS = css`
    .box.tags { flex-wrap: wrap; align-content: center; gap: 4px; padding-top: 3px; padding-bottom: 3px; overflow-y: auto; }
    .tag { display: inline-flex; align-items: center; gap: 2px; max-width: 100%; padding: 0 4px 0 8px; height: calc(var(--h) - 14px); min-height: 20px;
        border-radius: calc(var(--r) - 2px); background: var(--cp-subtle); color: var(--cp-fg); font-size: 0.9em; }
    .tag[data-highlighted] { outline: 2px solid var(--ring); }
    .tag-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .tag button { all: unset; display: inline-flex; cursor: pointer; opacity: 0.7; border-radius: 3px; }
    .tag button:hover { opacity: 1; }
    .tag-edit { width: 80px; border: none; outline: none; font: inherit; background: transparent; color: inherit; }
    .tags input.entry { flex: 1 1 60px; min-width: 60px; height: calc(var(--h) - 14px); }
    .pins { flex: 1 1 auto; min-height: 0; display: flex; gap: var(--gap); }
    .pin { flex: 1 1 0; min-width: 0; height: 100%; max-width: var(--h); text-align: center; border: 1px solid var(--bd); border-radius: var(--r); background: var(--bg);
        font: inherit; font-size: 1.15em; color: var(--fg); outline: none; transition: border-color 0.15s, box-shadow 0.15s; }
    .pin:focus { border-color: var(--cp-solid); box-shadow: 0 0 0 1px var(--cp-solid); }
    :host([data-variant="subtle"]) .pin { background: var(--bg-muted); border-color: transparent; }
    .pin[data-invalid], .field.invalid .pin { border-color: var(--err-bd); }
    .pin::placeholder { color: var(--fg-subtle); }
    .stars { flex: 1 1 auto; min-height: 0; display: flex; align-items: center; gap: 2px; }
    .star { position: relative; width: calc(var(--icon) * 1.5); height: calc(var(--icon) * 1.5); cursor: pointer; color: var(--cp-solid); outline: none; }
    .star:focus-visible { outline: 2px solid var(--ring); border-radius: 3px; }
    .star .half { position: absolute; inset: 0; overflow: hidden; width: 50%; }
    [data-readonly] .star, [data-disabled] .star { cursor: default; }
    [data-disabled] .star { opacity: 0.5; }
    .rating-out { margin-left: var(--gap); color: var(--fg-muted); font-variant-numeric: tabular-nums; }
`;
export const tagsInput = defineComponent({
    ...common, inputs: { value: { ...VALUE_IO.inputs.value, type: "any", help: "An array of texts (or text with commas). Empty = its own value." } }, outputs: VALUE_IO.outputs,
    id: PREFIX + "tags-input", label: "Tags Input", icon: "fa fa-tags", size: { w: 280, h: 40 },
    properties: Object.assign({}, FIELD_PROPS, {
        defaultValue: { type: "list", default: ["react", "lit"], group: "Data", label: "Default tags (unbound)", item: { type: "string", default: "" } },
        placeholder: { type: "string", default: "Add a tag…", group: "Content", label: "Placeholder" },
        max: { type: "number", default: 0, min: 0, group: "Behaviour", label: "At most (0 = no limit)" },
        allowDuplicates: { type: "boolean", default: false, group: "Behaviour", label: "The same tag twice" },
        editable: { type: "boolean", default: true, group: "Behaviour", label: "Double-click a tag to edit it" },
        variant: variantProp([{ value: "outline", label: "Outline" }, { value: "subtle", label: "Subtle" }], "outline"),
        size: sizeProp(), colorPalette: paletteProp(), radius: radiusProp("md"), disabled: disabledProp()
    }),
    events: VALUE_EVENTS, parts: Object.assign({}, FIELD_PARTS, { box: part("The box", "box"), tag: part("A tag", "tag") }),
    view: class extends UIElement {
        static styles = [BASE_CSS, BOX_CSS, TAGS_CSS];
        vs = new ValueState(this, { coerce: toArray });
        tg = new ZagController(this, zag.tagsInput, () => {
            const p = this.p;
            return {
                value: toArray(this.vs.value), disabled: !!p.disabled || this.isEditor, max: num(p.max, 0) > 0 ? num(p.max, 0) : Infinity,
                allowDuplicates: !!p.allowDuplicates, editable: p.editable !== false,
                onValueChange: (d) => this.vs.set(d.value.slice())
            };
        });
        render() {
            const api = this.tg.api, p = this.p;
            const box = html`<div ${spread(api.getRootProps())} style="flex:1 1 auto;min-height:0;display:flex">
                <div ${spread(api.getControlProps())} class="box tags" part="box">
                    ${api.value.map((v, i) => {
                        const ip = { index: i, value: v };
                        return html`<span ${spread(api.getItemProps(ip))}>
                            <div ${spread(api.getItemPreviewProps(ip))} class="tag" part="tag">
                                <span ${spread(api.getItemTextProps(ip))} class="tag-text">${v}</span>
                                <button ${spread(api.getItemDeleteTriggerProps(ip))}>${icon("x")}</button>
                            </div>
                            <input ${spread(api.getItemInputProps(ip))} class="tag-edit" />
                        </span>`;
                    })}
                    <input ${spread(api.getInputProps())} class="entry" part="control" placeholder="${p.placeholder || ""}" />
                </div>
                <input ${spread(api.getHiddenInputProps())} />
            </div>`;
            return field(this, box);
        }
    }
});

export const pinInput = defineComponent({
    ...common, inputs: { value: { ...VALUE_IO.inputs.value, type: "string" } }, outputs: { value: { ...VALUE_IO.outputs.value, help: "Written once every box is filled. Empty = back to Value (read)." } },
    id: PREFIX + "pin-input", label: "Pin Input", icon: "fa fa-th", size: { w: 220, h: 48 },
    properties: Object.assign({}, FIELD_PROPS, {
        length: { type: "number", default: 4, min: 1, max: 12, group: "Content", label: "Boxes" },
        kind: { type: "enum", default: "numeric", group: "Content", label: "Characters", options: [{ value: "numeric", label: "Digits" }, { value: "alphanumeric", label: "Letters & digits" }, { value: "alphabetic", label: "Letters" }] },
        mask: { type: "boolean", default: false, group: "Content", label: "Hide what is typed (••••)" },
        otp: { type: "boolean", default: false, group: "Behaviour", label: "One-time code (autofill)" },
        placeholder: { type: "string", default: "○", group: "Content", label: "Placeholder" },
        defaultValue: { type: "string", default: "", group: "Data", label: "Default value (unbound)" },
        variant: variantProp([{ value: "outline", label: "Outline" }, { value: "subtle", label: "Subtle" }], "outline"),
        size: sizeProp(), colorPalette: paletteProp(), radius: radiusProp("md"), disabled: disabledProp()
    }),
    events: Object.assign({}, VALUE_EVENTS, { complete: { label: "On Complete (every box filled)", payload: { value: "string" } } }),
    parts: Object.assign({}, FIELD_PARTS, { box: part("A box", "box") }),
    view: class extends UIElement {
        static styles = [BASE_CSS, TAGS_CSS];
        vs = new ValueState(this, { coerce: (v) => (v === null || v === undefined ? "" : String(v)) });
        chars = null;
        pi = new ZagController(this, zag.pinInput, () => {
            const p = this.p, len = Math.max(1, Math.min(12, num(p.length, 4)));
            const cur = this.chars || String(this.vs.value || "").slice(0, len).split("");
            return {
                count: len, value: cur, type: p.kind || "numeric", mask: !!p.mask, otp: !!p.otp, placeholder: p.placeholder || "",
                disabled: !!p.disabled || this.isEditor, invalid: !!p.invalid,
                // complete: every box filled (zag's own onValueComplete does not fire while controlled)
                onValueChange: (d) => {
                    this.chars = d.value.slice();
                    const code = this.chars.join("");
                    if (this.chars.length === len && this.chars.every((c) => c !== "" && c !== undefined)) {
                        if (this._done !== code) { this._done = code; this.chars = null; this.vs.set(code); this.fire("complete", { value: code }); }
                    } else this._done = null;
                    this.requestUpdate();
                }
            };
        });
        render() {
            const api = this.pi.api, len = Math.max(1, Math.min(12, num(this.p.length, 4)));
            const boxes = [];
            for (let i = 0; i < len; i++) boxes.push(html`<input ${spread(api.getInputProps({ index: i }))} class="pin" part="box" />`);
            return field(this, html`<div ${spread(api.getRootProps())} style="flex:1 1 auto;min-height:0;display:flex">
                <div ${spread(api.getControlProps())} class="pins" part="control">${boxes}</div>
                <input ${spread(api.getHiddenInputProps())} />
            </div>`);
        }
    }
});

export const rating = defineComponent({
    ...common, inputs: { value: { ...VALUE_IO.inputs.value, type: "number" } }, outputs: VALUE_IO.outputs,
    id: PREFIX + "rating", label: "Rating", icon: "fa fa-star-half-o", size: { w: 180, h: 36 },
    properties: Object.assign({}, FIELD_PROPS, {
        count: { type: "number", default: 5, min: 1, max: 20, group: "Content", label: "Stars" },
        allowHalf: { type: "boolean", default: false, group: "Behaviour", label: "Half stars" },
        readonly: { type: "boolean", default: false, group: "Behaviour", label: "Read-only (a display)" },
        showValue: { type: "boolean", default: false, group: "Display", label: "Show the value" },
        defaultValue: { type: "number", default: 3, min: 0, group: "Data", label: "Default value (unbound)" },
        size: sizeProp(), colorPalette: paletteProp("orange"), disabled: disabledProp()
    }),
    events: VALUE_EVENTS, parts: Object.assign({}, FIELD_PARTS, { star: part("A star", "star") }),
    view: class extends UIElement {
        static styles = [BASE_CSS, TAGS_CSS];
        static palette = "orange";
        vs = new ValueState(this, { coerce: (v) => num(v, 0) });
        rg = new ZagController(this, zag.ratingGroup, () => {
            const p = this.p;
            return {
                count: Math.max(1, Math.min(20, num(p.count, 5))), value: num(this.vs.value, 0), allowHalf: !!p.allowHalf,
                readOnly: !!p.readonly, disabled: !!p.disabled || this.isEditor,
                onValueChange: (d) => this.vs.set(d.value)
            };
        });
        render() {
            const api = this.rg.api, p = this.p;
            const empty = "var(--bg-muted, #f4f4f5)";
            return field(this, html`<div ${spread(api.getRootProps())} style="flex:1 1 auto;min-height:0;display:flex;align-items:center">
                <div ${spread(api.getControlProps())} class="stars" part="control">
                    ${api.items.map((index) => {
                        const st = api.getItemState({ index });
                        return html`<span ${spread(api.getItemProps({ index }))} class="star" part="star">
                            ${starIcon(st.highlighted && !st.half ? "currentColor" : empty)}
                            ${st.half ? html`<span class="half">${starIcon("currentColor")}</span>` : nothing}
                        </span>`;
                    })}
                    ${p.showValue ? html`<span class="rating-out">${this.vs.unknown ? "???" : api.value}</span>` : nothing}
                </div>
                <input ${spread(api.getHiddenInputProps())} />
            </div>`);
        }
    }
});
