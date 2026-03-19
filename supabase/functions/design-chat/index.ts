const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ─── Tool Definitions ───

const CLIENT_TOOLS = new Set(["replace_design_html", "update_worksheet_title"]);

const TOOLS = [
  // Client-side tools
  {
    type: "function",
    function: {
      name: "replace_design_html",
      description:
        "Replace the entire design worksheet with a new complete HTML page. Always output a full standalone HTML document with <!DOCTYPE html>, <html>, <head>, and <body>. Include all CSS inline or in <style> tags. Include all JavaScript inline or in <script> tags. You may use CDN links for external libraries like Tailwind CSS, Chart.js, Three.js, GSAP, etc.",
      parameters: {
        type: "object",
        properties: {
          html: { type: "string", description: "The complete HTML document source code" },
        },
        required: ["html"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_worksheet_title",
      description: "Change the worksheet title.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "The new title" },
        },
        required: ["title"],
        additionalProperties: false,
      },
    },
  },
  // Server-side: Bullhorn CRM
  {
    type: "function",
    function: {
      name: "search_bullhorn",
      description: "Search Bullhorn CRM using a free-text query. Returns matching Candidates, Jobs, Companies, Contacts, and Placements. Use this to find CRM records by name, skill, title, company, etc.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query (name, skill, company, etc.)" },
          count: { type: "number", description: "Max results per entity type (default 5)" },
        },
        required: ["query"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_candidate_profile",
      description: "Get detailed profile for a specific Bullhorn candidate by their numeric ID. Returns full contact info, skills, experience, salary, availability, etc.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "number", description: "The Bullhorn candidate ID" },
        },
        required: ["id"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_job_details",
      description: "Get detailed information for a specific Bullhorn job order by its numeric ID. Returns title, status, salary, description, requirements, etc.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "number", description: "The Bullhorn job order ID" },
        },
        required: ["id"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_candidates",
      description: "Search Bullhorn candidates with a Lucene query. Use field:value syntax (e.g. 'skills:Python AND status:Active'). Returns candidate list with contact info, skills, salary.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Lucene query string (e.g. 'skills:React AND status:Active')" },
          count: { type: "number", description: "Max results (default 10)" },
          sort: { type: "string", description: "Sort field (default -dateLastModified)" },
        },
        required: ["query"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_jobs",
      description: "Search Bullhorn job orders with a Lucene query. Use field:value syntax (e.g. 'title:Engineer AND status:Open'). Returns job listings.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Lucene query string" },
          count: { type: "number", description: "Max results (default 10)" },
          sort: { type: "string", description: "Sort field (default -dateAdded)" },
        },
        required: ["query"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "batch_resolve_entities",
      description:
        "Resolve multiple Bullhorn entities by their type and ID in a single call. Use when you have specific entity types and IDs. Much faster than individual lookups.",
      parameters: {
        type: "object",
        properties: {
          entities: {
            type: "array",
            description: "Array of entities to resolve",
            items: {
              type: "object",
              properties: {
                entityType: { type: "string", description: "Bullhorn entity type: Candidate, ClientContact, ClientCorporation, JobOrder, or Placement" },
                entityId: { type: "string", description: "Numeric Bullhorn entity ID" },
              },
              required: ["entityType", "entityId"],
            },
          },
        },
        required: ["entities"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_placements",
      description: "Search Bullhorn CRM for placements using a Lucene query.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Lucene search query" },
          count: { type: "number", description: "Max results (default 10, max 50)" },
          sort: { type: "string", description: "Sort field (default -dateAdded)" },
        },
        required: ["query"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_placement_details",
      description: "Get detailed placement information from Bullhorn by numeric Placement ID.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "number", description: "Numeric Bullhorn Placement ID" },
        },
        required: ["id"],
        additionalProperties: false,
      },
    },
  },
  // ── Tavily Tools ──
  // IMPORTANT: These 4 tools serve very different purposes. Pick the right one:
  //   tavily_search   → Google-like keyword search, returns snippets from multiple sites
  //   tavily_extract  → Read the full text of a KNOWN URL (like opening a webpage)
  //   tavily_crawl    → Spider a KNOWN website to discover & read multiple pages
  //   tavily_research → Autonomous multi-step research agent that writes a report
  {
    type: "function",
    function: {
      name: "tavily_search",
      description: `Quick web search — like using Google. Returns short snippets from multiple websites matching a keyword query. Use when you need to DISCOVER information but don't have a specific URL.

WHEN TO USE:
• You need facts, stats, or news about a topic (e.g. "average software engineer salary in London 2025")
• You want to find companies, people, or products (e.g. "top AI startups in healthcare")
• You need recent news or market data (e.g. "tech layoffs January 2025")

WHEN NOT TO USE:
• You already have a URL and want its full content → use tavily_extract instead
• You need to explore an entire website → use tavily_crawl instead  
• You need a comprehensive multi-source research report → use tavily_research instead

EXAMPLES:
• query: "median base salary for VP Engineering San Francisco 2025"
• query: "Acme Corp recent funding rounds acquisitions"
• query: "React Native vs Flutter market share 2025"`,
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "The search query — use natural language keywords like you would in Google" },
          max_results: { type: "number", description: "Max results (default 5, max 10)" },
          search_depth: { type: "string", description: "'basic' (fast, default) or 'advanced' (slower but more thorough results)" },
          include_answer: { type: "boolean", description: "Include AI-generated answer summary (default true)" },
        },
        required: ["query"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "tavily_extract",
      description: `Read the full text content of one or more specific URLs — like opening a webpage and copying all the text. Use when you already KNOW the exact URL(s) and need to read their content.

WHEN TO USE:
• User provides a URL and says "use this" or "read this page" (e.g. a job posting link, a company About page)
• You found a URL via tavily_search and need the full page content, not just a snippet
• You need to read a specific LinkedIn profile, blog post, or job description

WHEN NOT TO USE:
• You don't have a URL yet — use tavily_search first to find relevant pages
• You need to explore many pages on a website — use tavily_crawl instead
• You need broad research on a topic — use tavily_search or tavily_research instead

EXAMPLES:
• urls: ["https://www.acmecorp.com/about"] — read a company's About page
• urls: ["https://www.linkedin.com/jobs/view/123456"] — extract a job posting
• urls: ["https://acme.com/team", "https://acme.com/values"] — read multiple specific pages`,
      parameters: {
        type: "object",
        properties: {
          urls: {
            type: "array",
            items: { type: "string" },
            description: "One or more specific URLs to extract full text content from",
          },
          query: { type: "string", description: "Optional: focus extraction on content relevant to this query" },
          extract_depth: { type: "string", description: "'basic' (default) or 'advanced' (better for tables & embedded content)" },
        },
        required: ["urls"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "tavily_crawl",
      description: `Spider a website starting from a base URL — automatically discovers and reads multiple pages by following links. Like sending a bot to explore an entire website. Use when you need broad coverage of a KNOWN website.

WHEN TO USE:
• You need to understand everything about a company's website (e.g. crawl acmecorp.com to learn about their services, team, culture)
• You want to find specific information across a website but don't know which page it's on
• You need to gather content from documentation, a blog, or a careers section

WHEN NOT TO USE:
• You only need one specific page — use tavily_extract instead (faster)
• You don't have a URL and need to search the web — use tavily_search first
• You need deep analysis across many sources — use tavily_research instead

EXAMPLES:
• url: "https://www.acmecorp.com", instructions: "Find information about their leadership team and company culture"
• url: "https://careers.bigtech.com", instructions: "Find all open engineering positions in Europe"
• url: "https://docs.example.com", instructions: "Gather the API authentication documentation"`,
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "The root URL to begin crawling from — the spider follows links from this page" },
          instructions: { type: "string", description: "Natural language instructions to guide the crawler (e.g. 'Find pages about pricing and features')" },
          max_depth: { type: "number", description: "How many link-levels deep to follow (1-5, default 1). Higher = more pages but slower" },
          limit: { type: "number", description: "Max pages to process (default 10, max 20). Keep low to avoid timeout" },
        },
        required: ["url"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "tavily_research",
      description: `Autonomous deep research agent — performs multiple searches, reads sources, cross-references, and produces a comprehensive written report. Like hiring a research analyst. This is SLOW (30-90 seconds) but very thorough.

WHEN TO USE:
• User asks for a "deep dive", "research report", "market analysis", or "competitive landscape"
• You need to synthesize information from many sources into a cohesive analysis
• Topics like: compensation benchmarking, industry trends, competitive intelligence, market sizing

WHEN NOT TO USE:
• You just need a quick fact or statistic — use tavily_search instead (much faster)
• You need to read a specific URL — use tavily_extract instead
• You need to explore one website — use tavily_crawl instead
• Time-sensitive requests where the user expects a fast response

EXAMPLES:
• input: "Comprehensive salary benchmarks for VP of Engineering roles in US tech companies, including equity compensation, by company size"
• input: "Competitive landscape analysis of AI-powered recruiting platforms in 2025, including market share, funding, and key differentiators"
• input: "Current state of the UK contract staffing market for technology roles, including day rates, demand trends, and regulatory changes"`,
      parameters: {
        type: "object",
        properties: {
          input: { type: "string", description: "The research question or topic — be specific and detailed for best results" },
          model: { type: "string", description: "'mini' (fast, focused ~30s), 'pro' (comprehensive ~60-90s), or 'auto' (default, picks based on complexity)" },
        },
        required: ["input"],
        additionalProperties: false,
      },
    },
  },
];

