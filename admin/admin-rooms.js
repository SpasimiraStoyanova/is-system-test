// admin/admin-rooms.js - Единен модул за Опис по стаи, Машини, Уреди & Инвентаризация (AMCI)

let globalRoomsCache = [];
let globalMachinesCache = [];
let globalToolsCache = [];
let activeFloorFilter = 'all'; // 'all', 'Етаж 1', 'Етаж 2', 'Етаж 3', 'warehouse'
let roomSearchQuery = '';

// Списък на ръчни / групови работни постове (които не са индивидуални машини с инв./сериен номер)
const MANUAL_WORKSTATION_NAMES = [
    'бобиньорки',
    'монтаж 1',
    'монтаж 1 мпр',
    'монтаж 1 макари',
    'монтаж 2',
    'монтаж 2 + термопреса',
    'мивка',
    'барабан'
];

window.isWorkstationItem = function(item) {
    if (!item) return false;
    if (item.asset_type === 'workstation') return true;
    if (item.asset_type === 'machine') return false;
    let nameNorm = String(item.name || '').trim().toLowerCase();
    return MANUAL_WORKSTATION_NAMES.includes(nameNorm);
};

// Каталог за уреди и инструменти (САМО измервателни уреди, контролни уреди и електроинструменти)
const TOOL_TYPE_CATALOG = [
    // 📏 Измервателни уреди (подлежащи на периодична калибрация)
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

    // 🔧 Електроинструменти
    { code: 'ОТВ', name: 'Автоматична отвертка', category: 'Електроинструмент', calib: true },
    { code: 'ПОЯЛ', name: 'Поялна станция / Поялник', category: 'Електроинструмент', calib: false },
    { code: 'ДРЕМ', name: 'Дремел (мултишлайф)', category: 'Електроинструмент', calib: false },

    // ⚙️ Оснастка & Приспособления
    { code: 'ПРИС', name: 'Специална оснастка / Дорник', category: 'Оснастка & Приспособления', calib: true },
    { code: 'МАТ', name: 'Матрица / Щанца', category: 'Оснастка & Приспособления', calib: true },
    { code: 'ШАБ', name: 'Шаблон (запояване/монтаж)', category: 'Оснастка & Приспособления', calib: false }
];

// Каталог за предварително дефинирани типове машини (Шаблони за бързо въвеждане)
const MACHINE_TYPE_CATALOG = [
    { name: 'Бобинажна машина', code: '208', model: '', status: 'active' },
    { name: 'Бобинажна+редачна', code: '209', model: '', status: 'active' },
    { name: 'Бобинажна машина статорна', code: '201', model: '', status: 'active' },
    { name: 'Машина за навиване на ротори', code: '203', model: '', status: 'active' },
    { name: 'Ръчна бобинажна машина', code: '', model: '', status: 'active' },
    { name: 'Машина за зачистване', code: '', model: '', status: 'active' },
    { name: 'Машина за пудрене', code: '205', model: '', status: 'active' },
    { name: 'Машина за прахово боядисване', code: '204', model: '', status: 'active' },
    { name: 'Машина за търкане', code: '206', model: '', status: 'active' },
    { name: 'Шмиргел (малък)', code: '16.1', model: '', status: 'active' },
    { name: 'Шмиргел (голям)', code: '16.2', model: '', status: 'active' },
    { name: 'Струг HAAS ST 10', code: '13.5', model: 'HAAS ST 10', status: 'active' },
    { name: 'Струг (УС 11.1)', code: '11.1', model: '', status: 'active' },
    { name: 'Струг голям', code: '13.4', model: '', status: 'active' },
    { name: 'Струг пресоване', code: '109', model: '', status: 'active' },
    { name: 'Универсален струг', code: '15.3', model: '', status: 'active' },
    { name: 'EMCO', code: '103', model: '', status: 'active' },
    { name: 'EMCO (стар)', code: '104', model: '', status: 'active' },
    { name: 'EMCOTURN E25', code: '105', model: '', status: 'active' },
    { name: 'HAAS Mini Mill', code: '15.2', model: 'HAAS', status: 'active' },
    { name: 'Фреза Deckel', code: '15.1', model: 'Deckel', status: 'active' },
    { name: 'Шлайф (нов)', code: '12.1', model: '', status: 'active' },
    { name: 'Шлайф (голям)', code: '12.3', model: '', status: 'active' },
    { name: 'Хонинг', code: '113', model: '', status: 'active' },
    { name: 'Заточна Машина', code: '12.2', model: '', status: 'active' },
    { name: 'Голяма ножовка', code: '13.1', model: '', status: 'active' },
    { name: 'Средна (зелена) ножовка', code: '13.2', model: '', status: 'active' },
    { name: 'Малка (синя) ножовка', code: '13.3', model: '', status: 'active' },
    { name: 'Преса (хидравлична/механична)', code: '', model: '', status: 'active' },
    { name: 'Термопреса', code: '', model: '', status: 'active' },
    { name: 'Гилотина', code: '', model: '', status: 'active' },
    { name: 'Пещ (сушилна/термична)', code: '', model: '', status: 'active' },
    { name: 'Пещ за закаляване', code: '', model: '', status: 'active' },
    { name: 'Камера за пръскане на ламели', code: '', model: '', status: 'active' },
    { name: 'Камера за прахово боядисване', code: '', model: '', status: 'active' },
    { name: 'Ултразвукова вана (ултразвук)', code: '', model: '', status: 'active' }
];

// --------------------------------------------------------------------------
// 1. Инициализиране и рендериране на главния таб
// --------------------------------------------------------------------------
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
                Зареждане на регистъра по стаи, машини и оборудване...
            </div>`;
        await loadRoomsData();
    }

    renderRoomsLayout();
};

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

function showSqlMissingNotice() {
    const alertBanner = document.getElementById('adminGlobalAlertBanner');
    if (alertBanner) {
        alertBanner.style.display = 'block';
        alertBanner.innerHTML = `
            <div style="background:#fef2f2; border:1.5px solid #f87171; border-radius:10px; padding:12px 16px; color:#991b1b; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
                <div>
                    <b>⚠️ Таблицата "factory_rooms" все още не е създадена в базата!</b><br>
                    <span style="font-size:0.88em; color:#7f1d1d;">Моля изпълнете файла <code>setup_factory_rooms.sql</code> в Supabase SQL Editor.</span>
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

