/**
 * IS-SYSTEMS Automated Weekly Executive Report
 * Sends every Monday at 08:30 AM to sstoyanova.amci@gmail.com
 */

const SUPABASE_URL = 'https://zdythzcgcjxwbxufunuh.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpkeXRoemNnY2p4d2J4dWZ1bnVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA2MTcxNTMsImV4cCI6MjA5NjE5MzE1M30.XGZX5DHhJCGz9X5s__3iuSghukjanyJmGKv8MLig_jE';
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const RECIPIENT_EMAIL = process.env.RECIPIENT_EMAIL || 'sstoyanova.amci@gmail.com';

async function fetchSupabase(table, query = '') {
    const url = `${SUPABASE_URL}/rest/v1/${table}?${query}`;
    const res = await fetch(url, {
        headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json'
        }
    });
    if (!res.ok) {
        throw new Error(`Failed to fetch ${table}: ${res.statusText}`);
    }
    return res.json();
}

async function run() {
    console.log('Generating IS-SYSTEMS Weekly Executive Report...');
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    const startIso = sevenDaysAgo.toISOString();
    const endIso = now.toISOString();
    const next7DaysIso = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const todayStr = now.toISOString().split('T')[0];

    // Fetch data in parallel
    const [otcheti, sklad, inventory, events, personal] = await Promise.all([
        fetchSupabase('otcheti', `Дата=gte.${startIso}&Дата=lte.${endIso}&limit=20000&order=Дата.desc`),
        fetchSupabase('sklad', `limit=20000`),
        fetchSupabase('inventory', `limit=20000`),
        fetchSupabase('factory_events', `limit=20000`),
        fetchSupabase('personal', `limit=500`)
    ]);

    // 1. Calculate Production KPIs
    let totalProduced = 0;
    let totalScrap = 0;
    const itemMap = {};
    const operatorMap = {};

    otcheti.forEach(r => {
        const part = String(r['ID Детайл'] || 'Н/А').trim();
        const qty = parseFloat(r['Количество']) || 0;
        const status = String(r['Статус'] || '').trim();
        const opName = String(r['Оператор'] || 'Неизвестен').trim();
        const isScrap = status === 'Брак' || String(r['Операция'] || '').toLowerCase().includes('брак');

        if (isScrap) {
            totalScrap += qty;
        } else {
            totalProduced += qty;
        }

        if (!itemMap[part]) itemMap[part] = { code: part, produced: 0, scrap: 0, ops: new Set() };
        if (isScrap) itemMap[part].scrap += qty;
        else itemMap[part].produced += qty;
        if (r['Операция']) itemMap[part].ops.add(r['Операция']);

        if (!operatorMap[opName]) operatorMap[opName] = { name: opName, produced: 0, scrap: 0, count: 0 };
        operatorMap[opName].count += 1;
        if (isScrap) operatorMap[opName].scrap += qty;
        else operatorMap[opName].produced += qty;
    });

    const totalWork = totalProduced + totalScrap;
    const scrapPct = totalWork > 0 ? ((totalScrap / totalWork) * 100).toFixed(1) : '0.0';

    // 2. Critical Stock
    const criticalMaterials = [];
    sklad.forEach(s => {
        const stock = parseFloat(s['Остатък']) || 0;
        const minStock = parseFloat(s['Минимално количество']) || 0;
        if (minStock > 0 && stock <= minStock) {
            criticalMaterials.push({
                code: s['ID Детайл'],
                stock,
                minStock,
                deficit: Math.max(0, minStock - stock),
                unit: s['Мерна единица'] || 'бр.'
            });
        }
    });

    const criticalParts = [];
    inventory.forEach(inv => {
        const stock = parseFloat(inv['Общо']) || 0;
        const minStock = parseFloat(inv['Минимално количество/Буфер']) || 0;
        if (minStock > 0 && stock < minStock) {
            criticalParts.push({
                code: inv['ID Детайл'],
                stock,
                minStock,
                deficit: Math.max(0, minStock - stock),
                unit: 'бр.'
            });
        }
    });

    const totalCritical = criticalMaterials.length + criticalParts.length;

    // 3. Maintenance Events
    const upcomingEvents = events.filter(e => {
        if (e.status === 'completed') return false;
        return e.event_date && e.event_date <= next7DaysIso;
    }).sort((a, b) => (a.event_date || '').localeCompare(b.event_date || ''));

    // Top 8 Items
    const topItems = Object.values(itemMap).sort((a, b) => b.produced - a.produced).slice(0, 8);
    const topOperators = Object.values(operatorMap).sort((a, b) => b.produced - a.produced);

    const startBg = sevenDaysAgo.toLocaleDateString('bg-BG');
    const endBg = now.toLocaleDateString('bg-BG');

    // Build Executive HTML Email
    const html = `
<!DOCTYPE html>
<html lang="bg">
<head>
  <meta charset="UTF-8">
  <title>Седмичен отчет IS-SYSTEMS</title>
</head>
<body style="margin:0; padding:0; background-color:#f1f5f9; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color:#1e293b;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f1f5f9; padding:24px 0;">
    <tr>
      <td align="center">
        <table width="650" cellpadding="0" cellspacing="0" style="background:#ffffff; border-radius:12px; overflow:hidden; box-shadow:0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06); border:1px solid #e2e8f0;">
          
          <!-- Header Banner -->
          <tr>
            <td style="background:linear-gradient(135deg, #0f172a 0%, #1e293b 100%); padding:28px 32px; border-bottom:4px solid #0d9488;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <div style="font-size:22px; font-weight:800; color:#ffffff; letter-spacing:-0.5px;">
                      🏭 ИС-СИСТЕМС | Седмична сводка
                    </div>
                    <div style="font-size:14px; color:#94a3b8; margin-top:4px;">
                      Период: <b style="color:#38bdf8;">${startBg} – ${endBg}</b>
                    </div>
                  </td>
                  <td align="right">
                    <span style="background:rgba(13, 148, 136, 0.2); color:#2dd4bf; border:1px solid #0d9488; padding:6px 14px; border-radius:20px; font-size:12px; font-weight:700;">
                      Понеделник 08:30 ч.
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- 4 KPI Cards Grid -->
          <tr>
            <td style="padding:24px 32px 12px 32px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td width="48%" style="padding-bottom:14px;">
                    <div style="background:#f0fdf4; border:1px solid #bbf7d0; border-left:4px solid #10b981; border-radius:8px; padding:14px 16px;">
                      <div style="font-size:11px; font-weight:800; color:#15803d; text-transform:uppercase;">🟢 Произведена продукция</div>
                      <div style="font-size:26px; font-weight:900; color:#047857; margin-top:4px;">${totalProduced.toLocaleString('bg-BG')} <span style="font-size:14px; font-weight:700; color:#64748b;">бр.</span></div>
                      <div style="font-size:11px; color:#64748b; margin-top:2px;">Завършени за изминалата седмица</div>
                    </div>
                  </td>
                  <td width="4%"></td>
                  <td width="48%" style="padding-bottom:14px;">
                    <div style="background:#fef2f2; border:1px solid #fecaca; border-left:4px solid #ef4444; border-radius:8px; padding:14px 16px;">
                      <div style="font-size:11px; font-weight:800; color:#b91c1c; text-transform:uppercase;">⚠️ Регистриран брак</div>
                      <div style="font-size:26px; font-weight:900; color:#991b1b; margin-top:4px;">${totalScrap.toLocaleString('bg-BG')} <span style="font-size:14px; font-weight:700; color:#64748b;">бр. (${scrapPct}%)</span></div>
                      <div style="font-size:11px; color:#64748b; margin-top:2px;">Фира / технологичен дефект</div>
                    </div>
                  </td>
                </tr>
                <tr>
                  <td width="48%">
                    <div style="background:#fffbeb; border:1px solid #fde68a; border-left:4px solid #f59e0b; border-radius:8px; padding:14px 16px;">
                      <div style="font-size:11px; font-weight:800; color:#b45309; text-transform:uppercase;">🚨 Критични наличности</div>
                      <div style="font-size:26px; font-weight:900; color:#92400e; margin-top:4px;">${totalCritical} <span style="font-size:14px; font-weight:700; color:#64748b;">позиции</span></div>
                      <div style="font-size:11px; color:#64748b; margin-top:2px;">${criticalMaterials.length} суровини + ${criticalParts.length} детайла под минимум</div>
                    </div>
                  </td>
                  <td width="4%"></td>
                  <td width="48%">
                    <div style="background:#ecfeff; border:1px solid #a5f3fc; border-left:4px solid #0891b2; border-radius:8px; padding:14px 16px;">
                      <div style="font-size:11px; font-weight:800; color:#0e7490; text-transform:uppercase;">🔧 Сервиз на машини</div>
                      <div style="font-size:26px; font-weight:900; color:#155e75; margin-top:4px;">${upcomingEvents.length} <span style="font-size:14px; font-weight:700; color:#64748b;">задачи</span></div>
                      <div style="font-size:11px; color:#64748b; margin-top:2px;">Предстоящи / належащи в следващите 7 дни</div>
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Section 1: Top Produced Items -->
          <tr>
            <td style="padding:16px 32px;">
              <div style="font-size:15px; font-weight:800; color:#0f172a; margin-bottom:10px; border-bottom:2px solid #e2e8f0; padding-bottom:6px;">
                🏭 Топ изработени детайли за седмицата
              </div>
              <table width="100%" cellpadding="8" cellspacing="0" style="border-collapse:collapse; font-size:13px;">
                <tr style="background:#f8fafc; color:#64748b; font-size:11px; text-transform:uppercase; font-weight:700; text-align:left;">
                  <th style="border-bottom:2px solid #e2e8f0;">Детайл</th>
                  <th style="border-bottom:2px solid #e2e8f0; text-align:center;">Произведено</th>
                  <th style="border-bottom:2px solid #e2e8f0; text-align:center;">Брак</th>
                  <th style="border-bottom:2px solid #e2e8f0; text-align:center;">% Брак</th>
                </tr>
                ${topItems.length > 0 ? topItems.map(it => {
                    const itTotal = it.produced + it.scrap;
                    const itPct = itTotal > 0 ? ((it.scrap / itTotal) * 100).toFixed(1) : '0';
                    return `
                      <tr style="border-bottom:1px solid #f1f5f9;">
                        <td style="font-weight:700; color:#1e293b;">${it.code}</td>
                        <td style="text-align:center; font-weight:800; color:#047857;">${it.produced.toLocaleString('bg-BG')} бр.</td>
                        <td style="text-align:center; color:${it.scrap > 0 ? '#b91c1c' : '#94a3b8'}; font-weight:bold;">${it.scrap} бр.</td>
                        <td style="text-align:center; color:${parseFloat(itPct) > 2 ? '#b91c1c' : '#64748b'}; font-weight:bold;">${itPct}%</td>
                      </tr>
                    `;
                }).join('') : '<tr><td colspan="4" style="text-align:center; padding:15px; color:#94a3b8;">Няма отчетена продукция за периода.</td></tr>'}
              </table>
            </td>
          </tr>

          <!-- Section 2: Critical Materials to Order -->
          ${criticalMaterials.length > 0 ? `
          <tr>
            <td style="padding:16px 32px;">
              <div style="font-size:15px; font-weight:800; color:#92400e; margin-bottom:10px; border-bottom:2px solid #fef3c7; padding-bottom:6px;">
                🚨 Спешни материали за доставка (под минимум)
              </div>
              <table width="100%" cellpadding="8" cellspacing="0" style="border-collapse:collapse; font-size:13px;">
                <tr style="background:#fffbeb; color:#92400e; font-size:11px; text-transform:uppercase; font-weight:700; text-align:left;">
                  <th style="border-bottom:2px solid #fde68a;">Материал / Прът</th>
                  <th style="border-bottom:2px solid #fde68a; text-align:center;">Текуща наличност</th>
                  <th style="border-bottom:2px solid #fde68a; text-align:center;">Буфер</th>
                  <th style="border-bottom:2px solid #fde68a; text-align:center;">Недостиг</th>
                </tr>
                ${criticalMaterials.slice(0, 6).map(m => `
                  <tr style="border-bottom:1px solid #fef3c7;">
                    <td style="font-weight:700; color:#1e293b;">${m.code}</td>
                    <td style="text-align:center; font-weight:800; color:#b91c1c;">${m.stock.toLocaleString('bg-BG')} ${m.unit}</td>
                    <td style="text-align:center; color:#64748b;">${m.minStock.toLocaleString('bg-BG')} ${m.unit}</td>
                    <td style="text-align:center; font-weight:bold; color:#b91c1c;">-${m.deficit.toLocaleString('bg-BG')} ${m.unit}</td>
                  </tr>
                `).join('')}
              </table>
            </td>
          </tr>
          ` : ''}

          <!-- Section 3: Upcoming Maintenance -->
          ${upcomingEvents.length > 0 ? `
          <tr>
            <td style="padding:16px 32px;">
              <div style="font-size:15px; font-weight:800; color:#0e7490; margin-bottom:10px; border-bottom:2px solid #cffafe; padding-bottom:6px;">
                🔧 Предстоящи сервизи и прегледи на машини
              </div>
              <table width="100%" cellpadding="8" cellspacing="0" style="border-collapse:collapse; font-size:13px;">
                <tr style="background:#ecfeff; color:#0e7490; font-size:11px; text-transform:uppercase; font-weight:700; text-align:left;">
                  <th style="border-bottom:2px solid #a5f3fc;">Дата</th>
                  <th style="border-bottom:2px solid #a5f3fc;">Машина / Обект</th>
                  <th style="border-bottom:2px solid #a5f3fc;">Задача</th>
                  <th style="border-bottom:2px solid #a5f3fc; text-align:right;">Приоритет</th>
                </tr>
                ${upcomingEvents.slice(0, 4).map(e => `
                  <tr style="border-bottom:1px solid #cffafe;">
                    <td style="font-weight:700; color:${e.event_date < todayStr ? '#b91c1c' : '#1e293b'};">${e.event_date || '—'}</td>
                    <td style="font-weight:700; color:#4338ca;">${e.machine_name}</td>
                    <td>${e.title}</td>
                    <td style="text-align:right; font-weight:bold; color:#b91c1c;">${e.priority || 'Нормален'}</td>
                  </tr>
                `).join('')}
              </table>
            </td>
          </tr>
          ` : ''}

          <!-- Action Button in Email -->
          <tr>
            <td align="center" style="padding:24px 32px;">
              <a href="https://spasimirastoyanova.github.io/is-system-test/admin.html" target="_blank" style="background:#0d9488; color:#ffffff; text-decoration:none; padding:12px 28px; border-radius:8px; font-weight:800; font-size:14px; display:inline-block; box-shadow:0 2px 4px rgba(13, 148, 136, 0.3);">
                🔗 Отвори Административния Панел
              </a>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f8fafc; padding:20px 32px; border-top:1px solid #e2e8f0; font-size:12px; color:#94a3b8; text-align:center;">
              Този имейл е генериран автоматично за <b>${RECIPIENT_EMAIL}</b> от облачната система IS-SYSTEMS MES/ERP.<br>
              График на изпращане: Всеки понеделник в 08:30 ч.
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;

    console.log(`Sending email to ${RECIPIENT_EMAIL} via Resend...`);

    const resendRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${RESEND_API_KEY}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            from: 'IS-SYSTEMS <onboarding@resend.dev>',
            to: [RECIPIENT_EMAIL],
            subject: `📊 IS-SYSTEMS Седмичен оперативен отчет (${startBg} – ${endBg})`,
            html: html
        })
    });

    const resendData = await resendRes.json();
    if (!resendRes.ok) {
        throw new Error(`Resend API error: ${JSON.stringify(resendData)}`);
    }

    console.log('SUCCESS! Email sent successfully. ID:', resendData.id);
}

run().catch(err => {
    console.error('ERROR in weekly report:', err);
    process.exit(1);
});
