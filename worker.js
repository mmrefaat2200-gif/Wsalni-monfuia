/*
  وصلني المنوفية - Cloudflare Worker
  External SMS OTP (Twilio Verify) + Firebase Custom Token

  Secrets required in Cloudflare:
  TWILIO_ACCOUNT_SID
  TWILIO_AUTH_TOKEN
  TWILIO_VERIFY_SERVICE_SID
  FIREBASE_SERVICE_ACCOUNT_EMAIL
  FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY

  Deploy this file as a Cloudflare Worker.
*/

const ALLOWED_ORIGIN = "*";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=UTF-8",
      "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "POST, OPTIONS"
    }
  });
}

function normalizePhone(value) {
  let p = String(value || "").trim().replace(/[\s()-]/g, "");
  if (p.startsWith("00")) p = "+" + p.slice(2);
  if (p.startsWith("01")) p = "+20" + p;
  if (p.startsWith("20") && !p.startsWith("+")) p = "+" + p;
  return p;
}

function isEgyptianPhone(p) {
  return /^\+20\d{10}$/.test(p);
}

function base64urlBytes(bytes) {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64urlText(text) {
  return base64urlBytes(new TextEncoder().encode(text));
}

function pemToArrayBuffer(pem) {
  const base64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s/g, "");

  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function sha256Hex(text) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text)
  );
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function createFirebaseCustomToken(phone, env) {
  const uid = "phone_" + await sha256Hex(phone);
  const now = Math.floor(Date.now() / 1000);

  const header = {
    alg: "RS256",
    typ: "JWT"
  };

  const payload = {
    iss: env.FIREBASE_SERVICE_ACCOUNT_EMAIL,
    sub: env.FIREBASE_SERVICE_ACCOUNT_EMAIL,
    aud: "https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit",
    iat: now,
    exp: now + 3600,
    uid,
    phone_verified: true
  };

  const unsigned =
    base64urlText(JSON.stringify(header)) +
    "." +
    base64urlText(JSON.stringify(payload));

  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(env.FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY),
    {
      name: "RSASSA-PKCS1-v1_5",
      hash: "SHA-256"
    },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsigned)
  );

  return unsigned + "." + base64urlBytes(new Uint8Array(signature));
}

async function twilioVerifySend(phone, env) {
  const url =
    `https://verify.twilio.com/v2/Services/${env.TWILIO_VERIFY_SERVICE_SID}/Verifications`;

  const body = new URLSearchParams({
    To: phone,
    Channel: "sms"
  });

  const auth = btoa(
    `${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`
  );

  const r = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body
  });

  const data = await r.json().catch(() => ({}));

  if (!r.ok) {
    throw new Error(data.message || "فشل إرسال رسالة التحقق.");
  }

  return data;
}

async function twilioVerifyCheck(phone, code, env) {
  const url =
    `https://verify.twilio.com/v2/Services/${env.TWILIO_VERIFY_SERVICE_SID}/VerificationCheck`;

  const body = new URLSearchParams({
    To: phone,
    Code: code
  });

  const auth = btoa(
    `${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`
  );

  const r = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body
  });

  const data = await r.json().catch(() => ({}));

  if (!r.ok) {
    throw new Error(data.message || "تعذر التحقق من الكود.");
  }

  return data;
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return json({ ok: true });
    }

    if (request.method !== "POST") {
      return json({ error: "Method Not Allowed" }, 405);
    }

    const url = new URL(request.url);

    try {
      const body = await request.json();
      const phone = normalizePhone(body.phone);

      if (!isEgyptianPhone(phone)) {
        return json({ error: "رقم الموبايل المصري غير صحيح." }, 400);
      }

      if (url.pathname === "/otp/send") {
        await twilioVerifySend(phone, env);
        return json({ ok: true });
      }

      if (url.pathname === "/otp/verify") {
        const code = String(body.code || "").trim();

        if (!/^\d{4,8}$/.test(code)) {
          return json({ error: "كود التحقق غير صحيح." }, 400);
        }

        const result = await twilioVerifyCheck(phone, code, env);

        if (result.status !== "approved") {
          return json({ error: "كود التحقق غير صحيح أو منتهي." }, 401);
        }

        const token = await createFirebaseCustomToken(phone, env);
        return json({ ok: true, token });
      }

      return json({ error: "Not Found" }, 404);
    } catch (error) {
      console.error(error);
      return json({
        error: error?.message || "حدث خطأ في خدمة التحقق."
      }, 500);
    }
  }
};