const TOOL_LABELS: Record<string, string> = {
  replace_design_html: "Building webpage",
  update_worksheet_title: "Changing title",
  search_bullhorn: "Searching CRM",
  get_candidate_profile: "Loading candidate",
  get_job_details: "Loading job details",
  search_candidates: "Searching candidates",
  search_jobs: "Searching jobs",
  batch_resolve_entities: "Resolving CRM entities",
  search_placements: "Searching placements",
  get_placement_details: "Loading placement details",
  tavily_search: "Searching the web",
  tavily_extract: "Extracting web content",
  tavily_crawl: "Crawling website",
  tavily_research: "Deep researching",
};

const MAX_LOOPS = 8;

function sseEvent(type: string, data: any): string {
  return `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
}

// ─── Bullhorn Auth & API ───

let cachedSession: { bhRestToken: string; restUrl: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<{ access_token: string }> {
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
    if (codeMatch) { code = decodeURIComponent(codeMatch[1]); break; }
    if (location.includes("bullhornstaffing.com/oauth")) {
      regionalOrigin = new URL(location).origin;
    }
    url = location;
  }
  if (!code) throw new Error("Could not obtain Bullhorn authorization code");

  const tokenResp = await fetch(`${regionalOrigin}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "authorization_code", code, client_id: clientId, client_secret: clientSecret }).toString(),
  });
  if (!tokenResp.ok) throw new Error("Bullhorn token exchange failed: " + await tokenResp.text());
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
  if (!loginResp.ok) throw new Error("Bullhorn REST login failed");
  const session = await loginResp.json();
  if (!session.BhRestToken || !session.restUrl) throw new Error("Invalid Bullhorn REST login response");
  cachedSession = { bhRestToken: session.BhRestToken, restUrl: session.restUrl, expiresAt: Date.now() + 8 * 60 * 1000 };
  return { bhRestToken: session.BhRestToken, restUrl: session.restUrl };
}