// --------------------------------------------------------------------------
// 2. Главен изглед на таба
// --------------------------------------------------------------------------
function renderRoomsLayout() {
    const container = document.getElementById('roomsInventoryContainer');
    if (!container) return;

    let totalRooms = globalRoomsCache.length;
    let allAssigned = globalMachinesCache.filter(m => m.room_number);
    let totalWsAssigned = allAssigned.filter(m => isWorkstationItem(m)).length;
    let totalMacAssigned = allAssigned.filter(m => !isWorkstationItem(m)).length;
    let totalUnassigned = globalMachinesCache.length - allAssigned.length;
    let totalTools = globalToolsCache.length;

    // Филтриране на стаите
    let filteredRooms = globalRoomsCache.filter(r => {
        if (activeFloorFilter !== 'all') {
            if (activeFloorFilter === 'warehouse') {
                let nameLower = String(r.room_name || '').toLowerCase();
                let isWh = nameLower.includes('склад') || String(r.room_number).toLowerCase().includes('склад') || String(r.room_number) === '10' || String(r.room_number) === '20';
                if (!isWh) return false;
            } else {
                let floorNum = activeFloorFilter.replace(/\D/g, '');
                if (!String(r.room_number).startsWith(floorNum) && r.floor !== activeFloorFilter) return false;
            }
        }
        if (roomSearchQuery) {
            let q = roomSearchQuery.toLowerCase();
            let matchRoom = String(r.room_number).toLowerCase().includes(q) || String(r.room_name || '').toLowerCase().includes(q) || String(r.supervisor || '').toLowerCase().includes(q);
            if (matchRoom) return true;
            let hasMachine = globalMachinesCache.some(m => String(m.room_number) === String(r.room_number) && (m.name.toLowerCase().includes(q) || String(m.code || '').toLowerCase().includes(q)));
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
                <h3 style="margin-top: 0; color: #1e293b; font-size: 1.3em;">Няма въведени стаи / помещения ${activeFloorFilter !== 'all' ? 'за ' + activeFloorFilter : ''}</h3>
                <p style="margin-bottom: 20px; font-size: 0.95em;">
                    Натиснете бутона <b>„➕ Нова Стая / Локация“</b>, за да въведете помещение (напр. Стая 11, Стая 21, Склад, Коридор 2А...).
                </p>
                <button type="button" class="btn" onclick="openCreateRoomModal()" style="background:#2563eb; color:white; padding:12px 22px; font-weight:800; border-radius:10px; border:none; cursor:pointer;">
                    ➕ Добави първата стая
                </button>
            </div>`;
    } else {
        roomsHtml = `<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(460px, 1fr)); gap: 18px; margin-top: 18px; align-items: start;">`;
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
                        <span>Работни постове: <b style="color:#7e22ce;">${totalWsAssigned}</b></span> &bull;
                        <span>Стационарни машини: <b style="color:#0f766e;">${totalMacAssigned}</b></span> &bull;
                        ${totalUnassigned > 0 ? `<span>Неразпределени: <b style="color:#ea580c;">${totalUnassigned}</b></span> &bull;` : ''}
                        <span>Инструменти & уреди: <b style="color:#0284c7;">${totalTools}</b></span>
                    </div>
                </div>

                <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                    <button type="button" class="btn" onclick="openCreateRoomModal()" style="background: #2563eb; color: white; padding: 10px 16px; font-weight: 800; border-radius: 8px; border: none; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; box-shadow: 0 2px 4px rgba(37,99,235,0.25);">
                        ➕ Нова Стая
                    </button>
                    <button type="button" class="btn" onclick="openAddWorkstationModal()" style="background: #7e22ce; color: white; padding: 10px 16px; font-weight: 800; border-radius: 8px; border: none; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; box-shadow: 0 2px 4px rgba(126,34,206,0.25);">
                        👥 Нов работен пост
                    </button>
                    <button type="button" class="btn" onclick="openAddMachineModal()" style="background: #0f766e; color: white; padding: 10px 16px; font-weight: 800; border-radius: 8px; border: none; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; box-shadow: 0 2px 4px rgba(15,118,110,0.25);">
                        🏭 Нова машина
                    </button>
                    <button type="button" class="btn" onclick="openAddToolGlobalModal()" style="background: #16a34a; color: white; padding: 10px 16px; font-weight: 800; border-radius: 8px; border: none; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; box-shadow: 0 2px 4px rgba(22,163,74,0.25);">
                        📏 Нов уред / инструмент
                    </button>
                    <button type="button" class="btn" onclick="renderRoomsTab(true)" style="background: #f1f5f9; color: #475569; border: 1px solid #cbd5e1; padding: 10px 14px; font-weight: 800; border-radius: 8px; cursor: pointer;">
                        🔄 Опресни
                    </button>
                </div>
            </div>

            <!-- Филтри и бързо търсене -->
            <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 16px; padding-top: 14px; border-top: 1px solid #f1f5f9; flex-wrap: wrap; gap: 10px;">
                <div style="display: flex; gap: 6px; flex-wrap: wrap;">
                    <button type="button" onclick="setFloorFilter('all')" style="padding: 6px 14px; border-radius: 20px; font-weight: 800; font-size: 0.85em; cursor: pointer; border: none; ${activeFloorFilter === 'all' ? 'background: #0f172a; color: white;' : 'background: #e2e8f0; color: #475569;'}">
                        Всички локации (${totalRooms})
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
                    <button type="button" onclick="setFloorFilter('warehouse')" style="padding: 6px 14px; border-radius: 20px; font-weight: 800; font-size: 0.85em; cursor: pointer; border: none; ${activeFloorFilter === 'warehouse' ? 'background: #ea580c; color: white;' : 'background: #ffedd5; color: #9a3412;'}">
                        📦 Складове & Коридори
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

// --------------------------------------------------------------------------
// 3. Карта на конкретна стая
// --------------------------------------------------------------------------
function buildRoomCardHtml(room) {
    let rNum = String(room.room_number || '').trim();
    let floor = room.floor || (rNum.startsWith('1') ? 'Етаж 1' : (rNum.startsWith('2') ? 'Етаж 2' : (rNum.startsWith('3') ? 'Етаж 3' : 'Етаж 1')));
    
    let badgeBg = '#1d4ed8'; // Етаж 1
    let borderColor = '#93c5fd';
    if (floor.includes('2') || rNum.startsWith('2')) {
        badgeBg = '#059669'; // Етаж 2
        borderColor = '#86efac';
    } else if (floor.includes('3') || rNum.startsWith('3')) {
        badgeBg = '#7c3aed'; // Етаж 3
        borderColor = '#c4b5fd';
    } else if (rNum.toLowerCase().includes('склад') || String(room.room_name).toLowerCase().includes('склад')) {
        badgeBg = '#ea580c'; // Склад
        borderColor = '#fed7aa';
    }

    let allRoomItems = globalMachinesCache.filter(m => String(m.room_number).trim() === rNum);
    let workstations = allRoomItems.filter(m => isWorkstationItem(m));
    let machines = allRoomItems.filter(m => !isWorkstationItem(m));
    let tools = globalToolsCache.filter(t => String(t.room_number).trim() === rNum);

    // Секция 1: Работни постове (Бобиньорки, Монтаж, Мивка...)
    let workstationsListHtml = '';
    if (workstations.length === 0) {
        workstationsListHtml = `<div style="color: #94a3b8; font-size: 0.82em; font-style: italic; padding: 4px 0;">Няма зачислени работни постове.</div>`;
    } else {
        workstationsListHtml = `<div style="display: flex; flex-direction: column; gap: 6px; margin-top: 6px;">`;
        workstations.forEach(w => {
            workstationsListHtml += `
                <div style="display: flex; justify-content: space-between; align-items: center; background: #faf5ff; border: 1px solid #e9d5ff; border-radius: 8px; padding: 7px 10px; cursor: pointer; transition: background 0.15s ease;" onclick="openWorkstationDetailsModal(${w.id})" onmouseover="this.style.background='#f3e8ff'" onmouseout="this.style.background='#faf5ff'">
                    <div style="display: flex; align-items: center; gap: 6px; min-width: 0;">
                        <span style="font-size: 1.1em;">👥</span>
                        <span style="font-weight: 800; color: #581c87; font-size: 0.95em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(w.name)}</span>
                        ${w.notes ? `<span style="background: #f3e8ff; color: #6b21a8; padding: 1px 6px; border-radius: 4px; font-size: 0.75em; font-weight: 700;">${escapeHtml(w.notes)}</span>` : ''}
                    </div>
                    <div style="display: flex; align-items: center; gap: 6px; flex-shrink: 0;">
                        <span style="font-size: 0.75em; color: #7e22ce; font-weight: 800; background: #f3e8ff; padding: 2px 6px; border-radius: 4px;">Пост ➔</span>
                        <button type="button" onclick="event.stopPropagation(); unassignMachineFromRoom(${w.id}, '${escapeHtml(w.name)}')" title="Отчисли от тази стая" style="background: transparent; border: none; color: #94a3b8; cursor: pointer; font-size: 1em; padding: 2px 4px;" onmouseover="this.style.color='#ef4444'" onmouseout="this.style.color='#94a3b8'">
                            ✕
                        </button>
                    </div>
                </div>`;
        });
        workstationsListHtml += `</div>`;
    }

    // Секция 2: Стационарни машини
    let machinesListHtml = '';
    if (machines.length === 0) {
        machinesListHtml = `<div style="color: #94a3b8; font-size: 0.85em; font-style: italic; padding: 6px 0;">Няма зачислени машини в тази стая.</div>`;
    } else {
        machinesListHtml = `<div style="display: flex; flex-direction: column; gap: 6px; margin-top: 6px;">`;
        machines.forEach(m => {
            let statusDot = m.status === 'maintenance' ? '🟠' : '🟢';
            machinesListHtml += `
                <div style="display: flex; justify-content: space-between; align-items: center; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 7px 10px; cursor: pointer; transition: background 0.15s ease;" onclick="openMachinePassportModal(${m.id})" onmouseover="this.style.background='#f1f5f9'" onmouseout="this.style.background='#f8fafc'">
                    <div style="display: flex; align-items: center; gap: 6px; min-width: 0;">
                        <span>${statusDot}</span>
                        <span style="font-weight: 800; color: #1e293b; font-size: 0.95em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(m.name)}</span>
                        ${m.code ? `<span style="background: #e2e8f0; color: #475569; padding: 1px 6px; border-radius: 4px; font-size: 0.75em; font-weight: 800;">№ ${escapeHtml(m.code)}</span>` : ''}
                    </div>
                    <div style="display: flex; align-items: center; gap: 6px; flex-shrink: 0;">
                        <span style="font-size: 0.75em; color: #0284c7; font-weight: 800; background: #e0f2fe; padding: 2px 6px; border-radius: 4px;">Паспорт ➔</span>
                        <button type="button" onclick="event.stopPropagation(); unassignMachineFromRoom(${m.id}, '${escapeHtml(m.name)}')" title="Отчисли от тази стая" style="background: transparent; border: none; color: #94a3b8; cursor: pointer; font-size: 1em; padding: 2px 4px;" onmouseover="this.style.color='#ef4444'" onmouseout="this.style.color='#94a3b8'">
                            ✕
                        </button>
                    </div>
                </div>`;
        });
        machinesListHtml += `</div>`;
    }

    // Секция 3: Инструменти и уреди
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
                    calibBadge = `<span style="background:#fee2e2; color:#b91c1c; font-size:0.7em; padding:2px 6px; border-radius:4px; font-weight:800;">🔴 Изтекъл</span>`;
                } else if (diffDays <= 30) {
                    calibBadge = `<span style="background:#fef3c7; color:#b45309; font-size:0.7em; padding:2px 6px; border-radius:4px; font-weight:800;">🟡 ${diffDays} д.</span>`;
                } else {
                    calibBadge = `<span style="background:#dcfce7; color:#166534; font-size:0.7em; padding:2px 6px; border-radius:4px; font-weight:800;">🟢 Годен</span>`;
                }
            }

            toolsListHtml += `
                <div style="display: flex; justify-content: space-between; align-items: center; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 7px 10px; font-size: 0.88em; cursor: pointer; transition: background 0.15s ease;" onclick="openToolPassportModal(${t.id})" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='#ffffff'">
                    <div style="min-width: 0; display: flex; align-items: center; gap: 6px;">
                        <span style="font-weight: 900; color: #0284c7; background: #e0f2fe; padding: 2px 6px; border-radius: 4px; font-family: monospace;">${escapeHtml(t.tool_code)}</span>
                        <span style="font-weight: 700; color: #334155; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(t.tool_name)}</span>
                        ${t.location_detail ? `<small style="color: #64748b;">(${escapeHtml(t.location_detail)})</small>` : ''}
                    </div>
                    <div style="display: flex; align-items: center; gap: 6px; flex-shrink: 0;">
                        ${calibBadge}
                        <span style="font-size: 0.75em; color: #0284c7; font-weight: 800; background: #e0f2fe; padding: 2px 6px; border-radius: 4px;">Паспорт ➔</span>
                        <button type="button" onclick="event.stopPropagation(); deleteTool(${t.id}, '${escapeHtml(t.tool_code)}')" title="Изтрий от описа" style="background: transparent; border: none; color: #94a3b8; cursor: pointer; padding: 2px 4px;" onmouseover="this.style.color='#ef4444'" onmouseout="this.style.color='#94a3b8'">
                            ✕
                        </button>
                    </div>
                </div>`;
        });
        toolsListHtml += `</div>`;
    }

    return `
        <div class="card" style="border-radius: 14px; border: 1.5px solid ${borderColor}; padding: 16px; background: white; box-shadow: 0 2px 6px rgba(0,0,0,0.04); display: flex; flex-direction: column;">
            <!-- Заглавна част -->
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
                    <button type="button" onclick="printRoomPassport('${escapeHtml(rNum)}')" title="🖨️ Печат на Опис за вратата" style="background: #eff6ff; border: 1px solid #bfdbfe; color: #1d4ed8; padding: 6px 10px; border-radius: 6px; cursor: pointer; font-size: 0.85em; font-weight: 800;">
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

            <!-- Секция 1: Работни постове / Зони -->
            <div style="margin-bottom: 14px;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span style="font-weight: 800; color: #581c87; font-size: 0.88em; text-transform: uppercase; letter-spacing: 0.3px;">
                        👥 Работни постове (${workstations.length})
                    </span>
                    <button type="button" onclick="openAssignWorkstationModal('${escapeHtml(rNum)}', '${escapeHtml(room.room_name)}')" style="background: #f3e8ff; color: #7e22ce; border: none; padding: 3px 8px; border-radius: 6px; font-weight: 800; font-size: 0.78em; cursor: pointer;">
                        ➕ Зачисли пост
                    </button>
                </div>
                ${workstationsListHtml}
            </div>

            <!-- Секция 2: Стационарни Машини -->
            <div style="margin-bottom: 14px; border-top: 1px dashed #e2e8f0; padding-top: 12px;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span style="font-weight: 800; color: #0f766e; font-size: 0.88em; text-transform: uppercase; letter-spacing: 0.3px;">
                        🏭 Стационарни Машини (${machines.length})
                    </span>
                    <button type="button" onclick="openAssignMachineModal('${escapeHtml(rNum)}', '${escapeHtml(room.room_name)}')" style="background: #e0f2fe; color: #0369a1; border: none; padding: 3px 8px; border-radius: 6px; font-weight: 800; font-size: 0.78em; cursor: pointer;">
                        ➕ Зачисли машина
                    </button>
                </div>
                ${machinesListHtml}
            </div>

            <!-- Секция 3: Инструменти & Уреди -->
            <div style="margin-top: 14px; border-top: 1px dashed #e2e8f0; padding-top: 12px;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span style="font-weight: 800; color: #166534; font-size: 0.88em; text-transform: uppercase; letter-spacing: 0.3px;">
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
// 4. ПАСПОРТ НА МАШИНА (Клик на машина в стаята)
// --------------------------------------------------------------------------
window.openMachinePassportModal = function(machineId) {
    let machine = globalMachinesCache.find(m => m.id === machineId);
    if (!machine) return;

    let roomText = machine.room_number ? `Стая ${machine.room_number} ${machine.room_name ? '(' + machine.room_name + ')' : ''}` : '⚠️ Незачислена към стая';
    let statusText = machine.status === 'maintenance' 
        ? '<span style="color:#ea580c; font-weight:bold;">🟠 В профилактика / Ремонт</span>' 
        : '<span style="color:#16a34a; font-weight:bold;">🟢 В експлоатация (Активна)</span>';

    Swal.fire({
        title: `🏭 Паспорт на Машина`,
        html: `
            <div style="text-align: left; font-size: 0.92em; line-height: 1.6;">
                <div style="background: #f8fafc; border: 1.5px solid #cbd5e1; border-radius: 10px; padding: 12px 16px; margin-bottom: 12px;">
                    <div style="font-size: 1.25em; font-weight: 900; color: #0f172a;">${escapeHtml(machine.name)}</div>
                    <div style="color: #64748b; font-weight: 700;">Инвентарен №: <b>${escapeHtml(machine.code || 'Няма въведен')}</b></div>
                </div>

                <table style="width:100%; border-collapse:collapse; font-size:0.95em;">
                    <tr style="border-bottom:1px solid #f1f5f9;">
                        <td style="padding:6px 0; color:#64748b; font-weight:bold; width:40%;">📍 Локация / Стая:</td>
                        <td style="padding:6px 0; font-weight:bold; color:#1e293b;">${escapeHtml(roomText)}</td>
                    </tr>
                    <tr style="border-bottom:1px solid #f1f5f9;">
                        <td style="padding:6px 0; color:#64748b; font-weight:bold;">🏢 Етаж:</td>
                        <td style="padding:6px 0; color:#1e293b;">${escapeHtml(machine.floor || '-')}</td>
                    </tr>
                    <tr style="border-bottom:1px solid #f1f5f9;">
                        <td style="padding:6px 0; color:#64748b; font-weight:bold;">⚙️ Модел / Производител:</td>
                        <td style="padding:6px 0; color:#1e293b;">${escapeHtml(machine.model || '-')}</td>
                    </tr>
                    <tr style="border-bottom:1px solid #f1f5f9;">
                        <td style="padding:6px 0; color:#64748b; font-weight:bold;">🔢 Сериен номер:</td>
                        <td style="padding:6px 0; font-family:monospace; color:#1e293b;">${escapeHtml(machine.serial_number || '-')}</td>
                    </tr>
                    <tr style="border-bottom:1px solid #f1f5f9;">
                        <td style="padding:6px 0; color:#64748b; font-weight:bold;">📅 Година производство:</td>
                        <td style="padding:6px 0; color:#1e293b;">${escapeHtml(machine.year_manufactured || '-')}</td>
                    </tr>
                    <tr style="border-bottom:1px solid #f1f5f9;">
                        <td style="padding:6px 0; color:#64748b; font-weight:bold;">⚡ Статус:</td>
                        <td style="padding:6px 0;">${statusText}</td>
                    </tr>
                    <tr>
                        <td style="padding:6px 0; color:#64748b; font-weight:bold;">📝 Забележки:</td>
                        <td style="padding:6px 0; color:#475569; font-style:italic;">${escapeHtml(machine.notes || 'Няма')}</td>
                    </tr>
                </table>
            </div>
        `,
        showCancelButton: true,
        showDenyButton: true,
        confirmButtonText: '✏️ Редактирай',
        denyButtonText: '🚪 Премести в друга стая',
        cancelButtonText: 'Затвори',
        confirmButtonColor: '#2563eb',
        denyButtonColor: '#0f766e',
        cancelButtonColor: '#64748b'
    }).then((res) => {
        if (res.isConfirmed) {
            openEditMachineModal(machineId);
        } else if (res.isDenied) {
            openMoveMachineModal(machineId);
        }
    });
};

window.openEditMachineModal = async function(machineId) {
    let m = globalMachinesCache.find(x => x.id === machineId);
    if (!m) return;

    let roomOptions = globalRoomsCache.map(r => `
        <option value="${r.room_number}" ${String(m.room_number) === String(r.room_number) ? 'selected' : ''}>
            Стая ${r.room_number} - ${escapeHtml(r.room_name)}
        </option>
    `).join('');

    const { value: formValues } = await Swal.fire({
        title: `✏️ Редакция на машина`,
        html: `
            <div style="text-align: left; font-size: 0.9em;">
                <label style="font-weight: 800; color: #334155; display: block; margin-bottom: 4px;">Име на машина / пост: <span style="color:#dc2626;">*</span></label>
                <input id="swalEditMacName" class="swal2-input" value="${escapeHtml(m.name)}" style="width: 100%; margin: 0 0 10px 0;">

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px;">
                    <div>
                        <label style="font-weight: 800; color: #334155; display: block; margin-bottom: 4px;">Инвентарен №:</label>
                        <input id="swalEditMacCode" class="swal2-input" value="${escapeHtml(m.code || '')}" style="width: 100%; margin: 0;">
                    </div>
                    <div>
                        <label style="font-weight: 800; color: #334155; display: block; margin-bottom: 4px;">Статус:</label>
                        <select id="swalEditMacStatus" class="swal2-select" style="width: 100%; margin: 0;">
                            <option value="active" ${m.status === 'active' ? 'selected' : ''}>🟢 В експлоатация (Активна)</option>
                            <option value="maintenance" ${m.status === 'maintenance' ? 'selected' : ''}>🟠 В профилактика / Ремонт</option>
                        </select>
                    </div>
                </div>

                <label style="font-weight: 800; color: #334155; display: block; margin-bottom: 4px;">Стая / Помещение: <span style="color:#dc2626;">*</span></label>
                <select id="swalEditMacRoom" class="swal2-select" style="width: 100%; margin: 0 0 10px 0;">
                    <option value="">-- Изберете стая --</option>
                    ${roomOptions}
                </select>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px;">
                    <div>
                        <label style="font-weight: 800; color: #334155; display: block; margin-bottom: 4px;">Модел / Производител:</label>
                        <input id="swalEditMacModel" class="swal2-input" value="${escapeHtml(m.model || '')}" style="width: 100%; margin: 0;">
                    </div>
                    <div>
                        <label style="font-weight: 800; color: #334155; display: block; margin-bottom: 4px;">Сериен номер:</label>
                        <input id="swalEditMacSerial" class="swal2-input" value="${escapeHtml(m.serial_number || '')}" style="width: 100%; margin: 0;">
                    </div>
                </div>

                <label style="font-weight: 800; color: #334155; display: block; margin-bottom: 4px;">Забележки:</label>
                <input id="swalEditMacNotes" class="swal2-input" value="${escapeHtml(m.notes || '')}" style="width: 100%; margin: 0;">
            </div>
        `,
        showCancelButton: true,
        confirmButtonText: '💾 Запази промените',
        cancelButtonText: 'Отказ',
        confirmButtonColor: '#2563eb',
        preConfirm: () => {
            const name = document.getElementById('swalEditMacName').value.trim();
            const code = document.getElementById('swalEditMacCode').value.trim();
            const roomNum = document.getElementById('swalEditMacRoom').value;
            const status = document.getElementById('swalEditMacStatus').value;
            const model = document.getElementById('swalEditMacModel').value.trim();
            const serial = document.getElementById('swalEditMacSerial').value.trim();
            const notes = document.getElementById('swalEditMacNotes').value.trim();

            if (!name) { Swal.showValidationMessage('Името на машината е задължително!'); return false; }
            if (!roomNum) { Swal.showValidationMessage('Задължително изберете стая / локация!'); return false; }

            let roomObj = globalRoomsCache.find(r => String(r.room_number) === String(roomNum));
            let floor = roomObj ? roomObj.floor : (roomNum.startsWith('1') ? 'Етаж 1' : (roomNum.startsWith('2') ? 'Етаж 2' : 'Етаж 3'));

            return {
                name: name,
                code: code || null,
                room_number: roomNum,
                room_name: roomObj ? roomObj.room_name : null,
                floor: floor,
                status: status,
                model: model || null,
                serial_number: serial || null,
                notes: notes || null
            };
        }
    });

    if (formValues) {
        Swal.fire({ title: 'Обновяване...', didOpen: () => Swal.showLoading() });
        try {
            const { error } = await client.from('factory_machines').update(formValues).eq('id', machineId);
            if (error) throw error;
            Swal.fire('Успех!', 'Данните на машината са обновени.', 'success');
            await loadRoomsData();
            renderRoomsLayout();
        } catch (err) {
            Swal.fire('Грешка', err.message, 'error');
        }
    }
};

window.openMoveMachineModal = async function(machineId) {
    let m = globalMachinesCache.find(x => x.id === machineId);
    if (!m) return;

    let roomOptions = globalRoomsCache.map(r => `
        <option value="${r.room_number}" ${String(m.room_number) === String(r.room_number) ? 'selected' : ''}>
            Стая ${r.room_number} (${escapeHtml(r.room_name)})
        </option>
    `).join('');

    const { value: newRoomNum } = await Swal.fire({
        title: `🚪 Преместване на ${escapeHtml(m.name)}`,
        html: `
            <p style="color:#64748b; font-size:0.9em;">Текущо разположение: <b>Стая ${escapeHtml(m.room_number || 'Няма')}</b></p>
            <label style="font-weight:bold; display:block; margin-bottom:6px;">Изберете нова стая / локация:</label>
            <select id="swalMoveRoomSelect" class="swal2-select" style="width:100%;">
                ${roomOptions}
            </select>
        `,
        showCancelButton: true,
        confirmButtonText: 'Премести тук',
        cancelButtonText: 'Отказ',
        preConfirm: () => document.getElementById('swalMoveRoomSelect').value
    });

    if (newRoomNum) {
        let rObj = globalRoomsCache.find(r => String(r.room_number) === String(newRoomNum));
        try {
            await client.from('factory_machines').update({
                room_number: String(newRoomNum),
                room_name: rObj ? rObj.room_name : null,
                floor: rObj ? rObj.floor : null
            }).eq('id', machineId);
            Swal.fire('Преместена!', `Машината беше преместена в Стая ${newRoomNum}.`, 'success');
            await loadRoomsData();
            renderRoomsLayout();
        } catch (err) {
            Swal.fire('Грешка', err.message, 'error');
        }
    }
};

// --------------------------------------------------------------------------
// 5. ПАСПОРТ НА ИНСТРУМЕНТ / УРЕД (Клик на уред в стаята)
// --------------------------------------------------------------------------
window.openToolPassportModal = function(toolId) {
    let tool = globalToolsCache.find(t => t.id === toolId);
    if (!tool) return;

    let calibStatusHtml = '<span style="color:#64748b;">Не се изисква</span>';
    if (tool.calibration_due) {
        let today = new Date(); today.setHours(0,0,0,0);
        let due = new Date(tool.calibration_due); due.setHours(0,0,0,0);
        let diffDays = Math.round((due - today) / (1000 * 60 * 60 * 24));
        if (diffDays < 0) {
            calibStatusHtml = `<span style="background:#fee2e2; color:#b91c1c; font-size:0.85em; padding:3px 8px; border-radius:6px; font-weight:800;">🔴 Изтекла (${escapeHtml(tool.calibration_due)})</span>`;
        } else if (diffDays <= 30) {
            calibStatusHtml = `<span style="background:#fef3c7; color:#b45309; font-size:0.85em; padding:3px 8px; border-radius:6px; font-weight:800;">🟡 Изтича скоро (остават ${diffDays} дни)</span>`;
        } else {
            calibStatusHtml = `<span style="background:#dcfce7; color:#166534; font-size:0.85em; padding:3px 8px; border-radius:6px; font-weight:800;">🟢 Годен (до ${escapeHtml(tool.calibration_due)})</span>`;
        }
    }

    Swal.fire({
        title: `📐 Паспорт на Инструмент / Уред`,
        html: `
            <div style="text-align: left; font-size: 0.92em; line-height: 1.6;">
                <div style="background: #f0fdf4; border: 1.5px solid #86efac; border-radius: 10px; padding: 12px 16px; margin-bottom: 12px;">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <span style="font-size: 1.3em; font-weight: 900; color: #0284c7; font-family: monospace;">${escapeHtml(tool.tool_code)}</span>
                        <span style="background: #dbeafe; color: #1e40af; font-size: 0.75em; font-weight: 800; padding: 2px 8px; border-radius: 12px;">${escapeHtml(tool.category || 'Уред')}</span>
                    </div>
                    <div style="font-size: 1.15em; font-weight: 800; color: #0f172a; margin-top: 4px;">${escapeHtml(tool.tool_name)}</div>
                </div>

                <table style="width:100%; border-collapse:collapse; font-size:0.95em;">
                    <tr style="border-bottom:1px solid #f1f5f9;">
                        <td style="padding:6px 0; color:#64748b; font-weight:bold; width:45%;">📍 Стая / Локация:</td>
                        <td style="padding:6px 0; font-weight:bold; color:#1e293b;">Стая ${escapeHtml(tool.room_number || '-')} ${tool.room_name ? '(' + escapeHtml(tool.room_name) + ')' : ''}</td>
                    </tr>
                    <tr style="border-bottom:1px solid #f1f5f9;">
                        <td style="padding:6px 0; color:#64748b; font-weight:bold;">🗄️ Точно място в стаята:</td>
                        <td style="padding:6px 0; color:#1e293b;">${escapeHtml(tool.location_detail || 'Общо в стаята')}</td>
                    </tr>
                    <tr style="border-bottom:1px solid #f1f5f9;">
                        <td style="padding:6px 0; color:#64748b; font-weight:bold;">🔢 Сериен номер:</td>
                        <td style="padding:6px 0; font-family:monospace; color:#1e293b;">${escapeHtml(tool.serial_number || '-')}</td>
                    </tr>
                    <tr style="border-bottom:1px solid #f1f5f9;">
                        <td style="padding:6px 0; color:#64748b; font-weight:bold;">📅 Последна проверка:</td>
                        <td style="padding:6px 0; color:#1e293b;">${escapeHtml(tool.calibration_date || 'Няма данни')}</td>
                    </tr>
                    <tr style="border-bottom:1px solid #f1f5f9;">
                        <td style="padding:6px 0; color:#64748b; font-weight:bold;">⏳ Срок на годност:</td>
                        <td style="padding:6px 0;">${calibStatusHtml}</td>
                    </tr>
                    <tr>
                        <td style="padding:6px 0; color:#64748b; font-weight:bold;">📝 Забележки:</td>
                        <td style="padding:6px 0; color:#475569; font-style:italic;">${escapeHtml(tool.notes || 'Няма')}</td>
                    </tr>
                </table>

                <div style="display: flex; gap: 8px; margin-top: 14px; padding-top: 10px; border-top: 1px dashed #cbd5e1;">
                    <button type="button" onclick="triggerToolCalibrationModal(${tool.id}, '${escapeHtml(tool.tool_code)}', '${escapeHtml(tool.tool_name)}')" style="flex:1; background:#fef3c7; border:1px solid #fde68a; color:#b45309; padding:8px 10px; border-radius:6px; font-weight:800; font-size:0.85em; cursor:pointer;">
                        📏 Ново замерване
                    </button>
                    <button type="button" onclick="triggerToolCalibHistoryModal('${escapeHtml(tool.tool_code)}', '${escapeHtml(tool.tool_name)}')" style="flex:1; background:#e0f2fe; border:1px solid #bae6fd; color:#0369a1; padding:8px 10px; border-radius:6px; font-weight:800; font-size:0.85em; cursor:pointer;">
                        📋 Дневник проверки
                    </button>
                </div>
            </div>
        `,
        showCancelButton: true,
        showDenyButton: true,
        confirmButtonText: '✏️ Редактирай',
        denyButtonText: '🚪 Премести в друга стая',
        cancelButtonText: 'Затвори',
        confirmButtonColor: '#2563eb',
        denyButtonColor: '#0f766e',
        cancelButtonColor: '#64748b'
    }).then((res) => {
        if (res.isConfirmed) {
            openEditToolModal(toolId);
        } else if (res.isDenied) {
            openMoveToolModal(toolId);
        }
    });
};

window.triggerToolCalibrationModal = function(id, code, name) {
    Swal.close();
    if (typeof openToolCalibrationModal === 'function') {
        openToolCalibrationModal(id, code, name);
    }
};

window.triggerToolCalibHistoryModal = function(code, name) {
    Swal.close();
    if (typeof openToolCalibrationHistoryModal === 'function') {
        openToolCalibrationHistoryModal(code, name);
    }
};

window.openEditToolModal = async function(toolId) {
    let t = globalToolsCache.find(x => x.id === toolId);
    if (!t) return;

    let roomOptions = globalRoomsCache.map(r => `
        <option value="${r.room_number}" ${String(t.room_number) === String(r.room_number) ? 'selected' : ''}>
            Стая ${r.room_number} - ${escapeHtml(r.room_name)}
        </option>
    `).join('');

    const { value: formValues } = await Swal.fire({
        title: `✏️ Редакция на уред ${escapeHtml(t.tool_code)}`,
        html: `
            <div style="text-align: left; font-size: 0.9em;">
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px;">
                    <div>
                        <label style="font-weight: 800; color: #334155; display: block; margin-bottom: 4px;">Код на уред: <span style="color:#dc2626;">*</span></label>
                        <input id="swalEditToolCode" class="swal2-input" value="${escapeHtml(t.tool_code)}" style="width: 100%; margin: 0; font-family:monospace; font-weight:800;">
                    </div>
                    <div>
                        <label style="font-weight: 800; color: #334155; display: block; margin-bottom: 4px;">Категория:</label>
                        <select id="swalEditToolCat" class="swal2-select" style="width: 100%; margin: 0;">
                            <option value="Измервателен уред" ${t.category === 'Измервателен уред' ? 'selected' : ''}>Измервателен уред</option>
                            <option value="Електрически инструмент" ${t.category === 'Електрически инструмент' ? 'selected' : ''}>Електрически инструмент</option>
                            <option value="Ръчен инструмент" ${t.category === 'Ръчен инструмент' ? 'selected' : ''}>Ръчен инструмент</option>
                            <option value="Машина / Работно място" ${t.category === 'Машина / Работно място' ? 'selected' : ''}>Машина / Работно място</option>
                            <option value="Оснастка & Приспособления" ${t.category === 'Оснастка & Приспособления' ? 'selected' : ''}>Оснастка & Приспособления</option>
                        </select>
                    </div>
                </div>

                <label style="font-weight: 800; color: #334155; display: block; margin-bottom: 4px;">Наименование: <span style="color:#dc2626;">*</span></label>
                <input id="swalEditToolName" class="swal2-input" value="${escapeHtml(t.tool_name)}" style="width: 100%; margin: 0 0 10px 0;">

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px;">
                    <div>
                        <label style="font-weight: 800; color: #334155; display: block; margin-bottom: 4px;">Стая / Помещение: <span style="color:#dc2626;">*</span></label>
                        <select id="swalEditToolRoom" class="swal2-select" style="width: 100%; margin: 0;">
                            ${roomOptions}
                        </select>
                    </div>
                    <div>
                        <label style="font-weight: 800; color: #334155; display: block; margin-bottom: 4px;">Място в стаята:</label>
                        <input id="swalEditToolLoc" class="swal2-input" value="${escapeHtml(t.location_detail || '')}" placeholder="Шкаф 1 / Маса 2" style="width: 100%; margin: 0;">
                    </div>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px;">
                    <div>
                        <label style="font-weight: 800; color: #334155; display: block; margin-bottom: 4px;">Сериен №:</label>
                        <input id="swalEditToolSerial" class="swal2-input" value="${escapeHtml(t.serial_number || '')}" style="width: 100%; margin: 0;">
                    </div>
                    <div>
                        <label style="font-weight: 800; color: #334155; display: block; margin-bottom: 4px;">Статус:</label>
                        <select id="swalEditToolStatus" class="swal2-select" style="width: 100%; margin: 0;">
                            <option value="active" ${t.status === 'active' ? 'selected' : ''}>active (Годен)</option>
                            <option value="calibration" ${t.status === 'calibration' ? 'selected' : ''}>calibration (В проверка)</option>
                            <option value="repair" ${t.status === 'repair' ? 'selected' : ''}>repair (В ремонт)</option>
                            <option value="broken" ${t.status === 'broken' ? 'selected' : ''}>broken (Брак)</option>
                        </select>
                    </div>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px; background:#f8fafc; padding:8px; border-radius:8px;">
                    <div>
                        <label style="font-weight: 800; color: #334155; display: block; margin-bottom: 4px;">Последна проверка:</label>
                        <input type="date" id="swalEditToolCalibDate" class="swal2-input" value="${t.calibration_date || ''}" style="width: 100%; margin: 0;">
                    </div>
                    <div>
                        <label style="font-weight: 800; color: #334155; display: block; margin-bottom: 4px;">Валидна до:</label>
                        <input type="date" id="swalEditToolCalibDue" class="swal2-input" value="${t.calibration_due || ''}" style="width: 100%; margin: 0;">
                    </div>
                </div>
            </div>
        `,
        showCancelButton: true,
        confirmButtonText: '💾 Запази',
        cancelButtonText: 'Отказ',
        preConfirm: () => {
            const code = document.getElementById('swalEditToolCode').value.trim();
            const name = document.getElementById('swalEditToolName').value.trim();
            const roomNum = document.getElementById('swalEditToolRoom').value;
            const loc = document.getElementById('swalEditToolLoc').value.trim();
            const cat = document.getElementById('swalEditToolCat').value;
            const serial = document.getElementById('swalEditToolSerial').value.trim();
            const status = document.getElementById('swalEditToolStatus').value;
            const cDate = document.getElementById('swalEditToolCalibDate').value;
            const cDue = document.getElementById('swalEditToolCalibDue').value;

            if (!code) { Swal.showValidationMessage('Кодът е задължителен!'); return false; }
            if (!name) { Swal.showValidationMessage('Името е задължително!'); return false; }
            if (!roomNum) { Swal.showValidationMessage('Стаята е задължителна!'); return false; }

            let rObj = globalRoomsCache.find(r => String(r.room_number) === String(roomNum));

            return {
                tool_code: code,
                tool_name: name,
                category: cat,
                room_number: roomNum,
                room_name: rObj ? rObj.room_name : null,
                location_detail: loc || null,
                serial_number: serial || null,
                status: status,
                calibration_date: cDate || null,
                calibration_due: cDue || null
            };
        }
    });

    if (formValues) {
        Swal.fire({ title: 'Обновяване...', didOpen: () => Swal.showLoading() });
        try {
            const { error } = await client.from('factory_tools').update(formValues).eq('id', toolId);
            if (error) throw error;
            Swal.fire('Успех!', 'Данните на уреда са обновени.', 'success');
            await loadRoomsData();
            renderRoomsLayout();
        } catch (err) {
            Swal.fire('Грешка', err.message, 'error');
        }
    }
};

window.openMoveToolModal = async function(toolId) {
    let t = globalToolsCache.find(x => x.id === toolId);
    if (!t) return;

    let roomOptions = globalRoomsCache.map(r => `
        <option value="${r.room_number}" ${String(t.room_number) === String(r.room_number) ? 'selected' : ''}>
            Стая ${r.room_number} (${escapeHtml(r.room_name)})
        </option>
    `).join('');

    const { value: newRoomNum } = await Swal.fire({
        title: `🚪 Преместване на ${escapeHtml(t.tool_code)}`,
        html: `
            <p style="color:#64748b; font-size:0.9em;">Текущо разположение: <b>Стая ${escapeHtml(t.room_number || 'Няма')}</b></p>
            <label style="font-weight:bold; display:block; margin-bottom:6px;">Изберете нова стая / локация:</label>
            <select id="swalMoveToolSelect" class="swal2-select" style="width:100%;">
                ${roomOptions}
            </select>
        `,
        showCancelButton: true,
        confirmButtonText: 'Премести тук',
        cancelButtonText: 'Отказ',
        preConfirm: () => document.getElementById('swalMoveToolSelect').value
    });

    if (newRoomNum) {
        let rObj = globalRoomsCache.find(r => String(r.room_number) === String(newRoomNum));
        try {
            await client.from('factory_tools').update({
                room_number: String(newRoomNum),
                room_name: rObj ? rObj.room_name : null
            }).eq('id', toolId);
            Swal.fire('Преместен!', `Уредът беше преместен в Стая ${newRoomNum}.`, 'success');
            await loadRoomsData();
            renderRoomsLayout();
        } catch (err) {
            Swal.fire('Грешка', err.message, 'error');
        }
    }
};

// --------------------------------------------------------------------------
// 6. ДОБАВЯНЕ НА НОВА МАШИНА (СЪС ЗАДЪЛЖИТЕЛНА СТАЯ)
// --------------------------------------------------------------------------
window.openAddMachineModal = async function(defaultRoomNum = '') {
    if (globalRoomsCache.length === 0) {
        Swal.fire('Внимание', 'Първо добавете поне една стая / локация (напр. Стая 11 или Склад)!', 'warning');
        return;
    }

    let roomOptions = globalRoomsCache.map(r => `
        <option value="${r.room_number}" ${String(r.room_number) === String(defaultRoomNum) ? 'selected' : ''}>
            Стая ${r.room_number} - ${escapeHtml(r.room_name)}
        </option>
    `).join('');

    let machinePresetOptions = MACHINE_TYPE_CATALOG.map((m, idx) => `
        <option value="${idx}">${escapeHtml(m.name)}${m.code ? ' (№ ' + escapeHtml(m.code) + ')' : ''}</option>
    `).join('');

    const { value: formValues } = await Swal.fire({
        title: `🏭 Добавяне на нова машина`,
        html: `
            <div style="text-align: left; font-size: 0.9em;">
                <label style="font-weight: 800; color: #334155; display: block; margin-bottom: 4px;">
                    Шаблон / Избор от списъка на машините:
                </label>
                <select id="swalNewMacPreset" class="swal2-select" style="width: 100%; margin: 0 0 10px 0;" onchange="
                    const idx = this.value;
                    if (idx !== '') {
                        const mac = MACHINE_TYPE_CATALOG[parseInt(idx)];
                        if (mac) {
                            document.getElementById('swalNewMacName').value = mac.name;
                            if (mac.code && !document.getElementById('swalNewMacCode').value) {
                                document.getElementById('swalNewMacCode').value = mac.code;
                            }
                            if (mac.model && !document.getElementById('swalNewMacModel').value) {
                                document.getElementById('swalNewMacModel').value = mac.model;
                            }
                        }
                    }
                ">
                    <option value="">-- Изберете машина от шаблоните (или въведете ръчно долу) --</option>
                    ${machinePresetOptions}
                </select>

                <label style="font-weight: 800; color: #334155; display: block; margin-bottom: 4px;">
                    Име на машина / оборудване: <span style="color:#dc2626;">*</span>
                </label>
                <input id="swalNewMacName" class="swal2-input" placeholder="напр. Бобинажна машина, Струг HAAS..." style="width: 100%; margin: 0 0 10px 0;">

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px;">
                    <div>
                        <label style="font-weight: 800; color: #334155; display: block; margin-bottom: 4px;">Инвентарен №:</label>
                        <input id="swalNewMacCode" class="swal2-input" placeholder="напр. 101, 201" style="width: 100%; margin: 0;">
                    </div>
                    <div>
                        <label style="font-weight: 800; color: #334155; display: block; margin-bottom: 4px;">Статус:</label>
                        <select id="swalNewMacStatus" class="swal2-select" style="width: 100%; margin: 0;">
                            <option value="active">🟢 В експлоатация (Активна)</option>
                            <option value="maintenance">🟠 В профилактика / Ремонт</option>
                        </select>
                    </div>
                </div>

                <label style="font-weight: 800; color: #334155; display: block; margin-bottom: 4px;">
                    Стая / Помещение: <span style="color:#dc2626;">*</span>
                </label>
                <select id="swalNewMacRoom" class="swal2-select" style="width: 100%; margin: 0 0 10px 0;">
                    <option value="">-- Изберете стая / локация --</option>
                    ${roomOptions}
                </select>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px;">
                    <div>
                        <label style="font-weight: 800; color: #334155; display: block; margin-bottom: 4px;">Модел / Производител:</label>
                        <input id="swalNewMacModel" class="swal2-input" placeholder="HAAS, CNC..." style="width: 100%; margin: 0;">
                    </div>
                    <div>
                        <label style="font-weight: 800; color: #334155; display: block; margin-bottom: 4px;">Сериен номер:</label>
                        <input id="swalNewMacSerial" class="swal2-input" placeholder="SN..." style="width: 100%; margin: 0;">
                    </div>
                </div>

                <label style="font-weight: 800; color: #334155; display: block; margin-bottom: 4px;">Забележки:</label>
                <input id="swalNewMacNotes" class="swal2-input" placeholder="Бележки за машината" style="width: 100%; margin: 0;">
            </div>
        `,
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonText: '💾 Добави машина',
        cancelButtonText: 'Отказ',
        confirmButtonColor: '#0f766e',
        preConfirm: () => {
            const name = document.getElementById('swalNewMacName').value.trim();
            const code = document.getElementById('swalNewMacCode').value.trim();
            const roomNum = document.getElementById('swalNewMacRoom').value;
            const status = document.getElementById('swalNewMacStatus').value;
            const model = document.getElementById('swalNewMacModel').value.trim();
            const serial = document.getElementById('swalNewMacSerial').value.trim();
            const notes = document.getElementById('swalNewMacNotes').value.trim();

            if (!name) { Swal.showValidationMessage('Името на машината е задължително!'); return false; }
            if (!roomNum) { Swal.showValidationMessage('Задължително изберете стая / локация!'); return false; }

            let roomObj = globalRoomsCache.find(r => String(r.room_number) === String(roomNum));
            let floor = roomObj ? roomObj.floor : (roomNum.startsWith('1') ? 'Етаж 1' : (roomNum.startsWith('2') ? 'Етаж 2' : 'Етаж 3'));

            return {
                name: name,
                code: code || null,
                room_number: roomNum,
                room_name: roomObj ? roomObj.room_name : null,
                floor: floor,
                status: status,
                model: model || null,
                serial_number: serial || null,
                notes: notes || null
            };
        }
    });

    if (formValues) {
        Swal.fire({ title: 'Запис на машина...', didOpen: () => Swal.showLoading() });
        try {
            const { error } = await client.from('factory_machines').insert([formValues]);
            if (error) throw error;
            Swal.fire('Добавена!', `Машина "${formValues.name}" беше заведена в Стая ${formValues.room_number}.`, 'success');
            await loadRoomsData();
            renderRoomsLayout();
        } catch (err) {
            Swal.fire('Грешка', err.message, 'error');
        }
    }
};

// --------------------------------------------------------------------------
// 7. ДОБАВЯНЕ НА НОВ УРЕД (ОБЩ БУТОН С ИЗБОР НА СТАЯ)
// --------------------------------------------------------------------------
window.openAddToolGlobalModal = async function() {
    if (globalRoomsCache.length === 0) {
        Swal.fire('Внимание', 'Първо добавете поне една стая / локация!', 'warning');
        return;
    }

    let roomOptions = globalRoomsCache.map(r => `
        <option value="${r.room_number}">Стая ${r.room_number} - ${escapeHtml(r.room_name)}</option>
    `).join('');

    let catalogOptions = TOOL_TYPE_CATALOG.map((t, idx) => `
        <option value="${idx}">[${t.code}] ${escapeHtml(t.name)} (${t.category})</option>
    `).join('');

    const { value: formValues } = await Swal.fire({
        title: `📏 Добавяне на уред / инструмент`,
        html: `
            <div style="text-align: left; font-size: 0.9em;">
                <label style="font-weight: 800; color: #334155; display: block; margin-bottom: 4px;">
                    1. Изберете Стая / Локация: <span style="color:#dc2626;">*</span>
                </label>
                <select id="swalGlobalToolRoom" class="swal2-select" style="width: 100%; margin: 0 0 10px 0;" onchange="recalcGlobalToolCode()">
                    <option value="">-- Изберете стая --</option>
                    ${roomOptions}
                </select>

                <label style="font-weight: 800; color: #334155; display: block; margin-bottom: 4px;">
                    2. Тип уред / инструмент: <span style="color:#dc2626;">*</span>
                </label>
                <select id="swalGlobalToolCatalog" class="swal2-select" style="width: 100%; margin: 0 0 10px 0;" onchange="recalcGlobalToolCode()">
                    <option value="">-- Изберете от списъка --</option>
                    ${catalogOptions}
                </select>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px;">
                    <div>
                        <label style="font-weight: 800; color: #334155; display: block; margin-bottom: 4px;">Код: <span style="color:#dc2626;">*</span></label>
                        <input id="swalGlobalToolCode" class="swal2-input" placeholder="напр. 21-Ш-01" style="width: 100%; margin: 0; font-family:monospace; font-weight:900; color:#0284c7;">
                    </div>
                    <div>
                        <label style="font-weight: 800; color: #334155; display: block; margin-bottom: 4px;">Наименование: <span style="color:#dc2626;">*</span></label>
                        <input id="swalGlobalToolName" class="swal2-input" placeholder="Шублер 150mm" style="width: 100%; margin: 0;">
                    </div>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px;">
                    <div>
                        <label style="font-weight: 800; color: #334155; display: block; margin-bottom: 4px;">Сериен номер:</label>
                        <input id="swalGlobalToolSerial" class="swal2-input" placeholder="SN..." style="width: 100%; margin: 0;">
                    </div>
                    <div>
                        <label style="font-weight: 800; color: #334155; display: block; margin-bottom: 4px;">Място в стаята:</label>
                        <input id="swalGlobalToolLoc" class="swal2-input" placeholder="Шкаф 1 / Маса 2" style="width: 100%; margin: 0;">
                    </div>
                </div>

                <div id="globalCalibContainer" style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; background:#f8fafc; padding:8px; border-radius:8px; margin-bottom:10px;">
                    <div>
                        <label style="font-weight: 800; color: #334155; display: block; margin-bottom: 4px;">Последна проверка:</label>
                        <input type="date" id="swalGlobalToolCalibDate" class="swal2-input" style="width: 100%; margin: 0;">
                    </div>
                    <div>
                        <label style="font-weight: 800; color: #334155; display: block; margin-bottom: 4px;">Валидна до:</label>
                        <input type="date" id="swalGlobalToolCalibDue" class="swal2-input" style="width: 100%; margin: 0;">
                    </div>
                </div>
            </div>
        `,
        showCancelButton: true,
        confirmButtonText: '💾 Добави в инвентара',
        cancelButtonText: 'Отказ',
        confirmButtonColor: '#16a34a',
        preConfirm: () => {
            const roomNum = document.getElementById('swalGlobalToolRoom').value;
            const code = document.getElementById('swalGlobalToolCode').value.trim();
            const name = document.getElementById('swalGlobalToolName').value.trim();
            const serial = document.getElementById('swalGlobalToolSerial').value.trim();
            const loc = document.getElementById('swalGlobalToolLoc').value.trim();
            const cDate = document.getElementById('swalGlobalToolCalibDate').value;
            const cDue = document.getElementById('swalGlobalToolCalibDue').value;

            if (!roomNum) { Swal.showValidationMessage('Задължително изберете стая / локация!'); return false; }
            if (!code) { Swal.showValidationMessage('Кодът на уреда е задължителен!'); return false; }
            if (!name) { Swal.showValidationMessage('Наименованието е задължително!'); return false; }

            const catIdx = document.getElementById('swalGlobalToolCatalog').value;
            const catItem = catIdx !== '' ? TOOL_TYPE_CATALOG[parseInt(catIdx)] : null;
            const category = catItem ? catItem.category : 'Измервателен уред';

            let rObj = globalRoomsCache.find(r => String(r.room_number) === String(roomNum));

            return {
                tool_code: code,
                tool_name: name,
                category: category,
                room_number: String(roomNum),
                room_name: rObj ? rObj.room_name : null,
                workstation_name: `Стая ${roomNum}`,
                location_detail: loc || null,
                serial_number: serial || null,
                calibration_date: cDate || null,
                calibration_due: cDue || null,
                status: 'active'
            };
        }
    });

    if (formValues) {
        Swal.fire({ title: 'Запис на уреда...', didOpen: () => Swal.showLoading() });
        try {
            const { error } = await client.from('factory_tools').insert([formValues]);
            if (error) throw error;
            Swal.fire('Добавен!', `Уредът ${formValues.tool_code} беше зачислен към Стая ${formValues.room_number}.`, 'success');
            await loadRoomsData();
            renderRoomsLayout();
        } catch (err) {
            Swal.fire('Грешка', err.message, 'error');
        }
    }
};

window.recalcGlobalToolCode = function() {
    let roomNum = document.getElementById('swalGlobalToolRoom')?.value;
    let catIdx = document.getElementById('swalGlobalToolCatalog')?.value;
    if (!roomNum || catIdx === '') return;

    let item = TOOL_TYPE_CATALOG[parseInt(catIdx)];
    if (!item) return;

    let prefix = `${roomNum}-${item.code}-`;
    let existingNums = globalToolsCache
        .filter(t => String(t.room_number) === String(roomNum) && String(t.tool_code).startsWith(prefix))
        .map(t => parseInt(t.tool_code.replace(prefix, '')) || 0);

    let nextNum = existingNums.length > 0 ? (Math.max(...existingNums) + 1) : 1;
    let nextNumStr = String(nextNum).padStart(2, '0');

    document.getElementById('swalGlobalToolCode').value = `${roomNum}-${item.code}-${nextNumStr}`;
    document.getElementById('swalGlobalToolName').value = item.name;

    let calibContainer = document.getElementById('globalCalibContainer');
    if (calibContainer) calibContainer.style.opacity = item.calib ? '1' : '0.4';
};

// --------------------------------------------------------------------------
// 8. Управление на стаи и печат на опис
// --------------------------------------------------------------------------
window.openCreateRoomModal = async function() {
    const { value: formValues } = await Swal.fire({
        title: '➕ Добавяне на нова стая / локация',
        html: `
            <div style="text-align: left; font-size: 0.9em;">
                <label style="font-weight: 800; color: #334155; display: block; margin-bottom: 4px;">
                    Номер / Код на стая: <span style="color: #dc2626;">*</span>
                    <small style="color: #64748b; font-weight: normal;">(напр. 11, 21, 2А, Склад...)</small>
                </label>
                <input id="swalRoomNum" class="swal2-input" placeholder="напр. 21, 2А или Склад" style="width: 100%; margin: 0 0 12px 0; font-weight: 800; font-size: 1.1em;" oninput="autoSelectFloorFromNum(this.value)">

                <label style="font-weight: 800; color: #334155; display: block; margin-bottom: 4px;">
                    Наименование: <span style="color: #dc2626;">*</span>
                </label>
                <input id="swalRoomName" class="swal2-input" placeholder="напр. Бобиновъчен участък, Склад..." style="width: 100%; margin: 0 0 12px 0;">

                <label style="font-weight: 800; color: #334155; display: block; margin-bottom: 4px;">
                    Етаж / Зона:
                </label>
                <select id="swalRoomFloor" class="swal2-select" style="width: 100%; margin: 0 0 12px 0;">
                    <option value="Етаж 1">Етаж 1</option>
                    <option value="Етаж 2">Етаж 2</option>
                    <option value="Етаж 3">Етаж 3</option>
                    <option value="Склад">Склад / Обща площ</option>
                </select>

                <label style="font-weight: 800; color: #334155; display: block; margin-bottom: 4px;">
                    Отговорник на помещението:
                </label>
                <input id="swalRoomSupervisor" class="swal2-input" placeholder="Име на бригадир / отговорник" style="width: 100%; margin: 0 0 12px 0;">

                <label style="font-weight: 800; color: #334155; display: block; margin-bottom: 4px;">
                    Описание / Забележки:
                </label>
                <input id="swalRoomDesc" class="swal2-input" placeholder="Бележки" style="width: 100%; margin: 0;">
            </div>
        `,
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonText: '💾 Създай',
        cancelButtonText: 'Отказ',
        confirmButtonColor: '#2563eb',
        preConfirm: () => {
            const num = document.getElementById('swalRoomNum').value.trim();
            const name = document.getElementById('swalRoomName').value.trim();
            const floor = document.getElementById('swalRoomFloor').value;
            const supervisor = document.getElementById('swalRoomSupervisor').value.trim();
            const desc = document.getElementById('swalRoomDesc').value.trim();

            if (!num) { Swal.showValidationMessage('Моля въведете номер/код на стая!'); return false; }
            if (!name) { Swal.showValidationMessage('Моля въведете име на стаята!'); return false; }

            let exists = globalRoomsCache.some(r => String(r.room_number).trim() === num);
            if (exists) { Swal.showValidationMessage(`Стая с номер ${num} вече съществува!`); return false; }

            return { room_number: num, room_name: name, floor: floor, supervisor: supervisor, description: desc };
        }
    });

    if (formValues) {
        Swal.fire({ title: 'Запазване...', didOpen: () => Swal.showLoading() });
        try {
            const { error } = await client.from('factory_rooms').insert([formValues]);
            if (error) {
                if (error.message.includes('relation "public.factory_rooms" does not exist')) {
                    formValues.id = Date.now();
                    globalRoomsCache.push(formValues);
                    localStorage.setItem('temp_factory_rooms', JSON.stringify(globalRoomsCache));
                    Swal.fire('Записано локално!', 'Стаята е създадена локално. Изпълнете setup_factory_rooms.sql в Supabase.', 'warning');
                    renderRoomsLayout();
                    return;
                }
                throw error;
            }

            Swal.fire('Успех!', `Стая № ${formValues.room_number} беше създадена!`, 'success');
            await loadRoomsData();
            renderRoomsLayout();
        } catch (err) {
            Swal.fire('Грешка', err.message, 'error');
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
    else if (clean.toLowerCase().includes('склад')) select.value = 'Склад';
};

window.openEditRoomModal = async function(roomId) {
    let room = globalRoomsCache.find(r => r.id === roomId);
    if (!room) return;

    const { value: formValues } = await Swal.fire({
        title: `✏️ Редакция на Стая № ${escapeHtml(room.room_number)}`,
        html: `
            <div style="text-align: left; font-size: 0.9em;">
                <label style="font-weight: 800; color: #334155; display: block; margin-bottom: 4px;">Номер / Код на стая:</label>
                <input id="swalEditRoomNum" class="swal2-input" value="${escapeHtml(room.room_number)}" style="width: 100%; margin: 0 0 12px 0; font-weight: 800;">

                <label style="font-weight: 800; color: #334155; display: block; margin-bottom: 4px;">Наименование:</label>
                <input id="swalEditRoomName" class="swal2-input" value="${escapeHtml(room.room_name || '')}" style="width: 100%; margin: 0 0 12px 0;">

                <label style="font-weight: 800; color: #334155; display: block; margin-bottom: 4px;">Етаж / Зона:</label>
                <select id="swalEditRoomFloor" class="swal2-select" style="width: 100%; margin: 0 0 12px 0;">
                    <option value="Етаж 1" ${room.floor === 'Етаж 1' ? 'selected' : ''}>Етаж 1</option>
                    <option value="Етаж 2" ${room.floor === 'Етаж 2' ? 'selected' : ''}>Етаж 2</option>
                    <option value="Етаж 3" ${room.floor === 'Етаж 3' ? 'selected' : ''}>Етаж 3</option>
                    <option value="Склад" ${room.floor === 'Склад' ? 'selected' : ''}>Склад / Обща площ</option>
                </select>

                <label style="font-weight: 800; color: #334155; display: block; margin-bottom: 4px;">Отговорник:</label>
                <input id="swalEditRoomSupervisor" class="swal2-input" value="${escapeHtml(room.supervisor || '')}" style="width: 100%; margin: 0 0 12px 0;">

                <label style="font-weight: 800; color: #334155; display: block; margin-bottom: 4px;">Описание:</label>
                <input id="swalEditRoomDesc" class="swal2-input" value="${escapeHtml(room.description || '')}" style="width: 100%; margin: 0;">
            </div>
        `,
        showCancelButton: true,
        confirmButtonText: 'Запази',
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
            Swal.fire('Обновено!', 'Данните са записани.', 'success');
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
        html: `Сигурни ли сте? Машините и инструментите в тази стая няма да се изтрият, а ще останат <b>незачислени</b>.`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#dc2626',
        confirmButtonText: 'Да, изтрий'
    });

    if (res.isConfirmed) {
        try {
            await client.from('factory_machines').update({ room_number: null, room_name: null }).eq('room_number', roomNumber);
            await client.from('factory_tools').update({ room_number: null, room_name: null }).eq('room_number', roomNumber);
            await client.from('factory_rooms').delete().eq('id', roomId);
            await loadRoomsData();
            renderRoomsLayout();
        } catch (err) {
            Swal.fire('Грешка', err.message, 'error');
        }
    }
};

window.openAssignMachineModal = async function(roomNumber, roomName) {
    let optionsHtml = '<option value="">-- Изберете машина от списъка --</option>';
    let physicalMachines = globalMachinesCache.filter(m => !isWorkstationItem(m));
    physicalMachines.forEach(m => {
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
                <p style="color: #475569; margin-top: 0;">Изберете съществуваща машина за <b>Стая ${roomNumber} (${escapeHtml(roomName)})</b>:</p>
                <select id="swalSelectMachine" class="swal2-select" style="width: 100%; margin: 10px 0;">
                    ${optionsHtml}
                </select>

                <div style="margin-top: 14px; text-align: center; border-top: 1px dashed #cbd5e1; padding-top: 10px;">
                    <span style="font-size: 0.85em; color: #64748b;">Имате още една бройка от същия тип машина (напр. Бобинажна, Шлайф)?</span><br>
                    <button type="button" class="btn" onclick="Swal.close(); openAddMachineModal('${escapeHtml(roomNumber)}');" style="margin-top: 6px; background: #e0f2fe; color: #0369a1; border: 1px solid #bae6fd; padding: 6px 14px; font-weight: 800; border-radius: 6px; cursor: pointer; font-size: 0.85em;">
                        ➕ Регистрирай нова бройка машина за Стая ${escapeHtml(roomNumber)}
                    </button>
                </div>
            </div>
        `,
        showCancelButton: true,
        confirmButtonText: '📌 Зачисли към стаята',
        cancelButtonText: 'Отказ',
        confirmButtonColor: '#0f766e',
        preConfirm: () => {
            const val = document.getElementById('swalSelectMachine').value;
            if (!val) { Swal.showValidationMessage('Моля изберете машина!'); return false; }
            return val;
        }
    });

    if (selectedMachineId) {
        try {
            await client.from('factory_machines')
                .update({ room_number: String(roomNumber), room_name: roomName })
                .eq('id', selectedMachineId);
            Swal.fire('Готово!', 'Машината беше зачислена към стаята.', 'success');
            await loadRoomsData();
            renderRoomsLayout();
        } catch (err) {
            Swal.fire('Грешка', err.message, 'error');
        }
    }
};

