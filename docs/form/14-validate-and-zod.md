# 14. The Validate node and Zod

The rules on a field (chapter 6) are good at one thing: saying at once, as someone types, whether *this* value is acceptable. They are less good at the questions that look at several fields together, that must be written once and used in several places, or that are awkward to write as a function body. For those there is a node in Logic that checks data against a **schema**: the **Validate** node, which uses a library called **Zod**.

This chapter explains the node, then enough of Zod to write the schemas you will need, then the patterns that use both with a form.

## 14.1 What a schema is

A schema is a description of what data must look like. Instead of writing code that checks things one after another, you write down the shape you expect, and the library does the checking and finds every mistake in one pass:

```js
return z.object({
    username: z.string().min(3, "At least 3 characters"),
    age: z.number().min(18, "Must be 18 or older")
});
```

This reads: "an object with a `username` that is text of at least 3 characters, and an `age` that is a number of at least 18". Given `{ username: "an", age: 17 }`, it finds both problems at once, and reports `{ username: "At least 3 characters", age: "Must be 18 or older" }`.

Why it helps a form:

- **All the mistakes at once.** A person who sends a form with five errors sees five messages, not one now and another after the next try.
- **Rules about several fields** are written in one place: "the two passwords are the same", "the end is not before the start".
- **A schema is a tested library,** not a function you wrote at four in the afternoon. It knows what an email looks like, and what an integer is.
- **Checks that wait** are supported: a rule may ask a server and the node waits for the answer.

## 14.2 The Validate node

Put it on the Logic canvas from the palette chip *Validate (Zod schema)*, in the section *Validation*. It has one input and two outputs:

| Output | Name | When | What the message carries |
| --- | --- | --- | --- |
| 1 | **valid** | the data fits the schema | the message as it came, with `msg.valid = true` |
| 2 | **invalid** | the data does not fit | `msg.valid = false`, and `msg.errors`, `msg.issues` and `msg.checked`, below |

The second output carries exactly what a form's *Set errors* action wants, so the connection between the two is a single wire (section 14.7).

### The dialog

Double-clicking the node opens its dialog. It has three settings and the schema.

**Check msg.** (`property`) is the part of the message to check, as a path. It is `payload` when empty. For a form's *On Submit*, whose values are in `msg.payload.values`, write `payload.values`. For an *On Change* of one field, a Function ahead of the node can arrange `msg.payload = { username: msg.payload.value }`, and the default path then works.

**Put the errors in msg.** (`into`) is where the node places the errors for the next node. `payload` when empty, which is what *Set errors* reads. Change it only when something else must keep `msg.payload`; a Function after the node then moves the errors back into `msg.payload` for *Set errors*.

**Pass on what Zod returns** (`useParsed`) is a tick box, off by default. A schema can change the data it reads: remove spaces around a text (`z.string().trim()`), fill in a default value, turn text into a number (`z.coerce.number()`). With this on, the valid output carries the *changed* data in the checked place, instead of the data as it came. Use it when the next node should receive the cleaned data.

**The schema** (`schema`) is a code editor. It holds the **body of a function** that returns a Zod schema. Four names are available in it:

| Name | What it is |
| --- | --- |
| `z` | the Zod library |
| `msg` | the message being checked |
| `vars` | the screen's variables, as in a Function node (`vars.screen.get("name")`) |
| `getVariable(name, scope)` | the same as `vars.get`, for a variable by name |

The function runs **for every message,** so a schema can depend on the message or on a variable: a maximum quantity read from a variable, for example. A new node starts with an example schema, which you replace.

If the code has a mistake, or does not return a schema, the node reports an **error**, and **nothing goes out of either output.** A Validate node whose schema fails to compile therefore looks, from the form, like a flow that stopped. Test your schema with a Debug node on a real message.

### What goes out of the second output

| On the message | Content |
| --- | --- |
| `msg.valid` | `false` |
| `msg.errors` | one message for each field, named the way the form names its fields: `{ "username": "At least 3 characters", "profile.city": "Required" }` |
| `msg.issues` | every problem Zod found, as a list of `{ path, code, message }` (more than one can belong to one field) |
| `msg.checked` | the data that was checked, as it was |
| `msg.payload` (or the place you chose) | the same as `msg.errors` |

Two rules decide the shape of `msg.errors`:

- **A nested name is joined with dots.** An error on `{ owner: { name } }` is `owner.name`, which is also the form's name for a field that is in a group (chapter 4). A position in a list counts as a name: `items.1.qty`.
- **A problem about the whole value** has the name `_` (an underscore). A rule on the whole object that has no field of its own produces it. See "Rules that look at several fields", below.
- **Only the first message of a field is kept.** If a password breaks three rules, `msg.errors.password` has the first of them; `msg.issues` has all three.

## 14.3 Zod in an afternoon

This is a primer for the schemas that forms need. It is for version 3 of Zod, the version that comes with Nexa (section 14.9 explains why), and it does not try to be the whole library. The Zod documentation is the full reference.

