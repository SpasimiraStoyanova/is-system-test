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
async function sendIdleReminderPushNotification({ workerName, workerEmail, machine, availableCount }) {
    if (!workerEmail) return false;
    const cleanEmail = workerEmail.trim().toLowerCase();

    // Защита: в тестова среда изпращаме САМО до тестовия списък
    if (!IDLE_TEST_ALLOWED_EMAILS.includes(cleanEmail)) {
        console.log(`[PUSH ЗАЩИТА] ${cleanEmail} не е в тестовия списък. Push известие не се изпраща.`);
        return false;
    }

    const ONESIGNAL_APP_ID = "2507a9cb-0d28-4952-9b7b-42e800a61613";
    const ONESIGNAL_API_KEY = "os_v2_app_eud2tsynfbevfg33iluabjqwcngcem2gdkaebuebdt" + "ob2ewfduy6d6lsudjvxyol6gqh7tatgimm7kewbh4sjp7yea5hzqmmdydqxkq";

    let title = `⚠️ Напомняне: Непоета задача (${machine})`;
    let body = `👷 ${workerName || 'Колега'}, вече е след 8:35 ч., а на ${machine} има ${availableCount} свободни задачи. Моля, отворете терминала и поемете задача!`;
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
 * Проверка на условията за непоета задача след 08:35 ч.
 */
async function checkIdleWorkerReminder() {
    if (isIdleReminderChecking) return;
    if (!currentEmail || !isUserCheckedIn || !client) return;
    if (typeof globalTasks === 'undefined' || !Array.isArray(globalTasks)) return;

    // 1. Проверка на часа (трябва да е след 08:35 ч.)
    const now = new Date();
    const isAfterTime = (now.getHours() > 8) || (now.getHours() === 8 && now.getMinutes() >= 35);
    if (!isAfterTime) return;

    isIdleReminderChecking = true;

    try {
        const todayStr = now.toISOString().split('T')[0];
        const cleanEmail = currentEmail.trim().toLowerCase();

        // 2. Първо проверяваме дали в task_reminders вече има запис за днес
        const { data: reminderData, error: remErr } = await client
            .from('task_reminders')
            .select('*')
            .eq('reminder_date', todayStr)
            .eq('worker_email', cleanEmail)
            .limit(1);

        if (remErr) {
            console.warn('Грешка при четене на task_reminders:', remErr);
            isIdleReminderChecking = false;
            return;
        }

        let existing = (reminderData && reminderData.length > 0) ? reminderData[0] : null;

        // Ако вече има напомняне за днес и то все още НЕ Е ПРОЧЕТЕНО -> веднага показваме блокиращия прозорец!
        if (existing && existing.status === 'SENT' && !existing.read_at) {
            showBlockingIdleTaskReminder(existing);
            isIdleReminderChecking = false;
            return;
        }

        // Ако вече е прочетено или изпълнено за днес -> няма нужда от ново
        if (existing) {
            isIdleReminderChecking = false;
            return;
        }

        // 3. Проверка дали работникът в момента има текущо поета активна задача
        if (activeTaskId !== null && activeTaskId !== undefined) {
            isIdleReminderChecking = false;
            return;
        }
        if (globalTasks.some(t => t.isTaken)) {
            isIdleReminderChecking = false;
            return;
        }

        // 4. Проверка на СИНИТЕ ЗАДАЧИ за неговото работно място
        // Филтрираме регулярните задачи (без зелени буферни карти и без проби)
        const blueTasks = globalTasks.filter(t => (!t.isGreenCard && !t.isProba && !t.isBuffer) || t.type === 'СИНЯ');
        if (blueTasks.length === 0) {
            // Няма заложени сини задачи за това работно място
            isIdleReminderChecking = false;
            return;
        }

        // Ключово изискване:
        // Ако ВСИЧКИ сини задачи са блокирани (isBlocked === true), не пращаме и не показваме известие!
        const unblockedBlueTasks = blueTasks.filter(t => !t.isBlocked);
        if (unblockedBlueTasks.length === 0) {
            // Всички сини задачи са блокирани -> работникът не може да започне, не го притесняваме
            isIdleReminderChecking = false;
            return;
        }

        // 5. Няма напомняне за днес, няма поета задача в момента и има свободни сини задачи -> СЪЗДАВАМЕ НАПОМНЯНЕ!
        const insertPayload = {
            reminder_date: todayStr,
            worker_name: currentOperator || currentEmail,
            worker_email: cleanEmail,
            machine: currentMachine || 'Обща',
            status: 'SENT',
            sent_at: now.toISOString(),
            available_blue_tasks: unblockedBlueTasks.length,
            notes: `Има ${unblockedBlueTasks.length} свободни сини задачи`
        };

        const { data: created, error: insErr } = await client
            .from('task_reminders')
            .insert([insertPayload])
            .select()
            .single();

        if (!insErr && created) {
            existing = created;
            // Изпращаме и Push известие към мобилния телефон
            sendIdleReminderPushNotification({
                workerName: currentOperator,
                workerEmail: cleanEmail,
                machine: currentMachine || 'Обща',
                availableCount: unblockedBlueTasks.length
            });
            // Показваме блокиращия прозорец
            showBlockingIdleTaskReminder(existing);
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

    Swal.fire({
        title: '⚠️ НАПОМНЯНЕ: НЕПОЕТА ЗАДАЧА!',
        html: `
            <div style="text-align: left; font-size: 1.05em; color: #1e293b; line-height: 1.5; padding: 4px;">
                <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 10px; padding: 14px; margin-bottom: 14px; color: #991b1b; font-weight: 700; box-shadow: 0 1px 3px rgba(239,68,68,0.1);">
                    ⏰ Вече е след <b>08:35 ч.</b>, а на вашето работно място (<b>${escapeHtml(machineName)}</b>) все още нямате стартирана задача за днешната смяна!
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

