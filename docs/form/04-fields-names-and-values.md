# 4. Fields: names, values and where a form starts

A Form is only as useful as its fields. This chapter is about what makes a control a field, how names turn into the shape of the data you will send, what value each kind of control gives the form, and what "the start" of a form is.

## 4.1 What makes a control a field

Every form control in the Nexa UI library has the same setting: **Name in the form** (`formName`), in the **Form** group of the inspector. Give a control a name, place it anywhere inside a Form's panel, and it is a field of that form. Leave the name empty, and it is an ordinary control, no matter where it sits.

That is the whole mechanism. There is no separate list of fields to maintain in the Form itself. The Form finds its fields by looking at which named controls are inside it, as they appear on the page, and it notices when one is added or removed.

Three consequences follow.

- **A control outside every Form** with a name does nothing special. The name is simply ignored.
- **A control inside a Form without a name** is not part of the form's values, is not checked, and cannot hold the form back. A label, a heading or an informational Select that you do not want to send can sit inside the form without being a field.
- **A field joins the nearest Form around it.** Forms do not share fields.

The Button is not a field. It does not hold a value. A Button gets its relationship to the form from a different setting, described in chapter 12.

## 4.2 Names

A name is a short piece of text that identifies the field inside its form. Use names that look like the names of things in a program: `username`, `email`, `quantity`, `ok`. The name is what you will see in the values that reach Logic, in the errors, and in the messages you send from Logic back to fields, so it is worth choosing them as carefully as you would choose names in code.

Names are **case sensitive**: `Email` and `email` are different fields. Leading and trailing spaces are removed. Spaces inside a name are allowed but not wise, since you would then write `values["order number"]` every time.

### Dots make objects

A dot in a name means "inside". A field called `owner.name` and another called `owner.city` produce a form whose values look like this:

```js
{ owner: { name: "Ann", city: "Jakarta" } }
```

So the names are not only labels, they give the data its shape. If the API you are going to call expects `{ customer: { name, address: { city } } }`, you name the fields `customer.name` and `customer.address.city`, and `msg.payload.values` is already in the right form, ready to be sent as a body.

The *Set values* action understands the same dotted names, in either direction: `{ owner: { name: "Ann" } }` and `{ "owner.name": "Ann" }` both fill the field called `owner.name`.

A few cautions about dotted names.

- **A name and a name inside it cannot both exist.** A field called `owner` and a field called `owner.name` conflict: one of them cannot be an object and a text at once. The form keeps the one that joined first and drops the other from the values. Avoid it.
- **A number between the dots does not make a list.** `items.0.qty` produces `{ items: { "0": { qty: 3 } } }`, an object whose key is `"0"`, not an array. The form has no notion of a list of rows; if your API wants an array, build it in a Function node from the values you receive.
- **A name is fixed.** The setting cannot be bound to a variable, so a field cannot rename itself while the page runs.

### Two fields with one name

Two controls in the same form with the same name is a mistake the form does not complain about. The first to join is the field; the second stays out of the form altogether, silently. You find out because its value is missing from `values`. If a value you expected is not there, look for a duplicated name first (chapter 16).

Two *different* forms may each have a field with the same name. Each form is its own world: a `name` in a customer form and a `name` in a supplier form do not meet.

## 4.3 The values object

The values of a form are one object, built from the names of its fields. Every field appears in it, even when empty (an empty text is `""`, an empty number is `null`), so the object always has the same shape, and a Logic node can read `values.email` without checking whether it exists.

The keys are in the order the fields joined the page, which is, for a screen built in the usual way, the order they appear. For the shape that matters, nothing else.

You meet the values in four places: in the payload of *On Submit* (`msg.payload.values`), in the payload of *On Invalid Submit* and *On Change*, in the *Values* output if you bound one, and in the payload of the *On Reset* event.

## 4.4 What each control gives

Different controls hold different kinds of value, and the form takes what the control holds. This table is the summary; the chapter of each control adds the details.

| Control | Value in the form | When empty |
| --- | --- | --- |
| Input | text | `""` |
| Textarea | text; lines are separated by `\n` | `""` |
| Number Input | a number | `null` |
| Password Input | text | `""` |
| Checkbox | `true` or `false` | `false` |
| Switch | `true` or `false` | `false` |
| Radio Group | the value of the chosen option, as text | `""` if nothing is chosen |
| Segmented Control | the value of the chosen option, as text | `""` |
| Select | the value of the chosen option, as text | `""` |
| Select, with *Several at once* | a list of option values | `[]` |
| Combobox | the value of the chosen option, or the text typed when *Any text* is allowed | `""` |
| Slider | a number | never empty |
| Tags Input | a list of texts | `[]` |
| Pin Input | text, but only once every box is filled | `""` |
| Rating | a number of stars | `0` |
| Date Time | what *Write output format* says: an ISO text, a number, a formatted text | `null` |
| Date Range | `{ start, end }`, each in the *Write output format* | `null` until both ends are chosen |

Two properties of this table decide how you write your rules and your schemas, so they are worth fixing in mind.

