# 11. Date Time and Date Range

Two controls pick dates: the **Date Time**, for one moment, and the **Date Range**, for a start and an end. They look alike and share most of their settings, so the chapter treats them together, and starts with the three questions that decide how any date setting is understood: what is shown, what is held, and what is written.

## 11.1 Showing, holding and writing a date

**What is shown** is the text in the box. It is controlled by the **Display format** (`format`) and by the time zone mode.

**What is held** is a moment in time. Whatever you give the control, a date from a variable, an ISO text, a number, it is turned into one moment and kept as that.

**What is written** is what goes to *Value (write)*, to the event payloads, and into the form's values. It is controlled by the **Write output format** (`outputType`). In a form, **the field's value is what the control writes:** by default an ISO text such as `2026-05-04T10:30:00.000Z`, or a number, if you chose one.

Keeping the three apart is what makes dates manageable. The person sees `04/05/2026 17:30`, the form holds a moment, and your API receives an ISO text, without any conversion on your part.

### What the control accepts as input

Whatever supplies a date, whether *Value (read)*, the *Default value*, or *Set values*, can be any of these:

| Given | Read as |
| --- | --- |
| an ISO 8601 text, such as `2026-05-04T10:30:00.000Z` | that moment |
| a date text such as `2026-05-04`, `2026/05/04` or `04/05/2026` | midnight at the start of that day (UTC) |
| a number of 9 to 15 digits, or a number | Unix time: below `1e11` it is seconds, otherwise milliseconds |
| a JavaScript `Date` | that moment |
| a text in a custom shape, with **Parse regex** | see below |
| an empty text, `null`, or something that is not a date | no date |

A **Parse regex** (`customRegex`, in the Format group) handles dates written in a shape of your own. Give it a regular expression with named groups, `year`, `month`, `day`, and optionally `hour`, `minute` and `second`:

```
(?<day>\d{2})\.(?<month>\d{2})\.(?<year>\d{4})
```

reads `04.05.2026` as the 4th of May. Without it, a text like that would be tried as an ordinary date text and might be read the wrong way round.

### Display format

The **Display format** (`format`) is a template made of tokens. Each token is replaced by that part of the date, and everything else is kept as it is.

| Token | Meaning | Example |
| --- | --- | --- |
| `YYYY` `YY` | year | `2026` `26` |
| `MMMM` `MMM` | month name, full and short | `May` `May` |
| `MM` `M` | month number, with and without a leading zero | `05` `5` |
| `DD` `D` | day of the month | `04` `4` |
| `HH` `H` | hour, 24-hour clock | `14` `14` |
| `hh` `h` | hour, 12-hour clock | `02` `2` |
| `mm` `m` | minute | `30` `30` |
| `ss` `s` | second | `15` `15` |
| `SSS` | millisecond | `123` |
| `A` `a` | AM / PM, in capitals and in lower case | `PM` `pm` |
| `Z` | offset: `Z` in UTC mode, `+07:00` and the like in local mode | `Z` |

So `D MMM YY, HH:mm:ss.SSS a` shows `4 May 26, 14:30:15.123 pm`. The default format is `YYYY-MM-DD HH:mm:ss`.

The display format is **independent of the preset** (see below). The preset decides which parts the picker lets the person choose; the format decides how they are written. If you choose the *Date only* preset, the box still shows the time part, as zeros, unless you also set the format to `YYYY-MM-DD`.

### Time zone: UTC or Local

**Timezone handling** (`timezoneMode`) is *UTC* (the default) or *Local*.

- In **UTC** mode the date is shown and picked in UTC, and the day the calendar highlights is the UTC day. The same moment looks the same to everyone in every country. The box shows a small *UTC* badge.
- In **Local** mode the date is shown in the time zone of the person's computer, and the picker uses local days. A moment of `10:30 UTC` shows as `17:30` in Jakarta, and the person picks local days and local times. What is written is still a precise moment, so converting is not your concern.

