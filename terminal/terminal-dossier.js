// terminal-dossier.js - Достъп до лично досие, документи, отчетена работа и чекирания през терминала
// Защитено с индивидуален ПИН/парола за всеки оператор

const DOSIETA_STORAGE_URL = 'https://zdythzcgcjxwbxufunuh.supabase.co';
const DOSIETA_STORAGE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpkeXRoemNnY2p4d2J4dWZ1bnVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA2MTcxNTMsImV4cCI6MjA5NjE5MzE1M30.XGZX5DHhJCGz9X5s__3iuSghukjanyJmGKv8MLig_jE';

const termDosietaClient = (typeof supabase !== 'undefined' && supabase.createClient)
    ? supabase.createClient(DOSIETA_STORAGE_URL, DOSIETA_STORAGE_KEY)
    : client;

// Координати на цеха (за проверка на разстоянието при чекиране)
// WORKSHOP_LAT from terminal-core.js
// WORKSHOP_LNG from terminal-core.js

const TERM_DOC_CATEGORIES = {
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

let currentTermDocs = [];
let currentTermFilter = 'ALL';
let currentDossierActiveTab = 'docs';
let currentDossierEmail = '';
let currentDossierWorkerName = '';
let currentTermWork = [];
let currentTermAttendance = [];

function parseTermDocName(rawName) {
    let categoryKey = 'doc';
    let cleanName = rawName;

    if (rawName.includes('__')) {
        const parts = rawName.split('__');
        if (parts.length >= 3 && TERM_DOC_CATEGORIES[parts[0]]) {
            categoryKey = parts[0];
            cleanName = parts.slice(2).join('__');
        } else if (parts.length >= 2 && TERM_DOC_CATEGORIES[parts[0]]) {
            categoryKey = parts[0];
            cleanName = parts.slice(1).join('__');
        }
    } else {
        for (const key of Object.keys(TERM_DOC_CATEGORIES)) {
            if (rawName.toLowerCase().includes(key)) {
                categoryKey = key;
                break;
            }
        }
    }

    cleanName = cleanName.replace(/^\d{10,13}[_-]/, '');
    const catInfo = TERM_DOC_CATEGORIES[categoryKey] || TERM_DOC_CATEGORIES['doc'];
    return {
        rawName,
        categoryKey,
        catInfo,
        cleanName
    };
}

function formatTermFileSize(bytes) {
    if (!bytes || isNaN(bytes)) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

function getTermFileExtIcon(fileName) {
    const ext = (fileName || '').split('.').pop().toLowerCase();
    if (ext === 'pdf') return '📕';
    if (['doc', 'docx'].includes(ext)) return '📘';
    if (['xls', 'xlsx', 'csv'].includes(ext)) return '📗';
    if (['png', 'jpg', 'jpeg', 'webp'].includes(ext)) return '🖼️';
    return '📄';
}

function parseOrCalcDistance(item) {
    if (!item) return null;
    const note = String(item['Бележка'] || '');
    const loc = String(item['Локация'] || '').trim();

    // 1. Ако в бележката вече има записано разстояние (напр. 350м или 350 м)
    const match = note.match(/(\d+)\s*м/i);
    if (match) {
        return parseInt(match[1]);
    }

    // 2. Ако има координати, смятаме по Haversine формулата
    if (loc.includes(',')) {
        const parts = loc.split(',').map(s => parseFloat(s.trim()));
        if (!isNaN(parts[0]) && !isNaN(parts[1])) {
            const R = 6371e3;
            const p1 = parts[0] * Math.PI / 180;
            const p2 = WORKSHOP_LAT * Math.PI / 180;
            const dp = (WORKSHOP_LAT - parts[0]) * Math.PI / 180;
            const dl = (WORKSHOP_LNG - parts[1]) * Math.PI / 180;
            const a = Math.sin(dp / 2) * Math.sin(dp / 2) + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2);
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            return Math.round(R * c);
        }
    }
    return null;
}

// ========================================================
// Управление на табовете в Досието
// ========================================================
window.switchTermDossierTab = function(tabKey) {
    currentDossierActiveTab = tabKey;

    // Бутони
    document.querySelectorAll('.term-dossier-tab-btn').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.getElementById('tabBtn_' + tabKey);
    if (activeBtn) activeBtn.classList.add('active');

    // Контейнери
    const tabDocs = document.getElementById('termDossierTab_docs');
    const tabWork = document.getElementById('termDossierTab_work');
    const tabAttendance = document.getElementById('termDossierTab_attendance');

    if (tabDocs) tabDocs.style.display = (tabKey === 'docs') ? 'flex' : 'none';
    if (tabWork) tabWork.style.display = (tabKey === 'work') ? 'flex' : 'none';
    if (tabAttendance) tabAttendance.style.display = (tabKey === 'attendance') ? 'flex' : 'none';

    if (tabKey === 'docs') {
        loadTermDocs(currentDossierEmail);
    } else if (tabKey === 'work') {
        loadTermWork(currentDossierEmail, currentDossierWorkerName);
    } else if (tabKey === 'attendance') {
        loadTermAttendance(currentDossierEmail);
    }
};

// ========================================================
// Отваряне и валидация с парола
// ========================================================
async function openTerminalDossier(overrideEmail) {
    const email = (overrideEmail && overrideEmail.trim()) || currentEmail || localStorage.getItem('mes_email');
    if (!email) {
        Swal.fire({
            icon: 'warning',
            title: 'Няма избран оператор',
            text: 'Моля, първо задайте вашия профил в терминала.',
            confirmButtonColor: '#4338ca'
        });
        return;
    }

    // Изискваме парола / ПИН всеки път при натискане на Досие
    const { value: enteredPassword } = await Swal.fire({
        title: '🔒 Защитен достъп до лично досие',
        html: `<div style="font-size:0.9em; color:#64748b; margin-bottom:12px;">Оператор: <b>${currentOperator || email}</b></div>Въведете вашата индивидуална парола / ПИН:`,
        input: 'password',
        inputAttributes: {
            autocapitalize: 'off',
            autocorrect: 'off',
            placeholder: 'Въведете парола'
        },
        showCancelButton: true,
        confirmButtonText: 'ВХОД',
        cancelButtonText: 'Отказ',
        confirmButtonColor: '#4338ca',
        cancelButtonColor: '#64748b'
    });

    if (!enteredPassword) return;

    Swal.fire({ title: 'Проверка...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    try {
        const { data, error } = await termDosietaClient
            .from('personal')
            .select('password, Име')
            .eq('Имейл', email)
            .limit(1);

        if (error) throw error;

        if (!data || data.length === 0) {
            Swal.fire('Грешка', 'Не е намерен запис за вашия имейл.', 'error');
            return;
        }

        const expectedPassword = data[0].password;
        if (!expectedPassword) {
            Swal.fire({
                icon: 'info',
                title: 'Няма зададена парола',
                text: 'За вашия профил все още не е въведена индивидуална парола в базата. Моля, свържете се с администратор/мениджър.',
                confirmButtonColor: '#4338ca'
            });
            return;
        }

        if (enteredPassword.trim() !== expectedPassword.trim()) {
            Swal.fire({
                icon: 'error',
                title: 'Грешна парола!',
                text: 'Въведената парола не съвпада. Опитайте отново.',
                confirmButtonColor: '#dc2626'
            });
            return;
        }

        currentDossierEmail = email;
        currentDossierWorkerName = data[0]['Име'] || currentOperator || email;

        Swal.close();
    } catch (err) {
        Swal.fire('Грешка при проверка', err.message || 'Опитайте отново по-късно.', 'error');
        return;
    }

    // Отваряме модала и активираме началния таб
    const modal = document.getElementById('termDossierModalBackdrop');
    if (modal) {
        modal.style.display = 'flex';
        const nameSpan = document.getElementById('termDossierWorkerName');
        if (nameSpan) nameSpan.innerText = `${currentDossierWorkerName} (${currentDossierEmail})`;
        switchTermDossierTab('docs');
    }
}

function closeTerminalDossier() {
    const modal = document.getElementById('termDossierModalBackdrop');
    if (modal) modal.style.display = 'none';
}

// ========================================================
// ТАБ 1: ДОКУМЕНТИ И ФИШОВЕ
// ========================================================
async function loadTermDocs(email) {
    const listDiv = document.getElementById('termDocsList');
    if (!listDiv) return;
    listDiv.innerHTML = '<div style="text-align:center; padding:30px; color:#64748b;"><span style="font-size:1.4em;">⏳</span> Зареждане на вашите фишове и документи...</div>';

    try {
        const { data, error } = await termDosietaClient.storage.from('dosieta').list(email);
        if (error) throw error;

        currentTermDocs = (data || []).filter(f => f.name && f.name !== '.emptyFolderPlaceholder');
        currentTermDocs.sort((a, b) => new Date(b.created_at || b.updated_at || 0) - new Date(a.created_at || a.updated_at || 0));

        renderTermDocsList(email);
    } catch (err) {
        console.error('loadTermDocs error:', err);
        listDiv.innerHTML = `<div style="color:#b91c1c; text-align:center; padding:20px; background:#fef2f2; border-radius:8px;">⚠️ Грешка при зареждане: ${err.message || err}</div>`;
    }
}

function filterTermDocs(filterKey, btnEl) {
    currentTermFilter = filterKey;
    if (btnEl) {
        document.querySelectorAll('#termDocFilters .doc-filter-btn').forEach(b => b.classList.remove('active'));
        btnEl.classList.add('active');
    }
    const email = currentDossierEmail || currentEmail || localStorage.getItem('mes_email');
    renderTermDocsList(email);
}

function renderTermDocsList(email) {
    const listDiv = document.getElementById('termDocsList');
    if (!listDiv) return;

    let filtered = currentTermDocs;
    if (currentTermFilter !== 'ALL') {
        filtered = currentTermDocs.filter(f => {
            const parsed = parseTermDocName(f.name);
            return parsed.categoryKey === currentTermFilter;
        });
    }

    if (!filtered || filtered.length === 0) {
        listDiv.innerHTML = `
            <div style="text-align:center; padding:35px 20px; color:#94a3b8; background:white; border:1px dashed #cbd5e1; border-radius:12px;">
                <div style="font-size:2.2em; margin-bottom:8px;">📂</div>
                <div style="font-weight:700; color:#475569; font-size:0.95em;">Няма налични документи в тази категория</div>
                <div style="font-size:0.8em; color:#94a3b8; margin-top:4px;">Когато администратор качи фиш или договор в досието ви, той ще се появи тук.</div>
            </div>
        `;
        return;
    }

    let html = '<div style="display:flex; flex-direction:column; gap:8px;">';
    filtered.forEach(file => {
        const parsed = parseTermDocName(file.name);
        const icon = getTermFileExtIcon(parsed.cleanName);
        const cat = parsed.catInfo;
        const sizeStr = file.metadata && file.metadata.size ? formatTermFileSize(file.metadata.size) : '';
        const dateStr = file.created_at ? new Date(file.created_at).toLocaleString('bg-BG', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
        const publicUrl = `${DOSIETA_STORAGE_URL}/storage/v1/object/public/dosieta/${encodeURIComponent(email)}/${encodeURIComponent(file.name)}`;

        html += `
            <div style="background:white; border:1px solid #e2e8f0; border-radius:10px; padding:12px 14px; display:flex; justify-content:space-between; align-items:center; box-shadow:0 1px 3px rgba(0,0,0,0.03);">
                <div style="display:flex; align-items:center; gap:10px; min-width:0; flex:1;">
                    <span style="font-size:1.6em; line-height:1;">${icon}</span>
                    <div style="min-width:0;">
                        <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                            <span style="font-size:0.7em; font-weight:800; padding:2px 7px; border-radius:5px; background:${cat.badgeBg}; color:${cat.badgeColor}; border:1px solid ${cat.badgeBorder}; text-transform:uppercase;">
                                ${cat.icon} ${cat.label}
                            </span>
                            <div style="font-weight:700; color:#1e293b; font-size:0.9em; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:240px;" title="${parsed.cleanName}">
                                ${parsed.cleanName}
                            </div>
                        </div>
                        <div style="font-size:0.75em; color:#94a3b8; margin-top:3px; display:flex; gap:10px;">
                            ${dateStr ? `<span>🕒 ${dateStr}</span>` : ''}
                            ${sizeStr ? `<span>💾 ${sizeStr}</span>` : ''}
                        </div>
                    </div>
                </div>
                <div style="display:flex; gap:6px; flex-shrink:0; margin-left:8px;">
                    <a href="${publicUrl}" target="_blank" style="display:inline-flex; align-items:center; gap:3px; padding:6px 10px; border-radius:6px; background:#e0e7ff; color:#4338ca; text-decoration:none; font-size:0.8em; font-weight:800;">
                        👁️ Отвори
                    </a>
                    <a href="${publicUrl}" download="${parsed.cleanName}" style="display:inline-flex; align-items:center; gap:3px; padding:6px 10px; border-radius:6px; background:#f1f5f9; color:#475569; text-decoration:none; font-size:0.8em; font-weight:800;">
                        ⬇️ Свали
                    </a>
                </div>
            </div>
        `;
    });
    html += '</div>';
    listDiv.innerHTML = html;
}

// ========================================================
// ТАБ 2: СВЪРШЕНА РАБОТА (ОТЧЕТИ)
// ========================================================
async function loadTermWork(email, workerName) {
    const listDiv = document.getElementById('termWorkList');
    const badge = document.getElementById('termWorkTotalBadge');
    if (!listDiv) return;

    listDiv.innerHTML = '<div style="text-align:center; padding:30px; color:#64748b;"><span style="font-size:1.4em;">⏳</span> Зареждане на отчетената продукция...</div>';

    try {
        let query = client.from('otcheti').select('*');
        if (workerName && workerName.trim()) {
            query = query.ilike('Оператор', `%${workerName.trim()}%`);
        } else if (email) {
            query = query.ilike('Оператор', `%${email}%`);
        }

        const { data, error } = await query.order('Дата', { ascending: false }).limit(60);
        if (error) throw error;

        currentTermWork = data || [];
        renderTermWorkList();
    } catch (err) {
        console.error('loadTermWork error:', err);
        listDiv.innerHTML = `<div style="color:#b91c1c; text-align:center; padding:20px; background:#fef2f2; border-radius:8px;">⚠️ Грешка при зареждане: ${err.message || err}</div>`;
    }
}

function renderTermWorkList() {
    const listDiv = document.getElementById('termWorkList');
    const badge = document.getElementById('termWorkTotalBadge');
    if (!listDiv) return;

    if (!currentTermWork || currentTermWork.length === 0) {
        if (badge) badge.innerText = '0 бр. общо';
        listDiv.innerHTML = `
            <div style="text-align:center; padding:35px 20px; color:#94a3b8; background:white; border:1px dashed #cbd5e1; border-radius:12px;">
                <div style="font-size:2.2em; margin-bottom:8px;">🛠️</div>
                <div style="font-weight:700; color:#475569; font-size:0.95em;">Няма намерени отчети за вашия профил</div>
                <div style="font-size:0.8em; color:#94a3b8; margin-top:4px;">Когато отчитате изпълнени бройки на терминала, те ще се визуализират тук.</div>
            </div>
        `;
        return;
    }

    const totalQty = currentTermWork.reduce((sum, r) => sum + (parseFloat(r['Количество']) || 0), 0);
    if (badge) badge.innerText = `${totalQty} бр. общо (${currentTermWork.length} отчета)`;

    let html = '<div style="display:flex; flex-direction:column; gap:8px;">';
    currentTermWork.forEach(r => {
        const dateStr = r['Дата'] ? new Date(r['Дата']).toLocaleString('bg-BG', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
        const qty = parseFloat(r['Количество']) || 0;
        const status = String(r['Статус'] || 'Отчетено');

        let statusBadge = '';
        if (status === 'Брак') {
            statusBadge = `<span style="background:#fee2e2; color:#b91c1c; border:1px solid #fecaca; padding:2px 8px; border-radius:6px; font-size:0.75em; font-weight:800;">🔴 Брак</span>`;
        } else if (status === 'Авто-приключена') {
            statusBadge = `<span style="background:#fffbeb; color:#b45309; border:1px solid #fde68a; padding:2px 8px; border-radius:6px; font-size:0.75em; font-weight:800;">🕒 Авто</span>`;
        } else {
            statusBadge = `<span style="background:#dcfce7; color:#15803d; border:1px solid #bbf7d0; padding:2px 8px; border-radius:6px; font-size:0.75em; font-weight:800;">🟢 Отчетено</span>`;
        }

        html += `
            <div style="background:white; border:1px solid #e2e8f0; border-radius:10px; padding:12px 14px; display:flex; justify-content:space-between; align-items:center; box-shadow:0 1px 3px rgba(0,0,0,0.02);">
                <div style="min-width:0; flex:1;">
                    <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                        <span style="font-weight:900; color:#0f172a; font-size:0.95em;">${r['ID Детайл']}</span>
                        ${statusBadge}
                    </div>
                    <div style="font-size:0.82em; color:#475569; margin-top:3px;">
                        Операция: <b>${r['Операция'] || '–'}</b>
                    </div>
                    <div style="font-size:0.75em; color:#94a3b8; margin-top:3px;">
                        🕒 ${dateStr}
                    </div>
                </div>
                <div style="text-align:right; flex-shrink:0; margin-left:12px;">
                    <span style="background:#f0fdf4; border:1.5px solid #86efac; color:#166534; font-weight:900; font-size:1.05em; padding:4px 10px; border-radius:8px; display:inline-block;">
                        ${qty > 0 ? '+' + qty : qty} бр.
                    </span>
                </div>
            </div>
        `;
    });
    html += '</div>';
    listDiv.innerHTML = html;
}

// ========================================================
// ТАБ 3: ЧЕКИРАНИЯ (БЕЗ КЛИКАЕМА КАРТА, САМО МЕТРИ)
// ========================================================
async function loadTermAttendance(email) {
    const listDiv = document.getElementById('termAttendanceList');
    if (!listDiv) return;

    listDiv.innerHTML = '<div style="text-align:center; padding:30px; color:#64748b;"><span style="font-size:1.4em;">⏳</span> Зареждане на вашите чекирания...</div>';

    try {
        const { data, error } = await client
            .from('chekiraniya')
            .select('*')
            .eq('Имейл', email)
            .order('Време', { ascending: false })
            .limit(50);

        if (error) throw error;

        currentTermAttendance = data || [];
        renderTermAttendanceList();
    } catch (err) {
        console.error('loadTermAttendance error:', err);
        listDiv.innerHTML = `<div style="color:#b91c1c; text-align:center; padding:20px; background:#fef2f2; border-radius:8px;">⚠️ Грешка при зареждане: ${err.message || err}</div>`;
    }
}

function renderTermAttendanceList() {
    const listDiv = document.getElementById('termAttendanceList');
    if (!listDiv) return;

    if (!currentTermAttendance || currentTermAttendance.length === 0) {
        listDiv.innerHTML = `
            <div style="text-align:center; padding:35px 20px; color:#94a3b8; background:white; border:1px dashed #cbd5e1; border-radius:12px;">
                <div style="font-size:2.2em; margin-bottom:8px;">🕒</div>
                <div style="font-weight:700; color:#475569; font-size:0.95em;">Няма намерени чекирания за вашия имейл</div>
                <div style="font-size:0.8em; color:#94a3b8; margin-top:4px;">Чекиранията за вход и изход от смяна ще се появят тук.</div>
            </div>
        `;
        return;
    }

    let html = '<div style="display:flex; flex-direction:column; gap:8px;">';
    currentTermAttendance.forEach(item => {
        const timeStr = item['Време'] ? new Date(item['Време']).toLocaleString('bg-BG', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
        const action = String(item['Действие'] || '');
        const note = String(item['Бележка'] || '');
        const loc = String(item['Локация'] || '').trim();

        let actionHtml = '';
        if (action === 'Влизане') {
            actionHtml = `<span style="background:#dcfce7; color:#15803d; border:1px solid #bbf7d0; padding:3px 10px; border-radius:14px; font-weight:800; font-size:0.82em;">🟢 Влизане</span>`;
        } else if (action === 'Излизане') {
            actionHtml = `<span style="background:#fee2e2; color:#b91c1c; border:1px solid #fecaca; padding:3px 10px; border-radius:14px; font-weight:800; font-size:0.82em;">🔴 Излизане</span>`;
        } else {
            actionHtml = `<span style="background:#fef3c7; color:#b45309; border:1px solid #fde68a; padding:3px 10px; border-radius:14px; font-weight:800; font-size:0.82em;">🕒 Авто излизане</span>`;
        }

        // Изчисляване на разстояние БЕЗ КЛИКАЕМА КАРТА
        const dist = parseOrCalcDistance(item);
        let locBadgeHtml = '';

        if (loc.toLowerCase().includes('отказан') || note.includes('ЛИПСВА ЛОКАЦИЯ')) {
            locBadgeHtml = `<span style="background:#fef2f2; color:#991b1b; border:1px solid #fecaca; padding:4px 9px; border-radius:6px; font-size:0.8em; font-weight:700;">⚠️ Без GPS</span>`;
        } else if ((dist !== null && dist > 200) || note.includes('ИЗВЪН ОБЕКТА')) {
            const metersText = dist ? `${dist} м` : 'над 200 м';
            locBadgeHtml = `<span style="background:#fef2f2; color:#b91c1c; border:1.5px solid #fca5a5; padding:4px 10px; border-radius:6px; font-size:0.82em; font-weight:800;">⚠️ Извън обекта (${metersText})</span>`;
        } else {
            locBadgeHtml = `<span style="background:#f0fdf4; color:#15803d; border:1px solid #bbf7d0; padding:4px 10px; border-radius:6px; font-size:0.82em; font-weight:800;">✅ В обекта</span>`;
        }

        html += `
            <div style="background:white; border:1px solid #e2e8f0; border-radius:10px; padding:12px 14px; display:flex; justify-content:space-between; align-items:center; box-shadow:0 1px 3px rgba(0,0,0,0.02);">
                <div>
                    <div style="display:flex; align-items:center; gap:8px;">
                        ${actionHtml}
                        <span style="font-weight:800; color:#1e293b; font-size:0.92em;">${timeStr}</span>
                    </div>
                </div>
                <div>
                    ${locBadgeHtml}
                </div>
            </div>
        `;
    });
    html += '</div>';
    listDiv.innerHTML = html;
}
