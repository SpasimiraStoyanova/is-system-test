// ==============================================================================
// МОДУЛ ЗА БЛОКИРАЩО НАПОМНЯНЕ ЗА НЕПОЕТА ЗАДАЧА СЛЕД 08:35 Ч. (ТЕРМИНАЛ)
// ==============================================================================

window.pendingIdleTaskReminder = null;
let idleReminderCheckTimer = null;
let isIdleReminderChecking = false;

// Белият списък за Push известия в тестовата среда
const IDLE_TEST_ALLOWED_EMAILS = [
    'sstoyanova.amci@gmail.com',
    'amcirazlog@gmail.com',
    'ivaylo.avr@gmail.com'
];

/**
 * Синхронизира текущата машина на работника в таблицата worker_machines
 */
async function syncWorkerMachineToDb() {
    if (!currentEmail || !client) return;
    try {
        const machineToSave = (currentMachine && currentMachine !== 'ВСИЧКИ') ? currentMachine : 'Обща';
        await client.from('worker_machines').upsert({
            worker_email: currentEmail.trim().toLowerCase(),
            worker_name: currentOperator || currentEmail,
            machine: machineToSave,
            updated_at: new Date().toISOString()
        });
    } catch (e) {
        console.warn('Синхронизация на машина неуспешна:', e);
    }
}

/**
 * Звуков сигнал за напомнянето
 */
function playIdleReminderChime() {
    try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        const ctx = new AudioCtx();
        if (ctx.state === 'suspended') ctx.resume();
        const now = ctx.currentTime;

        const osc1 = ctx.createOscillator();
        const gain1 = ctx.createGain();
        osc1.type = 'triangle';
        osc1.frequency.setValueAtTime(440, now); // A4
        osc1.frequency.setValueAtTime(587.33, now + 0.15); // D5
        osc1.frequency.setValueAtTime(880, now + 0.35); // A5

        gain1.gain.setValueAtTime(0.3, now);
        gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.85);

        osc1.connect(gain1);
        gain1.connect(ctx.destination);
        osc1.start(now);
        osc1.stop(now + 0.85);
    } catch (e) {
        console.warn('Reminder audio skipped:', e);
    }
}

/**
 * Изпраща Push известие през OneSignal (само за позволените тестови имейли в IS_SYSTEM_TEST)
 */
async function sendIdleReminderPushNotification({ workerName, workerEmail, machine, availableCount, isMorning = false }) {
    if (!workerEmail) return false;
    const cleanEmail = workerEmail.trim().toLowerCase();

    // Защита: в тестова среда изпращаме САМО до тестовия списък
    if (!IDLE_TEST_ALLOWED_EMAILS.includes(cleanEmail)) {
        console.log(`[PUSH ЗАЩИТА] ${cleanEmail} не е в тестовия списък. Push известие не се изпраща.`);
        return false;
    }

    const ONESIGNAL_APP_ID = "2507a9cb-0d28-4952-9b7b-42e800a61613";
    const ONESIGNAL_API_KEY = "os_v2_app_eud2tsynfbevfg33iluabjqwcngcem2gdkaebuebdt" + "ob2ewfduy6d6lsudjvxyol6gqh7tatgimm7kewbh4sjp7yea5hzqmmdydqxkq";

    let title = isMorning 
        ? `⚠️ Напомняне: Непоета задача (${machine})`
        : `⚠️ Напомняне: Престой над 10 мин. (${machine})`;
    let body = isMorning
        ? `👷 ${workerName || 'Колега'}, вече е след 8:35 ч., а на ${machine} има ${availableCount} свободни задачи. Моля, отворете терминала и поемете задача!`
        : `👷 ${workerName || 'Колега'}, изминаха повече от 10 мин. без поета задача, а на ${machine} има ${availableCount} свободни задачи. Моля, поемете задача!`;
    let terminalUrl = window.location.origin + window.location.pathname.replace(/[^/]*$/, '') + 'terminal.html';

    let payload = {
        app_id: ONESIGNAL_APP_ID,
        headings: { "en": title, "bg": title },
        contents: { "en": body, "bg": body },
        url: terminalUrl,
        priority: 10,
        include_external_user_ids: [cleanEmail]
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
        if (response.ok) {
            console.log("OneSignal Idle Push изпратено успешно:", cleanEmail);
            return true;
        }
    } catch (e) {
        console.warn("OneSignal Push грешка:", e);
    }
    return false;
}

