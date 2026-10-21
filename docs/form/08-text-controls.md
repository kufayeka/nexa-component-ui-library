# 8. Text controls

There are four controls for typing: the **Input**, the **Textarea**, the **Number Input** and the **Password Input**. They share one editing behaviour, which has more to it than "the person types and the value changes", so the chapter begins with that, and then goes through each control and every one of its settings.

## 8.1 How the four text controls behave

### The edit cycle

A text control is in one of two situations: it is showing a value, or somebody is editing it.

**Editing starts** when the control gets the focus. If *Select all when editing starts* (`selectOnFocus`) is on, which it is by default, the whole text is selected, so that typing replaces it. While the person types, the control checks the text as it goes: a Number Input given `4x` says *not a number* straight away, and one given `99` when the maximum is 10 says *maximum is 10*.

**Editing ends** in one of three ways:

- **Enter** commits the text: the control parses it, and if it is good the value is accepted. In a Textarea, where Enter makes a new line, it is **Ctrl+Enter** that commits.
- **Escape** cancels: the text goes back to the last accepted value.
- **Leaving the field** commits or cancels, depending on the control and on whether it is in a form. See below.

A text that is **not acceptable** (not a number, out of range) is not committed. Pressing Enter on it fires *On Invalid Input* and leaves the control in editing, with the message showing.

### Outside a form, and inside one

Outside a form a control writes only when the text is committed, and *Write when the field loses focus* (`commitOnBlur`) decides whether leaving the field counts. For the Input, the Number Input and the Password Input it is off by default: leaving the field cancels the edit, and only Enter writes. The Textarea has it on, since Enter is not available to it.

Inside a form the rules change, because the form wants to know what is typed, not only what has been committed:

- **The text typed is the field's value at once.** The form sees each change as it is made, runs its rules, and updates its state, with no Enter needed.
- **Leaving the field keeps it.** The control commits on leaving, whatever *Write when the field loses focus* says.
- **A text that cannot be accepted is thrown away when the person leaves the field.** The control goes back to the last good value, the form does too, and the message disappears. While the person is still in the field, the message is there. If a field must not be left in a refused state, use a rule that notices it; the refusal itself is a message for the moment of typing.

This is why, in a form, you almost never want to touch *Write when the field loses focus*.

### Events

All four fire the same events to Logic, and they fire in a form too. The form's own *On Change* event is separate (chapter 3): it carries the whole form, these carry the one control.

| Event | When | `msg.payload` |
| --- | --- | --- |
| **On Change** | the text changed and the person paused (see *On Change delay*) | `{ value, text, valid }` |
| **On Commit** | the value was accepted: Enter, or leaving the field when that commits | `{ value, text }` |
| **On Invalid Input** | Enter was pressed on a text that is not acceptable | `{ text, reason }` |
| **On Write Error** | writing the value to its tag or variable failed | `{ value, error }` |
| **On Focus** | editing started | `{ value }` |
| **On Blur** | editing ended | `{ value }` |

*On Change* fires **while the person types**, before any Enter, so you can react to the text as it is made: a strength meter for a password, a live search. `valid` says whether what is typed is acceptable to the control. *On Commit* is the old meaning of "changed": it fires when a value is accepted and written.

### Settings the four share

The text controls share a block of settings beyond those in chapter 5.

**Prefix** (`prefix`) and **Suffix** (`suffix`), in the Display group, are fixed texts inside the box before and after the value: a currency sign, a unit. They are part of the look, not of the value.

**Icon at the start** (`startIcon`), in Display, puts one of the library's icons at the beginning of the box. The choices are a small set (check, x, chevrons, plus, minus, search and a few more).

**Align** (`align`), in Display: *Left*, *Center* or *Right*. The Number Input defaults to Right, the others to Left.

**Placeholder** (`placeholder`), in Display: the grey text shown in an empty box.

**Preview value (editor only)** (`previewValue`), in Display: a value shown on the canvas when the control has nothing yet, so you can see how a filled box will look. A running page never shows it.

**Select all when editing starts** (`selectOnFocus`) and **Write when the field loses focus** (`commitOnBlur`), in Behaviour, as above.

**On Change delay (ms)** (`changeDebounce`), in Behaviour: how long the person must pause before the control's *On Change* fires, from 0 to 5000, 300 by default. At 0 it fires on every key. It affects only this control's event, not the form's.

**Ask for confirmation before writing** (`confirmWrite`) and **Confirmation text** (`confirmText`), in Behaviour. With it on, the control asks a question in the browser's confirmation box before it commits. `{value}` in the text is the new value and `{old}` the current one; empty text asks *Write "..."?*. It is meant for a single control that writes a setpoint to a machine. **Do not use it in a form,** where it would ask on Enter and on leaving the field; do your confirming at the form level, with the Send button and Logic.

**Opacity** (`opacity`), in Behaviour, from 0 to 1.

## 8.2 Input

The Input is a one-line text box, and the most common field of all.

**Value in the form:** text, `""` when empty. **Required:** the text must not be empty.

**Settings**

