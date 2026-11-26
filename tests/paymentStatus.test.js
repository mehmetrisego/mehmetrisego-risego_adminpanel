const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadUtils() {
    const context = vm.createContext({ console, Date, Intl, Number });
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/admin-utils.js'), 'utf8'), context);
    return context;
}

const NOW = Date.parse('2026-11-26T15:00:00Z');
const minutesAgo = m => new Date(NOW - m * 60000).toISOString();

test('each status maps to the planned group and label', () => {
    const u = loadUtils();
    const info = log => u.getPaymentStatusInfo(log, NOW);
    const cases = [
        [{ status: 'yandex_pending', created_at: minutesAgo(5) }, 'processing', 'Yandex onayı bekleniyor'],
        [{ status: 'yandex_pending', created_at: minutesAgo(31) }, 'delayed', 'Yandex gecikiyor'],
        [{ status: 'bank_starting', created_at: minutesAgo(1) }, 'processing', 'Bankaya gönderiliyor'],
        [{ status: 'pending_bank', created_at: minutesAgo(10) }, 'processing', 'Banka işliyor'],
        [{ status: 'pending_bank', created_at: minutesAgo(200) }, 'delayed', 'Bankada askıda'],
        [{ status: 'bank_unknown', created_at: minutesAgo(5) }, 'processing', 'Banka sonucu kontrol ediliyor'],
        [{ status: 'admin_review', created_at: minutesAgo(15) }, 'action', 'Admin kararı bekleniyor'],
        [{ status: 'admin_processing' }, 'processing', 'Admin kararı uygulanıyor'],
        [{ status: 'admin_resolved' }, 'closed', 'Admin tarafından sonuçlandırıldı'],
        [{ status: 'bank_returned_refund_pending' }, 'action', 'İade başarısız: elle iade et'],
        [{ status: 'error' }, 'action', 'Hata: iade yapılamadı'],
        [{ status: 'yandex_stuck_review' }, 'action', 'Manuel inceleme'],
        [{ status: 'success' }, 'success', 'Başarılı'],
        [{ status: 'bank_returned' }, 'closed', 'Banka iade etti'],
        [{ status: 'refunded' }, 'closed', 'İptal: bakiyeye iade'],
        [{ status: 'yandex_failed' }, 'closed', 'Yandex reddetti'],
        [{ status: 'bank_tr000_error', created_at: minutesAgo(3000) }, 'flagged', 'TR000 hata kodu']
    ];
    for (const [log, group, label] of cases) {
        const result = info(log);
        assert.equal(result.group, group, log.status);
        assert.equal(result.label, label, log.status);
    }
    assert.match(info({ status: 'new_status' }).label, /Bilinmeyen durum \(new_status\)/);
});

test('bank stage age starts when the bank transfer started, not at request time', () => {
    const u = loadUtils();
    // 2 saat önce talep edildi, Yandex geç onayladı, 5 dk önce bankaya gönderildi -> normal akış.
    const log = { status: 'pending_bank', created_at: minutesAgo(125), bank_started_at: minutesAgo(5) };
    const result = u.getPaymentStatusInfo(log, NOW);
    assert.equal(result.group, 'processing');
    assert.equal(result.ageText, '5 dk');
});

test('thresholds from the backend override the defaults', () => {
    const u = loadUtils();
    const log = { status: 'yandex_pending', created_at: minutesAgo(20) };
    assert.equal(u.getPaymentStatusInfo(log, NOW).group, 'processing');
    u.setPaymentThresholds({ yandexDelayMinutes: 15, bankStuckMinutes: 60 });
    assert.equal(u.getPaymentStatusInfo(log, NOW).group, 'delayed');
    u.setPaymentThresholds({ yandexDelayMinutes: 'x' });
    assert.equal(vm.runInContext('PAYMENT_THRESHOLDS.yandexDelayMinutes', u), 15);
});

test('only records waiting for an admin decision open the decision window', () => {
    const u = loadUtils();
    for (const status of ['admin_review', 'bank_tr000_error', 'yandex_stuck_review']) assert.equal(u.needsPaymentDecision({ status }), true, status);
    for (const status of ['admin_resolved', 'admin_processing', 'success', 'pending_bank', 'bank_unknown']) assert.equal(u.needsPaymentDecision({ status }), false, status);
});

test('durations are short and readable', () => {
    const u = loadUtils();
    assert.equal(u.formatWaitDuration(0), '0 dk');
    assert.equal(u.formatWaitDuration(47.9), '47 dk');
    assert.equal(u.formatWaitDuration(192), '3 sa 12 dk');
    assert.equal(u.formatWaitDuration(60 * 26 + 5), '1 gün 2 sa');
});

test('detail text explains the stage and what happens next', () => {
    const u = loadUtils();
    const text = u.getFriendlyStatusLabel({ status: 'bank_returned_refund_pending' });
    assert.match(text, /^İade başarısız: elle iade et\n\n/);
    assert.match(text, /Elle iade gerekli/);
});
