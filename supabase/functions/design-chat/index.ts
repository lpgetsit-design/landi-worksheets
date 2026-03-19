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
  // Server-side: Tavily Web Search
  {
    type: "function",
    function: {
      name: "tavily_search",
      description: "Search the web using Tavily for real-time information. Returns relevant search results with content snippets. Use for market research, company info, industry data, salary benchmarks, news, etc.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "The search query" },
          max_results: { type: "number", description: "Max results (default 5, max 10)" },
          search_depth: { type: "string", description: "'basic' (fast) or 'advanced' (thorough, default 'basic')" },
          include_answer: { type: "boolean", description: "Include AI-generated answer summary (default true)" },
        },
        required: ["query"],
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
  tavily_search: "Researching the web",
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

// ─── Tavily Search ───

async function tavilySearch(query: string, maxResults = 5, searchDepth = "basic", includeAnswer = true): Promise<any> {
  const apiKey = Deno.env.get("TAVILY_API_KEY");
  if (!apiKey) throw new Error("TAVILY_API_KEY is not configured");

  const resp = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      max_results: Math.min(maxResults, 10),
      search_depth: searchDepth,
      include_answer: includeAnswer,
    }),
  });
  if (!resp.ok) throw new Error(`Tavily API error (${resp.status}): ${await resp.text()}`);
  return resp.json();
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
    const { messages, worksheetTitle, currentHtml } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const systemPrompt = `You are an expert web designer and developer AI. You build complete, interactive, standalone HTML webpages inside a design worksheet.

Current worksheet:
- Title: "${worksheetTitle || "Untitled"}"
- Current HTML content:
\`\`\`html
${currentHtml || "<!-- empty - no page built yet -->"}
\`\`\`

YOUR ROLE:
- You are a webpage builder. When the user asks you to create, modify, or build something, use the replace_design_html tool to output a COMPLETE standalone HTML document.
- Always output a full <!DOCTYPE html> page with everything self-contained.
- You can use CDN links for libraries like Tailwind CSS, Chart.js, Three.js, Alpine.js, GSAP, D3.js, etc.
- Include all CSS in <style> tags or via CDN links.
- Include all JavaScript in <script> tags or via CDN links.
- Make pages visually polished and modern by default.
- When modifying an existing page, preserve what the user didn't ask to change.
- Keep designs responsive and mobile-friendly.
- For interactivity, use vanilla JavaScript or lightweight libraries.
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
- Logo files are referenced as ./logo-dark.png (white version for dark bg) and ./logo-light.png (dark version for light bg)
- When creating documents that would have a logo, include placeholder positioning with the text "LANDING POINT" in the appropriate style until actual logo assets are provided.

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
