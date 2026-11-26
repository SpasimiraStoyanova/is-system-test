// terminal-dossier.js - Достъп до лично досие, документи, отчетена работа и чекирания през терминала
// Защитено с индивидуален ПИН/парола за всеки оператор

const DOSIETA_STORAGE_URL = 'https://zdythzcgcjxwbxufunuh.supabase.co';
const DOSIETA_STORAGE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpkeXRoemNnY2p4d2J4dWZ1bnVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA2MTcxNTMsImV4cCI6MjA5NjE5MzE1M30.XGZX5DHhJCGz9X5s__3iuSghukjanyJmGKv8MLig_jE';

const termDosietaClient = (typeof supabase !== 'undefined' && supabase.createClient)
    ? supabase.createClient(DOSIETA_STORAGE_URL, DOSIETA_STORAGE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
    : client;

// Координати на цеха (за проверка на разстоянието при чекиране)
const DOSSIER_WORKSHOP_LAT = 41.893865;
const DOSSIER_WORKSHOP_LNG = 23.487354;

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
            const wLat = (typeof WORKSHOP_LAT !== 'undefined') ? WORKSHOP_LAT : DOSSIER_WORKSHOP_LAT;
            const wLng = (typeof WORKSHOP_LNG !== 'undefined') ? WORKSHOP_LNG : DOSSIER_WORKSHOP_LNG;
            const R = 6371e3;
            const p1 = parts[0] * Math.PI / 180;
            const p2 = wLat * Math.PI / 180;
            const dp = (wLat - parts[0]) * Math.PI / 180;
            const dl = (wLng - parts[1]) * Math.PI / 180;
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
window.switchTermDossierTab = function (tabKey) {
    currentDossierActiveTab = tabKey;

    // Бутони
    document.querySelectorAll('.term-dossier-tab-btn').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.getElementById('tabBtn_' + tabKey);
    if (activeBtn) activeBtn.classList.add('active');

    // Контейнери
    const tabDocs = document.getElementById('termDossierTab_docs');
    const tabSalary = document.getElementById('termDossierTab_salary');
    const tabWork = document.getElementById('termDossierTab_work');
    const tabAttendance = document.getElementById('termDossierTab_attendance');
    const tabProtocols = document.getElementById('termDossierTab_protocols');

    if (tabDocs) tabDocs.style.display = (tabKey === 'docs') ? 'flex' : 'none';
    if (tabSalary) tabSalary.style.display = (tabKey === 'salary') ? 'flex' : 'none';
    if (tabWork) tabWork.style.display = (tabKey === 'work') ? 'flex' : 'none';
    if (tabAttendance) tabAttendance.style.display = (tabKey === 'attendance') ? 'flex' : 'none';
    if (tabProtocols) tabProtocols.style.display = (tabKey === 'protocols') ? 'flex' : 'none';

    if (tabKey === 'docs') {
        loadTermDocs(currentDossierEmail);
    } else if (tabKey === 'salary') {
        loadTermSalary(currentDossierEmail);
    } else if (tabKey === 'work') {
        loadTermWork(currentDossierEmail, currentDossierWorkerName);
    } else if (tabKey === 'attendance') {
        loadTermAttendance(currentDossierEmail);
    } else if (tabKey === 'protocols') {
        if (typeof loadTermEquipmentProtocols === 'function') {
            loadTermEquipmentProtocols(currentDossierEmail);
        }
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
        const parsedDate = r['Дата'] ? ((typeof window.parseSafeUtcDate === 'function') ? window.parseSafeUtcDate(r['Дата']) : new Date(r['Дата'])) : null;
        const dateStr = parsedDate ? parsedDate.toLocaleString('bg-BG', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
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

// ========================================================
// 💰 Личен дигитален картон (на живо) & Електронен фиш в терминала
// ========================================================
let currentWorkerSalaryLogs = [];
const DOSSIER_MONTHS_BG = [
    'Януари', 'Февруари', 'Март', 'Април', 'Май', 'Юни',
    'Юли', 'Август', 'Септември', 'Октомври', 'Ноември', 'Декември'
];

function dossierNorm(str) {
    return String(str || '').replace(/[\u00A0\s]+/g, ' ').trim().toLowerCase();
}

function dossierEsc(str) {
    return String(str == null ? '' : str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function parseDossierUtcDate(raw) {
    if (!raw) return null;
    let s = String(raw).trim();
    if (!s) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
        const [y, m, d] = s.split('-').map(Number);
        return new Date(y, m - 1, d, 12, 0, 0);
    }
    if (!s.endsWith('Z') && !s.includes('+') && !/\-\d{2}:?\d{2}$/.test(s)) {
        s += 'Z';
    }
    const dt = new Date(s);
    return isNaN(dt.getTime()) ? null : dt;
}

function toDossierLocalIso(raw) {
    const dt = raw instanceof Date ? raw : parseDossierUtcDate(raw);
    if (!dt) return '';
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

async function buildLiveDigitalCardHtml(email, workerName) {
    const now = new Date();
    const year = now.getFullYear();
    const monthIdx = now.getMonth();
    const monthName = DOSSIER_MONTHS_BG[monthIdx];
    const todayIso = toDossierLocalIso(now);

    const qFrom = new Date(Date.UTC(year, monthIdx, 0, 0, 0, 0)).toISOString();
    const qTo = new Date(Date.UTC(year, monthIdx + 1, 2, 23, 59, 59, 999)).toISOString();

    const targetEmail = dossierNorm(email);
    const targetNameNorm = dossierNorm(workerName);

    const [persRes, checkRes, otchRes, auditsRes, workers3sRes, draftLogsRes] = await Promise.all([
        termDosietaClient.from('personal').select('*').ilike('Имейл', targetEmail).limit(1),
        termDosietaClient.from('chekiraniya').select('*').gte('Време', qFrom).lte('Време', qTo).order('Време', { ascending: true }).limit(20000),
        termDosietaClient.from('otcheti').select('id, "ID Детайл", "Операция", "Количество", "Оператор", "Статус", "Дата"').gte('Дата', qFrom).lte('Дата', qTo).limit(20000),
        termDosietaClient.from('audit_3s_logs').select('*').gte('created_at', qFrom).lte('created_at', qTo).order('created_at', { ascending: false }).limit(2000),
        termDosietaClient.from('audit_3s_workers').select('*').eq('is_active', true),
        termDosietaClient.from('salary_monthly_logs').select('*').eq('month', monthName).eq('year', year)
    ]);

    const workerRow = (persRes.data && persRes.data[0]) ? persRes.data[0] : {};
    const displayName = String(workerRow['Име'] || workerName || email).trim();
    const displayNameNorm = dossierNorm(displayName);
    const baseBonus = parseFloat(workerRow['Базов бонус']) || 0;

    const allChecks = (checkRes.data || []).filter(c => {
        const d = parseDossierUtcDate(c['Време']);
        return d && d.getFullYear() === year && d.getMonth() === monthIdx;
    });
    const allOtcheti = (otchRes.data || []).filter(o => {
        const d = parseDossierUtcDate(o['Дата']);
        return d && d.getFullYear() === year && d.getMonth() === monthIdx;
    });
    const allAudits = (auditsRes.data || []).filter(a => {
        const d = parseDossierUtcDate(a.audit_date || a.created_at);
        return d && d.getFullYear() === year && d.getMonth() === monthIdx;
    });

    const draftLogs = draftLogsRes.data || [];
    let monthConfig = null;
    let workerDraft = null;
    draftLogs.forEach(s => {
        if (s.details_json && s.details_json.monthConfig && !monthConfig) {
            monthConfig = s.details_json.monthConfig;
        }
        if (s.worker_email && dossierNorm(s.worker_email) === targetEmail) {
            workerDraft = s;
        }
    });
    const draftDetails = (workerDraft && workerDraft.details_json) ? workerDraft.details_json : {};

    // Колективни почивни дни / база дни
    const checkinsByDate = {};
    allChecks.forEach(c => {
        if (c['Действие'] !== 'Влизане') return;
        const iso = toDossierLocalIso(c['Време']);
        const em = dossierNorm(c['Имейл']);
        if (iso && em) {
            if (!checkinsByDate[iso]) checkinsByDate[iso] = new Set();
            checkinsByDate[iso].add(em);
        }
    });
    const activeDates = Object.keys(checkinsByDate).sort();
    const peakCount = activeDates.reduce((m, iso) => Math.max(m, checkinsByDate[iso].size), 0);
    const plantThresh = peakCount >= 3 ? Math.max(2, Math.floor(peakCount * 0.2)) : 1;

    const totalDaysInMonth = new Date(year, monthIdx + 1, 0).getDate();
    const autoOffDates = [];
    if (activeDates.length >= 2) {
        for (let dNum = 1; dNum <= totalDaysInMonth; dNum++) {
            const dt = new Date(year, monthIdx, dNum, 12, 0, 0);
            if (dt.getDay() === 0 || dt.getDay() === 6) continue;
            const iso = toDossierLocalIso(dt);
            if (iso >= todayIso) continue;
            const cnt = checkinsByDate[iso] ? checkinsByDate[iso].size : 0;
            if (cnt < plantThresh) autoOffDates.push(iso);
        }
    }

    const nominalDays = (monthConfig && monthConfig.nominalDays) ? Number(monthConfig.nominalDays) : 20;
    const offDatesList = (monthConfig && Array.isArray(monthConfig.manualCollectiveOffDates))
        ? monthConfig.manualCollectiveOffDates
        : autoOffDates;
    const offSet = new Set(offDatesList);
    const effectiveBaseDays = (monthConfig && monthConfig.effectiveBaseDays)
        ? Number(monthConfig.effectiveBaseDays)
        : Math.max(1, nominalDays - offSet.size);

    // Лични чекирания, часове и закъснения (> 08:00 ч.)
    const myChecks = allChecks.filter(c => dossierNorm(c['Имейл']) === targetEmail);
    const presentDates = new Set();
    const firstInByDate = {};
    const lastOutByDate = {};
    const lates = [];

    myChecks.forEach(c => {
        const d = parseDossierUtcDate(c['Време']);
        if (!d) return;
        const iso = toDossierLocalIso(d);
        const act = String(c['Действие'] || '').trim();
        if (act === 'Влизане') {
            presentDates.add(iso);
            if (!firstInByDate[iso] || d < firstInByDate[iso]) firstInByDate[iso] = d;
        } else if (act === 'Излизане' || act === 'Авто излизане') {
            if (!lastOutByDate[iso] || d > lastOutByDate[iso]) lastOutByDate[iso] = d;
        }
    });

    let workedHours = 0;
    Object.keys(firstInByDate).sort().forEach(iso => {
        const dIn = firstInByDate[iso];
        const dOut = lastOutByDate[iso];
        workedHours += (dOut && dOut > dIn) ? Math.min(14, Math.max(0.5, (dOut - dIn) / 3600000)) : 8;
        const totalMins = dIn.getHours() * 60 + dIn.getMinutes();
        if (totalMins > 480) { // след 08:00 ч.
            lates.push({
                isoDate: iso,
                dateStr: dIn.toLocaleDateString('bg-BG'),
                timeStr: dIn.toLocaleTimeString('bg-BG', { hour: '2-digit', minute: '2-digit' }),
                minutesLate: totalMins - 480,
                isExcused: false,
                excuseNote: ''
            });
        }
    });

    const savedLates = Array.isArray(draftDetails.lates) ? draftDetails.lates : [];
    lates.forEach(l => {
        const sl = savedLates.find(s => (s.isoDate && s.isoDate === l.isoDate) || (s.dateStr === l.dateStr && s.timeStr === l.timeStr));
        if (sl && sl.isExcused) { l.isExcused = true; l.excuseNote = sl.excuseNote || 'Оправдано'; }
    });

    // Отчети: непопълнен дневен отчет + брак по вина на оператора
    const myOtcheti = allOtcheti.filter(o => {
        const op = dossierNorm(o['Оператор']);
        return op === targetEmail || op === displayNameNorm || (displayNameNorm.length >= 3 && op.includes(displayNameNorm));
    });
    const reportedDates = new Set();
    const myScrapFaults = [];
    const scrapFaultMap = draftDetails.scrapFaultMap || {};

    myOtcheti.forEach(o => {
        const iso = toDossierLocalIso(o['Дата']);
        if (iso) reportedDates.add(iso);
        if (String(o['Статус'] || '').trim() === 'Брак' && scrapFaultMap[String(o.id)] && scrapFaultMap[String(o.id)].isOperatorFault) {
            myScrapFaults.push({ dateStr: iso, part: o['ID Детайл'] || '', qty: o['Количество'] || 0 });
        }
    });

    const missingReports = [];
    Array.from(presentDates).sort().forEach(iso => {
        if (iso >= todayIso || offSet.has(iso)) return;
        if (!reportedDates.has(iso)) {
            missingReports.push({ isoDate: iso, dateStr: iso.split('-').reverse().join('.'), isExcused: false });
        }
    });
    const savedMissing = Array.isArray(draftDetails.missingReports) ? draftDetails.missingReports : [];
    missingReports.forEach(m => {
        const sm = savedMissing.find(s => s.isoDate === m.isoDate);
        if (sm && sm.isExcused) { m.isExcused = true; m.excuseNote = sm.excuseNote || 'Оправдано'; }
    });

    const wrongReports = Array.isArray(draftDetails.wrongReports) ? draftDetails.wrongReports : [];
    const manualScraps = Array.isArray(draftDetails.manualScrapEvents) ? draftDetails.manualScrapEvents : [];
    const adminViolations = Array.isArray(draftDetails.adminViolations) ? draftDetails.adminViolations : [];

    const unexcusedLatesCount = lates.filter(l => !l.isExcused).length;
    const unexcusedMissingCount = missingReports.filter(m => !m.isExcused).length;
    const totalScrapFaultCount = myScrapFaults.length + manualScraps.length;

    const lateDed = Math.max(0, unexcusedLatesCount - 3) * 10;
    const missDed = Math.max(0, unexcusedMissingCount - 2) * 8;
    const wrongDed = wrongReports.length * 5;
    const scrapDed = totalScrapFaultCount * 15;
    const adminDed = adminViolations.length * 15;
    const disciplinePts = Math.max(0, 100 - (lateDed + missDed + wrongDed + scrapDed + adminDed));

    // 3S Одити + Звено
    const worker3sRow = (workers3sRes.data || []).find(w => dossierNorm(w.worker_name) === displayNameNorm || dossierNorm(w.worker_name) === targetNameNorm);
    const savedIndState = Array.isArray(draftDetails.indAuditsState) ? draftDetails.indAuditsState : [];
    const myIndAudits = allAudits
        .filter(a => a.target_type !== 'area' && (dossierNorm(a.target_name) === targetEmail || dossierNorm(a.target_name) === displayNameNorm))
        .map(a => {
            const st = savedIndState.find(s => s.id === a.id);
            return { ...a, isExcused: !!(st && st.isExcused) };
        });

    const mySector = (worker3sRow && worker3sRow.sector) ? worker3sRow.sector : (myIndAudits[0] ? myIndAudits[0].sector : '');
    const myAreaAudits = mySector ? allAudits.filter(a => a.target_type === 'area' && dossierNorm(a.sector) === dossierNorm(mySector)) : [];

    const activeInd = myIndAudits.filter(a => !a.isExcused);
    const hasIndAuditData = myIndAudits.length > 0 || (draftDetails.manual3sInd !== undefined && draftDetails.manual3sInd !== null);
    const hasAreaAuditData = myAreaAudits.length > 0 || (draftDetails.manual3sArea !== undefined && draftDetails.manual3sArea !== null);
    const indPts = (draftDetails.manual3sInd !== undefined && draftDetails.manual3sInd !== null)
        ? Number(draftDetails.manual3sInd)
        : (activeInd.length > 0
            ? Math.round((activeInd.reduce((s, a) => s + ((parseFloat(a.percentage) || 0) / 100) * 60, 0) / activeInd.length) * 10) / 10
            : (myIndAudits.length > 0 ? 60 : 0));
    const areaPts = (draftDetails.manual3sArea !== undefined && draftDetails.manual3sArea !== null)
        ? Number(draftDetails.manual3sArea)
        : (myAreaAudits.length > 0
            ? Math.round((myAreaAudits.reduce((s, a) => s + ((parseFloat(a.percentage) || 0) / 100) * 12, 0) / myAreaAudits.length) * 10) / 10
            : 0);
    const total3sPts = Math.min(72, Math.round((indPts + areaPts) * 10) / 10);
    const no3sAuditAtAll = !hasIndAuditData && !hasAreaAuditData;

    const workedDays = (draftDetails.manualWorkedDays !== undefined && draftDetails.manualWorkedDays !== null) ? Number(draftDetails.manualWorkedDays) : presentDates.size;
    const attCoeff = Math.min(1.0, Math.round((workedDays / Math.max(1, effectiveBaseDays)) * 100) / 100);
    const mgrPct = (draftDetails.managerScorePct !== undefined && draftDetails.managerScorePct !== null) ? Number(draftDetails.managerScorePct) : 100;
    const rewards = Array.isArray(draftDetails.rewards) ? draftDetails.rewards : [];
    const rewardsSum = (draftDetails.totalRewardsEur !== undefined) ? Number(draftDetails.totalRewardsEur) : rewards.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);

    const estCore = baseBonus * attCoeff * (0.30 * (total3sPts / 72) + 0.60 * (disciplinePts / 100) + 0.10 * (mgrPct / 100));
    const estTotal = Math.max(0, Math.round((estCore + rewardsSum) * 100) / 100);

    const renderAuditItem = (a, isArea) => {
        const answersList = Array.isArray(a.answers) ? a.answers : [];
        const checklistHtml = answersList.length > 0 ? `
            <details style="margin-top:6px;">
                <summary style="cursor:pointer; font-size:0.8em; font-weight:700; color:#4338ca;">📋 Виж чек-листа (${answersList.length} въпроса)</summary>
                <div style="margin-top:4px; display:flex; flex-direction:column; gap:3px; padding-left:8px; border-left:2px solid #c7d2fe;">
                    ${answersList.map(ans => `<div style="font-size:0.78em; color:#334155;"><b>${dossierEsc(ans.question_code || '')}</b> ${dossierEsc(ans.question_title || '')}: <b>${ans.points ?? '-'} / 4 т.</b></div>`).join('')}
                </div>
            </details>` : '';
        return `
            <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:8px 10px; margin-top:6px;">
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px;">
                    <span style="font-weight:800; font-size:0.84em; color:#1e293b;">${isArea ? '🏭 Обща зона' : '👤 Работно място'} • ${dossierEsc(a.audit_date || (a.created_at || '').split('T')[0])}${a.isExcused ? ' (🕊️ Оправдан)' : ''}</span>
                    <span style="font-weight:900; color:${(a.percentage || 0) >= 80 ? '#15803d' : '#dc2626'}; font-size:0.86em;">${a.percentage}% (${a.total_points}/${a.max_points} т.)</span>
                </div>
                ${a.notes ? `<div style="font-size:0.8em; color:#475569; margin-top:3px;">💬 ${dossierEsc(a.notes)}</div>` : ''}
                ${a.photo_url ? `<div style="margin-top:5px;"><a href="${dossierEsc(a.photo_url)}" target="_blank" style="display:inline-flex; align-items:center; gap:4px; background:#eff6ff; color:#1d4ed8; padding:3px 8px; border-radius:5px; font-size:0.78em; font-weight:800; text-decoration:none; border:1px solid #bfdbfe;">🖼️ Отвори снимка от одита</a></div>` : ''}
                ${checklistHtml}
            </div>
        `;
    };

    const allAuditsMerged = [
        ...myIndAudits.map(a => renderAuditItem(a, false)),
        ...myAreaAudits.map(a => renderAuditItem(a, true))
    ].join('');

    return `
        <div style="background:white; border:1.5px solid #c7d2fe; border-radius:12px; padding:16px; margin:0 auto 14px auto; max-width:640px; box-shadow:0 3px 10px rgba(67,56,202,0.08);">
            <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1.5px solid #eef2ff; padding-bottom:10px; margin-bottom:12px; flex-wrap:wrap; gap:8px;">
                <div>
                    <div style="font-weight:900; color:#312e81; font-size:1.05em;">📡 Личен дигитален картон (На живо)</div>
                    <div style="font-size:0.8em; color:#64748b;">Текущ месец: <b>${monthName} ${year} г.</b>${mySector ? ` • Звено: <b>${dossierEsc(mySector)}</b>` : ''}</div>
                </div>
                <span style="background:#eef2ff; color:#4338ca; padding:3px 10px; border-radius:999px; font-size:0.76em; font-weight:800;">
                    📅 ${workedDays} / ${effectiveBaseDays} дни (× ${attCoeff.toFixed(2)}) • ${Math.round(workedHours * 10) / 10} ч.
                </span>
            </div>

            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(130px, 1fr)); gap:8px; margin-bottom:12px;">
                <div style="background:${no3sAuditAtAll ? '#f8fafc' : (total3sPts >= 64 ? '#f0fdf4' : '#fffbeb')}; border:1px solid ${no3sAuditAtAll ? '#cbd5e1' : (total3sPts >= 64 ? '#bbf7d0' : '#fde68a')}; border-radius:8px; padding:9px; text-align:center;">
                    <div style="font-size:0.72em; font-weight:800; color:${no3sAuditAtAll ? '#64748b' : '#166534'};">🧹 3S ОДИТ (30%)</div>
                    <div style="font-size:1.25em; font-weight:900; color:${no3sAuditAtAll ? '#475569' : '#15803d'};">${total3sPts} / 72 т.</div>
                    <div style="font-size:0.72em; color:${no3sAuditAtAll ? '#64748b' : '#166534'};">${no3sAuditAtAll ? 'Няма одит' : `Инд. ${indPts}/60 • Зона ${areaPts}/12`}</div>
                </div>
                <div style="background:${disciplinePts < 100 ? '#fef2f2' : '#f0fdf4'}; border:1px solid ${disciplinePts < 100 ? '#fecaca' : '#bbf7d0'}; border-radius:8px; padding:9px; text-align:center;">
                    <div style="font-size:0.72em; font-weight:800; color:${disciplinePts < 100 ? '#991b1b' : '#166534'};">⚖️ ДИСЦИПЛИНА (60%)</div>
                    <div style="font-size:1.25em; font-weight:900; color:${disciplinePts < 100 ? '#dc2626' : '#15803d'};">${disciplinePts} / 100 т.</div>
                    <div style="font-size:0.72em; color:#64748b;">Закъсн.: ${unexcusedLatesCount}/3 • Отч.: ${unexcusedMissingCount}/2</div>
                </div>
                <div style="background:#f8fafc; border:1px solid #cbd5e1; border-radius:8px; padding:9px; text-align:center;">
                    <div style="font-size:0.72em; font-weight:800; color:#475569;">👔 РЪКОВОДИТЕЛ (10%)</div>
                    <div style="font-size:1.25em; font-weight:900; color:#1e293b;">${mgrPct}%</div>
                    <div style="font-size:0.72em; color:#64748b;">Поощрения: +${rewardsSum.toFixed(2)} €</div>
                </div>
                <div style="background:#eef2ff; border:1.5px solid #a5b4fc; border-radius:8px; padding:9px; text-align:center;">
                    <div style="font-size:0.72em; font-weight:800; color:#3730a3;">💶 ПРОГНОЗА СЕГА</div>
                    <div style="font-size:1.25em; font-weight:900; color:#4338ca;">${estTotal.toFixed(2)} €</div>
                    <div style="font-size:0.72em; color:#4338ca;">при база ${baseBonus.toFixed(0)} €</div>
                </div>
            </div>

            <div style="font-size:0.82em; color:#334155; background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:8px 10px; margin-bottom:8px;">
                <b>Регистър Дисциплина:</b>
                ${lates.length > 0 ? `<div>• Закъснения (&gt;08:00): ${lates.map((l, idx) => `${l.dateStr} (${l.timeStr})${l.isExcused ? ' [опр.]' : (idx < 3 ? ' [толеранс]' : ' [-10т]')}`).join(', ')}</div>` : '<div>• Закъснения: 0 (🟢 без закъснения)</div>'}
                ${missingReports.length > 0 ? `<div>• Дни без отчет: ${missingReports.map(m => `${m.dateStr}${m.isExcused ? ' [опр.]' : ''}`).join(', ')}</div>` : '<div>• Пропуснати дневни отчети: 0</div>'}
                ${wrongReports.length > 0 ? `<div>• Грешни отчети: ${wrongReports.length} бр. (-${wrongDed} т.)</div>` : ''}
                ${totalScrapFaultCount > 0 ? `<div>• Брак по вина на оператора: ${totalScrapFaultCount} бр. (-${scrapDed} т.)</div>` : ''}
                ${adminViolations.length > 0 ? `<div>• Адм. нарушения: ${adminViolations.length} бр. (-${adminDed} т.)</div>` : ''}
            </div>

            <div>
                <div style="font-size:0.82em; font-weight:800; color:#334155;">📸 3S Одити и снимки за ${monthName}:</div>
                ${allAuditsMerged || '<div style="font-size:0.8em; color:#64748b; padding:6px 0;">Все още няма въведени 3S одити за този месец.</div>'}
            </div>
        </div>
    `;
}

window.loadTermSalary = async function (email) {
    const contentDiv = document.getElementById('termSalaryContent');
    const filterWrap = document.getElementById('termSalaryMonthFilterWrap');
    if (!contentDiv) return;

    contentDiv.innerHTML = `<div style="text-align: center; color: #64748b; padding: 30px 10px;">⏳ Зареждане на личния картон и фишове...</div>`;

    try {
        const targetEmail = (email || '').toLowerCase().trim();
        const [liveHtml, salaryRes] = await Promise.all([
            buildLiveDigitalCardHtml(targetEmail, currentDossierWorkerName).catch(e => {
                console.warn('Live digital card error:', e);
                return '';
            }),
            termDosietaClient
                .from('salary_monthly_logs')
                .select('*')
                .ilike('worker_email', targetEmail)
                .eq('status', 'Одобрено')
                .order('year', { ascending: false })
        ]);

        if (salaryRes.error) throw salaryRes.error;
        currentWorkerSalaryLogs = salaryRes.data || [];

        if (currentWorkerSalaryLogs.length === 0) {
            if (filterWrap) filterWrap.innerHTML = '';
            contentDiv.innerHTML = `
                ${liveHtml}
                <div style="text-align: center; padding: 24px 16px; background: white; border: 1px dashed #cbd5e1; border-radius: 12px; max-width: 640px; margin: 0 auto;">
                    <div style="font-size: 2em; margin-bottom: 6px;">💶</div>
                    <div style="font-weight: 800; color: #334155; font-size: 0.98em;">Все още няма одобрен краен фиш за минали месеци</div>
                    <div style="font-size: 0.82em; color: #64748b; margin-top: 4px;">
                        Когато ръководството одобри месечната ведомост, финалният фиш ще се появи тук.
                    </div>
                </div>
            `;
            return;
        }

        if (filterWrap) {
            filterWrap.innerHTML = `
                <select id="selTermSalaryMonth" onchange="renderSelectedWorkerPayslip(this.value)" style="padding: 4px 10px; border-radius: 6px; border: 1.5px solid #86efac; font-weight: 800; background: #fff; color: #166534; font-size: 0.85em; outline: none;">
                    ${currentWorkerSalaryLogs.map((log, idx) => `
                        <option value="${idx}">📅 ${log.month} ${log.year} г.</option>
                    `).join('')}
                </select>
            `;
        }

        window._termLiveDigitalCardHtml = liveHtml;
        renderSelectedWorkerPayslip(0);
    } catch (err) {
        console.error('loadTermSalary error:', err);
        contentDiv.innerHTML = `<div style="color: #b91c1c; text-align: center; padding: 20px; background: #fef2f2; border-radius: 8px;">⚠️ Грешка при зареждане: ${err.message || err}</div>`;
    }
};

window.renderSelectedWorkerPayslip = function (index) {
    const contentDiv = document.getElementById('termSalaryContent');
    if (!contentDiv || !currentWorkerSalaryLogs[index]) return;

    const liveCardHtml = window._termLiveDigitalCardHtml || '';
    const log = currentWorkerSalaryLogs[index];
    const details = log.details_json || {};
    const baseBonus = Number(log.base_bonus || 0);
    const finalPayout = Number(log.final_payout || 0);
    const isV2 = details.formulaVersion === 2;

    if (isV2) {
        const workedDays = Number(details.workedDays ?? 0);
        const baseDays = Number(details.baseWorkingDays ?? 20);
        const attCoeff = Number(details.attendanceCoeff ?? 1);
        const s3sInd = Number(details.score3sIndPoints ?? 0);
        const s3sArea = Number(details.score3sAreaPoints ?? 0);
        const s3sTot = Number(details.score3sTotalPoints ?? 0);
        const eur3s = Number(details.eur3sTotal ?? 0);
        const discPts = Number(details.disciplinePoints ?? 100);
        const eurDisc = Number(details.eurDiscipline ?? 0);
        const mgrPct = Number(details.managerScorePct ?? 100);
        const eurMgr = Number(details.eurManager ?? 0);
        const eurRew = Number(details.totalRewardsEur ?? 0);

        contentDiv.innerHTML = `
            ${liveCardHtml}
            <div style="background: white; border: 1px solid #e2e8f0; border-radius: 12px; padding: 18px; box-shadow: 0 2px 5px rgba(0,0,0,0.03); max-width: 640px; margin: 0 auto;">
                <div style="border-bottom: 2px solid #f1f5f9; padding-bottom: 10px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
                    <div>
                        <div style="font-weight: 900; font-size: 1.1em; color: #1e3a8a;">📜 Одобрен Фиш: ${dossierEsc(log.month)} ${log.year} г.</div>
                        <div style="font-size: 0.82em; color: #64748b;">Базова премия: <b>${baseBonus.toFixed(2)} €</b> • Присъствие: <b>${workedDays}/${baseDays} д. (× ${attCoeff.toFixed(2)})</b></div>
                    </div>
                    <span style="background: #dcfce7; color: #15803d; border: 1px solid #86efac; padding: 3px 10px; border-radius: 9999px; font-weight: 800; font-size: 0.78em;">🟢 Одобрен</span>
                </div>
                <div style="display: flex; flex-direction: column; gap: 7px; font-size: 0.88em;">
                    <div style="display:flex; justify-content:space-between; padding:7px 10px; background:#f8fafc; border-radius:6px;">
                        <span>🧹 3S Одит (30%): <b>${s3sTot}/72 т.</b> (Инд. ${s3sInd}/60 + Зона ${s3sArea}/12)</span>
                        <b style="color:#15803d;">+${eur3s.toFixed(2)} €</b>
                    </div>
                    <div style="display:flex; justify-content:space-between; padding:7px 10px; background:#f8fafc; border-radius:6px;">
                        <span>⚖️ Дисциплина (60%): <b>${discPts}/100 т.</b></span>
                        <b style="color:#15803d;">+${eurDisc.toFixed(2)} €</b>
                    </div>
                    <div style="display:flex; justify-content:space-between; padding:7px 10px; background:#f8fafc; border-radius:6px;">
                        <span>👔 Оценка ръководител (10%): <b>${mgrPct}%</b></span>
                        <b style="color:#15803d;">+${eurMgr.toFixed(2)} €</b>
                    </div>
                    <div style="display:flex; justify-content:space-between; padding:7px 10px; background:#fefce8; border-radius:6px;">
                        <span>🎁 Поощрения ${details.perfectMonthActive ? '(вкл. Перфектен месец)' : ''}</span>
                        <b style="color:#d97706;">${eurRew >= 0 ? '+' : ''}${eurRew.toFixed(2)} €</b>
                    </div>
                </div>
                <div style="margin-top: 14px; padding: 12px 16px; background: #f0fdf4; border: 2px solid #86efac; border-radius: 10px; display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <div style="font-size: 0.8em; font-weight: 800; color: #166534;">КРАЙНА МЕСЕЧНА ПРЕМИЯ:</div>
                        <div style="font-size: 0.74em; color: #15803d;">Одобрена сума за изплащане</div>
                    </div>
                    <div style="font-size: 1.55em; font-weight: 900; color: #15803d;">${finalPayout.toFixed(2)} €</div>
                </div>
            </div>
        `;
        return;
    }

    // Обратна съвместимост за одобрени фишове преди въвеждане на новата формула
    const lateCount = Number(log.late_count || 0);
    const latePenalty = Number(log.late_penalty || 0);
    const auditFailed = Number(log.audit_3s_failed_count || 0);
    const auditPenalty = Number(log.audit_3s_penalty || 0);
    const manualAdj = Number(log.manual_adjustment || 0);
    const manualNotes = log.manual_notes || '';

    contentDiv.innerHTML = `
        ${liveCardHtml}
        <div style="background: white; border: 1px solid #e2e8f0; border-radius: 12px; padding: 18px; box-shadow: 0 2px 5px rgba(0,0,0,0.03); max-width: 640px; margin: 0 auto;">
            <div style="border-bottom: 2px solid #f1f5f9; padding-bottom: 10px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center;">
                <div style="font-weight: 900; color: #1e3a8a;">📜 Одобрен Фиш: ${dossierEsc(log.month)} ${log.year} г.</div>
                <span style="background: #dcfce7; color: #15803d; border: 1px solid #86efac; padding: 3px 10px; border-radius: 9999px; font-weight: 800; font-size: 0.78em;">🟢 Одобрен</span>
            </div>
            <div style="display: flex; flex-direction: column; gap: 7px; font-size: 0.88em;">
                <div style="display:flex; justify-content:space-between; padding:6px 10px; background:#f8fafc; border-radius:6px;">
                    <span>💶 Базов бонус:</span><b style="color:#1e40af;">+${baseBonus.toFixed(2)} €</b>
                </div>
                <div style="display:flex; justify-content:space-between; padding:6px 10px; background:#f8fafc; border-radius:6px;">
                    <span>⏱️ Закъснения (${lateCount}):</span><b style="color:${latePenalty > 0 ? '#dc2626' : '#16a34a'};">-${latePenalty.toFixed(2)} €</b>
                </div>
                <div style="display:flex; justify-content:space-between; padding:6px 10px; background:#f8fafc; border-radius:6px;">
                    <span>🧹 3S одити (${auditFailed}):</span><b style="color:${auditPenalty > 0 ? '#dc2626' : '#16a34a'};">-${auditPenalty.toFixed(2)} €</b>
                </div>
                ${manualAdj !== 0 ? `<div style="display:flex; justify-content:space-between; padding:6px 10px; background:#fefce8; border-radius:6px;"><span>🏷️ Корекция (${dossierEsc(manualNotes)}):</span><b>${manualAdj.toFixed(2)} €</b></div>` : ''}
            </div>
            <div style="margin-top: 14px; padding: 12px 16px; background: #f0fdf4; border: 2px solid #86efac; border-radius: 10px; display: flex; justify-content: space-between; align-items: center;">
                <div style="font-weight: 800; color: #166534;">КРАЕН БОНУС:</div>
                <div style="font-size: 1.5em; font-weight: 900; color: #15803d;">${finalPayout.toFixed(2)} €</div>
            </div>
        </div>
    `;
};
