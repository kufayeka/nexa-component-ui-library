# 7. Errors, validity and the state of a form

A form is a small state machine. At every moment it can answer a handful of questions: is each field acceptable, is the whole form acceptable, has anything changed, is it being sent, is anything still being checked. It can also answer a different question, which is what the person should be shown right now. This chapter explains how the form decides both, in enough detail that you can predict what it will do.

## 7.1 What the form keeps about each field

For every field the form keeps a few facts. Everything else in this chapter is built from them.

| Fact | Meaning |
| --- | --- |
| **value** | What the field holds now |
| **start** | What the field held when the form began, or when it was last loaded or sent |
| **edited** | The person has changed the value |
| **touched** | The person has left the field, or the form has tried to send, or an error was put on it |
| **own refusal** | The control itself rejects what is typed (not a number, below the minimum) |
| **rule error** | The first of the field's rules that is broken |
| **put error** | A message put on the field from Logic with *Set errors* |
| **checking** | Something slow is deciding whether the value is acceptable |

Two of these are easy to confuse. **Edited** is about the value: the person changed it, so a field loaded from a record and never touched is not edited. **Touched** is about attention: the person visited it, or the form insisted.

A value that arrives from outside, such as a bound variable changing, is not an edit and does not touch the field. It changes the value, which may change whether the form is *changed*, and that is all.

## 7.2 True, and shown

A field is **wrong** (true) if any of these holds: it has an own refusal, a broken rule, or a put error. That is a plain fact, worked out at every change and at the start, and it does not depend on what the person has seen. The form is **valid** when no field is wrong and no field is being checked.

What is **shown** is a separate decision, made field by field. The error a field shows is the first of these that applies:

1. the **put error**, if there is one: shown at once;
2. the **own refusal**, if there is one: shown at once;
3. the **rule error**, but only if the form considers it fair to show it yet.

Whether it is fair is what *Show errors* (`validateOn`) decides:

| *Show errors* | A rule error is shown when ... |
| --- | --- |
| While the user types (`change`) | the field has been edited or touched |
| When a field is left (`blur`) | the field has been touched |
| Only when sending (`submit`) | never, until a Send has been tried |

And whatever the mode, **once a Send has been tried and refused, every rule error is shown** from then on, in every field, edited or not, and follows the typing.

Here is one field, which needs at least three characters, and what the person sees as they use it. "Wrong" means that the field breaks its rule; the table says whether the message is on the screen.

| The person ... | field is | `change` | `blur` | `submit` |
| --- | --- | --- | --- | --- |
| has not touched it | wrong (empty) | nothing | nothing | nothing |
| types `a` | wrong | message | nothing | nothing |
| types `ab` | wrong | message | nothing | nothing |
| types `abc` | fine | no message | no message | no message |
| deletes back to `ab` | wrong | message | nothing | nothing |
| leaves the field | wrong | message | message | nothing |
| presses Send | wrong | message | message | message |
| types `abc` again | fine | gone | gone | gone |

Notice the first row. An untouched, empty, required field is wrong in all three modes, and shows nothing in all three. That is what lets a Send button that waits for the form be correctly off on a screen that has not yet shown a single message.

## 7.3 Valid

The **valid** state is `true` when:

- every field satisfies every rule (a required field is filled, a pattern matches, your own rules return fine);
- no field has an own refusal (no text that is not a number, no number out of range);
- no field has a message put on it with *Set errors*;
- no field is marked as being checked.

It is `false` otherwise, and it is known from the first moment: the form works it out as soon as its fields have joined, before anybody has touched anything. It is written to the *Valid* output, and the *On Valid Change* event fires when it flips. A Button with *Disabled until the form is valid* follows it.

What it does not mean: **valid does not mean the server will accept the form.** It means the form has nothing against it. A form can be valid and still refused by the server, and then *Set errors* makes it invalid again, on the right field.

## 7.4 Changed

The **changed** state is `true` when any field's value differs from its start. It compares values only. There is no history: type `x` and delete it, and the form is not changed.

The comparison treats `""`, `null` and *nothing* as the same: an Input that was empty and is empty again is unchanged, whether the start was recorded as an empty text or as no value. Other values are compared by their content, so a list or a range is the same if it has the same items.

