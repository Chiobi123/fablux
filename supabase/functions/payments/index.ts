// FabluX.U.Design — Paystack payments (Supabase Edge Function, Deno).
//
//   POST  ?action=initialize   { reference, token }   -> { authorization_url }
//   POST  ?action=webhook      Paystack event body    -> { ok }
//   GET   ?action=verify&reference=...                -> { paid, order_reference }
//
// Deploy:
//   supabase functions deploy payments --no-verify-jwt
//   supabase secrets set PAYSTACK_SECRET_KEY=sk_... SITE_URL=https://fablux.pages.dev
//
// The secret key never leaves this function. The browser only ever receives the
// Paystack authorization URL. Settlement happens in the `confirm_payment` SQL
// function, which is idempotent and checks the amount.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const PAYSTACK_SECRET = Deno.env.get("PAYSTACK_SECRET_KEY") ?? "";
const SITE_URL = (Deno.env.get("SITE_URL") ?? "https://fablux.pages.dev").replace(/\/+$/, "");
const PAYSTACK_API = "https://api.paystack.co";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

async function sb(path: string, init: RequestInit = {}): Promise<any> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`DB ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

async function paystack(path: string, init: RequestInit = {}): Promise<any> {
  const res = await fetch(`${PAYSTACK_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${PAYSTACK_SECRET}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  return res.json();
}

function hex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function validSignature(raw: string, header: string | null): Promise<boolean> {
  if (!header || !PAYSTACK_SECRET) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(PAYSTACK_SECRET),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"],
  );
  const expected = hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw)));
  if (expected.length !== header.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ header.charCodeAt(i);
  return diff === 0;
}

function settle(reference: string, amount: number, providerStatus: string) {
  return sb("rpc/confirm_payment", {
    method: "POST",
    body: JSON.stringify({ p_reference: reference, p_amount: amount, p_provider_status: providerStatus }),
  });
}

// ---------------------------------------------------------------------------

async function initialize(req: Request): Promise<Response> {
  if (!PAYSTACK_SECRET) return json({ error: "Card payments are not configured yet." }, 503);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid request." }, 400);
  }
  const reference = String(body?.reference ?? "").trim();
  const token = String(body?.token ?? "").trim();
  if (!reference || !token) return json({ error: "Order reference and tracking token are required." }, 400);

  // The tracking token proves the caller holds this order (same rule as track_order).
  const rows = await sb(
    `orders?reference=eq.${encodeURIComponent(reference)}&tracking_token=eq.${
      encodeURIComponent(token)
    }&select=id,reference,total,currency,email,guest_email,status,payment_status`,
  );
  const order = Array.isArray(rows) ? rows[0] : null;
  if (!order) return json({ error: "Order not found." }, 404);
  if (order.payment_status === "successful") return json({ error: "This order is already paid." }, 409);
  if (order.status !== "pending_payment") return json({ error: "This order is not awaiting payment." }, 409);

  // Free any expired attempt so the unique live-attempt index cannot block us.
  await sb("rpc/expire_stale_payments", { method: "POST", body: "{}" });

  const live = await sb(
    `payment_transactions?order_id=eq.${encodeURIComponent(order.id)}&status=eq.pending&select=reference`,
  );
  if (Array.isArray(live) && live.length) {
    return json({ error: "A payment for this order is already open. Finish or wait 30 minutes." }, 409);
  }

  const payRef = `${order.reference}-${Date.now().toString(36)}`.toUpperCase();
  const amount = Number(order.total) * 100; // naira -> kobo

  const init = await paystack("/transaction/initialize", {
    method: "POST",
    body: JSON.stringify({
      email: order.guest_email || order.email,
      amount,
      currency: order.currency || "NGN",
      reference: payRef,
      callback_url: `${SITE_URL}/payment-callback.html?reference=${encodeURIComponent(payRef)}`,
      metadata: { order_id: order.id, order_reference: order.reference },
    }),
  });

  if (!init?.status || !init?.data?.authorization_url) {
    return json({ error: init?.message || "The payment gateway refused the request." }, 502);
  }

  const now = new Date();
  await sb("payment_transactions", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      id: crypto.randomUUID(),
      order_id: order.id,
      provider: "paystack",
      reference: payRef,
      amount,
      currency: order.currency || "NGN",
      status: "pending",
      provider_status: null,
      expires_at: new Date(now.getTime() + 30 * 60 * 1000).toISOString(),
      verified_at: null,
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    }),
  });

  return json({ authorization_url: init.data.authorization_url, reference: payRef });
}

