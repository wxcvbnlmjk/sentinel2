let tokenCache = null;

function readCredentials() {
  const clientId = process.env.CDSE_CLIENT_ID;
  const clientSecret = process.env.CDSE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("Missing environment variables: CDSE_CLIENT_ID and CDSE_CLIENT_SECRET");
  }

  return { clientId, clientSecret };
}

async function fetchAccessToken() {
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

  return { accessToken, expiresIn };
}

exports.handler = async function handler(event) {
  try {
    if (event.httpMethod === "OPTIONS") {
      return {
        statusCode: 200,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
          "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        },
        body: "",
      };
    }

    const now = Date.now();
    if (tokenCache && now < tokenCache.expiresAtMs - 30_000) {
      return {
        statusCode: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
          "Access-Control-Allow-Origin": "*",
        },
        body: JSON.stringify({ access_token: tokenCache.accessToken }),
      };
    }

    const { accessToken } = await fetchAccessToken();

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({ access_token: accessToken }),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
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
