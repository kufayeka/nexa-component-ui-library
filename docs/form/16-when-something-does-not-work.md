# 16. When something does not work

This chapter is organised by what you see, not by what is wrong, because that is how a problem arrives. Find the sentence that describes your screen, and read the causes in the order given: they are in the order of how often they turn out to be the answer.

Before anything else, three questions settle a surprising share of the cases:

1. **Is the control inside the Form's panel?** In the editor, a control that belongs to a form sits inside the Form's *Fields* frame, and moves with it.
2. **Does the control have a *Name in the form*?** In the *Form* group of the inspector. Without it the control is not a field.
3. **Is the name the same, character for character, everywhere it is used?** In the Logic nodes, in *Set values*, in *Set errors*, in a rule's `values.…`. Names are case sensitive.

## The Send button is grey and I do not know why

The Send button is grey when *Disabled until the form is valid* is on and the form is not valid. Valid means that every field satisfies every rule, with no check still pending. Look for:

- **A required field that is empty.** The first suspect, and the obvious one.
- **A field with *Shortest text*, a *Pattern*, or a number *Minimum* that has not been filled yet.** An empty field breaks these (chapter 6), so a form that starts empty also starts invalid. This is intended, and it is why the button is grey from the first moment.
- **A field that is still *Checking…*.** A check that began and was never answered (section "The field is stuck at Checking…", below).
- **A rule in JavaScript that returns a message for the current values,** even though no message is shown yet. Under *Show errors* = *Only when sending*, or *When a field is left*, a field may be invalid and say nothing. Bind the form's *Errors (write)* output to a variable and show it, or press the button once on a form that does not wait for validity (chapter 12).
- **A field that is hidden.** A component with its state set to *hide* still counts, and its rule still applies, though nobody can see it. A component that is *removed* does not count.
- **A control that has no value yet that satisfies *Required***: a Pin Input with an incomplete code (chapter 10), a Date Range with one end only, a Checkbox that must be on.

To see what the form thinks, add a Text with `valid = {formValid}` and bind *Valid (write)* and *Errors (write)* to variables, as in recipe 11 of the cookbook.

## I press Send and nothing happens

Nothing at all: no spinner, no message, no *On Submit*.

- **The button is not inside the Form,** so its *In a form, this button* setting does nothing. Move it into the panel, or wire its *On Click* to an Update node with *Send the form* (chapter 12, section 12.6).
- **The form is already sending.** After a valid Send, the form ignores further sends until *Sending is over* or *Set errors* arrives. If an earlier send never ended, see "The Send button stays a spinner".
- **A field is still being checked.** A send is silently ignored while any field is *Checking…* (chapter 7, section 7.6).
- **The button is disabled or loading.** Its *Disabled*, or *Loading*, setting, or a binding on either.
- **You pressed it and the form was invalid.** Then it should have shown messages and moved the focus to the first wrong field; if you cannot see them, the field may be on another tab or scrolled out of view. Add *List the errors above the form* to see them in one place (chapter 3).

## The Send button stays a spinner

The form is *sending* and nobody told it to stop. Something in your Logic after *On Submit* never reaches *Sending is over* or *Set errors*. Check every path, including:

- the **error** output of an API Call, which is a second wire that is easy to leave unconnected;
- a **Function** that returns `null` on some branch, which silently ends the flow;
- a **Switch** or **Validate** node whose other output goes nowhere;
- a node that threw an error: look in the Logic's trace for the message.

The fix is to make every branch end in one of the two. Chapter 13 shows the shape.

## A field is missing from the values

`msg.payload.values` has no entry for a field you can see.

- The control has **no *Name in the form*** (it is not a field).
- The control is **outside the Form's panel**.
- **Two fields have the same name.** The first to join is the field; the second is left out, silently (chapter 4, section 4.2). Look for a duplicated name, especially after copying and pasting a field.
- **A name and a name inside it:** `owner` and `owner.name` cannot both be in the values; the first to join wins.
- **The component is removed** (its state is *remove*), so it has left the form.
- You are looking at a **list**: `items.0.qty` makes an object with the key `"0"`, not an array (chapter 4).