window.openAssignWorkstationModal = async function(roomNumber, roomName) {
    let optionsHtml = '<option value="">-- Изберете работен пост / участък --</option>';
    let workstationItems = globalMachinesCache.filter(m => isWorkstationItem(m));
    workstationItems.forEach(w => {
        let currentLoc = w.room_number ? ` (в Стая ${w.room_number})` : ` ⚠️ Без стая`;
        let isCurrent = String(w.room_number).trim() === String(roomNumber).trim();
        if (!isCurrent) {
            optionsHtml += `<option value="${w.id}">${escapeHtml(w.name)}${currentLoc}</option>`;
        }
    });

    const { value: formValues } = await Swal.fire({
        title: `👥 Зачисляване на Работен пост`,
        html: `
            <div style="text-align: left; font-size: 0.9em;">
                <p style="color: #475569; margin-top: 0;">Изберете работен пост за <b>Стая ${escapeHtml(roomNumber)} (${escapeHtml(roomName)})</b>:</p>
                <label style="font-weight: 800; color: #334155; display: block; margin-bottom: 4px;">Работен пост: <span style="color:#dc2626;">*</span></label>
                <select id="swalSelectWorkstation" class="swal2-select" style="width: 100%; margin: 0 0 10px 0;">
                    ${optionsHtml}
                </select>

                <label style="font-weight: 800; color: #334155; display: block; margin-bottom: 4px;">Описание / Брой маси (по избор):</label>
                <input id="swalWorkstationNotes" class="swal2-input" placeholder="напр. 4 работни маси / Постове 1-4" style="width: 100%; margin: 0;">
                
                <div style="margin-top: 14px; text-align: center; border-top: 1px dashed #cbd5e1; padding-top: 10px;">
                    <span style="font-size: 0.85em; color: #64748b;">Няма търсения пост в списъка?</span><br>
                    <button type="button" class="btn" onclick="Swal.close(); openAddWorkstationModal('${escapeHtml(roomNumber)}');" style="margin-top: 6px; background: #ede9fe; color: #6d28d9; border: 1px solid #ddd6fe; padding: 6px 14px; font-weight: 800; border-radius: 6px; cursor: pointer; font-size: 0.85em;">
                        ➕ Създай изцяло нов пост
                    </button>
                </div>
            </div>
        `,
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonText: '💾 Зачисли към стаята',
        cancelButtonText: 'Отказ',
        confirmButtonColor: '#7e22ce',
        preConfirm: () => {
            const select = document.getElementById('swalSelectWorkstation');
            const notes = document.getElementById('swalWorkstationNotes').value.trim();
            if (!select.value) {
                Swal.showValidationMessage('Моля, изберете работен пост!');
                return false;
            }
            return {
                workstationId: parseInt(select.value),
                notes: notes
            };
        }
    });

    if (formValues) {
        Swal.fire({ title: 'Зачисляване...', didOpen: () => Swal.showLoading() });
        let roomObj = globalRoomsCache.find(r => String(r.room_number) === String(roomNumber));
        let floor = roomObj ? roomObj.floor : (roomNumber.startsWith('1') ? 'Етаж 1' : (roomNumber.startsWith('2') ? 'Етаж 2' : 'Етаж 3'));

        try {
            let updatePayload = {
                room_number: String(roomNumber),
                room_name: roomName,
                floor: floor
            };
            if (formValues.notes) {
                updatePayload.notes = formValues.notes;
            }
            const { error } = await client.from('factory_machines')
                .update(updatePayload)
                .eq('id', formValues.workstationId);
            if (error) throw error;

            Swal.fire('Готово!', `Работният пост беше зачислен към Стая ${roomNumber}.`, 'success');
            await loadRoomsData();
            renderRoomsLayout();
        } catch (err) {
            Swal.fire('Грешка', err.message, 'error');
        }
    }
};