async function webhook(req: Request): Promise<Response> {
  const raw = await req.text();
  if (!(await validSignature(raw, req.headers.get("x-paystack-signature")))) {
    return json({ error: "Bad signature." }, 401);
  }

  let event: any;
  try {
    event = JSON.parse(raw);
  } catch {
    return json({ ok: false }, 200);
  }
  if (event?.event !== "charge.success") return json({ ok: true, ignored: event?.event ?? null });

  const ref = String(event?.data?.reference ?? "");
  if (!ref) return json({ ok: false }, 200);

  try {
    // Never trust the webhook body alone: confirm with the gateway.
    const check = await paystack(`/transaction/verify/${encodeURIComponent(ref)}`);
    const tx = check?.data;
    if (!check?.status || tx?.status !== "success" || tx?.currency !== "NGN") {
      console.log("payment not settled", ref, tx?.status);
      return json({ ok: true, settled: false });
    }
    const out = await settle(ref, Number(tx.amount), String(tx.gateway_response ?? "success"));
    console.log("settled", ref, JSON.stringify(out));
    return json({ ok: true, settled: true, already: !!out?.already });
  } catch (error) {
    // 200 keeps Paystack from retrying for hours; the row stays pending and the
    // /verify endpoint retries settlement on the customer's return.
    console.error("webhook settle failed", ref, String(error));
    return json({ ok: false, error: "settlement delayed" }, 200);
  }
}

async function verify(url: URL): Promise<Response> {
  const ref = String(url.searchParams.get("reference") ?? "").trim();
  if (!ref) return json({ paid: false, error: "Missing reference." }, 400);

  const rows = await sb(
    `payment_transactions?reference=eq.${encodeURIComponent(ref)}&select=reference,order_id,amount,status,verified_at`,
  );
  const tx = Array.isArray(rows) ? rows[0] : null;
  if (!tx) return json({ paid: false, status: "unknown" });

  const order = await sb(`orders?id=eq.${encodeURIComponent(tx.order_id)}&select=reference,payment_status`);
  const orderRef = Array.isArray(order) && order[0] ? order[0].reference : null;

  if (tx.status === "success" || tx.status === "verified") {
    return json({ paid: true, status: "success", order_reference: orderRef });
  }
  if (!PAYSTACK_SECRET) return json({ paid: false, status: tx.status, order_reference: orderRef });

  const check = await paystack(`/transaction/verify/${encodeURIComponent(ref)}`);
  const data = check?.data;
  if (check?.status && data?.status === "success") {
    try {
      await settle(ref, Number(data.amount), String(data.gateway_response ?? "success"));
      return json({ paid: true, status: "success", order_reference: orderRef });
    } catch (error) {
      console.error("verify settle failed", ref, String(error));
    }
  }
  return json({ paid: false, status: data?.status ?? tx.status, order_reference: orderRef });
}

// ---------------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const url = new URL(req.url);
  const action = url.searchParams.get("action") ?? "";

  try {
    if (action === "initialize" && req.method === "POST") return await initialize(req);
    if (action === "webhook" && req.method === "POST") return await webhook(req);
    if (action === "verify" && req.method === "GET") return await verify(url);
    return json({ error: "Unknown action." }, 404);
  } catch (error) {
    console.error("payments error", String(error));
    return json({ error: "Payment service error." }, 500);
  }
});
