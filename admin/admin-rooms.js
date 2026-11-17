// admin/admin-rooms.js - Модул за Опис по стаи & Инвентаризация на оборудването (AMCI)

let globalRoomsCache = [];
let globalMachinesCache = [];
let globalToolsCache = [];
let activeFloorFilter = 'all'; // 'all', 'Етаж 1', 'Етаж 2', 'Етаж 3'
let roomSearchQuery = '';

// Каталог със съкращения за автоматично кодиране на уреди
const TOOL_TYPE_CATALOG = [
    // 📏 Измервателни уреди
    { code: 'Ш', name: 'Шублер (дигитален / механичен)', category: 'Измервателен уред', calib: true },
    { code: 'МИК', name: 'Микрометър гладък', category: 'Измервателен уред', calib: true },
    { code: 'ЧАС', name: 'Индикаторен часовник', category: 'Измервателен уред', calib: true },
    { code: 'ВЪТР', name: 'Комплект вътромер', category: 'Измервателен уред', calib: true },
    { code: 'ВОЛТ', name: 'Волтметър', category: 'Измервателен уред', calib: true },
    { code: 'RCL', name: 'RCL метър (R, C, L)', category: 'Измервателен уред', calib: true },
    { code: 'ОСЦ', name: 'Осцилоскоп', category: 'Измервателен уред', calib: true },
    { code: 'МЕГ', name: 'Мегаомметър (Мегер)', category: 'Измервателен уред', calib: true },
    { code: 'ТРЕЗ', name: 'Тестер за измерване на резолвери', category: 'Измервателен уред', calib: true },
    { code: 'ГЕН', name: 'Генератор (сигнален)', category: 'Измервателен уред', calib: true },
    { code: 'УСИЛ', name: 'Усилвател за генератор', category: 'Измервателен уред', calib: true },

    // 🏭 Машини / Работни места
    { code: 'БОБ', name: 'Бобинажна машина', category: 'Машина / Работно място', calib: false },
    { code: 'БРЕД', name: 'Бобинажна + редачна машина', category: 'Машина / Работно място', calib: false },
    { code: 'РБОБ', name: 'Ръчна бобинажна машина', category: 'Машина / Работно място', calib: false },
    { code: 'ЗАЧ', name: 'Машина за зачистване', category: 'Машина / Работно място', calib: false },
    { code: 'ПУД', name: 'Машина за пудрене', category: 'Машина / Работно място', calib: false },
    { code: 'ПБОЯ', name: 'Машина за прахово боядисване', category: 'Машина / Работно място', calib: false },
    { code: 'ПРЕС', name: 'Преса (хидравлична/механична)', category: 'Машина / Работно място', calib: false },
    { code: 'ТПРЕС', name: 'Термопреса', category: 'Машина / Работно място', calib: true },
    { code: 'ГИЛ', name: 'Гилотина', category: 'Машина / Работно място', calib: false },
    { code: 'ШМИР', name: 'Шмиргел', category: 'Машина / Работно място', calib: false },
    { code: 'АСП-ХОН', name: 'Аспирация за хонинг', category: 'Машина / Работно място', calib: false },
    { code: 'СТР', name: 'Струг', category: 'Машина / Работно място', calib: false },
    { code: 'ФРЕЗ', name: 'Фреза / Обработващ център', category: 'Машина / Работно място', calib: false },
    { code: 'ШЛАЙФ', name: 'Шлайф (плосък/кръгъл)', category: 'Машина / Работно място', calib: false },
    { code: 'МОНТ', name: 'Монтажна маса / Пост', category: 'Машина / Работно място', calib: false },
    { code: 'ОПАК', name: 'Пост Опаковане', category: 'Машина / Работно място', calib: false },
    { code: 'БТК', name: 'Контролен пост БТК', category: 'Машина / Работно място', calib: false },

    // 🧪 Термично / Камерно
    { code: 'ПЕЩ', name: 'Пещ (сушилна/термична)', category: 'Термично / Камерно', calib: true },
    { code: 'ПЕЩ-ЗАК', name: 'Пещ за закаляване', category: 'Термично / Камерно', calib: true },
    { code: 'КАМ-ЛАМ', name: 'Камера за пръскане на ламели', category: 'Термично / Камерно', calib: false },
    { code: 'КАМ-БОЯ', name: 'Камера за прахово боядисване', category: 'Термично / Камерно', calib: false },
    { code: 'УЗВ', name: 'Ултразвукова вана (ултразвук)', category: 'Термично / Камерно', calib: false },

    // 🔧 Електроинструменти
    { code: 'ОТВ', name: 'Автоматична отвертка', category: 'Електроинструмент', calib: true },
    { code: 'ПОЯЛ', name: 'Поялна станция / Поялник', category: 'Електроинструмент', calib: false },
    { code: 'ДРЕМ', name: 'Дремел (мултишлайф)', category: 'Електроинструмент', calib: false },

    // ⚙️ Оснастка & Приспособления
    { code: 'ПРИС', name: 'Специална оснастка / Дорник', category: 'Оснастка & Приспособления', calib: true },
    { code: 'МАТ', name: 'Матрица / Щанца', category: 'Оснастка & Приспособления', calib: true },
    { code: 'ШАБ', name: 'Шаблон (запояване/монтаж)', category: 'Оснастка & Приспособления', calib: false }
];

// Инициализиране и рендериране на таб „Опис по стаи / Инвентаризация“
window.renderRoomsTab = async function(forceRefresh = false) {
    const mainTable = document.getElementById('mainTable');
    const addNewBtn = document.getElementById('addNewBtn');
    if (mainTable) mainTable.style.display = 'none';
    if (addNewBtn) addNewBtn.style.display = 'none';

    let container = document.getElementById('roomsInventoryContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'roomsInventoryContainer';
        container.style.cssText = 'padding: 16px; width: 100%; box-sizing: border-box;';
        const wrapper = document.querySelector('.table-container');
        if (wrapper) wrapper.appendChild(container);
    }
    container.style.display = 'block';

    if (forceRefresh || globalRoomsCache.length === 0) {
        container.innerHTML = `
            <div style="padding: 40px; text-align: center; color: #64748b; font-size: 1.15em;">
                <div style="font-size: 2.2em; margin-bottom: 8px;">🏢</div>
                Зареждане на данни за стаите и оборудването...
            </div>`;
        await loadRoomsData();
    }

    renderRoomsLayout();
};

