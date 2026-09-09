const https = require('https');

function fetch(path) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'zdythzcgcjxwbxufunuh.supabase.co',
      path: '/rest/v1/' + path,
      method: 'GET',
      headers: {
        'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpkeXRoemNnY2p4d2J4dWZ1bnVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA2MTcxNTMsImV4cCI6MjA5NjE5MzE1M30.XGZX5DHhJCGz9X5s__3iuSghukjanyJmGKv8MLig_jE',
        'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpkeXRoemNnY2p4d2J4dWZ1bnVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA2MTcxNTMsImV4cCI6MjA5NjE5MzE1M30.XGZX5DHhJCGz9X5s__3iuSghukjanyJmGKv8MLig_jE'
      }
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    });
    req.on('error', reject);
    req.end();
  });
}

async function run() {
  const marshruti = await fetch('marshruti?select=*&%D0%9A%D0%BE%D0%B4+%D0%BD%D0%B0+%D0%B4%D0%B5%D1%82%D0%B0%D0%B9%D0%BB%D0%B0=ilike.%D1%88%D0%BF.+8-32');
  console.log('=== MARSHRUTI ===');
  console.log(JSON.stringify(marshruti, null, 2));

  const bom = await fetch('bom?select=*&ID+%D0%A0%D0%BE%D0%B4%D0%B8%D1%82%D0%B5%D0%BB=ilike.%D1%88%D0%BF.+8-32');
  console.log('=== BOM ===');
  console.log(JSON.stringify(bom, null, 2));
}
run();
