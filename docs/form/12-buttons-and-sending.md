# 12. Buttons and sending

A form is useless until something sends it. In Nexa that something is the **Button**, which is an ordinary component with a small number of settings, and a *Form* group of three that turn it into the Send button or the Reset button of the form around it. This chapter explains the Button completely, and then follows what happens from the moment someone presses Send until the moment your logic says the sending is done.

## 12.1 The Button

The Button is a rectangle with text, and optionally an icon at either end. Outside a form it does what any button does: when it is clicked it fires an event, and it can write a value somewhere. Inside a form it can also send or reset the form.

### Content

- **Text** (`text`): the words on the button. *Button* by default.
- **Icon before the text** (`iconLeft`) and **Icon after the text** (`iconRight`): one of the library's icons, none by default. The set is small: check, x, chevron-down, chevron-up, chevron-right, chevron-left, chevrons-left, chevrons-right, plus, minus and search. An icon after the text is placed at the far end of the button, as in IBM's Carbon design.
- **Loading (a spinner; not clickable)** (`loading`): shows a spinner in place of the left icon, and the button stops reacting to clicks. Bind it to a variable to show that something is going on, such as a request to a server.
- **Text while loading** (`loadingText`): appears once *Loading* is on. When it is not empty, it replaces the text while the spinner is shown: *Sending…*, *Please wait*. The right icon is hidden during loading.

### Style

- **Variant** (`variant`) chooses the look, and, more important, the rank of the button on the screen:

  | Setting | Shown as | Use it for |
  | --- | --- | --- |
  | *Primary* (`solid`, the default) | a filled button | the one main action: Send, Save |
  | *Secondary* | a filled, quieter button | a second action beside the main one |
  | *Tertiary (outline)* | an outline | the other actions: Cancel, Back |
  | *Ghost* | text that shows a background when hovered | actions in a toolbar |
  | *Subtle* | a lightly tinted background | an action that should not shout |
  | *Link* (`plain`) | text that is underlined when hovered | an action that reads as a link |

  A form should have one Primary button. If two compete, people hesitate.
- **Text** (`align`): *Start* (the default) or *Center*. At the start, the text sits at the left, and a right icon is pushed to the far right.
- **Size** (`size`): XS to XL, MD by default.
- **Colour palette** (`colorPalette`): the palette of the theme. Primary by default; *red* is the usual choice for a destructive action such as Delete.
- **Corner radius** (`radius`): in pixels, from the theme by default.

### Behaviour

**Disabled** (`disabled`): the button is greyed out and does not react. It can be bound, like any setting, to a variable: a button that is disabled while an operator is not logged in.

### Data

- **Write on click** (`outputValue`): the tag or variable that receives a value when the button is clicked. Empty means nothing is written.
- **Value written on click** (`clickValue`): the value itself. It is read as `true`, `false`, a number, JSON, or otherwise as text, in that order, so `true` writes the boolean, `5` the number and `{"a":1}` an object. The default is `true`.

This pair makes a button a switch for a machine without any Logic: *Start* writes `true` to the tag `line1.run`, *Stop* writes `false`. For the form, it is not what you use; the form has its own output (chapter 3).

### Events

| Event | When | `msg.payload` |
| --- | --- | --- |
| **On Click** | the button was clicked; **not** while it is disabled, loading, or (for a Send button) sending | `{ value }`, the *Value written on click* |
| **On Press (pointer down)** | the pointer went down on the button | none |
| **On Release (pointer up)** | the pointer came up | none |

On Press and On Release exist for the *hold to run* kind of control, such as a jog button on a machine: write `true` on press and `false` on release. They are not a safety device. A screen where a wrong press does damage needs an interlock in the logic, whatever the button does.

## 12.2 The Form group: Send and Reset

The three settings of the *Form* group matter only for a button **inside a Form component** (chapter 3). Outside one they do nothing.

### In a form, this button (`formAction`)

- **Does nothing to the form** (`none`, the default): an ordinary button. It may sit inside the form, as a *Cancel* or a *Help* link.
- **Sends the form** (`submit`): a click asks the form to send itself: the same as pressing Enter in a field (when the form lets Enter send), or the *Send the form* action from Logic. The form checks every field, and then fires its own *On Submit* (all is well) or *On Invalid Submit* (at least one rule is broken). Section 12.3 follows this in detail.
- **Resets the form** (`reset`): a click asks the form to go back to its start: every field to its default or to the loaded record (chapter 4), every field untouched, every message gone.

Either way, the button's own *On Click* fires too, and its value is written if there is one. They are independent. You can leave *On Click* unconnected.

### Disabled until the form is valid (`waitForValid`)

Appears for a Send button. When it is on, the button is disabled while any rule of the form is broken, and becomes active the instant the last one is met. The form is valid from the first moment (chapter 6): if you have a field with a minimum length, the Send button is grey from the first display, until the text is long enough.

