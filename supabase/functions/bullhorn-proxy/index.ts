const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// In-memory cache for Bullhorn session (edge function lifetime)
let cachedSession: { bhRestToken: string; restUrl: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<{ access_token: string; refresh_token: string }> {
  const clientId = Deno.env.get("BULLHORN_CLIENT_ID")!;
  const clientSecret = Deno.env.get("BULLHORN_CLIENT_SECRET")!;
  const username = Deno.env.get("BULLHORN_USERNAME")!;
  const password = Deno.env.get("BULLHORN_PASSWORD")!;

  // Step 1: Get authorization code via POST with form data
  const authUrl = `https://auth.bullhornstaffing.com/oauth/authorize?client_id=${encodeURIComponent(clientId)}&response_type=code`;

  console.log("Auth request URL:", authUrl);

  const authResp = await fetch(authUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      action: "Login",
      username,
      password,
    }).toString(),
    redirect: "manual",
  });

  console.log("Auth response status:", authResp.status);
  console.log("Auth response headers:", JSON.stringify(Object.fromEntries(authResp.headers.entries())));

  const location = authResp.headers.get("location");
  if (!location) {
    const body = await authResp.text();
    console.log("Auth response body (no location):", body.slice(0, 500));
    throw new Error("No redirect from Bullhorn authorize endpoint. Status: " + authResp.status);
  }

  console.log("Redirect location:", location);

  const codeMatch = location.match(/code=([^&]+)/);
  if (!codeMatch) {
    throw new Error("No authorization code in redirect: " + location);
  }
  const code = codeMatch[1];

  // Step 2: Exchange code for access token
  const tokenResp = await fetch("https://auth.bullhornstaffing.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: clientId,
      client_secret: clientSecret,
    }).toString(),
  });

  if (!tokenResp.ok) {
    const text = await tokenResp.text();
    throw new Error("Token exchange failed: " + text);
  }

  return await tokenResp.json();
}

async function getBullhornSession(): Promise<{ bhRestToken: string; restUrl: string }> {
  // Return cached session if still valid (with 5 min buffer)
  if (cachedSession && Date.now() < cachedSession.expiresAt) {
    return { bhRestToken: cachedSession.bhRestToken, restUrl: cachedSession.restUrl };
  }

  const { access_token } = await getAccessToken();

  // Step 3: Get REST session
  const loginUrl = new URL("https://rest.bullhornstaffing.com/rest-services/login");
  loginUrl.searchParams.set("version", "2.0");
  loginUrl.searchParams.set("access_token", access_token);

  const loginResp = await fetch(loginUrl.toString());
  if (!loginResp.ok) {
    const text = await loginResp.text();
    throw new Error("REST login failed: " + text);
  }

  const session = await loginResp.json();
  const bhRestToken = session.BhRestToken;
  const restUrl = session.restUrl;

  if (!bhRestToken || !restUrl) {
    throw new Error("Invalid REST login response: " + JSON.stringify(session));
  }

  // Cache for 8 minutes (tokens last ~10 min)
  cachedSession = { bhRestToken, restUrl, expiresAt: Date.now() + 8 * 60 * 1000 };

  return { bhRestToken, restUrl };
}

async function fastFind(
  query: string,
  countPerEntity: number = 5
): Promise<{ data: unknown[]; meta: unknown }> {
  const { bhRestToken, restUrl } = await getBullhornSession();

  const findUrl = new URL(`${restUrl}find`);
  findUrl.searchParams.set("query", query);
  findUrl.searchParams.set("countPerEntity", String(countPerEntity));
  findUrl.searchParams.set("meta", "full");
  findUrl.searchParams.set("BhRestToken", bhRestToken);

  const resp = await fetch(findUrl.toString());
  if (!resp.ok) {
    // If 401, clear cache and retry once
    if (resp.status === 401 && cachedSession) {
      cachedSession = null;
      return fastFind(query, countPerEntity);
    }
    const text = await resp.text();
    throw new Error("FastFind failed: " + text);
  }

  return await resp.json();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action, query, countPerEntity } = body;

    if (action !== "fastfind") {
      return new Response(
        JSON.stringify({ error: "Unsupported action. Use 'fastfind'." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!query || typeof query !== "string" || query.length < 2) {
      return new Response(
        JSON.stringify({ data: [], meta: {} }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const result = await fastFind(query, countPerEntity || 5);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Bullhorn proxy error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