### Text

```js
z.string()                       // any text. "" is accepted!
z.string().min(3, "At least 3 characters")
z.string().max(12, "At most 12 characters")
z.string().length(4, "Exactly 4 characters")
z.string().email("Not an email")
z.string().url("Not a link")
z.string().regex(/^PO-[0-9]+$/, "Like PO-123")
z.string().startsWith("PO-", "Starts with PO-")
z.string().datetime("Not a date and time")      // an ISO text, as a Date Time field writes
z.string().trim()                // removes spaces around (with 'Pass on what Zod returns')
```

**Remember that `z.string()` accepts an empty text.** A form's empty Input has the value `""`, so `z.string()` alone does not make it required. Say `z.string().min(1, "Required")`. (The field's own *Required* setting is shown, as the person types, whatever the schema says; the schema is the second line of defence.)

### Numbers

```js
z.number()                       // a number. 5 is; "5" is not; null is not
z.number().min(18, "Must be 18 or older")
z.number().max(65)
z.number().int("Whole numbers only")
z.number().positive()
z.number().multipleOf(10, "In steps of 10")
z.coerce.number()                // turns "12" into 12 first
```

A Number Input writes a real number, or `null` when it is empty. So `z.number()` is correct for it, and an empty field is refused with a message about types ("Expected number, received null"), unless you write the message yourself:

```js
z.number({ invalid_type_error: "Age is required" }).min(18, "Must be 18 or older")
```

Use `invalid_type_error` for this, and not `required_error`: the empty Number Input arrives as `null`, which Zod counts as a wrong type, not a missing value. `required_error` is for a field that is missing altogether (`undefined`).

**Be careful with `z.coerce.number()`:** it turns an empty text into `0`, so an empty field would pass as zero. Prefer plain `z.number()` for a Number Input.

### Yes or no, choices and lists

```js
z.boolean()                                          // a Checkbox or Switch value
z.literal(true, { errorMap: () => ({ message: "You must agree" }) })   // must be true
z.enum(["line1", "line2", "line3"], { errorMap: () => ({ message: "Choose a line" }) })
z.array(z.string()).min(1, "Add at least one tag")   // a Tags Input, or a multiple Select
z.array(z.string()).max(5, "At most five tags")
```

### Objects

The form's values are an object, so most schemas start with `z.object`. Fields that are in a group (`formName` with dots) are nested objects:

```js
z.object({
    email: z.string().email("Not an email"),
    owner: z.object({
        name: z.string().min(1, "Required")
    })
})
```

A field that the schema does not mention is allowed, and ignored (and removed from the result when *Pass on what Zod returns* is on). Use `.strict()` on the object to refuse unknown fields.

### Optional values

```js
z.string().optional()                                // may be undefined
z.string().nullable()                                // may be null
z.string().default("none")                           // undefined becomes "none"
z.string().min(3).or(z.literal(""))                  // empty, or at least 3 characters
```

The last is the shape you need for "optional, but if given, it must be right": an Input that is not required but has a minimum length. Without the `.or(z.literal(""))`, an empty text would fail `min(3)`.

### Custom checks: refine

When no built-in check says what you mean, `refine` takes a function that returns true when the value is fine:

```js
z.string().refine(function (v) { return v !== "admin"; }, "That name is reserved")
```

`refine` may be **async**: return a promise, and the node waits for it:

```js
z.string().refine(async function (v) {
    // ask a server, then answer true or false
}, "Already used")
```

Async checks make the node slower, since it does not send until the answer comes. Whether to put a server check inside a schema or in a flow of its own (section 14.6) depends on whether you want the "Checking…" state. Inside a schema, there is none.

### Rules that look at several fields

A `refine` on the *object* sees every field. The message belongs to the whole object, unless you give it a `path`:

```js
z.object({
    password: z.string().min(8),
    confirm: z.string()
}).refine(function (v) { return v.password === v.confirm; },
          { message: "The passwords are not the same", path: ["confirm"] })
```

With the `path`, the error appears under *Repeat the password*. Without it, it is named `_`, and a form with no field of that name shows nothing, so **always give a path to a rule about the whole** when the message belongs under a field.

When one rule should mark more than one field, `superRefine` adds issues one by one:

```js
.superRefine(function (v, ctx) {
    if (v.ok + v.reject !== v.total) {
        ctx.addIssue({ code: "custom", path: ["ok"], message: "Does not add up" });
        ctx.addIssue({ code: "custom", path: ["reject"], message: "Does not add up" });
    }
})
```

### The messages Zod gives when you give none

Every check accepts a message as its last argument, and you should give one, since the built-in ones are written for programmers. For reference, these are what Zod 3 says when you do not:

