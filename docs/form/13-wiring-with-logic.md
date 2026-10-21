# 13. Wiring a form to Logic

A form on its own collects and checks. Everything that happens *because* of a form, such as sending it somewhere, asking a server, filling it from a record, belongs to **Logic**, the node canvas of every screen. This chapter explains the few ideas that connect the two, and then the patterns you will use again and again.

You do not need to know all of Logic to follow it. It uses five kinds of node: the one that listens (*On …*), the one that changes a component (*Update*), the one that calls an API (*API Call*), the one that checks with a schema (*Validate*), and the one that runs a little JavaScript (*Function*), with *Set Variable* to keep an answer for the screen.

## 13.1 The two ends of the wire

A form talks to Logic in two directions.

**From the form to Logic: events.** Every event of the form (chapter 3) and of every field (chapters 8 to 12) can start a flow. On the Logic canvas, drag the component's event onto the canvas: it becomes a node named after the event, such as *On Submit*. Wire it to what should happen next. Whatever the event carries arrives as `msg.payload`.

The events of the form that you will use most:

| Event | `msg.payload` | You use it for |
| --- | --- | --- |
| **On Submit** | `{ values }` | sending the data: the main thing |
| **On Invalid Submit** | `{ errors, values }` | a notice such as "Please correct the form", or counting failed tries |
| **On Change** | `{ name, value, values, valid, errors }` | a check that needs a server, or something that follows what is typed |
| **On Valid Change** | `{ valid }` | enabling or disabling something else on the screen |
| **On Changed or Unchanged** | `{ dirty }` | warning before leaving a form that has unsaved work |
| **On Reset** | `{ values }` | cleaning up what you set up for the form |

**From Logic to the form: actions.** An **Update** node is pointed at a component and given an action. For the Form the actions are *Check every rule now*, *Send the form*, *Reset*, *Set values*, *Set errors*, *Mark fields as being checked*, *Clear errors*, *Focus a field* and *Sending is over* (chapter 3 has the full list). The data an action needs is taken from `msg.payload` of the message that arrives at the Update node. An action that needs no data, such as *Reset*, ignores the payload.

> The two directions are the whole connection. The form never calls your server, and your logic never reaches into the form's fields: it listens to events and sends actions.

## 13.2 What a message carries

A message is a JavaScript object that travels along the wires. The ones from the form have the payload described above, and then pick up more as they pass nodes. Every node leaves what it does not know about untouched. That is why the **order of the nodes** matters: a Function that returns `{ payload: ... }` throws away the rest of the message, while one that changes `msg` and returns it keeps everything.

Three habits keep flows readable:

- Put what you need later into the message early, under a name you choose: `msg.po = msg.payload.value`. The API Call that follows replaces `msg.payload` with the answer, and your name survives.
- A Function that returns `null` stops the flow. That is the way to make a filter: "only when the field is `po`".
- To keep something for the screen, such as a message to show or a result for a table, use **Set Variable**, or `vars.screen.set("name", value)` inside a Function. The components that show `{name}` follow it.

## 13.3 The submit flow

The shape of almost every form is this:

```
On Submit  →  API Call  ┬─ answer →  (Function: what to show)  →  Update: Sending is over
                        └─ error  →  (Function: which fields)  →  Update: Set errors
```

1. **On Submit** starts it, with `msg.payload.values`. The Send button is a spinner from now on.
2. **API Call** sends the values. In its settings, you choose the service and operation and map the form's values into its arguments with the same variable picker as everywhere else: `{msg.payload.values.username}`. Its first output, *answer*, carries the response as `msg.payload`; the second, *error*, carries `msg.error`, `msg.statusCode` and, when the server replied, its body as `msg.payload`.
3. **On success**, a Function can set a variable for the screen, and an Update node with *Sending is over* ends the spinner. Add `{ reset: true }` to the payload to clear the form (chapter 12).
4. **On refusal**, a Function turns the server's reply into `{ field: "message" }` and an Update node with *Set errors* shows each message under its field. *Set errors* ends the sending by itself.

A Function for step 4 might read:

```js
// The server answered 409 and said which field is in conflict
if (msg.statusCode === 409) {
    msg.payload = { username: "This user name is taken" };
    return msg;
}
// Anything else is not the person's fault
msg.payload = { password: "The server is not available, try again" };
return msg;
```

Note that the **error** output also runs when the server could not be reached at all (`msg.statusCode` is `0`); both are the person's problem to know about, and neither should end in a form that spins for ever.

### What to do with a network failure

When the server cannot be reached, the flow must still end the sending, or the Send button stays a spinner. The better messages are the ones that tell the person what to do: "Could not reach the server. Your entries are kept; try again." Put such a message on a field with *Set errors*, or on the screen with a variable, and leave the values where they are.

## 13.4 Checking one field with a server

Some rules cannot be answered on the page: "is this user name free?", "does this order exist?" Chapter 7 describes the field's states; this is the flow that uses them.

```
On Change  →  Function (only this field)  →  Update: Mark fields as being checked
                                          →  API Call  ┬─ answer → Function (taken?) → Update: Set errors / Clear errors
                                                       └─ error  → Update: Clear errors
```

