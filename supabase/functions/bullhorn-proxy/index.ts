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

  const authorizeUrl = new URL("https://auth.bullhornstaffing.com/oauth/authorize");
  authorizeUrl.searchParams.set("client_id", clientId);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("action", "Login");
  authorizeUrl.searchParams.set("username", username);
  authorizeUrl.searchParams.set("password", password);

  let url = authorizeUrl.toString();
  let code: string | null = null;
  let regionalOrigin = "https://auth.bullhornstaffing.com";

  for (let i = 0; i < 10; i++) {
    const resp = await fetch(url, { redirect: "manual" });
    await resp.text();
    const location = resp.headers.get("location");
    if (!location) break;

    const codeMatch = location.match(/[?&]code=([^&]+)/);
    if (codeMatch) {
      code = decodeURIComponent(codeMatch[1]);
      break;
    }
    if (location.includes("bullhornstaffing.com/oauth")) {
      regionalOrigin = new URL(location).origin;
    }
    url = location;
  }

  if (!code) throw new Error("Could not obtain authorization code");

  const tokenResp = await fetch(`${regionalOrigin}/oauth/token`, {
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
  if (cachedSession && Date.now() < cachedSession.expiresAt) {
    return { bhRestToken: cachedSession.bhRestToken, restUrl: cachedSession.restUrl };
  }

  const { access_token } = await getAccessToken();
  const loginUrl = new URL("https://rest.bullhornstaffing.com/rest-services/login");
  loginUrl.searchParams.set("version", "2.0");
  loginUrl.searchParams.set("access_token", access_token);

  const loginResp = await fetch(loginUrl.toString());
  if (!loginResp.ok) throw new Error("REST login failed: " + await loginResp.text());

  const session = await loginResp.json();
  const bhRestToken = session.BhRestToken;
  const restUrl = session.restUrl;

  if (!bhRestToken || !restUrl) throw new Error("Invalid REST login response: " + JSON.stringify(session));

  cachedSession = { bhRestToken, restUrl, expiresAt: Date.now() + 8 * 60 * 1000 };
  return { bhRestToken, restUrl };
}

async function bullhornFetch(path: string, params: Record<string, string> = {}, retried = false): Promise<any> {
  const { bhRestToken, restUrl } = await getBullhornSession();
  const url = new URL(`${restUrl}${path}`);
  url.searchParams.set("BhRestToken", bhRestToken);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  const resp = await fetch(url.toString());
  if (!resp.ok) {
    if (resp.status === 401 && !retried) {
      cachedSession = null;
      return bullhornFetch(path, params, true);
    }
    throw new Error(`Bullhorn API error (${resp.status}): ${await resp.text()}`);
  }
  return resp.json();
}

// --- Action handlers ---

async function handleFastFind(query: string, countPerEntity: number) {
  return await bullhornFetch("find", { query, countPerEntity: String(countPerEntity), meta: "full" });
}

async function handleEntityLookup(query: string, countPerEntity: number) {
  const raw = await handleFastFind(query, countPerEntity);
  const results = (raw.data || []).map((item: any) => {
    const label =
      item.title ||
      [item.firstName, item.lastName].filter(Boolean).join(" ") ||
      item.name ||
      item.companyName ||
      `${item.entityType} ${item.id}`;
    return { entityType: item.entityType, entityId: item.id, label };
  });
  return { results };
}

async function handleSearchEntity(entity: string, query: string, fields: string, count: number, sort: string) {
  return await bullhornFetch(`search/${entity}`, {
    query,
    fields,
    count: String(count),
    sort,
  });
}

async function handleGetEntity(entity: string, id: string, fields: string) {
  return await bullhornFetch(`entity/${entity}/${id}`, { fields });
}

// --- Main handler ---

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action } = body;
    const json = (data: any, status = 200) =>
      new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    switch (action) {
      case "entity_lookup": {
        if (!body.query || typeof body.query !== "string" || body.query.length < 1) return json({ results: [] });
        return json(await handleEntityLookup(body.query, body.countPerEntity || 10));
      }

      case "fastfind": {
        if (!body.query || typeof body.query !== "string" || body.query.length < 2) return json({ data: [], meta: {} });
        return json(await handleFastFind(body.query, body.countPerEntity || 5));
      }

      case "search_candidates": {
        const q = body.query || "isDeleted:0";
        const fields = body.fields || "id,firstName,lastName,email,phone,status,address,occupation,skillSet,experience,salary,hourlyRate,companyName";
        return json(await handleSearchEntity("Candidate", q, fields, body.count || 10, body.sort || "-dateLastModified"));
      }

      case "get_candidate_profile": {
        if (!body.id) return json({ error: "id is required" }, 400);
        const fields = body.fields || "id,firstName,lastName,email,phone,mobile,status,source,address,occupation,skillSet,primarySkills,experience,salary,hourlyRate,dateAvailable,companyName,educationDegree,employmentPreference,willRelocate,dayRate,dayRateLow,description";
        return json(await handleGetEntity("Candidate", String(body.id), fields));
      }

      case "search_jobs": {
        const q = body.query || "isDeleted:false";
        const fields = body.fields || "id,title,status,employmentType,clientCorporation,address,salary,startDate,dateEnd,numOpenings,publicDescription";
        return json(await handleSearchEntity("JobOrder", q, fields, body.count || 10, body.sort || "-dateAdded"));
      }

      case "get_job_summary": {
        if (!body.id) return json({ error: "id is required" }, 400);
        const fields = body.fields || "id,title,status,employmentType,clientCorporation,clientContact,address,salary,salaryUnit,startDate,dateEnd,numOpenings,publicDescription,skills,yearsRequired,educationDegree";
        return json(await handleGetEntity("JobOrder", String(body.id), fields));
      }

      case "search_placements": {
        const q = body.query || "id:[1 TO 1000000]";
        const fields = body.fields || "id,status,candidate,jobOrder,startDate,dateEnd,salary,payRate,clientBillRate,employmentType";
        return json(await handleSearchEntity("Placement", q, fields, body.count || 10, body.sort || "-dateAdded"));
      }

      case "get_placement_summary": {
        if (!body.id) return json({ error: "id is required" }, 400);
        const fields = body.fields || "id,status,candidate,jobOrder,startDate,dateEnd,salary,payRate,clientBillRate,employmentType,daysGuaranteed,fee";
        return json(await handleGetEntity("Placement", String(body.id), fields));
      }

      default:
        return json({ error: "Unsupported action. Use: fastfind, entity_lookup, search_candidates, get_candidate_profile, search_jobs, get_job_summary, search_placements, get_placement_summary." }, 400);
    }
  } catch (error) {
    console.error("Bullhorn proxy error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
