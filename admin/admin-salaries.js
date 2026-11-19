// ==============================================================================
// 💰 МОДУЛ "ЗАПЛАТИ, БОНУСИ & МОТИВАЦИОННА СИСТЕМА" (AMCI MES)
// Автоматично изчисляване на бонуси и санкции според правилата на Заповедта:
// 1. Закъснения за смяна (след 08:05 ч. от Чекирания)
// 2. Спазване на 3S стандарти (от 3S Одити)
// 3. Качество и грешки при отчитане (Брак и корекции от Отчети)
// ==============================================================================

const MONTH_NAMES_BG = [
    'Януари', 'Февруари', 'Март', 'Април', 'Май', 'Юни',
    'Юли', 'Август', 'Септември', 'Октомври', 'Ноември', 'Декември'
];

let currentSalaryMonthIndex = new Date().getMonth();
let currentSalaryYear = new Date().getFullYear();
let currentShiftStartTime = "08:00";
let currentShiftGraceMinutes = 5; // толеранс до 08:05 ч.

let salaryRulesCache = [];
let salaryCalculations = [];
let isCalculatingSalaries = false;
let currentSalaryMonthStatus = 'Не е запазено';

// Първоначални правила по подразбиране (според Заповедта - в проценти спрямо Базовия Бонус)
const DEFAULT_BONUS_RULES = [
    {
        id: 1,
        rule_code: 'LATE_ARRIVAL',
        rule_name: 'Закъснения за смяна (след 08:05 ч.)',
        category: 'attendance',
        threshold: 3,
        calc_type: 'percent', // 'percent' (% от базовия бонус) или 'fixed' (твърда сума в EUR)
        penalty_amount: 10.00, // 10%
        bonus_amount: 0,
        unit: 'пъти',
        description: 'При 3 или повече закъснения за смяна след 08:05 ч. се удържат 10% от базовия бонус (на всеки 3 закъснения по -10%)',
        is_active: true
    },
    {
        id: 2,
        rule_code: 'FAILED_3S',
        rule_name: 'Неиздържан 3S одит (под 80%)',
        category: '3s',
        threshold: 1,
        calc_type: 'percent',
        penalty_amount: 20.00, // 20%
        bonus_amount: 0,
        unit: 'одита',
        description: 'При неиздържан 3S одит на работното място се удържат 20% от базовия бонус за всеки такъв одит',
        is_active: true
    },
    {
        id: 3,
        rule_code: 'WRONG_REPORT',
        rule_name: 'Грешно отчитане на детайл / Брак',
        category: 'reports',
        threshold: 3,
        calc_type: 'percent',
        penalty_amount: 15.00, // 15%
        bonus_amount: 0,
        unit: 'отчета',
        description: 'При 3 или повече грешни отчитания или брак се удържат 15% от базовия бонус (по подразбиране е изключено)',
        is_active: false
    },
    {
        id: 4,
        rule_code: 'PERFECT_ATTENDANCE',
        rule_name: 'Поощрение: Без закъснения за месеца',
        category: 'bonus',
        threshold: 0,
        calc_type: 'percent',
        penalty_amount: 0,
        bonus_amount: 0,
        unit: 'месец',
        description: 'Поощрителен бонус (изключено - без допълнителни поощрения)',
        is_active: false
    }
];

// ==============================================================================
// 1. Инициализация и показване на таба
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
        container.innerHTML = '<div style="padding:40px; text-align:center; color:#64748b; font-size:1.1em;">Зареждане на Мотивационната система и правила... 💰</div>';
        await loadSalaryRules();
    }

    if (forceRefresh || salaryCalculations.length === 0) {
        await calculateMonthlySalaries();
    } else {
        renderSalariesLayout();
    }
};

async function loadSalaryRules() {
    try {
        const { data, error } = await client.from('salary_bonus_rules').select('*').order('id', { ascending: true });
        if (!error && data && data.length > 0) {
            salaryRulesCache = data.map(r => ({
                ...r,
                calc_type: r.calc_type || 'percent'
            }));
        } else {
            // Fallback to local storage or defaults
            const saved = localStorage.getItem('amci_salary_bonus_rules');
            if (saved) {
                try { 
                    const parsed = JSON.parse(saved);
                    salaryRulesCache = parsed.map(r => ({ ...r, calc_type: r.calc_type || 'percent' }));
                } catch (e) { 
                    salaryRulesCache = [...DEFAULT_BONUS_RULES]; 
                }
            } else {
                salaryRulesCache = [...DEFAULT_BONUS_RULES];
            }
        }
    } catch (e) {
        console.warn('Salary rules load note:', e.message);
        salaryRulesCache = [...DEFAULT_BONUS_RULES];
    }
}

// Помощна функция за изчисляване на бонуси и санкции (% спрямо базовия бонус или твърда сума)
function computeWorkerBonusValues(calcData, rules) {
    const lateRule = rules.find(r => r.rule_code === 'LATE_ARRIVAL' && r.is_active);
    const auditRule = rules.find(r => r.rule_code === 'FAILED_3S' && r.is_active);
    const defectRule = rules.find(r => r.rule_code === 'WRONG_REPORT' && r.is_active);
    const perfectAttendanceRule = rules.find(r => r.rule_code === 'PERFECT_ATTENDANCE' && r.is_active);

    const baseBonus = parseFloat(calcData.baseBonus) || 0;
    const baseSalary = parseFloat(calcData.baseSalary) || 0;
    const manualAdjustment = parseFloat(calcData.manualAdjustment) || 0;

    // 1. Закъснения (проверка за ръчна глоба или изчисление по правило)
    let latePenaltyPct = 0;
    let latePenalty = 0;
    if (calcData.overrideLatePenalty !== undefined && calcData.overrideLatePenalty !== null) {
        latePenalty = parseFloat(calcData.overrideLatePenalty) || 0;
        latePenaltyPct = baseBonus > 0 ? Math.round((latePenalty / baseBonus) * 100) : 0;
    } else if (lateRule && lateRule.threshold > 0 && calcData.lateCount >= lateRule.threshold) {
        const factor = Math.floor(calcData.lateCount / lateRule.threshold);
        if (lateRule.calc_type === 'fixed') {
            latePenalty = factor * (parseFloat(lateRule.penalty_amount) || 0);
        } else {
            latePenaltyPct = factor * (parseFloat(lateRule.penalty_amount) || 0);
            latePenalty = Math.round((baseBonus * (latePenaltyPct / 100)) * 100) / 100;
        }
    }

    // 2. 3S Одити (проверка за ръчна глоба или изчисление по правило)
    let auditPenaltyPct = 0;
    let auditPenalty = 0;
    if (calcData.overrideAuditPenalty !== undefined && calcData.overrideAuditPenalty !== null) {
        auditPenalty = parseFloat(calcData.overrideAuditPenalty) || 0;
        auditPenaltyPct = baseBonus > 0 ? Math.round((auditPenalty / baseBonus) * 100) : 0;
    } else if (auditRule && calcData.failedAuditsCount >= (auditRule.threshold || 1)) {
        const count = calcData.failedAuditsCount;
        if (auditRule.calc_type === 'fixed') {
            auditPenalty = count * (parseFloat(auditRule.penalty_amount) || 0);
        } else {
            auditPenaltyPct = count * (parseFloat(auditRule.penalty_amount) || 0);
            auditPenalty = Math.round((baseBonus * (auditPenaltyPct / 100)) * 100) / 100;
        }
    }

    // 3. Отчети (Брак)
    let defectPenaltyPct = 0;
    let defectPenalty = 0;
    if (defectRule && defectRule.threshold > 0 && calcData.defectsCount >= defectRule.threshold) {
        const factor = Math.floor(calcData.defectsCount / defectRule.threshold);
        if (defectRule.calc_type === 'fixed') {
            defectPenalty = factor * (parseFloat(defectRule.penalty_amount) || 0);
        } else {
            defectPenaltyPct = factor * (parseFloat(defectRule.penalty_amount) || 0);
            defectPenalty = Math.round((baseBonus * (defectPenaltyPct / 100)) * 100) / 100;
        }
    }

    // 4. Поощрение (изключено по подразбиране, освен ако изрично не е активирано)
    let perfectBonusPct = 0;
    let perfectBonus = 0;
    if (perfectAttendanceRule && perfectAttendanceRule.is_active && (parseFloat(perfectAttendanceRule.bonus_amount) > 0) && calcData.lateCount === 0 && (calcData.totalCheckIns || 0) >= 10) {
        if (perfectAttendanceRule.calc_type === 'fixed') {
            perfectBonus = parseFloat(perfectAttendanceRule.bonus_amount) || 0;
        } else {
            perfectBonusPct = parseFloat(perfectAttendanceRule.bonus_amount) || 0;
            perfectBonus = Math.round((baseBonus * (perfectBonusPct / 100)) * 100) / 100;
        }
    }

    const totalPenalty = Math.round((latePenalty + auditPenalty + defectPenalty) * 100) / 100;
    const totalBonus = Math.round((baseBonus + perfectBonus) * 100) / 100;
    // Удръжките от бонуса не могат да доведат до отрицателен бонус фонд; ръчните корекции се добавят след това
    const netBonus = Math.max(0, totalBonus - totalPenalty);
    const finalBonusPayout = Math.round((netBonus + manualAdjustment) * 100) / 100;
    const finalPayout = Math.round((baseSalary + finalBonusPayout) * 100) / 100;

    return {
        latePenaltyPct,
        latePenalty,
        auditPenaltyPct,
        auditPenalty,
        defectPenaltyPct,
        defectPenalty,
        perfectBonusPct,
        perfectBonus,
        totalPenalty,
        totalBonus,
        finalBonusPayout,
        finalPayout
    };
}