1. The **On Change** of the form arrives for every field, so the first node filters: only the `username` field.
2. **Mark fields as being checked** puts "Checking…" on the field, and the form is not valid, and cannot be sent, until the answer comes. The payload is the field name: `username`.
3. **API Call** asks. The answer is turned into a decision.
4. If the name is **taken**, *Set errors* with `{ username: "Already used" }`. If it is **free**, *Clear errors* with the list `["username"]` as the payload, which ends the checking. The payload must be a list (or `{ names: [...] }`): *Clear errors* with no list clears the messages of every field.
5. The **error** output must also end the checking, with *Clear errors*, or the field is stuck at "Checking…" (again with `["username"]`). Decide what a failed check means for your form: usually that the server will find out when the form is sent.

**Answers that arrive late.** If the person types a second name while the first is still being checked, the first answer arrives afterwards and describes a name that is no longer in the field. Acting on it would put "Already taken" under a name that was never checked. The guard is to compare the answer with what the field holds *now*. For that, bind the form's *Values (write)* output (`outputValues`) to a variable, say `formValues`, and in the Function that reads the answer:

```js
var name = msg.checkedName;                  // stored in the message before the call
var now = (vars.screen.get("formValues") || {}).username;
if (now !== name) return null;               // the person typed on: this answer is old, drop it
```

A dropped answer does not end the checking, which is right only if the newer typing started a check of its own, whose answer will end it. So **every** change of the field must lead either to a new check or to an end of the old one. Do not skip the server call for a text that already breaks a rule, unless that path sends *Clear errors* with `["username"]`; otherwise a check left over from earlier typing is never answered, and the field stays at "Checking…". Recipe 14 in chapter 15 is this flow, working: the Validate node there sends the invalid names to *Set errors*, which also ends the checking.

## 13.5 Checking the whole form with a schema

For rules that look at several fields, or that you would like to write once and use on the page and for the server, there is the **Validate** node (chapter 14). It checks `msg.payload.values` against a Zod schema, and has two outputs: *valid*, which carries on to the API Call, and *invalid*, which carries `msg.errors` in exactly the shape *Set errors* needs.

```
On Submit  →  Validate  ┬─ valid   → API Call → … → Sending is over
                        └─ invalid → Update: Set errors
```

The form's own rules and a Validate node are not alternatives. Keep the simple per-field rules on the fields, because they show as people type, and use Validate for what can only be said about the whole.

## 13.6 Loading a record into the form

To edit something that exists, fill the form with it before the person sees it:

```
On Load  →  API Call (get the record)  →  Update: Set values
```

*Set values* takes `msg.payload` as an object whose names are the fields' names: `{ username: "ann", profile: { city: "Surabaya" } }`. A name with a dot, such as `profile.city`, is found either as that exact key or by following the path. A field that the record does not mention is left as it is.

What is loaded becomes the **start** of the form (chapter 4): the form is not "changed", the fields are untouched, Reset returns to the record, and the first change the person makes marks the form as changed. This is what makes a Save button that is disabled until something changed possible; bind it to the form's *Changed (write)* output (`outputDirty`, chapter 3).

If the fields are not on the page yet when the record arrives, for example because the form is in a tab that has not been opened, *Set values* is remembered, and each field takes its value when it appears.

## 13.7 Reset, Cancel and leaving

- **Reset** returns every field to its start and forgets every message. Wire it to a Cancel button either with the button's own *In a form* setting (chapter 12), or from Logic.
- **Reset after a send** is the `{ reset: true }` of *Sending is over*.
- **Leaving with unsaved work.** The form's *On Changed or Unchanged* tells you when the form begins to differ from its start. Keep a variable `unsaved` with it, and warn on whatever navigates away: a dialog, a Goto Screen node.

## 13.8 Focus

*Focus a field* moves the keyboard to a field. Its payload is the name, or `{ name: "po" }`. Without one, it goes to the first field in error, and if there is none, to the first field of the form. The usual use is an **On Render** node on the screen, so that the person can type at once (recipe 10). Sending a form that has errors, and *Set errors*, move the focus by themselves; you do not need to.

## 13.9 Several forms on a screen

Fields find the form they belong to by the structure of the screen (chapter 4), so two forms on one screen do not mix their fields, and each has its own events, actions and outputs. In Logic, each form is a separate component: choose the right one in the *On …* and *Update* nodes. Two forms are two independent states, and nothing sends one when the other is sent. If two must be sent together, collect them in a Function: store each form's values in a variable on its *On Change*, and send both at once from a single button of your own.

## 13.10 What not to do

- **Do not write form values to variables from every field** to read them from Logic. Use the form's *Values* output once, or the payload of *On Submit*. A variable per field is what the form exists to avoid.
- **Do not send the form from On Change.** That is validation, not submission.
- **Do not keep a Send flow that cannot end.** Every route, errors and timeouts included, must reach *Sending is over* or *Set errors*.
- **Do not trust the page.** Everything a form checks, a person can bypass. The server must check again (chapter 14, section 14.9).