// Зареждане на данни от Supabase
async function loadRoomsData() {
    try {
        const [roomsRes, machinesRes, toolsRes] = await Promise.all([
            client.from('factory_rooms').select('*').order('room_number', { ascending: true }),
            client.from('factory_machines').select('*').order('name', { ascending: true }),
            client.from('factory_tools').select('*').order('tool_code', { ascending: true })
        ]);

        if (roomsRes.error && roomsRes.error.message.includes('relation "public.factory_rooms" does not exist')) {
            showSqlMissingNotice();
            globalRoomsCache = JSON.parse(localStorage.getItem('temp_factory_rooms') || '[]');
        } else {
            globalRoomsCache = roomsRes.data || [];
        }

        globalMachinesCache = machinesRes.data || [];
        globalToolsCache = toolsRes.data || [];

    } catch (err) {
        console.warn("Rooms load error:", err);
        globalRoomsCache = JSON.parse(localStorage.getItem('temp_factory_rooms') || '[]');
    }
}

// Показване на предупреждение при липсваща таблица в базата
function showSqlMissingNotice() {
    const alertBanner = document.getElementById('adminGlobalAlertBanner');
    if (alertBanner) {
        alertBanner.style.display = 'block';
        alertBanner.innerHTML = `
            <div style="background:#fef2f2; border:1.5px solid #f87171; border-radius:10px; padding:12px 16px; color:#991b1b; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
                <div>
                    <b>⚠️ Таблицата "factory_rooms" все още не е създадена в Supabase!</b><br>
                    <span style="font-size:0.88em; color:#7f1d1d;">Моля изпълнете файла <code>setup_factory_rooms.sql</code> в SQL Editor на Supabase за постоянна синхронизация.</span>
                </div>
                <button type="button" onclick="copyRoomsSqlToClipboard()" style="background:#b91c1c; color:white; border:none; padding:8px 14px; border-radius:6px; font-weight:bold; cursor:pointer;">
                    📋 Копирай SQL кода
                </button>
            </div>`;
    }
}

window.copyRoomsSqlToClipboard = function() {
    const sqlText = `-- Изпълнете това в Supabase SQL Editor:
CREATE TABLE IF NOT EXISTS public.factory_rooms (
    id SERIAL PRIMARY KEY,
    room_number TEXT NOT NULL UNIQUE,
    room_name TEXT NOT NULL,
    floor TEXT NOT NULL DEFAULT 'Етаж 1',
    supervisor TEXT,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE public.factory_machines ADD COLUMN IF NOT EXISTS room_number TEXT;
ALTER TABLE public.factory_machines ADD COLUMN IF NOT EXISTS room_name TEXT;
ALTER TABLE public.factory_tools ADD COLUMN IF NOT EXISTS room_number TEXT;
ALTER TABLE public.factory_tools ADD COLUMN IF NOT EXISTS room_name TEXT;
ALTER TABLE public.factory_tools ADD COLUMN IF NOT EXISTS location_detail TEXT;
ALTER TABLE public.factory_rooms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on factory_rooms" ON public.factory_rooms FOR ALL USING (true) WITH CHECK (true);
GRANT ALL ON public.factory_rooms TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;`;

    navigator.clipboard.writeText(sqlText).then(() => {
        Swal.fire('Копирано!', 'SQL кодът е копиран в клипборда. Поставете го в Supabase SQL Editor.', 'success');
    });
};

