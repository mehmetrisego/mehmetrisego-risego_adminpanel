// ============================================
// RiseGo Admin Panel - JavaScript
// ============================================
// API Base URL: localhost veya Railway backend
const API_BASE = (function () {
    if (typeof window === 'undefined') return 'http://localhost:3000/api';
    const h = window.location.hostname;
    const isLocal = h === 'localhost' || h === '127.0.0.1' || h === '' || window.location.protocol === 'file:';
    if (isLocal) return 'http://localhost:3000/api';
    return 'https://risegobackend-production-8be6.up.railway.app/api';
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

function handleAdminApiResponse(response) {
    if (response.status === 401) {
        setAdminToken(null);
        showLoginScreen();
        return true;
    }
    return false;
}

// ============================================
// Admin Auth - OTP Giriş
// ============================================

async function checkAdminSession() {
    const token = getAdminToken();
    if (!token) return false;
    try {
        const res = await fetch(`${API_BASE}/admin/auth/session`, {
            headers: { 'X-Admin-Token': token }
        });
        const data = await res.json();
        return data.success === true;
    } catch {
        return false;
    }
}

function showLoginScreen() {
    document.getElementById('loginScreen').style.display = 'flex';
    document.getElementById('adminContainer').style.display = 'none';
}

function showDashboard() {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('adminContainer').style.display = 'flex';
}

async function sendAdminOtp() {
    const phoneInput = document.getElementById('loginPhone');
    const phone = phoneInput.value.trim();
    const errorEl = document.getElementById('loginError');
    const btn = document.getElementById('btnSendOtp');
    const btnText = btn.querySelector('.btn-text');
    const btnLoader = btn.querySelector('.btn-loader');

    errorEl.textContent = '';
    if (!phone || phone.replace(/\D/g, '').length < 10) {
        errorEl.textContent = 'Geçerli bir telefon numarası giriniz.';
        return;
    }

    btnText.style.display = 'none';
    btnLoader.style.display = 'flex';
    btn.disabled = true;

    try {
        const res = await fetch(`${API_BASE}/admin/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone })
        });
        const data = await res.json();

        if (data.success) {
            document.getElementById('loginStepPhone').style.display = 'none';
            document.getElementById('loginStepOtp').style.display = 'flex';
            document.getElementById('loginOtp').value = '';
            document.getElementById('loginOtp').focus();
        } else {
            errorEl.textContent = data.message || 'Bir hata oluştu.';
        }
    } catch (err) {
        errorEl.textContent = 'Sunucuya bağlanılamadı. Lütfen tekrar deneyin.';
    } finally {
        btnText.style.display = 'inline';
        btnLoader.style.display = 'none';
        btn.disabled = false;
    }
}

async function verifyAdminOtp() {
    const phone = document.getElementById('loginPhone').value.trim();
    const otpRaw = document.getElementById('loginOtp').value.trim();
    const otp = otpRaw.replace(/\D/g, '');
    const errorEl = document.getElementById('otpError');
    const btn = document.getElementById('btnVerifyOtp');
    const btnText = btn.querySelector('.btn-text');
    const btnLoader = btn.querySelector('.btn-loader');

    errorEl.textContent = '';
    if (!otp || otp.length !== 6) {
        errorEl.textContent = '6 haneli doğrulama kodunu giriniz.';
        return;
    }

    btnText.style.display = 'none';
    btnLoader.style.display = 'flex';
    btn.disabled = true;

    try {
        const res = await fetch(`${API_BASE}/admin/auth/verify-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone, otp: otp })
        });
        const data = await res.json();

        if (data.success && data.adminSessionToken) {
            setAdminToken(data.adminSessionToken);
            showDashboard();
            checkServerStatus();
            loadCampaign();
            loadLeaderboard();
        } else {
            errorEl.textContent = data.message || 'Doğrulama başarısız.';
        }
    } catch (err) {
        errorEl.textContent = 'Sunucuya bağlanılamadı.';
    } finally {
        btnText.style.display = 'inline';
        btnLoader.style.display = 'none';
        btn.disabled = false;
    }
}

function backToPhoneStep() {
    document.getElementById('loginStepOtp').style.display = 'none';
    document.getElementById('loginStepPhone').style.display = 'flex';
    document.getElementById('loginOtp').value = '';
    document.getElementById('otpError').textContent = '';
}