This is a choice, and each side has its cost.

- **On:** people cannot send something wrong, but they also never learn *why* the button is grey. If a required field is on the second screen of a tab control, the grey button gives no clue. Pair it with the error summary (chapter 3) or helper texts.
- **Off (the default):** the button is always there, and pressing it with errors makes every message appear, and the focus move to the first field with one. People find out. This is better for a long form, and it is what most websites do.

Choose by the form. A short form of two or three fields suits *on*; a long one suits *off*.

## 12.3 What happens when Send is pressed

This is the sequence, in order. Knowing it makes everything about sending predictable.

1. **The click.** The Button checks it may react: not disabled, not loading, not already sending, not waiting for validity.
2. **The form is asked to submit.** The form sets all of its fields to touched, so that every message that is hidden until now can show.
3. **Checking.** The form runs every rule (chapter 6). It also looks at whether a field is still *being checked* by an outside check (chapter 7); if so, the request is silently ignored, as if the button had not been pressed.
4. **If any rule is broken:** *On Invalid Submit* fires, with the same payload as *On Change*, including `errors`. The messages are shown, the error summary appears (if it is on), and the form moves the focus to the first field in error. Nothing is sent. The Send button stays as it was.
5. **If everything is fine:** the form goes into **sending**. *On Submit* fires, with the values, and the form's `submitting` is true.
6. **While sending**, the Send button **turns into a spinner**, with its *Text while loading* if you wrote one, and does not react to clicks. A second press, or Enter in a field, is ignored. Nothing is sent twice.
7. **Your logic finishes the job** and tells the form, with the **Sending is over** action (`done`) when it worked, or with *Set errors* when the server refused (section 12.4). The spinner goes away.

The thing to remember is step 6: the form does not know how long your server will take, or whether it will succeed. It stays in the *sending* state until it is told.

## 12.4 Telling the form that sending is finished

The form's **Sending is over** action (`done`), called *Done* in this manual, ends the sending state. It is sent from an Update node pointed at the Form, with a payload that decides what the form does next:

| `msg.payload` | The form |
| --- | --- |
| empty | leaves the sending state, and **what is entered becomes the new start** of the form: it is no longer "changed", and *Reset* would now return to these values |
| `{ reset: true }` | leaves the sending state, and goes back to its start, as with Reset |

What you want is usually one of these:

- **A new record was created, the form is ready for the next one:** Done with `{ reset: true }`.
- **A record was saved, the person goes on editing it:** Done, empty. Their text stays, and the form counts it as saved.
- **The server refused:** *Set errors* with the server's messages (chapter 7). *Set errors* ends the sending by itself, puts the messages on the fields and moves the focus to the first of them, so no Done is needed. The person fixes the fields and sends again.
- **The server is down:** do not say Done as if all had gone well, because it would make the unsent text the new start. Send *Set errors* on a field, or show a notice of your own, and leave the text as it is. Do not reset a form after a failure: nobody wants to type it all again.

A plain Done does **not** remove messages that *Set errors* put there. Those leave when the person edits the field, when you send *Clear errors* or *Set values*, or when the form is reset.

**If nothing ever ends the sending,** the form stays in *sending* and the Send button stays a spinner. Whatever route your logic takes, including its failure branches, must end in Done or in Set errors.

## 12.5 A check button that is not Send

Sometimes a form needs a second button that checks without sending: *Check* the code, *Validate* the file. Make it a button with *Does nothing to the form*, and wire its *On Click* to an Update node pointed at the Form with the action **Check every rule now** (`validate`). The form then shows every message that is due, exactly as a failed Send would, but sends nothing and fires neither *On Submit* nor *On Invalid Submit*.

## 12.6 A button outside the form

A Send button does not have to sit inside the Form component. It finds its form the way every field does, through the structure of the screen (chapter 4): it must have the Form component as an ancestor. A button on the same screen **but not inside** the Form is not part of it. Its *Form* group does nothing, and a click only fires *On Click*.

When the button must be elsewhere, such as a floating toolbar, wire it through Logic instead: its *On Click* leads to an Update node pointed at the Form with the action *Send the form* (`submit`). The effect is the same as pressing a button inside, and the spinner has to be arranged by hand: bind the button's *Loading* to a variable that the *On Submit* path sets to true and the *Done* path sets to false.

## 12.7 Putting it together: a Send and a Cancel

A typical pair for a form:

| | Send | Cancel |
| --- | --- | --- |
| Text | `Save` | `Cancel` |
| Variant | Primary | Tertiary (outline) |
| In a form, this button | Sends the form | Resets the form |
| Disabled until the form is valid | per your choice | not shown |
| Text while loading | `Saving…` | – |

and the Cancel button's *On Click* can also be wired to whatever closes the screen. The two are independent; the form does not know that anything around it went away.
