const https = require('https');

const data = JSON.stringify({
  query: `
    SELECT
      pg_get_triggerdef(pg_trigger.oid) AS trigger_def
    FROM pg_trigger
    JOIN pg_class ON pg_trigger.tgrelid = pg_class.oid
    WHERE pg_class.relname = 'otcheti';
  `
});

const req = https.request({
  hostname: 'zdythzcgcjxwbxufunuh.supabase.co',
  path: '/rest/v1/rpc/get_trigger_def?table_name=otcheti',
  method: 'POST',
  headers: {
    'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpkeXRoemNnY2p4d2J4dWZ1bnVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA2MTcxNTMsImV4cCI6MjA5NjE5MzE1M30.XGZX5DHhJCGz9X5s__3iuSghukjanyJmGKv8MLig_jE',
    'Content-Type': 'application/json'
  }
}, res => {
  let body = '';
  res.on('data', d => body += d);
  res.on('end', () => console.log(res.statusCode, body));
});
req.write(data);
req.end();