async function adminLogout() {
    const token = getAdminToken();
    if (token) {
        try {
            await fetch(`${API_BASE}/admin/auth/logout`, {
                method: 'POST',
                headers: { 'X-Admin-Token': token }
            });
        } catch (_) {}
        setAdminToken(null);
    }
    showLoginScreen();
    document.getElementById('loginPhone').value = '';
    document.getElementById('loginError').textContent = '';
    backToPhoneStep();
}

// ============================================
// Sayfa Yüklendiğinde Başlat
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
    const isLoggedIn = await checkAdminSession();
    if (isLoggedIn) {
        showDashboard();
        checkServerStatus();
        loadCampaign();
        loadLeaderboard();
    } else {
        showLoginScreen();
        checkServerStatus();
    }

    // Textarea karakter sayacı
    const textarea = document.getElementById('campaignInput');
    if (textarea) {
        textarea.addEventListener('input', () => {
            const count = textarea.value.length;
            document.getElementById('charCount').textContent = count;

            // Onayla butonunu aktif/pasif yap
            const approveBtn = document.getElementById('approveBtn');
            approveBtn.disabled = count === 0;
        });
    }
});

// ============================================
// Sunucu Durumu Kontrolü
// ============================================
async function checkServerStatus() {
    const statusEl = document.getElementById('serverStatus');
    const statusText = statusEl.querySelector('.status-text');

    try {
        const response = await fetch(`${API_BASE}/health`);
        const data = await response.json();

        if (data.status === 'ok') {
            statusEl.classList.add('online');
            statusEl.classList.remove('error');
            statusText.textContent = 'Çevrimiçi';
        } else {
            throw new Error('Server not ok');
        }
    } catch (error) {
        statusEl.classList.add('error');
        statusEl.classList.remove('online');
        statusText.textContent = 'Bağlantı Hatası';
        console.error('[Admin] Sunucu bağlantı hatası:', error.message);
    }
}

// ============================================
// Kampanya Yönetimi
// ============================================

/**
 * Mevcut kampanyayı API'den yükler ve UI'ı günceller
 */
async function loadCampaign() {
    try {
        const response = await fetch(`${API_BASE}/admin/campaign`, {
            headers: getAdminHeaders()
        });
        if (handleAdminApiResponse(response)) return;
        const data = await response.json();

        if (data.success) {
            updateCampaignUI(data.campaign);
        }
    } catch (error) {
        console.error('[Admin] Kampanya yükleme hatası:', error.message);
    }
}

/**
 * Kampanya durumunu UI'da günceller
 * @param {Object} campaign - { text, active, updatedAt }
 */
function updateCampaignUI(campaign) {
    const badge = document.getElementById('campaignBadge');
    const badgeText = document.getElementById('campaignBadgeText');
    const textEl = document.getElementById('currentCampaignText');
    const dateEl = document.getElementById('campaignDate');
    const deleteBtn = document.getElementById('deleteBtn');

    if (campaign.active && campaign.text) {
        // Aktif kampanya var
        badge.classList.remove('inactive');
        badge.classList.add('active');
        badgeText.textContent = 'Aktif Kampanya';
        textEl.textContent = campaign.text;
        deleteBtn.disabled = false;

        if (campaign.updatedAt) {
            const date = new Date(campaign.updatedAt);
            dateEl.textContent = `Son güncelleme: ${formatDate(date)}`;
        }
    } else {
        // Aktif kampanya yok
        badge.classList.remove('active');
        badge.classList.add('inactive');
        badgeText.textContent = 'Aktif Kampanya Yok';
        textEl.textContent = 'Henüz bir kampanya oluşturulmamış.';
        dateEl.textContent = '';
        deleteBtn.disabled = true;
    }
}

/**
 * Kampanyayı kaydeder (Onayla butonu)
 */
async function saveCampaign() {
    const textarea = document.getElementById('campaignInput');
    const text = textarea.value.trim();

    if (!text) return;

    const btn = document.getElementById('approveBtn');
    const btnText = btn.querySelector('.btn-text');
    const btnLoader = btn.querySelector('.btn-loader');

    // Loading state
    btnText.style.display = 'none';
    btnLoader.style.display = 'flex';
    btn.disabled = true;

    try {
        const response = await fetch(`${API_BASE}/admin/campaign`, {
            method: 'POST',
            headers: getAdminHeaders(),
            body: JSON.stringify({ text })
        });
        if (handleAdminApiResponse(response)) return;
        const data = await response.json();

        if (data.success) {
            updateCampaignUI(data.campaign);
            textarea.value = '';
            document.getElementById('charCount').textContent = '0';
            showToast('success', 'Kampanya başarıyla kaydedildi!');
        } else {
            showToast('error', data.message || 'Kampanya kaydedilemedi.');
        }
    } catch (error) {
        showToast('error', 'Sunucuya bağlanılamadı. Lütfen tekrar deneyin.');
        console.error('[Admin] Kampanya kaydetme hatası:', error);
    } finally {
        btnText.style.display = 'inline';
        btnLoader.style.display = 'none';
        // Textarea boş olduğu için buton pasif kalacak
        btn.disabled = textarea.value.trim().length === 0;
    }
}

