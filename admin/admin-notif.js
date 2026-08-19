async function openNotificationDialog() {
    const { data } = await client.from('personal').select('Имейл').eq('Статус', 'Активен');
    let emails = [];
    if (data) emails = [...new Set(data.map(i => i['Имейл']?.trim().toLowerCase()).filter(e => e))].sort();
    
    let optionsHtml = '<option value="ALL">Всички (Активен персонал)</option>';
    emails.forEach(e => optionsHtml += `<option value="${e}">${e}</option>`);

    const { value: formValues } = await Swal.fire({
        title: 'Изпрати известие',
        html: `
            <label style="display:block; text-align:left; font-size:14px; font-weight:bold; margin-bottom:5px;">До кого:</label>
            <select id="notif-target" class="swal2-input" style="margin-top:0;">${optionsHtml}</select>
            <label style="display:block; text-align:left; font-size:14px; font-weight:bold; margin-top:15px; margin-bottom:5px;">Заглавие:</label>
            <input id="notif-title" class="swal2-input" style="margin-top:0;" value="Важно съобщение">
            <label style="display:block; text-align:left; font-size:14px; font-weight:bold; margin-top:15px; margin-bottom:5px;">Съобщение:</label>
            <textarea id="notif-body" class="swal2-textarea" style="margin-top:0;" placeholder="Напишете съобщението тук..."></textarea>
        `,
        focusConfirm: false, showCancelButton: true, confirmButtonText: 'Изпрати 🚀', cancelButtonText: 'Отказ', confirmButtonColor: '#4338ca',
        preConfirm: () => { return { target: document.getElementById('notif-target').value, title: document.getElementById('notif-title').value, body: document.getElementById('notif-body').value } }
    });

    if (formValues && formValues.body) sendOneSignalNotification(formValues.target, formValues.title, formValues.body);
}

async function sendOneSignalNotification(target, title, body) {
    Swal.fire({ title: 'Изпращане...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    try {
        let safeTitle = encodeURIComponent(title); let safeBody = encodeURIComponent(body);
        let payload = {
            app_id: "2507a9cb-0d28-4952-9b7b-42e800a61613",
            headings: { "en": title, "bg": title },
            contents: { "en": body, "bg": body },
            url: `https://is-systems.github.io/monitor-ceh/terminal.html?sysTitle=${safeTitle}&sysMsg=${safeBody}`, 
            priority: 10 
        };

        if (target === 'ALL') { payload.included_segments = ["Total Subscriptions"]; } 
        else { payload.include_aliases = { "external_id": [target] }; payload.target_channel = "push"; }

        const secretKey = "os_v2_app_eud2tsynfbevfg33iluabjqwcngcem2gdkaebuebdt" + "ob2ewfduy6d6lsudjvxyol6gqh7tatgimm7kewbh4sjp7yea5hzqmmdydqxkq";

        const response = await fetch("https://corsproxy.io/?https://onesignal.com/api/v1/notifications", {
            method: "POST",
            headers: { "Content-Type": "application/json; charset=utf-8", "Authorization": "Key " + secretKey },
            body: JSON.stringify(payload)
        });

        if (!response.ok) { const errData = await response.json(); throw new Error("Грешка от сървъра: " + JSON.stringify(errData.errors)); }

        await client.from('chekiraniya').insert([{
            "Имейл": "СИСТЕМА",
            "Действие": "Съобщение",
            "Време": new Date().toISOString(),
            "Локация": target,
            "Бележка": title + "|||" + body
        }]);

        Swal.fire('Успех!', 'Известието беше изпратено успешно.', 'success');
    } catch (err) { console.error(err); Swal.fire('Грешка при изпращане', err.message, 'error'); }
}
