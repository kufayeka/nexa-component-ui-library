# Nexa Form: what it can do, and a cookbook

A **Form** makes the controls inside it one thing: it knows what is typed in each of them, which are wrong and why, whether the whole can be sent, and whether anything changed. You still wire the work with Logic nodes, the way you wire any control. The Form only gives you what a screen of loose controls cannot.

![A login form while it is being sent](images/form/login-sending.png)

*Every picture in this guide is taken from a real screen running in a real Node-RED, not drawn. The screens are the examples of [examples/form-cookbook.nexa.json](examples/form-cookbook.nexa.json): [try them yourself](#try-the-examples).*

- **What every property of every control is for:** [FORM_COMPONENTS.md](FORM_COMPONENTS.md).
- **What the pieces are made of** (for developers): `src/features/form/README.md` in `@kufayeka/node-red-nexa-dashboard`.

Contents: [What it can do](#what-it-can-do) · [Your first form](#your-first-form) · [Rules](#rules) · [When an error shows](#when-an-error-shows) · [What the form gives you](#what-the-form-gives-you) · [Things to know](#things-to-know) · [Try the examples](#try-the-examples) · [Cookbook](#cookbook) · [When something does not work](#when-something-does-not-work)

---

## What it can do

| You want | The Form gives you |
| --- | --- |
| Tell the user what is wrong **as they type** | A rule on each control (required, shortest and longest text, a pattern, a number's limits, any rule in JavaScript); the message appears under the control |
| Rules that compare fields | A rule in JavaScript sees every field by name: `values.ok + values.reject === value` |
| Send only when everything is right | **On Submit** fires only when every rule is met. **On Invalid Submit** fires otherwise, and the first wrong field gets the focus |
| A Send button that knows | *Sends the form*, waits (disabled) until the form is valid, shows a spinner while it is being sent |
| Know the state anywhere on the screen | Five outputs you bind to variables: `values`, `errors`, `valid`, `dirty` (changed), `submitting` |
| The server says no ("order number taken") | An action, **Set errors**, puts the server's message on the right field |
| Load a record to edit | An action, **Set values**; the loaded record is where the form starts from, so it is not a change |
| Start again | **Reset** (back to where the form started) or **Done** with reset after a send |
| Warn about unsaved changes | `dirty` is true while anything differs from the start |
| One list of the problems | **List the errors above the form**; each line focuses its field |
| Many kinds of control in one form | Input, Textarea, Number, Password, Checkbox, Switch, Radio, Segmented, Select, Combobox, Slider, Tags, Pin, Rating, Date Time and Date Range all join by name |
| Values as an object ready for an API | `owner.name` and `owner.city` make `{ owner: { name, city } }` |

What it does **not** do yet: a dialog to edit rules (they are properties of each control), lists of rows that grow, wizard steps, and holding setpoints until an Apply button (recipe 10 shows how to apply setpoints together with Logic today).

---

## Your first form

1. **Drop a Form** from the palette (UI · Form). Its slot is a column: drop controls into it. On the canvas it shows a dashed frame called *Form*.
2. **Name each control**: in its inspector, tab **Form**, *Name in the form*: `email`, `password`, `agree`. A control with no name is not part of the form.
3. **Add rules** in the same tab and in the control's own tabs: *Required* (Field tab), *Shortest text*, *Rule (JavaScript)*; *Max length*, *Pattern* (Data tab); a Number's *Minimum* and *Maximum*.
4. **Drop a Button** into the form. Its tab **Form**: *In a form, this button* → *Sends the form*. Tick *Disabled until the form is valid* if you want it off until then.
5. **Wire the work**: in the Events tab pick the Form's **On Submit** node, wire it to what sends the data (an API Call, a Function ...), and wire the result back to an **Update** node on the Form with the action **Sending is over** (`done`).

This is the login screen of recipe 1, as you build it:

![The login screen in the editor: a Form with two fields and a Send button](images/form/login-design.png)

*The screen in the editor. The dashed frame is the Form; what is inside it is its fields. The text on the right shows the form's state (recipe 13).*

| The field's name | The Send button |
| --- | --- |
| ![Name in the form, in the inspector](images/form/login-inspector-name.png) | ![In a form, this button: Sends the form](images/form/login-inspector-send.png) |

And its Logic: three kinds of node, wired left to right. *On Submit* is the form's event; the Functions are your work (here a pretend server); the orange nodes are Update nodes that talk back to the form.

![The Logic of the login screen](images/form/login-logic.png)

---

## Rules

A rule belongs to a control. The Form runs all of a control's rules on every change, in this order, and shows the first one that fails.

| Rule | Where | What it checks |
| --- | --- | --- |
| Required | Field tab (`required`), message in the Form tab | Not empty. A Checkbox or Switch: must be **on** |
| Shortest text | Form tab (`minLength`) of a text field | At least that many characters (empty fails) |
| Max length | Data tab (`maxLength`) | At most that many characters |
| Pattern | Data tab (`pattern`, `patternMessage`) | The whole text matches a regular expression (empty fails unless the pattern accepts nothing) |
| Minimum / Maximum | Data tab of a Number | The number is not outside them (an empty number is below the minimum). Text that is not a number is refused at once |
| Rule (JavaScript) | Form tab (`ruleCode`, `ruleMessage`) | Whatever you write |

**A rule in JavaScript** is the body of a function of `(value, values, form)`:

- `value`: this field's value. `values`: every field by name (`values.password`). `form.name`: this field's name.
- Return `true` (or nothing) when it is fine. Return `false` (the message is *Message when the rule says false*) or a text (that text is the message) when it is not.
- It answers **at once** and is run on every change (and again when any other field changes, because it may read them). It cannot wait for a server: ask the server with Logic ([recipe 3](#3-production-entry-that-adds-up-and-checks-the-server)).
- A mistake in your code shows as the field's error ("The rule failed: ..."), so it never passes in silence.

```js
// at least 8 characters, an upper case letter and a digit
return (value.length >= 8 && /[A-Z]/.test(value) && /[0-9]/.test(value)) || "8+ characters, a capital and a digit";
```

**An empty field breaks a rule that asks for something**: a *Shortest text*, a *Pattern* (unless the pattern accepts nothing, like `[0-9]*`) and a number's *Minimum*. So a form that starts empty starts **invalid**, and a Send button that waits for the form is off from the first moment. A field that may stay empty simply has none of those rules (the *Max length* is never broken by nothing). A rule in JavaScript always runs; test for empty yourself when it matters.

---

## When an error shows

The form's **Show errors** setting (Behaviour tab):

| Setting | The error appears |
| --- | --- |
| While the user types (default) | as soon as the user has edited that field |
| When a field is left | when the user leaves it |
| Only when sending | after a Send was tried |

![The Form's Behaviour settings: Show errors](images/form/login-inspector-form.png)

Two things do not wait for this choice:

- **Whether the form is valid** is known from the first moment. A Send button that waits for it is right even before any error shows.
- **A control's own refusal** of what is typed (a Number that is not a number, or outside its Minimum / Maximum) shows at once.

After a **failed Send**, every error follows the typing, whatever the setting. A field that was only **loaded** (Set values) and never touched shows its message when a Send is tried ([recipe 4](#4-edit-a-record) shows it).

---

## What the form gives you

### Events (Logic: pick the Form's "On ..." node)

| Event | `msg.payload` | When |
| --- | --- | --- |
| **On Submit** | `{ values }` | The user sent the form and every rule is met |
| **On Invalid Submit** | `{ errors, values }` | The user tried to send it and something is wrong |
| **On Change** | `{ name, value, values, valid, errors }` | A field changed and the user paused (*On Change delay*, 300 ms) |
| **On Valid Change** | `{ valid }` | The form became valid or stopped being valid |
| **On Changed or Unchanged** | `{ dirty }` | The form began to differ from its start, or came back |
| **On Reset** | `{ values }` | The form was put back to its start |

`values` is an object by the fields' names: `{ email: "a@b.co", owner: { name: "Ann" } }`. `errors` is `{ field: message }`.

### Outputs (Data tab of the Form: bind each to a variable)

| Output | Holds | Use it to |
| --- | --- | --- |
| Values | the same object as `values` | show a preview, send it from anywhere |
| Errors | `{ field: message }` of what is shown | show your own list |
| Valid | `true` / `false` | enable things, show a green dot |
| Changed | `true` / `false` | enable "Save changes", warn about unsaved work |
| Sending | `true` / `false` | show a banner, lock the screen |

They are written when they change, not on every key. A Text can show them (`Valid: {formValid}`), a Button's Disabled can be bound to them ([recipe 4](#4-edit-a-record)).

### Actions (Logic: an Update node on the Form)

| Action | `msg.payload` | What it does |
| --- | --- | --- |
| Check every rule now | | Shows every error, as a failed Send does, and sends nothing |
| Send the form | | The same as the Send button |
| Reset | | Every field goes back to where the form started; errors are forgotten |
| **Set values** | `{ email: "a@b.co", owner: { name: "Ann" } }` | Fills fields by name. This becomes where the form starts from. It also works when it arrives **before** the fields are on the page: each field takes its value when it joins |
| **Set errors** | `{ po: "Already used" }` | Puts messages on fields and ends the sending. A message goes when that field is edited |
| Clear errors | a list of names (optional) | Removes the messages put by Set errors |
| Focus a field | `"po"` | Focuses that field; without a name, the first one with an error |
| **Sending is over** (`done`) | `{ reset: true }` (optional) | Not sending any more; what is entered becomes where the form starts from. With `reset`, the form goes back to its start instead |

---

## Things to know

- **A control joins by name.** No name, no form. Two controls in one form with the same name: the second stays out. The same name in two **different** forms is fine ([recipe 14](#14-several-forms-on-one-screen)).
- **Typed text counts.** Inside a form, what a user typed is part of the values as soon as it is typed, and leaving the field keeps it. (A control outside a form works as before: Enter writes, leaving cancels.)
- **Enter sends the form** from a one-line field; in a Textarea it is Ctrl+Enter. Turn it off with *Enter in a field sends the form*.
- **A password stays in its field** inside a form (outside one it empties after it is written). The form holds the value until you send it. Remember it is in `values`: do not write `values` to a variable that is shown or saved if it has a password.
- **Where "the start" is.** The form starts from each control's *Default value*. *Set values* and *Sending is over* move the start to what is in the form. *Reset* goes back to the start; *Changed* is true while anything differs from it.
- **A control keeps its size.** A helper text or an error line has its own row under the control: the control is never squeezed when it appears, and the box of the component grows to hold the label, the control and the line if the height you gave it is too small. In a Form the row is always kept, so an error that appears moves nothing.
- **A disabled or hidden field still counts.** Its rules still apply, so a field you hide and leave empty keeps a required form invalid. To make a field required only sometimes, use a rule in JavaScript instead of *Required* ([recipe 8](#8-a-field-that-is-required-only-sometimes)).
- **The server is Logic's job.** A rule cannot wait for an answer. On Change → your server call → Set errors does it ([recipe 3](#3-production-entry-that-adds-up-and-checks-the-server)).
- **At On Load, values may not be there yet.** A variable or a tag may not have its value in the first moment of a page. Read it after a moment ([recipe 10](#10-setpoints-applied-together)).
- **Dates.** A Date Time's value is what it writes (by default an ISO text); a Date Range's is `{ start, end }`. Both are empty (`null`) until chosen.

---

## Try the examples

Every recipe below is a screen of one example project, [examples/form-cookbook.nexa.json](examples/form-cookbook.nexa.json).

1. Open the **Screens** tab of the Nexa editor and press the **Import** button (the upload icon next to Export).
2. Choose `form-cookbook.nexa.json`. Nexa shows what is in the file and what your project has now; **nothing changes until you press *Replace the project***. The import is one revision: Ctrl+Z brings your project back.
3. Because it **replaces** the project, use a spare Node-RED (or a copy of your project's file), not the one you work in.
4. Deploy, and open the screens at `/nexa/c1-login`, `/nexa/c2-register`, ...: each is named like its recipe.

There is no real server in the examples: a Function node called **Fake server ...** answers after a short pause, the way your API would. In your own screen put your API Call (or HTTP Request) where it is.

---

## Cookbook

Each recipe says what to build, what to wire and what you see. `On Submit · Form` means the Form's On Submit node; `Update · Form · Done` means an Update node on the Form with the action *Sending is over*. The screens were run for real while the pictures were taken, and the run **checks** what the recipe says (for example that the message is the one written here); a recipe that stops being true makes the check fail.

### 1. Login

**Build.** A Form with an Input (`username`, Required), a Password Input (`password`, Required) and a Button (*Sends the form*, *Disabled until the form is valid*). Form: *Show errors* "When a field is left".

![The empty login form: the Sign in button waits](images/form/login-empty.png)

*Empty: the Sign in button is off until both fields are filled.*

**Wire.**

![The Logic of the login screen](images/form/login-logic.png)

```
[On Submit · Form] → [Fake server: log in]  (in your screen: an API Call)
                       ├─ [Right password?] → [Update · Form · Done]
                       └─ [Wrong password?] → [Update · Form · Set errors]
```

```js
// Fake server: log in (it answers after 1.5 s: ann / secret is the right pair)
var v = msg.payload.values;
return new Promise(function (resolve) {
    setTimeout(function () {
        msg.statusCode = (v.username === "ann" && v.password === "secret") ? 200 : 401;
        resolve(msg);
    }, 1500);
});
```

```js
// Right password?
if (msg.statusCode !== 200) return null;
vars.screen.set("welcome", "Welcome, " + msg.payload.values.username + "!");
msg.payload = { reset: true };         // Sending is over, and the form is emptied
return msg;
```

```js
// Wrong password?
if (msg.statusCode === 200) return null;
msg.payload = { password: "Wrong user name or password" };      // goes on the password field
return msg;
```

**You see.**

| While the server answers | A wrong password | A right one |
| --- | --- | --- |
| ![The Sign in button shows a spinner](images/form/login-sending.png) | ![The message under the password](images/form/login-wrong-password.png) | ![Welcome, ann!](images/form/login-welcome.png) |
| The button shows a spinner and cannot be clicked again; `sending = true`. | The message is on the password field, and the text is selected so the user retypes it. | The form is empty again and the welcome shows. |

### 2. Registration with a password strength bar

**Build.** Form with Input `email` (Pattern `[^@ ]+@[^@ ]+`, message "Not an email"), Password Input `password`, Password Input `confirm`, a Progress bar bound to a variable `strength`, a Send button.

| The rule of `password` | The rule of `confirm` |
| --- | --- |
| ![The password rule in the inspector](images/form/register-inspector-password-rule.png) | ![The confirm rule in the inspector](images/form/register-inspector-confirm-rule.png) |

```js
// Rule (JavaScript) of `password`
var score = 0;
if (value.length >= 8) score++;
if (/[A-Z]/.test(value)) score++;
if (/[0-9]/.test(value)) score++;
if (/[^A-Za-z0-9]/.test(value)) score++;
return score >= 3 || "Use 8 or more characters with capitals, digits or a symbol";
```

```js
// Rule (JavaScript) of `confirm`
return value === values.password || "The passwords are not the same";
```

Because a rule is run again when any field changes, `confirm` turns red if the user changes `password` afterwards.

**Wire the bar.** The form's On Change fires while typing, after a pause:

![The Logic of the registration screen](images/form/register-logic.png)

```js
// Strength 0 to 100
if (msg.payload.name !== "password") return null;     // only the password field
var p = msg.payload.value || "", s = 0;
if (p.length >= 8) s++;
if (/[A-Z]/.test(p)) s++;
if (/[0-9]/.test(p)) s++;
if (/[^A-Za-z0-9]/.test(p)) s++;
vars.screen.set("strength", s * 25);
return null;
```

**You see.**

| Empty | A weak password, a wrong email | A strong one that was repeated wrongly | Ready | Created |
| --- | --- | --- | --- | --- |
| ![Empty](images/form/register-empty.png) | ![Weak](images/form/register-weak.png) | ![Not the same](images/form/register-not-the-same.png) | ![Ready](images/form/register-ready.png) | ![Created](images/form/register-created.png) |

The bar follows the typing (75% for `Abcdef12`); the Create account button turns on only when every rule is met, and after the send the form is empty again.

### 3. Production entry that adds up and checks the server

**Build.** Fields: Input `po` (Required, Pattern `PO-[0-9]+`, message "Like PO-123"), Number `total` (Required, Minimum 1), Number `ok` and Number `reject` (default 0), a Send button.

| The rule of the total | The pattern of the order number |
| --- | --- |
| ![The rule of the total in the inspector](images/form/production-inspector-total-rule.png) | ![The pattern of the order number in the inspector](images/form/production-inspector-po-pattern.png) |

```js
// Rule (JavaScript) of `total`
return values.ok + values.reject === value || "OK + rejected must equal the total";
```

It is checked again whenever `ok` or `reject` changes.

**Wire the server check** ("is this order number already used?") **and the send:**

![The Logic of the production screen: the check on the first row, the send on the second](images/form/production-logic.png)

```js
// Only the order number
if (msg.payload.name !== "po" || msg.payload.errors.po) return null;   // another field, or already wrong
msg.po = msg.payload.value;
return msg;
```

```js
// Taken?  (the fake server says { exists: true } for PO-100)
if (msg.payload.exists) return { payload: { po: "Already used" } };
return null;
```

```js
// Remember it  (after the fake server saved it)
vars.screen.set("lastSaved", msg.saved);
msg.payload = { reset: true };
return msg;
```

**You see.**

| Empty | The numbers do not add up | They add up | The server says it is taken | Saved |
| --- | --- | --- | --- | --- |
| ![Empty](images/form/production-empty.png) | ![7 + 2 is not 10](images/form/production-does-not-add-up.png) | ![7 + 3 is 10](images/form/production-adds-up.png) | ![Already used](images/form/production-taken.png) | ![Saved, and the form is clear](images/form/production-saved.png) |

The message from the server appears under `po` a moment after the user stops typing; it goes when they edit the field.

### 4. Edit a record

**Build.** The fields of recipe 3 (with the same rule on `total`), a *Revert* Button inside the form (*Resets the form*), the Form output *Changed* bound to a variable `formDirty`, and a Button **outside** the form, *Save changes*, with **Disabled** bound to an Expression `!{formDirty}`: it is on only while the form differs from the loaded record.

![Disabled bound to !{formDirty}](images/form/edit-inspector-disabled.png)

![The outputs of the Form](images/form/edit-inspector-outputs.png)

**Wire.**

![The Logic of the edit screen](images/form/edit-logic.png)

- **On Load** → the server (here: *Fake server: get order 7*) → **Update · Form · Set values**. The record's property names are the fields' names (`po`, `total`, `ok`, `reject`); a nested record fills `owner.name` and the like.
- **On Click · Save changes** → **Update · Form · Send the form**: a button outside the form can send it through the action.
- **On Submit · Form** → the server (*Fake server: save order 7*) → **Update · Form · Done**: the saved values are the new start.

**You see.**

| Loaded | Saved with a wrong total | Edited and right | Saving | Saved |
| --- | --- | --- | --- | --- |
| ![Loaded](images/form/edit-loaded.png) | ![Does not add up](images/form/edit-does-not-add-up.png) | ![Edited](images/form/edit-edited.png) | ![Saving](images/form/edit-saving.png) | ![Saved](images/form/edit-saved.png) |
| The form opens filled; *Save changes* is off. | Only `ok` was edited, so the total shows nothing yet; pressing *Save changes* sends the form and the total says it does not add up. | Save changes is on while the form differs from the record. | The server works: `sending = true`. | After the save it is off again: the saved values are the new start. |

### 5. The server says no, field by field

If your API answers a bad request with `{ "errors": { "po": "Already used", "qty": "Only 5 left" } }`, one Function puts every message on its field. The form here also lists the errors above the fields (*List the errors above the form after a failed Submit*, recipe 7).

![The Logic of the screen: On Submit, the server, a Function, Set errors](images/form/server-errors-logic.png)

```js
// Take the field messages  (the error output of an API Call keeps the body the API gave as msg.payload)
var body = msg.payload;
if (body && body.errors) { msg.payload = body.errors; return msg; }
msg.payload = { _form: "Something went wrong" };    // not a field: ignored by the form
return msg;
```

| The form | A Send with nothing filled (recipe 7) | The server refused two fields |
| --- | --- | --- |
| ![Empty](images/form/server-errors-empty.png) | ![The list names the empty fields](images/form/server-errors-summary.png) | ![The server refused two fields: each shows its own message](images/form/server-errors-server-says-no.png) |

Names that are not fields are ignored, and Set errors also ends the sending.

### 6. A Send button that waits, and a spinner

Button inside the form: *In a form, this button* = *Sends the form*, tick *Disabled until the form is valid*. While the form is being sent (from a valid Send until `Done` / `Set errors` / `Reset`) the button shows a spinner and cannot be clicked again. The pictures are in recipe 1: [empty (waiting)](images/form/login-empty.png) and [sending](images/form/login-sending.png). To lock the whole screen as well, bind the form's *Sending* output to a variable and bind other controls' *Disabled* to it.

### 7. A list of the errors

Form → Behaviour tab → *List the errors above the form after a failed Submit*, and set *Title of the list*.

![The Form's Behaviour tab with the error list turned on](images/form/server-errors-inspector-summary.png)

After a failed Send the list appears above the fields; each name in it focuses its field (the picture is in recipe 5, [a Send with nothing filled](images/form/server-errors-summary.png)).

### 8. A field that is required only sometimes

*Required* always applies. For "the order number is required when *This lot has an order* is ticked", leave *Required* off and use a rule on the Input `po`:

![The rule in the inspector](images/form/conditional-inspector-rule.png)

```js
return !values.hasOrder || !!value || "Required when there is an order";
```

(`hasOrder` is the name of the Checkbox in the form.) The rule is run again when the checkbox changes.

| Box off: nothing is required | Box ticked, sent empty | Filled |
| --- | --- | --- |
| ![Off](images/form/conditional-off.png) | ![Required](images/form/conditional-required.png) | ![Sent](images/form/conditional-sent.png) |

![The Logic: On Submit, a Function that says what was sent, Done](images/form/conditional-logic.png)

### 9. A report filter with a date range

**Build.** Form with a Date Range (`period`, Required, *Write output format* ISO), a Select (`line`, Required, three options), a Button (*Sends the form*).

![The name of the Date Range in the form, in the inspector](images/form/filter-inspector-period.png)

```
[On Submit · Form] → [Fake server: the report] → [Update · Form · Done]
```

![The Logic of the filter screen](images/form/filter-logic.png)

```js
// Fake server: the report (in your screen: an API Call; values.period is { start, end })
var v = msg.payload.values;
vars.screen.set("report", v.line + ": " + v.period.start.slice(0, 10) + " to " + v.period.end.slice(0, 10) + " - 124 batches");
```

| Empty | Filled | The result |
| --- | --- | --- |
| ![Empty](images/form/filter-empty.png) | ![Filled](images/form/filter-filled.png) | ![Report](images/form/filter-report.png) |

(In the pictures the filter is filled with the *Set values* action; a user picks the dates in the calendar.) `values.period` is `{ start, end }`; each is an ISO text unless you chose another output format.

### 10. Setpoints applied together

Controls that are bound to a tag write as soon as the user presses Enter, one by one. To change several setpoints and apply them **together**, keep the controls **local** (no Value (read), no Value (write)) and let the Form's On Submit do the writing.

**Build.** A Form with Number `speed` (Minimum 0, Maximum 1500) and Number `temp` (Minimum 0, Maximum 120). The limits are the safe limits: a value outside them is refused as it is typed. A Button *Apply* (*Sends the form*, *Disabled until the form is valid*) and a Button *Revert* (*Resets the form*).

![The limits of a setpoint in the inspector](images/form/setpoints-inspector-limits.png)

**Wire.**

![The Logic of the setpoints screen](images/form/setpoints-logic.png)

- **On Load** → read the machine **after a moment** → **Update · Form · Set values**. A variable or a tag may not have its value in the first instant of a page, so the read waits a little (here a second).
- **On Submit · Form** → write the machine → **Update · Form · Done**.

```js
// Read the machine (after a moment)   - with real tags:
msg.payload = {
    speed: vars.shared.get("sparkplug::Plant::Line1::Mixer::Speed"),
    temp:  vars.shared.get("sparkplug::Plant::Line1::Mixer::Temp")
};
```

```js
// Write the machine (both together)   - with real tags: vars.shared.set(...) returns a promise
var v = msg.payload.values;
return Promise.all([
    vars.shared.set("sparkplug::Plant::Line1::Mixer::Speed", v.speed),
    vars.shared.set("sparkplug::Plant::Line1::Mixer::Temp", v.temp)
]).then(function () { return msg; });
```

(The example uses two screen variables, `speedNow` and `tempNow`, in place of the tags, so that it runs anywhere.)

| Loaded | Edited, not written | Out of range | Applied | Reverted |
| --- | --- | --- | --- | --- |
| ![Loaded](images/form/setpoints-loaded.png) | ![Edited](images/form/setpoints-edited.png) | ![Out of range](images/form/setpoints-out-of-range.png) | ![Applied](images/form/setpoints-applied.png) | ![Reverted](images/form/setpoints-reverted.png) |
| The form shows what the machine has. | The user typed 1200 and 75: the machine still has 800 and 60. | 500 is over the limit: the message, and Apply waits. | Both reached the machine together. | Revert went back to the values of the machine. |

A real HMI mode, with an Apply / Revert row built in, a confirmation and a read-back, is a later step.

### 11. Show every problem now, without sending

A button that lets the user see everything that is wrong before they try to send (a "Check" button): a normal Button (it does nothing to the form by itself) wired to an Update node on the Form with the action **Check every rule now**:

![The Logic: On Click, then Check every rule now](images/form/check-logic.png)

| Before | After the Check button |
| --- | --- |
| ![Empty](images/form/check-empty.png) | ![Checked](images/form/check-checked.png) |

Every error appears (as after a failed Send), the first wrong field is focused, and nothing is sent. Use the **Valid** output to enable the next step.

### 12. Focus a field when the screen opens

```
[On Load] → [Function: which field?] → [Update · Form · Focus a field]
```

![The Logic: On Load, a Function that says "username", Focus a field](images/form/focus-logic.png)

```js
// Which field?
msg.payload = "username";
return msg;
```

![The user name field has the focus when the screen opens](images/form/focus-focused.png)

### 13. Show the form's state

Bind *Valid*, *Changed* and *Sending* to variables, then show them anywhere: a Text `Valid: {formValid}`, a Badge whose colour follows `formValid`, a banner "Unsaved changes" visible while `formDirty` is true.

![The outputs of the Form, bound to variables](images/form/state-inspector-outputs.png)

| Start | Changed | Valid | Sending |
| --- | --- | --- | --- |
| ![Start](images/form/state-start.png) | ![Changed](images/form/state-changed.png) | ![Valid](images/form/state-valid.png) | ![Sending](images/form/state-sending.png) |

### 14. Several forms on one screen

Each Form is its own world: names only have to be different **inside** one form. Two forms may both have a field called `name`. Each has its own outputs, events and actions; pick the Form you mean in each Logic node.

| Both empty | Only the customer form filled |
| --- | --- |
| ![Both empty](images/form/two-forms-both-empty.png) | ![One filled](images/form/two-forms-one-filled.png) |

### 15. Keep the data, or clear it

After a good send, the **Sending is over** action decides:

- no payload: the form keeps what was typed, and that becomes where it starts from (good for editing);
- `{ reset: true }`: the form goes back to its start (good for entering one record after another).

![The Logic: the left form is sent and kept, the right one is sent and cleared](images/form/keep-or-clear-logic.png)

| Typed in both | After both were sent |
| --- | --- |
| ![Typed](images/form/keep-or-clear-typed.png) | ![After the send: the left keeps its text, the right is empty](images/form/keep-or-clear-after-send.png) |

---

## When something does not work

| You see | Look at |
| --- | --- |
| A field is not in `values` | Its *Name in the form* is empty, or another field in the same form has that name, or the control is not inside the Form's slot |
| Send does nothing | Is the Button inside the Form, with *In a form, this button* set to *Sends the form*? Is *Disabled until the form is valid* on and some field still wrong? |
| On Submit never fires | A rule fails. Turn on *List the errors above the form*, or wire On Invalid Submit to a Debug node |
| Send worked once and now does nothing | The form is still "sending": wire the result back to **Sending is over** (or **Set errors**) |
| An error will not go away | It came from **Set errors**: it goes when the user edits that field, or use **Clear errors** |
| The error appears too early (or too late) | The form's *Show errors* setting |
| A field that was loaded shows no error although it is wrong | Errors show for a field the user touched, or after a Send was tried; use **Check every rule now** to show them all |
| A rule in JavaScript shows "The rule failed" | A mistake in the code: the message says what |
| A number field does not accept what is typed | Its Minimum / Maximum, or the text is not a number |
| *Set values* did nothing | Does the record use the fields' names (`po`, `owner.name`)? A name the form does not have is ignored |
| *Reset* does not empty the form | Reset goes back to where it **started**: after Set values or Sending is over that is the loaded or sent data. Use `{ reset: true }` on a form that started empty |
| The form is empty at On Load although you set values | A variable or a tag may not have its value yet at the first instant: read it after a moment ([recipe 10](#10-setpoints-applied-together)) |
