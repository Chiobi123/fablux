const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');const repo=require('./repository');const auth=require('./auth');
function loadProducts(){const file=path.join(__dirname,'..','..','js','products-data.js');const ctx={window:{}};vm.createContext(ctx);vm.runInContext(fs.readFileSync(file,'utf8'),ctx);return ctx.window.FAB_PRODUCTS||[];}
repo.seedProducts(loadProducts());
repo.setSetting('marketplace_enabled', repo.getSetting('marketplace_enabled','0'));
auth.bootstrapAdmin();