/**
 * Проверка на условията за непоета задача:
 * 1. Сутрин след 08:35 ч., ако работникът все още не е започнал нито една задача днес.
 * 2. През целия ден: ако работникът приключи/освободи задача и в рамките на 10 минути не поеме нова.
 * Важно: Известие се изпраща САМО И ЕДИНСТВЕНО, ако за работното му място има налични свободни (неблокирани) сини задачи!
 */
async function checkIdleWorkerReminder() {
    if (isIdleReminderChecking) return;
    if (!currentEmail || !isUserCheckedIn || !client) return;
    if (typeof globalTasks === 'undefined' || !Array.isArray(globalTasks)) return;

    // 1. Проверка дали работникът в момента има текущо поета активна задача
    if (activeTaskId !== null && activeTaskId !== undefined) return;
    if (globalTasks.some(t => t.isTaken)) return;

    // 2. Проверка на СИНИТЕ ЗАДАЧИ за неговото работно място
    // Филтрираме регулярните задачи (без зелени буферни карти и без проби)
    const blueTasks = globalTasks.filter(t => (!t.isGreenCard && !t.isProba && !t.isBuffer) || t.type === 'СИНЯ');
    if (blueTasks.length === 0) {
        // Няма заложени сини задачи за това работно място -> НЕ безпокоим работника!
        return;
    }

    // Ако ВСИЧКИ сини задачи са блокирани (isBlocked === true), не пращаме известие!
    const unblockedBlueTasks = blueTasks.filter(t => !t.isBlocked);
    if (unblockedBlueTasks.length === 0) {
        // Всички сини задачи са блокирани -> работникът не може да започне, не го безпокоим!
        return;
    }

    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const startOfDay = todayStr + 'T00:00:00.000Z';
    const cleanEmail = currentEmail.trim().toLowerCase();

    isIdleReminderChecking = true;

    try {
        // 3. Взимаме напомнянията за днес (сортирани низходящо)
        const { data: reminderData, error: remErr } = await client
            .from('task_reminders')
            .select('*')
            .eq('reminder_date', todayStr)
            .eq('worker_email', cleanEmail)
            .order('sent_at', { ascending: false });

        if (remErr) {
            console.warn('Грешка при четене на task_reminders:', remErr);
            isIdleReminderChecking = false;
            return;
        }

        const reminders = reminderData || [];
        const latestReminder = reminders.length > 0 ? reminders[0] : null;

        // 3.1. Ако има напомняне със статус 'SENT' и без 'read_at' -> веднага показваме блокиращия прозорец!
        if (latestReminder && latestReminder.status === 'SENT' && !latestReminder.read_at) {
            showBlockingIdleTaskReminder(latestReminder);
            isIdleReminderChecking = false;
            return;
        }

        // 3.2. Кулдаун между напомняния (минимум 10 минути от последното изпратено напомняне)
        if (latestReminder && latestReminder.sent_at) {
            const timeSinceLastReminder = now.getTime() - new Date(latestReminder.sent_at).getTime();
            if (timeSinceLastReminder < 10 * 60 * 1000) {
                // Минали са по-малко от 10 минути от предишното напомняне -> изчакваме
                isIdleReminderChecking = false;
                return;
            }
        }

        // 4. Търсим последния приключен отчет за днес от таблицата otcheti
        let lastFinishedTime = null;
        try {
            const opName = currentOperator || cleanEmail;
            const { data: repData } = await client
                .from('otcheti')
                .select('Дата, Статус')
                .or(`Оператор.eq."${opName}",Оператор.eq."${cleanEmail}"`)
                .gte('Дата', startOfDay)
                .order('Дата', { ascending: false })
                .limit(1);

            if (repData && repData.length > 0 && repData[0]['Дата']) {
                lastFinishedTime = new Date(repData[0]['Дата']).getTime();
            }
        } catch (e) {
            console.warn('Грешка при четене на последния отчет:', e);
        }

        // Проверяваме и локално записано време за старт на престоя в браузъра
        const localIdleStartStr = localStorage.getItem('mes_last_task_idle_start');
        if (localIdleStartStr) {
            const localIdleTime = parseInt(localIdleStartStr, 10);
            if (!isNaN(localIdleTime)) {
                if (!lastFinishedTime || localIdleTime > lastFinishedTime) {
                    lastFinishedTime = localIdleTime;
                }
            }
        }

        // 5. ОПРЕДЕЛЯНЕ ДАЛИ ТРЯБВА ДА СЕ ИЗПРАТИ ИЗВЕСТИЕ:
        let shouldTrigger = false;
        let reminderReason = '';
        let isMorningTrigger = false;

        if (lastFinishedTime) {
            // А) Има приключена или освободена задача днес:
            const idleMs = now.getTime() - lastFinishedTime;
            if (idleMs >= 10 * 60 * 1000) {
                // Изминали са поне 10 минути без поемане на нова задача!
                shouldTrigger = true;
                const minutesIdle = Math.floor(idleMs / 60000);
                reminderReason = `Престой ${minutesIdle} мин. без поета задача след приключване`;
            }
        } else {
            // Б) Все още няма приключена задача днес (сутрешно начало на смяната):
            const isAfter835 = (now.getHours() > 8) || (now.getHours() === 8 && now.getMinutes() >= 35);
            if (isAfter835) {
                shouldTrigger = true;
                reminderReason = `Непоета задача сутрин след 08:35 ч.`;
                isMorningTrigger = true;
            }
        }

        if (!shouldTrigger) {
            isIdleReminderChecking = false;
            return;
        }

        // 6. СЪЗДАВАМЕ НАПОМНЯНЕ
        const insertPayload = {
            reminder_date: todayStr,
            worker_name: currentOperator || currentEmail,
            worker_email: cleanEmail,
            machine: currentMachine || 'Обща',
            status: 'SENT',
            sent_at: now.toISOString(),
            available_blue_tasks: unblockedBlueTasks.length,
            notes: reminderReason
        };

        let reminderToShow = null;
        const { data: created, error: insErr } = await client
            .from('task_reminders')
            .insert([insertPayload])
            .select()
            .single();

        if (!insErr && created) {
            reminderToShow = created;
        } else if (insErr) {
            console.warn('task_reminders insert notice:', insErr.message);
            // Ако уникалното ограничение все още съществува в базата данни, обновяваме днешния запис:
            const { data: updated } = await client
                .from('task_reminders')
                .update({
                    status: 'SENT',
                    sent_at: now.toISOString(),
                    read_at: null,
                    claimed_at: null,
                    available_blue_tasks: unblockedBlueTasks.length,
                    notes: insertPayload.notes
                })
                .eq('reminder_date', todayStr)
                .eq('worker_email', cleanEmail)
                .select()
                .single();
            reminderToShow = updated;
        }

        if (reminderToShow) {
            // Изпращаме и Push известие към мобилния телефон
            sendIdleReminderPushNotification({
                workerName: currentOperator,
                workerEmail: cleanEmail,
                machine: currentMachine || 'Обща',
                availableCount: unblockedBlueTasks.length,
                isMorning: isMorningTrigger
            });
            // Показваме блокиращия прозорец
            showBlockingIdleTaskReminder(reminderToShow);
        }

    } catch (err) {
        console.error('Грешка в checkIdleWorkerReminder:', err);
    } finally {
        isIdleReminderChecking = false;
    }
}

