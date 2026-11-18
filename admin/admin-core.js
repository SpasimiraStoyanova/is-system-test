// ==========================================
// 🔐 АВТЕНТИКАЦИЯ СЪС SUPABASE AUTH
// ==========================================
let currentAdminUser = null;
let isAppInitialized = false;

window.onload = async () => {
    await initAdminAuth();
};

async function initAdminAuth() {
    try {
        // Слушател за промяна в състоянието на сесията
        if (client && client.auth) {
            client.auth.onAuthStateChange((event, session) => {
                if (event === 'SIGNED_OUT') {
                    currentAdminUser = null;
                    const app = document.getElementById('appContent');
                    if (app) app.style.display = 'none';
                    showAdminLoginModal();
                } else if (event === 'SIGNED_IN' && session && session.user) {
                    if (!currentAdminUser) {
                        onAdminAuthSuccess(session.user);
                    }
                }
            });
        }

        // Проверка за съществуваща активна сесия
        const { data: { session }, error } = await client.auth.getSession();
        if (error) {
            console.warn('Supabase getSession warning:', error);
        }

        if (session && session.user) {
            onAdminAuthSuccess(session.user);
        } else {
            showAdminLoginModal();
        }
    } catch (err) {
        console.error('Критична грешка при проверка на сесия:', err);
        showAdminLoginModal();
    }
}

function onAdminAuthSuccess(user) {
    currentAdminUser = user;
    const app = document.getElementById('appContent');
    if (app) {
        app.style.display = 'block';
    }

    renderNavAuthArea(user);

    if (!isAppInitialized) {
        isAppInitialized = true;
        initializeApp();
    }
}

