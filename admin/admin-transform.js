let transformSourceData = [];
let bomDataForTransform = [];
let nomenclatureDataForTransform = [];
let transformAvailableQty = 0;
let currentSourceResolver = null;

async function openTransformModal() {
    document.getElementById('transformModalBackdrop').style.display = 'flex';
    document.getElementById('transQtyInput').value = '';
    document.getElementById('transTargetSelect').innerHTML = '<option value="">-- Изберете Цел --</option>';
    document.getElementById('transTargetSelect').disabled = true;
    
    let btn = document.getElementById('transformResolverBtn');
    let oldBtnText = btn ? btn.innerText : '🔄 Трансформация';
    if(btn) { btn.innerText = 'Зареждане...'; btn.disabled = true; }
    
    try {
        // 1. Fetch current inventory with pagination, filter locally
        let invData = [];
        let from = 0; const step = 1000;
        while(true) {
            let { data } = await client.from('inventory').select('*').range(from, from + step - 1);
            if (!data || data.length === 0) break;
            invData.push(...data);
            if (data.length < step) break;
            from += step;
        }
        
        transformSourceData = invData.filter(item => 
            String(item['ID Детайл'] || '').includes('#') && 
            parseFloat(item['Свободни'] !== undefined ? item['Свободни'] : (item['Общо'] || 0)) > 0
        );
        
        // Fetch Номенклатура locally filtering by #
        let nomData = [];
        from = 0;
        while(true) {
            let { data } = await client.from('Номенклатура').select('*').range(from, from + step - 1);
            if (!data || data.length === 0) break;
            nomData.push(...data);
            if (data.length < step) break;
            from += step;
        }
        
        // Filter loosely by type and #
        nomData = nomData.filter(n => String(n['ID Детайл'] || '').includes('#') && String(n['Тип'] || '').trim().toLowerCase().includes('резолвер'));
        nomenclatureDataForTransform = nomData;
        
        let validResolverIds = new Set(nomData.map(n => String(n['ID Детайл']).trim().toLowerCase()));
        
        transformSourceData = transformSourceData.filter(item => validResolverIds.has(String(item['ID Детайл']).trim().toLowerCase()));
        
        // Populate Source Dropdown
        let uniqueSourceIds = [...new Set(transformSourceData.map(item => item['ID Детайл']))].sort();
        let sourceSelect = document.getElementById('transSourceSelect');
        sourceSelect.innerHTML = '<option value="">-- Изберете Източник --</option>';
        uniqueSourceIds.forEach(id => {
            let opt = document.createElement('option'); opt.value = id; opt.innerText = id;
            sourceSelect.appendChild(opt);
        });
        
        // Fetch BOM once to be ready for fast checking
        bomDataForTransform = [];
        from = 0;
        while(true) {
            let { data } = await client.from('bom').select('*').range(from, from + step - 1);
            if (!data || data.length === 0) break;
            bomDataForTransform.push(...data);
            if (data.length < step) break;
            from += step;
        }
        
        bomDataForTransform = bomDataForTransform.filter(b => String(b['ID Родител'] || '').includes('#'));
        
        document.getElementById('transOpSelect').innerHTML = '<option value="">-- Изберете Операция --</option>';
        document.getElementById('transMaxQty').innerText = '0';
    } catch (e) {
        console.error("Грешка при зареждане:", e);
    } finally {
        if(btn) { btn.innerText = oldBtnText; btn.disabled = false; }
    }
}

function onTransformSourceChange() {
    let sourceId = document.getElementById('transSourceSelect').value;
    let opSelect = document.getElementById('transOpSelect');
    opSelect.innerHTML = '<option value="">-- Изберете Операция --</option>';
    document.getElementById('transMaxQty').innerText = '0';
    document.getElementById('transTargetSelect').innerHTML = '<option value="">-- Изберете Цел --</option>';
    document.getElementById('transTargetSelect').disabled = true;
    
    if (!sourceId) return;
    
    let ops = transformSourceData.filter(item => item['ID Детайл'] === sourceId);
    ops.forEach(item => {
        let opt = document.createElement('option');
        opt.value = item['Операция'];
        opt.innerText = `${item['Операция']} (Свободни: ${item['Свободни'] || item['Общо']} бр.)`;
        opSelect.appendChild(opt);
    });
    
    if (ops.length === 1) {
        opSelect.value = ops[0]['Операция'];
        onTransformOpChange();
    }
}

function onTransformOpChange() {
    let sourceId = document.getElementById('transSourceSelect').value;
    let op = document.getElementById('transOpSelect').value;
    
    if (!sourceId || !op) {
        document.getElementById('transMaxQty').innerText = '0';
        return;
    }
    
    let item = transformSourceData.find(x => x['ID Детайл'] === sourceId && x['Операция'] === op);
    if (item) {
        transformAvailableQty = parseFloat(item['Свободни'] || item['Общо'] || 0);
        document.getElementById('transMaxQty').innerText = transformAvailableQty;
        document.getElementById('transQtyInput').value = transformAvailableQty;
        currentSourceResolver = item;
        
        findCompatibleTargets(sourceId);
    }
}

