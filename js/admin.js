// ============================================
// RiseGo Admin Panel - JavaScript
// ============================================
// API: yerelde localhost; üretimde AWS Lightsail.
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
    if (!token) return { success: false };
    try {
        const res = await fetch(`${API_BASE}/admin/auth/session`, {
            headers: { 'X-Admin-Token': token }
        });
        const data = await res.json();
        return data;
    } catch {
        return { success: false };
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

// ============================================
// UPT Kurumsal Cüzdan Bakiyesi
// ============================================

let _uptBalanceInterval = null;
let _lastUptBalanceRaw  = null; // Header widget için son baki ye

async function loadUptBalance() {
    const textEl = document.getElementById('uptBalanceText');
    if (!textEl) return;
    textEl.textContent = '...';
    try {
        const res  = await fetch(`${API_BASE}/admin/upt-balance`, { headers: getAdminHeaders() });
        if (handleAdminApiResponse(res)) return;
        const data = await res.json();
        if (data.success && data.tryBalanceRaw != null) {
            _lastUptBalanceRaw = data.tryBalanceRaw;
            textEl.textContent = `${data.tryBalanceRaw} TL`;
            // Modal açıksa özet güncel bakiyeyi güncelle
            const summaryEl = document.getElementById('uptSummaryBalance');
            if (summaryEl) summaryEl.textContent = `${data.tryBalanceRaw} TL`;
        } else {
            textEl.textContent = data.error ? 'Hata' : '-';
        }
    } catch (e) {
        console.error('[Admin] UPT bakiye hatası:', e.message);
        if (textEl) textEl.textContent = 'Bağlanamadı';
    }
}

function startUptBalancePolling() {
    loadUptBalance();
    if (_uptBalanceInterval) clearInterval(_uptBalanceInterval);
    _uptBalanceInterval = setInterval(loadUptBalance, 60 * 1000); // 60sn
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
            startUptBalancePolling();
            loadKillswitchStatus();
            checkServerStatus();
            await loadAdminParks();
            loadCampaign();
            loadLeaderboard();

            // Başarılı girişten hemen sonra session check tetikleyip sürücü sayısını alalım
            checkAdminSession().then(sessionData => {
                if (sessionData && sessionData.activeDriverSessions !== undefined) {
                    document.getElementById('activeSessionsCount').textContent = sessionData.activeDriverSessions;
                }
            });

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
        } catch (_) { }
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
    const sessionData = await checkAdminSession();
    if (sessionData && sessionData.success) {
        showDashboard();
        startUptBalancePolling();
        loadKillswitchStatus();
        checkServerStatus();
        await loadAdminParks();
        loadCampaign();
        loadLeaderboard();
        if (sessionData.activeDriverSessions !== undefined) {
            document.getElementById('activeSessionsCount').textContent = sessionData.activeDriverSessions;
        }
    } else {
        showLoginScreen();
        checkServerStatus();
    }

    const citySelect = document.getElementById('leaderboardCity');
    if (citySelect) {
        citySelect.addEventListener('change', () => {
            const range = getLeaderboardDateRangeOrNull();
            if (range) loadLeaderboard(false, range.from, range.to);
            else loadLeaderboard(currentLeaderboardView);
        });
    }

    const campaignCity = document.getElementById('campaignCity');
    if (campaignCity) {
        campaignCity.addEventListener('change', () => loadCampaign());
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

function getCampaignParkQuery() {
    const sel = document.getElementById('campaignCity');
    if (!sel || !sel.value) return '';
    return `?parkPartnerId=${encodeURIComponent(sel.value)}`;
}

function getSelectedCampaignCityLabel() {
    const sel = document.getElementById('campaignCity');
    if (!sel || sel.selectedIndex < 0) return '';
    return sel.options[sel.selectedIndex].textContent.trim();
}

/**
 * Mevcut kampanyayı API'den yükler ve UI'ı günceller (seçili şehir)
 */
async function loadCampaign() {
    try {
        const response = await fetch(`${API_BASE}/admin/campaign${getCampaignParkQuery()}`, {
            headers: getAdminHeaders()
        });
        if (handleAdminApiResponse(response)) return;
        const data = await response.json();

        if (data.success) {
            updateCampaignUI(data.campaign);
        }
        const textarea = document.getElementById('campaignInput');
        if (textarea) {
            textarea.value = '';
            document.getElementById('charCount').textContent = '0';
            document.getElementById('approveBtn').disabled = true;
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
        const parkPartnerId = document.getElementById('campaignCity')?.value || '';
        const response = await fetch(`${API_BASE}/admin/campaign`, {
            method: 'POST',
            headers: getAdminHeaders(),
            body: JSON.stringify({ text, parkPartnerId })
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
    const cityLabel = getSelectedCampaignCityLabel();
    const msg = cityLabel
        ? `"${cityLabel}" şehri için aktif kampanyayı silmek istediğinize emin misiniz?`
        : 'Aktif kampanyayı silmek istediğinize emin misiniz?';
    if (!confirm(msg)) return;

    const btn = document.getElementById('deleteBtn');
    const btnText = btn.querySelector('.btn-text');
    const btnLoader = btn.querySelector('.btn-loader');

    // Loading state
    btnText.style.display = 'none';
    btnLoader.style.display = 'flex';
    btn.disabled = true;

    try {
        const parkPartnerId = document.getElementById('campaignCity')?.value || '';
        const delQ = parkPartnerId ? `?parkPartnerId=${encodeURIComponent(parkPartnerId)}` : '';
        const response = await fetch(`${API_BASE}/admin/campaign${delQ}`, {
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
// Leaderboard
// ============================================

/**
 * Tarih alanlarında ikisi de doluysa özel aralık; yoksa null (mevcut/önceki sekme mantığı)
 */
function getLeaderboardDateRangeOrNull() {
    const startInput = document.getElementById('startDate');
    const endInput = document.getElementById('endDate');
    if (!startInput || !endInput) return null;
    const s = startInput.value;
    const e = endInput.value;
    if (s && e) return { from: s, to: e };
    return null;
}

function getLeaderboardParkQuery() {
    const sel = document.getElementById('leaderboardCity');
    if (!sel || !sel.value) return '';
    return `&parkPartnerId=${encodeURIComponent(sel.value)}`;
}

function fillParkSelectFromData(selectId, parks, prevValue) {
    const sel = document.getElementById(selectId);
    if (!sel) return;
    sel.innerHTML = '';
    parks.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.partnerId;
        opt.textContent = p.label;
        sel.appendChild(opt);
    });
    if (prevValue && [...sel.options].some(o => o.value === prevValue)) sel.value = prevValue;
    else if (sel.options.length) sel.selectedIndex = 0;
}

function fillParkSelectError(selectId) {
    const sel = document.getElementById(selectId);
    if (!sel) return;
    sel.innerHTML = '<option value="">Park listesi alınamadı</option>';
}

/**
 * Yandex park listesini yükler (sıralama + kampanya şehir seçimi)
 */
async function loadAdminParks() {
    const prevLb = document.getElementById('leaderboardCity')?.value;
    const prevCamp = document.getElementById('campaignCity')?.value;
    try {
        const res = await fetch(`${API_BASE}/admin/parks`, { headers: getAdminHeaders() });
        if (handleAdminApiResponse(res)) return;
        const data = await res.json();
        if (!data.success || !Array.isArray(data.parks)) {
            fillParkSelectError('leaderboardCity');
            fillParkSelectError('campaignCity');
            return;
        }
        fillParkSelectFromData('leaderboardCity', data.parks, prevLb);
        fillParkSelectFromData('campaignCity', data.parks, prevCamp);
    } catch (e) {
        console.error('[Admin] Park listesi:', e);
        const err = '<option value="">Park listesi yüklenemedi</option>';
        const lb = document.getElementById('leaderboardCity');
        const cc = document.getElementById('campaignCity');
        if (lb) lb.innerHTML = err;
        if (cc) cc.innerHTML = err;
    }
}

let currentLeaderboardView = false;
let currentLeaderboardPage = 1;
const LEADERBOARD_PAGE_SIZE = 20;
let currentLeaderboardData = [];
let currentTotalOrders = 0;
let currentTotalDrivers = 0;

/** Mevcut görünümü yeniler (tarih alanları doluysa önceki özel aralığı korur) */
function reloadCurrentLeaderboard() {
    const range = getLeaderboardDateRangeOrNull();
    if (range) loadLeaderboard(false, range.from, range.to);
    else loadLeaderboard(currentLeaderboardView);
}

/**
 * Admin leaderboard verisini API'den yükler
 * @param {boolean} [previous=false] - true ise sonlanmış önceki dönem
 * @param {string} [startDate=null] - ISO YYYY-MM-DD
 * @param {string} [endDate=null] - ISO YYYY-MM-DD
 */
async function loadLeaderboard(previous = false, startDate = null, endDate = null) {
    if (!startDate) {
        currentLeaderboardView = previous;
    }

    const content     = document.getElementById('leaderboardContent');
    const periodTitle = document.getElementById('leaderboardPeriod');
    const periodInfo  = document.getElementById('periodInfoText');
    const btnCurrent  = document.getElementById('btnCurrent');
    const btnPrevious = document.getElementById('btnPrevious');

    if (btnCurrent)  btnCurrent.classList.toggle('active', !previous && !startDate);
    if (btnPrevious) btnPrevious.classList.toggle('active', previous && !startDate);

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

        let url;
        const parkQ = getLeaderboardParkQuery();
        if (startDate && endDate) {
            url = `${API_BASE}/admin/leaderboard?from=${startDate}&to=${endDate}${parkQ}`;
            if (btnCurrent)  btnCurrent.classList.remove('active');
            if (btnPrevious) btnPrevious.classList.remove('active');
        } else if (previous) {
            const { from: pFrom, to: pTo } = getPreviousPeriodDates();
            url = `${API_BASE}/admin/leaderboard?from=${pFrom}&to=${pTo}${parkQ}`;
        } else {
            const today = getTodayStr();
            url = `${API_BASE}/admin/leaderboard?from=${today}&to=${today}${parkQ}`;
        }

        const response = await fetch(url, { headers: getAdminHeaders(), signal: controller.signal });
        clearTimeout(timeout);
        if (handleAdminApiResponse(response)) return;

        const data = await response.json();

        if (!data.success) {
            content.innerHTML = '<p class="leaderboard-error">Sıralama tablosu yüklenemedi.</p>';
            if (periodInfo) periodInfo.textContent = 'Veri alınamadı';
            return;
        }

        if (periodTitle) periodTitle.textContent = data.periodLabel;

        let periodDesc;
        const citySel = document.getElementById('leaderboardCity');
        const cityLabel = citySel && citySel.options[citySel.selectedIndex]
            ? citySel.options[citySel.selectedIndex].textContent.trim()
            : '';
        const cityPrefix = cityLabel ? `Şehir: ${cityLabel} · ` : '';

        if (startDate && endDate) {
            periodDesc = `${cityPrefix}${data.periodLabel} tarihleri arası özel filtreleme`;
        } else if (previous) {
            periodDesc = `${cityPrefix}${data.periodLabel} (önceki dönem) — en çok yolculuk yapan sürücüler`;
        } else {
            periodDesc = `${cityPrefix}${data.periodLabel} tarihleri arasında en çok yolculuk yapan sürücüler`;
        }
        if (data.syncedAt) {
            const syncDate = new Date(data.syncedAt);
            periodDesc += ` · Son güncelleme: ${formatDate(syncDate)}`;
        }
        if (periodInfo) periodInfo.textContent = periodDesc;

        currentLeaderboardData = data.leaderboard || [];
        currentTotalOrders     = data.totalOrders  || 0;
        currentTotalDrivers    = data.totalDrivers || 0;
        currentLeaderboardPage = 1;

        renderLeaderboard();

    } catch (error) {
        console.error('[Admin] Leaderboard hatası:', error);
        const msg = error.name === 'AbortError' ? 'İstek zaman aşımına uğradı.' : 'Sunucuya bağlanılamadı.';
        content.innerHTML = `<p class="leaderboard-error">${msg}</p>`;
    }
}

/** Bugünün tarihini YYYY-MM-DD formatında döner */
function getTodayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Önceki 10 günlük dönem tarihlerini hesaplar */
function getPreviousPeriodDates() {
    const now   = new Date();
    const day   = now.getDate();
    const year  = now.getFullYear();
    const month = now.getMonth();
    let fromDate, toDate;
    if (day <= 10) {
        fromDate = new Date(year, month - 1, 21);
        toDate   = new Date(year, month, 0, 23, 59, 59);
    } else if (day <= 20) {
        fromDate = new Date(year, month, 1);
        toDate   = new Date(year, month, 10, 23, 59, 59);
    } else {
        fromDate = new Date(year, month, 11);
        toDate   = new Date(year, month, 20, 23, 59, 59);
    }
    const fmt = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    return { from: fmt(fromDate), to: fmt(toDate) };
}

/**
 * Filtrele butonuna basıldığında çalışır
 */
function filterLeaderboard() {
    const startInput = document.getElementById('startDate').value;
    const endInput   = document.getElementById('endDate').value;

    if (!startInput || !endInput) {
        showToast('error', 'Lütfen hem başlangıç hem de bitiş tarihi seçin.');
        return;
    }
    if (new Date(startInput) > new Date(endInput)) {
        showToast('error', 'Başlangıç tarihi bitiş tarihinden sonra olamaz.');
        return;
    }
    loadLeaderboard(false, startInput, endInput);
}

function renderLeaderboard() {
    const content = document.getElementById('leaderboardContent');

    const totalPages = Math.ceil(currentLeaderboardData.length / LEADERBOARD_PAGE_SIZE) || 1;

    let html = '';

    // İstatistik satırı
    html += `
        <div class="lb-stats">
            <div class="lb-stat">
                <div class="lb-stat-value">${currentTotalOrders.toLocaleString('tr-TR')}</div>
                <div class="lb-stat-label">Toplam Yolculuk</div>
            </div>
            <div class="lb-stat">
                <div class="lb-stat-value">${currentTotalDrivers.toLocaleString('tr-TR')}</div>
                <div class="lb-stat-label">Kayıtlı Sürücü</div>
            </div>
        </div>
    `;

    if (currentLeaderboardData.length === 0) {
        html += '<p class="lb-empty">Bu dönemde henüz tamamlanmış yolculuk yok.</p>';
        content.innerHTML = html;
        return;
    }

    html += '<div class="lb-list">';

    const startIndex = (currentLeaderboardPage - 1) * LEADERBOARD_PAGE_SIZE;
    const endIndex = startIndex + LEADERBOARD_PAGE_SIZE;
    const pageData = currentLeaderboardData.slice(startIndex, endIndex);

    pageData.forEach(entry => {
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

    // Sayfalandırma Kontrolleri
    if (totalPages > 1) {
        html += `
            <div class="lb-pagination" style="display: flex; justify-content: center; gap: 10px; margin-top: 20px;">
                <button class="btn" style="padding: 5px 15px; font-size: 14px;" onclick="changeLeaderboardPage(-1)" ${currentLeaderboardPage === 1 ? 'disabled' : ''}>Önceki</button>
                <div style="display: flex; align-items: center; font-weight: bold;">Sayfa ${currentLeaderboardPage} / ${totalPages}</div>
                <button class="btn" style="padding: 5px 15px; font-size: 14px;" onclick="changeLeaderboardPage(1)" ${currentLeaderboardPage === totalPages ? 'disabled' : ''}>Sonraki</button>
            </div>
        `;
    }

    content.innerHTML = html;
}

function changeLeaderboardPage(delta) {
    const totalPages = Math.ceil(currentLeaderboardData.length / LEADERBOARD_PAGE_SIZE) || 1;
    let newPage = currentLeaderboardPage + delta;
    if (newPage < 1) newPage = 1;
    if (newPage > totalPages) newPage = totalPages;

    if (newPage !== currentLeaderboardPage) {
        currentLeaderboardPage = newPage;
        renderLeaderboard();
    }
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

// ============================================
// Çekim Talepleri (Payment Logs) Yönetimi
// ============================================

let allPaymentLogs = [];
let filteredPaymentLogs = [];
let currentPaymentPage = 1;
const PAYMENT_ITEMS_PER_PAGE = 30;

// ─── Durum Kodu → Türkçe Açıklama Haritası ───────────────────────────────────────
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

// ─── İade Neden Kodu → Türkçe Açıklama Haritası ──────────────────────────────
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

function getBankStatusLabel(code) {
    return BANK_STATUS_LABEL[code] || null;
}

function getReturnReasonLabel(code) {
    return RETURN_REASON_LABEL[String(code)] || null;
}

function getFriendlyStatusLabel(record) {
    if (!record) return 'Bilinmiyor';
    const s = record.status;
    if (s === 'success')       return '✅ Başarılı — Para hesaba aktarıldı';
    if (s === 'pending_bank')  {
        const lbl = getBankStatusLabel(record.bank_status_code);
        return lbl ? `⏳ Banka işliyor — ${lbl}` : '⏳ Banka onayı bekleniyor';
    }
    if (s === 'bank_returned') {
        const reason = getReturnReasonLabel(record.return_reason_code);
        return reason ? `❌ İade edildi — ${reason}` : '❌ Banka tarafından iade edildi';
    }
    if (s === 'error')         return '❌ Sistem hatası — İşlem yapılamadı';
    if (s === 'refunded')      return '🔄 İade edildi';
    return 'Bilinmiyor';
}

async function loadPaymentLogs() {
    const tableBody = document.getElementById('paymentTableBody');
    const emptyEl = document.getElementById('paymentEmpty');
    const tableContainer = document.querySelector('#paymentLogsModal .table-container');
    const paginationEl = document.getElementById('paymentPagination');
    if (!tableBody) return;

    tableBody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:20px;">Yükleniyor...</td></tr>';
    if (paginationEl) paginationEl.style.display = 'none';

    // Toplam bakiyeyi asenkron olarak çek
    fetchTotalDriversBalance();

    try {
        const res = await fetch(`${API_BASE}/admin/payment-logs`, { headers: getAdminHeaders() });
        if (handleAdminApiResponse(res)) return;
        const data = await res.json();

        if (data.success) {
            allPaymentLogs = data.logs || [];

            // Bekleyen işlem uyarısı
            const pendingCount = allPaymentLogs.filter(l => l.status === 'pending_bank').length;
            const pendingWarningEl = document.getElementById('paymentPendingWarning');
            if (pendingWarningEl) {
                if (pendingCount > 0) {
                    pendingWarningEl.textContent = `⚠️ ${pendingCount} işlem banka onayı bekleniyor (pending_bank). Sistem otomatik kontrol ediyor.`;
                    pendingWarningEl.style.display = 'block';
                } else {
                    pendingWarningEl.style.display = 'none';
                }
            }

            applyPaymentFilter();
            
            // Arama kutusuna listener ekle (zaten yoksa)
            const searchInput = document.getElementById('paymentSearchInput');
            if (searchInput && !searchInput.hasAttribute('data-listener-added')) {
                searchInput.addEventListener('input', applyPaymentFilter);
                searchInput.setAttribute('data-listener-added', 'true');
            }
        } else {
            allPaymentLogs = [];
            applyPaymentFilter();
        }
    } catch (err) {
        console.error('[Admin] Ödeme kayıtları yüklenemedi:', err);
        tableBody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:var(--error); padding:20px;">Veriler yüklenirken hata oluştu:<br/><small>${err.message}</small></td></tr>`;
    }
}

async function fetchTotalDriversBalance() {
    const balEl = document.getElementById('totalDriversBalance');
    if (!balEl) return;
    balEl.textContent = 'Hesaplanıyor...';
    try {
        const res = await fetch(`${API_BASE}/admin/drivers/total-balance`, { headers: getAdminHeaders() });
        const data = await res.json();
        if (data.success) {
            const formatted = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(data.totalBalance || 0);
            balEl.textContent = formatted + ' ₺';
        } else {
            balEl.textContent = 'Hata';
        }
    } catch (err) {
        balEl.textContent = 'Hata';
    }
}

function applyPaymentFilter() {
    const searchVal = (document.getElementById('paymentSearchInput')?.value || '').toLowerCase().trim();
    
    if (!searchVal) {
        filteredPaymentLogs = [...allPaymentLogs];
    } else {
        filteredPaymentLogs = allPaymentLogs.filter(log => {
            const name = (log.beneficiary_name || '').toLowerCase();
            const id = (log.driver_id || '').toLowerCase();
            const ref = (log.tu_ref_number || '').toLowerCase();
            return name.includes(searchVal) || id.includes(searchVal) || ref.includes(searchVal);
        });
    }
    
    currentPaymentPage = 1;
    renderPaymentPage();
}

function renderPaymentPage() {
    const tableBody = document.getElementById('paymentTableBody');
    const emptyEl = document.getElementById('paymentEmpty');
    const tableContainer = document.querySelector('#paymentLogsModal .table-container');
    const paginationEl = document.getElementById('paymentPagination');
    
    tableBody.innerHTML = '';
    
    if (filteredPaymentLogs.length === 0) {
        emptyEl.style.display = 'block';
        if (tableContainer) tableContainer.style.display = 'none';
        if (paginationEl) paginationEl.style.display = 'none';
        return;
    }
    
    emptyEl.style.display = 'none';
    if (tableContainer) tableContainer.style.display = 'block';
    if (paginationEl) paginationEl.style.display = 'flex';
    
    const totalPages = Math.ceil(filteredPaymentLogs.length / PAYMENT_ITEMS_PER_PAGE) || 1;
    if (currentPaymentPage > totalPages) currentPaymentPage = totalPages;
    if (currentPaymentPage < 1) currentPaymentPage = 1;
    
    const startIndex = (currentPaymentPage - 1) * PAYMENT_ITEMS_PER_PAGE;
    const endIndex = Math.min(startIndex + PAYMENT_ITEMS_PER_PAGE, filteredPaymentLogs.length);
    const pageLogs = filteredPaymentLogs.slice(startIndex, endIndex);
    
    pageLogs.forEach(log => {
        const tr = document.createElement('tr');
        let statusClass = 'pending';
        let statusText = 'Bekliyor';
        let isClickable = false;
        
        if (log.status === 'success')       { statusClass = 'success';       statusText = 'Başarılı'; }
        else if (log.status === 'pending_bank') { statusClass = 'pending';   statusText = '⏳ Banka Onayı'; isClickable = true; }
        else if (log.status === 'bank_returned') { statusClass = 'refunded'; statusText = '❌ İade Edildi'; isClickable = true; }
        else if (log.status === 'error')    { statusClass = 'error';         statusText = 'Hatalı'; isClickable = true; }
        else if (log.status === 'refunded') { statusClass = 'refunded';      statusText = 'İade Edildi'; }

        const amountFormatted = parseFloat(log.amount || 0).toFixed(2).replace('.', ',') + ' ₺';
        const grossFormatted = parseFloat(log.gross_amount || 0).toFixed(2).replace('.', ',') + ' ₺';
        const dateFormatted = formatDate(new Date(log.created_at));
        
        // Türkçe banka durumu açıklaması
        const bankStatusLabel = getBankStatusLabel(log.bank_status_code);
        const bankCodeHtml = bankStatusLabel
            ? `<div style="font-size:9px; color:var(--text-muted); margin-top:2px;">${bankStatusLabel}</div>`
            : '';
        
        // Türkçe iade nedeni açıklaması
        const returnReasonLabel = getReturnReasonLabel(log.return_reason_code);
        const returnReasonHtml = returnReasonLabel
            ? `<div style="font-size:9px; color:#f59e0b; margin-top:2px;">${returnReasonLabel}</div>`
            : '';

        // Hata/İade detayını tıklanabilir yap
        const errorDetail = (log.error_message || returnReasonLabel)
            ? `onclick="showPaymentDetail(${log.id})" style="cursor:pointer;"`
            : '';

        tr.innerHTML = `
            <td style="position: relative; padding-right: 32px;">
                <div style="font-weight: 600; color: var(--text);">${escapeHtml(log.beneficiary_name || 'Bilinmiyor')}</div>
                <div style="font-size: 10px; color: var(--text-muted);">ID: ${log.driver_id}</div>
                <button onclick="openAdminBankAccountsModal('${log.driver_id}', '${escapeHtml(log.beneficiary_name || 'Sürücü')}')" style="position: absolute; right: 8px; top: 50%; transform: translateY(-50%); background:none; border:none; color:var(--gold); cursor:pointer; padding:4px; display:flex;" title="Banka Bilgilerini Düzenle">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                </button>
            </td>
            <td style="font-family: monospace; font-size: 11px;">${escapeHtml(log.beneficiary_iban || '-')}</td>
            <td style="font-family: monospace; font-size: 11px; color: var(--text-muted);">${escapeHtml(log.tu_ref_number || '-')}</td>
            <td style="font-weight: 700; color: var(--success);">${amountFormatted}</td>
            <td style="color: var(--text-muted); font-size: 11px;">${grossFormatted}</td>
            <td>
                <span class="status-pill ${statusClass}" ${errorDetail} title="Detay için tıklayın">
                    ${statusText}
                </span>
            </td>
            <td style="color: var(--text-secondary); font-size: 11px;">${dateFormatted}</td>
        `;
        tableBody.appendChild(tr);
    });
    
    const pageInfo = document.getElementById('paymentPageInfo');
    if (pageInfo) {
        pageInfo.textContent = `Toplam ${filteredPaymentLogs.length} işlemden ${startIndex + 1}-${endIndex} arası gösteriliyor (Sayfa ${currentPaymentPage} / ${totalPages})`;
    }
    
    const prevBtn = document.getElementById('paymentPrevBtn');
    const nextBtn = document.getElementById('paymentNextBtn');
    if (prevBtn) prevBtn.disabled = currentPaymentPage <= 1;
    if (nextBtn) nextBtn.disabled = currentPaymentPage >= totalPages;
}

function changePaymentPage(delta) {
    const totalPages = Math.ceil(filteredPaymentLogs.length / PAYMENT_ITEMS_PER_PAGE) || 1;
    currentPaymentPage += delta;
    if (currentPaymentPage < 1) currentPaymentPage = 1;
    if (currentPaymentPage > totalPages) currentPaymentPage = totalPages;
    renderPaymentPage();
}

function openPaymentModal() {
    const modal = document.getElementById('paymentLogsModal');
    if (modal) {
        modal.style.display = 'flex';
        loadPaymentLogs();
    }
}

function closePaymentModal() {
    const modal = document.getElementById('paymentLogsModal');
    if (modal) modal.style.display = 'none';
}

function showErrorModal(message) {
    const modal = document.getElementById('errorDetailModal');
    const textEl = document.getElementById('errorDetailText');
    if (!modal || !textEl) return;
    textEl.textContent = message;
    modal.style.display = 'flex';
}

/**
 * İşlem detayını Türkçe olarak gösterir.
 * Teknik kod yerine anlaşılır açıklama görüntülenir.
 */
function showPaymentDetail(logId) {
    const log = allPaymentLogs.find(l => l.id === logId);
    if (!log) return;
    const modal = document.getElementById('errorDetailModal');
    const textEl = document.getElementById('errorDetailText');
    if (!modal || !textEl) return;

    const statusLabel = getFriendlyStatusLabel(log);
    const returnReason = getReturnReasonLabel(log.return_reason_code);
    const bankStatus = getBankStatusLabel(log.bank_status_code);

    let detail = statusLabel;
    if (returnReason && log.status === 'bank_returned') {
        detail += `\n\nIade Nedeni: ${returnReason}`;
    }
    if (bankStatus && log.bank_status_code && !returnReason) {
        detail += `\n\nBanka Durumu: ${bankStatus}`;
    }
    if (log.yandex_refund_at) {
        detail += `\n\n🔄 Yandex bakiyeniz iade edildi.`;
    }
    textEl.textContent = detail;
    modal.style.display = 'flex';
}


function closeErrorModal() {
    const modal = document.getElementById('errorDetailModal');
    if (modal) modal.style.display = 'none';
}

// ============================================
// KILLSWITCH MANTIĞI
// ============================================

let currentKillswitchState = false;

async function loadKillswitchStatus() {
    try {
        const res = await fetch(`${API_BASE}/admin/killswitch`, { headers: getAdminHeaders() });
        if (res.status === 401 || res.status === 403) return;
        const data = await res.json();
        if (data.success) {
            updateKillswitchUI(data.active);
        }
    } catch (e) {
        console.error('[Admin] Killswitch durumu okunamadı:', e.message);
    }
}

async function toggleKillswitch() {
    const newState = !currentKillswitchState;
    const confirmMsg = newState 
        ? "DİKKAT: Para çekme işlemlerini ASKIYA ALMAK (Durdurmak) istediğinize emin misiniz?" 
        : "Para çekme işlemlerini tekrar AKTİF ETMEK istediğinize emin misiniz?";
        
    if (!confirm(confirmMsg)) return;

    try {
        const res = await fetch(`${API_BASE}/admin/killswitch`, {
            method: 'POST',
            headers: getAdminHeaders(),
            body: JSON.stringify({ active: newState })
        });
        
        if (handleAdminApiResponse(res)) return;
        
        const data = await res.json();
        if (data.success) {
            updateKillswitchUI(data.active);
            alert(data.message);
        } else {
            alert('Hata: ' + data.message);
        }
    } catch (e) {
        console.error('[Admin] Killswitch değiştirilemedi:', e.message);
        alert('Bağlantı hatası.');
    }
}

function updateKillswitchUI(isActive) {
    currentKillswitchState = isActive;
    const btn = document.getElementById('killswitchBtn');
    const text = document.getElementById('killswitchStatusText');
    if (!btn || !text) return;

    if (isActive) {
        // ASKIYA ALINDI (Kırmızı)
        btn.style.background = 'rgba(239, 68, 68, 0.1)';
        btn.style.border = '1px solid rgba(239, 68, 68, 0.2)';
        btn.style.color = '#ef4444';
        text.textContent = 'Durduruldu';
    } else {
        // AKTİF (Yeşil)
        btn.style.background = 'rgba(34, 197, 94, 0.1)';
        btn.style.border = '1px solid rgba(34, 197, 94, 0.2)';
        btn.style.color = '#22c55e';
        text.textContent = 'Açık';
    }
}

// ============================================
// Sürücü Banka Hesapları Yönetimi (Admin CRUD)
// ============================================

let currentAdminDriverId = '';
let currentAdminDriverName = '';
let adminDriverBankAccounts = [];

function openAdminBankAccountsModal(driverId, driverName) {
    currentAdminDriverId = driverId;
    currentAdminDriverName = driverName;
    
    const modal = document.getElementById('adminBankAccountsModal');
    const infoEl = document.getElementById('adminBankAccountDriverInfo');
    
    if (!modal || !infoEl) return;
    
    infoEl.textContent = `Sürücü: ${driverName} (ID: ${driverId})`;
    resetAdminBankAccountForm();
    modal.style.display = 'flex';
    
    loadAdminBankAccounts(driverId);
}

function closeAdminBankAccountsModal() {
    const modal = document.getElementById('adminBankAccountsModal');
    if (modal) modal.style.display = 'none';
}

async function loadAdminBankAccounts(driverId) {
    const listEl = document.getElementById('adminBankAccountsList');
    if (!listEl) return;
    
    listEl.innerHTML = '<div style="text-align:center; padding:10px; color:var(--text-secondary);">Yükleniyor...</div>';
    
    try {
        const res = await fetch(`${API_BASE}/admin/drivers/${driverId}/bank-accounts`, {
            headers: getAdminHeaders()
        });
        if (handleAdminApiResponse(res)) return;
        const data = await res.json();
        
        if (data.success && data.accounts) {
            adminDriverBankAccounts = data.accounts;
            renderAdminBankAccountsList();
        } else {
            listEl.innerHTML = '<div style="text-align:center; padding:10px; color:var(--error);">Hesaplar alınamadı.</div>';
        }
    } catch (e) {
        console.error('[Admin] Banka hesapları yüklenemedi:', e);
        listEl.innerHTML = '<div style="text-align:center; padding:10px; color:var(--error);">Bağlantı hatası.</div>';
    }
}

function renderAdminBankAccountsList() {
    const listEl = document.getElementById('adminBankAccountsList');
    if (!listEl) return;
    
    listEl.innerHTML = '';
    
    if (adminDriverBankAccounts.length === 0) {
        listEl.innerHTML = '<p style="text-align:center; color:var(--text-muted); font-size:13px; padding:15px; background:rgba(255,255,255,0.03); border-radius:6px;">Sürücüye ait kayıtlı banka hesabı bulunmamaktadır.</p>';
        return;
    }
    
    adminDriverBankAccounts.forEach(account => {
        const item = document.createElement('div');
        item.style.cssText = 'display:flex; justify-content:space-between; align-items:center; padding:10px 12px; background:rgba(255,255,255,0.03); border:1px solid var(--border-color); border-radius:8px; margin-bottom:8px;';
        
        // Format IBAN (TRXX XXXX...)
        const rawIban = account.iban || '';
        let formattedIban = rawIban;
        if (rawIban.startsWith('TR') && rawIban.length === 26) {
            const d = rawIban.slice(2);
            formattedIban = 'TR' + d.substring(0, 2) + ' ' + d.substring(2, 6) + ' ' + d.substring(6, 10) + ' ' + d.substring(10, 14) + ' ' + d.substring(14, 18) + ' ' + d.substring(18, 22) + ' ' + d.substring(22, 24);
        }
        
        item.innerHTML = `
            <div style="flex:1;">
                <div style="font-weight:600; font-size:14px; color:var(--text);">${escapeHtml(account.accountHolderName)}</div>
                <div style="font-family:monospace; font-size:12px; color:var(--gold); margin-top:2px;">${escapeHtml(formattedIban)}</div>
            </div>
            <div style="display:flex; gap:8px;">
                <button class="btn" style="padding:4px 8px; font-size:12px; background:rgba(245,158,11,0.1); border:1px solid rgba(245,158,11,0.2); color:var(--gold);" onclick="editAdminBankAccount(${account.id}, '${escapeHtml(account.iban)}', '${escapeHtml(account.accountHolderName)}')">Düzenle</button>
                <button class="btn" style="padding:4px 8px; font-size:12px; background:rgba(239,68,68,0.1); border:1px solid rgba(239,68,68,0.2); color:#ef4444;" onclick="deleteAdminBankAccount(${account.id})">Sil</button>
            </div>
        `;
        listEl.appendChild(item);
    });
}

function resetAdminBankAccountForm() {
    document.getElementById('editAccountId').value = '';
    document.getElementById('adminIbanInput').value = '';
    document.getElementById('adminHolderInput').value = '';
    document.getElementById('adminFormTitle').textContent = 'Yeni Hesap Ekle';
    document.getElementById('adminCancelBtn').style.display = 'none';
}

function editAdminBankAccount(accountId, iban, name) {
    document.getElementById('editAccountId').value = accountId;
    
    // Format IBAN for input field
    const rawIban = iban.replace(/^TR/i, '').replace(/\D/g, '');
    let parts = [];
    if (rawIban.length > 0) parts.push(rawIban.substring(0, 2));
    if (rawIban.length > 2) parts.push(rawIban.substring(2, 6));
    if (rawIban.length > 6) parts.push(rawIban.substring(6, 10));
    if (rawIban.length > 10) parts.push(rawIban.substring(10, 14));
    if (rawIban.length > 14) parts.push(rawIban.substring(14, 18));
    if (rawIban.length > 18) parts.push(rawIban.substring(18, 22));
    if (rawIban.length > 22) parts.push(rawIban.substring(22, 24));
    
    document.getElementById('adminIbanInput').value = parts.join(' ');
    document.getElementById('adminHolderInput').value = name;
    
    document.getElementById('adminFormTitle').textContent = 'Hesabı Düzenle';
    document.getElementById('adminCancelBtn').style.display = 'inline-flex';
    document.getElementById('adminIbanInput').focus();
}

async function saveAdminBankAccount() {
    const accountId = document.getElementById('editAccountId').value;
    const ibanInput = document.getElementById('adminIbanInput').value;
    const holderInput = document.getElementById('adminHolderInput').value.trim();
    
    const iban = 'TR' + ibanInput.replace(/\s+/g, '');
    
    if (iban.length !== 26) {
        alert('Lütfen geçerli bir TR IBAN numarası giriniz (TR + 24 hane).');
        return;
    }
    
    if (!holderInput) {
        alert('Lütfen hesap sahibinin adını soyadını yazın.');
        return;
    }
    
    const isEdit = !!accountId;
    const url = isEdit 
        ? `${API_BASE}/admin/bank-accounts/${accountId}`
        : `${API_BASE}/admin/drivers/${currentAdminDriverId}/bank-accounts`;
    
    const method = isEdit ? 'PUT' : 'POST';
    
    try {
        const res = await fetch(url, {
            method,
            headers: getAdminHeaders(),
            body: JSON.stringify({
                iban,
                accountHolderName: holderInput
            })
        });
        
        if (handleAdminApiResponse(res)) return;
        const data = await res.json();
        
        if (data.success) {
            resetAdminBankAccountForm();
            loadAdminBankAccounts(currentAdminDriverId);
            showToast('success', isEdit ? 'Banka hesabı güncellendi!' : 'Yeni hesap eklendi!');
        } else {
            alert('Hata: ' + data.message);
        }
    } catch (e) {
        console.error('[Admin] Hesap kaydedilemedi:', e);
        alert('İşlem sırasında bağlantı hatası oluştu.');
    }
}

async function deleteAdminBankAccount(accountId) {
    if (!confirm('Bu banka hesabını silmek istediğinize emin misiniz?')) return;
    
    try {
        const res = await fetch(`${API_BASE}/admin/bank-accounts/${accountId}`, {
            method: 'DELETE',
            headers: getAdminHeaders()
        });
        
        if (handleAdminApiResponse(res)) return;
        const data = await res.json();
        
        if (data.success) {
            loadAdminBankAccounts(currentAdminDriverId);
            showToast('success', 'Banka hesabı başarıyla silindi.');
        } else {
            alert('Hata: ' + data.message);
        }
    } catch (e) {
        console.error('[Admin] Hesap silinemedi:', e);
        alert('Silme işlemi sırasında hata oluştu.');
    }
}

function formatAdminIbanInput(input) {
    const digits = String(input.value || '').replace(/\D/g, '').slice(0, 24);
    
    let parts = [];
    if (digits.length > 0) parts.push(digits.substring(0, 2));
    if (digits.length > 2) parts.push(digits.substring(2, 6));
    if (digits.length > 6) parts.push(digits.substring(6, 10));
    if (digits.length > 10) parts.push(digits.substring(10, 14));
    if (digits.length > 14) parts.push(digits.substring(14, 18));
    if (digits.length > 18) parts.push(digits.substring(18, 22));
    if (digits.length > 22) parts.push(digits.substring(22, 24));
    
    input.value = parts.join(' ');
}

function handleAdminIbanPaste(event, input) {
    event.preventDefault();
    const pasted = (event.clipboardData || window.clipboardData).getData('text');
    const digits = pasted.replace(/^TR/i, '').replace(/\D/g, '').slice(0, 24);
    
    let parts = [];
    if (digits.length > 0) parts.push(digits.substring(0, 2));
    if (digits.length > 2) parts.push(digits.substring(2, 6));
    if (digits.length > 6) parts.push(digits.substring(6, 10));
    if (digits.length > 10) parts.push(digits.substring(10, 14));
    if (digits.length > 14) parts.push(digits.substring(14, 18));
    if (digits.length > 18) parts.push(digits.substring(18, 22));
    if (digits.length > 22) parts.push(digits.substring(22, 24));
    
    input.value = parts.join(' ');
}
