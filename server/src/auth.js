const repo = require('./repository');
const { hashPassword, verifyPassword, randomId, token, tokenHash } = require('./security');
const config = require('./config');
const { sendPasswordResetEmail } = require('./mailer');

function publicUser(u){ return {id:u.id,email:u.email,name:u.name,phone:u.phone,role:u.role,createdAt:u.created_at}; }
function createSession(userId){ const raw=token(); const expires=new Date(Date.now()+config.sessionTtlDays*86400000).toISOString(); repo.run('INSERT INTO sessions(id,user_id,token_hash,expires_at,created_at) VALUES(?,?,?,?,?)',[randomId('ses'),userId,tokenHash(raw),expires,repo.now()]); return {token:raw,expiresAt:expires}; }
function findUserByToken(raw){ if(!raw)return null; const row=repo.one('SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?',[tokenHash(raw),repo.now()]); return row || null; }
function authFromRequest(req){ const header=req.headers.authorization||''; return findUserByToken(header.startsWith('Bearer ')?header.slice(7).trim():null); }
function register({name,email,phone,password}){
 email=String(email||'').trim().toLowerCase(); name=String(name||'').trim(); phone=String(phone||'').trim();
 if(name.length<2) throw Object.assign(new Error('Name is required.'),{status:400});
 if(!/^\S+@\S+\.\S+$/.test(email)) throw Object.assign(new Error('Enter a valid email address.'),{status:400});
 if(String(password||'').length<8) throw Object.assign(new Error('Password must be at least 8 characters.'),{status:400});
 if(repo.one('SELECT id FROM users WHERE email=?',[email])) throw Object.assign(new Error('An account with that email already exists.'),{status:409});
 const id=randomId('usr'); const t=repo.now(); repo.run('INSERT INTO users(id,email,password_hash,name,phone,role,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)',[id,email,hashPassword(password),name,phone,'customer',t,t]);
 const user=repo.one('SELECT * FROM users WHERE id=?',[id]); return {user:publicUser(user),...createSession(id)};
}
function login({email,password}){ const u=repo.one('SELECT * FROM users WHERE email=?',[String(email||'').trim().toLowerCase()]); if(!u||!verifyPassword(String(password||''),u.password_hash)) throw Object.assign(new Error('Invalid email or password.'),{status:401}); return {user:publicUser(u),...createSession(u.id)}; }
function logout(raw){ if(raw)repo.run('DELETE FROM sessions WHERE token_hash=?',[tokenHash(raw)]); }
function requireUser(req){ const u=authFromRequest(req); if(!u) throw Object.assign(new Error('Authentication required.'),{status:401}); return u; }
function requireAdmin(req){ const u=requireUser(req); if(u.role!=='admin') throw Object.assign(new Error('Admin access required.'),{status:403}); return u; }

async function requestPasswordReset(email){
 email=String(email||'').trim().toLowerCase();
 if(!/^\S+@\S+\.\S+$/.test(email)) throw Object.assign(new Error('Enter a valid email address.'),{status:400});
 const user=repo.one('SELECT * FROM users WHERE email=?',[email]);
 // Do not reveal whether an account exists.
 if(!user) return {ok:true};
 repo.run('DELETE FROM password_resets WHERE user_id=? OR expires_at<=?',[user.id,repo.now()]);
 const raw=token(); const expires=new Date(Date.now()+config.resetTokenMinutes*60000).toISOString();
 repo.run('INSERT INTO password_resets(id,user_id,token_hash,expires_at,created_at) VALUES(?,?,?,?,?)',[randomId('rst'),user.id,tokenHash(raw),expires,repo.now()]);
 const resetUrl=`${config.appBaseUrl.replace(/\/$/,'')}/reset-password.html?token=${encodeURIComponent(raw)}`;
 try { await sendPasswordResetEmail({to:user.email,name:user.name,resetUrl}); }
 catch(err){ repo.run('DELETE FROM password_resets WHERE token_hash=?',[tokenHash(raw)]); throw Object.assign(new Error('We could not send the reset email right now. Please try again later.'),{status:503}); }
 return {ok:true};
}
function resetPassword(raw,newPassword){
 raw=String(raw||'').trim(); newPassword=String(newPassword||'');
 if(!raw) throw Object.assign(new Error('Reset token is required.'),{status:400});
 if(newPassword.length<8) throw Object.assign(new Error('Password must be at least 8 characters.'),{status:400});
 const row=repo.one('SELECT * FROM password_resets WHERE token_hash=? AND used_at IS NULL AND expires_at>?',[tokenHash(raw),repo.now()]);
 if(!row) throw Object.assign(new Error('This reset link is invalid or has expired.'),{status:400});
 const hash=hashPassword(newPassword); const t=repo.now();
 repo.transaction(()=>{repo.run('UPDATE users SET password_hash=?,updated_at=? WHERE id=?',[hash,t,row.user_id]);repo.run('UPDATE password_resets SET used_at=? WHERE id=?',[t,row.id]);repo.run('DELETE FROM sessions WHERE user_id=?',[row.user_id]);});
 return {ok:true};
}

function bootstrapAdmin(){
 if(!config.adminEmail || !config.adminPassword) return;
 const existing=repo.one('SELECT id FROM users WHERE email=?',[config.adminEmail]);
 if(existing){repo.run('UPDATE users SET role=? WHERE email=?',['admin',config.adminEmail]);return;}
 const t=repo.now(); repo.run('INSERT INTO users(id,email,password_hash,name,phone,role,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)',[randomId('usr'),config.adminEmail,hashPassword(config.adminPassword),'FabluX Admin','', 'admin',t,t]);
}
module.exports={publicUser,authFromRequest,requireUser,requireAdmin,register,login,logout,requestPasswordReset,resetPassword,bootstrapAdmin};
