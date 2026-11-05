// ==============================================================
// МОДУЛ "3S ОДИТИ & НАСТРОЙКИ" (Sort, Sweep, Standardize)
// За ИС-СИСТЕМС Административен Панел
// ==============================================================

let current3sSubTab = 'settings'; // 'settings' or 'logs'
let current3sSector = 'Измерване и монтаж'; // 'Измерване и монтаж', 'Бобиньорки', 'Машини'
let audit3sAuditorsCache = [];
let audit3sTemplatesCache = [];
let audit3sAreasCache = [];
let audit3sLogsCache = [];
let editingQuestionId = null;

async function render3sTab(forceRefresh = false) {
    const mainTable = document.getElementById('mainTable');
    const addNewBtn = document.getElementById('addNewBtn');
    if (mainTable) mainTable.style.display = 'none';
    if (addNewBtn) addNewBtn.style.display = 'none';

    let container = document.getElementById('audit3sContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'audit3sContainer';
        container.style.cssText = 'padding: 14px; width: 100%; box-sizing: border-box;';
        const wrapper = document.querySelector('.table-container');
        if (wrapper) wrapper.appendChild(container);
    }
    container.style.display = 'block';

    if (forceRefresh || audit3sTemplatesCache.length === 0) {
        container.innerHTML = '<div style="padding:40px; text-align:center; color:#64748b; font-size:1.1em;">Зареждане на 3S данни... 🧹</div>';
        await loadAll3sData();
    }

    render3sLayout();
}

async function loadAll3sData() {
    try {
        const [auditorsRes, templatesRes, areasRes, logsRes] = await Promise.all([
            client.from('audit_3s_auditors').select('*').order('id', { ascending: true }),
            client.from('audit_3s_templates').select('*').eq('is_active', true).order('order_index', { ascending: true }).order('id', { ascending: true }),
            client.from('audit_3s_areas').select('*').eq('is_active', true).order('id', { ascending: true }),
            client.from('audit_3s_logs').select('*').order('created_at', { ascending: false }).limit(200)
        ]);

        audit3sAuditorsCache = auditorsRes.data || [];
        audit3sTemplatesCache = templatesRes.data || [];
        audit3sAreasCache = areasRes.data || [];
        audit3sLogsCache = logsRes.data || [];
    } catch (err) {
        console.error("Грешка при зареждане на 3S данни:", err);
    }
}

