const DOSIETA_STORAGE_URL = 'https://zdythzcgcjxwbxufunuh.supabase.co';
const DOSIETA_STORAGE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpkeXRoemNnY2p4d2J4dWZ1bnVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA2MTcxNTMsImV4cCI6MjA5NjE5MzE1M30.XGZX5DHhJCGz9X5s__3iuSghukjanyJmGKv8MLig_jE';

// Dedicated client for file storage (dosieta bucket)
const dosietaClient = (typeof supabase !== 'undefined' && supabase.createClient)
    ? supabase.createClient(DOSIETA_STORAGE_URL, DOSIETA_STORAGE_KEY)
    : client;

const DOC_CATEGORIES = {
    'salary': {
        label: 'Фиш за заплата',
        icon: '💶',
        badgeBg: '#dcfce7',
        badgeColor: '#15803d',
        badgeBorder: '#bbf7d0'
    },
    'contract': {
        label: 'Трудов договор / Анекс',
        icon: '📑',
        badgeBg: '#dbeafe',
        badgeColor: '#1d4ed8',
        badgeBorder: '#bfdbfe'
    },
    'medical': {
        label: 'Медицинско / Инструктаж',
        icon: '🩺',
        badgeBg: '#fef3c7',
        badgeColor: '#b45309',
        badgeBorder: '#fde68a'
    },
    'request': {
        label: 'Заявление / Молба',
        icon: '📝',
        badgeBg: '#f3e8ff',
        badgeColor: '#7e22ce',
        badgeBorder: '#e9d5ff'
    },
    'doc': {
        label: 'Фирмен документ',
        icon: '📄',
        badgeBg: '#f1f5f9',
        badgeColor: '#475569',
        badgeBorder: '#e2e8f0'
    }
};

let currentWorkerDocs = [];
let currentDocFilter = 'ALL';

function transliterateBg(text) {
    if (!text) return '';
    const map = {
        'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ж': 'zh', 'з': 'z',
        'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n', 'о': 'o', 'п': 'p',
        'р': 'r', 'с': 's', 'т': 't', 'у': 'u', 'ф': 'f', 'х': 'h', 'ц': 'ts', 'ч': 'ch',
        'ш': 'sh', 'щ': 'sht', 'ъ': 'a', 'ь': 'y', 'ю': 'yu', 'я': 'ya',
        'А': 'A', 'Б': 'B', 'В': 'V', 'Г': 'G', 'Д': 'D', 'Е': 'E', 'Ж': 'Zh', 'З': 'Z',
        'И': 'I', 'Й': 'Y', 'К': 'K', 'Л': 'L', 'М': 'M', 'Н': 'N', 'О': 'O', 'П': 'P',
        'Р': 'R', 'С': 'S', 'Т': 'T', 'У': 'U', 'Ф': 'F', 'Х': 'H', 'Ц': 'Ts', 'Ч': 'Ch',
        'Ш': 'Sh', 'Щ': 'Sht', 'Ъ': 'A', 'Ь': 'Y', 'Ю': 'Yu', 'Я': 'Ya'
    };
    return text.split('').map(char => map[char] !== undefined ? map[char] : char).join('');
}

function parseWorkerDocName(rawName) {
    let categoryKey = 'doc';
    let cleanName = rawName;

    // Check modern prefix: e.g. salary__1730030000000__Fish_Oktomvri.pdf
    if (rawName.includes('__')) {
        const parts = rawName.split('__');
        if (parts.length >= 3 && DOC_CATEGORIES[parts[0]]) {
            categoryKey = parts[0];
            cleanName = parts.slice(2).join('__');
        } else if (parts.length >= 2 && DOC_CATEGORIES[parts[0]]) {
            categoryKey = parts[0];
            cleanName = parts.slice(1).join('__');
        }
    } else {
        // Check older bracket prefix if any
        for (const [key, val] of Object.entries(DOC_CATEGORIES)) {
            if (rawName.toLowerCase().includes(key)) {
                categoryKey = key;
                break;
            }
        }
    }

    // Strip standalone leading timestamp if any (e.g. 1730000000000_)
    cleanName = cleanName.replace(/^\d{10,13}[_-]/, '');

    const catInfo = DOC_CATEGORIES[categoryKey] || DOC_CATEGORIES['doc'];
    return {
        rawName,
        categoryKey,
        catInfo,
        cleanName
    };
}

