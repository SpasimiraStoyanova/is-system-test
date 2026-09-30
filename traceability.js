// traceability.js

document.getElementById('searchInput').addEventListener('keypress', function(e) {
  if(e.key === 'Enter') startSearch();
});

let globalTargetId = '';
let currentTimelineData = [];

async function startSearch() {
  const input = document.getElementById('searchInput').value.trim();
  if (!input) {
    Swal.fire({icon: 'warning', title: 'Празно поле', text: 'Моля, въведете детайл!', confirmButtonColor: '#3b82f6'});
    return;
  }
  
  globalTargetId = input;
  document.getElementById('lblTargetId').innerText = input;
  
  // Show loading states
  document.getElementById('tasksContainer').innerHTML = '<div style="text-align:center; padding: 20px; color: var(--text-muted);">Зареждане на задачи... ⏳</div>';
  document.getElementById('timelineTrack').innerHTML = '<div style="color:var(--text-muted); margin: 0 auto;">Зареждане на хронология... ⏳</div>';
  document.getElementById('treeWrapper').innerHTML = '<div style="color: var(--text-muted); font-size: 1.2rem;">Зареждане на дървото... ⏳</div>';
  
  try {
    // 1. Fetch tasks
    fetchTasks(input);
    
    // 2. Fetch timeline from otcheti
    await fetchTimeline(input);
    
  } catch(e) {
    console.error(e);
    Swal.fire('Грешка', 'Възникна грешка при зареждането на данните.', 'error');
  }
}

async function fetchTasks(targetId) {
    // Query plan
    const { data, error } = await client.from('plan')
        .select('*')
        .ilike('ID Детайл', `%${targetId}%`)
        .eq('Статус', 'Активен')
        .order('id', {ascending: false})
        .limit(50);
        
    let container = document.getElementById('tasksContainer');
    if (error) {
        container.innerHTML = `<div style="color:var(--danger); padding:10px;">Грешка при зареждане на задачи: ${error.message}</div>`;
        return;
    }
    if (!data || data.length === 0) {
        container.innerHTML = `<div style="text-align:center; color:var(--text-muted); margin-top: 20px;">Няма активни задачи за този детайл.</div>`;
        return;
    }
    
    let html = '';
    data.forEach(task => {
        let month = task['Месец'] || '';
        let year = task['Година'] || '';
        let planId = task['id'] || '-';
        let qty = parseFloat(task['Целево количество']) || 0;
        
        html += `
        <div class="task-card">
          <div class="task-title">План: ${month} ${year}</div>
          <div class="task-stats">
            <span>Целево количество: <b style="color:var(--primary)">${qty} бр.</b></span>
            <span>ID: #${planId}</span>
          </div>
        </div>`;
    });
    container.innerHTML = html;
}

