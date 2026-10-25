const db = require('./db');
const { randomId } = require('./security');
const now = () => new Date().toISOString();

function one(sql, params=[]) { return db.prepare(sql).get(...params); }
function many(sql, params=[]) { return db.prepare(sql).all(...params); }
function run(sql, params=[]) { return db.prepare(sql).run(...params); }
function transaction(fn) { db.exec('BEGIN IMMEDIATE'); try { const result = fn(); db.exec('COMMIT'); return result; } catch (e) { try { db.exec('ROLLBACK'); } catch {} throw e; } }

function seedProducts(products) {
  const count = one('SELECT COUNT(*) AS count FROM products').count;
  if (Number(count)) return;
  const stmt = db.prepare('INSERT INTO products(id,name,price,category,image,active,stock,created_at,updated_at) VALUES(?,?,?,?,?,1,100,?,?)');
  const t = now();
  for (const p of products) stmt.run(String(p.id), p.name, Number(p.price), p.category, p.image, t, t);
}
function getSetting(key, fallback=null) { const row=one('SELECT value FROM settings WHERE key=?',[key]); return row ? row.value : fallback; }
function setSetting(key,value){run('INSERT INTO settings(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at',[key,String(value),now()]);}
module.exports={db,one,many,run,transaction,now,randomId,seedProducts,getSetting,setSetting};
