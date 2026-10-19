# Form controls: every property, event and action

<!-- Written by scripts/make-form-docs.js from the components' own definitions; the words are in scripts/form-docs-notes.js. Do not edit by hand: run the script. -->

This is the reference of the **Form** and of every control a form can hold. How a form works, and what it can do for you, is in **FORM.md**; the recipes are its cookbook.

- A property is in the inspector under the tab named in its table (Data, Field, Content, Display, Style, Behaviour, Form ...).
- Almost every property can be **bound** (a variable, a tag, the message, an expression), and set per screen size; the ones in the Data tab that read or write a value are tags / variables by nature.
- Every control has **Custom CSS** (the `css` property and one for each of its parts); they are described once, below, and not repeated.

## Properties every control has

| Property | What it is for |
| --- | --- |
| Value (read) (`inputValue`) | What the control shows: a variable, a tag or the message. Empty: the control keeps its own value (starting at Default value). Bound, the control is two-way: a change the user makes is written back (see Value (write)). |
| Value (write) (`outputValue`) | Where a change goes: a variable or a tag. Empty: it goes back to Value (read), so a control bound only to Value (read) is two-way. |
| Default value (unbound) (`defaultValue`) | The value the control starts with when nothing is bound to Value (read). Inside a Form it is also where the form starts from (Reset comes back to it). |
| Label (`label`) | The text above (or left of) the control. |
| Label position (`labelPosition`) | Where the label goes: above the control, or at its left. |
| Helper text (`helperText`) | A small line under the control. An error replaces it while there is one. |
| Invalid (`invalid`) | Shows the error text under the control. Bind it to a check of yours (a Logic expression). Inside a Form you rarely need it: the form shows its own errors. |
| Error text (`errorText`) | The message shown while Invalid is on. |
| Required (a * after the label) (`required`) | A * after the label, and inside a Form a rule: the field must not be empty (a Checkbox or Switch must be on). The message is Required unless you give one. |
| Name in the form (`formName`) | The name of this control's value inside the Form around it: `email`, or `owner.name` to make an object (`{ owner: { name } }`). Empty: the control is not part of a form. Two controls in one form cannot share a name; the second stays out. The same name in two different forms is fine. |
| Message when required and empty (`requiredMessage`) | The text shown when a required field is empty. Empty: "Required" ("Must be checked" for a Checkbox or Switch). |
| Rule (JavaScript) (`ruleCode`) | A rule of your own, in JavaScript: the body of a function of `(value, values, form)`. Return `true` (or nothing) when the value is fine; return `false` or a text (the message) when it is not. `values` is every field of the form by name, so a rule can compare fields. It runs on every change, at once: it cannot wait for a server (do that with Logic: On Change, API Call, Set errors). A mistake in the code shows as the field's error, so it is never silently ignored. |
| Message when the rule says false (`ruleMessage`) | The message when the rule returns `false` (a rule that returns a text uses that text). Empty: "Not valid". |
| Colour palette (`colorPalette`) | A colour family of the theme (Theme tab, Colors): the control's accent, focus ring and fills follow it, in light and dark. |
| Size (`size`) | xs, sm, md, lg or xl: the height, text size and spacing of the control. md is the default. |
| Variant (`variant`) | The look: Filled (grey fill, a line under it; the default), Outline (a box with a border) or Flushed (only a line, no box). |
| Corner radius (`radius`) | How round the corners are. A theme token (radii) or a number of pixels. |
| Disabled (`disabled`) | The control cannot be used and looks grey. A disabled field still counts in a Form (its rules still apply). |
| Read-only (`readonly`) | The value is shown but cannot be changed by the user. |
| Placeholder (`placeholder`) | The grey hint inside an empty control. |
| Custom CSS (`css`) | Your own CSS for this control. Empty: the control's own look. Load CSS puts its CSS here to edit; what is saved is applied after it, so it wins. |
| Root CSS (`cssRoot`) | Custom CSS for the outermost box of the control (part "root"). |
| Label CSS (`cssLabel`) | Custom CSS for the label (part "label"). |
| Control CSS (`cssControl`) | Custom CSS for the control itself (part "control"). |
| Helper / error text CSS (`cssHelper`) | Custom CSS for the helper / error line (part "helper"). |
| The box around the text CSS (`cssBox`) | Custom CSS for the box around the text (part "box"). |

Not every control has every one of them: a Checkbox has no Placeholder, a Slider no Variant. Each control below lists the common ones it has.

## Form (`nexa-ui-form`)

A container that makes the controls inside it one form. It knows their values, which of them are wrong and why, whether the form can be sent and whether anything changed since it started. Drop it, then drop controls into its slot (its auto layout is a column).

