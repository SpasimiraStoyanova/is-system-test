// ========================================================
// IS-SYSTEMS: Мениджър на Заявки за Заготовки от Цеха
// ========================================================

let globalMaterialRequests = [];
let materialReqPollInterval = null;

document.addEventListener('DOMContentLoaded', () => {
    initMaterialRequests();
});

async function initMaterialRequests() {
    await fetchMaterialRequests();
    
    // Периодично опресняване на всеки 25 секунди
    if (materialReqPollInterval) clearInterval(materialReqPollInterval);
    materialReqPollInterval = setInterval(fetchMaterialRequests, 25000);
}

async function fetchMaterialRequests() {
    try {
        if (typeof client === 'undefined' || !client) return;

        const { data, error } = await client
            .from('material_requests')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(100);

        if (error) {
            // Ако таблицата още не съществува в Supabase
            if (error.code === '42P01' || (error.message && error.message.includes('relation'))) {
                console.warn('Таблицата material_requests още не съществува в Supabase. Изпълнете setup_material_requests.sql.');
                return;
            }
            console.error('Грешка при зареждане на заявки за заготовки:', error);
            return;
        }

        globalMaterialRequests = data || [];
        updatePlanningBadgesAndBanner();
    } catch (err) {
        console.error('Неочаквана грешка при fetchMaterialRequests:', err);
    }
}

function updatePlanningBadgesAndBanner() {
    const pendingRequests = globalMaterialRequests.filter(r => r.status === 'Чакаща');
    const count = pendingRequests.length;

    const badge = document.getElementById('adminPlanningBadge');
    const subBadge = document.getElementById('adminPlanningSubBadge');
    const banner = document.getElementById('adminGlobalAlertBanner');

    // 1. Обновяване на баджа на бутона 'Планиране'
    if (badge) {
        if (count > 0) {
            badge.innerText = count;
            badge.style.display = 'inline-block';
            badge.style.animation = 'pulse 1.8s infinite';
        } else {
            badge.style.display = 'none';
        }
    }

    if (subBadge) {
        if (count > 0) {
            subBadge.innerText = count;
            subBadge.style.display = 'inline-block';
        } else {
            subBadge.style.display = 'none';
        }
    }

    // 2. Информативен банер над контролите
    if (banner) {
        if (count > 0) {
            const first = pendingRequests[0];
            const dateStr = first.created_at ? new Date(first.created_at).toLocaleTimeString('bg-BG', { hour: '2-digit', minute: '2-digit' }) : '';
            const summaryText = count === 1 
                ? `В ${dateStr} ч. <b>${first.operator || 'Оператор'}</b> заяви заготовка за <span style="color:#0284c7;">${first.part_name}</span> (Машина: <b>${first.machine || 'Обща'}</b>)`
                : `<b>${count} чакащи заявки от цеха</b> (последна за <span style="color:#0284c7;">${first.part_name}</span> от ${first.operator || 'Оператор'})`;

            banner.innerHTML = `
                <div style="background: #fff7ed; border: 1px solid #fed7aa; border-left: 5px solid #ea580c; padding: 10px 16px; border-radius: 10px; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 2px 5px rgba(234, 88, 12, 0.08); flex-wrap: wrap; gap: 10px;">
                    <div style="display: flex; align-items: center; gap: 10px; font-size: 0.92em; color: #9a3412;">
                        <span style="font-size: 1.3em;">🔔</span>
                        <span>${summaryText}</span>
                    </div>
                    <button type="button" onclick="openMaterialRequestsModal()" style="background: linear-gradient(135deg, #ea580c, #c2410c); color: white; border: none; padding: 7px 15px; border-radius: 8px; font-weight: 800; font-size: 0.85em; cursor: pointer; box-shadow: 0 2px 4px rgba(234, 88, 12, 0.3);">
                        📋 Преглед на заявките (${count})
                    </button>
                </div>
            `;
            banner.style.display = 'block';
        } else {
            // Ако няма активни заявки, не показваме банера за заявки
            banner.innerHTML = '';
            banner.style.display = 'none';
        }
    }
}

function openMaterialRequestsModal() {
    const backdrop = document.getElementById('materialRequestsModalBackdrop');
    if (!backdrop) return;

    renderMaterialRequestsList();
    backdrop.style.display = 'flex';
}

function closeMaterialRequestsModal() {
    const backdrop = document.getElementById('materialRequestsModalBackdrop');
    if (backdrop) backdrop.style.display = 'none';
}

