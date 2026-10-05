// traceability.js - Inventory Detective Logic with Timeline

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
let globalAllData = { rawOtcheti: [], parentOtcheti: [], childrenBOM: [], parentsBOM: [], tRoutes: [], currentStock: 0, targetId: '' };

async function startSearch() {
  const input = document.getElementById('searchInput').value.trim();
  const dateFrom = document.getElementById('dateFrom').value;
  const dateTo = document.getElementById('dateTo').value;
  
  if (!input) return Swal.fire('Грешка', 'Въведете детайл!', 'warning');
  if (!dateFrom || !dateTo) return Swal.fire('Грешка', 'Изберете период!', 'warning');

  document.getElementById('workspace').innerHTML = '<div style="margin:auto; color:var(--text-muted); font-size:1.2rem; font-weight: 600;">Анализиране на потока... ⏳</div>';
  document.getElementById('timelineContainer').innerHTML = '';

  try {
      await fetchDataForPeriod(input, dateFrom, dateTo);
      renderTimeline();
      renderVSM('ALL');
  } catch (e) {
      console.error(e);
      document.getElementById('workspace').innerHTML = `<div style="margin:auto; color:var(--danger); font-size: 1.2rem;">Грешка: ${e.message}</div>`;
  }
}

async function fetchDataForPeriod(targetId, dateFrom, dateTo) {
    globalAllData.targetId = targetId;
    let tNorm = targetId.replace(/[^а-яА-Яa-zA-Z0-9]/g, '').toLowerCase();
    const fromTs = new Date(dateFrom).getTime();
    const toTs = new Date(dateTo).getTime() + 86400000;
    globalTimeline = {};

    // 1. Fetch Routes (Marshruti)
    const { data: rData } = await fetchRobustRows('marshruti', '*', 'Код на детайла', targetId);
    
    globalAllData.routesSetNorm = new Set();
    if (rData) rData.forEach(r => globalAllData.routesSetNorm.add(String(r['Код на детайла']).replace(/[^а-яА-Яa-zA-Z0-9]/g, '').toLowerCase()));
    
    globalAllData.tRoutes = rData ? rData.filter(r => {
        let dbId = String(r['Код на детайла']).replace(/[^а-яА-Яa-zA-Z0-9]/g, '').toLowerCase();
        return dbId === tNorm;
    }) : [];
    globalAllData.tRoutes.sort((a,b) => parseInt(a['№ Операция']||0) - parseInt(b['№ Операция']||0));

    // 2. Fetch Target Otcheti
    const { data: rawOtcheti } = await fetchRobustRows('otcheti', '*', 'ID Детайл', targetId);
    globalAllData.rawOtcheti = [];
    if (rawOtcheti) {
        rawOtcheti.forEach(r => {
            let dbId = String(r['ID Детайл']).replace(/[^а-яА-Яa-zA-Z0-9]/g, '').toLowerCase();
            if (dbId !== tNorm) return;
            globalAllData.rawOtcheti.push(r);
            let dTs = new Date(r['Дата']).getTime();
            if (dTs >= fromTs && dTs < toTs) {
                let dateStr = r['Дата'].split('T')[0];
                if (!globalTimeline[dateStr]) globalTimeline[dateStr] = { rawOtcheti: [], parentOtcheti: [] };
                globalTimeline[dateStr].rawOtcheti.push(r);
            }
        });
        
        // Sort chronologically and build a global fallback chain of operations
        globalAllData.rawOtcheti.sort((a,b) => new Date(a['Дата']).getTime() - new Date(b['Дата']).getTime());
        let fChainSet = new Set();
        globalAllData.rawOtcheti.forEach(r => {
            let op = String(r['Операция'] || 'Без оп.').trim().toUpperCase();
            fChainSet.add(op);
        });
        globalAllData.fallbackOpChain = Array.from(fChainSet);
    }

    // 3. Fetch BOM Children
    const { data: childrenRaw } = await fetchRobustRows('bom', '*', 'ID Родител', targetId);
    globalAllData.childrenBOM = childrenRaw ? childrenRaw.filter(b => {
        let dbId = String(b['ID Родител']).replace(/[^а-яА-Яa-zA-Z0-9]/g, '').toLowerCase();
        return dbId === tNorm;
    }) : [];

    // 3.5 Check if children are raw materials
    if (globalAllData.childrenBOM.length > 0) {
        let childCodes = [...new Set(globalAllData.childrenBOM.map(b => String(b['ID Компонент']).trim()))];
        let rSet = new Set(), bSet = new Set(), oSet = new Set();
        let cChunks = [];
        for(let i=0; i<childCodes.length; i+=100) cChunks.push(childCodes.slice(i, i+100));
        for (let chunk of cChunks) {
            let [{data:rData}, {data:bData}, {data:oData}] = await Promise.all([
                client.from('marshruti').select('"Код на детайла"').in('Код на детайла', chunk),
                client.from('bom').select('"ID Родител"').in('ID Родител', chunk),
                client.from('otcheti').select('"ID Детайл"').in('ID Детайл', chunk)
            ]);
            if (rData) rData.forEach(x => rSet.add(String(x['Код на детайла']).replace(/[^а-яА-Яa-zA-Z0-9]/g, '').toLowerCase()));
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
    const { data: parentsRaw } = await fetchRobustRows('bom', '*', 'ID Компонент', targetId);
    globalAllData.parentsBOM = parentsRaw ? parentsRaw.filter(b => {
        let dbId = String(b['ID Компонент']).replace(/[^а-яА-Яa-zA-Z0-9]/g, '').toLowerCase();
        return dbId === tNorm;
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
                        let dTs = new Date(r['Дата']).getTime();
                        if (dTs >= fromTs && dTs < toTs) {
                            let dateStr = r['Дата'].split('T')[0];
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
        .select('"Общо", "Свободни", "Количество", "ID Детайл"')
        .ilike('ID Детайл', `%${tNorm.substring(0, 5)}%`); // Broad filter to catch variants
    
    let allStock = invData || [];
    allStock.forEach(i => {
        let dbId = String(i['ID Детайл']).replace(/[^а-яА-Яa-zA-Z0-9]/g, '').toLowerCase();
        if (dbId === tNorm) {
            let qty = i['Количество'] !== undefined ? i['Количество'] : (i['Общо'] !== undefined ? i['Общо'] : i['Свободни']);
            globalAllData.currentStock += (parseFloat(String(qty || '0').replace(',', '.')) || 0);
        }
    });
}

function renderTimeline() {
    const container = document.getElementById('timelineContainer');
    let dates = Object.keys(globalTimeline).sort();
    
    if (dates.length === 0) {
        container.innerHTML = '<div style="color:var(--text-muted); margin:auto;">Няма събития за избрания период.</div>';
        return;
    }
    
    let html = `
        <div style="cursor:pointer; display:flex; flex-direction:column; align-items:center;" onclick="renderVSM('ALL')">
            <div style="width:12px; height:12px; background:var(--primary); border-radius:50%; margin-bottom:5px; box-shadow:0 0 10px var(--primary);"></div>
            <div style="color:white; font-size:0.8rem; font-weight:bold;">ЦЕЛИЯТ ПЕРИОД</div>
        </div>
        <div style="width:2px; height:20px; background:#475569;"></div>
    `;
    
    dates.forEach(d => {
        let displayD = d.split('-').reverse().join('.');
        html += `
        <div style="cursor:pointer; display:flex; flex-direction:column; align-items:center; opacity:0.8; transition:0.2s;" onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.8'" onclick="renderVSM('${d}')">
            <div style="width:10px; height:10px; background:#94a3b8; border-radius:50%; margin-bottom:5px;"></div>
            <div style="color:#cbd5e1; font-size:0.75rem;">${displayD}</div>
        </div>
        <div style="height:1px; width:30px; background:#334155;"></div>
        `;
    });
    
    container.innerHTML = html;
}

async function renderVSM(dateKey) {
    let dataSlice = dateKey === 'ALL' ? globalAllData : globalTimeline[dateKey];
    if (!dataSlice) return;

    let opsProduced = {};
    let opsScrap = {};
    let cumProduced = {};
    let cumScrap = {};
    
    let targetTs = dateKey === 'ALL' ? Infinity : new Date(dateKey).getTime() + 86400000;

    (globalAllData.rawOtcheti || []).forEach(r => {
        let dTs = new Date(r['Дата']).getTime();
        let st = String(r['Статус'] || '').trim().toLowerCase();
        let q = parseFloat(r['Количество']) || 0;
        let op = String(r['Операция'] || 'Без оп.').trim().toUpperCase();
        
        if (dTs < targetTs) {
             if (st === 'отчетено' || st === 'завършено') cumProduced[op] = (cumProduced[op] || 0) + q;
             else if (st === 'брак') cumScrap[op] = (cumScrap[op] || 0) + Math.abs(q);
        }
    });
    
    (dataSlice.rawOtcheti || []).forEach(r => {
        let st = String(r['Статус'] || '').trim().toLowerCase();
        let q = parseFloat(r['Количество']) || 0;
        let op = String(r['Операция'] || 'Без оп.').trim().toUpperCase();
        
        if (st === 'отчетено' || st === 'завършено') opsProduced[op] = (opsProduced[op] || 0) + q;
        else if (st === 'брак') opsScrap[op] = (opsScrap[op] || 0) + Math.abs(q);
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

    // Children 
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

    // Parents
    let totalConsumed = 0;
    let cumTotalConsumed = 0;
    let parentsFlowHtml = '';
    
    if (globalAllData.parentsBOM.length > 0) {
        let parentOpStats = {}; 
        (dataSlice.parentOtcheti || []).forEach(r => {
            let st = String(r['Статус'] || '').trim().toLowerCase();
            if (st === 'отчетено' || st === 'завършено') {
                let pName = String(r['ID Детайл']).replace(/[^а-яА-Яa-zA-Z0-9]/g, '').toLowerCase();
                let op = String(r['Операция'] || 'Без оп.').trim().toUpperCase();
                if (!parentOpStats[pName]) parentOpStats[pName] = {};
                parentOpStats[pName][op] = (parentOpStats[pName][op] || 0) + (parseFloat(r['Количество']) || 0);
            }
        });
        
        let cumParentOpStats = {};
        (globalAllData.parentOtcheti || []).forEach(r => {
            let dTs = new Date(r['Дата']).getTime();
            let st = String(r['Статус'] || '').trim().toLowerCase();
            if (dTs < targetTs && (st === 'отчетено' || st === 'завършено')) {
                 let pName = String(r['ID Детайл']).replace(/[^а-яА-Яa-zA-Z0-9]/g, '').toLowerCase();
                 let op = String(r['Операция'] || 'Без оп.').trim().toUpperCase();
                 if (!cumParentOpStats[pName]) cumParentOpStats[pName] = {};
                 cumParentOpStats[pName][op] = (cumParentOpStats[pName][op] || 0) + (parseFloat(r['Количество']) || 0);
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

    // Windows
    let targetFlowHtml = '';
    for (let i = 0; i < opChain.length; i++) {
        let opName = opChain[i];
        let prodHere = 0;
        let scrapHere = 0;
        
        let cProdHere = 0;
        let cScrapHere = 0;
        
        for (let k in opsProduced) if (k.includes(opName) || opName.includes(k)) prodHere += opsProduced[k];
        for (let k in opsScrap) if (k.includes(opName) || opName.includes(k)) scrapHere += opsScrap[k];
        
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
        
        let physicalStockHtml = isLastOp ? `
               <div style="margin-top:15px; font-size: 0.95rem; text-align:center; color:var(--text-muted); background: rgba(0,0,0,0.2); padding: 8px; border-radius: 4px;">
                 Склад (текущо): <b style="color:white; font-size: 1.1rem; margin-left: 5px;">${globalAllData.currentStock} бр.</b>
               </div>` : '';
        
        let dailyBalanceHtml = '';
        if (dateKey !== 'ALL') {
             dailyBalanceHtml = `
               <div class="target-row" style="margin-top: 5px;">
                 <span style="color:#94a3b8; font-weight:700; font-size:0.90rem;">ДНЕВНО ДВИЖЕНИЕ ЗА ${dateKey.split('-').reverse().join('.')}:</span>
                 <span class="vsm-stat" style="color:${balanceColor}; font-weight:700; font-size: 1.1rem;">${balanceSign}${balance} бр.</span>
               </div>
               <div style="border-top: 1px dashed #334155; margin: 5px 0;"></div>
             `;
        }
        
        let windowHtml = `
         <div class="vsm-target-node" style="${!isLastOp ? 'border-color:#475569;' : ''}">
            <div class="target-title" style="font-size:1.4rem;">${globalAllData.targetId.toUpperCase()} <br><span style="font-size:1rem; color:var(--primary)">(${opName})</span></div>
            <div class="target-stats">
               <div class="target-row">
                 <span style="color:#cbd5e1">Произведени:</span>
                 <span class="vsm-stat prod">+${prodHere} бр.</span>
               </div>
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
               ${dailyBalanceHtml}
               <div class="target-row" style="margin-top: 5px;">
                 <span style="color:#cbd5e1; font-weight:900; font-size:0.90rem;">ОБЩО НАТРУПАНИ (WIP):</span>
                 <span class="vsm-stat" style="color:${cBalanceColor}; font-weight:900; font-size: 1.4rem;">${cBalanceSign}${cBalance} бр.</span>
               </div>
               ${physicalStockHtml}
            </div>
         </div>
        `;
        
        targetFlowHtml += windowHtml;
        if (i < opChain.length - 1) targetFlowHtml += `<div class="vsm-arrow">--▶</div>`;
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