function recomputeWorkerCalculations(workerIdx) {
    const calc = salaryCalculations[workerIdx];
    if (!calc) return;

    const unexcusedLates = (calc.lates || []).filter(l => !l.isExcused);
    const unexcusedAudits = (calc.failedAudits || []).filter(a => !a.isExcused);
    const unexcusedDefects = (calc.defects || []).filter(d => !d.isExcused);

    calc.lateCount = calc.lates ? calc.lates.length : 0;
    calc.unexcusedLateCount = unexcusedLates.length;
    calc.excusedLateCount = calc.lateCount - calc.unexcusedLateCount;

    calc.failedAuditsCount = calc.failedAudits ? calc.failedAudits.length : 0;
    calc.unexcusedAuditCount = unexcusedAudits.length;
    calc.excusedAuditCount = calc.failedAuditsCount - calc.unexcusedAuditCount;

    calc.defectsCount = calc.defects ? calc.defects.length : 0;
    calc.unexcusedDefectsCount = unexcusedDefects.length;

    const workerData = {
        baseBonus: calc.baseBonus,
        baseSalary: calc.baseSalary,
        manualAdjustment: calc.manualAdjustment,
        totalCheckIns: calc.totalCheckIns,
        lateCount: calc.unexcusedLateCount, // Само неоправданите закъснения носят удръжка!
        failedAuditsCount: calc.unexcusedAuditCount,
        defectsCount: calc.unexcusedDefectsCount,
        overrideLatePenalty: calc.overrideLatePenalty,
        overrideAuditPenalty: calc.overrideAuditPenalty
    };

    const computed = computeWorkerBonusValues(workerData, salaryRulesCache);
    Object.assign(calc, computed);

    renderSalariesLayout();
}