window.openAddWorkstationModal = async function(defaultRoomNum = '') {
    let roomOptions = globalRoomsCache.map(r => `
        <option value="${r.room_number}" ${String(defaultRoomNum) === String(r.room_number) ? 'selected' : ''}>
            Стая ${r.room_number} - ${escapeHtml(r.room_name)}
        </option>
    `).join('');

    const { value: formValues } = await Swal.fire({
        title: `👥 Нов Работен Пост / Зона`,
        html: `
            <div style="text-align: left; font-size: 0.9em;">
                <label style="font-weight: 800; color: #334155; display: block; margin-bottom: 4px;">
                    Наименование на пост / участък: <span style="color:#dc2626;">*</span>
                </label>
                <input id="swalNewWsName" class="swal2-input" placeholder="напр. Бобиньорки, Опаковане, Монтаж 3..." style="width: 100%; margin: 0 0 10px 0;">

                <label style="font-weight: 800; color: #334155; display: block; margin-bottom: 4px;">
                    Стая / Помещение: <span style="color:#dc2626;">*</span>
                </label>
                <select id="swalNewWsRoom" class="swal2-select" style="width: 100%; margin: 0 0 10px 0;">
                    <option value="">-- Изберете стая --</option>
                    ${roomOptions}
                </select>

                <label style="font-weight: 800; color: #334155; display: block; margin-bottom: 4px;">
                    Описание / Брой работни маси:
                </label>
                <input id="swalNewWsNotes" class="swal2-input" placeholder="напр. 4 работни маси / Зона за лепене" style="width: 100%; margin: 0;">
            </div>
        `,
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonText: '💾 Създай работен пост',
        cancelButtonText: 'Отказ',
        confirmButtonColor: '#7e22ce',
        preConfirm: () => {
            const name = document.getElementById('swalNewWsName').value.trim();
            const roomNum = document.getElementById('swalNewWsRoom').value;
            const notes = document.getElementById('swalNewWsNotes').value.trim();

            if (!name) { Swal.showValidationMessage('Името на поста е задължително!'); return false; }
            if (!roomNum) { Swal.showValidationMessage('Задължително изберете стая!'); return false; }

            let roomObj = globalRoomsCache.find(r => String(r.room_number) === String(roomNum));
            let floor = roomObj ? roomObj.floor : (roomNum.startsWith('1') ? 'Етаж 1' : (roomNum.startsWith('2') ? 'Етаж 2' : 'Етаж 3'));

            return {
                name: name,
                room_number: roomNum,
                room_name: roomObj ? roomObj.room_name : null,
                floor: floor,
                status: 'active',
                asset_type: 'workstation',
                notes: notes || null
            };
        }
    });

    if (formValues) {
        Swal.fire({ title: 'Запис на работен пост...', didOpen: () => Swal.showLoading() });
        try {
            const { error } = await client.from('factory_machines').insert([formValues]);
            if (error) throw error;
            Swal.fire('Успех!', `Работният пост "${formValues.name}" беше заведен в Стая ${formValues.room_number}.`, 'success');
            await loadRoomsData();
            renderRoomsLayout();
        } catch (err) {
            Swal.fire('Грешка', err.message, 'error');
        }
    }
};

