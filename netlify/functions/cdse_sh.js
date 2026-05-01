console.log("[cdse_sh] module loading start");

let tokenCache = null;

const readCredentials = () => {
  const clientId = process.env.CDSE_CLIENT_ID;
  const clientSecret = process.env.CDSE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("Missing environment variables: CDSE_CLIENT_ID and CDSE_CLIENT_SECRET");
  }

  return { clientId, clientSecret };
}

const getAccessToken = async () => {
  const now = Date.now();
  if (tokenCache && now < tokenCache.expiresAtMs - 30_000) {
    return tokenCache.accessToken;
  }

  const { clientId, clientSecret } = readCredentials();
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
  });

  const response = await fetch(
    "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OAuth error: ${response.status} ${text}`);
  }

  const payload = await response.json();
  const accessToken = payload?.access_token;
  const expiresIn = payload?.expires_in ?? 3600;

  if (!accessToken) {
    throw new Error("Invalid OAuth response: missing access_token");
  }

  tokenCache = {
    accessToken,
    expiresAtMs: Date.now() + expiresIn * 1000,
  };

  return accessToken;
}

const buildUpstreamUrl = (event) => {
  console.log("[cdse_sh] buildUpstreamUrl event:", JSON.stringify({ path: event?.path, rawUrl: event?.rawUrl, rawQueryString: event?.rawQueryString, httpMethod: event?.httpMethod }));
  const netlifyPrefix = "/.netlify/functions/cdse_sh";
  const appPrefix = "/__cdse_sh";
  const eventPath = event?.path ?? "/";

  let rawPath = eventPath;
  if (rawPath.startsWith(netlifyPrefix)) {
    rawPath = rawPath.slice(netlifyPrefix.length);
  }
  if (rawPath.startsWith(appPrefix)) {
    rawPath = rawPath.slice(appPrefix.length);
  }

  const upstreamPath = rawPath.startsWith("/") ? rawPath : `/${rawPath}`;
  const query = event?.rawQueryString ? `?${event.rawQueryString}` : "";

  return `https://sh.dataspace.copernicus.eu${upstreamPath}${query}`;
}

const copyRequestHeaders = (event) => {
  const headers = {};
  for (const [key, value] of Object.entries(event.headers ?? {})) {
    if (!value) continue;
    const k = key.toLowerCase();

    if (k === "host") continue;
    if (k === "connection") continue;
    if (k === "content-length") continue;
    if (k === "accept-encoding") continue;
    if (k === "x-forwarded-for") continue;
    if (k === "x-forwarded-proto") continue;
    if (k === "x-forwarded-host") continue;

    headers[key] = value;
  }
  return headers;
}

export const handler = async (event) => {
  console.log("[cdse_sh] handler invoked, event keys:", Object.keys(event ?? {}).join(","));
  try {
    if (event?.path === "/.netlify/functions/cdse_sh" && event?.httpMethod === "GET") {
      return {
        statusCode: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
          "Access-Control-Allow-Origin": "*",
        },
        body: JSON.stringify({ ok: true }),
      };
    }

    if (event.httpMethod === "OPTIONS") {
      return {
        statusCode: 200,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
          "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
        },
        body: "",
      };
    }

    const accessToken = await getAccessToken();
    const upstreamUrl = buildUpstreamUrl(event);

    const headers = copyRequestHeaders(event);
    headers.Authorization = `Bearer ${accessToken}`;

    let body = event.body;
    if (event.isBase64Encoded && typeof body === "string") {
      body = Buffer.from(body, "base64");
    }

    const upstreamResponse = await fetch(upstreamUrl, {
      method: event.httpMethod,
      headers,
      body: body && event.httpMethod !== "GET" && event.httpMethod !== "HEAD" ? body : undefined,
    });

    const contentType = upstreamResponse.headers.get("content-type") ?? "application/octet-stream";
    console.log("[cdse_sh] upstream:", JSON.stringify({ url: upstreamUrl, status: upstreamResponse.status, contentType }));

    if (contentType.includes("application/json") || contentType.includes("text/")) {
      const text = await upstreamResponse.text();
      return {
        statusCode: upstreamResponse.status,
        headers: {
          "Content-Type": contentType,
          "Cache-Control": "no-store",
          "Access-Control-Allow-Origin": "*",
        },
        body: text,
      };
    }

    const buffer = Buffer.from(await upstreamResponse.arrayBuffer());

    return {
      statusCode: upstreamResponse.status,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*",
      },
      body: buffer.toString("base64"),
      isBase64Encoded: true,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (err instanceof Error && err.stack) {
      console.error("[cdse_sh] error stack:", err.stack);
    } else {
      console.error("[cdse_sh] error:", err);
    }
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({ error: message }),
    };
  }
};