async function fetchTimeline(targetId) {
    const { data, error } = await client.from('otcheti')
        .select('*')
        .ilike('ID Детайл', `%${targetId}%`)
        .order('Дата', {ascending: true});
        
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
        
        html += `
         <div class="timeline-point ${isActive}" onclick="selectTimeline(this, ${index})" id="timeline-pt-${index}">
           <div class="point-info" style="color:${colorClass}">${sign}${change} бр.</div>
           <div class="point-dot"></div>
           <div class="point-date">${dayObj.displayDate}</div>
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
    const { data: invData } = await client.from('inventory').select('Количество, Операция').ilike('ID Детайл', `%${targetId}%`);
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
    const { data: childrenBOM } = await client.from('bom').select('*').ilike('ID Родител', `%${targetId}%`);
    
    // 3. Fetch BOM where this is child (Parents) - Using 'ID Компонент'
    const { data: parentsBOM } = await client.from('bom').select('*').ilike('ID Компонент', `%${targetId}%`);
    
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
    if (childrenBOM && childrenBOM.length > 0) {
        // Fetch all routes and all bom parents ONCE to build Sets for robust filtering
        const { data: allRoutes } = await client.from('marshruti').select('Код на детайла');
        const { data: allBom } = await client.from('bom').select('ID Родител');
        
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
            
            if (!isRawMaterial) {
                filteredChildren.push(b);
            }
        }
    }
    
    if (filteredChildren.length > 0) {
        filteredChildren.forEach(b => {
            let childName = b['ID Компонент'] || 'Неизвестно';
            let qty = parseFloat(b['Количество']) || 1;
            childrenHtml += `
              <div class="node">
                <div class="node-header" title="${childName}">${childName}</div>
                <div class="node-body">
                  <div class="node-stat" style="color:var(--text-main); font-size: 1.1rem;">${qty} бр.</div>
                  <div class="node-sub">Норма (BOM)</div>
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

    // Determine Day stats for Center Node
    let dayStatsHtml = `<div class="node-sub">Няма движения за деня</div>`;
    if (dayObj) {
        let prod = 0; let scrap = 0; let other = 0;
        dayObj.records.forEach(r => {
            let q = parseFloat(r['Количество']) || 0;
            let op = String(r['Операция'] || '').toUpperCase();
            
            if (op === 'БРАК') {
                scrap += Math.abs(q);
            } else if (q > 0) {
                prod += q;
            } else {
                other += q;
            }
        });
        dayStatsHtml = `
            <div style="font-size: 0.85rem; display:flex; justify-content: space-around; margin-top:8px; padding-top: 8px; border-top: 1px dashed var(--border-color);">
               <span style="color:var(--success)" title="Произведени / Добавени">🟢 +${prod}</span>
               <span style="color:var(--danger)" title="Бракувани">🔴 -${scrap}</span>
               <span style="color:var(--warning)" title="Изписани / Трансферирани">🟡 ${other}</span>
            </div>
            <div class="node-sub" style="margin-top:4px;">Движения на: ${dayObj.displayDate}</div>
        `;
    } else {
        dayStatsHtml = `<div class="node-sub" style="margin-top:8px; border-top: 1px dashed var(--border-color); padding-top: 8px;">Изберете дата от хронологията</div>`;
    }

    if (actualParents.length > 0) {
        // Standard view: Target in Center, Parents on Right
        centerHtml = `
          <div class="node-col">
            <div class="node main-node">
              <div class="node-header">${targetId.toUpperCase()}</div>
              <div class="node-body" style="padding-bottom: 8px;">
                <div class="node-stat" style="color: var(--primary);" title="Обща наличност в момента">${currentStock} бр.</div>
                <div class="node-sub" style="border-bottom: 1px solid var(--border-color); padding-bottom: 8px; margin-bottom: 4px;">Текущ склад</div>
                ${dayStatsHtml}
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
                <div class="node-header" title="${pName}">${pName}</div>
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
        const { data: routes } = await client.from('marshruti').select('*').ilike('Код на детайла', `%${targetId}%`);
        let sortedRoutes = (routes || []).sort((a, b) => parseInt(a['№ Операция']) - parseInt(b['№ Операция']));
        
        if (sortedRoutes.length > 0) {
            let firstOp = sortedRoutes[0];
            let firstOpName = firstOp['Име на операция'] || 'Оп. 10';
            let firstOpKey = String(firstOpName).trim().toLowerCase();
            let firstOpQty = invQtyByOp[firstOpKey] || 0;
            
            centerHtml = `
              <div class="node-col">
                <div class="node main-node">
                  <div class="node-header">${targetId.toUpperCase()}</div>
                  <div class="node-body" style="padding-bottom: 8px;">
                    <div class="node-stat" style="color: var(--warning);" title="Налични на тази операция">${firstOpQty} бр.</div>
                    <div class="node-sub" style="border-bottom: 1px solid var(--border-color); padding-bottom: 8px; margin-bottom: 4px; font-weight:bold; color:var(--text-main); font-size:1rem;">${firstOpName}</div>
                    ${dayStatsHtml}
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
                    
                    if (i > 1) {
                        subsequentOps += `
                          <div class="node-spacer" style="margin: 0 10px;">
                            <div class="connection-line"></div>
                          </div>
                        `;
                    }
                    
                    subsequentOps += `
                      <div class="node" style="border-style: dashed; border-color: var(--border-color); width:180px;">
                        <div class="node-header" title="${opName}">${opName}</div>
                        <div class="node-body">
                          <div class="node-stat" style="color:var(--warning); font-size: 1.1rem;">${opQty} бр.</div>
                          <div class="node-sub">Налични</div>
                        </div>
                      </div>
                    `;
                }
                parentsHtml = `<div class="node-col" style="flex-direction: row; align-items: center; justify-content: flex-start; gap: 0;">${subsequentOps}</div>`;
            }
        } else {
            // No routes at all
            centerHtml = `
              <div class="node-col">
                <div class="node main-node">
                  <div class="node-header">${targetId.toUpperCase()}</div>
                  <div class="node-body" style="padding-bottom: 8px;">
                    <div class="node-stat" style="color: var(--accent);">${currentStock} бр.</div>
                    <div class="node-sub" style="border-bottom: 1px solid var(--border-color); padding-bottom: 8px; margin-bottom: 4px;">Склад (Няма маршрут)</div>
                    ${dayStatsHtml}
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
