import re

with open('monitor-montaj.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace drawDashboard
new_draw_dashboard = """
function drawDashboard(jsonString) {
    if (!jsonString) return;
    const data = JSON.parse(jsonString);
    if (data.error) { document.getElementById('error-box').innerText = data.error; return; }

    document.getElementById('loading').style.display = 'none';
    globalConnections = data.connections || [];
    
    domIdMap = {};
    domIdCounter = 0;

    const allNodesMap = {};
    if (data.nodes) {
        Object.values(data.nodes).forEach(bucket => {
            if(Array.isArray(bucket)) bucket.forEach(n => allNodesMap[n.id] = n);
        });
    }
    
    const childMap = {}; 
    const parentMap = {};
    globalConnections.forEach(c => {
        if (!childMap[c.to]) childMap[c.to] = [];
        childMap[c.to].push(c.from);
        parentMap[c.from] = c.to;
    });

    const renderFamilyBOMBucket = (nodeArray, containerId) => {
        const container = document.getElementById(containerId);
        if (!container) return;
        if (!nodeArray || !Array.isArray(nodeArray) || nodeArray.length === 0) {
            container.innerHTML = '';
            return;
        }

        // We skip family grouping for simplicity and just render all nodes in a grid
        // But to keep it similar, we group by planMonth
        const plans = {};
        nodeArray.forEach(n => {
            if (!plans[n.planMonth]) plans[n.planMonth] = [];
            plans[n.planMonth].push(n);
        });
        
        let finalHTML = '';

        for (const [planMonth, nodes] of Object.entries(plans)) {
            let planHTML = `<div class="plan-group" style="width: 100%;"><div class="plan-label">ПЛАН: ${planMonth}</div>`;
            planHTML += `<div class="family-row" style="flex-wrap: wrap;">`;
            
            nodes.forEach(n => {
                planHTML += `<div class="node-column">` + generateNodeHTML(n, parentMap, childMap, allNodesMap) + `</div>`;
            });
            
            planHTML += `</div></div>`;
            finalHTML += planHTML;
        }
        container.innerHTML = finalHTML;
    };

    let variant = new URLSearchParams(window.location.search).get('v');
    if (variant) {
        document.getElementById('monitorTitle').innerText = 'МОНИТОР МОНТАЖ (ВАР. ' + variant + ')';
    }

    // Level 1
    let assemblyNodes = data.nodes.assembly || [];
    if (variant) {
        assemblyNodes = assemblyNodes.filter(n => n.name && n.name.includes(variant));
    }
    renderFamilyBOMBucket(assemblyNodes, 'w-level1');

    // Level 2 (Зареждане)
    let level2Nodes = [];
    let level2Set = new Set();
    
    // BFS to find Зареждане nodes
    let queue = assemblyNodes.map(n => n.id);
    let visited = new Set(queue);
    
    while(queue.length > 0) {
        let curr = queue.shift();
        let children = childMap[curr] || [];
        children.forEach(childId => {
            let childNode = allNodesMap[childId];
            if (childNode) {
                if (childNode.op && childNode.op.toLowerCase().includes("зареждане")) {
                    if (!level2Set.has(childNode.id)) {
                        level2Set.add(childNode.id);
                        level2Nodes.push(childNode);
                    }
                } else {
                    if (!visited.has(childId)) {
                        visited.add(childId);
                        queue.push(childId);
                    }
                }
            }
        });
    }
    
    renderFamilyBOMBucket(level2Nodes, 'w-level2');

    // Level 3 (Готови деца на Зареждане)
    let level3Nodes = [];
    let level3Set = new Set();
    
    level2Nodes.forEach(n2 => {
        let children = childMap[n2.id] || [];
        children.forEach(childId => {
            let childNode = allNodesMap[childId];
            if (childNode && !level3Set.has(childNode.id)) {
                level3Set.add(childNode.id);
                level3Nodes.push(childNode);
            }
        });
    });
    
    renderFamilyBOMBucket(level3Nodes, 'w-level3');

    drawArrows();
}
"""

content = re.sub(r'function drawDashboard\(jsonString\)\s*\{.*?\nfunction generateNodeHTML', new_draw_dashboard + '\nfunction generateNodeHTML', content, flags=re.DOTALL)

with open('monitor-montaj.js', 'w', encoding='utf-8') as f:
    f.write(content)

print("Done patching monitor-montaj.js")
