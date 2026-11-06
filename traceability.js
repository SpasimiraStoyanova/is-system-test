// traceability.js - Inventory Detective Logic with Timeline, Audit Trail, Nomenclature Resolution & Physical Spot-Check (Revision)

document.getElementById('searchInput').addEventListener('keypress', function(e) {
  if(e.key === 'Enter') startSearch();
});

// Set default dates (Last 30 days)
let today = new Date();
let thirtyDaysAgo = new Date();
thirtyDaysAgo.setDate(today.getDate() - 30);

document.getElementById('dateTo').value = today.toISOString().split('T')[0];
document.getElementById('dateFrom').value = thirtyDaysAgo.toISOString().split('T')[0];

window.fetchUserCheckInStatus = async function() { return true; };

function parseSafeDate(dStr) {
    if (!dStr) return new Date();
    let s = String(dStr).trim();
    if (s.includes('T') && !s.endsWith('Z') && !s.includes('+') && !s.slice(-6).includes('-')) {
        s += 'Z';
    }
    return new Date(s);
}

function parseSafeTs(dStr) {
    return parseSafeDate(dStr).getTime() || 0;
}

// 0. Зареждане на Номенклатура за автоматично допълване и намиране по код/име
let nomList = [];
let nomMap = {}; // normCode -> nom, normName -> nom

async function loadNomenclature() {
    try {
        const { data, error } = await client.from('Номенклатура').select('*').limit(10000);
        if (error) throw error;
        if (data) {
            nomList = data;
            const dl = document.getElementById('dl_trace_parts');
            let optHtml = '';
            data.forEach(n => {
                let code = String(n['ID Детайл'] || '').trim();
                let name = String(n['Вътрешно име'] || '').trim();
                let normC = code.replace(/[^а-яА-Яa-zA-Z0-9]/g, '').toLowerCase();
                let normN = name.replace(/[^а-яА-Яa-zA-Z0-9]/g, '').toLowerCase();
                if (normC) nomMap[normC] = n;
                if (normN) nomMap[normN] = n;
                if (code && name && code.toLowerCase() !== name.toLowerCase()) {
                    optHtml += `<option value="${code}">${name}</option>`;
                    optHtml += `<option value="${name}">${code}</option>`;
                } else if (code) {
                    optHtml += `<option value="${code}"></option>`;
                }
            });
            if (dl) dl.innerHTML = optHtml;
        }
    } catch (e) {
        console.warn('Номенклатура: не можа да се зареди автодовършването:', e);
    }
}
loadNomenclature();

async function fetchRobustRows(table, select, searchCol, searchStr) {
    let allData = [];
    let sr = 0;
    let tokens = searchStr ? searchStr.split(/[^а-яА-Яa-zA-Z0-9]+/).filter(t => t.length > 0) : [];
    
    while(true) {
        let q = client.from(table).select(select).range(sr, sr + 999);
        if (searchCol && tokens.length > 0) {
            tokens.forEach(t => {
                q = q.ilike(searchCol, `%${t}%`);
            });
        }
        let { data, error } = await q;
        if (error || !data || data.length === 0) break;
        allData.push(...data);
        if (data.length < 1000) break;
        sr += 1000;
    }
    return { data: allData };
}

let globalTimeline = {}; // { 'YYYY-MM-DD': { rawOtcheti: [], parentOtcheti: [] } }
let globalAllData = { rawOtcheti: [], parentOtcheti: [], childrenBOM: [], parentsBOM: [], tRoutes: [], currentStock: 0, targetId: '', targetName: '', auditHistory: [], recentChecks: [] };
let currentSelectedDateKey = 'ALL';
let filterFromTs = 0;
let filterToTs = 0;

async function startSearch() {
  const input = document.getElementById('searchInput').value.trim();
  const dateFrom = document.getElementById('dateFrom').value;
  const dateTo = document.getElementById('dateTo').value;
  
  if (!input) return Swal.fire('Грешка', 'Въведете детайл или изберете от списъка!', 'warning');
  if (!dateFrom || !dateTo) return Swal.fire('Грешка', 'Изберете период!', 'warning');

  document.getElementById('workspace').innerHTML = '<div style="margin:auto; color:var(--text-muted); font-size:1.2rem; font-weight: 600;">Анализиране на потока... ⏳</div>';
  document.getElementById('timelineContainer').innerHTML = '';

  try {
      await fetchDataForPeriod(input, dateFrom, dateTo);
      currentSelectedDateKey = 'ALL';
      renderTimeline();
      renderVSM('ALL');
  } catch (e) {
      console.error(e);
      document.getElementById('workspace').innerHTML = `<div style="margin:auto; color:var(--danger); font-size: 1.2rem;">Грешка: ${e.message}</div>`;
  }
}

