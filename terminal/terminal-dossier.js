// terminal-dossier.js - Достъп до лично досие и фишове през терминала с индивидуален ПИН/парола

const DOSIETA_STORAGE_URL = 'https://aoekbmhgbohsgpwqsizv.supabase.co';
const DOSIETA_STORAGE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFvZWtibWhnYm9oc2dwd3FzaXp2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY5NDU1OTEsImV4cCI6MjEwMjUyMTU5MX0.ikCySPlyg0kPHt0sx34pndAWJAJ9tVCyWonBuG-lLQU';

const termDosietaClient = (typeof supabase !== 'undefined' && supabase.createClient)
    ? supabase.createClient(DOSIETA_STORAGE_URL, DOSIETA_STORAGE_KEY)
    : client;

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

async function openTerminalDossier() {
    const email = currentEmail || localStorage.getItem('mes_email');
    if (!email) {
        Swal.fire({
            icon: 'warning',
            title: 'Няма избран оператор',
            text: 'Моля, първо задайте вашия профил в терминала.',
            confirmButtonColor: '#4338ca'
        });
        return;
    }

    // Check if already authenticated in this session
    const authKey = 'term_dossier_auth_' + email;
    const isAuthed = sessionStorage.getItem(authKey) === 'true';

    if (!isAuthed) {
        const { value: enteredPassword } = await Swal.fire({
            title: '🔒 Защитен достъп до фишове',
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
                    text: 'За вашия профил все още не е въведена индивидуална парола. Моля, свържете се с администратор/мениджър.',
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

            // Authenticated successfully!
            sessionStorage.setItem(authKey, 'true');
            Swal.close();
        } catch (err) {
            Swal.fire('Грешка при проверка', err.message || 'Опитайте отново по-късно.', 'error');
            return;
        }
    }

    // Open modal and load documents
    const modal = document.getElementById('termDossierModalBackdrop');
    if (modal) {
        modal.style.display = 'flex';
        const nameSpan = document.getElementById('termDossierWorkerName');
        if (nameSpan) nameSpan.innerText = `${currentOperator || ''} (${email})`;
        loadTermDocs(email);
    }
}

function closeTerminalDossier() {
    const modal = document.getElementById('termDossierModalBackdrop');
    if (modal) modal.style.display = 'none';
}

async function loadTermDocs(email) {
    const listDiv = document.getElementById('termDocsList');
    if (!listDiv) return;
    listDiv.innerHTML = '<div style="text-align:center; padding:30px; color:#64748b;"><span style="font-size:1.4em;">⏳</span> Зареждане на вашите фишове и документи...</div>';

    try {
        const { data, error } = await termDosietaClient.storage.from('dosieta').list(email);
        if (error) throw error;

        currentTermDocs = (data || []).filter(f => f.name && f.name !== '.emptyFolderPlaceholder');
        // Sort newest first
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
    const email = currentEmail || localStorage.getItem('mes_email');
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
                            <div style="font-weight:700; color:#1e293b; font-size:0.9em; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:230px;" title="${parsed.cleanName}">
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