// Главен изглед на таба
function renderRoomsLayout() {
    const container = document.getElementById('roomsInventoryContainer');
    if (!container) return;

    // Преброяване на статистики
    let totalRooms = globalRoomsCache.length;
    let totalMachinesAssigned = globalMachinesCache.filter(m => m.room_number).length;
    let totalMachinesUnassigned = globalMachinesCache.length - totalMachinesAssigned;
    let totalTools = globalToolsCache.length;

    // Филтриране на стаите по етаж и търсене
    let filteredRooms = globalRoomsCache.filter(r => {
        if (activeFloorFilter !== 'all') {
            let floorNum = activeFloorFilter.replace(/\D/g, '');
            if (!String(r.room_number).startsWith(floorNum) && r.floor !== activeFloorFilter) return false;
        }
        if (roomSearchQuery) {
            let q = roomSearchQuery.toLowerCase();
            let matchRoom = String(r.room_number).toLowerCase().includes(q) || String(r.room_name || '').toLowerCase().includes(q) || String(r.supervisor || '').toLowerCase().includes(q);
            if (matchRoom) return true;
            // Проверка дали съдържа търсена машина или инструмент
            let hasMachine = globalMachinesCache.some(m => String(m.room_number) === String(r.room_number) && m.name.toLowerCase().includes(q));
            let hasTool = globalToolsCache.some(t => String(t.room_number) === String(r.room_number) && (t.tool_name.toLowerCase().includes(q) || t.tool_code.toLowerCase().includes(q)));
            return hasMachine || hasTool;
        }
        return true;
    });

    let roomsHtml = '';
    if (filteredRooms.length === 0) {
        roomsHtml = `
            <div style="background: white; border: 2px dashed #cbd5e1; border-radius: 16px; padding: 50px 20px; text-align: center; color: #64748b; margin-top: 20px;">
                <div style="font-size: 3em; margin-bottom: 10px;">🚪</div>
                <h3 style="margin-top: 0; color: #1e293b; font-size: 1.3em;">Все още няма въведени стаи ${activeFloorFilter !== 'all' ? 'за ' + activeFloorFilter : ''}</h3>
                <p style="margin-bottom: 20px; font-size: 0.95em;">
                    Натиснете бутона <b>„➕ Нова Стая“</b> по-горе, за да добавите първото помещение (напр. Стая 11, Стая 21...) и да зачислите машини към него.
                </p>
                <button type="button" class="btn" onclick="openCreateRoomModal()" style="background:#2563eb; color:white; padding:12px 22px; font-weight:800; border-radius:10px; border:none; cursor:pointer;">
                    ➕ Добави първата стая
                </button>
            </div>`;
    } else {
        roomsHtml = `<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(460px, 1fr)); gap: 18px; margin-top: 18px;">`;
        filteredRooms.forEach(room => {
            roomsHtml += buildRoomCardHtml(room);
        });
        roomsHtml += `</div>`;
    }

    container.innerHTML = `
        <!-- Горна командна лента -->
        <div style="background: white; border-radius: 14px; padding: 16px 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); border: 1px solid #e2e8f0; margin-bottom: 16px;">
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
                <div>
                    <h2 style="margin: 0; font-size: 1.35em; color: #0f172a; display: flex; align-items: center; gap: 8px;">
                        <span>🏢</span> Опис по стаи & Инвентаризация
                    </h2>
                    <div style="font-size: 0.88em; color: #64748b; margin-top: 4px; display: flex; gap: 12px; flex-wrap: wrap;">
                        <span>Стаи: <b>${totalRooms}</b></span> &bull;
                        <span>Зачислени машини: <b style="color:#16a34a;">${totalMachinesAssigned}</b></span> &bull;
                        ${totalMachinesUnassigned > 0 ? `<span>Незачислени машини: <b style="color:#ea580c;">${totalMachinesUnassigned}</b></span> &bull;` : ''}
                        <span>Инструменти & уреди: <b style="color:#0284c7;">${totalTools}</b></span>
                    </div>
                </div>

                <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                    <button type="button" class="btn" onclick="openCreateRoomModal()" style="background: #2563eb; color: white; padding: 10px 18px; font-weight: 800; border-radius: 8px; border: none; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; box-shadow: 0 2px 4px rgba(37,99,235,0.25);">
                        ➕ Нова Стая
                    </button>
                    <button type="button" class="btn" onclick="openUnassignedMachinesModal()" style="background: #f8fafc; color: #334155; border: 1.5px solid #cbd5e1; padding: 10px 14px; font-weight: 800; border-radius: 8px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px;">
                        🏭 Незачислени машини (${totalMachinesUnassigned})
                    </button>
                    <button type="button" class="btn" onclick="renderRoomsTab(true)" style="background: #f1f5f9; color: #475569; border: 1px solid #cbd5e1; padding: 10px 14px; font-weight: 800; border-radius: 8px; cursor: pointer;">
                        🔄 Опресни
                    </button>
                </div>
            </div>

            <!-- Филтри по етаж и бързо търсене -->
            <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 16px; padding-top: 14px; border-top: 1px solid #f1f5f9; flex-wrap: wrap; gap: 10px;">
                <div style="display: flex; gap: 6px;">
                    <button type="button" onclick="setFloorFilter('all')" style="padding: 6px 14px; border-radius: 20px; font-weight: 800; font-size: 0.85em; cursor: pointer; border: none; ${activeFloorFilter === 'all' ? 'background: #0f172a; color: white;' : 'background: #e2e8f0; color: #475569;'}">
                        Всички етажи (${totalRooms})
                    </button>
                    <button type="button" onclick="setFloorFilter('Етаж 1')" style="padding: 6px 14px; border-radius: 20px; font-weight: 800; font-size: 0.85em; cursor: pointer; border: none; ${activeFloorFilter === 'Етаж 1' ? 'background: #1d4ed8; color: white;' : 'background: #dbeafe; color: #1e40af;'}">
                        Етаж 1 (11, 12...)
                    </button>
                    <button type="button" onclick="setFloorFilter('Етаж 2')" style="padding: 6px 14px; border-radius: 20px; font-weight: 800; font-size: 0.85em; cursor: pointer; border: none; ${activeFloorFilter === 'Етаж 2' ? 'background: #059669; color: white;' : 'background: #d1fae5; color: #065f46;'}">
                        Етаж 2 (21, 22...)
                    </button>
                    <button type="button" onclick="setFloorFilter('Етаж 3')" style="padding: 6px 14px; border-radius: 20px; font-weight: 800; font-size: 0.85em; cursor: pointer; border: none; ${activeFloorFilter === 'Етаж 3' ? 'background: #7c3aed; color: white;' : 'background: #ede9fe; color: #5b21b6;'}">
                        Етаж 3 (31, 32...)
                    </button>
                </div>

                <div style="flex: 1; max-width: 320px; min-width: 200px;">
                    <input type="text" value="${escapeHtml(roomSearchQuery)}" oninput="onRoomSearchInput(this.value)" placeholder="🔍 Търси стая, машина или уред..." style="width: 100%; padding: 8px 12px; border-radius: 8px; border: 1.5px solid #cbd5e1; font-size: 0.9em; box-sizing: border-box;">
                </div>
            </div>
        </div>

        ${roomsHtml}
    `;
}