async function fetchDataForPeriod(rawInput, dateFrom, dateTo) {
    let cleanInput = rawInput.trim();
    let inputNorm = cleanInput.replace(/[^а-яА-Яa-zA-Z0-9]/g, '').toLowerCase();

    // 0. Търсим съответствие в Номенклатура
    let matchedNom = nomMap[inputNorm] || null;
    if (!matchedNom && nomList.length > 0) {
        matchedNom = nomList.find(n => {
            let c = String(n['ID Детайл'] || '').replace(/[^а-яА-Яa-zA-Z0-9]/g, '').toLowerCase();
            let nm = String(n['Вътрешно име'] || '').replace(/[^а-яА-Яa-zA-Z0-9]/g, '').toLowerCase();
            return (c && (c === inputNorm || inputNorm.includes(c) || c.includes(inputNorm))) ||
                   (nm && (nm === inputNorm || inputNorm.includes(nm) || nm.includes(inputNorm)));
        });
    }

    let searchCode = matchedNom ? String(matchedNom['ID Детайл'] || '').trim() : cleanInput;
    let searchName = matchedNom ? String(matchedNom['Вътрешно име'] || '').trim() : cleanInput;

    let normCodes = new Set([
        cleanInput.replace(/[^а-яА-Яa-zA-Z0-9]/g, '').toLowerCase(),
        searchCode.replace(/[^а-яА-Яa-zA-Z0-9]/g, '').toLowerCase(),
        searchName.replace(/[^а-яА-Яa-zA-Z0-9]/g, '').toLowerCase()
    ]);
    normCodes.delete('');

    globalAllData.targetId = searchCode || cleanInput;
    globalAllData.targetName = searchName || searchCode || cleanInput;

    filterFromTs = new Date(dateFrom).getTime();
    filterToTs = new Date(dateTo).getTime() + 86400000;
    globalTimeline = {};

    // 1. Fetch Routes (Marshruti)
    let { data: rData } = await fetchRobustRows('marshruti', '*', 'Код на детайла', searchCode);
    if ((!rData || rData.length === 0) && searchName !== searchCode) {
        let { data: rData2 } = await fetchRobustRows('marshruti', '*', 'Код на детайла', searchName);
        if (rData2 && rData2.length > 0) rData = rData2;
    }
    
    globalAllData.routesSetNorm = new Set();
    if (rData) rData.forEach(r => globalAllData.routesSetNorm.add(String(r['Код на детайла']).replace(/[^а-яА-Яa-zA-Z0-9]/g, '').toLowerCase()));
    
    globalAllData.tRoutes = rData ? rData.filter(r => {
        let dbId = String(r['Код на детайла']).replace(/[^а-яА-Яa-zA-Z0-9]/g, '').toLowerCase();
        return normCodes.has(dbId);
    }) : [];
    globalAllData.tRoutes.sort((a,b) => parseInt(a['№ Операция']||0) - parseInt(b['№ Операция']||0));

    // 2. Fetch Target Otcheti (търсим по код и по име)
    let { data: rawOtcheti } = await fetchRobustRows('otcheti', '*', 'ID Детайл', searchCode);
    if ((!rawOtcheti || rawOtcheti.length === 0) && searchName !== searchCode) {
        let { data: rawOtcheti2 } = await fetchRobustRows('otcheti', '*', 'ID Детайл', searchName);
        if (rawOtcheti2 && rawOtcheti2.length > 0) rawOtcheti = rawOtcheti2;
    }

    globalAllData.rawOtcheti = [];
    if (rawOtcheti) {
        rawOtcheti.forEach(r => {
            let dbId = String(r['ID Детайл']).replace(/[^а-яА-Яa-zA-Z0-9]/g, '').toLowerCase();
            if (!normCodes.has(dbId)) return;
            globalAllData.rawOtcheti.push(r);
            let dTs = parseSafeTs(r['Дата']);
            if (dTs >= filterFromTs && dTs < filterToTs) {
                let dateStr = parseSafeDate(r['Дата']).toISOString().split('T')[0];
                if (!globalTimeline[dateStr]) globalTimeline[dateStr] = { rawOtcheti: [], parentOtcheti: [] };
                globalTimeline[dateStr].rawOtcheti.push(r);
            }
        });
        
        globalAllData.rawOtcheti.sort((a,b) => parseSafeTs(a['Дата']) - parseSafeTs(b['Дата']));
        let fChainSet = new Set();
        globalAllData.rawOtcheti.forEach(r => {
            let op = String(r['Операция'] || 'Без оп.').trim().toUpperCase();
            fChainSet.add(op);
        });
        globalAllData.fallbackOpChain = Array.from(fChainSet);
    }

    // 3. Fetch BOM Children
    let { data: childrenRaw } = await fetchRobustRows('bom', '*', 'ID Родител', searchCode);
    if ((!childrenRaw || childrenRaw.length === 0) && searchName !== searchCode) {
        let { data: c2 } = await fetchRobustRows('bom', '*', 'ID Родител', searchName);
        if (c2 && c2.length > 0) childrenRaw = c2;
    }

    globalAllData.childrenBOM = childrenRaw ? childrenRaw.filter(b => {
        let dbId = String(b['ID Родител']).replace(/[^а-яА-Яa-zA-Z0-9]/g, '').toLowerCase();
        return normCodes.has(dbId);
    }) : [];

    // 3.5 Check if children are raw materials
    if (globalAllData.childrenBOM.length > 0) {
        let childCodes = [...new Set(globalAllData.childrenBOM.map(b => String(b['ID Компонент']).trim()))];
        let rSet = new Set(), bSet = new Set(), oSet = new Set();
        let cChunks = [];
        for(let i=0; i<childCodes.length; i+=100) cChunks.push(childCodes.slice(i, i+100));
        for (let chunk of cChunks) {
            let [{data:rDataSub}, {data:bData}, {data:oData}] = await Promise.all([
                client.from('marshruti').select('"Код на детайла"').in('Код на детайла', chunk),
                client.from('bom').select('"ID Родител"').in('ID Родител', chunk),
                client.from('otcheti').select('"ID Детайл"').in('ID Детайл', chunk)
            ]);
            if (rDataSub) rDataSub.forEach(x => rSet.add(String(x['Код на детайла']).replace(/[^а-яА-Яa-zA-Z0-9]/g, '').toLowerCase()));
            if (bData) bData.forEach(x => bSet.add(String(x['ID Родител']).replace(/[^а-яА-Яa-zA-Z0-9]/g, '').toLowerCase()));
            if (oData) oData.forEach(x => oSet.add(String(x['ID Детайл']).replace(/[^а-яА-Яa-zA-Z0-9]/g, '').toLowerCase()));
        }
        let finalChildren = [];
        for (let b of globalAllData.childrenBOM) {
             let cName = String(b['ID Компонент']);
             let cNorm = cName.replace(/[^а-яА-Яa-zA-Z0-9]/g, '').toLowerCase();
             let isRaw = true;
             if (cNorm.includes('статоренпак') || cNorm.includes('статор')) {
                 isRaw = false;
             } else if (rSet.has(cNorm) || bSet.has(cNorm) || oSet.has(cNorm)) {
                 isRaw = false;
             }
             if (!isRaw) finalChildren.push(b);
        }
        globalAllData.childrenBOM = finalChildren;
    }

    // 4. Fetch BOM Parents & Parent Otcheti
    let { data: parentsRaw } = await fetchRobustRows('bom', '*', 'ID Компонент', searchCode);
    if ((!parentsRaw || parentsRaw.length === 0) && searchName !== searchCode) {
        let { data: p2 } = await fetchRobustRows('bom', '*', 'ID Компонент', searchName);
        if (p2 && p2.length > 0) parentsRaw = p2;
    }

    globalAllData.parentsBOM = parentsRaw ? parentsRaw.filter(b => {
        let dbId = String(b['ID Компонент']).replace(/[^а-яА-Яa-zA-Z0-9]/g, '').toLowerCase();
        return normCodes.has(dbId);
    }) : [];
    
    globalAllData.parentOtcheti = [];
    if (globalAllData.parentsBOM.length > 0) {
        let parentNames = globalAllData.parentsBOM.map(b => String(b['ID Родител'])).filter(Boolean);
        let pNorms = parentNames.map(p => p.replace(/[^а-яА-Яa-zA-Z0-9]/g, '').toLowerCase());
        let parentNamesUnique = [...new Set(parentNames)];
        
        globalAllData.parentRoutes = {};
        let pChunks = [];
        for(let i=0; i<parentNamesUnique.length; i+=100) pChunks.push(parentNamesUnique.slice(i, i+100));
        for (let chunk of pChunks) {
             let { data: pRoutes } = await client.from('marshruti').select('*').in('Код на детайла', chunk);
             if (pRoutes) {
                 pRoutes.forEach(r => {
                     let pN = String(r['Код на детайла']).replace(/[^а-яА-Яa-zA-Z0-9]/g, '').toLowerCase();
                     if (!globalAllData.parentRoutes[pN]) globalAllData.parentRoutes[pN] = [];
                     globalAllData.parentRoutes[pN].push(r);
                 });
             }
        }
        for (let pN in globalAllData.parentRoutes) {
             globalAllData.parentRoutes[pN].sort((a,b) => (parseInt(a['№ Операция'])||0) - (parseInt(b['№ Операция'])||0));
        }
        globalAllData.parentsBOM.forEach(b => {
             let pNorm = String(b['ID Родител']).replace(/[^а-яА-Яa-zA-Z0-9]/g, '').toLowerCase();
             let injOpNum = parseInt(b['Влага се на Оп. №']);
             let pR = globalAllData.parentRoutes[pNorm] || [];
             let targetOpName = null;
             if (pR.length > 0) {
                 if (!isNaN(injOpNum)) {
                     let match = pR.find(r => parseInt(r['№ Операция']) === injOpNum);
                     if (match) targetOpName = String(match['Име на операция']).trim().toUpperCase();
                 }
                 if (!targetOpName) targetOpName = String(pR[0]['Име на операция']).trim().toUpperCase();
             }
             b.targetOpNameCache = targetOpName; 
        });

        for (let pName of parentNamesUnique) {
            const { data: pOtch } = await fetchRobustRows('otcheti', '*', 'ID Детайл', pName);
            if (pOtch) {
                pOtch.forEach(r => {
                    let dbId = String(r['ID Детайл']).replace(/[^а-яА-Яa-zA-Z0-9]/g, '').toLowerCase();
                    if (pNorms.includes(dbId)) {
                        globalAllData.parentOtcheti.push(r);
                        let dTs = parseSafeTs(r['Дата']);
                        if (dTs >= filterFromTs && dTs < filterToTs) {
                            let dateStr = parseSafeDate(r['Дата']).toISOString().split('T')[0];
                            if (!globalTimeline[dateStr]) globalTimeline[dateStr] = { rawOtcheti: [], parentOtcheti: [] };
                            globalTimeline[dateStr].parentOtcheti.push(r);
                        }
                    }
                });
            }
        }
    }

    // 5. Fetch Inventory from the unified 'inventory' table
    globalAllData.currentStock = 0;
    
    let { data: invData } = await client
        .from('inventory')
        .select('*')
        .limit(10000);
    
    let allStock = invData || [];
    allStock.forEach(i => {
        let dbId = String(i['ID Детайл'] || '').replace(/[^а-яА-Яa-zA-Z0-9]/g, '').toLowerCase();
        let dbName = String(i['Име'] || '').replace(/[^а-яА-Яa-zA-Z0-9]/g, '').toLowerCase();
        if (normCodes.has(dbId) || normCodes.has(dbName)) {
            let qty = (i['Общо'] !== undefined && i['Общо'] !== null) 
                ? i['Общо'] 
                : ((i['Количество'] !== undefined && i['Количество'] !== null) ? i['Количество'] : i['Свободни']);
            globalAllData.currentStock += (parseFloat(String(qty || '0').replace(',', '.')) || 0);
        }
    });

    // 6. Fetch Audit History for warehouse changes for this item
    globalAllData.auditHistory = [];
    try {
        let { data: auditData } = await client
            .from('audit_logs')
            .select('*')
            .in('table_name', ['inventory', 'inventory_gp', 'inventory_wip', 'sklad'])
            .order('changed_at', { ascending: false })
            .limit(1000);
        
        if (auditData) {
            auditData.forEach(l => {
                let n = l.new_data || {};
                let o = l.old_data || {};
                let id1 = String(n['ID Детайл'] || n['Име'] || '').replace(/[^а-яА-Яa-zA-Z0-9]/g, '').toLowerCase();
                let id2 = String(o['ID Детайл'] || o['Име'] || '').replace(/[^а-яА-Яa-zA-Z0-9]/g, '').toLowerCase();
                if (normCodes.has(id1) || normCodes.has(id2)) {
                    globalAllData.auditHistory.push(l);
                }
            });
        }
    } catch (e) {
        console.warn('Не можа да се зареди одит история за детайла:', e);
    }

    // 7. Fetch Recent Spot-Checks / Revisions from inventory_checks
    globalAllData.recentChecks = [];
    try {
        let { data: chkData } = await client
            .from('inventory_checks')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(100);
        
        if (chkData) {
            chkData.forEach(c => {
                let pId = String(c.part_id || '').replace(/[^а-яА-Яa-zA-Z0-9]/g, '').toLowerCase();
                let pNm = String(c.part_name || '').replace(/[^а-яА-Яa-zA-Z0-9]/g, '').toLowerCase();
                if (normCodes.has(pId) || normCodes.has(pNm)) {
                    globalAllData.recentChecks.push(c);
                }
            });
        }
    } catch(e) {
        console.warn('Таблица inventory_checks все още не съществува:', e);
    }
}

