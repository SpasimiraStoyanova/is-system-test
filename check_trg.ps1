$url = "https://zdythzcgcjxwbxufunuh.supabase.co/rest/v1/rpc/get_trigger_def?table_name=otcheti"
$headers = @{
    "apikey" = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpkeXRoemNnY2p4d2J4dWZ1bnVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA2MTcxNTMsImV4cCI6MjA5NjE5MzE1M30.XGZX5DHhJCGz9X5s__3iuSghukjanyJmGKv8MLig_jE"
}

# we can just try invoking rest method to get any views/functions if there is an endpoint...
# Actually we know what process_inventory_on_delete_otchet has because we saw it in old_migration_fixed.sql