function renderNavAuthArea(user) {
    const navAuth = document.getElementById('navAuthArea');
    if (!navAuth) return;
    const userEmail = (user && user.email) ? user.email : 'Администратор';
    navAuth.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px; font-size: 0.82rem; background: #ffffff; border: 1px solid #e2e8f0; padding: 4px 10px; border-radius: 9999px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);" title="Влезли сте като: ${userEmail}">
            <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #22c55e;" title="Активна защитена сесия"></span>
            <span style="font-weight: 700; color: #334155; max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${userEmail}</span>
        </div>
        <button type="button" onclick="promptChangeAdminPassword()" class="btn-admin-pass-change" title="Смяна на паролата за вход в системата">
            <span>🔑</span> <span>Смени парола</span>
        </button>
        <button type="button" onclick="adminLogout()" class="btn-admin-logout" title="Изход от административния панел">
            <span>🚪</span> <span>Изход</span>
        </button>
    `;
}

async function promptChangeAdminPassword() {
    const { value: formValues } = await Swal.fire({
        title: '🔑 Смяна на административна парола',
        html: `
            <div style="text-align: left; padding: 6px; font-family: inherit;">
                <p style="color: #64748b; font-size: 0.88rem; margin-top: 0; margin-bottom: 14px; line-height: 1.4;">
                    Въведете новата парола за вашия Supabase акаунт:
                </p>
                <div style="margin-bottom: 12px;">
                    <label style="display: block; font-size: 0.82rem; font-weight: 700; color: #334155; margin-bottom: 4px;">Нова парола:</label>
                    <input id="swalNewPass" type="password" placeholder="Минимум 6 символа" class="swal2-input" style="width: 100%; box-sizing: border-box; margin: 0; padding: 10px 12px; height: 42px; font-size: 0.95rem; border-radius: 8px;">
                </div>
                <div style="margin-bottom: 8px;">
                    <label style="display: block; font-size: 0.82rem; font-weight: 700; color: #334155; margin-bottom: 4px;">Повторете новата парола:</label>
                    <input id="swalConfirmPass" type="password" placeholder="Повторете паролата" class="swal2-input" style="width: 100%; box-sizing: border-box; margin: 0; padding: 10px 12px; height: 42px; font-size: 0.95rem; border-radius: 8px;">
                </div>
                <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px 10px; margin-top: 10px; font-size: 0.76rem; color: #64748b;">
                    🛡️ Новата парола се записва незабавно в криптираната база на Supabase.
                </div>
            </div>
        `,
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonText: '💾 Запази новата парола',
        cancelButtonText: 'Отказ',
        confirmButtonColor: '#4338ca',
        showLoaderOnConfirm: true,
        didOpen: () => {
            const p1 = document.getElementById('swalNewPass');
            if (p1) p1.focus();
        },
        preConfirm: async () => {
            const p1 = document.getElementById('swalNewPass')?.value || '';
            const p2 = document.getElementById('swalConfirmPass')?.value || '';

            if (!p1 || p1.length < 6) {
                Swal.showValidationMessage('Паролата трябва да бъде поне 6 символа.');
                return false;
            }
            if (p1 !== p2) {
                Swal.showValidationMessage('Двете пароли не съвпадат!');
                return false;
            }

            try {
                const { error } = await client.auth.updateUser({ password: p1 });
                if (error) {
                    Swal.showValidationMessage('Грешка от Supabase: ' + error.message);
                    return false;
                }
                return true;
            } catch (err) {
                Swal.showValidationMessage('Грешка: ' + (err.message || err));
                return false;
            }
        }
    });

    if (formValues) {
        Swal.fire({
            icon: 'success',
            title: 'Паролата е сменена успешно!',
            text: 'При следващ вход използвайте новата парола.',
            confirmButtonColor: '#4338ca'
        });
    }
}

async function adminLogout() {
    const res = await Swal.fire({
        title: 'Изход от системата?',
        text: 'Сигурни ли сте, че искате да излезете от административния панел?',
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: '🚪 Да, излез',
        cancelButtonText: 'Отказ',
        confirmButtonColor: '#dc2626',
        cancelButtonColor: '#64748b'
    });

    if (res.isConfirmed) {
        try {
            await client.auth.signOut();
        } catch (e) {
            console.error('Грешка при signOut:', e);
        }
        sessionStorage.clear();
        location.reload();
    }
}

function showAdminLoginModal() {
    const app = document.getElementById('appContent');
    if (app) app.style.display = 'none';

    const lastEmail = localStorage.getItem('last_admin_email') || '';

    Swal.fire({
        title: '🔐 AMCI Административен Вход',
        html: `
            <div style="text-align: left; padding: 8px 4px 4px 4px; font-family: inherit;">
                <p style="color: #64748b; font-size: 0.92rem; margin-top: 0; margin-bottom: 16px; line-height: 1.45;">
                    Въведете вашия административен <strong>Supabase</strong> акаунт (имейл и парола) за достъп до системата.
                </p>
                <div style="margin-bottom: 14px;">
                    <label style="display: block; font-size: 0.82rem; font-weight: 700; color: #334155; margin-bottom: 5px;">Имейл адрес:</label>
                    <input id="swalAdminEmail" type="email" autocomplete="username" value="${lastEmail.replace(/"/g, '&quot;')}" placeholder="admin@amci.bg" class="swal2-input" style="width: 100%; box-sizing: border-box; margin: 0; padding: 10px 12px; height: 44px; font-size: 0.95rem; border-radius: 8px;">
                </div>
                <div style="margin-bottom: 14px;">
                    <label style="display: block; font-size: 0.82rem; font-weight: 700; color: #334155; margin-bottom: 5px;">Парола:</label>
                    <input id="swalAdminPassword" type="password" autocomplete="current-password" placeholder="••••••••" class="swal2-input" style="width: 100%; box-sizing: border-box; margin: 0; padding: 10px 12px; height: 44px; font-size: 0.95rem; border-radius: 8px;">
                </div>
                <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 12px; margin-top: 14px; font-size: 0.78rem; color: #64748b; line-height: 1.45;">
                    🛡️ <strong>Криптирана защита:</strong> Паролата се проверява директно през Supabase Auth. В изходния код вече няма твърдо зададени PIN кодове.
                </div>
            </div>
        `,
        focusConfirm: false,
        allowOutsideClick: false,
        allowEscapeKey: false,
        confirmButtonText: '🚀 ВХОД В СИСТЕМАТА',
        confirmButtonColor: '#4338ca',
        showCancelButton: false,
        showLoaderOnConfirm: true,
        didOpen: () => {
            const emailInput = document.getElementById('swalAdminEmail');
            const passInput = document.getElementById('swalAdminPassword');
            if (emailInput && emailInput.value) {
                if (passInput) passInput.focus();
            } else if (emailInput) {
                emailInput.focus();
            }

            [emailInput, passInput].forEach(inp => {
                if (inp) {
                    inp.addEventListener('keydown', (e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            Swal.clickConfirm();
                        }
                    });
                }
            });
        },
        preConfirm: async () => {
            const email = (document.getElementById('swalAdminEmail')?.value || '').trim();
            const password = document.getElementById('swalAdminPassword')?.value || '';

            if (!email) {
                Swal.showValidationMessage('Моля, въведете имейл адрес.');
                return false;
            }
            if (!password) {
                Swal.showValidationMessage('Моля, въведете парола.');
                return false;
            }

            try {
                const { data, error } = await client.auth.signInWithPassword({
                    email: email,
                    password: password
                });

                if (error) {
                    let msg = error.message;
                    if (msg === 'Invalid login credentials') {
                        msg = '❌ Грешен имейл или парола! Уверете се, че потребителят е създаден в Supabase Dashboard > Authentication > Users.';
                    } else if (msg.includes('Email not confirmed')) {
                        msg = '⚠️ Имейлът не е потвърден в Supabase (маркирайте "Auto Confirm" в Dashboard-а).';
                    }
                    Swal.showValidationMessage(msg);
                    return false;
                }

                if (!data || !data.user) {
                    Swal.showValidationMessage('Възникна грешка при автентикация. Опитайте отново.');
                    return false;
                }

                try {
                    localStorage.setItem('last_admin_email', email);
                } catch (e) {}

                return data.user;
            } catch (err) {
                Swal.showValidationMessage('Възникна грешка при връзка със сървъра: ' + (err.message || err));
                return false;
            }
        }
    }).then((result) => {
        if (result.isConfirmed && result.value) {
            onAdminAuthSuccess(result.value);
            const Toast = Swal.mixin({
                toast: true,
                position: 'top-end',
                showConfirmButton: false,
                timer: 3000,
                timerProgressBar: true
            });
            Toast.fire({
                icon: 'success',
                title: `Успешен вход! Здравейте, ${result.value.email}`
            });
        }
    });
}

let globalActivePlansForDropdown = [];
let globalColumnFilters = {};

function initializeApp() {
    client.from('plan').select('id, "Вътрешно име"').in('Статус', ['Активен']).then(res => {
        if (res.data) globalActivePlansForDropdown = res.data;
    });
    buildNavbar(); loadCurrentTableData(); runInvisibleAutoCheckout(); loadFormDatalists();
}

function toggleAdminDropdown(dropdownId) {
    const target = document.getElementById(dropdownId);
    if (!target) return;
    const isOpen = target.classList.contains('open');
    document.querySelectorAll('.admin-dropdown.open').forEach(el => el.classList.remove('open'));
    if (!isOpen) {
        target.classList.add('open');
    }
}

document.addEventListener('click', (e) => {
    if (!e.target.closest('.admin-dropdown')) {
        document.querySelectorAll('.admin-dropdown.open').forEach(el => el.classList.remove('open'));
    }
});

window.cachedFactoryMachines = [
    { name: 'HAAS ST 10', code: '101' },
    { name: 'HAAS Mini Mill', code: '102' },
    { name: 'EMCO (стар)', code: '104' },
    { name: 'EMCOTURN E25', code: '105' },
    { name: 'Фреза Deckel', code: '106' },
    { name: 'Струг (УС 11.1)', code: '107' },
    { name: 'Струг голям', code: '108' },
    { name: 'Струг пресоване', code: '109' },
    { name: 'Универсален струг', code: '110' },
    { name: 'Шлайф (голям)', code: '111' },
    { name: 'Шлайф (нов)', code: '112' },
    { name: 'Хонинг', code: '113' },
    { name: 'Заточна Машина', code: '114' },
    { name: 'Голяма ножовка', code: '115' },
    { name: 'Средна (зелена) ножовка', code: '116' },
    { name: 'Малка (синя) ножовка', code: '117' },
    { name: 'Барабан', code: '118' },
    { name: 'Бобинажна машина', code: '208' },
    { name: 'Бобинажна+редачна', code: '209' },
    { name: 'Бобинажна машина статорна', code: '201' },
    { name: 'Бобиньорки', code: '202' },
    { name: 'Машина за навиване на ротори', code: '203' },
    { name: 'Машина за прахово боядисване', code: '204' },
    { name: 'Машина за пудрене', code: '205' },
    { name: 'Машина за търкане', code: '206' },
    { name: 'Мивка', code: '207' },
    { name: 'Монтаж 1', code: '301' },
    { name: 'Монтаж 1 МПР', code: '302' },
    { name: 'Монтаж 1 макари', code: '303' },
    { name: 'Монтаж 2', code: '304' },
    { name: 'Монтаж 2 + ТермоПреса', code: '305' }
];

async function loadFactoryMachinesList() {
    try {
        const macMap = new Map();
        (window.cachedFactoryMachines || []).forEach(m => {
            if (m && m.name) macMap.set(m.name.trim().toLowerCase(), { name: m.name.trim(), code: m.code || '' });
        });

        const [machRes, routeRes] = await Promise.allSettled([
            client.from('factory_machines').select('name, code').order('name'),
            client.from('marshruti').select('Машина').limit(10000)
        ]);

        if (machRes.status === 'fulfilled' && machRes.value && machRes.value.data) {
            machRes.value.data.forEach(m => {
                const name = String(m.name || '').trim();
                if (name) {
                    const key = name.toLowerCase();
                    const existing = macMap.get(key);
                    macMap.set(key, {
                        name: name,
                        code: m.code ? String(m.code).trim() : (existing ? existing.code : '')
                    });
                }
            });
        }

        if (routeRes.status === 'fulfilled' && routeRes.value && routeRes.value.data) {
            routeRes.value.data.forEach(r => {
                const name = String(r['Машина'] || '').trim();
                if (name) {
                    const key = name.toLowerCase();
                    if (!macMap.has(key)) {
                        macMap.set(key, { name: name, code: '' });
                    }
                }
            });
        }

        window.cachedFactoryMachines = Array.from(macMap.values()).sort((a, b) => a.name.localeCompare(b.name, 'bg'));

        const dl = document.getElementById('dl_machines');
        if (dl) {
            dl.innerHTML = '';
            window.cachedFactoryMachines.forEach(m => {
                const opt = document.createElement('option');
                opt.value = m.name;
                if (m.code) opt.label = `${m.name} (№ ${m.code})`;
                dl.appendChild(opt);
            });
        }
    } catch (e) {
        console.warn('loadFactoryMachinesList warning:', e);
    }
}

function loadFormDatalists() {
    client.from('Номенклатура').select('"ID Детайл", "Вътрешно име"').limit(10000).then(res => {
        if (res.data) {
            const dl = document.getElementById('dl_nomenklatura');
            if (dl) {
                dl.innerHTML = '';
                const seen = new Set();
                res.data.forEach(item => {
                    const code = String(item['ID Детайл'] || '').trim();
                    const name = String(item['Вътрешно име'] || '').trim();
                    if (code && !seen.has(code)) {
                        seen.add(code);
                        const opt = document.createElement('option');
                        opt.value = code;
                        if (name && name !== code) opt.label = `${name} (${code})`;
                        dl.appendChild(opt);
                    }
                });
            }
        }
    });

    loadFactoryMachinesList();
}

function exportCurrentTableToExcel() {
    const config = tableConfigs[currentTab];
    if (!config) return;

    const rowsToExport = (currentRenderedRows && currentRenderedRows.length > 0) ? currentRenderedRows : globalRows;
    if (!rowsToExport || rowsToExport.length === 0) {
        Swal.fire({ icon: 'info', title: 'Няма данни за експорт', text: 'Текущата таблица е празна.' });
        return;
    }

    const exportData = rowsToExport.map(row => {
        const item = {};
        config.fields.forEach(f => {
            if (f.hideOnAdd && f.name === 'id') return;
            let header = f.label || f.name;
            let val = row[f.name];
            if ((f.name === 'Време' || f.name === 'Дата' || f.name === 'Време Старт') && val) {
                try {
                    let pVal = val;
                    if (!pVal.endsWith('Z') && !pVal.includes('+')) pVal += 'Z';
                    val = new Date(pVal).toLocaleString('bg-BG');
                } catch (e) { }
            }
            item[header] = (val !== undefined && val !== null) ? val : '';
        });
        return item;
    });

    if (typeof XLSX === 'undefined') {
        Swal.fire('Грешка', 'Библиотеката SheetJS (XLSX) не е заредена.', 'error');
        return;
    }

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    const sheetName = config.label.replace(/[^а-яА-Яa-zA-Z0-9 ]/g, '').trim().substring(0, 31) || 'Data';
    XLSX.utils.book_append_sheet(wb, ws, sheetName);

    const today = new Date().toISOString().split('T')[0];
    const fileName = `IS_SYSTEM_${currentTab}_${today}.xlsx`;
    XLSX.writeFile(wb, fileName);

    const toast = Swal.mixin({
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 2500,
        timerProgressBar: true
    });
    toast.fire({
        icon: 'success',
        title: `Изтеглени ${exportData.length} записа в Excel`
    });
}

// ==========================================
// ⚡ ЛОКАЛНО КЕШИРАНЕ НА ТАБОВЕТЕ (СВЕТКАВИЧНО ПРЕВКЛЮЧВАНЕ)
// ==========================================
const adminTabCache = {};
const adminCacheTimestamps = {};
const ADMIN_CACHE_TTL_MS = 2.5 * 60 * 1000; // 2.5 минути валидност

window.invalidateAdminCache = function (tabKey = null) {
    if (tabKey) {
        delete adminTabCache[tabKey];
        delete adminCacheTimestamps[tabKey];
    } else {
        Object.keys(adminTabCache).forEach(k => delete adminTabCache[k]);
        Object.keys(adminCacheTimestamps).forEach(k => delete adminCacheTimestamps[k]);
    }
    if (!tabKey || tabKey === 'workstations' || tabKey === 'marshruti') {
        if (typeof loadFactoryMachinesList === 'function') loadFactoryMachinesList();
    }
};

function buildNavbar() {
    const container = document.getElementById('tabsContainer'); container.innerHTML = '';
    Object.keys(tableConfigs).forEach(key => {
        if (tableConfigs[key].hiddenTab) return;
        const btn = document.createElement('button'); btn.className = `tab-btn ${key === currentTab ? 'active' : ''}`;
        btn.innerText = tableConfigs[key].label;
        btn.onclick = () => switchTab(key, key === currentTab);
        container.appendChild(btn);
    });
}

function switchTab(tabKey, force = false) {
    const isSameTab = (currentTab === tabKey);
    currentTab = tabKey; buildNavbar(); document.getElementById('searchInput').value = '';
    selectedIndices.clear(); updateMassActionBar();
    globalColumnFilters = {}; document.getElementById('tableHead').innerHTML = '';

    const config = tableConfigs[tabKey]; const addBtn = document.getElementById('addNewBtn');
    const pdfBtn = document.getElementById('pdfBtn'); const mrpBtn = document.getElementById('mrpBtn'); const transBtn = document.getElementById('transformResolverBtn'); const sidebar = document.getElementById('personnelSidebar');
    const syncMacBtn = document.getElementById('syncMachinesBtn');
    const toolReqBtn = document.getElementById('toolingRequestsBtn');
    const matOrdersBtn = document.getElementById('materialOrdersBtn');
    const locCheckBtn = document.getElementById('silentLocationCheckBtn');
    const locHistBtn = document.getElementById('locationHistoryBtn');

    addBtn.innerText = `➕ Нов запис в ${config.label.replace(/[^а-яА-Я ]/g, '').trim()}`;
    addBtn.style.display = (config.readOnlyTab && tabKey !== 'sklad_inventory') ? 'none' : 'flex';
    if (pdfBtn) pdfBtn.style.display = (tabKey === 'plan') ? 'flex' : 'none';
    if (mrpBtn) mrpBtn.style.display = (tabKey === 'sklad' || tabKey === 'porachki') ? 'flex' : 'none';
    if (matOrdersBtn) matOrdersBtn.style.display = (tabKey === 'sklad') ? 'flex' : 'none';
    if (transBtn) transBtn.style.display = (tabKey === 'sklad_inventory') ? 'flex' : 'none';
    if (syncMacBtn) syncMacBtn.style.display = (tabKey === 'workstations') ? 'flex' : 'none';
    if (toolReqBtn) toolReqBtn.style.display = (tabKey === 'tooling_sklad') ? 'flex' : 'none';
    if (locCheckBtn) locCheckBtn.style.display = (tabKey === 'chekiraniya') ? 'flex' : 'none';
    if (locHistBtn) locHistBtn.style.display = (tabKey === 'chekiraniya') ? 'flex' : 'none';

    // Тук прехвърлихме показването на папките само когато сме в менюто Персонал
    if (tabKey === 'personal') { sidebar.style.display = 'block'; loadPersonnelSidebar(); } else { sidebar.style.display = 'none'; }
    const probiContainer = document.getElementById('probiContainer');
    if (probiContainer) { probiContainer.style.display = (tabKey === 'probi') ? 'block' : 'none'; }
    const audit3sContainer = document.getElementById('audit3sContainer');
    if (audit3sContainer) { audit3sContainer.style.display = (tabKey === 'audit_3s') ? 'block' : 'none'; }
    const roomsContainer = document.getElementById('roomsInventoryContainer');
    if (roomsContainer) { roomsContainer.style.display = (tabKey === 'rooms_inventory') ? 'block' : 'none'; }
    if (tabKey === 'probi') {
        addBtn.style.display = 'flex';
        addBtn.innerText = '➕ Нова Проба';
        addBtn.onclick = () => { if (typeof openCreateProbaModal === 'function') openCreateProbaModal(); };
    } else if (tabKey === 'equipment_protocols') {
        addBtn.style.display = 'flex';
        addBtn.innerText = '🦺 Нов Протокол за Зачисляване';
        addBtn.onclick = () => { if (typeof openCreateEquipmentProtocolModal === 'function') openCreateEquipmentProtocolModal(); };
    } else {
        addBtn.onclick = () => openAddModal();
    }
    loadCurrentTableData(force || isSameTab);
}

function toggleSelectAll(event) {
    const isChecked = event.target.checked; const checkboxes = document.querySelectorAll('.row-cb');
    checkboxes.forEach(cb => { cb.checked = isChecked; const idx = parseInt(cb.dataset.index); if (isChecked) selectedIndices.add(idx); else selectedIndices.delete(idx); });
    updateMassActionBar();
}

function toggleRowSelection(event, trueIndex) {
    if (event.target.checked) selectedIndices.add(trueIndex); else selectedIndices.delete(trueIndex);
    const allCheckbox = document.getElementById('selectAllCb');
    if (allCheckbox) { const visibleCheckboxes = document.querySelectorAll('.row-cb'); const allChecked = Array.from(visibleCheckboxes).every(cb => cb.checked); allCheckbox.checked = visibleCheckboxes.length > 0 && allChecked; }
    updateMassActionBar();
}

function updateMassActionBar() {
    const bar = document.getElementById('massActionBar'); const text = document.getElementById('massActionText');
    if (selectedIndices.size > 0 && !tableConfigs[currentTab].readOnlyTab) { text.innerText = `Маркирани: ${selectedIndices.size} записа`; bar.style.display = 'flex'; } else { bar.style.display = 'none'; }
}

async function deleteSelectedItems() {
    const config = tableConfigs[currentTab]; const count = selectedIndices.size;
    const res = await Swal.fire({ title: `Изтриване на ${count} записа?`, text: "Това действие е безвъзвратно!", icon: 'warning', showCancelButton: true, confirmButtonColor: '#ef4444', confirmButtonText: 'Да, изтрий всички!', cancelButtonText: 'Отказ' });
    if (res.isConfirmed) {
        try {
            Swal.fire({ title: 'Изтриване...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
            const keysToDelete = Array.from(selectedIndices).map(idx => globalRows[idx][config.key]);
            const { error } = await client.from(config.table).delete().in(config.key, keysToDelete);
            if (error) throw error;
            selectedIndices.clear(); updateMassActionBar();
            if (window.invalidateAdminCache) window.invalidateAdminCache();
            Swal.fire({ icon: 'success', title: 'Изтрити!', timer: 1500, showConfirmButton: false }); loadCurrentTableData(true);
        } catch (err) { Swal.fire('Грешка', err.message, 'error'); }
    }
}

async function loadCurrentTableData(forceRefresh = false) {
    const config = tableConfigs[currentTab];
    selectedIndices.clear(); updateMassActionBar();
    const requestedTab = currentTab;
    try {
        if (currentTab === 'probi') {
            document.getElementById('mainTable').style.display = 'none';
            document.getElementById('tableHead').innerHTML = '';
            document.getElementById('loadingLayout').style.display = 'none';
            const probiContainer = document.getElementById('probiContainer');
            if (probiContainer) probiContainer.style.display = 'block';
            if (typeof renderProbiTab === 'function') renderProbiTab(forceRefresh);
            return;
        }
        if (currentTab === 'audit_3s') {
            document.getElementById('mainTable').style.display = 'none';
            document.getElementById('tableHead').innerHTML = '';
            document.getElementById('loadingLayout').style.display = 'none';
            const audit3sContainer = document.getElementById('audit3sContainer');
            if (audit3sContainer) audit3sContainer.style.display = 'block';
            if (typeof render3sTab === 'function') render3sTab(forceRefresh);
            return;
        }
        if (currentTab === 'rooms_inventory') {
            document.getElementById('mainTable').style.display = 'none';
            document.getElementById('tableHead').innerHTML = '';
            document.getElementById('loadingLayout').style.display = 'none';
            const addNewBtn = document.getElementById('addNewBtn');
            if (addNewBtn) addNewBtn.style.display = 'none';
            const probiContainer = document.getElementById('probiContainer');
            if (probiContainer) probiContainer.style.display = 'none';
            const audit3sContainer = document.getElementById('audit3sContainer');
            if (audit3sContainer) audit3sContainer.style.display = 'none';
            const salariesContainer = document.getElementById('salariesContainer');
            if (salariesContainer) salariesContainer.style.display = 'none';
            const roomsContainer = document.getElementById('roomsInventoryContainer');
            if (roomsContainer) roomsContainer.style.display = 'block';
            if (typeof renderRoomsTab === 'function') renderRoomsTab(forceRefresh);
            return;
        }
        if (currentTab === 'salaries') {
            document.getElementById('mainTable').style.display = 'none';
            document.getElementById('tableHead').innerHTML = '';
            document.getElementById('loadingLayout').style.display = 'none';
            const addNewBtn = document.getElementById('addNewBtn');
            if (addNewBtn) addNewBtn.style.display = 'none';
            const probiContainer = document.getElementById('probiContainer');
            if (probiContainer) probiContainer.style.display = 'none';
            const audit3sContainer = document.getElementById('audit3sContainer');
            if (audit3sContainer) audit3sContainer.style.display = 'none';
            const salariesContainer = document.getElementById('salariesContainer');
            if (salariesContainer) salariesContainer.style.display = 'block';
            if (typeof renderSalariesTab === 'function') renderSalariesTab(forceRefresh);
            return;
        }
        const probiContainer = document.getElementById('probiContainer');
        if (probiContainer) probiContainer.style.display = 'none';
        const audit3sContainer = document.getElementById('audit3sContainer');
        if (audit3sContainer) audit3sContainer.style.display = 'none';
        const salariesContainer = document.getElementById('salariesContainer');
        if (salariesContainer) salariesContainer.style.display = 'none';
        const roomsContainer = document.getElementById('roomsInventoryContainer');
        if (roomsContainer) roomsContainer.style.display = 'none';
        const archiveToolbar = document.getElementById('archiveToolbar');
        if (archiveToolbar) archiveToolbar.style.display = (currentTab === 'archives') ? 'flex' : 'none';

        if (currentTab === 'archives') {
            document.getElementById('mainTable').style.display = 'table';
            document.getElementById('loadingLayout').style.display = 'none';
            if (typeof renderArchivesTab === 'function') renderArchivesTab();
            return;
        }

        // ⚡ Бърз път: Проверка за валиден локален кеш (мигновено показване)
        const now = Date.now();
        if (!forceRefresh && adminTabCache[currentTab] && (now - (adminCacheTimestamps[currentTab] || 0) < ADMIN_CACHE_TTL_MS)) {
            document.getElementById('loadingLayout').style.display = 'none';
            document.getElementById('mainTable').style.display = 'table';
            globalRows = adminTabCache[currentTab];
            filterTable();
            return;
        }

        document.getElementById('loadingLayout').style.display = 'block';
        document.getElementById('mainTable').style.display = 'none';

        let query;
        if (currentTab === 'sklad_inventory') {
            query = client.from('plan').select('id').limit(1); // dummy query
        } else {
            query = client.from(config.table).select('*').limit(10000);
            if (currentTab === 'otcheti') {
                query = query.order('Дата', { ascending: false });
            }
            if (currentTab === 'brak') {
                query = query.eq('Статус', 'Брак').order('Дата', { ascending: false });
            }
            if (currentTab === 'chekiraniya') query = query.order('Време', { ascending: false });
            if (currentTab === 'equipment_protocols') query = query.order('created_at', { ascending: false });
        }
        const { data, error } = await query; if (error) throw error;
        let rows = data || [];
        if (currentTab === 'plan') {
            const [nomRes, routeRes, otchetiRes, invRes] = await Promise.all([
                client.from('Номенклатура').select('*').limit(10000),
                client.from('marshruti').select('*').limit(10000),
                client.from('otcheti').select('"id", "ID План", "ID Детайл", "Операция", "Количество", "Статус", "Дата"').in('Статус', ['Отчетено', 'Готов продукт', 'Изпратено']).limit(50000),
                client.from('inventory').select('*').limit(10000)
            ]);

            const nomMap = {};
            if (!nomRes.error && nomRes.data) {
                nomRes.data.forEach(n => {
                    if (n['Вътрешно име']) nomMap[n['Вътрешно име']] = n['ID Детайл'];
                    if (n['ID Детайл']) nomMap[n['ID Детайл']] = n['ID Детайл'];
                });
                rows.forEach(r => {
                    r['ID Детайл'] = nomMap[r['Вътрешно име']] || r['Вътрешно име'];
                });
            }

            // Build route map & find last operation per detail
            const routesByCode = {};
            (routeRes?.data || []).forEach(m => {
                let c = String(m['Код на детайла'] || '').trim().toLowerCase();
                if (!routesByCode[c]) routesByCode[c] = [];
                routesByCode[c].push(m);
            });
            const lastOpByCode = {};
            Object.keys(routesByCode).forEach(c => {
                let list = routesByCode[c];
                list.sort((a, b) => (parseInt(a['№ Операция']) || 0) - (parseInt(b['№ Операция']) || 0));
                lastOpByCode[c] = String(list[list.length - 1]['Име на операция'] || '').trim().toLowerCase();
            });

            // Packaging map
            const packMap = {};
            (otchetiRes?.data || []).forEach(p => {
                let op = String(p['Операция'] || '');
                if (/Опаковане - Кашон №/i.test(op)) {
                    let pId = String(p['ID План'] || '').trim();
                    let code = String(p['ID Детайл'] || '').trim().toUpperCase();
                    let key = pId + '_' + code;
                    if (!packMap[key]) packMap[key] = {};
                    let boxMatch = op.match(/Опаковане - Кашон №\s*(.+)/i);
                    let boxNum = boxMatch ? boxMatch[1] : '?';
                    packMap[key][boxNum] = (packMap[key][boxNum] || 0) + (parseFloat(p['Количество']) || 0);
                }
            });

            // Inventory Finished Products map
            const invGpByCode = {};
            (invRes?.data || []).forEach(inv => {
                let c = String(inv['ID Детайл'] || '').trim().toLowerCase();
                let op = String(inv['Операция'] || '').trim().toLowerCase();
                if (op === 'готов продукт' || op === 'готов детайл') {
                    let q = parseFloat(inv['Количество']) || parseFloat(inv['Общо']) || 0;
                    invGpByCode[c] = (invGpByCode[c] || 0) + q;
                }
            });

            const bgMonthMap = {
                'януари': 0, 'февруари': 1, 'март': 2, 'април': 3, 'май': 4, 'юни': 5,
                'юли': 6, 'август': 7, 'септември': 8, 'октомври': 9, 'ноември': 10, 'декември': 11
            };

            rows.forEach(r => {
                let key = String(r.id).trim() + '_' + String(r['ID Детайл']).trim().toUpperCase();
                if (packMap[key]) {
                    let boxTexts = Object.keys(packMap[key]).map(b => `${packMap[key][b]} бр в кашон № ${b}`);
                    r['__packaged_info'] = ` <span style="color:#d97706; font-size:0.85em; font-weight:bold;">(${boxTexts.join(', ')})</span>`;
                    r['__total_packed'] = Object.values(packMap[key]).reduce((a, b) => a + b, 0);
                }

                let planIdStr = String(r.id || '').trim();
                let code = String(r['ID Детайл'] || '').trim().toLowerCase();
                let name = String(r['Вътрешно име'] || '').trim().toLowerCase();
                let targetQty = parseFloat(r['Целево количество']) || 0;
                let planMonth = String(r['Месец'] || '').trim().toLowerCase();
                let planMonthIdx = bgMonthMap[planMonth];
                let planYear = parseInt(r['Година']) || 0;
                let lastOp = lastOpByCode[code] || lastOpByCode[name] || '';

                let reportedDone = 0;
                (otchetiRes?.data || []).forEach(p => {
                    let pPlanId = String(p['ID План'] || '').trim();
                    let pCode = String(p['ID Детайл'] || '').trim().toLowerCase();
                    let pOp = String(p['Операция'] || '').trim().toLowerCase();
                    let pQty = parseFloat(p['Количество']) || 0;
                    if (pQty <= 0) return;

                    let matchesPlan = false;
                    if (pPlanId && planIdStr && pPlanId === planIdStr) {
                        matchesPlan = true;
                    } else if (!pPlanId || pPlanId === 'null') {
                        if (pCode === code || pCode === name) {
                            if (p['Дата']) {
                                let d = new Date(p['Дата']);
                                let repYear = d.getFullYear();
                                let repMonthIdx = d.getMonth();
                                if (planYear === 0 || repYear === planYear) {
                                    if (planMonthIdx === undefined || repMonthIdx === planMonthIdx) {
                                        matchesPlan = true;
                                    }
                                }
                            } else {
                                matchesPlan = true;
                            }
                        }
                    }

                    if (!matchesPlan) return;

                    let isCompletionOp = false;
                    if (lastOp && pOp === lastOp) {
                        isCompletionOp = true;
                    } else if (pOp === 'готов продукт' || pOp === 'готов детайл') {
                        isCompletionOp = true;
                    } else if (!lastOp && (pOp.includes('сглобяване') || pOp.includes('монтаж') || pOp.startsWith('опаковане'))) {
                        isCompletionOp = true;
                    }

                    if (isCompletionOp) {
                        reportedDone += pQty;
                    }
                });

                if (r['__total_packed'] && r['__total_packed'] > reportedDone) {
                    reportedDone = r['__total_packed'];
                }
                if (reportedDone === 0 && invGpByCode[code]) {
                    reportedDone = Math.min(targetQty, invGpByCode[code]);
                }

                let actualDone = reportedDone;
                let st = String(r['Статус'] || '').trim().toLowerCase();
                if ((st === 'завършен' || st.includes('изпратен')) && actualDone === 0) {
                    actualDone = targetQty;
                }

                let remain = Math.max(0, targetQty - actualDone);
                let pct = targetQty > 0 ? Math.round((actualDone / targetQty) * 100) : (actualDone > 0 ? 100 : 0);

                r['__targetQty'] = targetQty;
                r['__doneQty'] = actualDone;
                r['__remainQty'] = remain;
                r['__pct'] = pct;
                r['__lastOp'] = lastOp;
                r['produced_info'] = `${actualDone} / ${remain}`;
                r['progress_bar'] = `${pct}%`;
            });

            rows.sort((a, b) => {
                const statusWeight = (status) => {
                    let s = String(status || '').trim().toLowerCase();
                    if (s === 'изпратен' || s === 'завършен') return 1;
                    return 0;
                };
                let weightA = statusWeight(a['Статус']);
                let weightB = statusWeight(b['Статус']);
                if (weightA !== weightB) return weightA - weightB;
                return parseInt(b.id || 0) - parseInt(a.id || 0);
            });

        } else if (currentTab === 'otcheti') {
            const planRes = await client.from('plan').select('id, "Вътрешно име", "Месец", "Година"');
            if (!planRes.error && planRes.data) {
                const planMap = {};
                planRes.data.forEach(p => {
                    let m = (p['Месец'] && p['Година']) ? `${p['Месец']} ${p['Година']}` : '';
                    planMap[p.id] = m ? `${m} (${p['Вътрешно име']})` : p['Вътрешно име'];
                });
                rows.forEach(r => {
                    if (r['ID План'] && planMap[r['ID План']]) {
                        r['ID План'] = planMap[r['ID План']];
                    }
                });
            }
        } else if (currentTab === 'sklad_inventory') {
            rows = await computeSkladData();
        } else if (currentTab === 'chekiraniya') {
            // 📍 Автоматична синхронизация на успешни проверки от location_ping_requests, ако липсват в chekiraniya
            try {
                const { data: successfulPings } = await client.from('location_ping_requests')
                    .select('*')
                    .eq('status', 'SUCCESS');

                if (successfulPings && successfulPings.length > 0) {
                    const toInsert = [];
                    successfulPings.forEach(sp => {
                        const pingTime = sp.responded_at || sp.created_at;
                        const pingEmail = (sp.worker_email || '').toLowerCase().trim();
                        const exists = rows.some(r =>
                            r['Действие'] === 'Проверка локация' &&
                            (r['Имейл'] || '').toLowerCase().trim() === pingEmail &&
                            Math.abs(new Date(r['Време']).getTime() - new Date(pingTime).getTime()) < 120000
                        );
                        if (!exists) {
                            const coords = (sp.result_lat && sp.result_lng) ? `${sp.result_lat},${sp.result_lng}` : 'Няма GPS';
                            toInsert.push({
                                "Имейл": sp.worker_email,
                                "Действие": "Проверка локация",
                                "Време": pingTime,
                                "Локация": coords,
                                "Бележка": sp.result_note || (sp.result_distance !== null ? `В обекта (~${sp.result_distance}м)` : 'В обекта')
                            });
                        }
                    });

                    if (toInsert.length > 0) {
                        const { data: insertedRows } = await client.from('chekiraniya').insert(toInsert).select();
                        if (insertedRows && insertedRows.length > 0) {
                            rows = [...insertedRows, ...rows];
                            rows.sort((a, b) => new Date(b['Време']) - new Date(a['Време']));
                        }
                    }
                }
            } catch (syncErr) {
                console.warn('Sync location pings error:', syncErr);
            }

            const { data: persData } = await client.from('personal').select('Имейл, Име');
            if (persData) {
                const pMap = {};
                persData.forEach(p => { if (p['Имейл']) pMap[p['Имейл'].toLowerCase().trim()] = p['Име']; });
                rows.forEach(r => {
                    if (!r['Име'] && r['Имейл'] && pMap[r['Имейл'].toLowerCase().trim()]) {
                        r['Име'] = pMap[r['Имейл'].toLowerCase().trim()];
                    }
                });
            }
        }

        if (currentTab === 'sklad') {
            const nomRes = await client.from('Номенклатура').select('*');
            if (!nomRes.error && nomRes.data) {
                const nomMap = {};
                nomRes.data.forEach(n => { nomMap[String(n['ID Детайл']).trim().toLowerCase()] = n['Мерна единица'] || n['Единици']; });
                rows.forEach(r => {
                    let code = String(r['ID Детайл']).trim().toLowerCase();
                    if (nomMap[code]) r['Мерна единица'] = nomMap[code];
                });
            }
        }

        if (currentTab !== requestedTab) return;
        // ⚡ Записваме в локалния кеш
        adminTabCache[requestedTab] = rows;
        adminCacheTimestamps[requestedTab] = Date.now();
        globalRows = rows; filterTable();
    } catch (err) { document.getElementById('loadingLayout').innerHTML = '❌ Грешка: ' + err.message; }
}

function renderDynamicTable(itemsToRender = null) {
    currentRenderedRows = itemsToRender || globalRows; const config = tableConfigs[currentTab]; document.getElementById('loadingLayout').style.display = 'none';
    const table = document.getElementById('mainTable'); const thead = document.getElementById('tableHead'); const tbody = document.getElementById('tableBody');
    if (thead.innerHTML === '') {
        const headerRow = document.createElement('tr');
        if (!config.readOnlyTab) {
            const thCheck = document.createElement('th');
            thCheck.style.width = '40px'; thCheck.style.textAlign = 'center';
            thCheck.innerHTML = `<input type="checkbox" id="selectAllCb" class="row-checkbox" onchange="toggleSelectAll(event)">`;
            headerRow.appendChild(thCheck);
        }

        config.fields.forEach(f => {
            if (f.hideOnAdd) return;
            const th = document.createElement('th');

            const labelDiv = document.createElement('div');
            labelDiv.innerText = f.label || f.name;
            th.appendChild(labelDiv);

            const filterInput = document.createElement('input');
            filterInput.type = 'text';
            filterInput.placeholder = '🔍 Филтър...';
            filterInput.style.width = '100%';
            filterInput.style.boxSizing = 'border-box';
            filterInput.style.marginTop = '6px';
            filterInput.style.padding = '4px 6px';
            filterInput.style.fontSize = '12px';
            filterInput.style.border = '1px solid #cbd5e1';
            filterInput.style.borderRadius = '4px';
            filterInput.style.fontWeight = 'normal';

            if (globalColumnFilters[f.name]) filterInput.value = globalColumnFilters[f.name];

            filterInput.oninput = (e) => {
                globalColumnFilters[f.name] = e.target.value.toLowerCase().trim();
                filterTable();
            };

            th.appendChild(filterInput);
            headerRow.appendChild(th);
        });

        if (!config.readOnlyTab) {
            const thActions = document.createElement('th'); thActions.innerText = 'Действие'; thActions.style.textAlign = 'center';
            headerRow.appendChild(thActions);
        }
        thead.appendChild(headerRow);
    }

    tbody.innerHTML = '';

    if (currentRenderedRows.length === 0) { tbody.innerHTML = `<tr><td colspan="${config.fields.length + (config.readOnlyTab ? 0 : 2)}" style="text-align:center; padding:40px;">Няма данни.</td></tr>`; table.style.display = 'table'; return; }

    currentRenderedRows.forEach((item) => {
        const row = document.createElement('tr'); const trueIndex = globalRows.indexOf(item);
        if (currentTab === 'chekiraniya') {
            let isLate = false; if (item['Действие'] === 'Влизане' && item['Време']) { let d = new Date(item['Време']); if (d.getHours() > 8 || (d.getHours() === 8 && d.getMinutes() > 0)) isLate = true; }
            if (isLate || (item['Бележка'] && item['Бележка'].includes('ИЗВЪН ОБЕКТА'))) { row.style.backgroundColor = '#fef2f2'; row.style.borderLeft = '5px solid #ef4444'; }
            else if (item['Действие'] === 'Авто излизане') { row.style.backgroundColor = '#fffbeb'; row.style.borderLeft = '5px solid #f59e0b'; }
            else if (item['Действие'] === 'Проверка локация') { row.style.backgroundColor = '#faf5ff'; row.style.borderLeft = '5px solid #a855f7'; }
        }
        if (currentTab === 'personal') {
            if (item['Статус'] === 'Блокиран') { row.style.backgroundColor = '#fef2f2'; row.style.color = '#991b1b'; }
        }
        if (currentTab === 'sklad_inventory') {
            if (typeof item['Общо'] === 'number' && item['Общо'] < 0) {
                row.style.backgroundColor = '#fff7ed';
                row.style.borderLeft = '5px solid #ea580c';
            }
        }

        if (!config.readOnlyTab) {
            const tdCheck = document.createElement('td'); tdCheck.style.textAlign = 'center';
            const isChecked = selectedIndices.has(trueIndex) ? 'checked' : '';
            tdCheck.innerHTML = `<input type="checkbox" class="row-checkbox row-cb" data-index="${trueIndex}" onchange="toggleRowSelection(event, ${trueIndex})" ${isChecked}>`;
            row.appendChild(tdCheck);
        }

        config.fields.forEach(f => {
            if (f.hideOnAdd) return; const td = document.createElement('td'); let val = item[f.name] !== undefined && item[f.name] !== null ? item[f.name] : '';

            if (currentTab === 'personal' && f.name === 'Статус') {
                if (val === 'Активен') td.innerHTML = `<span style="background:#dcfce7; color:#15803d; padding:4px 10px; border-radius:12px; font-weight:800; font-size:0.9em;">🟢 ${val}</span>`;
                else td.innerHTML = `<span style="background:#fee2e2; color:#b91c1c; padding:4px 10px; border-radius:12px; font-weight:800; font-size:0.9em;">🛑 ${val}</span>`;
                row.appendChild(td); return;
            }

            if (currentTab === 'plan' && f.name === 'produced_info') {
                let done = item['__doneQty'] !== undefined ? item['__doneQty'] : 0;
                let target = item['__targetQty'] !== undefined ? item['__targetQty'] : (parseFloat(item['Целево количество']) || 0);
                let remain = item['__remainQty'] !== undefined ? item['__remainQty'] : Math.max(0, target - done);
                
                let badge = '';
                if (done > target) {
                    let surplus = done - target;
                    badge = `<span style="color:#15803d; font-weight:800; background:#f0fdf4; border:1px solid #bbf7d0; padding:2px 7px; border-radius:8px; font-size:0.82em;" title="Свръхизпълнение с ${surplus} бр.">🟢 +${surplus} свръх</span>`;
                } else if (remain > 0) {
                    badge = `<span style="color:#ea580c; font-weight:800; background:#fff7ed; border:1px solid #fed7aa; padding:2px 7px; border-radius:8px; font-size:0.82em;" title="Остават ${remain} бр. за изработка">⏳ -${remain} ост.</span>`;
                } else {
                    badge = `<span style="color:#15803d; font-weight:800; background:#f0fdf4; border:1px solid #bbf7d0; padding:2px 7px; border-radius:8px; font-size:0.82em;" title="Планът е изпълнен на 100%">✅ Изпълнен</span>`;
                }

                td.innerHTML = `
                    <div style="display:inline-flex; align-items:center; gap:6px; white-space:nowrap;">
                        <span style="font-weight:800; color:#1e293b; font-size:1.02em;">${done}</span>
                        <span style="color:#94a3b8; font-size:0.85em;">/</span>
                        <span style="color:#64748b; font-size:0.9em; font-weight:600;">${target} бр.</span>
                        ${badge}
                    </div>
                `;
                td.style.minWidth = '170px';
                row.appendChild(td); return;
            }

            if (currentTab === 'plan' && f.name === 'progress_bar') {
                let pct = item['__pct'] !== undefined ? item['__pct'] : 0;
                let done = item['__doneQty'] !== undefined ? item['__doneQty'] : 0;
                let target = item['__targetQty'] !== undefined ? item['__targetQty'] : (parseFloat(item['Целево количество']) || 0);
                let lastOp = item['__lastOp'] ? ` | Последна оп.: ${item['__lastOp']}` : '';

                let barColor = 'linear-gradient(90deg, #10b981, #059669)';
                let badgeBg = '#dcfce7';
                let badgeColor = '#15803d';
                let badgeBorder = '#bbf7d0';

                if (pct >= 100) {
                    barColor = 'linear-gradient(90deg, #10b981, #059669)';
                    badgeBg = '#dcfce7';
                    badgeColor = '#15803d';
                    badgeBorder = '#bbf7d0';
                } else if (pct >= 70) {
                    barColor = 'linear-gradient(90deg, #3b82f6, #2563eb)';
                    badgeBg = '#dbeafe';
                    badgeColor = '#1d4ed8';
                    badgeBorder = '#bfdbfe';
                } else if (pct >= 35) {
                    barColor = 'linear-gradient(90deg, #f59e0b, #d97706)';
                    badgeBg = '#fef3c7';
                    badgeColor = '#b45309';
                    badgeBorder = '#fde68a';
                } else if (pct > 0) {
                    barColor = 'linear-gradient(90deg, #f97316, #ea580c)';
                    badgeBg = '#ffedd5';
                    badgeColor = '#c2410c';
                    badgeBorder = '#fed7aa';
                } else {
                    barColor = '#e2e8f0';
                    badgeBg = '#f1f5f9';
                    badgeColor = '#64748b';
                    badgeBorder = '#e2e8f0';
                }

                let fillWidth = Math.min(100, Math.max(0, pct));

                td.innerHTML = `
                    <div style="display:flex; align-items:center; gap:8px; min-width:130px; max-width:180px;" title="Цел: ${target} бр. | Изработени: ${done} бр. (${pct}%)${lastOp}">
                        <div style="flex:1; background:#e2e8f0; border-radius:10px; height:12px; position:relative; overflow:hidden; box-shadow:inset 0 1px 2px rgba(0,0,0,0.08);">
                            <div style="width:${fillWidth}%; height:100%; background:${barColor}; border-radius:10px; transition:width 0.3s ease;"></div>
                        </div>
                        <span style="background:${badgeBg}; color:${badgeColor}; border:1px solid ${badgeBorder}; font-weight:800; font-size:0.82em; padding:2px 7px; border-radius:12px; min-width:44px; text-align:center; display:inline-block;">
                            ${pct}%
                        </span>
                    </div>
                `;
                td.style.minWidth = '140px';
                row.appendChild(td); return;
            }

            if (currentTab === 'plan' && f.name === 'Статус') {
                let sStyle = 'background:#eff6ff; color:#1d4ed8; border:1px solid #bfdbfe;';
                if (val === 'Завършен') sStyle = 'background:#dcfce7; color:#15803d; border:1px solid #bbf7d0;';
                else if (val && val.includes('Опакован')) sStyle = 'background:#fef3c7; color:#b45309; border:1px solid #fde68a;';
                else if (val && val.includes('Изпратен')) sStyle = 'background:#f1f5f9; color:#475569; border:1px solid #cbd5e1;';
                td.innerHTML = `<span style="${sStyle} padding:4px 10px; border-radius:20px; font-weight:800; font-size:0.85em; display:inline-flex; align-items:center; gap:4px;">${val}</span>`;
                row.appendChild(td); return;
            }

            if (currentTab === 'otcheti' && f.name === 'Статус') {
                let hasPendingDisc = (typeof globalMaterialRequests !== 'undefined') && globalMaterialRequests.some(r =>
                    r.status === 'Чакаща' &&
                    r.part_name === item['ID Детайл'] &&
                    r.notes && r.notes.includes('"type":"discrepancy"')
                );
                if (hasPendingDisc) {
                    td.innerHTML = `<span style="background:#fff7ed; color:#c2410c; border:1.5px solid #fed7aa; padding:3px 8px; border-radius:12px; font-weight:800; font-size:0.82em;" title="Има чакащо доотчитане от предходна операция">⚠️ Отчетено (Чака доотчитане)</span>`;
                    row.style.borderLeft = '5px solid #ea580c';
                    row.style.backgroundColor = '#fffbeb';
                    row.appendChild(td);
                    return;
                }
            }

            if ((f.name === 'Време' || f.name === 'Дата') && val) { try { let pVal = val; if (!pVal.endsWith('Z') && !pVal.includes('+')) pVal += 'Z'; td.innerHTML = `<b>${new Date(pVal).toLocaleString('bg-BG')}</b>`; } catch (e) { td.innerText = val; } row.appendChild(td); return; }
            if (currentTab === 'chekiraniya' && f.name === 'Действие') {
                if (val === 'Влизане') td.innerHTML = `<span style="background:#dcfce7; color:#15803d; padding:4px 10px; border-radius:12px; font-weight:800; font-size:0.9em;">🟢 ${val}</span>`;
                else if (val === 'Излизане') td.innerHTML = `<span style="background:#fee2e2; color:#b91c1c; padding:4px 10px; border-radius:12px; font-weight:800; font-size:0.9em;">🔴 ${val}</span>`;
                else if (val === 'Авто излизане') td.innerHTML = `<span style="background:#fef3c7; color:#b45309; padding:4px 10px; border-radius:12px; font-weight:800; font-size:0.9em;">🕒 ${val}</span>`;
                else if (val === 'Проверка локация') td.innerHTML = `<span style="background:#f3e8ff; color:#7e22ce; border:1px solid #d8b4fe; padding:4px 10px; border-radius:12px; font-weight:800; font-size:0.9em;">📍 ${val}</span>`;
                else td.innerText = val; row.appendChild(td); return;
            }
            if (currentTab === 'chekiraniya' && f.name === 'Локация' && val && val.includes(',')) { let coords = val.replace(/\s/g, ''); td.innerHTML = `<a href="https://www.google.com/maps?q=${coords}" target="_blank" style="color:#2563eb; font-weight:bold; text-decoration:none;">📍 Карта</a>`; row.appendChild(td); return; }
            if (currentTab === 'chekiraniya' && f.name === 'Бележка' && val.includes('ИЗВЪН ОБЕКТА')) { td.innerHTML = `⚠️ <b style="color:#dc2626;">${val}</b>`; row.appendChild(td); return; }
            if (typeof val === 'string' && val.startsWith('http')) { td.innerHTML = `<a href="${val}" target="_blank" style="background:#e0e7ff; color:#4338ca; padding:5px 12px; border-radius:6px; font-weight:800; text-decoration:none; font-size:0.85em; display:inline-block;">🔗 Отвори</a>`; row.appendChild(td); return; }
            if ((currentTab === 'plan' || currentTab === 'nomenklatura' || currentTab === 'sklad_inventory' || currentTab === 'sklad') && f.name === 'ID Детайл' && val) {
                let safeVal = String(val).replace(/"/g, '&quot;').replace(/'/g, '\\\'');
                let encVal = encodeURIComponent(String(val));
                td.innerHTML = `<button data-part="${encVal}" onclick="if(typeof openResolverTreeFromBtn==='function'){openResolverTreeFromBtn(this)}else{openResolverTree('${safeVal}')}" style="background:none; border:none; color:#2563eb; font-weight:900; text-decoration:underline; cursor:pointer; font-size:1em; padding:0; text-align:left;" title="🔍 Виж къде се влага или рецепта на материала">${val}</button>`;
                if (item['__packaged_info']) td.innerHTML += item['__packaged_info'];
                row.appendChild(td); return;
            }
            if (currentTab === 'sklad_inventory' && (f.name === 'Общо' || f.name === 'Свободни') && typeof val === 'number' && val < 0) {
                td.innerHTML = `<span style="background:#fef2f2; color:#dc2626; border:1.5px solid #fecaca; padding:2px 8px; border-radius:10px; font-weight:800; display:inline-block;" title="Дефицит: следващата операция е отчела повече бройки, чака се доотчитане тук">⚠️ ${val} бр. (Дефицит)</span>`;
                row.appendChild(td); return;
            }
            if (currentTab === 'sklad_inventory' && f.name === 'Минимално количество/Буфер' && typeof val === 'number' && val < 0) {
                td.innerHTML = `<span style="color:#dc2626; font-weight:bold;">${val}</span>`;
                row.appendChild(td); return;
            }
            if (currentTab === 'sklad' && f.name === 'Остатък') {
                let ost = parseFloat(val) || 0;
                let minStock = parseFloat(item['Минимално количество']) || 0;
                if (minStock > 0 && ost <= minStock) {
                    td.innerHTML = `<span style="background:#fee2e2; color:#b91c1c; border:1.5px solid #fca5a5; padding:3px 8px; border-radius:12px; font-weight:800; font-size:0.9em;" title="⚠️ Критична наличност: остатъкът (${ost}) е под или на буфера (${minStock})">⚠️ ${ost} (Критично)</span>`;
                    row.appendChild(td); return;
                }
            }
            if (currentTab === 'factory_tools' && f.name === 'calibration_due') {
                if (!val) {
                    td.innerHTML = '<span style="color:#94a3b8; font-size:0.85em;">Не е въведен</span>';
                } else {
                    let today = new Date(); today.setHours(0,0,0,0);
                    let due = new Date(val); due.setHours(0,0,0,0);
                    let diffDays = Math.ceil((due - today) / (1000 * 60 * 60 * 24));
                    if (diffDays < 0) {
                        td.innerHTML = `<span style="background:#fee2e2; color:#b91c1c; border:1.5px solid #fca5a5; padding:3px 8px; border-radius:12px; font-weight:800; font-size:0.85em;" title="🚨 Просрочена проверка с ${Math.abs(diffDays)} дни!">🚨 Изтекъл (${val})</span>`;
                    } else if (diffDays <= 30) {
                        td.innerHTML = `<span style="background:#fef3c7; color:#b45309; border:1.5px solid #fde68a; padding:3px 8px; border-radius:12px; font-weight:800; font-size:0.85em;" title="⚠️ Наближава срокът за замерване (остават ${diffDays} дни)">⚠️ След ${diffDays} дни (${val})</span>`;
                    } else {
                        td.innerHTML = `<span style="background:#dcfce7; color:#15803d; border:1px solid #bbf7d0; padding:3px 8px; border-radius:12px; font-weight:700; font-size:0.85em;">🟢 До ${val} (${diffDays} дни)</span>`;
                    }
                }
                row.appendChild(td); return;
            }
            if (currentTab === 'equipment_protocols' && f.name === 'status') {
                let stStyle = 'background:#f1f5f9; color:#475569; border:1px solid #cbd5e1;';
                let stIcon = '📄';
                if (val === 'Чака подпис') {
                    stStyle = 'background:#fff7ed; color:#c2410c; border:1.5px solid #fed7aa;';
                    stIcon = '⏳';
                } else if (val === 'Приет') {
                    stStyle = 'background:#f0fdf4; color:#15803d; border:1.5px solid #bbf7d0;';
                    stIcon = '🟢';
                } else if (val === 'Върнат') {
                    stStyle = 'background:#eff6ff; color:#1d4ed8; border:1.5px solid #bfdbfe;';
                    stIcon = '🔄';
                } else if (val === 'Бракуван') {
                    stStyle = 'background:#fef2f2; color:#dc2626; border:1.5px solid #fecaca;';
                    stIcon = '🗑️';
                }
                td.innerHTML = `<span style="${stStyle} padding:4px 10px; border-radius:12px; font-weight:800; font-size:0.85em; display:inline-flex; align-items:center; gap:4px;">${stIcon} ${val}</span>`;
                row.appendChild(td); return;
            }
            if (currentTab === 'equipment_protocols' && f.name === 'signed_at') {
                if (!val) {
                    td.innerHTML = '<span style="color:#94a3b8; font-style:italic; font-size:0.85em;">Не е подписан</span>';
                } else {
                    try {
                        let pVal = val; if (!pVal.endsWith('Z') && !pVal.includes('+')) pVal += 'Z';
                        td.innerHTML = `<span style="color:#15803d; font-weight:700; font-size:0.88em;">🔒 ${new Date(pVal).toLocaleString('bg-BG')}</span>`;
                    } catch(e) {
                        td.innerText = val;
                    }
                }
                row.appendChild(td); return;
            }
            if (f.name === 'pack_size') {
                if (!val || String(val).trim() === '' || String(val).trim() === 'null') {
                    td.innerHTML = '<span style="color:#94a3b8; font-weight:bold;">—</span>';
                    row.appendChild(td); return;
                }
                if (currentTab === 'nomenklatura') {
                    const isMaterial = item && item['Тип'] && String(item['Тип']).trim().toLowerCase() === 'материал';
                    if (!isMaterial) {
                        td.innerHTML = '<span style="color:#94a3b8; font-weight:bold;">—</span>';
                        row.appendChild(td); return;
                    }
                }
                let cleanVal = String(val).trim();
                let displayVal = /^\d+(\.\d+)?$/.test(cleanVal) ? `${cleanVal} бр.` : cleanVal;
                td.innerHTML = `<span style="background:#f0fdf4; color:#166534; border:1px solid #bbf7d0; padding:2px 8px; border-radius:10px; font-weight:800; font-size:0.88em; display:inline-flex; align-items:center; gap:4px;" title="Опаковка / Разфасовка">📦 ${displayVal}</span>`;
                row.appendChild(td); return;
            }
            if (currentTab === 'tooling_sklad' && f.name === 'quantity') {
                let q = parseFloat(val) || 0;
                let pack = parseFloat(item['pack_size']) || 10;
                let boxesStr = '';
                if (pack > 1 && q > 0) {
                    let b = (q % pack === 0) ? (q / pack) : (q / pack).toFixed(1);
                    boxesStr = ` <small style="color:#64748b; font-weight:600;">(${b} ${b == 1 ? 'кут.' : 'кутии'})</small>`;
                }
                td.innerHTML = `<b>${q}</b> бр.${boxesStr}`;
                row.appendChild(td); return;
            }
            td.innerText = val;
            if (currentTab === 'plan' && f.name === 'Вътрешно име' && item['__packaged_info']) {
                td.innerHTML = val + item['__packaged_info'];
            }
            row.appendChild(td);
        });
        if (!config.readOnlyTab) {
            const tdActions = document.createElement('td'); tdActions.style.textAlign = 'center';
            let extraActionBtns = '';
            if (currentTab === 'sklad') {
                let safeCode = String(item['ID Детайл'] || '').replace(/"/g, '&quot;').replace(/'/g, '\\\'');
                extraActionBtns = `
                    <button type="button" class="action-btn" onclick="openCreateMaterialOrderModal('${safeCode}')" title="🛒 Поръчай материал (бърза поръчка &amp; бланка)" style="background:#eff6ff; color:#1d4ed8; border:1px solid #bfdbfe; margin-right:4px; font-weight:bold;">🛒</button>
                    <button type="button" class="action-btn" onclick="openMaterialDossier('${safeCode}')" title="📜 Картон на материала (История на движенията)" style="background:#e0e7ff; color:#3730a3; border:1px solid #c7d2fe; margin-right:4px;">📜</button>
                `;
            }
            if (currentTab === 'factory_tools') {
                let safeCode = String(item['tool_code'] || '').replace(/"/g, '&quot;').replace(/'/g, '\\\'');
                let safeName = String(item['tool_name'] || '').replace(/"/g, '&quot;').replace(/'/g, '\\\'');
                extraActionBtns = `
                    <button type="button" class="action-btn" onclick="openToolCalibrationModal(${item.id || 'null'}, '${safeCode}', '${safeName}')" title="📏 Ново замерване с еталони / Проверка" style="background:#fef3c7; color:#b45309; border:1px solid #fde68a; margin-right:4px; font-weight:bold;">📏</button>
                    <button type="button" class="action-btn" onclick="openToolCalibrationHistoryModal('${safeCode}', '${safeName}')" title="📋 Метрологичен дневник / История на замерванията" style="background:#e0f2fe; color:#0369a1; border:1px solid #bae6fd; margin-right:4px; font-weight:bold;">📋</button>
                `;
            }
            if (currentTab === 'equipment_protocols') {
                extraActionBtns = `
                    <button type="button" class="action-btn" onclick="openEquipmentProtocolViewModal(${item.id})" title="👁️ Преглед на протокола и зачислените вещи" style="background:#eff6ff; color:#1d4ed8; border:1px solid #bfdbfe; margin-right:4px; font-weight:bold;">👁️</button>
                `;
            }
            tdActions.innerHTML = `${extraActionBtns}<button class="action-btn btn-edit" onclick="openEditModal(${trueIndex})" title="Редактирай">✏️</button><button class="action-btn btn-delete" onclick="deleteItem(${trueIndex})" title="Изтрий">🗑️</button>`;
            row.appendChild(tdActions);
        }
        tbody.appendChild(row);
    });
    table.style.display = 'table';

    const allCheckbox = document.getElementById('selectAllCb');
    if (allCheckbox) {
        const visibleCheckboxes = document.querySelectorAll('.row-cb');
        const allChecked = visibleCheckboxes.length > 0 && Array.from(visibleCheckboxes).every(cb => cb.checked);
        allCheckbox.checked = allChecked;
    }
}

function filterTable() {
    if (currentTab === 'probi') {
        const q = String(document.getElementById('searchInput')?.value || '').trim();
        if (typeof onProbiSearchFromGlobal === 'function') onProbiSearchFromGlobal(q);
        return;
    }
    if (currentTab === 'audit_3s') {
        const q = String(document.getElementById('searchInput')?.value || '').trim();
        if (typeof on3sSearchFromGlobal === 'function') on3sSearchFromGlobal(q);
        return;
    }
    const normalizeStr = (str) => String(str || '').replace(/[\u00A0\s]+/g, ' ').trim().toLowerCase();
    const q = normalizeStr(document.getElementById('searchInput').value);
    let f = globalRows;

    if (q) {
        f = f.filter(r => Object.values(r).some(v => normalizeStr(v).includes(q)));
    }

    Object.keys(globalColumnFilters).forEach(col => {
        const colQ = globalColumnFilters[col];
        if (colQ) {
            f = f.filter(r => {
                let val = r[col];
                if ((col === 'Време' || col === 'Дата') && val) {
                    try { let pVal = val; if (!pVal.endsWith('Z') && !pVal.includes('+')) pVal += 'Z'; val = new Date(pVal).toLocaleString('bg-BG'); } catch (e) { }
                }
                return normalizeStr(val).includes(colQ);
            });
        }
    });

    renderDynamicTable(f);
}

let globalNomenclatureCodes = [];

function filterSkladDetails(val) {
    let dropdown = document.getElementById('skladDetailDropdown');
    if (!dropdown) return;
    dropdown.innerHTML = '';
    let q = val.toLowerCase().trim();
    if (!q) { dropdown.style.display = 'none'; return; }

    let matches = globalNomenclatureCodes.filter(code => code.toLowerCase().includes(q));
    if (matches.length === 0) { dropdown.style.display = 'none'; return; }

    matches.slice(0, 50).forEach(match => {
        let div = document.createElement('div');
        div.style.padding = '8px 12px';
        div.style.cursor = 'pointer';
        div.style.borderBottom = '1px solid #f1f5f9';
        div.innerText = match;
        div.onmouseover = () => div.style.backgroundColor = '#f8fafc';
        div.onmouseout = () => div.style.backgroundColor = 'transparent';
        div.onclick = () => {
            document.getElementById('inp_skladDetail').value = match;
            dropdown.style.display = 'none';
            loadSkladOperations(match);
        };
        dropdown.appendChild(div);
    });
    dropdown.style.display = 'block';
}

function buildForm(data = null) {
    const area = document.getElementById('formFieldsArea'); area.innerHTML = ''; const fields = tableConfigs[currentTab].fields;

    if (currentTab === 'sklad_inventory') {
        if (!isEditMode) {
            area.innerHTML = `
            <div class="form-group" style="position:relative;">
                <label>ID Детайл (Код):</label>
                <input type="text" id="inp_skladDetail" class="form-input" 
                    oninput="filterSkladDetails(this.value); loadSkladOperations(this.value);" 
                    onfocus="filterSkladDetails(this.value)" 
                    onblur="setTimeout(() => { let d = document.getElementById('skladDetailDropdown'); if(d) d.style.display = 'none'; }, 200)" 
                    required autocomplete="off">
                <div id="skladDetailDropdown" style="display:none; position:absolute; top:100%; left:0; width:100%; max-height:200px; overflow-y:auto; background:white; border:1px solid #cbd5e1; border-radius:4px; z-index:1000; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);"></div>
            </div>
            <div class="form-group"><label>Операция:</label><select id="inp_skladOp" class="form-input" required><option value="">-- Въведете детайл първо --</option></select></div>
            <div class="form-group"><label>Количество (физическо):</label><input type="text" id="inp_skladQty" class="form-input" value="0" required oninput="if(this.value && this.value != '0') { document.getElementById('inp_skladDefects').disabled = true; } else { document.getElementById('inp_skladDefects').disabled = false; }"></div>
            <div class="form-group"><label>БРАК (Бройки):</label><input type="number" id="inp_skladDefects" class="form-input" step="any" min="0" placeholder="0" oninput="if(this.value && this.value != '0') { document.getElementById('inp_skladQty').disabled = true; document.getElementById('inp_skladQty').value = '0'; } else { document.getElementById('inp_skladQty').disabled = false; }"></div>
            <div class="form-group"><label>Количество (буфер):</label><input type="text" id="inp_skladQtyBuffer" class="form-input" value="0" required></div>
            <div class="form-group"><label>Процент Свръхпроизводство (%):</label><input type="number" id="inp_skladScrap" class="form-input" step="any" min="0" placeholder="Без промяна"></div>
          `;

            if (globalNomenclatureCodes.length === 0) {
                client.from('Номенклатура').select('*').limit(100000).then(res => {
                    if (res.data) {
                        globalNomenclatureCodes = res.data.map(n => String(n['ID Детайл']).trim()).filter(Boolean);
                    }
                });
            }
        } else {
            area.innerHTML = `
            <div class="form-group"><label>ID Детайл (Код):</label><input type="text" id="inp_skladDetail" class="form-input" readonly style="background:#f1f5f9; color:#64748b;"></div>
            <div class="form-group"><label>Операция:</label><input type="text" id="inp_skladOp" class="form-input" readonly style="background:#f1f5f9; color:#64748b;"><input type="hidden" id="inp_skladRealOp"></div>
            <div class="form-group"><label>Текуща наличност:</label><input type="number" id="inp_skladOldQty" class="form-input" readonly style="background:#f1f5f9; color:#64748b;"></div>
            <div class="form-group"><label>НОВА наличност:</label><input type="number" id="inp_skladQty" class="form-input" step="any" required></div>
            <div class="form-group"><label>Буфер (Минимално количество):</label><input type="number" id="inp_skladBuffer" class="form-input" step="any" required></div>
            <div class="form-group"><label>Процент Свръхпроизводство (%):</label><input type="number" id="inp_skladScrap" class="form-input" step="any" min="0" required></div>
          `;
            document.getElementById('inp_skladDetail').value = data['ID Детайл'] || '';
            document.getElementById('inp_skladOp').value = data['Операция'] || '';
            document.getElementById('inp_skladRealOp').value = data['Операция'] || '';
            document.getElementById('inp_skladOldQty').value = data['Общо'] || 0;
            document.getElementById('inp_skladQty').value = data['Общо'] || 0;
            document.getElementById('inp_skladBuffer').value = data['Минимално количество/Буфер'] || 0;
            document.getElementById('inp_skladScrap').value = data['% Брак'] || 0;
        }
        return;
    }

    fields.forEach(f => {
        if (f.hideInForm || (f.hideOnAdd && !isEditMode)) return;
        const group = document.createElement('div');
        group.className = 'form-group';
        const label = document.createElement('label');
        label.innerText = f.label || f.name;
        group.appendChild(label);
        let input;

        if (f.name === 'machine_name' || f.name === 'workstation_name') {
            input = document.createElement('select');
            input.id = 'inp_' + f.name;
            input.className = 'form-input';

            const isWorkstation = (f.name === 'workstation_name');
            const defOpt = document.createElement('option');
            defOpt.value = '';
            defOpt.innerText = isWorkstation ? '-- Изберете работно място / машина --' : '-- Изберете машина / пост --';
            input.appendChild(defOpt);

            if (!isWorkstation) {
                const allOpt = document.createElement('option');
                allOpt.value = 'Общо';
                allOpt.innerText = '🌐 Общо / Всички машини';
                input.appendChild(allOpt);
            } else {
                const skladOpt = document.createElement('option');
                skladOpt.value = 'Склад';
                skladOpt.innerText = '📦 Склад (не е зачислено)';
                input.appendChild(skladOpt);
            }

            const macList = window.cachedFactoryMachines || [];
            macList.forEach(m => {
                const opt = document.createElement('option');
                opt.value = m.name;
                opt.innerText = m.code ? `${m.name} (№ ${m.code})` : m.name;
                input.appendChild(opt);
            });

            const currVal = (data && data[f.name] !== undefined && data[f.name] !== null) ? String(data[f.name]).trim() : (f.def || '');
            if (currVal) {
                let found = false;
                for (let i = 0; i < input.options.length; i++) {
                    if (input.options[i].value.toLowerCase() === currVal.toLowerCase()) {
                        input.selectedIndex = i;
                        found = true;
                        break;
                    }
                }
                if (!found) {
                    const customOpt = document.createElement('option');
                    customOpt.value = currVal;
                    customOpt.innerText = `${currVal} (Текущо)`;
                    input.appendChild(customOpt);
                    input.value = currVal;
                }
            } else {
                input.value = '';
            }
        } else if (f.type === 'select') {
            input = document.createElement('select');
            input.id = 'inp_' + f.name;
            (f.options || []).forEach(opt => {
                const option = document.createElement('option');
                option.value = opt;
                option.innerText = opt;
                input.appendChild(option);
            });
            if (data && data[f.name]) input.value = data[f.name];
            else if (f.def) input.value = f.def;
        } else {
            input = document.createElement('input');
            input.type = f.type === 'number' ? 'number' : 'text';
            input.id = 'inp_' + f.name;
            if (f.type === 'number') input.step = 'any';
            if (data && data[f.name] !== undefined && data[f.name] !== null) input.value = data[f.name];
            else if (f.def !== undefined) input.value = typeof f.def === 'function' ? f.def() : f.def;
        }

        if (f.required) input.required = true;
        if (f.name === 'ID Детайл' || f.name === 'ID Родител' || f.name === 'ID Компонент' || f.name === 'Код на детайла') {
            input.setAttribute('list', 'dl_nomenklatura');
            input.setAttribute('autocomplete', 'off');
            input.placeholder = '🔍 Въведете или изберете код...';
        } else if (f.name === 'Машина') {
            input.setAttribute('list', 'dl_machines');
            input.setAttribute('autocomplete', 'off');
            input.placeholder = '🏭 Въведете или изберете машина...';
        } else if (f.name === 'Норма (мин/бр)') {
            input.placeholder = 'напр. 3.5 мин/бр';
        }
        if (f.readonly || (isEditMode && f.readonlyOnEdit)) {
            input.readOnly = true;
            input.style.backgroundColor = '#f1f5f9';
            input.style.color = '#64748b';
            input.style.cursor = 'not-allowed';
            if (input.tagName.toLowerCase() === 'select') input.disabled = true;
        }
        group.appendChild(input);
        area.appendChild(group);
    });

    if (currentTab === 'sklad') {
        const updateSkladOstatuk = () => {
            const start = parseFloat(document.getElementById('inp_Начална наличност')?.value) || 0;
            const deliv = parseFloat(document.getElementById('inp_Доставено')?.value) || 0;
            const used = parseFloat(document.getElementById('inp_Изразходено')?.value) || 0;
            const ostEl = document.getElementById('inp_Остатък');
            if (ostEl) ostEl.value = (start + deliv - used);
        };

        if (isEditMode && data) {
            const baseUsed = parseFloat(data['Изразходено']) || 0;
            const baseDeliv = parseFloat(data['Доставено']) || 0;
            const matCode = data['ID Детайл'] || '';

            const quickBox = document.createElement('div');
            quickBox.className = 'sklad-quick-box';
            quickBox.style.cssText = 'background:linear-gradient(135deg, #f0fdf4 0%, #eff6ff 100%); border:1.5px solid #93c5fd; border-radius:10px; padding:12px; margin-bottom:16px; box-shadow:0 2px 4px rgba(0,0,0,0.04);';
            quickBox.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                    <span style="font-weight:800; color:#1e3a8a; font-size:0.92em;">⚡ Бързи складови операции (Без смятане на ум)</span>
                    <span style="font-size:0.78em; color:#64748b;">Въведете само промяната</span>
                </div>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
                    <div style="background:#fff; border:1.5px solid #fed7aa; border-radius:8px; padding:8px 10px;">
                        <label style="display:block; font-size:0.82em; font-weight:800; color:#c2410c; margin-bottom:4px;">
                            🔴 Изпиши (- бр.):
                        </label>
                        <input type="number" id="inp_quick_deduct" class="form-input" placeholder="напр. 25" min="0" step="any" style="border-color:#fb923c; font-weight:800; font-size:1.1em; color:#9a3412;">
                        <div style="font-size:0.73em; color:#78716c; margin-top:3px;">Увеличава Изразходено с въведеното</div>
                    </div>
                    <div style="background:#fff; border:1.5px solid #bbf7d0; border-radius:8px; padding:8px 10px;">
                        <label style="display:block; font-size:0.82em; font-weight:800; color:#15803d; margin-bottom:4px;">
                            🟢 Заприходи (+ бр.):
                        </label>
                        <input type="number" id="inp_quick_add" class="form-input" placeholder="напр. 50" min="0" step="any" style="border-color:#4ade80; font-weight:800; font-size:1.1em; color:#166534;">
                        <div style="font-size:0.73em; color:#78716c; margin-top:3px;">Увеличава Доставено с въведеното</div>
                    </div>
                </div>
            `;
            area.insertBefore(quickBox, area.firstChild);

            setTimeout(() => {
                const qDeduct = document.getElementById('inp_quick_deduct');
                const qAdd = document.getElementById('inp_quick_add');
                if (qDeduct) {
                    qDeduct.addEventListener('input', () => {
                        const val = parseFloat(qDeduct.value) || 0;
                        const el = document.getElementById('inp_Изразходено');
                        if (el) {
                            el.value = baseUsed + val;
                            updateSkladOstatuk();
                        }
                    });
                }
                if (qAdd) {
                    qAdd.addEventListener('input', () => {
                        const val = parseFloat(qAdd.value) || 0;
                        const el = document.getElementById('inp_Доставено');
                        if (el) {
                            el.value = baseDeliv + val;
                            updateSkladOstatuk();
                        }
                    });
                }
            }, 50);

            // Add bottom button for Card / History
            const safeMatCode = String(matCode).replace(/"/g, '&quot;').replace(/'/g, '\\\'');
            const historyBtn = document.createElement('button');
            historyBtn.type = 'button';
            historyBtn.className = 'btn-primary';
            historyBtn.style.cssText = 'background:#4338ca; width:100%; margin-top:14px; padding:9px 12px; font-weight:800; border-radius:8px; font-size:0.9em;';
            historyBtn.innerHTML = '📜 Виж Картон на материала (История на движенията)';
            historyBtn.onclick = () => openMaterialDossier(safeMatCode);
            area.appendChild(historyBtn);
        } else if (!isEditMode) {
            // In Add Mode: duplicate detection live in form
            setTimeout(() => {
                const inpCode = document.getElementById('inp_ID Детайл');
                if (inpCode) {
                    const warnDiv = document.createElement('div');
                    warnDiv.id = 'skladAddWarn';
                    warnDiv.style.cssText = 'display:none; color:#991b1b; background:#fee2e2; border:1.5px solid #fca5a5; padding:8px 12px; border-radius:6px; font-size:0.85em; font-weight:700; margin-top:6px;';
                    inpCode.parentNode.appendChild(warnDiv);

                    const checkDup = () => {
                        const val = String(inpCode.value || '').trim().toLowerCase();
                        if (!val) { warnDiv.style.display = 'none'; return; }
                        const matchIdx = globalRows.findIndex(r => String(r['ID Детайл'] || '').trim().toLowerCase() === val);
                        if (matchIdx !== -1) {
                            const match = globalRows[matchIdx];
                            warnDiv.innerHTML = `⚠️ Внимание: Този материал вече съществува в склада с наличност <b>${match['Остатък'] !== undefined ? match['Остатък'] : (match['Начална наличност'] || 0)} ${match['Мерна единица'] || 'бр.'}</b>! <br><button type="button" onclick="closeModal(); openEditModal(${matchIdx});" style="margin-top:6px; background:#dc2626; color:white; border:none; padding:4px 10px; border-radius:4px; font-weight:bold; cursor:pointer;">✏️ Отвори съществуващия запис за редакция</button>`;
                            warnDiv.style.display = 'block';
                        } else {
                            warnDiv.style.display = 'none';
                        }
                    };
                    inpCode.addEventListener('input', checkDup);
                    inpCode.addEventListener('change', checkDup);
                }
            }, 50);
        }

        setTimeout(() => {
            ['inp_Начална наличност', 'inp_Доставено', 'inp_Изразходено'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.addEventListener('input', updateSkladOstatuk);
            });
        }, 50);
    }
}

