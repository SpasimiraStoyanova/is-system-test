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

async function fetchAllRows(table, select, filterCol, filterVal) {
    let allData = [];
    let sr = 0;
    while(true) {
        let q = client.from(table).select(select).range(sr, sr + 999);
        if (filterCol && filterVal) q = q.ilike(filterCol, filterVal);
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
    const fromTs = new Date(dateFrom).getTime();
    const toTs = new Date(dateTo).getTime() + 86400000;
    globalTimeline = {};

    // 1. Fetch Routes (fetch all to allow partial matching like base routes for (R3) variants)
    const { data: rData } = await fetchAllRows('routes', '*', null, null);
    globalAllData.tRoutes = rData ? rData.filter(r => {
        let dbId = String(r['ID Детайл']).trim().toLowerCase();
        let tId = targetId.toLowerCase();
        return dbId === tId || tId.includes(dbId) || dbId.includes(tId);
    }) : [];
    globalAllData.tRoutes.sort((a,b) => parseInt(a['Номер']||0) - parseInt(b['Номер']||0));

    // 2. Fetch Target Otcheti
    const { data: rawOtcheti } = await fetchAllRows('otcheti', '*', 'ID Детайл', `%${targetId}%`);
    globalAllData.rawOtcheti = [];
    if (rawOtcheti) {
        rawOtcheti.forEach(r => {
            if (String(r['ID Детайл']).trim().toLowerCase() !== targetId.toLowerCase()) return;
            let dTs = new Date(r['Дата']).getTime();
            if (dTs >= fromTs && dTs < toTs) {
                globalAllData.rawOtcheti.push(r);
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
    const { data: childrenRaw } = await fetchAllRows('bom', '*', 'ID Родител', `%${targetId}%`);
    globalAllData.childrenBOM = childrenRaw ? childrenRaw.filter(b => String(b['ID Родител']).trim().toLowerCase() === targetId.toLowerCase()) : [];

    // 4. Fetch BOM Parents & Parent Otcheti
    const { data: parentsRaw } = await fetchAllRows('bom', '*', 'ID Компонент', `%${targetId}%`);
    globalAllData.parentsBOM = parentsRaw ? parentsRaw.filter(b => String(b['ID Компонент']).trim().toLowerCase() === targetId.toLowerCase()) : [];
    
    globalAllData.parentOtcheti = [];
    if (globalAllData.parentsBOM.length > 0) {
        let parentNames = globalAllData.parentsBOM.map(b => b['ID Родител']).filter(Boolean);
        let pChunks = [];
        for(let i=0; i<parentNames.length; i+=100) pChunks.push(parentNames.slice(i, i+100));
        
        for (let chunk of pChunks) {
            const { data: parentsOtcheti } = await client.from('otcheti').select('ID Детайл, Дата, Количество, Статус').in('ID Детайл', chunk);
            if (parentsOtcheti) {
                parentsOtcheti.forEach(r => {
                    let dTs = new Date(r['Дата']).getTime();
                    if (dTs >= fromTs && dTs < toTs) {
                        globalAllData.parentOtcheti.push(r);
                        let dateStr = r['Дата'].split('T')[0];
                        if (!globalTimeline[dateStr]) globalTimeline[dateStr] = { rawOtcheti: [], parentOtcheti: [] };
                        globalTimeline[dateStr].parentOtcheti.push(r);
                    }
                });
            }
        }
    }

    // 5. Fetch Inventory
    const { data: invDataRaw } = await fetchAllRows('inventory', 'Количество, "ID Детайл"', 'ID Детайл', `%${targetId}%`);
    globalAllData.currentStock = 0;
    if (invDataRaw) {
        invDataRaw.forEach(i => {
            if (String(i['ID Детайл']).trim().toLowerCase() === targetId.toLowerCase()) {
                globalAllData.currentStock += (parseFloat(i['Количество']) || 0);
            }
        });
    }
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
        globalAllData.tRoutes.forEach(r => opChain.push(String(r['Име'] || r['Операция'] || '').trim().toUpperCase()));
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
        let childCodes = globalAllData.childrenBOM.map(b => String(b['ID Компонент']).toUpperCase());
        let cChunks = [];
        for(let i=0; i<childCodes.length; i+=100) cChunks.push(childCodes.slice(i, i+100));
        
        let hasRoute = new Set();
        let hasBom = new Set();
        
        for (let chunk of cChunks) {
            const { data: rChild } = await client.from('routes').select('"ID Детайл"').in('ID Детайл', chunk);
            if (rChild) rChild.forEach(r => hasRoute.add(String(r['ID Детайл']).toUpperCase()));
            const { data: bChild } = await client.from('bom').select('"ID Родител"').in('ID Родител', chunk);
            if (bChild) bChild.forEach(b => hasBom.add(String(b['ID Родител']).toUpperCase()));
        }
        
        let filteredChildren = [];
        globalAllData.childrenBOM.forEach(b => {
             let cName = String(b['ID Компонент']).toUpperCase();
             let cNorm = cName.replace(/[^а-яА-Яa-zA-Z0-9]/g, '').toLowerCase();
             let isRaw = !hasRoute.has(cName) && !hasBom.has(cName);
             if (isRaw && (cNorm.includes('статоренпак') || cNorm.includes('статор'))) isRaw = false;
             if (!isRaw) filteredChildren.push(b);
        });

        let cNodes = [];
        filteredChildren.forEach(b => {
            let cName = String(b['ID Компонент']).toUpperCase();
            let norm = parseFloat(b['Количество']) || 1;
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
        let parentStats = {}; 
        (dataSlice.parentOtcheti || []).forEach(r => {
            let st = String(r['Статус'] || '').trim().toLowerCase();
            if (st === 'отчетено' || st === 'завършено') {
                let pName = String(r['ID Детайл']).toUpperCase();
                parentStats[pName] = (parentStats[pName] || 0) + (parseFloat(r['Количество']) || 0);
            }
        });
        
        let cumParentStats = {};
        (globalAllData.parentOtcheti || []).forEach(r => {
            let dTs = new Date(r['Дата']).getTime();
            let st = String(r['Статус'] || '').trim().toLowerCase();
            if (dTs < targetTs && (st === 'отчетено' || st === 'завършено')) {
                 let pName = String(r['ID Детайл']).toUpperCase();
                 cumParentStats[pName] = (cumParentStats[pName] || 0) + (parseFloat(r['Количество']) || 0);
            }
        });
        
        let pNodes = [];
        globalAllData.parentsBOM.forEach(b => {
            let pName = String(b['ID Родител']).toUpperCase();
            let norm = parseFloat(b['Количество']) || 1;
            let pProduced = parentStats[pName] || 0;
            let cumPProduced = cumParentStats[pName] || 0;
            
            let consumedHere = pProduced * norm;
            totalConsumed += consumedHere;
            cumTotalConsumed += (cumPProduced * norm);
            
            if (consumedHere > 0) {
                pNodes.push(`
                  <div class="vsm-node">
                    <span class="vsm-name">${pName}</span>
                    <span class="vsm-divider">|</span>
                    <span class="vsm-stat consumed">Вложени: ${consumedHere} бр.</span>
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
