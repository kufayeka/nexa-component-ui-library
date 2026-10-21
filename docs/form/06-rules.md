# 6. Rules

A rule is a check on one field. When a field breaks a rule it has an error, the form is not valid, and, at the moment the form chooses, the person is told. This chapter lists every rule that is built into the controls, explains how an empty field is treated (which is not as obvious as it sounds), and then describes the rule you can write yourself.

Rules in this chapter are the ones that **live on a control** and run in the browser, instantly, on every change. They can look at every value on the form, and at nothing else. Checks that have to ask a server, or that are easier to describe as a schema, are the business of Logic and the Validate node (chapter 14).

## 6.1 The rules, in the order they run

For each field the form runs its rules in a fixed order, and **the first one that is broken is the field's error**. The order is:

1. Required
2. Shortest text
3. Longest text
4. Pattern
5. Number minimum (for an empty number)
6. Your own rule (JavaScript)

A field can therefore have several broken rules at once and shows only the first. Fix that one and the next appears. If you would rather see them all at once, a Zod schema in a Validate node can report one message per field and the form shows the first of them (chapter 14); or write your own rule so that it checks the order you prefer.

Two kinds of errors sit outside this list. The **control's own refusal** of what was typed (a number that is not a number, a number below its minimum) is shown at once in every mode and ranks above the rules. An error **put on a field from Logic** with *Set errors* is shown at once and replaces whatever the rules say, until the person edits the field. Chapter 7 describes both.

## 6.2 Required

**Where:** *Required* (`required`) in the Field group; its message, *Message when required and empty* (`requiredMessage`), in the Form group.

The field must not be empty. What counts as empty depends on the control, and the table is the thing to keep to hand:

| Control | Empty means | Notes |
| --- | --- | --- |
| Input, Textarea, Password Input | the text is `""` | A text of spaces is not empty |
| Number Input | there is no number | `0` is a number, and not empty |
| Checkbox, Switch | it is off | *Required* means "must be on", as for *I agree* |
| Radio Group, Segmented Control | nothing is chosen | See below |
| Select | nothing is chosen (`""`) | With *Several at once*, an empty list |
| Combobox | the text is `""` | |
| Tags Input | the list has no tags | |
| Pin Input | the code is not complete | The form sees the code only once every box is filled |
| Date Time | no date | |
| Date Range | one end or both ends missing | |
| Slider, Rating | **never** | They always hold a number |

Three points in that table catch people out.

**A Radio Group or a Segmented Control is never empty by default,** because their default value is the value of the first sample option, `a`. Unless you change *Default value* to your own first option, or to nothing, the field starts "chosen". If you want the person to be made to choose, empty the default.

**A Slider and a Rating are never empty,** even at zero, so *Required* does nothing for them. If "at least one star" is what you mean, use a rule: `return value > 0 || "Please give a rating"`.

**A text of spaces is not empty.** If `"   "` should count as nothing, write a rule that trims it.

The message is *Required*, or *Must be checked* for a Checkbox and a Switch, unless you write your own.

## 6.3 Shortest text and longest text

**Where:** *Shortest text* (`minLength`) in the Form group; *Max length* (`maxLength`) in the Data group. Both are on the Input, Textarea and Password Input. (The Tags Input has its own *At most* limit, chapter 10.)

*Shortest text* is the smallest number of characters accepted. The message is *At least N characters*. It is a form rule, so it follows the form's *Show errors* choice: the person who has typed `a` into a field that needs three is not told while the form waits for them to leave the field.

*Max length* is the largest number of characters. The box simply stops accepting characters beyond the limit, so a person never sees an error for it while typing; in a form it is also checked as a rule, with the message *At most N characters*.

**An empty field breaks *Shortest text*.** Nothing typed is shorter than three characters. This is deliberate: a form that starts empty then starts invalid, and a Send button that waits for a valid form is correctly off from the first moment, rather than switching on until the person has typed something too short. If a field may be left empty, but must have at least three characters when it is not, do not use *Shortest text*; write a rule instead:

```js
return value === "" || value.length >= 3 || "At least 3 characters, or leave it empty";
```

An empty field does not break *Max length*: nothing is never too long.

The built-in messages are in English and cannot be changed in the inspector. When you need another wording or another language, write your own rule or use a Validate node, both of which take your messages.

## 6.4 Pattern

**Where:** *Pattern (regular expression)* (`pattern`) and *Pattern message* (`patternMessage`) in the Data group of the Input and the Textarea.

The whole text must match the regular expression. It is anchored: you write `[0-9]+`, not `^[0-9]+$`, and `PO-[0-9]+` accepts `PO-123` but not `xPO-123` or `PO-123x`. If your expression is not valid regular-expression syntax, the field shows a message saying so, instead of silently accepting everything.

The message defaults to *Not in the expected format*, and *Pattern message* replaces it with whatever you write: *Like PO-123* is more useful than the default.

**An empty field must match as well.** `[0-9]+` does not match nothing, so an empty field breaks it. To let a field stay empty, write a pattern that accepts the empty string: `[0-9]*` instead of `[0-9]+`. This is the same idea as for *Shortest text*, and for the same reason: a form that starts empty starts invalid.

**The control does not check the pattern while the person types.** Inside a form, the pattern is a rule of the form, so it appears when the form's *Show errors* choice says so, and not at the first key. Outside a form the Input does check it as the person types.

## 6.5 A number's limits

**Where:** *Minimum* (`min`) and *Maximum* (`max`) in the Data group of the Number Input.

