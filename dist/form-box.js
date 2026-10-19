// Nexa UI — Form: a container that makes the controls inside it one form.
//
// Drop controls into its slot (an Input, a Number, a Select, a Checkbox ...) and give each a "Name in the form". The Form knows their values, which of them are
// wrong and why, whether the form can be sent, and whether anything changed since it started. The checks are the rules each control has (Required, a pattern, a rule
// in JavaScript ...); the engine is features/form in the dashboard. What this component adds is the way the form talks to the rest of the app:
//   - events (Logic): On Submit (only when everything is valid), On Invalid Submit, On Change, On Valid Change, On Dirty Change, On Reset;
//   - outputs: where the form writes `values`, `errors`, `valid`, `dirty` and `submitting` (variables), so a button can be disabled while the form is not valid;
//   - actions (an Update node): Validate, Submit, Reset, Set values, Set errors, Clear errors, Focus, Done.
import { html, css, nothing, createForm, FORM_ELEMENT_ATTRIBUTE } from "../../nexa-sdk/nexa-component-sdk.js";
import { CATEGORY_FORM, PREFIX, BASE_CSS, UIElement, CSS_GROUP, part, defineUI } from "./core.js";

const FORM_CSS = css`
    :host { display: block; }
    .form { box-sizing: border-box; width: 100%; height: 100%; display: flex; flex-direction: column; min-height: 0; }
    .form.design { outline: 1px dashed var(--bd-strong); outline-offset: -1px; border-radius: var(--r); }
    .tag { position: absolute; top: 0; left: 8px; transform: translateY(-50%); background: var(--bg); color: var(--fg-muted); font-size: var(--fs-label); padding: 0 6px; z-index: 1; pointer-events: none; }
    .summary { flex: 0 0 auto; margin: 0 0 8px; padding: 8px 12px; background: var(--err-bg, #fff1f1); border-left: 3px solid var(--err-bd); color: var(--fg); font-size: var(--fs-label); }
    .summary b { display: block; margin-bottom: 4px; }
    .summary ul { margin: 0; padding-left: 18px; }
    .summary a { color: inherit; text-decoration: underline; cursor: pointer; }
`;

// the form's state as it is written out, one output each
const OUTPUTS = ["values", "errors", "valid", "dirty", "submitting"];

