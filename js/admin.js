// ============================================
// RiseGo Admin Panel - Ana Uygulama
// ============================================
// Bağımlılık: admin-utils.js önce yüklenmiş olmalı
// (API_BASE, getAdminToken, setAdminToken, getAdminHeaders,
//  handleAdminApiResponse, formatIban, formatDate, escapeHtml,
//  showToast, BANK_STATUS_LABEL, getBankStatusLabel, vb.)

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
            void loadKillswitchStatus();
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

let adminAvailableParks = [];

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
        adminAvailableParks = data.parks;
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
// Not: formatDate, escapeHtml, getBankStatusLabel, getReturnReasonLabel,
// getFriendlyStatusLabel artık admin-utils.js'den geliyor.

// ============================================
// Çekim Talepleri (Payment Logs) Yönetimi
// ============================================

let allPaymentLogs = [];
let filteredPaymentLogs = [];
let currentPaymentPage = 1;
const PAYMENT_ITEMS_PER_PAGE = 50;
let paymentCursors = [null];
let paymentNextCursor = null;
let paymentHasMore = false;
let paymentRequest = null;
let paymentRequestVersion = 0;
let paymentSearchTimer = null;
let paymentLoading = false;

function cancelPaymentRequest() {
    paymentRequestVersion++;
    if (paymentRequest) paymentRequest.abort();
    paymentRequest = null;
    clearTimeout(paymentSearchTimer);
    paymentLoading = false;
}

function paymentQuery() {
    const params = new URLSearchParams({ limit: String(PAYMENT_ITEMS_PER_PAGE) });
    const fields = { q: 'paymentSearchInput', from: 'paymentFrom', to: 'paymentTo', parkPartnerId: 'paymentPark', status: 'paymentStatus' };
    for (const [key, id] of Object.entries(fields)) {
        const value = document.getElementById(id).value.trim();
        if (value) params.set(key, value);
    }
    return params;
}

async function loadPaymentLogs(page = 1) {
    cancelPaymentRequest();
    const version = paymentRequestVersion;
    const params = paymentQuery();
    const search = params.get('q') || '';
    const hint = document.getElementById('paymentSearchHint');
    if (search && search.length < 3 && !/^\d+$/.test(search)) {
        hint.textContent = 'Arama için en az 3 karakter yazınız.';
        return;
    }
    if (params.get('from') && params.get('to') && params.get('from') > params.get('to')) {
        hint.textContent = 'Başlangıç tarihi bitiş tarihinden sonra olamaz.';
        return;
    }
    if (paymentCursors[page - 1]) params.set('cursor', paymentCursors[page - 1]);
    const request = new AbortController();
    paymentRequest = request;
    paymentLoading = true;
    document.getElementById('paymentPrevBtn').disabled = true;
    document.getElementById('paymentNextBtn').disabled = true;
    hint.textContent = 'Ödeme kayıtları aranıyor...';
    try {
        const res = await fetch(API_BASE + '/admin/payment-logs?' + params.toString(), {
            headers: getAdminHeaders(), signal: request.signal
        });
        if (version !== paymentRequestVersion) return;
        if (handleAdminApiResponse(res)) return;
        const data = await res.json();
        if (version !== paymentRequestVersion) return;
        if (!res.ok || !data.success) throw new Error(data.message || 'Ödeme kayıtları alınamadı.');
        if (typeof data.hasMore !== 'boolean') throw new Error('Ödeme geçmişi şu anda kullanılamıyor. Lütfen daha sonra tekrar deneyiniz.');
        allPaymentLogs = data.logs || [];
        filteredPaymentLogs = allPaymentLogs;
        currentPaymentPage = page;
        paymentHasMore = data.hasMore;
        paymentNextCursor = data.nextCursor;
        const pendingCount = allPaymentLogs.filter(l => l.status === 'pending_bank').length;
        const warning = document.getElementById('paymentPendingWarning');
        warning.textContent = 'Bu sayfada ' + pendingCount + ' işlem banka onayı bekliyor.';
        warning.style.display = pendingCount ? 'block' : 'none';
        hint.textContent = 'Tarih seçilmezse tüm geçmiş aranır. İsim için en az 3 karakter yazın.';
        renderPaymentPage();
    } catch (err) {
        if (version !== paymentRequestVersion || err.name === 'AbortError') return;
        hint.textContent = err.message || 'Ödeme kayıtları yüklenemedi.';
        // A failed request must not leave results from a different filter visible.
        allPaymentLogs = [];
        filteredPaymentLogs = [];
        paymentHasMore = false;
        document.getElementById('paymentTableBody').innerHTML = '';
        document.querySelector('#paymentLogsModal .table-container').style.display = 'none';
        document.getElementById('paymentPagination').style.display = 'none';
        document.getElementById('paymentEmpty').style.display = 'none';
    } finally {
        if (version === paymentRequestVersion) {
            paymentLoading = false;
            paymentRequest = null;
            document.getElementById('paymentPrevBtn').disabled = currentPaymentPage <= 1;
            document.getElementById('paymentNextBtn').disabled = !paymentHasMore;
        }
    }
}

