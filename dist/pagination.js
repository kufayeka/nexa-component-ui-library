// Nexa UI — Pagination component: inspired by IBM Carbon Design System Pagination guidelines,
// refined into the Nexa UI visual identity with design tokens, responsive layout, two-way
// page & pageSize bindings, and offset calculation.
import { html, css, nothing } from "../../nexa-sdk/nexa-component-sdk.js";
import {
    CATEGORY_FORM, PREFIX, BASE_CSS, UIElement, CSS_GROUP, part,
    sizeProp, paletteProp, disabledProp, icon, num, defineUI } from "./core.js";

const CAPS = { resizable: true, rotatable: false, flippable: false, lockable: true };
const common = { category: CATEGORY_FORM, capabilities: CAPS, css: "" };

const PAGINATION_CSS = css`
    :host {
        display: block; width: 100%; height: 100%; box-sizing: border-box;
        --pag-h: 48px;
    }
    :host([data-size="sm"]) { --pag-h: 32px; }
    :host([data-size="md"]) { --pag-h: 40px; }
    :host([data-size="lg"]) { --pag-h: 48px; }

    .pag-container {
        width: 100%; height: 100%; min-height: var(--pag-h); display: flex; align-items: center; justify-content: space-between;
        background: var(--bg-subtle); color: var(--fg); border-top: 1px solid var(--bd); box-sizing: border-box;
        padding-left: var(--px); font-size: var(--fs); letter-spacing: 0.16px; user-select: none;
    }

    .pag-left, .pag-right {
        display: flex; align-items: center; height: 100%; min-height: inherit;
    }
    .pag-left { gap: 12px; flex-wrap: wrap; }
    .pag-right { justify-content: flex-end; }

    .pag-label {
        font-size: var(--fs-label); color: var(--fg-muted); letter-spacing: 0.32px; white-space: nowrap;
    }

    .pag-range {
        font-size: var(--fs); color: var(--fg); white-space: nowrap;
    }
    .pag-range .num {
        font-family: var(--mono); font-weight: 500;
    }

    /* Subtle Carbon select dropdown */
    .pag-select-wrap {
        display: inline-flex; align-items: center; position: relative;
    }
    .pag-select {
        all: unset; height: calc(var(--pag-h) - 12px); max-height: 36px; padding: 0 28px 0 10px;
        background: var(--bg); color: var(--fg); border: none; border-bottom: 1px solid var(--bd-strong);
        border-radius: 2px 2px 0 0; font-family: var(--mono); font-size: 13px; font-weight: 500;
        cursor: pointer; transition: background-color var(--t) var(--ease), border-color var(--t) var(--ease);
    }
    .pag-select:hover:not(:disabled) { background: var(--bg-muted); }
    .pag-select:focus-visible { outline: 2px solid var(--ring); outline-offset: -1px; }
    .pag-select:disabled { cursor: not-allowed; opacity: 0.5; }
    .pag-select-icon {
        position: absolute; right: 8px; pointer-events: none; color: var(--fg-muted);
        display: inline-flex; align-items: center; justify-content: center;
    }

    .pag-divider {
        width: 1px; height: 50%; min-height: 18px; max-height: 24px; background: var(--bd); margin: 0 8px;
    }

    /* Carbon button navigation: square icons, flush right */
    .pag-nav-btn {
        all: unset; width: var(--pag-h); height: 100%; min-height: inherit; display: inline-flex; align-items: center; justify-content: center;
        color: var(--fg); cursor: pointer; border-left: 1px solid var(--bd); box-sizing: border-box;
        transition: background-color var(--t) var(--ease), color var(--t) var(--ease);
    }
    .pag-nav-btn:hover:not(:disabled) { background: var(--bg-emph); }
    .pag-nav-btn:active:not(:disabled) { background: var(--bg-muted); }
    .pag-nav-btn:focus-visible { outline: 2px solid var(--ring); outline-offset: -2px; }
    .pag-nav-btn:disabled { cursor: not-allowed; color: var(--fg-subtle); opacity: 0.35; }

    /* Page status / jump */
    .pag-status {
        display: inline-flex; align-items: center; gap: 8px; padding: 0 12px; font-size: var(--fs); white-space: nowrap;
    }

    /* Numeric / Classic pagination variant */
    .pag-numeric-wrap {
        display: flex; align-items: center; justify-content: center; gap: 4px;
        width: 100%; height: 100%; box-sizing: border-box; padding: 4px var(--px, 8px);
        user-select: none;
    }
    .pag-num-btn {
        all: unset; min-width: calc(var(--pag-h) - 14px); height: calc(var(--pag-h) - 14px);
        max-width: 44px; max-height: 44px; padding: 0 8px; box-sizing: border-box;
        border-radius: var(--r, 4px); display: inline-flex; align-items: center; justify-content: center;
        font-family: var(--mono); font-size: 13px; font-weight: 500; color: var(--fg); cursor: pointer;
        background: transparent; border: 1px solid var(--bd);
        transition: background-color var(--t) var(--ease), color var(--t) var(--ease), border-color var(--t) var(--ease);
    }
    .pag-num-btn:hover:not(:disabled):not(.active) { background: var(--bg-muted); }
    .pag-num-btn:active:not(:disabled):not(.active) { background: var(--bg-emph); }
    .pag-num-btn:focus-visible { outline: 2px solid var(--ring); outline-offset: 1px; }
    .pag-num-btn.active {
        background: var(--cp-solid, #0f62fe) !important; color: var(--cp-contrast, #ffffff) !important;
        border-color: var(--cp-solid, #0f62fe) !important; font-weight: 600;
    }
    .pag-num-btn:disabled { cursor: not-allowed; color: var(--fg-subtle); opacity: 0.35; }
    .pag-ellipsis {
        min-width: 24px; display: inline-flex; align-items: center; justify-content: center;
        color: var(--fg-muted); font-family: var(--mono); font-weight: 600;
    }
`;

