const server=require('./src/app');const config=require('./src/config');const auth=require('./src/auth');const supabase=require('./src/db');require('./src/seed');

if(config.env==='production'){
  const missing=[];
  if(!config.adminEmail) missing.push('ADMIN_EMAIL');
  if(!config.adminPassword) missing.push('ADMIN_PASSWORD');
  if(missing.length) throw new Error('Production config missing: '+missing.join(', '));
}
auth.setSupabase(supabase);
auth.bootstrapAdmin();
server.listen(config.port,config.host,()=>console.log('FabluX server running at http://'+config.host+':'+config.port));