function renderTimeline() {
    const container = document.getElementById('timelineContainer');
    let dates = Object.keys(globalTimeline).sort();
    
    if (dates.length === 0) {
        container.innerHTML = '<div style="color:var(--text-muted); margin:auto; font-weight:600;">Няма намерени отчети за избрания период.</div>';
        return;
    }
    
    let isAllActive = (currentSelectedDateKey === 'ALL');
    let html = `
        <div style="cursor:pointer; display:flex; flex-direction:column; align-items:center;" onclick="renderVSM('ALL')" id="tl_node_ALL">
            <div style="width:12px; height:12px; background:${isAllActive ? 'var(--primary)' : '#64748b'}; border-radius:50%; margin-bottom:5px; box-shadow:${isAllActive ? '0 0 10px var(--primary)' : 'none'}; transition:0.2s;"></div>
            <div style="color:${isAllActive ? 'white' : '#94a3b8'}; font-size:0.8rem; font-weight:bold;">ЦЕЛИЯТ ПЕРИОД</div>
        </div>
        <div style="width:2px; height:20px; background:#475569;"></div>
    `;
    
    dates.forEach(d => {
        let displayD = d.split('-').reverse().join('.');
        let isActive = (currentSelectedDateKey === d);
        html += `
        <div style="cursor:pointer; display:flex; flex-direction:column; align-items:center; opacity:${isActive ? '1' : '0.8'}; transition:0.2s;" onclick="renderVSM('${d}')" id="tl_node_${d}">
            <div style="width:${isActive ? '12px' : '10px'}; height:${isActive ? '12px' : '10px'}; background:${isActive ? 'var(--primary)' : '#94a3b8'}; border-radius:50%; margin-bottom:5px; box-shadow:${isActive ? '0 0 10px var(--primary)' : 'none'};"></div>
            <div style="color:${isActive ? '#38bdf8' : '#cbd5e1'}; font-weight:${isActive ? 'bold' : 'normal'}; font-size:0.75rem;">${displayD}</div>
        </div>
        <div style="height:1px; width:30px; background:#334155;"></div>
        `;
    });
    
    container.innerHTML = html;
}

