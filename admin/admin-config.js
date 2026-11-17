// Supabase Client Initialization with persistent session & auto refresh
const client = supabase.createClient(
  'https://zdythzcgcjxwbxufunuh.supabase.co', 
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpkeXRoemNnY2p4d2J4dWZ1bnVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA2MTcxNTMsImV4cCI6MjA5NjE5MzE1M30.XGZX5DHhJCGz9X5s__3iuSghukjanyJmGKv8MLig_jE',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  }
);

const tableConfigs = {
  plan: { label: '📅 Месечен План', table: 'plan', key: 'id', fields: [ { name: 'id', type: 'number', readonly: true, hideOnAdd: true }, { name: 'ID Детайл', type: 'text', readonly: true }, { name: 'Вътрешно име', type: 'text', required: true }, { name: 'Целево количество', type: 'number', required: true }, { name: 'Месец', type: 'text', required: true }, { name: 'Година', type: 'number', required: true }, { name: 'Статус', type: 'select', options: ['Активен', 'Завършен', '📦 Опакован', '🚚 Изпратен'], required: true } ] },
  probi: { label: '🧪 Проби', table: 'probi', key: 'id', readOnlyTab: true, fields: [] },
  audit_3s: { label: '🧹 3S Одити & Настройки', table: 'audit_3s_logs', key: 'id', readOnlyTab: true, fields: [] },
  personal: { label: '👥 Персонал & Досиета', table: 'personal', key: 'id', fields: [ { name: 'id', type: 'number', readonly: true, hideOnAdd: true }, { name: 'Имейл', type: 'text', required: true }, { name: 'Име', type: 'text' }, { name: 'Длъжност', type: 'text' }, { name: 'Базов бонус', type: 'number', def: 0 }, { name: 'Статус', type: 'select', options: ['Активен', 'Блокиран'], required: true, def: 'Активен' } ] },
  salaries: { label: '💰 Заплати & Бонуси', table: 'salary_monthly_logs', key: 'id', readOnlyTab: true, hiddenTab: true, fields: [] },
  chekiraniya: { label: '⏱️ Хронология Чекирания', table: 'chekiraniya', readOnlyTab: true, fields: [ { name: 'Време', type: 'text' }, { name: 'Име', label: 'Служител', type: 'text' }, { name: 'Имейл', type: 'text' }, { name: 'Действие', type: 'text' }, { name: 'Локация', type: 'text' }, { name: 'Бележка', type: 'text' } ] },
  sklad_inventory: { label: '🏭 Склад', table: 'inventory', readOnlyTab: true, fields: [ { name: 'ID Детайл', type: 'text', readonlyOnEdit: true }, { name: 'Име', type: 'text', readonlyOnEdit: true }, { name: 'Локация', type: 'text', readonlyOnEdit: true }, { name: 'Операция', type: 'text', readonlyOnEdit: true }, { name: 'Общо', type: 'number', readonlyOnEdit: true }, { name: 'Запазени', type: 'text', readonlyOnEdit: true }, { name: 'Свободни', type: 'number', readonlyOnEdit: true }, { name: 'Минимално количество/Буфер', type: 'number', readonlyOnEdit: true }, { name: '% Брак', label: '% Свръхпроизводство', type: 'number', readonlyOnEdit: true } ] },
  nomenklatura: { label: '🗂️ Номенклатура', table: 'Номенклатура', key: 'id', fields: [ { name: 'id', type: 'number', readonly: true, hideOnAdd: true }, { name: 'ID Детайл', type: 'text', required: true }, { name: 'Вътрешно име', type: 'text' }, { name: 'Описание', type: 'text' }, { name: 'Тип', type: 'text' }, { name: 'ID Родител', type: 'text' }, { name: 'Разходна норма', type: 'number', def: 1 }, { name: 'Единици', type: 'text', def: 'бр.' }, { name: 'pack_size', label: '📦 Опаковка / Кутия (само за Материали)', type: 'text' }, { name: 'Линк към чертеж', type: 'text' } ] },
  sklad: { label: '📦 Склад Материали', table: 'sklad', key: 'ID Детайл', fields: [ { name: 'ID Детайл', type: 'text', required: true, readonlyOnEdit: true }, { name: 'Мерна единица', type: 'text' }, { name: 'Начална наличност', type: 'number', def: 0 }, { name: 'Доставено', type: 'number', def: 0 }, { name: 'Изразходено', type: 'number', def: 0 }, { name: 'Остатък', type: 'number', def: 0, readonly: true }, { name: 'Минимално количество', type: 'number', def: 0 }, { name: 'pack_size', label: '📦 Опаковка / Разфасовка', type: 'text' }, { name: 'Бележки', type: 'text' } ] },
  bom: { label: '🧩 БОМ (Разбивка)', table: 'bom', key: 'id', fields: [ { name: 'id', type: 'number', readonly: true, hideOnAdd: true }, { name: 'ID Родител', type: 'text', required: true }, { name: 'ID Компонент', type: 'text', required: true }, { name: 'Количество', type: 'number', required: true, def: 1 }, { name: 'Влага се на Оп. №', type: 'number' } ] },
  marshruti: { label: '🔄 Маршрутни карти', table: 'marshruti', key: 'id', fields: [ { name: 'id', type: 'number', readonly: true, hideOnAdd: true }, { name: 'Код на детайла', type: 'text', required: true }, { name: '№ Операция', type: 'number', required: true, def: 10 }, { name: 'Име на операция', type: 'text', required: true }, { name: 'Машина', type: 'text' }, { name: 'Норма (мин/бр)', type: 'number', label: 'Норма (мин/бр)' }, { name: 'Описание', type: 'text' }, { name: 'Инструкция за оставяне', type: 'text' }, { name: 'Линк към чертеж', type: 'text' }, { name: 'Линк към СОП', type: 'text' } ] },
  otcheti: { label: '📊 Отчети (Log)', table: 'otcheti', key: 'id', fields: [ { name: 'id', type: 'number', readonly: true, hideOnAdd: true }, { name: 'ID План', type: 'text' }, { name: 'ID Детайл', type: 'text', required: true }, { name: 'Операция', type: 'text', required: true }, { name: 'Количество', type: 'number', def: 1, required: true }, { name: 'Статус', type: 'select', options: ['Отчетено', 'Брак', 'Изпратено'], required: true }, { name: 'Оператор', type: 'text', required: true }, { name: 'Време Старт', type: 'text', label: 'Време Старт' }, { name: 'Дата', type: 'text', label: 'Време Край (Дата)', def: () => new Date().toISOString() } ] },
  brak: { label: '🗑️ Папка БРАК', table: 'otcheti', key: 'id', readOnlyTab: true, fields: [ { name: 'id', type: 'number', readonly: true, hideOnAdd: true }, { name: 'Дата', type: 'text' }, { name: 'ID Детайл', type: 'text' }, { name: 'Количество', type: 'number' }, { name: 'Операция', type: 'text' }, { name: 'Оператор', type: 'text' }, { name: 'Статус', type: 'text' } ] },
  porachki: { label: '🛒 Поръчки материали', table: 'porachki_materiali', key: 'id', hiddenTab: true, fields: [ { name: 'id', type: 'number', readonly: true, hideOnAdd: true }, { name: 'Материал', type: 'text', required: true }, { name: 'Дата на поръчка', type: 'date', def: () => new Date().toISOString().split('T')[0] }, { name: 'Доставчик', type: 'text' }, { name: 'Имейл на доставчик', type: 'text' }, { name: 'Количество', type: 'number', required: true, def: 1 }, { name: 'Дата на приемане', type: 'date' }, { name: 'Статус', type: 'select', options: ['Поръчано', 'Прието'], required: true, def: 'Поръчано' } ] },
  archives: { label: '📁 Месечни Архиви', table: 'plan_archives', readOnlyTab: true, fields: [] },
  tooling_sklad: { 
    label: '🛠️ Склад Инструментална Екипировка', 
    table: 'tooling_inventory', 
    key: 'id', 
    fields: [ 
      { name: 'id', type: 'number', readonly: true, hideOnAdd: true }, 
      { name: 'item_code', label: 'Код / Тип на пластина / инструмент', type: 'text', required: true }, 
      { name: 'name', label: 'Наименование / Описание', type: 'text', required: true }, 
      { name: 'machine_name', label: 'За коя машина / пост', type: 'select', options: [] }, 
      { name: 'quantity', label: 'Текуща наличност', type: 'number', def: 0 }, 
      { name: 'min_quantity', label: 'Минимален буфер', type: 'number', def: 0 }, 
      { name: 'pack_size', label: '📦 Бр. в кутия / опаковка', type: 'number', def: 10 }, 
      { name: 'unit', label: 'Мярка', type: 'text', def: 'бр.' }, 
      { name: 'supplier', label: 'Доставчик', type: 'text' }, 
      { name: 'order_status', label: 'Статус на доставка', type: 'select', options: ['Налично', 'Критично (за поръчка)', 'Поръчано', 'Чака доставка'], def: 'Налично' }, 
      { name: 'notes', label: 'Забележки', type: 'text' } 
    ] 
  },
  factory_tools: { 
    label: '📐 Малки Инструменти & Уреди', 
    table: 'factory_tools', 
    key: 'id', 
    fields: [ 
      { name: 'id', type: 'number', readonly: true, hideOnAdd: true }, 
      { name: 'tool_code', label: 'Инвентарен № (напр. Ш-01, В-01)', type: 'text', required: true }, 
      { name: 'tool_name', label: 'Име / Тип на уреда', type: 'text', required: true }, 
      { name: 'category', label: 'Категория', type: 'select', options: ['Измервателен уред', 'Електрически инструмент', 'Ръчен инструмент', 'Калибър', 'Други'], def: 'Измервателен уред' }, 
      { name: 'workstation_name', label: 'Зачислено към Работно място / Машина', type: 'select', options: [] }, 
      { name: 'serial_number', label: 'Фабричен сериен №', type: 'text' }, 
      { name: 'calibration_date', label: 'Последна проверка / калибрация', type: 'date' }, 
      { name: 'calibration_due', label: 'Валидна до', type: 'date' }, 
      { name: 'status', label: 'Статус', type: 'select', options: ['active', 'calibration', 'repair', 'broken', 'retired'], def: 'active' }, 
      { name: 'notes', label: 'Забележки', type: 'text' } 
    ] 
  },
  workstations: { 
    label: '🏭 Работни Места & Машини', 
    table: 'factory_machines', 
    key: 'id', 
    fields: [ 
      { name: 'id', type: 'number', readonly: true, hideOnAdd: true }, 
      { name: 'code', label: 'Номер (напр. 101, 201, 301)', type: 'text', required: true }, 
      { name: 'name', label: 'Име на машина / пост', type: 'text', required: true }, 
      { name: 'floor', label: 'Етаж', type: 'select', options: ['Етаж 1', 'Етаж 2', 'Етаж 3'], def: 'Етаж 1' }, 
      { name: 'department', label: 'Цех / Местоположение', type: 'text' }, 
      { name: 'model', label: 'Модел / Производител', type: 'text' }, 
      { name: 'status', label: 'Статус', type: 'select', options: ['active', 'maintenance'], def: 'active' } 
    ] 
  },
  equipment_protocols: { 
    label: '🦺 Приемо-Предавателни Протоколи', 
    table: 'equipment_protocols', 
    key: 'id', 
    fields: [ 
      { name: 'id', type: 'number', readonly: true, hideOnAdd: true }, 
      { name: 'protocol_number', label: 'Протокол №', type: 'text', required: true }, 
      { name: 'worker_name', label: 'Служител', type: 'text', required: true }, 
      { name: 'worker_email', label: 'Имейл', type: 'text', required: true }, 
      { name: 'handed_by', label: 'Предал', type: 'text', required: true }, 
      { name: 'status', label: 'Статус', type: 'select', options: ['Чака подпис', 'Приет', 'Върнат', 'Бракуван'], def: 'Чака подпис' }, 
      { name: 'signed_at', label: 'Подписан на', type: 'text', readonly: true }, 
      { name: 'notes', label: 'Забележки', type: 'text' } 
    ] 
  }
};

let currentTab = 'plan'; 
let globalRows = []; 
let currentRenderedRows = []; 
let selectedIndices = new Set();
let isEditMode = false; 
let editingIndex = null; 
let currentFolderEmail = '';
