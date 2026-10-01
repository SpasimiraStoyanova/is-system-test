// traceability.js

document.getElementById('searchInput').addEventListener('keypress', function(e) {
  if(e.key === 'Enter') startSearch();
});

// Dummy variables and function to satisfy terminal-tasks.js dependency
window.fetchUserCheckInStatus = async function() { return true; };
window.currentOperator = "monitor";
window.currentMachine = "";
window.currentTaskFilter = "all";
window.activeTaskId = null;

let globalTargetId = '';
let currentTimelineData = [];

async function startSearch() {
  const input = document.getElementById('searchInput').value.trim();
  if (!input) {
    Swal.fire({icon: 'warning', title: 'Празно поле', text: 'Моля, въведете детайл!', confirmButtonColor: '#3b82f6'});
    return;
  }
  
  globalTargetId = input;
  
  // Show loading states
  document.getElementById('timelineTrack').innerHTML = '<div style="color:var(--text-muted); margin: 0 auto;">Зареждане на хронология... ⏳</div>';
  document.getElementById('treeWrapper').innerHTML = '<div style="color: var(--text-muted); font-size: 1.2rem;">Зареждане на дървото... ⏳</div>';
  
  try {
    // Fetch timeline from otcheti
    await fetchTimeline(input);
    
  } catch(e) {
    console.error(e);
    Swal.fire('Грешка', 'Възникна грешка при зареждането на данните.', 'error');
  }
}


async function fetchAllRows(table, select, filterCol, filterVal, orderCol) {
    let allData = [];
    let sr = 0;
    while(true) {
        let q = client.from(table).select(select).range(sr, sr + 999);
        if (filterCol && filterVal) q = q.ilike(filterCol, filterVal);
        if (orderCol) q = q.order(orderCol, { ascending: true });
        
        let { data, error } = await q;
        if (error || !data || data.length === 0) break;
        allData.push(...data);
        if (data.length < 1000) break;
        sr += 1000;
    }
    return { data: allData };
}

async function fetchTimeline(targetId) {
    const { data: rawData, error } = await fetchAllRows('otcheti', '*', 'ID Детайл', `%${targetId}%`, 'Дата');
        
    let data = rawData ? rawData.filter(r => String(r['ID Детайл']).trim().toLowerCase() === targetId.toLowerCase()) : [];
        
    if (error) {
        console.error("Timeline error:", error);
        document.getElementById('timelineTrack').innerHTML = '<div style="color:var(--danger); margin: 0 auto;">Грешка при зареждане на хронологията.</div>';
        return;
    }
    
    if (!data || data.length === 0) {
        document.getElementById('timelineTrack').innerHTML = '<div style="color:var(--text-muted); margin: 0 auto;">Няма история за този детайл.</div>';
        renderTree(targetId, null); // Render empty tree with current inventory only
        return;
    }
    
    // Group by Day (YYYY-MM-DD)
    let dailyData = {};
    data.forEach(r => {
        let dateObj = new Date(r['Дата']);
        let dayStr = dateObj.toLocaleDateString('bg-BG'); // e.g. "15.10.2026"
        let isoDay = dateObj.toISOString().split('T')[0]; // e.g. "2026-10-15"
        
        if (!dailyData[isoDay]) {
            dailyData[isoDay] = { displayDate: dayStr, totalQtyChange: 0, rawDate: dateObj, records: [] };
        }
        
        let qty = parseFloat(r['Количество']) || 0;
        let op = String(r['Операция'] || '').toUpperCase();
        
        dailyData[isoDay].totalQtyChange += qty;
        dailyData[isoDay].records.push(r);
    });
    
    let sortedDays = Object.keys(dailyData).sort(); // Sort chronological
    currentTimelineData = sortedDays.map(k => dailyData[k]);
    
    let html = '';
    currentTimelineData.forEach((dayObj, index) => {
        let change = dayObj.totalQtyChange;
        let colorClass = change > 0 ? 'var(--success)' : (change < 0 ? 'var(--danger)' : 'var(--text-muted)');
        let sign = change > 0 ? '+' : '';
        let isActive = index === currentTimelineData.length - 1 ? 'active' : ''; // Select last day by default
        
        let uniqueOps = [...new Set(dayObj.records.map(r => r['Операция']).filter(Boolean))].join(', ');
        
        html += `
         <div class="timeline-point ${isActive}" onclick="selectTimeline(this, ${index})" id="timeline-pt-${index}">
           <div class="point-info" style="color:${colorClass}">${sign}${change} бр.</div>
           <div class="point-dot"></div>
           <div class="point-date">
             ${dayObj.displayDate}
             <div style="font-size: 0.75rem; color: var(--text-muted); font-weight: normal; margin-top: 4px;">${uniqueOps}</div>
           </div>
         </div>
        `;
    });
    
    document.getElementById('timelineTrack').innerHTML = html;
    
    // Auto-select the last day
    if (currentTimelineData.length > 0) {
        selectTimeline(document.getElementById(`timeline-pt-${currentTimelineData.length - 1}`), currentTimelineData.length - 1);
    }
}

