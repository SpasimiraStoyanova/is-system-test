// ==============================================================================
// 💰 МОДУЛ "ЗАПЛАТИ, БОНУСИ & МОТИВАЦИОННА СИСТЕМА" (AMCI MES v2)
// Формула:
// Месечна премия = [ Базова премия × Коефициент присъствие ×
//   ( 30% × Резултат 3S + 60% × Резултат Дисциплина + 10% × Оценка ръководител )
// ] + Поощрения (EUR)
// ==============================================================================

const MONTH_NAMES_BG = [
    'Януари', 'Февруари', 'Март', 'Април', 'Май', 'Юни',
    'Юли', 'Август', 'Септември', 'Октомври', 'Ноември', 'Декември'
];

const BONUS_CONSTANTS = {
    SHIFT_START_HOUR: 8,
    DEFAULT_GRACE_MINUTES: 0,      // След 08:00 ч.
    DEFAULT_NOMINAL_DAYS: 20,      // 20 работни дни × 8 часа
    HOURS_PER_DAY: 8,
    MAX_3S_INDIVIDUAL: 60,         // 25% тежест
    MAX_3S_AREA: 12,               // 5% тежест
    MAX_3S_TOTAL: 72,              // 30% общо
    WEIGHT_3S: 0.30,
    WEIGHT_DISCIPLINE: 0.60,
    WEIGHT_MANAGER: 0.10,
    START_DISCIPLINE_POINTS: 100,
    LATE_TOLERANCE: 3,             // До 3 закъснения без санкция
    LATE_DEDUCTION: 10,            // -10 т. от 4-тото
    MISSING_REPORT_TOLERANCE: 2,   // До 2 пропуска без санкция
    MISSING_REPORT_DEDUCTION: 8,   // -8 т. от 3-тия
    WRONG_REPORT_DEDUCTION: 5,     // -5 т. (няма толеранс)
    SCRAP_DEDUCTION: 15,           // -15 т. (няма толеранс, по отметка)
    ADMIN_VIOLATION_DEDUCTION: 15, // -15 т. (няма толеранс)
    PERFECT_MONTH_BONUS_EUR: 20,   // +20 EUR
    PERFECT_MONTH_MIN_ATTENDANCE_RATIO: 0.80
};

let currentSalaryMonthIndex = new Date().getMonth();
let currentSalaryYear = new Date().getFullYear();
let currentShiftGraceMinutes = BONUS_CONSTANTS.DEFAULT_GRACE_MINUTES;

let salaryRulesCache = [];
let salaryCalculations = [];
let salaryMonthMeta = {
    nominalDays: BONUS_CONSTANTS.DEFAULT_NOMINAL_DAYS,
    detectedCollectiveOffDates: [],
    manualCollectiveOffDates: [],
    manualBaseDaysOverride: null,
    plantActiveDates: [],
    effectiveBaseDays: BONUS_CONSTANTS.DEFAULT_NOMINAL_DAYS
};
let isCalculatingSalaries = false;
let currentSalaryMonthStatus = 'Не е запазено';

const DEFAULT_BONUS_RULES = [
    {
        id: 1,
        rule_code: 'LATE_ARRIVAL',
        rule_name: 'Закъснения за смяна (след 08:00 ч.)',
        category: 'attendance',
        threshold: 3,
        calc_type: 'fixed',
        penalty_amount: 10,
        bonus_amount: 0,
        unit: 'закъснения',
        description: 'Толеранс до 3 закъснения / месец. От 4-тото се удържат -10 т. Дисциплина.',
        is_active: true
    },
    {
        id: 2,
        rule_code: 'MISSING_REPORT',
        rule_name: 'Непопълнен дневен отчет (при чекирано влизане)',
        category: 'reports',
        threshold: 2,
        calc_type: 'fixed',
        penalty_amount: 8,
        bonus_amount: 0,
        unit: 'пропуска',
        description: 'Толеранс до 2 пропуска / месец. От 3-тия се удържат -8 т. Дисциплина (отпуск/болничен не се наказват).',
        is_active: true
    },
    {
        id: 3,
        rule_code: 'WRONG_REPORT_ERR',
        rule_name: 'Грешно въведени данни в отчет',
        category: 'reports',
        threshold: 0,
        calc_type: 'fixed',
        penalty_amount: 5,
        bonus_amount: 0,
        unit: 'случая',
        description: 'Няма толеранс: -5 т. Дисциплина на случай (установен от контрольор / система).',
        is_active: true
    },
    {
        id: 4,
        rule_code: 'OPERATOR_SCRAP',
        rule_name: 'Допуснат брак по вина на оператора',
        category: 'reports',
        threshold: 0,
        calc_type: 'fixed',
        penalty_amount: 15,
        bonus_amount: 0,
        unit: 'случая',
        description: 'Няма толеранс: -15 т. Дисциплина на случай (отбелязва се с отметка върху брака / Акт ОТК).',
        is_active: true
    },
    {
        id: 5,
        rule_code: 'ADMIN_VIOLATION',
        rule_name: 'Административно нарушение',
        category: 'discipline',
        threshold: 0,
        calc_type: 'fixed',
        penalty_amount: 15,
        bonus_amount: 0,
        unit: 'случая',
        description: 'Няма толеранс: -15 т. Дисциплина на случай по доклад от прекия ръководител.',
        is_active: true
    },
    {
        id: 6,
        rule_code: 'PERFECT_ATTENDANCE',
        rule_name: 'Поощрение: Перфектен месец',
        category: 'bonus',
        threshold: 0,
        calc_type: 'fixed',
        penalty_amount: 0,
        bonus_amount: 20,
        unit: 'EUR',
        description: '+20 EUR при 0 закъснения, 0 грешки/пропуски, 0 брак по вина и пълно присъствие спрямо цеха.',
        is_active: true
    }
];

