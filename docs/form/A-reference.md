# Appendix A. Reference tables

The same facts as the chapters, in the shape of a table, for looking up. Each row names the chapter that explains it.

## A.1 The Form

### Settings

| Key | Label | Default | Chapter |
| --- | --- | --- | --- |
| `validateOn` | Show errors: *While the user types* (`change`), *When a field is left* (`blur`), *Only when sending* (`submit`) | `change` | 3, 7 |
| `submitOnEnter` | Enter in a field sends the form | on | 3 |
| `changeDelay` | On Change delay (ms), 0 to 5000 | 300 | 3 |
| `errorSummary` | List the errors above the form after a failed Submit | off | 3 |
| `summaryTitle` | Title of the list | *Please correct:* | 3 |
| `cssForm`, `cssSummary` | Custom CSS for the form's box and the list of errors | none | 3 |

### Outputs (the *Data* group)

| Key | Label | Holds | Type that suits it |
| --- | --- | --- | --- |
| `outputValues` | Values (write) | every field's value, by name | object |
| `outputErrors` | Errors (write) | the messages being shown, by field name | object |
| `outputValid` | Valid (write) | true while every rule is met and nothing is being checked | boolean |
| `outputDirty` | Changed (write) | true while anything differs from where the form started | boolean |
| `outputSubmitting` | Sending (write) | true from a valid Send until it is ended | boolean |

### Events

| Event | Label | `msg.payload` |
| --- | --- | --- |
| `submit` | On Submit (valid) | `{ values }` |
| `invalidSubmit` | On Invalid Submit | `{ errors, values }` |
| `change` | On Change (a field, after a pause) | `{ name, value, values, valid, errors }` |
| `validChange` | On Valid Change | `{ valid }` |
| `dirtyChange` | On Changed or Unchanged | `{ dirty }` |
| `reset` | On Reset | `{ values }` |

### Actions

| Action | Label | `msg.payload` |
| --- | --- | --- |
| `validate` | Check every rule now | none |
| `submit` | Send the form | none |
| `reset` | Reset | none |
| `setValues` | Set values | `{ name: value, … }`, nested or dotted |
| `setErrors` | Set errors | `{ name: "message", … }` |
| `setChecking` | Mark fields as being checked | `"name"` or `["name", …]` |
| `clearErrors` | Clear errors | `["name", …]`, optional (without it, every field) |
| `focus` | Focus a field | `"name"` or `{ name }`, optional |
| `done` | Sending is over | `{ reset: true }`, optional |

## A.2 Settings that every field has

Grouped as in the inspector. Which controls have which is in the chapter of each control.

| Group | Keys |
| --- | --- |
| Data | `inputValue`, `outputValue`, `defaultValue` |
| Form | `formName`, `requiredMessage`, `ruleCode`, `ruleMessage` (and, for the text controls, `minLength`) |
| Field | `label`, `labelPosition`, `helperText`, `invalid`, `errorText`, `required` |
| Style | `variant`, `size`, `colorPalette`, `radius` |
| Behaviour | `disabled`, `readonly` |
| Custom CSS | `cssRoot`, `cssLabel`, `cssControl`, `cssHelper`, and the part settings of each control (chapter 5) |

`requiredMessage` and `ruleMessage` appear once there is something for them to be the message of (*Required* on, or a rule written). `labelPosition` appears once there is a label.

## A.3 The controls at a glance