function render3sLayout() {
    const container = document.getElementById('audit3sContainer');
    if (!container) return;

    container.innerHTML = `
        <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:14px; padding:20px; box-shadow:0 4px 6px -1px rgba(0,0,0,0.03);">
            <!-- Module Top Bar -->
            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; border-bottom:2px solid #f1f5f9; padding-bottom:14px; margin-bottom:18px;">
                <div>
                    <h2 style="margin:0; font-size:1.35em; font-weight:900; color:#1e293b; display:flex; align-items:center; gap:8px;">
                        <span>🧹</span> 3S Система (Sort, Sweep, Standardize)
                    </h2>
                    <span style="font-size:0.85em; color:#64748b;">Управление на оценъчните въпроси, проверяващи, общи части и история на одитите</span>
                </div>
                <div style="display:flex; gap:8px; align-items:center;">
                    <a href="audit-3s.html" target="_blank" style="background:#f0fdf4; border:1.5px solid #86efac; color:#15803d; padding:8px 14px; border-radius:8px; font-weight:800; font-size:0.88em; text-decoration:none; display:inline-flex; align-items:center; gap:6px;">
                        <span>📱</span> Отвори Мобилен Формуляр
                    </a>
                    <button type="button" class="btn-primary" onclick="loadAll3sData().then(render3sLayout)" style="padding:8px 14px; font-size:0.88em;">🔄 Опресни</button>
                </div>
            </div>

            <!-- Sub Tabs: Settings vs Logs -->
            <div style="display:flex; gap:8px; margin-bottom:20px; border-bottom:1px solid #e2e8f0; padding-bottom:8px;">
                <button type="button" onclick="switch3sSubTab('settings')" style="background:${current3sSubTab==='settings'?'#4338ca':'#f8fafc'}; color:${current3sSubTab==='settings'?'#ffffff':'#475569'}; border:1px solid ${current3sSubTab==='settings'?'#4338ca':'#cbd5e1'}; padding:10px 18px; border-radius:8px; font-weight:800; cursor:pointer; font-size:0.95em;">
                    ⚙️ Настройки на Въпроси &amp; Звена
                </button>
                <button type="button" onclick="switch3sSubTab('logs')" style="background:${current3sSubTab==='logs'?'#4338ca':'#f8fafc'}; color:${current3sSubTab==='logs'?'#ffffff':'#475569'}; border:1px solid ${current3sSubTab==='logs'?'#4338ca':'#cbd5e1'}; padding:10px 18px; border-radius:8px; font-weight:800; cursor:pointer; font-size:0.95em;">
                    📊 История и Резултати от Одитите (${audit3sLogsCache.length})
                </button>
            </div>

            <!-- Content Area -->
            <div id="subTab3sContent"></div>
        </div>

        <!-- Modal for Question Add/Edit -->
        <div id="modal3sQuestionBackdrop" style="display:none; position:fixed; inset:0; background:rgba(15,23,42,0.7); z-index:99999; align-items:center; justify-content:center; padding:16px;">
            <div style="background:#ffffff; border-radius:14px; max-width:700px; width:100%; max-height:92vh; display:flex; flex-direction:column; box-shadow:0 20px 25px -5px rgba(0,0,0,0.3); overflow:hidden;">
                <div style="padding:16px 20px; background:#f8fafc; border-bottom:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center;">
                    <h3 id="modal3sTitle" style="margin:0; font-size:1.15em; font-weight:900; color:#1e293b;">Въпрос за Одит</h3>
                    <button type="button" onclick="close3sQuestionModal()" style="background:transparent; border:none; font-size:1.5em; cursor:pointer; color:#94a3b8;">&times;</button>
                </div>
                <div style="padding:20px; overflow-y:auto; flex:1; display:flex; flex-direction:column; gap:14px;">
                    <div style="display:flex; gap:12px; flex-wrap:wrap;">
                        <div style="flex:1; min-width:200px;">
                            <label style="display:block; font-size:0.82em; font-weight:800; color:#475569; margin-bottom:4px;">Категория 3S:</label>
                            <select id="m3sCategory" style="width:100%; padding:9px 12px; border:1px solid #cbd5e1; border-radius:8px; font-size:0.95em;">
                                <option value="1. Sort (Сортиране)">1. Sort (Сортиране)</option>
                                <option value="2. Sweep (Почистване)">2. Sweep (Почистване)</option>
                                <option value="3. Standardize (Стандартизация)">3. Standardize (Стандартизация)</option>
                            </select>
                        </div>
                        <div style="width:120px;">
                            <label style="display:block; font-size:0.82em; font-weight:800; color:#475569; margin-bottom:4px;">Код на въпроса:</label>
                            <input type="text" id="m3sCode" placeholder="напр. 1.2" style="width:100%; padding:9px 12px; border:1px solid #cbd5e1; border-radius:8px; font-size:0.95em; box-sizing:border-box;">
                        </div>
                    </div>

                    <div>
                        <label style="display:block; font-size:0.82em; font-weight:800; color:#475569; margin-bottom:4px;">Заглавие на въпроса / Тема:</label>
                        <input type="text" id="m3sTitleInput" placeholder="напр. Нужните инструменти, приспособления и др." style="width:100%; padding:10px 12px; border:1px solid #cbd5e1; border-radius:8px; font-size:1em; font-weight:700; box-sizing:border-box;">
                    </div>

                    <div>
                        <label style="display:block; font-size:0.82em; font-weight:800; color:#475569; margin-bottom:4px;">Пояснение / Описание на стандарта:</label>
                        <textarea id="m3sDesc" rows="2" placeholder="На работното място се намират само нужните инструменти..." style="width:100%; padding:9px 12px; border:1px solid #cbd5e1; border-radius:8px; font-size:0.92em; box-sizing:border-box;"></textarea>
                    </div>

                    <!-- Rubric 0..4 Points Descriptions -->
                    <div>
                        <label style="display:block; font-size:0.85em; font-weight:900; color:#1e293b; margin-bottom:8px; border-bottom:1px solid #e2e8f0; padding-bottom:4px;">
                            🎯 Оценъчна Матрица (Описания за всяка точка от 0 до 4):
                        </label>
                        <div style="display:flex; flex-direction:column; gap:8px;">
                            <div style="display:flex; align-items:center; gap:8px;">
                                <span style="width:50px; flex-shrink:0; font-weight:900; color:#ef4444; font-size:0.88em; text-align:right;">0 т.:</span>
                                <input type="text" id="m3sPt0" placeholder="Пълен безпорядък; приспособленията са разхвърляни..." style="flex:1; padding:8px 10px; border:1px solid #cbd5e1; border-radius:6px; font-size:0.9em;">
                            </div>
                            <div style="display:flex; align-items:center; gap:8px;">
                                <span style="width:50px; flex-shrink:0; font-weight:900; color:#ea580c; font-size:0.88em; text-align:right;">1 т.:</span>
                                <input type="text" id="m3sPt1" placeholder="Има повече шаблони и макари от необходимото..." style="flex:1; padding:8px 10px; border:1px solid #cbd5e1; border-radius:6px; font-size:0.9em;">
                            </div>
                            <div style="display:flex; align-items:center; gap:8px;">
                                <span style="width:50px; flex-shrink:0; font-weight:900; color:#f59e0b; font-size:0.88em; text-align:right;">2 т.:</span>
                                <input type="text" id="m3sPt2" placeholder="Инструментите са за текущата поръчка, но не са подредени..." style="flex:1; padding:8px 10px; border:1px solid #cbd5e1; border-radius:6px; font-size:0.9em;">
                            </div>
                            <div style="display:flex; align-items:center; gap:8px;">
                                <span style="width:50px; flex-shrink:0; font-weight:900; color:#3b82f6; font-size:0.88em; text-align:right;">3 т.:</span>
                                <input type="text" id="m3sPt3" placeholder="Инструментите са групирани логично; апаратурата е защитена..." style="flex:1; padding:8px 10px; border:1px solid #cbd5e1; border-radius:6px; font-size:0.9em;">
                            </div>
                            <div style="display:flex; align-items:center; gap:8px;">
                                <span style="width:50px; flex-shrink:0; font-weight:900; color:#10b981; font-size:0.88em; text-align:right;">4 т. (Макс):</span>
                                <input type="text" id="m3sPt4" placeholder="Минимален набор от инструменти на масата; всичко е чисто и подредено..." style="flex:1; padding:8px 10px; border:1px solid #cbd5e1; border-radius:6px; font-size:0.9em;">
                            </div>
                        </div>
                    </div>
                </div>
                <div style="padding:14px 20px; background:#f8fafc; border-top:1px solid #e2e8f0; display:flex; justify-content:flex-end; gap:10px;">
                    <button type="button" class="btn-secondary" onclick="close3sQuestionModal()">Отказ</button>
                    <button type="button" class="btn-primary" onclick="save3sQuestion()">💾 Запази въпроса</button>
                </div>
            </div>
        </div>
    `;

    if (current3sSubTab === 'settings') {
        render3sSettingsSubTab();
    } else {
        render3sLogsSubTab();
    }
}

