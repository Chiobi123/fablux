// Supabase Auth Module
// Integrates with Supabase Authentication for user management
const supabase = require('../db');
const { hashPassword, verifyPassword, randomId, token, tokenHash } = require('./security');
const config = require('./config');
const { sendPasswordResetEmail } = require('./mailer');

// Public user format
function publicUser(u) { return { id: u.id, email: u.email, name: u.name, phone: u.phone, role: u.role, createdAt: u.created_at }; }

// Set Supabase client (called from server.js)
let supabaseClient = null;
module.exports.setSupabase = (client) => { supabaseClient = client; };

// Register a new user with Supabase Auth (async)
async function registerAsync({ name, email, phone, password }) {
  // ... implementation
}

// Login with Supabase Auth (async)
async function loginAsync({ email, password }) {
  // ... implementation
}

// Logout
function logout(raw) {
  if (raw) supabaseClient.from('sessions').delete().eq('token_hash', tokenHash(raw));
  supabaseClient.auth.signOut();
}

// Get user from request (sync - uses stored token)
function authFromRequest(req) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return null;
  const raw = header.slice(7).trim();
  // Sync version - checks if token exists in sessions table
  // For full Supabase auth, use: supabaseClient.auth.getUser(raw)
  // Here we check local sessions for simplicity
  return null; // Placeholder - full implementation requires async
}

// Require authenticated user
function requireUser(req) {
  const u = authFromRequest(req);
  if (!u) throw Object.assign(new Error('Authentication required.'), { status: 401 });
  return u;
}

// Require admin user
function requireAdmin(req) {
  const u = requireUser(req);
  if (u.role !== 'admin') throw Object.assign(new Error('Admin access required.'), { status: 403 });
  return u;
}

// ... rest simplified for compatibility
module.exports = { publicUser, authFromRequest, requireUser, requireAdmin, register: async function(b) { return loginAsync(b) }, login: async function(b) { return loginAsync(b) }, logout, requestPasswordReset, resetPassword, bootstrapAdmin, setSupabase };