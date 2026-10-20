'use strict';
// The words of docs/FORM_COMPONENTS.md. The tables are made from the components' own definitions (scripts/make-form-docs.js reads them in a browser), so no
// property can be missing; what this file adds is what each property is FOR. A property whose meaning differs between components has its own line, "<component>.<key>".
// test/docs-form.test.js fails when a property of a form control has no line here.

// ---- properties -------------------------------------------------------------------------------------------------------
const NOTES = {
    // Data
    inputValue: 'What the control shows: a variable, a tag or the message. Empty: the control keeps its own value (starting at Default value). Bound, the control is two-way: a change the user makes is written back (see Value (write)).',
    outputValue: 'Where a change goes: a variable or a tag. Empty: it goes back to Value (read), so a control bound only to Value (read) is two-way.',
    defaultValue: 'The value the control starts with when nothing is bound to Value (read). Inside a Form it is also where the form starts from (Reset comes back to it).',

    // Field
    label: 'The text above (or left of) the control.',
    labelPosition: 'Where the label goes: above the control, or at its left.',
    helperText: 'A small line under the control. An error replaces it while there is one.',
    invalid: 'Shows the error text under the control. Bind it to a check of yours (a Logic expression). Inside a Form you rarely need it: the form shows its own errors.',
    errorText: 'The message shown while Invalid is on.',
    required: 'A * after the label, and inside a Form a rule: the field must not be empty (a Checkbox or Switch must be on). The message is Required unless you give one.',

    // Form tab
    formName: 'The name of this control\'s value inside the Form around it: `email`, or `owner.name` to make an object (`{ owner: { name } }`). Empty: the control is not part of a form. Two controls in one form cannot share a name; the second stays out. The same name in two different forms is fine.',
    requiredMessage: 'The text shown when a required field is empty. Empty: "Required" ("Must be checked" for a Checkbox or Switch).',
    ruleCode: 'A rule of your own, in JavaScript: the body of a function of `(value, values, form)`. Return `true` (or nothing) when the value is fine; return `false` or a text (the message) when it is not. `values` is every field of the form by name, so a rule can compare fields. It runs on every change, at once: it cannot wait for a server (do that with Logic: On Change, API Call, Set errors). A mistake in the code shows as the field\'s error, so it is never silently ignored.',
    ruleMessage: 'The message when the rule returns `false` (a rule that returns a text uses that text). Empty: "Not valid".',
    minLength: 'The shortest text allowed (inside a Form). Empty field (no minimum set): no rule. With a minimum, an empty field breaks it, so a form that starts empty starts invalid. Counts characters.',
    changeDebounce: 'On Change fires while the user types, once they pause this long (milliseconds). 0: on every keystroke. The written value (On Commit) is separate and fires on Enter or when the field is left.',

    // Style
    colorPalette: 'A colour family of the theme (Theme tab, Colors): the control\'s accent, focus ring and fills follow it, in light and dark.',
    size: 'xs, sm, md, lg or xl: the height, text size and spacing of the control. md is the default.',
    variant: 'The look: Filled (grey fill, a line under it; the default), Outline (a box with a border) or Flushed (only a line, no box).',
    radius: 'How round the corners are. A theme token (radii) or a number of pixels.',
    orientation: 'Items in a row or in a column.',

    // Display
    placeholder: 'The grey hint inside an empty control.',
    prefix: 'Fixed text before the value inside the box (for example a currency).',
    suffix: 'Fixed text after the value inside the box (for example a unit).',
    startIcon: 'An icon at the start of the box.',
    previewValue: 'A value shown on the canvas in the editor only, while the control has no value yet. A page never shows it.',
    inputType: 'The kind of text: text, email, url, tel or search. It sets the keyboard on a phone and the browser\'s hints, not a rule: use Pattern for a rule.',
    revealToggle: 'The eye button that shows or hides what is typed.',
    clearAfterWrite: 'Empties the password field after it is written (outside a Form). Inside a Form the password stays in the field: the form holds the value until it is sent.',
    stepper: 'The − and + buttons at the end of the box.',
    showCount: 'A character counter under the box; with Max length it shows "12 / 80".',
    showValue: 'Shows the current value next to the control.',
    unit: 'Text after the value (for example %, rpm).',
    marks: 'Values to mark under the slider track.',
    clearable: 'A × button that clears the value.',
    separator: 'The text between the start and the end of the range.',
    startPlaceholder: 'The hint in the empty start of a range.',
    endPlaceholder: 'The hint in the empty end of a range.',
    monthLayout: 'The two calendars side by side, or one above the other.',
    presets: 'A sidebar of quick ranges (today, last 7 days, this month ...).',
    opacity: 'How see-through the whole control is (0 to 1).',

    // Content
    options: 'The choices, a list of { value, label }. The value is what is written; the label is what is shown. Data can replace the list: see Options from data.',
    inputItems: 'Options from data: a variable, tag or message holding an array (strings, or objects). It replaces the Options list.',
    itemLabel: 'For options from data: the field of each object that is the label.',
    itemValue: 'For options from data: the field of each object that is the value.',
    text: 'The text of the control.',
    textPosition: 'The text after the box, or before it.',
    indeterminate: 'Draws a dash instead of empty while unchecked (a "some of them" look). It is only a look: the value stays false.',
    count: 'How many stars.',
    allowHalf: 'A half star can be chosen.',
    length: 'How many boxes.',
    kind: 'What may be typed in the boxes: digits, letters and digits, or letters.',
    mask: 'Shows dots instead of what was typed (a PIN).',
    otp: 'Lets the phone fill the code in from a one-time-code message.',
    iconLeft: 'An icon before the text.',
    iconRight: 'An icon after the text; it pushes to the far end of the button.',
    loading: 'Shows a spinner and makes the button not clickable. A Send button in a Form does this by itself while the form is being sent.',
    loadingText: 'The text shown while loading. Empty: the usual text.',

    // Behaviour
    disabled: 'The control cannot be used and looks grey. A disabled field still counts in a Form (its rules still apply).',
    readonly: 'The value is shown but cannot be changed by the user.',
    selectOnFocus: 'Selects the whole text when the user starts editing, so typing replaces it.',
    commitOnBlur: 'Outside a Form: write the value when the field is left (otherwise leaving cancels the edit and only Enter writes). Inside a Form a typed text is always kept when the field is left.',
    confirmWrite: 'Asks "Write ...?" before writing the value (outside a Form).',
    confirmText: 'The question. {value} is the new value, {old} the current one. Empty: Write "<value>"?',
    multiple: 'Several options can be chosen; the value is an array.',
    allowCustomValue: 'The user may type a text that is not an option; Enter takes it.',
    openOnClick: 'The list opens when the box is clicked (otherwise only when typing or with the arrow keys).',
    allowDuplicates: 'The same tag can be added twice.',
    editable: 'Double-click a tag to edit it.',
    clickValue: 'The value written (and sent with On Click) when the button is clicked: true, false, a number, text or JSON.',
    align: 'Where the text sits: left, center or right.',
    step: 'How much the arrow keys (and the ± buttons) change the value.',
    min: 'The smallest value. A typed number below it is refused (shown as an error; inside a Form it is the field\'s error). Inside a Form an empty number is below it too.',
    max: 'The largest value. A typed number above it is refused.',
    maxLength: 'The longest text. The box refuses more characters; inside a Form it is also a rule.',
    pattern: 'A regular expression the whole text must match. Inside a Form it is a rule shown when the form says (not at the first key). An empty field must match too: use `[0-9]*` instead of `[0-9]+` to let it stay empty.',
    patternMessage: 'The message when the text does not match Pattern.',
    decimals: 'How many decimals are shown and written. -1: as the value comes (no rounding).',
    decimalSeparator: 'The mark between the whole part and the decimals. A single "." or "," typed is always read as the decimal point.',
    thousandsSeparator: 'The mark between groups of three digits: none, comma, dot, space or apostrophe.',
    groupWhileTyping: 'Puts the thousands separator in as the user types. Off: only when the field is left.',

    // Form component
    validateOn: 'When a field\'s error appears: while the user types (default), when the field is left, or only when sending. Whether the form is valid is always known; this only decides when the user is told. After a failed Send, errors follow the typing.',
    submitOnEnter: 'Pressing Enter in a single-line field sends the form.',
    changeDelay: 'The On Change event of the form fires after the user pauses this long (milliseconds). 0: on every keystroke.',
    errorSummary: 'After a failed Send, a list of the errors appears above the fields; each name focuses its field.',
    summaryTitle: 'The title of that list.',
    outputValues: 'Where the form writes everything entered, an object by the fields\' names, at every change. Bind a variable.',
    outputErrors: 'Where the form writes the errors being shown, `{ field: message }`.',
    outputValid: 'Where the form writes `true` while every rule is met (and `false` otherwise), from the first moment.',
    outputDirty: 'Where the form writes `true` while anything differs from where the form started.',
    outputSubmitting: 'Where the form writes `true` from a valid Send until Logic ends it (the Done, Set errors or Reset action).',
    formAction: 'Inside a Form: what this button does to it: nothing, Send it (check, then On Submit or On Invalid Submit), or Reset it.',
    waitForValid: 'A Send button stays disabled until the form is valid.',

    // Granularity / date
    timeGranularity: 'How finely a range\'s boundary can be set: date only, minutes, seconds or milliseconds. The unedited start of a day is always 00:00:00.000 and the end 23:59:59.999.',
    timezoneMode: 'UTC: stored and shown in UTC. Local: shown in the operator\'s time and converted back when written.',
    outputType: 'The shape of what is written (and of the form\'s value): an ISO string, a Unix timestamp (ms or s), a formatted text, a date only or a time only.',
    format: 'The pattern of the shown text: YYYY, MM, DD, HH, mm, ss, SSS, A, Z ...',
    customRegex: 'A regular expression with named groups to read a custom text into a date (`(?<year>\\d{4})-(?<month>\\d{2})-(?<day>\\d{2})`).',
    unitPreset: 'Which parts of a date the picker has: date and time, with seconds, date only, time only, year and month, or custom.',
    showYear: 'Custom: the year part.',
    showMonth: 'Custom: the month part.',
    showDay: 'Custom: the day part.',
    showHours: 'Custom: the hours part.',
    showMinutes: 'Custom: the minutes part.',
    showSeconds: 'The seconds part.',
    showMs: 'The milliseconds part (only with seconds on); for data recorded at that resolution.',
    inputStart: 'The start of the range: a variable, tag or message holding a date (a date, an ISO text, a timestamp or a formatted text).',
    inputEnd: 'The end of the range, like Start Date (read).',
    inputRange: 'Both ends at once: `{ start, end }` or `[start, end]`.',
    outputStart: 'Where the start is written, in the Write output format.',
    outputEnd: 'Where the end is written.',
    outputRange: 'Where both are written as `{ start, end }`.',
    defaultStart: 'The start used when nothing is bound.',
    defaultEnd: 'The end used when nothing is bound.',

    // Custom CSS
    css: 'Your own CSS for this control. Empty: the control\'s own look. Load CSS puts its CSS here to edit; what is saved is applied after it, so it wins.',
    cssRoot: 'Custom CSS for the outermost box of the control (part "root").',
    cssLabel: 'Custom CSS for the label (part "label").',
    cssControl: 'Custom CSS for the control itself (part "control").',
    cssHelper: 'Custom CSS for the helper / error line (part "helper").',
    cssBox: 'Custom CSS for the box around the text (part "box").',
    cssForm: 'Custom CSS for the form box (part "form").',
    cssSummary: 'Custom CSS for the list of errors (part "summary").',
    cssIndicator: 'Custom CSS for the check mark or circle (part "indicator").',
    cssItem: 'Custom CSS for one option (part "item").',
    cssMenu: 'Custom CSS for the open list (part "menu").',
    cssPopover: 'Custom CSS for the open calendar (part "popover").',
    cssStar: 'Custom CSS for one star (part "star").',
    cssStepper: 'Custom CSS for the − and + buttons (part "stepper").',
    cssTag: 'Custom CSS for one tag (part "tag").',
    cssText: 'Custom CSS for the control\'s text (part "text").',
    cssThumb: 'Custom CSS for the slider handle (part "thumb").',
    cssTrack: 'Custom CSS for the slider track (part "track").'
};