function renderMaterialRequestsList() {
    const container = document.getElementById('materialRequestsList');
    const badge = document.getElementById('modalReqCountBadge');
    if (!container) return;

    const pendingCount = globalMaterialRequests.filter(r => r.status === 'Чакаща').length;
    if (badge) {
        badge.innerText = `${pendingCount} чакащи`;
        badge.style.background = pendingCount > 0 ? '#ea580c' : '#16a34a';
    }

    if (globalMaterialRequests.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 40px 20px; color: #64748b;">
                <div style="font-size: 2.5em; margin-bottom: 10px;">🎉</div>
                <div style="font-weight: 800; font-size: 1.1em; color: #334155;">Няма регистрирани заявки за заготовки!</div>
                <div style="font-size: 0.88em; margin-top: 4px;">Когато оператор заяви заготовка от терминала, тя ще се появи тук.</div>
            </div>
        `;
        return;
    }

    let html = '<div style="display: flex; flex-direction: column; gap: 12px;">';
    globalMaterialRequests.forEach(req => {
        const isPending = (req.status === 'Чакаща');
        const cardBorder = isPending ? 'border-left: 5px solid #ea580c;' : 'border-left: 5px solid #16a34a; opacity: 0.85;';
        const cardBg = isPending ? '#ffffff' : '#f8fafc';
        
        let dateStr = '';
        if (req.created_at) {
            try {
                let p = req.created_at;
                if (!p.endsWith('Z') && !p.includes('+')) p += 'Z';
                dateStr = new Date(p).toLocaleString('bg-BG', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
            } catch(e) { dateStr = req.created_at; }
        }

        const statusPill = isPending 
            ? `<span style="background: #fff7ed; color: #c2410c; border: 1px solid #fed7aa; padding: 3px 10px; border-radius: 14px; font-weight: 800; font-size: 0.82em;">🟡 Чакаща заготовка</span>`
            : `<span style="background: #f0fdf4; color: #15803d; border: 1px solid #bbf7d0; padding: 3px 10px; border-radius: 14px; font-weight: 800; font-size: 0.82em;">🟢 Осигурена</span>`;

        html += `
            <div style="background: ${cardBg}; border: 1px solid #e2e8f0; ${cardBorder} border-radius: 12px; padding: 14px 18px; box-shadow: 0 1px 3px rgba(0,0,0,0.04); display: flex; flex-direction: column; gap: 10px;">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 8px;">
                    <div>
                        <div style="font-size: 1.15em; font-weight: 900; color: #0f172a;">${req.part_name} <span style="font-weight: 600; color: #64748b; font-size: 0.85em;">(${req.op_name || 'Операция'})</span></div>
                        <div style="font-size: 0.85em; color: #475569; margin-top: 2px;">
                            Машина: <b style="color: #1e3a8a;">${req.machine || 'Обща'}</b> &bull; Заявил: <b>${req.operator || 'Оператор'}</b> &bull; 🕒 ${dateStr}
                        </div>
                    </div>
                    <div>${statusPill}</div>
                </div>

                <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 8px 12px; font-size: 0.88em; color: #991b1b; font-weight: 700;">
                    Липсва: ${req.reasons || 'Наличност: 0'}
                </div>

                <div style="display: flex; justify-content: flex-end; align-items: center; gap: 10px; margin-top: 4px; border-top: 1px solid #f1f5f9; padding-top: 10px;">
                    ${isPending ? `
                        <button type="button" onclick="resolveMaterialRequest(${req.id}, '${encodeURIComponent(req.part_name)}')" style="background: linear-gradient(135deg, #16a34a, #15803d); color: white; border: none; padding: 7px 16px; border-radius: 8px; font-weight: 800; font-size: 0.85em; cursor: pointer; display: flex; align-items: center; gap: 6px; box-shadow: 0 2px 4px rgba(22, 163, 74, 0.25);">
                            ✅ Маркирай като Осигурена
                        </button>
                    ` : `
                        <span style="font-size: 0.82em; color: #64748b; font-weight: 700;">Решена на ${req.resolved_at ? new Date(req.resolved_at).toLocaleTimeString('bg-BG', { hour: '2-digit', minute: '2-digit' }) : ''} ч.</span>
                    `}
                    <button type="button" onclick="deleteMaterialRequest(${req.id})" style="background: #fee2e2; color: #dc2626; border: 1px solid #fecaca; padding: 6px 12px; border-radius: 8px; font-weight: 700; font-size: 0.82em; cursor: pointer;" title="Изтрий заявката">
                        🗑️
                    </button>
                </div>
            </div>
        `;
    });
    html += '</div>';

    container.innerHTML = html;
}

async function resolveMaterialRequest(id, encPartName) {
    const partName = decodeURIComponent(encPartName || '');
    try {
        const { error } = await client
            .from('material_requests')
            .update({
                status: 'Осигурена',
                resolved_at: new Date().toISOString(),
                resolved_by: 'Планьор / Админ'
            })
            .eq('id', id);

        if (error) throw error;

        Swal.fire({
            icon: 'success',
            title: 'Заявката е осигурена!',
            text: `Заготовката за ${partName} е маркирана като осигурена.`,
            timer: 2000,
            showConfirmButton: false
        });

        await fetchMaterialRequests();
        renderMaterialRequestsList();
    } catch(err) {
        Swal.fire('Грешка', err.message, 'error');
    }
}

async function deleteMaterialRequest(id) {
    const res = await Swal.fire({
        title: 'Изтриване на заявка?',
        text: 'Сигурни ли сте, че искате да изтриете този запис?',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Да, изтрий',
        cancelButtonText: 'Отказ',
        confirmButtonColor: '#dc2626'
    });

    if (res.isConfirmed) {
        try {
            const { error } = await client
                .from('material_requests')
                .delete()
                .eq('id', id);

            if (error) throw error;

            await fetchMaterialRequests();
            renderMaterialRequestsList();
        } catch(err) {
            Swal.fire('Грешка', err.message, 'error');
        }
    }
}