// Построяване на карта за отделна стая
function buildRoomCardHtml(room) {
    let rNum = String(room.room_number || '').trim();
    let floor = room.floor || (rNum.startsWith('1') ? 'Етаж 1' : (rNum.startsWith('2') ? 'Етаж 2' : (rNum.startsWith('3') ? 'Етаж 3' : 'Етаж 1')));
    
    // Цветова схема според етажа
    let badgeBg = '#1d4ed8'; // Етаж 1: Син
    let borderColor = '#93c5fd';
    if (floor.includes('2') || rNum.startsWith('2')) {
        badgeBg = '#059669'; // Етаж 2: Зелен
        borderColor = '#86efac';
    } else if (floor.includes('3') || rNum.startsWith('3')) {
        badgeBg = '#7c3aed'; // Етаж 3: Лилав
        borderColor = '#c4b5fd';
    }

    // Машини в тази стая
    let machines = globalMachinesCache.filter(m => String(m.room_number).trim() === rNum);
    // Инструменти и уреди в тази стая
    let tools = globalToolsCache.filter(t => String(t.room_number).trim() === rNum);

    let machinesListHtml = '';
    if (machines.length === 0) {
        machinesListHtml = `<div style="color: #94a3b8; font-size: 0.85em; font-style: italic; padding: 6px 0;">Няма зачислени машини в тази стая.</div>`;
    } else {
        machinesListHtml = `<div style="display: flex; flex-direction: column; gap: 6px; margin-top: 6px;">`;
        machines.forEach(m => {
            machinesListHtml += `
                <div style="display: flex; justify-content: space-between; align-items: center; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 6px 10px;">
                    <div>
                        <span style="font-weight: 800; color: #1e293b; font-size: 0.95em;">🏭 ${escapeHtml(m.name)}</span>
                        ${m.code ? `<span style="background: #e2e8f0; color: #475569; padding: 1px 6px; border-radius: 4px; font-size: 0.75em; font-weight: 800; margin-left: 6px;">№ ${escapeHtml(m.code)}</span>` : ''}
                    </div>
                    <button type="button" onclick="unassignMachineFromRoom(${m.id}, '${escapeHtml(m.name)}')" title="Премахни от тази стая" style="background: transparent; border: none; color: #94a3b8; cursor: pointer; font-size: 1em; padding: 2px 6px; border-radius: 4px; transition: color 0.15s ease;" onmouseover="this.style.color='#ef4444'" onmouseout="this.style.color='#94a3b8'">
                        ✕
                    </button>
                </div>`;
        });
        machinesListHtml += `</div>`;
    }

    let toolsListHtml = '';
    if (tools.length === 0) {
        toolsListHtml = `<div style="color: #94a3b8; font-size: 0.85em; font-style: italic; padding: 6px 0;">Няма зачислени инструменти/уреди в тази стая.</div>`;
    } else {
        toolsListHtml = `<div style="display: flex; flex-direction: column; gap: 6px; margin-top: 6px;">`;
        tools.forEach(t => {
            let calibBadge = '';
            if (t.calibration_due) {
                let today = new Date(); today.setHours(0,0,0,0);
                let due = new Date(t.calibration_due); due.setHours(0,0,0,0);
                let diffDays = Math.round((due - today) / (1000 * 60 * 60 * 24));
                if (diffDays < 0) {
                    calibBadge = `<span style="background:#fee2e2; color:#b91c1c; font-size:0.7em; padding:2px 6px; border-radius:4px; font-weight:800;" title="Калибрацията е изтекла!">🔴 Изтекъл</span>`;
                } else if (diffDays <= 30) {
                    calibBadge = `<span style="background:#fef3c7; color:#b45309; font-size:0.7em; padding:2px 6px; border-radius:4px; font-weight:800;" title="Остават ${diffDays} дни">🟡 Наближава (${diffDays} д.)</span>`;
                } else {
                    calibBadge = `<span style="background:#dcfce7; color:#166534; font-size:0.7em; padding:2px 6px; border-radius:4px; font-weight:800;">🟢 Годен</span>`;
                }
            }

            toolsListHtml += `
                <div style="display: flex; justify-content: space-between; align-items: center; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 6px 10px; font-size: 0.88em;">
                    <div>
                        <span style="font-weight: 900; color: #0284c7; background: #e0f2fe; padding: 2px 6px; border-radius: 4px; font-family: monospace;">${escapeHtml(t.tool_code)}</span>
                        <span style="font-weight: 700; color: #334155; margin-left: 4px;">${escapeHtml(t.tool_name)}</span>
                        ${t.location_detail ? `<small style="color: #64748b; margin-left: 4px;">(${escapeHtml(t.location_detail)})</small>` : ''}
                    </div>
                    <div style="display: flex; align-items: center; gap: 6px;">
                        ${calibBadge}
                        <button type="button" onclick="deleteTool(${t.id}, '${escapeHtml(t.tool_code)}')" title="Изтрий от описа" style="background: transparent; border: none; color: #94a3b8; cursor: pointer; padding: 2px 4px;" onmouseover="this.style.color='#ef4444'" onmouseout="this.style.color='#94a3b8'">
                            ✕
                        </button>
                    </div>
                </div>`;
        });
        toolsListHtml += `</div>`;
    }

    return `
        <div class="card" style="border-radius: 14px; border: 1.5px solid ${borderColor}; padding: 16px; background: white; box-shadow: 0 2px 6px rgba(0,0,0,0.04); display: flex; flex-direction: column;">
            <!-- Заглавна част на стаята -->
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; border-bottom: 1px solid #f1f5f9; padding-bottom: 10px;">
                <div>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="background: ${badgeBg}; color: white; padding: 3px 10px; border-radius: 8px; font-size: 0.95em; font-weight: 900; letter-spacing: 0.5px;">
                            🚪 Стая ${escapeHtml(rNum)}
                        </span>
                        <span style="font-size: 0.8em; font-weight: 700; color: #64748b; background: #f1f5f9; padding: 3px 8px; border-radius: 6px;">
                            ${escapeHtml(floor)}
                        </span>
                    </div>
                    <h3 style="margin: 6px 0 2px 0; font-size: 1.18em; color: #0f172a; font-weight: 800;">
                        ${escapeHtml(room.room_name || 'Без наименование')}
                    </h3>
                    <div style="font-size: 0.82em; color: #64748b;">
                        👤 Отговорник: <b>${escapeHtml(room.supervisor || 'Няма посочен')}</b>
                        ${room.description ? ` &bull; <span style="font-style:italic;">${escapeHtml(room.description)}</span>` : ''}
                    </div>
                </div>

                <div style="display: flex; gap: 4px;">
                    <button type="button" onclick="printRoomPassport('${escapeHtml(rNum)}')" title="🖨️ Печат на Паспорт/Опис на стаята" style="background: #eff6ff; border: 1px solid #bfdbfe; color: #1d4ed8; padding: 6px 10px; border-radius: 6px; cursor: pointer; font-size: 0.85em; font-weight: 800;">
                        🖨️ Опис
                    </button>
                    <button type="button" onclick="openEditRoomModal(${room.id})" title="Редактирай данни на стаята" style="background: #f8fafc; border: 1px solid #cbd5e1; color: #475569; padding: 6px 10px; border-radius: 6px; cursor: pointer; font-size: 0.85em;">
                        ✏️
                    </button>
                    <button type="button" onclick="deleteRoom(${room.id}, '${escapeHtml(rNum)}')" title="Изтрий стаята" style="background: #fee2e2; border: 1px solid #fca5a5; color: #b91c1c; padding: 6px 10px; border-radius: 6px; cursor: pointer; font-size: 0.85em;">
                        🗑️
                    </button>
                </div>
            </div>

            <!-- Секция: Машини & Работни места -->
            <div style="margin-bottom: 14px;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span style="font-weight: 800; color: #334155; font-size: 0.88em; text-transform: uppercase; letter-spacing: 0.3px;">
                        🏭 Машини & Работни места (${machines.length})
                    </span>
                    <button type="button" onclick="openAssignMachineModal('${escapeHtml(rNum)}', '${escapeHtml(room.room_name)}')" style="background: #e0f2fe; color: #0369a1; border: none; padding: 3px 8px; border-radius: 6px; font-weight: 800; font-size: 0.78em; cursor: pointer;">
                        ➕ Зачисли машина
                    </button>
                </div>
                ${machinesListHtml}
            </div>

            <!-- Секция: Измервателни уреди & Инструменти -->
            <div style="margin-top: auto; border-top: 1px dashed #e2e8f0; padding-top: 10px;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span style="font-weight: 800; color: #334155; font-size: 0.88em; text-transform: uppercase; letter-spacing: 0.3px;">
                        📏 Инструменти & Уреди (${tools.length})
                    </span>
                    <button type="button" onclick="openAddToolToRoomModal('${escapeHtml(rNum)}', '${escapeHtml(room.room_name)}')" style="background: #dcfce7; color: #166534; border: none; padding: 3px 8px; border-radius: 6px; font-weight: 800; font-size: 0.78em; cursor: pointer;">
                        ➕ Добави уред
                    </button>
                </div>
                ${toolsListHtml}
            </div>
        </div>
    `;
}