A number below the minimum or above the maximum is refused **as it is typed**, as the control's own refusal: the field shows *minimum is 1* or *maximum is 120* at once, in every *Show errors* mode, and the form is not valid. The same applies to text that is not a number, which shows *not a number*.

Inside a form there is one addition: **an empty number is below any minimum.** A Number Input with a *Minimum* of 1 and nothing typed breaks the rule and shows *Minimum is 1* when errors are shown. As with the text rules, this keeps a form that starts empty from starting valid. A number that may be left empty should simply have no minimum.

The Slider has a minimum and a maximum too, but they limit what the handle can do, not what is accepted: the handle cannot go outside them. No rule is involved.

## 6.6 Your own rule: JavaScript

Everything above is a fixed set. When it is not enough, every control has two settings in its **Form** group that let you write a rule yourself:

- **Rule (JavaScript)** (`ruleCode`), the code;
- **Message when the rule says false** (`ruleMessage`), the text to show when the code answers *false* without giving its own.

Both appear once the control has a name in the form. The code is the **body of a function** of three arguments, and you return the answer.

### The arguments

| Argument | What it is |
| --- | --- |
| `value` | This field's value: a text, a number, true or false, a list, a date, as chapter 4 says |
| `values` | The values of the whole form, as an object shaped by the field names: `values.password`, `values.owner.name` |
| `form` | An object `{ name, values }`: the name of this field, and the same values |

### The answer

| You return | The rule says |
| --- | --- |
| `true`, or nothing at all | The value is fine |
| `false` | The value is not fine; the message is *Message when the rule says false*, or *Not valid* if that is empty |
| a text | The value is not fine; the text is the message |
| `null` or `""` | The value is fine |
| anything else | Not fine, with the message above |

The pattern `return condition || "A message"` is the most useful: it reads as "it is fine, or else this", and returns `true` when the condition holds.

```js
return value.length >= 8 || "At least 8 characters";
```

### When it runs

The rule runs when the field joins the form, **whenever any field of the form changes** (not only this one, because a rule can read the others), when the field's own settings change, and when the form checks everything for a Send. It does not run on a timer, and it is not run for a field that has left the form.

Because it runs for every change of every field, keep it cheap. A comparison, a pattern test or a sum is fine. Anything that takes real time belongs in Logic.

### What it cannot do

**It cannot wait.** A rule has to answer at once. Return a Promise and the field shows a message explaining that a rule cannot wait for an answer, and what to do instead (Logic: a call to the server, then *Set errors*). This is a deliberate limit, not a missing feature: the form is only able to decide what is valid at every moment because every rule answers immediately.

**It is only given the form.** It receives `value`, `values` and `form`, and has the ordinary JavaScript language. It is not given the message that triggered anything, the screen's variables, or Zod, because those belong to Logic and a rule on a control has no message. Whatever a check needs from outside the form, use the Validate node, which has all three.

**A mistake shows.** If the code has a syntax error, or throws an exception, the field shows *The rule failed* followed by what went wrong, rather than passing silently or breaking the screen. A rule that does not work is an error you will see.

### It sees empty values

Your rule is run even when the field is empty, with `""`, `null`, `[]` or `false`, depending on the control. Test for that when it matters, so that a rule meant for non-empty values does not complain about an empty one that is allowed:

```js
// a code of exactly 6 digits, but the field may be left empty
return value === "" || /^[0-9]{6}$/.test(value) || "Six digits, or leave it empty";
```

### Examples

**Two fields must be the same** (the second of two password fields):

```js
return value === values.password || "The passwords are not the same";
```

**A field is required only sometimes.** *Required* always applies, so use a rule that looks at another field. Here the order number is required only when the checkbox called `hasOrder` is on:

```js
return !values.hasOrder || !!value || "Required when there is an order";
```

**A total must add up** (on the field called `total`):

```js
return values.ok + values.reject === value || "OK + rejected must equal the total";
```

**One date must not be before another** (on the field `end`, with `start` a Date Time written as an ISO text; ISO texts compare correctly as text):

```js
return !values.start || !value || value >= values.start || "The end is before the start";
```

**A password with some strength:**

```js
var score = 0;
if (value.length >= 8) score++;
if (/[A-Z]/.test(value)) score++;
if (/[0-9]/.test(value)) score++;
if (/[^A-Za-z0-9]/.test(value)) score++;
return score >= 3 || "Use 8 or more characters with capitals, digits or a symbol";
```

**At least one star:**

```js
return value > 0 || "Please give a rating";
```

Because a rule runs again when any field changes, the second password field above turns red the moment the first is edited to something different, without any extra wiring.

### The messages

A rule can supply its message in two ways: return it as a text (`return "..."`), or return `false` and put the text in *Message when the rule says false*. The first lets one rule give different messages for different problems; the second is shorter when there is only one.

## 6.7 Which kind of rule to use

The rules on a control and the Validate node overlap, so it helps to know which to reach for.

| The check ... | Use |
| --- | --- |
| is required, a length, a pattern or a number's limit | the control's own setting |
| compares this field with others, or is a short calculation | a rule in JavaScript on the control |
| needs to be there from the first render, so that a button can wait for it | a rule on the control: they decide validity from the first moment |
| has to ask a server, or something slow | Logic: *On Change*, a call, then *Set errors* (chapter 13) |
| is a long list of conditions on several fields, or a nested structure | a Zod schema in a Validate node (chapter 14) |
| must use a message from the screen, or a variable | a Validate node, which can read both |

The first and third rows are the reason the basic rules stay on the controls. A rule on a control is part of the form's state from the moment the screen appears. A check in Logic only exists once a message has travelled through it, and until then the form cannot know about it.