async function renderVSM(dateKey) {
    currentSelectedDateKey = dateKey;
    renderTimeline();

    let curFromTs = 0;
    let curToTs = 0;
    let targetTs = 0;

    if (dateKey === 'ALL') {
        curFromTs = filterFromTs;
        curToTs = filterToTs;
        targetTs = filterToTs;
    } else {
        curFromTs = new Date(dateKey).getTime();
        curToTs = curFromTs + 86400000;
        targetTs = curToTs;
    }

    let opsProduced = {};   // Произведени в текущия интервал (за периода или за деня)
    let opsScrap = {};      // Брак в текущия интервал
    let opsPrior = {};      // Натрупани ПРЕДИ текущия интервал
    let cumProduced = {};   // Общо до края на текущия интервал
    let cumScrap = {};      // Общо брак до края на текущия интервал

    (globalAllData.rawOtcheti || []).forEach(r => {
        let dTs = parseSafeTs(r['Дата']);
        let st = String(r['Статус'] || '').trim().toLowerCase();
        let q = parseFloat(r['Количество']) || 0;
        let op = String(r['Операция'] || 'Без оп.').trim().toUpperCase();

        if (dTs >= curFromTs && dTs < curToTs) {
            if (st === 'отчетено' || st === 'завършено') opsProduced[op] = (opsProduced[op] || 0) + q;
            else if (st === 'брак') opsScrap[op] = (opsScrap[op] || 0) + Math.abs(q);
        } else if (dTs < curFromTs) {
            if (st === 'отчетено' || st === 'завършено') opsPrior[op] = (opsPrior[op] || 0) + q;
        }

        if (dTs < targetTs) {
            if (st === 'отчетено' || st === 'завършено') cumProduced[op] = (cumProduced[op] || 0) + q;
            else if (st === 'брак') cumScrap[op] = (cumScrap[op] || 0) + Math.abs(q);
        }
    });

    let opChain = [];
    if (globalAllData.tRoutes.length > 0) {
        globalAllData.tRoutes.sort((a,b) => (parseInt(a['№ Операция'])||0) - (parseInt(b['№ Операция'])||0));
        globalAllData.tRoutes.forEach(r => opChain.push(String(r['Име на операция'] || r['Име'] || '').trim().toUpperCase()));
    } else {
        opChain = globalAllData.fallbackOpChain || [];
        if (opChain.length === 0) opChain = ['Без оп.'];
    }
    
    let targetProduced = 0; 
    if (opChain.length > 0) {
        let firstOp = opChain[0];
        targetProduced = opsProduced[firstOp] || 0; 
        if (targetProduced === 0) targetProduced = Math.max(0, ...Object.values(opsProduced));
    }

    // Children (Суровини и компоненти)
    let childrenFlowHtml = '';
    if (globalAllData.childrenBOM.length > 0) {
        let filteredChildren = globalAllData.childrenBOM;

        let cNodes = [];
        filteredChildren.forEach(b => {
            let cName = String(b['ID Компонент']).toUpperCase();
            let normStr = String(b['Количество'] || '1').replace(',', '.');
            let norm = parseFloat(normStr) || 1;
            let consumedChild = targetProduced * norm;
            
            cNodes.push(`
              <div class="vsm-node" style="justify-content: flex-end;">
                <span class="vsm-stat consumed" style="color:var(--text-muted); font-size:1rem;">(Норма: ${norm})</span>
                <span class="vsm-stat consumed" style="color:var(--warning)">Изразходвани: ${consumedChild} бр.</span>
                <span class="vsm-divider">|</span>
                <span class="vsm-name">${cName}</span>
              </div>
            `);
        });
        
        childrenFlowHtml = cNodes.length > 0 ? `<div class="col-layout">${cNodes.join('')}</div>` : `<div class="vsm-node" style="opacity:0.5"><span class="vsm-name">САМО СУРОВИНИ (СКРИТИ)</span></div>`;
    } else {
         childrenFlowHtml = `<div class="vsm-node" style="opacity:0.5"><span class="vsm-name">ЧИСТА СУРОВИНА</span></div>`;
    }

    // Parents (Влагане в по-горни изделия)
    let totalConsumed = 0;
    let cumTotalConsumed = 0;
    let parentsFlowHtml = '';
    
    if (globalAllData.parentsBOM.length > 0) {
        let parentOpStats = {}; 
        let cumParentOpStats = {};

        (globalAllData.parentOtcheti || []).forEach(r => {
            let dTs = parseSafeTs(r['Дата']);
            let st = String(r['Статус'] || '').trim().toLowerCase();
            if (st === 'отчетено' || st === 'завършено') {
                let pName = String(r['ID Детайл']).replace(/[^а-яА-Яa-zA-Z0-9]/g, '').toLowerCase();
                let op = String(r['Операция'] || 'Без оп.').trim().toUpperCase();
                let q = parseFloat(r['Количество']) || 0;

                if (dTs >= curFromTs && dTs < curToTs) {
                    if (!parentOpStats[pName]) parentOpStats[pName] = {};
                    parentOpStats[pName][op] = (parentOpStats[pName][op] || 0) + q;
                }
                if (dTs < targetTs) {
                    if (!cumParentOpStats[pName]) cumParentOpStats[pName] = {};
                    cumParentOpStats[pName][op] = (cumParentOpStats[pName][op] || 0) + q;
                }
            }
        });
        
        let pNodes = [];
        globalAllData.parentsBOM.forEach(b => {
            let originalName = String(b['ID Родител']).trim().toUpperCase();
            let pName = String(b['ID Родител']).replace(/[^а-яА-Яa-zA-Z0-9]/g, '').toLowerCase();
            let normStr = String(b['Количество'] || '1').replace(',', '.');
            let norm = parseFloat(normStr) || 1;
            
            let targetOpName = b.targetOpNameCache;
            let pProduced = 0;
            let cumPProduced = 0;
            
            if (targetOpName && parentOpStats[pName] && parentOpStats[pName][targetOpName]) {
                pProduced = parentOpStats[pName][targetOpName];
            } else if (!targetOpName && parentOpStats[pName]) {
                pProduced = Math.max(0, ...Object.values(parentOpStats[pName]));
            }
            
            if (targetOpName && cumParentOpStats[pName] && cumParentOpStats[pName][targetOpName]) {
                cumPProduced = cumParentOpStats[pName][targetOpName];
            } else if (!targetOpName && cumParentOpStats[pName]) {
                cumPProduced = Math.max(0, ...Object.values(cumParentOpStats[pName]));
            }
            
            let consumedHere = pProduced * norm;
            let cumConsumedHere = cumPProduced * norm;
            totalConsumed += consumedHere;
            cumTotalConsumed += cumConsumedHere;
            
            if (consumedHere > 0 || cumConsumedHere > 0) {
                let displayConsumed = consumedHere > 0 ? consumedHere : 0;
                pNodes.push(`
                  <div class="vsm-node" style="display:flex; flex-direction:column; align-items:flex-start;">
                    <div style="display:flex; gap: 8px; align-items:center;">
                        <span class="vsm-name">${originalName}</span>
                        <span class="vsm-divider">|</span>
                        <span class="vsm-stat consumed">Вложени: ${displayConsumed} бр.</span>
                    </div>
                    ${targetOpName ? `<div style="font-size:0.85rem; color:#94a3b8; margin-top: -3px;">(на оп. ${targetOpName})</div>` : ''}
                  </div>
                `);
            }
        });
        
        parentsFlowHtml = pNodes.length > 0 ? `<div class="col-layout">${pNodes.join('')}</div>` : `<div class="vsm-node"><span class="vsm-stat" style="color:var(--text-muted)">Няма изразходвани</span></div>`;
    } else {
         parentsFlowHtml = `<div class="vsm-node"><span class="vsm-stat" style="color:var(--text-muted)">Не се влага никъде (Краен продукт)</span></div>`;
    }

    // Windows (Операции на детайла)
    let targetFlowHtml = '';
    for (let i = 0; i < opChain.length; i++) {
        let opName = opChain[i];
        let prodHere = 0;
        let scrapHere = 0;
        let priorHere = 0;
        let cProdHere = 0;
        let cScrapHere = 0;
        
        for (let k in opsProduced) if (k.includes(opName) || opName.includes(k)) prodHere += opsProduced[k];
        for (let k in opsScrap) if (k.includes(opName) || opName.includes(k)) scrapHere += opsScrap[k];
        for (let k in opsPrior) if (k.includes(opName) || opName.includes(k)) priorHere += opsPrior[k];
        
        for (let k in cumProduced) if (k.includes(opName) || opName.includes(k)) cProdHere += cumProduced[k];
        for (let k in cumScrap) if (k.includes(opName) || opName.includes(k)) cScrapHere += cumScrap[k];
        
        let movedForward = 0;
        let cMovedForward = 0;
        if (i < opChain.length - 1) {
            let nextOp = opChain[i+1];
            for (let k in opsProduced) if (k.includes(nextOp) || nextOp.includes(k)) movedForward += opsProduced[k];
            for (let k in cumProduced) if (k.includes(nextOp) || nextOp.includes(k)) cMovedForward += cumProduced[k];
        }
        
        let isLastOp = (i === opChain.length - 1);
        let consumedDisplay = isLastOp ? totalConsumed : 0;
        let cConsumedDisplay = isLastOp ? cumTotalConsumed : 0;
        
        let balance = prodHere - movedForward - scrapHere - consumedDisplay;
        let balanceColor = balance < 0 ? 'var(--danger)' : (balance > 0 ? 'var(--success)' : 'var(--text-main)');
        let balanceSign = balance > 0 ? '+' : '';
        
        let cBalance = cProdHere - cMovedForward - cScrapHere - cConsumedDisplay;
        let cBalanceColor = cBalance < 0 ? 'var(--danger)' : (cBalance > 0 ? 'var(--success)' : 'var(--text-main)');
        let cBalanceSign = cBalance > 0 ? '+' : '';
        
        let physicalStockHtml = '';
        if (isLastOp) {
            let diff = globalAllData.currentStock - cBalance;
            let diffSign = diff > 0 ? '+' : '';
            let diffColor = diff === 0 ? '#94a3b8' : (diff > 0 ? '#10b981' : '#ef4444');
            
            let auditLinesHtml = '';
            let periodAudit = (globalAllData.auditHistory || []).filter(l => {
                let lTs = parseSafeTs(l.changed_at);
                return lTs >= curFromTs && lTs < curToTs;
            });

            let logsToShow = periodAudit.length > 0 ? periodAudit.slice(0, 5) : [];
            if (logsToShow.length > 0) {
                let items = logsToShow.map(log => {
                    let dStr = parseSafeDate(log.changed_at).toLocaleString('bg-BG');
                    let logTs = parseSafeTs(log.changed_at);
                    let o = log.old_data || {};
                    let n = log.new_data || {};
                    let oq = o['Количество'] !== undefined ? parseFloat(o['Количество']) : (o['Общо'] !== undefined ? parseFloat(o['Общо']) : null);
                    let nq = n['Количество'] !== undefined ? parseFloat(n['Количество']) : (n['Общо'] !== undefined ? parseFloat(n['Общо']) : null);
                    if (nq === null && n['Ново Количество'] !== undefined) nq = parseFloat(n['Ново Количество']);
                    let diffQty = (oq !== null && nq !== null) ? (nq - oq) : (nq || 0);
                    let diffSign = diffQty > 0 ? '+' : '';

                    // 1. Проверка за Ревизия (от бутона в Инвентарен детектив)
                    let matchRev = null;
                    if (log.action_type === 'REVISION') {
                        matchRev = { checked_by: n['Проверил'], notes: n['Бележка'] };
                    } else if (globalAllData.recentChecks && globalAllData.recentChecks.length > 0) {
                        matchRev = globalAllData.recentChecks.find(c => {
                            let cTs = parseSafeTs(c.created_at);
                            let tDiff = Math.abs(cTs - logTs);
                            let qtyMatch = (nq !== null && Math.abs((parseFloat(c.actual_qty) || 0) - nq) < 0.01) ||
                                           (Math.abs((parseFloat(c.difference) || 0) - diffQty) < 0.01);
                            return tDiff < 300000 && qtyMatch;
                        });
                    }

                    if (matchRev) {
                        let checker = matchRev.checked_by || 'Администратор';
                        let noteText = matchRev.notes ? ` <span style="color:#94a3b8; font-style:italic;">("${matchRev.notes}")</span>` : '';
                        let changeText = (oq !== null && nq !== null && oq !== nq)
                            ? `променено от <span style="color:#ef4444;">${oq}</span> на <span style="color:#10b981; font-weight:bold;">${nq} бр.</span> (${diffSign}${diffQty} бр.)`
                            : `засечено на <span style="color:#10b981; font-weight:bold;">${nq || 0} бр.</span>`;
                        return `<li style="margin-bottom:4px;">🕒 ${dStr}: 📋 <b style="color:#38bdf8;">Ревизия (Засичане)</b>: ${changeText} [Проверил: <b>${checker}</b>]${noteText}</li>`;
                    }

                    // 2. Проверка за отчет през карта / терминал или служебна корекция от админ
                    let matchOtchet = null;
                    if (globalAllData.rawOtcheti && globalAllData.rawOtcheti.length > 0) {
                        let targetQty = (oq !== null && nq !== null) ? Math.abs(diffQty) : (nq || 0);
                        matchOtchet = globalAllData.rawOtcheti.find(r => {
                            let rTs = parseSafeTs(r['Дата']);
                            let tDiff = Math.abs(rTs - logTs);
                            let q = Math.abs(parseFloat(r['Количество']) || 0);
                            let qtyMatch = Math.abs(q - targetQty) < 0.01;
                            
                            // Съвпадение по време (до 10 минути разлика)
                            if (qtyMatch && tDiff < 600000) return true;

                            // Съвпадение по форматирана дата/час (до минута)
                            let rLocStr = parseSafeDate(r['Дата']).toLocaleString('bg-BG');
                            if (qtyMatch && (rLocStr === dStr || rLocStr.slice(0, 16) === dStr.slice(0, 16))) return true;

                            return false;
                        });
                    }

                    let opWorker = matchOtchet ? String(matchOtchet['Оператор'] || '').trim() : '';
                    let isSysManual = opWorker.includes('СИСТЕМА') || opWorker.includes('Корекция');

                    // Ако е отчет от карта / терминал (има реален оператор, а не системата)
                    if (matchOtchet && !isSysManual) {
                        if (log.action_type === 'INSERT') {
                            return `<li style="margin-bottom:4px;">🕒 ${dStr}: 🟢 <b style="color:#10b981;">Отчетено през карта / терминал</b>: добавени първоначални <b>${nq || 0} бр.</b> [Оператор: <b>${opWorker}</b>]</li>`;
                        } else {
                            return `<li style="margin-bottom:4px;">🕒 ${dStr}: 🟢 <b style="color:#10b981;">Отчетено през карта / терминал</b>: <span style="color:#10b981; font-weight:bold;">+${diffQty} бр.</span> (от ${oq} на <b>${nq} бр.</b>) [Оператор: <b>${opWorker}</b>]</li>`;
                        }
                    }

                    // 3. Ръчна корекция през Админ панела
                    if (log.action_type === 'MANUAL_ADJUSTMENT' || isSysManual) {
                        let changeText = (oq !== null && nq !== null && oq !== nq)
                            ? `променено от <span style="color:#ef4444;">${oq}</span> на <span style="color:#10b981; font-weight:bold;">${nq} бр.</span> (${diffSign}${diffQty} бр.)`
                            : `променено на <span style="color:#10b981; font-weight:bold;">${nq || 0} бр.</span>`;
                        return `<li style="margin-bottom:4px;">🕒 ${dStr}: ✏️ <b style="color:#f59e0b;">Ръчна корекция (Админ панел)</b>: ${changeText}</li>`;
                    }

                    // 4. Обикновени INSERT / UPDATE / DELETE от склад
                    if (log.action_type === 'INSERT') {
                        return `<li style="margin-bottom:4px;">🕒 ${dStr}: 📦 <b style="color:#10b981;">Добавен в склад</b> с <b>${nq || 0} бр.</b></li>`;
                    } else if (log.action_type === 'UPDATE') {
                        let changeText = (oq !== null && nq !== null && oq !== nq) 
                            ? `променено от <span style="color:#ef4444;">${oq}</span> на <span style="color:#10b981; font-weight:bold;">${nq} бр.</span> (${diffSign}${diffQty} бр.)`
                            : `редакция на запис в склад`;
                        return `<li style="margin-bottom:4px;">🕒 ${dStr}: ✏️ <b style="color:#f59e0b;">Ръчна корекция в склад</b>: ${changeText}</li>`;
                    } else if (log.action_type === 'DELETE') {
                        return `<li style="margin-bottom:4px;">🕒 ${dStr}: <b style="color:#ef4444;">Изтрит от склад</b> (беше ${oq || 0} бр.)</li>`;
                    }
                    return `<li style="margin-bottom:4px;">🕒 ${dStr}: Действие ${log.action_type}</li>`;
                });
                auditLinesHtml = `
                    <div style="margin-top:10px; text-align:left; font-size:0.8rem; background:rgba(15,23,42,0.8); padding:8px 12px; border-radius:6px; border:1px solid #334155;">
                        <div style="color:#38bdf8; font-weight:bold; margin-bottom:5px; font-size:0.85rem;">🔍 История на складови промени:</div>
                        <ul style="margin:0; padding-left:16px; color:#cbd5e1; list-style-type:disc; line-height:1.4;">
                            ${items.join('')}
                        </ul>
                    </div>
                `;
            } else if (diff !== 0) {
                auditLinesHtml = `
                    <div style="margin-top:8px; font-size:0.75rem; color:#94a3b8; text-align:center; background:rgba(0,0,0,0.2); padding:6px; border-radius:4px;">
                        ℹ️ Разликата от ${diffSign}${diff} бр. идва от заварено начално салдо в склада, доставка като суровина или ръчна корекция.
                    </div>
                `;
            }

            physicalStockHtml = `
               <div style="margin-top:15px; font-size: 0.95rem; text-align:center; color:var(--text-muted); background: rgba(0,0,0,0.3); padding: 10px; border-radius: 6px; border:1px solid #334155;">
                 <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                     <span>Склад (текущо):</span>
                     <b style="color:white; font-size: 1.15rem;">${globalAllData.currentStock} бр.</b>
                 </div>
                 ${diff !== 0 ? `
                 <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.85rem; border-top:1px dashed #475569; padding-top:4px;">
                     <span style="color:#94a3b8;">Разлика спрямо отчетено (WIP):</span>
                     <b style="color:${diffColor}; font-weight:bold;">${diffSign}${diff} бр.</b>
                 </div>` : ''}
                 ${auditLinesHtml}
               </div>`;
        }
        
        let periodLabel = dateKey === 'ALL' ? 'Произведени в периода:' : `Произведени за ${dateKey.split('-').reverse().join('.')}:`;
        
        let dailyMovementHtml = '';
        if (dateKey !== 'ALL') {
             dailyMovementHtml = `
               <div class="target-row" style="margin-top: 5px;">
                 <span style="color:#94a3b8; font-weight:700; font-size:0.85rem;">ДНЕВНО ДВИЖЕНИЕ:</span>
                 <span class="vsm-stat" style="color:${balanceColor}; font-weight:700; font-size: 1.1rem;">${balanceSign}${balance} бр.</span>
               </div>
               <div style="border-top: 1px dashed #334155; margin: 5px 0;"></div>
             `;
        }
        
        let priorInfoHtml = '';
        if (priorHere > 0) {
            priorInfoHtml = `
               <div class="target-row" style="font-size:0.85rem; color:#94a3b8; margin-top:-2px;">
                 <span>Натрупани преди това:</span>
                 <span style="color:#38bdf8; font-weight:600;">+${priorHere} бр.</span>
               </div>
            `;
        }

        let displayName = (globalAllData.targetName || globalAllData.targetId).toUpperCase();
        let displayCode = globalAllData.targetId && globalAllData.targetId !== globalAllData.targetName ? `(${globalAllData.targetId})` : '';

        let wipLabel = dateKey === 'ALL' ? 'ОБЩО НАТРУПАНИ (WIP):' : 'НАТРУПАНИ ДО ТОЗИ ДЕН:';

        // Check for recent spot-checks for this operation
        let opChecks = (globalAllData.recentChecks || []).filter(c => {
            let cOp = String(c.operation || '').trim().toUpperCase();
            return cOp.includes(opName) || opName.includes(cOp);
        });
        let lastCheckHtml = '';
        if (opChecks.length > 0) {
            let lc = opChecks[0];
            let chkDate = new Date(lc.created_at).toLocaleString('bg-BG');
            let diffSign = (lc.difference > 0 ? '+' : '');
            let diffColor = lc.difference === 0 ? '#94a3b8' : (lc.difference > 0 ? '#10b981' : '#ef4444');
            lastCheckHtml = `
               <div style="background: rgba(16, 185, 129, 0.12); border: 1px solid #10b981; border-radius: 6px; padding: 8px 10px; margin-top: 10px; font-size: 0.82rem; text-align: left;">
                  <div style="color: #10b981; font-weight: bold; display: flex; align-items: center; justify-content: space-between;">
                     <span>🛡️ Физическа проверка:</span>
                     <b style="color:#ffffff; font-size:0.95rem;">${lc.actual_qty} бр.</b>
                  </div>
                  <div style="color: #94a3b8; font-size: 0.75rem; margin-top: 3px;">
                     ${chkDate} | От <b>${lc.checked_by || 'Администратор'}</b> <span style="color:${diffColor}; font-weight:bold;">(${diffSign}${lc.difference} бр.)</span>
                     ${lc.notes ? `<div style="color:#e2e8f0; font-style:italic; margin-top:2px;">"${lc.notes}"</div>` : ''}
                  </div>
               </div>
            `;
        }

        let checkButtonHtml = `
            ${lastCheckHtml}
            <button type="button" onclick="openRevisionModal('${opName.replace(/'/g, "\\'")}', ${cBalance}, ${isLastOp ? globalAllData.currentStock : 'null'})" style="margin-top: 10px; width: 100%; background: #1e293b; border: 1px dashed #38bdf8; color: #38bdf8; padding: 7px 12px; border-radius: 6px; font-size: 0.85rem; font-weight: 700; cursor: pointer; transition: 0.2s; display: flex; align-items: center; justify-content: center; gap: 6px;" onmouseover="this.style.background='#0284c7'; this.style.color='#ffffff';" onmouseout="this.style.background='#1e293b'; this.style.color='#38bdf8';">
               <span>📋</span> <span>Засечи наличност (Ревизия)</span>
            </button>
        `;

        let windowHtml = `
         <div class="vsm-target-node" style="${!isLastOp ? 'border-color:#475569;' : ''}">
            <div class="target-title" style="font-size:1.3rem;">
               ${displayName} 
               ${displayCode ? `<br><span style="font-size:0.9rem; color:#94a3b8; font-weight:600;">${displayCode}</span>` : ''}
               <br><span style="font-size:1rem; color:var(--primary)">(${opName})</span>
            </div>
            <div class="target-stats">
               <div class="target-row">
                 <span style="color:#cbd5e1">${periodLabel}</span>
                 <span class="vsm-stat prod">+${prodHere} бр.</span>
               </div>
               ${priorInfoHtml}
               ${i < opChain.length - 1 ? `
               <div class="target-row">
                 <span style="color:#cbd5e1">Към следваща оп.:</span>
                 <span class="vsm-stat" style="color:var(--text-muted)">-${movedForward} бр.</span>
               </div>` : `
               <div class="target-row">
                 <span style="color:#cbd5e1">Изразходвани в други:</span>
                 <span class="vsm-stat consumed">-${consumedDisplay} бр.</span>
               </div>`}
               <div class="target-row">
                 <span style="color:#cbd5e1">Брак:</span>
                 <span class="vsm-stat scrap">-${scrapHere} бр.</span>
               </div>
               <div style="border-top: 1px solid #334155; margin: 5px 0;"></div>
               ${dailyMovementHtml}
               <div class="target-row" style="margin-top: 5px;">
                 <span style="color:#cbd5e1; font-weight:900; font-size:0.90rem;">${wipLabel}</span>
                 <span class="vsm-stat" style="color:${cBalanceColor}; font-weight:900; font-size: 1.4rem;">${cBalanceSign}${cBalance} бр.</span>
               </div>
               ${physicalStockHtml}
               ${checkButtonHtml}
            </div>
         </div>
        `;
        
        targetFlowHtml += windowHtml;
        if (i < opChain.length - 1) targetFlowHtml += `<div class="vsm-arrow">--▶</div>`;
    }

    if (!targetFlowHtml) {
        document.getElementById('workspace').innerHTML = `
          <div style="margin:auto; text-align:center; color:#94a3b8; padding:30px;">
             <div style="font-size:2.5rem; margin-bottom:10px;">🔍</div>
             <div style="font-size:1.3rem; font-weight:bold; color:#f8fafc; margin-bottom:8px;">Няма намерени записи</div>
             <div>Не бяха открити отчети или технологичен маршрут за <b>${globalAllData.targetName || globalAllData.targetId}</b> в избрания период.</div>
          </div>
        `;
        return;
    }

    document.getElementById('workspace').innerHTML = `
      <div class="vsm-flow">
         ${childrenFlowHtml}
         <div class="vsm-arrow">--▶</div>
         ${targetFlowHtml}
         <div class="vsm-arrow">--▶</div>
         ${parentsFlowHtml}
      </div>
    `;
}