// --------------------------------------------------------------------------
// Филтри и Търсене
// --------------------------------------------------------------------------
window.setFloorFilter = function(floor) {
    activeFloorFilter = floor;
    renderRoomsLayout();
};

window.onRoomSearchInput = function(val) {
    roomSearchQuery = String(val || '').trim();
    renderRoomsLayout();
};

// --------------------------------------------------------------------------
// Управление на Стаи (Създаване, Редакция, Изтриване)
// --------------------------------------------------------------------------
window.openCreateRoomModal = async function() {
    const { value: formValues } = await Swal.fire({
        title: '➕ Добавяне на нова стая',
        html: `
            <div style="text-align: left; font-size: 0.9em;">
                <label style="font-weight: 800; color: #334155; display: block; margin-bottom: 4px;">
                    Номер на стая: <span style="color: #dc2626;">*</span>
                    <small style="color: #64748b; font-weight: normal;">(първата цифра е етажът: напр. 11, 21, 22...)</small>
                </label>
                <input id="swalRoomNum" class="swal2-input" placeholder="напр. 21" style="width: 100%; margin: 0 0 12px 0; font-weight: 800; font-size: 1.1em;" oninput="autoSelectFloorFromNum(this.value)">

                <label style="font-weight: 800; color: #334155; display: block; margin-bottom: 4px;">
                    Наименование / Предназначение: <span style="color: #dc2626;">*</span>
                </label>
                <input id="swalRoomName" class="swal2-input" placeholder="напр. Бобиновъчен участък" style="width: 100%; margin: 0 0 12px 0;">

                <label style="font-weight: 800; color: #334155; display: block; margin-bottom: 4px;">
                    Етаж:
                </label>
                <select id="swalRoomFloor" class="swal2-select" style="width: 100%; margin: 0 0 12px 0;">
                    <option value="Етаж 1">Етаж 1</option>
                    <option value="Етаж 2">Етаж 2</option>
                    <option value="Етаж 3">Етаж 3</option>
                </select>

                <label style="font-weight: 800; color: #334155; display: block; margin-bottom: 4px;">
                    Отговорник на помещението:
                </label>
                <input id="swalRoomSupervisor" class="swal2-input" placeholder="Име на бригадир / отговорник" style="width: 100%; margin: 0 0 12px 0;">

                <label style="font-weight: 800; color: #334155; display: block; margin-bottom: 4px;">
                    Описание / Забележки:
                </label>
                <input id="swalRoomDesc" class="swal2-input" placeholder="Специфични бележки за стаята" style="width: 100%; margin: 0;">
            </div>
        `,
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonText: '💾 Създай стая',
        cancelButtonText: 'Отказ',
        confirmButtonColor: '#2563eb',
        preConfirm: () => {
            const num = document.getElementById('swalRoomNum').value.trim();
            const name = document.getElementById('swalRoomName').value.trim();
            const floor = document.getElementById('swalRoomFloor').value;
            const supervisor = document.getElementById('swalRoomSupervisor').value.trim();
            const desc = document.getElementById('swalRoomDesc').value.trim();

            if (!num) { Swal.showValidationMessage('Моля въведете номер на стая!'); return false; }
            if (!name) { Swal.showValidationMessage('Моля въведете име на стаята!'); return false; }

            // Проверка за дубликат
            let exists = globalRoomsCache.some(r => String(r.room_number).trim() === num);
            if (exists) { Swal.showValidationMessage(`Стая с номер ${num} вече съществува!`); return false; }

            return { room_number: num, room_name: name, floor: floor, supervisor: supervisor, description: desc };
        }
    });

    if (formValues) {
        Swal.fire({ title: 'Запазване...', didOpen: () => Swal.showLoading() });
        try {
            const { data, error } = await client.from('factory_rooms').insert([formValues]).select();
            if (error) {
                // Ако таблицата още не съществува в Supabase, записваме временно локално
                if (error.message.includes('relation "public.factory_rooms" does not exist')) {
                    formValues.id = Date.now();
                    globalRoomsCache.push(formValues);
                    localStorage.setItem('temp_factory_rooms', JSON.stringify(globalRoomsCache));
                    Swal.fire('Записано локално!', 'Стаята е създадена локално. За да се синхронизира трайно, моля изпълнете setup_factory_rooms.sql в Supabase.', 'warning');
                    renderRoomsLayout();
                    return;
                }
                throw error;
            }

            Swal.fire('Успех!', `Стая № ${formValues.room_number} беше създадена успешно!`, 'success');
            await loadRoomsData();
            renderRoomsLayout();
        } catch (err) {
            Swal.fire('Грешка при запис', err.message, 'error');
        }
    }
};

window.autoSelectFloorFromNum = function(val) {
    let clean = String(val || '').trim();
    let select = document.getElementById('swalRoomFloor');
    if (!select || !clean) return;
    if (clean.startsWith('1')) select.value = 'Етаж 1';
    else if (clean.startsWith('2')) select.value = 'Етаж 2';
    else if (clean.startsWith('3')) select.value = 'Етаж 3';
};

window.openEditRoomModal = async function(roomId) {
    let room = globalRoomsCache.find(r => r.id === roomId);
    if (!room) return;

    const { value: formValues } = await Swal.fire({
        title: `✏️ Редакция на Стая № ${escapeHtml(room.room_number)}`,
        html: `
            <div style="text-align: left; font-size: 0.9em;">
                <label style="font-weight: 800; color: #334155; display: block; margin-bottom: 4px;">Номер на стая:</label>
                <input id="swalEditRoomNum" class="swal2-input" value="${escapeHtml(room.room_number)}" style="width: 100%; margin: 0 0 12px 0; font-weight: 800;">

                <label style="font-weight: 800; color: #334155; display: block; margin-bottom: 4px;">Наименование:</label>
                <input id="swalEditRoomName" class="swal2-input" value="${escapeHtml(room.room_name || '')}" style="width: 100%; margin: 0 0 12px 0;">

                <label style="font-weight: 800; color: #334155; display: block; margin-bottom: 4px;">Етаж:</label>
                <select id="swalEditRoomFloor" class="swal2-select" style="width: 100%; margin: 0 0 12px 0;">
                    <option value="Етаж 1" ${room.floor === 'Етаж 1' ? 'selected' : ''}>Етаж 1</option>
                    <option value="Етаж 2" ${room.floor === 'Етаж 2' ? 'selected' : ''}>Етаж 2</option>
                    <option value="Етаж 3" ${room.floor === 'Етаж 3' ? 'selected' : ''}>Етаж 3</option>
                </select>

                <label style="font-weight: 800; color: #334155; display: block; margin-bottom: 4px;">Отговорник:</label>
                <input id="swalEditRoomSupervisor" class="swal2-input" value="${escapeHtml(room.supervisor || '')}" style="width: 100%; margin: 0 0 12px 0;">

                <label style="font-weight: 800; color: #334155; display: block; margin-bottom: 4px;">Описание:</label>
                <input id="swalEditRoomDesc" class="swal2-input" value="${escapeHtml(room.description || '')}" style="width: 100%; margin: 0;">
            </div>
        `,
        showCancelButton: true,
        confirmButtonText: 'Запази промените',
        cancelButtonText: 'Отказ',
        preConfirm: () => {
            return {
                room_number: document.getElementById('swalEditRoomNum').value.trim(),
                room_name: document.getElementById('swalEditRoomName').value.trim(),
                floor: document.getElementById('swalEditRoomFloor').value,
                supervisor: document.getElementById('swalEditRoomSupervisor').value.trim(),
                description: document.getElementById('swalEditRoomDesc').value.trim()
            };
        }
    });

    if (formValues) {
        Swal.fire({ title: 'Обновяване...', didOpen: () => Swal.showLoading() });
        try {
            const { error } = await client.from('factory_rooms').update(formValues).eq('id', roomId);
            if (error) throw error;
            Swal.fire('Обновено!', 'Данните на стаята бяха променени.', 'success');
            await loadRoomsData();
            renderRoomsLayout();
        } catch (err) {
            Swal.fire('Грешка', err.message, 'error');
        }
    }
};