| Control | Type id | Value in the form | Empty | *Required* means | Events (besides the form's) |
| --- | --- | --- | --- | --- | --- |
| Input | `nexa-ui-input` | text | `""` | not empty | `change`, `commit`, `invalid`, `writeError`, `focus`, `blur` |
| Textarea | `nexa-ui-textarea` | text with `\n` | `""` | not empty | as the Input |
| Number Input | `nexa-ui-number-input` | number | `null` | a number (`0` counts) | as the Input |
| Password Input | `nexa-ui-password-input` | text | `""` | not empty | as the Input |
| Checkbox | `nexa-ui-checkbox` | boolean | `false` | must be on | `change`, `writeError` |
| Switch | `nexa-ui-switch` | boolean | `false` | must be on | `change`, `writeError` |
| Radio Group | `nexa-ui-radio-group` | option value | `""` | something chosen | `change`, `writeError` |
| Segmented Control | `nexa-ui-segmented` | option value | `""` | something chosen | `change`, `writeError` |
| Select | `nexa-ui-select` | option value, or a list with *Several at once* | `""` or `[]` | something chosen | `change`, `open`, `close`, `writeError` |
| Combobox | `nexa-ui-combobox` | option value or typed text | `""` | not empty | `change`, `input` (On Typing), `writeError` |
| Slider | `nexa-ui-slider` | number | never | nothing | `change`, `slide`, `writeError` |
| Tags Input | `nexa-ui-tags-input` | list of texts | `[]` | at least one | `change`, `writeError` |
| Pin Input | `nexa-ui-pin-input` | text, once complete | `""` | code complete | `change`, `complete`, `writeError` |
| Rating | `nexa-ui-rating` | number | `0` | nothing | `change`, `writeError` |
| Date Time | `nexa-ui-datetime` | per *Write output format* | `null` | a date | `change`, `open`, `close` |
| Date Range | `nexa-ui-daterange` | `{ start, end }` | `null` | both ends | `change`, `open`, `close` |
| Button | `nexa-ui-button` | none: not a field | | | `click`, `press`, `release` |

## A.4 Rules and their messages

In the order they run. The first broken one is the field's error.

| # | Rule | Setting | Message by default | An empty field |
| --- | --- | --- | --- | --- |
| 1 | Required | `required`, `requiredMessage` | *Required*; *Must be checked* for a Checkbox and a Switch | breaks it |
| 2 | Shortest text | `minLength` | *At least N characters* | breaks it |
| 3 | Longest text | `maxLength` | *At most N characters* | passes |
| 4 | Pattern | `pattern`, `patternMessage` | *Not in the expected format* | breaks it |
| 5 | Number minimum | `min` | *Minimum is N* | breaks it |
| 6 | Your own rule | `ruleCode`, `ruleMessage` | what you return, or *Not valid* | what your code decides |

A pattern is anchored: `PO-[0-9]+` must match the whole text. A rule in JavaScript is the body of `function (value, values, form)`; it returns `true` (or nothing, `null`, `""`) for fine, `false` or a text for not fine; a thrown error shows as *The rule failed: …*; a returned promise is refused with a message that says to use Logic.

The control's own refusals, shown as the person types and ranking above the rules, are *not a number*, *minimum is N* and *maximum is N* for the Number Input.

## A.5 What the form shows, and when

| *Show errors* | A field's message appears |
| --- | --- |
| While the user types (`change`) | once the field has been edited or left |
| When a field is left (`blur`) | once the field has been left |
| Only when sending (`submit`) | after the first Send, or after *Check every rule now* |

Whatever the choice: after a Send was tried, every message follows the typing; *Set errors* puts a message on at once; and *Valid* is always the truth, whether or not it is shown.

The line under a control shows, in this order of priority: the form's error for the field (or the field's own), then *Checking…* if a check is pending, then the helper text.

## A.6 Date format tokens

For `format` of the Date Time and the Date Range (chapter 11):

| Token | Meaning |
| --- | --- |
| `YYYY` `YY` | year, four digits, two digits |
| `MMMM` `MMM` | month name, full, short |
| `MM` `M` | month number, with and without a leading zero |
| `DD` `D` | day of the month |
| `HH` `H` | hour, 24-hour clock |
| `hh` `h` | hour, 12-hour clock |
| `mm` `m` | minute |
| `ss` `s` | second |
| `SSS` | millisecond |
| `A` `a` | AM / PM, in capitals and in lower case |
| `Z` | the offset: `Z` in UTC mode, such as `+07:00` in local mode |

The *Write output format* (`outputType`): `iso`, `timestamp-ms`, `timestamp-s`, `formatted`, `utc-date`, and for the Date Time `utc-time`.

The quick ranges of the Date Range: `today`, `yesterday`, `last-7-days`, `last-30-days`, `this-month`, `last-month`, `year-to-date`.

## A.7 The Validate node

| | |
| --- | --- |
| Input | one |
| Output 1, *valid* | the message, with `msg.valid = true` (and, with *Pass on what Zod returns*, the checked part replaced by what Zod returned) |
| Output 2, *invalid* | `msg.valid = false`; `msg.errors` (`{ "owner.name": "Required" }`, one message for each field, `_` for a problem about the whole); `msg.issues` (`[{ path, code, message }]`, every problem); `msg.checked` (what was checked); the errors also in the place chosen by *Put the errors in msg.* |
| Settings | `property` (*Check msg.*, `payload`), `into` (*Put the errors in msg.*, `payload`), `useParsed` (*Pass on what Zod returns*, off), `schema` (the body of a function returning a Zod schema, with `z`, `msg`, `vars`, `getVariable`) |
| Library | Zod, version 3 API (`zod/v3`) |

## A.8 The keyboard

| Where | Key | Does |
| --- | --- | --- |
| Input, Number Input, Password Input | Enter | commits the text; in a form with *Enter in a field sends the form*, also sends |
| Input, Number Input, Password Input | Escape | cancels the edit |
| Number Input | Up, Down | one *Step* up or down |
| Textarea | Enter | a new line |
| Textarea | Ctrl+Enter | commits, and in a form, sends |
| Combobox, Select | Enter | chooses the highlighted option (does not send the form) |
| Combobox, Select | Up, Down | move through the options |
| Combobox | Enter, with *Any text* on | takes what is typed |
| Slider | arrow keys | one *Step* |
| Segmented Control | arrow keys | move between segments |
| Tags Input | Enter | adds the typed text as a tag |
| Pin Input | a character | fills the box and moves on |