/**
 * Kampanyayı siler (Sil butonu)
 */
async function deleteCampaign() {
    if (!confirm('Aktif kampanyayı silmek istediğinize emin misiniz?')) return;

    const btn = document.getElementById('deleteBtn');
    const btnText = btn.querySelector('.btn-text');
    const btnLoader = btn.querySelector('.btn-loader');

    // Loading state
    btnText.style.display = 'none';
    btnLoader.style.display = 'flex';
    btn.disabled = true;

    try {
        const response = await fetch(`${API_BASE}/admin/campaign`, {
            method: 'DELETE',
            headers: getAdminHeaders()
        });
        if (handleAdminApiResponse(response)) return;
        const data = await response.json();

        if (data.success) {
            updateCampaignUI({ text: '', active: false, updatedAt: null });
            showToast('success', 'Kampanya başarıyla silindi.');
        } else {
            showToast('error', data.message || 'Kampanya silinemedi.');
            btn.disabled = false;
        }
    } catch (error) {
        showToast('error', 'Sunucuya bağlanılamadı.');
        console.error('[Admin] Kampanya silme hatası:', error);
        btn.disabled = false;
    } finally {
        btnText.style.display = 'inline';
        btnLoader.style.display = 'none';
    }
}

/**
 * Toast bildirim gösterir
 * @param {'success' | 'error'} type
 * @param {string} message
 */
function showToast(type, message) {
    const toast = document.getElementById('campaignToast');
    const toastText = document.getElementById('campaignToastText');

    // Önceki toast'ı temizle
    toast.classList.remove('show', 'success', 'error');

    // Yeni toast ayarla
    toast.classList.add(type, 'show');
    toastText.textContent = message;

    // 4 saniye sonra gizle
    setTimeout(() => {
        toast.style.animation = 'toastOut 0.3s var(--ease) forwards';
        setTimeout(() => {
            toast.classList.remove('show', 'success', 'error');
            toast.style.animation = '';
        }, 300);
    }, 4000);
}

// ============================================
// Leaderboard (10 günlük dönem)
// ============================================

/** Mevcut görüntülenen sıralama: false = mevcut dönem, true = önceki dönem */
let currentLeaderboardView = false;

/**
 * Mevcut görünümü yeniler (Yenile butonu)
 */
function reloadCurrentLeaderboard() {
    loadLeaderboard(currentLeaderboardView);
}

/**
 * Admin leaderboard verisini API'den yükler
 * @param {boolean} [previous=false] - true ise sonlanmış önceki dönem
 * @param {string} [startDate=null] - ISO YYYY-MM-DD
 * @param {string} [endDate=null] - ISO YYYY-MM-DD
 */
