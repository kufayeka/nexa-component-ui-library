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
    .btn { all: unset; box-sizing: border-box; width: 100%; height: 100%; display: inline-flex; align-items: center; justify-content: flex-start;
        gap: var(--gap); padding: 0 var(--px); border-radius: var(--r); border: 1px solid transparent; font: inherit; font-weight: 500; letter-spacing: 0.16px;
        cursor: pointer; user-select: none; -webkit-user-select: none; white-space: nowrap; overflow: hidden; position: relative;
        transition: background-color var(--t) var(--ease), border-color var(--t) var(--ease), color var(--t) var(--ease), box-shadow var(--t) var(--ease); }
    .btn.between { justify-content: space-between; }
    .btn.center { justify-content: center; }
    .text { overflow: hidden; text-overflow: ellipsis; }
    /* Carbon's focus: a 2px ring, a 1px gap of the page between it and the fill */
    .btn:focus-visible { outline: none; border-color: var(--ring); box-shadow: inset 0 0 0 1px var(--ring), inset 0 0 0 2px var(--bg); }
    .btn:disabled { cursor: not-allowed; background: var(--bg-emph) !important; color: var(--fg-subtle) !important; border-color: transparent !important; }
    :host([data-variant="plain"]) .btn:disabled { background: transparent !important; }
    :host([data-variant="solid"]) .btn { background: var(--cp-solid); color: var(--cp-contrast); }
    :host([data-variant="solid"]) .btn:hover:not(:disabled) { background: color-mix(in srgb, var(--cp-solid) 88%, #000); }
    :host([data-variant="solid"]) .btn:active:not(:disabled) { background: var(--cp-800); }
    :host([data-variant="secondary"]) .btn { background: var(--nexa-colors-gray-700, #393939); color: var(--nexa-colors-white, #fff); }
    :host([data-variant="secondary"]) .btn:hover:not(:disabled) { background: var(--nexa-colors-gray-600, #525252); }
    :host([data-variant="secondary"]) .btn:active:not(:disabled) { background: var(--nexa-colors-gray-500, #6f6f6f); }
    :host([data-variant="outline"]) .btn { background: transparent; color: var(--cp-fg); border-color: var(--cp-fg); }
    :host([data-variant="outline"]) .btn:hover:not(:disabled) { background: var(--cp-solid); border-color: var(--cp-solid); color: var(--cp-contrast); }
    :host([data-variant="outline"]) .btn:active:not(:disabled) { background: var(--cp-800); }
    :host([data-variant="ghost"]) .btn { background: transparent; color: var(--cp-fg); }
    :host([data-variant="ghost"]) .btn:hover:not(:disabled) { background: var(--bg-muted); }
    :host([data-variant="ghost"]) .btn:active:not(:disabled) { background: var(--bg-emph); }
    :host([data-variant="subtle"]) .btn { background: var(--cp-subtle); color: var(--cp-fg); }
    :host([data-variant="subtle"]) .btn:hover:not(:disabled) { background: var(--cp-muted); }
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
        variant: variantProp([{ value: "solid", label: "Primary" }, { value: "secondary", label: "Secondary" }, { value: "outline", label: "Tertiary (outline)" },
            { value: "ghost", label: "Ghost" }, { value: "subtle", label: "Subtle" }, { value: "plain", label: "Link" }], "solid"),
        align: { type: "enum", default: "start", group: "Style", label: "Text", style: "segmented", options: [{ value: "start", label: "Start" }, { value: "center", label: "Center" }] },
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
            // Carbon: the text at the start, an icon at the far end
            const place = p.align === "center" ? "center" : (!busy && p.iconRight) ? "between" : "";
            return html`<button class="btn ${place}" part="control" type="button" ?disabled="${p.disabled || busy}" aria-busy="${busy ? "true" : "false"}"
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
    .box { flex: 1 1 auto; min-height: 0; width: 100%; display: flex; align-items: center; gap: var(--gap); position: relative;
        padding: 0 var(--px); background: var(--bg-subtle); color: var(--fg); border: none; border-bottom: 1px solid var(--bd-strong);
        border-radius: var(--r) var(--r) 0 0; overflow: hidden;
        transition: background-color var(--t) var(--ease), box-shadow var(--t) var(--ease), border-color var(--t) var(--ease); }
    .box:hover:not(.disabled):not(.readonly):not(.focused) { background: var(--bg-muted); }
    .box.textarea { align-items: stretch; padding-top: 11px; padding-bottom: 11px; }
    :host([data-variant="outline"]) .box { background: var(--bg); border: 1px solid var(--bd-strong); border-radius: var(--r); }
    :host([data-variant="flushed"]) .box { background: transparent; padding-left: 0; padding-right: 0; border-radius: 0; }
    :host([data-variant="flushed"]) .box:hover { background: transparent; }
    .box.focused, .box:focus-within { box-shadow: inset 0 0 0 2px var(--ring); border-bottom-color: transparent; }
    :host([data-variant="flushed"]) .box.focused, :host([data-variant="flushed"]) .box:focus-within { box-shadow: inset 0 -2px 0 0 var(--ring); }
    .box.invalid, .box.error, .field.invalid .box { box-shadow: inset 0 0 0 2px var(--err-bd); border-bottom-color: transparent; }
    :host([data-variant="flushed"]) .field.invalid .box { box-shadow: inset 0 -2px 0 0 var(--err-bd); }
    .box.unknown { color: var(--fg-subtle); }
    .box.pending { color: var(--fg-muted); font-style: italic; }
    .box.readonly { background: transparent; border-bottom-color: var(--bd); }
    .box.disabled, .box[aria-disabled="true"] { cursor: not-allowed; color: var(--fg-subtle); border-bottom-color: transparent; }
    input, textarea { flex: 1 1 auto; min-width: 0; width: 100%; height: 100%; border: none; outline: none; background: transparent;
        font: inherit; letter-spacing: inherit; color: inherit; text-align: inherit; padding: 0; margin: 0; }
    input:focus-visible, textarea:focus-visible { outline: none; }
    textarea { resize: none; }
    input::placeholder, textarea::placeholder { color: var(--fg-subtle); }
    .affix, .start { color: var(--fg-muted); white-space: nowrap; flex: 0 0 auto; }
    .tool { all: unset; flex: 0 0 auto; display: inline-flex; align-items: center; justify-content: center; color: var(--fg-muted); cursor: pointer;
        width: calc(var(--icon) + 12px); height: calc(var(--icon) + 12px); border-radius: var(--r); }
    .tool:hover { color: var(--fg); background: var(--bg-emph); }
    .tool:focus-visible { outline: 2px solid var(--ring); outline-offset: -2px; }
    /* Carbon's number input: − and + as two square buttons at the end */
    .stepper { flex: 0 0 auto; align-self: stretch; display: flex; margin-right: calc(var(--px) * -1); }
    .stepper button { all: unset; width: var(--h); max-width: 48px; display: flex; align-items: center; justify-content: center; color: var(--fg); cursor: pointer;
        position: relative; transition: background-color var(--t) var(--ease); }
    .stepper button::before { content: ""; position: absolute; left: 0; top: 25%; bottom: 25%; width: 1px; background: var(--bd); }
    .stepper button:hover { background: var(--bg-emph); }
    .stepper button:focus-visible { outline: 2px solid var(--ring); outline-offset: -2px; }
    .counter { flex: 0 0 auto; align-self: flex-end; font-size: var(--fs-label); color: var(--fg-subtle); font-family: var(--mono); }
`;
const TEXT_STATES = { normal: { label: "Normal" }, focus: { label: "Focus" }, invalid: { label: "Invalid" }, disabled: { label: "Disabled" } };
const textIO = {
    inputs: { value: { type: "any", label: "Value (read)", help: "What it shows: a tag, a variable, the message. Empty = a local field." } },
    outputs: { value: { fallback: "value", label: "Value (write)", help: "Written on Enter (or on leaving the field). Empty = back to Value (read): two-way." } }
};
const textProps = (codec, extra) => FieldController.properties(codec, Object.assign({}, FIELD_PROPS, {
    variant: variantProp([{ value: "filled", label: "Filled" }, { value: "outline", label: "Outline" }, { value: "flushed", label: "Flushed" }], "filled"),
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
        decimals: { type: "number", default: -1, min: -1, max: 10, step: 1, group: "Number Format", label: "Decimals", help: "Shown and written with this many decimals. -1 = as the value comes (no rounding)." },
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
                <button type="button" tabindex="-1" title="Decrease" aria-label="Decrease" @mousedown="${hold}" @click="${() => this.step(-1)}">${icon("minus")}</button>
                <button type="button" tabindex="-1" title="Increase" aria-label="Increase" @mousedown="${hold}" @click="${() => this.step(1)}">${icon("plus")}</button>
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
    .row.disabled { cursor: not-allowed; color: var(--fg-subtle); }
    .native { position: absolute; opacity: 0; width: 1px; height: 1px; margin: 0; pointer-events: none; }
    .text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .native:focus-visible + .ctl { outline: 2px solid var(--ring); outline-offset: 1px; }
    .unknown .ctl { opacity: 0.55; border-style: dashed; }
    /* checkbox: a square outlined in the text colour, filled with it when checked */
    .cb { flex: 0 0 auto; width: var(--icon); height: var(--icon); border: 1px solid var(--fg); border-radius: 2px;
        display: inline-flex; align-items: center; justify-content: center; color: transparent; background: transparent;
        transition: background-color var(--t) var(--ease), border-color var(--t) var(--ease); }
    .cb .icon svg { width: calc(var(--icon) - 2px); height: calc(var(--icon) - 2px); stroke-width: 3; }
    .checked .cb, .mixed .cb { background: var(--fg); border-color: var(--fg); color: var(--bg); }
    :host([data-variant="brand"]) .checked .cb, :host([data-variant="brand"]) .mixed .cb { background: var(--cp-solid); border-color: var(--cp-solid); color: var(--cp-contrast); }
    .disabled .cb { border-color: var(--bd-strong); }
    .disabled.checked .cb { background: var(--bd-strong); }
    /* switch (Carbon's toggle): a pill, green when on */
    .sw { flex: 0 0 auto; width: calc(var(--icon) * 3); height: calc(var(--icon) * 1.5); border-radius: 9999px; background: var(--bd-strong);
        position: relative; transition: background-color var(--t) var(--ease); }
    .sw::after { content: ""; position: absolute; top: 3px; left: 3px; width: calc(var(--icon) * 1.5 - 6px); height: calc(var(--icon) * 1.5 - 6px);
        border-radius: 50%; background: var(--nexa-colors-white, #fff); transition: transform var(--t) var(--ease); }
    .checked .sw { background: var(--cp-solid); }
    .checked .sw::after { transform: translateX(calc(var(--icon) * 1.5)); }
    .disabled .sw { background: var(--bg-emph); }
    .disabled .sw::after { background: var(--bd); }
    .native:focus-visible + .sw { outline: none; box-shadow: 0 0 0 1px var(--bg), 0 0 0 3px var(--ring); }
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
    properties: Object.assign(boolProps("Checkbox", [{ value: "neutral", label: "Neutral" }, { value: "brand", label: "Palette" }], "neutral"), {
        indeterminate: { type: "boolean", default: false, group: "Content", label: "Indeterminate (–) while unchecked" }
    }),
    events: VALUE_EVENTS, parts: Object.assign({}, FIELD_PARTS, { text: part("Its text", "text") }),
    view: class extends BoolView { kind() { return "checkbox"; } }
});
export const switchControl = defineComponent({
    ...common, ...boolIO,
    id: PREFIX + "switch", label: "Switch", icon: "fa fa-toggle-on", size: { w: 160, h: 32 },
    properties: Object.assign(boolProps("Switch", [{ value: "solid", label: "Solid" }], "solid"), { colorPalette: paletteProp("green") }),
    events: VALUE_EVENTS, parts: Object.assign({}, FIELD_PARTS, { text: part("Its text", "text") }),
    view: class extends BoolView { static palette = "green"; kind() { return "switch"; } }
});

// =================================================================================================
// Radio Group, Segmented Control
// =================================================================================================
const CHOICE_CSS = css`
    .group { display: flex; flex-wrap: wrap; gap: var(--gap) calc(var(--px) * 1.5); min-width: 0; }
    .group.vertical { flex-direction: column; gap: var(--gap); }
    .item { display: inline-flex; align-items: center; gap: var(--gap); cursor: pointer; user-select: none; position: relative; min-width: 0; }
    .item.disabled { cursor: not-allowed; color: var(--fg-subtle); }
    .native { position: absolute; opacity: 0; width: 1px; height: 1px; margin: 0; pointer-events: none; }
    .dot { flex: 0 0 auto; width: calc(var(--icon) + 2px); height: calc(var(--icon) + 2px); border-radius: 50%; border: 1px solid var(--fg);
        display: inline-flex; align-items: center; justify-content: center; transition: border-color var(--t) var(--ease); }
    .dot::after { content: ""; width: 50%; height: 50%; border-radius: 50%; background: transparent; transition: background-color var(--t) var(--ease); }
    .checked .dot::after { background: var(--fg); }
    :host([data-variant="brand"]) .checked .dot { border-color: var(--cp-solid); }
    :host([data-variant="brand"]) .checked .dot::after { background: var(--cp-solid); }
    .disabled .dot { border-color: var(--bd-strong); }
    .native:focus-visible + .dot { outline: 2px solid var(--ring); outline-offset: 1px; }
    .text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    /* segmented (Carbon's content switcher): outlined segments, the chosen one inverted */
    .seg { flex: 1 1 auto; min-height: 0; display: flex; border: 1px solid var(--bd-strong); border-radius: var(--r); overflow: hidden; }
    .seg .item { flex: 1 1 0; justify-content: center; color: var(--fg-muted); padding: 0 var(--px); transition: background-color var(--t) var(--ease), color var(--t) var(--ease); }
    .seg .item + .item { border-left: 1px solid var(--bd-strong); }
    .seg .item:hover:not(.disabled):not(.checked) { background: var(--bg-muted); color: var(--fg); }
    .seg .item.checked { background: var(--fg); color: var(--bg); }
    :host([data-variant="brand"]) .seg .item.checked { background: var(--cp-solid); color: var(--cp-contrast); }
    .seg-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .seg .item:has(.native:focus-visible) { box-shadow: inset 0 0 0 2px var(--ring); }
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
        variant: variantProp([{ value: "neutral", label: "Neutral" }, { value: "brand", label: "Palette" }], "neutral")
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
        variant: variantProp([{ value: "neutral", label: "Neutral (inverted)" }, { value: "brand", label: "Palette" }], "neutral"),
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
    .chev { color: var(--fg); transition: transform var(--t) var(--ease); }
    [data-state="open"] .chev { transform: rotate(180deg); }
    .positioner { z-index: var(--nexa-zIndex-popover, 1500); }
    .menu { margin: 0; padding: 0; list-style: none; background: var(--panel); color: var(--fg); border-radius: 0 0 var(--r) var(--r);
        box-shadow: var(--nexa-shadows-md, 0 2px 6px rgba(0,0,0,0.3)); max-height: 264px; overflow-y: auto; outline: none; min-width: 120px; }
    .menu[hidden] { display: none; }
    .opt { display: flex; align-items: center; gap: var(--gap); min-height: var(--h); padding: 0 var(--px); cursor: pointer; user-select: none; position: relative; color: var(--fg-muted); }
    .opt + .opt::before { content: ""; position: absolute; left: var(--px); right: var(--px); top: 0; height: 1px; background: var(--bd); }
    .opt[data-highlighted] { background: var(--bg-muted); color: var(--fg); }
    .opt[data-highlighted]::before, .opt[data-highlighted] + .opt::before { background: transparent; }
    .opt[data-state="checked"] { color: var(--fg); background: var(--bg-emph); }
    .opt[data-disabled] { color: var(--fg-subtle); cursor: not-allowed; }
    .opt-text { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .opt .ind { color: var(--fg); visibility: hidden; }
    .opt[data-state="checked"] .ind { visibility: visible; }
    .empty { padding: 0 var(--px); min-height: var(--h); display: flex; align-items: center; color: var(--fg-subtle); }
`;
const menuProps = (extra) => Object.assign({}, FIELD_PROPS, OPTION_PROPS, {
    placeholder: { type: "string", default: "Select…", group: "Content", label: "Placeholder" },
    defaultValue: { type: "string", default: "", group: "Data", label: "Default value (unbound)" },
    variant: variantProp([{ value: "filled", label: "Filled" }, { value: "outline", label: "Outline" }, { value: "flushed", label: "Flushed" }], "filled"),
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
                // its menu above what comes after it; On Open / On Close
                onOpenChange: (d) => { this.lift(d.open); this.fire(d.open ? "open" : "close"); }
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
        typing = false; // the text is what the user types, not the value's label
        filtered() {
            const q = this.typing ? this.query.trim().toLowerCase() : "", all = optionsOf(this);
            return q ? all.filter((o) => o.label.toLowerCase().indexOf(q) !== -1) : all;
        }
        /** The text shown for the value (a tag, a variable, a pick): its option's label, else the value itself. */
        labelOf(v) {
            if (v === null || v === undefined || v === "") return "";
            const o = optionsOf(this).find((x) => String(x.value) === String(v));
            return o ? String(o.label) : String(v);
        }
        stopTyping() { if (this.typing || this.query) { this.typing = false; this.query = ""; this.requestUpdate(); } }
        cb = new ZagController(this, zag.combobox, () => {
            const p = this.p, v = this.vs.value;
            return {
                collection: collectionFor(this, zag.combobox, this.filtered()),
                value: v === "" || v === null ? [] : [v],
                // controlled: a value from outside (a tag) shows its label, not an empty box
                inputValue: this.typing ? this.query : this.labelOf(v),
                disabled: !!p.disabled || this.isEditor, allowCustomValue: !!p.allowCustomValue, openOnClick: p.openOnClick !== false,
                positioning: { sameWidth: true, placement: "bottom-start", strategy: "fixed" },
                onInputValueChange: (d) => {
                    if (!this.typing && d.inputValue === this.labelOf(this.vs.value)) return; // zag echoing the label
                    this.query = d.inputValue; this.typing = true;
                    this.fire("input", { text: d.inputValue }); this.requestUpdate();
                },
                onValueChange: (d) => { this.stopTyping(); if (d.value[0] !== undefined) this.vs.set(d.value[0]); },
                onOpenChange: (d) => { this.lift(d.open); if (!d.open) this.stopTyping(); }
            };
        });
        render() {
            const api = this.cb.api, p = this.p;
            const box = html`<div ${spread(api.getRootProps())} style="flex:1 1 auto;min-height:0;display:flex;flex-direction:column">
                <div ${spread(api.getControlProps())} class="box" part="box" aria-disabled="${p.disabled ? "true" : "false"}">
                    <input ${spread(api.getInputProps())} part="control" placeholder="${this.vs.unknown ? "???" : (p.placeholder || "")}"
                        @keydown="${(e) => { if (e.key === "Enter" && p.allowCustomValue && !api.highlightedValue) { this.stopTyping(); this.vs.set(e.target.value); } }}"
                        @blur="${() => { if (!p.allowCustomValue) this.stopTyping(); }}" />
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
    .top { display: flex; align-items: flex-end; gap: var(--gap); }
    .top .label { flex: 1 1 auto; }
    .row { flex: 1 1 auto; min-height: 0; display: flex; align-items: center; gap: var(--px); }
    .out { flex: 0 0 auto; min-width: calc(var(--h) * 1.6); height: var(--h); max-height: 100%; padding: 0 8px; display: inline-flex; align-items: center; justify-content: center;
        background: var(--bg-subtle); border-bottom: 1px solid var(--bd-strong); border-radius: var(--r) var(--r) 0 0; color: var(--fg); }
    .root { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; justify-content: center; gap: 4px; }
    .control { position: relative; display: flex; align-items: center; height: calc(var(--icon) + 8px); cursor: pointer; touch-action: none; }
    .track { position: relative; flex: 1 1 auto; height: 2px; background: var(--bd); }
    .range { position: absolute; top: 0; bottom: 0; background: var(--fg); }
    :host([data-variant="brand"]) .range { background: var(--cp-solid); }
    .thumb { width: 14px; height: 14px; border-radius: 50%; background: var(--fg); outline: none; transition: transform var(--t) var(--ease), box-shadow var(--t) var(--ease); }
    :host([data-variant="brand"]) .thumb { background: var(--cp-solid); }
    .thumb:hover, .thumb[data-dragging] { transform: var(--slider-thumb-transform) scale(1.43); }
    .thumb:focus-visible { box-shadow: 0 0 0 2px var(--bg), 0 0 0 4px var(--ring); transform: var(--slider-thumb-transform) scale(1.43); }
    .markers { position: relative; height: 1.3em; font-size: var(--fs-label); color: var(--fg-muted); }
    .marker { position: absolute; transform: translateX(-50%); white-space: nowrap; font-family: var(--mono); }
    [data-disabled] .range, [data-disabled] .thumb { background: var(--bd-strong); }
    [data-disabled] .control { cursor: not-allowed; }
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
        variant: variantProp([{ value: "neutral", label: "Neutral" }, { value: "brand", label: "Palette" }], "neutral"),
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
            const label = p.label ? html`<div class="top"><span class="label" part="label">${p.label}${p.required ? html`<span class="req">*</span>` : nothing}</span></div>` : nothing;
            const err = p.invalid && p.errorText ? p.errorText : "";
            return html`<div class="field" part="root">
                ${label}
                <div class="row">
                    <div ${spread(api.getRootProps())} class="root">
                        <div ${spread(api.getControlProps())} class="control" part="control">
                            <div ${spread(api.getTrackProps())} class="track" part="track"><div ${spread(api.getRangeProps())} class="range"></div></div>
                            <div ${spread(api.getThumbProps({ index: 0 }))} class="thumb" part="thumb"><input ${spread(api.getHiddenInputProps({ index: 0 }))} /></div>
                        </div>
                        ${marks.length ? html`<div ${spread(api.getMarkerGroupProps())} class="markers">${marks.map((m) => html`<span ${spread(api.getMarkerProps({ value: m }))} class="marker">${m}</span>`)}</div>` : nothing}
                    </div>
                    ${p.showValue ? html`<span class="out num" part="value">${shown}</span>` : nothing}
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
    .box.tags { flex-wrap: wrap; align-content: center; gap: 4px; padding-top: 4px; padding-bottom: 4px; padding-left: 8px; overflow-y: auto; }
    .tag { display: inline-flex; align-items: center; gap: 2px; max-width: 100%; padding: 0 4px 0 8px; height: 24px;
        border-radius: 9999px; background: var(--cp-subtle); color: var(--cp-fg); font-size: var(--fs-label); letter-spacing: 0.32px; }
    .tag[data-highlighted] { box-shadow: inset 0 0 0 2px var(--ring); }
    .tag-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .tag button { all: unset; display: inline-flex; cursor: pointer; border-radius: 50%; padding: 1px; }
    .tag button:hover { background: var(--cp-muted); }
    .tag button .icon svg { width: 12px; height: 12px; }
    .tag-edit { width: 80px; border: none; outline: none; font: inherit; background: transparent; color: inherit; }
    .tags input.entry { flex: 1 1 60px; min-width: 60px; height: 24px; }
    .pins { flex: 1 1 auto; min-height: 0; display: flex; gap: var(--gap); }
    .pin { flex: 1 1 0; min-width: 0; height: 100%; max-width: var(--h); text-align: center; border: none; border-bottom: 1px solid var(--bd-strong);
        border-radius: var(--r) var(--r) 0 0; background: var(--bg-subtle); font-family: var(--mono); font-size: 1.15em; color: var(--fg); outline: none;
        transition: box-shadow var(--t) var(--ease), background-color var(--t) var(--ease); }
    .pin:hover { background: var(--bg-muted); }
    .pin:focus { box-shadow: inset 0 0 0 2px var(--ring); border-bottom-color: transparent; }
    :host([data-variant="outline"]) .pin { background: var(--bg); border: 1px solid var(--bd-strong); border-radius: var(--r); }
    .pin[data-invalid], .field.invalid .pin { box-shadow: inset 0 0 0 2px var(--err-bd); border-bottom-color: transparent; }
    .pin::placeholder { color: var(--fg-subtle); }
    .stars { flex: 1 1 auto; min-height: 0; display: flex; align-items: center; gap: 4px; }
    .star { position: relative; width: calc(var(--icon) * 1.5); height: calc(var(--icon) * 1.5); cursor: pointer; color: var(--cp-solid); outline: none; }
    .star:focus-visible { outline: 2px solid var(--ring); border-radius: 2px; }
    .star .half { position: absolute; inset: 0; overflow: hidden; width: 50%; }
    [data-readonly] .star, [data-disabled] .star { cursor: default; }
    [data-disabled] .star { color: var(--bd-strong); }
    .rating-out { margin-left: var(--gap); color: var(--fg-muted); }
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
        variant: variantProp([{ value: "filled", label: "Filled" }, { value: "outline", label: "Outline" }, { value: "flushed", label: "Flushed" }], "filled"),
        size: sizeProp(), colorPalette: paletteProp("gray"), radius: radiusProp("md"), disabled: disabledProp()
    }),
    events: VALUE_EVENTS, parts: Object.assign({}, FIELD_PARTS, { box: part("The box", "box"), tag: part("A tag", "tag") }),
    view: class extends UIElement {
        static styles = [BASE_CSS, BOX_CSS, TAGS_CSS];
        static palette = "gray";
        // written as the tag holds it: JSON text stays JSON, comma text stays commas, an array an array
        vs = new ValueState(this, { coerce: toArray, toWrite: (arr, tag) => {
            if (typeof tag === "string") return tag.trim().charAt(0) === "[" ? JSON.stringify(arr) : arr.join(",");
            return arr;
        } });
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
        variant: variantProp([{ value: "filled", label: "Filled" }, { value: "outline", label: "Outline" }], "filled"),
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
        size: sizeProp(), colorPalette: paletteProp("yellow"), disabled: disabledProp()
    }),
    events: VALUE_EVENTS, parts: Object.assign({}, FIELD_PARTS, { star: part("A star", "star") }),
    view: class extends UIElement {
        static styles = [BASE_CSS, TAGS_CSS];
        static palette = "yellow";
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
                    ${p.showValue ? html`<span class="rating-out num">${this.vs.unknown ? "???" : api.value}</span>` : nothing}
                </div>
                <input ${spread(api.getHiddenInputProps())} />
            </div>`);
        }
    }
});