window.openWorkstationDetailsModal = function(wsId) {
    let ws = globalMachinesCache.find(m => m.id === wsId);
    if (!ws) return;

    Swal.fire({
        title: `👥 Работен Пост`,
        html: `
            <div style="text-align: left; font-size: 0.92em; line-height: 1.6;">
                <div style="background: #faf5ff; border: 1.5px solid #d8b4fe; border-radius: 10px; padding: 12px 16px; margin-bottom: 12px;">
                    <div style="font-size: 1.25em; font-weight: 900; color: #581c87;">${escapeHtml(ws.name)}</div>
                    <div style="font-size: 0.85em; color: #7e22ce; font-weight: bold; margin-top: 2px;">Ръчен / Групов производствен пост</div>
                </div>

                <table style="width:100%; border-collapse:collapse; font-size:0.95em;">
                    <tr style="border-bottom:1px solid #f1f5f9;">
                        <td style="padding:6px 0; color:#64748b; font-weight:bold; width:45%;">📍 Стая / Локация:</td>
                        <td style="padding:6px 0; font-weight:bold; color:#1e293b;">Стая ${escapeHtml(ws.room_number || '-')} ${ws.room_name ? '(' + escapeHtml(ws.room_name) + ')' : ''}</td>
                    </tr>
                    <tr style="border-bottom:1px solid #f1f5f9;">
                        <td style="padding:6px 0; color:#64748b; font-weight:bold;">🏢 Етаж:</td>
                        <td style="padding:6px 0; color:#1e293b;">${escapeHtml(ws.floor || '-')}</td>
                    </tr>
                    <tr style="border-bottom:1px solid #f1f5f9;">
                        <td style="padding:6px 0; color:#64748b; font-weight:bold;">🪑 Брой маси / Описание:</td>
                        <td style="padding:6px 0; color:#1e293b; font-weight:600;">${escapeHtml(ws.notes || 'Няма въведено')}</td>
                    </tr>
                    <tr>
                        <td style="padding:6px 0; color:#64748b; font-weight:bold;">⚡ Статус:</td>
                        <td style="padding:6px 0;"><span style="background:#dcfce7; color:#166534; font-size:0.85em; padding:2px 8px; border-radius:4px; font-weight:800;">🟢 В експлоатация</span></td>
                    </tr>
                </table>
            </div>
        `,
        showCancelButton: true,
        showDenyButton: true,
        confirmButtonText: '✏️ Редактирай',
        denyButtonText: '🚪 Премести в друга стая',
        cancelButtonText: 'Затвори',
        confirmButtonColor: '#7e22ce',
        denyButtonColor: '#0f766e',
        cancelButtonColor: '#64748b'
    }).then((res) => {
        if (res.isConfirmed) {
            openEditWorkstationModal(wsId);
        } else if (res.isDenied) {
            openMoveMachineModal(wsId);
        }
    });
};