## A value arrives with the wrong shape

- **A number is `null`, not `0`, when empty.** And an empty text is `""`, not `null` (chapter 4, section 4.4). A rule that tests the wrong one never fires.
- **A date is a text, or a number, depending on its *Write output format*.** The default is an ISO text; chapter 11 lists the others.
- **A Pin Input is `""` until the code is complete.**
- **A Tags Input starts with two tags,** `react` and `lit`, in the sample; empty its *Default tags*. A Radio Group and a Segmented Control start with the option `a` chosen; change their *Default value*. A Slider starts at 40, and a Rating at 3. These are all samples that you are expected to replace, and in a form, the default is the start.
- **The value of a Select is the option's *value*, not its label.**

## The message does not show

The form is not valid, but no message appears under the field.

- **It is not time yet.** *Show errors* (chapter 3) decides when a field may speak: while typing, when the field is left, or only when sending. Until then, a field can be wrong and silent. Press Send, or use the *Check every rule now* action.
- **The message was put on a name that is not a field.** *Set errors* ignores keys that are not fields. A Validate node's `_` is the name of a problem about the whole value, and no field has it: give the rule a `path` (chapter 14).
- **The name in the message is slightly different** from the field's name: `userName` against `username`.
- **The field has an `invalid` setting bound,** so the control's own error display follows that instead.

## A message will not go away

- **The message came from *Set errors*.** It stays until the person edits that field, or until *Clear errors*, *Reset*, *Set values* or *Sending is over* with `reset: true`. A plain *Sending is over* leaves it (chapter 7, section 7.7).
- **The rule is still broken.** Clear errors does not remove a rule's message: a field that still breaks its rule goes on showing it.
- **An empty field breaks a minimum length, a pattern or a number minimum.** Fill it, or use a rule that lets an empty value pass (chapter 6).

## The field is stuck at "Checking…"

A check was marked with *Mark fields as being checked*, and has not been ended. Typing does not end it, and neither does time. It ends with *Set errors* or *Clear errors* for that field, or *Reset*.