/**
 * Показва НАПЪЛНО БЛОКИРАЩ модален прозорец:
 * - Без 'X' (showCloseButton: false)
 * - Без затваряне при клик встрани (allowOutsideClick: false)
 * - Без затваряне с Escape (allowEscapeKey: false)
 * - Единствен бутон: "✅ РАЗБРАХ, ПОЕМАМ ЗАДАЧА"
 */
function showBlockingIdleTaskReminder(reminder) {
    if (window.pendingIdleTaskReminder && window.pendingIdleTaskReminder.id === reminder.id) {
        // Вече е отворен
        return;
    }
    window.pendingIdleTaskReminder = reminder;

    playIdleReminderChime();
    if (navigator.vibrate) navigator.vibrate([250, 100, 250, 100, 450]);

    const machineName = reminder.machine || currentMachine || 'работното място';
    const availCount = reminder.available_blue_tasks || 'няколко';
    const isMorning = reminder.notes && reminder.notes.includes('08:35');

    let alertHeaderHtml = isMorning
        ? `⏰ Вече е след <b>08:35 ч.</b>, а на вашето работно място (<b>${escapeHtml(machineName)}</b>) все още нямате стартирана задача за днешната смяна!`
        : `⏰ Изминаха повече от <b>10 минути</b> без поета задача, а на вашето работно място (<b>${escapeHtml(machineName)}</b>) има свободни задачи!`;

    Swal.fire({
        title: '⚠️ НАПОМНЯНЕ: НЕПОЕТА ЗАДАЧА!',
        html: `
            <div style="text-align: left; font-size: 1.05em; color: #1e293b; line-height: 1.5; padding: 4px;">
                <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 10px; padding: 14px; margin-bottom: 14px; color: #991b1b; font-weight: 700; box-shadow: 0 1px 3px rgba(239,68,68,0.1);">
                    ${alertHeaderHtml}
                </div>
                
                <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 10px; padding: 14px; margin-bottom: 14px; color: #166534; font-weight: 700;">
                    📦 <b>Налични детайли:</b> Има <b>${availCount}</b> свободни задачи (сини карти), готови за производство.
                </div>

                <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px; font-size: 0.92em; color: #475569; font-weight: 600;">
                    🔒 <b>Внимание:</b> Терминалът е блокиран. За да го отключите и да започнете работа, трябва да потвърдите, че сте прочели това съобщение.
                </div>
            </div>
        `,
        icon: 'warning',
        confirmButtonText: '✅ РАЗБРАХ, ПОЕМАМ ЗАДАЧА',
        confirmButtonColor: '#2563eb',
        allowOutsideClick: false,
        allowEscapeKey: false,
        showCloseButton: false,
        allowEnterKey: false,
        backdrop: 'rgba(15, 23, 42, 0.88)',
        customClass: {
            confirmButton: 'btn-confirm-idle-reminder'
        }
    }).then(async (result) => {
        if (result.isConfirmed) {
            await acknowledgeIdleTaskReminder(reminder.id);
        }
    });
}

