function setTaskFilter(filterType) { currentTaskFilter = filterType; document.querySelectorAll('.t-filter-btn').forEach(btn => btn.classList.remove('active')); document.getElementById('filter_' + filterType).classList.add('active'); renderTasks(globalTasks); }

function normalizeStr(str) {
    if (!str) return '';
    return String(str).replace(/[\u00A0\s]+/g, ' ').trim().toLowerCase();
}

async function fetchAllRows(table, select = '*', extraFilter = null, orderBy = null, maxRows = Infinity) {
    let result = [];
    let start = 0;
    while (true) {
        let query = client.from(table).select(select).range(start, start + 999);
        if (extraFilter) {
            query = extraFilter(query);
        }
        if (orderBy) {
            query = query.order(orderBy.col, { ascending: orderBy.asc });
        }
        const { data, error } = await query;
        if (error) throw error;
        if (data) result.push(...data);
        if (!data || data.length < 1000 || result.length >= maxRows) break;
        start += 1000;
    }
    if (result.length > maxRows) result = result.slice(0, maxRows);
    return { data: result };
}

async function changeMachine(isInitial = false) {
    Swal.fire({ title: 'Зареждане...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    try {
        const { data, error } = await client.from('marshruti').select('Машина').limit(100000); if (error) throw error;
        let uniqueMachines = []; if (data) data.forEach(r => { let m = r['Машина']; if (m && m.trim() !== "" && !uniqueMachines.includes(m.trim())) uniqueMachines.push(m.trim()); });
        uniqueMachines.sort(); 
        let checkboxHtml = '<div style="text-align:left; margin-top:15px; max-height: 300px; overflow-y: auto;"><div style="display: flex; gap: 10px; margin-bottom: 15px;"><button type="button" onclick="document.querySelectorAll(\'.machine-cb\').forEach(cb => cb.checked = true)" style="flex:1; padding:10px; background:#e0f2fe; color:#0369a1; border:1px solid #bae6fd; border-radius:6px; font-weight:bold;">☑️ Всички</button><button type="button" onclick="document.querySelectorAll(\'.machine-cb\').forEach(cb => cb.checked = false)" style="flex:1; padding:10px; background:#fee2e2; color:#b91c1c; border:1px solid #fecaca; border-radius:6px; font-weight:bold;">☐ Изчисти</button></div>';
        let currentSelections = currentMachine ? currentMachine.split(',') : [];
        uniqueMachines.forEach(m => { let isChecked = currentSelections.includes(m) ? 'checked' : ''; checkboxHtml += `<label style="display:flex; align-items:center; margin-bottom:10px; padding:12px; background:#f8fafc; border-radius:6px; border:1px solid #cbd5e1;"><input type="checkbox" class="machine-cb" value="${m}" ${isChecked} style="transform: scale(1.5); margin-right:15px;"><span style="font-weight:700;">${m}</span></label>`; });
        checkboxHtml += '</div>';
        Swal.close();
        const { isConfirmed } = await Swal.fire({ title: 'Работно място', html: checkboxHtml, showCancelButton: !isInitial, allowOutsideClick: !isInitial, confirmButtonText: 'Потвърди', confirmButtonColor: '#2563eb', preConfirm: () => { let selected = []; document.querySelectorAll('.machine-cb:checked').forEach(cb => selected.push(cb.value)); return selected; } });
        if (isConfirmed) {
            let finalSelection = []; document.querySelectorAll('.machine-cb:checked').forEach(cb => finalSelection.push(cb.value));
            currentMachine = finalSelection.join(','); localStorage.setItem('mes_machine', currentMachine);
            document.getElementById('uiMachineName').innerText = (finalSelection.length > 0) ? finalSelection.join(', ') : "ВСИЧКИ";
            loadTasks();
        }
    } catch (err) { Swal.fire('Gрешка', err.message, 'error'); }
}

async function loadTasks(isSilent = false) {
  isUserCheckedIn = await fetchUserCheckInStatus();
  
  if (!isUserCheckedIn) {
      document.getElementById('mainAppContent').style.display = 'none';
      document.getElementById('bigLoginScreen').style.display = 'flex';
      return; 
  }
  
  document.getElementById('bigLoginScreen').style.display = 'none';
  document.getElementById('mainAppContent').style.display = 'block';

  var container = document.getElementById('tasksContainer');
  if (!isSilent) container.innerHTML = '<div id="loadingMsg" style="text-align:center; padding: 40px; font-weight:bold; color:#64748b; font-size: 1.2em;">Търсене на задачи... 🔄</div>';
  
  try {
      const [plansRes, bomRes, routesRes, reportsRes, skladRes, nomRes, bufferRes, invRes, prioRes] = await Promise.all([
          fetchAllRows('plan', '*', q => q.in('Статус', ['Активен', 'Завършен', '📦 Опакован'])), fetchAllRows('bom'),
          fetchAllRows('marshruti'), fetchAllRows('otcheti', '*', null, { col: 'Дата', asc: false }, 2000), 
          fetchAllRows('sklad'), fetchAllRows('Номенклатура'),
          fetchAllRows('sklad_bufferi'),
          fetchAllRows('inventory'),
          fetchAllRows('task_priorities', '*').catch(() => ({ data: [] }))
      ]);

      if (plansRes.error) throw plansRes.error; if (bomRes.error) throw bomRes.error;
      if (routesRes.error) throw routesRes.error; if (reportsRes.error) throw reportsRes.error;
      if (invRes.error) throw invRes.error;

      globalNomData = nomRes.data || [];
      let namesMap = {}; if (nomRes.data) nomRes.data.forEach(n => { let code = normalizeStr(n['ID Детайл']); namesMap[code] = n['Вътрешно име'] || ''; });
      
      let bufferMap = {};
      let bufferScrapMap = {};
      let bufferOpMap = {};
      
      if (nomRes.data) {
          // The old hardcoded 20% logic is removed
      }

      if (bufferRes && bufferRes.data) {
          bufferRes.data.forEach(b => {
              let bKey = normalizeStr(b['ID Детайл']);
              let bufVal = parseFloat(b['Буфер']) || 0;
              let scrapVal = parseFloat(b['% Брак']) || 0;
              let opVal = String(b['Операция'] || '').trim();
              
              if (bufVal > 0) bufferMap[bKey] = bufVal;
              if (scrapVal > 0) bufferScrapMap[bKey] = scrapVal;
              if (opVal) bufferOpMap[bKey] = opVal;
          });
      }

      let taskPrioritiesMap = {};
      if (prioRes && prioRes.data) {
          prioRes.data.forEach(p => {
              let m = normalizeStr(p.machine);
              let d = normalizeStr(p.detail_id);
              let op = parseInt(p.op_num);
              taskPrioritiesMap[m + '_' + d + '_' + op] = parseInt(p.priority_order) || 100;
          });
      }

      globalBomData = bomRes.data || []; 
      
      globalRoutesByDetail = {};
      routesRes.data.forEach(r => { let code = normalizeStr(r['Код на детайла']); if(!globalRoutesByDetail[code]) globalRoutesByDetail[code] = []; globalRoutesByDetail[code].push(r); });
      Object.keys(globalRoutesByDetail).forEach(code => globalRoutesByDetail[code].sort((a, b) => parseInt(a['№ Операция']) - parseInt(b['№ Операция'])));

      let takenOps = {}; 
      let activeDangling = [];
      reportsRes.data.forEach(r => {
          let code = normalizeStr(r['ID Детайл']);
          let op = normalizeStr(r['Операция']);
          let key = code + '_' + op; 
          
          if (r['Статус'] === 'Брак' || r['Статус'] === 'Отчетено' || r['Статус'] === 'Прекъсната' || r['Статус'] === 'Авто-приключена') {
              if (String(r['Оператор']).trim() === currentOperator.trim() && takenOps[key] === undefined) takenOps[key] = false;
          }
          else if (r['Статус'] === 'Започната') {
              if (String(r['Оператор']).trim() === currentOperator.trim() && takenOps[key] === undefined) {
                  takenOps[key] = true;
                  activeDangling.push(r);
              }
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

      globalTasks = [];

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
          
          let bufferOpTarget = bufferOpMap[code];
          let reachedBufferOp = !bufferOpTarget;
          
          if (routes.length > 0) {
              for (let i = routes.length - 1; i >= 0; i--) {
                  let route = routes[i];
                  let opNameRaw = String(route['Име на операция']).trim();
                  let opName = normalizeStr(opNameRaw);
                  let opKey = code + '_' + opName;
                  
                  if (!reachedBufferOp && bufferOpTarget && normalizeStr(bufferOpTarget) === opName) {
                      reachedBufferOp = true;
                  }
                  
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
                  
                  let cardBufferShortage = reachedBufferOp ? bufferShortage : 0;
                  let totalShortage = pureShortage + scrapShortage + cardBufferShortage;
                  
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
                              if (sets < minSets) minSets = sets;
                              if (sets < rawMinSets) rawMinSets = sets;
                              if (sets < totalShortage) { blockingReasons.push(`${cCode} (${childAvail} налични)`); }
                              
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
                                  
                                  itemsToFetch.push({ code: String(child['ID Компонент']).trim(), qty: multiplier, loc: loc, type: type, avail: childAvail, sets: sets });
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
                      let origMachine = route['Машина'] || '';
                      let taskDetailCode = normalizeStr(route['Код на детайла']);
                      let taskOpNumber = parseInt(route['№ Операция']) || 0;

                      let effectiveMachine = origMachine;
                      let isTransferred = false;
                      let origMachineDisplay = origMachine;

                      if (prioRes && prioRes.data) {
                          let overrideRec = prioRes.data.find(p => 
                              normalizeStr(p.detail_id) === taskDetailCode && 
                              parseInt(p.op_num) === taskOpNumber
                          );

                          if (overrideRec) {
                              let assignedM = String(overrideRec.machine || '').trim();
                              let origM = overrideRec.original_machine || null;
                              if (!origM && overrideRec.notes && overrideRec.notes.includes('[ORIG:')) {
                                  let match = overrideRec.notes.match(/\[ORIG:(.*?)\]/);
                                  if (match) origM = match[1].trim();
                              }
                              if (!origM) origM = origMachine;

                              if (assignedM && normalizeStr(assignedM) !== normalizeStr(origMachine)) {
                                  effectiveMachine = assignedM;
                                  isTransferred = true;
                                  origMachineDisplay = origM;
                              }
                          }
                      }

                      let machineName = effectiveMachine;
                      let matchMachine = false;
                      if (!currentMachine || currentMachine.trim() === "" || isTaken) {
                          matchMachine = true;
                      } else {
                          let selectedMachines = currentMachine.split(',').map(m => normalizeStr(m)).filter(Boolean); 
                          let currentTaskMachines = machineName.split(',').map(m => normalizeStr(m)).filter(Boolean);
                          matchMachine = selectedMachines.some(sm => currentTaskMachines.includes(sm));
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
                              let taskKey = normalizeStr(machineName) + '_' + normalizeStr(displayName) + '_' + (parseInt(route['№ Операция']) || 0);
                              let manualPriority = taskPrioritiesMap[taskKey] !== undefined ? taskPrioritiesMap[taskKey] : null;
                              
                              globalTasks.push({
                                  isTransferred: isTransferred,
                                  origMachineDisplay: origMachineDisplay,
                                  manualPriority: manualPriority, 
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
                          if (reachedBufferOp) {
                              pushTask(bufferShortage, '_green', "БУФЕРИ", false, bufferOriginalBom[code] || 0);
                          }
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

      // Save any new scrap configurations asynchronously (disabled for test env to avoid 400 Bad Request)
      /*
      if (Object.keys(scrapUpdatesToSave).length > 0) {
          Promise.all(Object.keys(scrapUpdatesToSave).map(pId => {
              return client.from('plan').update({ scrap_details: scrapUpdatesToSave[pId] }).eq('id', pId);
          })).catch(e => console.error('Failed to save scrap details:', e));
      }
      */

      // ==========================================
      // 🧪 ЗАРЕЖДАНЕ НА АКТИВНИ ПРОБИ (R&D СЕРИИ)
      // ==========================================
      try {
          const { data: activeProbi } = await client.from('probi').select('*').eq('status', 'В производство');
          if (activeProbi && activeProbi.length > 0) {
              const probaIds = activeProbi.map(p => p.id);
              const { data: probaComps } = await client.from('probi_components').select('*').in('proba_id', probaIds);

              if (probaComps && probaComps.length > 0) {
                  activeProbi.forEach(proba => {
                      const myComps = probaComps.filter(c => c.proba_id === proba.id);
                      myComps.forEach(comp => {
                          let partCode = String(comp.part_code).trim();
                          let partName = comp.part_name || namesMap[normalizeStr(partCode)] || partCode;
                          let mult = parseFloat(comp.qty_per_unit) || 1;
                          let totalTarget = (parseFloat(proba.target_qty) || 1) * mult;

                          let compRoutes = [];
                          if (comp.is_new && Array.isArray(comp.custom_routes) && comp.custom_routes.length > 0) {
                              compRoutes = comp.custom_routes;
                          } else {
                              compRoutes = globalRoutesByDetail[normalizeStr(partCode)] || [];
                          }

                          compRoutes.forEach((route, rIdx) => {
                              let opNum = parseInt(route['№ Операция'] || route.op_num) || ((rIdx + 1) * 10);
                              let opName = String(route['Име на операция'] || route.op_name).trim();
                              let machName = String(route['Машина'] || route.machine || '').trim();

                              // Check otcheti for this proba
                              let pKey = 'PROBA_' + proba.id;
                              let doneQty = 0;
                              let isTaken = false;
                              reportsRes.data.forEach(rep => {
                                  if (String(rep['ID План'] || '').trim() === pKey &&
                                      normalizeStr(rep['ID Детайл']) === normalizeStr(partCode) &&
                                      normalizeStr(rep['Операция']) === normalizeStr(opName)) {
                                      let st = String(rep['Статус'] || '').trim();
                                      if (st === 'Отчетено' || st === 'Изпратено') {
                                          doneQty += (parseFloat(rep['Количество']) || 0);
                                      } else if (st === 'Започната' && String(rep['Оператор']).trim() === currentOperator.trim()) {
                                          isTaken = true;
                                      }
                                  }
                              });

                              let shortage = totalTarget - doneQty;
                              if (shortage > 0) {
                                  let matchMachine = false;
                                  if (!currentMachine || currentMachine.trim() === "" || isTaken) {
                                      matchMachine = true;
                                  } else {
                                      let selectedMachines = currentMachine.split(',').map(m => normalizeStr(m)).filter(Boolean);
                                      let currentTaskMachines = machName.split(',').map(m => normalizeStr(m)).filter(Boolean);
                                      matchMachine = selectedMachines.some(sm => currentTaskMachines.includes(sm));
                                  }

                                  if (matchMachine) {
                                      let nextOpStr = (rIdx < compRoutes.length - 1) ? String(compRoutes[rIdx + 1]['Име на операция'] || compRoutes[rIdx + 1].op_name).trim() : 'Готово';
                                      let taskKey = normalizeStr(machName) + '_' + normalizeStr(partCode) + '_' + opNum;
                                      let manualPriority = taskPrioritiesMap[taskKey] !== undefined ? taskPrioritiesMap[taskKey] : null;

                                      globalTasks.push({
                                          isProba: true,
                                          probaId: proba.id,
                                          probaName: proba.name,
                                          manualPriority: manualPriority,
                                          id: `proba_${proba.id}_comp_${comp.id}_op_${opNum}`,
                                          plan_id: `PROBA_${proba.id}`,
                                          plan_name: `🧪 ПРОБА: ${proba.name}`,
                                          name: partCode,
                                          internalName: partName,
                                          op: opName,
                                          opNum: opNum,
                                          next_op: nextOpStr,
                                          machine: machName,
                                          drawing_link: route['Линк към чертеж'] || route.drawing_link || '',
                                          sop_link: route['Линк към СОП'] || route.sop_link || '',
                                          desc: route['Описание'] || route.desc || `Пробен детайл за: ${proba.name}`,
                                          type: "ПРОБА",
                                          dropoff: route['Инструкция за оставяне'] || route.dropoff || 'Зона Проби',
                                          defaultQty: shortage,
                                          maxAllowed: shortage,
                                          realMaxAllowed: shortage,
                                          hasLimit: false,
                                          isBlocked: false,
                                          blockingReasons: [],
                                          totalNeed: totalTarget,
                                          pureQty: shortage,
                                          scrapAllowance: 0,
                                          totalDone: doneQty,
                                          totalScrapped: 0,
                                          isTaken: isTaken,
                                          isGreenCard: false,
                                          globalGrossAtLoad: 0,
                                          globalScrapAtLoad: 0,
                                          itemsToFetch: []
                                      });
                                  }
                              }
                          });
                      });
                  });
              }
          }
      } catch (errProbaLoad) {
          console.warn("Грешка при зареждане на проби:", errProbaLoad);
      }
      globalTasks.sort((a, b) => {
          let aPrio = (a.manualPriority !== null && a.manualPriority !== undefined) ? a.manualPriority : 9999;
          let bPrio = (b.manualPriority !== null && b.manualPriority !== undefined) ? b.manualPriority : 9999;
          if (aPrio !== bPrio) return aPrio - bPrio;

          let getWeight = (t) => {
              if (t.isProba) return -100;
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

      // AUTO-CLOSE DANGLING TASKS
      let insertsAutoClose = [];
      let shouldAlert = false;
      
      if (activeTaskId !== null && activeTaskId !== undefined) {
          let currentlyActive = globalTasks.find(t => t.id === activeTaskId);
          if (!currentlyActive) {
              activeTaskId = null;
              shouldAlert = true;
          }
      }

      activeDangling.forEach(r => {
          let code = normalizeStr(r['ID Детайл']);
          let op = normalizeStr(r['Операция']);
          let foundInGlobal = globalTasks.find(t => normalizeStr(t.name) === code && normalizeStr(t.op) === op);
          
          if (!foundInGlobal) {
              insertsAutoClose.push({
                  "ID План": r['ID План'],
                  "ID Детайл": r['ID Детайл'],
                  "Оператор": currentOperator,
                  "Количество": 0,
                  "Операция": r['Операция'],
                  "Статус": "Авто-приключена",
                  "Дата": new Date().toISOString(),
                  "Време Старт": r['Време Старт'] || new Date().toISOString()
              });
              takenOps[code + '_' + op] = false;
          }
      });

      if (insertsAutoClose.length > 0) {
          client.from('otcheti').insert(insertsAutoClose).then(res => { if(res.error) console.error("Auto-close error", res.error); });
      }
      
      if (shouldAlert) {
          Swal.fire('Задачата е изпълнена', 'Някой друг току-що завърши тази задача!', 'info');
      }

      renderTasks(globalTasks);
  } catch (err) { console.error(err); document.getElementById('tasksContainer').innerHTML = '<div style="text-align:center; padding: 40px; color:#ef4444; font-weight:bold;">❌ Грешка:<br>' + err.message + '</div>'; }
}

function renderTasks(tasks) {
  var container = document.getElementById('tasksContainer');
  
  let visibleTasks = tasks;

  // Bulletproof safeguard for edge cases
  visibleTasks.forEach(t => {
      if (t.hasLimit && Number(t.maxAllowed) <= 0) {
          t.isBlocked = true;
          if (!t.blockingReasons) t.blockingReasons = [];
          if (t.blockingReasons.length === 0) t.blockingReasons.push('Наличност: 0');
      }
  });

  let filteredTasks = visibleTasks;
  if (currentTaskFilter === 'ready') filteredTasks = visibleTasks.filter(t => !t.isBlocked);
  else if (currentTaskFilter === 'taken') filteredTasks = visibleTasks.filter(t => t.isTaken);

  if(filteredTasks.length === 0) { 
      let msg = currentTaskFilter === 'all' ? '🎉 Всички задачи са изпълнени!' : 'Няма задачи в тази категория.';
      container.innerHTML = `<div style="text-align:center; padding: 40px; font-size:1.3em; color: #16a34a; font-weight: 900;">${msg}</div>`; 
      return; 
  }
  
  var html = '';
  filteredTasks.forEach(function(t) {
    let borderStyle = t.isGreenCard ? 'border-left: 6px solid #16a34a;' : 'border-left: 6px solid #3b82f6;';
    let transferBadgeHtml = (t.isTransferred && t.origMachineDisplay) ? `<span class="plan-label" style="background:#f3e8ff; color:#7e22ce; border:1px solid #d8b4fe; font-weight:900; margin-right:6px;">🔄 ПРЕХВЪРЛЕНА ОТ ${t.origMachineDisplay}</span>` : '';
    let priorityBadgeHtml = (t.manualPriority !== null && t.manualPriority !== undefined) ? `<span class="plan-label" style="background:#fee2e2; color:#b91c1c; border:1px solid #fca5a5; font-weight:900; margin-right:6px;">⭐ ПРИОРИТЕТ #${t.manualPriority}</span>` : '';
    let labelHtml = '';
    if (t.isGreenCard) {
        labelHtml = priorityBadgeHtml + transferBadgeHtml + `<span class="plan-label" style="color: #16a34a;">ЗЕЛЕНА КАРТА: ${t.plan_name}</span>`;
    } else if (t.isProba) {
        borderStyle = 'border-left: 6px solid #8b5cf6; background: linear-gradient(180deg, #fcfaff 0%, #f5f3ff 100%);';
        labelHtml = priorityBadgeHtml + transferBadgeHtml + `<span class="plan-label" style="background:#8b5cf6; color:white; font-weight:900; box-shadow:0 2px 4px rgba(139,92,246,0.3);">🧪 ПРОБА: ${t.probaName || t.plan_name}</span>`;
        badgeStyle = 'background-color:#8b5cf6; color:white;';
        actionButtonBg = '#8b5cf6';
        actionButtonShadow = 'rgba(139, 92, 246, 0.3)';
    } else if (t.plan_name === 'КОМПОНЕНТ') {
        labelHtml = priorityBadgeHtml + transferBadgeHtml + `<span class="plan-label">КОМПОНЕНТ</span>`;
    } else {
        labelHtml = priorityBadgeHtml + transferBadgeHtml + `<span class="plan-label">ПЛАН: ${t.plan_name}</span>`;
    }
    let badgeStyle = t.isGreenCard ? 'background-color:#16a34a;' : '';

    let isScrapOnly = (t.pureQty <= 0 && t.scrapAllowance > 0);
    
    let actionButtonBg = '#2563eb';
    let actionButtonShadow = 'rgba(37, 99, 235, 0.2)';

    if (isScrapOnly && !t.isGreenCard) {
        borderStyle = 'border-left: 6px solid #38bdf8;'; // Sky 400 (lighter)
        actionButtonBg = '#38bdf8';
        actionButtonShadow = 'rgba(56, 189, 248, 0.2)';
    }

    if (t.plan_name === "СВРЪХПРОИЗВОДСТВО") {
        borderStyle = 'border-left: 6px solid #7dd3fc;';
        labelHtml = `<span class="plan-label" style="color: #0284c7; font-weight: 900;">⚠️ ${t.plan_name}</span>`;
        badgeStyle = 'background-color:#bae6fd; color: #0c4a6e;';
        actionButtonBg = '#0ea5e9';
        actionButtonShadow = 'rgba(14, 165, 233, 0.2)';
    }

    let partCode = t.name; let internalNameHtml = t.internalName ? `<div class="detail-code">${t.internalName}</div>` : '';
    let linkHtml = t.drawing_link && t.drawing_link.startsWith('http') ? `<a href="${t.drawing_link}" target="_blank">${partCode} 🔗</a>` : partCode;
    var drawingBtnHtml = (t.drawing_link && t.drawing_link.startsWith('http')) ? `<a href="${t.drawing_link}" target="_blank" style="display:inline-block; margin-bottom:12px; margin-right:6px; background:#0284c7; color:white; padding:6px 12px; border-radius:6px; text-decoration:none; font-weight:bold; font-size:12px; box-shadow:0 1px 2px rgba(0,0,0,0.1);">📐 Отвори Чертеж</a>` : '';
    var sopHtml = (t.sop_link && t.sop_link.startsWith('http')) ? `<a href="${t.sop_link}" target="_blank" style="display:inline-block; margin-bottom:12px; background:#f59e0b; color:white; padding:6px 12px; border-radius:6px; text-decoration:none; font-weight:bold; font-size:12px;">📑 Отвори СОП</a>` : '';
    var descHtml = t.desc ? `<div style="background-color: #fef9c3; border-left: 4px solid #eab308; padding: 10px; margin-bottom: 12px; font-size: 13px; color: #854d0e; font-weight: 700; border-radius: 4px;">💡 ${t.desc}</div>` : '';
    var dropoffHtml = t.dropoff ? `<div style="background-color: #f0fdf4; border-left: 4px solid #22c55e; padding: 10px; margin-bottom: 12px; font-size: 13px; color: #166534; font-weight: 700; border-radius: 4px;">📍 Остави на: ${t.dropoff}</div>` : '';
    
    var fetchHtml = '';
    if (t.itemsToFetch && t.itemsToFetch.length > 0) {
        let actualDefaultQty = t.defaultQty > 0 ? t.defaultQty : 1;
        fetchHtml += `<div style="background-color: #fffbeb; border-left: 4px solid #f59e0b; padding: 10px; margin-bottom: 12px; font-size: 13px; color: #92400e; font-weight: 700; border-radius: 4px;">`;
        fetchHtml += `<div style="margin-bottom:5px;">🛒 <b>Вземи компоненти (за ${actualDefaultQty} бр.):</b></div>`;
        fetchHtml += `<ul style="margin: 0; padding-left: 20px;">`;
        t.itemsToFetch.forEach(item => {
            let locStr = item.loc ? ` (📍 ${item.loc})` : '';
            let totalNeeded = item.qty * actualDefaultQty;
            fetchHtml += `<li>${item.code} - ${totalNeeded} бр.${locStr}</li>`;
        });
        fetchHtml += `</ul></div>`;
    }
    
    var bomBadgeHtml = ''; var actionButtonHtml = ''; var inputMaxHtml = t.hasLimit ? `max="${t.maxAllowed}"` : '';
    
    let remainingQty = Math.max(0, t.pureQty);
    let displayNeedHtml = `<span class="qty-badge" style="${badgeStyle}">${remainingQty} бр.</span>`;
    if (t.scrapAllowance > 0) displayNeedHtml += `<span class="qty-badge" style="background-color: #bae6fd; color: #0369a1; border: 2px solid #7dd3fc; margin-left: 5px;">+${t.scrapAllowance} бр.</span>`;

    if (t.isBlocked) {
        let reasonsText = t.blockingReasons.length > 0 ? t.blockingReasons.join(', ') : "Предходни детайли";
        bomBadgeHtml = `<div style="background-color: #fef2f2; border: 1px solid #fecaca; padding: 10px; border-radius: 8px; margin-bottom: 15px; font-size: 13px; color: #991b1b; font-weight: 700; text-align: center;">🚫 Липсва: ${reasonsText}</div>`;
        actionButtonHtml = `
            <div style="display:flex; flex-direction:column; gap:8px;">
                <button disabled style="background-color: #94a3b8; color: white; width: 100%; padding: 14px; font-size: 1.1em; font-weight: 800; border: none; border-radius: 10px;">🛑 БЛОКИРАНА ЗАДАЧА</button>
                <button type="button" id="btnReq_${t.id}" onclick="requestStockMaterialPrompt('${t.id}', '${encodeURIComponent(t.name)}', '${encodeURIComponent(t.op)}', '${encodeURIComponent(reasonsText)}')" style="background-color: #ea580c; color: white; width: 100%; padding: 12px; font-size: 0.95em; font-weight: 800; border: none; border-radius: 10px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; box-shadow: 0 2px 4px rgba(234, 88, 12, 0.3);">
                    <span>🔔 Заяви заготовка от склад</span>
                </button>
            </div>
        `;
    } else if (t.hasLimit) {
        bomBadgeHtml = `<div style="background-color: #dcfce7; border: 1px solid #bbf7d0; padding: 10px; border-radius: 8px; margin-bottom: 15px; font-size: 13px; color: #166534; font-weight: 800; text-align: center;">📦 Възможни: ${t.maxAllowed} бр.</div>`;
        actionButtonHtml = `<button onclick="claimCurrentTaskDOM('${t.id}')" style="background-color: ${actionButtonBg}; color: white; width: 100%; padding: 16px; font-size: 1.15em; font-weight: 800; border: none; border-radius: 10px; cursor:pointer; box-shadow: 0 4px 6px -1px ${actionButtonShadow};">🚀 ПОЕМИ ЗАДАЧА</button>`;
    } else {
        bomBadgeHtml = `<div style="background-color: #e0e7ff; border: 1px solid #c7d2fe; padding: 10px; border-radius: 8px; margin-bottom: 15px; font-size: 13px; color: #3730a3; font-weight: 800; text-align: center;">⚡ Първа стъпка (свободно производство)</div>`;
        actionButtonHtml = `<button onclick="claimCurrentTaskDOM('${t.id}')" style="background-color: ${actionButtonBg}; color: white; width: 100%; padding: 16px; font-size: 1.15em; font-weight: 800; border: none; border-radius: 10px; cursor:pointer; box-shadow: 0 4px 6px -1px ${actionButtonShadow};">🚀 ПОЕМИ ЗАДАЧА</button>`;
    }

    let targetTotal = (parseFloat(t.totalDone) || 0) + (parseFloat(t.pureQty) || 0);
    let pct = targetTotal > 0 ? Math.min(100, Math.round(((parseFloat(t.totalDone) || 0) / targetTotal) * 100)) : 0;
    let progressFillClass = pct >= 100 ? 'task-progress-fill completed' : 'task-progress-fill';
    
    let progressBarHtml = `
      <div class="task-progress-box">
        <div class="task-progress-header">
          <span>Напредък: <b>${pct}%</b></span>
          <span>Изработени: <b>${t.totalDone || 0}</b> от ${targetTotal} бр.</span>
        </div>
        <div class="task-progress-track">
          <div class="${progressFillClass}" style="width: ${pct}%;"></div>
        </div>
      </div>
    `;

    let isFocused = t.isTaken || (typeof activeTaskId !== 'undefined' && t.id === activeTaskId);
    let freeStateStyle = isFocused ? 'display: none;' : 'display: block;';
    let focusStateStyle = isFocused ? 'display: block;' : 'display: none;';

    html += `
      <div class="card" id="card_${t.id}" style="${borderStyle}">
        <div class="task-header">${labelHtml}<div style="display:flex; gap: 6px;">${displayNeedHtml}</div></div>
        <div class="detail-info"><div class="internal-name">${linkHtml}</div>${internalNameHtml}</div>
        <div class="route-flow"><span class="op-active">▶ ${t.op}</span><span class="route-arrow">➔</span><span class="op-pending">${t.next_op}</span></div>
        ${progressBarHtml}
        ${t.isBlocked ? bomBadgeHtml : ''}
        <div id="free_state_${t.id}" style="${freeStateStyle}">${actionButtonHtml}</div>
        <div id="focus_state_${t.id}" style="${focusStateStyle}">
          ${!t.isBlocked ? bomBadgeHtml : ''}
          ${drawingBtnHtml}
          ${sopHtml}
          ${fetchHtml}
          ${descHtml}
          ${dropoffHtml}
          <div style="background-color: #f8fafc; padding: 15px; border-radius: 12px; margin-top: 5px; border: 2px solid #bae6fd;">
            <p style="color: #0369a1; font-weight: 900; text-align:center; margin-top:0; font-size: 1.1em;">🟢 В ПРОЦЕС НА РАБОТА</p>
            <div style="display:flex; justify-content:space-between; margin-bottom: 5px; font-size: 0.85em; font-weight:bold; color: #64748b;"><span>Готови до момента:</span><span>${t.totalDone} бр.</span></div>
            <input type="number" id="qty_${t.id}" min="1" value="" placeholder="${t.defaultQty}" ${inputMaxHtml} inputmode="numeric" style="margin-bottom:15px;">
            <div style="display: flex; gap: 10px;">
              <button class="btn" id="btn_${t.id}" onclick="finishTask('${t.id}', this)">✅ ОТЧЕТИ</button>
              <button class="btn-danger" id="btn_scrap_${t.id}" onclick="reportScrap('${t.id}', this)">БРАК</button>
            </div>
            <button onclick="pauseTaskDOM('${t.id}')" style="background: white; color: #475569; border: 2px solid #cbd5e1; padding: 14px; border-radius: 8px; font-weight: 800; width: 100%; margin-top: 15px; cursor: pointer;">📋 ВРЪЩАНЕ НАЗАД</button>
          </div>
        </div>
      </div>`;
  });
  container.innerHTML = html;
}

let currentRenderedTasksMap = {};

function findUpstreamTargetForBlockedTask(taskObj, fallbackPartName, fallbackOpName, reasonsStr) {
    if (!taskObj) {
        return {
            target_part: fallbackPartName,
            target_op_num: null,
            target_op_name: 'Склад',
            target_machine: 'Склад',
            is_child: false
        };
    }

    const reasonsLower = (reasonsStr || '').toLowerCase();
    const blockingReasonsArr = (taskObj.blockingReasons || []).map(r => String(r).toLowerCase());
    const isPrevOpMissing = reasonsLower.includes('предходна') || 
                            blockingReasonsArr.some(r => r.includes('предходна'));

    const myCodeNorm = normalizeStr(taskObj.name);
    const myRoutes = (typeof globalRoutesByDetail !== 'undefined' && globalRoutesByDetail[myCodeNorm]) ? globalRoutesByDetail[myCodeNorm] : [];
    const curOpNum = parseInt(taskObj.opNum || taskObj.opNumber || 0);
    let curIndex = -1;
    if (myRoutes.length > 0) {
        if (curOpNum > 0) {
            curIndex = myRoutes.findIndex(r => parseInt(r['№ Операция']) === curOpNum);
        }
        if (curIndex === -1 && taskObj.op) {
            curIndex = myRoutes.findIndex(r => normalizeStr(r['Име на операция']) === normalizeStr(taskObj.op));
        }
    }

    // 1. Ако блокирането е заради ПРЕДХОДНА ОПЕРАЦИЯ на същия детайл:
    if (isPrevOpMissing && curIndex > 0) {
        const prevOp = myRoutes[curIndex - 1];
        return {
            target_part: taskObj.name,
            target_op_num: prevOp['№ Операция'],
            target_op_name: prevOp['Име на операция'],
            target_machine: prevOp['Машина'] || 'Обща',
            is_child: false
        };
    }

    // 2. Проверка за липсващ детайл / компонент от BOM:
    if (taskObj.itemsToFetch && taskObj.itemsToFetch.length > 0) {
        let missingItems = [];
        for (const item of taskObj.itemsToFetch) {
            const childCode = String(item.code || '').trim();
            const childCodeNorm = normalizeStr(childCode);
            const childRoutes = (typeof globalRoutesByDetail !== 'undefined' && globalRoutesByDetail[childCodeNorm]) ? globalRoutesByDetail[childCodeNorm] : [];
            
            // Проверка дали НАИСТИНА липсва (наличност 0 или loc съдържа 0бр.):
            const locHasZero = item.loc && (item.loc.includes('0бр.') || item.loc.includes('(0 налични)'));
            const availIsZero = (typeof item.avail !== 'undefined' && item.avail < (item.qty || 1));
            const textMentionsZero = reasonsLower.includes(childCodeNorm) && (
                reasonsLower.includes('0 налични') || 
                reasonsLower.includes('0бр') || 
                reasonsLower.includes(childCodeNorm + ' (0') ||
                locHasZero
            );

            // Ако имаме изрично налични бройки (напр. 99401), НЕ го считаме за липсващ!
            const hasPlentyStock = (typeof item.avail !== 'undefined' && item.avail >= (item.qty || 1)) ||
                                   (item.loc && !item.loc.includes('0бр.') && item.loc.includes('бр.'));
            
            if ((locHasZero || availIsZero || textMentionsZero) && !hasPlentyStock) {
                missingItems.push({
                    code: childCode,
                    norm: childCodeNorm,
                    routes: childRoutes
                });
            }
        }

        // Ако горната проверка не е хванала детайл, но има детайли в itemsToFetch:
        if (missingItems.length === 0 && !isPrevOpMissing) {
            for (const item of taskObj.itemsToFetch) {
                const childCode = String(item.code || '').trim();
                const childCodeNorm = normalizeStr(childCode);
                const childRoutes = (typeof globalRoutesByDetail !== 'undefined' && globalRoutesByDetail[childCodeNorm]) ? globalRoutesByDetail[childCodeNorm] : [];
                missingItems.push({
                    code: childCode,
                    norm: childCodeNorm,
                    routes: childRoutes
                });
            }
        }

        if (missingItems.length > 0) {
            // КРИТИЧНО ВАЖНО: ПРИОРИТЕТ за известие към машина има детайл, който има технологичен маршрут в цеха (routes.length > 0)!
            // Например: ако липсват проводник (склад) и тефлонова макара (машина EMCOTURN E25),
            // сигналът към терминала ЗАДЪЛЖИТЕЛНО отива към EMCOTURN E25!
            const prodItem = missingItems.find(m => m.routes && m.routes.length > 0) || missingItems[0];
            if (prodItem.routes && prodItem.routes.length > 0) {
                const firstOp = prodItem.routes[0];
                return {
                    target_part: prodItem.code,
                    target_op_num: firstOp['№ Операция'],
                    target_op_name: firstOp['Име на операция'],
                    target_machine: firstOp['Машина'] || 'Обща',
                    is_child: true
                };
            } else {
                return {
                    target_part: prodItem.code,
                    target_op_num: null,
                    target_op_name: 'Склад Материали',
                    target_machine: 'Склад',
                    is_child: true
                };
            }
        }
    }

    // 3. Предходна операция на същия детайл:
    if (curIndex > 0) {
        const prevOp = myRoutes[curIndex - 1];
        return {
            target_part: taskObj.name,
            target_op_num: prevOp['№ Операция'],
            target_op_name: prevOp['Име на операция'],
            target_machine: prevOp['Машина'] || 'Обща',
            is_child: false
        };
    }

    // 4. Fallback към Склад
    return {
        target_part: fallbackPartName,
        target_op_num: null,
        target_op_name: 'Склад',
        target_machine: 'Склад',
        is_child: false
    };
}

window.requestStockMaterialPrompt = async function(taskId, encName, encOp, encReasons) {
    const partName = decodeURIComponent(encName || '');
    const opName = decodeURIComponent(encOp || '');
    const reasons = decodeURIComponent(encReasons || '');
    const taskObj = (typeof currentRenderedTasksMap !== 'undefined' && currentRenderedTasksMap[taskId]) 
        || (typeof globalTasks !== 'undefined' ? globalTasks.find(t => String(t.id) === String(taskId)) : null);

    let machine = (typeof currentMachine !== 'undefined' && currentMachine) ? currentMachine : 'Обща';
    if (taskObj && taskObj.machine && (machine === 'Обща' || machine.includes(','))) {
        machine = taskObj.machine;
    }
    const operator = (typeof currentOperator !== 'undefined' && currentOperator) ? currentOperator : 'Оператор';
    const email = (typeof currentOperatorEmail !== 'undefined' && currentOperatorEmail) ? currentOperatorEmail : operator;

    const upstream = findUpstreamTargetForBlockedTask(taskObj, partName, opName, reasons);

    const targetPart = upstream ? upstream.target_part : partName;
    const targetOpNum = upstream ? upstream.target_op_num : null;
    const targetOpName = upstream ? upstream.target_op_name : '';
    const targetMachine = upstream ? upstream.target_machine : 'Склад';

    let routeInfoHtml = '';
    if (targetMachine && targetMachine !== 'Склад') {
        routeInfoHtml = `
            <div style="background:#eff6ff; border:1.5px solid #bfdbfe; border-radius:8px; padding:10px; margin-top:12px; font-size:0.92em; color:#1e40af; text-align:left;">
                👉 <b>Сигналът ще бъде насочен към:</b><br>
                Работно място: <b style="color:#1e3a8a; font-size:1.05em;">${targetMachine}</b>
                ${targetOpNum ? `<br>Операция: <b>Оп. ${targetOpNum} (${targetOpName})</b>` : ''}
                <br>Липсващ детайл: <b>${targetPart}</b>
                <div style="font-size:0.82em; color:#64748b; margin-top:4px;">(И ще се отрази веднага в Админ панела на Планиране)</div>
            </div>
        `;
    } else {
        routeInfoHtml = `
            <div style="background:#eff6ff; border:1px solid #bfdbfe; border-radius:8px; padding:8px; margin-top:10px; font-size:0.88em; color:#1e40af;">
                📦 Сигналът ще бъде изпратен към Склад Материали и Планиране.
            </div>
        `;
    }

    const res = await Swal.fire({
        title: '🔔 Заявка за бройки / заготовка',
        html: `Желаете ли да изпратите сигнал за липсващ детайл/заготовка за:<br><br><b style="color:#0369a1; font-size:1.15em;">${partName}</b><br><span>Текуща операция: <b>${opName}</b></span><br><div style="background:#fef2f2; border:1px solid #fecaca; border-radius:6px; padding:8px; color:#991b1b; font-size:0.9em; margin-top:8px;">Липсва: ${reasons}</div>${routeInfoHtml}`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: '🚀 Да, изпрати сигнала',
        cancelButtonText: 'Отказ',
        confirmButtonColor: '#ea580c'
    });

    if (res.isConfirmed) {
        try {
            const timestamp = new Date().toISOString();
            
            const reqData = {
                task_id: taskId,
                part_name: partName,
                op_name: opName,
                machine: machine,
                operator: operator,
                operator_email: email,
                reasons: reasons,
                status: 'Чакаща',
                created_at: timestamp,
                target_part: targetPart,
                target_op_num: targetOpNum ? String(targetOpNum) : null,
                target_op_name: targetOpName,
                target_machine: targetMachine,
                notes: JSON.stringify({
                    target_part: targetPart,
                    target_op_num: targetOpNum,
                    target_op_name: targetOpName,
                    target_machine: targetMachine,
                    requested_by_machine: machine,
                    requested_by_operator: operator
                })
            };
            
            let insErr = null;
            const res1 = await client.from('material_requests').insert([reqData]);
            if (res1.error) {
                const fallbackData = {
                    task_id: taskId,
                    part_name: partName,
                    op_name: opName,
                    machine: machine,
                    operator: operator,
                    operator_email: email,
                    reasons: reasons,
                    status: 'Чакаща',
                    created_at: timestamp,
                    notes: reqData.notes
                };
                const res2 = await client.from('material_requests').insert([fallbackData]);
                if (res2.error) insErr = res2.error;
            }
            
            if (insErr) {
                console.error('material_requests insert error:', insErr);
                if (insErr.code === '42P01' || (insErr.message && insErr.message.includes('relation'))) {
                    Swal.fire({
                        icon: 'warning',
                        title: 'Таблицата още не е създадена в базата',
                        html: 'За да се записват заявките в таб Планиране, моля изпълнете скрипта <code>setup_material_requests.sql</code> в Supabase SQL Editor на тестовата база.'
                    });
                    return;
                }
                throw insErr;
            }

            const btn = document.getElementById('btnReq_' + taskId);
            if (btn) {
                const nowTime = new Date().toLocaleTimeString('bg-BG', { hour: '2-digit', minute: '2-digit' });
                btn.style.backgroundColor = '#16a34a';
                btn.innerHTML = `<span>⏳ Изпратен сигнал (${nowTime} ч.)</span>`;
                btn.disabled = true;
            }

            const alertTargetText = (targetMachine && targetMachine !== 'Склад')
                ? `Сигналът е изпратен към колегата на работно място "${targetMachine}" и към Планиране!`
                : `Сигналът е изпратен към Склад и Планиране!`;

            Swal.fire({
                icon: 'success',
                title: 'Сигналът е изпратен успешно!',
                text: alertTargetText,
                timer: 3000,
                showConfirmButton: false
            });
        } catch(err) {
            Swal.fire('Грешка при изпращане', err.message, 'error');
        }
    }
};

// ========================================================
// Terminal Andon / Incoming Signal Poller
// ========================================================
let lastAndonCount = 0;

function playAndonChime() {
    try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        const ctx = new AudioCtx();
        if (ctx.state === 'suspended') ctx.resume();
        const now = ctx.currentTime;
        
        const osc1 = ctx.createOscillator();
        const gain1 = ctx.createGain();
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(659.25, now); // E5
        osc1.frequency.setValueAtTime(880.00, now + 0.14); // A5
        gain1.gain.setValueAtTime(0.25, now);
        gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
        osc1.connect(gain1);
        gain1.connect(ctx.destination);
        osc1.start(now);
        osc1.stop(now + 0.55);
    } catch(e) {
        console.warn('Andon audio skipped:', e);
    }
}

function machineMatchesTarget(currentM, targetM) {
    if (!currentM || !targetM) return false;
    const curList = currentM.split(',').map(m => normalizeStr(m)).filter(Boolean);
    const targetList = targetM.split(',').map(m => normalizeStr(m)).filter(Boolean);
    if (targetList.includes('склад')) return curList.includes('склад');
    return curList.some(m => targetList.includes(m));
}

window.acknowledgeTerminalAndon = function(reqId) {
    let ackList = [];
    try {
        ackList = JSON.parse(sessionStorage.getItem('mes_ack_reqs') || '[]');
    } catch(e) {}
    ackList.push(Number(reqId));
    sessionStorage.setItem('mes_ack_reqs', JSON.stringify(ackList));
    const banner = document.getElementById('terminalAndonAlertArea');
    if (banner) banner.style.display = 'none';
};

window.autoResolveAndonForTask = async function(taskData, val) {
    if (!taskData || !taskData.name) return;
    try {
        const taskPartNorm = normalizeStr(taskData.name);
        const { data: pending } = await client
            .from('material_requests')
            .select('*')
            .eq('status', 'Чакаща')
            .limit(20);

        if (pending && pending.length > 0) {
            for (const req of pending) {
                let tPart = req.target_part;
                try {
                    const tObj = JSON.parse(req.notes || '{}');
                    if (tObj.target_part) tPart = tObj.target_part;
                } catch(e) {}

                if (tPart && normalizeStr(tPart) === taskPartNorm) {
                    await client
                        .from('material_requests')
                        .update({
                            status: 'Осигурена',
                            resolved_at: new Date().toISOString(),
                            resolved_by: `${currentOperator || 'Оператор'} (отчетени ${val} бр.)`
                        })
                        .eq('id', req.id);
                }
            }
        }
    } catch(err) {
        console.warn('autoResolveAndonForTask error:', err);
    }
};

async function checkTerminalAndonAlerts() {
    try {
        if (typeof client === 'undefined' || !client) return;
        const banner = document.getElementById('terminalAndonAlertArea');
        if (!banner) return;

        if (!currentMachine || currentMachine.trim() === '') {
            banner.style.display = 'none';
            return;
        }

        const { data, error } = await client
            .from('material_requests')
            .select('*')
            .eq('status', 'Чакаща')
            .order('created_at', { ascending: false })
            .limit(20);

        if (error || !data) return;

        let ackList = [];
        try {
            ackList = JSON.parse(sessionStorage.getItem('mes_ack_reqs') || '[]');
        } catch(e) {}

        const myAlerts = data.filter(req => {
            if (ackList.includes(Number(req.id))) return false;
            
            let tMachine = req.target_machine || '';
            try {
                const tObj = JSON.parse(req.notes || '{}');
                if (tObj.target_machine) tMachine = tObj.target_machine;
            } catch(e) {}

            return machineMatchesTarget(currentMachine, tMachine);
        });

        if (myAlerts.length === 0) {
            banner.innerHTML = '';
            banner.style.display = 'none';
            lastAndonCount = 0;
            return;
        }

        if (myAlerts.length > lastAndonCount) {
            playAndonChime();
        }
        lastAndonCount = myAlerts.length;

        const alertItem = myAlerts[0];
        let tObj = {};
        try { tObj = JSON.parse(alertItem.notes || '{}'); } catch(e) {}
        
        const targetPart = tObj.target_part || alertItem.target_part || alertItem.part_name;
        const targetOpNum = tObj.target_op_num || alertItem.target_op_num || '';
        const targetOpName = tObj.target_op_name || alertItem.target_op_name || '';
        const reqOperator = alertItem.operator || 'Колега от цеха';
        const reqMachine = alertItem.machine || 'работно място';
        const reqOp = alertItem.op_name || '';

        banner.innerHTML = `
            <div class="terminal-andon-alert">
                <div class="andon-header">
                    <div class="andon-title">
                        <span>🔔</span>
                        <span>СПЕШЕН СИГНАЛ ЗА БРОЙКИ ОТ ЦЕХА!</span>
                    </div>
                    <span class="andon-badge">Чакаща операция</span>
                </div>
                <div class="andon-body">
                    Колегата <b>${reqOperator}</b> (машина <b>${reqMachine}</b>${reqOp ? ', оп. ' + reqOp : ''}) 
                    е блокиран и спешно чака за детайл <b style="color:#0369a1; font-size:1.08em;">${targetPart}</b>!
                    <br><br>
                    👉 <b>Към вас:</b> Моля, ако имате изработени бройки на <b>Оп. ${targetOpNum} (${targetOpName})</b>, отчетете ги на терминала, за да отпушите веригата!
                </div>
                <div class="andon-actions">
                    <button type="button" class="andon-ack-btn" onclick="acknowledgeTerminalAndon(${alertItem.id})">
                        👌 Разбрах / Работя по него
                    </button>
                    ${myAlerts.length > 1 ? `<span style="font-size:0.82em; color:#9a3412; font-weight:700;">+ още ${myAlerts.length - 1} сигнала</span>` : ''}
                </div>
            </div>
        `;
        banner.style.display = 'block';
    } catch(err) {
        console.error('checkTerminalAndonAlerts error:', err);
    }
}

if (!window.andonPollInterval) {
    window.andonPollInterval = setInterval(checkTerminalAndonAlerts, 15000);
}