window.openEditWorkstationModal = async function(wsId) {
    let ws = globalMachinesCache.find(m => m.id === wsId);
    if (!ws) return;

    let roomOptions = globalRoomsCache.map(r => `
        <option value="${r.room_number}" ${String(ws.room_number) === String(r.room_number) ? 'selected' : ''}>
            Стая ${r.room_number} - ${escapeHtml(r.room_name)}
        </option>
    `).join('');

    const { value: formValues } = await Swal.fire({
        title: `✏️ Редакция на ${escapeHtml(ws.name)}`,
        html: `
            <div style="text-align: left; font-size: 0.9em;">
                <label style="font-weight: 800; color: #334155; display: block; margin-bottom: 4px;">Наименование на пост: <span style="color:#dc2626;">*</span></label>
                <input id="swalEditWsName" class="swal2-input" value="${escapeHtml(ws.name)}" style="width: 100%; margin: 0 0 10px 0;">

                <label style="font-weight: 800; color: #334155; display: block; margin-bottom: 4px;">Стая / Локация: <span style="color:#dc2626;">*</span></label>
                <select id="swalEditWsRoom" class="swal2-select" style="width: 100%; margin: 0 0 10px 0;">
                    ${roomOptions}
                </select>

                <label style="font-weight: 800; color: #334155; display: block; margin-bottom: 4px;">Описание / Брой маси:</label>
                <input id="swalEditWsNotes" class="swal2-input" value="${escapeHtml(ws.notes || '')}" placeholder="напр. 4 работни маси" style="width: 100%; margin: 0;">
            </div>
        `,
        showCancelButton: true,
        confirmButtonText: 'Запази',
        cancelButtonText: 'Отказ',
        confirmButtonColor: '#7e22ce',
        preConfirm: () => {
            const name = document.getElementById('swalEditWsName').value.trim();
            const roomNum = document.getElementById('swalEditWsRoom').value;
            const notes = document.getElementById('swalEditWsNotes').value.trim();

            if (!name) { Swal.showValidationMessage('Името е задължително!'); return false; }
            if (!roomNum) { Swal.showValidationMessage('Стаята е задължителна!'); return false; }

            let rObj = globalRoomsCache.find(r => String(r.room_number) === String(roomNum));
            return {
                name: name,
                room_number: roomNum,
                room_name: rObj ? rObj.room_name : null,
                floor: rObj ? rObj.floor : null,
                notes: notes || null
            };
        }
    });

    if (formValues) {
        Swal.fire({ title: 'Обновяване...', didOpen: () => Swal.showLoading() });
        try {
            const { error } = await client.from('factory_machines').update(formValues).eq('id', wsId);
            if (error) throw error;
            Swal.fire('Обновено!', 'Данните на поста са запазени.', 'success');
            await loadRoomsData();
            renderRoomsLayout();
        } catch (err) {
            Swal.fire('Грешка', err.message, 'error');
        }
    }
};