async function loadLeaderboard(previous = false, startDate = null, endDate = null) {
    // Sadece previous kullanıldığında mevcut görünümü güncelle
    if (!startDate) {
        currentLeaderboardView = previous;
    }

    const content = document.getElementById('leaderboardContent');
    const periodTitle = document.getElementById('leaderboardPeriod');
    const periodInfo = document.getElementById('periodInfoText');
    const btnCurrent = document.getElementById('btnCurrent');
    const btnPrevious = document.getElementById('btnPrevious');

    if (btnCurrent) btnCurrent.classList.toggle('active', !previous);
    if (btnPrevious) btnPrevious.classList.toggle('active', previous);

    content.innerHTML = `
        <div class="leaderboard-loading">
            <div class="spinner-large"></div>
            <p>Sıralama tablosu yükleniyor...</p>
            <p class="loading-hint">İlk yükleme biraz zaman alabilir</p>
        </div>
    `;

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 120000);

        let url = previous ? `${API_BASE}/admin/leaderboard?previous=1` : `${API_BASE}/admin/leaderboard`;

        // Özel tarih filtresi varsa URL'e parametre olarak ekle (önceki dönem seçeneğini ezer)
        if (startDate && endDate) {
            url = `${API_BASE}/admin/leaderboard?from=${startDate}&to=${endDate}`;
        }

        const response = await fetch(url, {
            headers: getAdminHeaders(),
            signal: controller.signal
        });
        clearTimeout(timeout);
        if (handleAdminApiResponse(response)) return;

        const data = await response.json();

        if (!data.success) {
            content.innerHTML = '<p class="leaderboard-error">Sıralama tablosu yüklenemedi.</p>';
            periodInfo.textContent = 'Veri alınamadı';
            return;
        }

        periodTitle.textContent = data.periodLabel;
        let periodDesc;
        if (startDate && endDate) {
            periodDesc = `${data.periodLabel} tarihleri arası özel filtreleme`;
            // Filtreleme yapıldığında tab butonlarının aktifliğini kaldır
            if (btnCurrent) btnCurrent.classList.remove('active');
            if (btnPrevious) btnPrevious.classList.remove('active');
        } else if (previous) {
            periodDesc = `${data.periodLabel} (sonlanmış kampanya) — en çok yolculuk yapan sürücüler`;
        } else {
            periodDesc = `${data.periodLabel} tarihleri arasında en çok yolculuk yapan sürücüler`;
        }
        periodInfo.textContent = periodDesc;

        renderLeaderboard(data.leaderboard, data.totalOrders, data.totalDrivers);

    } catch (error) {
        console.error('[Admin] Leaderboard hatası:', error);
        const msg = error.name === 'AbortError'
            ? 'İstek zaman aşımına uğradı.'
            : 'Sunucuya bağlanılamadı.';
        content.innerHTML = `<p class="leaderboard-error">${msg}</p>`;
    }
}

/**
 * Filtrele butonuna basıldığında çalışır
 */
function filterLeaderboard() {
    const startInput = document.getElementById('startDate').value;
    const endInput = document.getElementById('endDate').value;

    if (!startInput || !endInput) {
        showToast('error', 'Lütfen hem başlangıç hem de bitiş tarihi seçin.');
        return;
    }

    if (new Date(startInput) > new Date(endInput)) {
        showToast('error', 'Başlangıç tarihi bitiş tarihinden sonra olamaz.');
        return;
    }

    // Seçilen tarih aralığında verileri yükle
    loadLeaderboard(false, startInput, endInput);
}

/**
 * Leaderboard verilerini HTML olarak render eder
 * @param {Array} list - Top 10 sürücü listesi
 * @param {number} totalOrders - Toplam sipariş sayısı
 * @param {number} totalDrivers - Toplam sürücü sayısı
 */
function renderLeaderboard(list, totalOrders, totalDrivers) {
    const content = document.getElementById('leaderboardContent');

    let html = '';

    // İstatistik satırı
    html += `
        <div class="lb-stats">
            <div class="lb-stat">
                <div class="lb-stat-value">${totalOrders.toLocaleString('tr-TR')}</div>
                <div class="lb-stat-label">Toplam Yolculuk</div>
            </div>
            <div class="lb-stat">
                <div class="lb-stat-value">${totalDrivers.toLocaleString('tr-TR')}</div>
                <div class="lb-stat-label">Kayıtlı Sürücü</div>
            </div>
        </div>
    `;

    if (list.length === 0) {
        html += '<p class="lb-empty">Bu dönemde henüz tamamlanmış yolculuk yok.</p>';
        content.innerHTML = html;
        return;
    }

    html += '<div class="lb-list">';

    list.forEach(entry => {
        const rankClass = entry.rank <= 3 ? ` lb-rank-${entry.rank}` : '';
        html += `
            <div class="lb-item">
                <div class="lb-rank${rankClass}">${entry.rank}</div>
                <div class="lb-driver-name">${escapeHtml(entry.fullName)}</div>
                <div class="lb-trip-badge">
                    ${entry.tripCount}
                    <span class="lb-trip-label">yolculuk</span>
                </div>
            </div>
        `;
    });

    html += '</div>';
    content.innerHTML = html;
}

// ============================================
// Yardımcı Fonksiyonlar
// ============================================

/**
 * Tarih formatlar
 * @param {Date} date
 * @returns {string}
 */
function formatDate(date) {
    const months = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
        'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
    const day = date.getDate();
    const month = months[date.getMonth()];
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${day} ${month} ${year}, ${hours}:${minutes}`;
}

/**
 * HTML XSS koruması
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
}