function salEsc(str) {
    return String(str == null ? '' : str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function salNorm(str) {
    return String(str || '').replace(/[\u00A0\s]+/g, ' ').trim().toLowerCase();
}

function parseSafeSalDate(raw) {
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

function toLocalIsoDate(d) {
    const dt = d instanceof Date ? d : parseSafeSalDate(d);
    if (!dt) return '';
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    const day = String(dt.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function formatBgDateFromIso(iso) {
    if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso || '';
    const [y, m, d] = iso.split('-');
    return `${d}.${m}.${y}`;
}

function getSalaryMonthWeekdays(year, monthIdx, upToTodayOnly = false) {
    const dates = [];
    const totalDays = new Date(year, monthIdx + 1, 0).getDate();
    const todayIso = toLocalIsoDate(new Date());
    for (let day = 1; day <= totalDays; day++) {
        const dt = new Date(year, monthIdx, day, 12, 0, 0);
        const dow = dt.getDay();
        if (dow === 0 || dow === 6) continue;
        const iso = toLocalIsoDate(dt);
        if (upToTodayOnly && iso >= todayIso) continue; // Не броим днес/бъдещи дни за пропуски
        dates.push(iso);
    }
    return dates;
}

// ==============================================================================
// 1. Инициализация и зареждане на правила
// ==============================================================================
window.renderSalariesTab = async function (forceRefresh = false) {
    const mainTable = document.getElementById('mainTable');
    const addNewBtn = document.getElementById('addNewBtn');
    if (mainTable) mainTable.style.display = 'none';
    if (addNewBtn) addNewBtn.style.display = 'none';

    let container = document.getElementById('salariesContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'salariesContainer';
        container.style.cssText = 'padding: 14px; width: 100%; box-sizing: border-box;';
        const wrapper = document.querySelector('.table-container');
        if (wrapper) wrapper.appendChild(container);
    }
    container.style.display = 'block';

    if (forceRefresh || salaryRulesCache.length === 0) {
        container.innerHTML = '<div style="padding:40px; text-align:center; color:#64748b; font-size:1.1em;">Зареждане на Мотивационната система... 💰</div>';
        await loadSalaryRules();
    }

    if (forceRefresh || salaryCalculations.length === 0) {
        await calculateMonthlySalaries();
    } else {
        renderSalariesLayout();
    }
};

async function loadSalaryRules() {
    salaryRulesCache = DEFAULT_BONUS_RULES.map(r => ({ ...r }));
    try {
        const { data, error } = await client.from('salary_bonus_rules').select('*').order('id', { ascending: true });
        if (!error && Array.isArray(data) && data.length > 0) {
            const dbMap = {};
            data.forEach(r => { if (r.rule_code) dbMap[r.rule_code] = r; });
            salaryRulesCache = DEFAULT_BONUS_RULES.map(def => {
                const dbRow = dbMap[def.rule_code];
                if (!dbRow) return { ...def };
                // Ако са останали старите проценти 20% FAILED_3S и т.н., взимаме активните стойности за новите кодове
                return {
                    ...def,
                    threshold: dbRow.threshold !== undefined && dbRow.threshold !== null ? Number(dbRow.threshold) : def.threshold,
                    penalty_amount: dbRow.penalty_amount !== undefined && dbRow.penalty_amount !== null ? Number(dbRow.penalty_amount) : def.penalty_amount,
                    bonus_amount: dbRow.bonus_amount !== undefined && dbRow.bonus_amount !== null ? Number(dbRow.bonus_amount) : def.bonus_amount,
                    is_active: dbRow.is_active !== undefined ? Boolean(dbRow.is_active) : def.is_active
                };
            });
        }
    } catch (e) {
        console.warn('loadSalaryRules note:', e.message);
    }
}

function getActiveRuleParam(code, fallbackObj) {
    const r = salaryRulesCache.find(x => x.rule_code === code);
    if (!r) return { ...fallbackObj, is_active: true };
    return {
        is_active: r.is_active !== false,
        threshold: Number(r.threshold ?? fallbackObj.threshold) || 0,
        penalty: Number(r.penalty_amount ?? fallbackObj.penalty) || 0,
        bonus: Number(r.bonus_amount ?? fallbackObj.bonus) || 0
    };
}

// ==============================================================================
// 2. Изчислително ядро по точната формула (30% 3S + 60% Дисциплина + 10% Рък.)
// ==============================================================================
function recomputeWorkerFormula(calc) {
    if (!calc) return;

    const lateRule = getActiveRuleParam('LATE_ARRIVAL', { threshold: BONUS_CONSTANTS.LATE_TOLERANCE, penalty: BONUS_CONSTANTS.LATE_DEDUCTION });
    const missingRule = getActiveRuleParam('MISSING_REPORT', { threshold: BONUS_CONSTANTS.MISSING_REPORT_TOLERANCE, penalty: BONUS_CONSTANTS.MISSING_REPORT_DEDUCTION });
    const wrongRule = getActiveRuleParam('WRONG_REPORT_ERR', { threshold: 0, penalty: BONUS_CONSTANTS.WRONG_REPORT_DEDUCTION });
    const scrapRule = getActiveRuleParam('OPERATOR_SCRAP', { threshold: 0, penalty: BONUS_CONSTANTS.SCRAP_DEDUCTION });
    const adminRule = getActiveRuleParam('ADMIN_VIOLATION', { threshold: 0, penalty: BONUS_CONSTANTS.ADMIN_VIOLATION_DEDUCTION });
    const perfectRule = getActiveRuleParam('PERFECT_ATTENDANCE', { threshold: 0, bonus: BONUS_CONSTANTS.PERFECT_MONTH_BONUS_EUR });

    const baseBonus = Math.max(0, parseFloat(calc.baseBonus) || 0);
    const effectiveBaseDays = Math.max(1, parseFloat(salaryMonthMeta.effectiveBaseDays) || BONUS_CONSTANTS.DEFAULT_NOMINAL_DAYS);

    // Коефициент присъствие
    const workedDays = (calc.manualWorkedDays !== null && calc.manualWorkedDays !== undefined)
        ? Math.max(0, parseFloat(calc.manualWorkedDays) || 0)
        : (calc.autoWorkedDays || 0);
    calc.effectiveWorkedDays = workedDays;
    calc.attendanceCoeff = Math.min(1.0, Math.round((workedDays / effectiveBaseDays) * 10000) / 10000);

    // 1. Компонент 3S (30% = до 72 точки: 60 инд. + 12 обща зона; без одит = 0 т.)
    const indPts = (calc.manual3sInd !== null && calc.manual3sInd !== undefined)
        ? Math.min(BONUS_CONSTANTS.MAX_3S_INDIVIDUAL, Math.max(0, parseFloat(calc.manual3sInd) || 0))
        : (calc.auto3sInd !== undefined ? calc.auto3sInd : 0);
    const areaPts = (calc.manual3sArea !== null && calc.manual3sArea !== undefined)
        ? Math.min(BONUS_CONSTANTS.MAX_3S_AREA, Math.max(0, parseFloat(calc.manual3sArea) || 0))
        : (calc.auto3sArea !== undefined ? calc.auto3sArea : 0);

    calc.score3sIndPoints = Math.round(indPts * 100) / 100;
    calc.score3sAreaPoints = Math.round(areaPts * 100) / 100;
    calc.score3sTotalPoints = Math.round((calc.score3sIndPoints + calc.score3sAreaPoints) * 100) / 100;
    calc.score3sPct = Math.round((calc.score3sTotalPoints / BONUS_CONSTANTS.MAX_3S_TOTAL) * 10000) / 100; // 0..100%

    // 2. Компонент Дисциплина (60% = старт 100 точки)
    const unexcusedLates = (calc.lates || []).filter(l => !l.isExcused);
    calc.lateCount = (calc.lates || []).length;
    calc.unexcusedLateCount = unexcusedLates.length;
    calc.excusedLateCount = calc.lateCount - calc.unexcusedLateCount;
    const lateBeyondTol = lateRule.is_active ? Math.max(0, calc.unexcusedLateCount - lateRule.threshold) : 0;
    calc.latePointsDeducted = lateBeyondTol * lateRule.penalty;

    const unexcusedMissing = (calc.missingReports || []).filter(m => !m.isExcused);
    calc.missingReportCount = (calc.missingReports || []).length;
    calc.unexcusedMissingCount = unexcusedMissing.length;
    calc.excusedMissingCount = calc.missingReportCount - calc.unexcusedMissingCount;
    const missingBeyondTol = missingRule.is_active ? Math.max(0, calc.unexcusedMissingCount - missingRule.threshold) : 0;
    calc.missingPointsDeducted = missingBeyondTol * missingRule.penalty;

    calc.wrongReportCount = (calc.wrongReports || []).length;
    calc.wrongReportPointsDeducted = wrongRule.is_active ? (calc.wrongReportCount * wrongRule.penalty) : 0;

    // Брак: само маркираните като "по вина на оператора" + ръчни актове ОТК
    const faultOtchetScraps = (calc.otchetiScraps || []).filter(s => s.isOperatorFault);
    const manualScraps = calc.manualScrapEvents || [];
    calc.operatorScrapCount = faultOtchetScraps.length + manualScraps.length;
    calc.scrapPointsDeducted = scrapRule.is_active ? (calc.operatorScrapCount * scrapRule.penalty) : 0;

    calc.adminViolationCount = (calc.adminViolations || []).length;
    calc.adminPointsDeducted = adminRule.is_active ? (calc.adminViolationCount * adminRule.penalty) : 0;

    calc.totalDisciplineDeducted = Math.round((
        calc.latePointsDeducted +
        calc.missingPointsDeducted +
        calc.wrongReportPointsDeducted +
        calc.scrapPointsDeducted +
        calc.adminPointsDeducted
    ) * 100) / 100;

    calc.disciplinePoints = Math.max(0, Math.round((BONUS_CONSTANTS.START_DISCIPLINE_POINTS - calc.totalDisciplineDeducted) * 100) / 100);
    calc.disciplinePct = calc.disciplinePoints; // 0..100%

    // 3. Компонент Оценка на ръководителя (10%)
    const mgrPct = (calc.managerScorePct !== undefined && calc.managerScorePct !== null)
        ? Math.min(100, Math.max(0, parseFloat(calc.managerScorePct)))
        : 100;
    calc.managerScorePct = Math.round(mgrPct * 100) / 100;

    // 4. Изчисляване по компоненти в EUR
    const weightedFactor = baseBonus * calc.attendanceCoeff;
    calc.eur3sInd = Math.round((weightedFactor * 0.25 * (calc.score3sIndPoints / BONUS_CONSTANTS.MAX_3S_INDIVIDUAL)) * 100) / 100;
    calc.eur3sArea = Math.round((weightedFactor * 0.05 * (calc.score3sAreaPoints / BONUS_CONSTANTS.MAX_3S_AREA)) * 100) / 100;
    calc.eur3sTotal = Math.round((calc.eur3sInd + calc.eur3sArea) * 100) / 100;

    calc.eurDiscipline = Math.round((weightedFactor * BONUS_CONSTANTS.WEIGHT_DISCIPLINE * (calc.disciplinePoints / 100)) * 100) / 100;
    calc.eurManager = Math.round((weightedFactor * BONUS_CONSTANTS.WEIGHT_MANAGER * (calc.managerScorePct / 100)) * 100) / 100;

    // 5. Поощрения (+ EUR), вкл. авто-проверка "Перфектен месец"
    const plantActiveCount = (salaryMonthMeta.plantActiveDates || []).length;
    const minDaysForPerfect = plantActiveCount > 0
        ? Math.max(1, Math.ceil(plantActiveCount * BONUS_CONSTANTS.PERFECT_MONTH_MIN_ATTENDANCE_RATIO))
        : Math.max(1, Math.ceil(effectiveBaseDays * BONUS_CONSTANTS.PERFECT_MONTH_MIN_ATTENDANCE_RATIO));

    const qualifiesPerfectAuto = perfectRule.is_active &&
        workedDays >= minDaysForPerfect &&
        calc.unexcusedLateCount === 0 &&
        calc.unexcusedMissingCount === 0 &&
        calc.wrongReportCount === 0 &&
        calc.operatorScrapCount === 0 &&
        calc.adminViolationCount === 0;

    calc.qualifiesPerfectAuto = qualifiesPerfectAuto;
    // Ако админът не е изключил изрично "Перфектен месец"
    const usePerfectBonus = (calc.perfectMonthOverride === true)
        ? true
        : (calc.perfectMonthOverride === false ? false : qualifiesPerfectAuto);
    calc.perfectMonthActive = usePerfectBonus;
    calc.perfectMonthEur = usePerfectBonus ? (perfectRule.bonus || BONUS_CONSTANTS.PERFECT_MONTH_BONUS_EUR) : 0;

    const customRewardsSum = (calc.rewards || []).reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
    const manualAdj = parseFloat(calc.manualAdjustment) || 0;
    calc.totalRewardsEur = Math.round((calc.perfectMonthEur + customRewardsSum + manualAdj) * 100) / 100;

    const maxWeightedBonus = Math.round((weightedFactor) * 100) / 100;
    const realizedCore = Math.round((calc.eur3sTotal + calc.eurDiscipline + calc.eurManager) * 100) / 100;
    calc.weightedCorePenaltyEur = Math.max(0, Math.round((maxWeightedBonus - realizedCore) * 100) / 100);

    calc.finalBonusPayout = Math.max(0, Math.round((realizedCore + calc.totalRewardsEur) * 100) / 100);
    calc.finalPayout = Math.round(((parseFloat(calc.baseSalary) || 0) + calc.finalBonusPayout) * 100) / 100;
}

window.recomputeWorkerCalculations = function (workerIdx) {
    const calc = salaryCalculations[workerIdx];
    if (!calc) return;
    recomputeWorkerFormula(calc);
    renderSalariesLayout();
};

// ==============================================================================
// 3. Събиране на данни за месеца
// ==============================================================================
window.calculateMonthlySalaries = async function () {
    const container = document.getElementById('salariesContainer');
    if (container && salaryCalculations.length === 0) {
        container.innerHTML = '<div style="padding:40px; text-align:center; color:#64748b; font-size:1.1em;"><div style="font-size:2em; margin-bottom:10px;">⚙️</div>Анализиране на чекирания, отчети, 3S одити и дисциплина...</div>';
    }

    isCalculatingSalaries = true;

    try {
        const year = currentSalaryYear;
        const monthIdx = currentSalaryMonthIndex;
        const monthName = MONTH_NAMES_BG[monthIdx];

        // Разширяваме +/- 1 ден в UTC заявката заради локалната часова зона (+02/+03), после филтрираме точно по локален месец/година
        const qFrom = new Date(Date.UTC(year, monthIdx, 0, 0, 0, 0)).toISOString();
        const qTo = new Date(Date.UTC(year, monthIdx + 1, 2, 23, 59, 59, 999)).toISOString();

        const [persRes, checkRes, auditsRes, workers3sRes, otchetiRes, savedLogsRes] = await Promise.all([
            client.from('personal').select('*').eq('Статус', 'Активен'),
            client.from('chekiraniya').select('*').gte('Време', qFrom).lte('Време', qTo).order('Време', { ascending: true }).limit(100000),
            client.from('audit_3s_logs').select('*').gte('created_at', qFrom).lte('created_at', qTo).order('created_at', { ascending: false }).limit(10000),
            client.from('audit_3s_workers').select('*').eq('is_active', true),
            client.from('otcheti').select('id, "ID Детайл", "Операция", "Количество", "Оператор", "Статус", "Дата", "Време Старт"').gte('Дата', qFrom).lte('Дата', qTo).limit(50000),
            client.from('salary_monthly_logs').select('*').eq('month', monthName).eq('year', year).then(r => r).catch(() => ({ data: [] }))
        ]);

        if (persRes.error) throw persRes.error;
        const workers = persRes.data || [];
        const allChecks = checkRes.data || [];
        const allAudits = auditsRes.data || [];
        const workers3s = workers3sRes.data || [];
        const allOtcheti = otchetiRes.data || [];
        const savedLogs = savedLogsRes.data || [];

        const savedLogsMap = {};
        let savedMonthConfig = null;
        if (savedLogs.length > 0) {
            const isApproved = savedLogs.some(s => s.status === 'Одобрено');
            currentSalaryMonthStatus = isApproved ? 'Одобрено' : 'Чернова';
            savedLogs.forEach(s => {
                if (s.worker_email) {
                    savedLogsMap[s.worker_email.toLowerCase().trim()] = s;
                    if (!savedMonthConfig && s.details_json && s.details_json.monthConfig) {
                        savedMonthConfig = s.details_json.monthConfig;
                    }
                }
            });
        } else {
            currentSalaryMonthStatus = 'Не е запазено';
        }

        // Карта на звената на служителите от audit_3s_workers
        const workerSectorMap = {};
        workers3s.forEach(w => {
            if (w.worker_name && w.sector) {
                workerSectorMap[salNorm(w.worker_name)] = String(w.sector).trim();
            }
        });

        // Филтрираме чекиранията, отчетите и 3S одитите точно за локалния месец
        const monthChecks = allChecks.filter(c => {
            const dt = parseSafeSalDate(c['Време']);
            return dt && dt.getFullYear() === year && dt.getMonth() === monthIdx;
        });

        const monthOtcheti = allOtcheti.filter(o => {
            const dt = parseSafeSalDate(o['Дата']);
            return dt && dt.getFullYear() === year && dt.getMonth() === monthIdx;
        });

        const monthAudits = allAudits.filter(a => {
            const dt = parseSafeSalDate(a.audit_date || a.created_at);
            return dt && dt.getFullYear() === year && dt.getMonth() === monthIdx;
        });

        // Засичаме колективната активност на цеха по дати (за общи почивни дни като "миналия четвъртък")
        const activeWorkersEmails = new Set(workers.map(w => salNorm(w['Имейл'])));
        const checkinsByDate = {};
        monthChecks.forEach(c => {
            if (c['Действие'] !== 'Влизане') return;
            const em = salNorm(c['Имейл']);
            if (activeWorkersEmails.size > 0 && !activeWorkersEmails.has(em)) return;
            const iso = toLocalIsoDate(c['Време']);
            if (!iso) return;
            if (!checkinsByDate[iso]) checkinsByDate[iso] = new Set();
            checkinsByDate[iso].add(em);
        });

        const pastWeekdays = getSalaryMonthWeekdays(year, monthIdx, true);
        const plantActiveDates = Object.keys(checkinsByDate).filter(iso => checkinsByDate[iso].size >= 1).sort();
        const peakDailyCount = plantActiveDates.reduce((m, iso) => Math.max(m, checkinsByDate[iso].size), 0);
        const plantPresenceThreshold = peakDailyCount >= 3 ? Math.max(2, Math.floor(peakDailyCount * 0.2)) : 1;

        const detectedCollectiveOffDates = [];
        if (plantActiveDates.length >= 2) {
            pastWeekdays.forEach(iso => {
                // Ако преди този ден или след него цехът има активни дни, но в този делничен ден присъствието е под прага -> общ почивен ден
                const count = checkinsByDate[iso] ? checkinsByDate[iso].size : 0;
                if (count < plantPresenceThreshold) {
                    detectedCollectiveOffDates.push(iso);
                }
            });
        }

        const nominalDays = (savedMonthConfig && savedMonthConfig.nominalDays)
            ? Number(savedMonthConfig.nominalDays)
            : BONUS_CONSTANTS.DEFAULT_NOMINAL_DAYS;
        const manualOffDates = (savedMonthConfig && Array.isArray(savedMonthConfig.manualCollectiveOffDates))
            ? savedMonthConfig.manualCollectiveOffDates
            : null;
        const ignoredDetectedOffDates = (savedMonthConfig && Array.isArray(savedMonthConfig.ignoredDetectedOffDates))
            ? savedMonthConfig.ignoredDetectedOffDates
            : [];

        const effectiveOffSet = new Set(
            manualOffDates !== null
                ? manualOffDates
                : detectedCollectiveOffDates.filter(d => !ignoredDetectedOffDates.includes(d))
        );

        const manualBaseOverride = (savedMonthConfig && savedMonthConfig.manualBaseDaysOverride !== undefined)
            ? savedMonthConfig.manualBaseDaysOverride
            : null;

        const autoEffectiveBaseDays = Math.max(1, nominalDays - effectiveOffSet.size);
        salaryMonthMeta = {
            nominalDays: nominalDays,
            detectedCollectiveOffDates: detectedCollectiveOffDates,
            manualCollectiveOffDates: Array.from(effectiveOffSet).sort(),
            ignoredDetectedOffDates: ignoredDetectedOffDates,
            manualBaseDaysOverride: manualBaseOverride,
            plantActiveDates: plantActiveDates.filter(d => !effectiveOffSet.has(d) && checkinsByDate[d].size >= plantPresenceThreshold),
            effectiveBaseDays: (manualBaseOverride !== null && manualBaseOverride > 0) ? manualBaseOverride : autoEffectiveBaseDays
        };

        // Индекс на общите 3S одити по звено (target_type === 'area')
        const areaAuditsBySector = {};
        monthAudits.forEach(a => {
            if (a.target_type === 'area' && a.sector) {
                const secKey = salNorm(a.sector);
                if (!areaAuditsBySector[secKey]) areaAuditsBySector[secKey] = [];
                areaAuditsBySector[secKey].push(a);
            }
        });

        const todayIso = toLocalIsoDate(new Date());
        const results = [];

        workers.forEach(worker => {
            const email = String(worker['Имейл'] || '').toLowerCase().trim();
            const name = String(worker['Име'] || email).trim();
            const nameNorm = salNorm(name);
            const position = worker['Длъжност'] || 'Служител';
            const saved = savedLogsMap[email] || null;
            const savedDetails = (saved && saved.details_json) ? saved.details_json : {};

            // 1. Чекирания, Присъствие (дни/часове) & Закъснения (> 08:00 ч.)
            const workerChecks = monthChecks.filter(c => salNorm(c['Имейл']) === email);
            const presentDatesSet = new Set();
            const firstInByDate = {};
            const lastOutByDate = {};
            const lates = [];
            let totalCheckIns = 0;

            workerChecks.forEach(c => {
                const act = String(c['Действие'] || '').trim();
                const d = parseSafeSalDate(c['Време']);
                if (!d) return;
                const iso = toLocalIsoDate(d);
                if (!iso) return;

                if (act === 'Влизане') {
                    totalCheckIns++;
                    presentDatesSet.add(iso);
                    if (!firstInByDate[iso] || d < firstInByDate[iso].dateObj) {
                        firstInByDate[iso] = { dateObj: d, checkRow: c };
                    }
                } else if (act === 'Излизане' || act === 'Авто излизане') {
                    if (!lastOutByDate[iso] || d > lastOutByDate[iso].dateObj) {
                        lastOutByDate[iso] = { dateObj: d };
                    }
                }
            });

            let workedHours = 0;
            Object.keys(firstInByDate).sort().forEach(iso => {
                const inInfo = firstInByDate[iso];
                const d = inInfo.dateObj;
                const outInfo = lastOutByDate[iso];
                if (outInfo && outInfo.dateObj > d) {
                    const hrs = Math.min(14, Math.max(0.5, (outInfo.dateObj - d) / 3600000));
                    workedHours += hrs;
                } else {
                    workedHours += BONUS_CONSTANTS.HOURS_PER_DAY;
                }

                // Проверка за закъснение (първо влизане за деня > 08:00 + grace)
                const localH = d.getHours();
                const localM = d.getMinutes();
                const totalMinsFromMidnight = localH * 60 + localM;
                const shiftCutoffMins = BONUS_CONSTANTS.SHIFT_START_HOUR * 60 + (parseInt(currentShiftGraceMinutes, 10) || 0);
                if (totalMinsFromMidnight > shiftCutoffMins) {
                    const minLate = totalMinsFromMidnight - (BONUS_CONSTANTS.SHIFT_START_HOUR * 60);
                    lates.push({
                        isoDate: iso,
                        dateStr: d.toLocaleDateString('bg-BG'),
                        timeStr: d.toLocaleTimeString('bg-BG', { hour: '2-digit', minute: '2-digit' }),
                        minutesLate: minLate,
                        location: inInfo.checkRow['Локация'] || '',
                        note: inInfo.checkRow['Бележка'] || '',
                        isExcused: false,
                        excuseNote: ''
                    });
                }
            });

            const savedLates = Array.isArray(savedDetails.lates) ? savedDetails.lates : [];
            lates.forEach(l => {
                const sl = savedLates.find(s => (s.isoDate && s.isoDate === l.isoDate) || (s.dateStr === l.dateStr && s.timeStr === l.timeStr));
                if (sl && sl.isExcused) {
                    l.isExcused = true;
                    l.excuseNote = sl.excuseNote || 'Оправдано';
                }
            });

            // 2. Отчети за месеца (Непопълнен дневен отчет + Брак записи)
            const workerOtcheti = monthOtcheti.filter(o => {
                const op = salNorm(o['Оператор']);
                return op === email || op === nameNorm || (nameNorm.length >= 3 && op.includes(nameNorm));
            });

            const reportedDatesSet = new Set();
            const otchetiScraps = [];
            workerOtcheti.forEach(o => {
                const iso = toLocalIsoDate(o['Дата']);
                if (iso) reportedDatesSet.add(iso);
                if (String(o['Статус'] || '').trim() === 'Брак') {
                    otchetiScraps.push({
                        id: o.id,
                        isoDate: iso,
                        dateStr: formatBgDateFromIso(iso),
                        partCode: o['ID Детайл'] || '',
                        opName: o['Операция'] || '',
                        qty: parseFloat(o['Количество']) || 0,
                        isOperatorFault: false,
                        note: ''
                    });
                }
            });

            // Възстановяване на отметките "По вина на оператора" върху брака
            const savedScrapFaults = savedDetails.scrapFaultMap || {};
            otchetiScraps.forEach(s => {
                const fRec = savedScrapFaults[String(s.id)];
                if (fRec && fRec.isOperatorFault) {
                    s.isOperatorFault = true;
                    s.note = fRec.note || '';
                }
            });

            // Пропуснати дневни отчети: само за минали дати (iso < todayIso), на които служителят е дошъл на работа (и не е общ почивен ден)
            const missingReports = [];
            Array.from(presentDatesSet).sort().forEach(iso => {
                if (iso >= todayIso) return; // Денят още не е приключил
                if (effectiveOffSet.has(iso)) return;
                if (!reportedDatesSet.has(iso)) {
                    missingReports.push({
                        isoDate: iso,
                        dateStr: formatBgDateFromIso(iso),
                        isExcused: false,
                        excuseNote: ''
                    });
                }
            });

            const savedMissing = Array.isArray(savedDetails.missingReports) ? savedDetails.missingReports : [];
            missingReports.forEach(m => {
                const sm = savedMissing.find(s => s.isoDate === m.isoDate);
                if (sm && sm.isExcused) {
                    m.isExcused = true;
                    m.excuseNote = sm.excuseNote || 'Оправдано';
                }
            });

            // 3. 3S Одити (Индивидуални до 60 т. + Обща зона на звеното до 12 т.)
            const workerIndAudits = monthAudits
                .filter(a => a.target_type !== 'area' && (salNorm(a.target_name) === email || salNorm(a.target_name) === nameNorm))
                .map(a => ({ ...a, isExcused: false, excuseNote: '' }));

            const savedIndAuditsState = Array.isArray(savedDetails.indAuditsState) ? savedDetails.indAuditsState : [];
            workerIndAudits.forEach(a => {
                const hit = savedIndAuditsState.find(s => s.id === a.id);
                if (hit && hit.isExcused) {
                    a.isExcused = true;
                    a.excuseNote = hit.excuseNote || 'Оправдан';
                }
            });

            // Звено на служителя
            let workerSector = workerSectorMap[nameNorm] || '';
            if (!workerSector && workerIndAudits.length > 0) {
                workerSector = workerIndAudits[0].sector || '';
            }
            const workerAreaAudits = workerSector ? (areaAuditsBySector[salNorm(workerSector)] || []) : [];

            const activeIndAudits = workerIndAudits.filter(a => !a.isExcused);
            const auto3sInd = activeIndAudits.length > 0
                ? Math.round((activeIndAudits.reduce((sum, a) => sum + ((parseFloat(a.percentage) || 0) / 100) * BONUS_CONSTANTS.MAX_3S_INDIVIDUAL, 0) / activeIndAudits.length) * 100) / 100
                : (workerIndAudits.length > 0 ? BONUS_CONSTANTS.MAX_3S_INDIVIDUAL : 0);

            const auto3sArea = workerAreaAudits.length > 0
                ? Math.round((workerAreaAudits.reduce((sum, a) => sum + ((parseFloat(a.percentage) || 0) / 100) * BONUS_CONSTANTS.MAX_3S_AREA, 0) / workerAreaAudits.length) * 100) / 100
                : 0;

            const calcObj = {
                workerEmail: email,
                workerName: name,
                position: position,
                sector: workerSector,
                baseSalary: saved ? (parseFloat(saved.base_salary) || 0) : (parseFloat(worker['Основна заплата']) || 0),
                baseBonus: saved ? (parseFloat(saved.base_bonus) || 0) : (parseFloat(worker['Базов бонус']) || 0),

                // Присъствие
                totalCheckIns: totalCheckIns,
                autoWorkedDays: presentDatesSet.size,
                manualWorkedDays: (savedDetails.manualWorkedDays !== undefined && savedDetails.manualWorkedDays !== null) ? Number(savedDetails.manualWorkedDays) : null,
                workedHours: Math.round(workedHours * 10) / 10,

                // 3S
                workerIndAudits: workerIndAudits,
                workerAreaAudits: workerAreaAudits,
                auto3sInd: auto3sInd,
                auto3sArea: auto3sArea,
                manual3sInd: (savedDetails.manual3sInd !== undefined && savedDetails.manual3sInd !== null) ? Number(savedDetails.manual3sInd) : null,
                manual3sArea: (savedDetails.manual3sArea !== undefined && savedDetails.manual3sArea !== null) ? Number(savedDetails.manual3sArea) : null,

                // Дисциплина (100 т.)
                lates: lates,
                missingReports: missingReports,
                wrongReports: Array.isArray(savedDetails.wrongReports) ? savedDetails.wrongReports : [],
                otchetiScraps: otchetiScraps,
                manualScrapEvents: Array.isArray(savedDetails.manualScrapEvents) ? savedDetails.manualScrapEvents : [],
                adminViolations: Array.isArray(savedDetails.adminViolations) ? savedDetails.adminViolations : [],

                // Оценка ръководител (10%)
                managerScorePct: (savedDetails.managerScorePct !== undefined && savedDetails.managerScorePct !== null) ? Number(savedDetails.managerScorePct) : 100,
                managerNote: savedDetails.managerNote || '',

                // Поощрения
                perfectMonthOverride: (savedDetails.perfectMonthOverride !== undefined) ? savedDetails.perfectMonthOverride : null,
                rewards: Array.isArray(savedDetails.rewards) ? savedDetails.rewards : [],
                manualAdjustment: saved ? (parseFloat(saved.manual_adjustment) || 0) : 0,
                manualNotes: saved ? (saved.manual_notes || '') : '',

                status: saved ? (saved.status || 'Чернова') : 'Чернова',
                month: monthName,
                year: year
            };

            recomputeWorkerFormula(calcObj);
            results.push(calcObj);
        });

        results.sort((a, b) => a.workerName.localeCompare(b.workerName, 'bg'));
        salaryCalculations = results;
    } catch (err) {
        console.error('Error calculating monthly salaries:', err);
        Swal.fire('Грешка при изчисление', err.message, 'error');
    } finally {
        isCalculatingSalaries = false;
        renderSalariesLayout();
    }
};

// ==============================================================================
// 4. Основен екран в Админ панела
// ==============================================================================
window.renderSalariesLayout = renderSalariesLayout;
window.renderSalariesModule = renderSalariesLayout;

function renderSalariesLayout() {
    const container = document.getElementById('salariesContainer');
    if (!container) return;

    const isViewer = typeof window.isViewerMode === 'function' && window.isViewerMode();
    const monthName = MONTH_NAMES_BG[currentSalaryMonthIndex];
    const totalWorkers = salaryCalculations.length;
    const totalBaseBonuses = salaryCalculations.reduce((acc, c) => acc + (c.baseBonus || 0), 0);
    const totalRewardsSum = salaryCalculations.reduce((acc, c) => acc + (c.totalRewardsEur || 0), 0);
    const totalNetBonusPayout = salaryCalculations.reduce((acc, c) => acc + (c.finalBonusPayout || 0), 0);
    const avgDisciplinePts = totalWorkers > 0 ? Math.round(salaryCalculations.reduce((acc, c) => acc + c.disciplinePoints, 0) / totalWorkers) : 100;
    const offDatesCount = (salaryMonthMeta.manualCollectiveOffDates || []).length;

    const html = `
        <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:14px; padding:20px; box-shadow:0 4px 6px -1px rgba(0,0,0,0.03);">
            <!-- Top Bar -->
            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; border-bottom:2px solid #f1f5f9; padding-bottom:16px; margin-bottom:16px;">
                <div>
                    <h2 style="margin:0; font-size:1.35em; font-weight:900; color:#1e293b; display:flex; align-items:center; gap:8px;">
                        <span>💰</span> Премии, 3S, Дисциплина &amp; Мотивация
                    </h2>
                    <span style="font-size:0.84em; color:#64748b;">
                        Формула: <b>30% 3S (72т.) + 60% Дисциплина (100т.) + 10% Ръководител</b> × Коеф. присъствие + Поощрения &nbsp;|&nbsp; Закъснения след <b>08:00 ч.</b>
                    </span>
                </div>
                <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
                    <select id="salaryMonthSelect" onchange="changeSalaryPeriod(this.value, document.getElementById('salaryYearSelect').value)" style="padding:7px 10px; border-radius:8px; border:1.5px solid #cbd5e1; font-weight:700; background:#ffffff; color:#1e293b; outline:none; font-size:0.9em;">
                        ${MONTH_NAMES_BG.map((m, idx) => `<option value="${idx}" ${idx === currentSalaryMonthIndex ? 'selected' : ''}>${m}</option>`).join('')}
                    </select>
                    <select id="salaryYearSelect" onchange="changeSalaryPeriod(document.getElementById('salaryMonthSelect').value, this.value)" style="padding:7px 10px; border-radius:8px; border:1.5px solid #cbd5e1; font-weight:700; background:#ffffff; color:#1e293b; outline:none; font-size:0.9em;">
                        ${[2025, 2026, 2027].map(y => `<option value="${y}" ${y === currentSalaryYear ? 'selected' : ''}>${y} г.</option>`).join('')}
                    </select>
                    <button type="button" class="btn-primary" onclick="calculateMonthlySalaries()" style="padding:7px 13px; font-size:0.86em; background:#2563eb;">⚡ Пресметни</button>
                    <button type="button" class="btn-primary" onclick="openBonusRulesModal()" style="padding:7px 13px; font-size:0.86em; background:#4f46e5;">⚙️ Правила</button>
                    <button type="button" class="btn-primary" onclick="exportSalariesToExcel()" style="padding:7px 13px; font-size:0.86em; background:#059669;">📥 Excel</button>
                    ${isViewer ? '' : `
                    <button type="button" class="btn-primary" onclick="saveMonthlySalariesToDb('Чернова')" style="padding:7px 13px; font-size:0.86em; background:#475569;">💾 Чернова</button>
                    ${currentSalaryMonthStatus === 'Одобрено'
                        ? `<button type="button" class="btn-primary" onclick="unpublishMonthlySalaries()" style="padding:7px 13px; font-size:0.86em; background:#ea580c;">↩️ Върни в чернова</button>`
                        : `<button type="button" class="btn-primary" onclick="publishMonthlySalariesToTerminals()" style="padding:7px 13px; font-size:0.86em; background:#16a34a; box-shadow:0 2px 6px rgba(22,163,74,0.35);">📤 Одобри и Публикувай</button>`
                    }`}
                </div>
            </div>

            <!-- Calendar & Status Bar -->
            <div style="margin-bottom:16px; padding:11px 14px; border-radius:10px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; background:${currentSalaryMonthStatus === 'Одобрено' ? '#f0fdf4' : currentSalaryMonthStatus === 'Чернова' ? '#fefce8' : '#f8fafc'}; border:1px solid ${currentSalaryMonthStatus === 'Одобрено' ? '#86efac' : currentSalaryMonthStatus === 'Чернова' ? '#fde047' : '#cbd5e1'};">
                <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
                    <span style="font-size:0.85em; font-weight:700; color:#475569;">Статус:</span>
                    ${currentSalaryMonthStatus === 'Одобрено'
                        ? `<span style="background:#16a34a; color:#fff; padding:3px 10px; border-radius:9999px; font-size:0.78em; font-weight:800;">🟢 ОДОБРЕНО (видимо на терминалите)</span>`
                        : currentSalaryMonthStatus === 'Чернова'
                            ? `<span style="background:#ca8a04; color:#fff; padding:3px 10px; border-radius:9999px; font-size:0.78em; font-weight:800;">🟡 ЧЕРНОВА (работен вариант)</span>`
                            : `<span style="background:#64748b; color:#fff; padding:3px 10px; border-radius:9999px; font-size:0.78em; font-weight:800;">⚪ НЕ Е ЗАПАЗЕНО</span>`
                    }
                </div>
                <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; font-size:0.85em;">
                    <label style="font-weight:800; color:#1e293b;">📅 База работни дни (${monthName}):</label>
                    <input type="number" min="1" max="31" value="${salaryMonthMeta.effectiveBaseDays}" ${isViewer ? 'disabled' : ''}
                           onchange="setMonthWorkingDaysOverride(this.value)"
                           style="width:58px; padding:4px 6px; border:1.5px solid #94a3b8; border-radius:6px; font-weight:900; text-align:center; color:#1e40af; background:#ffffff;">
                    <span style="color:#475569;">(${salaryMonthMeta.effectiveBaseDays * 8} ч.${offDatesCount > 0 ? ` • <b>${offDatesCount}</b> общ почивен` : ''})</span>
                    <button type="button" onclick="openMonthCalendarSettingsModal()" style="padding:4px 10px; background:#eff6ff; color:#1d4ed8; border:1px solid #bfdbfe; border-radius:6px; font-weight:800; cursor:pointer; font-size:0.9em;">
                        🗓️ Почивни дни (${offDatesCount})
                    </button>
                </div>
            </div>

            <!-- KPI Cards -->
            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(175px, 1fr)); gap:12px; margin-bottom:18px;">
                <div style="background:#f8fafc; border:1px solid #cbd5e1; border-radius:10px; padding:11px 14px;">
                    <div style="font-size:0.74em; font-weight:800; color:#64748b; text-transform:uppercase;">👥 Служители</div>
                    <div style="font-size:1.5em; font-weight:900; color:#1e293b;">${totalWorkers} души</div>
                    <div style="font-size:0.75em; color:#64748b;">Активни дни на цеха: <b>${salaryMonthMeta.plantActiveDates.length}</b></div>
                </div>
                <div style="background:#eff6ff; border:1px solid #bfdbfe; border-radius:10px; padding:11px 14px;">
                    <div style="font-size:0.74em; font-weight:800; color:#1d4ed8; text-transform:uppercase;">💶 Фонд Базови Премии</div>
                    <div style="font-size:1.5em; font-weight:900; color:#1e40af;">${totalBaseBonuses.toFixed(2)} €</div>
                    <div style="font-size:0.75em; color:#3b82f6;">База: ${salaryMonthMeta.nominalDays} д. × 8 ч.</div>
                </div>
                <div style="background:#faf5ff; border:1px solid #e9d5ff; border-radius:10px; padding:11px 14px;">
                    <div style="font-size:0.74em; font-weight:800; color:#6b21a8; text-transform:uppercase;">⚖️ Средна Дисциплина</div>
                    <div style="font-size:1.5em; font-weight:900; color:#7c3aed;">${avgDisciplinePts} / 100 т.</div>
                    <div style="font-size:0.75em; color:#6b21a8;">60% тежест в премията</div>
                </div>
                <div style="background:#fffbeb; border:1px solid #fde68a; border-radius:10px; padding:11px 14px;">
                    <div style="font-size:0.74em; font-weight:800; color:#92400e; text-transform:uppercase;">🎁 Общо Поощрения</div>
                    <div style="font-size:1.5em; font-weight:900; color:#d97706;">+${totalRewardsSum.toFixed(2)} €</div>
                    <div style="font-size:0.75em; color:#b45309;">Kaizen / Обучение / Перф. месец</div>
                </div>
                <div style="background:#f0fdf4; border:1.5px solid #86efac; border-radius:10px; padding:11px 14px;">
                    <div style="font-size:0.74em; font-weight:800; color:#15803d; text-transform:uppercase;">🟢 Общо за изплащане</div>
                    <div style="font-size:1.5em; font-weight:900; color:#166534;">${totalNetBonusPayout.toFixed(2)} €</div>
                    <div style="font-size:0.75em; color:#15803d;">Крайни месечни премии</div>
                </div>
            </div>

            <!-- Table -->
            <div style="overflow-x:auto; border:1px solid #e2e8f0; border-radius:10px;">
                <table style="width:100%; border-collapse:collapse; font-size:0.86em; text-align:left;">
                    <thead>
                        <tr style="background:#f8fafc; color:#475569; border-bottom:1.5px solid #cbd5e1;">
                            <th style="padding:10px 10px; min-width:190px;">Служител</th>
                            <th style="padding:10px 8px; text-align:center;">Базова премия (€)</th>
                            <th style="padding:10px 8px; text-align:center;">Присъствие (Коеф.)</th>
                            <th style="padding:10px 8px; text-align:center;">3S Одит (30%)</th>
                            <th style="padding:10px 8px; text-align:center;">Дисциплина (60%)</th>
                            <th style="padding:10px 8px; text-align:center;">Ръководител (10%)</th>
                            <th style="padding:10px 8px; text-align:center;">Поощрения (+ €)</th>
                            <th style="padding:10px 10px; text-align:right;">Крайна Премия</th>
                            <th style="padding:10px 8px; text-align:center;">Фиш</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${salaryCalculations.map((calc, idx) => {
                            const discWarn = calc.disciplinePoints < 100;
                            const hasUncheckedScrap = (calc.otchetiScraps || []).length > 0 && calc.operatorScrapCount === 0;
                            const no3sAuditAtAll = (calc.workerIndAudits || []).length === 0 && (calc.workerAreaAudits || []).length === 0 && calc.manual3sInd === null && calc.manual3sArea === null;
                            const s3sColor = no3sAuditAtAll ? '#64748b' : (calc.score3sPct >= 90 ? '#15803d' : (calc.score3sPct >= 75 ? '#b45309' : '#dc2626'));
                            const s3sBg = no3sAuditAtAll ? '#f1f5f9' : (calc.score3sPct >= 90 ? '#f0fdf4' : (calc.score3sPct >= 75 ? '#fffbeb' : '#fef2f2'));
                            return `
                                <tr style="border-bottom:1px solid #f1f5f9;" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='white'">
                                    <td style="padding:9px 10px;">
                                        <div style="font-weight:800; color:#1e293b;">${salEsc(calc.workerName)}</div>
                                        <div style="font-size:0.78em; color:#64748b;">${salEsc(calc.position)}${calc.sector ? ` • <span style="color:#6d28d9; font-weight:700;">${salEsc(calc.sector)}</span>` : ''}</div>
                                    </td>
                                    <td style="padding:9px 8px; text-align:center;">
                                        <input type="number" step="any" min="0" value="${calc.baseBonus || ''}" placeholder="0 €" ${isViewer ? 'disabled' : ''}
                                               onchange="updateWorkerBaseBonus(${idx}, this.value)"
                                               style="width:76px; padding:4px 6px; border:1px solid #cbd5e1; border-radius:6px; font-weight:800; text-align:center;">
                                    </td>
                                    <td style="padding:9px 8px; text-align:center;">
                                        <div style="display:flex; align-items:center; justify-content:center; gap:4px;">
                                            <input type="number" step="0.5" min="0" max="31" value="${calc.effectiveWorkedDays}" ${isViewer ? 'disabled' : ''}
                                                   onchange="updateWorkerWorkedDays(${idx}, this.value)" title="Отработени дни (авто: ${calc.autoWorkedDays})"
                                                   style="width:46px; padding:3px 4px; border:1px solid #cbd5e1; border-radius:5px; font-weight:800; text-align:center;">
                                            <span style="color:#64748b; font-size:0.88em;">/ ${salaryMonthMeta.effectiveBaseDays}</span>
                                        </div>
                                        <div style="font-size:0.78em; font-weight:800; color:#1d4ed8; margin-top:2px;">× ${calc.attendanceCoeff.toFixed(2)}</div>
                                    </td>
                                    <td style="padding:9px 8px; text-align:center;">
                                        <button type="button" onclick="show3sDetailsModal(${idx})" style="background:${s3sBg}; border:1px solid #cbd5e1; color:${s3sColor}; padding:4px 9px; border-radius:7px; font-weight:800; cursor:pointer; font-size:0.9em;">
                                            ${no3sAuditAtAll ? '0/72 т. (Няма одит)' : `${calc.score3sTotalPoints}/72 т. (${calc.score3sPct.toFixed(0)}%)`}
                                        </button>
                                        <div style="font-size:0.78em; color:#475569; margin-top:2px; font-weight:700;">+${calc.eur3sTotal.toFixed(2)} €</div>
                                    </td>
                                    <td style="padding:9px 8px; text-align:center;">
                                        <button type="button" onclick="showDisciplineModal(${idx})" style="background:${discWarn ? '#fef2f2' : '#f0fdf4'}; border:1px solid ${discWarn ? '#fca5a5' : '#86efac'}; color:${discWarn ? '#b91c1c' : '#15803d'}; padding:4px 9px; border-radius:7px; font-weight:800; cursor:pointer; font-size:0.9em;">
                                            ${calc.disciplinePoints}/100 т.
                                        </button>
                                        <div style="font-size:0.76em; color:#475569; margin-top:2px;">
                                            <b>+${calc.eurDiscipline.toFixed(2)} €</b>
                                            ${calc.lateCount > 0 ? ` • ⏱️${calc.unexcusedLateCount}` : ''}
                                            ${calc.missingReportCount > 0 ? ` • 📝${calc.unexcusedMissingCount}` : ''}
                                            ${hasUncheckedScrap ? ` • <span title="Има ${calc.otchetiScraps.length} техн. брак — отворете за отметка" style="color:#d97706;">🗑️${calc.otchetiScraps.length}?</span>` : ''}
                                        </div>
                                    </td>
                                    <td style="padding:9px 8px; text-align:center;">
                                        <button type="button" onclick="openManagerScoreModal(${idx})" style="background:${calc.managerScorePct < 100 ? '#fff7ed' : '#f8fafc'}; border:1px solid ${calc.managerScorePct < 100 ? '#fdba74' : '#cbd5e1'}; color:${calc.managerScorePct < 100 ? '#c2410c' : '#334155'}; padding:4px 8px; border-radius:7px; font-weight:800; cursor:pointer;">
                                            ${calc.managerScorePct}%
                                        </button>
                                        <div style="font-size:0.78em; color:#475569; margin-top:2px; font-weight:700;">+${calc.eurManager.toFixed(2)} €</div>
                                    </td>
                                    <td style="padding:9px 8px; text-align:center;">
                                        <button type="button" onclick="openRewardsModal(${idx})" style="background:${calc.totalRewardsEur > 0 ? '#fefce8' : '#f8fafc'}; border:1px solid ${calc.totalRewardsEur > 0 ? '#fde047' : '#cbd5e1'}; color:${calc.totalRewardsEur > 0 ? '#a16207' : '#64748b'}; padding:4px 9px; border-radius:7px; font-weight:800; cursor:pointer;">
                                            ${calc.totalRewardsEur >= 0 ? '+' : ''}${calc.totalRewardsEur.toFixed(2)} €
                                        </button>
                                        ${calc.perfectMonthActive ? `<div style="font-size:0.72em; color:#15803d; font-weight:800; margin-top:2px;">⭐ Перф. месец</div>` : ''}
                                    </td>
                                    <td style="padding:9px 10px; text-align:right;">
                                        <div style="font-size:1.15em; font-weight:900; color:#15803d;">${calc.finalBonusPayout.toFixed(2)} €</div>
                                        ${calc.weightedCorePenaltyEur > 0 ? `<div style="font-size:0.74em; color:#ef4444;">-${calc.weightedCorePenaltyEur.toFixed(2)} € удръжка</div>` : ''}
                                    </td>
                                    <td style="padding:9px 8px; text-align:center;">
                                        <button type="button" onclick="showWorkerPaySlip(${idx})" class="btn-primary" style="padding:5px 9px; font-size:0.8em; background:#4338ca; border-radius:6px; font-weight:800;">📜 Фиш</button>
                                    </td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;

    container.innerHTML = html;
}

window.changeSalaryPeriod = function (monthIdx, year) {
    currentSalaryMonthIndex = parseInt(monthIdx, 10);
    currentSalaryYear = parseInt(year, 10);
    calculateMonthlySalaries();
};

window.setMonthWorkingDaysOverride = function (val) {
    const num = parseFloat(val);
    salaryMonthMeta.manualBaseDaysOverride = (!isNaN(num) && num > 0) ? num : null;
    if (salaryMonthMeta.manualBaseDaysOverride) {
        salaryMonthMeta.effectiveBaseDays = salaryMonthMeta.manualBaseDaysOverride;
    } else {
        salaryMonthMeta.effectiveBaseDays = Math.max(1, salaryMonthMeta.nominalDays - (salaryMonthMeta.manualCollectiveOffDates || []).length);
    }
    salaryCalculations.forEach(c => recomputeWorkerFormula(c));
    renderSalariesLayout();
};

window.updateWorkerBaseBonus = function (idx, val) {
    if (!salaryCalculations[idx]) return;
    salaryCalculations[idx].baseBonus = Math.max(0, parseFloat(val) || 0);
    recomputeWorkerCalculations(idx);
};

window.updateWorkerWorkedDays = function (idx, val) {
    if (!salaryCalculations[idx]) return;
    if (val === '' || isNaN(parseFloat(val))) {
        salaryCalculations[idx].manualWorkedDays = null;
    } else {
        salaryCalculations[idx].manualWorkedDays = Math.max(0, parseFloat(val));
    }
    recomputeWorkerCalculations(idx);
};

// ==============================================================================
// 5. Колективни почивни дни / Календар
// ==============================================================================
window.openMonthCalendarSettingsModal = function () {
    const isViewer = typeof window.isViewerMode === 'function' && window.isViewerMode();
    const monthName = MONTH_NAMES_BG[currentSalaryMonthIndex];
    const allWeekdays = getSalaryMonthWeekdays(currentSalaryYear, currentSalaryMonthIndex, false);
    const offSet = new Set(salaryMonthMeta.manualCollectiveOffDates || []);
    const detectedSet = new Set(salaryMonthMeta.detectedCollectiveOffDates || []);

    const daysHtml = allWeekdays.map(iso => {
        const isOff = offSet.has(iso);
        const isAuto = detectedSet.has(iso);
        return `
            <label style="display:flex; align-items:center; justify-content:space-between; padding:6px 10px; border:1px solid ${isOff ? '#fde047' : '#e2e8f0'}; background:${isOff ? '#fefce8' : '#ffffff'}; border-radius:6px; cursor:pointer; font-size:0.86em;">
                <span>
                    <b>${formatBgDateFromIso(iso)}</b>
                    ${isAuto ? `<span style="background:#dbeafe; color:#1d4ed8; font-size:0.78em; padding:1px 6px; border-radius:4px; margin-left:4px;">авто-засечен (без влизания)</span>` : ''}
                </span>
                <input type="checkbox" class="cal-off-cb" value="${iso}" ${isOff ? 'checked' : ''} ${isViewer ? 'disabled' : ''}>
            </label>
        `;
    }).join('');

    Swal.fire({
        title: `🗓️ Почивни дни за цеха — ${monthName} ${currentSalaryYear}`,
        width: 560,
        html: `
            <div style="text-align:left; font-size:0.9em;">
                <div style="background:#eff6ff; border:1px solid #bfdbfe; border-radius:8px; padding:10px; margin-bottom:10px; font-size:0.85em; color:#1e40af;">
                    💡 Отметнете дните, в които целият цех е почивал (официален празник или общ платен отпуск като миналия четвъртък). Всеки отметнат ден намалява базата от <b>${salaryMonthMeta.nominalDays} работни дни</b>, така че присъствието и „Перфектен месец“ остават честни за всички.
                </div>
                <div style="margin-bottom:10px; display:flex; align-items:center; gap:8px;">
                    <label style="font-weight:700; color:#334155;">Номинални работни дни за месеца:</label>
                    <input id="calNominalDays" type="number" min="1" max="31" value="${salaryMonthMeta.nominalDays}" ${isViewer ? 'disabled' : ''} style="width:65px; padding:4px 6px; border:1px solid #cbd5e1; border-radius:6px; font-weight:800; text-align:center;">
                </div>
                <div style="max-height:280px; overflow-y:auto; display:flex; flex-direction:column; gap:5px;">
                    ${daysHtml}
                </div>
            </div>
        `,
        showCancelButton: !isViewer,
        confirmButtonText: isViewer ? 'Затвори' : '💾 Приложи календара',
        cancelButtonText: 'Отказ',
        confirmButtonColor: '#2563eb'
    }).then(res => {
        if (res.isConfirmed && !isViewer) {
            const nom = Math.max(1, parseInt(document.getElementById('calNominalDays')?.value, 10) || 20);
            const checkedOff = [];
            document.querySelectorAll('.cal-off-cb:checked').forEach(cb => checkedOff.push(cb.value));
            const ignored = (salaryMonthMeta.detectedCollectiveOffDates || []).filter(d => !checkedOff.includes(d));
            salaryMonthMeta.nominalDays = nom;
            salaryMonthMeta.manualCollectiveOffDates = checkedOff.sort();
            salaryMonthMeta.ignoredDetectedOffDates = ignored;
            salaryMonthMeta.manualBaseDaysOverride = null;
            salaryMonthMeta.effectiveBaseDays = Math.max(1, nom - checkedOff.length);
            calculateMonthlySalaries();
        }
    });
};

// ==============================================================================
// 6. Модал Дисциплина (60% — 100 т. капитал и 5 вида отклонения)
// ==============================================================================
window.showDisciplineModal = function (idx) {
    const calc = salaryCalculations[idx];
    if (!calc) return;
    const isViewer = typeof window.isViewerMode === 'function' && window.isViewerMode();

    const latesRows = (calc.lates || []).map((l, i) => `
        <tr style="border-bottom:1px solid #f1f5f9; background:${l.isExcused ? '#f0fdf4' : 'transparent'};">
            <td style="padding:6px 8px;"><b>${l.dateStr}</b> (${l.timeStr} ч., +${l.minutesLate} мин)</td>
            <td style="padding:6px 8px;">${l.isExcused ? `🕊️ Оправдано (${salEsc(l.excuseNote)})` : (i < BONUS_CONSTANTS.LATE_TOLERANCE ? '🟢 В толеранс (0 т.)' : '🔴 Над толеранс (-10 т.)')}</td>
            <td style="padding:6px 8px; text-align:right;">
                ${isViewer ? '' : `<button type="button" onclick="toggleDiscLateExcused(${idx}, ${i})" style="padding:3px 8px; border:none; border-radius:5px; font-weight:700; cursor:pointer; background:${l.isExcused ? '#64748b' : '#16a34a'}; color:#fff;">${l.isExcused ? 'Отмени' : 'Оправдай'}</button>`}
            </td>
        </tr>
    `).join('');

    const missingRows = (calc.missingReports || []).map((m, i) => `
        <tr style="border-bottom:1px solid #f1f5f9; background:${m.isExcused ? '#f0fdf4' : 'transparent'};">
            <td style="padding:6px 8px;"><b>${m.dateStr}</b> (чекирано влизане без отчет)</td>
            <td style="padding:6px 8px;">${m.isExcused ? `🕊️ Оправдано (${salEsc(m.excuseNote)})` : '⚠️ Пропуснат отчет'}</td>
            <td style="padding:6px 8px; text-align:right;">
                ${isViewer ? '' : `<button type="button" onclick="toggleDiscMissingExcused(${idx}, ${i})" style="padding:3px 8px; border:none; border-radius:5px; font-weight:700; cursor:pointer; background:${m.isExcused ? '#64748b' : '#16a34a'}; color:#fff;">${m.isExcused ? 'Отмени' : 'Оправдай'}</button>`}
            </td>
        </tr>
    `).join('');

    const scrapOtchetRows = (calc.otchetiScraps || []).map((s, i) => `
        <tr style="border-bottom:1px solid #f1f5f9; background:${s.isOperatorFault ? '#fef2f2' : 'transparent'};">
            <td style="padding:6px 8px;"><b>${s.dateStr}</b> • ${salEsc(s.partCode)} (${salEsc(s.opName)}, ${s.qty} бр.)</td>
            <td style="padding:6px 8px;">
                <label style="display:inline-flex; align-items:center; gap:6px; font-weight:700; cursor:pointer; color:${s.isOperatorFault ? '#dc2626' : '#475569'};">
                    <input type="checkbox" ${s.isOperatorFault ? 'checked' : ''} ${isViewer ? 'disabled' : ''} onchange="toggleOtchetScrapFault(${idx}, ${i}, this.checked)">
                    По вина на оператора (-15 т.)
                </label>
            </td>
        </tr>
    `).join('');

    const customEvents = [
        ...(calc.wrongReports || []).map((e, i) => ({ ...e, kind: 'wrong', idx: i, label: '📝 Грешен отчет (-5 т.)' })),
        ...(calc.manualScrapEvents || []).map((e, i) => ({ ...e, kind: 'scrap', idx: i, label: '🗑️ Акт за брак ОТК (-15 т.)' })),
        ...(calc.adminViolations || []).map((e, i) => ({ ...e, kind: 'admin', idx: i, label: '🚫 Адм. нарушение (-15 т.)' }))
    ];

    const customRows = customEvents.map(ev => `
        <tr style="border-bottom:1px solid #f1f5f9;">
            <td style="padding:6px 8px;"><b>${salEsc(ev.dateStr || '')}</b> • ${ev.label}</td>
            <td style="padding:6px 8px; color:#475569;">${salEsc(ev.note || '')}</td>
            <td style="padding:6px 8px; text-align:right;">
                ${isViewer ? '' : `<button type="button" onclick="removeManualDisciplineEvent(${idx}, '${ev.kind}', ${ev.idx})" style="padding:2px 7px; border:none; border-radius:4px; background:#fee2e2; color:#b91c1c; font-weight:800; cursor:pointer;">🗑️</button>`}
            </td>
        </tr>
    `).join('');

    Swal.fire({
        title: `⚖️ Дисциплина (60%): ${calc.workerName}`,
        width: 760,
        html: `
            <div style="text-align:left; font-size:0.88em; max-height:70vh; overflow-y:auto;">
                <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(120px, 1fr)); gap:8px; margin-bottom:12px; text-align:center;">
                    <div style="background:#f8fafc; border:1px solid #cbd5e1; border-radius:8px; padding:8px;">
                        <div style="font-size:0.75em; color:#64748b; font-weight:700;">СТАРТ / ТЕКУЩО</div>
                        <div style="font-size:1.35em; font-weight:900; color:${calc.disciplinePoints < 100 ? '#dc2626' : '#15803d'};">${calc.disciplinePoints} / 100 т.</div>
                    </div>
                    <div style="background:#fef2f2; border:1px solid #fecaca; border-radius:8px; padding:8px;">
                        <div style="font-size:0.75em; color:#b91c1c; font-weight:700;">⏱️ Закъснения</div>
                        <div style="font-weight:900; color:#dc2626;">${calc.unexcusedLateCount} (тол. 3) ➔ -${calc.latePointsDeducted} т.</div>
                    </div>
                    <div style="background:#fff7ed; border:1px solid #fed7aa; border-radius:8px; padding:8px;">
                        <div style="font-size:0.75em; color:#c2410c; font-weight:700;">📝 Без отчет</div>
                        <div style="font-weight:900; color:#ea580c;">${calc.unexcusedMissingCount} (тол. 2) ➔ -${calc.missingPointsDeducted} т.</div>
                    </div>
                    <div style="background:#fef2f2; border:1px solid #fecaca; border-radius:8px; padding:8px;">
                        <div style="font-size:0.75em; color:#991b1b; font-weight:700;">🗑️ Брак / Грешки / Адм.</div>
                        <div style="font-weight:900; color:#b91c1c;">-${calc.wrongReportPointsDeducted + calc.scrapPointsDeducted + calc.adminPointsDeducted} т.</div>
                    </div>
                </div>

                ${isViewer ? '' : `
                <div style="background:#f8fafc; border:1px solid #cbd5e1; border-radius:8px; padding:10px; margin-bottom:12px;">
                    <div style="font-weight:800; color:#1e293b; margin-bottom:6px;">➕ Регистрирай отклонение (без толеранс):</div>
                    <div style="display:flex; gap:6px; flex-wrap:wrap; align-items:center;">
                        <select id="discNewType" style="padding:6px 8px; border:1px solid #cbd5e1; border-radius:6px; font-weight:700;">
                            <option value="wrong">📝 Грешно въведен отчет (-5 т.)</option>
                            <option value="scrap">🗑️ Брак по вина / Акт ОТК (-15 т.)</option>
                            <option value="admin">🚫 Адм. нарушение (-15 т.)</option>
                        </select>
                        <input id="discNewDate" type="date" value="${toLocalIsoDate(new Date())}" style="padding:5px 8px; border:1px solid #cbd5e1; border-radius:6px;">
                        <input id="discNewNote" type="text" placeholder="Причина / Акт №..." style="flex:1; min-width:160px; padding:6px 8px; border:1px solid #cbd5e1; border-radius:6px;">
                        <button type="button" onclick="addManualDisciplineEvent(${idx})" style="padding:6px 12px; background:#dc2626; color:#fff; border:none; border-radius:6px; font-weight:800; cursor:pointer;">Добави</button>
                    </div>
                </div>
                `}

                <div style="font-weight:800; color:#334155; margin:8px 0 4px;">⏱️ Закъснения след 08:00 ч. (${calc.lates.length}):</div>
                <table style="width:100%; border-collapse:collapse; margin-bottom:10px; border:1px solid #e2e8f0;">
                    <tbody>${latesRows || '<tr><td style="padding:8px; color:#15803d;">Няма закъснения</td></tr>'}</tbody>
                </table>

                <div style="font-weight:800; color:#334155; margin:8px 0 4px;">📝 Дни с присъствие без подаден отчет (${calc.missingReports.length}):</div>
                <table style="width:100%; border-collapse:collapse; margin-bottom:10px; border:1px solid #e2e8f0;">
                    <tbody>${missingRows || '<tr><td style="padding:8px; color:#15803d;">Няма пропуснати отчети</td></tr>'}</tbody>
                </table>

                <div style="font-weight:800; color:#334155; margin:8px 0 4px;">🗑️ Отчетен Брак през терминала (сложете отметка само ако е по вина на оператора):</div>
                <table style="width:100%; border-collapse:collapse; margin-bottom:10px; border:1px solid #e2e8f0;">
                    <tbody>${scrapOtchetRows || '<tr><td style="padding:8px; color:#64748b;">Няма отчетен брак в терминалите</td></tr>'}</tbody>
                </table>

                <div style="font-weight:800; color:#334155; margin:8px 0 4px;">📌 Ръчно добавени отклонения (${customEvents.length}):</div>
                <table style="width:100%; border-collapse:collapse; border:1px solid #e2e8f0;">
                    <tbody>${customRows || '<tr><td style="padding:8px; color:#64748b;">Няма въведени отклонения</td></tr>'}</tbody>
                </table>
            </div>
        `,
        confirmButtonText: 'Готово',
        confirmButtonColor: '#2563eb'
    });
};

window.toggleDiscLateExcused = function (workerIdx, lateIdx) {
    const l = salaryCalculations[workerIdx]?.lates?.[lateIdx];
    if (!l) return;
    l.isExcused = !l.isExcused;
    l.excuseNote = l.isExcused ? 'Оправдано' : '';
    recomputeWorkerCalculations(workerIdx);
    showDisciplineModal(workerIdx);
};

window.toggleDiscMissingExcused = function (workerIdx, missIdx) {
    const m = salaryCalculations[workerIdx]?.missingReports?.[missIdx];
    if (!m) return;
    m.isExcused = !m.isExcused;
    m.excuseNote = m.isExcused ? 'Оправдано' : '';
    recomputeWorkerCalculations(workerIdx);
    showDisciplineModal(workerIdx);
};

window.toggleOtchetScrapFault = function (workerIdx, scrapIdx, isFault) {
    const s = salaryCalculations[workerIdx]?.otchetiScraps?.[scrapIdx];
    if (!s) return;
    s.isOperatorFault = Boolean(isFault);
    recomputeWorkerCalculations(workerIdx);
    showDisciplineModal(workerIdx);
};

window.addManualDisciplineEvent = function (workerIdx) {
    const calc = salaryCalculations[workerIdx];
    if (!calc) return;
    const type = document.getElementById('discNewType')?.value || 'wrong';
    const rawDate = document.getElementById('discNewDate')?.value || toLocalIsoDate(new Date());
    const note = (document.getElementById('discNewNote')?.value || '').trim();
    const entry = { isoDate: rawDate, dateStr: formatBgDateFromIso(rawDate), note: note || 'Регистрирано от ръководител' };
    if (type === 'wrong') calc.wrongReports.push(entry);
    else if (type === 'scrap') calc.manualScrapEvents.push(entry);
    else calc.adminViolations.push(entry);
    recomputeWorkerCalculations(workerIdx);
    showDisciplineModal(workerIdx);
};

window.removeManualDisciplineEvent = function (workerIdx, kind, evIdx) {
    const calc = salaryCalculations[workerIdx];
    if (!calc) return;
    if (kind === 'wrong') calc.wrongReports.splice(evIdx, 1);
    else if (kind === 'scrap') calc.manualScrapEvents.splice(evIdx, 1);
    else if (kind === 'admin') calc.adminViolations.splice(evIdx, 1);
    recomputeWorkerCalculations(workerIdx);
    showDisciplineModal(workerIdx);
};

// ==============================================================================
// 7. Модал 3S Одити (30% = 60 т. индивидуални + 12 т. обща зона)
// ==============================================================================
window.show3sDetailsModal = function (idx) {
    const calc = salaryCalculations[idx];
    if (!calc) return;
    const isViewer = typeof window.isViewerMode === 'function' && window.isViewerMode();

    const indRows = (calc.workerIndAudits || []).map((a, i) => `
        <tr style="border-bottom:1px solid #f1f5f9; background:${a.isExcused ? '#f0fdf4' : 'transparent'};">
            <td style="padding:6px 8px;"><b>${a.audit_date || (a.created_at || '').split('T')[0]}</b></td>
            <td style="padding:6px 8px;">${salEsc(a.sector || '—')}</td>
            <td style="padding:6px 8px; font-weight:900;">${a.percentage}% (${a.total_points}/${a.max_points} т.)</td>
            <td style="padding:6px 8px;">${a.photo_url ? `<a href="${salEsc(a.photo_url)}" target="_blank">🖼️ Снимка</a>` : '—'}</td>
            <td style="padding:6px 8px; text-align:right;">
                ${isViewer ? '' : `<button type="button" onclick="toggle3sIndExcused(${idx}, ${i})" style="padding:3px 8px; border:none; border-radius:5px; font-weight:700; cursor:pointer; background:${a.isExcused ? '#64748b' : '#16a34a'}; color:#fff;">${a.isExcused ? 'Отмени' : 'Оправдай'}</button>`}
            </td>
        </tr>
    `).join('');

    const areaRows = (calc.workerAreaAudits || []).map(a => `
        <tr style="border-bottom:1px solid #f1f5f9;">
            <td style="padding:6px 8px;"><b>${a.audit_date || (a.created_at || '').split('T')[0]}</b></td>
            <td style="padding:6px 8px;">${salEsc(a.target_name || '')} (${salEsc(a.sector || '')})</td>
            <td style="padding:6px 8px; font-weight:900;">${a.percentage}%</td>
            <td style="padding:6px 8px;">${a.photo_url ? `<a href="${salEsc(a.photo_url)}" target="_blank">🖼️ Снимка</a>` : '—'}</td>
        </tr>
    `).join('');

    Swal.fire({
        title: `🧹 3S Одити (30%): ${calc.workerName}`,
        width: 700,
        html: `
            <div style="text-align:left; font-size:0.88em;">
                <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:8px; margin-bottom:12px; text-align:center;">
                    <div style="background:#f8fafc; border:1px solid #cbd5e1; border-radius:8px; padding:8px;">
                        <div style="font-size:0.75em; color:#64748b; font-weight:700;">ИНДИВИДУАЛНО (25%)</div>
                        <div style="font-size:1.25em; font-weight:900; color:#1e293b;">${calc.score3sIndPoints} / 60 т.</div>
                        <div style="font-size:0.82em; color:#15803d; font-weight:700;">+${calc.eur3sInd.toFixed(2)} €</div>
                    </div>
                    <div style="background:#f8fafc; border:1px solid #cbd5e1; border-radius:8px; padding:8px;">
                        <div style="font-size:0.75em; color:#64748b; font-weight:700;">ОБЩА ЗОНА (5%)</div>
                        <div style="font-size:1.25em; font-weight:900; color:#1e293b;">${calc.score3sAreaPoints} / 12 т.</div>
                        <div style="font-size:0.82em; color:#15803d; font-weight:700;">+${calc.eur3sArea.toFixed(2)} €</div>
                    </div>
                    <div style="background:#f0fdf4; border:1px solid #86efac; border-radius:8px; padding:8px;">
                        <div style="font-size:0.75em; color:#166534; font-weight:700;">ОБЩО 3S (30%)</div>
                        <div style="font-size:1.25em; font-weight:900; color:#15803d;">${calc.score3sTotalPoints} / 72 т. (${calc.score3sPct.toFixed(1)}%)</div>
                        <div style="font-size:0.82em; color:#166534; font-weight:800;">+${calc.eur3sTotal.toFixed(2)} €</div>
                    </div>
                </div>

                ${isViewer ? '' : `
                <div style="background:#f8fafc; border:1px solid #cbd5e1; border-radius:8px; padding:10px; margin-bottom:12px; display:flex; gap:12px; flex-wrap:wrap; align-items:center;">
                    <div>
                        <label style="font-weight:700; font-size:0.85em;">Ръчно Инд. (0–60 т.):</label>
                        <input type="number" step="0.5" min="0" max="60" value="${calc.manual3sInd !== null ? calc.manual3sInd : ''}" placeholder="Авто (${calc.auto3sInd})"
                               onchange="setManual3sPoints(${idx}, 'ind', this.value)" style="width:85px; padding:4px 6px; border:1px solid #cbd5e1; border-radius:5px; text-align:center; font-weight:800;">
                    </div>
                    <div>
                        <label style="font-weight:700; font-size:0.85em;">Ръчно Обща зона (0–12 т.):</label>
                        <input type="number" step="0.5" min="0" max="12" value="${calc.manual3sArea !== null ? calc.manual3sArea : ''}" placeholder="Авто (${calc.auto3sArea})"
                               onchange="setManual3sPoints(${idx}, 'area', this.value)" style="width:85px; padding:4px 6px; border:1px solid #cbd5e1; border-radius:5px; text-align:center; font-weight:800;">
                    </div>
                </div>
                `}

                <div style="font-weight:800; color:#334155; margin:6px 0 4px;">👤 Лични 3S Одити (${calc.workerIndAudits.length}):</div>
                <table style="width:100%; border-collapse:collapse; margin-bottom:10px; border:1px solid #e2e8f0;">
                    <tbody>${indRows || '<tr><td style="padding:8px; color:#64748b;">Няма проведени лични одити (0/60 т. — няма одит)</td></tr>'}</tbody>
                </table>

                <div style="font-weight:800; color:#334155; margin:6px 0 4px;">🏭 Одити Обща зона ${calc.sector ? `(${salEsc(calc.sector)})` : '(незачислено звено)'}:</div>
                <table style="width:100%; border-collapse:collapse; border:1px solid #e2e8f0;">
                    <tbody>${areaRows || '<tr><td style="padding:8px; color:#64748b;">Няма одити за обща зона (0/12 т. — няма одит)</td></tr>'}</tbody>
                </table>
            </div>
        `,
        confirmButtonText: 'Готово',
        confirmButtonColor: '#2563eb'
    });
};

window.toggle3sIndExcused = function (workerIdx, auditIdx) {
    const calc = salaryCalculations[workerIdx];
    const a = calc?.workerIndAudits?.[auditIdx];
    if (!a) return;
    a.isExcused = !a.isExcused;
    a.excuseNote = a.isExcused ? 'Оправдан' : '';
    const active = calc.workerIndAudits.filter(x => !x.isExcused);
    calc.auto3sInd = active.length > 0
        ? Math.round((active.reduce((s, x) => s + ((parseFloat(x.percentage) || 0) / 100) * BONUS_CONSTANTS.MAX_3S_INDIVIDUAL, 0) / active.length) * 100) / 100
        : BONUS_CONSTANTS.MAX_3S_INDIVIDUAL;
    recomputeWorkerCalculations(workerIdx);
    show3sDetailsModal(workerIdx);
};

window.setManual3sPoints = function (workerIdx, field, val) {
    const calc = salaryCalculations[workerIdx];
    if (!calc) return;
    const parsed = (val === '' || isNaN(parseFloat(val))) ? null : Math.max(0, parseFloat(val));
    if (field === 'ind') calc.manual3sInd = parsed !== null ? Math.min(60, parsed) : null;
    else calc.manual3sArea = parsed !== null ? Math.min(12, parsed) : null;
    recomputeWorkerCalculations(workerIdx);
    show3sDetailsModal(workerIdx);
};

// ==============================================================================
// 8. Оценка Ръководител (10%) & Поощрения (EUR)
// ==============================================================================
window.openManagerScoreModal = function (idx) {
    const calc = salaryCalculations[idx];
    if (!calc) return;
    const isViewer = typeof window.isViewerMode === 'function' && window.isViewerMode();

    Swal.fire({
        title: `👔 Оценка на ръководителя (10%): ${calc.workerName}`,
        html: `
            <div style="text-align:left; font-size:0.9em; display:flex; flex-direction:column; gap:10px;">
                <div style="background:#f8fafc; border:1px solid #cbd5e1; border-radius:8px; padding:10px; font-size:0.85em; color:#475569;">
                    По подразбиране е <b>100%</b>. Намалява се само при обосновани случаи: отказ за съдействие при извънредни задачи, небрежно отношение извън 3S одитите или конфликтно поведение.
                </div>
                <div>
                    <label style="font-weight:800; display:block; margin-bottom:4px;">Оценка (% от 0 до 100):</label>
                    <input id="mgrScoreInp" type="number" min="0" max="100" value="${calc.managerScorePct}" ${isViewer ? 'disabled' : ''} style="width:100%; padding:8px; border:1.5px solid #cbd5e1; border-radius:6px; font-weight:900; box-sizing:border-box;">
                </div>
                <div>
                    <label style="font-weight:800; display:block; margin-bottom:4px;">Обосновка / Бележка:</label>
                    <textarea id="mgrNoteInp" ${isViewer ? 'disabled' : ''} placeholder="Причина за корекция (задължително при оценка < 100%)..." style="width:100%; height:70px; padding:8px; border:1.5px solid #cbd5e1; border-radius:6px; box-sizing:border-box;">${salEsc(calc.managerNote || '')}</textarea>
                </div>
            </div>
        `,
        showCancelButton: !isViewer,
        confirmButtonText: isViewer ? 'Затвори' : '💾 Запази оценката',
        cancelButtonText: 'Отказ',
        confirmButtonColor: '#2563eb'
    }).then(res => {
        if (res.isConfirmed && !isViewer) {
            const pct = Math.min(100, Math.max(0, parseFloat(document.getElementById('mgrScoreInp')?.value) || 0));
            const note = (document.getElementById('mgrNoteInp')?.value || '').trim();
            if (pct < 100 && !note) {
                Swal.fire('Липсва обосновка', 'При намаляване под 100% моля въведете обоснована причина.', 'warning');
                return;
            }
            calc.managerScorePct = pct;
            calc.managerNote = note;
            recomputeWorkerCalculations(idx);
        }
    });
};

window.openRewardsModal = function (idx) {
    const calc = salaryCalculations[idx];
    if (!calc) return;
    const isViewer = typeof window.isViewerMode === 'function' && window.isViewerMode();

    const rowsHtml = (calc.rewards || []).map((r, i) => `
        <tr style="border-bottom:1px solid #f1f5f9;">
            <td style="padding:6px 8px;"><b>${salEsc(r.type || 'Поощрение')}</b></td>
            <td style="padding:6px 8px; color:#475569;">${salEsc(r.note || '')}</td>
            <td style="padding:6px 8px; font-weight:900; color:#15803d; text-align:right;">+${Number(r.amount || 0).toFixed(2)} €</td>
            <td style="padding:6px 8px; text-align:right;">
                ${isViewer ? '' : `<button type="button" onclick="removeWorkerReward(${idx}, ${i})" style="border:none; background:#fee2e2; color:#b91c1c; border-radius:4px; padding:2px 6px; cursor:pointer; font-weight:800;">🗑️</button>`}
            </td>
        </tr>
    `).join('');

    Swal.fire({
        title: `🎁 Поощрения (+ EUR): ${calc.workerName}`,
        width: 660,
        html: `
            <div style="text-align:left; font-size:0.88em;">
                <div style="background:${calc.perfectMonthActive ? '#f0fdf4' : '#f8fafc'}; border:1px solid ${calc.perfectMonthActive ? '#86efac' : '#cbd5e1'}; border-radius:8px; padding:10px; margin-bottom:12px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
                    <div>
                        <b>⭐ „Перфектен месец“ (+20.00 €)</b>
                        <div style="font-size:0.82em; color:#475569;">0 закъснения, 0 грешки/пропуски, 0 брак по вина • ${calc.qualifiesPerfectAuto ? '<span style="color:#15803d; font-weight:700;">Отговаря автоматично</span>' : '<span style="color:#64748b;">Не отговаря автоматично</span>'}</div>
                    </div>
                    <label style="display:flex; align-items:center; gap:6px; font-weight:800; cursor:pointer;">
                        <input type="checkbox" ${calc.perfectMonthActive ? 'checked' : ''} ${isViewer ? 'disabled' : ''} onchange="toggleWorkerPerfectMonth(${idx}, this.checked)">
                        ${calc.perfectMonthActive ? '+20.00 €' : '0.00 €'}
                    </label>
                </div>

                ${isViewer ? '' : `
                <div style="background:#f8fafc; border:1px solid #cbd5e1; border-radius:8px; padding:10px; margin-bottom:12px;">
                    <div style="font-weight:800; color:#1e293b; margin-bottom:6px;">➕ Добави фиксирано поощрение:</div>
                    <div style="display:flex; gap:6px; flex-wrap:wrap; margin-bottom:8px;">
                        <button type="button" onclick="presetReward('Kaizen предложение', 20)" style="padding:4px 8px; background:#eff6ff; border:1px solid #bfdbfe; border-radius:5px; font-weight:700; cursor:pointer; font-size:0.84em;">💡 Kaizen (+15..30€)</button>
                        <button type="button" onclick="presetReward('Обучение на нов колега (≥80ч)', 25)" style="padding:4px 8px; background:#eff6ff; border:1px solid #bfdbfe; border-radius:5px; font-weight:700; cursor:pointer; font-size:0.84em;">🎓 Обучение (+25€)</button>
                        <button type="button" onclick="presetReward('Извънредно заместване', 30)" style="padding:4px 8px; background:#eff6ff; border:1px solid #bfdbfe; border-radius:5px; font-weight:700; cursor:pointer; font-size:0.84em;">🔄 Заместване (+20..50€)</button>
                    </div>
                    <div style="display:flex; gap:6px; flex-wrap:wrap; align-items:center;">
                        <input id="rewTypeInp" type="text" placeholder="Вид (напр. Kaizen)" style="flex:1; min-width:130px; padding:6px 8px; border:1px solid #cbd5e1; border-radius:6px;">
                        <input id="rewAmtInp" type="number" step="any" placeholder="EUR" style="width:75px; padding:6px 8px; border:1px solid #cbd5e1; border-radius:6px; font-weight:800; text-align:center;">
                        <input id="rewNoteInp" type="text" placeholder="Обосновка..." style="flex:1.4; min-width:140px; padding:6px 8px; border:1px solid #cbd5e1; border-radius:6px;">
                        <button type="button" onclick="addWorkerReward(${idx})" style="padding:6px 12px; background:#16a34a; color:#fff; border:none; border-radius:6px; font-weight:800; cursor:pointer;">Добави</button>
                    </div>
                </div>
                `}

                <table style="width:100%; border-collapse:collapse; border:1px solid #e2e8f0; margin-bottom:10px;">
                    <tbody>${rowsHtml || '<tr><td style="padding:8px; color:#64748b;">Няма добавени допълнителни поощрения</td></tr>'}</tbody>
                </table>

                <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap; padding-top:8px; border-top:1px solid #e2e8f0;">
                    <label style="font-weight:700;">Друга корекция (+/- €):</label>
                    <input type="number" step="any" value="${calc.manualAdjustment || ''}" placeholder="0" ${isViewer ? 'disabled' : ''} onchange="updateWorkerManualAdjFromModal(${idx}, this.value)" style="width:85px; padding:5px; border:1px solid #cbd5e1; border-radius:5px; font-weight:800; text-align:center;">
                    <input type="text" value="${salEsc(calc.manualNotes || '')}" placeholder="Бележка..." ${isViewer ? 'disabled' : ''} onchange="updateWorkerNotesFromModal(${idx}, this.value)" style="flex:1; padding:5px 8px; border:1px solid #cbd5e1; border-radius:5px;">
                </div>
            </div>
        `,
        confirmButtonText: 'Готово',
        confirmButtonColor: '#2563eb'
    });
};

window.presetReward = function (type, amt) {
    const t = document.getElementById('rewTypeInp');
    const a = document.getElementById('rewAmtInp');
    if (t) t.value = type;
    if (a) a.value = amt;
};

window.toggleWorkerPerfectMonth = function (workerIdx, checked) {
    const calc = salaryCalculations[workerIdx];
    if (!calc) return;
    calc.perfectMonthOverride = Boolean(checked);
    recomputeWorkerCalculations(workerIdx);
    openRewardsModal(workerIdx);
};

window.addWorkerReward = function (workerIdx) {
    const calc = salaryCalculations[workerIdx];
    if (!calc) return;
    const type = (document.getElementById('rewTypeInp')?.value || 'Поощрение').trim();
    const amount = parseFloat(document.getElementById('rewAmtInp')?.value) || 0;
    const note = (document.getElementById('rewNoteInp')?.value || '').trim();
    if (amount <= 0) {
        Swal.showValidationMessage('Въведете сума > 0 EUR');
        return;
    }
    calc.rewards.push({ type, amount, note });
    recomputeWorkerCalculations(workerIdx);
    openRewardsModal(workerIdx);
};

window.removeWorkerReward = function (workerIdx, rIdx) {
    const calc = salaryCalculations[workerIdx];
    if (!calc) return;
    calc.rewards.splice(rIdx, 1);
    recomputeWorkerCalculations(workerIdx);
    openRewardsModal(workerIdx);
};

window.updateWorkerManualAdjFromModal = function (workerIdx, val) {
    if (!salaryCalculations[workerIdx]) return;
    salaryCalculations[workerIdx].manualAdjustment = parseFloat(val) || 0;
    recomputeWorkerCalculations(workerIdx);
    openRewardsModal(workerIdx);
};

window.updateWorkerNotesFromModal = function (workerIdx, val) {
    if (!salaryCalculations[workerIdx]) return;
    salaryCalculations[workerIdx].manualNotes = String(val || '');
};

// ==============================================================================
// 9. Индивидуален Фиш (Админ преглед и печат)
// ==============================================================================
window.showWorkerPaySlip = function (index) {
    const c = salaryCalculations[index];
    if (!c) return;
    const monthName = MONTH_NAMES_BG[currentSalaryMonthIndex];
    const printDate = new Date().toLocaleDateString('bg-BG');

    const html = `
        <div id="printSlipArea" style="text-align:left; font-family:'Segoe UI', sans-serif; color:#0f172a; padding:8px;">
            <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid #0f172a; padding-bottom:10px; margin-bottom:12px;">
                <div>
                    <div style="font-size:1.25em; font-weight:900;">AMCI Производствена Система</div>
                    <div style="font-size:0.84em; color:#475569;">ФИШ ЗА МЕСЕЧНА ПРЕМИЯ И МОТИВАЦИЯ</div>
                </div>
                <div style="text-align:right;">
                    <div style="font-weight:800; color:#1e40af;">${monthName} ${c.year} г.</div>
                    <div style="font-size:0.75em; color:#64748b;">Дата: ${printDate}</div>
                </div>
            </div>

            <div style="background:#f8fafc; border:1px solid #cbd5e1; border-radius:8px; padding:10px 12px; margin-bottom:12px; display:grid; grid-template-columns:1fr 1fr; gap:6px; font-size:0.88em;">
                <div>Служител: <b>${salEsc(c.workerName)}</b></div>
                <div>Длъжност: <b>${salEsc(c.position)}</b></div>
                <div>Базова премия: <b>${c.baseBonus.toFixed(2)} €</b></div>
                <div>Присъствие: <b>${c.effectiveWorkedDays} / ${salaryMonthMeta.effectiveBaseDays} дни (× ${c.attendanceCoeff.toFixed(2)})</b></div>
            </div>

            <table style="width:100%; border-collapse:collapse; font-size:0.86em; margin-bottom:12px;">
                <thead>
                    <tr style="background:#f1f5f9; border-bottom:1.5px solid #cbd5e1;">
                        <th style="padding:7px 8px;">Компонент</th>
                        <th style="padding:7px 8px; text-align:center;">Резултат / Точки</th>
                        <th style="padding:7px 8px; text-align:right;">Сума (EUR)</th>
                    </tr>
                </thead>
                <tbody>
                    <tr style="border-bottom:1px solid #e2e8f0;">
                        <td style="padding:7px 8px;">🧹 Компонент 1: <b>3S Одит (30%)</b><br><span style="font-size:0.85em; color:#64748b;">Инд.: ${c.score3sIndPoints}/60 т. (${c.eur3sInd.toFixed(2)} €) + Обща зона: ${c.score3sAreaPoints}/12 т. (${c.eur3sArea.toFixed(2)} €)</span></td>
                        <td style="padding:7px 8px; text-align:center;"><b>${c.score3sTotalPoints}/72 т.</b> (${c.score3sPct.toFixed(1)}%)</td>
                        <td style="padding:7px 8px; text-align:right; font-weight:800; color:#15803d;">+${c.eur3sTotal.toFixed(2)} €</td>
                    </tr>
                    <tr style="border-bottom:1px solid #e2e8f0;">
                        <td style="padding:7px 8px;">⚖️ Компонент 2: <b>Дисциплина (60%)</b><br><span style="font-size:0.85em; color:#64748b;">Закъснения: -${c.latePointsDeducted}т. • Без отчет: -${c.missingPointsDeducted}т. • Грешки/Брак/Адм.: -${c.wrongReportPointsDeducted + c.scrapPointsDeducted + c.adminPointsDeducted}т.</span></td>
                        <td style="padding:7px 8px; text-align:center;"><b>${c.disciplinePoints}/100 т.</b></td>
                        <td style="padding:7px 8px; text-align:right; font-weight:800; color:#15803d;">+${c.eurDiscipline.toFixed(2)} €</td>
                    </tr>
                    <tr style="border-bottom:1px solid #e2e8f0;">
                        <td style="padding:7px 8px;">👔 Компонент 3: <b>Оценка ръководител (10%)</b>${c.managerNote ? `<br><span style="font-size:0.85em; color:#64748b;">${salEsc(c.managerNote)}</span>` : ''}</td>
                        <td style="padding:7px 8px; text-align:center;"><b>${c.managerScorePct}%</b></td>
                        <td style="padding:7px 8px; text-align:right; font-weight:800; color:#15803d;">+${c.eurManager.toFixed(2)} €</td>
                    </tr>
                    <tr style="border-bottom:1px solid #e2e8f0;">
                        <td style="padding:7px 8px;">🎁 Компонент 4: <b>Поощрения</b>${c.perfectMonthActive ? ' (вкл. Перфектен месец +20€)' : ''}</td>
                        <td style="padding:7px 8px; text-align:center;">${(c.rewards || []).length + (c.perfectMonthActive ? 1 : 0)} бр.</td>
                        <td style="padding:7px 8px; text-align:right; font-weight:800; color:#d97706;">+${c.totalRewardsEur.toFixed(2)} €</td>
                    </tr>
                    <tr style="background:#f0fdf4; font-weight:900; font-size:1.08em; border-top:2px solid #86efac;">
                        <td style="padding:10px 8px;" colspan="2">КРАЙНА МЕСЕЧНА ПРЕМИЯ:</td>
                        <td style="padding:10px 8px; text-align:right; color:#15803d;">${c.finalBonusPayout.toFixed(2)} €</td>
                    </tr>
                </tbody>
            </table>
        </div>
    `;

    Swal.fire({
        html: html,
        width: 640,
        showCancelButton: true,
        confirmButtonText: '🖨️ Разпечатай',
        cancelButtonText: 'Затвори',
        confirmButtonColor: '#2563eb'
    }).then(res => {
        if (res.isConfirmed) {
            const win = window.open('', '_blank', 'width=800,height=600');
            if (win) {
                win.document.write(`<html><head><title>Фиш - ${salEsc(c.workerName)}</title><style>body{font-family:'Segoe UI',Arial,sans-serif;padding:24px;}</style></head><body onload="window.print();window.close();">${html}</body></html>`);
                win.document.close();
            }
        }
    });
};

// ==============================================================================
// 10. Конфигуратор на правилата (Заповед)
// ==============================================================================
window.openBonusRulesModal = function () {
    const isViewer = typeof window.isViewerMode === 'function' && window.isViewerMode();
    const rulesHtml = salaryRulesCache.map((r, idx) => `
        <div style="background:#ffffff; border:1px solid #cbd5e1; border-radius:10px; padding:10px 12px; margin-bottom:8px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                <b style="color:#1e293b;">${r.category === 'bonus' ? '🟢' : '⚠️'} ${salEsc(r.rule_name)}</b>
                <label style="font-size:0.85em; font-weight:700;">
                    <input type="checkbox" ${r.is_active ? 'checked' : ''} ${isViewer ? 'disabled' : ''} onchange="salaryRulesCache[${idx}].is_active = this.checked"> Активно
                </label>
            </div>
            <div style="font-size:0.8em; color:#64748b; margin-bottom:6px;">${salEsc(r.description || '')}</div>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
                <div>
                    <label style="font-size:0.76em; font-weight:700; color:#475569;">Толеранс (${salEsc(r.unit)}):</label>
                    <input type="number" min="0" value="${r.threshold}" ${isViewer ? 'disabled' : ''} onchange="salaryRulesCache[${idx}].threshold = parseInt(this.value,10)||0" style="width:100%; padding:4px 6px; border:1px solid #cbd5e1; border-radius:4px; font-weight:bold; box-sizing:border-box;">
                </div>
                <div>
                    <label style="font-size:0.76em; font-weight:700; color:#475569;">${r.category === 'bonus' ? 'Сума (+ EUR):' : 'Удръжка (точки):'}</label>
                    <input type="number" step="any" min="0" value="${r.category === 'bonus' ? r.bonus_amount : r.penalty_amount}" ${isViewer ? 'disabled' : ''} onchange="updateBonusRuleAmount(${idx}, this.value)" style="width:100%; padding:4px 6px; border:1px solid #cbd5e1; border-radius:4px; font-weight:bold; box-sizing:border-box;">
                </div>
            </div>
        </div>
    `).join('');

    Swal.fire({
        title: '⚙️ Настройки на правилата и праговете',
        width: 660,
        html: `<div style="text-align:left; font-size:0.9em; max-height:380px; overflow-y:auto;">${rulesHtml}</div>`,
        showCancelButton: !isViewer,
        confirmButtonText: isViewer ? 'Затвори' : '💾 Запази правилата',
        cancelButtonText: 'Отказ',
        confirmButtonColor: '#2563eb'
    }).then(async res => {
        if (res.isConfirmed && !isViewer) {
            for (const rule of salaryRulesCache) {
                await client.from('salary_bonus_rules').upsert([{
                    rule_code: rule.rule_code,
                    rule_name: rule.rule_name,
                    category: rule.category,
                    threshold: rule.threshold,
                    calc_type: 'fixed',
                    penalty_amount: rule.penalty_amount,
                    bonus_amount: rule.bonus_amount,
                    unit: rule.unit,
                    description: rule.description,
                    is_active: rule.is_active,
                    updated_at: new Date().toISOString()
                }], { onConflict: 'rule_code' });
            }
            calculateMonthlySalaries();
        }
    });
};

window.updateBonusRuleAmount = function (idx, val) {
    const r = salaryRulesCache[idx];
    if (!r) return;
    const amt = parseFloat(val) || 0;
    if (r.category === 'bonus') r.bonus_amount = amt;
    else r.penalty_amount = amt;
};

// ==============================================================================
// 11. Excel експорт и Запазване / Публикуване в Supabase
// ==============================================================================
window.exportSalariesToExcel = function () {
    if (!salaryCalculations || salaryCalculations.length === 0) {
        Swal.fire('Няма данни', 'Първо пресметнете премиите.', 'info');
        return;
    }
    const monthName = MONTH_NAMES_BG[currentSalaryMonthIndex];
    const exportData = salaryCalculations.map((c, i) => ({
        "№": i + 1,
        "Служител": c.workerName,
        "Длъжност": c.position,
        "Звено": c.sector || '',
        "Базова премия (€)": c.baseBonus,
        "Отработени дни": c.effectiveWorkedDays,
        "База работни дни": salaryMonthMeta.effectiveBaseDays,
        "Коеф. присъствие": c.attendanceCoeff,
        "3S Инд. (от 60)": c.score3sIndPoints,
        "3S Обща зона (от 12)": c.score3sAreaPoints,
        "3S Общо (от 72)": c.score3sTotalPoints,
        "3S (%)": c.score3sPct,
        "3S Премия (€)": c.eur3sTotal,
        "Дисциплина (от 100)": c.disciplinePoints,
        "Закъснения (бр.)": c.lateCount,
        "Непопълнени отчети": c.missingReportCount,
        "Брак по вина (бр.)": c.operatorScrapCount,
        "Дисциплина Премия (€)": c.eurDiscipline,
        "Оценка ръководител (%)": c.managerScorePct,
        "Ръководител Премия (€)": c.eurManager,
        "Поощрения (€)": c.totalRewardsEur,
        "КРАЙНА ПРЕМИЯ (€)": c.finalBonusPayout,
        "Месец": monthName,
        "Година": c.year
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `Премии_${monthName}`);
    XLSX.writeFile(wb, `AMCI_Premii_${monthName}_${currentSalaryYear}.xlsx`);
};

window.publishMonthlySalariesToTerminals = async function () {
    if (!salaryCalculations || salaryCalculations.length === 0) return;
    const monthName = MONTH_NAMES_BG[currentSalaryMonthIndex];
    const confirm = await Swal.fire({
        title: `📤 Публикуване на фишове за ${monthName}?`,
        text: `Служителите (${salaryCalculations.length} души) ще виждат крайната си месечна премия като одобрен фиш в Личното Досие.`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: '🚀 Публикувай',
        cancelButtonText: 'Отказ',
        confirmButtonColor: '#16a34a'
    });
    if (confirm.isConfirmed) await saveMonthlySalariesToDb('Одобрено');
};

window.unpublishMonthlySalaries = async function () {
    const monthName = MONTH_NAMES_BG[currentSalaryMonthIndex];
    const confirm = await Swal.fire({
        title: `Връщане в чернова за ${monthName}?`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: '↩️ Върни в чернова',
        cancelButtonText: 'Отказ',
        confirmButtonColor: '#ea580c'
    });
    if (confirm.isConfirmed) await saveMonthlySalariesToDb('Чернова');
};

window.saveMonthlySalariesToDb = async function (targetStatus = 'Чернова') {
    if (typeof window.isViewerMode === 'function' && window.isViewerMode()) {
        return window.showViewerReadOnlyAlert();
    }
    if (!salaryCalculations || salaryCalculations.length === 0) return;

    const monthName = MONTH_NAMES_BG[currentSalaryMonthIndex];
    Swal.fire({ title: `Запазване за ${monthName}...`, allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    try {
        const monthConfigToSave = {
            nominalDays: salaryMonthMeta.nominalDays,
            manualCollectiveOffDates: salaryMonthMeta.manualCollectiveOffDates,
            ignoredDetectedOffDates: salaryMonthMeta.ignoredDetectedOffDates,
            manualBaseDaysOverride: salaryMonthMeta.manualBaseDaysOverride,
            effectiveBaseDays: salaryMonthMeta.effectiveBaseDays
        };

        const rowsToSave = salaryCalculations.map(c => {
            const scrapFaultMap = {};
            (c.otchetiScraps || []).forEach(s => {
                if (s.isOperatorFault) {
                    scrapFaultMap[String(s.id)] = { isOperatorFault: true, note: s.note || '' };
                }
            });

            return {
                month: monthName,
                year: c.year,
                worker_email: c.workerEmail,
                worker_name: c.workerName,
                position: c.position,
                base_salary: c.baseSalary || 0,
                base_bonus: c.baseBonus || 0,
                late_count: c.lateCount || 0,
                late_penalty: c.latePointsDeducted || 0,
                audit_3s_failed_count: (c.workerIndAudits || []).filter(a => !a.isExcused && (parseFloat(a.percentage) || 0) < 80).length,
                audit_3s_penalty: 0,
                report_mistakes_count: (c.unexcusedMissingCount || 0) + (c.wrongReportCount || 0) + (c.operatorScrapCount || 0),
                report_penalty: (c.missingPointsDeducted || 0) + (c.wrongReportPointsDeducted || 0) + (c.scrapPointsDeducted || 0),
                manual_adjustment: c.manualAdjustment || 0,
                manual_notes: c.manualNotes || '',
                total_penalty: c.weightedCorePenaltyEur || 0,
                total_bonus: c.totalRewardsEur || 0,
                final_payout: c.finalBonusPayout || 0,
                status: targetStatus,
                details_json: {
                    formulaVersion: 2,
                    monthConfig: monthConfigToSave,
                    sector: c.sector || '',
                    workedDays: c.effectiveWorkedDays,
                    manualWorkedDays: c.manualWorkedDays,
                    workedHours: c.workedHours,
                    baseWorkingDays: salaryMonthMeta.effectiveBaseDays,
                    attendanceCoeff: c.attendanceCoeff,
                    score3sIndPoints: c.score3sIndPoints,
                    score3sAreaPoints: c.score3sAreaPoints,
                    score3sTotalPoints: c.score3sTotalPoints,
                    score3sPct: c.score3sPct,
                    eur3sInd: c.eur3sInd,
                    eur3sArea: c.eur3sArea,
                    eur3sTotal: c.eur3sTotal,
                    manual3sInd: c.manual3sInd,
                    manual3sArea: c.manual3sArea,
                    indAuditsState: (c.workerIndAudits || []).map(a => ({ id: a.id, isExcused: !!a.isExcused, excuseNote: a.excuseNote || '' })),
                    disciplinePoints: c.disciplinePoints,
                    eurDiscipline: c.eurDiscipline,
                    latePointsDeducted: c.latePointsDeducted,
                    missingPointsDeducted: c.missingPointsDeducted,
                    wrongReportPointsDeducted: c.wrongReportPointsDeducted,
                    scrapPointsDeducted: c.scrapPointsDeducted,
                    adminPointsDeducted: c.adminPointsDeducted,
                    unexcusedLateCount: c.unexcusedLateCount,
                    excusedLateCount: c.excusedLateCount,
                    lates: c.lates || [],
                    missingReports: c.missingReports || [],
                    wrongReports: c.wrongReports || [],
                    scrapFaultMap: scrapFaultMap,
                    manualScrapEvents: c.manualScrapEvents || [],
                    adminViolations: c.adminViolations || [],
                    managerScorePct: c.managerScorePct,
                    managerNote: c.managerNote || '',
                    eurManager: c.eurManager,
                    perfectMonthOverride: c.perfectMonthOverride,
                    perfectMonthActive: c.perfectMonthActive,
                    perfectMonthEur: c.perfectMonthEur,
                    rewards: c.rewards || [],
                    totalRewardsEur: c.totalRewardsEur
                },
                updated_at: new Date().toISOString()
            };
        });

        const { error } = await client.from('salary_monthly_logs').upsert(rowsToSave, { onConflict: 'month,year,worker_email' });
        if (error) throw error;

        currentSalaryMonthStatus = targetStatus;
        salaryCalculations.forEach(c => { c.status = targetStatus; });
        renderSalariesLayout();

        Swal.fire({
            icon: 'success',
            title: targetStatus === 'Одобрено' ? 'Фишовете са публикувани!' : 'Черновата е запазена!',
            text: `Данните за ${monthName} ${currentSalaryYear} г. са записани успешно.`,
            timer: 1800,
            showConfirmButton: false
        });
    } catch (e) {
        Swal.fire('Грешка при запис', e.message, 'error');
    }
};
