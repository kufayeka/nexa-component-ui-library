# 3. The Form component

The Form is a container with one panel in it and a small amount of behaviour: it keeps the state of the fields inside it, decides what to show, and tells the outside world what happens. This chapter goes through all of it: the panel, the five settings, the five outputs, the six events and the nine actions.

## 3.1 The container and its panel

A Form is placed from the **UI Components** tab, under *UI · Form*, and is resizable like any component. It has no appearance of its own on the running page. It draws nothing, no border and no background, so that the fields inside it look like part of the screen. In the editor it is drawn as a dashed frame labelled *Form*, only so you can see where it is and select it.

Inside it there is one panel, named *Fields*. The panel is an ordinary frame of the screen, the same kind you get from the frame tools, and it comes with a vertical auto layout, some padding and a small gap, so that controls dropped into it stack in a column. Everything you can do with a frame you can do with this one: select it with a double click on the Form, or in the Hierarchy, and change its layout to a row or a grid, change the padding and the gap, give it a fill or a stroke, or put other frames inside it to group fields into columns or sections.

Two points are worth knowing.

First, **the Form finds its fields by where they are.** Any control placed anywhere inside the Form's panel, however many frames deep, belongs to that form. The frames around it make no difference to which form it joins. If a control is inside two Forms, one within the other, it joins the nearest.

Second, **the panel can hold anything,** not only fields. A heading, an explanatory Text, an image, a Button, a Tabs component with fields in its panels: all fine. The Form only cares about controls that have a *Name in the form*, and the Buttons that have a *form action* (chapter 12).

## 3.2 Settings

The Form has five settings, all under the **Behaviour** group, plus the five outputs under **Data**.

### Show errors (`validateOn`)

When does a field show its error? This is the setting people usually need to change first, and the one that most affects how the form feels. It has three values.

**While the user types** (`change`), the default. A field shows its error from the moment the person has changed it. As soon as they type the first character, or change a choice, the rules run and whatever is wrong is shown. This is the most responsive and the most nagging: the person who types `a` into a field that needs three characters is told, straight away, that three are needed.

**When a field is left** (`blur`). A field shows its error once the person has moved away from it. While they are in the middle of typing they are left alone; the message appears when they click or tab out. This is a good default for logins and anything where the person knows what they are doing and should not be interrupted.

**Only when sending** (`submit`). No error is shown at all until the person has pressed Send. This suits short forms, and forms where half-finished states are normal (an order that is built up over several minutes).

Three things hold whatever value you choose.

- A **failed Send always turns errors on.** After the person has tried to send and been refused, every field shows its error, and from then on errors follow the typing, so that the one they are fixing clears the moment it is fixed.
- A control's **own refusal of what is typed** is always shown at once: a Number Input given `4x`, or a number below its minimum, says so immediately in every mode.
- What is **true** never waits. The form is valid or not from the first moment, whatever is shown. The setting is purely about when the person is told.

Chapter 7 describes the timing, with the exact conditions, field by field.

### Enter in a field sends the form (`submitOnEnter`)

On by default. Pressing Enter in an Input, a Number Input or a Password Input asks the form to send, exactly as if the Send button had been pressed. Turn it off if Enter should only finish editing the field.

A Textarea needs Enter for new lines, so in a Textarea it is **Ctrl+Enter** that finishes the field and sends the form. The choice controls (Select, Combobox and the others) use Enter for their own purpose, choosing an option, and never send the form.

### On Change delay (`changeDelay`)

How long, in milliseconds, the person must pause before the form fires its *On Change* event. The default is 300; the range is 0 to 5000. With 0 the event fires on every key.

The delay protects whatever is on the other end of the event. If *On Change* triggers a call to a server to check a user name, you do not want a call for every letter of `yekakufa`; you want one when the person stops. Chapter 13 has examples. A field that is left, or a form that is sent, flushes any event that is waiting, so the last value is never lost to the delay.

This is the delay for the **form's** event. Each text control has its own *On Change delay* (`changeDebounce`) for the events of that control; the two are independent (chapter 8).

### List the errors above the form after a failed Submit (`errorSummary`) and Title of the list (`summaryTitle`)

Off by default. When it is on, a failed Send puts a box at the top of the form listing every error that is being shown, with the field's name before each message:

![The list of errors above the form](../images/form/server-errors-summary.png)