| Check | Default message |
| --- | --- |
| a missing value | `Required` |
| `z.string()` given a number | `Expected string, received number` |
| `.min(3)` on text | `String must contain at least 3 character(s)` |
| `.max(5)` on text | `String must contain at most 5 character(s)` |
| `.email()` | `Invalid email` |
| `.url()` | `Invalid url` |
| `.regex()` | `Invalid` |
| `.datetime()` | `Invalid datetime` |
| `z.number()` given `null` | `Expected number, received null` |
| number `.min(1)` | `Number must be greater than or equal to 1` |
| `.int()` | `Expected integer, received float` |
| `z.enum(["a","b"])` given `c` | `Invalid enum value. Expected 'a' \| 'b', received 'c'` |
| array `.min(1)` | `Array must contain at least 1 element(s)` |
| an unknown key under `.strict()` | `Unrecognized key(s) in object: 'b'` |

### Two behaviours that surprise people

1. **A `refine` on an object runs only if no field had a type error.** If the age is the wrong type, the "passwords are not the same" rule is not looked at; it appears after the first has been fixed. This is Zod's design: a rule about values cannot be run on data of the wrong kind.
2. **Only the first message for a field is shown.** A password that is too short and has no capital letter is told "at least 8 characters" first, and the capital letter next, when the length is fixed.

## 14.4 Pattern: check the whole form when it is sent

The most common use. Put the Validate node between *On Submit* and the call:

```
On Submit ─► Validate ┬─ valid   ─► API Call ─► … ─► Sending is over
                      └─ invalid ─► Update: Set errors
```

- *Check msg.* is `payload.values`.
- The *invalid* output goes to an Update node pointed at the Form with the action *Set errors*. Every message appears under its field at once, the sending ends, and the focus goes to the first field with an error.
- With the form's *Show errors* set to **Only when sending**, and *List the errors above the form* on, the person fills the form in peace, presses Send, and gets one complete report. It suits a form whose rules need all the data together. Recipe 15 in chapter 15 is this pattern with a full registration schema.

You may keep simple rules on the fields as well. They tell the person earlier. The schema then repeats a few of them, which does no harm, and is the one place that says everything.

## 14.5 Pattern: check a field as it is typed

Used with the form's *On Change*, so the schema tells the person at once about something a field's own rules cannot say, such as a reserved name:

```
On Change ─► Function: only this field, into { username: … } ─► Validate ┬─ valid   ─► (next step, e.g. ask the server)
                                                                          └─ invalid ─► Update: Set errors
```

The Function sets `msg.payload = { username: msg.payload.value }` so the schema can describe an object even though one field is being checked. Recipe 14 does exactly this.

## 14.6 Pattern: the server decides

For "is this name free?" a server must be asked. Do it in the flow, not in the schema, to get the "Checking…" state and the protection against late answers (chapter 13, section 13.4). A good order is:

1. **The rules of the field**, as the person types: length, pattern.
2. **A Validate node,** for what the rules cannot say.
3. **Mark the field as being checked, and ask the server.**

Only a value that has passed the first two is worth a trip to the server. Recipe 14 shows the three in this order.

## 14.7 Connecting the outputs to the form

| From | To | Why |
| --- | --- | --- |
| Validate, *invalid* output | Update: *Set errors* | the messages appear under the fields. The payload is `msg.errors` already |
| Validate, *valid* output | the next step | carry on |
| a later server answer | Update: *Set errors* or *Clear errors* | end a *Mark fields as being checked* |

A key in `msg.errors` that is not a field of the form is ignored by *Set errors*. A schema may therefore describe more than the form holds (or a field named `_`) without harm, but a message for such a key is never seen. If you find a problem that never appears, check the name against the field's `formName`.

## 14.8 What the schema sees

The values of the form have the types the controls write (chapter 4, and the "Value in the form" line of every control in chapters 8 to 12):

| Control | Type for the schema |
| --- | --- |
| Input, Textarea, Password Input, Pin Input | `z.string()` |
| Number Input, Slider, Rating | `z.number()`; the Number Input gives `null` when empty |
| Checkbox, Switch | `z.boolean()` |
| Radio Group, Segmented Control, Select, Combobox | `z.string()` (the option's value) |
| Select with several, Tags Input | `z.array(z.string())` |
| Date Time | `z.string()` (an ISO text by default) or `z.number()`, per its *Write output format* |
| Date Range | `z.object({ start: …, end: … })`, or `null` until complete |

## 14.9 Where Zod's limits are

**Which Zod.** Nexa ships with version 3's API (`zod/v3`, 14 KB compressed). Newer major versions of Zod exist, with a different way to give messages (for example `error:` in place of `required_error`), and are several times larger. Write schemas as in this chapter; the Zod 3 documentation is the reference for them.

**The schema is JavaScript on the page.** The code runs in the visitor's browser, as a Function node does. Do not put secrets in a schema.

**The page is not a guard.** This is the one rule of the chapter that matters for security. Everything a form or a schema checks on the page can be skipped by anyone who sends the request directly. Use the page's checks to help people, quickly and kindly, and check everything again where the data arrives: in the server, behind the API Call. The best arrangement is to describe the same rules there, and let the page's messages come from the server's answer through *Set errors*, as chapter 13 describes.