function findCompatibleTargets(sourceId) {
    let targetSelect = document.getElementById('transTargetSelect');
    targetSelect.innerHTML = '<option value="">Определяне на съвместимост...</option>';
    
    // 1. Get Source BOM children
    let sourceChildren = bomDataForTransform.filter(b => String(b['ID Родител']).trim().toLowerCase() === String(sourceId).trim().toLowerCase());
    
    if (sourceChildren.length === 0) {
        targetSelect.innerHTML = '<option value="">⚠️ Този източник няма въведен BOM. Трансформацията е невъзможна.</option>';
        targetSelect.disabled = true;
        return;
    }
    
    // Sort and normalize source children string for exact matching
    let sourceFingerprint = sourceChildren.map(c => `${String(c['ID Компонент']).trim().toLowerCase()}|${parseFloat(c['Количество'])}`).sort().join('||');
    
    let compatibleTargets = [];
    
    // 2. Check all other # resolvers
    nomenclatureDataForTransform.forEach(nom => {
        let targetId = String(nom['ID Детайл']).trim();
        if (targetId.toLowerCase() === String(sourceId).trim().toLowerCase()) return; // Skip self
        
        let targetChildren = bomDataForTransform.filter(b => String(b['ID Родител']).trim().toLowerCase() === targetId.toLowerCase());
        
        // Must have exact same number of children
        if (targetChildren.length !== sourceChildren.length) return;
        
        let targetFingerprint = targetChildren.map(c => `${String(c['ID Компонент']).trim().toLowerCase()}|${parseFloat(c['Количество'])}`).sort().join('||');
        
        if (sourceFingerprint === targetFingerprint) {
            compatibleTargets.push(targetId);
        }
    });
    
    if (compatibleTargets.length === 0) {
        targetSelect.innerHTML = '<option value="">⚠️ Няма други резолвери с абсолютно същия BOM!</option>';
        targetSelect.disabled = true;
        return;
    }
    
    targetSelect.innerHTML = '<option value="">-- Изберете Цел --</option>';
    compatibleTargets.forEach(tId => {
        let opt = document.createElement('option');
        opt.value = tId;
        opt.innerText = tId;
        targetSelect.appendChild(opt);
    });
    
    targetSelect.disabled = false;
}

async function executeTransformation() {
    let sourceId = document.getElementById('transSourceSelect').value;
    let op = document.getElementById('transOpSelect').value;
    let qty = parseFloat(document.getElementById('transQtyInput').value);
    let targetId = document.getElementById('transTargetSelect').value;
    
    if (!sourceId || !op || !targetId || isNaN(qty) || qty <= 0) {
        Swal.fire('Грешка', 'Моля, попълнете всички полета коректно!', 'error');
        return;
    }
    
    if (qty > transformAvailableQty) {
        Swal.fire('Грешка', `Количеството (${qty}) надвишава наличното (${transformAvailableQty})!`, 'error');
        return;
    }
    
    if (!confirm(`Потвърждавате ли трансформация на ${qty} бр.\nОт: ${sourceId}\nКъм: ${targetId}\nНа операция: ${op}?`)) return;
    
    // Loading state
    let btn = event.target;
    let oldBtnText = btn.innerText;
    btn.innerText = 'Обработка...';
    btn.disabled = true;
    
    try {
        // 1. Deduct from Source
        let newSourceQty = transformAvailableQty - qty;
        let updatePayload = {
            'Общо': newSourceQty
        };
        // If Свободни exists, update it too
        if (currentSourceResolver['Свободни'] !== undefined) {
            updatePayload['Свободни'] = parseFloat(currentSourceResolver['Свободни']) - qty;
        }
        
        let { error: err1 } = await client.from('inventory').update(updatePayload).eq('id', currentSourceResolver.id);
        if (err1) throw err1;
        
        // 2. Add to Target
        // Check if target already exists at this op in inventory
        let { data: targetExists } = await client.from('inventory')
                                           .select('*')
                                           .eq('ID Детайл', targetId)
                                           .eq('Операция', op);
                                           
        if (targetExists && targetExists.length > 0) {
            // Update existing
            let targetRec = targetExists[0];
            let tObsho = parseFloat(targetRec['Общо'] || 0) + qty;
            let tUpdate = { 'Общо': tObsho };
            if (targetRec['Свободни'] !== undefined) {
                tUpdate['Свободни'] = parseFloat(targetRec['Свободни'] || 0) + qty;
            }
            let { error: err2 } = await client.from('inventory').update(tUpdate).eq('id', targetRec.id);
            if (err2) throw err2;
        } else {
            // Get Target Name from Nomenclature
            let tNom = nomenclatureDataForTransform.find(n => String(n['ID Детайл']).trim().toLowerCase() === targetId.toLowerCase());
            let tName = tNom ? tNom['Вътрешно име'] : targetId;
            
            // Insert new
            let { error: err3 } = await client.from('inventory').insert([{
                'ID Детайл': targetId,
                'Име': tName,
                'Операция': op,
                'Общо': qty,
                'Свободни': qty,
                'Запазени': '[]',
                'Локация': 'WIP (Трансформация)'
            }]);
            if (err3) throw err3;
        }
        
        // 3. Log to Otcheti for traceability (as an Admin action)
        await client.from('otcheti').insert([{
            'ID Детайл': targetId,
            'Операция': op,
            'Количество': qty,
            'Статус': 'Отчетено',
            'Оператор': 'АДМИН (Трансформация)',
            'ID План': `TRANSFORM FROM ${sourceId}`,
            'Дата': new Date().toISOString()
        }]);
        
        // Log the negative from source just in case we need history
        await client.from('otcheti').insert([{
            'ID Детайл': sourceId,
            'Операция': op,
            'Количество': -qty,
            'Статус': 'Отчетено',
            'Оператор': 'АДМИН (Трансформация)',
            'ID План': `TRANSFORM TO ${targetId}`,
            'Дата': new Date().toISOString()
        }]);
        
        Swal.fire('Успех!', 'Трансформацията е завършена.', 'success');
        document.getElementById('transformModalBackdrop').style.display = 'none';
        
        // Refresh table if needed
        if (typeof loadCurrentTableData === 'function') {
            loadCurrentTableData();
        }
        
    } catch(err) {
        Swal.fire('Грешка при запис', err.message, 'error');
    } finally {
        btn.innerText = oldBtnText;
        btn.disabled = false;
    }
}