window.openRevisionModal = async function(opName, cBalance, currentStock) {
    let targetId = globalAllData.targetId;
    let targetName = globalAllData.targetName;
    let baseQty = (currentStock !== null && currentStock !== undefined) ? currentStock : (cBalance || 0);
    let savedChecker = localStorage.getItem('last_checker_name') || 'Спасимира';
    let todayStr = new Date().toLocaleDateString('bg-BG');

    let html = `
      <div style="text-align:left; font-size:0.95rem; color:#334155;">
        <div style="margin-bottom:14px; padding:10px 14px; background:#f1f5f9; border-radius:6px; border-left:4px solid #3b82f6;">
          <div style="font-size:1.05rem; font-weight:bold; color:#0f172a; margin-bottom:2px;">${targetName}</div>
          <div style="font-size:0.85rem; color:#64748b; margin-bottom:4px;">Код: <b>${targetId}</b></div>
          <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px dashed #cbd5e1; padding-top:6px; margin-top:4px;">
             <span>Операция: <b style="color:#2563eb;">${opName}</b></span>
             <span>По система (WIP): <b>${cBalance} бр.</b></span>
          </div>
          ${currentStock !== null ? `<div style="font-size:0.85rem; color:#475569; text-align:right;">Склад (текущо): <b>${currentStock} бр.</b></div>` : ''}
        </div>

        <div style="margin-bottom:12px;">
          <label style="display:block; font-weight:bold; margin-bottom:4px; color:#1e293b;">Физически преброено количество (бр.):</label>
          <input type="number" id="swal_rev_qty" value="${baseQty}" step="any" min="0" style="width:100%; padding:10px; border:2px solid #3b82f6; border-radius:6px; font-size:1.2rem; font-weight:bold; color:#0f172a; box-sizing:border-box;">
          <div id="swal_rev_diff" style="margin-top:5px; font-size:0.9rem; font-weight:bold; color:#64748b;">Разлика: 0 бр.</div>
        </div>

        <div style="margin-bottom:12px;">
          <label style="display:block; font-weight:bold; margin-bottom:4px; color:#1e293b;">Проверил (Име):</label>
          <input type="text" id="swal_rev_user" value="${savedChecker}" style="width:100%; padding:8px 10px; border:1px solid #cbd5e1; border-radius:6px; font-size:0.95rem; box-sizing:border-box;">
        </div>

        <div style="margin-bottom:14px;">
          <label style="display:block; font-weight:bold; margin-bottom:4px; color:#1e293b;">Бележка / Забележка (по избор):</label>
          <input type="text" id="swal_rev_notes" placeholder="напр. Ревизия на стелаж 2 / намерени допълнителни" style="width:100%; padding:8px 10px; border:1px solid #cbd5e1; border-radius:6px; font-size:0.95rem; box-sizing:border-box;">
        </div>

        <div style="margin-bottom:6px; display:flex; align-items:center; gap:8px; background:#f8fafc; padding:10px; border-radius:6px; border:1px solid #e2e8f0;">
          <input type="checkbox" id="swal_rev_update_inv" checked style="width:18px; height:18px; cursor:pointer;">
          <label for="swal_rev_update_inv" style="font-size:0.88rem; color:#1e293b; cursor:pointer; font-weight:600;">
            Актуализирай текущата складова наличност на преброените бройки
          </label>
        </div>
      </div>
    `;

    Swal.fire({
        title: '📋 Засичане на наличност (Ревизия)',
        html: html,
        showCancelButton: true,
        confirmButtonText: '💾 Запази ревизията',
        cancelButtonText: 'Отказ',
        confirmButtonColor: '#059669',
        cancelButtonColor: '#64748b',
        focusConfirm: false,
        didOpen: () => {
            const qtyInput = document.getElementById('swal_rev_qty');
            const diffDiv = document.getElementById('swal_rev_diff');
            function calcDiff() {
                let actual = parseFloat(qtyInput.value) || 0;
                let diff = actual - baseQty;
                if (diff === 0) {
                    diffDiv.innerHTML = '<span style="color:#64748b;">⚖️ Няма разминаване (точно съвпадение)</span>';
                } else if (diff > 0) {
                    diffDiv.innerHTML = `<span style="color:#16a34a;">📈 +${diff} бр. излишък спрямо базата</span>`;
                } else {
                    diffDiv.innerHTML = `<span style="color:#dc2626;">📉 ${diff} бр. дефицит спрямо базата</span>`;
                }
            }
            qtyInput.addEventListener('input', calcDiff);
            calcDiff();
        },
        preConfirm: () => {
            const actualQty = parseFloat(document.getElementById('swal_rev_qty').value);
            const user = document.getElementById('swal_rev_user').value.trim();
            const notes = document.getElementById('swal_rev_notes').value.trim();
            const updateInv = document.getElementById('swal_rev_update_inv').checked;

            if (isNaN(actualQty) || actualQty < 0) {
                Swal.showValidationMessage('Моля, въведете валидно количество (0 или повече)!');
                return false;
            }
            if (!user) {
                Swal.showValidationMessage('Моля, въведете кой е извършил проверката!');
                return false;
            }
            return { actualQty, user, notes, updateInv };
        }
    }).then(async (result) => {
        if (result.isConfirmed) {
            let { actualQty, user, notes, updateInv } = result.value;
            localStorage.setItem('last_checker_name', user);
            
            Swal.fire({ title: 'Записване на проверката... ⏳', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

            try {
                let diff = actualQty - baseQty;
                let now = new Date().toISOString();

                // 1. Запис в inventory_checks (ако таблицата съществува)
                let revRecord = {
                    part_id: targetId,
                    part_name: targetName,
                    operation: opName,
                    system_qty: baseQty,
                    actual_qty: actualQty,
                    difference: diff,
                    checked_by: user,
                    notes: notes,
                    created_at: now
                };
                try {
                    await client.from('inventory_checks').insert([revRecord]);
                } catch(e) {
                    console.warn('inventory_checks не е налична:', e);
                }
                globalAllData.recentChecks = globalAllData.recentChecks || [];
                globalAllData.recentChecks.unshift(revRecord);

                // 2. Актуализация на склада в inventory
                if (updateInv) {
                    let { data: allInv, error: invFetchErr } = await client.from('inventory').select('*');
                    if (invFetchErr) throw invFetchErr;

                    // Нормализирани кодове за надеждно намиране
                    let normCodes = new Set([
                        String(targetId || '').replace(/[^а-яА-Яa-zA-Z0-9]/g, '').toLowerCase(),
                        String(targetName || '').replace(/[^а-яА-Яa-zA-Z0-9]/g, '').toLowerCase()
                    ]);
                    normCodes.delete('');

                    // Търсим първо запис за конкретната операция
                    let matchedInv = (allInv || []).find(i => {
                        let dbId = String(i['ID Детайл'] || '').replace(/[^а-яА-Яa-zA-Z0-9]/g, '').toLowerCase();
                        let dbOp = String(i['Операция'] || '').replace(/[^а-яА-Яa-zA-Z0-9]/g, '').toLowerCase();
                        let curOp = opName.replace(/[^а-яА-Яa-zA-Z0-9]/g, '').toLowerCase();
                        return normCodes.has(dbId) && (dbOp === curOp || dbOp.includes(curOp) || curOp.includes(dbOp));
                    });

                    // Ако няма за операцията, търсим записа за готов продукт / склад
                    if (!matchedInv) {
                        matchedInv = (allInv || []).find(i => {
                            let dbId = String(i['ID Детайл'] || '').replace(/[^а-яА-Яa-zA-Z0-9]/g, '').toLowerCase();
                            let dbOp = String(i['Операция'] || '').toLowerCase();
                            return normCodes.has(dbId) && (dbOp.includes('готов') || dbOp.includes('склад'));
                        });
                    }

                    // Ако няма, търсим какъвто и да е запис за този детайл
                    if (!matchedInv) {
                        matchedInv = (allInv || []).find(i => {
                            let dbId = String(i['ID Детайл'] || '').replace(/[^а-яА-Яa-zA-Z0-9]/g, '').toLowerCase();
                            return normCodes.has(dbId);
                        });
                    }

                    if (matchedInv) {
                        const { error: updErr } = await client.from('inventory')
                            .update({ 'Количество': actualQty })
                            .eq('id', matchedInv.id);
                        if (updErr) throw updErr;
                    } else {
                        const { error: insErr } = await client.from('inventory').insert([{
                            'ID Детайл': targetId,
                            'Операция': 'готов продукт',
                            'Количество': actualQty
                        }]);
                        if (insErr) throw insErr;
                    }

                    // Записваме и одит за ревизия
                    try {
                        await client.from('audit_logs').insert([{
                            table_name: 'inventory',
                            action_type: 'REVISION',
                            old_data: { 'ID Детайл': targetId, 'Операция': opName, 'Количество': baseQty },
                            new_data: { 'ID Детайл': targetId, 'Операция': opName, 'Количество': actualQty, 'Разлика': diff, 'Проверил': user, 'Бележка': notes },
                            changed_at: now
                        }]);
                    } catch(e) {
                        console.warn('Не можа да се запише REVISION в audit_logs:', e);
                    }
                }

                await Swal.fire({
                    icon: 'success',
                    title: 'Успешно документирано!',
                    html: `Наличността за <b>${targetName}</b> на операция <b>${opName}</b> е засечена на <b>${actualQty} бр.</b><br><span style="font-size:0.85em; color:#64748b;">Дата: ${new Date().toLocaleString('bg-BG')}</span>`,
                    timer: 2500,
                    showConfirmButton: false
                });

                // Презареждаме Детектива
                startSearch();

            } catch(err) {
                Swal.fire('Грешка при запис', err.message, 'error');
            }
        }
    });
};
