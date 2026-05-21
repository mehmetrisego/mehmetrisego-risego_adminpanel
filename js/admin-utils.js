// ============================================
// RiseGo Admin Panel - Shared Utilities
// ============================================

// ─── API Config ────────────────────────────────────────────────────────────
const PRODUCTION_API = 'https://api.risegodriver.com/api';
const API_BASE = (function () {
    if (typeof window === 'undefined') return PRODUCTION_API;
    const h = window.location.hostname;
    const isLocalDev = h === 'localhost' || h === '127.0.0.1';
    if (isLocalDev) return `http://${h}:3000/api`;
    return PRODUCTION_API;
})();

const ADMIN_TOKEN_KEY = 'risego_admin_token';

function getAdminToken() {
    return localStorage.getItem(ADMIN_TOKEN_KEY);
}

function setAdminToken(token) {
    if (token) localStorage.setItem(ADMIN_TOKEN_KEY, token);
    else localStorage.removeItem(ADMIN_TOKEN_KEY);
}

function getAdminHeaders() {
    const headers = { 'Content-Type': 'application/json' };
    const token = getAdminToken();
    if (token) headers['X-Admin-Token'] = token;
    return headers;
}

/**
 * Admin API response kontrolü: 401 ise login ekranına yönlendir.
 * @returns {boolean} true ise çağıran fonksiyon return etmeli
 */
function handleAdminApiResponse(response) {
    if (response.status === 401) {
        setAdminToken(null);
        showLoginScreen();
        return true;
    }
    return false;
}

// ─── IBAN Formatting ────────────────────────────────────────────────────────
/**
 * 26 haneli TR IBAN stringini TR XX XXXX XXXX XXXX XXXX XXXX XX formatında döner.
 */
function formatIban(iban) {
    if (!iban) return '';
    const normalized = String(iban).replace(/\s+/g, '').toUpperCase();
    if (normalized.startsWith('TR') && normalized.length === 26) {
        const d = normalized.slice(2);
        return 'TR' + d.substring(0, 2) + ' ' + d.substring(2, 6) + ' ' +
               d.substring(6, 10) + ' ' + d.substring(10, 14) + ' ' +
               d.substring(14, 18) + ' ' + d.substring(18, 22) + ' ' + d.substring(22, 24);
    }
    return normalized;
}

/**
 * Admin IBAN input gerçek zamanlı formatlama.
 */
function formatAdminIbanInput(input) {
    const digits = String(input.value || '').replace(/\D/g, '').slice(0, 24);
    let parts = [];
    if (digits.length > 0)  parts.push(digits.substring(0, 2));
    if (digits.length > 2)  parts.push(digits.substring(2, 6));
    if (digits.length > 6)  parts.push(digits.substring(6, 10));
    if (digits.length > 10) parts.push(digits.substring(10, 14));
    if (digits.length > 14) parts.push(digits.substring(14, 18));
    if (digits.length > 18) parts.push(digits.substring(18, 22));
    if (digits.length > 22) parts.push(digits.substring(22, 24));
    input.value = parts.join(' ');
}

/**
 * Admin IBAN input yapıştırma handler'ı.
 */
function handleAdminIbanPaste(event, input) {
    event.preventDefault();
    const pasted = (event.clipboardData || window.clipboardData).getData('text');
    const digits = pasted.replace(/^TR/i, '').replace(/\D/g, '').slice(0, 24);
    let parts = [];
    if (digits.length > 0)  parts.push(digits.substring(0, 2));
    if (digits.length > 2)  parts.push(digits.substring(2, 6));
    if (digits.length > 6)  parts.push(digits.substring(6, 10));
    if (digits.length > 10) parts.push(digits.substring(10, 14));
    if (digits.length > 14) parts.push(digits.substring(14, 18));
    if (digits.length > 18) parts.push(digits.substring(18, 22));
    if (digits.length > 22) parts.push(digits.substring(22, 24));
    input.value = parts.join(' ');
}

// ─── Date Formatting ────────────────────────────────────────────────────────
/**
 * Tarih formatlar: "21 Mayıs 2026, 15:30"
 */
