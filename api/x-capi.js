const crypto = require("crypto");

const X_API_VERSION = process.env.X_API_VERSION || "12";
const X_API_KEY = process.env.X_API_KEY;
const X_API_SECRET = process.env.X_API_SECRET;
const X_ACCESS_TOKEN = process.env.X_ACCESS_TOKEN;
const X_ACCESS_TOKEN_SECRET = process.env.X_ACCESS_TOKEN_SECRET;
const X_PIXEL_ID = process.env.X_PIXEL_ID || "rbtru";

const EVENT_IDS = {
  PageVisit: process.env.X_EVENT_ID_PAGE_VIEW || "tw-rbtru-rbtve",
  AddToCart: process.env.X_EVENT_ID_ADD_TO_CART || "tw-rbtru-rbtv4",
  Purchase: process.env.X_EVENT_ID_PURCHASE || "tw-rbtru-rbtrw"
};

function json(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", process.env.CORS_ORIGIN || "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.end(JSON.stringify(payload));
}

function encode(value) {
  return encodeURIComponent(String(value))
    .replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

function sha256(value) {
  if (!value) return "";
  return crypto.createHash("sha256").update(String(value).trim().toLowerCase()).digest("hex");
}

function normalizePhone(value) {
  if (!value) return "";
  return String(value).replace(/[^\d+]/g, "");
}

function createOAuthHeader(method, url) {
  const oauthParams = {
    oauth_consumer_key: X_API_KEY,
    oauth_nonce: crypto.randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: Math.floor(Date.now() / 1000),
    oauth_token: X_ACCESS_TOKEN,
    oauth_version: "1.0"
  };

  const parameterString = Object.keys(oauthParams)
    .sort()
    .map((key) => `${encode(key)}=${encode(oauthParams[key])}`)
    .join("&");

  const signatureBase = [
    method.toUpperCase(),
    encode(url),
    encode(parameterString)
  ].join("&");

  const signingKey = `${encode(X_API_SECRET)}&${encode(X_ACCESS_TOKEN_SECRET)}`;
  const signature = crypto.createHmac("sha1", signingKey).update(signatureBase).digest("base64");

  return "OAuth " +
    Object.entries({ ...oauthParams, oauth_signature: signature })
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${encode(key)}="${encode(value)}"`)
      .join(", ");
}

function getClientIp(req) {
  const forwardedFor = req.headers["x-forwarded-for"];
  if (typeof forwardedFor === "string" && forwardedFor.trim()) {
    return forwardedFor.split(",")[0].trim();
  }
  return req.socket && req.socket.remoteAddress ? req.socket.remoteAddress : "";
}

function cleanContents(contents) {
  if (!Array.isArray(contents)) return [];

  return contents
    .map((item) => ({
      content_id: item.content_id ? String(item.content_id) : undefined,
      content_name: item.content_name ? String(item.content_name) : undefined,
      content_type: item.content_type ? String(item.content_type) : "product",
      quantity: item.quantity ? Number(item.quantity) : undefined,
      price: item.price !== undefined && item.price !== null && item.price !== ""
        ? Number(item.price).toFixed(2)
        : undefined
    }))
    .filter((item) => item.content_id || item.content_name);
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1024 * 1024) {
        reject(new Error("Payload too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function isAllowedSource(eventSourceUrl) {
  const hosts = (process.env.ALLOWED_STORE_HOSTS || "")
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);

  if (hosts.length === 0 || !eventSourceUrl) return true;

  try {
    const hostname = new URL(eventSourceUrl).hostname.toLowerCase();
    return hosts.some((host) => hostname === host || hostname.endsWith(`.${host}`));
  } catch {
    return false;
  }
}

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") {
    return json(res, 204, {});
  }

  if (req.method === "GET") {
    return json(res, 200, {
      ok: true,
      message: "X CAPI endpoint is running",
      pixel_id: X_PIXEL_ID,
      api_version: X_API_VERSION
    });
  }

  if (req.method !== "POST") {
    return json(res, 405, { ok: false, error: "Method not allowed" });
  }

  if (!X_API_KEY || !X_API_SECRET || !X_ACCESS_TOKEN || !X_ACCESS_TOKEN_SECRET) {
    return json(res, 500, {
      ok: false,
      error: "Missing X OAuth 1.0 credentials in Vercel environment variables"
    });
  }

  let body;
  try {
    body = await parseBody(req);
  } catch (error) {
    return json(res, 400, { ok: false, error: "Invalid JSON body" });
  }

  if (!isAllowedSource(body.event_source_url)) {
    return json(res, 403, { ok: false, error: "Event source URL is not allowed" });
  }

  const eventName = String(body.event_name || "");
  const eventId = body.event_id || EVENT_IDS[eventName];

  if (!eventId) {
    return json(res, 400, { ok: false, error: "Missing or unsupported event_id" });
  }

  const identifiers = [];
  const hashedEmail = body.hashed_email || sha256(body.email_address);
  const hashedPhone = body.hashed_phone_number || sha256(normalizePhone(body.phone_number));
  const twclid = body.twclid ? String(body.twclid).trim() : "";
  const userAgent = body.user_agent || req.headers["user-agent"] || "";
  const ipAddress = body.ip_address || getClientIp(req);

  if (hashedEmail) identifiers.push({ hashed_email: hashedEmail });
  if (hashedPhone) identifiers.push({ hashed_phone_number: hashedPhone });
  if (twclid) identifiers.push({ twclid });

  const browserIdentifier = {};
  if (ipAddress) browserIdentifier.ip_address = ipAddress;
  if (userAgent) browserIdentifier.user_agent = String(userAgent).trim();
  if (Object.keys(browserIdentifier).length > 0) identifiers.push(browserIdentifier);

  if (identifiers.length === 0) {
    return json(res, 400, { ok: false, error: "No identifiers available" });
  }

  const conversion = {
    conversion_time: body.conversion_time || new Date().toISOString(),
    event_id: String(eventId),
    identifiers,
    conversion_id: String(body.conversion_id || Date.now())
  };

  if (body.value !== undefined && body.value !== null && body.value !== "") {
    conversion.value = Number(body.value).toFixed(2);
  }

  if (body.number_items !== undefined && body.number_items !== null) {
    conversion.number_items = Number(body.number_items);
  }

  if (body.event_source_url) {
    conversion.event_source_url = String(body.event_source_url);
  }

  const contents = cleanContents(body.contents);
  if (contents.length > 0) {
    conversion.contents = contents;
  }

  const xUrl = `https://ads-api.x.com/${X_API_VERSION}/measurement/conversions/${encodeURIComponent(X_PIXEL_ID)}`;
  const authHeader = createOAuthHeader("POST", xUrl);

  const xResponse = await fetch(xUrl, {
    method: "POST",
    headers: {
      Authorization: authHeader,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ conversions: [conversion] })
  });

  const responseText = await xResponse.text();
  let responseJson;

  try {
    responseJson = JSON.parse(responseText);
  } catch {
    responseJson = { raw: responseText };
  }

  if (!xResponse.ok) {
    console.error("X CAPI error:", { status: xResponse.status, body: responseJson });
    return json(res, xResponse.status, {
      ok: false,
      status: xResponse.status,
      x_response: responseJson
    });
  }

  return json(res, 200, {
    ok: true,
    x_response: responseJson
  });
};
