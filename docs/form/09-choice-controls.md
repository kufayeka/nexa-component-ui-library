# 9. Choice controls

Six controls let a person choose instead of type: the **Checkbox** and the **Switch** for a yes or no, the **Radio Group** and the **Segmented Control** for one option out of a few that are all visible, and the **Select** and the **Combobox** for one (or several) out of a longer list. This chapter explains each, and begins with the part three of them share: how a list of options is described.

Unlike the text controls, none of these has an editing state. A choice is made, and the value changes; there is nothing to commit. In a form the choice is the field's value at that instant, and the field counts as touched as soon as the choice is made, since a choice is a complete action.

## 9.1 Options

The Radio Group, the Segmented Control, the Select and the Combobox all offer a list of options. Each option has two parts: a **value** and a **label**. The label is what the person reads. The value is what the control holds, what the form's values contain, and what you send. Keep the two apart on purpose: labels are for people and may be reworded or translated, values are for programs and should not change.

### Options (`options`)

In the **Content** group, a list that you edit in the inspector, one row per option, each row with a *Value* and a *Label*. A new control comes with three sample options, `a`, `b` and `c`, labelled *Option A* to *Option C*. Replace them with your own.

Values should be unique, short and stable: `line1`, `pending`, `kg`. A value is what ends up in your database; a label can change without breaking anything.

### Options from data (`inputItems`)

Sometimes the options are not known when you design the screen: the list of production lines is in a database, the products come from an API. In the **Data** group, *Options from data* takes a variable, a tag or a message holding an **array**, and the control then shows those options instead of the list you typed. The array can hold plain texts, in which case each is both value and label, or objects. For objects, two more settings in the **Content** group say which properties to use:

- **From data: the value field** (`itemValue`), the name of the property that holds the value, `value` by default;
- **From data: the label field** (`itemLabel`), the name of the property that holds the label, `label` by default.

So an API that answers `[{ id: "l1", name: "Line 1" }, { id: "l2", name: "Line 2" }]` is used by setting *value field* to `id` and *label field* to `name`. The usual way to fill the variable is a Logic wire: an *On Load* node, an API Call node, and a Set Variable node that stores the answer. When the variable changes, the options change.

If the current value is not among the new options, the field still holds it (a Combobox shows the value itself in the box). That is the behaviour you want when a record that was saved with a line that no longer exists is opened: the form does not silently change the value, and a rule can notice that it is no longer an option.

### Default value (`defaultValue`)

For the Radio Group and the Segmented Control, the default is `a`, the first sample value. Replace it with the value of your own first option, or empty it so that nothing is chosen (chapter 4).

## 9.2 Checkbox

A box that is on or off, with text beside it. It is the control for *I agree*, *Include rejected items*, *Send me a copy*.

**Value in the form:** `true` or `false`. **Required:** it must be on. The message is *Must be checked*, unless you write your own.

**Two texts, not one.** *Label* (`label`), in the Field group, is the field's label, above or beside the whole control, like every other control's. **Text next to it** (`text`), in the Content group, is the words next to the box: *I checked the order*. Use the Text for the words people tick, and leave the Label empty. Use both when the field has a heading and the box has a sentence.

**Settings**

- *Content:* `text`, **Text** (`textPosition`), *After* or *Before* the box, and **Indeterminate (–) while unchecked** (`indeterminate`), which draws a dash instead of an empty box when the value is off. It is only a look, to mean "some of them", and the value is still `false`.
- *Data:* `inputValue`, `outputValue`, **Default value** (`defaultValue`), off by default.
- *Form:* `formName`, `requiredMessage`, `ruleCode`, `ruleMessage`.
- *Field:* `label`, `labelPosition`, `helperText`, `invalid`, `errorText`, `required`.
- *Style:* **Variant** (`variant`), *Neutral* (a dark check) or *Palette* (the accent colour); `size`, `colorPalette`.
- *Behaviour:* `disabled`, `readonly`.

**Event:** *On Change* `{ value }`, when the person ticks or clears it, and *On Write Error*.

## 9.3 Switch

A switch that is on or off: the same idea as the Checkbox, drawn as a switch, and better for things that take effect, such as *Machine enabled*. In a form it is a field like the Checkbox.

**Value in the form:** `true` or `false`. **Required:** it must be on.

**Settings:** the same as the Checkbox, with these differences: it has *Text* and *Text position*, *Default value*, but no *Indeterminate*; its **Variant** is only *Solid*; and its palette starts at **green**, so it looks "on" in the colour people expect.

## 9.4 Radio Group

A short list of options, all visible, of which exactly one is chosen. Best for three to five options that people should see at a glance without clicking.

**Value in the form:** the value of the chosen option, as text.