Each name in the list is a link that moves the focus to that field. The box has the title you set in **Title of the list** (`summaryTitle`), which is *Please correct:* unless you change it. The box goes away when the form is reset or when the errors are gone. Use it on forms long enough that the first wrong field may be off the screen, and where you want a reader or a screen-reader user to hear that something went wrong.

The names in the list are the fields' names (`email`, `owner.city`), not their labels. If those are not good enough for your readers, leave the summary off and let the messages under the fields speak.

## 3.3 Outputs

The five outputs are how the form lets the rest of the screen see its state. They are found under the **Data** group, they are all writes, and each takes a variable (or a tag) to write to. Type a variable name in braces, such as `{formValid}`, or pick it with the binding picker. Leave an output empty and the form simply does not write that piece of state.

| Output | Key | What it holds |
| --- | --- | --- |
| Values (write) | `outputValues` | An object with every field's value, by name |
| Errors (write) | `outputErrors` | An object with the messages being shown, by field name |
| Valid (write) | `outputValid` | `true` while every field satisfies every rule, `false` otherwise |
| Changed (write) | `outputDirty` | `true` while anything differs from where the form started |
| Sending (write) | `outputSubmitting` | `true` from a valid Send until Logic ends it |

A few details that save time later.

**They are written when they change.** The form compares each output with what it last wrote and writes only if it differs. The values object is written when any field changes, but typing a key that results in the same value writes nothing. An output bound to a slow tag will not be hammered.

**They are written once at the start.** As soon as the form starts, each bound output receives its first value (`valid` as `false` on an empty required form, `values` as the starting object). So a Text that shows `{formValid}` is correct before anyone has touched anything.

**Values contains what was typed.** That includes a password. If the form has a Password Input and you write the values to a variable that is displayed, logged or kept in storage, the password goes with it. Bind *Values* only where you want that, or put the password in a different form.

**Errors holds what is shown, not everything that is wrong.** Under *Only when sending*, before the first Send, `errors` is empty although the form may be full of mistakes. That matches what the person sees. For the question "can I send?" use *Valid*.

**Variables must exist** on the screen, the app or as shared variables, like any other binding. A variable of the type *object* suits `values` and `errors`; *boolean* suits the rest.

## 3.4 Events

The events are how Logic learns what the person is doing. In the **Events** tab, with the Form selected, each one has a chip that makes an *On ...* node on the Logic canvas.

| Event | Fires when | `msg.payload` |
| --- | --- | --- |
| **On Submit (valid)** | the person sent the form and every rule is met | `{ values }` |
| **On Invalid Submit** | the person tried to send and something is wrong | `{ errors, values }` |
| **On Change** | a field changed and the person paused | `{ name, value, values, valid, errors }` |
| **On Valid Change** | the form became valid or stopped being valid | `{ valid }` |
| **On Changed or Unchanged** | the form began to differ from its start, or came back to it | `{ dirty }` |
| **On Reset** | the form was put back to its start | `{ values }` |

**On Submit** is the one you will wire most. It fires once for each valid Send. It cannot fire again until the first send is over, which is the form's protection against a double click: until you say *Sending is over* or *Set errors*, further Send attempts do nothing. `values` is the whole form as one object, shaped by the field names (chapter 4).

**On Invalid Submit** fires when the person asks to send and something is wrong. By then the form has shown every error and focused the first wrong field, so you do not have to; use the event for things the form cannot do, such as logging, a sound, or a banner. `errors` is an object from field name to message.

**On Change** fires for one field at a time, after the pause set by *On Change delay*. `name` is the field that changed, `value` its new value, `values` the whole form at that moment, `valid` whether the form is valid, and `errors` what is being shown. It is the event to wire for checks that need a server, and the way to react to a field while the person is still working on the form.

**On Valid Change** and **On Changed or Unchanged** report the two flips that matter and nothing else. They do not fire at the start of the form, only when something changes after it. An On Valid Change wire is a tidy way to enable or disable something that is not a button, without binding a variable.

**On Reset** fires when the form goes back to its start, by the *Reset* action, by a Button that resets the form, or by *Sending is over* with `reset: true`.

A field also has events of its own, such as *On Commit*, *On Focus* and *On Blur* for the text controls, or *On Complete* for the Pin Input. Those still fire to Logic when the control is in a form, and are described with each control.

## 3.5 Actions

Actions are how Logic changes the form. Each is available on an **Update node** pointed at the Form (the chip *Form → Update*), where the dialog shows them as cards with a one-line description. An action that takes data takes it from `msg.payload` unless you fill in a parameter in the node's dialog, and the shapes are the same either way.

