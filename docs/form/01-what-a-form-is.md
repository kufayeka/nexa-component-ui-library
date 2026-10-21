# 1. What a form is, and what it is for

## 1.1 The problem with loose controls

Put an Input, a Number Input, a Select and a Button on a screen and you have the pieces of a form, but you do not have a form. Each of those controls knows about itself and nothing else. The Input knows what is typed in it. The Select knows which option is chosen. Neither of them knows that the other exists, and nothing knows whether the screen as a whole is in a state where it makes sense to press the button.

You can build the missing parts yourself. Each control can write its value to a variable. You can add a Logic node for every rule you care about, a variable for every error message, an Update node to show each one, and a few more variables and wires to combine all the errors into one "can I send this?" flag. It works, and for a screen with a user name and a password it is perfectly reasonable. It stops being reasonable at about the sixth field, when the wiring is larger than the screen it serves, and every new rule means touching three places.

A Form is the thing that does that bookkeeping for you. You put controls inside it, give each one a name, say what makes a value acceptable, and the Form keeps track of the rest: what has been entered, what is wrong, why, whether the whole thing can be sent, and whether anything has changed since it was opened. It does not send anything and it does not store anything. It tells Logic what is going on, and Logic does the work, exactly as it does for any other component.

## 1.2 What a Form adds

Compared with the same controls standing alone, a Form gives you these things.

**One idea of "valid".** The form is valid when every field satisfies every one of its rules. It knows this from the first moment the screen appears, before anybody has touched anything, so a Send button that waits for a valid form is correctly disabled on an empty screen.

**One idea of "changed".** The form remembers where it started. It can tell you whether the person has altered anything, and it can put everything back.

**Messages in the right place.** An error appears under the control it belongs to, at a moment you choose: as the person types, when they leave the field, or only after they try to send.

**One event that means something.** *On Submit* fires when the person asks to send the form and everything is acceptable. It carries all the values, as one object, by name. *On Invalid Submit* fires when they ask and something is not.

**A way for the outside world to answer.** A server can refuse a value ("that user name is taken") and the form can put that refusal on the right field. A server can take a long time to answer and the form can show that it is waiting.

**State you can use elsewhere.** The form writes whether it is valid, whether it has changed, whether it is being sent, the values and the errors to variables, so that a banner, a badge, a button on the other side of the screen or a Logic node can react to them.

## 1.3 What a Form is not

It is worth being exact about the limits, because they decide where your own work goes.

A Form is **not a data store**. When the screen is closed, what was entered is gone unless you sent it somewhere.

A Form does **not send anything**. *On Submit* is an event; what happens after it is up to the wires you attach. Sending usually means an API Call node, a Function node, a write to a tag, or a message to a Node-RED flow.

A Form is **not a security boundary**. Everything a Form checks is checked in the visitor's browser, which means it can be bypassed by anyone who wants to. The checks are there to help people fill things in correctly, quickly. Whatever you send to must check again.

A Form is **not needed for every screen that has a control on it**. A switch that starts a machine, a slider that sets a speed, a number that is written to a tag when you press Enter: these are single controls doing one job, and they are better left alone. Use a Form when several values belong together and are accepted or refused together.

## 1.4 The words this manual uses

These words have a precise meaning in the rest of the manual.

**Form** is the container component. You drop it on a screen and place controls inside it.

**Field** is a control that has joined a Form. A control joins by having a *Name in the form*; without one it is just a control that happens to sit inside a Form.

**Name** is what a field is called inside its form: `username`, `email`, `owner.city`. Names become the shape of the form's values (chapter 4).

**Value** is what a field currently holds, as the form sees it: a text, a number, true or false, a list, a date.

**Start** is what the form's values were when the form opened, or when they were last loaded or sent. *Changed* means "different from the start". *Reset* means "back to the start".

**Rule** is a check on one field: required, a shortest length, a pattern, a number's limits, or a rule you write in JavaScript. A field breaks a rule when its value does not satisfy it. A field is valid when it breaks none.

**Error** is the message a rule gives when it is broken, or the message Logic puts on a field after a server refused something.

**Shown** and **true** are different things, and the difference matters. A field can be wrong (true) without the person having been told yet (shown). The form always knows what is true; you choose when it shows it.

**Edited** and **touched.** A field is edited once the person has changed its value, and touched once they have left it. The form uses these to decide when it is fair to show an error.

**Submit** and **send** mean the same thing: the person asked for the form to go. A **failed submit** is one that was refused because something was wrong.

**Checking** is the state of a field while something slow, usually a server, is deciding whether its value is acceptable. A form with a field being checked is not valid and cannot be sent.

## 1.5 The life of one key press

Understanding what happens between a key press and a message arriving in Logic makes the rest of the manual easy, because every setting in it controls one step of this sequence. Take a form with a user name field and a Send button, and a person typing the letter `a` into the user name.

1. **The control takes the letter.** The Input shows it, as it always does. In a form, the text typed counts as the field's value as soon as it is typed; it does not wait for Enter.

2. **The field tells the form.** The field reports its new value to the form. If the control itself refuses the text (a Number Input given `4x`, or a number below its minimum), it reports that refusal too.

3. **Every rule runs again.** The form re-checks all the fields, not just this one, because a rule can look at other fields (a "confirm password" rule reads the password). The form works out whether it is valid and whether it has changed.

4. **The form decides what to show.** Whether this field's error is shown now depends on the form's *Show errors* setting and on whether the person has already edited, left or tried to send. The control's own refusal of the text is always shown straight away.

5. **The form updates its outputs.** If the valid, changed, values or errors outputs have changed since last time, the form writes them to their variables. If nothing changed, nothing is written.

6. **After a pause, the form fires On Change.** The person is still typing, so the form waits. Once they stop for the length of the *On Change delay* (300 milliseconds unless you say otherwise), the event goes to Logic with the field's name, its value, all the values, and whether the form is valid.

7. **When they leave the field,** the field is marked touched, any pending On Change goes out at once, and under the *When a field is left* setting this is the moment an error appears.

8. **When they press Send or Enter,** the form checks everything. If it is valid, *On Submit* fires, the form is marked as sending, and the Send button shows that it is working. If not, *On Invalid Submit* fires, every error is shown, and the first wrong field is focused.

9. **Logic does its work and tells the form how it ended.** *Sending is over* when it went well, *Set errors* when the server said no.

Chapters 3 to 7 take these steps one at a time. Chapter 13 shows how Logic takes part in steps 6 to 9.

## 1.6 Where the pieces live

Three layers are involved, and knowing which layer a thing belongs to tells you where to look when it misbehaves.

The **controls** are the ordinary Nexa UI components: Input, Select, and the rest. Each has a set of settings in the inspector. A few of them concern forms (*Name in the form*, *Required*, the rule settings); the others are the control's own.

The **Form component** is the container. It owns the state described above and decides what to show and when. Its settings, outputs, events and actions are all in chapter 3.

**Logic** is where the form meets the rest of the world. Events from the Form start wires; Update nodes pointed at the Form change its state; a Validate node checks messages against a Zod schema; API Call and Function nodes talk to servers.

The split matters because it explains a design choice you will meet repeatedly. A rule on a control runs inside the browser, instantly, on every key; it can only look at values already on the screen. Anything that needs to ask somebody else, such as a database, a server or a slow computation, is a wire in Logic. Chapter 6 covers the first kind, chapters 13 and 14 the second.
