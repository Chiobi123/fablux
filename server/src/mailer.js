const config = require('./config');

async function sendPasswordResetEmail({ to, name, resetUrl }) {
  if (config.emailProvider === 'resend') {
    if (!config.resendApiKey || !config.emailFrom) throw new Error('Email service is not configured. Set RESEND_API_KEY and EMAIL_FROM.');
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {'Authorization': `Bearer ${config.resendApiKey}`, 'Content-Type': 'application/json', 'User-Agent': 'FabluX.U.Design/1.0'},
      body: JSON.stringify({
        from: config.emailFrom,
        to: [to],
        subject: 'Reset your FabluX.U.Design password',
        html: `<div style="font-family:Arial,sans-serif;line-height:1.6"><h2>Reset your FabluX password</h2><p>Hello ${escapeHtml(name)},</p><p>We received a request to reset your FabluX.U.Design password.</p><p><a href="${escapeAttr(resetUrl)}" style="display:inline-block;padding:12px 18px;background:#7c3aed;color:#fff;text-decoration:none;border-radius:6px">Reset Password</a></p><p>This link expires in ${config.resetTokenMinutes} minutes and can only be used once.</p><p>If you did not request this, you can safely ignore this email.</p></div>`
      })
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Email provider rejected the message (${response.status}): ${text.slice(0, 300)}`);
    }
    return {sent: true};
  }
  if (config.env !== 'production') {
    console.warn(`[FabluX DEV] Password reset link for ${to}: ${resetUrl}`);
    return {sent: false, developmentOnly: true, resetUrl};
  }
  throw new Error('Email service is not configured.');
}
function escapeHtml(v){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function escapeAttr(v){return escapeHtml(v);}
module.exports={sendPasswordResetEmail};