window.unassignMachineFromRoom = async function(machineId, machineName) {
    const res = await Swal.fire({
        title: 'Отчисляване от стаята?',
        text: `Искате ли да отчислите машина "${machineName}" от тази стая?`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'Да, отчисли',
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

window.openAddToolToRoomModal = function(roomNumber, roomName) {
    window.openAddToolGlobalModal();
    setTimeout(() => {
        let select = document.getElementById('swalGlobalToolRoom');
        if (select) {
            select.value = roomNumber;
            recalcGlobalToolCode();
        }
    }, 200);
};

window.setFloorFilter = function(floor) {
    activeFloorFilter = floor;
    renderRoomsLayout();
};

window.onRoomSearchInput = function(val) {
    roomSearchQuery = String(val || '').trim();
    renderRoomsLayout();
};

// --------------------------------------------------------------------------
// 9. Разпечатване на Паспорт / Опис за вратата
// --------------------------------------------------------------------------
window.printRoomPassport = function(roomNumber) {
    let room = globalRoomsCache.find(r => String(r.room_number).trim() === String(roomNumber).trim());
    if (!room) {
        Swal.fire('Грешка', 'Не е намерена такава стая.', 'error');
        return;
    }

    let allRoomItems = globalMachinesCache.filter(m => String(m.room_number).trim() === String(roomNumber).trim());
    let workstations = allRoomItems.filter(m => isWorkstationItem(m));
    let machines = allRoomItems.filter(m => !isWorkstationItem(m));
    let tools = globalToolsCache.filter(t => String(t.room_number).trim() === String(roomNumber).trim());

    let todayStr = new Date().toLocaleDateString('bg-BG');

    let wsRows = workstations.map((w, idx) => `
        <tr>
            <td style="text-align:center;">${idx + 1}</td>
            <td style="font-weight:bold;">${escapeHtml(w.name)}</td>
            <td>${escapeHtml(w.notes || 'Ръчен работен пост')}</td>
            <td style="text-align:center;">${escapeHtml(w.status === 'active' ? 'В експлоатация' : w.status)}</td>
        </tr>
    `).join('');
    if (!wsRows) {
        wsRows = `<tr><td colspan="4" style="text-align:center; color:#94a3b8; padding:8px;">Няма зачислени работни постове</td></tr>`;
    }

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
        machinesRows = `<tr><td colspan="5" style="text-align:center; color:#94a3b8; padding:8px;">Няма зачислени стационарни машини</td></tr>`;
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
        toolsRows = `<tr><td colspan="6" style="text-align:center; color:#94a3b8; padding:8px;">Няма зачислени инструменти/уреди</td></tr>`;
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

            <div class="sec-title">1. РАБОТНИ ПОСТОВЕ И ПРОИЗВОДСТВЕНИ ЗОНИ</div>
            <table>
                <thead>
                    <tr>
                        <th style="width:5%;">№</th>
                        <th style="width:45%;">Наименование на пост / участък</th>
                        <th style="width:30%;">Описание / Брой маси</th>
                        <th style="width:20%;">Статус</th>
                    </tr>
                </thead>
                <tbody>
                    ${wsRows}
                </tbody>
            </table>

            <div class="sec-title">2. СТАЦИОНАРНИ МАШИНИ И СЪОРЪЖЕНИЯ</div>
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

            <div class="sec-title">3. ИЗМЕРВАТЕЛНИ УРЕДИ, ИНСТРУМЕНТИ И ОСНАСТКА</div>
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
