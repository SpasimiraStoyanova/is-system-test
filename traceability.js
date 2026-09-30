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
    // Query marshruti
    const { data, error } = await client.from('marshruti')
        .select('*')
        .ilike('Код на детайла', `%${targetId}%`)
        .neq('Статус', 'Готово')
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
        let opName = task['Операция'] || 'Неизвестна';
        let planId = task['План ID'] || task['ID План'] || '-';
        let qty = parseFloat(task['Количество']) || 0;
        let done = parseFloat(task['Изработено']) || 0;
        let left = qty - done;
        if(left < 0) left = 0;
        
        html += `
        <div class="task-card">
          <div class="task-title">Опер: ${opName}</div>
          <div class="task-stats">
            <span>Остават: <b style="color:var(--primary)">${left} бр.</b> (от ${qty})</span>
            <span>План: #${planId}</span>
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
    // A child is a raw material if it has no children of its own AND no routing operations
    let filteredChildren = childrenBOM || [];
    if (childrenBOM && childrenBOM.length > 0) {
        let childNames = childrenBOM.map(b => b['ID Компонент']).filter(Boolean);
        if (childNames.length > 0) {
            const { data: subBom } = await client.from('bom').select('ID Родител').in('ID Родител', childNames);
            let hasChildrenSet = new Set((subBom || []).map(b => String(b['ID Родител']).trim().toLowerCase()));
            
            const { data: subRoutes } = await client.from('marshruti').select('Код на детайла').in('Код на детайла', childNames);
            let hasRoutesSet = new Set((subRoutes || []).map(r => String(r['Код на детайла']).trim().toLowerCase()));
            
            filteredChildren = childrenBOM.filter(b => {
                let code = String(b['ID Компонент']).trim().toLowerCase();
                let isRawMaterial = !hasChildrenSet.has(code) && !hasRoutesSet.has(code);
                return !isRawMaterial;
            });
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
    
    // Build UI for Parents (or Operations)
    let parentsHtml = '';
    if (actualParents.length > 0) {
        // Show the actual parents it was put into
        actualParents.forEach(b => {
            let pName = b['ID Родител'] || 'Неизвестно';
            parentsHtml += `
              <div class="node">
                <div class="node-header" title="${pName}">${pName}</div>
                <div class="node-body">
                  <div class="node-stat" style="color:var(--text-main); font-size: 1.1rem;">Вложен в</div>
                  <div class="node-sub">Реално изработен</div>
                </div>
              </div>
            `;
        });
    } else {
        // No actual parents yet, so show the routing operations and WIP quantities
        const { data: routes } = await client.from('marshruti').select('*').ilike('Код на детайла', `%${targetId}%`);
        let sortedRoutes = (routes || []).sort((a, b) => parseInt(a['№ Операция']) - parseInt(b['№ Операция']));
        
        if (sortedRoutes.length > 0) {
            sortedRoutes.forEach(r => {
                let opName = r['Име на операция'] || 'Неизвестна';
                let opKey = String(opName).trim().toLowerCase();
                let opQty = invQtyByOp[opKey] || 0;
                
                parentsHtml += `
                  <div class="node" style="border-style: dashed;">
                    <div class="node-header" title="${opName}">${opName}</div>
                    <div class="node-body">
                      <div class="node-stat" style="color:var(--warning); font-size: 1.1rem;">${opQty} бр.</div>
                      <div class="node-sub">Налични на операция</div>
                    </div>
                  </div>
                `;
            });
            // Add Готов продукт at the end
            parentsHtml += `
                  <div class="node" style="border-style: solid; border-color: var(--success);">
                    <div class="node-header" title="Готов продукт">Готов продукт</div>
                    <div class="node-body">
                      <div class="node-stat" style="color:var(--success); font-size: 1.1rem;">${invGpQty} бр.</div>
                      <div class="node-sub">Завършени (Склад)</div>
                    </div>
                  </div>
                `;
        } else {
            parentsHtml = `
              <div class="node" style="border-style: dashed;">
                <div class="node-header" title="Склад">Склад</div>
                <div class="node-body">
                  <div class="node-stat" style="color:var(--warning); font-size: 1.1rem;">${currentStock} бр.</div>
                  <div class="node-sub">Няма маршрутна карта</div>
                </div>
              </div>
            `;
        }
    }

    // Determine Day stats
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
        // If no day is selected but we have stock
        dayStatsHtml = `<div class="node-sub" style="margin-top:8px; border-top: 1px dashed var(--border-color); padding-top: 8px;">Изберете дата от хронологията</div>`;
    }

    document.getElementById('treeWrapper').innerHTML = `
        <!-- CHILDREN (Left) -->
        <div class="node-col">
          ${childrenHtml}
        </div>

        <div class="node-spacer">
          <div class="connection-line"><div class="line-label" style="color:var(--text-muted)">Сглобяване</div></div>
        </div>

        <!-- TARGET (CENTER) -->
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

        <div class="node-spacer">
          <div class="connection-line"><div class="line-label" style="color:var(--primary)">Влагане</div></div>
        </div>

        <!-- PARENTS (Right) -->
        <div class="node-col">
          ${parentsHtml}
        </div>
      `;
}
