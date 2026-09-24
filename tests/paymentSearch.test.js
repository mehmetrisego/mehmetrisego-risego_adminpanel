const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function setup() {
    const elements = new Map(), timers = new Map(), requests = [];
    let timerId = 0;
    const element = () => ({ value: '', style: {}, disabled: false, textContent: '', children: [],
        set innerHTML(value) { this.html = value; this.children = []; },
        get innerHTML() { return this.html || ''; },
        appendChild(child) { this.children.push(child); },
        classList: { add() {}, remove() {}, toggle() {} }
    });
    const get = id => { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); };
    const context = vm.createContext({
        console, URLSearchParams, AbortController, Intl, Date, encodeURIComponent,
        document: { getElementById: get, querySelector: get, addEventListener() {}, createElement: element },
        API_BASE: 'https://example.test/api', getAdminHeaders: () => ({}),
        handleAdminApiResponse: () => false, escapeHtml: s => s, formatIban: s => s,
        getBankStatusLabel: () => null, getReturnReasonLabel: () => null, formatDate: () => 'date',
        setTimeout: fn => { const id = ++timerId; timers.set(id, fn); return id; },
        clearTimeout: id => timers.delete(id),
        fetch: (url, options) => new Promise(resolve => requests.push({ url, options, resolve }))
    });
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/admin.js'), 'utf8'), context);
    const resolve = (i, logs, more = false, cursor = null) => requests[i].resolve({
        ok: true, json: async () => ({ success: true, logs, hasMore: more, nextCursor: cursor })
    });
    return { context, get, requests, resolve, timers };
}

test('search is debounced and old requests cannot replace newer results', async () => {
    const h = setup();
    h.get('paymentSearchInput').value = 'Orhan';
    const first = h.context.loadPaymentLogs();
    h.get('paymentSearchInput').value = 'Gürhan';
    const second = h.context.loadPaymentLogs();
    assert.equal(h.requests[0].options.signal.aborted, true);
    h.resolve(1, [{ id: 2, beneficiary_name: 'Gürhan', amount: 10, gross_amount: 14 }]);
    await second;
    h.resolve(0, [{ id: 1, beneficiary_name: 'Orhan' }]);
    await first;
    assert.equal(vm.runInContext('allPaymentLogs[0].id', h.context), 2);
    h.context.applyPaymentFilter();
    h.context.applyPaymentFilter();
    assert.equal(h.timers.size, 1);
    assert.equal(h.requests.length, 2);
});

test('next and previous use server cursors, a new filter resets the page', async () => {
    const h = setup();
    let pending = h.context.loadPaymentLogs();
    h.resolve(0, [{ id: 10 }], true, 'cursor-page-2'); await pending;
    h.context.changePaymentPage(1);
    assert.equal(new URL(h.requests[1].url).searchParams.get('cursor'), 'cursor-page-2');
    h.resolve(1, [{ id: 9 }]); await new Promise(setImmediate);
    assert.equal(h.get('paymentNextBtn').disabled, true);
    assert.equal(h.get('paymentPrevBtn').disabled, false);
    h.context.changePaymentPage(-1);
    assert.equal(new URL(h.requests[2].url).searchParams.has('cursor'), false);
    h.resolve(2, [{ id: 10 }], true, 'cursor-page-2'); await new Promise(setImmediate);
    h.context.applyPaymentFilter();
    assert.equal(vm.runInContext('currentPaymentPage', h.context), 1);
    assert.equal(vm.runInContext('paymentCursors.length', h.context), 1);
});

test('short names and reversed dates do not send queries; closing aborts fetch', async () => {
    const h = setup();
    h.get('paymentSearchInput').value = 'Or';
    await h.context.loadPaymentLogs();
    assert.equal(h.requests.length, 0);
    h.get('paymentSearchInput').value = '';
    h.get('paymentFrom').value = '2026-09-15'; h.get('paymentTo').value = '2026-09-01';
    await h.context.loadPaymentLogs();
    assert.equal(h.requests.length, 0);
    h.get('paymentFrom').value = '2026-09-01';
    const pending = h.context.loadPaymentLogs();
    h.context.closePaymentModal();
    assert.equal(h.requests[0].options.signal.aborted, true);
    h.resolve(0, []); await pending;
    assert.equal(h.get('paymentLogsModal').style.display, 'none');
});