window.deleteRoom = async function(roomId, roomNumber) {
    const res = await Swal.fire({
        title: `Изтриване на Стая № ${roomNumber}?`,
        html: `Сигурни ли сте? Машините и инструментите в тази стая няма да бъдат изтрити, а ще останат <b>незачислени</b>.`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#dc2626',
        confirmButtonText: 'Да, изтрий я',
        cancelButtonText: 'Отказ'
    });

    if (res.isConfirmed) {
        Swal.fire({ title: 'Изтриване...', didOpen: () => Swal.showLoading() });
        try {
            await client.from('factory_machines').update({ room_number: null, room_name: null }).eq('room_number', roomNumber);
            await client.from('factory_tools').update({ room_number: null, room_name: null }).eq('room_number', roomNumber);
            const { error } = await client.from('factory_rooms').delete().eq('id', roomId);
            if (error) throw error;

            Swal.fire('Изтрита!', `Стая № ${roomNumber} беше премахната.`, 'success');
            await loadRoomsData();
            renderRoomsLayout();
        } catch (err) {
            Swal.fire('Грешка', err.message, 'error');
        }
    }
};

// --------------------------------------------------------------------------
// Зачисляване на Машини към Стая
// --------------------------------------------------------------------------
window.openAssignMachineModal = async function(roomNumber, roomName) {
    let optionsHtml = '<option value="">-- Изберете машина от списъка --</option>';
    globalMachinesCache.forEach(m => {
        let currentLoc = m.room_number ? ` (в Стая ${m.room_number})` : ` ⚠️ Без стая`;
        let isCurrent = String(m.room_number).trim() === String(roomNumber).trim();
        if (!isCurrent) {
            optionsHtml += `<option value="${m.id}">${escapeHtml(m.name)}${currentLoc}</option>`;
        }
    });

    const { value: selectedMachineId } = await Swal.fire({
        title: `🏭 Зачисляване на машина към Стая № ${roomNumber}`,
        html: `
            <div style="text-align: left; font-size: 0.9em;">
                <p style="color: #475569; margin-top: 0;">
                    Изберете коя машина да бъде разположена в <b>Стая ${roomNumber} (${escapeHtml(roomName)})</b>:
                </p>
                <select id="swalSelectMachine" class="swal2-select" style="width: 100%; margin: 10px 0;">
                    ${optionsHtml}
                </select>
                <small style="color: #64748b; display: block; margin-top: 6px;">
                    Ако машината е била в друга стая, тя ще бъде преместена в Стая ${roomNumber}.
                </small>
            </div>
        `,
        showCancelButton: true,
        confirmButtonText: '📌 Зачисли към стаята',
        cancelButtonText: 'Отказ',
        confirmButtonColor: '#2563eb',
        preConfirm: () => {
            const val = document.getElementById('swalSelectMachine').value;
            if (!val) { Swal.showValidationMessage('Моля изберете машина!'); return false; }
            return val;
        }
    });

    if (selectedMachineId) {
        Swal.fire({ title: 'Зачисляване...', didOpen: () => Swal.showLoading() });
        try {
            const { error } = await client.from('factory_machines')
                .update({ room_number: String(roomNumber), room_name: roomName })
                .eq('id', selectedMachineId);
            if (error) throw error;

            Swal.fire('Готово!', 'Машината беше зачислена към стаята.', 'success');
            await loadRoomsData();
            renderRoomsLayout();
        } catch (err) {
            Swal.fire('Грешка', err.message, 'error');
        }
    }
};

window.unassignMachineFromRoom = async function(machineId, machineName) {
    const res = await Swal.fire({
        title: 'Премахване на машина от стаята?',
        text: `Искате ли да отчислите машина "${machineName}" от тази стая? Тя ще остане в списъка като незачислена.`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'Да, отчисли я',
        cancelButtonText: 'Отказ'
    });

    if (res.isConfirmed) {
        try {
            await client.from('factory_machines').update({ room_number: null, room_name: null }).eq('id', machineId);
            await loadRoomsData();
            renderRoomsLayout();
        } catch (err) {
            Swal.fire('Грешка', err.message, 'error');
        }
    }
};

window.openUnassignedMachinesModal = function() {
    let unassigned = globalMachinesCache.filter(m => !m.room_number);
    if (unassigned.length === 0) {
        Swal.fire('Всичко е подредено!', 'Всички машини в завода са зачислени към стаи.', 'success');
        return;
    }

    let listHtml = unassigned.map(m => `
        <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 12px; border-bottom:1px solid #e2e8f0;">
            <span style="font-weight:700; color:#1e293b;">🏭 ${escapeHtml(m.name)}</span>
            <span style="color:#ea580c; font-size:0.85em; font-weight:800;">Незачислена</span>
        </div>
    `).join('');

    Swal.fire({
        title: `🏭 Незачислени машини (${unassigned.length})`,
        html: `<div style="max-height:350px; overflow-y:auto; text-align:left;">${listHtml}</div>`,
        confirmButtonText: 'Разбрах',
        confirmButtonColor: '#2563eb'
    });
};

