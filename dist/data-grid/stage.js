// Data Grid: staged edits. Pure.
//
// In "staged" edit mode a change is not final: it waits here, shown in the cell but not in the data, until Save (the changed rows go out)
// or Discard. A form uses this: the user fills several cells, then confirms once.

export function createStage() { return { edits: new Map(), version: 0 }; }

const same = (a, b) => a === b || (a !== a && b !== b) || JSON.stringify(a) === JSON.stringify(b);

/** Put one field of one row into the stage. A value equal to the original is no change at all, so it is taken back out. */
export function stageSet(stage, key, field, value, original) {
    let fields = stage.edits.get(key);
    if (same(value, original)) {
        if (fields) { delete fields[field]; if (!Object.keys(fields).length) stage.edits.delete(key); }
    } else {
        if (!fields) { fields = {}; stage.edits.set(key, fields); }
        fields[field] = value;
    }
    stage.version++;
}

/** The value to show for a field: the staged one when there is one, otherwise the row's own. */
export function stageValue(stage, key, field, rowValue) {
    const fields = stage.edits.get(key);
    return fields && Object.prototype.hasOwnProperty.call(fields, field) ? fields[field] : rowValue;
}

/** Whether a cell has a staged change. */
export function stageHas(stage, key, field) {
    const fields = stage.edits.get(key);
    return !!fields && Object.prototype.hasOwnProperty.call(fields, field);
}

/** The staged changes as rows: [{ key, changed: { field: value }, row: the row with the changes on it }]. `rowOf(key)` gives the row. */
export function stageRows(stage, rowOf) {
    const out = [];
    stage.edits.forEach((fields, key) => {
        const row = rowOf(key);
        if (row) out.push({ key, changed: Object.assign({}, fields), row: Object.assign({}, row, fields) });
    });
    return out;
}

export function stageCount(stage) {
    let n = 0;
    stage.edits.forEach((fields) => { n += Object.keys(fields).length; });
    return n;
}

export function stageClear(stage) {
    stage.edits.clear();
    stage.version++;
}

/** Forget what is staged for one row (the row was removed, or replaced by data from outside). */
export function stageDrop(stage, key) {
    if (stage.edits.delete(key)) stage.version++;
}
