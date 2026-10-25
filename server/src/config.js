const path = require('node:path');

function loadEnvFile(file = path.join(__dirname, '..', '.env')) {
  try {
    const fs = require('node:fs');
    if (!fs.existsSync(file)) return;
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx < 1) continue;
      const key = trimmed.slice(0, idx).trim();
      let value = trimmed.slice(idx + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
      if (process.env[key] === undefined) process.env[key] = value;
    }
  } catch (err) { console.error('Config load warning:', err.message); }
}
loadEnvFile();

const root = path.join(__dirname, '..');
module.exports = {
  port: Number(process.env.PORT || 5000),
  host: process.env.HOST || (process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1'),
  env: process.env.NODE_ENV || 'development',
  dbFile: path.resolve(root, process.env.DB_FILE || './data/fablux.sqlite'),
  sessionTtlDays: Number(process.env.SESSION_TTL_DAYS || 30),
  adminEmail: (process.env.ADMIN_EMAIL || '').trim().toLowerCase(),
  adminPassword: process.env.ADMIN_PASSWORD || '',
  adminAccessPath: process.env.ADMIN_ACCESS_PATH || '/admin-access',
  emailProvider: process.env.EMAIL_PROVIDER || 'none',
  resendApiKey: process.env.RESEND_API_KEY || '',
  emailFrom: process.env.EMAIL_FROM || '',
  paystackSecretKey: process.env.PAYSTACK_SECRET_KEY || '',
  paystackPublicKey: process.env.PAYSTACK_PUBLIC_KEY || '',
  paymentReservationMinutes: Number(process.env.PAYMENT_RESERVATION_MINUTES || 20),
  appBaseUrl: process.env.APP_BASE_URL || `http://127.0.0.1:${Number(process.env.PORT || 5000)}`,
  resetTokenMinutes: Number(process.env.RESET_TOKEN_MINUTES || 30),
  allowedOrigins: (process.env.ALLOWED_ORIGINS || '').split(',').map(x => x.trim()).filter(Boolean),
  supabaseUrl: process.env.SUPABASE_URL || '',
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY || ''
};
