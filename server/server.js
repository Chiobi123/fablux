const server=require('./src/app');const config=require('./src/config');const auth=require('./src/auth');require('./src/seed');

if(config.env==='production'){
  const missing=[];
  if(!config.adminEmail) missing.push('ADMIN_EMAIL');
  if(!config.adminPassword || config.adminPassword.length<16) missing.push('ADMIN_PASSWORD (16+ characters)');
  if(!config.appBaseUrl.startsWith('https://')) missing.push('APP_BASE_URL (HTTPS URL)');
  if(!config.paystackSecretKey) console.warn('[FabluX] PAYSTACK_SECRET_KEY is not configured; card payments are disabled.');
  if(config.emailProvider==='none') console.warn('[FabluX] EMAIL_PROVIDER is not configured; transactional email is disabled.');
  if(missing.length) throw new Error(`Production configuration incomplete: ${missing.join(', ')}`);
}
auth.bootstrapAdmin();
server.listen(config.port,config.host,()=>console.log(`FabluX server running at http://${config.host}:${config.port}`));