function openAddModal() { isEditMode = false; editingIndex = null; document.getElementById('modalTitle').innerHTML = '➕ Добавяне: ' + tableConfigs[currentTab].label.replace(/[^а-яА-Я ]/g, '').trim(); buildForm(); document.getElementById('modalBackdrop').style.display = 'flex'; }
function openEditModal(index) { isEditMode = true; editingIndex = index; document.getElementById('modalTitle').innerHTML = '✏️ Редакция: ' + tableConfigs[currentTab].label.replace(/[^а-яА-Я ]/g, '').trim(); buildForm(globalRows[index]); document.getElementById('modalBackdrop').style.display = 'flex'; }
function closeModal() { document.getElementById('modalBackdrop').style.display = 'none'; }

async function fetchAll(table, orderCol) {
    let allData = [];
    let from = 0;
    const step = 1000;
    while (true) {
        let query = client.from(table).select('*').range(from, from + step - 1);
        if (orderCol) query = query.order(orderCol, { ascending: true });
        let { data, error } = await query;
        if (error || !data || data.length === 0) break;
        allData = allData.concat(data);
        if (data.length < step) break;
        from += step;
    }
    return { data: allData };
}

async function computeSkladData() {
    const table = 'inventory';
    const [invRes, nomRes, bufferRes, routeRes] = await Promise.all([
        fetchAll(table),
        fetchAll('Номенклатура'),
        fetchAll('sklad_bufferi'),
        fetchAll('marshruti')
    ]);

    let bufferMap = {};
    let bufferScrapMap = {};
    let bufferOpMap = {};
    if (bufferRes.data) {
        bufferRes.data.forEach(b => {
            let code = String(b['ID Детайл']).trim().toLowerCase();
            bufferMap[code] = parseFloat(b['Буфер']) || 0;
            bufferScrapMap[code] = parseFloat(b['% Брак']) || 0;
            bufferOpMap[code] = String(b['Операция'] || '').trim();
        });
    }

    let nomNameMap = {};
    let nomLocMap = {};
    if (nomRes.data) {
        nomRes.data.forEach(n => {
            let c = String(n['ID Детайл']).trim().toLowerCase();
            nomNameMap[c] = n['Вътрешно име'] || n['ID Детайл'];
            nomLocMap[c] = String(n['Местоположение'] || '').trim();
        });
    }

    let routeMap = {};
    let lastDropoffMap = {};
    if (routeRes.data) {
        let routeGroups = {};
        routeRes.data.forEach(r => {
            let code = String(r['Код на детайла']).trim().toLowerCase();
            let op = String(r['Име на операция']).trim().toLowerCase();
            let dropoff = String(r['Инструкция за оставяне'] || '').trim();
            if (dropoff) {
                if (!routeMap[code]) routeMap[code] = {};
                routeMap[code][op] = dropoff;
            }
            if (!routeGroups[code]) routeGroups[code] = [];
            routeGroups[code].push(r);
        });
        Object.keys(routeGroups).forEach(code => {
            let ops = routeGroups[code];
            ops.sort((a, b) => (parseInt(a['№ Операция']) || 0) - (parseInt(b['№ Операция']) || 0));
            let lastOpDropoff = String(ops[ops.length - 1]['Инструкция за оставяне'] || '').trim();
            if (lastOpDropoff) {
                lastDropoffMap[code] = lastOpDropoff;
            }
        });
    }

    let packingData = [];
    let pRes = await client.from('otcheti')
        .select('*')
        .ilike('Операция', '%Опаковане%')
        .eq('Статус', 'Отчетено')
        .limit(100000);
    if (pRes.data) packingData = pRes.data;

    let packedByDetail = {};
    let packedDetailsByBox = {};
    packingData.forEach(p => {
        let code = String(p['ID Детайл']).trim().toLowerCase();
        let qty = parseFloat(p['Количество']) || 0;
        let op = String(p['Операция']);
        let boxMatch = op.match(/Кашон №\s*(.+)/i);
        let box = boxMatch ? boxMatch[1].trim() : 'Неизвестен';

        if (!packedByDetail[code]) {
            packedByDetail[code] = 0;
            packedDetailsByBox[code] = {};
        }
        packedByDetail[code] += qty;
        packedDetailsByBox[code][box] = (packedDetailsByBox[code][box] || 0) + qty;
    });

    let rows = [];
    (invRes.data || []).forEach(item => {
        let code = String(item['ID Детайл']).trim().toLowerCase();
        let qty = parseFloat(item['Количество']) || 0;
        let buf = bufferMap[code] || 0;
        let scrap = bufferScrapMap[code] || 0;
        let targetOpRaw = bufferOpMap[code] || '';
        let targetOpKey = targetOpRaw ? targetOpRaw.toLowerCase() : 'готов продукт';

        let opKey = String(item['Операция'] || '').trim().toLowerCase();
        let isGpItem = (opKey === 'готов продукт');
        let isBufferRow = (opKey === targetOpKey);

        let opName = item['Операция'] || '';

        let reservedQty = 0;
        let reservedStr = "0";
        if (isGpItem) {
            reservedQty = packedByDetail[code] || 0;
            if (reservedQty > 0) {
                let boxTexts = [];
                Object.keys(packedDetailsByBox[code]).forEach(b => {
                    if (b !== 'Неизвестен') {
                        boxTexts.push(`${packedDetailsByBox[code][b]} бр в Кашон №${b}`);
                    } else {
                        boxTexts.push(`${packedDetailsByBox[code][b]} бр опаковани (чакащи кашон)`);
                    }
                });
                reservedStr = boxTexts.join(', ');
            }
        }

        let freeQty = isGpItem ? Math.max(0, qty - reservedQty) : qty;

        let loc = '';
        if (isGpItem) {
            loc = nomLocMap[code] || lastDropoffMap[code] || 'Склад Готови Детайли';
        } else {
            loc = (routeMap[code] && routeMap[code][opKey]) ? routeMap[code][opKey] : 'Буфер';
        }

        let shouldShowEmpty = (buf > 0 || (scrap > 0 && scrap !== 20)) && isBufferRow;

        if (qty !== 0 || shouldShowEmpty || reservedQty > 0) {
            rows.push({
                "RawPlanId": "",
                "ID Детайл": item['ID Детайл'],
                "Име": nomNameMap[code] || item['ID Детайл'],
                "Локация": loc,
                "Операция": opName,
                "Оригинална Операция": opName,
                "Общо": qty,
                "Запазени": reservedStr,
                "Свободни": freeQty,
                "Минимално количество/Буфер": isBufferRow ? buf : 0,
                "% Брак": isBufferRow ? scrap : 0
            });
        }
    });

    Object.keys(bufferMap).forEach(code => {
        let buf = bufferMap[code];
        let scrap = bufferScrapMap[code] || 0;
        let targetOpRaw = bufferOpMap[code] || '';
        let targetOpKey = targetOpRaw ? targetOpRaw.toLowerCase() : 'готов продукт';
        let targetOpDisplay = targetOpRaw || 'Готов продукт';

        let shouldShowEmpty = buf > 0 || (scrap > 0 && scrap !== 20);

        if (shouldShowEmpty && !rows.some(r => String(r['ID Детайл']).trim().toLowerCase() === code && String(r['Операция']).toLowerCase() === targetOpKey)) {
            rows.push({
                "RawPlanId": "",
                "ID Детайл": code.toUpperCase(),
                "Име": nomNameMap[code] || code,
                "Локация": (targetOpKey === 'готов продукт') ? (nomLocMap[code] || lastDropoffMap[code] || 'Склад Готови Детайли') : ((routeMap[code] && routeMap[code][targetOpKey]) ? routeMap[code][targetOpKey] : 'Буфер'),
                "Операция": targetOpDisplay,
                "Оригинална Операция": targetOpDisplay,
                "Общо": 0,
                "Запазени": "0",
                "Свободни": 0,
                "Минимално количество/Буфер": buf,
                "% Брак": scrap
            });
        }
    });

    return rows;
}