// --------------------------------------------------------------------------
// Добавяне на Инструменти и Уреди към Стая (с Автоматично Кодиране)
// --------------------------------------------------------------------------
window.openAddToolToRoomModal = async function(roomNumber, roomName) {
    // Построяване на опции от каталога със съкращения
    let catalogOptions = TOOL_TYPE_CATALOG.map((t, idx) => `
        <option value="${idx}">[${t.code}] ${escapeHtml(t.name)} (${t.category})</option>
    `).join('');

    const { value: formValues } = await Swal.fire({
        title: `📏 Добавяне на уред към Стая № ${roomNumber}`,
        html: `
            <div style="text-align: left; font-size: 0.9em;">
                <label style="font-weight: 800; color: #334155; display: block; margin-bottom: 4px;">
                    1. Изберете тип уред / инструмент от каталога:
                </label>
                <select id="swalToolCatalogSelect" class="swal2-select" style="width: 100%; margin: 0 0 12px 0;" onchange="onToolTypeSelected('${roomNumber}', this.value)">
                    <option value="">-- Изберете от списъка --</option>
                    ${catalogOptions}
                </select>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 12px;">
                    <div>
                        <label style="font-weight: 800; color: #334155; display: block; margin-bottom: 4px;">
                            Генериран Код: <span style="color:#dc2626;">*</span>
                        </label>
                        <input id="swalToolCode" class="swal2-input" placeholder="напр. ${roomNumber}-Ш-01" style="width: 100%; margin: 0; font-weight: 900; font-family: monospace; color: #0284c7;">
                    </div>
                    <div>
                        <label style="font-weight: 800; color: #334155; display: block; margin-bottom: 4px;">
                            Точно наименование: <span style="color:#dc2626;">*</span>
                        </label>
                        <input id="swalToolName" class="swal2-input" placeholder="Шублер 150mm дигитален" style="width: 100%; margin: 0;">
                    </div>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 12px;">
                    <div>
                        <label style="font-weight: 800; color: #334155; display: block; margin-bottom: 4px;">
                            Фабричен сериен №:
                        </label>
                        <input id="swalToolSerial" class="swal2-input" placeholder="SN123456" style="width: 100%; margin: 0;">
                    </div>
                    <div>
                        <label style="font-weight: 800; color: #334155; display: block; margin-bottom: 4px;">
                            Локация в стаята:
                        </label>
                        <input id="swalToolLocDetail" class="swal2-input" placeholder="Шкаф 1 / Маса 2 / Стелаж" style="width: 100%; margin: 0;">
                    </div>
                </div>

                <div id="calibFieldsContainer" style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 12px; background: #f8fafc; padding: 10px; border-radius: 8px; border: 1px solid #e2e8f0;">
                    <div>
                        <label style="font-weight: 800; color: #334155; display: block; margin-bottom: 4px;">
                            Последна калибрация:
                        </label>
                        <input type="date" id="swalToolCalibDate" class="swal2-input" style="width: 100%; margin: 0;">
                    </div>
                    <div>
                        <label style="font-weight: 800; color: #334155; display: block; margin-bottom: 4px;">
                            Валидна до:
                        </label>
                        <input type="date" id="swalToolCalibDue" class="swal2-input" style="width: 100%; margin: 0;">
                    </div>
                </div>
            </div>
        `,
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonText: '💾 Добави в описа',
        cancelButtonText: 'Отказ',
        confirmButtonColor: '#16a34a',
        preConfirm: () => {
            const code = document.getElementById('swalToolCode').value.trim();
            const name = document.getElementById('swalToolName').value.trim();
            const serial = document.getElementById('swalToolSerial').value.trim();
            const loc = document.getElementById('swalToolLocDetail').value.trim();
            const calibDate = document.getElementById('swalToolCalibDate').value;
            const calibDue = document.getElementById('swalToolCalibDue').value;

            if (!code) { Swal.showValidationMessage('Моля въведете код на уреда!'); return false; }
            if (!name) { Swal.showValidationMessage('Моля въведете наименование!'); return false; }

            // Извличане на категория от избрания каталог
            const catIdx = document.getElementById('swalToolCatalogSelect').value;
            const catItem = catIdx !== '' ? TOOL_TYPE_CATALOG[parseInt(catIdx)] : null;
            const category = catItem ? catItem.category : 'Измервателен уред';

            return {
                tool_code: code,
                tool_name: name,
                category: category,
                room_number: String(roomNumber),
                room_name: roomName,
                workstation_name: `Стая ${roomNumber}`,
                serial_number: serial || null,
                location_detail: loc || null,
                calibration_date: calibDate || null,
                calibration_due: calibDue || null,
                status: 'active'
            };
        }
    });

    if (formValues) {
        Swal.fire({ title: 'Запис на уреда...', didOpen: () => Swal.showLoading() });
        try {
            const { error } = await client.from('factory_tools').insert([formValues]);
            if (error) throw error;

            Swal.fire('Добавен!', `Уредът ${formValues.tool_code} беше зачислен към Стая ${roomNumber}.`, 'success');
            await loadRoomsData();
            renderRoomsLayout();
        } catch (err) {
            Swal.fire('Грешка при запис', err.message, 'error');
        }
    }
};

// Функция за автоматично генериране на код при избор на тип уред
window.onToolTypeSelected = function(roomNumber, catalogIndex) {
    if (catalogIndex === '') return;
    let item = TOOL_TYPE_CATALOG[parseInt(catalogIndex)];
    if (!item) return;

    // Преброяване колко уреда с този код вече съществуват в тази стая
    let prefix = `${roomNumber}-${item.code}-`;
    let existingNums = globalToolsCache
        .filter(t => String(t.room_number) === String(roomNumber) && String(t.tool_code).startsWith(prefix))
        .map(t => {
            let numPart = t.tool_code.replace(prefix, '');
            return parseInt(numPart) || 0;
        });

    let nextNum = 1;
    if (existingNums.length > 0) {
        nextNum = Math.max(...existingNums) + 1;
    }
    let nextNumStr = String(nextNum).padStart(2, '0');

    document.getElementById('swalToolCode').value = `${roomNumber}-${item.code}-${nextNumStr}`;
    document.getElementById('swalToolName').value = item.name;

    // Ако не подлежи на калибрация, скриваме/заглушаваме датите
    let calibContainer = document.getElementById('calibFieldsContainer');
    if (calibContainer) {
        calibContainer.style.opacity = item.calib ? '1' : '0.4';
    }
};