Use UTC when the values are compared with other systems' timestamps, such as a historian, and Local when the person thinks in their own clock. If the people who use the screen are in one place, Local is usually the natural choice.

### Write output format

**Write output format** (`outputType`) is what the control gives out:

| Setting | Gives | Example |
| --- | --- | --- |
| ISO-8601 string (the default) | text | `2026-05-04T10:30:00.000Z` |
| Unix timestamp (milliseconds) | number | `1777890600000` |
| Unix timestamp (seconds) | number | `1777890600` |
| Formatted template string | text, written with the *Display format* | `04/05/2026 10:30` |
| Date only | text | `2026-05-04` |
| Time only | text (Date Time only) | `10:30:00` |

*Date only* and *Time only* are always in UTC. The Date Range has the first five. Choose by what the receiver wants; ISO text is the safest to move around, a number is the easiest to compare.

## 11.2 Date Time

The Date Time picks one date and time, with a calendar that opens when the box is clicked, and time inputs under it.

**Value in the form:** what the control writes, per *Write output format*: by default an ISO text. `null` until a date is chosen. **Required:** a date must be chosen.

### Which parts the picker offers

**Preset** (`unitPreset`), in the Granularity group, chooses the parts of a date the picker works with:

| Preset | Parts |
| --- | --- |
| Date & Time | year, month, day, hours, minutes |
| Date & Time with Seconds | the above, and seconds |
| Date Only | year, month, day |
| Time Only | hours, minutes, seconds |
| Year & Month | year, month |
| Custom Units | the ones you tick below |

With **Custom Units** you decide, one by one: **Year** (`showYear`), **Month** (`showMonth`), **Day** (`showDay`), **Hours** (`showHours`), **Minutes** (`showMinutes`), **Seconds** (`showSeconds`), and **Milliseconds** (`showMs`). Milliseconds appear only once seconds are on; they are for filtering data that was recorded at that resolution, such as a historian.

Remember that this decides what can be *picked*, and that the format decides what is *shown* (section 11.1).

### Settings

- *Data:* `inputValue` and `outputValue`; **Default value (unbound)** (`defaultValue`), a date in any of the forms above, empty by default.
- *Granularity:* `unitPreset` and the unit switches above.
- *Format:* `format` and `customRegex`.
- *Timezone / UTC:* `timezoneMode` and `outputType`.
- *Display:* **Placeholder** (`placeholder`), the hint when no date is chosen; **Clear button (×)** (`clearable`), **on** by default, which lets the person remove the date.
- *Style:* `variant`, `size`, `colorPalette`, `radius`.
- *Behaviour:* `disabled`, `readonly`.
- *Form, Field:* `formName`, `requiredMessage`, `ruleCode`, `ruleMessage`, `label`, `labelPosition`, `helperText`, `invalid`, `errorText`, `required`.

### Events and actions

| Event | When | `msg.payload` |
| --- | --- | --- |
| **On Change** | the person chose or cleared a date | `{ value, iso, timestamp, text, utc }` |
| **On Popover Open** / **On Popover Close** | the calendar opened or closed | none |

`value` is what the control writes (per *Write output format*); `iso` is always the ISO text, `timestamp` the milliseconds, `text` what the box shows, `utc` the date as `YYYY-MM-DD HH:mm:ss [UTC]`.

Two actions, on an Update node: **Set to current time** (`setNow`) and **Clear date time** (`clear`). Both change the field the way the person does, so a form follows.

## 11.3 Date Range

The Date Range picks a start and an end together. Its calendar shows two months, side by side or stacked, and a sidebar of quick ranges.

**Value in the form:** an object `{ start, end }`, each end written per *Write output format*, or `null` until **both** ends are chosen. **Required:** both ends are needed.

```js
{ period: { start: "2026-05-01T00:00:00.000Z", end: "2026-05-31T23:59:59.999Z" } }
```

