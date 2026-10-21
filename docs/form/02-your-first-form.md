# 2. Your first form

This chapter builds one complete form, a login screen, from an empty screen to a working one. It is deliberately small. The aim is to touch every part once so that the later chapters, which go into each part in depth, have something to hang on.

The screen has two fields, a user name and a password, and a button that signs in. It answers the way a real server would: a wrong password puts a message under the password field, a right one welcomes the user. There is no real server here. A Function node pretends to be one, and where it stands you would put an API Call node. The finished screen is the first screen of the example project (`/nexa/c1-login`).

![The login form while it is being sent](../images/form/login-sending.png)

## 2.1 Place the Form and its fields

Open the screen you want to work on and, in the **UI Components** tab, find the **Form** component under *UI · Form*. Drop it on the canvas and make it big enough to hold the fields; 380 by 320 pixels is plenty for this one.

A Form is a container, like Tabs. Inside it there is one panel, called *Fields*, which is where the controls go. On the canvas the Form shows as a dashed frame with the word *Form* on it. The frame is drawn only while you are designing; on the running page there is nothing to see until you put something inside.

Now drop the controls into the Form, one under another:

1. an **Input**, with the label *User name*,
2. a **Password Input**, with the label *Password*,
3. a **Button**, with the text *Sign in*.

The panel is an ordinary frame with a vertical auto layout, so the three controls line up in a column by themselves, with some padding around them. If you open the **Hierarchy** tab you will see the nesting: the screen, the Form, its *Fields* panel, and the three controls under it.

![The login screen in the editor](../images/form/login-design.png)

Nothing is connected yet. If you ran the screen now you would have two text boxes and a button that does nothing, which is exactly what you would have without the Form. The next steps are what make it a form.

## 2.2 Give each control a name

Select the user name Input. In the **Properties** tab, open the group called **Form** and set **Name in the form** (`formName`) to `username`. Do the same for the password, calling it `password`.

![Name in the form, in the inspector](../images/form/login-inspector-name.png)

This is the single step that makes a control a field. A control without a name is ignored by the Form around it, however deep inside it sits. With a name, the control reports to the Form, and the Form's values will contain it. What names look like and how they shape your data is chapter 4; for now it is enough that `username` and `password` are what you will see in the values the form sends.

## 2.3 Say what is required

A login needs both fields filled. On each control, in the **Field** group, switch on **Required** (`required`). A red asterisk appears after the label, and the field now breaks a rule while it is empty.

You will want to say what to display when the rule is broken. In the **Form** group, **Message when required and empty** (`requiredMessage`) sets the text. Leave it empty and the field says *Required*, which is fine here.

There are more rules, such as a shortest length or a pattern; chapter 6 lists them. You do not need them for a login, because the server decides what is a good password.

## 2.4 Make the button send the form

Select the button. In its **Form** group, set **In a form, this button** (`formAction`) to *Sends the form*. Then switch on **Disabled until the form is valid** (`waitForValid`).

![In a form, this button: Sends the form](../images/form/login-inspector-send.png)

These two settings give the button its two jobs. Clicking it asks the form to send, which fires *On Submit* when everything is right. And the button stays grey while the form is not valid, so that on an empty screen there is nothing to click. While the form is being sent the button also shows a spinner and ignores further clicks, so that a nervous double click cannot send twice.

Here is what the empty form looks like. The button is off because the form starts invalid: both fields are required and both are empty.

![The empty login form: the Sign in button waits](../images/form/login-empty.png)

## 2.5 Choose when errors appear

Select the Form itself (click its dashed frame, or pick it in the Hierarchy) and open its **Behaviour** group. **Show errors** (`validateOn`) decides when a field's error becomes visible: *While the user types*, *When a field is left*, or *Only when sending*. Choose *When a field is left* for the login. It keeps the screen quiet while someone is still in the middle of typing their name, and still tells them as soon as they move on.

![The Form's Behaviour settings: Show errors](../images/form/login-inspector-form.png)

Whatever you choose here, the form still knows from the first moment whether it is valid. Only the telling is delayed. That is why the button can be correctly disabled on a screen that has not shown a single error yet.

## 2.6 Wire what happens when it is sent

The form fires events; Logic reacts. Open the **Logic** tab of the screen. In the **Events** tab of the sidebar, with the Form selected, the first group is *Selected UI component events*. It has a chip for each event of the Form and a chip *Form → Update* that makes a node for changing the Form.

Build this, left to right:

![The Logic of the login screen](../images/form/login-logic.png)

1. **On Submit** is the form's event. Drag it onto the canvas. It fires only when every rule is met, and its message carries the values: `msg.payload.values.username` and `msg.payload.values.password`.

2. **Fake server: log in** is a Function node. Where the real server would go, this one waits one and a half seconds and then decides:

   ```js
   var v = msg.payload.values;
   return new Promise(function (resolve) {
       setTimeout(function () {
           msg.statusCode = (v.username === "ann" && v.password === "secret") ? 200 : 401;
           resolve(msg);
       }, 1500);
   });
   ```

   With a real server this is an **API Call** node. Its first output is the answer, its second is the error, and `msg.statusCode` tells you which kind.

3. **Right password?** is a second Function node, wired from the first. It does the happy path:

   ```js
   if (msg.statusCode !== 200) return null;
   vars.screen.set("welcome", "Welcome, " + msg.payload.values.username + "!");
   msg.payload = { reset: true };
   return msg;
   ```

   A Function node that returns `null` sends nothing, so this branch only goes on when the login worked. `welcome` is a screen variable that a Text component on the same screen displays.

4. **Sending is over** is an **Update node** pointed at the Form, with the action *Sending is over*. It receives `{ reset: true }` and tells the form that the sending has ended and that it should empty itself.

5. **Wrong password?** is the mirror image of step 3, wired from the same Function:

   ```js
   if (msg.statusCode === 200) return null;
   msg.payload = { password: "Wrong user name or password" };
   return msg;
   ```

6. **Set errors** is an Update node with the action *Set errors*. Its payload, `{ password: "..." }`, is a map from a field name to a message. The form puts that message under the field and ends the sending.

The Update nodes have no parameters to fill in. When an action takes data and the node has none of its own, the action reads `msg.payload`. That is why the Function nodes above put the data in the payload.

## 2.7 Try it

Deploy and open the screen. Here is what you see.

**While the server answers.** Fill in `ann` and any wrong password, press the button. For a second and a half the button shows a spinner and does nothing when clicked, and the screen's state text says `sending = true`.

![The Sign in button shows a spinner](../images/form/login-sending.png)

**A wrong password.** The message appears under the password field, the text is selected so that the person can type over it, and the button works again, because *Set errors* also ends the sending.

![The message under the password](../images/form/login-wrong-password.png)

**A right one.** Use the password `secret`. The form empties itself, because of the `reset`, and the welcome text appears.

![Welcome, ann!](../images/form/login-welcome.png)

A second thing worth trying: type something in the password field, and then change your mind and empty it. The error does not appear while you are still in the field (with *When a field is left*) and appears the moment you leave it. Then click into it and start typing: the error goes. That is the form telling you, and not telling you, at the moments you chose.

## 2.8 What you built

You gave a handful of controls a shared state without wiring any of that state yourself. The form is valid when both fields are filled, and invalid otherwise; the button listens to that. Pressing the button, or Enter in either field, sends the form if it is valid and shows what is wrong if not. The server's answer comes back through two Update nodes: one for success, one for a refusal that lands on the right field.

Everything else in the manual is a variation on those four moves: name the fields, say what is acceptable, send, and report how it ended. Chapter 3 now goes through the Form component itself, setting by setting.
