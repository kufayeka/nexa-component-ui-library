# 5. Settings every control shares

The sixteen controls that can be fields of a form look different and hold different kinds of value, but a large part of their inspector is the same. This chapter describes those shared settings once, so that the chapters on the individual controls can concentrate on what is particular to each.

The shared settings come in groups, named after the inspector tabs they sit under: **Data**, **Field**, **Style**, **Behaviour**, **Form** and **Custom CSS**. Not every control has every setting. A Checkbox has no *Placeholder*, a Slider no *Variant*. Each control chapter lists exactly what its control has.

Almost every setting in the inspector can be **bound** instead of typed: a variable, a tag, a field of the message, or an expression can supply the value, and the page then follows it as it changes. Settings can also be set per screen size and take theme tokens. These are features of the inspector as a whole, not of forms, and apply here as everywhere. The exceptions are the settings that name things, such as *Name in the form* (a field's name cannot change while the page runs), and the bindings themselves.

## 5.1 Data

### Value (read) (`inputValue`)

What the control shows, taken from a variable, a tag, or the message. Leave it empty and the control keeps its own value, starting at its *Default value*.

Bound, the control is **two-way**: it shows the bound value, and when the person changes it, the new value is written back (see *Value (write)*). In a form this is usually left empty (section 4.7), because the form is the thing that holds the values.

### Value (write) (`outputValue`)

Where a change goes: a variable or a tag. Left empty it writes back to *Value (read)*, which is what makes a control bound only for reading two-way. A control whose *Value (read)* and *Value (write)* are both empty is local: it keeps its value to itself, which, in a form, is the normal case.

When exactly a text control writes (on every key, on Enter, on leaving) belongs to the text controls and is explained in chapter 8. The other controls write when the person makes a choice, and the Slider writes when the handle is let go.

### Default value (unbound) (`defaultValue`)

The value the control holds until the person changes it, when *Value (read)* is empty. Inside a form it is also the **start** of that field (section 4.5): what *Reset* returns to, and what *changed* is measured from. The default is not empty for every control; section 4.5 has the list.

### Options from data (`inputItems`)

The choice controls (Radio Group, Segmented Control, Select and Combobox) can take their list of options from a variable, a tag or a message instead of from the list you type in the inspector. See chapter 9.

## 5.2 Field

The Field group is about the frame around the control: the label above it, the helper line beneath it, the error that replaces the helper line.

### Label (`label`) and Label position (`labelPosition`)

The text above the control, or to its left. *Label position* is *Top* or *Left*; it only appears once there is a label. A label is a small tracked line of text; long labels are cut off with an ellipsis rather than wrapped, so keep them short or widen the component.

### Required (`required`)

A switch labelled *Required (a * after the label)*. It does two things. It puts a red asterisk after the label, so people can see which fields they must fill. And, when the control is a field of a form, it is a rule: the field must not be empty.

What "empty" means depends on the kind of control (a text is empty when it is `""`, a list when it has no items, a checkbox when it is off) and chapter 6 has the full table. The message for a broken required rule is *Required*, or *Must be checked* for a Checkbox or a Switch, unless you give your own in *Message when required and empty* (`requiredMessage`, in the Form group).

Outside a form, *Required* is only the asterisk.

### Helper text (`helperText`)

A line of smaller text under the control, for hints: the format you expect, the units, a warning. It is there until something more urgent needs the place, which is an error, or the word *Checking…* while the form is waiting for an answer about this field. When the error goes, the helper text comes back.

### Invalid (`invalid`) and Error text (`errorText`)

A pair for controlling an error yourself, which you did before there were forms and may still want for controls that are not in one. *Invalid* is a switch, *Error text* the message. While *Invalid* is on, the message is shown under the control in the error colour, and the control's box is drawn in the error style.

You can bind *Invalid* to an expression of your own. For a control inside a form you rarely need it, because the form shows its own errors. If both exist, the form's message is the one shown; yours returns when the form has nothing to say.

### Where the helper line goes, and the height of the control

The label, the control and the helper line are stacked, and each has a place of its own. The control keeps the size its *Size* setting gives it, at least, and is **not squeezed** when a helper line or an error line appears. In a form the place for the line is kept even when there is nothing in it yet, so that an error appearing does not push the controls below it down the screen. And if the height you gave the component in *Position & Size* is too small for the label, the control and the line together, the component grows to the height it needs, rather than flattening the control. Give a component a bit more height than the bare control, about 90 pixels for a text field with a label and a helper line, and the layout will not move at all.

## 5.3 Style

### Variant (`variant`)

The look of the control. For the text controls, Select, Combobox, Tags, Date Time and Date Range it is one of three: **Filled** (the default, a grey fill with a line under it), **Outline** (a box with a border all around) and **Flushed** (a line only, no box). The Pin Input has Filled and Outline. For the Checkbox, Radio Group, Segmented Control and Slider the choice is **Neutral** or **Palette**: the control's accent in a neutral dark, or in the colour of the palette. The Switch has one variant, *Solid*. The Button has its own set, in chapter 12.

### Size (`size`)

One of `xs`, `sm`, `md`, `lg` and `xl`. Size sets the height of the control and the size of its text and spacing together: 24, 32, 40, 48 and 64 pixels for the control. `md` is the default and a good choice for desktop screens; `lg` is easier to hit on a touch screen.

### Colour palette (`colorPalette`)

A colour family from the app's theme (the Theme tab, under Colors): primary, gray, red, orange, yellow, green, teal, blue, cyan, purple or pink. The control's accent, its focus ring, its checked state or its fill follows the palette, in light mode and in dark mode. Defaults differ by control: primary for most, green for the Switch, yellow for the Rating, gray for Tags.

### Corner radius (`radius`)

How round the corners are. By default it follows the theme's medium radius (the token `radii.md`); you can type a number of pixels, or bind it to another token. Not every control has it: the Checkbox, the Switch, the Rating, the Radio Group and the Slider do not.

### Direction (`orientation`)

Only on the Radio Group: the options laid out in a *Row* or in a *Column*.

## 5.4 Behaviour

### Disabled (`disabled`)

The control cannot be used, and is drawn greyed. Inside a form a disabled field is still a field: its value is in the values and its rules still apply. This surprises people who disable a field to say "not applicable". If the field should not count, remove it (chapter 4) or drop its rules.

### Read-only (`readonly`)

The value is shown, and can be selected and copied, but not changed by the person. The Checkbox, Switch, Rating, the four text controls, Date Time and Date Range have it. A read-only text field is drawn as a plain value, without its fill, rather than as a greyed control the way a disabled one is. It is useful for the fields of a form that show a value this person may not edit, for example one that was loaded and is fixed.

### Opacity (`opacity`)

Only on the four text controls, under **Behaviour**: how see-through the whole control is, from 0 to 1. It is a presentation setting and has no effect on how the control behaves.

## 5.5 Form

The Form group is the part of the inspector that is about forms. Every control that can be a field has it.

- **Name in the form** (`formName`) makes the control a field, and is explained in chapter 4.
- **Message when required and empty** (`requiredMessage`) is the text of the required rule (chapter 6).
- **Rule (JavaScript)** (`ruleCode`) and **Message when the rule says false** (`ruleMessage`) are the rule you write yourself (chapter 6).
- **Shortest text** (`minLength`) is the shortest length for a text field. It is on the Input, Textarea and Password Input; it is not offered on the Number Input, where it would mean nothing.

The Button's Form group is different, and is in chapter 12. The Form component has no Form group of its own; its settings are in **Behaviour** (chapter 3).

## 5.6 Custom CSS

Every Nexa UI component, forms included, has a **Custom CSS** group with a single field, **Custom CSS** (`css`). It is empty by default, which means the component looks as the library draws it, in the theme's colours. Press *Load CSS* and the component's own CSS is put in the field, as plain CSS you can edit; what you save is applied after the library's own, so it wins. *Reset CSS* empties the field again.

This is deliberately not automatic. A component you have not touched keeps no copy of the library's CSS in your project, so it follows the library when the library is updated.

Each part of a component has a name, and the CSS you load shows you how to address it. The names are the same as in the older per-part fields, which keep working for screens that already use them and are shown in the inspector only where a saved screen already has text in them:

| Setting | Part it styles | Which controls |
| --- | --- | --- |
| `cssRoot` | the outermost box of the control | all the field controls |
| `cssLabel` | the label | all the field controls |
| `cssControl` | the control itself | all, and the Button |
| `cssHelper` | the helper and error line | all the field controls |
| `cssBox` | the box around the text | Input, Textarea, Number Input, Password Input, Select, Combobox, Tags Input, Pin Input (each box), Date Time, Date Range |
| `cssStepper` | the minus and plus buttons | Number Input |
| `cssText` | the control's text | Checkbox, Switch, Button |
| `cssIndicator` | the check mark or circle | Radio Group |
| `cssItem` | one option | Radio Group, Segmented Control |
| `cssMenu` | the open list of options | Select, Combobox |
| `cssTrack`, `cssThumb` | the track and the handle | Slider |
| `cssTag` | one tag | Tags Input |
| `cssStar` | one star | Rating |
| `cssPopover` | the open calendar | Date Time, Date Range |
| `cssForm`, `cssSummary` | the form's box, the list of errors | Form |

If all you want is a different colour or size, you rarely need CSS: the palette, the size and the radius settings change those consistently. Reach for CSS when you need something the settings do not offer, such as a different font weight on the label.