async function bullhornFetch(path: string, params: Record<string, string> = {}, retried = false): Promise<any> {
  const { bhRestToken, restUrl } = await getBullhornSession();
  const url = new URL(`${restUrl}${path}`);
  url.searchParams.set("BhRestToken", bhRestToken);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const resp = await fetch(url.toString());
  if (!resp.ok) {
    if (resp.status === 401 && !retried) { cachedSession = null; return bullhornFetch(path, params, true); }
    throw new Error(`Bullhorn API error (${resp.status}): ${await resp.text()}`);
  }
  return resp.json();
}

// ─── Tavily APIs ───

function getTavilyHeaders(): { Authorization: string; "Content-Type": string } {
  const apiKey = Deno.env.get("TAVILY_API_KEY");
  if (!apiKey) throw new Error("TAVILY_API_KEY is not configured");
  return { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
}

async function tavilySearch(query: string, maxResults = 5, searchDepth = "basic", includeAnswer = true): Promise<any> {
  const resp = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: getTavilyHeaders(),
    body: JSON.stringify({ query, max_results: Math.min(maxResults, 10), search_depth: searchDepth, include_answer: includeAnswer }),
  });
  if (!resp.ok) throw new Error(`Tavily Search error (${resp.status}): ${await resp.text()}`);
  return resp.json();
}