function switch3sSubTab(tab) {
    current3sSubTab = tab;
    render3sLayout();
}

function select3sSector(sector) {
    current3sSector = sector;
    render3sSettingsSubTab();
}

function render3sSettingsSubTab() {
    const area = document.getElementById('subTab3sContent');
    if (!area) return;

    const sectors = ['Измерване и монтаж', 'Бобиньорки', 'Машини'];

    // Find auditor for current sector
    let auditorObj = audit3sAuditorsCache.find(a => a.sector === current3sSector);
    let auditorName = auditorObj ? auditorObj.auditor_name : '';
    if (auditorName === 'Не е зададен') auditorName = '';

    // Find questions for this sector
    let sectorQuestions = audit3sTemplatesCache.filter(q => q.sector === current3sSector);

    // Find areas for this sector
    let sectorAreas = audit3sAreasCache.filter(a => a.sector === current3sSector);

    let sectorButtonsHtml = sectors.map(s => `
        <button type="button" onclick="select3sSector('${s}')" style="background:${current3sSector===s?'#1e293b':'#f1f5f9'}; color:${current3sSector===s?'#ffffff':'#334155'}; border:1.5px solid ${current3sSector===s?'#1e293b':'#cbd5e1'}; padding:8px 18px; border-radius:20px; font-weight:800; cursor:pointer; font-size:0.92em; display:inline-flex; align-items:center; gap:6px;">
            <span>${s==='Измерване и монтаж'?'🔧':(s==='Бобиньорки'?'🧵':'⚙️')}</span> ${s}
        </button>
    `).join('');

    area.innerHTML = `
        <!-- Sector Selector Pills -->
        <div style="display:flex; gap:10px; flex-wrap:wrap; margin-bottom:20px;">
            ${sectorButtonsHtml}
        </div>

        <div style="display:grid; grid-template-columns: 1fr 340px; gap:20px;">
            <!-- Left Column: Questions List -->
            <div>
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
                    <h3 style="margin:0; font-size:1.15em; font-weight:900; color:#1e293b;">
                        📋 Въпроси за одит в звено "${current3sSector}" (${sectorQuestions.length})
                    </h3>
                    <button type="button" class="btn-primary" onclick="openAdd3sQuestionModal()" style="font-size:0.85em; padding:7px 14px;">
                        ➕ Добави Въпрос
                    </button>
                </div>

                <div id="questionsListArea" style="display:flex; flex-direction:column; gap:12px;">
                    ${sectorQuestions.length === 0 ? `
                        <div style="padding:30px; text-align:center; color:#94a3b8; background:#f8fafc; border:1px dashed #cbd5e1; border-radius:10px;">
                            Няма въведени въпроси за звено "${current3sSector}". Натиснете бутона "➕ Добави Въпрос", за да въведете формуляра.
                        </div>
                    ` : sectorQuestions.map((q, idx) => {
                        let criteria = Array.isArray(q.criteria) ? q.criteria : [];
                        return `
                            <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:16px;">
                                <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px; margin-bottom:8px;">
                                    <div>
                                        <span style="font-size:0.75em; font-weight:800; background:#e0e7ff; color:#4338ca; padding:2px 8px; border-radius:4px; text-transform:uppercase;">${escapeHtml(q.category)}</span>
                                        <h4 style="margin:4px 0 0 0; font-size:1.05em; font-weight:800; color:#1e293b;">
                                            ${q.question_code ? q.question_code + ' ' : ''}${escapeHtml(q.question_title)}
                                        </h4>
                                    </div>
                                    <div style="display:flex; gap:6px;">
                                        <button type="button" class="btn-secondary" onclick="openEdit3sQuestionModal(${q.id})" style="padding:4px 10px; font-size:0.8em;">✏️ Редакция</button>
                                        <button type="button" class="btn-danger" onclick="delete3sQuestion(${q.id})" style="padding:4px 10px; font-size:0.8em; background:#fee2e2; border-color:#fecaca; color:#dc2626;">🗑️</button>
                                    </div>
                                </div>
                                ${q.question_desc ? `<div style="font-size:0.86em; color:#64748b; margin-bottom:10px; line-height:1.4;">${escapeHtml(q.question_desc)}</div>` : ''}

                                <!-- Rubric preview -->
                                <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:8px; padding:8px 12px; font-size:0.82em; display:flex; flex-direction:column; gap:4px;">
                                    ${criteria.map(c => `
                                        <div style="display:flex; gap:6px;">
                                            <strong style="color:${c.points===4?'#10b981':(c.points===0?'#ef4444':'#64748b')}; width:40px; flex-shrink:0;">${c.points} т.:</strong>
                                            <span style="color:#334155;">${escapeHtml(c.text)}</span>
                                        </div>
                                    `).join('')}
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>

            <!-- Right Column: Auditor Assignment & Common Areas -->
            <div style="display:flex; flex-direction:column; gap:18px;">
                <!-- Auditor Box -->
                <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:16px;">
                    <h4 style="margin:0 0 10px 0; font-size:1em; font-weight:900; color:#1e293b; display:flex; align-items:center; gap:6px;">
                        <span>👤</span> Проверяващ за звеното
                    </h4>
                    <div style="font-size:0.85em; color:#64748b; margin-bottom:10px;">
                        Лицето, което извършва 3S одитите за "${current3sSector}".
                    </div>
                    <div style="display:flex; gap:8px;">
                        <input type="text" id="sectorAuditorInput" value="${escapeHtml(auditorName)}" placeholder="Въведете Име на проверяващия..." style="flex:1; padding:8px 12px; border:1px solid #cbd5e1; border-radius:8px; font-size:0.92em;">
                        <button type="button" class="btn-primary" onclick="saveSectorAuditor()" style="padding:8px 14px; font-size:0.88em;">💾 Запази</button>
                    </div>
                </div>

                <!-- Common Areas Box -->
                <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:16px;">
                    <h4 style="margin:0 0 10px 0; font-size:1em; font-weight:900; color:#1e293b; display:flex; align-items:center; gap:6px;">
                        <span>🏢</span> Общи части &amp; Зони
                    </h4>
                    <div style="font-size:0.85em; color:#64748b; margin-bottom:10px;">
                        Зони, които проверяващият оценява (освен индивидуалните работници).
                    </div>

                    <!-- Add new area -->
                    <div style="display:flex; gap:6px; margin-bottom:12px;">
                        <input type="text" id="newAreaNameInput" placeholder="напр. Стенд изпитване..." style="flex:1; padding:7px 10px; border:1px solid #cbd5e1; border-radius:6px; font-size:0.88em;">
                        <button type="button" class="btn-primary" onclick="addSectorArea()" style="padding:7px 12px; font-size:0.85em;">➕</button>
                    </div>

                    <!-- Areas list -->
                    <div style="display:flex; flex-direction:column; gap:6px; max-height:260px; overflow-y:auto;">
                        ${sectorAreas.length === 0 ? `
                            <div style="font-size:0.85em; color:#94a3b8; text-align:center; padding:12px;">Няма въведени общи части за това звено.</div>
                        ` : sectorAreas.map(a => `
                            <div style="display:flex; justify-content:space-between; align-items:center; background:#ffffff; border:1px solid #e2e8f0; padding:7px 10px; border-radius:6px; font-size:0.9em;">
                                <span style="font-weight:700; color:#334155;">🏢 ${escapeHtml(a.area_name)}</span>
                                <button type="button" onclick="deleteSectorArea(${a.id})" style="background:transparent; border:none; color:#ef4444; cursor:pointer; font-size:1.1em; line-height:1;" title="Изтрий">&times;</button>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        </div>
    `;
}

// Auditor Save
async function saveSectorAuditor() {
    const input = document.getElementById('sectorAuditorInput');
    const name = (input.value || '').trim();
    if (!name) {
        Swal.fire('Внимание', 'Моля, въведете име на проверяващия.', 'warning');
        return;
    }

    try {
        let existing = audit3sAuditorsCache.find(a => a.sector === current3sSector);
        if (existing) {
            const { error } = await client
                .from('audit_3s_auditors')
                .update({ auditor_name: name })
                .eq('id', existing.id);
            if (error) throw error;
            existing.auditor_name = name;
        } else {
            const { data, error } = await client
                .from('audit_3s_auditors')
                .insert([{ auditor_name: name, sector: current3sSector, is_active: true }])
                .select();
            if (error) throw error;
            if (data && data[0]) audit3sAuditorsCache.push(data[0]);
        }
        Swal.fire({ icon: 'success', title: 'Запазено!', timer: 1200, showConfirmButton: false });
    } catch (err) {
        Swal.fire('Грешка', err.message, 'error');
    }
}

// Area Add / Delete
async function addSectorArea() {
    const input = document.getElementById('newAreaNameInput');
    const name = (input.value || '').trim();
    if (!name) return;

    try {
        const { data, error } = await client
            .from('audit_3s_areas')
            .insert([{ sector: current3sSector, area_name: name, is_active: true }])
            .select();

        if (error) throw error;
        if (data && data[0]) audit3sAreasCache.push(data[0]);
        input.value = '';
        render3sSettingsSubTab();
    } catch (err) {
        Swal.fire('Грешка', err.message, 'error');
    }
}

async function deleteSectorArea(areaId) {
    try {
        const { error } = await client
            .from('audit_3s_areas')
            .delete()
            .eq('id', areaId);

        if (error) throw error;
        audit3sAreasCache = audit3sAreasCache.filter(a => a.id !== areaId);
        render3sSettingsSubTab();
    } catch (err) {
        Swal.fire('Грешка', err.message, 'error');
    }
}

// Question Modal Logic
function openAdd3sQuestionModal() {
    editingQuestionId = null;
    document.getElementById('modal3sTitle').innerText = `➕ Нов въпрос за "${current3sSector}"`;
    document.getElementById('m3sCategory').value = '1. Sort (Сортиране)';
    document.getElementById('m3sCode').value = '';
    document.getElementById('m3sTitleInput').value = '';
    document.getElementById('m3sDesc').value = '';
    document.getElementById('m3sPt0').value = '0 т.: Не е изпълнено / безпорядък';
    document.getElementById('m3sPt1').value = '1 т.: Има сериозни забележки';
    document.getElementById('m3sPt2').value = '2 т.: Частично изпълнено със забележки';
    document.getElementById('m3sPt3').value = '3 т.: Добро изпълнение';
    document.getElementById('m3sPt4').value = '4 т. (Макс): Отлично стандартизирано състояние';

    document.getElementById('modal3sQuestionBackdrop').style.display = 'flex';
}

function openEdit3sQuestionModal(questionId) {
    let q = audit3sTemplatesCache.find(item => item.id === questionId);
    if (!q) return;

    editingQuestionId = questionId;
    document.getElementById('modal3sTitle').innerText = `✏️ Редакция на въпрос за "${q.sector}"`;
    document.getElementById('m3sCategory').value = q.category || '1. Sort (Сортиране)';
    document.getElementById('m3sCode').value = q.question_code || '';
    document.getElementById('m3sTitleInput').value = q.question_title || '';
    document.getElementById('m3sDesc').value = q.question_desc || '';

    let crit = Array.isArray(q.criteria) ? q.criteria : [];
    let getPt = (p) => {
        let f = crit.find(c => c.points === p);
        return f ? f.text : '';
    };

    document.getElementById('m3sPt0').value = getPt(0);
    document.getElementById('m3sPt1').value = getPt(1);
    document.getElementById('m3sPt2').value = getPt(2);
    document.getElementById('m3sPt3').value = getPt(3);
    document.getElementById('m3sPt4').value = getPt(4);

    document.getElementById('modal3sQuestionBackdrop').style.display = 'flex';
}

function close3sQuestionModal() {
    document.getElementById('modal3sQuestionBackdrop').style.display = 'none';
}

async function save3sQuestion() {
    let title = document.getElementById('m3sTitleInput').value.trim();
    if (!title) {
        Swal.fire('Внимание', 'Моля, въведете заглавие на въпроса.', 'warning');
        return;
    }

    let category = document.getElementById('m3sCategory').value;
    let code = document.getElementById('m3sCode').value.trim();
    let desc = document.getElementById('m3sDesc').value.trim();

    let criteria = [
        { points: 0, text: document.getElementById('m3sPt0').value.trim() || '0 т.: Не е изпълнено' },
        { points: 1, text: document.getElementById('m3sPt1').value.trim() || '1 т.: Слабо изпълнение' },
        { points: 2, text: document.getElementById('m3sPt2').value.trim() || '2 т.: Частично изпълнение' },
        { points: 3, text: document.getElementById('m3sPt3').value.trim() || '3 т.: Добро изпълнение' },
        { points: 4, text: document.getElementById('m3sPt4').value.trim() || '4 т. (Макс): Отлично състояние' }
    ];

    let payload = {
        sector: current3sSector,
        category,
        question_code: code,
        question_title: title,
        question_desc: desc,
        criteria,
        is_active: true
    };

    try {
        if (editingQuestionId) {
            const { error } = await client
                .from('audit_3s_templates')
                .update(payload)
                .eq('id', editingQuestionId);
            if (error) throw error;
        } else {
            const { error } = await client
                .from('audit_3s_templates')
                .insert([payload]);
            if (error) throw error;
        }

        close3sQuestionModal();
        await loadAll3sData();
        render3sSettingsSubTab();
        Swal.fire({ icon: 'success', title: 'Запазено!', timer: 1200, showConfirmButton: false });
    } catch (err) {
        Swal.fire('Грешка при запис', err.message, 'error');
    }
}

async function delete3sQuestion(questionId) {
    const res = await Swal.fire({
        title: 'Изтриване на този въпрос?',
        text: 'Въпросът няма да се появява повече в бъдещите одити.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        confirmButtonText: 'Да, изтрий',
        cancelButtonText: 'Отказ'
    });

    if (res.isConfirmed) {
        try {
            const { error } = await client
                .from('audit_3s_templates')
                .delete()
                .eq('id', questionId);

            if (error) throw error;
            audit3sTemplatesCache = audit3sTemplatesCache.filter(q => q.id !== questionId);
            render3sSettingsSubTab();
            Swal.fire({ icon: 'success', title: 'Изтрит!', timer: 1200, showConfirmButton: false });
        } catch (err) {
            Swal.fire('Грешка', err.message, 'error');
        }
    }
}

// Sub Tab 2: Logs & History
let logsSectorFilter = 'all';

function render3sLogsSubTab() {
    const area = document.getElementById('subTab3sContent');
    if (!area) return;

    let filtered = audit3sLogsCache;
    if (logsSectorFilter !== 'all') {
        filtered = filtered.filter(l => l.sector === logsSectorFilter);
    }

    area.innerHTML = `
        <!-- Filter Bar -->
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom:16px;">
            <div style="display:flex; gap:8px; align-items:center;">
                <label style="font-size:0.85em; font-weight:800; color:#475569;">Филтър Звено:</label>
                <select id="logsSectorSelect" onchange="logsSectorFilter = this.value; render3sLogsSubTab();" style="padding:6px 12px; border:1px solid #cbd5e1; border-radius:6px; font-size:0.9em;">
                    <option value="all" ${logsSectorFilter==='all'?'selected':''}>Всички звена</option>
                    <option value="Измерване и монтаж" ${logsSectorFilter==='Измерване и монтаж'?'selected':''}>Измерване и монтаж</option>
                    <option value="Бобиньорки" ${logsSectorFilter==='Бобиньорки'?'selected':''}>Бобиньорки</option>
                    <option value="Машини" ${logsSectorFilter==='Машини'?'selected':''}>Машини</option>
                </select>
            </div>
            <div>
                <button type="button" class="btn-primary btn-excel" onclick="export3sLogsToExcel()" style="padding:7px 14px; font-size:0.85em;">
                    📥 Свали в Excel
                </button>
            </div>
        </div>

        <!-- Logs Table -->
        <div style="overflow-x:auto; border:1px solid #e2e8f0; border-radius:10px;">
            <table class="modal-table" style="width:100%; border-collapse:collapse; font-size:0.9em;">
                <thead>
                    <tr style="background:#f8fafc; border-bottom:2px solid #e2e8f0;">
                        <th style="padding:10px 12px; text-align:left;">Дата</th>
                        <th style="padding:10px 12px; text-align:left;">Звено</th>
                        <th style="padding:10px 12px; text-align:left;">Проверяващ</th>
                        <th style="padding:10px 12px; text-align:left;">Обект</th>
                        <th style="padding:10px 12px; text-align:center;">Точки</th>
                        <th style="padding:10px 12px; text-align:center;">Успеваемост</th>
                        <th style="padding:10px 12px; text-align:left;">Забележка</th>
                        <th style="padding:10px 12px; text-align:center;">Снимка</th>
                        <th style="padding:10px 12px; text-align:center;">Детайли</th>
                    </tr>
                </thead>
                <tbody>
                    ${filtered.length === 0 ? `
                        <tr>
                            <td colspan="9" style="text-align:center; padding:30px; color:#94a3b8;">
                                Все още няма записани одити. Когато проверяващите запишат одит през телефона, той ще се появи тук.
                            </td>
                        </tr>
                    ` : filtered.map(log => {
                        let pct = log.percentage || 0;
                        let badgeBg = pct >= 85 ? '#dcfce7' : (pct >= 65 ? '#fef3c7' : '#fee2e2');
                        let badgeColor = pct >= 85 ? '#15803d' : (pct >= 65 ? '#b45309' : '#dc2626');
                        let isWorker = log.target_type === 'worker';
                        let dateStr = log.audit_date || (log.created_at ? log.created_at.split('T')[0] : '--');

                        return `
                            <tr style="border-bottom:1px solid #f1f5f9;">
                                <td style="padding:10px 12px; font-weight:700; color:#334155; white-space:nowrap;">${dateStr}</td>
                                <td style="padding:10px 12px; font-weight:600; color:#475569;">${escapeHtml(log.sector)}</td>
                                <td style="padding:10px 12px; color:#64748b;">${escapeHtml(log.auditor_name)}</td>
                                <td style="padding:10px 12px; font-weight:800; color:#1e293b;">
                                    ${isWorker ? '👤 ' : '🏢 '} ${escapeHtml(log.target_name)}
                                </td>
                                <td style="padding:10px 12px; text-align:center; font-weight:800; color:#334155;">
                                    ${log.total_points} / ${log.max_points}
                                </td>
                                <td style="padding:10px 12px; text-align:center;">
                                    <span style="background:${badgeBg}; color:${badgeColor}; font-weight:900; padding:3px 8px; border-radius:6px; font-size:0.9em;">
                                        ${pct}%
                                    </span>
                                </td>
                                <td style="padding:10px 12px; color:#64748b; font-size:0.88em; max-width:240px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${escapeHtml(log.notes || '')}">
                                    ${escapeHtml(log.notes || '--')}
                                </td>
                                <td style="padding:10px 12px; text-align:center;">
                                    ${log.photo_url ? `
                                        <button type="button" onclick="preview3sPhoto('${escapeHtml(log.photo_url)}')" style="background:transparent; border:none; cursor:pointer; font-size:1.3em;" title="Виж снимката">
                                            📷
                                        </button>
                                    ` : '<span style="color:#cbd5e1;">--</span>'}
                                </td>
                                <td style="padding:10px 12px; text-align:center;">
                                    <button type="button" class="btn-secondary" onclick="view3sLogDetails('${log.id}')" style="padding:3px 8px; font-size:0.8em;">
                                        🔍 Преглед
                                    </button>
                                </td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        </div>
    `;
}

function preview3sPhoto(url) {
    Swal.fire({
        imageUrl: url,
        imageAlt: 'Снимка от 3S одит',
        width: 600,
        showCloseButton: true,
        confirmButtonText: 'Затвори'
    });
}

function view3sLogDetails(logId) {
    let log = audit3sLogsCache.find(l => String(l.id) === String(logId));
    if (!log) return;

    let answers = log.answers || {};
    let answersHtml = Object.keys(answers).map(qId => {
        let ans = answers[qId];
        return `
            <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:10px; margin-bottom:8px; text-align:left;">
                <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                    <span style="font-weight:700; color:#1e293b;">Въпрос #${qId}</span>
                    <strong style="color:${ans.points===4?'#10b981':'#f59e0b'};">${ans.points} / 4 т.</strong>
                </div>
                <div style="font-size:0.88em; color:#475569;">${escapeHtml(ans.text)}</div>
            </div>
        `;
    }).join('');

    Swal.fire({
        title: `Одит: ${escapeHtml(log.target_name)}`,
        html: `
            <div style="font-size:0.95em; color:#475569; margin-bottom:14px; text-align:left;">
                📅 <strong>Дата:</strong> ${log.audit_date || '--'}<br>
                👤 <strong>Проверяващ:</strong> ${escapeHtml(log.auditor_name)} (${escapeHtml(log.sector)})<br>
                ⭐ <strong>Резултат:</strong> ${log.total_points} / ${log.max_points} т. (${log.percentage}%)<br>
                ${log.notes ? `📝 <strong>Забележка:</strong> <em>"${escapeHtml(log.notes)}"</em><br>` : ''}
            </div>
            <div style="max-height:300px; overflow-y:auto; border-top:1px solid #e2e8f0; padding-top:10px;">
                ${answersHtml || '<p style="color:#94a3b8;">Няма детайлни отговори.</p>'}
            </div>
            ${log.photo_url ? `<div style="margin-top:10px;"><a href="${escapeHtml(log.photo_url)}" target="_blank" style="color:#4338ca; font-weight:800; font-size:0.9em;">📷 Отвори прикачената снимка в пълен размер ➔</a></div>` : ''}
        `,
        width: 650,
        confirmButtonText: 'Затвори'
    });
}

function export3sLogsToExcel() {
    if (typeof XLSX === 'undefined') {
        Swal.fire('Грешка', 'Excel библиотеката не е заредена.', 'error');
        return;
    }

    let data = audit3sLogsCache.map(l => ({
        'Дата': l.audit_date || '',
        'Звено': l.sector || '',
        'Проверяващ': l.auditor_name || '',
        'Тип обект': l.target_type === 'worker' ? 'Служител' : 'Обща част',
        'Обект': l.target_name || '',
        'Получени точки': l.total_points || 0,
        'Максимални точки': l.max_points || 0,
        'Успеваемост (%)': l.percentage || 0,
        'Забележка': l.notes || '',
        'Линк към снимка': l.photo_url || ''
    }));

    let ws = XLSX.utils.json_to_sheet(data);
    let wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "3S_Одити");
    XLSX.writeFile(wb, `3S_Oditi_${new Date().toISOString().split('T')[0]}.xlsx`);
}

function on3sSearchFromGlobal(query) {
    if (current3sSubTab === 'logs') {
        const q = query.toLowerCase().trim();
        if (!q) {
            render3sLogsSubTab();
            return;
        }
        let filtered = audit3sLogsCache.filter(l => 
            (l.target_name && l.target_name.toLowerCase().includes(q)) ||
            (l.auditor_name && l.auditor_name.toLowerCase().includes(q)) ||
            (l.sector && l.sector.toLowerCase().includes(q)) ||
            (l.notes && l.notes.toLowerCase().includes(q))
        );
        // Temporary update cache for display
        let orig = audit3sLogsCache;
        audit3sLogsCache = filtered;
        render3sLogsSubTab();
        audit3sLogsCache = orig;
    }
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