// the same key with another meaning in one component
const BY_COMPONENT = {
    'button.text': 'The words on the button.',
    'checkbox.text': 'The words next to the box.',
    'switch.text': 'The words next to the switch.',
    'button.align': 'Where the text sits in the button: start or center.',
    'button.disabled': 'The button cannot be clicked. Inside a Form, a Send button can also wait for the form to be valid (Disabled until the form is valid).',
    'slider.step': 'The size of one move of the handle (and of the arrow keys).',
    'slider.min': 'The value at the left end.',
    'slider.max': 'The value at the right end.',
    'slider.decimals': 'How many decimals are shown. -1: as it is.',
    'tags-input.max': 'The most tags allowed. 0: no limit.',
    'select.clearable': 'A × button that clears the choice.',
    'datetime.clearable': 'A × button that clears the date.',
    'daterange.clearable': 'A × button that clears the range.',
    'input.clearable': 'A × button that clears the text.',
    'textarea.maxLength': 'The longest text. With Character count it shows "12 / 80".',
    'number-input.defaultValue': 'The number the field starts with when nothing is bound (a number, or empty).',
    'radio-group.orientation': 'The options in a row or in a column.',
    'pin-input.placeholder': 'The character shown in an empty box.',
    'combobox.placeholder': 'The hint in the empty box.',
    'datetime.placeholder': 'The hint when no date is chosen.',
    'daterange.placeholder': 'The hint when no range is chosen.'
};