**An empty text is `""`, not `null`, and not missing.** A text rule that tests `value === null` never fires. A Zod `z.string()` accepts `""`, so it does not mean "required"; you need `.min(1)`. Chapter 14 comes back to this.

**An empty number or date is `null`.** A `z.number()` given `null` fails with *Expected number, received null*, which is a useful message to customise.

## 4.5 Where a form starts

Every field has a starting value, and the form remembers it. It is the reference for two things: whether the form is **changed**, and what **Reset** goes back to.

The starting value of a control is whatever it held when the form joined it, and that is set by its **Default value (unbound)** (`defaultValue`), in the **Data** group. The defaults are not all empty, and a few of them will surprise you:

| Control | Default value starts as | What to do |
| --- | --- | --- |
| Input, Textarea, Password, Select, Combobox, Pin Input | empty text | nothing |
| Number Input | empty | nothing |
| Checkbox, Switch | off | nothing |
| Radio Group, Segmented Control | `a`, the value of the first sample option | set it to the value of your own first option, or empty it so that nothing is chosen at first |
| Slider | `40` | set it to a sensible start, such as your minimum |
| Rating | `3` stars | set it to `0` if the person should rate from scratch |
| Tags Input | the two tags `react` and `lit` | empty the list; it is a sample |
| Date Time, Date Range | no date | nothing |

The start can move, but only in two ways while the page runs: the *Set values* action moves it to the values it sets, and the *Sending is over* action without a reset moves it to whatever is entered at that moment. A person typing never moves the start; that is what makes *changed* mean something.

### Changed

A form is **changed** when any field's value differs from its start. It is a comparison of values, not a record of who touched what, so if someone types `x` and deletes it again, the form is not changed. This is the output you want to bind a *Save changes* button to, and the signal for "you have unsaved changes".

### Reset

*Reset* (the action, a Button that resets the form, or *Sending is over* with `reset: true`) puts every field back to its start, forgets what has been edited and touched, and clears every message. If the start was set by loading a record, Reset returns to that record, not to blank, and so does *Sending is over* with `reset: true`. To empty a form that was loaded with data, load it again with empty values: *Set values* with `""` for the texts and `null` for the numbers makes the empty form the new start. The entry examples in chapter 15, which send one record after another, rely on the form having started empty, and so on `reset: true` bringing it back to empty.

## 4.6 Loading a record to edit

The usual way to open a form on existing data is the *Set values* action, wired after something that fetches the record. The payload is an object in the same shape as the form's values:

```js
{ po: "PO-7", total: 10, ok: 8, reject: 2 }
```

Every field whose name appears takes its value. The loaded values become the start, so the form is not *changed*, and a *Revert* button (a Button that resets the form) goes back to the loaded record. Fields whose names are not in the record keep their own start.

This works whether the record arrives before or after the fields are on the page. If it comes first, each field takes its value as it joins. You do not have to wait for the form to be ready.

## 4.7 Fields and their own bindings

Inside a form, a control still has its **Value (read)** (`inputValue`) and **Value (write)** (`outputValue`) settings, in its **Data** group. They keep working: a control whose *Value (read)* is bound shows that variable, and its *Value (write)* writes when the control writes. The form sees the same value as the control.

In most forms you leave both empty, and let the Form own the values, because the form already gives you everything: the values as one object, the errors, the changes. There are a few situations where you do want a binding on a field, such as a field that mirrors a variable that is also used elsewhere on the screen. If you bind one, keep these in mind.

- A value that arrives through *Value (read)*, from a variable or a tag changing, is **not an edit by the person.** It changes the field's value, and so may change whether the form is *changed*, but it does not mark the field as edited or touched, so it does not make an error appear under *While the user types*.
- A text control's own **write** on Enter, and its confirmation question, belong to the control. In a form they are rarely what you want (chapter 8 explains why), because the form is the one that decides when to send.
- If the binding is to a **tag** of a machine, remember that the field is part of a form. The form will happily hold a value that the machine has not accepted. Chapter 15 shows how to apply setpoints together with a form and a button.

## 4.8 Fields that come and go

The form tracks fields as they appear on the page. A control that is removed leaves the form, and its value and its errors go with it. A control that is added joins, and the form re-checks everything at once.

Two situations are worth knowing about, because they are the opposite of what people expect.

**A hidden field still counts.** A component has three display states, *show*, *hide* and *remove*, and a Layer Control node can switch between them while the page runs. A control that is **hidden** is still on the page, only out of sight, so it is still a field: its value is in the form's values and its rules still apply. A required field that you hide while it is empty keeps the form invalid, and the person has no way to fix it. A control that is **removed** is not drawn at all, so it leaves the form, with its value and its rules. If a field is only sometimes required, do not use the **Required** switch; write a rule that looks at the other fields (chapter 6), or remove the field rather than hide it.

**A field in an inactive tab still counts.** The content of a Tabs panel that is not shown is still on the page, with its state kept, so its fields are part of the form. This is usually what you want: a form split over several tabs is one form, and the person cannot send it until every tab is in order. If it is not what you want, give the tabs their own forms.