function formatDate(date) {
    const months = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
                    'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
    const day     = date.getDate();
    const month   = months[date.getMonth()];
    const year    = date.getFullYear();
    const hours   = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${day} ${month} ${year}, ${hours}:${minutes}`;
}

// ─── XSS Escape ─────────────────────────────────────────────────────────────
/**
 * HTML XSS koruması
 */
function escapeHtml(str) {
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
}

// ─── Toast ─────────────────────────────────────────────────────────────────
/**
 * Global toast bildirimi gösterir.
 */
function showToast(type, message) {
    const toast     = document.getElementById('campaignToast');
    const toastText = document.getElementById('campaignToastText');
    if (!toast || !toastText) return;
    toast.classList.remove('show', 'success', 'error');
    toast.classList.add(type, 'show');
    toastText.textContent = message;
    setTimeout(() => {
        toast.style.animation = 'toastOut 0.3s ease forwards';
        setTimeout(() => { toast.classList.remove('show', 'success', 'error'); toast.style.animation = ''; }, 300);
    }, 3500);
}

// ─── Bank Status Labels ─────────────────────────────────────────────────────
const BANK_STATUS_LABEL = {
    'TR000':  'Sistem kuyruğuna alındı',
    'TR001':  'Onay bekliyor',
    'TR001A': 'Güvenlik kontrolünde',
    'TR001E': 'Rezerve edildi',
    'TR002A': 'Merkez onayında',
    'TR004':  'Onaylandı, iletilecek',
    'TR005C': 'İptal edildi',
    'TR006':  'Reddedildi, iade bekleniyor',
    'TR007':  'Reddedildi, iade yapıldı',
    'TR008':  'Askıya alındı',
    'TR010':  'Başarıyla tamamlandı',
    'TR011':  'Başarılı (ödeme yapıldı)',
    'TR012':  'Başarılı (kuruma iletildi)',
    'TR013':  'Ön provizyon',
    'TR003R': 'İade tamamlandı',
    'PA010':  'Ödeme tamamlandı',
    'PA012':  'Ödeme kuruma yapıldı',
};

const RETURN_REASON_LABEL = {
    '01': 'Alıcı hesabı kapalı',
    '02': 'Alıcı hesap numarası hatalı veya bulunamadı',
    '03': 'Hesap türü uyumsuz',
    '04': 'İşlem limiti aşıldı',
    '05': 'Alıcı tarafından reddedildi',
    '06': 'IBAN format hatası',
    '07': 'Banka şubesi bulunamadı',
    '08': 'İşlem zaman aşımına uğradı',
    '09': 'Banka sistem hatası',
    '10': 'Alıcı hesabı para almaya kapalı',
    '11': 'Alıcı adı ve IBAN bilgisi uyuşmuyor',
    '12': 'IBAN geçersiz veya hatalı',
    '13': 'Alıcı hesabı bloke',
    '14': 'Yetersiz hesap bilgisi',
    '15': 'İşlem tutarı geçersiz',
};

function getBankStatusLabel(code)    { return BANK_STATUS_LABEL[code] || null; }
function getReturnReasonLabel(code)  { return RETURN_REASON_LABEL[String(code)] || null; }

function getFriendlyStatusLabel(record) {
    if (!record) return 'Bilinmiyor';
    const s = record.status;
    if (s === 'success')      return '✅ Başarılı — Para hesaba aktarıldı';
    if (s === 'pending_bank') {
        const lbl = getBankStatusLabel(record.bank_status_code);
        return lbl ? `⏳ Banka işliyor — ${lbl}` : '⏳ Banka onayı bekleniyor';
    }
    if (s === 'bank_returned') {
        const reason = getReturnReasonLabel(record.return_reason_code);
        return reason ? `❌ İade edildi — ${reason}` : '❌ Banka tarafından iade edildi';
    }
    if (s === 'error')    return '❌ Sistem hatası — İşlem yapılamadı';
    if (s === 'refunded') return '🔄 İade edildi';
    return 'Bilinmiyor';
}