- Is there a path from every outcome of the check to one of these? **The error output of the API Call** is the one that is usually missing. A timeout or a network error then leaves the field waiting.
- Does the Clear errors node send a **list**? `["username"]` is right; a bare `"username"` is not read as a name (and clears every field's messages instead).
- **A stale answer was dropped** by your guard, and no newer check was started. Every change of the field must lead to a new check or to an end of the old one (chapter 13, section 13.4).

## My rule does not work

- **It has no `return`.** A rule that never returns anything counts as fine. Write the `return` for every path.
- **It says "The rule failed: …".** The code threw an error, and the form shows it instead of letting the field pass in silence. The text after the colon is the JavaScript message: a name that does not exist, a property of `undefined`.
- **It says "A rule cannot wait for an answer…".** The rule returned a promise (it used `async`, or `await`, or `fetch`). A rule on a field must answer at once. Ask the server in Logic and give the answer back with *Set errors* (chapter 13).
- **It reads `values.other` and gets `undefined`.** The field's name has a typo, or the other field is not in this form. For a nested name, use `values.owner.name`.
- **It never sees an empty value as empty.** An empty Input is `""`, and an empty Number Input is `null`; write `!value` or `value === ""` for the first, `value === null` for the second (chapter 6, section 6.6).
- **It returns `false` and shows "Not valid".** The rule said no and there is no message. Give it one: return a text, or fill in *Message when the rule says false*.

## Required does nothing

- On a **Slider** or a **Rating**: they are never empty (chapter 10). Use a rule.
- On a **Radio Group** or a **Segmented Control** with its sample default `a`: something is already chosen. Empty the default.
- On a **Tags Input** with its default tags: they are there. Empty the default.
- On a **Date Time** or **Date Range**: only a missing date counts. A date text that cannot be read is also "no date".
- On a control that is **not a field** (no name, or outside the form).

## A text control forgets what I typed

- **In a form, a number that is not a number is thrown away when the person leaves the field,** and the box goes back to the last good value (chapter 8). The message shows while the person is still in the box.
- **Outside a form,** an Input only writes on Enter by default. Leaving the field cancels the edit, unless *Write when the field loses focus* is on. In a form this setting does not matter.
- **A Pin Input is empty until complete,** and goes back to empty if a digit of a complete code is deleted.

## The password is still there after sending

A Password Input in a form keeps its text until the form is reset or sent with `{ reset: true }`: *Empty again after it is written* is ignored in a form, because the form holds the value (chapter 8, section 8.5). Send *Sending is over* with `{ reset: true }` after a login, as recipe 1 does.

## Enter does not send the form

- *Enter in a field sends the form* (`submitOnEnter`) is off.
- The field is a **Textarea**: Enter makes a new line, and Ctrl+Enter sends (chapter 8).
- The field is a **Combobox** or a **Select**: Enter chooses an option, and does not send.
- The form is invalid, in which case Enter shows the messages, as a click on Send does.

## The dates are a few hours off

The Date Time and Date Range have two modes (chapter 11, section 11.1). In **UTC** the box shows UTC. In **Local** it shows the time of the person's computer. A moment of 10:30 UTC is 17:30 in Jakarta; the same moment, written as an ISO text, is correct in both. If the *numbers* look wrong, check *Timezone handling*, and whether the receiver expects UTC.

A date that is shown in a way you did not ask for: the **display format** (`format`) is independent of the **preset**. Choosing *Date Only* still shows the time part as zeros until you change the format to `YYYY-MM-DD`.

## The Validate node sends nothing

Neither output fires.

- **The schema has a mistake,** or does not `return` a schema. The node reports an error, and sends nothing. Test the code with a simpler schema, such as `return z.any();`, and add to it.
- **It is waiting.** A schema with an async `refine` does not send until the promise ends. A promise that never ends keeps the node waiting for ever.
- **The message never reached the node.** The wire before it, a Function that returned `null`, a filter.

## The Validate node finds mistakes that are not mistakes

- **`z.string()` and an empty text:** `z.string()` accepts `""`. Everything is fine from its point of view.
- **`z.number()` and a Number Input that is empty:** the value is `null`, which is an error of type. Write `z.number({ invalid_type_error: "…" })` for your own message.
- **`z.coerce.number()`:** it turns an empty text into `0`. That passes silently.
- **A date as a text:** `z.string().datetime()` accepts an ISO text with `Z`; it does not accept a number, which the field may be writing under another *Write output format*.
- **The path to check is wrong.** *Check msg.* is `payload` by default; for the values of a submit it is `payload.values`.

## The Validate node's errors do not appear on the form

- The invalid output must lead to an Update node with *Set errors*, pointed at **this** form.
- The keys of `msg.errors` must be the **names of fields** (chapter 14, section 14.7).
- The errors go in `msg.payload` unless you changed *Put the errors in msg.*; *Set errors* reads the payload.

## Two forms mix up their values

They do not, by design (chapter 4, section 4.2). If it looks like they do, a field is inside the wrong form's panel: in the editor, check which Form frame it sits in.

## A field in a tab or a dialog is not in the form yet

A field joins the form when it is on the page. A field on a tab that has not been opened, or in a dialog that is closed, may not exist yet: it is not in the values, and is not checked. *Set values* sent before it appears is remembered, and the field takes it when it joins (chapter 13, section 13.6). A form that must check all of its fields at once should keep them on the page, even if some are hidden with *hide* (which still counts).

## Still stuck

Make the smallest form that shows the problem: one Form, one or two fields, the Send button, and the three Text components of recipe 11 showing *valid*, *changed* and *sending*. Almost every problem becomes obvious in a form that small. If it does not, the problem is in the part you left out, and that is where to look.
