// Valori pubblici per costruzione: la chiave anon funziona solo insieme alla Row Level Security.
export const CONFIG = Object.freeze({
  appName: 'ai-deep-endenti',
  supabaseUrl: 'https://ixhnqeabctkpflwkdarj.supabase.co',
  supabaseAnonKey:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml4aG5xZWFiY3RrcGZsd2tkYXJqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIzMjUwNzYsImV4cCI6MjEwNzkwMTA3Nn0.YTx78AgQHOdvKrygiwP6URDQM2aeCjUGrvCtPJXlCqU',
  claudeFunction: 'claude',
  notifyFunction: 'notify',
  idleLogoutMinutes: 240,
  activityPingMinutes: 5,
});