async function tavilyExtract(urls: string[], query?: string, extractDepth = "basic"): Promise<any> {
  const body: any = { urls, extract_depth: extractDepth };
  if (query) body.query = query;
  const resp = await fetch("https://api.tavily.com/extract", {
    method: "POST",
    headers: getTavilyHeaders(),
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(`Tavily Extract error (${resp.status}): ${await resp.text()}`);
  return resp.json();
}

async function tavilyCrawl(url: string, instructions?: string, maxDepth = 1, limit = 10): Promise<any> {
  const body: any = { url, max_depth: Math.min(maxDepth, 3), limit: Math.min(limit, 20) };
  if (instructions) body.instructions = instructions;
  const resp = await fetch("https://api.tavily.com/crawl", {
    method: "POST",
    headers: getTavilyHeaders(),
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(`Tavily Crawl error (${resp.status}): ${await resp.text()}`);
  return resp.json();
}

async function tavilyResearch(input: string, model = "auto"): Promise<any> {
  // Default to "mini" for speed — edge functions have limited wall-clock time
  const effectiveModel = model === "auto" ? "mini" : model;
  
  // Step 1: Create research task
  const createResp = await fetch("https://api.tavily.com/research", {
    method: "POST",
    headers: getTavilyHeaders(),
    body: JSON.stringify({ input, model: effectiveModel }),
  });
  if (!createResp.ok) throw new Error(`Tavily Research error (${createResp.status}): ${await createResp.text()}`);
  const task = await createResp.json();
  const requestId = task.request_id;
  if (!requestId) throw new Error("No request_id returned from Tavily Research");

  // Step 2: Poll for completion (max ~40 seconds to stay within edge function limits)
  const headers = getTavilyHeaders();
  let lastResult: any = null;
  for (let i = 0; i < 13; i++) {
    await new Promise(r => setTimeout(r, 3000));
    const pollResp = await fetch(`https://api.tavily.com/research/${requestId}`, {
      method: "GET",
      headers,
    });
    if (pollResp.status === 202) continue;
    if (!pollResp.ok) throw new Error(`Tavily Research poll error (${pollResp.status}): ${await pollResp.text()}`);
    const result = await pollResp.json();
    if (result.status === "completed") return result;
    if (result.status === "failed") throw new Error("Tavily Research task failed");
    lastResult = result;
  }
  if (lastResult && lastResult.content) {
    return { ...lastResult, status: "partial", note: "Research was still in progress but partial results are available." };
  }
  throw new Error("Tavily Research timed out — try using tavily_search with search_depth='advanced' instead for faster results");
}

// ─── Server-Side Tool Execution ───

async function executeServerTool(name: string, argsStr: string): Promise<string> {
  try {
    const args = JSON.parse(argsStr);
    switch (name) {
      case "search_bullhorn": {
        const data = await bullhornFetch("find", {
          query: args.query,
          countPerEntity: String(args.count || 5),
          meta: "full",
        });
        const results = (data.data || []).map((item: any) => {
          const label = item.title || [item.firstName, item.lastName].filter(Boolean).join(" ") || item.name || item.companyName || `${item.entityType} ${item.id}`;
          return { entityType: item.entityType, id: item.id, label };
        });
        return JSON.stringify({ results }, null, 2);
      }
      case "get_candidate_profile": {
        const fields = "id,firstName,lastName,email,phone,mobile,status,source,address,occupation,skillSet,primarySkills,experience,salary,hourlyRate,dateAvailable,companyName,educationDegree,employmentPreference,willRelocate,dayRate,dayRateLow,description";
        const data = await bullhornFetch(`entity/Candidate/${args.id}`, { fields });
        return JSON.stringify(data.data || data, null, 2);
      }
      case "get_job_details": {
        const fields = "id,title,status,employmentType,clientCorporation,clientContact,address,salary,salaryUnit,startDate,dateEnd,numOpenings,publicDescription,skills,yearsRequired,educationDegree";
        const data = await bullhornFetch(`entity/JobOrder/${args.id}`, { fields });
        return JSON.stringify(data.data || data, null, 2);
      }
      case "search_candidates": {
        const fields = "id,firstName,lastName,email,phone,status,address,occupation,skillSet,experience,salary,hourlyRate,companyName";
        const data = await bullhornFetch("search/Candidate", {
          query: args.query,
          fields,
          count: String(args.count || 10),
          sort: args.sort || "-dateLastModified",
        });
        return JSON.stringify(data, null, 2);
      }
      case "search_jobs": {
        const fields = "id,title,status,employmentType,clientCorporation,address,salary,startDate,dateEnd,numOpenings,publicDescription";
        const data = await bullhornFetch("search/JobOrder", {
          query: args.query,
          fields,
          count: String(args.count || 10),
          sort: args.sort || "-dateAdded",
        });
        return JSON.stringify(data, null, 2);
      }
      case "batch_resolve_entities": {
        const results = [];
        for (const entity of (args.entities || [])) {
          try {
            const data = await bullhornFetch(`entity/${entity.entityType}/${entity.entityId}`, { fields: "id,firstName,lastName,name,title,companyName" });
            const d = data.data || data;
            const label = [d.firstName, d.lastName].filter(Boolean).join(" ") || d.name || d.title || d.companyName || `${entity.entityType} ${entity.entityId}`;
            results.push({ entityType: entity.entityType, entityId: entity.entityId, label });
          } catch {
            results.push({ entityType: entity.entityType, entityId: entity.entityId, label: `${entity.entityType} ${entity.entityId}`, error: "Not found" });
          }
        }
        return JSON.stringify({ results }, null, 2);
      }
      case "search_placements": {
        const fields = "id,status,candidate,jobOrder,dateBegin,dateEnd,salary,payRate,clientBillRate";
        const data = await bullhornFetch("search/Placement", {
          query: args.query,
          fields,
          count: String(args.count || 10),
          sort: args.sort || "-dateAdded",
        });
        return JSON.stringify(data, null, 2);
      }
      case "get_placement_details": {
        const fields = "id,status,candidate,jobOrder,dateBegin,dateEnd,salary,payRate,clientBillRate,employeeType,employmentType,comments,customText1";
        const data = await bullhornFetch(`entity/Placement/${args.id}`, { fields });
        return JSON.stringify(data.data || data, null, 2);
      }
      case "tavily_search": {
        const data = await tavilySearch(
          args.query,
          args.max_results || 5,
          args.search_depth || "basic",
          args.include_answer !== false,
        );
        // Trim for context window
        const trimmed = {
          answer: data.answer,
          results: (data.results || []).slice(0, 8).map((r: any) => ({
            title: r.title,
            url: r.url,
            content: (r.content || "").slice(0, 500),
          })),
        };
        return JSON.stringify(trimmed, null, 2);
      }
      case "tavily_extract": {
        const data = await tavilyExtract(
          args.urls,
          args.query,
          args.extract_depth || "basic",
        );
        const trimmed = {
          results: (data.results || []).map((r: any) => ({
            url: r.url,
            content: (r.raw_content || "").slice(0, 2000),
          })),
          failed: data.failed_results || [],
        };
        return JSON.stringify(trimmed, null, 2);
      }
      case "tavily_crawl": {
        const data = await tavilyCrawl(
          args.url,
          args.instructions,
          args.max_depth || 1,
          args.limit || 10,
        );
        const trimmed = {
          base_url: data.base_url,
          results: (data.results || []).slice(0, 10).map((r: any) => ({
            url: r.url,
            content: (r.raw_content || "").slice(0, 1000),
          })),
        };
        return JSON.stringify(trimmed, null, 2);
      }
      case "tavily_research": {
        const data = await tavilyResearch(
          args.input,
          args.model || "auto",
        );
        const trimmed = {
          content: (data.content || "").slice(0, 5000),
          sources: (data.sources || []).slice(0, 10).map((s: any) => ({
            title: s.title,
            url: s.url,
          })),
        };
        return JSON.stringify(trimmed, null, 2);
      }
      default:
        return JSON.stringify({ error: `Unknown server tool: ${name}` });
    }
  } catch (e) {
    console.error(`Tool ${name} error:`, e);
    return JSON.stringify({ error: e instanceof Error ? e.message : "Tool execution failed" });
  }
}

// ─── AI Streaming ───

interface StreamResult {
  content: string;
  toolCalls: any[];
}

async function callAI(
  apiMessages: any[],
  apiKey: string,
  send: (type: string, data: any) => void,
  streamTokens: boolean,
): Promise<StreamResult> {
  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: apiMessages,
      tools: TOOLS,
      stream: true,
    }),
  });

  if (!response.ok) {
    const status = response.status;
    const t = await response.text();
    console.error("AI gateway error:", status, t);
    if (status === 429) throw new Error("RATE_LIMIT");
    if (status === 402) throw new Error("PAYMENT_REQUIRED");
    throw new Error("AI_GATEWAY_ERROR");
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  const toolCallDeltas: Record<number, { id: string; type: string; function: { name: string; arguments: string } }> = {};
  let firstContentSent = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    let newlineIdx: number;
    while ((newlineIdx = buffer.indexOf("\n")) !== -1) {
      let line = buffer.slice(0, newlineIdx);
      buffer = buffer.slice(newlineIdx + 1);

      if (line.endsWith("\r")) line = line.slice(0, -1);
      if (line.startsWith(":") || line.trim() === "") continue;
      if (!line.startsWith("data: ")) continue;

      const jsonStr = line.slice(6).trim();
      if (jsonStr === "[DONE]") break;

      try {
        const parsed = JSON.parse(jsonStr);
        const delta = parsed.choices?.[0]?.delta;
        if (!delta) continue;

        if (delta.content) {
          if (!firstContentSent && streamTokens) {
            send("status", { phase: "responding", message: "AI is responding..." });
            firstContentSent = true;
          }
          content += delta.content;
          if (streamTokens) send("token", { content: delta.content });
        }

        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index;
            if (!toolCallDeltas[idx]) {
              toolCallDeltas[idx] = { id: tc.id || "", type: "function", function: { name: "", arguments: "" } };
            }
            if (tc.id) toolCallDeltas[idx].id = tc.id;
            if (tc.function?.name) toolCallDeltas[idx].function.name += tc.function.name;
            if (tc.function?.arguments) toolCallDeltas[idx].function.arguments += tc.function.arguments;
          }
        }
      } catch {
        buffer = line + "\n" + buffer;
        break;
      }
    }
  }

  const toolCalls = Object.values(toolCallDeltas);
  return { content, toolCalls };
}