// backflushSimulation removed as it is no longer used

async function saveForm(e) {
    e.preventDefault(); const config = tableConfigs[currentTab]; const btn = e.target.querySelector('button[type="submit"]'); btn.innerText = 'Записване...'; btn.disabled = true;

    if (currentTab === 'sklad_inventory') {
        try {
            if (!isEditMode) {
                const det = document.getElementById('inp_skladDetail').value.trim();
                const op = document.getElementById('inp_skladOp').value.trim();
                const qty = parseFloat(document.getElementById('inp_skladQty')?.value) || 0;
                const bufferQty = parseFloat(document.getElementById('inp_skladQtyBuffer')?.value) || 0;
                const scrapInput = document.getElementById('inp_skladScrap')?.value || "";
                const scrap = parseFloat(scrapInput) || 0;
                const defectsQty = parseFloat(document.getElementById('inp_skladDefects')?.value) || 0;
                if (!det || !op || (qty === 0 && bufferQty === 0 && scrapInput === "" && defectsQty === 0)) throw new Error("Моля, въведете поне едно количество (физическо, буфер, брак бройки) или % свръхпроизводство.");

                if (qty !== 0 && defectsQty !== 0) throw new Error("Можете да въведете само едното: Количество или Брак!");

                if (qty !== 0 || defectsQty !== 0) {
                    Swal.fire({ title: 'Записване на наличности...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

                    let cleanDet = det.toLowerCase();
                    let opName = op.trim().toLowerCase();
                    let tName = 'inventory';

                    const { data: routeData } = await client.from('marshruti').select('*').ilike('Код на детайла', cleanDet);
                    if (routeData && routeData.length > 0) {
                        routeData.sort((a, b) => (parseInt(a['№ Операция']) || 0) - (parseInt(b['№ Операция']) || 0));
                        let lastOp = routeData[routeData.length - 1]['Име на операция'].trim().toLowerCase();
                        if (opName === lastOp || opName === 'готов детайл') {
                            opName = 'готов продукт';
                        }
                    } else {
                        if (opName === 'готов детайл') opName = 'готов продукт';
                    }

                    let query = client.from(tName).select('*').ilike('ID Детайл', cleanDet).ilike('Операция', opName);
                    let { data: currData } = await query;

                    let currentStock = 0;
                    let exactDet = det;
                    let exactOp = opName;
                    if (currData && currData.length > 0) {
                        currentStock = parseFloat(currData[0]['Количество']) || 0;
                        exactDet = currData[0]['ID Детайл'];
                        exactOp = currData[0]['Операция'];
                    }

                    let newTotal = currentStock + qty - defectsQty;

                    if (newTotal < 0) {
                        Swal.close();
                        throw new Error(`Недостатъчна наличност! Опитвате се да извадите повече бройки, отколкото има в склада (Налични: ${currentStock}).`);
                    }

                    let auditNewData = { "ID Детайл": cleanDet, "Разлика": (qty !== 0 ? qty : -defectsQty), "Ново Количество": newTotal, "Операция": opName };

                    await client.from('audit_logs').insert([{ table_name: tName, action_type: 'MANUAL_ADJUSTMENT', old_data: { "Количество": currentStock }, new_data: auditNewData }]);

                    let payload = { "ID Детайл": exactDet, "Операция": exactOp, "Количество": newTotal };
                    let { error: upsertErr } = await client.from(tName).upsert([payload], { onConflict: 'ID Детайл, Операция' });
                    if (upsertErr) throw upsertErr;

                    if (qty !== 0) {
                        let otchetiPayload = {
                            "ID План": null,
                            "ID Детайл": exactDet,
                            "Операция": exactOp,
                            "Количество": qty,
                            "Статус": "Отчетено",
                            "Оператор": "СИСТЕМА (Корекция наличност)",
                            "Дата": new Date().toISOString()
                        };
                        await client.from('otcheti').insert([otchetiPayload]);
                    }

                    if (defectsQty > 0) {
                        let brakPayload = {
                            "ID План": null,
                            "ID Детайл": exactDet,
                            "Операция": exactOp,
                            "Количество": defectsQty,
                            "Статус": "Брак",
                            "Оператор": "Администратор",
                            "Дата": new Date().toISOString()
                        };
                        await client.from('otcheti').insert([brakPayload]);
                    }
                }

                if (bufferQty !== 0 || scrapInput !== "") {
                    Swal.fire({ title: 'Запазване на буфер...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
                    let currentBuffer = 0;
                    let currentScrap = 0;
                    const { data: bufData } = await client.from('sklad_bufferi').select('Буфер, "% Брак"').eq('ID Детайл', det);
                    if (bufData && bufData.length > 0) {
                        currentBuffer = parseFloat(bufData[0]['Буфер']) || 0;
                        currentScrap = parseFloat(bufData[0]['% Брак']) || 0;
                    }
                    const newBufferTotal = currentBuffer + bufferQty;
                    const newScrap = scrapInput !== "" ? parseFloat(scrapInput) : currentScrap;
                    await client.from('sklad_bufferi').delete().eq('ID Детайл', det);
                    const { error: bufError } = await client.from('sklad_bufferi').insert([{ "ID Детайл": det, "Операция": op, "Буфер": newBufferTotal, "% Брак": newScrap }]);
                    if (bufError) throw bufError;
                }

                Swal.fire({ icon: 'success', title: 'Успешно добавено в склада!', timer: 1500, showConfirmButton: false });
            } else {
                const det = document.getElementById('inp_skladDetail').value.trim();
                const realOpEl = document.getElementById('inp_skladRealOp');
                const op = (realOpEl && realOpEl.value) ? realOpEl.value.trim() : document.getElementById('inp_skladOp').value.trim();
                const oldQty = parseFloat(document.getElementById('inp_skladOldQty').value) || 0;
                const newQty = parseFloat(document.getElementById('inp_skladQty').value) || 0;
                const newBuffer = parseFloat(document.getElementById('inp_skladBuffer').value) || 0;
                const newScrap = parseFloat(document.getElementById('inp_skladScrap').value) || 0;
                const diff = newQty - oldQty;

                if (diff !== 0) {
                    Swal.fire({ title: 'Записване на наличности...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
                    let tName = 'inventory';
                    let opName = op.trim().toLowerCase();
                    if (opName === 'готов детайл') opName = 'готов продукт';
                    let cleanDet = det.toLowerCase();

                    let query = client.from(tName).select('Количество').eq('ID Детайл', cleanDet).eq('Операция', opName);
                    let { data: currData } = await query;

                    let currentStock = currData && currData.length > 0 ? parseFloat(currData[0]['Количество']) || 0 : 0;
                    let newTotal = currentStock + diff;

                    if (newTotal < 0) {
                        Swal.close();
                        throw new Error(`Недостатъчна наличност! Опитвате се да извадите повече бройки, отколкото има в склада (Налични: ${currentStock}).`);
                    }

                    let payload = { "ID Детайл": cleanDet, "Операция": opName, "Количество": newTotal };

                    let { error: upsertErr } = await client.from(tName).upsert([payload], { onConflict: 'ID Детайл, Операция' });
                    if (upsertErr) throw upsertErr;

                    let auditNewData = { "ID Детайл": cleanDet, "Операция": opName, "Разлика": diff, "Ново Количество": newTotal };

                    await client.from('audit_logs').insert([{ table_name: tName, action_type: 'UPDATE', old_data: { "Количество": oldQty }, new_data: auditNewData }]);

                    let otchetiPayload = {
                        "ID План": null,
                        "ID Детайл": cleanDet,
                        "Операция": opName,
                        "Количество": diff,
                        "Статус": "Отчетено",
                        "Оператор": "СИСТЕМА (Корекция наличност)",
                        "Дата": new Date().toISOString()
                    };
                    await client.from('otcheti').insert([otchetiPayload]);
                }


                await client.from('sklad_bufferi').delete().eq('ID Детайл', det);
                const { error: bufError } = await client.from('sklad_bufferi').insert([{ "ID Детайл": det, "Операция": op, "Буфер": newBuffer, "% Брак": newScrap }]);
                if (bufError) throw bufError;

                Swal.fire({ icon: 'success', title: 'Успешен запис!', timer: 1500, showConfirmButton: false });
            }
            if (window.invalidateAdminCache) window.invalidateAdminCache();
            closeModal(); loadCurrentTableData(true);
        } catch (err) { Swal.fire('Грешка', err.message, 'error'); } finally { btn.innerText = 'Запази запис'; btn.disabled = false; }
        return;
    }

    let payload = {};
    config.fields.forEach(f => {
        const el = document.getElementById('inp_' + f.name);
        if (el && !f.readonly && !(isEditMode && f.readonlyOnEdit)) {
            let val = el.value;
            if (f.type === 'number') {
                val = parseFloat(val) || 0;
            } else if (f.type === 'date' && val === "") {
                val = null;
            }
            payload[f.name] = val;
        }
    });
    if (currentTab === 'nomenklatura') {
        const isMat = payload['Тип'] && String(payload['Тип']).trim().toLowerCase() === 'материал';
        if (!isMat || !payload['pack_size'] || payload['pack_size'] <= 0) {
            payload['pack_size'] = null;
        }
    }
    if (currentTab === 'sklad') {
        let startQty = parseFloat(payload['Начална наличност']) || 0;
        let delivQty = parseFloat(payload['Доставено']) || 0;
        let usedQty = parseFloat(payload['Изразходено']) || 0;
        payload['Остатък'] = startQty + delivQty - usedQty;

        if (!isEditMode) {
            const newCode = String(payload['ID Детайл'] || '').trim().toLowerCase();
            const existingRowIndex = globalRows.findIndex(r => String(r['ID Детайл'] || '').trim().toLowerCase() === newCode);
            if (existingRowIndex !== -1) {
                const existing = globalRows[existingRowIndex];
                btn.innerText = 'Запази запис';
                btn.disabled = false;
                Swal.fire({
                    icon: 'warning',
                    title: 'Материалът вече съществува!',
                    html: `В склада вече има позиция <b>"${existing['ID Детайл']}"</b>!<br><br>Текущ остатък: <b>${existing['Остатък'] !== undefined ? existing['Остатък'] : (existing['Начална наличност'] || 0)} ${existing['Мерна единица'] || 'бр.'}</b>.<br><br>Не създавайте нов ред, за да не се получават дубликати!<br>Желаете ли да отворите съществуващия запис за редакция (изписване / заприходяване)?`,
                    showCancelButton: true,
                    confirmButtonText: '✏️ Отвори за редакция',
                    cancelButtonText: 'Отказ',
                    confirmButtonColor: '#3b82f6'
                }).then((res) => {
                    if (res.isConfirmed) {
                        openEditModal(existingRowIndex);
                    }
                });
                return;
            }
        }
    }
    try {
        if (currentTab === 'plan' && payload['Статус'] === '🚚 Изпратен') {
            let oldStatus = isEditMode ? globalRows[editingIndex]['Статус'] : null;
            if (oldStatus !== '🚚 Изпратен') {
                let detailID = payload['ID Детайл'];
                if (!detailID && isEditMode) detailID = globalRows[editingIndex]['ID Детайл'];
                let qtyToDeduct = payload['Целево количество'] || 0;

                Swal.fire({ title: 'Проверка на маршрут и наличности...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

                const { data: routeData, error: routeErr } = await client.from('marshruti').select('*').eq('Код на детайла', detailID);
                if (routeErr) throw routeErr;

                let selectedOp = '';
                if (routeData && routeData.length > 0) {
                    routeData.sort((a, b) => (parseInt(a['№ Операция']) || 0) - (parseInt(b['№ Операция']) || 0));
                    selectedOp = String(routeData[routeData.length - 1]['Име на операция']).trim();
                } else {
                    Swal.close();
                    throw new Error("Не е намерена маршрутна карта за този детайл. Не може да се определи последната операция!");
                }

                const { data: stockData, error: stockErr } = await client.from('inventory').select('*').eq('ID Детайл', detailID).eq('Операция', selectedOp);
                if (stockErr) throw stockErr;

                let availableStock = 0;
                if (stockData && stockData.length > 0) {
                    availableStock = parseFloat(stockData[0]['Количество'] !== undefined ? stockData[0]['Количество'] : stockData[0]['Наличност в цеха']) || 0;
                }

                if (availableStock < qtyToDeduct) {
                    Swal.close();
                    throw new Error(`Няма достатъчно завършени бройки на последната операция (${selectedOp})! Налични: ${availableStock} бр., Опитвате да изпратите: ${qtyToDeduct} бр.`);
                }

                Swal.fire({ title: 'Изписване от склад...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
                let otchetiPayload = { "ID План": null, "ID Детайл": detailID, "Операция": selectedOp, "Количество": -qtyToDeduct, "Статус": "Отчетено", "Оператор": "СИСТЕМА (Експедиция)", "Дата": new Date().toISOString() };
                const { error: otchetiErr } = await client.from('otcheti').insert([otchetiPayload]);
                if (otchetiErr) throw otchetiErr;
            }
        }

        if (currentTab === 'porachki' && payload['Статус'] === 'Прието') {
            let oldStatus = isEditMode ? globalRows[editingIndex]['Статус'] : null;
            if (oldStatus !== 'Прието') {
                let itemCode = payload['Материал'];
                let qty = parseFloat(payload['Количество']) || 0;

                // fetch current from sklad
                const { data: skData, error: skErr } = await client.from('sklad').select('Доставено, Остатък').eq('ID Детайл', itemCode);
                if (!skErr && skData && skData.length > 0) {
                    let currentDostaveno = parseFloat(skData[0]['Доставено']) || 0;
                    let currentOstatuk = parseFloat(skData[0]['Остатък']) || 0;
                    await client.from('sklad').update({
                        'Доставено': currentDostaveno + qty,
                        'Остатък': currentOstatuk + qty
                    }).eq('ID Детайл', itemCode);
                }
            }
        }

        if (isEditMode) {
            const row = globalRows[editingIndex];
            const keyVal = row[config.key];
            if (currentTab === 'sklad_inventory') {
                let oldQty = parseFloat(row['Общо']) || 0;
                let newQty = parseFloat(payload['Общо']) || 0;
                let delta = newQty - oldQty;
                if (delta !== 0) {
                    let opName = (row['Оригинална Операция'] || row['Операция']);
                    let planIdVal = document.getElementById('inp_skladPlanId').value || null;
                    let otchetiPayload = {
                        "ID План": planIdVal,
                        "ID Детайл": row['ID Детайл'],
                        "Операция": opName,
                        "Количество": delta,
                        "Статус": "Отчетено",
                        "Оператор": "СИСТЕМА (Корекция наличност)",
                        "Дата": new Date().toISOString()
                    };
                    const { error: updErr2 } = await client.from('otcheti').insert([otchetiPayload]);
                    if (updErr2) throw updErr2;
                }
                Swal.fire({ icon: 'success', title: 'Наличността е коригирана!', timer: 1500, showConfirmButton: false });
            } else if (currentTab === 'sklad') {
                let query = client.from('sklad').update(payload).eq(config.key, keyVal);
                if (row['Изразходено'] !== undefined) query = query.eq('Изразходено', row['Изразходено']);
                if (row['Начална наличност'] !== undefined) query = query.eq('Начална наличност', row['Начална наличност']);
                const { error } = await query;
                if (error) throw error;
                Swal.fire({ icon: 'success', title: 'Успешно запазено!', timer: 1000, showConfirmButton: false });
            } else {
                const { error } = await client.from(config.table).update(payload).eq(config.key, keyVal);
                if (error) throw error;
                Swal.fire({ icon: 'success', title: 'Успешно запазено!', timer: 1000, showConfirmButton: false });

                if (currentTab === 'plan' && payload['Статус'] === '🚚 Изпратен') {
                    if (typeof checkAndGenerateArchive === 'function') {
                        let m = payload['Месец'] || (globalRows && globalRows[editingIndex] ? globalRows[editingIndex]['Месец'] : null);
                        let y = payload['Година'] || (globalRows && globalRows[editingIndex] ? globalRows[editingIndex]['Година'] : null);
                        if (m && y) await checkAndGenerateArchive(m, parseInt(y));
                    }
                }
            }
        }
        else {
            let inserts = [payload];

            if (currentTab === 'plan') {
                const phantoms = {
                    "575-91001-9": "Ф63.4 204J",
                    "h25-f1e": "Кв. Фл. 22108201Е",
                    "575-60021": "Капак с китайски отливки"
                };
                let code = String(payload['Вътрешно име'] || '').trim().toLowerCase();
                if (phantoms[code]) {
                    let phantomPayload = { ...payload };
                    phantomPayload['Вътрешно име'] = phantoms[code];
                    inserts.push(phantomPayload);
                }
            }

            const { error } = await client.from(config.table).insert(inserts);
            if (error) throw error;
            Swal.fire({ icon: 'success', title: 'Успешно добавено!', timer: 1000, showConfirmButton: false });
        }

        if (currentTab === 'porachki') {
            let isNewOrder = !isEditMode;
            let isChangedToPorachano = isEditMode && payload['Статус'] === 'Поръчано' && globalRows[editingIndex]['Статус'] !== 'Поръчано';
            if (isNewOrder || isChangedToPorachano) {
                let recipient = payload['Имейл на доставчик'] || '';
                let materialName = payload['Материал'] || '';
                let orderQty = payload['Количество'] || 0;
                let subject = encodeURIComponent("Поръчка на материал: " + materialName);
                let body = encodeURIComponent(`Здравейте,\n\nБихме искали да поръчаме следната позиция:\nМатериал: ${materialName}\nКоличество: ${orderQty} бр.\n\nМоля да потвърдите получаването на поръчката и очаквано време за доставка.\n\nПоздрави,`);

                // Вместо mailto, директно отваряме Gmail (понеже видях, че ползвате Gmail)
                let gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${recipient}&su=${subject}&body=${body}`;
                // Отваряме в нов, по-малък прозорец (popup), за да не изгубите админ панела
                window.open(gmailUrl, 'GmailPopup', 'width=800,height=600,left=200,top=100,scrollbars=yes');
            }
        }

        if (currentTab === 'tooling_sklad') {
            let isChangedToPorachano = payload['order_status'] === 'Поръчано' && (!isEditMode || (globalRows[editingIndex] && globalRows[editingIndex]['order_status'] !== 'Поръчано'));
            if (isChangedToPorachano) {
                let toolName = (payload['item_code'] || '') + (payload['name'] ? ' (' + payload['name'] + ')' : '');
                let orderQty = payload['min_quantity'] || 10;
                let machine = payload['machine_name'] || 'Цех';
                let supplier = payload['supplier'] || '';
                let packSize = parseFloat(payload['pack_size']) || 10;
                let packLine = '';
                if (packSize > 1) {
                    let boxes = (orderQty % packSize === 0) ? (orderQty / packSize) : (orderQty / packSize).toFixed(1);
                    packLine = ` (${boxes} ${boxes == 1 ? 'кутия' : 'кутии'} по ${packSize} бр.)`;
                }
                let recipient = supplier ? (localStorage.getItem('tooling_supplier_email_' + supplier.trim().toLowerCase()) || '') : '';
                let subject = encodeURIComponent("Поръчка на инструментална екипировка: " + toolName);
                let body = encodeURIComponent(`Здравейте,\n\nБихме искали да поръчаме следната позиция за нашето производство:\nАртикул / Пластина: ${toolName}\nКоличество: ${orderQty} бр.${packLine}\nПредназначение: Машина ${machine}\n\nМоля да потвърдите получаването на поръчката и очаквано време за доставка.\n\nПоздрави,`);

                let gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(recipient)}&su=${subject}&body=${body}`;
                window.open(gmailUrl, 'GmailPopup', 'width=800,height=600,left=200,top=100,scrollbars=yes');
            }
        }
        if (window.invalidateAdminCache) window.invalidateAdminCache();
        closeModal(); loadCurrentTableData(true);
    } catch (err) { Swal.fire('Грешка', err.message, 'error'); } finally { btn.innerText = 'Запази запис'; btn.disabled = false; }
}

async function deleteItem(index) {
    const config = tableConfigs[currentTab]; const row = globalRows[index];

    if (currentTab === 'sklad_inventory') {
        const res = await Swal.fire({ title: 'Нулиране на наличността?', text: `Наличността за ${row['ID Детайл']} (${row['Операция']}) ще бъде зададена на 0.`, icon: 'warning', showCancelButton: true, confirmButtonColor: '#ef4444', confirmButtonText: 'Да, нулирай!', cancelButtonText: 'Отказ' });
        if (res.isConfirmed) {
            try {
                Swal.fire({ title: 'Записване...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
                let tName = 'inventory';
                let opName = (row['Оригинална Операция'] || row['Операция']).trim().toLowerCase();
                let cleanDet = String(row['ID Детайл']).trim().toLowerCase();

                let query = client.from(tName).delete().ilike('ID Детайл', cleanDet);
                if (currentTab === 'sklad_inventory' || currentTab === 'sklad_wip') query = query.ilike('Операция', opName);
                const { error } = await query;

                if (error) throw error;

                let auditNewData = { "ID Детайл": cleanDet, "Ново Количество": 0 };
                if (currentTab === 'sklad_wip') auditNewData["Операция"] = opName;
                await client.from('audit_logs').insert([{ table_name: tName, action_type: 'DELETE', old_data: { "Количество": row['Общо'] }, new_data: auditNewData }]);
                if (window.invalidateAdminCache) window.invalidateAdminCache();
                Swal.fire({ icon: 'success', title: 'Изтрито!', timer: 1000, showConfirmButton: false });
                loadCurrentTableData(true);
            } catch (err) { Swal.fire('Грешка', err.message, 'error'); }
        }
        return;
    }

    const keyVal = row[config.key];
    const res = await Swal.fire({ title: 'Сигурни ли сте?', text: "Записът ще бъде изтрит безвъзвратно!", icon: 'warning', showCancelButton: true, confirmButtonColor: '#ef4444', confirmButtonText: 'Да, изтрий!', cancelButtonText: 'Отказ' });
    if (res.isConfirmed) {
        try {
            Swal.fire({ title: 'Изтриване...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
            let query = client.from(config.table).delete().eq(config.key, keyVal);
            if (currentTab === 'sklad') {
                if (row['Изразходено'] !== undefined) query = query.eq('Изразходено', row['Изразходено']);
                if (row['Начална наличност'] !== undefined) query = query.eq('Начална наличност', row['Начална наличност']);
            }
            const { error } = await query;
            if (error) throw error;
            if (window.invalidateAdminCache) window.invalidateAdminCache();
            Swal.fire({ icon: 'success', title: 'Изтрито!', timer: 1000, showConfirmButton: false });
            loadCurrentTableData(true);
        } catch (err) { Swal.fire('Грешка', err.message, 'error'); }
    }
}

async function loadSkladOperations(detailCode) {
    const sel = document.getElementById('inp_skladOp');
    if (!sel) return;
    if (!detailCode || detailCode.trim().length < 2) { sel.innerHTML = '<option value="">-- Въведете детайл първо --</option>'; return; }
    sel.innerHTML = '<option value="">Зареждане...</option>';
    try {
        const { data, error } = await client.from('marshruti').select('*').eq('Код на детайла', detailCode.trim());
        if (error) throw error;
        sel.innerHTML = '';
        if (!data || data.length === 0) { sel.innerHTML = '<option value="">Не са намерени операции</option>'; return; }

        data.sort((a, b) => (a['№ Операция'] || 0) - (b['№ Операция'] || 0));

        data.forEach(op => {
            const opt = document.createElement('option');
            opt.value = String(op['Име на операция']).trim();
            opt.innerText = String(op['Име на операция']).trim();
            sel.appendChild(opt);
        });
    } catch (err) {
        sel.innerHTML = '<option value="">' + (err.message || 'Грешка') + '</option>';
        console.error(err);
    }
}
window.openLogisticsModal = async function () {
    const modalBackdrop = document.getElementById('logisticsModalBackdrop');
    const contentEl = document.getElementById('logisticsContent');
    if (modalBackdrop) modalBackdrop.style.display = 'flex';
    if (contentEl) contentEl.innerHTML = '<div style="text-align:center; padding:30px; color:#0284c7; font-weight:600;">⏳ Зареждане на данни за плановете...</div>';

    let rows = (currentTab === 'plan' && globalRows && globalRows.length > 0) ? globalRows : null;
    let needsPackFetch = !rows || rows.some(r => r['__total_packed'] === undefined);
    if (!rows) {
        try {
            const { data, error } = await client.from('plan').select('*');
            if (error) throw error;
            rows = data || [];
        } catch (err) {
            console.error('Error fetching plan for logistics:', err);
            if (contentEl) contentEl.innerHTML = '<div style="text-align:center; padding:20px; color:#ef4444;">Грешка при зареждане на плановете: ' + err.message + '</div>';
            return;
        }
    }

    if (needsPackFetch && rows && rows.length > 0) {
        try {
            const packRes = await client.from('otcheti').select('*').ilike('Операция', 'Опаковане - Кашон №%').in('Статус', ['Отчетено', 'Изпратено']);
            if (!packRes.error && packRes.data) {
                const packMap = {};
                packRes.data.forEach(p => {
                    let pId = String(p['ID План'] || '').trim();
                    let code = String(p['ID Детайл']).trim().toUpperCase();
                    let key = pId + '_' + code;
                    packMap[key] = (packMap[key] || 0) + (parseFloat(p['Количество']) || 0);
                });
                rows.forEach(r => {
                    if (r['__total_packed'] === undefined) {
                        let code = String(r['ID Детайл'] || r['Вътрешно име'] || '').trim().toUpperCase();
                        let key = String(r.id).trim() + '_' + code;
                        r['__total_packed'] = packMap[key] || 0;
                    }
                });
            }
        } catch (packErr) {
            console.warn('Error fetching packaging for logistics:', packErr);
        }
    }

    // Group active plan rows
    let plansMap = {};
    rows.forEach(row => {
        let key = row['Месец'] + ' ' + row['Година'];
        if (!plansMap[key]) plansMap[key] = { name: key, month: row['Месец'], year: row['Година'], total: 0, done: 0, packed: 0, fullyPacked: true };

        plansMap[key].total++;
        if (row['Статус'] === 'Завършен' || row['Статус'] === '📦 Опакован') {
            plansMap[key].done++;
            let target = parseFloat(row['Целево количество']) || 0;
            let packed = parseFloat(row['__total_packed']) || 0;
            if (packed >= target || row['Статус'] === '📦 Опакован') {
                plansMap[key].packed++; // Отчитаме го като логически опакован
            } else {
                plansMap[key].fullyPacked = false;
            }
        }
    });

    let html = '';
    let plansList = Object.values(plansMap).sort((a, b) => b.year - a.year || b.month - a.month);

    if (plansList.length === 0) {
        html = '<div style="text-align:center; padding:20px; color:#64748b;">Няма заредени планове.</div>';
    } else {
        plansList.forEach(p => {
            html += `<div style="background:white; border:1px solid #e2e8f0; border-radius:8px; padding:15px; margin-bottom:15px; box-shadow:0 1px 3px rgba(0,0,0,0.05);">
                <div style="font-weight:bold; font-size:1.1em; margin-bottom:10px; color:#334155;">📅 План: Месец ${p.month} / ${p.year} (Общо ${p.total} реда детайли)</div>
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
                    <div style="font-size:0.95em;">
                        <div style="color:#059669; margin-bottom:4px;">🟢 Завършени детайли: <b>${p.done}</b> бр.</div>
                        <div style="color:#0284c7;">📦 От тях 100% опаковани: <b>${p.packed}</b> бр.</div>
                    </div>
                    <div style="display:flex; flex-direction:column; gap:8px;">
                        <button class="btn-primary" onclick="window.open('packing-list.html?month=${p.month}&year=${p.year}', '_blank')" style="background:#0ea5e9; min-width:200px;">📄 Печат Пакинг Лист</button>
                        <button class="btn-primary" ${p.done === 0 || !p.fullyPacked ? 'disabled style="opacity:0.5;cursor:not-allowed;" title="Всички завършени детайли трябва да са 100% опаковани!"' : ''} onclick="window.massLogisticsAction('${p.month}', '${p.year}')" style="background:#f59e0b; min-width:200px;">🚚 Изпрати План ${p.month}/${p.year}</button>
                    </div>
                </div>
            </div>`;
        });
    }

    if (contentEl) contentEl.innerHTML = html;
};

window.massLogisticsAction = async function (month, year) {
    const res = await Swal.fire({ title: 'Сигурни ли сте?', text: `Искате ли да изпратите (експедирате) всички завършени детайли за Месец ${month} / ${year}? Това ще извади наличностите им от склада!`, icon: 'warning', showCancelButton: true, confirmButtonText: 'Да, изпрати', cancelButtonText: 'Отказ' });
    if (!res.isConfirmed) return;

    try {
        Swal.fire({ title: 'Изпращане...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

        // 1. Взимаме детайлите, които ще бъдат изпратени
        const { data: detailsToShip, error: fetchErr } = await client.from('plan')
            .select('id, "Вътрешно име", "Целево количество"')
            .eq('Месец', month).eq('Година', year).in('Статус', ['Завършен', '📦 Опакован']);

        if (fetchErr) throw fetchErr;

        if (detailsToShip && detailsToShip.length > 0) {
            const nomRes = await client.from('Номенклатура').select('*');
            const nomMap = {};
            if (!nomRes.error && nomRes.data) {
                nomRes.data.forEach(n => {
                    if (n['Вътрешно име']) nomMap[n['Вътрешно име']] = n['ID Детайл'];
                    if (n['ID Детайл']) nomMap[n['ID Детайл']] = n['ID Детайл'];
                });
            }

            // 2. Подготвяме отчетите за Експедиция
            let otchetiInserts = detailsToShip.map(d => {
                let idDetail = nomMap[d["Вътрешно име"]] || d["Вътрешно име"];
                return {
                    "ID План": String(d.id),
                    "ID Детайл": String(idDetail).trim(),
                    "Операция": "Експедиция",
                    "Количество": parseFloat(d["Целево количество"]) || 0,
                    "Статус": "Изпратено",
                    "Оператор": "Система (Логистика)",
                    "Дата": new Date().toISOString()
                };
            });

            // 3. Инсъртваме отчетите (Това ще извика тригера и ще извади от склада)
            const { error: insErr } = await client.from('otcheti').insert(otchetiInserts);
            if (insErr) throw insErr;

            // 3.5. Обновяваме статуса на всички записи за 'Опаковане' свързани с тези планове на 'Изпратено',
            // за да изчезнат от колоната 'Запазени'
            const planIds = detailsToShip.map(d => String(d.id));
            if (planIds.length > 0) {
                const { error: updPackErr } = await client.from('otcheti')
                    .update({ 'Статус': 'Изпратено' })
                    .in('ID План', planIds)
                    .ilike('Операция', '%Опаковане%')
                    .eq('Статус', 'Отчетено');
                if (updPackErr) console.error("Грешка при изпращане на кашоните:", updPackErr);
            }
        }

        // 4. Обновяваме статуса им на '🚚 Изпратен'
        const { error: updErr } = await client.from('plan')
            .update({ 'Статус': '🚚 Изпратен' })
            .eq('Месец', month).eq('Година', year).in('Статус', ['Завършен', '📦 Опакован']);

        if (updErr) throw updErr;

        Swal.fire({ icon: 'success', title: 'Успешно!', text: `Изпратени са ${detailsToShip ? detailsToShip.length : 0} записа.`, timer: 2000, showConfirmButton: false });

        document.getElementById('logisticsModalBackdrop').style.display = 'none';

        if (typeof checkAndGenerateArchive === 'function') {
            await checkAndGenerateArchive(month, parseInt(year));
        }

        loadCurrentTableData();
    } catch (err) {
        Swal.fire('Грешка', err.message, 'error');
    }
};

function escapeHtml(str) {
    if (str === undefined || str === null) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

window.openMrpModal = async function () {
    try {
        Swal.fire({ title: 'Анализ на нуждите...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

        const { data: plans, error: planErr } = await client.from('plan').select('*').eq('Статус', 'Активен');
        if (planErr) throw planErr;

        const { data: bomList, error: bomErr } = await client.from('bom').select('*');
        if (bomErr) throw bomErr;



        const { data: skladList, error: skladErr } = await client.from('sklad').select('*');
        if (skladErr) throw skladErr;

        const bomMap = {};
        bomList.forEach(b => {
            let parent = b['ID Родител']?.trim()?.toLowerCase();
            if (!bomMap[parent]) bomMap[parent] = [];
            bomMap[parent].push({ child: b['ID Компонент']?.trim()?.toLowerCase(), qty: parseFloat(b['Количество']) || 1 });
        });

        const skladMap = {};
        skladList.forEach(s => {
            skladMap[s['ID Детайл']?.trim()?.toLowerCase()] = {
                name: s['ID Детайл'],
                stock: parseFloat(s['Остатък']) || 0,
                min: parseFloat(s['Минимално количество']) || 0
            };
        });

        let totalDemands = {};

        function explode(itemId, qty) {
            if (!itemId) return;
            let key = itemId.trim().toLowerCase();
            if (bomMap[key] && bomMap[key].length > 0) {
                bomMap[key].forEach(childNode => {
                    explode(childNode.child, qty * childNode.qty);
                });
            } else {
                if (!totalDemands[key]) totalDemands[key] = 0;
                totalDemands[key] += qty;
            }
        }

        plans.forEach(p => {
            let planItem = p['ID Детайл'] || p['Вътрешно име'];
            let planQty = parseFloat(p['Целево количество']) || 0;
            explode(planItem, planQty);
        });

        let deficits = [];
        for (let itemKey in totalDemands) {
            let demand = totalDemands[itemKey];
            let sk = skladMap[itemKey];

            if (sk) {
                let stock = sk.stock;
                let min = sk.min;
                let free = stock - demand;

                if (free < min) {
                    deficits.push({
                        item: sk.name,
                        stock: stock,
                        demand: demand,
                        free: free,
                        min: min,
                        missing: min - free
                    });
                }
            }
        }

        let html = '';
        if (deficits.length === 0) {
            html = `<div style="text-align:center; padding: 40px; font-size:1.2em; color:#059669; font-weight:bold;">✅ Няма критични липси! Всички материали са над минимума.</div>`;
        } else {
            deficits.sort((a, b) => b.missing - a.missing);
            window.__mrpDeficits = deficits;
            html = `<table class="minimal-table" style="width:100%; text-align:left; border-collapse:collapse;">
                <thead><tr style="background:#f1f5f9; border-bottom:2px solid #cbd5e1;">
                    <th style="padding:10px;">Материал</th>
                    <th style="padding:10px; text-align:center;">Наличност</th>
                    <th style="padding:10px; text-align:center;">Нужно за Планове</th>
                    <th style="padding:10px; text-align:center;">Свободно</th>
                    <th style="padding:10px; text-align:center;">Минимум</th>
                    <th style="padding:10px; text-align:center;">Действие</th>
                </tr></thead>
                <tbody>`;
            deficits.forEach((d, idx) => {
                html += `<tr style="border-bottom:1px solid #e2e8f0;">
                    <td style="padding:10px; font-weight:bold; color:#0f172a;">${escapeHtml(d.item)}</td>
                    <td style="padding:10px; text-align:center;">${d.stock}</td>
                    <td style="padding:10px; text-align:center; color:#d97706;">${d.demand}</td>
                    <td style="padding:10px; text-align:center; color:#ef4444; font-weight:bold;">${d.free}</td>
                    <td style="padding:10px; text-align:center;">${d.min}</td>
                    <td style="padding:10px; text-align:center;">
                        <button type="button" class="btn-primary" onclick="window.createOrderForDeficitByIndex(${idx})" style="background:#3b82f6; padding: 4px 10px; font-size: 0.85em; cursor:pointer;">➕ Поръчай</button>
                    </td>
                </tr>`;
            });
            html += `</tbody></table>`;
        }

        Swal.close();
        document.getElementById('mrpContent').innerHTML = html;
        document.getElementById('mrpModalBackdrop').style.display = 'flex';

    } catch (err) {
        Swal.fire('Грешка при анализа', err.message, 'error');
    }
};

window.createOrderForDeficitByIndex = function (index) {
    const d = window.__mrpDeficits && window.__mrpDeficits[index];
    if (!d) return;
    window.createOrderForDeficit(d.item, d.missing);
};

window.createOrderForDeficit = function (item, recommendedQty) {
    const mrpModal = document.getElementById('mrpModalBackdrop');
    if (mrpModal) mrpModal.style.display = 'none';

    if (typeof openCreateMaterialOrderModal === 'function') {
        openCreateMaterialOrderModal(item, recommendedQty);
    } else {
        if (typeof switchTab === 'function' && currentTab !== 'porachki') {
            switchTab('porachki');
        }
        if (typeof openAddModal === 'function') {
            openAddModal();
        }

        const fillInputs = () => {
            const itemInput = document.getElementById('inp_Материал');
            const qtyInput = document.getElementById('inp_Количество');
            if (itemInput) itemInput.value = item || '';
            if (qtyInput) qtyInput.value = (recommendedQty !== undefined && recommendedQty !== null) ? recommendedQty : '';
        };

        fillInputs();
        setTimeout(fillInputs, 50);
        setTimeout(fillInputs, 200);
    }
};

function openAuditModal() {
    document.getElementById('auditModalBackdrop').style.display = 'flex';
    fetchAuditLogs();
}

function formatAuditLogDetails(log) {
    let oldData = log.old_data || {};
    let newData = log.new_data || {};
    let tName = log.table_name || '';
    let action = log.action_type || '';

    // 1. Склад
    if (['inventory', 'inventory_gp', 'inventory_wip'].includes(tName)) {
        let det = newData['ID Детайл'] || oldData['ID Детайл'] || 'Детайл';
        let op = newData['Операция'] || oldData['Операция'] || '';
        let opBadge = op ? `<span style="background:#e0f2fe; color:#0369a1; padding:2px 7px; border-radius:4px; font-size:0.85em; font-weight:700; margin-left:6px;">${op}</span>` : '';
        let oldQty = parseFloat(oldData['Количество'] !== undefined && oldData['Количество'] !== null ? oldData['Количество'] : (oldData['Общо'] || 0));
        let newQty = parseFloat(newData['Количество'] !== undefined && newData['Количество'] !== null ? newData['Количество'] : (newData['Общо'] || 0));
        if (action === 'INSERT') oldQty = 0;
        let diff = newQty - oldQty;

        if (action === 'INSERT') {
            return `🏭 <b>Добавен в склад:</b> <b>${det}</b>${opBadge} ➔ Заприходени: <b style="color:#16a34a;">+${newQty} бр.</b>`;
        }
        if (action === 'DELETE') {
            return `🗑️ <b>Премахнат от склад:</b> <b>${det}</b>${opBadge} (последно салдо: ${oldQty} бр.)`;
        }
        let diffColor = diff > 0 ? '#16a34a' : (diff < 0 ? '#dc2626' : '#64748b');
        let diffSign = diff > 0 ? '+' : '';
        return `🏭 <b>Корекция в склад:</b> <b>${det}</b>${opBadge} | <span style="text-decoration:line-through; color:#94a3b8;">${oldQty} бр.</span> ➔ <b style="font-size:1.05em; color:#0f172a;">${newQty} бр.</b> (<b style="color:${diffColor};">${diffSign}${diff} бр.</b>)`;
    }

    // 2. Маршрутни карти
    if (tName === 'marshruti') {
        let code = newData['Код на детайла'] || oldData['Код на детайла'] || 'Детайл';
        let opNum = newData['№ Операция'] || oldData['№ Операция'] || '';
        let opName = newData['Име на операция'] || oldData['Име на операция'] || '';
        let header = `🔄 <b>Маршрут за:</b> <b>${code}</b> ${opNum ? `(Оп. ${opNum}: ${opName})` : ''}`;
        if (action === 'INSERT') {
            return `${header} ➔ Създадена нова операция на машина: <b>${newData['Машина'] || 'Без машина'}</b>`;
        }
        if (action === 'DELETE') {
            return `🗑️ <b>Изтрита операция от маршрут:</b> <b>${code}</b> (Оп. ${opNum})`;
        }
        let changes = [];
        for (let k in newData) {
            let ov = String(oldData[k] === null || oldData[k] === undefined ? '' : oldData[k]).trim();
            let nv = String(newData[k] === null || newData[k] === undefined ? '' : newData[k]).trim();
            if (ov !== nv) {
                changes.push(`<b>${k}:</b> <span style="text-decoration:line-through; color:#ef4444;">${ov || 'няма'}</span> ➔ <span style="color:#16a34a; font-weight:bold;">${nv || 'няма'}</span>`);
            }
        }
        return `${header}<br><div style="margin-top:4px; font-size:0.9em; color:#334155;">${changes.length > 0 ? changes.join(' | ') : '<span style="color:#94a3b8;">Няма съществена промяна</span>'}</div>`;
    }

    // 3. План
    if (tName === 'plan') {
        let name = newData['Вътрешно име'] || oldData['Вътрешно име'] || newData['ID Детайл'] || oldData['ID Детайл'] || 'Детайл';
        let month = newData['Месец'] || oldData['Месец'] || '';
        let year = newData['Година'] || oldData['Година'] || '';
        let header = `📅 <b>План (${month} ${year}):</b> <b>${name}</b>`;
        if (action === 'INSERT') {
            return `${header} ➔ Заложен за производство: <b style="color:#16a34a;">${newData['Целево количество'] || 0} бр.</b> (Статус: ${newData['Статус'] || 'Активен'})`;
        }
        if (action === 'DELETE') {
            return `🗑️ <b>Премахнат от плана:</b> <b>${name}</b> (${month} ${year})`;
        }
        let changes = [];
        for (let k in newData) {
            let ov = String(oldData[k] === null || oldData[k] === undefined ? '' : oldData[k]).trim();
            let nv = String(newData[k] === null || newData[k] === undefined ? '' : newData[k]).trim();
            if (ov !== nv) {
                changes.push(`<b>${k}:</b> <span style="text-decoration:line-through; color:#ef4444;">${ov}</span> ➔ <span style="color:#16a34a; font-weight:bold;">${nv}</span>`);
            }
        }
        return `${header}<br><div style="margin-top:4px; font-size:0.9em; color:#334155;">${changes.join(' | ')}</div>`;
    }

    // 4. Склад Материали
    if (tName === 'sklad') {
        let mat = newData['ID Детайл'] || oldData['ID Детайл'] || 'Материал';
        let header = `📦 <b>Материал:</b> <b>${mat}</b>`;
        if (action === 'INSERT') return `${header} ➔ Добавен нов материал с наличност: <b>${newData['Начална наличност'] || 0}</b>`;
        if (action === 'DELETE') return `🗑️ <b>Изтрит материал:</b> <b>${mat}</b>`;
        let changes = [];
        for (let k in newData) {
            let ov = String(oldData[k] === null || oldData[k] === undefined ? '' : oldData[k]).trim();
            let nv = String(newData[k] === null || newData[k] === undefined ? '' : newData[k]).trim();
            if (ov !== nv) {
                changes.push(`<b>${k}:</b> <span style="text-decoration:line-through; color:#ef4444;">${ov}</span> ➔ <span style="color:#16a34a; font-weight:bold;">${nv}</span>`);
            }
        }
        return `${header}<br><div style="margin-top:4px; font-size:0.9em; color:#334155;">${changes.join(' | ')}</div>`;
    }

    // 5. Общ случай
    let idStr = newData['ID Детайл'] || newData['Вътрешно име'] || newData['Име'] || newData['id'] || '';
    let header = idStr ? `<div style="font-weight:bold; color:#1e293b; margin-bottom:3px;">🔑 Запис: <b>${idStr}</b></div>` : '';
    if (action === 'INSERT') {
        let fields = [];
        for (let k in newData) {
            if (k !== 'id' && k !== 'created_at' && newData[k] !== null && String(newData[k]).trim() !== '') {
                fields.push(`<b>${k}:</b> ${newData[k]}`);
            }
        }
        return `${header}<div style="color:#166534; font-size:0.9em;">${fields.join(', ')}</div>`;
    }
    if (action === 'DELETE') {
        return `${header}<div style="color:#dc2626; font-size:0.9em;">Записът е изтрит.</div>`;
    }
    let changes = [];
    for (let k in newData) {
        let ov = String(oldData[k] === null || oldData[k] === undefined ? '' : oldData[k]).trim();
        let nv = String(newData[k] === null || newData[k] === undefined ? '' : newData[k]).trim();
        if (ov !== nv) {
            changes.push(`<b>${k}:</b> <span style="text-decoration:line-through; color:#ef4444;">${ov || 'няма'}</span> ➔ <span style="color:#16a34a;">${nv || 'няма'}</span>`);
        }
    }
    return `${header}<div style="font-size:0.9em; color:#334155;">${changes.length > 0 ? changes.join(' | ') : '<span style="color:#94a3b8;">Няма съществена промяна в полетата</span>'}</div>`;
}

async function fetchAuditLogs() {
    let container = document.getElementById('auditContent');
    container.innerHTML = '<div style="text-align:center; padding:20px; color:#64748b;">Зареждане на историята... ⏳</div>';

    let tableFilter = document.getElementById('auditTableFilter').value;
    let searchInput = document.getElementById('auditSearchFilter');
    let searchTerm = searchInput ? searchInput.value.trim().toLowerCase() : '';

    try {
        if (searchTerm) {
            let isTraceabilityMode = (tableFilter === 'all' || tableFilter === 'inventory');

            let auditQuery = client.from('audit_logs').select('*').order('changed_at', { ascending: false }).limit(3000);
            if (tableFilter !== 'all') {
                if (tableFilter === 'inventory') {
                    auditQuery = auditQuery.in('table_name', ['inventory', 'inventory_gp', 'inventory_wip']);
                } else {
                    auditQuery = auditQuery.eq('table_name', tableFilter);
                }
            }

            let [auditRes, otchetiRes, recentOtchetiRes] = await Promise.all([
                auditQuery,
                isTraceabilityMode ? client.from('otcheti').select('*').ilike('ID Детайл', `%${searchTerm}%`).order('Дата', { ascending: false }).limit(300) : Promise.resolve({ data: [] }),
                isTraceabilityMode ? client.from('otcheti').select('ID Детайл, Дата').order('Дата', { ascending: false }).limit(3000) : Promise.resolve({ data: [] })
            ]);

            if (auditRes.error) throw auditRes.error;
            if (otchetiRes.error) throw otchetiRes.error;

            let filteredAudit = (auditRes.data || []).filter(log => {
                let str = JSON.stringify(log.new_data || {}) + JSON.stringify(log.old_data || {});
                return str.toLowerCase().includes(searchTerm);
            });

            let combined = [];
            (otchetiRes.data || []).forEach(o => {
                combined.push({ type: 'otchet', time: new Date(o['Дата']), data: o });
            });
            filteredAudit.forEach(a => {
                combined.push({ type: 'audit', time: new Date(a.changed_at), data: a });
            });

            combined.sort((a, b) => b.time - a.time);

            if (combined.length === 0) {
                container.innerHTML = '<div style="text-align:center; padding:20px; color:#64748b;">Няма намерена история за "' + searchTerm + '".</div>';
                return;
            }

            let html = '<table style="width:100%; border-collapse:collapse; background:white; font-size:0.9em; box-shadow:0 1px 3px rgba(0,0,0,0.1);">';
            html += '<thead style="background:#f8fafc; color:#0f172a;"><tr><th style="padding:10px; border:1px solid #cbd5e1; text-align:left; width:150px;">Време</th><th style="padding:10px; border:1px solid #cbd5e1; text-align:left; width:120px;">Събитие</th><th style="padding:10px; border:1px solid #cbd5e1; text-align:left;">Детайли (Проследимост)</th></tr></thead><tbody>';

            combined.forEach(item => {
                let dateStr = item.time.toLocaleString('bg-BG');

                if (item.type === 'otchet') {
                    let o = item.data;
                    html += `<tr>
                        <td style="padding:10px; border:1px solid #e2e8f0; color:#475569;">${dateStr}</td>
                        <td style="padding:10px; border:1px solid #e2e8f0;"><span style="background:#dbeafe; color:#1e40af; padding:3px 8px; border-radius:12px; font-weight:bold; font-size:0.8em;">ОТЧЕТЕНО</span></td>
                        <td style="padding:10px; border:1px solid #e2e8f0;">
                            Отчетен <b>${o['ID Детайл']}</b> от <b>${o['Оператор']}</b> (Оп: ${o['Операция']}) ➡️ <span style="color:#16a34a; font-weight:bold;">+${o['Количество']} бр.</span>
                        </td>
                    </tr>`;
                } else {
                    let log = item.data;
                    let oldData = log.old_data || {};
                    let newData = log.new_data || {};

                    if (['inventory', 'inventory_gp', 'inventory_wip'].includes(log.table_name)) {
                        let actionBadge = '<span style="background:#fef3c7; color:#d97706; padding:3px 8px; border-radius:12px; font-weight:bold; font-size:0.8em;">СКЛАД</span>';
                        if (log.action_type === 'INSERT') actionBadge = '<span style="background:#dcfce7; color:#166534; padding:3px 8px; border-radius:12px; font-weight:bold; font-size:0.8em;">НОВ В СКЛАД</span>';

                        let detailsHtml = '';
                        let oldQty = parseFloat(oldData['Количество'] || oldData['Общо']) || 0;
                        let newQty = parseFloat(newData['Количество'] || newData['Общо']) || 0;
                        let detailId = newData['ID Детайл'] || oldData['ID Детайл'] || 'Неизвестен детайл';
                        let opName = newData['Операция'] || oldData['Операция'] || '';
                        let opHtml = opName ? ` <span style="font-size:0.9em; color:#64748b;">(Оп: ${opName})</span>` : '';

                        if (log.action_type === 'INSERT') oldQty = 0;
                        let diff = newQty - oldQty;
                        let diffStr = diff > 0 ? `<span style="color:#16a34a; font-weight:bold;">(+${diff})</span>` : (diff < 0 ? `<span style="color:#ef4444; font-weight:bold;">(${diff})</span>` : '');

                        detailsHtml = `Склад: <b>${detailId}</b>${opHtml} | <span style="text-decoration:line-through; color:#94a3b8;">${oldQty} бр.</span> ➡️ <b>${newQty} бр.</b> ${diffStr}`;

                        if (diff < 0 && recentOtchetiRes && recentOtchetiRes.data) {
                            let parentMatch = recentOtchetiRes.data.find(ro => Math.abs(new Date(ro['Дата']) - item.time) < 3000);
                            if (parentMatch) {
                                detailsHtml += `<br><span style="color:#d97706; font-size:0.9em;">🔗 Вероятно вложено в отчет: <b>${parentMatch['ID Детайл']}</b></span>`;
                            }
                        }

                        html += `<tr>
                            <td style="padding:10px; border:1px solid #e2e8f0; color:#475569;">${dateStr}</td>
                            <td style="padding:10px; border:1px solid #e2e8f0;">${actionBadge}</td>
                            <td style="padding:10px; border:1px solid #e2e8f0;">${detailsHtml}</td>
                        </tr>`;
                    } else {
                        // Generic rendering for other tables in search results
                        let actionBadge = '';
                        if (log.action_type === 'DELETE') actionBadge = '<span style="background:#fee2e2; color:#b91c1c; padding:3px 8px; border-radius:12px; font-weight:bold; font-size:0.8em;">ИЗТРИВАНЕ</span>';
                        else if (log.action_type === 'INSERT') actionBadge = '<span style="background:#dcfce7; color:#166534; padding:3px 8px; border-radius:12px; font-weight:bold; font-size:0.8em;">ДОБАВЯНЕ</span>';
                        else actionBadge = '<span style="background:#fef3c7; color:#d97706; padding:3px 8px; border-radius:12px; font-weight:bold; font-size:0.8em;">РЕДАКЦИЯ</span>';

                        let detailsHtml = formatAuditLogDetails(log);

                        html += `<tr>
                            <td style="padding:10px; border:1px solid #e2e8f0; color:#475569;">${dateStr}</td>
                            <td style="padding:10px; border:1px solid #e2e8f0; text-align:center;">${actionBadge}<br><span style="font-size:0.85em; color:#64748b;">${log.table_name}</span></td>
                            <td style="padding:10px; border:1px solid #e2e8f0;">${detailsHtml}</td>
                        </tr>`;
                    }
                }
            });

            html += '</tbody></table>';
            container.innerHTML = html;
            return;
        }

        // --- Стандартно поведение (без търсене) ---
        let query = client.from('audit_logs').select('*').order('changed_at', { ascending: false }).limit(200);

        if (tableFilter !== 'all') {
            if (tableFilter === 'inventory') {
                query = query.in('table_name', ['inventory', 'inventory_gp', 'inventory_wip']);
            } else {
                query = query.eq('table_name', tableFilter);
            }
        }

        const { data, error } = await query;
        if (error) throw error;

        if (!data || data.length === 0) {
            container.innerHTML = '<div style="text-align:center; padding:20px; color:#64748b;">Няма записани промени за тази таблица.</div>';
            return;
        }

        let html = '<table style="width:100%; border-collapse:collapse; background:white; font-size:0.9em; box-shadow:0 1px 3px rgba(0,0,0,0.1);">';
        html += '<thead style="background:#e2e8f0; color:#475569;"><tr><th style="padding:10px; border:1px solid #cbd5e1; text-align:left; width:150px;">Време</th><th style="padding:10px; border:1px solid #cbd5e1; text-align:left; width:120px;">Таблица</th><th style="padding:10px; border:1px solid #cbd5e1; text-align:center; width:80px;">Действие</th><th style="padding:10px; border:1px solid #cbd5e1; text-align:left;">Детайли</th></tr></thead><tbody>';

        data.forEach(log => {
            let dateStr = new Date(log.changed_at).toLocaleString('bg-BG');
            let actionBadge = '';
            if (log.action_type === 'DELETE') actionBadge = '<span style="background:#fee2e2; color:#b91c1c; padding:3px 8px; border-radius:12px; font-weight:bold; font-size:0.8em;">ИЗТРИВАНЕ</span>';
            else if (log.action_type === 'INSERT') actionBadge = '<span style="background:#dcfce7; color:#166534; padding:3px 8px; border-radius:12px; font-weight:bold; font-size:0.8em;">ДОБАВЯНЕ</span>';
            else actionBadge = '<span style="background:#fef3c7; color:#d97706; padding:3px 8px; border-radius:12px; font-weight:bold; font-size:0.8em;">РЕДАКЦИЯ</span>';

            let detailsHtml = formatAuditLogDetails(log);

            html += `<tr>
                <td style="padding:10px; border:1px solid #e2e8f0; color:#475569;">${dateStr}</td>
                <td style="padding:10px; border:1px solid #e2e8f0; font-weight:bold; color:#1e293b;">${log.table_name}</td>
                <td style="padding:10px; border:1px solid #e2e8f0; text-align:center;">${actionBadge}</td>
                <td style="padding:10px; border:1px solid #e2e8f0; font-family:monospace; word-break:break-word;">${detailsHtml}</td>
            </tr>`;
        });

        html += '</tbody></table>';
        container.innerHTML = html;

    } catch (err) {
        container.innerHTML = '<div style="text-align:center; padding:20px; color:#ef4444;">Грешка: ' + err.message + '</div>';
    }
}

window.forceReloadTerminals = async function () {
    Swal.fire({
        title: 'Сигурни ли сте?',
        text: 'Това ще презареди екраните на всички терминали в цеха.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#dc2626',
        confirmButtonText: 'Да, синхронизирай!',
        cancelButtonText: 'Отказ'
    }).then(async (result) => {
        if (result.isConfirmed) {
            Swal.fire({ title: 'Изпращане...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
            try {
                const { error } = await client.from('system_commands').upsert({ id: 1, command_name: 'reload_terminals', last_triggered_at: new Date().toISOString() });
                if (error) throw error;
                Swal.fire('Готово!', 'Сигналът е изпратен. Всички терминали ще се презаредят след малко.', 'success');
            } catch (err) {
                Swal.fire('Грешка', err.message, 'error');
            }
        }
    });
};

window.openMaterialDossier = async function(materialCode) {
    if (!materialCode) return;
    const cleanCode = String(materialCode).trim();
    
    Swal.fire({
        title: 'Зареждане на картон...',
        html: `Справка за <b>${cleanCode}</b>`,
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading()
    });

    try {
        const [skRes, porRes, bomRes, nomRes] = await Promise.all([
            client.from('sklad').select('*').ilike('ID Детайл', cleanCode),
            client.from('porachki_materiali').select('*').ilike('Материал', cleanCode).order('Дата на поръчка', { ascending: false }),
            client.from('bom').select('*').ilike('ID Компонент', cleanCode),
            client.from('Номенклатура').select('*').or(`"ID Родител".ilike.${cleanCode},"ID Детайл".ilike.${cleanCode}`)
        ]);

        const skItem = (skRes.data && skRes.data.length > 0) ? skRes.data[0] : null;
        const porList = porRes.data || [];
        const bomParents = bomRes.data || [];
        const nomItems = nomRes.data || [];

        const whereUsed = [];
        const seenWhereUsed = new Set();
        bomParents.forEach(b => {
            const p = String(b['ID Родител'] || '').trim();
            if (p && !seenWhereUsed.has(p.toUpperCase())) {
                seenWhereUsed.add(p.toUpperCase());
                whereUsed.push({ code: p, norm: parseFloat(b['Количество']) || 1, unit: 'бр.', source: 'BOM' });
            }
        });
        nomItems.forEach(n => {
            const r = String(n['ID Родител'] || '').trim();
            if (r.toLowerCase() === cleanCode.toLowerCase()) {
                const p = String(n['ID Детайл'] || '').trim();
                if (p && !seenWhereUsed.has(p.toUpperCase())) {
                    seenWhereUsed.add(p.toUpperCase());
                    whereUsed.push({ code: p, norm: parseFloat(n['Разходна норма']) || 1, unit: n['Единици'] || 'бр.', source: 'Номенклатура' });
                }
            }
        });

        const startQty = skItem ? (parseFloat(skItem['Начална наличност']) || 0) : 0;
        const delivQty = skItem ? (parseFloat(skItem['Доставено']) || 0) : 0;
        const usedQty = skItem ? (parseFloat(skItem['Изразходено']) || 0) : 0;
        const stockQty = skItem ? (parseFloat(skItem['Остатък']) || 0) : 0;
        const minQty = skItem ? (parseFloat(skItem['Минимално количество']) || 0) : 0;
        const unit = skItem ? (skItem['Мерна единица'] || 'бр.') : 'бр.';
        const isCritical = (minQty > 0 && stockQty <= minQty);

        let html = `
            <div style="text-align:left; font-size:0.95em;">
                <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(130px, 1fr)); gap:8px; margin-bottom:14px; text-align:center;">
                    <div style="background:#f8fafc; border:1px solid #cbd5e1; border-radius:8px; padding:8px;">
                        <div style="font-size:0.75em; color:#64748b; font-weight:700;">НАЧАЛНА</div>
                        <div style="font-size:1.2em; font-weight:900; color:#1e293b;">${startQty.toLocaleString('bg-BG')}</div>
                    </div>
                    <div style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:8px; padding:8px;">
                        <div style="font-size:0.75em; color:#15803d; font-weight:700;">ДОСТАВЕНО (+)</div>
                        <div style="font-size:1.2em; font-weight:900; color:#166534;">+${delivQty.toLocaleString('bg-BG')}</div>
                    </div>
                    <div style="background:#fff7ed; border:1px solid #fed7aa; border-radius:8px; padding:8px;">
                        <div style="font-size:0.75em; color:#c2410c; font-weight:700;">ИЗРАЗХОДЕНО (-)</div>
                        <div style="font-size:1.2em; font-weight:900; color:#9a3412;">-${usedQty.toLocaleString('bg-BG')}</div>
                    </div>
                    <div style="background:${isCritical ? '#fef2f2' : '#eff6ff'}; border:1.5px solid ${isCritical ? '#fca5a5' : '#bfdbfe'}; border-radius:8px; padding:8px;">
                        <div style="font-size:0.75em; color:${isCritical ? '#b91c1c' : '#1d4ed8'}; font-weight:800;">ТЕКУЩ ОСТАТЪК</div>
                        <div style="font-size:1.3em; font-weight:900; color:${isCritical ? '#dc2626' : '#1e40af'};">${stockQty.toLocaleString('bg-BG')} ${unit}</div>
                        ${isCritical ? '<div style="font-size:0.7em; color:#b91c1c; font-weight:bold;">⚠️ Под минимум!</div>' : ''}
                    </div>
                </div>

                <div style="margin-bottom:14px; border:1px solid #e2e8f0; border-radius:8px; overflow:hidden;">
                    <div style="background:#f1f5f9; padding:6px 12px; font-weight:800; font-size:0.85em; color:#334155; display:flex; justify-content:space-between; align-items:center;">
                        <span>🧩 Къде се влага в производството (${whereUsed.length} детайла)</span>
                        <button type="button" onclick="Swal.close(); openResolverTree('${cleanCode}');" style="background:none; border:none; color:#2563eb; font-weight:bold; font-size:0.8em; cursor:pointer; text-decoration:underline;">Виж в Резолвер ➔</button>
                    </div>
                    <div style="max-height:140px; overflow-y:auto; padding:8px;">
                        ${whereUsed.length > 0 ? `
                            <table style="width:100%; border-collapse:collapse; font-size:0.85em;">
                                <thead>
                                    <tr style="color:#64748b; border-bottom:1px solid #e2e8f0; text-align:left;">
                                        <th style="padding:4px 6px;">Детайл / Изделие</th>
                                        <th style="padding:4px 6px; text-align:center;">Норма</th>
                                        <th style="padding:4px 6px; text-align:right;">Източник</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${whereUsed.map(w => `
                                        <tr style="border-bottom:1px solid #f8fafc;">
                                            <td style="padding:4px 6px; font-weight:700; color:#1e293b;">${w.code}</td>
                                            <td style="padding:4px 6px; text-align:center; font-weight:bold; color:#4338ca;">${w.norm} ${w.unit}</td>
                                            <td style="padding:4px 6px; text-align:right; font-size:0.8em; color:#64748b;">${w.source}</td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        ` : '<div style="color:#94a3b8; font-size:0.85em; text-align:center; padding:8px;">Няма намерени рецепти къде се влага този материал.</div>'}
                    </div>
                </div>

                <div style="margin-bottom:14px; border:1px solid #e2e8f0; border-radius:8px; overflow:hidden;">
                    <div style="background:#f1f5f9; padding:6px 12px; font-weight:800; font-size:0.85em; color:#334155;">
                        🛒 История на заявките & доставките (${porList.length})
                    </div>
                    <div style="max-height:160px; overflow-y:auto; padding:8px;">
                        ${porList.length > 0 ? `
                            <table style="width:100%; border-collapse:collapse; font-size:0.82em;">
                                <thead>
                                    <tr style="color:#64748b; border-bottom:1px solid #e2e8f0; text-align:left;">
                                        <th style="padding:4px 6px;">Дата</th>
                                        <th style="padding:4px 6px;">Доставчик</th>
                                        <th style="padding:4px 6px; text-align:center;">Кол-во</th>
                                        <th style="padding:4px 6px; text-align:center;">Статус</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${porList.map(p => {
                                        const isReceived = (p['Статус'] === 'Прието');
                                        const dateStr = p['Дата на приемане'] || p['Дата на поръчка'] || '—';
                                        return `
                                            <tr style="border-bottom:1px solid #f8fafc;">
                                                <td style="padding:4px 6px; color:#475569;">${dateStr}</td>
                                                <td style="padding:4px 6px; font-weight:600; color:#1e293b;">${p['Доставчик'] || '—'}</td>
                                                <td style="padding:4px 6px; text-align:center; font-weight:bold; color:#15803d;">${p['Количество']} бр.</td>
                                                <td style="padding:4px 6px; text-align:center;">
                                                    <span style="background:${isReceived ? '#dcfce7' : '#fef3c7'}; color:${isReceived ? '#15803d' : '#b45309'}; padding:2px 6px; border-radius:10px; font-size:0.85em; font-weight:800;">
                                                        ${isReceived ? '🟢 Прието' : '⏳ Поръчано'}
                                                    </span>
                                                </td>
                                            </tr>
                                        `;
                                    }).join('')}
                                </tbody>
                            </table>
                        ` : '<div style="color:#94a3b8; font-size:0.85em; text-align:center; padding:8px;">Няма регистрирани поръчки в таб Поръчки материали.</div>'}
                    </div>
                </div>

                <div style="display:flex; gap:8px; justify-content:center; flex-wrap:wrap; margin-top:10px;">
                    <button type="button" class="btn-primary" onclick="Swal.close(); window.open('traceability.html?search=' + encodeURIComponent('${cleanCode}'), '_blank');" style="background:#0f172a; font-size:0.85em; padding:6px 12px;">
                        🕵️ Инвентарен Детектив (Timeline) ➔
                    </button>
                    <button type="button" class="btn-primary" onclick="Swal.close(); if(typeof openSpotlightPartDossier==='function'){openSpotlightPartDossier('${cleanCode}');}" style="background:#4338ca; font-size:0.85em; padding:6px 12px;">
                        🔍 Единно Досие (Spotlight) ➔
                    </button>
                </div>
            </div>
        `;

        Swal.fire({
            title: `📜 Картон на материала: ${cleanCode}`,
            html: html,
            width: 680,
            showCloseButton: true,
            confirmButtonText: 'Затвори',
            confirmButtonColor: '#64748b'
        });

    } catch (err) {
        console.error('Error fetching material dossier:', err);
        Swal.fire('Грешка', 'Неуспешно зареждане на данните за картона: ' + err.message, 'error');
    }
};

// ==============================================================================
// ДИСКРЕТНА / ВНЕЗАПНА ПРОВЕРКА НА ЛОКАЦИЯ В РЕАЛНО ВРЕМЕ
// ==============================================================================

async function sendSilentPingPushNotification(targetEmail, pushText = '🔄 Синхронизиране на работния плот') {
    if (!targetEmail) return false;

    const ONESIGNAL_APP_ID = "2507a9cb-0d28-4952-9b7b-42e800a61613";
    const ONESIGNAL_API_KEY = "os_v2_app_eud2tsynfbevfg33iluabjqwcngcem2gdkaebuebdt" + "ob2ewfduy6d6lsudjvxyol6gqh7tatgimm7kewbh4sjp7yea5hzqmmdydqxkq";

    let terminalUrl = window.location.origin + window.location.pathname.replace(/[^/]*$/, '') + 'terminal.html';

    let payload = {
        app_id: ONESIGNAL_APP_ID,
        headings: { "en": "AMCI MES", "bg": "AMCI MES" },
        contents: { "en": pushText, "bg": pushText },
        url: terminalUrl,
        priority: 10,
        include_aliases: { "external_id": [targetEmail.toLowerCase().trim()] },
        include_external_user_ids: [targetEmail.toLowerCase().trim()],
        target_channel: "push"
    };

    try {
        const response = await fetch("https://onesignal.com/api/v1/notifications", {
            method: "POST",
            headers: { 
                "Content-Type": "application/json; charset=utf-8", 
                "Authorization": "Key " + ONESIGNAL_API_KEY 
            },
            body: JSON.stringify(payload)
        });
        if (!response.ok) {
            const errTxt = await response.text().catch(() => '');
            console.warn("OneSignal Push error:", errTxt);
            return false;
        }
        return true;
    } catch(e) {
        console.warn("OneSignal Push connection error:", e);
        return false;
    }
}

window.openSilentLocationCheckModal = async function() {
    Swal.fire({ title: 'Зареждане на служителите...', didOpen: () => Swal.showLoading() });

    try {
        // 1. Всички активни служители от персонал
        const { data: workers, error: wErr } = await client
            .from('personal')
            .select('Име, Имейл, Длъжност')
            .eq('Статус', 'Активен')
            .order('Име');

        if (wErr) throw wErr;
        if (!workers || workers.length === 0) {
            Swal.fire('Информация', 'Няма намерени активни служители.', 'info');
            return;
        }

        // 2. Днешни чекирания за смяна (гледаме само Влизане / Излизане, игнорираме 'Проверка локация' и съобщения)
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const { data: todayLogs } = await client
            .from('chekiraniya')
            .select('Имейл, Действие, Време')
            .gte('Време', todayStart.toISOString())
            .in('Действие', ['Влизане', 'Излизане', 'Авто излизане'])
            .order('Време', { ascending: false });

        const statusMap = {};
        if (todayLogs) {
            todayLogs.forEach(log => {
                const em = (log['Имейл'] || '').toLowerCase().trim();
                if (!statusMap[em]) {
                    statusMap[em] = log['Действие'];
                }
            });
        }

        // Подреждане: първо тези с 'Влизане' днес (на смяна)
        workers.sort((a, b) => {
            const emA = (a['Имейл'] || '').toLowerCase().trim();
            const emB = (b['Имейл'] || '').toLowerCase().trim();
            let stA = statusMap[emA] === 'Влизане' ? 1 : 0;
            let stB = statusMap[emB] === 'Влизане' ? 1 : 0;
            if (stA !== stB) return stB - stA;
            return (a['Име'] || '').localeCompare(b['Име'] || '', 'bg');
        });

        const optionsHtml = workers.map(w => {
            const em = (w['Имейл'] || '').toLowerCase().trim();
            const lastSt = statusMap[em];
            let badgeText = '⚪ Не е чекиран за днес';
            if (lastSt === 'Влизане') badgeText = '🟢 На смяна (Влязъл)';
            else if (lastSt === 'Излизане' || lastSt === 'Авто излизане') badgeText = '🔴 Изписан';
            return `<option value="${escapeHtml(w['Имейл'])}" data-name="${escapeHtml(w['Име'] || w['Имейл'])}">${escapeHtml(w['Име'] || w['Имейл'])} — ${badgeText}</option>`;
        }).join('');

        const { value: selectedEmail } = await Swal.fire({
            title: '🕵️ Дискретна проверка на локация',
            width: 580,
            html: `
                <div style="text-align: left; font-size: 0.9em; display: flex; flex-direction: column; gap: 12px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px;">
                        <span style="font-weight: 800; color: #7c3aed; font-size: 0.95em;">📍 Нова проверка</span>
                        <button type="button" onclick="openLocationChecksHistoryModal()" style="background: #f1f5f9; border: 1px solid #cbd5e1; color: #475569; padding: 4px 10px; border-radius: 6px; font-weight: 800; font-size: 0.82em; cursor: pointer;">
                            📜 Виж дневника на проверките ➔
                        </button>
                    </div>
                    <div style="background: #fdf4ff; border: 1.5px solid #e9d5ff; border-radius: 10px; padding: 12px 14px; font-size: 0.88em; color: #6b21a8; line-height: 1.45;">
                        🤫 <b>Напълно невидимо за служителя:</b><br>
                        Терминалът на служителя ще измери спътниковите GPS координати <b>без звук, без известие и без съобщение на екрана</b>.
                        Резултатът ще се отрази веднага като нов ред в таблица <b>„Хронология Чекирания“</b> с точен час, разстояние и линк към Google Maps.
                    </div>

                    <div>
                        <label style="font-weight: 700; color: #334155; display: block; margin-bottom: 6px;">
                            Изберете служител за измерване на координатите:
                        </label>
                        <select id="swalPingWorkerSelect" class="swal2-input" style="margin: 0; width: 100%; box-sizing: border-box; height: 42px; font-weight: 700;">
                            ${optionsHtml}
                        </select>
                    </div>

                    <div style="background: #f8fafc; border: 1.5px solid #cbd5e1; border-radius: 10px; padding: 12px 14px;">
                        <label style="display: flex; align-items: center; gap: 8px; font-weight: 700; color: #1e293b; cursor: pointer;">
                            <input type="checkbox" id="swalPingSendPush" checked style="width: 18px; height: 18px; accent-color: #7c3aed; cursor: pointer;" onchange="document.getElementById('swalPingPushWrap').style.display = this.checked ? 'block' : 'none';">
                            <span>📲 Изпрати дискретно Push известие към телефона</span>
                        </label>
                        <div id="swalPingPushWrap" style="margin-top: 10px; display: block;">
                            <label style="font-size: 0.82em; color: #64748b; font-weight: 600; display: block; margin-bottom: 4px;">
                                Текст на известието (рутинно, без да подсказва за локация):
                            </label>
                            <select id="swalPingPushPreset" class="swal2-input" style="margin: 0 0 6px 0; width: 100%; box-sizing: border-box; height: 38px; font-size: 0.88em; font-weight: 700;" onchange="if(this.value!=='custom'){document.getElementById('swalPingPushText').value=this.value;}">
                                <option value="🔄 Синхронизиране на работния плот" selected>🔄 Синхронизиране на работния плот (Препоръчително)</option>
                                <option value="📋 Обновен производствен график">📋 Обновен производствен график</option>
                                <option value="⚙️ Актуализация на сесията">⚙️ Актуализация на сесията</option>
                                <option value="📶 Връзката със сървъра е възстановена">📶 Връзката със сървъра е възстановена</option>
                                <option value="custom">✏️ Друг собствен текст...</option>
                            </select>
                            <input type="text" id="swalPingPushText" class="swal2-input" value="🔄 Синхронизиране на работния плот" placeholder="Текст на известието" style="margin: 0; width: 100%; box-sizing: border-box; height: 38px; font-size: 0.9em; font-weight: 600;">
                            <div style="font-size: 0.78em; color: #94a3b8; margin-top: 5px; line-height: 1.35;">
                                💡 Известието изглежда като нормална фонова синхронизация на софтуера. Служителят просто го докосва, терминалът се отваря и веднага тихо прихваща координатите. <b>Не се изисква нищо от него и никой няма да дойде да пита!</b>
                            </div>
                        </div>
                    </div>
                </div>
            `,
            showCancelButton: true,
            confirmButtonText: '📍 Измери локация сега',
            cancelButtonText: 'Отказ',
            confirmButtonColor: '#7c3aed',
            preConfirm: () => {
                const sel = document.getElementById('swalPingWorkerSelect');
                if (!sel || !sel.value) {
                    Swal.showValidationMessage('Моля, изберете служител!');
                    return false;
                }
                const sendPush = document.getElementById('swalPingSendPush')?.checked || false;
                const pushText = document.getElementById('swalPingPushText')?.value.trim() || '🔄 Синхронизиране на работния плот';
                return {
                    email: sel.value,
                    name: sel.options[sel.selectedIndex]?.dataset?.name || sel.value,
                    sendPush: sendPush,
                    pushText: pushText
                };
            }
        });

        if (!selectedEmail) return;

        const { email: targetEmail, name: targetName } = selectedEmail;
        const adminEmail = localStorage.getItem('last_admin_email') || 'Администрация';

        // Създаваме заявката в таблица location_ping_requests
        const { data: pingRow, error: pErr } = await client
            .from('location_ping_requests')
            .insert([{
                worker_email: targetEmail,
                worker_name: targetName,
                requested_by: adminEmail,
                status: 'PENDING'
            }])
            .select()
            .single();

        if (pErr) throw pErr;

        // Изпращаме дискретното Push известие, ако е избрано
        if (selectedEmail.sendPush) {
            sendSilentPingPushNotification(targetEmail, selectedEmail.pushText);
        }

        let timeLeft = 12;
        let pingChannel = null;
        let pollTimer = null;
        let hasResolved = false;

        Swal.fire({
            title: `📡 Извличане на GPS за ${escapeHtml(targetName)}`,
            allowOutsideClick: false,
            showConfirmButton: false,
            showCancelButton: true,
            cancelButtonText: 'Спри изчакването',
            html: `
                <div style="font-size: 0.95em; color: #475569; padding: 10px 0; line-height: 1.5;">
                    Свързване със сателитния приемник на устройството...<br>
                    <div style="font-size: 1.6em; font-weight: 900; color: #7c3aed; margin: 12px 0;">
                        ⏱️ <span id="locPingTimer">${timeLeft}</span> сек
                    </div>
                    <div style="font-size: 0.82em; color: #94a3b8; font-style: italic;">
                        (Служителят не вижда нищо на своя телефон/таблет)
                    </div>
                </div>
            `,
            didOpen: () => {
                const timerSpan = document.getElementById('locPingTimer');

                const checkDone = async () => {
                    if (hasResolved) return;
                    const { data: chk } = await client
                        .from('location_ping_requests')
                        .select('*')
                        .eq('id', pingRow.id)
                        .single();

                    if (chk && chk.status === 'SUCCESS') {
                        finishPingSuccess(chk);
                    }
                };

                // Realtime абонамент
                try {
                    pingChannel = client.channel('loc-ping-' + pingRow.id)
                        .on('postgres_changes', {
                            event: 'UPDATE',
                            schema: 'public',
                            table: 'location_ping_requests',
                            filter: `id=eq.${pingRow.id}`
                        }, (payload) => {
                            if (payload.new && payload.new.status === 'SUCCESS') {
                                finishPingSuccess(payload.new);
                            }
                        })
                        .subscribe();
                } catch(e) {}

                pollTimer = setInterval(async () => {
                    timeLeft--;
                    if (timerSpan) timerSpan.innerText = timeLeft;
                    await checkDone();
                    if (timeLeft <= 0 && !hasResolved) {
                        finishPingTimeout();
                    }
                }, 1000);
            },
            willClose: () => {
                if (pollTimer) clearInterval(pollTimer);
                if (pingChannel) client.removeChannel(pingChannel);
            }
        });

        const finishPingSuccess = async (resultData) => {
            if (hasResolved) return;
            hasResolved = true;
            if (pollTimer) clearInterval(pollTimer);
            if (pingChannel) client.removeChannel(pingChannel);

            // Резервен запис в chekiraniya от страна на Администратора
            try {
                const pingTargetEmail = targetEmail || (resultData && resultData.worker_email);
                if (pingTargetEmail) {
                    const { data: existingRows } = await client.from('chekiraniya')
                        .select('id')
                        .eq('Имейл', pingTargetEmail)
                        .eq('Действие', 'Проверка локация')
                        .gte('Време', new Date(Date.now() - 3 * 60 * 1000).toISOString());

                    if (!existingRows || existingRows.length === 0) {
                        const coords = (resultData.result_lat && resultData.result_lng) ? `${resultData.result_lat},${resultData.result_lng}` : 'Няма GPS';
                        await client.from('chekiraniya').insert([{
                            "Имейл": pingTargetEmail,
                            "Действие": "Проверка локация",
                            "Време": resultData.responded_at || new Date().toISOString(),
                            "Локация": coords,
                            "Бележка": resultData.result_note || (resultData.result_distance !== null ? `В обекта (~${resultData.result_distance}м)` : 'В обекта')
                        }]);
                    }
                }
            } catch (fallbackErr) {
                console.warn('Fallback insert chekiraniya error:', fallbackErr);
            }

            if (typeof playNotificationChime === 'function') playNotificationChime();
            if (window.invalidateAdminCache) window.invalidateAdminCache('chekiraniya');
            loadCurrentTableData(true);

            const isOutside = (resultData.result_note && resultData.result_note.includes('ИЗВЪН ОБЕКТА')) || (resultData.result_distance > 200);
            const distStr = resultData.result_distance !== null ? `${resultData.result_distance} м` : 'Неизвестно';
            const coordsStr = (resultData.result_lat && resultData.result_lng) ? `${resultData.result_lat}, ${resultData.result_lng}` : null;
            const mapsBtn = coordsStr 
                ? `<div style="margin-top: 14px;"><a href="https://www.google.com/maps?q=${coordsStr}" target="_blank" style="background:#2563eb; color:white; padding:8px 16px; border-radius:8px; font-weight:800; text-decoration:none; display:inline-flex; align-items:center; gap:6px;">📍 Отвори точната локация в Google Maps</a></div>` 
                : '';

            Swal.fire({
                icon: isOutside ? 'warning' : 'success',
                title: isOutside ? '🚨 ИЗВЪН ОБЕКТА!' : '🟢 В ОБЕКТА',
                width: 550,
                html: `
                    <div style="text-align: left; font-size: 0.95em; line-height: 1.5;">
                        <div>Служител: <b>${escapeHtml(targetName)}</b> (${escapeHtml(targetEmail)})</div>
                        <div style="margin-top: 4px;">Разстояние от цеха: <b style="color:${isOutside ? '#dc2626' : '#15803d'}; font-size:1.1em;">${distStr}</b></div>
                        <div style="margin-top: 4px;">Час на засичане: <b>${new Date(resultData.responded_at || Date.now()).toLocaleTimeString('bg-BG')}</b></div>
                        <div style="margin-top: 4px; font-size: 0.85em; color: #64748b;">Бележка: ${escapeHtml(resultData.result_note || '')}</div>
                        ${mapsBtn}
                        <div style="margin-top: 14px; padding: 8px 12px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; font-size: 0.85em; color: #166534; font-weight: 700;">
                            ✅ Записът за проверката вече е добавен в таблица „Хронология Чекирания“!
                        </div>
                    </div>
                `,
                confirmButtonText: 'Разбрах',
                confirmButtonColor: '#2563eb'
            });
        };

        const finishPingTimeout = () => {
            if (hasResolved) return;
            hasResolved = true;
            if (pollTimer) clearInterval(pollTimer);
            if (pingChannel) client.removeChannel(pingChannel);

            Swal.fire({
                icon: 'info',
                title: selectedEmail.sendPush ? '📲 Изпратено е известие към телефона' : '⏳ Устройството в момента спи',
                width: 580,
                html: `
                    <div style="text-align: left; font-size: 0.92em; line-height: 1.5; color: #334155;">
                        <p style="margin-top: 0;">
                            Телефонът на <b>${escapeHtml(targetName)}</b> в момента спи с изгасен екран в джоба.
                            ${selectedEmail.sendPush ? `<br>Към телефона му беше изпратено дискретно известие: <b>„${escapeHtml(selectedEmail.pushText)}“</b>.` : ''}
                        </p>
                        <div style="background: #f8fafc; border: 1.5px solid #cbd5e1; border-radius: 8px; padding: 10px 14px; font-size: 0.88em; color: #475569;">
                            ℹ️ <b>Какво следва:</b> В момента, в който служителят докосне известието и отвори терминала (или отключи телефона си), координатите му <b>ще се запишат автоматично в таблица „Чекирания“</b> без да се изисква абсолютно нищо от него!
                        </div>
                    </div>
                `,
                confirmButtonText: 'Разбрах',
                confirmButtonColor: '#7c3aed'
            });
        };

    } catch (err) {
        Swal.fire('Грешка', 'Неуспешна проверка: ' + err.message, 'error');
    }
};

// ==============================================================================
// ДНЕВНИК / ИСТОРИЯ НА ИЗНЕЗАДВАЩИТЕ ПРОВЕРКИ НА ЛОКАЦИЯ
// ==============================================================================
window.openLocationChecksHistoryModal = async function() {
    Swal.fire({ title: 'Зареждане на дневника...', didOpen: () => Swal.showLoading() });

    try {
        const { data: pings, error } = await client
            .from('location_ping_requests')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(100);

        if (error) {
            if (error.code === '42P01') {
                Swal.fire('Информация', 'Таблицата за проверки още не е създадена в базата данни.', 'info');
                return;
            }
            throw error;
        }

        if (!pings || pings.length === 0) {
            Swal.fire({
                title: '📜 Дневник на проверките',
                html: '<div style="padding: 25px; color: #64748b; font-size: 0.95em;">Все още няма регистрирани проверки на локация.</div>',
                icon: 'info',
                confirmButtonColor: '#7c3aed'
            });
            return;
        }

        let rowsHtml = pings.map((p) => {
            const timeStr = p.responded_at 
                ? new Date(p.responded_at).toLocaleString('bg-BG', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
                : (p.created_at ? new Date(p.created_at).toLocaleString('bg-BG', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-');

            let statusBadge = '<span style="background:#fffbeb; color:#b45309; border:1px solid #fde68a; padding:2px 7px; border-radius:6px; font-weight:800; font-size:0.8em;">⏳ Чакаща (спи)</span>';
            const isOutside = (p.result_note && p.result_note.includes('ИЗВЪН ОБЕКТА')) || (p.result_distance > 200);

            if (p.status === 'SUCCESS') {
                if (isOutside) {
                    statusBadge = '<span style="background:#fef2f2; color:#dc2626; border:1.5px solid #fecaca; padding:2px 7px; border-radius:6px; font-weight:800; font-size:0.8em;">🚨 ИЗВЪН ОБЕКТА</span>';
                } else {
                    statusBadge = '<span style="background:#f0fdf4; color:#15803d; border:1px solid #bbf7d0; padding:2px 7px; border-radius:6px; font-weight:800; font-size:0.8em;">🟢 В обекта</span>';
                }
            }

            const distStr = p.result_distance !== null ? `<b>${p.result_distance} м</b>` : '<span style="color:#94a3b8;">-</span>';
            const coords = (p.result_lat && p.result_lng) ? `${p.result_lat},${p.result_lng}` : null;
            const mapLink = coords 
                ? `<a href="https://www.google.com/maps?q=${coords}" target="_blank" style="color:#2563eb; font-weight:bold; text-decoration:none; font-size:0.88em; background:#eff6ff; padding:2px 6px; border-radius:4px; border:1px solid #bfdbfe;">📍 Карта</a>` 
                : '<span style="color:#94a3b8;">-</span>';

            return `
                <tr style="border-bottom: 1px solid #e2e8f0; font-size: 0.88em;">
                    <td style="padding: 7px 8px; color: #475569;">${timeStr}</td>
                    <td style="padding: 7px 8px;">
                        <div style="font-weight: 800; color: #1e293b;">${escapeHtml(p.worker_name || p.worker_email)}</div>
                        <div style="font-size: 0.78em; color: #64748b;">${escapeHtml(p.worker_email)}</div>
                    </td>
                    <td style="padding: 7px 8px; text-align: center;">${statusBadge}</td>
                    <td style="padding: 7px 8px; text-align: center;">${distStr}</td>
                    <td style="padding: 7px 8px; text-align: center;">${mapLink}</td>
                    <td style="padding: 7px 8px; font-size: 0.8em; color: #64748b;">${escapeHtml(p.requested_by || 'Админ')}</td>
                </tr>
            `;
        }).join('');

        Swal.fire({
            title: '📜 Дневник: Изненадващи проверки на локация',
            width: 780,
            html: `
                <div style="text-align: left; max-height: 460px; overflow-y: auto;">
                    <table style="width: 100%; border-collapse: collapse;">
                        <thead>
                            <tr style="background: #f1f5f9; border-bottom: 2px solid #cbd5e1; text-align: left; font-size: 0.82em; color: #475569;">
                                <th style="padding: 8px;">Време</th>
                                <th style="padding: 8px;">Служител</th>
                                <th style="padding: 8px; text-align: center;">Резултат</th>
                                <th style="padding: 8px; text-align: center;">Разстояние</th>
                                <th style="padding: 8px; text-align: center;">Google Maps</th>
                                <th style="padding: 8px;">Заявил</th>
                            </tr>
                        </thead>
                        <tbody>${rowsHtml}</tbody>
                    </table>
                </div>
            `,
            showCancelButton: true,
            confirmButtonText: '📍 Нова проверка сега',
            cancelButtonText: 'Затвори',
            confirmButtonColor: '#7c3aed',
            cancelButtonColor: '#64748b'
        }).then((res) => {
            if (res.isConfirmed) {
                openSilentLocationCheckModal();
            }
        });

    } catch(err) {
        Swal.fire('Грешка', err.message, 'error');
    }
};
