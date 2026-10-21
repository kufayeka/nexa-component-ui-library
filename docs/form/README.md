# Forms in Nexa

This manual is about one thing: building forms in Nexa Dashboard. It covers the Form component, every control you can put in one, the rules that decide whether what a person typed is acceptable, the Logic nodes that send the result somewhere, and the Validate node that lets you describe complicated checks with Zod.

It is written to be read from the top, in order, the first time, and to be searched afterwards. If you only want to get something working, read chapters 1 to 3. If you are checking what one setting does, go straight to the chapter of that control. If you are stuck, chapter 16 lists the things that go wrong most often and where to look.

Everything in the manual was checked against the running software. The pictures in the cookbook were taken from real screens, and the example project that goes with it (`docs/examples/form-cookbook.nexa.json`) contains those same screens, so you can open them and change them.

## Contents

**Part I: The idea**

1. [What a form is, and what it is for](01-what-a-form-is.md)
   Loose controls and what is missing from them. The words this manual uses. What happens, step by step, between a key being pressed and a message reaching Logic.
2. [Your first form](02-your-first-form.md)
   A login form, built from an empty screen, with everything explained as you go.

**Part II: The Form and its fields**

3. [The Form component](03-the-form-component.md)
   The container itself: its slot, its settings, its five outputs, its six events, its nine actions.
4. [Fields: names, values and where a form starts](04-fields-names-and-values.md)
   What makes a control part of a form, how names turn into the shape of your data, and the value each kind of control gives.
5. [Settings every control shares](05-settings-every-control-shares.md)
   Data binding, the label and helper text, size and colour, read-only and disabled, and the custom CSS parts. Read once; the control chapters refer back to it.

**Part III: Checking what was entered**

6. [Rules](06-rules.md)
   The checks built into the controls, how an empty field is treated, and the rule you can write yourself in JavaScript.
7. [Errors, validity and the state of a form](07-errors-and-state.md)
   When an error appears and when it goes, what valid, changed and sending mean exactly, and how the form decides.

**Part IV: The controls**

8. [Text controls: Input, Textarea, Number Input, Password Input](08-text-controls.md)
9. [Choice controls: Checkbox, Switch, Radio Group, Segmented Control, Select, Combobox](09-choice-controls.md)
10. [Slider, Tags Input, Pin Input and Rating](10-slider-tags-pin-rating.md)
11. [Date Time and Date Range](11-dates.md)

**Part V: Sending, wiring and validation**

12. [Buttons and sending the form](12-buttons-and-sending.md)
13. [Wiring a form with Logic](13-wiring-with-logic.md)
    The events, the actions, what each carries, and the patterns that come up again and again.
14. [The Validate node and Zod](14-validate-and-zod.md)
    Checks that are complicated, dynamic or need a server, written as a Zod schema in a Logic node.

**Part VI: Practice**

15. [Cookbook](15-cookbook.md)
    Fifteen worked examples with pictures, each one a screen in the example project.
16. [When something does not work](16-when-something-does-not-work.md)

**Appendix**

- [A. Reference tables](A-reference.md)
  Every event, action and output with its payload, and a one-page summary of what each control gives a form.

## Conventions

Settings are named as the inspector names them, with the internal key in code type the first time it matters: the setting *Name in the form* is `formName`. The keys are what you see in a saved project, in the example project, and in this manual's tables, so both are given.

The inspector groups the settings of a control under tabs: Data, Field, Content, Display, Style, Behaviour, Form and Custom CSS. A control only shows the tabs it has settings for. Each setting in this manual says which tab it is under.

*Logic* means the wiring canvas of a screen, the one with nodes and wires. *Update node* is the Logic node that sets properties of a component or runs one of its actions. An *On ... node* is a Logic node that starts a wire when a component fires an event.

Code in the manual is JavaScript. Where a setting takes the body of a function, the code shown is exactly what you type into the setting, without the surrounding function.

## Versions

The manual describes the Nexa UI library and Nexa Dashboard as they are in this repository. The Validate node bundles Zod version 3 (the `zod/v3` build of the `zod` package, 14 KB compressed). Chapter 14 says what that means for the schemas you write.