**Notes**

- Once an option has been chosen, a person cannot return to "nothing chosen". If the field is optional and that matters, add an option labelled *None* with the value `""`.
- With the default left at `a`, the first sample option, the group starts with a choice made, and *Required* is always satisfied. Set the default to your own first option, or to nothing.

**Settings**

- *Content:* `options`, `itemValue`, `itemLabel` (section 9.1).
- *Data:* `inputValue`, `outputValue`, `inputItems`, `defaultValue`.
- *Style:* **Direction** (`orientation`), *Row* or *Column*; `variant` (*Neutral* or *Palette*); `size`; `colorPalette`.
- *Form, Field, Behaviour:* `formName`, `requiredMessage`, `ruleCode`, `ruleMessage`, `label`, `labelPosition`, `helperText`, `invalid`, `errorText`, `required`, `disabled`.

**Event:** *On Change* `{ value }`.

## 9.5 Segmented Control

A row of joined buttons, one of which is chosen: *Auto / Manual*, *Day / Week / Month*. It is the same choice as the Radio Group in a more compact shape, and works well for a mode that people switch often.

**Value in the form:** the value of the chosen option, as text.

**Settings:** like the Radio Group, with no *Direction* (it is always a row), and with **Corner radius** (`radius`). Its **Variant** is *Neutral* (the chosen segment drawn inverted, dark with light text) or *Palette*. The arrow keys move between segments.

## 9.6 Select

A drop-down list. One option is chosen, or several if *Several at once* is on. Use it when there are too many options for a Radio Group, or the screen is short of room.

**Value in the form:** the value of the chosen option, as text; `""` when nothing is chosen. With **Several at once** (`multiple`), a list of values, `[]` when none.

**Required:** something must be chosen; with several, at least one.

**Settings**

- *Content:* `options`, `itemValue`, `itemLabel`, and **Placeholder** (`placeholder`), the grey text of an empty select, *Select…* by default.
- *Data:* `inputValue`, `outputValue`, `inputItems`, `defaultValue`.
- *Behaviour:* **Several at once (the value is an array)** (`multiple`), and **Clear button (×)** (`clearable`), which adds a button to empty the choice.
- *Style:* `variant`, `size`, `colorPalette`, `radius`.
- *Form, Field, Behaviour:* `formName`, `requiredMessage`, `ruleCode`, `ruleMessage`, `label`, `labelPosition`, `helperText`, `invalid`, `errorText`, `required`, `disabled`.

**Events:** *On Change* `{ value }`, *On Open* and *On Close* (no payload), when the list opens and closes.

The keyboard works as people expect: the arrow keys move through the options, Enter chooses one, and typing the start of a label jumps to it. The open list sits above the components drawn after it, so it is not hidden by the ones below.

## 9.7 Combobox

A text box that filters its options as the person types: the way to choose from a long list, such as a list of products or customers, without scrolling.

**Value in the form:** the value of the chosen option, as text. If *Any text* is on, it may also be whatever the person typed.

**How it behaves**

- The person types, and the list shows the options whose **label contains** the typed text, ignoring case. If nothing matches, the list says so.
- Choosing an option sets the value, and the box shows that option's label.
- If the person types something that is not an option and leaves the field, **the typed text is discarded** and the box goes back to the chosen option, unless *Any text* is on.
- With *Any text* on, pressing Enter takes what is typed as the value, whether or not it is an option.

**Settings**

- *Content:* `options`, `itemValue`, `itemLabel`, and **Placeholder** (`placeholder`), *Search…* by default.
- *Data:* `inputValue`, `outputValue`, `inputItems`, `defaultValue`.
- *Behaviour:* **Any text (not only an option): Enter takes what is typed** (`allowCustomValue`), off by default; and **Open on a click** (`openOnClick`), on by default: whether a click in the box opens the list, or the list opens only when the person types or presses the arrow keys.
- *Style:* `variant`, `size`, `colorPalette`, `radius`.
- *Form, Field, Behaviour:* the same as the Select.

**Events:** *On Change* `{ value }`, and **On Typing** `{ text }`, which fires as the person types in the box, before anything is chosen. On Typing is the hook for a search that has to ask a server: wire it to an API Call that fetches matching options into the *Options from data* variable.

## 9.8 Choosing between them

| You have ... | Use |
| --- | --- |
| a yes or no | Checkbox, or Switch when it describes a state that takes effect |
| two to five options, all worth seeing | Radio Group, or Segmented Control for a compact bar |
| a few more than that, or little room | Select |
| a long list, or one that is searched | Combobox |
| several chosen at once from a short list | Select with *Several at once*, or a Checkbox for each |
| several chosen at once, typed freely | Tags Input (chapter 10) |
