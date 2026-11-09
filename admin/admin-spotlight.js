// ==============================================================================
// 🔍 IS-SYSTEMS УНИВЕРСАЛНО ТЪРСЕНЕ & ЕДИННО ДОСИЕ НА ДЕТАЙЛ (SPOTLIGHT)
// ==============================================================================

(function() {
    let spotlightCache = {
        nomenclature: [],
        inventory: [],
        sklad: [],
        plans: [],
        routes: [],
        bom: [],
        isLoaded: false,
        isLoading: false
    };

    let currentSelectedDetail = null;

    // Глобално следене за клавиш Ctrl+K / Cmd+K
    document.addEventListener('keydown', function(e) {
        if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
            e.preventDefault();
            openSpotlightModal();
        } else if (e.key === 'Escape') {
            const backdrop = document.getElementById('spotlightModalBackdrop');
            if (backdrop && backdrop.style.display === 'flex') {
                closeSpotlightModal();
            }
        }
    });

    window.openSpotlightModal = async function(initialQuery = '') {
        let backdrop = document.getElementById('spotlightModalBackdrop');
        if (!backdrop) {
            createSpotlightDOM();
            backdrop = document.getElementById('spotlightModalBackdrop');
        }

        backdrop.style.display = 'flex';
        const input = document.getElementById('spotlightSearchInput');
        if (input) {
            input.value = initialQuery;
            setTimeout(() => input.focus(), 50);
        }

        showSpotlightState('search');

        // Фоново зареждане или опресняване на справочните данни
        ensureSpotlightCache().then(() => {
            if (input && input.value.trim()) {
                handleSpotlightSearch(input.value.trim());
            } else {
                renderSpotlightInitialList();
            }
        });
    };

    window.closeSpotlightModal = function() {
        const backdrop = document.getElementById('spotlightModalBackdrop');
        if (backdrop) backdrop.style.display = 'none';
        currentSelectedDetail = null;
    };

    async function ensureSpotlightCache(force = false) {
        if (!force && spotlightCache.isLoaded) return;
        if (spotlightCache.isLoading) return;
        spotlightCache.isLoading = true;

        try {
            const [nomRes, invRes, skladRes, plansRes, routesRes, bomRes] = await Promise.all([
                client.from('Номенклатура').select('*').limit(20000),
                client.from('inventory').select('*').limit(20000),
                client.from('sklad').select('*').limit(20000),
                client.from('plan').select('*').in('Статус', ['Активен', 'Завършен', '📦 Опакован']).limit(5000),
                client.from('marshruti').select('*').limit(20000),
                client.from('bom').select('*').limit(20000)
            ]);

            spotlightCache.nomenclature = nomRes.data || [];
            spotlightCache.inventory = invRes.data || [];
            spotlightCache.sklad = skladRes.data || [];
            spotlightCache.plans = plansRes.data || [];
            spotlightCache.routes = routesRes.data || [];
            spotlightCache.bom = bomRes.data || [];
            spotlightCache.isLoaded = true;
        } catch (err) {
            console.warn("Грешка при фоново зареждане на Spotlight кеш:", err);
        } finally {
            spotlightCache.isLoading = false;
        }
    }

    function createSpotlightDOM() {
        const div = document.createElement('div');
        div.id = 'spotlightModalBackdrop';
        div.className = 'modal-backdrop';
        div.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(15, 23, 42, 0.6); z-index:9999; display:none; justify-content:center; align-items:flex-start; padding-top:5vh; box-sizing:border-box; backdrop-filter:blur(6px);';
        div.onclick = (e) => { if (e.target === div) closeSpotlightModal(); };

        div.innerHTML = `
            <div id="spotlightDialog" style="background:#ffffff; width:100%; max-width:760px; max-height:88vh; border-radius:16px; box-shadow:0 25px 50px -12px rgba(0,0,0,0.35); border:1px solid #cbd5e1; display:flex; flex-direction:column; overflow:hidden; animation:slideDown 0.18s ease-out;">
                
                <!-- Search Input Bar -->
                <div style="padding:14px 18px; border-bottom:1px solid #e2e8f0; display:flex; align-items:center; gap:12px; background:#f8fafc;">
                    <span style="font-size:1.4em; color:#4f46e5;">🔍</span>
                    <input type="text" id="spotlightSearchInput" placeholder="Търси код на детайл, име, чертеж или машина..." 
                           style="flex:1; border:none; outline:none; background:transparent; font-size:1.15em; font-weight:700; color:#1e293b; font-family:inherit;">
                    <span style="font-size:0.78em; color:#64748b; background:#e2e8f0; padding:3px 8px; border-radius:6px; font-weight:700;">ESC за затваряне</span>
                    <button type="button" onclick="closeSpotlightModal()" style="border:none; background:transparent; font-size:1.2em; color:#94a3b8; cursor:pointer; padding:4px 8px; font-weight:bold;">✖</button>
                </div>

                <!-- Main Content Area: Search list OR Part Dossier -->
                <div id="spotlightBody" style="flex:1; overflow-y:auto; padding:16px; background:#ffffff; min-height:300px;">
                    <div id="spotlightResultsContainer"></div>
                    <div id="spotlightDossierContainer" style="display:none;"></div>
                </div>

                <!-- Footer Bar -->
                <div style="padding:10px 18px; background:#f8fafc; border-top:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center; font-size:0.82em; color:#64748b;">
                    <div>💡 <b>Подсказка:</b> Кликнете върху детайл за пълно досие или превключете директно в съответния таб.</div>
                    <div style="font-family:monospace; color:#4338ca; font-weight:bold;">ИС-СИСТЕМС SPOTLIGHT</div>
                </div>
            </div>
        `;

        document.body.appendChild(div);

        const input = document.getElementById('spotlightSearchInput');
        if (input) {
            let debounceTimer;
            input.addEventListener('input', (e) => {
                clearTimeout(debounceTimer);
                debounceTimer = setTimeout(() => {
                    handleSpotlightSearch(e.target.value.trim());
                }, 120);
            });
        }
    }

    function showSpotlightState(state) {
        const resultsEl = document.getElementById('spotlightResultsContainer');
        const dossierEl = document.getElementById('spotlightDossierContainer');
        if (state === 'search') {
            if (resultsEl) resultsEl.style.display = 'block';
            if (dossierEl) dossierEl.style.display = 'none';
        } else if (state === 'dossier') {
            if (resultsEl) resultsEl.style.display = 'none';
            if (dossierEl) dossierEl.style.display = 'block';
        }
    }

    function renderSpotlightInitialList() {
        const container = document.getElementById('spotlightResultsContainer');
        if (!container) return;

        if (!spotlightCache.isLoaded) {
            container.innerHTML = `
                <div style="text-align:center; padding:50px 20px; color:#64748b;">
                    <div style="font-size:2em; margin-bottom:10px;">⚙️</div>
                    <div style="font-weight:700; font-size:1.1em; color:#1e293b;">Зареждане на номенклатура и наличности...</div>
                </div>
            `;
            return;
        }

        // Показваме скорошни активни планове и популярни детайли като начален изглед
        let popularCodes = [];
        const seen = new Set();
        (spotlightCache.plans || []).forEach(p => {
            let code = String(p['ID Детайл'] || p['Вътрешно име'] || '').trim();
            if (code && !seen.has(code.toLowerCase())) {
                seen.add(code.toLowerCase());
                popularCodes.push({ code: code, hint: `Активен план (${p['Месец']} ${p['Година']})`, target: p['Целево количество'] });
            }
        });

        let html = `
            <div style="font-size:0.85em; font-weight:800; text-transform:uppercase; color:#64748b; letter-spacing:0.5px; margin-bottom:12px; display:flex; justify-content:space-between; align-items:center;">
                <span>🎯 Активни детайли от месечния план</span>
                <span style="font-size:0.9em; text-transform:none; font-weight:normal; color:#94a3b8;">Въведете търсене за филтриране</span>
            </div>
            <div style="display:flex; flex-direction:column; gap:6px;">
        `;

        popularCodes.slice(0, 10).forEach(item => {
            const nomMatch = spotlightCache.nomenclature.find(n => 
                String(n['ID Детайл']).trim().toLowerCase() === item.code.toLowerCase() ||
                String(n['Вътрешно име']).trim().toLowerCase() === item.code.toLowerCase()
            );
            const titleName = nomMatch ? (nomMatch['Вътрешно име'] || item.code) : item.code;
            const detailId = nomMatch ? (nomMatch['ID Детайл'] || item.code) : item.code;

            html += `
                <div class="spotlight-result-row" onclick="openSpotlightPartDossier('${escapeStr(detailId)}')"
                     style="padding:10px 14px; border:1px solid #e2e8f0; border-radius:10px; cursor:pointer; display:flex; justify-content:space-between; align-items:center; transition:all 0.15s ease; background:#ffffff;">
                    <div>
                        <div style="font-weight:800; font-size:1.02em; color:#1e293b;">
                            <span style="color:#4f46e5; font-family:monospace; margin-right:6px;">${detailId}</span>
                            <span>${titleName !== detailId ? titleName : ''}</span>
                        </div>
                        <div style="font-size:0.82em; color:#64748b; margin-top:2px;">${item.hint} • Цел: <b>${item.target || 0} бр.</b></div>
                    </div>
                    <button type="button" class="btn-primary" style="padding:5px 12px; font-size:0.82em; background:#e0e7ff; color:#4338ca; border:none; border-radius:6px; font-weight:800;">Виж досие ➔</button>
                </div>
            `;
        });

        html += `</div>`;
        container.innerHTML = html;
    }

    function handleSpotlightSearch(query) {
        showSpotlightState('search');
        const container = document.getElementById('spotlightResultsContainer');
        if (!container) return;

        if (!query) {
            renderSpotlightInitialList();
            return;
        }

        const q = query.toLowerCase();
        const matches = [];
        const seenCodes = new Set();

        // 1. Търсене в Номенклатура
        (spotlightCache.nomenclature || []).forEach(n => {
            const code = String(n['ID Детайл'] || '').trim();
            const name = String(n['Вътрешно име'] || '').trim();
            const desc = String(n['Описание'] || '').trim();

            if (code.toLowerCase().includes(q) || name.toLowerCase().includes(q) || desc.toLowerCase().includes(q)) {
                if (!seenCodes.has(code.toLowerCase())) {
                    seenCodes.add(code.toLowerCase());
                    matches.push({
                        type: 'nomenclature',
                        code: code,
                        name: name,
                        desc: desc,
                        itemType: n['Тип'] || 'Детайл',
                        drawing: n['Линк към чертеж'] || null
                    });
                }
            }
        });

        // 2. Търсене в Склад Материали
        (spotlightCache.sklad || []).forEach(s => {
            const code = String(s['ID Детайл'] || '').trim();
            if (code.toLowerCase().includes(q) && !seenCodes.has(code.toLowerCase())) {
                seenCodes.add(code.toLowerCase());
                matches.push({
                    type: 'sklad_material',
                    code: code,
                    name: code,
                    desc: `Склад материали • Наличност: ${s['Остатък'] || 0} ${s['Мерна единица'] || 'бр.'}`,
                    itemType: 'Суровина / Материал'
                });
            }
        });

        // 3. Търсене в Планове
        (spotlightCache.plans || []).forEach(p => {
            const planItem = String(p['Вътрешно име'] || p['ID Детайл'] || '').trim();
            if (planItem.toLowerCase().includes(q) && !seenCodes.has(planItem.toLowerCase())) {
                seenCodes.add(planItem.toLowerCase());
                matches.push({
                    type: 'plan',
                    code: planItem,
                    name: planItem,
                    desc: `План: ${p['Месец']} ${p['Година']} (${p['Статус']}) • ${p['Целево количество']} бр.`,
                    itemType: 'Производствен план'
                });
            }
        });

        if (matches.length === 0) {
            container.innerHTML = `
                <div style="text-align:center; padding:45px 20px; color:#64748b;">
                    <div style="font-size:2em; margin-bottom:8px;">🔍</div>
                    <div style="font-weight:700; color:#1e293b; font-size:1.1em;">Няма намерени резултати за "${query}"</div>
                    <div style="font-size:0.88em; margin-top:4px;">Опитайте с друг код, име или номер на чертеж.</div>
                </div>
            `;
            return;
        }

        let html = `
            <div style="font-size:0.85em; font-weight:800; text-transform:uppercase; color:#64748b; letter-spacing:0.5px; margin-bottom:12px;">
                Намерени съвпадения (${matches.length})
            </div>
            <div style="display:flex; flex-direction:column; gap:6px;">
        `;

        matches.slice(0, 30).forEach(m => {
            const badgeBg = m.type === 'nomenclature' ? '#eef2ff' : (m.type === 'sklad_material' ? '#fef3c7' : '#ecfdf5');
            const badgeColor = m.type === 'nomenclature' ? '#4338ca' : (m.type === 'sklad_material' ? '#b45309' : '#047857');

            html += `
                <div class="spotlight-result-row" onclick="openSpotlightPartDossier('${escapeStr(m.code)}')"
                     style="padding:10px 14px; border:1px solid #e2e8f0; border-radius:10px; cursor:pointer; display:flex; justify-content:space-between; align-items:center; transition:all 0.15s ease; background:#ffffff;">
                    <div style="flex:1; min-width:0; margin-right:12px;">
                        <div style="display:flex; align-items:center; gap:8px;">
                            <span style="font-weight:900; font-family:monospace; color:#1e293b; font-size:1.05em;">${m.code}</span>
                            ${m.name && m.name !== m.code ? `<span style="font-weight:700; color:#475569; font-size:0.95em;">${m.name}</span>` : ''}
                            <span style="background:${badgeBg}; color:${badgeColor}; font-size:0.75em; font-weight:800; padding:2px 7px; border-radius:6px;">${m.itemType}</span>
                        </div>
                        ${m.desc ? `<div style="font-size:0.82em; color:#64748b; margin-top:3px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${m.desc}</div>` : ''}
                    </div>
                    <div style="display:flex; gap:6px; align-items:center;">
                        <button type="button" class="btn-primary" style="padding:6px 12px; font-size:0.82em; background:#4f46e5; color:white; border:none; border-radius:6px; font-weight:800;">
                            Досие ➔
                        </button>
                    </div>
                </div>
            `;
        });

        html += `</div>`;
        container.innerHTML = html;
    }

    // ==============================================================================
    // 🗂️ КАРТОТЕКА / ЕДИННО ДОСИЕ НА ДЕТАЙЛА
    // ==============================================================================
    window.openSpotlightPartDossier = async function(partCode) {
        if (!partCode) return;
        currentSelectedDetail = partCode;
        showSpotlightState('dossier');

        const container = document.getElementById('spotlightDossierContainer');
        if (!container) return;

        container.innerHTML = `
            <div style="text-align:center; padding:40px; color:#64748b;">
                <div style="font-size:2em; margin-bottom:8px;">⚙️</div>
                <div style="font-weight:700; font-size:1.05em; color:#1e293b;">Сглобяване на досието за ${partCode}...</div>
            </div>
        `;

        await ensureSpotlightCache();

        const cleanCode = String(partCode).trim();
        const lowerCode = cleanCode.toLowerCase();

        // 1. Номенклатура
        const nom = spotlightCache.nomenclature.find(n => 
            String(n['ID Детайл']).trim().toLowerCase() === lowerCode || 
            String(n['Вътрешно име']).trim().toLowerCase() === lowerCode
        ) || {};

        const formalCode = nom['ID Детайл'] || cleanCode;
        const displayName = nom['Вътрешно име'] || formalCode;
        const drawingUrl = nom['Линк към чертеж'] || '';
        const sopUrl = nom['Линк към СОП'] || '';

        // 2. Склад Готов Продукт & WIP (Междинни операции)
        let gpQty = 0;
        let wipOps = [];
        (spotlightCache.inventory || []).forEach(r => {
            if (String(r['ID Детайл']).trim().toLowerCase() === lowerCode || String(r['ID Детайл']).trim().toLowerCase() === formalCode.toLowerCase()) {
                let op = String(r['Операция'] || '').trim();
                let q = parseFloat(r['Количество']) || 0;
                if (op.toLowerCase() === 'готов продукт') {
                    gpQty += q;
                } else {
                    wipOps.push({ op: op, qty: q });
                }
            }
        });

        // 3. Склад Материали (Суровина)
        let rawMaterial = spotlightCache.sklad.find(s => String(s['ID Детайл']).trim().toLowerCase() === lowerCode || String(s['ID Детайл']).trim().toLowerCase() === formalCode.toLowerCase());
        let rawStock = rawMaterial ? (parseFloat(rawMaterial['Остатък']) || 0) : null;
        let rawUnit = rawMaterial ? (rawMaterial['Мерна единица'] || 'бр.') : '';

        // 4. Активен Месечен План
        let activePlans = (spotlightCache.plans || []).filter(p => 
            String(p['ID Детайл'] || p['Вътрешно име']).trim().toLowerCase() === lowerCode ||
            String(p['ID Детайл'] || p['Вътрешно име']).trim().toLowerCase() === formalCode.toLowerCase()
        );

        // 5. Маршрутни карти
        let routeOps = (spotlightCache.routes || []).filter(r => 
            String(r['Код на детайла']).trim().toLowerCase() === lowerCode ||
            String(r['Код на детайла']).trim().toLowerCase() === formalCode.toLowerCase()
        ).sort((a,b) => (parseInt(a['№ Операция'])||0) - (parseInt(b['№ Операция'])||0));

        // 6. БОМ състав (Компоненти)
        let bomChildren = (spotlightCache.bom || []).filter(b => 
            String(b['ID Родител']).trim().toLowerCase() === lowerCode ||
            String(b['ID Родител']).trim().toLowerCase() === formalCode.toLowerCase()
        );

        // Построяване на HTML интерфейса на досието
        let html = `
            <div>
                <!-- Top Header: Back button + Title -->
                <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid #f1f5f9; padding-bottom:12px; margin-bottom:14px;">
                    <button type="button" onclick="showSpotlightState('search')" 
                            style="background:#f1f5f9; border:1px solid #cbd5e1; color:#475569; padding:6px 12px; border-radius:8px; font-weight:700; font-size:0.85em; cursor:pointer; display:flex; align-items:center; gap:6px;">
                        ⬅️ Назад към търсенето
                    </button>
                    <div style="display:flex; gap:8px;">
                        ${drawingUrl ? `<a href="${drawingUrl}" target="_blank" style="background:#e0f2fe; color:#0369a1; border:1px solid #bae6fd; padding:6px 12px; border-radius:8px; font-weight:800; font-size:0.85em; text-decoration:none; display:inline-flex; align-items:center; gap:5px;">📐 Чертеж</a>` : ''}
                        ${sopUrl ? `<a href="${sopUrl}" target="_blank" style="background:#fef3c7; color:#b45309; border:1px solid #fde68a; padding:6px 12px; border-radius:8px; font-weight:800; font-size:0.85em; text-decoration:none; display:inline-flex; align-items:center; gap:5px;">📋 СОП</a>` : ''}
                        <button type="button" onclick="closeSpotlightModal(); if(typeof openResolverTree==='function') openResolverTree('${escapeStr(formalCode)}');"
                                style="background:#4338ca; color:white; border:none; padding:6px 14px; border-radius:8px; font-weight:800; font-size:0.85em; cursor:pointer; display:inline-flex; align-items:center; gap:5px; box-shadow:0 2px 4px rgba(67,56,202,0.3);">
                            🌳 BOM Resolver
                        </button>
                    </div>
                </div>

                <!-- Part Title Banner -->
                <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:14px 18px; margin-bottom:14px;">
                    <div style="font-size:1.35em; font-weight:900; color:#1e293b; display:flex; align-items:center; gap:8px;">
                        <span style="font-family:monospace; color:#4338ca;">${formalCode}</span>
                        ${displayName !== formalCode ? `<span style="color:#0f172a;">— ${displayName}</span>` : ''}
                    </div>
                    <div style="font-size:0.85em; color:#64748b; margin-top:4px;">
                        Тип: <b>${nom['Тип'] || 'Детайл'}</b> • Описание: <b>${nom['Описание'] || 'Няма въведено'}</b>
                    </div>
                </div>

                <!-- 4 Ключови Индикаторни Карти (Грид) -->
                <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(160px, 1fr)); gap:10px; margin-bottom:16px;">
                    
                    <div style="background:#f0fdf4; border:1.5px solid #bbf7d0; border-radius:10px; padding:12px; text-align:center;">
                        <div style="font-size:0.75em; font-weight:800; color:#166534; text-transform:uppercase;">🏭 Готов Продукт</div>
                        <div style="font-size:1.6em; font-weight:900; color:#15803d; margin:4px 0;">${gpQty} <span style="font-size:0.6em;">бр.</span></div>
                        <div style="font-size:0.75em; color:#166534;">Свободни за експедиция</div>
                    </div>

                    <div style="background:#eff6ff; border:1.5px solid #bfdbfe; border-radius:10px; padding:12px; text-align:center;">
                        <div style="font-size:0.75em; font-weight:800; color:#1e40af; text-transform:uppercase;">⚙️ В Процес (WIP)</div>
                        <div style="font-size:1.6em; font-weight:900; color:#2563eb; margin:4px 0;">
                            ${wipOps.reduce((acc, curr) => acc + curr.qty, 0)} <span style="font-size:0.6em;">бр.</span>
                        </div>
                        <div style="font-size:0.75em; color:#1e40af;">На ${wipOps.length} междинни операции</div>
                    </div>

                    <div style="background:#fffbeb; border:1.5px solid #fde68a; border-radius:10px; padding:12px; text-align:center;">
                        <div style="font-size:0.75em; font-weight:800; color:#92400e; text-transform:uppercase;">📦 Склад Суровина</div>
                        <div style="font-size:1.6em; font-weight:900; color:#d97706; margin:4px 0;">
                            ${rawStock !== null ? rawStock : '—'} <span style="font-size:0.6em;">${rawUnit}</span>
                        </div>
                        <div style="font-size:0.75em; color:#92400e;">${rawStock !== null ? 'Налични материали' : 'Не е суровина'}</div>
                    </div>

                    <div style="background:#faf5ff; border:1.5px solid #e9d5ff; border-radius:10px; padding:12px; text-align:center;">
                        <div style="font-size:0.75em; font-weight:800; color:#6b21a8; text-transform:uppercase;">📅 Месечен План</div>
                        <div style="font-size:1.6em; font-weight:900; color:#7c3aed; margin:4px 0;">
                            ${activePlans.reduce((acc, curr) => acc + (parseFloat(curr['Целево количество'])||0), 0)} <span style="font-size:0.6em;">бр.</span>
                        </div>
                        <div style="font-size:0.75em; color:#6b21a8;">${activePlans.length > 0 ? activePlans[0]['Месец'] + ' ' + activePlans[0]['Година'] : 'Няма активен'}</div>
                    </div>
                </div>

                <!-- Междинни наличности по операции (ако има WIP) -->
                ${wipOps.length > 0 ? `
                    <div style="margin-bottom:14px;">
                        <div style="font-weight:800; font-size:0.85em; text-transform:uppercase; color:#475569; margin-bottom:6px;">⚙️ Междинни полуфабрикати по операции:</div>
                        <div style="display:flex; flex-wrap:wrap; gap:8px;">
                            ${wipOps.map(w => `
                                <div style="background:#f1f5f9; border:1px solid #cbd5e1; border-radius:8px; padding:6px 10px; font-size:0.85em; display:flex; align-items:center; gap:6px;">
                                    <span style="font-weight:700; color:#334155;">${w.op}:</span>
                                    <span style="font-weight:900; color:#2563eb;">${w.qty} бр.</span>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                ` : ''}

                <!-- Технологичен маршрут (Операции & Машини) -->
                <div style="margin-bottom:14px; border:1px solid #e2e8f0; border-radius:10px; overflow:hidden;">
                    <div style="background:#f8fafc; padding:8px 12px; font-weight:800; font-size:0.85em; color:#334155; border-bottom:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center;">
                        <span>🔄 Технологичен маршрут (${routeOps.length} операции)</span>
                        <button type="button" onclick="spotlightNavigateToTab('marshruti', '${escapeStr(formalCode)}')" style="background:none; border:none; color:#2563eb; font-weight:bold; font-size:0.82em; cursor:pointer; text-decoration:underline;">Редактирай в Маршрути ➔</button>
                    </div>
                    ${routeOps.length > 0 ? `
                        <table style="width:100%; border-collapse:collapse; font-size:0.82em;">
                            <thead>
                                <tr style="background:#f1f5f9; color:#475569; border-bottom:1px solid #cbd5e1;">
                                    <th style="padding:6px 10px; text-align:left; width:50px;">Оп. №</th>
                                    <th style="padding:6px 10px; text-align:left;">Операция</th>
                                    <th style="padding:6px 10px; text-align:left;">Машина</th>
                                    <th style="padding:6px 10px; text-align:center;">Норма</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${routeOps.map(r => `
                                    <tr style="border-bottom:1px solid #f1f5f9;">
                                        <td style="padding:6px 10px; font-weight:bold; color:#4338ca;">${r['№ Операция'] || '10'}</td>
                                        <td style="padding:6px 10px; font-weight:700; color:#1e293b;">${r['Име на операция']}</td>
                                        <td style="padding:6px 10px; color:#475569;">${r['Машина'] || 'Обща'}</td>
                                        <td style="padding:6px 10px; text-align:center; color:#059669; font-weight:bold;">${r['Норма (мин/бр)'] ? r['Норма (мин/бр)'] + ' мин' : '—'}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    ` : `<div style="padding:15px; text-align:center; color:#94a3b8; font-size:0.85em;">Няма въведени технологични операции в Маршрутни карти.</div>`}
                </div>

                <!-- Вложени компоненти по BOM (ако има) -->
                ${bomChildren.length > 0 ? `
                    <div style="margin-bottom:14px; border:1px solid #e2e8f0; border-radius:10px; overflow:hidden;">
                        <div style="background:#f8fafc; padding:8px 12px; font-weight:800; font-size:0.85em; color:#334155; border-bottom:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center;">
                            <span>🧩 Вложени компоненти (BOM Спецификация: ${bomChildren.length} детайла)</span>
                            <button type="button" onclick="spotlightNavigateToTab('bom', '${escapeStr(formalCode)}')" style="background:none; border:none; color:#2563eb; font-weight:bold; font-size:0.82em; cursor:pointer; text-decoration:underline;">Виж в БОМ ➔</button>
                        </div>
                        <div style="padding:10px; display:flex; flex-wrap:wrap; gap:8px;">
                            ${bomChildren.map(c => `
                                <div onclick="openSpotlightPartDossier('${escapeStr(c['ID Компонент'])}')" 
                                     style="background:#f8fafc; border:1px solid #cbd5e1; border-radius:6px; padding:6px 10px; font-size:0.82em; cursor:pointer;"
                                     onmouseover="this.style.borderColor='#4338ca'; this.style.background='#eef2ff';" onmouseout="this.style.borderColor='#cbd5e1'; this.style.background='#f8fafc';">
                                    <b style="color:#4338ca;">${c['ID Компонент']}</b> ➔ ${c['Количество'] || 1} бр.
                                </div>
                            `).join('')}
                        </div>
                    </div>
                ` : ''}

                <!-- Долни Бутони за Бърз Преход (Quick Navigation) -->
                <div style="background:#f1f5f9; border-radius:10px; padding:12px; display:flex; gap:8px; justify-content:center; flex-wrap:wrap;">
                    <button type="button" class="btn-primary" onclick="spotlightNavigateToTab('plan', '${escapeStr(formalCode)}')" style="background:#0284c7; padding:6px 12px; font-size:0.85em;">📅 Виж в План</button>
                    <button type="button" class="btn-primary" onclick="spotlightNavigateToTab('sklad_inventory', '${escapeStr(formalCode)}')" style="background:#059669; padding:6px 12px; font-size:0.85em;">🏭 Виж в Склад</button>
                    <button type="button" class="btn-primary" onclick="spotlightNavigateToTab('nomenklatura', '${escapeStr(formalCode)}')" style="background:#475569; padding:6px 12px; font-size:0.85em;">🗂️ В Номенклатура</button>
                    <button type="button" class="btn-primary" onclick="spotlightNavigateToTab('otcheti', '${escapeStr(formalCode)}')" style="background:#d97706; padding:6px 12px; font-size:0.85em;">📊 Виж в Отчети</button>
                </div>
            </div>
        `;

        container.innerHTML = html;
    };

    window.spotlightNavigateToTab = function(tabKey, filterQuery) {
        closeSpotlightModal();
        if (typeof switchTab === 'function') {
            switchTab(tabKey);
            setTimeout(() => {
                const searchInput = document.getElementById('searchInput');
                if (searchInput && filterQuery) {
                    searchInput.value = filterQuery;
                    if (typeof filterTable === 'function') filterTable();
                }
            }, 100);
        }
    };

    function escapeStr(str) {
        return String(str || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
    }

})();