- *Data:* `inputValue` and `outputValue` (chapter 5); **Default value (unbound)** (`defaultValue`), the starting text; **Max length** (`maxLength`), the most characters, which the box enforces by refusing more; **Pattern** (`pattern`) and **Pattern message** (`patternMessage`), a regular expression the whole text must match and what to say when it does not (chapter 6). The message setting appears once there is a pattern.
- *Form:* `formName`, `requiredMessage`, `ruleCode`, `ruleMessage`, and **Shortest text** (`minLength`).
- *Display:* the shared `prefix`, `suffix`, `startIcon`, `align`, `placeholder`, `previewValue`, and two of its own. **Kind** (`inputType`) is `text`, `email`, `url`, `tel` or `search`. It sets the keyboard a phone offers and the browser's hints; it is **not** a rule, and an Input of kind `email` happily accepts `hello`. Use a pattern for the rule. **Clear button (×)** (`clearable`) adds a button that empties the text.
- *Behaviour:* the shared `commitOnBlur`, `changeDebounce`, `confirmWrite`, `confirmText`, `selectOnFocus`, plus `readonly`, `disabled` and `opacity`.
- *Field, Style:* `label`, `labelPosition`, `helperText`, `invalid`, `errorText`, `required`, `variant`, `size`, `colorPalette`, `radius` (chapter 5).

**A typical use**, an email address:

- Kind: *email*; Required; Pattern `[^@ ]+@[^@ ]+` with the message *Not an email*; Helper text *We will write to this address*.

## 8.3 Textarea

The Textarea is a box for several lines: remarks, a description, a note on a shift report.

**Value in the form:** text, with the lines separated by newline characters (`\n`). `""` when empty.

**What is different from the Input.**

- **Enter makes a new line.** **Ctrl+Enter** commits the text, and, in a form, sends it.
- **Write when it loses focus** (`commitOnBlur`) is **on** by default.
- It has no *Kind* and no *Clear button*. It has **Character count (with a max length)** (`showCount`), in Display: a counter at the bottom of the box that reads, for example, `12 / 80`. It appears only when the Textarea has a *Max length*, since there is nothing to count against otherwise.
- The height comes from the size you give the component, since a box for several lines has no fixed height of its own.

**Settings:** the same as the Input otherwise: `inputValue`, `outputValue`, `defaultValue`, `maxLength`, `pattern`, `patternMessage`, the Form group with `minLength`, the shared display and behaviour settings, and the Field and Style settings.

**A typical use**, a remarks field: *Max length* 500, *Character count* on, not required, *Placeholder* "Anything the next shift should know".

## 8.4 Number Input

The Number Input is for numbers: a quantity, a temperature, a price. It has − and + buttons, limits, decimals, and separators that follow the way your readers write numbers.

**Value in the form:** a number, or `null` when the box is empty. It is never `NaN` and never text: if the person types something that is not a number, the control says so and the form keeps the last good value.

**Required:** there must be a number. `0` is a number.

### Number format settings

All of these are in the **Data** group, under a section called *Number Format*.

- **Decimals** (`decimals`), from -1 to 10. With a number from 0 up, the number is shown and written with exactly that many decimals; with **-1**, the default, it is shown as it comes, without rounding. Use 0 for whole quantities and 2 for money.
- **Decimal separator** (`decimalSeparator`): *Dot* (`12.5`) or *Comma* (`12,5`). When typing, a single `.` or `,` is always read as the decimal point, so a number pad works whichever is set.
- **Thousands separator** (`thousandsSeparator`): *None*, *Comma*, *Dot*, *Space* or *Apostrophe*. A value of 1234567 shows as `1,234,567`, `1.234.567`, `1 234 567` or `1'234'567`.
- **Group thousands while typing** (`groupWhileTyping`), on by default, appears once there is a thousands separator. The separator is put in as the person types. When off, it is shown only when the person is not editing.

A form with Indonesian settings, a comma for decimals and a dot for thousands with two decimals, shows `1234.5` as `1.234,50`, while the form's value is the number `1234.5`.

- **Minimum** (`min`) and **Maximum** (`max`): numbers outside them are refused as they are typed, with *minimum is N* or *maximum is N*. In a form, an empty number is also below the minimum (chapter 6).
- **Step (± buttons, arrow keys)** (`step`): how much a press of the arrow keys, or of the − and + buttons, changes the value. The default is 1.
- **± buttons** (`stepper`): shows or hides the two buttons.

### The rest

- *Data:* `inputValue`, `outputValue`, `defaultValue` (a number as text, such as `10`).
- *Form:* `formName`, `requiredMessage`, `ruleCode`, `ruleMessage`. There is no *Shortest text*, which has no meaning for a number.
- *Display, Behaviour, Field, Style:* the shared settings. *Align* is Right by default.

There is no *Pattern* and no *Max length*.

**A typical use**, a quantity in a production entry: *Minimum* 1, *Step* 1, *Decimals* 0, Required, Align Right.

## 8.5 Password Input

The Password Input hides what is typed behind dots, with an eye button to show it.

**Value in the form:** text, `""` when empty. The text is in the form's values: **a password typed into a form is in `msg.payload.values.password`** and in the *Values* output, if you bound it. Send it over a secure connection, and do not write it to a variable that is displayed, logged or stored.

**What is different from the Input.**

- **Show / hide button (eye)** (`revealToggle`), in Display, on by default: the button at the end of the box that toggles between dots and text. Turn it off if people should never be able to see it.
- **Empty again after it is written** (`clearAfterWrite`), in Display, on by default: outside a form, the box is emptied once the password has been written, so it is not left on the screen. **In a form it is ignored:** the password stays in the box until the form is sent or reset, because the form holds the value.
- There is no *Pattern*, no *Kind* and no *Clear button*. It has **Max length** and, in the Form group, **Shortest text**.

**Settings:** `inputValue`, `outputValue`, `defaultValue`, `maxLength`, the Form group (`formName`, `requiredMessage`, `ruleCode`, `ruleMessage`, `minLength`), the shared display and behaviour settings, `revealToggle`, `clearAfterWrite`, and the Field and Style settings.

**A typical use**, with the strength meter of the cookbook (recipe 2): a rule in JavaScript that scores the password, and the form's *On Change* event feeding a Progress bar, as the person types.
