# 10. Slider, Tags Input, Pin Input and Rating

Four controls do not fit the "text" or "choose" mould. They are built on the same keyboard-and-pointer machinery (the library uses zag.js for them), and they have in common that a value is built up through several small actions: dragging a handle, adding a tag at a time, filling boxes, clicking a star. This chapter describes each in turn.

## 10.1 Slider

A handle on a track, for a number between a minimum and a maximum. Use it where the exact number matters less than the feel: a speed, a percentage, a threshold.

**Value in the form:** a number. It is never empty, since the handle is always somewhere, so **Required does nothing** for a Slider. If you need the person to move it, make the default something that is not acceptable, and use a rule: `return value !== 0 || "Choose a speed"`.

**Settings**

- *Data:*
  - **Min** (`min`) and **Max** (`max`): the values at the two ends. 0 and 100 by default.
  - **Step** (`step`): the size of one move, 1 by default. The arrow keys move by a step, and the handle snaps to multiples of it.
  - **Default value (unbound)** (`defaultValue`): where the handle starts, 40 by default. In a form it is the start (chapter 4), so set it to something meaningful, often the minimum.
  - `inputValue`, `outputValue`: the value is written when the handle is let go, not while it moves.
- *Display:*
  - **Show the value** (`showValue`): a box beside the track with the number, on by default.
  - **Decimals shown** (`decimals`): how many decimals the number is shown with; -1, the default, shows it as it is.
  - **Unit** (`unit`): text after the number, such as `%` or `rpm`.
  - **Marks** (`marks`): a list of values to label under the track, such as 0, 750 and 1500.
- *Style:* **Variant** (`variant`), *Neutral* or *Palette*; `size`; `colorPalette`.
- *Form, Field, Behaviour:* `formName`, `requiredMessage`, `ruleCode`, `ruleMessage`, `label`, `labelPosition`, `helperText`, `invalid`, `errorText`, `required`, `disabled`.

**Events:** **On Slide** `{ value }` fires continuously while the handle is dragged, and *On Change* `{ value }` once, when it is let go (or when a key moves it). On Slide is for live feedback, such as a preview; On Change is the one that means "the person has decided".

**In a form,** the field's value changes when the handle is let go, so the form's *On Change* and its rules run once per move and not on every pixel.

## 10.2 Tags Input

A box where each Enter adds a small chip: skills, keywords, a list of batch numbers, a set of machine names.

**Value in the form:** a list of texts, `[]` when there are none. A `["pump", "valve"]` goes into the form's values as that list, ready to send as an array.

**Required:** at least one tag.

**How it behaves.** The person types a text and presses Enter to add it as a tag. A × on each tag removes it. By default, double-clicking a tag lets the person edit it. A text that is already a tag is not added again, unless duplicates are allowed. When the limit is reached, no more can be added.

**Settings**

- *Data:* `inputValue` (a list of texts, or a text with commas), `outputValue`, and **Default tags (unbound)** (`defaultValue`), the list the control starts with. **The sample comes with two tags, `react` and `lit`.** Empty the list unless you want those. In a form the default is also the start.
- *Content:* **Placeholder** (`placeholder`), *Add a tag…* by default.
- *Behaviour:*
  - **At most (0 = no limit)** (`max`): the largest number of tags. 0 means no limit.
  - **The same tag twice** (`allowDuplicates`): off by default.
  - **Double-click a tag to edit it** (`editable`): on by default.
  - `disabled`.
- *Style:* `variant`, `size`, `colorPalette` (gray by default), `radius`.
- *Form, Field:* `formName`, `requiredMessage`, `ruleCode`, `ruleMessage`, `label`, `labelPosition`, `helperText`, `invalid`, `errorText`, `required`.

**Event:** *On Change* `{ value }`, with the whole list, whenever a tag is added, edited or removed.

There is no *Shortest text* here; a limit on how many tags is the *At most* setting, and for a minimum write a rule:

```js
return value.length >= 2 || "Add at least two tags";
```

## 10.3 Pin Input

A row of small boxes for a short code: a PIN, a one-time code, a batch check digit. Each box takes one character and moves on by itself.

**Value in the form:** the code as text, but **only once every box is filled.** While the person is part-way, the control's value, and so the form's, is `""`. If a complete code is made incomplete again by deleting a digit, the value goes back to `""` as well. That is deliberate: a half-typed code is not a code, and the form must never hold a code that is no longer on the screen. *Required* therefore means "the code is complete", with no extra work.

**Settings**

- *Content:*
  - **Boxes** (`length`): how many characters, from 1 to 12, four by default.
  - **Characters** (`kind`): *Digits* (the default), *Letters & digits*, or *Letters*. Characters of another kind are not accepted.
  - **Hide what is typed (••••)** (`mask`): shows dots instead of the characters, for a PIN. Off by default.
  - **Placeholder** (`placeholder`): what an empty box shows, a small circle by default.
- *Behaviour:* **One-time code (autofill)** (`otp`): tells the browser and the phone that this is a one-time code, so that it can offer to fill it in from a message. `disabled`.
- *Data:* `inputValue`, `outputValue` (written once the code is complete), `defaultValue` (an existing code, to pre-fill the boxes).
- *Style:* **Variant** (`variant`), *Filled* or *Outline*; `size`; `colorPalette`; `radius`.
- *Form, Field:* `formName`, `requiredMessage`, `ruleCode`, `ruleMessage`, `label`, `labelPosition`, `helperText`, `invalid`, `errorText`, `required`.

**Events:** **On Complete** `{ value }` fires when the last box is filled, with the whole code. *On Change* `{ value }` fires when a complete code is entered, and again with an empty value if it stops being complete.

**Sending as soon as the code is complete.** A code usually needs no Send button. Wire *On Complete* to an Update node pointed at the Form with the action *Send the form*, and the form is sent the moment the last digit is typed, with every rule still applying.

## 10.4 Rating

A row of stars for giving a mark: the quality of a batch, the satisfaction with a visit. The person clicks the star that matches.

**Value in the form:** a number of stars, from 0 up to the number of stars. With **Half stars** it can be a half, such as 3.5.

**Required does nothing,** because the value is always a number, `0` included. If a rating must be given, use a rule: `return value > 0 || "Please give a rating"`.

**Settings**

- *Content:* **Stars** (`count`): how many stars, from 1 to 20, five by default.
- *Behaviour:* **Half stars** (`allowHalf`); **Read-only (a display)** (`readonly`), which turns the control into a plain display of a number of stars that cannot be changed; `disabled`.
- *Display:* **Show the value** (`showValue`): the number written after the stars.
- *Data:* `inputValue`, `outputValue`, and **Default value (unbound)** (`defaultValue`), **three** by default. In a form that is the start, so a Rating that begins with three stars already given counts as filled in; set it to 0 for a field the person must fill from scratch.
- *Style:* `size`; `colorPalette`, yellow by default.
- *Form, Field:* `formName`, `requiredMessage`, `ruleCode`, `ruleMessage`, `label`, `labelPosition`, `helperText`, `invalid`, `errorText`, `required`.

**Event:** *On Change* `{ value }`, when a star is clicked.

A Rating in a *read-only* state is useful on a screen that shows a stored mark next to the form that gives one, without making a second kind of component.