async function selectTimeline(el, index) {
    if(el) {
        document.querySelectorAll('.timeline-point').forEach(p => p.classList.remove('active'));
        el.classList.add('active');
    }
    
    let dayObj = currentTimelineData[index];
    document.getElementById('selectedDateDisplay').innerText = "Избрана дата: " + dayObj.displayDate;
    
    await renderTree(globalTargetId, dayObj);
}

async function renderTree(targetId, dayObj) {
    // 1. Fetch Current Inventory for Center Node
    let currentStock = 0;
    let invQtyByOp = {};
    let invGpQty = 0;
    
    // Check inventory (WIP and Finished Goods are now both in inventory)
    const { data: invDataRaw } = await fetchAllRows('inventory', 'Количество, Операция, "ID Детайл"', 'ID Детайл', `%${targetId}%`);
    let invData = invDataRaw ? invDataRaw.filter(i => String(i['ID Детайл']).trim().toLowerCase() === targetId.toLowerCase()) : [];
    if (invData && invData.length > 0) {
        invData.forEach(i => {
            let qty = parseFloat(i['Количество']) || 0;
            currentStock += qty;
            let op = String(i['Операция'] || '').trim().toLowerCase();
            if (op === 'готов продукт' || op === '') {
                invGpQty += qty;
            } else {
                invQtyByOp[op] = (invQtyByOp[op] || 0) + qty;
            }
        });
    }
    
    // 2. Fetch BOM where this is parent (Children) - Using 'ID Родител' based on schema
    const { data: childrenRaw } = await fetchAllRows('bom', '*', 'ID Родител', `%${targetId}%`);
    let childrenBOM = childrenRaw ? childrenRaw.filter(b => String(b['ID Родител']).trim().toLowerCase() === targetId.toLowerCase()) : [];
    
    // 3. Fetch BOM where this is child (Parents) - Using 'ID Компонент'
    const { data: parentsRaw } = await fetchAllRows('bom', '*', 'ID Компонент', `%${targetId}%`);
    let parentsBOM = parentsRaw ? parentsRaw.filter(b => String(b['ID Компонент']).trim().toLowerCase() === targetId.toLowerCase()) : [];
    
    // 4. Find which parents have actually been produced (meaning they consumed this component)
    let actualParents = [];
    if (parentsBOM && parentsBOM.length > 0) {
        let parentNames = parentsBOM.map(b => b['ID Родител']).filter(Boolean);
        if (parentNames.length > 0) {
            // Check otcheti if any of these parents were produced
            const { data: producedParents } = await client.from('otcheti')
                .select('ID Детайл')
                .in('ID Детайл', parentNames);
                
            if (producedParents) {
                let producedSet = new Set(producedParents.map(p => String(p['ID Детайл']).toLowerCase()));
                actualParents = parentsBOM.filter(b => producedSet.has(String(b['ID Родител']).toLowerCase()));
            }
        }
    }
    
    // Build UI for Children
    let childrenHtml = '';
    
    // Filter out materials from childrenBOM
    let filteredChildren = [];
    let bomDepthOption = document.getElementById('bomDepthSelect') ? document.getElementById('bomDepthSelect').value : 'all';
    
    if (childrenBOM && childrenBOM.length > 0) {
        // Fetch all routes and all bom parents ONCE to build Sets for robust filtering
        // Order by a common column or just row number to ensure stable pagination
        const { data: allRoutesData } = await fetchAllRows('marshruti', 'Код на детайла', null, null, 'Код на детайла');
        let allRoutes = allRoutesData || [];
        
        const { data: allBomData } = await fetchAllRows('bom', 'ID Родител', null, null, 'ID Родител');
        let allBom = allBomData || [];
        
        // Helper to strip all non-alphanumeric chars (spaces, dots, dashes, parentheses)
        const normalize = s => String(s).toLowerCase().replace(/[^a-zа-я0-9]/g, '');
        
        let routesSet = new Set((allRoutes || []).map(r => normalize(r['Код на детайла'])));
        let bomSet = new Set((allBom || []).map(b => normalize(b['ID Родител'])));

        for (let b of childrenBOM) {
            let originalCode = String(b['ID Компонент']).trim();
            if (!originalCode) continue;
            
            let codeNormalized = normalize(originalCode);
            
            // It is a raw material ONLY if it has no routes AND no bom children
            let isRawMaterial = !routesSet.has(codeNormalized) && !bomSet.has(codeNormalized);
            
            // Fallback for stator packs if spelling differs (пак vs пакет)
            if (isRawMaterial && (codeNormalized.includes('статоренпак') || codeNormalized.includes('статор'))) {
                isRawMaterial = false;
            }
            
            if (bomDepthOption === 'all' || !isRawMaterial) {
                filteredChildren.push(b);
            }
        }
    }
    
    if (filteredChildren.length > 0) {
        filteredChildren.forEach(b => {
            let childName = b['ID Компонент'] || 'Неизвестно';
            let qty = parseFloat(b['Количество']) || 1;
            
            // To be replaced below after statsByOp calculation
            childrenHtml += `
              <div class="node child-node-placeholder" data-child="${childName}" data-norm="${qty}">
                <div class="node-header" title="${childName}" style="border-top: 3px solid #10b981; background: linear-gradient(180deg, rgba(16,185,129,0.1) 0%, transparent 100%);">${childName}</div>
                <div class="node-body">
                  <div class="node-stat" style="color:var(--text-main); font-size: 1.1rem;">${qty} бр.</div>
                  <div class="node-sub">Норма (BOM)</div>
                  <!-- DYNAMIC_CONSUMED_PLACEHOLDER -->
                </div>
              </div>
            `;
        });
    } else {
        childrenHtml = `<div style="color:var(--text-muted); font-style:italic;">Няма вложени полуфабрикати</div>`;
    }
    
    // Build UI for Parents (or Operations Pipeline)
    let centerHtml = '';
    let parentsHtml = '';
    let rightSpacerHtml = '';

    let sortedRoutes = [];
    const { data: routesRaw } = await fetchAllRows('marshruti', '*', 'Код на детайла', `%${targetId}%`);
    let routesData = routesRaw ? routesRaw.filter(r => String(r['Код на детайла']).trim().toLowerCase() === targetId.toLowerCase()) : null;
    if (routesData && routesData.length > 0) {
        sortedRoutes = routesData.sort((a, b) => parseInt(a['№ Операция']) - parseInt(b['№ Операция']));
    }
    
    // 1.5 Time Machine (Historical Inventory Calculator)
    let isHistorical = false;
    if (dayObj && currentTimelineData && currentTimelineData.length > 0) {
        let selectedIndex = currentTimelineData.indexOf(dayObj);
        let isLastDay = (selectedIndex === currentTimelineData.length - 1);
        
        if (!isLastDay && selectedIndex !== -1 && sortedRoutes.length > 0) {
            isHistorical = true;
            let opList = sortedRoutes.map(x => String(x['Име на операция'] || '').trim().toLowerCase());
            
            // Revert all transactions that happened AFTER the selected day
            for (let i = selectedIndex + 1; i < currentTimelineData.length; i++) {
                let futureDay = currentTimelineData[i];
                if (futureDay && futureDay.records) {
                    futureDay.records.forEach(r => {
                        let q = parseFloat(r['Количество']) || 0;
                        let op = String(r['Операция'] || '').trim().toLowerCase();
                        let st = String(r['Статус'] || '').trim().toLowerCase();
                        
                        if (st === 'отчетено' || st === 'завършено') {
                            let opIdx = opList.indexOf(op);
                            if (opIdx > 0) {
                                let prevOp = opList[opIdx - 1];
                                invQtyByOp[prevOp] = (invQtyByOp[prevOp] || 0) + q;
                            }
                            
                            let isLastOp = (opIdx === opList.length - 1);
                            if (isLastOp) {
                                invGpQty -= q;
                            } else {
                                invQtyByOp[op] = (invQtyByOp[op] || 0) - q;
                            }
                        }
                    });
                }
            }
        }
    }

    // Calculate Day stats per Operation
    let statsByOp = {};
    if (dayObj && dayObj.records) {
        let opList = sortedRoutes.map(x => String(x['Име на операция'] || '').trim().toLowerCase());
        dayObj.records.forEach(r => {
            let q = parseFloat(r['Количество']) || 0;
            let op = String(r['Операция'] || '').trim().toLowerCase();
            if (!statsByOp[op]) statsByOp[op] = { prod: 0, scrap: 0, other: 0, consumed: 0 };
            
            let st = String(r['Статус'] || '').trim().toLowerCase();
            if (st === 'отчетено' || st === 'завършено') {
                statsByOp[op].prod += q;
                // Deduct from previous operation
                let opIdx = opList.indexOf(op);
                if (opIdx > 0) {
                    let prevOp = opList[opIdx - 1];
                    if (!statsByOp[prevOp]) statsByOp[prevOp] = { prod: 0, scrap: 0, other: 0, consumed: 0 };
                    statsByOp[prevOp].consumed += q;
                }
            }
            else if (st === 'брак') statsByOp[op].scrap += Math.abs(q);
            else statsByOp[op].other += q;
        });
    }

    // Helper to generate day stats HTML for a specific operation
    function getDayStatsHtmlForOp(opName) {
        if (!dayObj) return `<div class="node-sub" style="margin-top:8px; border-top: 1px dashed var(--border-color); padding-top: 8px;">Изберете дата</div>`;
        
        let opKey = String(opName).trim().toLowerCase();
        let st = statsByOp[opKey];
        if (!st) {
            return `<div class="node-sub" style="margin-top:8px; border-top: 1px dashed var(--border-color); padding-top: 8px;">Няма движения за деня</div>`;
        }
        
        let consumedHtml = st.consumed > 0 ? `<span style="color:var(--danger)" title="Вложени в следваща операция">🔻 -${st.consumed}</span>` : '';
        let prodHtml = st.prod > 0 ? `<span style="color:var(--success)" title="Произведени">🟢 +${st.prod}</span>` : '';
        let scrapHtml = st.scrap > 0 ? `<span style="color:var(--danger)" title="Бракувани">🔴 -${st.scrap}</span>` : '';
        let otherHtml = st.other > 0 ? `<span style="color:var(--warning)" title="Изписани / Трансферирани">🟡 ${st.other}</span>` : '';
        
        return `
            <div style="font-size: 0.85rem; display:flex; justify-content: space-around; margin-top:8px; padding-top: 8px; border-top: 1px dashed var(--border-color);">
               ${consumedHtml} ${prodHtml} ${scrapHtml} ${otherHtml}
            </div>
            <div class="node-sub" style="margin-top:4px;">На: ${dayObj.displayDate}</div>
        `;
    }
    
    // Replace children placeholders with consumed calculation for the day
    let maxProduced = 0;
    for (let k in statsByOp) {
        if (statsByOp[k].prod > maxProduced) maxProduced = statsByOp[k].prod;
    }
    // If no specific operations matched, we can fall back to the totalQtyChange if it's positive
    if (maxProduced === 0 && dayObj && dayObj.totalQtyChange > 0) {
        maxProduced = dayObj.totalQtyChange;
    }
    
    // Inject consumed HTML into children string
    if (filteredChildren.length > 0) {
        let newChildrenHtml = '';
        filteredChildren.forEach(b => {
            let childName = b['ID Компонент'] || 'Неизвестно';
            let norm = parseFloat(b['Количество']) || 1;
            
            let consumedHtml = '';
            if (dayObj) {
                let consumedToday = maxProduced * norm;
                consumedHtml = `
                  <div style="margin-top: 8px; padding-top: 8px; border-top: 1px dashed var(--border-color);">
                    <div style="font-size: 0.85rem; color: var(--text-muted);">Вложени (за деня)</div>
                    <div style="color: var(--danger); font-weight: bold; font-size: 1.1rem;">-${consumedToday} бр.</div>
                  </div>
                `;
            } else {
                 consumedHtml = `
                  <div style="margin-top: 8px; padding-top: 8px; border-top: 1px dashed var(--border-color);">
                    <div style="font-size: 0.85rem; color: var(--text-muted);">Вложени (за деня)</div>
                    <div style="color: var(--text-muted); font-size: 0.9rem;">Изберете дата</div>
                  </div>
                `;
            }
            
            newChildrenHtml += `
              <div class="node">
                <div class="node-header" title="${childName}" style="border-top: 3px solid #10b981; background: linear-gradient(180deg, rgba(16,185,129,0.1) 0%, transparent 100%);">${childName}</div>
                <div class="node-body">
                  <div class="node-stat" style="color:var(--text-main); font-size: 1.1rem;">${norm} бр.</div>
                  <div class="node-sub">Норма (BOM)</div>
                  ${consumedHtml}
                </div>
              </div>
            `;
        });
        childrenHtml = newChildrenHtml;
    }

    if (actualParents.length > 0) {
        // Standard view: Target in Center, Parents on Right
        let centerStats = getDayStatsHtmlForOp(''); // Try to get generic/blank stats for center if any
        centerHtml = `
          <div class="node-col">
            <div class="node main-node">
              <div class="node-header">${targetId.toUpperCase()}</div>
              <div class="node-body" style="padding-bottom: 8px;">
                <div class="node-stat" style="color: var(--primary);" title="Обща наличност в момента">${currentStock} бр.</div>
                <div class="node-sub" style="border-bottom: 1px solid var(--border-color); padding-bottom: 8px; margin-bottom: 4px;">Текущ склад</div>
                ${centerStats}
              </div>
            </div>
          </div>
        `;
        
        rightSpacerHtml = `
          <div class="node-spacer">
            <div class="connection-line"><div class="line-label" style="color:var(--primary)">Влагане</div></div>
          </div>
        `;
        
        let pNodes = '';
        actualParents.forEach(b => {
            let pName = b['ID Родител'] || 'Неизвестно';
            pNodes += `
              <div class="node">
                <div class="node-header" title="${pName}" style="border-top: 3px solid #ef4444; background: linear-gradient(180deg, rgba(239,68,68,0.1) 0%, transparent 100%);">${pName}</div>
                <div class="node-body">
                  <div class="node-stat" style="color:var(--text-main); font-size: 1.1rem;">Вложен в</div>
                  <div class="node-sub">Реално изработен</div>
                </div>
              </div>
            `;
        });
        parentsHtml = `<div class="node-col">${pNodes}</div>`;
    } else {
        // Pipeline view: First Op in Center, Rest Ops on Right
        if (sortedRoutes.length > 0) {
            let firstOp = sortedRoutes[0];
            let firstOpName = firstOp['Име на операция'] || 'Оп. 10';
            let firstOpKey = String(firstOpName).trim().toLowerCase();
            let firstOpQty = invQtyByOp[firstOpKey] || 0;
            
            if (sortedRoutes.length === 1) {
                firstOpQty += invGpQty; // If only 1 route, it's the last op
            }
            
            centerHtml = `
              <div class="node-col">
                <div class="node main-node">
                  <div class="node-header">${targetId.toUpperCase()}</div>
                  <div class="node-body" style="padding-bottom: 8px;">
                    <div class="node-stat" style="color: var(--warning);" title="Налични на тази операция">${firstOpQty} бр.</div>
                    <div class="node-sub" style="border-bottom: 1px solid var(--border-color); padding-bottom: 8px; margin-bottom: 4px; font-weight:bold; color:var(--text-main); font-size:1rem;">${isHistorical ? 'Ист. наличност: ' : ''}${firstOpName}</div>
                    ${getDayStatsHtmlForOp(firstOpName)}
                  </div>
                </div>
              </div>
            `;
            
            if (sortedRoutes.length > 1) {
                rightSpacerHtml = `
                  <div class="node-spacer" style="margin: 0 10px;">
                    <div class="connection-line"><div class="line-label" style="color:var(--primary)">Към следваща</div></div>
                  </div>
                `;
                
                let subsequentOps = '';
                for (let i = 1; i < sortedRoutes.length; i++) {
                    let opName = sortedRoutes[i]['Име на операция'] || `Оп. ${i*10+10}`;
                    let opKey = String(opName).trim().toLowerCase();
                    let opQty = invQtyByOp[opKey] || 0;
                    
                    let isLastOp = (i === sortedRoutes.length - 1);
                    if (isLastOp) {
                        opQty += invGpQty; // Add finished goods to the last operation
                    }
                    
                    if (i > 1) {
                        subsequentOps += `
                          <div class="node-spacer" style="margin: 0 10px;">
                            <div class="connection-line"></div>
                          </div>
                        `;
                    }
                    
                    subsequentOps += `
                      <div class="node" style="border-style: dashed; border-color: var(--border-color); width:200px;">
                        <div class="node-header" title="${opName}" style="border-top: 3px solid #f59e0b; background: linear-gradient(180deg, rgba(245,158,11,0.1) 0%, transparent 100%);">${opName}</div>
                        <div class="node-body" style="padding-bottom: 8px;">
                          <div class="node-stat" style="color:var(--warning); font-size: 1.1rem;">${opQty} бр.</div>
                          <div class="node-sub" style="border-bottom: 1px solid var(--border-color); padding-bottom: 8px; margin-bottom: 4px;">${isHistorical ? 'Историческа ' : ''}Налични${isLastOp ? ' (и завършени)' : ''}</div>
                          ${getDayStatsHtmlForOp(opName)}
                        </div>
                      </div>
                    `;
                }
                
                parentsHtml = `<div class="node-col" style="flex-direction: row; align-items: center; justify-content: flex-start; gap: 0;">${subsequentOps}</div>`;
            }
        } else {
            // No routes at all
            let genericStats = getDayStatsHtmlForOp('');
            centerHtml = `
              <div class="node-col">
                <div class="node main-node">
                  <div class="node-header">${targetId.toUpperCase()}</div>
                  <div class="node-body" style="padding-bottom: 8px;">
                    <div class="node-stat" style="color: var(--accent);">${currentStock} бр.</div>
                    <div class="node-sub" style="border-bottom: 1px solid var(--border-color); padding-bottom: 8px; margin-bottom: 4px;">Склад (Няма маршрут)</div>
                    ${genericStats}
                  </div>
                </div>
              </div>
            `;
        }
    }

    document.getElementById('treeWrapper').innerHTML = `
        <!-- CHILDREN (Left) -->
        <div class="node-col">
          ${childrenHtml}
        </div>

        <div class="node-spacer">
          ${childrenHtml !== '<div style="color:var(--text-muted); font-style:italic;">Няма вложени полуфабрикати</div>' 
            ? `<div class="connection-line"><div class="line-label" style="color:var(--text-muted)">Сглобяване</div></div>`
            : `<div class="connection-line" style="opacity:0.3"></div>`
          }
        </div>

        <!-- TARGET (CENTER) -->
        ${centerHtml}

        ${rightSpacerHtml}

        <!-- PARENTS OR PIPELINE (Right) -->
        ${parentsHtml}
      `;
}