// ---- components ---------------------------------------------------------------------------------------------------------
// intro: what it is for. value: what the form gets from it. recipe: a short way to use it.
const COMPONENTS = {
    form: {
        intro: 'A container that makes the controls inside it one form. It knows their values, which of them are wrong and why, whether the form can be sent and whether anything changed since it started. Drop it, then drop controls into its slot (its auto layout is a column).',
        value: 'It holds the form: `values` (an object by the fields\' names), `errors`, `valid`, `dirty`, `submitting`. See "What the form gives you" in FORM.md.',
        recipe: 'FORM.md, the cookbook: every recipe starts from a Form.'
    },
    input: {
        intro: 'A one-line text box.',
        value: 'A text. Empty is an empty text.',
        recipe: 'Name `email`, Kind `email`, Required, Pattern `[^@ ]+@[^@ ]+` with the message "Not an email".'
    },
    textarea: {
        intro: 'A text box of several lines. Enter makes a new line; Ctrl+Enter writes it.',
        value: 'A text (lines separated by newlines).',
        recipe: 'A "remarks" field: Max length 500, Character count on, not required.'
    },
    'number-input': {
        intro: 'A number box with − and + buttons, limits, decimals and thousands separators.',
        value: 'A number, or empty (null) when the box is empty. Text that is not a number is the field\'s own error.',
        recipe: 'Quantity: Minimum 1, Step 1, Decimals 0, Required.'
    },
    'password-input': {
        intro: 'A text box that hides what is typed, with an eye button to show it.',
        value: 'The text typed. Inside a Form it stays in the field until the form is sent.',
        recipe: 'Rule (JavaScript): `return value.length >= 8 || "At least 8 characters"`; add an On Change node to feed a strength bar.'
    },
    checkbox: {
        intro: 'A box that is on or off.',
        value: '`true` or `false`. Required means "must be on" (for example "I agree").',
        recipe: 'Name `agree`, Required, Message "You must agree".'
    },
    switch: {
        intro: 'An on/off switch.',
        value: '`true` or `false`. Required means "must be on".',
        recipe: 'Name `power` for a machine that is started with the form.'
    },
    'radio-group': {
        intro: 'One choice out of a few, all visible.',
        value: 'The chosen option\'s value (a text).',
        recipe: 'Name `shift`, options A / B / C, Default value `A`.'
    },
    segmented: {
        intro: 'One choice out of a few, as joined buttons.',
        value: 'The chosen option\'s value (a text).',
        recipe: 'Name `mode`: Auto / Manual.'
    },
    select: {
        intro: 'A drop-down list: one choice, or several (Several at once).',
        value: 'The chosen value (a text), or an array of values with Several at once. Empty is an empty text or an empty array.',
        recipe: 'Name `line`, Required, options from data (a list of lines from an API Call).'
    },
    combobox: {
        intro: 'A box you can type in that filters a list of options as you type.',
        value: 'The chosen value (a text). With Any text on, whatever was typed.',
        recipe: 'Name `product`: type "mix" to find "Mixer 1". Options from data for a long list.'
    },
    slider: {
        intro: 'A handle on a track for a number between a minimum and a maximum.',
        value: 'A number.',
        recipe: 'Name `speed`, 0 to 1500, Step 10, Unit rpm, Marks 0, 750, 1500.'
    },
    'tags-input': {
        intro: 'A box where each Enter adds a tag (a small chip).',
        value: 'An array of texts. Required means at least one tag.',
        recipe: 'Name `tags`, At most 5, Required.'
    },
    'pin-input': {
        intro: 'A row of boxes for a short code (a PIN or a one-time code).',
        value: 'The code as a text. It fires On Complete when every box is filled.',
        recipe: 'Name `pin`, 4 boxes, digits, Mask on, Required; an On Complete node can send the form by itself.'
    },
    rating: {
        intro: 'Stars to give a mark.',
        value: 'A number of stars (half stars with Half stars on).',
        recipe: 'Name `stars` for a quality check, 5 stars.'
    },
    datetime: {
        intro: 'A date and time picker with a calendar, with UTC or local time.',
        value: 'What it writes: by default an ISO text (`2026-05-04T10:30:00.000Z`); the Write output format changes it (a timestamp, a formatted text). Empty is null.',
        recipe: 'Name `when`, Required, Time selection to the minute, Write output format ISO.'
    },
    daterange: {
        intro: 'A start and an end date picked together, with quick presets.',
        value: 'An object `{ start, end }` in the Write output format, or null until both are chosen.',
        recipe: 'A report filter: name `period`, Required; On Submit sends `values.period.start` and `values.period.end` to an API Call.'
    },
    button: {
        intro: 'A button. On its own it fires On Click. Inside a Form it can send or reset the form.',
        value: 'It is not a field and adds nothing to the form\'s values.',
        recipe: '"In a form, this button: Sends the form" and "Disabled until the form is valid".'
    }
};

// the properties every control has: described once in the shared section, listed by name in each component
const COMMON = ['inputValue', 'outputValue', 'defaultValue', 'label', 'labelPosition', 'helperText', 'invalid', 'errorText', 'required', 'formName', 'requiredMessage', 'ruleCode', 'ruleMessage',
    'colorPalette', 'size', 'variant', 'radius', 'disabled', 'readonly', 'placeholder', 'css', 'cssRoot', 'cssLabel', 'cssControl', 'cssHelper', 'cssBox'];

module.exports = { NOTES, BY_COMPONENT, COMPONENTS, COMMON };