window.deleteTool = async function(toolId, toolCode) {
    const res = await Swal.fire({
        title: `Изтриване на ${toolCode}?`,
        text: 'Сигурни ли сте, че искате да премахнете този уред от инвентарния опис?',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#dc2626',
        confirmButtonText: 'Да, изтрий'
    });

    if (res.isConfirmed) {
        try {
            await client.from('factory_tools').delete().eq('id', toolId);
            await loadRoomsData();
            renderRoomsLayout();
        } catch (err) {
            Swal.fire('Грешка', err.message, 'error');
        }
    }
};

// --------------------------------------------------------------------------
// 🖨️ Разпечатване на Паспорт / Опис за конкретна стая
// --------------------------------------------------------------------------
window.printRoomPassport = function(roomNumber) {
    let room = globalRoomsCache.find(r => String(r.room_number).trim() === String(roomNumber).trim());
    if (!room) {
        Swal.fire('Грешка', 'Не е намерена такава стая.', 'error');
        return;
    }

    let machines = globalMachinesCache.filter(m => String(m.room_number).trim() === String(roomNumber).trim());
    let tools = globalToolsCache.filter(t => String(t.room_number).trim() === String(roomNumber).trim());

    let todayStr = new Date().toLocaleDateString('bg-BG');

    let machinesRows = machines.map((m, idx) => `
        <tr>
            <td style="text-align:center;">${idx + 1}</td>
            <td style="font-weight:bold;">${escapeHtml(m.name)}</td>
            <td style="text-align:center;">${escapeHtml(m.code || '-')}</td>
            <td style="text-align:center;">${escapeHtml(m.model || '-')}</td>
            <td style="text-align:center;">${escapeHtml(m.status === 'active' ? 'В експлоатация' : m.status)}</td>
        </tr>
    `).join('');
    if (!machinesRows) {
        machinesRows = `<tr><td colspan="5" style="text-align:center; color:#94a3b8; padding:12px;">Няма зачислени машини</td></tr>`;
    }

    let toolsRows = tools.map((t, idx) => `
        <tr>
            <td style="text-align:center;">${idx + 1}</td>
            <td style="font-weight:bold; font-family:monospace; text-align:center;">${escapeHtml(t.tool_code)}</td>
            <td>${escapeHtml(t.tool_name)}</td>
            <td style="text-align:center;">${escapeHtml(t.serial_number || '-')}</td>
            <td style="text-align:center;">${escapeHtml(t.location_detail || 'Общо')}</td>
            <td style="text-align:center;">${escapeHtml(t.calibration_due || '-')}</td>
        </tr>
    `).join('');
    if (!toolsRows) {
        toolsRows = `<tr><td colspan="6" style="text-align:center; color:#94a3b8; padding:12px;">Няма зачислени инструменти/уреди</td></tr>`;
    }

    let printHtml = `
        <!DOCTYPE html>
        <html lang="bg">
        <head>
            <meta charset="UTF-8">
            <title>Опис на оборудването - Стая ${escapeHtml(roomNumber)}</title>
            <style>
                body { font-family: 'Times New Roman', serif; margin: 20px; color: black; background: white; }
                h1, h2, h3 { margin: 4px 0; text-align: center; }
                .meta-box { border: 2px solid black; padding: 12px; margin: 15px 0; font-size: 14px; line-height: 1.6; }
                table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 13px; }
                th, td { border: 1px solid black; padding: 6px 8px; }
                th { background-color: #f1f5f9; }
                .sec-title { font-size: 15px; font-weight: bold; margin-top: 20px; border-bottom: 1px solid black; padding-bottom: 4px; }
                @media print {
                    #printBtnRow { display: none; }
                }
            </style>
        </head>
        <body>
            <div id="printBtnRow" style="text-align:right; margin-bottom:15px;">
                <button onclick="window.print()" style="padding:10px 20px; font-size:16px; font-weight:bold; cursor:pointer; background:#2563eb; color:white; border:none; border-radius:6px;">🖨️ Разпечатай</button>
            </div>

            <div style="text-align:center; margin-bottom:15px;">
                <h1 style="font-size:22px; text-transform:uppercase;">AMCI &bull; Производствена База</h1>
                <h2 style="font-size:18px;">ИНВЕНТАРИЗАЦИОНЕН ОПИС НА ПОМЕЩЕНИЕТО</h2>
            </div>

            <div class="meta-box">
                <div style="display:flex; justify-content:space-between;">
                    <div><b>Номер на помещение:</b> СТАЯ № ${escapeHtml(roomNumber)}</div>
                    <div><b>Етаж:</b> ${escapeHtml(room.floor || '')}</div>
                </div>
                <div><b>Наименование:</b> ${escapeHtml(room.room_name)}</div>
                <div><b>Отговорник на стаята:</b> ${escapeHtml(room.supervisor || 'Няма посочен')}</div>
                <div><b>Дата на изготвяне на описа:</b> ${todayStr} г.</div>
            </div>

            <div class="sec-title">1. МАШИНИ И ОСНОВНИ РАБОТНИ МЕСТА</div>
            <table>
                <thead>
                    <tr>
                        <th style="width:5%;">№</th>
                        <th style="width:40%;">Наименование на машина</th>
                        <th style="width:15%;">Инв. №</th>
                        <th style="width:20%;">Модел</th>
                        <th style="width:20%;">Статус</th>
                    </tr>
                </thead>
                <tbody>
                    ${machinesRows}
                </tbody>
            </table>

            <div class="sec-title">2. ИЗМЕРВАТЕЛНИ УРЕДИ, ИНСТРУМЕНТИ И ОСНАСТКА</div>
            <table>
                <thead>
                    <tr>
                        <th style="width:5%;">№</th>
                        <th style="width:15%;">Код на уред</th>
                        <th style="width:35%;">Наименование</th>
                        <th style="width:15%;">Сериен №</th>
                        <th style="width:15%;">Локация</th>
                        <th style="width:15%;">Валидна калибрация</th>
                    </tr>
                </thead>
                <tbody>
                    ${toolsRows}
                </tbody>
            </table>

            <div style="margin-top: 40px; display: flex; justify-content: space-between; font-size: 13px;">
                <div>
                    <div><b>Съставил описа:</b> ..............................</div>
                    <div style="font-size:11px; color:#64748b;">(подпис и дата)</div>
                </div>
                <div>
                    <div><b>Отговорник на стаята:</b> ..............................</div>
                    <div style="font-size:11px; color:#64748b;">(${escapeHtml(room.supervisor || 'подпис')})</div>
                </div>
            </div>
        </body>
        </html>
    `;

    let win = window.open('', '_blank');
    win.document.write(printHtml);
    win.document.close();
};

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