| Action | Key | `msg.payload` | What it does |
| --- | --- | --- | --- |
| **Check every rule now** | `validate` | none | Shows every error, as a failed Send does, and sends nothing |
| **Send the form** | `submit` | none | The same as the Send button |
| **Reset** | `reset` | none | Every field goes back to the start; errors and checking are forgotten |
| **Set values** | `setValues` | `{ email: "a@b.co", owner: { name: "Ann" } }` | Fills fields by name, and makes that the new start |
| **Set errors** | `setErrors` | `{ po: "Already used" }` | Puts messages on fields and ends the sending |
| **Mark fields as being checked** | `setChecking` | `"username"` or `["username", "email"]` | The field shows *Checking…*; the form is not valid until the check ends |
| **Clear errors** | `clearErrors` | a list of names such as `["po"]`, optional | Removes messages put by Set errors, and ends checking |
| **Focus a field** | `focus` | `"po"` | Puts the cursor in that field; with no name, in the first one with an error |
| **Sending is over** | `done` | `{ reset: true }`, optional | The send has finished; what is entered becomes the new start |

The behaviour of each in detail is worth knowing, because it is what you will build your wiring on.

**Check every rule now** is what the person's Send does, minus the sending. All errors are shown, the first wrong field is focused, and nothing fires. Wire it to a button called *Check* when you want the person to see everything that is wrong before they commit.

**Send the form** is for buttons that are not inside the form, or for a Logic node that decides when to send. It does the full thing: check, then *On Submit* or *On Invalid Submit*.

**Reset** puts every field back to the start, clears every message and every checking mark, and fires *On Reset*. The start is not necessarily empty; it is what the fields held when the form opened, or when *Set values* or *Sending is over* last moved it.

**Set values** takes an object whose keys are field names and puts each value into its field. A nested object fills dotted names: `{ owner: { name: "Ann" } }` fills the field called `owner.name`, and so does `{ "owner.name": "Ann" }`. A name that does not match a field is ignored. The loaded values become the new start, which means the form is not *changed* afterwards, and *Reset* returns to them. It also works when it arrives **before** the fields are on the page: each field takes its value when it joins. That matters on a screen that loads a record in an *On Load* node, where the record can arrive before the form has drawn its fields.

**Set errors** is how a server's refusal gets onto the screen. The payload maps field names to messages; a field named there shows the message at once whatever *Show errors* says, is counted as touched, and the first of them gets the focus. The form stops being valid, and the sending ends. A message put this way stays until the person edits that field, or until *Clear errors*, *Reset*, *Set values* or *Sending is over* with `reset: true`; plain *Sending is over* leaves it alone. A key that is not a field is ignored, so an API that returns `{ errors: { po: "...", general: "..." } }` can be passed in whole.

**Mark fields as being checked** is for checks that take time. The named field shows *Checking…* in place of its helper text, the form stops being valid, and a Send is ignored. It ends when you say how the check came out: *Set errors* on that field if the answer was no, *Clear errors* if it was fine. Typing in the field does not end the check; only an answer does. Chapter 13 shows the pattern, including how to ignore an answer that has been overtaken by newer typing.

**Clear errors** removes the messages put by *Set errors* for the named fields, or for all fields when the payload is empty. The names must come as a list (`["po"]`, or `{ names: ["po"] }`); a bare text is not read as a name, and the messages of every field are cleared. It also ends any checking on those fields. It does not remove a rule's message: a field that still breaks its rule goes on showing it.

**Focus a field** moves the cursor to the field named in the payload (a name, or an object `{ name }`). With no name it goes to the first field with an error, or, if there is none, the first field. Use it in an *On Load* node to put the cursor where the person will start typing.

**Sending is over** tells the form that whatever was in progress has ended. The sending flag is cleared. Without a payload, whatever is entered becomes the new start, so the form is not *changed*, and the person's text stays where it is: right for an edit screen. With `{ reset: true }`, the form is reset instead, so it is empty and ready for the next record: right for an entry screen.

## 3.6 Custom CSS

Like every Nexa UI component, the Form has a **Custom CSS** group. *Custom CSS* (`css`) is the CSS for the component as a whole, with *Load CSS* to put the component's own CSS into the editor and *Reset CSS* to empty it. Two parts can be styled separately: `cssForm`, the box that holds the panel, and `cssSummary`, the list of errors. Chapter 5 describes the mechanism.
