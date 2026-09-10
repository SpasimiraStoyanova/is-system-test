const SUPABASE_URL = 'https://zdythzcgcjxwbxufunuh.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpkeXRoemNnY2p4d2J4dWZ1bnVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA2MTcxNTMsImV4cCI6MjA5NjE5MzE1M30.XGZX5DHhJCGz9X5s__3iuSghukjanyJmGKv8MLig_jE';
const client = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let staticCache = {
    isLoaded: false,
    bomData: [],
    routesData: [],
    nomData: [],
    nomMap: {},
    routesByDetail: {},
    bomChildrenMap: {}
};

let globalState = {
    checkedIn: [],
    targetItems: [],
    quotas: [],
    otcheti: []
};

window.onload = async function() {
    const datePicker = document.getElementById('date-picker');
    if (datePicker) {
        datePicker.value = getTodayString();
        datePicker.addEventListener('change', loadData);
    }
    await initialFetch();
    loadData();
    setInterval(loadData, 15000); 
};

function getTodayString() {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

async function fetchAll(table, orderCol) {
    let allData = [];
    let from = 0;
    const step = 1000;
    while(true) {
        let query = client.from(table).select('*').range(from, from + step - 1);
        if (orderCol) query = query.order(orderCol, {ascending: true});
        let { data, error } = await query;
        if (error || !data || data.length === 0) break;
        allData = allData.concat(data);
        if (data.length < step) break;
        from += step;
    }
    return { data: allData };
}

async function initialFetch() {
    try {
        const [bomRes, routesRes, nomRes] = await Promise.all([
            fetchAll('bom'),
            fetchAll('marshruti'),
            fetchAll('Номенклатура')
        ]);

        staticCache.bomData = bomRes.data || [];
        staticCache.routesData = routesRes.data || [];
        staticCache.nomData = nomRes.data || [];

        staticCache.nomData.forEach(n => {
            if (n['ID Детайл']) staticCache.nomMap[String(n['ID Детайл']).trim().toLowerCase()] = n;
        });

        staticCache.routesData.forEach(r => {
            let code = String(r['Код на детайла']).trim().toLowerCase();
            if(!staticCache.routesByDetail[code]) staticCache.routesByDetail[code] = [];
            staticCache.routesByDetail[code].push(r);
        });

        let bomDataSorted = staticCache.bomData.sort((a, b) => String(a['ID Компонент']).localeCompare(String(b['ID Компонент'])));
        bomDataSorted.forEach(b => {
            let p = String(b['ID Родител']).trim().toLowerCase();
            if(!staticCache.bomChildrenMap[p]) staticCache.bomChildrenMap[p] = [];
            staticCache.bomChildrenMap[p].push(b);
        });

        staticCache.isLoaded = true;
    } catch (err) {
        console.error("Грешка при зареждане на справочници: " + err.message);
    }
}

let firstLoad = true;

async function loadData() {
    if (!staticCache.isLoaded) return;
    
    if (firstLoad) {
        document.getElementById('loading').style.display = 'flex';
        document.getElementById('main-layout').style.display = 'none';
    }

    try {
        const selectedDateStr = document.getElementById('date-picker').value;
        let nextDay = new Date(selectedDateStr);
        nextDay.setDate(nextDay.getDate() + 1);
        const nextDayStr = nextDay.toISOString().split('T')[0];

        // Fetch Plans (Active only)
        const plansRes = await client.from('plan').select('*').in('Статус', ['Активен', 'Опакован']); // Assuming active
        // Fetch checkins for the selected date
        const checkinRes = await client.from('chekiraniya').select('*').gte('Време', selectedDateStr + 'T00:00:00').lt('Време', nextDayStr + 'T00:00:00');
        // Fetch otcheti for these operations (to calculate progress)
        const otchetiRes = await client.from('otcheti').select('*').eq('Статус', 'Отчетено');
        // Fetch quotas
        const quotasRes = await client.from('planner_bobini').select('*').eq('date', selectedDateStr);

        // Fetch personal to filter by department and map emails
        const personalRes = await client.from('personal').select('Име, Имейл, Длъжност').eq('Статус', 'Активен');
        let personalData = personalRes.data || [];
        
        let emailToName = {};
        let validNames = new Set();

        personalData.forEach(p => {
            let name = String(p['Име'] || '').trim();
            let email = String(p['Имейл'] || '').trim().toLowerCase();
            if (email && name) emailToName[email] = name;
            
            if (p['Длъжност'] && p['Длъжност'].toLowerCase().includes('бобин') && name) {
                validNames.add(name);
            }
        });

        let activePlans = plansRes.data || [];
        
        let chekiraniyaData = checkinRes.data || [];
        globalState.otcheti = otchetiRes.data || [];
        globalState.quotas = quotasRes.data || [];

        // Build list of checked in operators
        let present = new Set();
        chekiraniyaData.forEach(r => {
            let email = String(r['Имейл'] || '').trim().toLowerCase();
            let nameFromRow = String(r['Име'] || '').trim();
            let name = nameFromRow || emailToName[email];
            
            if (name && validNames.has(name)) present.add(name);
        });
        globalState.checkedIn = Array.from(present).sort();

        let allTasks = await generateTerminalTasks(client);
        
        let filteredTargetNodes = {};
        
        if (allTasks) {
            allTasks.forEach(t => {
                let name = String(t.internalName || '').toLowerCase().trim();
                if (!name) name = String(t.name || '').toLowerCase().trim();
                
                let isStator = name.includes('статор') && !name.includes('пак');
                let isRotor = name.includes('ротор');
                let isTransformer = name.includes('трансформатор');
                let isToroid = name.includes('тороид');

                if (isStator || isRotor || isTransformer || isToroid) {
                    let op = String(t.op || '').toLowerCase().trim();
                    let isValidOp = false;
                    
                    if (isStator && op.includes('навиване')) isValidOp = true;
                    if (isRotor && (op.includes('навиване') || op.includes('спояване'))) isValidOp = true;
                    if ((isTransformer || isToroid) && (op.includes('навиване') || op.includes('спояване'))) isValidOp = true;
                    
                    if (isValidOp) {
                        let key = t.name + "___" + t.op;
                        if (!filteredTargetNodes[key]) {
                            filteredTargetNodes[key] = {
                                detailName: t.name,
                                operationName: t.op,
                                planQty: 0,
                                totalDone: 0,
                                isBlocked: true,
                                availableQty: 0
                            };
                        }
                        
                        filteredTargetNodes[key].planQty += t.totalNeed;
                        filteredTargetNodes[key].totalDone += t.totalDone;
                        
                        if (!t.isBlocked) {
                            filteredTargetNodes[key].isBlocked = false;
                            filteredTargetNodes[key].availableQty += t.totalNeed;
                        }
                    }
                }
            });
        }
        
        globalState.targetItems = Object.values(filteredTargetNodes);
        globalState.targetItems.sort((a,b) => a.detailName.localeCompare(b.detailName));
        renderKanbanUI();

        if (firstLoad) {
            document.getElementById('loading').style.display = 'none';
            document.getElementById('main-layout').style.display = 'flex';
            firstLoad = false;
        }

    } catch(err) {
        console.error(err);
        document.getElementById('loading').innerHTML = '<div style="color:red;">Грешка при зареждане.</div>';
    }
}

let currentDragTask = null;
let currentDropOperator = null;

function renderKanbanUI() {
    // 1. Render Task Pool (Left Sidebar)
    let poolHtml = '';
    globalState.targetItems.forEach(item => {
        let completedQty = item.totalDone || 0;
        let remaining = item.planQty || 0;
        
        let dailyPace = 0;
        globalState.quotas.forEach(q => {
            if (q.detail_name === item.detailName && q.operation_name === item.operationName) {
                dailyPace += q.qty;
            }
        });

        poolHtml += `
            <div class="task-card" draggable="true" ondragstart="dragStart(event, '${item.detailName}', '${item.operationName}')">
                <div class="task-card-title">${item.detailName}</div>
                <div class="task-card-op">${item.operationName}</div>
                <div class="task-stat"><span style="color:#94a3b8">Остават:</span> <strong>${remaining} бр.</strong></div>
                <div class="task-stat"><span style="color:#94a3b8">Налични:</span> <strong style="color:#f59e0b">${item.availableQty} бр.</strong></div>
                <div class="task-stat" style="margin-top:5px; padding-top:5px; border-top:1px solid #475569;"><span style="color:#94a3b8">Темпо днес:</span> <strong style="color:#38bdf8">${dailyPace} бр./ден</strong></div>
            </div>
        `;
    });
    if(globalState.targetItems.length === 0) {
        poolHtml = '<div style="color:#94a3b8; text-align:center;">Няма заредени статори/ротори.</div>';
    }
    document.getElementById('w-task-pool').innerHTML = poolHtml;

    // 2. Render Operator Columns
    let boardHtml = '';
    if (globalState.checkedIn.length === 0) {
        boardHtml = '<div style="color:#94a3b8; padding:20px;">Няма чекирани оператори днес.</div>';
    } else {
        globalState.checkedIn.forEach(opName => {
            let existingQuotas = globalState.quotas.filter(q => q.operator_name === opName);
            let totalQty = existingQuotas.reduce((sum, q) => sum + q.qty, 0);

            boardHtml += `
                <div class="operator-column">
                    <div class="operator-header">👤 ${opName} <br><span style="font-size:0.8em; font-weight:normal; color:#e2e8f0;">Общо за деня: ${totalQty} бр.</span></div>
                    <div class="operator-body" ondragover="allowDrop(event)" ondrop="drop(event, '${opName}')" ondragenter="dragEnter(event)" ondragleave="dragLeave(event)">
            `;
            
            existingQuotas.forEach(q => {
                boardHtml += `
                    <div class="assigned-card">
                        <div style="font-weight:bold; color:#f8fafc; font-size:0.95em;">${q.detail_name}</div>
                        <div style="color:#94a3b8; font-size:0.8em; margin-bottom:5px;">${q.operation_name}</div>
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <strong style="color:#10b981; font-size:1.1em;">${q.qty} бр.</strong>
                            <button onclick="deleteQuota('${q.id}')" style="background:#ef4444; border:none; padding:4px 8px; border-radius:4px; color:white; cursor:pointer;">X</button>
                        </div>
                    </div>
                `;
            });

            boardHtml += `
                    </div>
                </div>
            `;
        });
    }
    document.getElementById('w-kanban-board').innerHTML = boardHtml;
}

// Drag & Drop Handlers
function dragStart(e, detailName, operationName) {
    currentDragTask = { detailName, operationName };
    e.dataTransfer.setData('text/plain', detailName); 
}
function allowDrop(e) {
    e.preventDefault();
}
function dragEnter(e) {
    e.preventDefault();
    e.currentTarget.classList.add('drag-over');
}
function dragLeave(e) {
    e.currentTarget.classList.remove('drag-over');
}
function drop(e, operatorName) {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');
    
    if (!currentDragTask) return;
    
    currentDropOperator = operatorName;
    
    document.getElementById('modal-task-title').innerText = currentDragTask.detailName;
    document.getElementById('modal-task-op').innerText = currentDragTask.operationName;
    document.getElementById('modal-operator-name').innerText = operatorName;
    document.getElementById('modal-qty').value = '';
    
    document.getElementById('assign-modal').style.display = 'flex';
}

function closeAssignModal() {
    document.getElementById('assign-modal').style.display = 'none';
    currentDragTask = null;
    currentDropOperator = null;
}

async function confirmAssign() {
    const qty = parseInt(document.getElementById('modal-qty').value);
    if (!qty || qty <= 0) {
        alert("Моля, въведете валидно количество.");
        return;
    }
    const dateStr = document.getElementById('date-picker').value;

    document.getElementById('assign-modal').style.display = 'none';
    
    const loader = document.getElementById('loading');
    loader.style.display = 'flex';
    document.getElementById('main-layout').style.display = 'none';

    try {
        const { error } = await client.from('planner_bobini').insert([{
            date: dateStr,
            operator_name: currentDropOperator,
            detail_name: currentDragTask.detailName,
            operation_name: currentDragTask.operationName,
            qty: qty
        }]);

        if (error) throw error;
        currentDragTask = null;
        currentDropOperator = null;
        await loadData();
    } catch(err) {
        alert("Грешка при запис: " + err.message);
        loader.style.display = 'none';
        document.getElementById('main-layout').style.display = 'flex';
    }
}

async function deleteQuota(id) {
    if(!confirm("Сигурни ли сте, че искате да изтриете тази норма?")) return;
    
    const loader = document.getElementById('loading');
    loader.style.display = 'flex';
    document.getElementById('main-layout').style.display = 'none';

    try {
        const { error } = await client.from('planner_bobini').delete().eq('id', id);
        if (error) throw error;
        await loadData();
    } catch(err) {
        alert("Грешка при изтриване: " + err.message);
        loader.style.display = 'none';
        document.getElementById('main-layout').style.display = 'flex';
    }
}

function normalizeStr(str) {
    if (!str) return '';
    return String(str).replace(/[\u00A0\s]+/g, ' ').trim().toLowerCase();
}

async function generateTerminalTasks(client) {
  
  
  
  
  try {
      const [plansRes, bomRes, routesRes, reportsRes, skladRes, nomRes, bufferRes, invRes] = await Promise.all([
          client.from('plan').select('*').in('Статус', ['Активен', 'Завършен', '📦 Опакован']).limit(100000), client.from('bom').select('*').limit(100000),
          client.from('marshruti').select('*').limit(100000), client.from('otcheti').select('*').order('Дата', {ascending: false}).limit(2000), 
          client.from('sklad').select('*').limit(100000), client.from('Номенклатура').select('*').limit(100000),
          client.from('sklad_bufferi').select('*').limit(100000),
          client.from('inventory').select('*').limit(100000)
      ]);

      if (plansRes.error) throw plansRes.error; if (bomRes.error) throw bomRes.error;
      if (routesRes.error) throw routesRes.error; if (reportsRes.error) throw reportsRes.error;
      if (invRes.error) throw invRes.error;

      let globalNomData = nomRes.data || [];
      let namesMap = {}; if (nomRes.data) nomRes.data.forEach(n => { let code = normalizeStr(n['ID Детайл']); namesMap[code] = n['Вътрешно име'] || ''; });
      
      let bufferMap = {};
      let bufferScrapMap = {};
      
      if (nomRes.data) {
          nomRes.data.forEach(n => {
              let code = normalizeStr(n['ID Детайл']);
              let type = normalizeStr(n['Тип'] || '');
              
              if (!type.includes('резолвер')) {
                  bufferScrapMap[code] = 20;
              }
          });
      }

      if (bufferRes && bufferRes.data) {
          bufferRes.data.forEach(b => {
              let bKey = normalizeStr(b['ID Детайл']);
              let bufVal = parseFloat(b['Буфер']) || 0;
              let scrapVal = parseFloat(b['% Брак']) || 0;
              if (bufVal > 0) bufferMap[bKey] = bufVal;
              if (scrapVal > 0) bufferScrapMap[bKey] = scrapVal;
          });
      }

      let globalBomData = bomRes.data || []; 
      
      let globalRoutesByDetail = {};
      routesRes.data.forEach(r => { let code = normalizeStr(r['Код на детайла']); if(!globalRoutesByDetail[code]) globalRoutesByDetail[code] = []; globalRoutesByDetail[code].push(r); });
      Object.keys(globalRoutesByDetail).forEach(code => globalRoutesByDetail[code].sort((a, b) => parseInt(a['№ Операция']) - parseInt(b['№ Операция'])));

      let takenOps = {}; 
      reportsRes.data.forEach(r => {
          let code = normalizeStr(r['ID Детайл']);
          let op = normalizeStr(r['Операция']);
          let key = code + '_' + op; 
          
          if (r['Статус'] === 'Брак' || r['Статус'] === 'Отчетено' || r['Статус'] === 'Прекъсната') {
              if (String(r['Оператор']).trim() === "".trim() && takenOps[key] === undefined) takenOps[key] = false;
          }
          else if (r['Статус'] === 'Започната') {
              if (String(r['Оператор']).trim() === "".trim() && takenOps[key] === undefined) takenOps[key] = true;
          }
      });

      let skladData = skladRes.data || [];
      let getSkladQty = (code) => { let c = normalizeStr(code); let item = skladData.find(s => normalizeStr(s['ID Детайл']) === c); return item ? (parseFloat(item['Остатък']) || 0) : 0; };

      let planRoots = {}; 
      let planNames = {};
      let groupEarliestId = {};
      let planNameToId = {};
      let groupTotalTargets = {};
      let groupScrapDetails = {};
      
      plansRes.data.forEach(plan => {
          if (String(plan['Статус']).trim() === 'Изпратен') return;
          let planId = String(plan.id).trim(); 
          let rootItem = String(plan['Вътрешно име']).trim(); 
          let targetQty = parseFloat(plan['Целево количество']) || 0;
          let monthYear = (plan['Месец'] && plan['Година']) ? (plan['Месец'] + ' ' + plan['Година']) : '';
          
          let groupKey = monthYear || planId; 
          
          if (!groupEarliestId[groupKey] || parseInt(planId) < groupEarliestId[groupKey]) {
              groupEarliestId[groupKey] = parseInt(planId);
              groupScrapDetails[groupKey] = plan['scrap_details']; // jsonb column
          }
          groupTotalTargets[groupKey] = (groupTotalTargets[groupKey] || 0) + targetQty;
          
          if (plan['Вътрешно име']) planNameToId[String(plan['Вътрешно име']).trim()] = planId;
          planNameToId[planId] = planId;
          
          planNames[groupKey] = monthYear ? monthYear : plan['Вътрешно име'];
          
          if (nomRes.data) {
              let translated = nomRes.data.find(n => String(n['Вътрешно име']).trim() === rootItem);
              if (translated && translated['ID Детайл']) rootItem = String(translated['ID Детайл']).trim();
          }
          rootItem = rootItem.toLowerCase();

          if(!planRoots[groupKey]) planRoots[groupKey] = {};
          planRoots[groupKey][rootItem] = (planRoots[groupKey][rootItem] || 0) + targetQty;
      });

      let physicalStock = {}; 
      if (invRes.data) {
          invRes.data.forEach(r => {
              let code = normalizeStr(r['ID Детайл']);
              let op = normalizeStr(r['Операция']);
              if (op === 'готов продукт') {
                  let routes = globalRoutesByDetail[code];
                  if (routes && routes.length > 0) {
                      op = normalizeStr(routes[routes.length - 1]['Име на операция']);
                  }
              }
              let key = code + '_' + op;
              physicalStock[key] = (physicalStock[key] || 0) + (parseFloat(r['Количество']) || 0);
          });
      }

      let getDepth = (item, visited = new Set()) => {
          if (depths[item] !== undefined) return depths[item];
          if (visited.has(item)) return 0; 
          visited.add(item);
          let parents = globalBomData.filter(b => normalizeStr(b['ID Компонент']) === item);
          if (parents.length === 0) { depths[item] = 0; return 0; }
          let maxP = -1;
          parents.forEach(p => {
              let pCode = normalizeStr(p['ID Родител']);
              if (pCode !== item) { let d = getDepth(pCode, new Set(visited)); if (d > maxP) maxP = d; }
          });
          depths[item] = maxP + 1; return depths[item];
      };
      let depths = {};

      let globalPlanItems = new Set();
      Object.keys(planRoots).forEach(pId => {
          Object.keys(planRoots[pId]).forEach(root => globalPlanItems.add(root));
      });
      Object.keys(bufferMap).forEach(root => globalPlanItems.add(root));
      let planItemsAdded = true;
      while(planItemsAdded) {
          planItemsAdded = false;
          globalBomData.forEach(b => {
              let parent = normalizeStr(b['ID Родител']);
              let child = normalizeStr(b['ID Компонент']);
              if (globalPlanItems.has(parent) && !globalPlanItems.has(child)) {
                  globalPlanItems.add(child);
                  planItemsAdded = true;
              }
          });
      }

      let generatedTasks = [];

      let planIdsToProcess = Object.keys(planRoots).sort((a,b) => (groupEarliestId[a] || 0) - (groupEarliestId[b] || 0));
      planIdsToProcess.push('NONE'); // For Buffer plans
      
      let scrapUpdatesToSave = {};
      
      let virtualSklad = {};
      let getVirtualSklad = (code) => {
          let c = code.toLowerCase();
          if (virtualSklad[c] !== undefined) return virtualSklad[c];
          let qty = getSkladQty(c);
          virtualSklad[c] = qty;
          return qty;
      };
      let consumeSklad = (code, qty) => {
          let c = code.toLowerCase();
          virtualSklad[c] = getVirtualSklad(c) - qty;
      };
      let planPureBom = {};
      let planScrapBom = {};
      let planOriginalBom = {};
      let bufferPureBom = {};
      let bufferOriginalBom = {};
      let scrapActivated = {};
      let componentPlanSources = {};
      let componentPlanIds = {};

      planIdsToProcess.forEach(pId => {
          let isBuffer = pId === 'NONE';
          
          let savedMap = null;
          let currentTargetTotal = groupTotalTargets[pId] || 0;
          
          if (!isBuffer) {
              if (groupScrapDetails[pId] && groupScrapDetails[pId].target === currentTargetTotal && groupScrapDetails[pId].map) {
                  savedMap = groupScrapDetails[pId].map;
              } else {
                  savedMap = {};
                  let earliestId = groupEarliestId[pId];
                  if (earliestId) {
                      scrapUpdatesToSave[earliestId] = { target: currentTargetTotal, map: savedMap };
                  }
              }
          }
          
          if (isBuffer) {
              Object.keys(bufferMap).forEach(root => {
                  let qty = bufferMap[root];
                  bufferPureBom[root] = (bufferPureBom[root] || 0) + qty;
                  bufferOriginalBom[root] = (bufferOriginalBom[root] || 0) + qty;
              });
          } else if (planRoots[pId]) {
              Object.keys(planRoots[pId]).forEach(root => {
                  let targetQty = planRoots[pId][root];
                  let available = getVirtualSklad(root);
                  let pureDeficit = Math.max(0, targetQty - available);
                  consumeSklad(root, targetQty); // The plan claims its targetQty from warehouse
                  
                  planPureBom[root] = (planPureBom[root] || 0) + pureDeficit;
                  planOriginalBom[root] = (planOriginalBom[root] || 0) + targetQty;
                  
                  if (!componentPlanSources[root]) componentPlanSources[root] = new Set();
                  componentPlanSources[root].add(planNames[pId] || pId);
                  if (!componentPlanIds[root]) componentPlanIds[root] = new Set();
                  componentPlanIds[root].add(pId);
                  
                  let scrapAllowance = 0;
                  if (bufferScrapMap[root] > 0) {
                      if (savedMap && savedMap[root] !== undefined) {
                          scrapAllowance = savedMap[root];
                      } else {
                          scrapAllowance = Math.ceil(pureDeficit * (bufferScrapMap[root] / 100));
                          if (savedMap) savedMap[root] = scrapAllowance;
                      }
                      scrapActivated[root] = true;
                  }
                  planScrapBom[root] = (planScrapBom[root] || 0) + scrapAllowance;
              });
          }
      });
      
      let allItemsSet = new Set([...Object.keys(planPureBom), ...Object.keys(bufferPureBom)]);
      globalBomData.forEach(b => { allItemsSet.add(normalizeStr(b['ID Родител'])); allItemsSet.add(normalizeStr(b['ID Компонент'])); });
      Object.keys(bufferMap).forEach(code => allItemsSet.add(code));
      
      let allItemsArray = Array.from(allItemsSet);
      allItemsArray.forEach(item => getDepth(item));
      allItemsArray.sort((a, b) => (depths[a] || 0) - (depths[b] || 0));

      allItemsArray.forEach((code, nodeIndex) => {
          let currentPlanPureTarget = planPureBom[code] || 0;
          let currentPlanScrapTarget = planScrapBom[code] || 0;
          let currentBufferTarget = bufferPureBom[code] || 0;
          
          if (currentPlanPureTarget <= 0 && currentPlanScrapTarget <= 0 && currentBufferTarget <= 0) return;
          
          let routes = globalRoutesByDetail[code] || [];
          
          if (routes.length > 0) {
              for (let i = routes.length - 1; i >= 0; i--) {
                  let route = routes[i];
                  let opName = normalizeStr(route['Име на операция']);
                  let opKey = code + '_' + opName;
                  
                  let availableHere = physicalStock[opKey] || 0; 
                  
                  let takenPure = Math.min(currentPlanPureTarget, availableHere);
                  availableHere -= takenPure;
                  let pureShortage = currentPlanPureTarget - takenPure;
                  
                  let takenScrap = Math.min(currentPlanScrapTarget, availableHere);
                  availableHere -= takenScrap;
                  let scrapShortage = currentPlanScrapTarget - takenScrap;
                  
                  let takenBuffer = Math.min(currentBufferTarget, availableHere);
                  availableHere -= takenBuffer;
                  let bufferShortage = currentBufferTarget - takenBuffer;
                  
                  let totalShortage = pureShortage + scrapShortage + bufferShortage;
                  
                  if (totalShortage > 0) {
                      let maxAllowed = Infinity;
                      let displayMaxAllowed = Infinity;
                      let hasLimit = false;
                      let blockingReasons = [];
                      
                      // 1. Check previous operation availability
                      if (i > 0) {
                          hasLimit = true;
                          let prevRoute = routes[i - 1]; 
                          let prevOpName = normalizeStr(prevRoute['Име на операция']);
                          maxAllowed = physicalStock[code + '_' + prevOpName] || 0;
                          displayMaxAllowed = maxAllowed;
                          if (maxAllowed < totalShortage) blockingReasons.push(`Липсва наличност на предходна операция (${String(prevRoute['Име на операция']).trim()})`);
                      }

                      // 2. Check BOM availability for THIS specific operation
                      let isLastOp = (i === routes.length - 1);
                      let currentOpNum = parseInt(route['№ Операция']) || 0;
                      let children = globalBomData.filter(b => normalizeStr(b['ID Родител']) === code);
                      
                      let relevantChildren = children.filter(c => {
                          let opNum = c['Влага се на Оп. №'] ? parseFloat(c['Влага се на Оп. №']) : 0;
                          if (opNum > 0) return opNum === currentOpNum;
                          return (i === 0);
                      });

                      let itemsToFetch = [];
                      if (relevantChildren.length > 0) {
                          hasLimit = true;
                          let minSets = Infinity;
                          let rawMinSets = Infinity;
                          relevantChildren.forEach(child => {
                              let cCode = normalizeStr(child['ID Компонент']); 
                              let multiplier = parseFloat(child['Количество']) || 1;
                              let childRoutes = globalRoutesByDetail[cCode] || [];
                              let wipAvail = 0;
                              let skladAvail = getSkladQty(cCode);
                              if (childRoutes.length > 0) {
                                  let lastChildOp = normalizeStr(childRoutes[childRoutes.length - 1]['Име на операция']);
                                  wipAvail = physicalStock[cCode + '_' + lastChildOp] || 0;
                              }
                              let childAvail = wipAvail + skladAvail;
                              let sets = Math.floor(childAvail / multiplier);
                              if (sets < minSets) { minSets = sets; blockingReasons.push(`${cCode} (${childAvail} налични)`); }
                              if (sets < rawMinSets) rawMinSets = sets;
                              
                              // Build itemsToFetch
                              let nomItem = globalNomData.find(n => normalizeStr(n['ID Детайл']) === cCode);
                              let type = nomItem ? normalizeStr(nomItem['Тип']) : '';
                              if (type !== 'материал' || i === 0) {
                                  let lastChildDropoff = '';
                                  if (childRoutes.length > 0) {
                                      let lastOpObj = childRoutes[childRoutes.length - 1];
                                      lastChildDropoff = String(lastOpObj['Инструкция за оставяне'] || '').trim();
                                  }
                                  let locTexts = [];
                                  if (wipAvail > 0) {
                                      locTexts.push(`${wipAvail}бр. ${lastChildDropoff ? 'в ' + lastChildDropoff : 'в Буфер'}`);
                                  }
                                  if (skladAvail > 0) {
                                      locTexts.push(`${skladAvail}бр. в Склад`);
                                  }
                                  if (locTexts.length === 0) locTexts.push(`0бр. налични`);
                                  let loc = locTexts.join(' / ');
                                  
                                  itemsToFetch.push({ code: String(child['ID Компонент']).trim(), qty: multiplier, loc: loc, type: type });
                              }
                          });
                          
                          if (rawMinSets < displayMaxAllowed) displayMaxAllowed = rawMinSets;
                          if (maxAllowed < totalShortage) {
                              if (!blockingReasons.includes(`Липсващи компоненти`)) blockingReasons.push(`Липсващи компоненти`);
                          }
                      }
                      
                      if (i === 0) {
                          let rootNom = globalNomData.find(n => normalizeStr(n['ID Детайл']) === code);
                          if (rootNom && rootNom['ID Родител'] && normalizeStr(rootNom['ID Родител']) !== '') {
                              let parentCode = normalizeStr(rootNom['ID Родител']);
                              if (parentCode) {
                                  let pNom = globalNomData.find(n => normalizeStr(n['ID Детайл']) === parentCode);
                                  let loc = pNom ? String(pNom['Местоположение'] || '').trim() : '';
                                  itemsToFetch.push({ code: normalizeStr(rootNom['ID Родител']), qty: parseFloat(rootNom['Разходна норма']) || 1, loc: loc, type: 'материал' });
                              }
                          }
                      }
                      
                      let isTaken = takenOps[opKey] === true;
                      if (maxAllowed < 0) maxAllowed = 0; 
                      let isBlocked = hasLimit && maxAllowed <= 0; 
                      let machineName = route['Машина'] || '';
                      
                      let matchMachine = false;
                      if (!"" || "".trim() === "" || isTaken) {
                          matchMachine = true;
                      } else {
                          let selectedMachines = "".split(',').map(m => m.toLowerCase().trim()); 
                          matchMachine = selectedMachines.some(m => machineName.toLowerCase().includes(m));
                      }

                      if (matchMachine) {
                          blockingReasons = [...new Set(blockingReasons)];
                          let pIdForCard = null;
                          let pNameForCardBase = "КОМПОНЕНТ";
                          
                          if (componentPlanSources[code] && componentPlanSources[code].size > 0) {
                              pNameForCardBase = Array.from(componentPlanSources[code]).join(', ');
                              pIdForCard = Array.from(componentPlanIds[code] || []).join(',');
                          } else {
                              Object.keys(planRoots).forEach(pid => {
                                  if (planRoots[pid] && planRoots[pid][code]) {
                                      pIdForCard = pid;
                                      pNameForCardBase = planNames[pid] || pid;
                                  }
                              });
                          }

                          let safeIdBase = (code + '_n' + nodeIndex + '_op' + i).replace(/[^a-zA-Z0-9а-яА-Я_]/g, '_');
                          let displayName = String(route['Код на детайла']).trim();
                          let displayOpName = String(route['Име на операция']).trim();
                          let nextOpStr = i < routes.length - 1 ? String(routes[i+1]['Име на операция']).trim() : "Готово";
                          let typeStr = i === routes.length - 1 ? "ЗЕЛЕНА" : "СИНЯ";
                          
                          let pushTask = (shortage, typeSuffix, pNameOverride, isScrapOnlyCard, originalTarget) => {
                              if (shortage <= 0) return;
                              let isBlocked = hasLimit && maxAllowed <= 0;
                              let targetInput = shortage;
                              let displayMaxAllowedForThis = displayMaxAllowed;
                              let realMaxAllowedForThis = maxAllowed;
                              
                              if (hasLimit && targetInput > realMaxAllowedForThis) targetInput = realMaxAllowedForThis;
                              if (targetInput <= 0 && !hasLimit) targetInput = 1;
                              if (targetInput <= 0 && isBlocked) targetInput = 0;
                              
                              if (!isBlocked && isScrapOnlyCard) {
                                  if (hasLimit) {
                                      displayMaxAllowedForThis = Math.min(displayMaxAllowedForThis, shortage);
                                      realMaxAllowedForThis = displayMaxAllowedForThis;
                                  } else {
                                      displayMaxAllowedForThis = shortage;
                                      realMaxAllowedForThis = shortage;
                                  }
                                  targetInput = displayMaxAllowedForThis;
                              }
                              
                              let totalDone = (originalTarget > 0 ? originalTarget : shortage) - shortage;
                              if (totalDone < 0) totalDone = 0;
                              
                              generatedTasks.push({ 
                                  id: safeIdBase + typeSuffix, 
                                  plan_id: pNameOverride === 'БУФЕРИ' ? null : pIdForCard, 
                                  plan_name: pNameOverride,
                                  name: displayName, internalName: namesMap[code] || '', op: displayOpName, opNum: parseInt(route['№ Операция']) || 0, next_op: nextOpStr, 
                                  machine: machineName, drawing_link: route['Линк към чертеж'], sop_link: route['Линк към СОП'], desc: route['Описание'], 
                                  type: typeStr, 
                                  dropoff: route['Инструкция за оставяне'],
                                  defaultQty: targetInput, maxAllowed: displayMaxAllowedForThis, realMaxAllowed: realMaxAllowedForThis, hasLimit: hasLimit, isBlocked: isBlocked, blockingReasons: blockingReasons, 
                                  totalNeed: shortage, pureQty: isScrapOnlyCard ? 0 : shortage, scrapAllowance: isScrapOnlyCard ? shortage : 0,
                                  totalDone: totalDone, totalScrapped: 0, isTaken: isTaken, isGreenCard: (pNameOverride === 'БУФЕРИ'),
                                  globalGrossAtLoad: 0, globalScrapAtLoad: 0,
                                  itemsToFetch: itemsToFetch
                              });
                              
                              if (hasLimit) {
                                  maxAllowed -= shortage;
                                  displayMaxAllowed -= shortage;
                                  if (maxAllowed < 0) maxAllowed = 0;
                                  if (displayMaxAllowed < 0) displayMaxAllowed = 0;
                              }
                          };

                          pushTask(pureShortage, '_blue', pNameForCardBase, false, planOriginalBom[code] || 0);
                          pushTask(scrapShortage, '_scrap', pNameForCardBase, true, 0);
                          pushTask(bufferShortage, '_green', "БУФЕРИ", false, bufferOriginalBom[code] || 0);
                      }
                  }

                  
                  if ((takenPure + takenScrap + takenBuffer) > 0) {
                      physicalStock[opKey] -= (takenPure + takenScrap + takenBuffer);
                  }

                  currentPlanPureTarget = pureShortage;
                  currentPlanScrapTarget = scrapShortage;
                  currentBufferTarget = bufferShortage;
              }
          }
          
          if (currentPlanPureTarget > 0 || currentPlanScrapTarget > 0 || currentBufferTarget > 0) {
              let children = globalBomData.filter(b => normalizeStr(b['ID Родител']) === code);
              children.forEach(c => {
                  let cCode = normalizeStr(c['ID Компонент']);
                  let multiplier = parseFloat(c['Количество']) || 1;
                  
                  let childPureTarget = currentPlanPureTarget * multiplier;
                  let childScrapTarget = currentPlanScrapTarget * multiplier;
                  
                  let isActivated = scrapActivated[code] === true;
                  
                  if (!isActivated && bufferScrapMap[cCode] > 0) {
                      let newScrap = Math.ceil(childPureTarget * (bufferScrapMap[cCode] / 100));
                      childScrapTarget += newScrap;
                      isActivated = true;
                  }
                  
                  if (isActivated) {
                      scrapActivated[cCode] = true;
                  }
                  
                  planPureBom[cCode] = (planPureBom[cCode] || 0) + childPureTarget;
                  planScrapBom[cCode] = (planScrapBom[cCode] || 0) + childScrapTarget;
                  planOriginalBom[cCode] = (planOriginalBom[cCode] || 0) + ((planOriginalBom[code] || 0) * multiplier);
                  
                  if (!componentPlanSources[cCode]) componentPlanSources[cCode] = new Set();
                  if (componentPlanSources[code]) {
                      componentPlanSources[code].forEach(pn => componentPlanSources[cCode].add(pn));
                  }
                  if (!componentPlanIds[cCode]) componentPlanIds[cCode] = new Set();
                  if (componentPlanIds[code]) {
                      componentPlanIds[code].forEach(id => componentPlanIds[cCode].add(id));
                  }
                  
                  bufferPureBom[cCode] = (bufferPureBom[cCode] || 0) + (currentBufferTarget * multiplier);
                  bufferOriginalBom[cCode] = (bufferOriginalBom[cCode] || 0) + ((bufferOriginalBom[code] || 0) * multiplier);
              });
          }
      });
      // WIP SWEEP Removed as per user request

      // Save any new scrap configurations asynchronously
      if (Object.keys(scrapUpdatesToSave).length > 0) {
          Promise.all(Object.keys(scrapUpdatesToSave).map(pId => {
              return client.from('plan').update({ scrap_details: scrapUpdatesToSave[pId] }).eq('id', pId);
          })).catch(e => console.error('Failed to save scrap details:', e));
      }

      generatedTasks.sort((a, b) => {
          let getWeight = (t) => {
              if (t.plan_name === "БУФЕРИ") return Infinity;
              if (t.plan_name === "СВРЪХПРОИЗВОДСТВО") return 9999999;
              let baseWeight = groupEarliestId[t.plan_id] || 0;
              // Scrap-only cards (no pure quantity left) go after all normal cards
              if (t.pureQty <= 0 && t.scrapAllowance > 0) {
                  baseWeight += 5000000;
              }
              return baseWeight;
          };
          let aPlanWeight = getWeight(a);
          let bPlanWeight = getWeight(b);
          if (aPlanWeight !== bPlanWeight) return aPlanWeight - bPlanWeight;
          return a.opNum - b.opNum;
      });
      return generatedTasks;
  } catch (err) { console.error(err); return []; }
}

