# 15. Cookbook

Fifteen forms, built from the pieces of the earlier chapters. Each one is a real screen: the pictures are taken from it while it runs, in a browser, with the clicks and keystrokes of a person, and the example project that goes with this manual contains all fifteen so that you can open them, try them and change them.

## How to use this chapter

**Import the project.** The file `docs/examples/form-cookbook.nexa.json` is a Nexa project. In the editor, open the *Screens* tab and use the *Import* button to read it. You get fifteen screens named *1. Login* to *15. One Zod schema for the whole form*, each with its components, variables and Logic. **Importing replaces the project you have open**, so do it in a spare project.

**About the "Fake server".** The recipes need no real server. Where a form would call an API, the Logic has a *Function* node named **Fake server …** that waits a moment and then answers, the way a real one would. In your own screen, replace each with an **API Call** node (chapter 13); the nodes around it stay as they are. The pauses are long on purpose, so that you can see the Send button spin.

**Reading a recipe.** Each begins with what it is for, then how it is built (only the settings that are not the defaults), then its Logic, and then what you see when it runs. The first five are the everyday forms, the next eight each show one idea, and the last two bring a server and a schema together.

| # | Recipe | The idea it teaches |
| --- | --- | --- |
| 1 | [Login](#1-login) | the basic Send, a refusal on a field |
| 2 | [Registration with a password strength bar](#2-registration-with-a-password-strength-bar) | rules in JavaScript, two fields that must agree, following what is typed |
| 3 | [Production entry that adds up and checks the server](#3-production-entry-that-adds-up-and-checks-the-server) | a rule over several fields, a server check as the person types |
| 4 | [Edit a record](#4-edit-a-record) | loading a record, a Save button that waits for a change |
| 5 | [The server says no, field by field](#5-the-server-says-no-field-by-field) | refusals from the server on each field, the list of errors |
| 6 | [A field that is required only sometimes](#6-a-field-that-is-required-only-sometimes) | a rule that depends on another field |
| 7 | [A report filter with a date range](#7-a-report-filter-with-a-date-range) | a Date Range and a Select in a form |
| 8 | [Setpoints applied together](#8-setpoints-applied-together) | limits, Apply and Revert for machine values |
| 9 | [Show every problem now, without sending](#9-show-every-problem-now-without-sending) | a Check button |
| 10 | [Focus a field when the screen opens](#10-focus-a-field-when-the-screen-opens) | the Focus action |
| 11 | [Show the form's state](#11-show-the-forms-state) | the outputs: valid, changed, sending |
| 12 | [Several forms on one screen](#12-several-forms-on-one-screen) | forms that do not mix |
| 13 | [Keep the data, or clear it](#13-keep-the-data-or-clear-it) | the two ways to say Done |
| 14 | [Is this user name free?](#14-is-this-user-name-free) | rules, Zod and the server together, "Checking…" |
| 15 | [One Zod schema for the whole form](#15-one-zod-schema-for-the-whole-form) | the Validate node at Send |

---

## 1. Login

**What it is for.** A user name and a password, a Sign in button that waits until both are there, a spinner while the server thinks, and a refusal that appears under the password field when the answer is no. This is the smallest complete form. It is also the one that chapter 2 builds step by step; this recipe is the finished result.

![The login screen in the editor](../images/form/login-design.png)

**How it is built.**

- A **Form** with *Show errors* set to **When a field is left**, so that nothing is shouted at the person before they have finished with a field.
- An **Input** called `username` (label *User name*, *Required*) and a **Password Input** called `password` (*Required*).
- A **Button** *Sign in* with *In a form, this button* = **Sends the form**, and *Disabled until the form is valid* on.

![Name in the form](../images/form/login-inspector-name.png)
![The Send button's Form settings](../images/form/login-inspector-send.png)
![The Form's Show errors setting](../images/form/login-inspector-form.png)

**The Logic.**

![The Logic of the login screen](../images/form/login-logic.png)

*On Submit* leads to the fake server, which says 200 for the user `ann` with the password `secret`, and 401 for anything else. Two Functions look at the answer: one passes only the 200, sets a variable `welcome` and sends `{ reset: true }` to *Sending is over*; the other passes only the refusal and sends `{ password: "Wrong user name or password" }` to *Set errors*.

**What you see.** The button is grey while the form is empty. Once both fields are filled it is blue. After the click it turns into a spinner for a second and a half:

![The empty form: Sign in waits](../images/form/login-empty.png)
![Sign in is a spinner while it is sent](../images/form/login-sending.png)

A wrong password comes back as a message under the password field, which is also where the focus goes, so that the person can type the password again:

![The refusal](../images/form/login-wrong-password.png)

A right one empties the form and shows the welcome:

![Welcome](../images/form/login-welcome.png)

**Notice.** The refusal says "user name or password", not which. That is a deliberate choice for logins: it does not tell a stranger which half was right. And the Send button's spinner is not something you built: the form knows it is sending, until a *Sending is over* or a *Set errors* arrives.

---

## 2. Registration with a password strength bar

**What it is for.** A form with three fields that must agree: an email, a password that must be strong, and a repeat of it. A bar fills as the password gets stronger.

![The registration screen](../images/form/register-design.png)

**How it is built.**

- *Show errors*: **While the user types**. Each field is judged as it is typed.
- The **email**, an Input: *Required*, with the *Pattern* `[^@ ]+@[^@ ]+` and the message *Not an email*.
- The **password**, a Password Input: *Required*, and a **rule in JavaScript** that scores it:

  ```js
  var score = 0;
  if (value.length >= 8) score++;
  if (/[A-Z]/.test(value)) score++;
  if (/[0-9]/.test(value)) score++;
  if (/[^A-Za-z0-9]/.test(value)) score++;
  return score >= 3 || "Use 8 or more characters with capitals, digits or a symbol";
  ```

  ![The password's rule](../images/form/register-inspector-password-rule.png)
- The **repeat**, a Password Input: *Required*, and a rule that looks at another field:

  ```js
  return value === values.password || "The passwords are not the same";
  ```

  ![The repeat's rule](../images/form/register-inspector-confirm-rule.png)
- A **Progress bar** whose value is the variable `strength`.

**The Logic.**

![The Logic of the registration screen](../images/form/register-logic.png)

Two flows. The upper starts with the form's *On Change*. It first filters on `msg.payload.name`, because the event comes for every field and only the password matters. It then scores the typed password in the same way, and writes `strength` (0, 25, 50, 75 or 100) with `vars.screen.set`. The lower is the usual Send: the fake server makes the account, and *Sending is over* clears the form.

**What you see.**

![Empty](../images/form/register-empty.png)

A short password and a text that is not an email are refused, each with its own message:

![Weak](../images/form/register-weak.png)

A password that is strong enough, and a repeat that is not the same:

![Not the same](../images/form/register-not-the-same.png)

When everything is right the button turns on, and the bar is at 75 (it reaches 100 with a symbol):

![Ready](../images/form/register-ready.png)
![Created](../images/form/register-created.png)

**Notice.** The repeat field's rule is judged again whenever the *password* changes, not only when the repeat does: the form re-runs every rule at every change, since a rule may look at any field. That is why correcting the first password makes the "not the same" message appear or go away on the second.

---

## 3. Production entry that adds up and checks the server

**What it is for.** An entry in a production log: an order number, a total, how many were good and how many were rejected. The good and the rejected must add up to the total, and the order number must not have been used before, which only a server knows.

![The production screen](../images/form/production-design.png)

**How it is built.**

- The **order number**, an Input: *Required*, *Pattern* `PO-[0-9]+` with the message *Like PO-123*.

  ![The pattern](../images/form/production-inspector-po-pattern.png)
- The **total**, a Number Input: *Required*, *Minimum* 1, and the rule

  ```js
  return values.ok + values.reject === value || "OK + rejected must equal the total";
  ```

  ![The total's rule](../images/form/production-inspector-total-rule.png)
- **OK** and **Rejected**, Number Inputs with *Default value* `0` and *Minimum* 0. Their start is a real `0`, so the form counts them as filled in.
- A Send button, *Save*, which waits for the form to be valid.

**The Logic.**

![The Logic of the production screen](../images/form/production-logic.png)

*Upper flow, the check:* *On Change* → a Function that lets only the order number through, and only if the order number has no error of its own (`msg.payload.errors.po`), keeping the number in `msg.po` → the fake server → a Function that returns `{ payload: { po: "Already used" } }` when the server said the number exists, and `null` when it did not → *Set errors*.

*Lower flow, the Send:* the fake server saves → a Function remembers the saved text in a variable and prepares `{ reset: true }` → *Sending is over*.

**What you see.**

![Empty](../images/form/production-empty.png)

With 7 good and 2 rejected, out of 10, the total says it does not add up. With 7 and 3, the message goes:

![Does not add up](../images/form/production-does-not-add-up.png)
![Adds up](../images/form/production-adds-up.png)

An order number that the server knows, PO-100 in this fake, is refused a moment after the typing stops:

![Taken](../images/form/production-taken.png)

A good one is saved, the text above the form says what was saved, and the form is empty for the next entry:

![Saved](../images/form/production-saved.png)

**Notice.** This check has no "Checking…" and no guard against late answers. It is the simple shape, and good enough where a wrong answer is merely a message that disappears when the person types again. When it must also stop Send while the answer is out, use recipe 14.

---

## 4. Edit a record

**What it is for.** The reverse of an entry: a record that exists is loaded into the form; the person changes it; a **Save changes** button is available only when something has changed; a **Revert** button throws the changes away.

![The edit screen](../images/form/edit-design.png)

**How it is built.**

- The same fields as recipe 3 (order number, total with its adding-up rule, OK, rejected), without the server check.
- A **Revert** button inside the form, *In a form, this button* = **Resets the form**, variant *Tertiary*.
- **Save changes** is a Button **outside** the form. Its *Disabled* setting is bound to the expression `!{formDirty}`, so that it is disabled while nothing has changed.

  ![Disabled, bound to the opposite of "changed"](../images/form/edit-inspector-disabled.png)
- The form's *Changed (write)* output goes to the variable `formDirty`.

  ![The Form's Changed output](../images/form/edit-inspector-outputs.png)

**The Logic.**

![The Logic of the edit screen](../images/form/edit-logic.png)

Three flows:

1. *On Load* → the fake server returns order 7 → *Set values*. The record fills the form, and becomes where the form starts.
2. *On Click* of Save changes → an Update node with **Send the form**. The button is outside the form, so it reaches the form through Logic (chapter 12, section 12.6).
3. The usual *On Submit* → fake server → *Sending is over*. Plain Done, so that what was saved becomes the new start.

**What you see.** The record is loaded, nothing is changed, and Save changes is grey:

![Loaded](../images/form/edit-loaded.png)

Typing makes the form "changed", and Save changes turns on. Clicking it with numbers that do not add up shows the message and does not send:

![Does not add up](../images/form/edit-does-not-add-up.png)
![Edited](../images/form/edit-edited.png)

After the fix, a click sends. Save changes is outside the form, so it has no spinner of its own; the form is *sending* while the fake server thinks. When the answer comes back, the form is "unchanged" again and Save changes is grey:

![Saving](../images/form/edit-saving.png)
![Saved](../images/form/edit-saved.png)

**Notice.**

- The total was loaded, not typed. Its message waits until the person touches it or sends: a record that is loaded should not show an error before anybody did anything. That is the rule of chapter 7.
- This is the pattern for **every** "edit and save" screen: *Set values* to load, *Changed (write)* to a variable, a button disabled by the variable, and a plain *Sending is over* after a save.

---

## 5. The server says no, field by field

**What it is for.** A server checks things the page cannot, and it replies with the fields that are wrong. The form puts each message under its field, and lists them all above the form.

![The screen](../images/form/server-errors-design.png)

**How it is built.**

- An Input `po` (*Required*) and a Number Input `qty` (*Required*, *Minimum* 1).
- The form's **List the errors above the form after a failed Submit** is on, with the title *Please correct:*.

  ![The list of errors setting](../images/form/server-errors-inspector-summary.png)
- A Send button without *Disabled until the form is valid*: the person may press it with an empty form and be told why it cannot be sent.

**The Logic.**

![The Logic](../images/form/server-errors-logic.png)

*On Submit* → the fake server answers 422 with `{ errors: { po: "Already used", qty: "Only 5 left" } }` → a Function takes the `errors` from the body (or, if there are none, makes `{ _form: "Something went wrong" }`) → *Set errors*.

**What you see.** Sending an empty form shows what is missing. The list names the fields:

![Empty](../images/form/server-errors-empty.png)
![The list after an empty send](../images/form/server-errors-summary.png)

With values that the server does not like, the refusals arrive on their fields, and the list is updated:

![The server says no](../images/form/server-errors-server-says-no.png)

**Notice.**

- The key `_form`, which is not a field, is ignored by *Set errors*. A server's "general" message therefore cannot show here; show it in a Text component or a Toast, with a variable.
- The server's messages are the server's. If you can, let the server be the only place where a rule such as "Only 5 left" lives.

---

## 6. A field that is required only sometimes

**What it is for.** The order number is required, but only when the box *This lot has an order* is ticked. The built-in *Required* cannot say that, so a rule does.

![The screen](../images/form/conditional-design.png)

**How it is built.**

- A **Checkbox** `hasOrder`, with the *Text* "This lot has an order".
- An **Input** `po`, **not** marked Required, with this rule:

  ```js
  return !values.hasOrder || !!value || "Required when there is an order";
  ```

  ![The rule](../images/form/conditional-inspector-rule.png)

**The Logic.**

![The Logic](../images/form/conditional-logic.png)

*On Submit* → a Function that puts `Sent with order …` or `Sent without an order` in a variable → *Sending is over*.

**What you see.**

![The box is off: no order needed](../images/form/conditional-off.png)

Tick the box, and press Send with the order number empty:

![Required](../images/form/conditional-required.png)

Fill it, and it is sent:

![Sent](../images/form/conditional-sent.png)

**Notice.** The rule is judged again whenever *any* field changes, so ticking the box changes at once whether the order number is acceptable; when the message is *shown* is still decided by *Show errors* (chapter 7). Do not mark the field *Required* **and** write this rule: Required would still apply when the box is off.

---

## 7. A report filter with a date range

**What it is for.** A filter, not an entry: choose a period and a line, and ask for a report. A Date Range and a Select as form fields, with Send.

![The screen](../images/form/filter-design.png)

**How it is built.**

- A **Date Range** `period`: *Required*, *Timezone handling* UTC, *Time selection* **Off (date only)**, so that the start is the first instant of the first day and the end the last instant of the last day (chapter 11, section 11.3).

  ![Name in the form](../images/form/filter-inspector-period.png)
- A **Select** `line`: *Required*, with three options.
- A Send button, *Show report*, with *Disabled until the form is valid*.

**The Logic.**

![The Logic](../images/form/filter-logic.png)

*On Submit* → the fake server turns `values.period.start`, `values.period.end` and `values.line` into a line of text → *Sending is over*.

**What you see.**

![Empty](../images/form/filter-empty.png)
![A period and a line chosen](../images/form/filter-filled.png)
![The report](../images/form/filter-report.png)

**Notice.** `values.period` is an object, `{ start, end }`, with an ISO text in each. A real report call would use them as they are. Until a period is chosen the Date Range holds `null`, and *Required* says so.

---

## 8. Setpoints applied together

**What it is for.** Two numbers for a machine, a speed and a temperature, that must reach it **together**, and only when the person decides. An **Apply** button sends them. A **Revert** button goes back to what the machine has. Typing alone changes nothing on the machine.

![The screen](../images/form/setpoints-design.png)

**How it is built.**

- A Number Input `speed` (suffix *rpm*, *Minimum* 0, *Maximum* 1500, *Step* 10, *Required*) and a Number Input `temp` (suffix *C*, 0 to 120, *Required*).

  ![The limits](../images/form/setpoints-inspector-limits.png)
- **Apply**: *Sends the form*, *Disabled until the form is valid*. **Revert**: *Resets the form*.
- Two variables, `speedNow` and `tempNow`, stand for the machine. In your own screen they would be tags.

**The Logic.**

![The Logic](../images/form/setpoints-logic.png)

*On Load* → "read the machine" (after a pause) → *Set values*, so the form shows what the machine has, as its start. *On Submit* → "write the machine", both values at once → *Sending is over*.

**What you see.** The form shows the machine's values when the screen opens:

![Loaded](../images/form/setpoints-loaded.png)

Typing new ones changes the form and nothing else; the machine still says 800 rpm and 60 C:

![Edited](../images/form/setpoints-edited.png)

500 degrees is over the limit, and Apply waits:

![Out of range](../images/form/setpoints-out-of-range.png)

Apply writes both:

![Applied](../images/form/setpoints-applied.png)

And Revert, after typing something else, returns to what the machine has *now*, which is the new start (the plain *Sending is over* made it so):

![Reverted](../images/form/setpoints-reverted.png)

**Notice.** For a real machine, the fields are not bound to the tags; the **form** is the buffer between the person and the machine. A bound field would write on every Enter, one value at a time. For a risky value, add a confirmation in Logic before the write (chapter 13).

---

## 9. Show every problem now, without sending

**What it is for.** A "Check" button that tells the person everything that is wrong at once, with nothing sent.

![The screen](../images/form/check-design.png)

**How it is built.** The form has *Show errors* set to **Only when sending**: a message shows nowhere until something asks. Two required fields, an Input and a Number Input. A plain Button *Check*, with *In a form, this button* left at *Does nothing to the form*.

**The Logic.**

![The Logic](../images/form/check-logic.png)

*On Click* of the Check button → an Update node, *Check every rule now*.

**What you see.** Nothing is said while the form is empty:

![Empty](../images/form/check-empty.png)

Pressing Check shows every problem:

![Checked](../images/form/check-checked.png)

**Notice.** The form is not "sending" and nothing fires *On Submit* or *On Invalid Submit*.

---

## 10. Focus a field when the screen opens

**What it is for.** The person should be able to type at once, with no click.

![The screen](../images/form/focus-design.png)

**How it is built.** A form with two fields, `username` and `password`.

**The Logic.**

![The Logic](../images/form/focus-logic.png)

*On Load* → a Function that sets `msg.payload = "username"` → *Focus a field*.

**What you see.** The cursor is in the user name:

![Focused](../images/form/focus-focused.png)

**Notice.** Without a payload, *Focus a field* moves to the first field in error, and, when there is none, the first field. The name makes it say which.

---

## 11. Show the form's state

**What it is for.** Three outputs of the form, written to three variables, and shown as text: whether it is valid, whether it has been changed, and whether it is being sent. The same variables drive buttons, banners and warnings.

![The screen](../images/form/state-design.png)

**How it is built.** The form's **Valid (write)**, **Changed (write)** and **Sending (write)** are bound to the variables `formValid`, `formDirty` and `formSending`. Three Text components show them.

![The Form's outputs](../images/form/state-inspector-outputs.png)

**The Logic.**

![The Logic](../images/form/state-logic.png)

Only the usual Send, to have something to watch.

**What you see.**

![At the start](../images/form/state-start.png)

*Changed* turns true at the first keystroke, and *Valid* stays false until the email is an email:

![Changed, not valid](../images/form/state-changed.png)
![Valid](../images/form/state-valid.png)
![Sending](../images/form/state-sending.png)

**Notice.** *Valid* is true or false at every moment, whatever *Show errors* says. This is what a button's *Disabled* is bound to, when the button is not in the form. Several other recipes in this chapter show the same three in a line of text beside the form.

---

## 12. Several forms on one screen

**What it is for.** A customer and a supplier on the same screen, each with a *Name* field of the same name.

![The screen](../images/form/two-forms-design.png)

**How it is built.** Two Form components, each with its own field called `name`, and each form's *Valid (write)* bound to its own variable.

**What you see.**

![Both empty](../images/form/two-forms-both-empty.png)

Filling one makes only that one valid:

![One filled](../images/form/two-forms-one-filled.png)

**Notice.** The names are the same, `name`, and do not clash: a field belongs to the form around it, and nothing else (chapter 4). There is no Logic here. When you need some, each form has its own *On …* and *Update* nodes.

---

## 13. Keep the data, or clear it

**What it is for.** What happens to the text after a send: stay (the person is editing a record) or go (the person is entering the next one).

![The screen](../images/form/keep-or-clear-design.png)

**How it is built.** Two forms, each with a *Required* field called `note` and a Send button. Nothing else differs but the Logic.

**The Logic.**

![The Logic](../images/form/keep-or-clear-logic.png)

Both forms go to a fake server. The first ends with a plain *Sending is over*; the second, with `{ reset: true }`.

**What you see.** The same text in both:

![Typed](../images/form/keep-or-clear-typed.png)

After a send, the left form keeps its text, and the right is empty:

![After the send](../images/form/keep-or-clear-after-send.png)

**Notice.** Plain Done also makes the text the new **start**: the left form is no longer "changed", and a Reset would return to the text, not to blank (chapter 12, section 12.4).

---

## 14. Is this user name free?

**What it is for.** The one that puts the chapters together: a field with rules of its own, a schema for what the rules cannot say, a server that knows whether the name is taken, and the form refusing to be sent while the answer is out.

![The screen](../images/form/username-design.png)

**How it is built.**

- An **Input** `username`: *Required*, *Shortest text* 3, *Pattern* `[a-z]+` with the message *Lower case letters only*, and the helper text *3 to 12 lower case letters*.

  ![The field's rules](../images/form/username-inspector-rules.png)
- The form's *Values (write)* is bound to the variable `formValues`, which the stale-answer guard reads.
- A Send button, *Create the account*, with *Disabled until the form is valid*.

**The Logic.**

![The Logic](../images/form/username-logic.png)

*On Change* → a Function lets only `username` pass and makes `{ username: value }` → a **Validate** node with a schema that allows at most 12 letters and refuses the reserved names `admin`, `root` and `system`:

![The Validate dialog](../images/form/username-dialog-validate.png)

- Its **invalid** output goes to *Set errors*.
- Its **valid** output goes two ways, at once: a Function sets the payload to `"username"` and leads to *Mark fields as being checked*; and the fake server, a Function with two outputs, answers after a pause. If the name in the form has changed since, it drops the answer. If it is `ann` or `yeka`, it sends `{ username: "Already taken" }` to *Set errors*; any other name goes, as `["username"]`, to *Clear errors*.

The last flow is the usual Send: the server creates the account, and *Sending is over* with `{ reset: true }` clears the form.

**What you see.** The form starts empty and Send waits:

![Empty](../images/form/username-empty.png)

Two letters: the rule on the field answers at once:

![Too short](../images/form/username-too-short.png)

`root`: the field's rules are content, and the schema refuses:

![Reserved](../images/form/username-reserved.png)

`yeka`: everything on the page is satisfied, so the name goes to the server. The field says *Checking…* in place of its helper text, and Send cannot be pressed:

![Checking](../images/form/username-checking.png)

A moment later, the server says the name is taken:

![Taken](../images/form/username-taken.png)

A new name, `budi`, is checked again, and this time the answer is that it is free: the message is gone, the helper is back, and Send is on:

![Free](../images/form/username-free.png)

Send creates the account:

![Sending](../images/form/username-sending.png)

**Notice.**

- Every change of the field leads to either an answer from the schema or a check, so no "Checking…" is left behind. That is the rule of chapter 13, section 13.4.
- The guard reads `formValues.username` and compares it with the name that was asked about. Type another name while the server is thinking, and the first answer is simply dropped.

---

## 15. One Zod schema for the whole form

**What it is for.** A registration with rules that look at several fields: one schema, run when Send is pressed, finds every mistake at once.

![The screen](../images/form/gate-design.png)

**How it is built.**

- A form with *Show errors* set to **Only when sending**, and **List the errors above the form** on. The fields are an Input `email`, two Password Inputs `password` and `confirm`, and a Number Input `age`, all *Required*, and without any other rule.
- A **Register** button that sends the form, and does *not* wait for validity: the person finds out by pressing.

**The Logic.**

![The Logic](../images/form/gate-logic.png)

*On Submit* → **Validate** with *Check msg.* set to `payload.values`. Its **invalid** output goes to *Set errors*; the **valid** one to the server, and then *Sending is over*.

![The Validate dialog](../images/form/gate-dialog-validate.png)

The schema:

```js
return z.object({
    email: z.string().email("Not an email"),
    password: z.string().min(8, "At least 8 characters")
        .regex(/[A-Z]/, "Needs a capital letter")
        .regex(/[0-9]/, "Needs a digit"),
    confirm: z.string(),
    age: z.number({ invalid_type_error: "Age is required" })
        .int("Whole years only").min(18, "Must be 18 or older")
}).refine(function (v) { return v.password === v.confirm; },
          { message: "The passwords are not the same", path: ["confirm"] });
```

**What you see.** An empty form:

![Empty](../images/form/gate-empty.png)

Everything wrong at once (an email that is not one, a password without a capital, a different repeat, an age of 17):

![Everything wrong](../images/form/gate-everything-wrong.png)

Fixed, and sent:

![Sending](../images/form/gate-sending.png)
![Registered](../images/form/gate-registered.png)

**Notice.**

- Each field shows **one** message, the first for that field: the password is told about the capital letter, and the digit comes when that one is fixed.
- The "passwords are not the same" rule belongs to the **object**, and its `path` puts it under the repeat. Without the `path`, it would be named `_` and no field would show it.
- This schema repeats nothing the fields could do alone, which is the point: for a form that needs all its data, one schema at Send is the simplest thing that works.