**What the form gets from it:** It holds the form: `values` (an object by the fields' names), `errors`, `valid`, `dirty`, `submitting`. See "What the form gives you" in FORM.md.

**Try:** FORM.md, the cookbook: every recipe starts from a Form.

**Custom CSS:** `css`, `cssForm`, `cssSummary`.

### Data tab

| Property | Kind and default | What it is for |
| --- | --- | --- |
| Values (write) (`outputValues`) | a tag / variable to write | Where the form writes everything entered, an object by the fields' names, at every change. Bind a variable. |
| Errors (write) (`outputErrors`) | a tag / variable to write | Where the form writes the errors being shown, `{ field: message }`. |
| Valid (write) (`outputValid`) | a tag / variable to write | Where the form writes `true` while every rule is met (and `false` otherwise), from the first moment. |
| Changed (write) (`outputDirty`) | a tag / variable to write | Where the form writes `true` while anything differs from where the form started. |
| Sending (write) (`outputSubmitting`) | a tag / variable to write | Where the form writes `true` from a valid Send until Logic ends it (the Done, Set errors or Reset action). |

### Behaviour tab

| Property | Kind and default | What it is for |
| --- | --- | --- |
| Show errors (`validateOn`) | a choice: `change`, `blur`, `submit`; default `change` | When a field's error appears: while the user types (default), when the field is left, or only when sending. Whether the form is valid is always known; this only decides when the user is told. After a failed Send, errors follow the typing. |
| Enter in a field sends the form (`submitOnEnter`) | on / off; default `true` | Pressing Enter in a single-line field sends the form. |
| On Change delay (ms) (`changeDelay`) | number; default `300` | The On Change event of the form fires after the user pauses this long (milliseconds). 0: on every keystroke. |
| List the errors above the form after a failed Submit (`errorSummary`) | on / off; default `false` | After a failed Send, a list of the errors appears above the fields; each name focuses its field. |
| Title of the list (`summaryTitle`) | text; default `Please correct:` | The title of that list. |

### Events (Logic: an "On ..." node)

| Event | When | `msg.payload` |
| --- | --- | --- |
| On Submit (valid) (`submit`) | The user sent the form and every rule is met. msg.payload = { values }. Send it somewhere (an API Call), then tell the form with Done or Set errors. | `values` object |
| On Invalid Submit (`invalidSubmit`) | The user tried to send the form and something is wrong. | `errors` object, `values` object |
| On Change (a field, after a pause) (`change`) | A field changed and the user paused. Use it for a check that needs the server, then Set errors. | `name` string, `value` any, `values` object, `valid` boolean, `errors` object |
| On Valid Change (`validChange`) | The form became valid, or stopped being valid (it does not fire at the start). | `valid` boolean |
| On Changed or Unchanged (`dirtyChange`) | The form began to differ from where it started, or came back to it. | `dirty` boolean |
| On Reset (`reset`) | The form was put back to where it started. | `values` object |

### Actions (Logic: an Update node on this control)

| Action | What it does |
| --- | --- |
| Check every rule now (`validate`) | Shows every error, as a failed Submit does, but sends nothing. |
| Send the form (`submit`) | The same as the user pressing a Submit button: checks, then On Submit or On Invalid Submit. |
| Reset (`reset`) | Every field goes back to where the form started; errors are forgotten. |
| Set values (`setValues`) | Fills fields by name: load a record to edit. It is where the form starts from, so it is not a change. `msg.payload`: `{ po: "PO-1", owner: { name: "Ann" } }` |
| Set errors (`setErrors`) | Puts a message on fields (the server refused an entry). It ends the sending. A message goes when that field is edited. `msg.payload`: `{ po: "Already used" }` |
| Clear errors (`clearErrors`) | Removes the messages put by Set errors. msg.payload may be a list of field names. |
| Focus a field (`focus`) | The field named in msg.payload (or { name }); without one, the first field with an error. `msg.payload`: `"po"` |
| Sending is over (`done`) | Not sending any more, and what is entered is where the form starts from. msg.payload { reset: true } empties the form too. `msg.payload`: `{ reset: true }` |

## Input (`nexa-ui-input`)

A one-line text box.

**What the form gets from it:** A text. Empty is an empty text.

**Try:** Name `email`, Kind `email`, Required, Pattern `[^@ ]+@[^@ ]+` with the message "Not an email".

**Properties it has from the common list:** `inputValue`, `outputValue`, `formName`, `requiredMessage`, `ruleCode`, `ruleMessage`, `placeholder`, `readonly`, `disabled`, `label`, `labelPosition`, `helperText`, `invalid`, `errorText`, `required`, `variant`, `size`, `colorPalette`, `radius`, `defaultValue`.

**Custom CSS:** `css`, `cssRoot`, `cssLabel`, `cssControl`, `cssHelper`, `cssBox`.

### Data tab

| Property | Kind and default | What it is for |
| --- | --- | --- |
| Max length (`maxLength`) | number; default (empty) | The longest text. The box refuses more characters; inside a Form it is also a rule. |
| Pattern (regular expression) (`pattern`) | text; default (empty) | A regular expression the whole text must match. Inside a Form it is a rule shown when the form says (not at the first key). |
| Pattern message (`patternMessage`) | text; default (empty) | The message when the text does not match Pattern. |

### Display tab

| Property | Kind and default | What it is for |
| --- | --- | --- |
| Prefix (`prefix`) | text; default (empty) | Fixed text before the value inside the box (for example a currency). |
| Suffix (`suffix`) | text; default (empty) | Fixed text after the value inside the box (for example a unit). |
| Align (`align`) | a choice: `left`, `center`, `right`; default `left` | Where the text sits: left, center or right. |
| Preview value (editor only) (`previewValue`) | text; default (empty) | A value shown on the canvas in the editor only, while the control has no value yet. A page never shows it. |
| Icon at the start (`startIcon`) | a choice: ``, `check`, `x`, `chevron-down`, `chevron-up`, `chevron-right`, `plus`, `minus` ...; default (empty) | An icon at the start of the box. |
| Kind (`inputType`) | a choice: `text`, `email`, `url`, `tel`, `search`; default `text` | The kind of text: text, email, url, tel or search. It sets the keyboard on a phone and the browser's hints, not a rule: use Pattern for a rule. |
| Clear button (×) (`clearable`) | on / off; default `false` | A × button that clears the text. |

### Behaviour tab

| Property | Kind and default | What it is for |
| --- | --- | --- |
| Write when the field loses focus (blur) (`commitOnBlur`) | on / off; default `false` | Outside a Form: write the value when the field is left (otherwise leaving cancels the edit and only Enter writes). Inside a Form a typed text is always kept when the field is left. |
| On Change delay (ms) (`changeDebounce`) | number; default `300` | On Change fires while the user types, once they pause this long (milliseconds). 0: on every keystroke. The written value (On Commit) is separate and fires on Enter or when the field is left. |
| Ask for confirmation before writing (`confirmWrite`) | on / off; default `false` | Asks "Write ...?" before writing the value (outside a Form). |
| Confirmation text (`confirmText`) | text; default (empty) | The question. {value} is the new value, {old} the current one. Empty: Write "<value>"? |
| Select all when editing starts (`selectOnFocus`) | on / off; default `true` | Selects the whole text when the user starts editing, so typing replaces it. |
| Opacity (`opacity`) | number (a slider); default `1` | How see-through the whole control is (0 to 1). |

### Form tab

| Property | Kind and default | What it is for |
| --- | --- | --- |
| Shortest text (`minLength`) | number; default (empty) | The shortest text allowed (inside a Form). Empty: no minimum. Counts characters. |

### Events (Logic: an "On ..." node)

| Event | When | `msg.payload` |
| --- | --- | --- |
| On Change (while typing, after a short pause) (`change`) | The text changed and the user paused (the On Change delay). Fires while typing, before Enter. valid says whether what is typed is a good value. | `value` any, `text` string, `valid` boolean |
| On Commit (Enter / left the field: value written) (`commit`) | The value was accepted and written (Enter, or leaving the field when that writes). | `value` any, `text` string |
| On Invalid Input (`invalid`) | Enter was pressed on a text that is not a good value. | `text` string, `reason` string |
| On Write Error (`writeError`) | Writing the value failed. | `value` any, `error` string |
| On Focus (edit started) (`focus`) | The user started editing the field. | `value` any |
| On Blur (edit ended) (`blur`) | The user left the field. | `value` any |

## Textarea (`nexa-ui-textarea`)

A text box of several lines. Enter makes a new line; Ctrl+Enter writes it.

**What the form gets from it:** A text (lines separated by newlines).

**Try:** A "remarks" field: Max length 500, Character count on, not required.

**Properties it has from the common list:** `inputValue`, `outputValue`, `formName`, `requiredMessage`, `ruleCode`, `ruleMessage`, `placeholder`, `readonly`, `disabled`, `label`, `labelPosition`, `helperText`, `invalid`, `errorText`, `required`, `variant`, `size`, `colorPalette`, `radius`, `defaultValue`.

**Custom CSS:** `css`, `cssRoot`, `cssLabel`, `cssControl`, `cssHelper`, `cssBox`.

### Data tab

| Property | Kind and default | What it is for |
| --- | --- | --- |
| Max length (`maxLength`) | number; default (empty) | The longest text. With Character count it shows "12 / 80". |
| Pattern (regular expression) (`pattern`) | text; default (empty) | A regular expression the whole text must match. Inside a Form it is a rule shown when the form says (not at the first key). |
| Pattern message (`patternMessage`) | text; default (empty) | The message when the text does not match Pattern. |

### Display tab

| Property | Kind and default | What it is for |
| --- | --- | --- |
| Prefix (`prefix`) | text; default (empty) | Fixed text before the value inside the box (for example a currency). |
| Suffix (`suffix`) | text; default (empty) | Fixed text after the value inside the box (for example a unit). |
| Align (`align`) | a choice: `left`, `center`, `right`; default `left` | Where the text sits: left, center or right. |
| Preview value (editor only) (`previewValue`) | text; default (empty) | A value shown on the canvas in the editor only, while the control has no value yet. A page never shows it. |
| Icon at the start (`startIcon`) | a choice: ``, `check`, `x`, `chevron-down`, `chevron-up`, `chevron-right`, `plus`, `minus` ...; default (empty) | An icon at the start of the box. |
| Character count (with a max length) (`showCount`) | on / off; default `false` | A character counter under the box; with Max length it shows "12 / 80". |

### Behaviour tab

| Property | Kind and default | What it is for |
| --- | --- | --- |
| Write when it loses focus (`commitOnBlur`) | on / off; default `true` | Outside a Form: write the value when the field is left (otherwise leaving cancels the edit and only Enter writes). Inside a Form a typed text is always kept when the field is left. |
| On Change delay (ms) (`changeDebounce`) | number; default `300` | On Change fires while the user types, once they pause this long (milliseconds). 0: on every keystroke. The written value (On Commit) is separate and fires on Enter or when the field is left. |
| Ask for confirmation before writing (`confirmWrite`) | on / off; default `false` | Asks "Write ...?" before writing the value (outside a Form). |
| Confirmation text (`confirmText`) | text; default (empty) | The question. {value} is the new value, {old} the current one. Empty: Write "<value>"? |
| Select all when editing starts (`selectOnFocus`) | on / off; default `true` | Selects the whole text when the user starts editing, so typing replaces it. |
| Opacity (`opacity`) | number (a slider); default `1` | How see-through the whole control is (0 to 1). |

### Form tab

| Property | Kind and default | What it is for |
| --- | --- | --- |
| Shortest text (`minLength`) | number; default (empty) | The shortest text allowed (inside a Form). Empty: no minimum. Counts characters. |

### Events (Logic: an "On ..." node)

| Event | When | `msg.payload` |
| --- | --- | --- |
| On Change (while typing, after a short pause) (`change`) | The text changed and the user paused (the On Change delay). Fires while typing, before Enter. valid says whether what is typed is a good value. | `value` any, `text` string, `valid` boolean |
| On Commit (Enter / left the field: value written) (`commit`) | The value was accepted and written (Enter, or leaving the field when that writes). | `value` any, `text` string |
| On Invalid Input (`invalid`) | Enter was pressed on a text that is not a good value. | `text` string, `reason` string |
| On Write Error (`writeError`) | Writing the value failed. | `value` any, `error` string |
| On Focus (edit started) (`focus`) | The user started editing the field. | `value` any |
| On Blur (edit ended) (`blur`) | The user left the field. | `value` any |

## Number Input (`nexa-ui-number-input`)

A number box with − and + buttons, limits, decimals and thousands separators.

**What the form gets from it:** A number, or empty (null) when the box is empty. Text that is not a number is the field's own error.

**Try:** Quantity: Minimum 1, Step 1, Decimals 0, Required.

**Properties it has from the common list:** `inputValue`, `outputValue`, `formName`, `requiredMessage`, `ruleCode`, `ruleMessage`, `placeholder`, `readonly`, `disabled`, `label`, `labelPosition`, `helperText`, `invalid`, `errorText`, `required`, `variant`, `size`, `colorPalette`, `radius`, `defaultValue`.

**Custom CSS:** `css`, `cssRoot`, `cssLabel`, `cssControl`, `cssHelper`, `cssBox`, `cssStepper`.

### Data tab

| Property | Kind and default | What it is for |
| --- | --- | --- |
| Decimal separator (`decimalSeparator`) | a choice: `.`, `,`; default `.` | The mark between the whole part and the decimals. A single "." or "," typed is always read as the decimal point. |
| Thousands separator (`thousandsSeparator`) | a choice: ``, `,`, `.`, ` `, `'`; default (empty) | The mark between groups of three digits: none, comma, dot, space or apostrophe. |
| Group thousands while typing (`groupWhileTyping`) | on / off; default `true` | Puts the thousands separator in as the user types. Off: only when the field is left. |
| Minimum (`min`) | number; default (empty) | The smallest value. A typed number below it is refused (shown as an error; inside a Form it is the field's error). |
| Maximum (`max`) | number; default (empty) | The largest value. A typed number above it is refused. |
| Default value (unbound) (`defaultValue`) | text; default (empty) | The number the field starts with when nothing is bound (a number, or empty). |

### Display tab

| Property | Kind and default | What it is for |
| --- | --- | --- |
| Prefix (`prefix`) | text; default (empty) | Fixed text before the value inside the box (for example a currency). |
| Suffix (`suffix`) | text; default (empty) | Fixed text after the value inside the box (for example a unit). |
| Align (`align`) | a choice: `left`, `center`, `right`; default `right` | Where the text sits: left, center or right. |
| Preview value (editor only) (`previewValue`) | text; default (empty) | A value shown on the canvas in the editor only, while the control has no value yet. A page never shows it. |
| Icon at the start (`startIcon`) | a choice: ``, `check`, `x`, `chevron-down`, `chevron-up`, `chevron-right`, `plus`, `minus` ...; default (empty) | An icon at the start of the box. |
| ± buttons (`stepper`) | on / off; default `true` | The − and + buttons at the end of the box. |

### Behaviour tab

| Property | Kind and default | What it is for |
| --- | --- | --- |
| Write when the field loses focus (blur) (`commitOnBlur`) | on / off; default `false` | Outside a Form: write the value when the field is left (otherwise leaving cancels the edit and only Enter writes). Inside a Form a typed text is always kept when the field is left. |
| On Change delay (ms) (`changeDebounce`) | number; default `300` | On Change fires while the user types, once they pause this long (milliseconds). 0: on every keystroke. The written value (On Commit) is separate and fires on Enter or when the field is left. |
| Ask for confirmation before writing (`confirmWrite`) | on / off; default `false` | Asks "Write ...?" before writing the value (outside a Form). |
| Confirmation text (`confirmText`) | text; default (empty) | The question. {value} is the new value, {old} the current one. Empty: Write "<value>"? |
| Select all when editing starts (`selectOnFocus`) | on / off; default `true` | Selects the whole text when the user starts editing, so typing replaces it. |
| Opacity (`opacity`) | number (a slider); default `1` | How see-through the whole control is (0 to 1). |
| Step (± buttons, arrow keys) (`step`) | number; default `1` | How much the arrow keys (and the ± buttons) change the value. |

### Form tab

| Property | Kind and default | What it is for |
| --- | --- | --- |
| Shortest text (`minLength`) | number; default (empty) | The shortest text allowed (inside a Form). Empty: no minimum. Counts characters. |

### Number Format tab

| Property | Kind and default | What it is for |
| --- | --- | --- |
| Decimals (`decimals`) | number; default `-1` | How many decimals are shown and written. -1: as the value comes (no rounding). |

### Events (Logic: an "On ..." node)

| Event | When | `msg.payload` |
| --- | --- | --- |
| On Change (while typing, after a short pause) (`change`) | The text changed and the user paused (the On Change delay). Fires while typing, before Enter. valid says whether what is typed is a good value. | `value` any, `text` string, `valid` boolean |
| On Commit (Enter / left the field: value written) (`commit`) | The value was accepted and written (Enter, or leaving the field when that writes). | `value` any, `text` string |
| On Invalid Input (`invalid`) | Enter was pressed on a text that is not a good value. | `text` string, `reason` string |
| On Write Error (`writeError`) | Writing the value failed. | `value` any, `error` string |
| On Focus (edit started) (`focus`) | The user started editing the field. | `value` any |
| On Blur (edit ended) (`blur`) | The user left the field. | `value` any |

## Password Input (`nexa-ui-password-input`)

A text box that hides what is typed, with an eye button to show it.

**What the form gets from it:** The text typed. Inside a Form it stays in the field until the form is sent.

**Try:** Rule (JavaScript): `return value.length >= 8 || "At least 8 characters"`; add an On Change node to feed a strength bar.

**Properties it has from the common list:** `inputValue`, `outputValue`, `formName`, `requiredMessage`, `ruleCode`, `ruleMessage`, `placeholder`, `readonly`, `disabled`, `label`, `labelPosition`, `helperText`, `invalid`, `errorText`, `required`, `variant`, `size`, `colorPalette`, `radius`, `defaultValue`.

**Custom CSS:** `css`, `cssRoot`, `cssLabel`, `cssControl`, `cssHelper`, `cssBox`.

### Data tab

| Property | Kind and default | What it is for |
| --- | --- | --- |
| Max length (`maxLength`) | number; default (empty) | The longest text. The box refuses more characters; inside a Form it is also a rule. |

### Display tab

| Property | Kind and default | What it is for |
| --- | --- | --- |
| Prefix (`prefix`) | text; default (empty) | Fixed text before the value inside the box (for example a currency). |
| Suffix (`suffix`) | text; default (empty) | Fixed text after the value inside the box (for example a unit). |
| Align (`align`) | a choice: `left`, `center`, `right`; default `left` | Where the text sits: left, center or right. |
| Preview value (editor only) (`previewValue`) | text; default (empty) | A value shown on the canvas in the editor only, while the control has no value yet. A page never shows it. |
| Icon at the start (`startIcon`) | a choice: ``, `check`, `x`, `chevron-down`, `chevron-up`, `chevron-right`, `plus`, `minus` ...; default (empty) | An icon at the start of the box. |
| Show / hide button (eye) (`revealToggle`) | on / off; default `true` | The eye button that shows or hides what is typed. |
| Empty again after it is written (`clearAfterWrite`) | on / off; default `true` | Empties the password field after it is written (outside a Form). Inside a Form the password stays in the field: the form holds the value until it is sent. |

### Behaviour tab

| Property | Kind and default | What it is for |
| --- | --- | --- |
| Write when the field loses focus (blur) (`commitOnBlur`) | on / off; default `false` | Outside a Form: write the value when the field is left (otherwise leaving cancels the edit and only Enter writes). Inside a Form a typed text is always kept when the field is left. |
| On Change delay (ms) (`changeDebounce`) | number; default `300` | On Change fires while the user types, once they pause this long (milliseconds). 0: on every keystroke. The written value (On Commit) is separate and fires on Enter or when the field is left. |
| Ask for confirmation before writing (`confirmWrite`) | on / off; default `false` | Asks "Write ...?" before writing the value (outside a Form). |
| Confirmation text (`confirmText`) | text; default (empty) | The question. {value} is the new value, {old} the current one. Empty: Write "<value>"? |
| Select all when editing starts (`selectOnFocus`) | on / off; default `true` | Selects the whole text when the user starts editing, so typing replaces it. |
| Opacity (`opacity`) | number (a slider); default `1` | How see-through the whole control is (0 to 1). |

### Form tab

| Property | Kind and default | What it is for |
| --- | --- | --- |
| Shortest text (`minLength`) | number; default (empty) | The shortest text allowed (inside a Form). Empty: no minimum. Counts characters. |

### Events (Logic: an "On ..." node)

| Event | When | `msg.payload` |
| --- | --- | --- |
| On Change (while typing, after a short pause) (`change`) | The text changed and the user paused (the On Change delay). Fires while typing, before Enter. valid says whether what is typed is a good value. | `value` any, `text` string, `valid` boolean |
| On Commit (Enter / left the field: value written) (`commit`) | The value was accepted and written (Enter, or leaving the field when that writes). | `value` any, `text` string |
| On Invalid Input (`invalid`) | Enter was pressed on a text that is not a good value. | `text` string, `reason` string |
| On Write Error (`writeError`) | Writing the value failed. | `value` any, `error` string |
| On Focus (edit started) (`focus`) | The user started editing the field. | `value` any |
| On Blur (edit ended) (`blur`) | The user left the field. | `value` any |

## Checkbox (`nexa-ui-checkbox`)

A box that is on or off.

**What the form gets from it:** `true` or `false`. Required means "must be on" (for example "I agree").

**Try:** Name `agree`, Required, Message "You must agree".

**Properties it has from the common list:** `inputValue`, `outputValue`, `label`, `labelPosition`, `helperText`, `invalid`, `errorText`, `required`, `formName`, `requiredMessage`, `ruleCode`, `ruleMessage`, `defaultValue`, `variant`, `size`, `colorPalette`, `disabled`, `readonly`.

**Custom CSS:** `css`, `cssRoot`, `cssLabel`, `cssControl`, `cssHelper`, `cssText`.

### Content tab

| Property | Kind and default | What it is for |
| --- | --- | --- |
| Text next to it (`text`) | text; default `Checkbox` | The words next to the box. |
| Text (`textPosition`) | a choice: `end`, `start`; default `end` | The text after the box, or before it. |
| Indeterminate (–) while unchecked (`indeterminate`) | on / off; default `false` | Draws a dash instead of empty while unchecked (a "some of them" look). It is only a look: the value stays false. |

### Events (Logic: an "On ..." node)

| Event | When | `msg.payload` |
| --- | --- | --- |
| On Change (the user changed it) (`change`) | The user chose a value (not when it came from a variable or a tag). | `value` any |
| On Write Error (`writeError`) | Writing the value to its tag or variable failed. | `value` any, `error` string |

## Switch (`nexa-ui-switch`)

An on/off switch.

**What the form gets from it:** `true` or `false`. Required means "must be on".

**Try:** Name `power` for a machine that is started with the form.

**Properties it has from the common list:** `inputValue`, `outputValue`, `label`, `labelPosition`, `helperText`, `invalid`, `errorText`, `required`, `formName`, `requiredMessage`, `ruleCode`, `ruleMessage`, `defaultValue`, `variant`, `size`, `colorPalette`, `disabled`, `readonly`.

**Custom CSS:** `css`, `cssRoot`, `cssLabel`, `cssControl`, `cssHelper`, `cssText`.

### Content tab

| Property | Kind and default | What it is for |
| --- | --- | --- |
| Text next to it (`text`) | text; default `Switch` | The words next to the switch. |
| Text (`textPosition`) | a choice: `end`, `start`; default `end` | The text after the box, or before it. |

### Events (Logic: an "On ..." node)

| Event | When | `msg.payload` |
| --- | --- | --- |
| On Change (the user changed it) (`change`) | The user chose a value (not when it came from a variable or a tag). | `value` any |
| On Write Error (`writeError`) | Writing the value to its tag or variable failed. | `value` any, `error` string |

## Radio Group (`nexa-ui-radio-group`)

One choice out of a few, all visible.

**What the form gets from it:** The chosen option's value (a text).

**Try:** Name `shift`, options A / B / C, Default value `A`.

**Properties it has from the common list:** `inputValue`, `outputValue`, `label`, `labelPosition`, `helperText`, `invalid`, `errorText`, `required`, `formName`, `requiredMessage`, `ruleCode`, `ruleMessage`, `defaultValue`, `size`, `colorPalette`, `disabled`, `variant`.

**Custom CSS:** `css`, `cssRoot`, `cssLabel`, `cssControl`, `cssHelper`, `cssItem`, `cssIndicator`.

### Data tab

| Property | Kind and default | What it is for |
| --- | --- | --- |
| Options from data (overrides the list) (`inputItems`) | a tag / variable / message to read | Options from data: a variable, tag or message holding an array (strings, or objects). It replaces the Options list. |

### Content tab

| Property | Kind and default | What it is for |
| --- | --- | --- |
| Options (`options`) | list; default `[{"value":"a","label":"Option A"},{"value":"b","label":"Opti` | The choices, a list of { value, label }. The value is what is written; the label is what is shown. Data can replace the list: see Options from data. |
| From data: the value field (`itemValue`) | text; default `value` | For options from data: the field of each object that is the value. |
| From data: the label field (`itemLabel`) | text; default `label` | For options from data: the field of each object that is the label. |

### Style tab

| Property | Kind and default | What it is for |
| --- | --- | --- |
| Direction (`orientation`) | a choice: `horizontal`, `vertical`; default `horizontal` | The options in a row or in a column. |

### Events (Logic: an "On ..." node)

| Event | When | `msg.payload` |
| --- | --- | --- |
| On Change (the user changed it) (`change`) | The user chose a value (not when it came from a variable or a tag). | `value` any |
| On Write Error (`writeError`) | Writing the value to its tag or variable failed. | `value` any, `error` string |

## Segmented Control (`nexa-ui-segmented`)

One choice out of a few, as joined buttons.

**What the form gets from it:** The chosen option's value (a text).

**Try:** Name `mode`: Auto / Manual.

**Properties it has from the common list:** `inputValue`, `outputValue`, `label`, `labelPosition`, `helperText`, `invalid`, `errorText`, `required`, `formName`, `requiredMessage`, `ruleCode`, `ruleMessage`, `defaultValue`, `size`, `colorPalette`, `disabled`, `variant`, `radius`.

**Custom CSS:** `css`, `cssRoot`, `cssLabel`, `cssControl`, `cssHelper`, `cssItem`.

### Data tab

| Property | Kind and default | What it is for |
| --- | --- | --- |
| Options from data (overrides the list) (`inputItems`) | a tag / variable / message to read | Options from data: a variable, tag or message holding an array (strings, or objects). It replaces the Options list. |

### Content tab

| Property | Kind and default | What it is for |
| --- | --- | --- |
| Options (`options`) | list; default `[{"value":"a","label":"Option A"},{"value":"b","label":"Opti` | The choices, a list of { value, label }. The value is what is written; the label is what is shown. Data can replace the list: see Options from data. |
| From data: the value field (`itemValue`) | text; default `value` | For options from data: the field of each object that is the value. |
| From data: the label field (`itemLabel`) | text; default `label` | For options from data: the field of each object that is the label. |

### Events (Logic: an "On ..." node)

| Event | When | `msg.payload` |
| --- | --- | --- |
| On Change (the user changed it) (`change`) | The user chose a value (not when it came from a variable or a tag). | `value` any |
| On Write Error (`writeError`) | Writing the value to its tag or variable failed. | `value` any, `error` string |

## Select (`nexa-ui-select`)

A drop-down list: one choice, or several (Several at once).

**What the form gets from it:** The chosen value (a text), or an array of values with Several at once. Empty is an empty text or an empty array.

**Try:** Name `line`, Required, options from data (a list of lines from an API Call).

**Properties it has from the common list:** `inputValue`, `outputValue`, `label`, `labelPosition`, `helperText`, `invalid`, `errorText`, `required`, `formName`, `requiredMessage`, `ruleCode`, `ruleMessage`, `placeholder`, `defaultValue`, `variant`, `size`, `colorPalette`, `radius`, `disabled`.

**Custom CSS:** `css`, `cssRoot`, `cssLabel`, `cssControl`, `cssHelper`, `cssBox`, `cssMenu`.

### Data tab

| Property | Kind and default | What it is for |
| --- | --- | --- |
| Options from data (overrides the list) (`inputItems`) | a tag / variable / message to read | Options from data: a variable, tag or message holding an array (strings, or objects). It replaces the Options list. |

### Content tab

| Property | Kind and default | What it is for |
| --- | --- | --- |
| Options (`options`) | list; default `[{"value":"a","label":"Option A"},{"value":"b","label":"Opti` | The choices, a list of { value, label }. The value is what is written; the label is what is shown. Data can replace the list: see Options from data. |
| From data: the value field (`itemValue`) | text; default `value` | For options from data: the field of each object that is the value. |
| From data: the label field (`itemLabel`) | text; default `label` | For options from data: the field of each object that is the label. |

### Behaviour tab

| Property | Kind and default | What it is for |
| --- | --- | --- |
| Several at once (the value is an array) (`multiple`) | on / off; default `false` | Several options can be chosen; the value is an array. |
| Clear button (×) (`clearable`) | on / off; default `false` | A × button that clears the choice. |

### Events (Logic: an "On ..." node)

| Event | When | `msg.payload` |
| --- | --- | --- |
| On Change (the user changed it) (`change`) | The user chose a value (not when it came from a variable or a tag). | `value` any |
| On Write Error (`writeError`) | Writing the value to its tag or variable failed. | `value` any, `error` string |
| On Open (`open`) | The list opened. | (none) |
| On Close (`close`) | The list closed. | (none) |

## Combobox (`nexa-ui-combobox`)

A box you can type in that filters a list of options as you type.

**What the form gets from it:** The chosen value (a text). With Any text on, whatever was typed.

**Try:** Name `product`: type "mix" to find "Mixer 1". Options from data for a long list.

**Properties it has from the common list:** `inputValue`, `outputValue`, `label`, `labelPosition`, `helperText`, `invalid`, `errorText`, `required`, `formName`, `requiredMessage`, `ruleCode`, `ruleMessage`, `placeholder`, `defaultValue`, `variant`, `size`, `colorPalette`, `radius`, `disabled`.

**Custom CSS:** `css`, `cssRoot`, `cssLabel`, `cssControl`, `cssHelper`, `cssBox`, `cssMenu`.

### Data tab

| Property | Kind and default | What it is for |
| --- | --- | --- |
| Options from data (overrides the list) (`inputItems`) | a tag / variable / message to read | Options from data: a variable, tag or message holding an array (strings, or objects). It replaces the Options list. |

### Content tab

| Property | Kind and default | What it is for |
| --- | --- | --- |
| Options (`options`) | list; default `[{"value":"a","label":"Option A"},{"value":"b","label":"Opti` | The choices, a list of { value, label }. The value is what is written; the label is what is shown. Data can replace the list: see Options from data. |
| From data: the value field (`itemValue`) | text; default `value` | For options from data: the field of each object that is the value. |
| From data: the label field (`itemLabel`) | text; default `label` | For options from data: the field of each object that is the label. |
| Placeholder (`placeholder`) | text; default `Search…` | The hint in the empty box. |

### Behaviour tab

| Property | Kind and default | What it is for |
| --- | --- | --- |
| Any text (not only an option): Enter takes what is typed (`allowCustomValue`) | on / off; default `false` | The user may type a text that is not an option; Enter takes it. |
| Open on a click (`openOnClick`) | on / off; default `true` | The list opens when the box is clicked (otherwise only when typing or with the arrow keys). |

### Events (Logic: an "On ..." node)

| Event | When | `msg.payload` |
| --- | --- | --- |
| On Change (the user changed it) (`change`) | The user chose a value (not when it came from a variable or a tag). | `value` any |
| On Write Error (`writeError`) | Writing the value to its tag or variable failed. | `value` any, `error` string |
| On Typing (`input`) | The user typed in the box (the filter text, before a choice). | `text` string |

## Slider (`nexa-ui-slider`)

A handle on a track for a number between a minimum and a maximum.

**What the form gets from it:** A number.

**Try:** Name `speed`, 0 to 1500, Step 10, Unit rpm, Marks 0, 750, 1500.

**Properties it has from the common list:** `inputValue`, `outputValue`, `label`, `labelPosition`, `helperText`, `invalid`, `errorText`, `required`, `formName`, `requiredMessage`, `ruleCode`, `ruleMessage`, `defaultValue`, `variant`, `size`, `colorPalette`, `disabled`.

**Custom CSS:** `css`, `cssRoot`, `cssLabel`, `cssControl`, `cssHelper`, `cssTrack`, `cssThumb`.

### Data tab

| Property | Kind and default | What it is for |
| --- | --- | --- |
| Min (`min`) | number; default `0` | The value at the left end. |
| Max (`max`) | number; default `100` | The value at the right end. |
| Step (`step`) | number; default `1` | The size of one move of the handle (and of the arrow keys). |

### Display tab

| Property | Kind and default | What it is for |
| --- | --- | --- |
| Show the value (`showValue`) | on / off; default `true` | Shows the current value next to the control. |
| Decimals shown (-1: as it is) (`decimals`) | number; default `-1` | How many decimals are shown. -1: as it is. |
| Unit (`unit`) | text; default (empty) | Text after the value (for example %, rpm). |
| Marks (values under the track) (`marks`) | list; default `[]` | Values to mark under the slider track. |

### Events (Logic: an "On ..." node)

| Event | When | `msg.payload` |
| --- | --- | --- |
| On Change (the user changed it) (`change`) | The user chose a value (not when it came from a variable or a tag). | `value` any |
| On Write Error (`writeError`) | Writing the value to its tag or variable failed. | `value` any, `error` string |
| On Slide (while dragging) (`slide`) | The handle is moving; On Change comes only when it is let go. | `value` number |

## Tags Input (`nexa-ui-tags-input`)

A box where each Enter adds a tag (a small chip).

**What the form gets from it:** An array of texts. Required means at least one tag.

**Try:** Name `tags`, At most 5, Required.

**Properties it has from the common list:** `inputValue`, `outputValue`, `label`, `labelPosition`, `helperText`, `invalid`, `errorText`, `required`, `formName`, `requiredMessage`, `ruleCode`, `ruleMessage`, `defaultValue`, `placeholder`, `variant`, `size`, `colorPalette`, `radius`, `disabled`.

**Custom CSS:** `css`, `cssRoot`, `cssLabel`, `cssControl`, `cssHelper`, `cssBox`, `cssTag`.

### Behaviour tab

| Property | Kind and default | What it is for |
| --- | --- | --- |
| At most (0 = no limit) (`max`) | number; default `0` | The most tags allowed. 0: no limit. |
| The same tag twice (`allowDuplicates`) | on / off; default `false` | The same tag can be added twice. |
| Double-click a tag to edit it (`editable`) | on / off; default `true` | Double-click a tag to edit it. |

### Events (Logic: an "On ..." node)

| Event | When | `msg.payload` |
| --- | --- | --- |
| On Change (the user changed it) (`change`) | The user chose a value (not when it came from a variable or a tag). | `value` any |
| On Write Error (`writeError`) | Writing the value to its tag or variable failed. | `value` any, `error` string |

## Pin Input (`nexa-ui-pin-input`)

A row of boxes for a short code (a PIN or a one-time code).

**What the form gets from it:** The code as a text. It fires On Complete when every box is filled.

**Try:** Name `pin`, 4 boxes, digits, Mask on, Required; an On Complete node can send the form by itself.

**Properties it has from the common list:** `inputValue`, `outputValue`, `label`, `labelPosition`, `helperText`, `invalid`, `errorText`, `required`, `formName`, `requiredMessage`, `ruleCode`, `ruleMessage`, `placeholder`, `defaultValue`, `variant`, `size`, `colorPalette`, `radius`, `disabled`.

**Custom CSS:** `css`, `cssRoot`, `cssLabel`, `cssControl`, `cssHelper`, `cssBox`.

### Content tab

| Property | Kind and default | What it is for |
| --- | --- | --- |
| Boxes (`length`) | number; default `4` | How many boxes. |
| Characters (`kind`) | a choice: `numeric`, `alphanumeric`, `alphabetic`; default `numeric` | What may be typed in the boxes: digits, letters and digits, or letters. |
| Hide what is typed (••••) (`mask`) | on / off; default `false` | Shows dots instead of what was typed (a PIN). |
| Placeholder (`placeholder`) | text; default `○` | The character shown in an empty box. |

### Behaviour tab

| Property | Kind and default | What it is for |
| --- | --- | --- |
| One-time code (autofill) (`otp`) | on / off; default `false` | Lets the phone fill the code in from a one-time-code message. |

### Events (Logic: an "On ..." node)

| Event | When | `msg.payload` |
| --- | --- | --- |
| On Change (the user changed it) (`change`) | The user chose a value (not when it came from a variable or a tag). | `value` any |
| On Write Error (`writeError`) | Writing the value to its tag or variable failed. | `value` any, `error` string |
| On Complete (every box filled) (`complete`) | Every box has a character: the code is complete. | `value` string |

## Rating (`nexa-ui-rating`)

Stars to give a mark.

**What the form gets from it:** A number of stars (half stars with Half stars on).

**Try:** Name `stars` for a quality check, 5 stars.

**Properties it has from the common list:** `inputValue`, `outputValue`, `label`, `labelPosition`, `helperText`, `invalid`, `errorText`, `required`, `formName`, `requiredMessage`, `ruleCode`, `ruleMessage`, `readonly`, `defaultValue`, `size`, `colorPalette`, `disabled`.

**Custom CSS:** `css`, `cssRoot`, `cssLabel`, `cssControl`, `cssHelper`, `cssStar`.

### Content tab

| Property | Kind and default | What it is for |
| --- | --- | --- |
| Stars (`count`) | number; default `5` | How many stars. |

### Display tab

| Property | Kind and default | What it is for |
| --- | --- | --- |
| Show the value (`showValue`) | on / off; default `false` | Shows the current value next to the control. |

### Behaviour tab

| Property | Kind and default | What it is for |
| --- | --- | --- |
| Half stars (`allowHalf`) | on / off; default `false` | A half star can be chosen. |

### Events (Logic: an "On ..." node)

| Event | When | `msg.payload` |
| --- | --- | --- |
| On Change (the user changed it) (`change`) | The user chose a value (not when it came from a variable or a tag). | `value` any |
| On Write Error (`writeError`) | Writing the value to its tag or variable failed. | `value` any, `error` string |

## Date Time (`nexa-ui-datetime`)

A date and time picker with a calendar, with UTC or local time.

**What the form gets from it:** What it writes: by default an ISO text (`2026-05-04T10:30:00.000Z`); the Write output format changes it (a timestamp, a formatted text). Empty is null.

**Try:** Name `when`, Required, Time selection to the minute, Write output format ISO.

**Properties it has from the common list:** `inputValue`, `outputValue`, `label`, `labelPosition`, `helperText`, `invalid`, `errorText`, `required`, `formName`, `requiredMessage`, `ruleCode`, `ruleMessage`, `defaultValue`, `placeholder`, `variant`, `size`, `colorPalette`, `radius`, `disabled`, `readonly`.

**Custom CSS:** `css`, `cssRoot`, `cssLabel`, `cssControl`, `cssHelper`, `cssBox`, `cssPopover`.

### Display tab

| Property | Kind and default | What it is for |
| --- | --- | --- |
| Clear button (×) (`clearable`) | on / off; default `true` | A × button that clears the date. |
| Placeholder (`placeholder`) | text; default (empty) | The hint when no date is chosen. |

### Granularity tab

| Property | Kind and default | What it is for |
| --- | --- | --- |
| Preset (`unitPreset`) | a choice: `datetime`, `datetime-seconds`, `date-only`, `time-only`, `year-month`, `custom`; default `datetime` | Which parts of a date the picker has: date and time, with seconds, date only, time only, year and month, or custom. |
| Year (YYYY) (`showYear`) | on / off; default `true` | Custom: the year part. |
| Month (MM) (`showMonth`) | on / off; default `true` | Custom: the month part. |
| Day (DD) (`showDay`) | on / off; default `true` | Custom: the day part. |
| Hours (HH) (`showHours`) | on / off; default `true` | Custom: the hours part. |
| Minutes (mm) (`showMinutes`) | on / off; default `true` | Custom: the minutes part. |
| Seconds (ss) (`showSeconds`) | on / off; default `false` | The seconds part. |
| Milliseconds (SSS) (`showMs`) | on / off; default `false` | The milliseconds part (only with seconds on); for data recorded at that resolution. |

### Timezone / UTC tab

| Property | Kind and default | What it is for |
| --- | --- | --- |
| Timezone handling (`timezoneMode`) | a choice: `utc`, `local`; default `utc` | UTC: stored and shown in UTC. Local: shown in the operator's time and converted back when written. |
| Write output format (`outputType`) | a choice: `iso`, `timestamp-ms`, `timestamp-s`, `formatted`, `utc-date`, `utc-time`; default `iso` | The shape of what is written (and of the form's value): an ISO string, a Unix timestamp (ms or s), a formatted text, a date only or a time only. |

### Format tab

| Property | Kind and default | What it is for |
| --- | --- | --- |
| Display format template (`format`) | text; default `YYYY-MM-DD HH:mm:ss` | The pattern of the shown text: YYYY, MM, DD, HH, mm, ss, SSS, A, Z ... |
| Parse regex (optional) (`customRegex`) | text; default (empty) | A regular expression with named groups to read a custom text into a date (`(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})`). |

### Events (Logic: an "On ..." node)

| Event | When | `msg.payload` |
| --- | --- | --- |
| On Change (`change`) | The user chose or cleared a date. | `value` any, `iso` string, `timestamp` number, `text` string, `utc` string |
| On Popover Open (`open`) | The calendar opened. | (none) |
| On Popover Close (`close`) | The calendar closed. | (none) |

### Actions (Logic: an Update node on this control)

| Action | What it does |
| --- | --- |
| Set to current time (`setNow`) | Chooses the current date and time. |
| Clear date time (`clear`) | Removes the date. |

## Date Range (`nexa-ui-daterange`)

A start and an end date picked together, with quick presets.

**What the form gets from it:** An object `{ start, end }` in the Write output format, or null until both are chosen.

**Try:** A report filter: name `period`, Required; On Submit sends `values.period.start` and `values.period.end` to an API Call.

**Properties it has from the common list:** `label`, `labelPosition`, `helperText`, `invalid`, `errorText`, `required`, `formName`, `requiredMessage`, `ruleCode`, `ruleMessage`, `variant`, `size`, `colorPalette`, `radius`, `disabled`, `readonly`.

**Custom CSS:** `css`, `cssRoot`, `cssLabel`, `cssControl`, `cssHelper`, `cssBox`, `cssPopover`.

### Data tab

| Property | Kind and default | What it is for |
| --- | --- | --- |
| Start Date (read) (`inputStart`) | a tag / variable / message to read | The start of the range: a variable, tag or message holding a date (a date, an ISO text, a timestamp or a formatted text). |
| End Date (read) (`inputEnd`) | a tag / variable / message to read | The end of the range, like Start Date (read). |
| Range Object / Array (read) (`inputRange`) | a tag / variable / message to read | Both ends at once: `{ start, end }` or `[start, end]`. |
| Start Date (write) (`outputStart`) | a tag / variable to write | Where the start is written, in the Write output format. |
| End Date (write) (`outputEnd`) | a tag / variable to write | Where the end is written. |
| Range Object (write) (`outputRange`) | a tag / variable to write | Where both are written as `{ start, end }`. |
| Default start date (`defaultStart`) | text; default (empty) | The start used when nothing is bound. |
| Default end date (`defaultEnd`) | text; default (empty) | The end used when nothing is bound. |

### Display tab

| Property | Kind and default | What it is for |
| --- | --- | --- |
| Range separator (`separator`) | text; default `→` | The text between the start and the end of the range. |
| Start placeholder (`startPlaceholder`) | text; default `Start date` | The hint in the empty start of a range. |
| End placeholder (`endPlaceholder`) | text; default `End date` | The hint in the empty end of a range. |
| Calendar layout (`monthLayout`) | a choice: `horizontal`, `vertical`; default `horizontal` | The two calendars side by side, or one above the other. |
| Clear button (×) (`clearable`) | on / off; default `true` | A × button that clears the range. |

### Granularity tab

| Property | Kind and default | What it is for |
| --- | --- | --- |
| Time selection (`timeGranularity`) | a choice: `off`, `minutes`, `seconds`, `milliseconds`; default `off` | How finely a range's boundary can be set: date only, minutes, seconds or milliseconds. The unedited start of a day is always 00:00:00.000 and the end 23:59:59.999. |

### Timezone / UTC tab

| Property | Kind and default | What it is for |
| --- | --- | --- |
| Timezone handling (`timezoneMode`) | a choice: `utc`, `local`; default `utc` | UTC: stored and shown in UTC. Local: shown in the operator's time and converted back when written. |
| Write output format (`outputType`) | a choice: `iso`, `timestamp-ms`, `timestamp-s`, `formatted`, `utc-date`; default `iso` | The shape of what is written (and of the form's value): an ISO string, a Unix timestamp (ms or s), a formatted text, a date only or a time only. |

### Format tab

| Property | Kind and default | What it is for |
| --- | --- | --- |
| Display format template (`format`) | text; default (empty) | The pattern of the shown text: YYYY, MM, DD, HH, mm, ss, SSS, A, Z ... |

### Presets tab

| Property | Kind and default | What it is for |
| --- | --- | --- |
| Show quick presets sidebar (`presets`) | on / off; default `true` | A sidebar of quick ranges (today, last 7 days, this month ...). |

### Events (Logic: an "On ..." node)

| Event | When | `msg.payload` |
| --- | --- | --- |
| On Change (`change`) | The user chose or cleared a range. | `start` any, `end` any, `range` object, `startIso` string, `endIso` string, `text` string |
| On Popover Open (`open`) | The calendar opened. | (none) |
| On Popover Close (`close`) | The calendar closed. | (none) |

### Actions (Logic: an Update node on this control)

| Action | What it does |
| --- | --- |
| Apply preset range (`setPreset`) | Chooses a quick range by its name (msg.payload.preset). |
| Clear date range (`clear`) | Removes the range. |

## Button (`nexa-ui-button`)

A button. On its own it fires On Click. Inside a Form it can send or reset the form.

**What the form gets from it:** It is not a field and adds nothing to the form's values.

**Try:** "In a form, this button: Sends the form" and "Disabled until the form is valid".

**Properties it has from the common list:** `outputValue`, `variant`, `size`, `colorPalette`, `radius`, `disabled`.

**Custom CSS:** `css`, `cssControl`, `cssText`.

### Data tab

| Property | Kind and default | What it is for |
| --- | --- | --- |
| Value written on click (`clickValue`) | text; default `true` | The value written (and sent with On Click) when the button is clicked: true, false, a number, text or JSON. |

### Content tab

| Property | Kind and default | What it is for |
| --- | --- | --- |
| Text (`text`) | text; default `Button` | The words on the button. |
| Icon before the text (`iconLeft`) | a choice: ``, `check`, `x`, `chevron-down`, `chevron-up`, `chevron-right`, `plus`, `minus` ...; default (empty) | An icon before the text. |
| Icon after the text (`iconRight`) | a choice: ``, `check`, `x`, `chevron-down`, `chevron-up`, `chevron-right`, `plus`, `minus` ...; default (empty) | An icon after the text; it pushes to the far end of the button. |
| Loading (a spinner; not clickable) (`loading`) | on / off; default `false` | Shows a spinner and makes the button not clickable. A Send button in a Form does this by itself while the form is being sent. |
| Text while loading (`loadingText`) | text; default (empty) | The text shown while loading. Empty: the usual text. |

### Style tab

| Property | Kind and default | What it is for |
| --- | --- | --- |
| Text (`align`) | a choice: `start`, `center`; default `start` | Where the text sits in the button: start or center. |

### Behaviour tab

| Property | Kind and default | What it is for |
| --- | --- | --- |
| Disabled (`disabled`) | on / off; default `false` | The button cannot be clicked. Inside a Form, a Send button can also wait for the form to be valid (Disabled until the form is valid). |

### Form tab

| Property | Kind and default | What it is for |
| --- | --- | --- |
| In a form, this button (`formAction`) | a choice: `none`, `submit`, `reset`; default `none` | Inside a Form: what this button does to it: nothing, Send it (check, then On Submit or On Invalid Submit), or Reset it. |
| Disabled until the form is valid (`waitForValid`) | on / off; default `false` | A Send button stays disabled until the form is valid. |

### Events (Logic: an "On ..." node)

| Event | When | `msg.payload` |
| --- | --- | --- |
| On Click (`click`) | The button was clicked (not while it is disabled or loading). | `value` any |
| On Press (pointer down) (`press`) | The pointer went down on the button. | (none) |
| On Release (pointer up) (`release`) | The pointer came up. | (none) |