export const form = defineUI({
    category: CATEGORY_FORM, capabilities: { resizable: true, rotatable: false, flippable: false, lockable: true }, css: "",
    id: PREFIX + "form", label: "Form", icon: "fa fa-list-alt", size: { w: 400, h: 320 },
    help: "A form: the controls inside it (each with a Name in the form) are checked together and sent together. On Submit fires only when every rule is met.",
    properties: {
        validateOn: { type: "enum", default: "change", group: "Behaviour", label: "Show errors", style: "select",
            options: [{ value: "change", label: "While the user types" }, { value: "blur", label: "When a field is left" }, { value: "submit", label: "Only when sending" }],
            help: "When a field's error appears. Whether the form is valid is always known; this only decides when the user is told. After a failed Submit, errors always follow the typing." },
        submitOnEnter: { type: "boolean", default: true, group: "Behaviour", label: "Enter in a field sends the form" },
        changeDelay: { type: "number", default: 300, min: 0, max: 5000, step: 50, group: "Behaviour", label: "On Change delay (ms)", help: "On Change fires once the user pauses this long. 0 = on every keystroke." },
        errorSummary: { type: "boolean", default: false, group: "Behaviour", label: "List the errors above the form after a failed Submit" },
        summaryTitle: { type: "string", default: "Please correct:", group: "Behaviour", label: "Title of the list", visibleWhen: (p) => !!p.errorSummary }
    },
    slots: () => [{ name: "content", label: "Fields" }],
    outputs: {
        values: { label: "Values (write)", help: "Where the form writes everything entered: an object, { email, owner: { name } } by the fields' names. Written at every change." },
        errors: { label: "Errors (write)", help: "Where it writes the errors being shown: { field: message }." },
        valid: { label: "Valid (write)", help: "Where it writes true while every rule is met. Bind a button's Disabled to the opposite to keep it off until then." },
        dirty: { label: "Changed (write)", help: "Where it writes true while anything differs from where the form started." },
        submitting: { label: "Sending (write)", help: "Where it writes true from a valid Submit until Logic says it is over (the Done, Set errors or Reset action)." }
    },
    events: {
        submit: { label: "On Submit (valid)", help: "The user sent the form and every rule is met. msg.payload = { values }. Send it somewhere (an API Call), then tell the form with Done or Set errors.", payload: { values: "object" } },
        invalidSubmit: { label: "On Invalid Submit", help: "The user tried to send the form and something is wrong.", payload: { errors: "object", values: "object" } },
        change: { label: "On Change (a field, after a pause)", help: "A field changed and the user paused. Use it for a check that needs the server, then Set errors.", payload: { name: "string", value: "any", values: "object", valid: "boolean", errors: "object" } },
        validChange: { label: "On Valid Change", payload: { valid: "boolean" } },
        dirtyChange: { label: "On Changed Change (the form differs from its start, or is back)", payload: { dirty: "boolean" } },
        reset: { label: "On Reset", payload: { values: "object" } }
    },
    actions: {
        validate: { label: "Check every rule now", help: "Shows every error, as a failed Submit does, but sends nothing." },
        submit: { label: "Send the form", help: "The same as the user pressing a Submit button: checks, then On Submit or On Invalid Submit." },
        reset: { label: "Reset", help: "Every field goes back to where the form started; errors are forgotten." },
        setValues: { label: "Set values", help: "Fills fields by name: load a record to edit. It is where the form starts from, so it is not a change.", example: "{ po: \"PO-1\", owner: { name: \"Ann\" } }" },
        setErrors: { label: "Set errors", help: "Puts a message on fields (the server refused an entry). It ends the sending. A message goes when that field is edited.", example: "{ po: \"Already used\" }" },
        clearErrors: { label: "Clear errors", help: "Removes the messages put by Set errors. msg.payload may be a list of field names." },
        focus: { label: "Focus a field", help: "The field named in msg.payload (or { name }); without one, the first field with an error.", example: "\"po\"" },
        done: { label: "Sending is over", help: "Not sending any more, and what is entered is where the form starts from. msg.payload { reset: true } empties the form too.", example: "{ reset: true }" }
    },
    parts: { form: part("The form", "form"), summary: part("The list of errors", "summary") },
    view: class extends UIElement {
        static styles = [BASE_CSS, FORM_CSS];

        snap = null;
        _watchers = new Set();
        _written = {};

        // the engine is made when the first field asks for it: the props are known by then
        get engine() {
            if (!this._engine) {
                const view = this;
                this._engine = createForm({
                    validateOn: this.p.validateOn, changeDelay: this.p.changeDelay,
                    emit: (name, payload) => view.fire(name, payload),
                    onState: (snap) => view._state(snap)
                });
            }
            return this._engine;
        }

        connectedCallback() {
            super.connectedCallback();
            this._setup();     // a form that was moved, and connects again with its context already known
        }

        disconnectedCallback() {
            super.disconnectedCallback();
            if (this._engine) { this._engine.destroy(); this._engine = null; }
            this._watchers.clear();
            this._ready = false;
            this._written = {};
            this.removeAttribute(FORM_ELEMENT_ATTRIBUTE);
            this.__nexaFormApi = null;
        }

        updated(changed) {
            super.updated(changed);
            this._setup();
            if (this._engine) this._engine.configure({ validateOn: this.p.validateOn, changeDelay: this.p.changeDelay });
        }

        // Whether this is the designer's canvas is only known once the page has given the component its context, so the form opens for its fields here, not in
        // connectedCallback (the first time that runs the component does not know yet).
        _setup() {
            if (this._ready || this.isEditor) return;
            this._ready = true;
            const view = this;
            this.setAttribute(FORM_ELEMENT_ATTRIBUTE, "");
            this.__nexaFormApi = {
                register: (name, adapter, config) => view.engine.register(name, adapter, config),
                submitOnEnter: () => !!view.p.submitOnEnter,
                requestSubmit: () => view.engine.submit(),
                action: (name) => { if (name === "submit") view.engine.submit(); else if (name === "reset") view.engine.reset(); },
                watch: (fn) => { view._watchers.add(fn); fn(view.snap || view.engine.snapshot()); return () => view._watchers.delete(fn); }
            };
            // fields that came to the page before the form could take them (or before this element did) ask again now
            queueMicrotask(() => { this.querySelectorAll("*").forEach((el) => { if (typeof el.__nexaFormJoin === "function") el.__nexaFormJoin(); }); });
        }

        // what the engine says is true now: drawn, given to the buttons, and written to the variables that were asked for
        _state(snap) {
            this.snap = snap;
            this._watchers.forEach((fn) => fn(snap));
            this.requestUpdate();
            const now = { values: snap.values, errors: snap.errors, valid: snap.valid, dirty: snap.dirty, submitting: snap.submitting };
            OUTPUTS.forEach((name) => {
                const text = JSON.stringify(now[name]);
                if (this._written[name] === text) return;
                this._written[name] = text;
                if (this.out.canWrite(name)) this.out.write(name, now[name]).catch(() => {});
            });
        }

        // ---- actions (Logic) ----
        validate() { return this.engine.check(); }
        submit() { return this.engine.submit(); }
        reset() { this.engine.reset(); }
        setValues(params) { this.engine.setValues(params && typeof params === "object" ? params : {}, params && params.asInitial === false ? { asInitial: false } : undefined); }
        setErrors(params) { this.engine.setErrors(params && typeof params === "object" ? params : {}); }
        clearErrors(params) { this.engine.clearErrors(Array.isArray(params) ? params : params && Array.isArray(params.names) ? params.names : undefined); }
        focus(params) { this.engine.focus(typeof params === "string" ? params : params && params.name); }
        done(params) { this.engine.done(params && typeof params === "object" ? params : undefined); }

        render() {
            const p = this.p, snap = this.snap;
            const errors = snap && p.errorSummary && snap.submitCount > 0 ? Object.keys(snap.errors) : [];
            return html`<div class="form ${this.isEditor ? "design" : ""}" part="form">
                ${this.isEditor ? html`<span class="tag">Form</span>` : nothing}
                ${errors.length ? html`<div class="summary" part="summary" role="alert"><b>${p.summaryTitle || "Please correct:"}</b><ul>${errors.map((name) => html`<li><a @click="${() => this.engine.focus(name)}">${name}</a>: ${snap.errors[name]}</li>`)}</ul></div>` : nothing}
                ${this.renderSlot("content", { style: "flex:1 1 auto" })}
            </div>`;
        }
    }
});
