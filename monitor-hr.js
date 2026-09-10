const SUPABASE_URL = 'https://zdythzcgcjxwbxufunuh.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpkeXRoemNnY2p4d2J4dWZ1bnVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA2MTcxNTMsImV4cCI6MjA5NjE5MzE1M30.XGZX5DHhJCGz9X5s__3iuSghukjanyJmGKv8MLig_jE';
const client = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

window.onload = async function() {
    const datePicker = document.getElementById('date-picker');
    if (datePicker) {
        datePicker.value = getTodayString();
        datePicker.addEventListener('change', loadData);
    }
    await loadData();
    setInterval(loadData, 15000); 
};

function getTodayString() {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

async function loadData() {
    document.getElementById('loading').style.display = 'flex';
    document.getElementById('main-layout').style.display = 'none';

    try {
        const datePicker = document.getElementById('date-picker');
        const selectedDateStr = datePicker ? datePicker.value : getTodayString();
        
        let nextDay = new Date(selectedDateStr);
        nextDay.setDate(nextDay.getDate() + 1);
        const nextDayStr = nextDay.toISOString().split('T')[0];

        // Fetch exactly within the 24-hour bounds of the selected date
        const [chekiraniyaRes, otchetiRes] = await Promise.all([
            client.from('chekiraniya').select('*').gte('Време', selectedDateStr + 'T00:00:00').lt('Време', nextDayStr + 'T00:00:00').order('Време', { ascending: false }),
            client.from('otcheti').select('*').gte('Дата', selectedDateStr + 'T00:00:00').lt('Дата', nextDayStr + 'T00:00:00').order('Време Старт', { ascending: false })
        ]);

        if (chekiraniyaRes.error) throw chekiraniyaRes.error;
        if (otchetiRes.error) throw otchetiRes.error;

        const chekiraniyaData = chekiraniyaRes.data || [];
        const otchetiData = otchetiRes.data || [];

        renderDashboard(chekiraniyaData, otchetiData);

        document.getElementById('loading').style.display = 'none';
        document.getElementById('main-layout').style.display = 'flex';
    } catch (err) {
        console.error(err);
        document.getElementById('loading').innerHTML = `<div style="color:red;">Грешка при зареждане на данните!</div>`;
    }
}

function renderDashboard(chekiraniyaData, otchetiData) {
    // 1. НА СМЯНА В МОМЕНТА
    let latestCheckins = {};
    chekiraniyaData.forEach(row => {
        let name = String(row['Име'] || row['Имейл'] || '').trim();
        if (!name) return;
        if (!latestCheckins[name]) {
            latestCheckins[name] = row;
        }
    });

    let checkedInUsers = [];
    for (let name in latestCheckins) {
        let row = latestCheckins[name];
        if (row['Действие'] === 'Влизане') {
            checkedInUsers.push({
                name: name,
                time: new Date(row['Време']).toLocaleTimeString('bg-BG')
            });
        }
    }

    checkedInUsers.sort((a, b) => a.name.localeCompare(b.name));
    
    document.getElementById('count-checked').innerText = checkedInUsers.length;
    
    let htmlCheckedIn = '';
    checkedInUsers.forEach(u => {
        htmlCheckedIn += `
            <div class="person-card active">
                <div class="person-name">${u.name}</div>
                <div class="person-time">Влязъл в: ${u.time}</div>
            </div>
        `;
    });
    document.getElementById('w-checked-in').innerHTML = htmlCheckedIn || '<div style="color:#94a3b8; padding:10px;">Няма чекирани хора</div>';

    // 2. АКТИВНИ ЗАДАЧИ
    // Group otcheti by operator to find what they are doing NOW (Status == 'Започната')
    let activeTasks = [];
    let latestTaskPerPerson = {};

    otchetiData.forEach(row => {
        let name = String(row['Оператор'] || '').trim();
        if (!name) return;
        
        if (!latestTaskPerPerson[name]) {
            latestTaskPerPerson[name] = row;
        }
    });

    for (let name in latestTaskPerPerson) {
        let row = latestTaskPerPerson[name];
        if (row['Статус'] === 'Започната') {
            let startTime = new Date(row['Време Старт']);
            let now = new Date();
            let diffMins = Math.floor((now - startTime) / 60000);
            
            let timeStr = diffMins > 60 
                ? `${Math.floor(diffMins/60)} ч. ${diffMins%60} мин.` 
                : `${diffMins} мин.`;

            activeTasks.push({
                operator: name,
                detail: row['ID Детайл'],
                op: row['Операция'],
                time: timeStr
            });
        }
    }

    activeTasks.sort((a, b) => a.operator.localeCompare(b.operator));

    let htmlActiveTasks = '';
    activeTasks.forEach(t => {
        htmlActiveTasks += `
            <div class="task-card">
                <div class="task-operator">👤 ${t.operator}</div>
                <div class="task-detail">Детайл: ${t.detail || '-'}</div>
                <div class="task-op">Оп: ${t.op || '-'}</div>
                <div class="task-time">⏳ Работи от: ${t.time}</div>
            </div>
        `;
    });
    document.getElementById('w-active-tasks').innerHTML = htmlActiveTasks || '<div style="color:#94a3b8; padding:10px;">Няма започнати задачи в момента</div>';


    // 3. ТОП ИЗПЪЛНИТЕЛИ (БРОЙКИ ЗА ДЕНЯ)
    let userProduction = {};
    otchetiData.forEach(row => {
        if (row['Статус'] === 'Отчетено') {
            let name = String(row['Оператор'] || '').trim();
            if (name) {
                userProduction[name] = (userProduction[name] || 0) + (parseFloat(row['Количество']) || 0);
            }
        }
    });

    let leaderboard = Object.keys(userProduction).map(name => ({
        name: name,
        qty: userProduction[name]
    })).sort((a, b) => b.qty - a.qty);

    let htmlLeaderboard = '';
    leaderboard.forEach((user, index) => {
        let rankObj = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${index+1}`;
        htmlLeaderboard += `
            <div class="stat-row">
                <div class="stat-rank">${rankObj}</div>
                <div class="stat-name">${user.name}</div>
                <div class="stat-qty">${user.qty} бр.</div>
            </div>
        `;
    });
    document.getElementById('w-leaderboard').innerHTML = htmlLeaderboard || '<div style="color:#94a3b8; padding:10px;">Няма отчетени бройки днес</div>';
}
