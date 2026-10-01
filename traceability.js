// traceability.js - Inventory Detective Logic

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

async function startSearch() {
  const input = document.getElementById('searchInput').value.trim();
  const dateFrom = document.getElementById('dateFrom').value;
  const dateTo = document.getElementById('dateTo').value;
  
  if (!input) return Swal.fire('Грешка', 'Въведете детайл!', 'warning');
  if (!dateFrom || !dateTo) return Swal.fire('Грешка', 'Изберете период!', 'warning');

  document.getElementById('workspace').innerHTML = '<div style="margin:auto; color:var(--text-muted); font-size:1.2rem; font-weight: 600;">Анализиране на потока... ⏳</div>';

  try {
      await generateMassBalance(input, dateFrom, dateTo);
  } catch (e) {
      console.error(e);
      document.getElementById('workspace').innerHTML = `<div style="margin:auto; color:var(--danger); font-size: 1.2rem;">Грешка: ${e.message}</div>`;
  }
}

async function generateMassBalance(targetId, dateFrom, dateTo) {
    // We add 86400000 (1 day) to toTs to include the end date fully
    // 1. Fetch Routes for the target
    const { data: rData } = await fetchAllRows('routes', '*', 'ID Детайл', `%${targetId}%`);
    let tRoutes = rData ? rData.filter(r => String(r['ID Детайл']).trim().toLowerCase() === targetId.toLowerCase()) : [];
    tRoutes.sort((a,b) => parseInt(a['Номер']||0) - parseInt(b['Номер']||0));

    // 2. Fetch Target Production & Scrap
    const { data: rawOtcheti } = await fetchAllRows('otcheti', '*', 'ID Детайл', `%${targetId}%`);
    let opsProduced = {};
    let opsScrap = {};
    
    if (rawOtcheti) {
        rawOtcheti.forEach(r => {
            if (String(r['ID Детайл']).trim().toLowerCase() !== targetId.toLowerCase()) return;
            let dTs = new Date(r['Дата']).getTime();
            if (dTs >= fromTs && dTs < toTs) {
                let st = String(r['Статус'] || '').trim().toLowerCase();
                let q = parseFloat(r['Количество']) || 0;
                let op = String(r['Операция'] || 'Без оп.').trim().toUpperCase();
                
                if (st === 'отчетено' || st === 'завършено') {
                    opsProduced[op] = (opsProduced[op] || 0) + q;
                }
                else if (st === 'брак') {
                    opsScrap[op] = (opsScrap[op] || 0) + Math.abs(q);
                }
            }
        });
    }

    // Determine the operations chain
    let opChain = [];
    if (tRoutes.length > 0) {
        tRoutes.forEach(r => {
            opChain.push(String(r['Име'] || r['Операция'] || '').trim().toUpperCase());
        });
    } else {
        // Fallback: if no routes, just use whatever operations are in reports
        opChain = Object.keys(opsProduced);
        if (opChain.length === 0) opChain = ['Без оп.'];
    }
    
    // In some cases, names in otcheti might be slightly different. 
    // We try to find the closest match or just use the exact upper case.
    let targetProduced = 0; // Total produced (for child consumption)
    if (opChain.length > 0) {
        let firstOp = opChain[0];
        // The children consumption should be based on the FIRST operation's production
        targetProduced = opsProduced[firstOp] || 0; 
        // fallback to max if first is 0
        if (targetProduced === 0) {
            targetProduced = Math.max(0, ...Object.values(opsProduced));
        }
    }

    // 2. Fetch Children (What went into the Target?)
    const { data: childrenRaw } = await fetchAllRows('bom', '*', 'ID Родител', `%${targetId}%`);
    let childrenBOM = childrenRaw ? childrenRaw.filter(b => String(b['ID Родител']).trim().toLowerCase() === targetId.toLowerCase()) : [];
    
    let childrenFlowHtml = '';
    
    if (childrenBOM.length > 0) {
        // Filter out raw materials (items with no routes and no children of their own)
        let childCodes = childrenBOM.map(b => String(b['ID Компонент']).toUpperCase());
        
        // Chunk childCodes to avoid large IN clauses if there are many
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
        childrenBOM.forEach(b => {
             let cName = String(b['ID Компонент']).toUpperCase();
             let cNorm = cName.replace(/[^а-яА-Яa-zA-Z0-9]/g, '').toLowerCase();
             let isRaw = !hasRoute.has(cName) && !hasBom.has(cName);
             
             // Fallback for stator packs
             if (isRaw && (cNorm.includes('статоренпак') || cNorm.includes('статор'))) {
                 isRaw = false;
             }
             
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
        
        if (cNodes.length > 0) {
            childrenFlowHtml = `<div class="col-layout">${cNodes.join('')}</div>`;
        } else {
            childrenFlowHtml = `<div class="vsm-node" style="opacity:0.5"><span class="vsm-name">САМО СУРОВИНИ (СКРИТИ)</span></div>`;
        }
    } else {
         childrenFlowHtml = `<div class="vsm-node" style="opacity:0.5"><span class="vsm-name">ЧИСТА СУРОВИНА</span></div>`;
    }

    // 3. Fetch Parents (Where is it consumed?)
    const { data: parentsRaw } = await fetchAllRows('bom', '*', 'ID Компонент', `%${targetId}%`);
    let parentsBOM = parentsRaw ? parentsRaw.filter(b => String(b['ID Компонент']).trim().toLowerCase() === targetId.toLowerCase()) : [];
    
    let totalConsumed = 0;
    let parentsFlowHtml = '';
    
    if (parentsBOM.length > 0) {
        let parentNames = parentsBOM.map(b => b['ID Родител']).filter(Boolean);
        
        // Fetch production of parents in the timeframe
        let parentStats = {}; // { parentName: qtyProduced }
        
        // chunk parent names to avoid huge IN clauses
        let pChunks = [];
        for(let i=0; i<parentNames.length; i+=100) pChunks.push(parentNames.slice(i, i+100));
        
        for (let chunk of pChunks) {
            const { data: parentsOtcheti } = await client.from('otcheti')
                .select('ID Детайл, Дата, Количество, Статус')
                .in('ID Детайл', chunk);
                
            if (parentsOtcheti) {
                parentsOtcheti.forEach(r => {
                    let dTs = new Date(r['Дата']).getTime();
                    if (dTs >= fromTs && dTs < toTs) {
                        let st = String(r['Статус'] || '').trim().toLowerCase();
                        if (st === 'отчетено' || st === 'завършено') {
                            let pName = String(r['ID Детайл']).toUpperCase();
                            parentStats[pName] = (parentStats[pName] || 0) + (parseFloat(r['Количество']) || 0);
                        }
                    }
                });
            }
        }
        
        let pNodes = [];
        parentsBOM.forEach(b => {
            let pName = String(b['ID Родител']).toUpperCase();
            let norm = parseFloat(b['Количество']) || 1;
            let pProduced = parentStats[pName] || 0;
            let consumedHere = pProduced * norm;
            
            totalConsumed += consumedHere;
            
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
        
        if (pNodes.length > 0) {
            parentsFlowHtml = `<div class="col-layout">${pNodes.join('')}</div>`;
        } else {
            parentsFlowHtml = `<div class="vsm-node"><span class="vsm-stat" style="color:var(--text-muted)">Няма изразходвани в този период</span></div>`;
        }
    } else {
         parentsFlowHtml = `<div class="vsm-node"><span class="vsm-stat" style="color:var(--text-muted)">Не се влага никъде (Краен продукт)</span></div>`;
    }

    // 4. Balance Calculation & Target Windows HTML
    let targetFlowHtml = '';
    
    for (let i = 0; i < opChain.length; i++) {
        let opName = opChain[i];
        let prodHere = 0;
        let scrapHere = 0;
        
        // Find matching operation in opsProduced/opsScrap
        for (let k in opsProduced) {
            if (k.includes(opName) || opName.includes(k)) prodHere += opsProduced[k];
        }
        for (let k in opsScrap) {
            if (k.includes(opName) || opName.includes(k)) scrapHere += opsScrap[k];
        }
        
        let movedForward = 0;
        if (i < opChain.length - 1) {
            let nextOp = opChain[i+1];
            for (let k in opsProduced) {
                 if (k.includes(nextOp) || nextOp.includes(k)) movedForward += opsProduced[k];
            }
        }
        
        let isLastOp = (i === opChain.length - 1);
        let consumedDisplay = isLastOp ? totalConsumed : 0;
        
        let balance = prodHere - movedForward - scrapHere - consumedDisplay;
        let balanceColor = balance < 0 ? 'var(--danger)' : (balance > 0 ? 'var(--success)' : 'var(--text-main)');
        let balanceSign = balance > 0 ? '+' : '';
        
        let physicalStockHtml = '';
        if (isLastOp) {
             physicalStockHtml = `
               <div style="margin-top:15px; font-size: 0.95rem; text-align:center; color:var(--text-muted); background: rgba(0,0,0,0.2); padding: 8px; border-radius: 4px;">
                 Склад (текущо за детайла): <b style="color:white; font-size: 1.1rem; margin-left: 5px;">${currentStock} бр.</b>
               </div>
             `;
        }
        
        let windowHtml = `
         <div class="vsm-target-node" style="${!isLastOp ? 'border-color:#475569;' : ''}">
            <div class="target-title" style="font-size:1.4rem;">${targetId.toUpperCase()} <br><span style="font-size:1rem; color:var(--primary)">(${opName})</span></div>
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
               </div>
               `}
               <div class="target-row">
                 <span style="color:#cbd5e1">Брак:</span>
                 <span class="vsm-stat scrap">-${scrapHere} бр.</span>
               </div>
               <div style="border-top: 1px solid #334155; margin: 5px 0;"></div>
               <div class="target-row" style="margin-top: 5px;">
                 <span style="color:#cbd5e1; font-weight:900;">НЕТЕН БАЛАНС (WIP):</span>
                 <span class="vsm-stat" style="color:${balanceColor}; font-weight:900; font-size: 1.4rem;">${balanceSign}${balance} бр.</span>
               </div>
               ${physicalStockHtml}
            </div>
         </div>
        `;
        
        targetFlowHtml += windowHtml;
        if (i < opChain.length - 1) {
            targetFlowHtml += `<div class="vsm-arrow">--▶</div>`;
        }
    }

    // Render VSM Flow
    document.getElementById('workspace').innerHTML = `
      <div class="vsm-flow">
         <!-- INPUTS / CHILDREN -->
         ${childrenFlowHtml}
         
         <div class="vsm-arrow">--▶</div>
      
         <!-- TARGET OPERATIONS CHAIN -->
         ${targetFlowHtml}
         
         <div class="vsm-arrow">--▶</div>
         
         <!-- PARENTS / OUTPUTS -->
         ${parentsFlowHtml}
      </div>
    `;
}