For *Set values*, pass an object of the same shape, with each end in any form the control accepts.

### The ends of a day

When the person picks days, not times, the start is the **first instant** of the first day (`00:00:00.000`) and the end the **last instant** of the last day (`23:59:59.999`), exact to the millisecond. A range from the 1st to the 31st therefore covers the whole of the 31st, with nothing missed at the end. This is what filtering of recorded data needs, and what people mean by "the month of May".

### Time selection

**Time selection** (`timeGranularity`), in the Granularity group, decides how finely a boundary can be set:

| Setting | The person can set |
| --- | --- |
| Off (date only) | days only; the day ends are as above |
| Hours & minutes | and the time, to the minute |
| + Seconds | to the second |
| + Milliseconds | to the millisecond |

### Quick ranges

The sidebar on the calendar offers **Today**, **Yesterday**, **Last 7 Days**, **Last 30 Days**, **This Month**, **Last Month** and **Year to Date**. **Show quick presets sidebar** (`presets`) switches it on or off; it is on by default. The same ranges can be chosen from Logic with the *Apply preset range* action, using these names: `today`, `yesterday`, `last-7-days`, `last-30-days`, `this-month`, `last-month` and `year-to-date`.

### Settings

- *Data:* the three ways of supplying a range: **Start Date (read)** (`inputStart`), **End Date (read)** (`inputEnd`) and **Range Object / Array (read)** (`inputRange`), which takes `{ start, end }` or `[start, end]`; and the three for writing: `outputStart`, `outputEnd`, `outputRange`. Use whichever suits the variables you have. In a form you rarely bind any of them. **Default start date** (`defaultStart`) and **Default end date** (`defaultEnd`) are the start of the field.
- *Format:* **Display format** (`format`) and `customRegex`. For the range the format is **empty by default**, which means that it follows *Time selection*: `YYYY-MM-DD`, then with `HH:mm`, with `ss`, with `.SSS` as the selection gets finer.
- *Display:* **Range separator** (`separator`), the text between the two dates, `→` by default; **Start placeholder** (`startPlaceholder`) and **End placeholder** (`endPlaceholder`), the hints in the empty ends, *Start date* and *End date*; **Calendar layout** (`monthLayout`), the two months *Side by side* or *Stacked*; **Clear button (×)** (`clearable`), on by default.
- *Granularity, Timezone / UTC, Presets:* `timeGranularity`, `timezoneMode`, `outputType`, `presets`, as above.
- *Style, Behaviour, Form, Field:* as for the Date Time.

### Events and actions

| Event | When | `msg.payload` |
| --- | --- | --- |
| **On Change** | the person chose or cleared a range | `{ start, end, range, startIso, endIso, text }` |
| **On Popover Open** / **On Popover Close** | the calendar opened or closed | none |

`start` and `end` are written per *Write output format*, `range` is `{ start, end }`, and `startIso` and `endIso` are the ISO texts. Actions: **Apply preset range** (`setPreset`) takes `{ preset: "last-7-days" }`, and **Clear date range** (`clear`).

## 11.4 Rules for dates

The built-in rules that count for a date field are *Required*, and your own. Because the form's value is the control's output, a rule sees the same value, and ISO texts have a convenient property: they compare correctly as text.

```js
// on the field `end` (a Date Time written as an ISO text): not before `start`
return !values.start || !value || value >= values.start || "The end is before the start";
```

For a Date Range the end-before-start case cannot happen, since the picker does not allow it. A rule on a range may look inside it:

```js
// at most 31 days: both ends are ISO texts
var days = (Date.parse(value.end) - Date.parse(value.start)) / 86400000;
return !value || days <= 31 || "Choose at most 31 days";
```

Remember that `value` is `null` until both ends are chosen.

Checks on dates that are harder than that, such as "not on a holiday", belong in a Validate node or a call to a server.