export const pagination = defineUI({
    ...common,
    id: PREFIX + "pagination",
    label: "Pagination",
    icon: "fa fa-list-ol",
    size: { w: 560, h: 48 },
    help: "IBM Carbon-inspired Pagination bar: items per page selector, item range summary, page jump selector, and previous/next page navigation buttons.",
    properties: {
        variant: {
            type: "enum", default: "bar", group: "Display", label: "Variant style", style: "segmented",
            options: [
                { value: "bar", label: "Carbon Bar" },
                { value: "numeric", label: "Numeric Pages" }
            ],
            help: "Carbon Bar: full status bar with select dropdowns and range. Numeric Pages: classic numbered page buttons (1 2 3 ... 10)."
        },
        siblingCount: { type: "number", default: 1, min: 1, max: 3, group: "Display", label: "Visible sibling buttons" },
        total: { type: "number", default: 100, min: 0, group: "Data", label: "Total items" },
        page: { type: "number", default: 1, min: 1, group: "Data", label: "Initial page (1-based)" },
        pageSize: { type: "number", default: 10, min: 1, group: "Data", label: "Initial page size" },
        pageSizeOptions: {
            type: "string", default: "10, 20, 50, 100", group: "Data", label: "Page size options",
            help: "Comma-separated list of available page sizes (e.g. 10, 20, 50, 100)."
        },
        showPageSize: { type: "boolean", default: true, group: "Display", label: "Show items per page selector" },
        showItemRange: { type: "boolean", default: true, group: "Display", label: "Show item range (1–10 of N)" },
        showPageJump: { type: "boolean", default: true, group: "Display", label: "Show page jump selector" },
        showFirstLast: { type: "boolean", default: false, group: "Display", label: "Show first / last page buttons" },
        itemLabel: { type: "string", default: "items", group: "Text", label: "Item noun" },
        size: sizeProp("lg"),
        colorPalette: paletteProp(),
        disabled: disabledProp()
    },
    inputs: {
        page: { type: "number", label: "Current page (read)" },
        pageSize: { type: "number", label: "Page size (read)" },
        total: { type: "number", label: "Total items (read)" }
    },
    outputs: {
        page: { fallback: "page", label: "Page (write, 1-based)" },
        pageSize: { fallback: "pageSize", label: "Page size (write)" },
        offset: { fallback: "offset", label: "Offset (write, 0-based)" }
    },
    events: {
        change: { label: "On Change", payload: { page: "number", pageSize: "number", total: "number", offset: "number", limit: "number" } },
        pageChange: { label: "On Page Change", payload: { page: "number", offset: "number" } },
        pageSizeChange: { label: "On Page Size Change", payload: { pageSize: "number" } }
    },
    actions: {
        next: { label: "Next page" },
        prev: { label: "Previous page" },
        first: { label: "First page" },
        last: { label: "Last page" }
    },
    parts: {
        container: part("The pagination bar", "container"),
        select: part("Page size dropdown", "select"),
        nav: part("Navigation buttons", "nav")
    },
    view: class extends UIElement {
        static styles = [BASE_CSS, PAGINATION_CSS];

        constructor() {
            super();
            this._localPage = null;
            this._localPageSize = null;
        }

        get currentPage() {
            if (this.status("page").bound) {
                const val = parseInt(this.in.page, 10);
                return isFinite(val) && val >= 1 ? val : 1;
            }
            return (this._localPage !== null && this._localPage !== undefined) ? this._localPage : (parseInt(this.p.page, 10) || 1);
        }

        get currentPageSize() {
            if (this.status("pageSize").bound) {
                const val = parseInt(this.in.pageSize, 10);
                return isFinite(val) && val >= 1 ? val : 10;
            }
            return (this._localPageSize !== null && this._localPageSize !== undefined) ? this._localPageSize : (parseInt(this.p.pageSize, 10) || 10);
        }

        get currentTotal() {
            if (this.status("total").bound) {
                const val = parseInt(this.in.total, 10);
                return isFinite(val) && val >= 0 ? val : 0;
            }
            const pVal = parseInt(this.p.total, 10);
            return isFinite(pVal) && pVal >= 0 ? pVal : 0;
        }

        get totalPages() {
            const sz = this.currentPageSize;
            const tot = this.currentTotal;
            return Math.max(1, Math.ceil(tot / sz));
        }

        get pageSizeList() {
            const raw = String(this.p.pageSizeOptions || "10, 20, 50, 100");
            const list = raw.split(",").map((s) => parseInt(s.trim(), 10)).filter((n) => isFinite(n) && n > 0);
            return list.length ? list : [10, 20, 50, 100];
        }

        _notify(newPage, newSize) {
            const p = newPage !== undefined ? newPage : this.currentPage;
            const sz = newSize !== undefined ? newSize : this.currentPageSize;
            const tot = this.currentTotal;
            const offset = (p - 1) * sz;

            this._localPage = p;
            this._localPageSize = sz;

            if (this.out.canWrite("page")) this.out.write("page", p).catch(() => {});
            if (this.out.canWrite("pageSize")) this.out.write("pageSize", sz).catch(() => {});
            if (this.out.canWrite("offset")) this.out.write("offset", offset).catch(() => {});

            const payload = { page: p, pageSize: sz, total: tot, offset, limit: sz };
            this.emit("change", payload);
            if (newPage !== undefined) this.emit("pageChange", { page: p, offset });
            if (newSize !== undefined) this.emit("pageSizeChange", { pageSize: sz });
            this.requestUpdate();
        }

        setPage(page) {
            if (this.p.disabled) return;
            const clamped = Math.max(1, Math.min(this.totalPages, page));
            if (clamped !== this.currentPage) {
                this._notify(clamped, undefined);
            }
        }

        setPageSize(size) {
            if (this.p.disabled) return;
            const n = Math.max(1, parseInt(size, 10) || 10);
            if (n !== this.currentPageSize) {
                // Keep the current item roughly visible: recalculate page
                const curItem = (this.currentPage - 1) * this.currentPageSize + 1;
                const newPage = Math.max(1, Math.ceil(curItem / n));
                this._notify(newPage, n);
            }
        }

        next() { this.setPage(this.currentPage + 1); }
        prev() { this.setPage(this.currentPage - 1); }
        first() { this.setPage(1); }
        last() { this.setPage(this.totalPages); }

        _getNumericPages(curPage, totalPages, siblingCount = 1) {
            const totalNumbers = siblingCount * 2 + 5;
            if (totalPages <= totalNumbers) {
                const range = [];
                for (let i = 1; i <= totalPages; i++) range.push(i);
                return range;
            }

            const leftSiblingIndex = Math.max(curPage - siblingCount, 1);
            const rightSiblingIndex = Math.min(curPage + siblingCount, totalPages);

            const shouldShowLeftDots = leftSiblingIndex > 2;
            const shouldShowRightDots = rightSiblingIndex < totalPages - 2;

            const firstPageIndex = 1;
            const lastPageIndex = totalPages;

            if (!shouldShowLeftDots && shouldShowRightDots) {
                const leftItemCount = 3 + 2 * siblingCount;
                const leftRange = [];
                for (let i = 1; i <= leftItemCount; i++) leftRange.push(i);
                return [...leftRange, "...", lastPageIndex];
            }

            if (shouldShowLeftDots && !shouldShowRightDots) {
                const rightItemCount = 3 + 2 * siblingCount;
                const rightRange = [];
                for (let i = totalPages - rightItemCount + 1; i <= totalPages; i++) rightRange.push(i);
                return [firstPageIndex, "...", ...rightRange];
            }

            if (shouldShowLeftDots && shouldShowRightDots) {
                const middleRange = [];
                for (let i = leftSiblingIndex; i <= rightSiblingIndex; i++) middleRange.push(i);
                return [firstPageIndex, "...", ...middleRange, "...", lastPageIndex];
            }
            return [];
        }

        render() {
            const p = this.p;
            const curPage = this.currentPage;
            const pageSize = this.currentPageSize;
            const total = this.currentTotal;
            const totalPages = this.totalPages;

            const startItem = total === 0 ? 0 : (curPage - 1) * pageSize + 1;
            const endItem = Math.min(total, curPage * pageSize);
            const isFirst = curPage <= 1;
            const isLast = curPage >= totalPages;
            const disabled = !!p.disabled;

            if (p.variant === "numeric") {
                const numericPages = this._getNumericPages(curPage, totalPages, p.siblingCount || 1);
                return html`<div class="pag-numeric-wrap" part="container">
                    <button class="pag-num-btn pag-nav-btn" type="button" title="Previous page" aria-label="Previous page"
                        ?disabled="${disabled || isFirst}" @click="${this.prev}">
                        ${icon("chevron-left")}
                    </button>
                    ${numericPages.map((item) => {
                        if (item === "...") {
                            return html`<span class="pag-ellipsis">…</span>`;
                        }
                        const isActive = item === curPage;
                        return html`
                            <button class="pag-num-btn ${isActive ? "active" : ""}" type="button"
                                ?disabled="${disabled}" aria-current="${isActive ? "page" : "false"}"
                                @click="${() => this.setPage(item)}">
                                ${item}
                            </button>
                        `;
                    })}
                    <button class="pag-num-btn pag-nav-btn" type="button" title="Next page" aria-label="Next page"
                        ?disabled="${disabled || isLast}" @click="${this.next}">
                        ${icon("chevron-right")}
                    </button>
                </div>`;
            }

            const pagesArray = [];
            for (let i = 1; i <= totalPages; i++) pagesArray.push(i);

            return html`<div class="pag-container" part="container">
                <div class="pag-left">
                    ${p.showPageSize !== false ? html`
                        <span class="pag-label">Items per page:</span>
                        <div class="pag-select-wrap">
                            <select class="pag-select" part="select" ?disabled="${disabled}"
                                @change="${(e) => this.setPageSize(e.target.value)}">
                                ${this.pageSizeList.map((sz) => html`
                                    <option value="${sz}" ?selected="${sz === pageSize}">${sz}</option>
                                `)}
                            </select>
                            <span class="pag-select-icon">${icon("chevron-down")}</span>
                        </div>
                    ` : nothing}

                    ${p.showItemRange !== false && p.showPageSize !== false ? html`<div class="pag-divider"></div>` : nothing}

                    ${p.showItemRange !== false ? html`
                        <span class="pag-range">
                            <span class="num">${startItem}–${endItem}</span> of <span class="num">${total}</span> ${p.itemLabel || "items"}
                        </span>
                    ` : nothing}
                </div>

                <div class="pag-right">
                    ${p.showPageJump !== false ? html`
                        <div class="pag-status">
                            <div class="pag-select-wrap">
                                <select class="pag-select" ?disabled="${disabled}"
                                    @change="${(e) => this.setPage(parseInt(e.target.value, 10))}">
                                    ${pagesArray.map((pn) => html`
                                        <option value="${pn}" ?selected="${pn === curPage}">${pn}</option>
                                    `)}
                                </select>
                                <span class="pag-select-icon">${icon("chevron-down")}</span>
                            </div>
                            <span class="pag-label">of ${totalPages} pages</span>
                        </div>
                    ` : html`
                        <div class="pag-status">
                            <span class="pag-label">${curPage} of ${totalPages} pages</span>
                        </div>
                    `}

                    <div class="pag-nav" part="nav" style="display:flex;height:100%;">
                        ${p.showFirstLast ? html`
                            <button class="pag-nav-btn" type="button" title="First page" aria-label="First page"
                                ?disabled="${disabled || isFirst}" @click="${this.first}">
                                ${icon("chevrons-left")}
                            </button>
                        ` : nothing}

                        <button class="pag-nav-btn" type="button" title="Previous page" aria-label="Previous page"
                            ?disabled="${disabled || isFirst}" @click="${this.prev}">
                            ${icon("chevron-left")}
                        </button>

                        <button class="pag-nav-btn" type="button" title="Next page" aria-label="Next page"
                            ?disabled="${disabled || isLast}" @click="${this.next}">
                            ${icon("chevron-right")}
                        </button>

                        ${p.showFirstLast ? html`
                            <button class="pag-nav-btn" type="button" title="Last page" aria-label="Last page"
                                ?disabled="${disabled || isLast}" @click="${this.last}">
                                ${icon("chevrons-right")}
                            </button>
                        ` : nothing}
                    </div>
                </div>
            </div>`;
        }
    }
});