It is written to the *Changed* output, and the *On Changed or Unchanged* event fires when it flips. It is the signal to bind a *Save changes* button to, and what a *You have unsaved changes* banner looks at.

The start moves in exactly two cases: *Set values*, and *Sending is over* without a reset. After either, the form is not changed.

## 7.5 Sending

The **sending** state is the time between a valid Send and the moment Logic says it is over.

- It **starts** when the person sends the form and every field is acceptable. The form fires *On Submit* and becomes *sending*.
- While it is on, **further sends are ignored**: another click on the button, another Enter. This is what stops a double click sending twice. The Send button shows a spinner meanwhile (chapter 12).
- It **ends** on *Sending is over*, on *Set errors* (the server said no, so nothing is being sent any more), and on *Reset*. It does not end by itself: if your wiring never calls any of those, the form stays in *sending* for good and the button stays disabled. That is the first thing to look for when a Send worked once and then stopped working (chapter 16).

The state is written to the *Sending* output.

## 7.6 Checking

A field is **being checked** between *Mark fields as being checked* and the answer. It is for checks that take time, the standard example being "is this user name taken?", where the answer comes from a server.

- While a field is being checked it shows *Checking…* in place of its helper text, the form is not valid, and a Send is ignored without any message: the person has done nothing wrong, the form is only waiting.
- It **ends** with *Set errors* for that field (the answer was no), with *Clear errors* (the answer was yes), or with *Reset*. Typing in the field does **not** end it. Only an answer does, so the form never turns valid on the strength of a check that has not come back.

The error, when there is one, replaces *Checking…*. Chapter 13 gives the whole pattern, including the one subtle part, which is ignoring an answer that arrives after the person has already typed something else.

## 7.7 Errors put on a field from Logic

*Set errors* puts a message on one or more fields. It is how a server's refusal reaches the screen.

- The message is shown **at once**, whatever *Show errors* says, and the field counts as touched.
- The form is then not valid, and the sending ends.
- The first field in the map gets the cursor.
- A key that is not a field is ignored, so you can pass an API's whole error object without filtering it.

The message goes away when the person **edits that field** (typing the correction clears it, which is what the person expects), or on *Clear errors* for it, or on *Reset*, *Set values*, or *Sending is over* with `reset: true`. Plain *Sending is over* leaves the messages alone.

Putting an error on a field that is currently valid makes it invalid; it is one of the ways a field can be wrong without breaking any of its own rules.

## 7.8 Failed sends and the first wrong field

When a Send is refused because something is wrong, the form does the following, in this order:

1. every field is marked touched, so every rule error becomes visible;
2. *On Invalid Submit* fires, carrying the errors and the values;
3. the first wrong field gets the cursor (the "first" being the order the fields joined, which for an ordinary screen is top to bottom);
4. if *List the errors above the form* is on, the list appears.

*Check every rule now* does steps 1, 3 and 4 and not the event, and sends nothing in either case.

If a Send is attempted while a field is being checked, none of this happens: the form quietly does nothing, since the field has not yet been judged.

## 7.9 Where the state goes

Everything above is available to the rest of the screen in three ways, which you can mix.

**Outputs** (chapter 3) write the state to variables: *Values*, *Errors* (what is shown), *Valid*, *Changed* and *Sending*. Bind a Text, a Badge, a Button's *Disabled* or a layer's visibility to them.

**Events** (chapter 3) tell Logic when something happens: *On Submit*, *On Invalid Submit*, *On Change*, *On Valid Change*, *On Changed or Unchanged*, *On Reset*. Wire them to what should be done.

**The fields themselves** show the state to the person: the asterisk, the message under the control, the *Checking…* line, the error-coloured box, the spinner on the Send button, the list of errors.

## 7.10 What shows under a control

The line under a control is a single place with a priority order, which is worth knowing when a message you expected does not appear.

1. An **error** of the form: the one the form is showing for this field.
2. An error of the control's own **Invalid** and **Error text** pair, if *Invalid* is on.
3. The word **Checking…**, while the field is being checked.
4. The control's **Helper text**.

The first that applies is shown. So *Helper text* is what a person sees when nothing is wrong; it comes back when the error goes.