/**
 * Отбелязва напомнянето като ПРОЧЕТЕНО в базата:
 * - Записва status = 'READ' и read_at = now() в task_reminders
 * - Вписва "👁️ Прочетено напомняне за задача" в таблицата chekiraniya
 * - Отключва терминала
 */
async function acknowledgeIdleTaskReminder(reminderId) {
    const nowIso = new Date().toISOString();
    window.pendingIdleTaskReminder = null; // Отключваме проверката локално

    try {
        // 1. Обновяване в task_reminders
        await client
            .from('task_reminders')
            .update({
                status: 'READ',
                read_at: nowIso
            })
            .eq('id', reminderId);

        // 2. Запис в chekiraniya за постоянен одит
        await client.from('chekiraniya').insert([{
            "Име": currentOperator || currentEmail,
            "Имейл": currentEmail,
            "Действие": "👁️ Прочетено напомняне за задача",
            "Време": nowIso,
            "Локация": (currentMachine && currentMachine !== 'ВСИЧКИ') ? currentMachine : 'Терминал',
            "Бележка": "Потвърдено блокиращо подсещане след 08:35 ч."
        }]);

        // 3. Обратна връзка към работника
        Swal.fire({
            icon: 'success',
            title: 'Терминалът е отключен!',
            text: 'Моля, изберете и поемете свободна задача от списъка.',
            timer: 2000,
            showConfirmButton: false
        });

    } catch (err) {
        console.error('Грешка при потвърждаване на напомняне:', err);
    }
}

/**
 * Маркира в task_reminders, че работникът успешно е поел задача
 */
async function markTaskClaimedInReminders() {
    if (!currentEmail || !client) return;
    try {
        const todayStr = new Date().toISOString().split('T')[0];
        const cleanEmail = currentEmail.trim().toLowerCase();

        await client
            .from('task_reminders')
            .update({
                status: 'CLAIMED',
                claimed_at: new Date().toISOString()
            })
            .eq('reminder_date', todayStr)
            .eq('worker_email', cleanEmail)
            .is('claimed_at', null);
    } catch (e) {
        console.warn('Грешка при маркиране на поета задача в task_reminders:', e);
    }
}

// Периодична проверка на всеки 30 секунди (ако терминалът стои отворен на машината)
if (idleReminderCheckTimer) clearInterval(idleReminderCheckTimer);
idleReminderCheckTimer = setInterval(() => {
    checkIdleWorkerReminder();
}, 30000);