function applyPaymentFilter() {
    cancelPaymentRequest();
    paymentCursors = [null];
    paymentNextCursor = null;
    paymentHasMore = false;
    currentPaymentPage = 1;
    allPaymentLogs = [];
    filteredPaymentLogs = [];
    document.getElementById('paymentTableBody').innerHTML = '';
    document.querySelector('#paymentLogsModal .table-container').style.display = 'none';
    document.getElementById('paymentPagination').style.display = 'none';
    document.getElementById('paymentEmpty').style.display = 'none';
    document.getElementById('paymentSearchHint').textContent = 'Arama hazırlanıyor...';
    paymentSearchTimer = setTimeout(() => loadPaymentLogs(1), 400);
}

function resetPaymentFilters() {
    for (const id of ['paymentSearchInput', 'paymentFrom', 'paymentTo', 'paymentPark', 'paymentStatus']) {
        document.getElementById(id).value = '';
    }
    applyPaymentFilter();
}

function formatPaymentMoney(value) {
    return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value) || 0);
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
        if (paginationEl) paginationEl.style.display = currentPaymentPage > 1 ? 'flex' : 'none';
        document.getElementById('paymentPageInfo').textContent = 'Bu sayfada eşleşen kayıt kalmadı.';
        return;
    }
    
    emptyEl.style.display = 'none';
    if (tableContainer) tableContainer.style.display = 'block';
    if (paginationEl) paginationEl.style.display = 'flex';
    
    const startIndex = (currentPaymentPage - 1) * PAYMENT_ITEMS_PER_PAGE;
    const endIndex = startIndex + filteredPaymentLogs.length;
    const pageLogs = filteredPaymentLogs;

    pageLogs.forEach(log => {
        const tr = document.createElement('tr');
        let statusClass = 'pending';
        let statusText = 'Bekliyor';
        let isClickable = false;
        
        if (log.status === 'success')       { statusClass = 'success';       statusText = 'Başarılı'; }
        else if (log.status === 'pending_bank') { statusClass = 'pending';   statusText = 'Banka Onayı'; isClickable = true; }
        else if (log.status === 'bank_returned') { statusClass = 'refunded'; statusText = 'İade Edildi'; isClickable = true; }
        else if (log.status === 'error')    { statusClass = 'error';         statusText = 'Hatalı'; isClickable = true; }
        else if (log.status === 'refunded') { statusClass = 'refunded';      statusText = 'İade Edildi'; }

        const amountFormatted = formatPaymentMoney(log.amount);
        const grossFormatted = formatPaymentMoney(log.gross_amount);
        const paymentDate = new Date(log.created_at);
        const dateFormatted = paymentDate.toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul', day: '2-digit', month: 'short', year: 'numeric' });
        const timeFormatted = paymentDate.toLocaleTimeString('tr-TR', { timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit' });
        
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
            <td class="payment-driver-cell">
                <div class="payment-driver-name">${escapeHtml(log.beneficiary_name || 'Bilinmiyor')}</div>
                <div class="payment-record-id">İşlem #${log.id}</div><div class="payment-driver-id" title="${escapeHtml(log.driver_id || '-')}">ID: ${escapeHtml(log.driver_id || '-')}</div>
                <button onclick="openAdminBankAccountsModal('${log.driver_id}', decodeURIComponent('${encodeURIComponent(log.beneficiary_name || 'Sürücü').replace(/'/g, '%27')}'))" class="payment-edit-account" title="Banka Bilgilerini Düzenle" aria-label="Banka Bilgilerini Düzenle">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                </button>
            </td>
            <td class="payment-iban">${escapeHtml(formatIban(log.beneficiary_iban || '-'))}</td>
            <td class="payment-reference">${escapeHtml(log.tu_ref_number || '-')}</td>
            <td class="payment-money payment-money-net">${amountFormatted}</td>
            <td class="payment-money payment-money-gross">${grossFormatted}</td>
            <td class="payment-status">
                <span class="status-pill ${statusClass}" ${errorDetail} title="Detay için tıklayın">
                    ${statusText}
                </span>
            </td>
            <td class="payment-date"><span>${dateFormatted}</span><span class="payment-time">${timeFormatted}</span></td>
        `;
        tableBody.appendChild(tr);
    });
    
    const pageInfo = document.getElementById('paymentPageInfo');
    if (pageInfo) {
        pageInfo.textContent = `${startIndex + 1}–${endIndex} arası gösteriliyor · Sayfa ${currentPaymentPage}${paymentHasMore ? " · Daha fazla sonuç var" : " · Son sayfa"}`;
    }
    
    const prevBtn = document.getElementById('paymentPrevBtn');
    const nextBtn = document.getElementById('paymentNextBtn');
    if (prevBtn) prevBtn.disabled = currentPaymentPage <= 1;
    if (nextBtn) nextBtn.disabled = !paymentHasMore;
}

function changePaymentPage(delta) {
    if (paymentLoading) return;
    const page = currentPaymentPage + delta;
    if (page < 1 || (delta > 0 && !paymentHasMore)) return;
    if (delta > 0) paymentCursors[page - 1] = paymentNextCursor;
    loadPaymentLogs(page);
}

function openPaymentModal() {
    const modal = document.getElementById('paymentLogsModal');
    if (!modal) return;
    const parkSelect = document.getElementById('paymentPark');
    const previousPark = parkSelect.value;
    parkSelect.innerHTML = '<option value="">Tüm şehirler</option>';
    for (const park of adminAvailableParks) {
        const option = document.createElement('option');
        option.value = park.partnerId;
        option.textContent = park.label;
        parkSelect.appendChild(option);
    }
    parkSelect.value = previousPark;
    modal.style.display = 'flex';
    applyPaymentFilter();
}

function closePaymentModal() {
    cancelPaymentRequest();
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

let currentSuspendedCities = [];
let currentKillswitchRevision = null;
let killswitchEditRevision = null;

async function loadKillswitchStatus() {
    try {
        const res = await fetch(`${API_BASE}/admin/killswitch`, { headers: getAdminHeaders() });
        if (handleAdminApiResponse(res)) return false;
        const data = await res.json();
        if (data.success) {
            updateKillswitchUI(data.suspendedCities);
            currentKillswitchRevision = data.revision;
            const note = document.getElementById('uptSafetyNotice');
            if (note) note.textContent = data.lastAutomaticStop
                ? `UPT bakiyesi ${Number(data.lastAutomaticStop.balance).toLocaleString('tr-TR')} TL olduğu için ${formatDate(new Date(data.lastAutomaticStop.at))} tarihinde tüm şehirlerde çekimler durduruldu. Şehirleri açmak için seçimlerini kaldırıp kaydedin.`
                : 'UPT bakiyesi 5.000 TL altına düşerse tüm şehirlerde çekimler otomatik durdurulur. Bakiye yükselse bile şehirleri yönetici açar.';
            return true;
        }
    } catch (e) {
        console.error('[Admin] Killswitch durumu okunamadı:', e.message);
    }
    return false;
}

function openKillswitchModal() {
    const container = document.getElementById('killswitchCitiesContainer');
    if (!container) return;
    container.innerHTML = '';
    
    if (!adminAvailableParks || adminAvailableParks.length === 0) {
        container.innerHTML = '<p style="color:var(--text-muted); font-size:14px;">Şehir listesi yüklenemedi.</p>';
    } else {
        adminAvailableParks.forEach(park => {
            const isChecked = currentSuspendedCities.includes(park.partnerId) ? 'checked' : '';
            container.innerHTML += `
                <div style="margin-bottom: 12px; padding: 10px; background: rgba(255,255,255,0.03); border: 1px solid var(--border-color); border-radius: 6px;">
                    <label style="display: flex; align-items: center; gap: 10px; cursor: pointer; color: var(--text);">
                        <input type="checkbox" class="killswitch-city-cb" value="${park.partnerId}" ${isChecked} style="width:16px; height:16px;">
                        ${escapeHtml(park.label)}
                    </label>
                </div>
            `;
        });
    }
    
    document.getElementById('killswitchModal').style.display = 'flex';
}

function closeKillswitchModal() {
    document.getElementById('killswitchModal').style.display = 'none';
}

async function toggleKillswitch() {
    if (!await loadKillswitchStatus()) { showToast('error', 'Güncel sistem durumu alınamadı.'); return; }
    killswitchEditRevision = currentKillswitchRevision;
    openKillswitchModal();
}

async function saveKillswitch() {
    const checkboxes = document.querySelectorAll('.killswitch-city-cb:checked');
    const newSuspended = Array.from(checkboxes).map(cb => cb.value);

    try {
        const res = await fetch(`${API_BASE}/admin/killswitch`, {
            method: 'POST',
            headers: getAdminHeaders(),
            body: JSON.stringify({ suspendedCities: newSuspended, revision: killswitchEditRevision })
        });
        
        if (handleAdminApiResponse(res)) return;
        
        const data = await res.json();
        if (data.success) {
            updateKillswitchUI(data.suspendedCities);
            closeKillswitchModal();
            showToast('success', data.message || 'Kısıtlamalar güncellendi.');
        } else {
            alert('Hata: ' + data.message);
        }
    } catch (e) {
        console.error('[Admin] Killswitch değiştirilemedi:', e.message);
        alert('Bağlantı hatası.');
    }
}

function updateKillswitchUI(suspendedCities) {
    currentSuspendedCities = suspendedCities || [];
    const btn = document.getElementById('killswitchBtn');
    const text = document.getElementById('killswitchStatusText');
    if (!btn || !text) return;

    // Reset any inline styles that might interfere
    btn.style.background = '';
    btn.style.border = '';
    btn.style.color = '';

    if (currentSuspendedCities.length > 0) {
        btn.classList.add('badge-red');
        btn.classList.remove('badge-green');
        text.textContent = `Askıda (${currentSuspendedCities.length})`;
    } else {
        btn.classList.add('badge-green');
        btn.classList.remove('badge-red');
        text.textContent = 'Açık (Tümü)';
    }
}

// ============================================
// SÜRÜCÜ MANUEL SENKRONİZASYON (YANDEX -> DB)
// ============================================

function openSyncModal() {
    const container = document.getElementById('syncCitiesContainer');
    if (!container) return;
    container.innerHTML = '';
    
    if (!adminAvailableParks || adminAvailableParks.length === 0) {
        container.innerHTML = '<p style="color:var(--text-muted); font-size:14px;">Şehir listesi yüklenemedi.</p>';
    } else {
        adminAvailableParks.forEach(park => {
            container.innerHTML += `
                <div style="margin-bottom: 12px; padding: 10px; background: rgba(255,255,255,0.03); border: 1px solid var(--border-color); border-radius: 6px;">
                    <label style="display: flex; align-items: center; gap: 10px; cursor: pointer; color: var(--text);">
                        <input type="checkbox" class="sync-city-cb" value="${park.partnerId}" style="width:16px; height:16px;">
                        ${escapeHtml(park.label)}
                    </label>
                </div>
            `;
        });
    }
    
    const modal = document.getElementById('syncModal');
    if (modal) modal.style.display = 'flex';
}

function closeSyncModal() {
    const modal = document.getElementById('syncModal');
    if (modal) modal.style.display = 'none';
}

async function runSync() {
    const checkboxes = document.querySelectorAll('.sync-city-cb:checked');
    if (checkboxes.length === 0) {
        alert('Lütfen senkronize edilecek en az bir şehir seçin.');
        return;
    }
    
    const selectedParkIds = Array.from(checkboxes).map(cb => cb.value);
    
    const btn = document.getElementById('btnRunSync');
    if (!btn) return;
    
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Senkronize Ediliyor...';
    
    try {
        const res = await fetch(`${API_BASE}/admin/sync-drivers`, {
            method: 'POST',
            headers: getAdminHeaders(),
            body: JSON.stringify({ parkIds: selectedParkIds })
        });
        
        if (handleAdminApiResponse(res)) return;
        
        const data = await res.json();
        if (data.success) {
            alert(`Senkronizasyon Başarılı!\nEklendi: ${data.inserted} yeni sürücü\nGüncellendi: ${data.updated} sürücü/araç\nTelefonsuz/Atlanan: ${data.noPhone}`);
            closeSyncModal();
        } else {
            alert('Senkronizasyon hatası: ' + (data.message || 'Bilinmeyen hata'));
        }
    } catch (err) {
        console.error('[Admin] Senkronizasyon hatası:', err);
        alert('Senkronizasyon başlatılamadı: ' + err.message);
    } finally {
        btn.disabled = false;
        btn.textContent = originalText;
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
    
    let cleanIban = ibanInput.replace(/\s+/g, '').toUpperCase();
    if (cleanIban.startsWith('TR')) {
        cleanIban = cleanIban.substring(2);
    }
    const iban = 'TR' + cleanIban;
    
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

// formatAdminIbanInput ve handleAdminIbanPaste artık admin-utils.js'den geliyor.