// ==============================================================================
// 2. Автоматично изчисляване на бонусите и удръжките за месеца
// ==============================================================================
window.calculateMonthlySalaries = async function () {
    const container = document.getElementById('salariesContainer');
    if (container && salaryCalculations.length === 0) {
        container.innerHTML = '<div style="padding:40px; text-align:center; color:#64748b; font-size:1.1em;"><div style="font-size:2em; margin-bottom:10px;">⚙️</div>Анализиране на чекирания, 3S одити и отчети за месеца...</div>';
    }

    isCalculatingSalaries = true;

    try {
        const year = currentSalaryYear;
        const monthIdx = currentSalaryMonthIndex;
        const monthName = MONTH_NAMES_BG[monthIdx];

        const dateFrom = new Date(Date.UTC(year, monthIdx, 1, 0, 0, 0)).toISOString();
        const dateTo = new Date(Date.UTC(year, monthIdx + 1, 0, 23, 59, 59, 999)).toISOString();

        // 1. Активен персонал
        const { data: personnel, error: pErr } = await client.from('personal').select('*').eq('Статус', 'Активен');
        if (pErr) throw pErr;
        const workers = personnel || [];

        // 2. Чекирания за периода
        const { data: chekiraniya, error: chErr } = await client.from('chekiraniya')
            .select('*')
            .gte('Време', dateFrom)
            .lte('Време', dateTo)
            .order('Време', { ascending: true })
            .limit(100000);
        if (chErr) console.warn('Chekiraniya fetch error:', chErr);
        const allChecks = chekiraniya || [];

        // 3. 3S Одити за периода
        const { data: audits3s, error: aErr } = await client.from('audit_3s_logs')
            .select('*')
            .gte('created_at', dateFrom)
            .lte('created_at', dateTo)
            .order('created_at', { ascending: false })
            .limit(10000);
        if (aErr) console.warn('3S audits fetch error:', aErr);
        const allAudits = audits3s || [];

        // 4. Отчети (Брак) за периода
        const { data: otcheti, error: oErr } = await client.from('otcheti')
            .select('*')
            .eq('Статус', 'Брак')
            .gte('Дата', dateFrom)
            .lte('Дата', dateTo)
            .limit(50000);
        if (oErr) console.warn('Otcheti defect fetch error:', oErr);
        const allDefects = otcheti || [];

        // 5. Проверка за предварително запазени записи за този месец от salary_monthly_logs
        let savedLogsMap = {};
        try {
            const { data: savedLogs } = await client.from('salary_monthly_logs')
                .select('*')
                .eq('month', monthName)
                .eq('year', year);
            if (savedLogs && savedLogs.length > 0) {
                const isApproved = savedLogs.some(s => s.status === 'Одобрено');
                currentSalaryMonthStatus = isApproved ? 'Одобрено' : 'Чернова';
                savedLogs.forEach(s => {
                    if (s.worker_email) savedLogsMap[s.worker_email.toLowerCase().trim()] = s;
                });
            } else {
                currentSalaryMonthStatus = 'Не е запазено';
            }
        } catch (e) {
            console.warn('salary_monthly_logs not yet queried:', e.message);
            currentSalaryMonthStatus = 'Не е запазено';
        }

        // Rules
        const lateRule = salaryRulesCache.find(r => r.rule_code === 'LATE_ARRIVAL' && r.is_active);
        const auditRule = salaryRulesCache.find(r => r.rule_code === 'FAILED_3S' && r.is_active);
        const defectRule = salaryRulesCache.find(r => r.rule_code === 'WRONG_REPORT' && r.is_active);
        const perfectAttendanceRule = salaryRulesCache.find(r => r.rule_code === 'PERFECT_ATTENDANCE' && r.is_active);

        const results = [];

        workers.forEach(worker => {
            const email = String(worker['Имейл'] || '').toLowerCase().trim();
            const name = String(worker['Име'] || email).trim();
            const position = worker['Длъжност'] || 'Служител';
            const saved = savedLogsMap[email] || null;

            // 1. Закъснения
            const workerChecks = allChecks.filter(c => String(c['Имейл'] || '').toLowerCase().trim() === email);
            const lates = [];
            let totalCheckIns = 0;

            workerChecks.forEach(c => {
                if (c['Действие'] === 'Влизане' && c['Време']) {
                    totalCheckIns++;
                    try {
                        let tStr = c['Време'];
                        if (!tStr.endsWith('Z') && !tStr.includes('+')) tStr += 'Z';
                        const d = new Date(tStr);

                        // Local time conversion
                        const localHours = d.getHours();
                        const localMinutes = d.getMinutes();

                        // Shift starts at 08:00 with grace tolerance
                        const cutoffMinutes = currentShiftGraceMinutes; // e.g. 5 min -> 08:05
                        if (localHours > 8 || (localHours === 8 && localMinutes > cutoffMinutes)) {
                            const minLate = (localHours - 8) * 60 + localMinutes;
                            lates.push({
                                dateStr: d.toLocaleDateString('bg-BG'),
                                timeStr: d.toLocaleTimeString('bg-BG', { hour: '2-digit', minute: '2-digit' }),
                                minutesLate: minLate,
                                location: c['Локация'] || '',
                                note: c['Бележка'] || '',
                                isExcused: false,
                                excuseNote: ''
                            });
                        }
                    } catch (e) { }
                }
            });

            // Възстановяване на запазени оправдавания от предишни редакции (ако има)
            const savedLates = saved?.details_json?.lates || [];
            lates.forEach(l => {
                const sl = savedLates.find(s => s.dateStr === l.dateStr && s.timeStr === l.timeStr);
                if (sl && sl.isExcused) {
                    l.isExcused = true;
                    l.excuseNote = sl.excuseNote || 'Оправдано';
                }
            });

            // 2. 3S Одити
            const workerAudits = allAudits.filter(a => {
                const target = String(a.target_name || '').toLowerCase().trim();
                return target === email || target === name.toLowerCase();
            });
            const failedAudits = workerAudits.filter(a => (parseFloat(a.percentage) || 0) < 80);
            const savedAudits = saved?.details_json?.failedAudits || [];
            failedAudits.forEach(a => {
                const aDate = a.audit_date || a.created_at?.split('T')[0];
                const sa = savedAudits.find(s => (s.id && s.id === a.id) || ((s.audit_date || s.created_at?.split('T')[0]) === aDate && s.sector === a.sector));
                if (sa && sa.isExcused) {
                    a.isExcused = true;
                    a.excuseNote = sa.excuseNote || 'Оправдано';
                }
            });

            // 3. Отчети (Брак)
            const workerDefects = allDefects.filter(o => {
                const op = String(o['Оператор'] || '').toLowerCase().trim();
                return op === email || op.includes(name.toLowerCase());
            });

            // Base values (can be overridden from saved log or personal table)
            const baseBonus = saved ? (parseFloat(saved.base_bonus) || 0) : (parseFloat(worker['Базов бонус']) || 0);
            const baseSalary = saved ? (parseFloat(saved.base_salary) || 0) : (parseFloat(worker['Основна заплата']) || 0);
            const manualAdjustment = saved ? (parseFloat(saved.manual_adjustment) || 0) : 0;
            const manualNotes = saved ? (saved.manual_notes || '') : '';
            const status = saved ? (saved.status || 'Чернова') : 'Чернова';

            const unexcusedLates = lates.filter(l => !l.isExcused);
            const unexcusedAudits = failedAudits.filter(a => !a.isExcused);
            const unexcusedDefects = workerDefects.filter(d => !d.isExcused);

            const overrideLatePenalty = saved?.details_json?.overrideLatePenalty !== undefined ? saved.details_json.overrideLatePenalty : null;
            const overrideAuditPenalty = saved?.details_json?.overrideAuditPenalty !== undefined ? saved.details_json.overrideAuditPenalty : null;

            const workerData = {
                baseBonus,
                baseSalary,
                manualAdjustment,
                totalCheckIns,
                lateCount: unexcusedLates.length, // Само неоправданите носят санкция!
                failedAuditsCount: unexcusedAudits.length,
                defectsCount: unexcusedDefects.length,
                overrideLatePenalty,
                overrideAuditPenalty
            };

            const computed = computeWorkerBonusValues(workerData, salaryRulesCache);

            results.push({
                workerEmail: email,
                workerName: name,
                position: position,
                baseSalary: baseSalary,
                baseBonus: baseBonus,
                totalCheckIns: totalCheckIns,
                lates: lates,
                lateCount: lates.length,
                unexcusedLateCount: unexcusedLates.length,
                excusedLateCount: lates.length - unexcusedLates.length,
                overrideLatePenalty: overrideLatePenalty,
                latePenaltyPct: computed.latePenaltyPct,
                latePenalty: computed.latePenalty,
                auditsTotal: workerAudits.length,
                failedAudits: failedAudits,
                failedAuditsCount: failedAudits.length,
                unexcusedAuditCount: unexcusedAudits.length,
                excusedAuditCount: failedAudits.length - unexcusedAudits.length,
                overrideAuditPenalty: overrideAuditPenalty,
                auditPenaltyPct: computed.auditPenaltyPct,
                auditPenalty: computed.auditPenalty,
                defects: workerDefects,
                defectsCount: workerDefects.length,
                unexcusedDefectsCount: unexcusedDefects.length,
                defectPenaltyPct: computed.defectPenaltyPct,
                defectPenalty: computed.defectPenalty,
                perfectBonusPct: computed.perfectBonusPct,
                perfectBonus: computed.perfectBonus,
                manualAdjustment: manualAdjustment,
                manualNotes: manualNotes,
                totalPenalty: computed.totalPenalty,
                totalBonus: computed.totalBonus,
                finalBonusPayout: computed.finalBonusPayout,
                finalPayout: computed.finalPayout,
                status: status,
                month: monthName,
                year: year
            });
        });

        results.sort((a, b) => a.workerName.localeCompare(b.workerName));
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
// 3. Рендериране на интерфейса
// ==============================================================================
window.renderSalariesLayout = renderSalariesLayout;
window.renderSalariesModule = renderSalariesLayout;

function renderSalariesLayout() {
    const container = document.getElementById('salariesContainer');
    if (!container) return;

    const monthName = MONTH_NAMES_BG[currentSalaryMonthIndex];
    const totalWorkers = salaryCalculations.length;
    const totalBaseBonuses = salaryCalculations.reduce((acc, c) => acc + (c.baseBonus || 0), 0);
    const totalPenalties = salaryCalculations.reduce((acc, c) => acc + (c.totalPenalty || 0), 0);
    const totalNetBonusPayout = salaryCalculations.reduce((acc, c) => acc + (c.finalBonusPayout || 0), 0);
    const totalLates = salaryCalculations.reduce((acc, c) => acc + (c.lateCount || 0), 0);
    const totalFailedAudits = salaryCalculations.reduce((acc, c) => acc + (c.failedAuditsCount || 0), 0);

    let html = `
        <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:14px; padding:20px; box-shadow:0 4px 6px -1px rgba(0,0,0,0.03);">
            <!-- Top Controls Bar -->
            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; border-bottom:2px solid #f1f5f9; padding-bottom:16px; margin-bottom:18px;">
                <div>
                    <h2 style="margin:0; font-size:1.35em; font-weight:900; color:#1e293b; display:flex; align-items:center; gap:8px;">
                        <span>💰</span> Система за Формиране на Бонуси &amp; Заплати
                    </h2>
                    <span style="font-size:0.85em; color:#64748b;">
                        Автоматично засичане на закъснения (08:00 ч.), 3S одити, дефекти и бонуси за <b>${monthName} ${currentSalaryYear} г.</b>
                    </span>
                </div>
                <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
                    <!-- Month Selector -->
                    <select id="salaryMonthSelect" onchange="changeSalaryPeriod(this.value, document.getElementById('salaryYearSelect').value)" style="padding:7px 10px; border-radius:8px; border:1.5px solid #cbd5e1; font-weight:700; background:#ffffff; color:#1e293b; outline:none; font-size:0.9em;">
                        ${MONTH_NAMES_BG.map((m, idx) => `<option value="${idx}" ${idx === currentSalaryMonthIndex ? 'selected' : ''}>${m}</option>`).join('')}
                    </select>

                    <!-- Year Selector -->
                    <select id="salaryYearSelect" onchange="changeSalaryPeriod(document.getElementById('salaryMonthSelect').value, this.value)" style="padding:7px 10px; border-radius:8px; border:1.5px solid #cbd5e1; font-weight:700; background:#ffffff; color:#1e293b; outline:none; font-size:0.9em;">
                        ${[2025, 2026, 2027].map(y => `<option value="${y}" ${y === currentSalaryYear ? 'selected' : ''}>${y} г.</option>`).join('')}
                    </select>

                    <button type="button" class="btn-primary" onclick="calculateMonthlySalaries()" style="padding:7px 14px; font-size:0.88em; background:#2563eb; display:inline-flex; align-items:center; gap:6px;" title="Опресни и пресметни засичанията за месеца">
                        <span>⚡</span> Пресметни
                    </button>

                    <button type="button" class="btn-primary" onclick="openBonusRulesModal()" style="padding:7px 14px; font-size:0.88em; background:#4f46e5; display:inline-flex; align-items:center; gap:6px;" title="Преглед и редакция на правилата за бонуси и глоби">
                        <span>⚙️</span> Правила (Заповед)
                    </button>

                    <button type="button" class="btn-primary" onclick="exportSalariesToExcel()" style="padding:7px 14px; font-size:0.88em; background:#059669; display:inline-flex; align-items:center; gap:6px;" title="Свали ведомостта в Excel">
                        <span>📥</span> Excel Ведомост
                    </button>

                    <button type="button" class="btn-primary" onclick="saveMonthlySalariesToDb('Чернова')" style="padding:7px 14px; font-size:0.88em; background:#475569; display:inline-flex; align-items:center; gap:6px;" title="Запази чернова в базата данни (само за администратор)">
                        <span>💾</span> Запази чернова
                    </button>

                    ${currentSalaryMonthStatus === 'Одобрено' ? `
                    <button type="button" class="btn-primary" onclick="unpublishMonthlySalaries()" style="padding:7px 14px; font-size:0.88em; background:#ea580c; display:inline-flex; align-items:center; gap:6px;" title="Свали от цеховите терминали и върни в чернова">
                        <span>↩️</span> Свали от терминалите
                    </button>
                    ` : `
                    <button type="button" class="btn-primary" onclick="publishMonthlySalariesToTerminals()" style="padding:7px 14px; font-size:0.88em; background:#16a34a; box-shadow:0 2px 6px rgba(22,163,74,0.35); display:inline-flex; align-items:center; gap:6px;" title="Одобри и публикувай фишовете за месеца към цеховите терминали">
                        <span>📤</span> Одобри и Публикувай към терминалите
                    </button>
                    `}
                </div>
            </div>

            <!-- Status Banner -->
            <div style="margin-bottom:16px; padding:10px 14px; border-radius:10px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; background:${currentSalaryMonthStatus === 'Одобрено' ? '#f0fdf4' : currentSalaryMonthStatus === 'Чернова' ? '#fefce8' : '#f8fafc'}; border:1px solid ${currentSalaryMonthStatus === 'Одобрено' ? '#86efac' : currentSalaryMonthStatus === 'Чернова' ? '#fde047' : '#cbd5e1'};">
                <div style="display:flex; align-items:center; gap:8px;">
                    <span style="font-size:0.85em; font-weight:700; color:#475569;">Статус за цеха:</span>
                    ${currentSalaryMonthStatus === 'Одобрено' 
                        ? `<span style="background:#16a34a; color:#ffffff; padding:3px 10px; border-radius:9999px; font-size:0.8em; font-weight:800; display:inline-flex; align-items:center; gap:5px;">
                            <span>🟢</span> ОДОБРЕНО И ПУБЛИКУВАНО КЪМ ТЕРМИНАЛИТЕ
                           </span>`
                        : currentSalaryMonthStatus === 'Чернова'
                            ? `<span style="background:#ca8a04; color:#ffffff; padding:3px 10px; border-radius:9999px; font-size:0.8em; font-weight:800; display:inline-flex; align-items:center; gap:5px;">
                                <span>🟡</span> ЧЕРНОВА (Служителите ОЩЕ НЕ виждат фишовете си)
                               </span>`
                            : `<span style="background:#64748b; color:#ffffff; padding:3px 10px; border-radius:9999px; font-size:0.8em; font-weight:800;">
                                ⚪ НЕ Е ЗАПАЗЕНО В БАЗАТА
                               </span>`
                    }
                </div>
                <div style="font-size:0.8em; color:#64748b;">
                    ${currentSalaryMonthStatus === 'Одобрено' 
                        ? '✅ Служителите могат да си отворят фиша от личното досие на терминала.' 
                        : '🔒 Достъпно само в административния панел. За да стане видимо за служителите, натиснете „Одобри и Публикувай“.'}
                </div>
            </div>

            <!-- Summary KPI Cards -->
            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:12px; margin-bottom:20px;">
                <div style="background:#f8fafc; border:1px solid #cbd5e1; border-radius:10px; padding:12px 14px;">
                    <div style="font-size:0.75em; font-weight:800; color:#64748b; text-transform:uppercase;">👥 Активни Служители</div>
                    <div style="font-size:1.6em; font-weight:900; color:#1e293b; margin-top:2px;">${totalWorkers} <span style="font-size:0.6em; color:#64748b; font-weight:normal;">души</span></div>
                    <div style="font-size:0.75em; color:#64748b; margin-top:2px;">Смяна: 08:00 ч. (+5 мин)</div>
                </div>

                <div style="background:#eff6ff; border:1px solid #bfdbfe; border-radius:10px; padding:12px 14px;">
                    <div style="font-size:0.75em; font-weight:800; color:#1d4ed8; text-transform:uppercase;">💶 Заложени Базови Бонуси</div>
                    <div style="font-size:1.6em; font-weight:900; color:#1e40af; margin-top:2px;">${totalBaseBonuses.toLocaleString('bg-BG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €</div>
                    <div style="font-size:0.75em; color:#60a5fa; margin-top:2px;">Индивидуален фонд</div>
                </div>

                <div style="background:#fef2f2; border:1px solid #fecaca; border-radius:10px; padding:12px 14px;">
                    <div style="font-size:0.75em; font-weight:800; color:#b91c1c; text-transform:uppercase;">⚠️ Начислени Удръжки</div>
                    <div style="font-size:1.6em; font-weight:900; color:#dc2626; margin-top:2px;">-${totalPenalties.toLocaleString('bg-BG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €</div>
                    <div style="font-size:0.75em; color:#ef4444; margin-top:2px;">Закъснения: ${totalLates} бр. | 3S: ${totalFailedAudits} бр.</div>
                </div>

                <div style="background:#f0fdf4; border:1.5px solid #86efac; border-radius:10px; padding:12px 14px;">
                    <div style="font-size:0.75em; font-weight:800; color:#15803d; text-transform:uppercase;">🟢 Краен Бонусен Фонд за изплащане</div>
                    <div style="font-size:1.6em; font-weight:900; color:#166534; margin-top:2px;">${totalNetBonusPayout.toLocaleString('bg-BG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €</div>
                    <div style="font-size:0.75em; color:#15803d; margin-top:2px;">Чиста сума бонуси</div>
                </div>
            </div>

            <!-- Interactive Payroll Table -->
            <div style="overflow-x:auto; border:1px solid #e2e8f0; border-radius:10px;">
                <table style="width:100%; border-collapse:collapse; font-size:0.88em; text-align:left;">
                    <thead>
                        <tr style="background:#f8fafc; color:#475569; border-bottom:1.5px solid #cbd5e1;">
                            <th style="padding:10px 12px; width:220px;">Служител</th>
                            <th style="padding:10px 10px; text-align:center; width:110px;">Базов Бонус</th>
                            <th style="padding:10px 10px; text-align:center; width:150px;">Закъснения (&gt;08:05)</th>
                            <th style="padding:10px 10px; text-align:center; width:130px;">3S Одити</th>
                            <th style="padding:10px 10px; text-align:center; width:110px;">Брак / Грешки</th>
                            <th style="padding:10px 10px; text-align:center; width:130px;">Ръчна кор. (+/- €)</th>
                            <th style="padding:10px 10px;">Бележка / Обосновка</th>
                            <th style="padding:10px 12px; text-align:right; width:130px;">Краен Бонус</th>
                            <th style="padding:10px 12px; text-align:center; width:90px;">Действие</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${salaryCalculations.map((calc, idx) => {
                            const isLateWarn = (calc.unexcusedLateCount !== undefined ? calc.unexcusedLateCount : calc.lateCount) >= 3;
                            const isAuditWarn = (calc.unexcusedAuditCount !== undefined ? calc.unexcusedAuditCount : calc.failedAuditsCount) > 0;
                            const isDefectWarn = calc.defectsCount >= 3;

                            return `
                                <tr style="border-bottom:1px solid #f1f5f9; transition:background 0.15s ease;" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='white'">
                                    <td style="padding:10px 12px;">
                                        <div style="font-weight:800; color:#1e293b; font-size:1.02em;">${calc.workerName}</div>
                                        <div style="font-size:0.8em; color:#64748b;">${calc.position} • <span style="font-family:monospace;">${calc.workerEmail}</span></div>
                                    </td>

                                    <!-- Базов бонус (индивидуално поле, може да се попълва сега или по-късно) -->
                                    <td style="padding:10px 10px; text-align:center;">
                                        <input type="number" step="any" min="0" value="${calc.baseBonus || ''}" placeholder="0.00 €" 
                                               onchange="updateWorkerBaseBonus(${idx}, this.value)"
                                               style="width:85px; padding:4px 6px; border:1px solid #cbd5e1; border-radius:6px; font-weight:800; text-align:center; color:#1e293b; outline:none;" title="Въведете базов бонус за служителя">
                                    </td>

                                    <!-- Закъснения -->
                                    <td style="padding:10px 10px; text-align:center;">
                                        <button type="button" onclick="showLateDetailsModal(${idx})" style="background:${isLateWarn ? '#fee2e2' : '#f0fdf4'}; border:1px solid ${isLateWarn ? '#fca5a5' : '#86efac'}; color:${isLateWarn ? '#b91c1c' : '#15803d'}; padding:3px 8px; border-radius:6px; font-weight:800; cursor:pointer; font-size:0.92em;" title="Кликнете за преглед, оправдаване на закъснения или ръчна глоба">
                                            ${calc.lateCount} бр.${calc.excusedLateCount > 0 ? ` <span style="font-size:0.8em; color:#15803d; font-weight:normal;">(${calc.excusedLateCount} опр.)</span>` : ''} ${calc.latePenalty > 0 ? `<b style="color:#dc2626;">(${calc.latePenaltyPct > 0 ? `-${calc.latePenaltyPct}% / ` : ''}-${calc.latePenalty.toFixed(2)}€)</b>` : (calc.lateCount > 0 ? '<b style="color:#15803d;">(0€)</b>' : '')}
                                        </button>
                                    </td>

                                    <!-- 3S Одити -->
                                    <td style="padding:10px 10px; text-align:center;">
                                        <button type="button" onclick="show3sDetailsModal(${idx})" style="background:${isAuditWarn ? '#fee2e2' : '#f0fdf4'}; border:1px solid ${isAuditWarn ? '#fca5a5' : '#86efac'}; color:${isAuditWarn ? '#b91c1c' : '#15803d'}; padding:3px 8px; border-radius:6px; font-weight:800; cursor:pointer; font-size:0.92em;" title="Кликнете за преглед, оправдаване на одити или ръчна глоба">
                                            ${calc.failedAuditsCount} бр.${calc.excusedAuditCount > 0 ? ` <span style="font-size:0.8em; color:#15803d; font-weight:normal;">(${calc.excusedAuditCount} опр.)</span>` : ''} ${calc.auditPenalty > 0 ? `<b style="color:#dc2626;">(${calc.auditPenaltyPct > 0 ? `-${calc.auditPenaltyPct}% / ` : ''}-${calc.auditPenalty.toFixed(2)}€)</b>` : (calc.failedAuditsCount > 0 ? '<b style="color:#15803d;">(0€)</b>' : '')}
                                        </button>
                                    </td>

                                    <!-- Брак / Отчети -->
                                    <td style="padding:10px 10px; text-align:center;">
                                        <span style="background:${isDefectWarn ? '#fee2e2' : '#f8fafc'}; border:1px solid ${isDefectWarn ? '#fca5a5' : '#cbd5e1'}; color:${isDefectWarn ? '#b91c1c' : '#475569'}; padding:3px 8px; border-radius:6px; font-weight:700; font-size:0.92em;">
                                            ${calc.defectsCount} бр. ${calc.defectPenalty > 0 ? `<b style="color:#dc2626;">(${calc.defectPenaltyPct > 0 ? `-${calc.defectPenaltyPct}% / ` : ''}-${calc.defectPenalty.toFixed(2)}€)</b>` : ''}
                                        </span>
                                    </td>

                                    <!-- Ръчна корекция (+ / - €) -->
                                    <td style="padding:10px 10px; text-align:center;">
                                        <input type="number" step="any" value="${calc.manualAdjustment || ''}" placeholder="0.00 €" 
                                               onchange="updateWorkerManualAdjustment(${idx}, this.value)"
                                               style="width:90px; padding:4px 6px; border:1px solid #cbd5e1; border-radius:6px; font-weight:800; text-align:center; color:${(calc.manualAdjustment || 0) < 0 ? '#dc2626' : ((calc.manualAdjustment || 0) > 0 ? '#15803d' : '#1e293b')}; outline:none;" title="Ръчна добавка (+) или удръжка (-)">
                                    </td>

                                    <!-- Бележка / Обосновка -->
                                    <td style="padding:10px 10px;">
                                        <input type="text" value="${calc.manualNotes || ''}" placeholder="Бележка / Обосновка..." 
                                               onchange="updateWorkerNotes(${idx}, this.value)"
                                               style="width:100%; min-width:120px; padding:4px 8px; border:1px solid #e2e8f0; border-radius:6px; font-size:0.9em; outline:none;">
                                    </td>

                                    <!-- Краен Бонус -->
                                    <td style="padding:10px 12px; text-align:right;">
                                        <div style="font-size:1.15em; font-weight:900; color:${calc.finalBonusPayout < 0 ? '#dc2626' : (calc.finalBonusPayout > 0 ? '#15803d' : '#475569')};">
                                            ${calc.finalBonusPayout > 0 ? '+' : ''}${calc.finalBonusPayout.toLocaleString('bg-BG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                                        </div>
                                        ${calc.totalPenalty > 0 ? `<div style="font-size:0.75em; color:#ef4444;">Удръжки: -${calc.totalPenalty.toFixed(2)} €</div>` : ''}
                                    </td>

                                    <!-- Действия: Фиш -->
                                    <td style="padding:10px 12px; text-align:center;">
                                        <button type="button" onclick="showWorkerPaySlip(${idx})" class="btn-primary" style="padding:5px 10px; font-size:0.8em; background:#4338ca; border-radius:6px; font-weight:800;" title="Генерирай и отпечатай индивидуален фиш">
                                            📜 Фиш
                                        </button>
                                    </td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>

            <!-- Footer Notes & Legend -->
            <div style="margin-top:16px; padding:12px 16px; background:#f8fafc; border-radius:10px; border:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; font-size:0.85em; color:#64748b;">
                <div>
                    ℹ️ <b>Легенда на правилата:</b> Закъснение &ge; 3 пъти &rarr; -10% от бонуса &nbsp;|&nbsp; Неиздържан 3S одит &rarr; -20% от бонуса/одит &nbsp;|&nbsp; Грешни отчети/брак &ge; 3 &rarr; -15% &nbsp;|&nbsp; Кликнете върху закъсненията/одитите за оправдаване или ръчна корекция
                </div>
                <div>
                    След като нанесете нужните индивидуални корекции, натиснете <b>„💾 Запази“</b> или <b>„📥 Excel Ведомост“</b> за счетоводството.
                </div>
            </div>
        </div>
    `;

    container.innerHTML = html;
}

// ==============================================================================
// 4. Помощни функции за смяна на период и актуализация на стойностите
// ==============================================================================
window.changeSalaryPeriod = function (monthIdx, year) {
    currentSalaryMonthIndex = parseInt(monthIdx);
    currentSalaryYear = parseInt(year);
    calculateMonthlySalaries();
};

window.updateWorkerBaseBonus = function (index, val) {
    if (salaryCalculations[index]) {
        const num = parseFloat(val) || 0;
        salaryCalculations[index].baseBonus = num;
        recomputeWorkerCalculations(index);
    }
};

window.updateWorkerManualAdjustment = function (index, val) {
    if (salaryCalculations[index]) {
        const num = parseFloat(val) || 0;
        salaryCalculations[index].manualAdjustment = num;
        recomputeWorkerCalculations(index);
    }
};

window.updateWorkerNotes = function (index, val) {
    if (salaryCalculations[index]) {
        salaryCalculations[index].manualNotes = String(val || '');
    }
};

// ==============================================================================
// 5. Модални прозорци за Детайли & Ръчно Оправдаване (Закъснения & 3S)
// ==============================================================================
window.showLateDetailsModal = function (index) {
    const calc = salaryCalculations[index];
    if (!calc) return;

    const totalLates = calc.lates ? calc.lates.length : 0;
    const excusedCount = calc.excusedLateCount || 0;
    const unexcusedCount = calc.unexcusedLateCount !== undefined ? calc.unexcusedLateCount : (totalLates - excusedCount);

    let rowsHtml = '';
    if (totalLates === 0) {
        rowsHtml = '<tr><td colspan="5" style="text-align:center; padding:15px; color:#15803d; font-weight:bold;">🟢 Няма регистрирани закъснения през този месец!</td></tr>';
    } else {
        rowsHtml = calc.lates.map((l, i) => {
            const isExc = !!l.isExcused;
            return `
            <tr style="border-bottom:1px solid #f1f5f9; background:${isExc ? '#f0fdf4' : 'transparent'};">
                <td style="padding:8px 10px; font-weight:bold; color:#1e293b;">${i + 1}. ${l.dateStr}</td>
                <td style="padding:8px 10px; color:${isExc ? '#15803d' : '#b91c1c'}; font-weight:800;">${l.timeStr} ч.</td>
                <td style="padding:8px 10px; color:${isExc ? '#15803d' : '#dc2626'};">+${l.minutesLate} мин.</td>
                <td style="padding:8px 10px; font-size:0.85em;">
                    ${isExc 
                        ? `<span style="background:#dcfce7; color:#15803d; border:1px solid #86efac; padding:2px 8px; border-radius:6px; font-weight:800;">🕊️ Оправдано</span><div style="font-size:0.8em; color:#166534; margin-top:2px;">${l.excuseNote || 'Предупредил'}</div>` 
                        : `<span style="background:#fee2e2; color:#b91c1c; border:1px solid #fca5a5; padding:2px 8px; border-radius:6px; font-weight:700;">⚠️ Неоправдано</span>`
                    }
                </td>
                <td style="padding:8px 10px; text-align:center;">
                    <button type="button" onclick="toggleLateExcused(${index}, ${i})" style="padding:4px 9px; border-radius:6px; font-size:0.78em; font-weight:800; cursor:pointer; border:none; background:${isExc ? '#64748b' : '#16a34a'}; color:#ffffff;" title="${isExc ? 'Върни като неоправдано' : 'Оправдай закъснението (напр. предупредил предварително)'}">
                        ${isExc ? '↩️ Отмени' : '🕊️ Оправдай'}
                    </button>
                </td>
            </tr>
            `;
        }).join('');
    }

    const penaltyText = calc.latePenalty > 0 
        ? `${calc.latePenaltyPct > 0 ? `-${calc.latePenaltyPct}% (` : ''}-${calc.latePenalty.toFixed(2)} €${calc.latePenaltyPct > 0 ? ')' : ''}`
        : '0.00 €';

    Swal.fire({
        title: `⏱️ Закъснения: ${calc.workerName}`,
        html: `
            <div style="text-align:left; font-size:0.9em;">
                <!-- Summary 3-box Grid -->
                <div style="background:#f8fafc; border:1px solid #cbd5e1; border-radius:8px; padding:10px; margin-bottom:12px; display:grid; grid-template-columns:1fr 1fr 1fr; gap:8px; text-align:center;">
                    <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:6px; padding:6px;">
                        <div style="font-size:0.75em; color:#64748b; font-weight:700; text-transform:uppercase;">Общо закъснения</div>
                        <div style="font-size:1.3em; font-weight:900; color:#1e293b;">${totalLates} бр.</div>
                    </div>
                    <div style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:6px; padding:6px;">
                        <div style="font-size:0.75em; color:#15803d; font-weight:700; text-transform:uppercase;">🕊️ Оправдани</div>
                        <div style="font-size:1.3em; font-weight:900; color:#15803d;">${excusedCount} бр.</div>
                    </div>
                    <div style="background:#fef2f2; border:1px solid #fecaca; border-radius:6px; padding:6px;">
                        <div style="font-size:0.75em; color:#b91c1c; font-weight:700; text-transform:uppercase;">⚠️ За санкция</div>
                        <div style="font-size:1.3em; font-weight:900; color:#dc2626;">${unexcusedCount} бр.</div>
                    </div>
                </div>

                <!-- Fine status & manual override -->
                <div style="background:${calc.latePenalty > 0 ? '#fef2f2' : '#f0fdf4'}; border:1px solid ${calc.latePenalty > 0 ? '#fecaca' : '#86efac'}; border-radius:8px; padding:10px 12px; margin-bottom:12px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
                    <div>
                        <span style="font-weight:700; color:#334155;">Удръжка:</span>
                        <b style="color:${calc.latePenalty > 0 ? '#dc2626' : '#15803d'}; font-size:1.05em; margin-left:6px;">${penaltyText}</b>
                        ${calc.overrideLatePenalty !== null && calc.overrideLatePenalty !== undefined ? '<span style="font-size:0.75em; color:#7c3aed; font-weight:bold; margin-left:6px;">(ръчно зададена)</span>' : ''}
                    </div>
                    <div style="display:flex; align-items:center; gap:6px;">
                        <label style="font-size:0.82em; font-weight:700; color:#475569;">Ръчна глоба (€):</label>
                        <input type="number" step="any" min="0" value="${calc.overrideLatePenalty !== null && calc.overrideLatePenalty !== undefined ? calc.overrideLatePenalty : ''}" placeholder="Авто" 
                               onchange="setWorkerOverrideLatePenalty(${index}, this.value)"
                               style="width:75px; padding:3px 6px; border:1px solid #cbd5e1; border-radius:4px; font-weight:bold; text-align:center;">
                        ${calc.overrideLatePenalty !== null && calc.overrideLatePenalty !== undefined ? `
                            <button type="button" onclick="clearWorkerOverrideLatePenalty(${index})" style="background:#cbd5e1; border:none; border-radius:4px; padding:3px 6px; font-size:0.75em; font-weight:bold; cursor:pointer;" title="Върни към автоматично изчисление по правила">Авто</button>
                        ` : ''}
                    </div>
                </div>

                <!-- Table list -->
                <div style="max-height:250px; overflow-y:auto; border:1px solid #e2e8f0; border-radius:8px;">
                    <table style="width:100%; border-collapse:collapse; font-size:0.88em;">
                        <thead>
                            <tr style="background:#f8fafc; color:#475569; text-align:left; border-bottom:1px solid #cbd5e1;">
                                <th style="padding:8px 10px;">Дата</th>
                                <th style="padding:8px 10px;">Влизане</th>
                                <th style="padding:8px 10px;">Закъснение</th>
                                <th style="padding:8px 10px;">Статус</th>
                                <th style="padding:8px 10px; text-align:center;">Оправдаване</th>
                            </tr>
                        </thead>
                        <tbody>${rowsHtml}</tbody>
                    </table>
                </div>
                <div style="font-size:0.8em; color:#64748b; margin-top:8px;">
                    💡 Ако служителят ви е предупредил за дадено закъснение, натиснете <b>„🕊️ Оправдай“</b>. Оправданите закъснения не се броят към прага за санкции.
                </div>
            </div>
        `,
        width: 660,
        showCloseButton: true,
        confirmButtonText: 'Готово',
        confirmButtonColor: '#2563eb'
    });
};

window.toggleLateExcused = async function (workerIdx, lateIdx) {
    const calc = salaryCalculations[workerIdx];
    if (!calc || !calc.lates || !calc.lates[lateIdx]) return;

    const item = calc.lates[lateIdx];
    if (!item.isExcused) {
        const { value: reason, isDismissed } = await Swal.fire({
            title: '🕊️ Оправдаване на закъснение',
            html: `
                <div style="text-align:left; font-size:0.9em; color:#334155;">
                    <div>Дата: <b>${item.dateStr}</b> в <b>${item.timeStr} ч.</b> (+${item.minutesLate} мин.)</div>
                    <div style="margin-top:10px;">Причина / бележка (напр. <i>„Предупредил предварително“</i>):</div>
                </div>
            `,
            input: 'text',
            inputValue: 'Предупредил предварително',
            showCancelButton: true,
            confirmButtonText: 'Потвърди и оправдай',
            cancelButtonText: 'Отказ',
            confirmButtonColor: '#16a34a'
        });

        if (isDismissed) {
            showLateDetailsModal(workerIdx);
            return;
        }

        item.isExcused = true;
        item.excuseNote = String(reason || 'Предупредил').trim();
    } else {
        item.isExcused = false;
        item.excuseNote = '';
    }

    recomputeWorkerCalculations(workerIdx);
    showLateDetailsModal(workerIdx);
};

window.setWorkerOverrideLatePenalty = function (workerIdx, val) {
    const calc = salaryCalculations[workerIdx];
    if (!calc) return;
    if (val === '' || isNaN(parseFloat(val))) {
        calc.overrideLatePenalty = null;
    } else {
        calc.overrideLatePenalty = Math.max(0, parseFloat(val));
    }
    recomputeWorkerCalculations(workerIdx);
    showLateDetailsModal(workerIdx);
};

window.clearWorkerOverrideLatePenalty = function (workerIdx) {
    const calc = salaryCalculations[workerIdx];
    if (!calc) return;
    calc.overrideLatePenalty = null;
    recomputeWorkerCalculations(workerIdx);
    showLateDetailsModal(workerIdx);
};

window.show3sDetailsModal = function (index) {
    const calc = salaryCalculations[index];
    if (!calc) return;

    const totalAudits = calc.auditsTotal || 0;
    const failedTotal = calc.failedAudits ? calc.failedAudits.length : 0;
    const excusedAudits = calc.excusedAuditCount || 0;
    const unexcusedAudits = calc.unexcusedAuditCount !== undefined ? calc.unexcusedAuditCount : (failedTotal - excusedAudits);

    let rowsHtml = '';
    if (failedTotal === 0) {
        rowsHtml = '<tr><td colspan="5" style="text-align:center; padding:15px; color:#15803d; font-weight:bold;">🟢 Всички проведени 3S одити за месеца са взети успешно (&ge;80%)!</td></tr>';
    } else {
        rowsHtml = calc.failedAudits.map((a, i) => {
            const isExc = !!a.isExcused;
            return `
            <tr style="border-bottom:1px solid #f1f5f9; background:${isExc ? '#f0fdf4' : 'transparent'};">
                <td style="padding:8px 10px; font-weight:bold; color:#1e293b;">${a.audit_date || a.created_at?.split('T')[0]}</td>
                <td style="padding:8px 10px; color:#475569;">${a.sector || '—'}</td>
                <td style="padding:8px 10px; color:${isExc ? '#15803d' : '#dc2626'}; font-weight:900;">${a.percentage}%</td>
                <td style="padding:8px 10px; font-size:0.85em;">
                    ${isExc 
                        ? `<span style="background:#dcfce7; color:#15803d; border:1px solid #86efac; padding:2px 8px; border-radius:6px; font-weight:800;">🕊️ Оправдан</span><div style="font-size:0.8em; color:#166534; margin-top:2px;">${a.excuseNote || 'Обективни причини'}</div>` 
                        : `<span style="background:#fee2e2; color:#b91c1c; border:1px solid #fca5a5; padding:2px 8px; border-radius:6px; font-weight:700;">⚠️ Неиздържан</span><div style="font-size:0.8em; color:#64748b; margin-top:2px;">${a.notes || ''}</div>`
                    }
                </td>
                <td style="padding:8px 10px; text-align:center;">
                    <button type="button" onclick="toggleAuditExcused(${index}, ${i})" style="padding:4px 9px; border-radius:6px; font-size:0.78em; font-weight:800; cursor:pointer; border:none; background:${isExc ? '#64748b' : '#16a34a'}; color:#ffffff;" title="${isExc ? 'Върни като неиздържан' : 'Оправдай одита (напр. обективни причини/нов служител)'}">
                        ${isExc ? '↩️ Отмени' : '🕊️ Оправдай'}
                    </button>
                </td>
            </tr>
            `;
        }).join('');
    }

    const penaltyText = calc.auditPenalty > 0 
        ? `${calc.auditPenaltyPct > 0 ? `-${calc.auditPenaltyPct}% (` : ''}-${calc.auditPenalty.toFixed(2)} €${calc.auditPenaltyPct > 0 ? ')' : ''}`
        : '0.00 €';

    Swal.fire({
        title: `🧹 3S Одити: ${calc.workerName}`,
        html: `
            <div style="text-align:left; font-size:0.9em;">
                <!-- Summary 3-box Grid -->
                <div style="background:#f8fafc; border:1px solid #cbd5e1; border-radius:8px; padding:10px; margin-bottom:12px; display:grid; grid-template-columns:1fr 1fr 1fr; gap:8px; text-align:center;">
                    <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:6px; padding:6px;">
                        <div style="font-size:0.75em; color:#64748b; font-weight:700; text-transform:uppercase;">Общо одити</div>
                        <div style="font-size:1.3em; font-weight:900; color:#1e293b;">${totalAudits} бр.</div>
                    </div>
                    <div style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:6px; padding:6px;">
                        <div style="font-size:0.75em; color:#15803d; font-weight:700; text-transform:uppercase;">🕊️ Оправдани</div>
                        <div style="font-size:1.3em; font-weight:900; color:#15803d;">${excusedAudits} бр.</div>
                    </div>
                    <div style="background:#fef2f2; border:1px solid #fecaca; border-radius:6px; padding:6px;">
                        <div style="font-size:0.75em; color:#b91c1c; font-weight:700; text-transform:uppercase;">⚠️ За санкция</div>
                        <div style="font-size:1.3em; font-weight:900; color:#dc2626;">${unexcusedAudits} бр.</div>
                    </div>
                </div>

                <!-- Fine status & manual override -->
                <div style="background:${calc.auditPenalty > 0 ? '#fef2f2' : '#f0fdf4'}; border:1px solid ${calc.auditPenalty > 0 ? '#fecaca' : '#86efac'}; border-radius:8px; padding:10px 12px; margin-bottom:12px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
                    <div>
                        <span style="font-weight:700; color:#334155;">Удръжка:</span>
                        <b style="color:${calc.auditPenalty > 0 ? '#dc2626' : '#15803d'}; font-size:1.05em; margin-left:6px;">${penaltyText}</b>
                        ${calc.overrideAuditPenalty !== null && calc.overrideAuditPenalty !== undefined ? '<span style="font-size:0.75em; color:#7c3aed; font-weight:bold; margin-left:6px;">(ръчно зададена)</span>' : ''}
                    </div>
                    <div style="display:flex; align-items:center; gap:6px;">
                        <label style="font-size:0.82em; font-weight:700; color:#475569;">Ръчна глоба (€):</label>
                        <input type="number" step="any" min="0" value="${calc.overrideAuditPenalty !== null && calc.overrideAuditPenalty !== undefined ? calc.overrideAuditPenalty : ''}" placeholder="Авто" 
                               onchange="setWorkerOverrideAuditPenalty(${index}, this.value)"
                               style="width:75px; padding:3px 6px; border:1px solid #cbd5e1; border-radius:4px; font-weight:bold; text-align:center;">
                        ${calc.overrideAuditPenalty !== null && calc.overrideAuditPenalty !== undefined ? `
                            <button type="button" onclick="clearWorkerOverrideAuditPenalty(${index})" style="background:#cbd5e1; border:none; border-radius:4px; padding:3px 6px; font-size:0.75em; font-weight:bold; cursor:pointer;" title="Върни към автоматично изчисление">Авто</button>
                        ` : ''}
                    </div>
                </div>

                <!-- Table list -->
                <div style="max-height:250px; overflow-y:auto; border:1px solid #e2e8f0; border-radius:8px;">
                    <table style="width:100%; border-collapse:collapse; font-size:0.88em;">
                        <thead>
                            <tr style="background:#f8fafc; color:#475569; text-align:left; border-bottom:1px solid #cbd5e1;">
                                <th style="padding:8px 10px;">Дата</th>
                                <th style="padding:8px 10px;">Звено</th>
                                <th style="padding:8px 10px;">Резултат</th>
                                <th style="padding:8px 10px;">Статус</th>
                                <th style="padding:8px 10px; text-align:center;">Оправдаване</th>
                            </tr>
                        </thead>
                        <tbody>${rowsHtml}</tbody>
                    </table>
                </div>
            </div>
        `,
        width: 660,
        showCloseButton: true,
        confirmButtonText: 'Готово',
        confirmButtonColor: '#2563eb'
    });
};

window.toggleAuditExcused = async function (workerIdx, auditIdx) {
    const calc = salaryCalculations[workerIdx];
    if (!calc || !calc.failedAudits || !calc.failedAudits[auditIdx]) return;

    const item = calc.failedAudits[auditIdx];
    if (!item.isExcused) {
        const { value: reason, isDismissed } = await Swal.fire({
            title: '🕊️ Оправдаване на 3S одит',
            html: `
                <div style="text-align:left; font-size:0.9em; color:#334155;">
                    <div>Дата: <b>${item.audit_date || item.created_at?.split('T')[0]}</b> (Звено: ${item.sector || '—'})</div>
                    <div style="margin-top:10px;">Въведете причина (напр. <i>„Нов служител / Обективни технически причини“</i>):</div>
                </div>
            `,
            input: 'text',
            inputValue: 'Обективни причини / Предупредил',
            showCancelButton: true,
            confirmButtonText: 'Потвърди и оправдай',
            cancelButtonText: 'Отказ',
            confirmButtonColor: '#16a34a'
        });

        if (isDismissed) {
            show3sDetailsModal(workerIdx);
            return;
        }

        item.isExcused = true;
        item.excuseNote = String(reason || 'Оправдано').trim();
    } else {
        item.isExcused = false;
        item.excuseNote = '';
    }

    recomputeWorkerCalculations(workerIdx);
    show3sDetailsModal(workerIdx);
};

window.setWorkerOverrideAuditPenalty = function (workerIdx, val) {
    const calc = salaryCalculations[workerIdx];
    if (!calc) return;
    if (val === '' || isNaN(parseFloat(val))) {
        calc.overrideAuditPenalty = null;
    } else {
        calc.overrideAuditPenalty = Math.max(0, parseFloat(val));
    }
    recomputeWorkerCalculations(workerIdx);
    show3sDetailsModal(workerIdx);
};

window.clearWorkerOverrideAuditPenalty = function (workerIdx) {
    const calc = salaryCalculations[workerIdx];
    if (!calc) return;
    calc.overrideAuditPenalty = null;
    recomputeWorkerCalculations(workerIdx);
    show3sDetailsModal(workerIdx);
};

// ==============================================================================
// 6. Индивидуален Фиш за служителя (Готов за печат)
// ==============================================================================
window.showWorkerPaySlip = function (index) {
    const c = salaryCalculations[index];
    if (!c) return;

    const monthName = MONTH_NAMES_BG[currentSalaryMonthIndex];
    const printDate = new Date().toLocaleDateString('bg-BG');

    const html = `
        <div id="printSlipArea" style="text-align:left; font-family:'Segoe UI', sans-serif; color:#0f172a; padding:10px;">
            <!-- Header -->
            <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid #0f172a; padding-bottom:10px; margin-bottom:14px;">
                <div>
                    <div style="font-size:1.3em; font-weight:900; color:#0f172a; letter-spacing:0.5px;">AMCI Производствена Система</div>
                    <div style="font-size:0.85em; color:#475569;">ФИШ ЗА ФОРМИРАНЕ НА БОНУСИ &amp; ЗАПЛАТА</div>
                </div>
                <div style="text-align:right;">
                    <div style="font-weight:800; font-size:1.05em; color:#1e40af;">Период: ${monthName} ${c.year} г.</div>
                    <div style="font-size:0.75em; color:#64748b;">Дата на справката: ${printDate}</div>
                </div>
            </div>

            <!-- Employee Info Box -->
            <div style="background:#f8fafc; border:1px solid #cbd5e1; border-radius:8px; padding:10px 14px; margin-bottom:14px; display:grid; grid-template-columns:1fr 1fr; gap:8px; font-size:0.9em;">
                <div>Служител: <b style="font-size:1.05em; color:#0f172a;">${c.workerName}</b></div>
                <div>Длъжност: <b>${c.position}</b></div>
                <div>Имейл: <span style="font-family:monospace;">${c.workerEmail}</span></div>
                <div>Присъствени дни (Чекирания): <b>${c.totalCheckIns}</b></div>
            </div>

            <!-- Breakdown Table -->
            <table style="width:100%; border-collapse:collapse; font-size:0.88em; margin-bottom:14px;">
                <thead>
                    <tr style="background:#f1f5f9; color:#334155; border-bottom:1.5px solid #cbd5e1; text-align:left;">
                        <th style="padding:6px 10px;">Показател / Основание</th>
                        <th style="padding:6px 10px; text-align:center;">Брой</th>
                        <th style="padding:6px 10px; text-align:right;">Сума (+ / -)</th>
                    </tr>
                </thead>
                <tbody>
                    <tr style="border-bottom:1px solid #e2e8f0;">
                        <td style="padding:6px 10px;">Базов фонд бонуси</td>
                        <td style="padding:6px 10px; text-align:center;">1</td>
                        <td style="padding:6px 10px; text-align:right; font-weight:bold; color:#15803d;">+${(c.baseBonus || 0).toFixed(2)} €</td>
                    </tr>
                    <tr style="border-bottom:1px solid #e2e8f0;">
                        <td style="padding:6px 10px; color:${c.latePenalty > 0 ? '#dc2626' : '#64748b'};">
                            Закъснения след 08:05 ч. (${c.lateCount} регистрирани${c.excusedLateCount > 0 ? `, ${c.excusedLateCount} оправдани` : ''}${c.latePenaltyPct > 0 ? ` • -${c.latePenaltyPct}%` : ''})
                        </td>
                        <td style="padding:6px 10px; text-align:center;">${c.unexcusedLateCount !== undefined ? c.unexcusedLateCount : c.lateCount}</td>
                        <td style="padding:6px 10px; text-align:right; font-weight:bold; color:${c.latePenalty > 0 ? '#dc2626' : '#64748b'};">
                            ${c.latePenalty > 0 ? '-' + c.latePenalty.toFixed(2) + ' €' : '0.00 €'}
                        </td>
                    </tr>
                    <tr style="border-bottom:1px solid #e2e8f0;">
                        <td style="padding:6px 10px; color:${c.auditPenalty > 0 ? '#dc2626' : '#64748b'};">
                            Неиздържани 3S одити (${c.failedAuditsCount} регистрирани${c.excusedAuditCount > 0 ? `, ${c.excusedAuditCount} оправдани` : ''}${c.auditPenaltyPct > 0 ? ` • -${c.auditPenaltyPct}%` : ''})
                        </td>
                        <td style="padding:6px 10px; text-align:center;">${c.unexcusedAuditCount !== undefined ? c.unexcusedAuditCount : c.failedAuditsCount}</td>
                        <td style="padding:6px 10px; text-align:right; font-weight:bold; color:${c.auditPenalty > 0 ? '#dc2626' : '#64748b'};">
                            ${c.auditPenalty > 0 ? '-' + c.auditPenalty.toFixed(2) + ' €' : '0.00 €'}
                        </td>
                    </tr>
                        <td style="padding:6px 10px; text-align:center;">${c.failedAuditsCount}</td>
                        <td style="padding:6px 10px; text-align:right; font-weight:bold; color:${c.auditPenalty > 0 ? '#dc2626' : '#64748b'};">
                            ${c.auditPenalty > 0 ? '-' + c.auditPenalty.toFixed(2) + ' €' : '0.00 €'}
                        </td>
                    </tr>
                    <tr style="border-bottom:1px solid #e2e8f0;">
                        <td style="padding:6px 10px; color:${c.defectPenalty > 0 ? '#dc2626' : '#64748b'};">
                            Брак / Грешки в отчитането ${c.defectsCount > 0 ? `(${c.defectsCount} бр.${c.defectPenaltyPct > 0 ? ` • -${c.defectPenaltyPct}%` : ''})` : ''}
                        </td>
                        <td style="padding:6px 10px; text-align:center;">${c.defectsCount}</td>
                        <td style="padding:6px 10px; text-align:right; font-weight:bold; color:${c.defectPenalty > 0 ? '#dc2626' : '#64748b'};">
                            ${c.defectPenalty > 0 ? '-' + c.defectPenalty.toFixed(2) + ' €' : '0.00 €'}
                        </td>
                    </tr>
                    ${c.manualAdjustment !== 0 ? `
                        <tr style="border-bottom:1px solid #e2e8f0; background:#f8fafc;">
                            <td style="padding:6px 10px;">Ръчна корекция / Извънреден труд (${c.manualNotes || 'Бележка'})</td>
                            <td style="padding:6px 10px; text-align:center;">—</td>
                            <td style="padding:6px 10px; text-align:right; font-weight:bold; color:${c.manualAdjustment > 0 ? '#15803d' : '#dc2626'};">
                                ${c.manualAdjustment > 0 ? '+' : ''}${c.manualAdjustment.toFixed(2)} €
                            </td>
                        </tr>
                    ` : ''}
                    <!-- Total Row -->
                    <tr style="background:#f1f5f9; font-weight:900; font-size:1.05em; border-top:2px solid #cbd5e1;">
                        <td style="padding:10px 10px;" colspan="2">КРАЕН БОНУС ЗА ИЗПЛАЩАНЕ:</td>
                        <td style="padding:10px 10px; text-align:right; color:${c.finalBonusPayout >= 0 ? '#15803d' : '#dc2626'};">
                            ${c.finalBonusPayout.toFixed(2)} €
                        </td>
                    </tr>
                </tbody>
            </table>

            <div style="margin-top:25px; display:flex; justify-content:space-between; font-size:0.82em; color:#475569; border-top:1px dashed #cbd5e1; padding-top:10px;">
                <div>Съставил: .......................................</div>
                <div>Приел служител: .......................................</div>
            </div>
        </div>
    `;

    Swal.fire({
        html: html,
        width: 620,
        showCancelButton: true,
        confirmButtonText: '🖨️ Разпечатай фиша',
        cancelButtonText: 'Затвори',
        confirmButtonColor: '#2563eb'
    }).then(res => {
        if (res.isConfirmed) {
            const printWin = window.open('', '_blank', 'width=800,height=600');
            printWin.document.write(`
                <html>
                <head>
                    <title>Фиш - ${c.workerName}</title>
                    <style>body { font-family: 'Segoe UI', Arial, sans-serif; padding: 25px; }</style>
                </head>
                <body onload="window.print(); window.close();">
                    ${html}
                </body>
                </html>
            `);
            printWin.document.close();
        }
    });
};

// ==============================================================================
// 7. Конфигуратор на Правилата (Заповедта)
// ==============================================================================
window.openBonusRulesModal = function () {
    const rulesHtml = salaryRulesCache.map((r, idx) => {
        const isPercent = r.calc_type !== 'fixed';
        const val = r.penalty_amount > 0 ? r.penalty_amount : r.bonus_amount;
        return `
        <div style="background:#ffffff; border:1px solid #cbd5e1; border-radius:10px; padding:12px; margin-bottom:10px; box-shadow:0 1px 2px rgba(0,0,0,0.03);">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                <div style="font-weight:900; color:#1e293b; font-size:1em;">
                    <span>${r.category === 'bonus' ? '🟢' : '⚠️'}</span> ${r.rule_name}
                </div>
                <label style="display:inline-flex; align-items:center; gap:6px; font-size:0.85em; cursor:pointer;">
                    <input type="checkbox" ${r.is_active ? 'checked' : ''} onchange="toggleRuleActive(${idx}, this.checked)">
                    <span style="font-weight:bold; color:${r.is_active ? '#15803d' : '#94a3b8'};">${r.is_active ? 'Активно' : 'Изключено'}</span>
                </label>
            </div>
            <div style="font-size:0.82em; color:#64748b; margin-bottom:8px;">${r.description || ''}</div>
            <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:10px; background:#f8fafc; padding:8px; border-radius:6px;">
                <div>
                    <label style="display:block; font-size:0.75em; font-weight:700; color:#475569; margin-bottom:2px;">Тип изчисление:</label>
                    <select onchange="updateRuleCalcType(${idx}, this.value)" style="width:100%; padding:4px 6px; border:1px solid #cbd5e1; border-radius:4px; font-weight:bold; background:#fff; font-size:0.85em;">
                        <option value="percent" ${isPercent ? 'selected' : ''}>% от базовия бонус</option>
                        <option value="fixed" ${!isPercent ? 'selected' : ''}>Твърда сума (€)</option>
                    </select>
                </div>
                <div>
                    <label style="display:block; font-size:0.75em; font-weight:700; color:#475569; margin-bottom:2px;">Праг (брой ${r.unit}):</label>
                    <input type="number" min="0" value="${r.threshold}" onchange="updateRuleThreshold(${idx}, this.value)" style="width:100%; padding:4px 8px; border:1px solid #cbd5e1; border-radius:4px; font-weight:bold;">
                </div>
                <div>
                    <label id="ruleAmountLabel_${idx}" style="display:block; font-size:0.75em; font-weight:700; color:#475569; margin-bottom:2px;">Размер (${isPercent ? '%' : '€'}):</label>
                    <input type="number" step="any" min="0" value="${val}" onchange="updateRuleAmount(${idx}, this.value)" style="width:100%; padding:4px 8px; border:1px solid #cbd5e1; border-radius:4px; font-weight:bold; color:${r.category === 'bonus' ? '#15803d' : '#dc2626'};">
                </div>
            </div>
        </div>
        `;
    }).join('');

    Swal.fire({
        title: '⚙️ Настройки на Правилата (Заповед)',
        html: `
            <div style="text-align:left; font-size:0.9em;">
                <div style="background:#eff6ff; border:1px solid #bfdbfe; border-radius:8px; padding:10px; margin-bottom:12px; font-size:0.85em; color:#1e40af;">
                    💡 Тук можете да промените дали санкциите и поощренията са в <b>проценти (%) от базовия бонус</b> или <b>твърда сума (€)</b>, както и да настроите праговете спрямо утвърдената Заповед.
                </div>
                <div style="max-height:360px; overflow-y:auto; padding-right:4px;">
                    ${rulesHtml}
                </div>
            </div>
        `,
        width: 680,
        showCancelButton: true,
        confirmButtonText: '💾 Запази правилата',
        cancelButtonText: 'Отказ',
        confirmButtonColor: '#2563eb'
    }).then(async res => {
        if (res.isConfirmed) {
            await saveBonusRulesToDb();
        }
    });
};

window.updateRuleCalcType = function (idx, type) {
    if (salaryRulesCache[idx]) {
        salaryRulesCache[idx].calc_type = type;
        const lbl = document.getElementById(`ruleAmountLabel_${idx}`);
        if (lbl) lbl.textContent = `Размер (${type === 'fixed' ? '€' : '%'}):`;
    }
};

window.toggleRuleActive = function (idx, active) {
    if (salaryRulesCache[idx]) {
        salaryRulesCache[idx].is_active = active;
    }
};

window.updateRuleThreshold = function (idx, val) {
    if (salaryRulesCache[idx]) {
        salaryRulesCache[idx].threshold = parseInt(val) || 0;
    }
};

window.updateRuleAmount = function (idx, val) {
    if (salaryRulesCache[idx]) {
        const amt = parseFloat(val) || 0;
        if (salaryRulesCache[idx].category === 'bonus') {
            salaryRulesCache[idx].bonus_amount = amt;
            salaryRulesCache[idx].penalty_amount = 0;
        } else {
            salaryRulesCache[idx].penalty_amount = amt;
            salaryRulesCache[idx].bonus_amount = 0;
        }
    }
};

async function saveBonusRulesToDb() {
    Swal.fire({ title: 'Запазване на правилата...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    try {
        localStorage.setItem('amci_salary_bonus_rules', JSON.stringify(salaryRulesCache));

        // Try upserting to Supabase
        for (const rule of salaryRulesCache) {
            const payload = {
                rule_code: rule.rule_code,
                rule_name: rule.rule_name,
                category: rule.category,
                threshold: rule.threshold,
                calc_type: rule.calc_type || 'percent',
                penalty_amount: rule.penalty_amount,
                bonus_amount: rule.bonus_amount,
                unit: rule.unit,
                description: rule.description,
                is_active: rule.is_active,
                updated_at: new Date().toISOString()
            };
            await client.from('salary_bonus_rules').upsert([payload], { onConflict: 'rule_code' });
        }

        Swal.fire({ icon: 'success', title: 'Правилата са обновени!', timer: 1400, showConfirmButton: false });
        calculateMonthlySalaries();
    } catch (e) {
        console.warn('Supabase rules upsert notice:', e.message);
        Swal.fire({ icon: 'success', title: 'Правилата са записани локално!', text: 'За постоянна синхронизация с базата, изпълнете setup_salaries_system.sql в Supabase.', timer: 2500 });
        calculateMonthlySalaries();
    }
}

// ==============================================================================
// 8. Експорт на Ведомостта в Excel (SheetJS)
// ==============================================================================
window.exportSalariesToExcel = function () {
    if (!salaryCalculations || salaryCalculations.length === 0) {
        Swal.fire('Няма данни', 'Първо пресметнете заплатите за месеца.', 'info');
        return;
    }

    const monthName = MONTH_NAMES_BG[currentSalaryMonthIndex];
    const exportData = salaryCalculations.map((c, i) => ({
        "№": i + 1,
        "Служител (Име)": c.workerName,
        "Длъжност": c.position,
        "Имейл": c.workerEmail,
        "Присъствени дни": c.totalCheckIns,
        "Базов бонус (€)": c.baseBonus,
        "Закъснения (общо бр.)": c.lateCount,
        "Оправдани закъснения (бр.)": c.excusedLateCount || 0,
        "Неоправдани закъснения (бр.)": c.unexcusedLateCount !== undefined ? c.unexcusedLateCount : c.lateCount,
        "Удръжка закъснения (%)": c.latePenaltyPct > 0 ? `-${c.latePenaltyPct}%` : '0%',
        "Удръжка закъснения (€)": c.latePenalty > 0 ? -c.latePenalty : 0,
        "3S Неиздържани (общо бр.)": c.failedAuditsCount,
        "3S Оправдани (бр.)": c.excusedAuditCount || 0,
        "Удръжка 3S (%)": c.auditPenaltyPct > 0 ? `-${c.auditPenaltyPct}%` : '0%',
        "Удръжка 3S (€)": c.auditPenalty > 0 ? -c.auditPenalty : 0,
        "Брак / Грешки (бр.)": c.defectsCount,
        "Удръжка Брак (%)": c.defectPenaltyPct > 0 ? `-${c.defectPenaltyPct}%` : '0%',
        "Удръжка Брак (€)": c.defectPenalty > 0 ? -c.defectPenalty : 0,
        "Ръчна корекция (€)": c.manualAdjustment,
        "Бележка / Обосновка": c.manualNotes,
        "КРАЕН БОНУС (€)": c.finalBonusPayout,
        "Месец": monthName,
        "Година": c.year
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `Бонуси_${monthName}`);
    XLSX.writeFile(wb, `AMCI_Vedomost_Bonusi_${monthName}_${currentSalaryYear}.xlsx`);

    Swal.fire({ icon: 'success', title: 'Свалено в Excel!', text: `Ведомостта за ${monthName} ${currentSalaryYear} е изтеглена.`, timer: 2000, showConfirmButton: false });
};

// ==============================================================================
// 9. Запазване и Публикуване към цеховите терминали (salary_monthly_logs)
// ==============================================================================
window.publishMonthlySalariesToTerminals = async function () {
    if (!salaryCalculations || salaryCalculations.length === 0) {
        Swal.fire('Няма данни', 'Първо пресметнете заплатите за месеца.', 'info');
        return;
    }

    const monthName = MONTH_NAMES_BG[currentSalaryMonthIndex];
    const confirm = await Swal.fire({
        title: `📤 Публикуване на фишове за ${monthName}?`,
        html: `
            <div style="text-align:left; font-size:0.92rem; color:#334155; line-height:1.5;">
                <p>Сигурни ли сте, че искате да <b>одобрите и публикувате</b> изчисленията за <b>${monthName} ${currentSalaryYear} г.</b> към цеховите терминали?</p>
                <div style="background:#f0fdf4; border:1px solid #bbf7d0; padding:10px 12px; border-radius:8px; margin-top:10px; font-size:0.85rem; color:#166534;">
                    ✅ <b>Какво ще стане:</b> Всички служители (${salaryCalculations.length} души) ще могат да влязат в личното си досие на терминала с личния си ПИН и да видят своя електронен фиш с бонусите за месеца.
                </div>
            </div>
        `,
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: '🚀 Да, Публикувай към терминалите',
        cancelButtonText: 'Отказ',
        confirmButtonColor: '#16a34a',
        cancelButtonColor: '#64748b'
    });

    if (!confirm.isConfirmed) return;

    await saveMonthlySalariesToDb('Одобрено');
};

window.unpublishMonthlySalaries = async function () {
    const monthName = MONTH_NAMES_BG[currentSalaryMonthIndex];
    const confirm = await Swal.fire({
        title: `Сваляне от терминалите?`,
        text: `Искате ли да върнете ведомостта за ${monthName} ${currentSalaryYear} г. в статус "Чернова"? Служителите временно няма да я виждат на терминалите, докато не я публикувате отново.`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: '↩️ Върни в чернова',
        cancelButtonText: 'Отказ',
        confirmButtonColor: '#ea580c'
    });

    if (!confirm.isConfirmed) return;

    await saveMonthlySalariesToDb('Чернова');
};

window.saveMonthlySalariesToDb = async function (targetStatus = 'Чернова') {
    if (!salaryCalculations || salaryCalculations.length === 0) {
        Swal.fire('Няма данни', 'Първо пресметнете заплатите за месеца.', 'info');
        return;
    }

    const monthName = MONTH_NAMES_BG[currentSalaryMonthIndex];
    Swal.fire({ 
        title: targetStatus === 'Одобрено' ? `Публикуване на фишове за ${monthName}...` : `Запазване на чернова за ${monthName}...`, 
        allowOutsideClick: false, 
        didOpen: () => Swal.showLoading() 
    });

    try {
        const rowsToSave = salaryCalculations.map(c => ({
            month: monthName,
            year: c.year,
            worker_email: c.workerEmail,
            worker_name: c.workerName,
            position: c.position,
            base_salary: c.baseSalary || 0,
            base_bonus: c.baseBonus || 0,
            late_count: c.lateCount || 0,
            late_penalty: c.latePenalty || 0,
            audit_3s_failed_count: c.failedAuditsCount || 0,
            audit_3s_penalty: c.auditPenalty || 0,
            report_mistakes_count: c.defectsCount || 0,
            report_penalty: c.defectPenalty || 0,
            manual_adjustment: c.manualAdjustment || 0,
            manual_notes: c.manualNotes || '',
            total_penalty: c.totalPenalty || 0,
            total_bonus: c.totalBonus || 0,
            final_payout: c.finalBonusPayout || 0,
            status: targetStatus,
            details_json: {
                latePenaltyPct: c.latePenaltyPct || 0,
                auditPenaltyPct: c.auditPenaltyPct || 0,
                defectPenaltyPct: c.defectPenaltyPct || 0,
                overrideLatePenalty: c.overrideLatePenalty !== undefined ? c.overrideLatePenalty : null,
                overrideAuditPenalty: c.overrideAuditPenalty !== undefined ? c.overrideAuditPenalty : null,
                unexcusedLateCount: c.unexcusedLateCount !== undefined ? c.unexcusedLateCount : c.lateCount,
                excusedLateCount: c.excusedLateCount || 0,
                unexcusedAuditCount: c.unexcusedAuditCount !== undefined ? c.unexcusedAuditCount : c.failedAuditsCount,
                excusedAuditCount: c.excusedAuditCount || 0,
                lates: c.lates || [],
                failedAudits: c.failedAudits || []
            },
            updated_at: new Date().toISOString()
        }));

        const { error } = await client.from('salary_monthly_logs').upsert(rowsToSave, { onConflict: 'month,year,worker_email' });
        if (error) throw error;

        currentSalaryMonthStatus = targetStatus;
        salaryCalculations.forEach(c => { c.status = targetStatus; });

        renderSalariesLayout();

        if (targetStatus === 'Одобрено') {
            Swal.fire({
                icon: 'success',
                title: 'Фишовете са публикувани!',
                html: `Ведомостта за <b>${monthName} ${currentSalaryYear} г.</b> е одобрена.<br>Всички служители вече могат да си виждат фиша на терминалите с личния си ПИН.`,
                confirmButtonColor: '#16a34a'
            });
        } else {
            Swal.fire({
                icon: 'success',
                title: 'Черновата е запазена!',
                text: `Данните за ${monthName} ${currentSalaryYear} г. са запазени в базата като чернова. Служителите все още не ги виждат на терминалите.`,
                timer: 2200,
                showConfirmButton: false
            });
        }
    } catch (e) {
        console.warn('saveMonthlySalariesToDb note:', e.message);
        Swal.fire({
            icon: 'error',
            title: 'Грешка при запис',
            html: `Неуспешен запис в базата данни: ${e.message}<br><br><span style="font-size:0.85em; color:#64748b;">Уверете се, че сте изпълнили еднократно SQL скрипта <b>setup_salaries_system.sql</b> в Supabase SQL Editor.</span>`
        });
    }
};

        const { error } = await client.from('salary_monthly_logs').upsert(rowsToSave, { onConflict: 'month,year,worker_email' });
        if (error) throw error;

        currentSalaryMonthStatus = targetStatus;
        salaryCalculations.forEach(c => { c.status = targetStatus; });

        renderSalariesLayout();

        if (targetStatus === 'Одобрено') {
            Swal.fire({
                icon: 'success',
                title: 'Фишовете са публикувани!',
                html: `Ведомостта за <b>${monthName} ${currentSalaryYear} г.</b> е одобрена.<br>Всички служители вече могат да си виждат фиша на терминалите с личния си ПИН.`,
                confirmButtonColor: '#16a34a'
            });
        } else {
            Swal.fire({
                icon: 'success',
                title: 'Черновата е запазена!',
                text: `Данните за ${monthName} ${currentSalaryYear} г. са запазени в базата като чернова. Служителите все още не ги виждат на терминалите.`,
                timer: 2200,
                showConfirmButton: false
            });
        }
    } catch (e) {
        console.warn('saveMonthlySalariesToDb note:', e.message);
        Swal.fire({
            icon: 'error',
            title: 'Грешка при запис',
            html: `Неуспешен запис в базата данни: ${e.message}<br><br><span style="font-size:0.85em; color:#64748b;">Уверете се, че сте изпълнили еднократно SQL скрипта <b>setup_salaries_system.sql</b> в Supabase SQL Editor.</span>`
        });
    }
};