// ─── Main Handler ───

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, worksheetTitle, currentHtml, worksheetContent } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const wsRefContext = worksheetContent
      ? "\n\nWORKSHEET CONTENT (READ-ONLY REFERENCE):\nThis worksheet also has an editor panel with the following content. You can reference this to inform your designs (e.g. pull data, names, structure from the worksheet), but you CANNOT modify the worksheet from design mode.\n---\n" + worksheetContent + "\n---"
      : "";

    const systemPrompt = `You are an expert web designer and developer AI. You build complete, interactive, standalone HTML webpages inside a design worksheet.

Current worksheet:
- Title: "${worksheetTitle || "Untitled"}"
- Current HTML content:
\`\`\`html
${currentHtml || "<!-- empty - no page built yet -->"}
\`\`\`${wsRefContext}

YOUR ROLE:
- You are a webpage builder. When the user asks you to create, modify, or build something, use the replace_design_html tool to output a COMPLETE standalone HTML document.
- Always output a full <!DOCTYPE html> page with everything self-contained.
- You can use CDN links for libraries like Tailwind CSS, Chart.js, Three.js, Alpine.js, GSAP, D3.js, etc.
- Include all CSS in <style> tags or via CDN links.
- Include all JavaScript in <script> tags or via CDN links.
- Make pages visually polished and modern by default.
- When modifying an existing page, preserve what the user didn't ask to change.
- For interactivity, use vanilla JavaScript or lightweight libraries.

MOBILE-FIRST & RESPONSIVE DESIGN (MANDATORY):
- ALL designs MUST be built mobile-first. Write CSS for small screens first, then use min-width media queries (or Tailwind responsive prefixes like sm:, md:, lg:) to enhance for larger screens.
- Use fluid layouts: prefer flexbox/grid with wrapping, percentage widths, and max-width containers. Avoid fixed pixel widths for layout elements.
- Typography must scale: use clamp() or responsive font sizes (e.g. text-base md:text-lg lg:text-xl).
- Images and media must be responsive: max-width: 100%, height: auto.
- Touch targets must be at least 44×44px on mobile.
- Navigation must collapse to a hamburger menu or equivalent on small screens.
- Test mental model: the page MUST look perfect on a 375px wide phone, good on a 768px tablet, and great on 1440px desktop.
- Always include <meta name="viewport" content="width=device-width, initial-scale=1"> in the <head>.
- Horizontal scroll is NEVER acceptable. Every section must fit within the viewport width at any screen size.
- After building/modifying, briefly describe what you built or changed.

IMPORTANT:
- Every call to replace_design_html must contain the COMPLETE HTML document, not a partial snippet.
- If the user asks a question (not a build request), respond conversationally without calling tools.
- You may also change the title if appropriate using update_worksheet_title.

DATA & RESEARCH TOOLS:
- You have access to Bullhorn CRM to search and retrieve candidate, job, and company data. Use search_bullhorn for free-text search, search_candidates / search_jobs for structured Lucene queries, and get_candidate_profile / get_job_details for full records.
- You have access to Tavily web search for real-time market research, company information, industry data, salary benchmarks, news, and any other web-based research.
- When building data-driven designs (reports, dossiers, proposals), proactively use these tools to pull real data.
- When the user mentions a candidate, job, or company by name, search for them in Bullhorn first.

═══════════════════════════════════════════════════════════════
MANDATORY BRAND IDENTITY: LANDING POINT VISUAL IDENTITY SYSTEM
═══════════════════════════════════════════════════════════════

You MUST apply the following branding rules to EVERY design you create. These are non-negotiable.

## 1. Brand Essence

Landing Point is a premier executive search and professional recruiting firm specializing in high-impact placements within financial services and emerging startups.

- The Look: Human, Specialized, and Meticulous.
- The Feel: Relationship-first, authentic, and humble.
- The Promise: Relationships first, always.

Key Values: Relationships First, Keeping it Human, Think Differently, Meticulous Craft, Specialized Expertise.

## 2. Color System: "The Deep Ocean"

### Primary Colors (The Foundation)
| Token | Hex | Role |
|---|---|---|
| Deep Teal | #0e363c | Authority — "boardroom" color for covers, headers, footers |
| Rich Teal | #0f4d5c | Depth — secondary backgrounds, dimensionality |
| Muted Teal | #479cb0 | Structure — borders, grid lines, iconography |
| Off White | #f9f9f9 | Canvas — NEVER use pure white (#FFFFFF) for backgrounds |

### Accent Colors (The Signal)
| Token | Hex | STRICT CONSTRAINT |
|---|---|---|
| Cyan Pop | #3fbcd0 | NEVER use on white. Only on Deep/Rich Teal. Represents "AI" insight |
| Pale Blue | #d7eef4 | Tag backgrounds and subtle separators on light backgrounds |

### Semantic Status
- Verified (Emerald): >80% match confidence
- Caution (Amber): Discrepancies in salary/timeline
- Critical (Rose): Deal-breakers or non-competes

## 3. Typography: "Voice" vs "Data"

Separate narrative from fact:

1. The Voice (Headings): DM Serif Display — Headlines, Financial Figures, Company Names. Load via Google Fonts CDN.
2. The Data (Body): Public Sans — Job descriptions, contracts, bullet points, metadata. Load via Google Fonts CDN.
3. The Micro-Copy (Eyebrow): Public Sans Bold, Uppercase, Wide Tracking (letter-spacing: 0.1em). Color: Muted Teal (#479cb0).

Always include these Google Fonts in the <head>:
<link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=Public+Sans:wght@400;600;700&display=swap" rel="stylesheet">

## 4. Dual-State Design Strategy

### MODE A: "The Black Box" (Dark Mode)
- Use Case: High-impact, emotional, exclusive (job offers, "Top Secret" opportunities)
- Dominant Colors: Deep Teal, Rich Teal, Cyan Pop
- Vibe: "You have been selected."

### MODE B: "The White Paper" (Light Mode)
- Use Case: Analytical, transparent, detail-oriented (reports, dossiers, analysis)
- Dominant Colors: Off White, Black, Muted Teal
- Vibe: "Here is the undeniable proof."

Choose mode based on the document purpose. Default to Light Mode for data-heavy documents.

## 5. Applied Design Templates

### Executive Search Proposal (16:9)
- Cover (Dark): Deep Teal bg, Serif title in Pale Blue, Micro-copy subtitle in Muted Teal, single Cyan Pop horizontal rule
- Market Map (Light): Off White bg, Serif headers in Deep Teal, Pale Blue highlights for "Poachable Talent"

### Market Intelligence Report (A4)
- "Insight Box": Pale Blue bg, thick Emerald left border (border-left: 4px), Serif headline, Sans body
- Charts: Rich Teal bars, Deep Teal highlight bar, Muted Teal thin axis lines

### Exclusive Opportunity Brief (Mobile/Dark)
- "CONFIDENTIAL" stamp in Muted Teal, huge Serif role title in White, comp range in Cyan Pop
- "Match" Badge: pill-shaped, Emerald (Verified) color, e.g. "98% COMPATIBILITY"
- Rich Teal cards for key benefits

### Interview Protocol Dossier (A4/Light)
- Sidebar layout: Left 2/3 content, Right 1/3 grey sidebar for logistics
- Interviewer cards: Muted Teal borders, Serif name, Sans title, small "Focus Area" tags

## 6. Fine Details

### Iconography (Lucide)
- Stroke Width: 1.5px
- Color: Always Muted Teal (#479cb0). Never black.
- Placement: Always left of an H3 or Eyebrow header.
- Include Lucide via CDN if icons are needed.

### Data Visualization
- NO PIE CHARTS. Use bar & line charts only.
- Grid Lines: Dotted or dashed Muted Teal, never solid.
- Currency/Percentages: Serif font. Dates/Counts: Sans or Monospace.

### Spacing & Layout
- Standard margins: 20mm equivalent padding
- Generous whitespace. Clean grid alignment.

## 7. Logo Protocol

- Logo clear space: minimum 24px on all sides
- Dark Mode: Use white logo version or place dark logo in Off White container (rounded, shadow)
- Light Mode: Logo top-left, sized to match H1 height (~32-40px)
- IMPORTANT: Logo files are available at these PUBLIC URLs and MUST be used as <img> tags with these exact URLs:
  - Full logo (horizontal, dark text for light backgrounds): https://landi-worksheets.lovable.app/logo-full.png
  - Dark background version (white text): https://landi-worksheets.lovable.app/logo-dark.png
  - Light background version (dark text): https://landi-worksheets.lovable.app/logo-light.png
- Example: <img src="https://landi-worksheets.lovable.app/logo-full.png" alt="Landing Point" style="height: 40px;">
- ALWAYS use these absolute URLs. NEVER use relative paths like ./logo.png — they will not work in the design iframe.

## 8. Header Templates

### Light Mode Header (Reports/Dossiers)
Logo top-left, "CONFIDENTIAL" or classification top-right in Muted Teal eyebrow style, 1px Muted Teal horizontal rule below.

### Dark Mode Header (Executive/Exclusive)
Logo centered, search mandate ID in Pale Blue eyebrow below, large Serif title in White below that.

### Market Analysis Header
Logo left with thin Muted Teal vertical divider, report title right of divider in Serif Deep Teal.

═══════════════════════════════════════════════════════════════
END OF BRAND IDENTITY GUIDELINES
═══════════════════════════════════════════════════════════════`;

    let apiMessages: any[] = [
      { role: "system", content: systemPrompt },
      ...messages,
    ];

    const stream = new ReadableStream({
      async start(controller) {
        const send = (type: string, data: any) => {
          controller.enqueue(new TextEncoder().encode(sseEvent(type, data)));
        };
        controller.enqueue(new TextEncoder().encode(`: connected\n\n`));

        try {
          for (let loop = 0; loop < MAX_LOOPS; loop++) {
            send("status", {
              step: loop + 1,
              phase: "thinking",
              message: loop === 0 ? "Designing your page..." : "Processing...",
            });

            let keepAlive = true;
            const pingInterval = setInterval(() => {
              if (keepAlive) {
                try { controller.enqueue(new TextEncoder().encode(`: ping\n\n`)); } catch {}
              }
            }, 3000);

            // Only stream tokens to the client on the last pass (when we expect text output).
            // During server-side tool loops, suppress token streaming to keep it clean.
            const isFirstOrFinalPass = loop === 0;

            let result: StreamResult;
            try {
              result = await callAI(apiMessages, LOVABLE_API_KEY, send, true);
            } catch (e: any) {
              keepAlive = false;
              clearInterval(pingInterval);
              if (e.message === "RATE_LIMIT") {
                send("error", { error: "Rate limit exceeded. Please try again in a moment." });
              } else if (e.message === "PAYMENT_REQUIRED") {
                send("error", { error: "AI credits exhausted. Please add funds in Settings → Workspace → Usage." });
              } else {
                send("error", { error: "AI gateway error" });
              }
              controller.close();
              return;
            } finally {
              keepAlive = false;
              clearInterval(pingInterval);
            }

            const { content, toolCalls } = result;

            if (toolCalls.length === 0) {
              // No tools — final text response
              send("done", { message: { role: "assistant", content: content || "" } });
              controller.close();
              return;
            }

            // Separate client-side vs server-side tool calls
            const clientToolCalls = toolCalls.filter(tc => CLIENT_TOOLS.has(tc.function.name));
            const serverToolCalls = toolCalls.filter(tc => !CLIENT_TOOLS.has(tc.function.name));

            if (serverToolCalls.length > 0) {
              // Show status for server-side tools
              const serverLabels = serverToolCalls.map(tc => TOOL_LABELS[tc.function.name] || tc.function.name);
              send("status", {
                step: loop + 1,
                phase: "tools",
                message: serverLabels.join(", ") + "...",
              });

              // Execute server-side tools
              const assistantMsg: any = { role: "assistant", content: content || "" };
              assistantMsg.tool_calls = toolCalls;
              apiMessages.push(assistantMsg);

              for (const tc of serverToolCalls) {
                const toolResult = await executeServerTool(tc.function.name, tc.function.arguments);
                apiMessages.push({
                  role: "tool",
                  content: toolResult,
                  tool_call_id: tc.id,
                  name: tc.function.name,
                });
              }

              // If there are also client-side tool calls, we need to return them along with
              // fake "success" tool results for the server-side ones so the AI can continue
              if (clientToolCalls.length > 0) {
                const allLabels = toolCalls.map(tc => TOOL_LABELS[tc.function.name] || tc.function.name);
                send("tool_calls", {
                  step: loop + 1,
                  tools: toolCalls.map(tc => tc.function.name),
                  message: allLabels.join(", ") + "...",
                });

                const finalMessage: any = { role: "assistant", content: content || "" };
                finalMessage.tool_calls = toolCalls;
                // Include server tool results so the client can add them to conversation
                finalMessage._server_tool_results = serverToolCalls.map(tc => ({
                  tool_call_id: tc.id,
                  name: tc.function.name,
                  content: apiMessages.find((m: any) => m.tool_call_id === tc.id)?.content || "Done",
                }));
                send("done", { message: finalMessage });
                controller.close();
                return;
              }

              // Only server tools — continue the loop so AI can process results
              continue;
            }

            // Only client-side tool calls — return to client for execution
            const toolCallLabels = clientToolCalls.map(tc => TOOL_LABELS[tc.function.name] || tc.function.name);
            send("tool_calls", {
              step: loop + 1,
              tools: clientToolCalls.map(tc => tc.function.name),
              message: toolCallLabels.join(", ") + "...",
            });

            const finalMessage: any = { role: "assistant", content: content || "" };
            finalMessage.tool_calls = toolCalls;
            send("done", { message: finalMessage });
            controller.close();
            return;
          }

          send("done", {
            message: { role: "assistant", content: "I encountered an issue processing your request. Please try again." },
          });
          controller.close();
        } catch (e) {
          console.error("SSE stream error:", e);
          try {
            controller.enqueue(new TextEncoder().encode(sseEvent("error", { error: e instanceof Error ? e.message : "Unknown error" })));
            controller.close();
          } catch {}
        }
      },
    });

    return new Response(stream, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });
  } catch (e) {
    console.error("design-chat error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