function getFileExtensionIcon(fileName) {
    const ext = (fileName || '').split('.').pop().toLowerCase();
    if (ext === 'pdf') return '📕';
    if (['doc', 'docx'].includes(ext)) return '📘';
    if (['xls', 'xlsx', 'csv'].includes(ext)) return '📗';
    if (['png', 'jpg', 'jpeg', 'webp'].includes(ext)) return '🖼️';
    if (['zip', 'rar', '7z'].includes(ext)) return '🗜️';
    return '📄';
}

function formatFileSize(bytes) {
    if (!bytes || isNaN(bytes)) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

async function loadPersonnelSidebar() {
    const list = document.getElementById('sidebarList'); const loading = document.getElementById('sidebarLoading'); list.innerHTML = ''; loading.style.display = 'block';
    try {
        const { data, error } = await client.from('personal').select('Имейл').eq('Статус', 'Активен'); if (error) throw error;
        let uniqueEmails = [...new Set(data.map(item => item['Имейл'] ? item['Имейл'].toLowerCase().trim() : ''))].filter(e => e !== ''); uniqueEmails.sort((a, b) => a.localeCompare(b)); loading.style.display = 'none';
        if (uniqueEmails.length === 0) { list.innerHTML = '<li style="padding:15px; color:#94a3b8; text-align:center;">Няма активни служители</li>'; return; }
        uniqueEmails.forEach(email => { const li = document.createElement('li'); li.className = 'sidebar-item'; li.innerHTML = `📁 <span>${email}</span>`; li.onclick = () => openWorkerFolder(email); list.appendChild(li); });
    } catch (err) { loading.innerText = 'Грешка: ' + err.message; }
}

async function openWorkerFolder(email) { 
    currentFolderEmail = email; 
    document.getElementById('currentWorkerName').innerText = email; 
    const pwInput = document.getElementById('workerPasswordInput');
    if (pwInput) pwInput.value = '';
    document.getElementById('folderModalBackdrop').style.display = 'flex'; 
    switchFolderTab('att'); 
    loadWorkerPassword(email);
}

async function loadWorkerPassword(email) {
    const pwInput = document.getElementById('workerPasswordInput');
    if (!pwInput) return;
    try {
        const { data } = await dosietaClient.from('personal').select('password').eq('Имейл', email).limit(1);
        if (data && data.length > 0 && data[0].password) {
            pwInput.value = data[0].password;
        } else {
            pwInput.value = '';
        }
    } catch (e) {
        console.warn('Could not load worker password:', e);
    }
}

async function saveWorkerPassword() {
    const pwInput = document.getElementById('workerPasswordInput');
    const newPassword = pwInput ? pwInput.value.trim() : '';
    if (!currentFolderEmail) return;

    Swal.fire({ title: 'Запазване...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    try {
        const { error } = await dosietaClient.from('personal').update({ password: newPassword || null }).eq('Имейл', currentFolderEmail);
        if (error) throw error;
        Swal.fire({
            icon: 'success',
            title: 'Успешно запазено!',
            text: newPassword ? `Индивидуалната парола за ${currentFolderEmail} е обновена.` : `Паролата за ${currentFolderEmail} е премахната.`,
            timer: 1600,
            showConfirmButton: false
        });
    } catch (err) {
        console.error('saveWorkerPassword error:', err);
        Swal.fire('Грешка', err.message || 'Неуспешно обновяване на паролата.', 'error');
    }
}

function closeFolderModal() { 
    document.getElementById('folderModalBackdrop').style.display = 'none'; 
}

function switchFolderTab(tabId) { 
    ['att', 'work', 'docs', '3s', 'bonuses'].forEach(id => { 
        const btn = document.getElementById('tab' + id.charAt(0).toUpperCase() + id.slice(1) + 'Btn');
        const cont = document.getElementById('f-' + id);
        if (btn) btn.classList.remove('active'); 
        if (cont) cont.classList.remove('active'); 
    }); 
    const activeBtn = document.getElementById('tab' + tabId.charAt(0).toUpperCase() + tabId.slice(1) + 'Btn');
    const activeCont = document.getElementById('f-' + tabId);
    if (activeBtn) activeBtn.classList.add('active'); 
    if (activeCont) activeCont.classList.add('active'); 
    if (tabId === 'att') loadWorkerAttendance(); 
    if (tabId === 'work') loadWorkerWork(); 
    if (tabId === 'docs') loadWorkerDocs(); 
    if (tabId === '3s') loadWorker3sAudits(); 
    if (tabId === 'bonuses') loadWorkerBonuses(); 
}

async function loadWorker3sAudits() {
    const list = document.getElementById('worker3sList');
    if (!list) return;
    list.innerHTML = '<div style="padding:20px; text-align:center; color:#64748b;">Зареждане на 3S одити... 🧹</div>';

    try {
        let workerName = '';
        const { data: pData } = await client.from('personal').select('Име').eq('Имейл', currentFolderEmail).limit(1);
        if (pData && pData.length > 0 && pData[0]['Име']) {
            workerName = pData[0]['Име'];
        }

        let query = client.from('audit_3s_logs').select('*');
        if (workerName) {
            query = query.or(`target_name.eq."${workerName}",target_name.eq."${currentFolderEmail}"`);
        } else {
            query = query.eq('target_name', currentFolderEmail);
        }

        const { data: audits, error } = await query.order('created_at', { ascending: false });
        if (error) throw error;

        if (!audits || audits.length === 0) {
            list.innerHTML = '<div style="padding:30px; text-align:center; color:#94a3b8;">Няма записани 3S одити за този служител.</div>';
            return;
        }

        let html = audits.map(a => {
            let pct = a.percentage || 0;
            let badgeBg = pct >= 85 ? '#dcfce7' : (pct >= 65 ? '#fef3c7' : '#fee2e2');
            let badgeColor = pct >= 85 ? '#15803d' : (pct >= 65 ? '#b45309' : '#dc2626');
            let dateStr = a.audit_date || (a.created_at ? a.created_at.split('T')[0] : '--');

            return `
                <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:10px; padding:12px 14px; margin-bottom:10px; box-shadow:0 1px 3px rgba(0,0,0,0.03);">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                        <span style="font-weight:800; color:#1e293b; font-size:0.95em;">📅 ${dateStr} &nbsp;|&nbsp; Проверяващ: ${a.auditor_name || '--'} (${a.sector || '--'})</span>
                        <span style="background:${badgeBg}; color:${badgeColor}; font-weight:900; padding:2px 8px; border-radius:6px; font-size:0.9em;">
                            ${a.total_points} / ${a.max_points} т. (${pct}%)
                        </span>
                    </div>
                    ${a.notes ? `<div style="font-size:0.86em; color:#475569; margin-top:6px; background:#f8fafc; padding:6px 10px; border-radius:6px;">📝 <em>"${a.notes}"</em></div>` : ''}
                    ${a.photo_url ? `<div style="margin-top:6px;"><button type="button" class="btn-secondary" onclick="preview3sPhoto('${a.photo_url}')" style="padding:3px 8px; font-size:0.8em;">📷 Виж снимката</button></div>` : ''}
                </div>
            `;
        }).join('');

        list.innerHTML = html;
    } catch (err) {
        list.innerHTML = `<div style="color:#ef4444; padding:15px;">Грешка при зареждане на одитите: ${err.message}</div>`;
    }
}

async function loadWorkerBonuses() {
    const list = document.getElementById('workerBonusesList');
    if (!list) return;
    list.innerHTML = '<div style="padding:25px; text-align:center; color:#64748b;">Изчисляване на показатели за бонуси & заплата... 💰</div>';

    try {
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();

        // 1. Worker info from personal
        const { data: pData } = await client.from('personal').select('*').eq('Имейл', currentFolderEmail).limit(1);
        const worker = (pData && pData.length > 0) ? pData[0] : {};
        const workerName = worker['Име'] || currentFolderEmail;
        const baseBonus = parseFloat(worker['Базов бонус']) || 0;
        const baseSalary = parseFloat(worker['Основна заплата']) || 0;

        // 2. Attendance (Lates) this month
        const { data: attData } = await client.from('chekiraniya')
            .select('*')
            .eq('Имейл', currentFolderEmail)
            .gte('Време', startOfMonth)
            .lte('Време', endOfMonth)
            .order('Време', { ascending: false });

        let lates = [];
        (attData || []).forEach(item => {
            if (item['Действие'] === 'Влизане' && item['Време']) {
                let d = new Date(item['Време']);
                // Shift starts at 08:00 with 5 min grace
                if (d.getHours() > 8 || (d.getHours() === 8 && d.getMinutes() > 5)) {
                    let minLate = (d.getHours() - 8) * 60 + d.getMinutes();
                    lates.push({ time: d, minLate: minLate, raw: item });
                }
            }
        });

        // 3. 3S Audits this month
        let auditQuery = client.from('audit_3s_logs').select('*').gte('created_at', startOfMonth).lte('created_at', endOfMonth);
        if (workerName) {
            auditQuery = auditQuery.or(`target_name.eq."${workerName}",target_name.eq."${currentFolderEmail}"`);
        } else {
            auditQuery = auditQuery.eq('target_name', currentFolderEmail);
        }
        const { data: audits } = await auditQuery;
        let failedAudits = (audits || []).filter(a => (parseFloat(a.percentage) || 0) < 80);

        // 4. Mistakes in reports (Brack) this month
        const { data: otchetiData } = await client.from('otcheti')
            .select('*')
            .or(`Оператор.ilike."%${workerName}%",Оператор.ilike."%${currentFolderEmail}%"`)
            .eq('Статус', 'Брак')
            .gte('Дата', startOfMonth)
            .lte('Дата', endOfMonth);
        let defectMistakes = otchetiData || [];

        // Check rules penalty estimation (defaults: 3 lates = 10 EUR, failed 3s = 20 EUR, 3 defects = 15 EUR)
        let latePenalty = Math.floor(lates.length / 3) * 10;
        let auditPenalty = failedAudits.length * 20;
        let defectPenalty = Math.floor(defectMistakes.length / 3) * 15;
        let totalDeductions = latePenalty + auditPenalty + defectPenalty;
        let netBonus = Math.max(0, baseBonus - totalDeductions);

        let html = `
            <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:12px; padding:16px; margin-bottom:14px; box-shadow:0 1px 3px rgba(0,0,0,0.04);">
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-bottom:14px; border-bottom:1px solid #f1f5f9; padding-bottom:10px;">
                    <div>
                        <div style="font-weight:900; color:#1e293b; font-size:1.1em;">💰 Месечен Статус за Бонуси (Текущ месец)</div>
                        <div style="font-size:0.82em; color:#64748b;">Служител: <b>${workerName}</b> (${worker['Длъжност'] || 'Служител'})</div>
                    </div>
                    <button type="button" class="btn-primary" onclick="switchTab('salaries')" style="padding:6px 12px; font-size:0.82em; background:#4338ca;">
                        📊 Отвори цялата Ведомост ➔
                    </button>
                </div>

                <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(130px, 1fr)); gap:10px; margin-bottom:16px;">
                    <div style="background:#f8fafc; border:1px solid #cbd5e1; border-radius:8px; padding:10px; text-align:center;">
                        <div style="font-size:0.75em; font-weight:700; color:#64748b;">БАЗОВ БОНУС</div>
                        <div style="font-size:1.3em; font-weight:900; color:#1e293b; margin-top:2px;">${baseBonus > 0 ? baseBonus + ' €' : 'Не е зададен'}</div>
                    </div>
                    <div style="background:${lates.length >= 3 ? '#fee2e2' : '#f0fdf4'}; border:1px solid ${lates.length >= 3 ? '#fca5a5' : '#bbf7d0'}; border-radius:8px; padding:10px; text-align:center;">
                        <div style="font-size:0.75em; font-weight:700; color:${lates.length >= 3 ? '#b91c1c' : '#15803d'};">ЗАКЪСНЕНИЯ (СЛЕД 08:05)</div>
                        <div style="font-size:1.3em; font-weight:900; color:${lates.length >= 3 ? '#dc2626' : '#166534'}; margin-top:2px;">${lates.length} бр. ${latePenalty > 0 ? `(-${latePenalty} €)` : ''}</div>
                    </div>
                    <div style="background:${failedAudits.length > 0 ? '#fee2e2' : '#f0fdf4'}; border:1px solid ${failedAudits.length > 0 ? '#fca5a5' : '#bbf7d0'}; border-radius:8px; padding:10px; text-align:center;">
                        <div style="font-size:0.75em; font-weight:700; color:${failedAudits.length > 0 ? '#b91c1c' : '#15803d'};">3S ОДИТИ (&lt;80%)</div>
                        <div style="font-size:1.3em; font-weight:900; color:${failedAudits.length > 0 ? '#dc2626' : '#166534'}; margin-top:2px;">${failedAudits.length} бр. ${auditPenalty > 0 ? `(-${auditPenalty} €)` : ''}</div>
                    </div>
                    <div style="background:${defectMistakes.length >= 3 ? '#fee2e2' : '#f8fafc'}; border:1px solid ${defectMistakes.length >= 3 ? '#fca5a5' : '#cbd5e1'}; border-radius:8px; padding:10px; text-align:center;">
                        <div style="font-size:0.75em; font-weight:700; color:#64748b;">БРАК / ГРЕШКИ</div>
                        <div style="font-size:1.3em; font-weight:900; color:#1e293b; margin-top:2px;">${defectMistakes.length} бр. ${defectPenalty > 0 ? `(-${defectPenalty} €)` : ''}</div>
                    </div>
                </div>

                <!-- Детайли за Закъсненията -->
                <div style="margin-bottom:12px; border:1px solid #e2e8f0; border-radius:8px; overflow:hidden;">
                    <div style="background:#f8fafc; padding:8px 12px; font-weight:800; font-size:0.85em; color:#334155; display:flex; justify-content:space-between;">
                        <span>⏱️ Засечени закъснения за смяна (${lates.length})</span>
                        <span style="font-size:0.85em; color:${latePenalty > 0 ? '#dc2626' : '#16a34a'}; font-weight:800;">Удръжка: ${latePenalty > 0 ? '-' + latePenalty + ' €' : '0 €'}</span>
                    </div>
                    <div style="max-height:120px; overflow-y:auto; padding:6px 12px; font-size:0.85em;">
                        ${lates.length > 0 ? `
                            <ul style="margin:0; padding-left:18px;">
                                ${lates.map(l => `<li><b>${l.time.toLocaleDateString('bg-BG')}</b> в <b>${l.time.toLocaleTimeString('bg-BG', { hour: '2-digit', minute: '2-digit' })} ч.</b> (закъснение с ${l.minLate} мин.)</li>`).join('')}
                            </ul>
                        ` : '<div style="color:#16a34a; font-weight:bold;">🟢 Няма регистрирани закъснения през текущия месец!</div>'}
                    </div>
                </div>

                <!-- Детайли за 3S одитите -->
                <div style="border:1px solid #e2e8f0; border-radius:8px; overflow:hidden;">
                    <div style="background:#f8fafc; padding:8px 12px; font-weight:800; font-size:0.85em; color:#334155; display:flex; justify-content:space-between;">
                        <span>🧹 Неиздържани 3S одити (${failedAudits.length})</span>
                        <span style="font-size:0.85em; color:${auditPenalty > 0 ? '#dc2626' : '#16a34a'}; font-weight:800;">Удръжка: ${auditPenalty > 0 ? '-' + auditPenalty + ' €' : '0 €'}</span>
                    </div>
                    <div style="max-height:120px; overflow-y:auto; padding:6px 12px; font-size:0.85em;">
                        ${failedAudits.length > 0 ? `
                            <ul style="margin:0; padding-left:18px;">
                                ${failedAudits.map(a => `<li><b>${a.audit_date || a.created_at?.split('T')[0]}</b>: Оценка <b>${a.percentage}%</b> (Проверяващ: ${a.auditor_name || '--'})${a.notes ? ` - <i>${a.notes}</i>` : ''}</li>`).join('')}
                            </ul>
                        ` : '<div style="color:#16a34a; font-weight:bold;">🟢 Всички 3S одити за месеца са взети успешно!</div>'}
                    </div>
                </div>
            </div>
        `;

        list.innerHTML = html;
    } catch (err) {
        console.error("loadWorkerBonuses error:", err);
        list.innerHTML = `<div style="color:#ef4444; padding:15px;">Грешка при зареждане на бонусите: ${err.message}</div>`;
    }
}

async function loadWorkerAttendance() {
    const tbody = document.getElementById('workerAttList'); tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Зареждане...</td></tr>';
    try {
        const { data, error } = await client.from('chekiraniya').select('*').eq('Имейл', currentFolderEmail).order('Време', { ascending: false }).limit(100); if (error) throw error;
        if (!data || data.length === 0) { tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:#94a3b8;">Няма записи.</td></tr>'; return; }
        let html = '';
        data.forEach(item => {
            let isLate = false; if (item['Действие'] === 'Влизане' && item['Време']) { let d = new Date(item['Време']); if (d.getHours() > 8 || (d.getHours() === 8 && d.getMinutes() > 0)) isLate = true; }
            let rowStyle = ''; if (isLate || (item['Бележка'] && item['Бележка'].includes('ИЗВЪН ОБЕКТА'))) rowStyle = 'background-color: #fef2f2; border-left: 4px solid #ef4444'; else if (item['Действие'] === 'Авто излизане') rowStyle = 'background-color: #fffbeb; border-left: 4px solid #f59e0b';
            let timeStr = item['Време'] ? new Date(item['Време']).toLocaleString('bg-BG') : ''; let actionHtml = item['Действие'];
            if (actionHtml === 'Влизане') actionHtml = `<span style="color:#15803d; font-weight:800;">🟢 Влизане</span>`; if (actionHtml === 'Излизане') actionHtml = `<span style="color:#b91c1c; font-weight:800;">🔴 Излизане</span>`; if (actionHtml === 'Авто излизане') actionHtml = `<span style="color:#b45309; font-weight:800;">🕒 Авто излизане</span>`;
            let noteHtml = item['Бележка'] || ''; if (noteHtml.includes('ИЗВЪН ОБЕКТА')) noteHtml = `⚠️ <b style="color:#dc2626;">${noteHtml}</b>`; let locHtml = item['Локация'] || '';
            if (locHtml.includes(',')) { 
                let m = locHtml.match(/([0-9]+\.[0-9]+)\s*,\s*([0-9]+\.[0-9]+)/);
                let coords = m ? `${m[1]},${m[2]}` : locHtml.replace(/\s/g, ''); 
                locHtml = `<a href="https://www.google.com/maps?q=${coords}" target="_blank" style="color:#2563eb; font-weight:bold; text-decoration:none;">📍 Карта</a>`; 
            }
            html += `<tr style="${rowStyle}"><td><b>${timeStr}</b></td><td>${actionHtml}</td><td>${locHtml}</td><td>${noteHtml}</td></tr>`;
        });
        tbody.innerHTML = html;
    } catch(err) { tbody.innerHTML = `<tr><td colspan="4" style="color:red;">Грешка: ${err.message}</td></tr>`; }
}

async function loadWorkerWork() {
    const tbody = document.getElementById('workerWorkList'); tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Зареждане...</td></tr>';
    try {
        const { data: pData } = await client.from('personal').select('Име').eq('Имейл', currentFolderEmail).limit(1);
        let operatorName = (pData && pData.length > 0) ? pData[0]['Име'] : null;
        
        let query = client.from('otcheti').select('*');
        if (operatorName) {
            query = query.ilike('Оператор', `%${operatorName}%`);
        } else {
            query = query.ilike('Оператор', `%${currentFolderEmail}%`);
        }
        
        const { data, error } = await query.order('Дата', { ascending: false }).limit(50); if (error) throw error;
        if (!data || data.length === 0) tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#94a3b8;">Няма отчетена работа.</td></tr>';
        else { let html = ''; data.forEach(r => { let d = new Date(r['Дата']).toLocaleDateString('bg-BG'); let statusColor = r['Статус'] === 'Брак' ? 'color:#dc2626; font-weight:800;' : 'color:#16a34a; font-weight:800;'; html += `<tr><td>${d}</td><td style="font-weight:800;">${r['ID Детайл']}</td><td>${r['Операция']}</td><td style="font-weight:800;">${r['Количество']}</td><td style="${statusColor}">${r['Статус']}</td></tr>`; }); tbody.innerHTML = html; }
    } catch(err) { tbody.innerHTML = `<tr><td colspan="5" style="color:red;">Грешка: ${err.message}</td></tr>`; }
}

function filterWorkerDocs(categoryFilter, btnElement) {
    currentDocFilter = categoryFilter;
    if (btnElement) {
        document.querySelectorAll('#docCategoryFilters .doc-filter-btn').forEach(b => b.classList.remove('active'));
        btnElement.classList.add('active');
    }
    renderWorkerDocsList();
}

async function loadWorkerDocs() {
    const listDiv = document.getElementById('workerDocsList');
    const countBadge = document.getElementById('workerDocsCount');
    if (!listDiv) return;
    listDiv.innerHTML = '<div style="text-align:center; padding:25px; color:#64748b;"><span style="font-size:1.4em;">⏳</span> Зареждане на документи от досието...</div>';
    
    try {
        console.log('Loading worker docs for:', currentFolderEmail);
        const { data, error } = await dosietaClient.storage.from('dosieta').list(currentFolderEmail);
        if (error) throw error;

        console.log('Received worker docs:', data);
        currentWorkerDocs = (data || []).filter(f => f.name && f.name !== '.emptyFolderPlaceholder');
        // Sort newest first
        currentWorkerDocs.sort((a, b) => new Date(b.created_at || b.updated_at || 0) - new Date(a.created_at || a.updated_at || 0));

        if (countBadge) countBadge.innerText = currentWorkerDocs.length;
        renderWorkerDocsList();
    } catch (err) {
        console.error('loadWorkerDocs error:', err);
        listDiv.innerHTML = `
            <div style="background:#fef2f2; border:1px solid #fecaca; color:#b91c1c; padding:15px; border-radius:8px; text-align:center;">
                ⚠️ <b>Грешка при зареждане на документи:</b> ${err.message || err}
                <div style="margin-top:8px;">
                    <button class="btn-secondary" onclick="loadWorkerDocs()" style="font-size:0.85em; padding:4px 12px; cursor:pointer;">Опитай пак</button>
                </div>
            </div>
        `;
    }
}

function renderWorkerDocsList() {
    const listDiv = document.getElementById('workerDocsList');
    if (!listDiv) return;

    let filtered = currentWorkerDocs;
    if (currentDocFilter !== 'ALL') {
        filtered = currentWorkerDocs.filter(f => {
            const parsed = parseWorkerDocName(f.name);
            return parsed.categoryKey === currentDocFilter;
        });
    }

    if (!filtered || filtered.length === 0) {
        listDiv.innerHTML = `
            <div style="text-align:center; padding:32px 20px; color:#94a3b8; background:#f8fafc; border:1px dashed #cbd5e1; border-radius:10px; margin-top:5px;">
                <div style="font-size:2.2em; margin-bottom:8px;">📂</div>
                <div style="font-weight:700; color:#475569; font-size:0.95em;">Няма качени документи в тази категория</div>
                <div style="font-size:0.82em; color:#94a3b8; margin-top:4px;">Изберете категория и файл по-горе, за да добавите документ или фиш в досието на служителя.</div>
            </div>
        `;
        return;
    }

    let html = '<div class="worker-docs-grid">';
    filtered.forEach(file => {
        const parsed = parseWorkerDocName(file.name);
        const fileExtIcon = getFileExtensionIcon(parsed.cleanName);
        const cat = parsed.catInfo;
        const sizeStr = file.metadata && file.metadata.size ? formatFileSize(file.metadata.size) : '';
        const dateStr = file.created_at ? new Date(file.created_at).toLocaleString('bg-BG', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
        
        // Public download/view URL
        const publicUrl = `${DOSIETA_STORAGE_URL}/storage/v1/object/public/dosieta/${encodeURIComponent(currentFolderEmail)}/${encodeURIComponent(file.name)}`;

        html += `
            <div class="worker-doc-row">
                <div class="worker-doc-left">
                    <span class="file-ext-icon">${fileExtIcon}</span>
                    <div class="worker-doc-meta">
                        <div class="worker-doc-title-row">
                            <span class="worker-doc-badge" style="background:${cat.badgeBg}; color:${cat.badgeColor}; border:1px solid ${cat.badgeBorder};">
                                ${cat.icon} ${cat.label}
                            </span>
                            <a href="${publicUrl}" target="_blank" class="worker-doc-name" title="Отвори ${parsed.cleanName}">
                                ${parsed.cleanName}
                            </a>
                        </div>
                        <div class="worker-doc-sub">
                            ${dateStr ? `<span>🕒 ${dateStr}</span>` : ''}
                            ${sizeStr ? `<span>💾 ${sizeStr}</span>` : ''}
                        </div>
                    </div>
                </div>
                <div class="worker-doc-actions">
                    <a href="${publicUrl}" target="_blank" class="doc-btn doc-btn-view" title="Преглед на документа">
                        👁️ Отвори
                    </a>
                    <a href="${publicUrl}" download="${parsed.cleanName}" class="doc-btn doc-btn-download" title="Свали файла">
                        ⬇️ Свали
                    </a>
                    <button type="button" class="doc-btn doc-btn-del" onclick="deleteWorkerDoc('${encodeURIComponent(file.name)}', '${encodeURIComponent(parsed.cleanName)}')" title="Изтрий документа">
                        🗑️
                    </button>
                </div>
            </div>
        `;
    });
    html += '</div>';
    listDiv.innerHTML = html;
}

async function uploadWorkerDoc() {
    const fileInput = document.getElementById('docUploadInput');
    const catSelect = document.getElementById('docCategorySelect');
    const file = fileInput ? fileInput.files[0] : null;

    if (!file) {
        Swal.fire({
            icon: 'warning',
            title: 'Няма избран файл',
            text: 'Моля, изберете файл от компютъра за качване в досието.',
            confirmButtonColor: '#4338ca'
        });
        return;
    }

    if (!currentFolderEmail) {
        Swal.fire('Грешка', 'Няма избран служител.', 'error');
        return;
    }

    const categoryPrefix = (catSelect && catSelect.value) ? catSelect.value : 'doc';
    // Transliterate Cyrillic and sanitize for S3 compatibility
    const safeBaseName = transliterateBg(file.name).replace(/[^a-zA-Z0-9.\-_]/g, '_');
    const timestamp = Date.now();
    const storedFileName = `${categoryPrefix}__${timestamp}__${safeBaseName}`;

    Swal.fire({
        title: 'Качване на документ...',
        html: `Качване на <b>${file.name}</b> в досието на <b>${currentFolderEmail}</b>`,
        allowOutsideClick: false,
        didOpen: () => {
            Swal.showLoading();
        }
    });

    try {
        const filePath = `${currentFolderEmail}/${storedFileName}`;
        const { error } = await dosietaClient.storage
            .from('dosieta')
            .upload(filePath, file, {
                cacheControl: '3600',
                upsert: true
            });

        if (error) throw error;

        Swal.fire({
            icon: 'success',
            title: 'Успешно качен!',
            text: 'Документът е добавен в досието на служителя.',
            timer: 1600,
            showConfirmButton: false
        });

        // Reset input
        fileInput.value = '';

        // Reload docs list
        await loadWorkerDocs();
    } catch (err) {
        console.error('uploadWorkerDoc error:', err);
        Swal.fire({
            icon: 'error',
            title: 'Грешка при качване',
            text: err.message || 'Възникна непредвидена грешка при качване на файла.',
            confirmButtonColor: '#4338ca'
        });
    }
}

async function deleteWorkerDoc(encodedName, encodedCleanName) {
    const rawName = decodeURIComponent(encodedName);
    const cleanName = encodedCleanName ? decodeURIComponent(encodedCleanName) : rawName;

    const result = await Swal.fire({
        title: 'Изтриване на документ?',
        html: `Сигурни ли сте, че искате да изтриете <b>${cleanName}</b> от досието?<br><span style="color:#ef4444; font-size:0.85em;">Това действие е необратимо.</span>`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#64748b',
        confirmButtonText: 'Да, изтрий',
        cancelButtonText: 'Отказ'
    });

    if (!result.isConfirmed) return;

    Swal.fire({
        title: 'Изтриване...',
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading()
    });

    try {
        const { error } = await dosietaClient.storage
            .from('dosieta')
            .remove([`${currentFolderEmail}/${rawName}`]);

        if (error) throw error;

        Swal.fire({
            icon: 'success',
            title: 'Изтрит!',
            timer: 1200,
            showConfirmButton: false
        });

        await loadWorkerDocs();
    } catch (err) {
        console.error('deleteWorkerDoc error:', err);
        Swal.fire('Грешка', err.message || 'Неуспешно изтриване.', 'error');
    }
}

async function runInvisibleAutoCheckout() {
    try {
        const { data, error } = await client.from('chekiraniya').select('*').in('Действие', ['Влизане', 'Излизане', 'Авто излизане']).order('Време', { ascending: false }).limit(2000); if(error) return;
        let userState = {}; let userLastTime = {}; 
        data.forEach(r => { 
            if (!userState[r['Имейл']]) {
                userState[r['Имейл']] = r['Действие']; 
                userLastTime[r['Имейл']] = r['Време']; 
            }
        }); 
        let toCheckout = []; let now = new Date();
        for(let email in userState) {
            if(userState[email] === 'Влизане') {
                let loginTime = new Date(userLastTime[email]);
                if (loginTime.toDateString() !== now.toDateString() || (now.getHours() >= 17 && loginTime.getHours() < 17)) {
                    let checkoutTime = new Date(loginTime); checkoutTime.setHours(17, 0, 0, 0);
                    toCheckout.push({ 'Имейл': email, 'Действие': 'Авто излизане', 'Време': checkoutTime.toISOString(), 'Локация': 'Системно', 'Бележка': 'Авто корекция (Липсва излизане)' });
                }
            }
        }
        if(toCheckout.length > 0) { 
            await client.from('chekiraniya').insert(toCheckout); 
            
            const { data: pData } = await client.from('personal').select('Име, Имейл');
            let emailToName = {};
            if (pData) {
                pData.forEach(p => { emailToName[p['Имейл']] = p['Име']; });
            }
            
            for (let item of toCheckout) {
                let email = item['Имейл'];
                let name = emailToName[email];
                if (name) {
                    await client.from('otcheti').delete().eq('Оператор', name).eq('Статус', 'Започната');
                }
                await client.from('otcheti').delete().ilike('Оператор', `%${email}%`).eq('Статус', 'Започната');
            }
            
            loadCurrentTableData(); 
        }
    } catch(e) { console.error("Auto checkout error", e); }
}
