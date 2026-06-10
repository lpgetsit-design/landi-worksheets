import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { RotateCcw, MessageSquare, PanelRightOpen, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { marked } from "marked";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/AuthProvider";
import WorksheetMentionInput, { type WorksheetMention } from "@/components/chat/WorksheetMentionInput";
import DesignPanel, { type ChatDesign, type DesignRevision } from "@/components/chat/DesignPanel";
import ShareDialog from "@/components/share/ShareDialog";

interface ToolCall {
  id: string;
  function: { name: string; arguments: string };
}

interface Message {
  id: string;
  role: "user" | "assistant" | "tool";
  content: string;
  mentions?: WorksheetMention[];
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
}

const DESIGN_CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/design-chat`;

const ChatPage = () => {
  const { sessionId: routeSessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  // Bootstrap: if no sessionId in URL, create one and redirect.
  const bootstrappingRef = useRef(false);
  useEffect(() => {
    if (routeSessionId || !user || bootstrappingRef.current) return;
    bootstrappingRef.current = true;
    (async () => {
      const { data, error } = await supabase
        .from("chat_sessions")
        .insert([{ user_id: user.id, title: "New chat" }])
        .select()
        .single();
      if (error || !data) {
        toast.error("Could not start a new chat");
        return;
      }
      navigate(`/chat/${data.id}`, { replace: true });
    })();
  }, [routeSessionId, user, navigate]);

  if (!routeSessionId) {
    return (
      <div className="flex h-[calc(100vh-3.5rem)] items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Starting chat…
      </div>
    );
  }

  return <ChatSessionView key={routeSessionId} sessionId={routeSessionId} />;
};

export default ChatPage;

// ─────────────────────────────────────────────────────────────────

interface SessionViewProps {
  sessionId: string;
}

const ChatSessionView = ({ sessionId }: SessionViewProps) => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [messages, setMessages] = useState<Message[]>([]);
  const [designs, setDesigns] = useState<ChatDesign[]>([]);
  const [viewingDesignId, setViewingDesignId] = useState<string | null>(null);
  const [revisionIndex, setRevisionIndex] = useState(0);
  const [panelOpen, setPanelOpen] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [thinking, setThinking] = useState<string | null>(null);
  const [streaming, setStreaming] = useState("");
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const lastUserTextRef = useRef<string>("");

  // ── Load session data
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoaded(false);
      const [msgsRes, designsRes] = await Promise.all([
        supabase
          .from("chat_messages")
          .select("*")
          .eq("session_id", sessionId)
          .in("role", ["user", "assistant"])
          .order("created_at"),
        supabase
          .from("chat_designs")
          .select("*, chat_design_revisions(*)")
          .eq("session_id", sessionId)
          .order("created_at"),
      ]);
      if (cancelled) return;
      if (msgsRes.error) toast.error("Failed to load chat messages");
      if (designsRes.error) toast.error("Failed to load designs");

      const loadedMessages: Message[] = (msgsRes.data || []).map((m: any) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        mentions: m.mentions || [],
      }));
      const loadedDesigns: ChatDesign[] = (designsRes.data || []).map((d: any) => ({
        id: d.id,
        title: d.title,
        status: d.status,
        updated_at: d.updated_at,
        revisions: ((d.chat_design_revisions as any[]) || [])
          .map((r) => ({ id: r.id, revision_index: r.revision_index, html: r.html }))
          .sort((a, b) => a.revision_index - b.revision_index),
      }));
      setMessages(loadedMessages);
      setDesigns(loadedDesigns);

      const active = loadedDesigns.find((d) => d.status === "active");
      if (active) {
        setViewingDesignId(active.id);
        setRevisionIndex(Math.max(0, active.revisions.length - 1));
        setPanelOpen(true);
      } else if (loadedDesigns.length > 0) {
        // No active draft; default to most recent saved one but keep panel closed.
        setViewingDesignId(loadedDesigns[loadedDesigns.length - 1].id);
      }
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  // ── Derived
  const viewingDesign = useMemo(
    () => designs.find((d) => d.id === viewingDesignId) || null,
    [designs, viewingDesignId],
  );
  const activeDesign = useMemo(
    () => designs.find((d) => d.status === "active") || null,
    [designs],
  );
  const savedDesigns = useMemo(
    () => designs.filter((d) => d.status === "saved"),
    [designs],
  );

  const scrollToBottom = useCallback(() => {
    setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  }, []);
  useEffect(() => {
    scrollToBottom();
  }, [messages, streaming, thinking, scrollToBottom]);

  // ── DB helpers
  const persistMessage = async (m: Omit<Message, "id"> & { id?: string }): Promise<string | null> => {
    const { data, error } = await supabase
      .from("chat_messages")
      .insert([{
        session_id: sessionId,
        role: m.role,
        content: m.content || "",
        mentions: (m.mentions || []) as any,
        tool_name: m.name || null,
      }])
      .select("id")
      .single();
    if (error) {
      console.error("persistMessage failed", error);
      return null;
    }
    await supabase.from("chat_sessions").update({ updated_at: new Date().toISOString() }).eq("id", sessionId);
    return data?.id ?? null;
  };

  const autoTitleFromText = (text: string): string => {
    const cleaned = (text || "").replace(/\s+/g, " ").trim();
    if (!cleaned) return "Design";
    return cleaned.length > 60 ? cleaned.slice(0, 57) + "…" : cleaned;
  };

  const ensureActiveDesign = async (titleHint: string): Promise<string> => {
    const existing = designs.find((d) => d.status === "active");
    if (existing) return existing.id;
    const title = autoTitleFromText(titleHint);
    const { data, error } = await supabase
      .from("chat_designs")
      .insert([{ session_id: sessionId, title, status: "active" }])
      .select()
      .single();
    if (error || !data) throw new Error("Could not create design draft");
    const now = new Date().toISOString();
    const newDesign: ChatDesign = { id: data.id, title: data.title, status: "active", updated_at: now, revisions: [] };
    setDesigns((prev) => [...prev, newDesign]);
    return data.id;
  };

  const appendRevision = async (html: string, promptMessageId: string | null): Promise<void> => {
    const designId = await ensureActiveDesign(lastUserTextRef.current);
    const currentRevs = designs.find((d) => d.id === designId)?.revisions ?? [];
    const nextIdx = (currentRevs[currentRevs.length - 1]?.revision_index ?? -1) + 1;
    const { data, error } = await supabase
      .from("chat_design_revisions")
      .insert([{
        design_id: designId,
        revision_index: nextIdx,
        html,
        prompt_message_id: promptMessageId,
      }])
      .select()
      .single();
    if (error || !data) {
      console.error("appendRevision failed", error);
      toast.error("Failed to save design revision");
      return;
    }
    const newRev: DesignRevision = { id: data.id, revision_index: data.revision_index, html: data.html };
    const now = new Date().toISOString();
    setDesigns((prev) =>
      prev.map((d) =>
        d.id === designId
          ? { ...d, revisions: [...d.revisions, newRev], updated_at: now }
          : d,
      ),
    );
    setViewingDesignId(designId);
    setRevisionIndex(currentRevs.length); // after this insert, index = currentRevs.length
    setPanelOpen(true);
  };

  const saveDraft = async () => {
    if (!activeDesign) return;
    setSaving(true);
    const { error } = await supabase
      .from("chat_designs")
      .update({ status: "saved" })
      .eq("id", activeDesign.id);
    setSaving(false);
    if (error) {
      toast.error("Could not save draft");
      return;
    }
    const now = new Date().toISOString();
    setDesigns((prev) =>
      prev.map((d) => (d.id === activeDesign.id ? { ...d, status: "saved", updated_at: now } : d)),
    );
    toast.success("Draft saved — next design will start fresh");
  };

  const renameTitle = async (title: string) => {
    if (!viewingDesign) return;
    const now = new Date().toISOString();
    setDesigns((prev) => prev.map((d) => (d.id === viewingDesign.id ? { ...d, title, updated_at: now } : d)));
    await supabase.from("chat_designs").update({ title }).eq("id", viewingDesign.id);
  };

  // Reopen a saved draft for further iteration. Demote any currently-active
  // design to "saved" so the model's constraint of one active draft per
  // session is preserved, then promote the selected one to "active".
  const reopenSavedDraft = async (designId: string) => {
    const target = designs.find((d) => d.id === designId);
    if (!target) return;
    if (target.status === "active") {
      setViewingDesignId(designId);
      setRevisionIndex(Math.max(0, target.revisions.length - 1));
      setPanelOpen(true);
      return;
    }
    const current = designs.find((d) => d.status === "active");
    let demoteErr: any = null;
    if (current && current.id !== designId) {
      const r = await supabase
        .from("chat_designs")
        .update({ status: "saved" })
        .eq("id", current.id);
      demoteErr = r.error;
    }
    const promote = await supabase
      .from("chat_designs")
      .update({ status: "active" })
      .eq("id", designId);
    if (demoteErr || promote.error) {
      toast.error("Could not reopen draft");
      return;
    }
    const now = new Date().toISOString();
    setDesigns((prev) =>
      prev.map((d) => {
        if (d.id === designId) return { ...d, status: "active", updated_at: now };
        if (current && d.id === current.id) return { ...d, status: "saved", updated_at: now };
        return d;
      }),
    );
    setViewingDesignId(designId);
    setRevisionIndex(Math.max(0, target.revisions.length - 1));
    setPanelOpen(true);
    toast.success("Draft reopened — new edits will add a revision");
  };

  // ── Streaming
  const streamOnce = async (apiMessages: any[], referencedWorksheets: WorksheetMention[]) => {
    const currentHtml =
      activeDesign?.revisions?.[activeDesign.revisions.length - 1]?.html || "";

    const resp = await fetch(DESIGN_CHAT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      },
      body: JSON.stringify({
        messages: apiMessages,
        currentHtml,
        referencedWorksheets,
      }),
      signal: abortRef.current?.signal,
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ error: "Request failed" }));
      toast.error(err.error || "AI request failed");
      return null;
    }

    const reader = resp.body?.getReader();
    if (!reader) return null;

    const decoder = new TextDecoder();
    let buffer = "";
    let currentEvent = "";
    let streamed = "";
    let finalMessage: any = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        if (line.startsWith(":") || line === "") continue;
        if (line.startsWith("event: ")) {
          currentEvent = line.slice(7).trim();
          continue;
        }
        if (line.startsWith("data: ")) {
          const data = line.slice(6);
          try {
            const parsed = JSON.parse(data);
            switch (currentEvent) {
              case "status":
                setThinking(parsed.message);
                if (parsed.phase === "thinking") {
                  streamed = "";
                  setStreaming("");
                }
                break;
              case "token":
                streamed += parsed.content;
                setStreaming(streamed);
                setThinking(null);
                break;
              case "tool_calls":
                setThinking(parsed.message);
                streamed = "";
                setStreaming("");
                break;
              case "done":
                finalMessage = parsed.message;
                setThinking(null);
                setStreaming("");
                break;
              case "error":
                toast.error(parsed.error || "AI error");
                setThinking(null);
                setStreaming("");
                return null;
            }
            currentEvent = "";
          } catch {
            buffer = `event: ${currentEvent}\n${line}\n` + buffer;
            currentEvent = "";
          }
        }
      }
    }

    return finalMessage as
      | { content: string; tool_calls?: ToolCall[]; _server_tool_results?: any[] }
      | null;
  };

  const handleSend = useCallback(
    async (text: string, mentions: WorksheetMention[]) => {
      if (isLoading) return;
      const userMsg: Message = { id: crypto.randomUUID(), role: "user", content: text, mentions };
      lastUserTextRef.current = text;
      let convo: Message[] = [...messages, userMsg];
      setMessages(convo);
      setIsLoading(true);
      setThinking("Thinking…");
      setStreaming("");

      const controller = new AbortController();
      abortRef.current = controller;

      // Persist user message
      const userMsgId = await persistMessage({ role: "user", content: text, mentions });

      // Build sticky mention pool across turns
      const allMentions = new Map<string, WorksheetMention>();
      for (const m of convo) for (const x of m.mentions || []) allMentions.set(x.worksheetId, x);

      try {
        for (let loop = 0; loop < 5; loop++) {
          const apiMessages = convo.map((m) => {
            const base: any = { role: m.role, content: m.content };
            if (m.tool_calls) base.tool_calls = m.tool_calls;
            if (m.tool_call_id) {
              base.tool_call_id = m.tool_call_id;
              base.name = m.name;
            }
            return base;
          });

          const final = await streamOnce(apiMessages, Array.from(allMentions.values()));
          if (!final) break;

          const assistantMsg: Message = {
            id: crypto.randomUUID(),
            role: "assistant",
            content: final.content || "",
            tool_calls: final.tool_calls,
          };
          convo = [...convo, assistantMsg];
          setMessages(convo);

          // Persist assistant content (skip empty tool-only messages)
          if (assistantMsg.content) {
            await persistMessage({ role: "assistant", content: assistantMsg.content });
          }

          if (assistantMsg.tool_calls && assistantMsg.tool_calls.length > 0) {
            // Handle server tool results echoed back from the function
            const serverResults =
              (final as any)._server_tool_results as
                | Array<{ tool_call_id: string; name: string; content: string }>
                | undefined;
            const serverIds = new Set((serverResults || []).map((r) => r.tool_call_id));

            const toolResultMessages: Message[] = [];
            if (serverResults) {
              for (const sr of serverResults) {
                toolResultMessages.push({
                  id: crypto.randomUUID(),
                  role: "tool",
                  content: sr.content,
                  tool_call_id: sr.tool_call_id,
                  name: sr.name,
                });
              }
            }

            for (const tc of assistantMsg.tool_calls) {
              if (serverIds.has(tc.id)) continue;
              let resultText = "";
              try {
                const parsed = JSON.parse(tc.function.arguments);
                if (tc.function.name === "replace_design_html") {
                  await appendRevision(parsed.html, userMsgId);
                  resultText = "Design updated successfully.";
                } else if (tc.function.name === "update_worksheet_title") {
                  await renameTitle(parsed.title);
                  resultText = `Title changed to "${parsed.title}".`;
                } else {
                  resultText = `Unknown tool: ${tc.function.name}`;
                }
              } catch (e) {
                resultText = `Tool error: ${e instanceof Error ? e.message : "unknown"}`;
              }
              toolResultMessages.push({
                id: crypto.randomUUID(),
                role: "tool",
                content: resultText,
                tool_call_id: tc.id,
                name: tc.function.name,
              });
            }

            convo = [...convo, ...toolResultMessages];
            setMessages(convo);
            continue; // let AI respond to tool results
          }

          break;
        }
      } catch (e: any) {
        if (e.name !== "AbortError") {
          console.error(e);
          toast.error("Failed to get AI response");
        }
      } finally {
        setIsLoading(false);
        setThinking(null);
        setStreaming("");
        abortRef.current = null;
      }
    },
    [messages, isLoading, activeDesign, designs, sessionId],
  );

  const startNewChat = async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from("chat_sessions")
      .insert([{ user_id: user.id, title: "New chat" }])
      .select()
      .single();
    if (error || !data) {
      toast.error("Could not start a new chat");
      return;
    }
    navigate(`/chat/${data.id}`);
  };

  if (!loaded) {
    return (
      <div className="flex h-[calc(100vh-3.5rem)] items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Loading…
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-3.5rem)] overflow-hidden">
      {/* Chat column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="border-b border-border px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">AskLandi</span>
          </div>
          <div className="flex items-center gap-1">
            {designs.length > 0 && !panelOpen && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1.5 text-xs"
                onClick={() => setPanelOpen(true)}
              >
                <PanelRightOpen className="h-3 w-3" /> Designs ({designs.length})
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={startNewChat} className="h-7 gap-1.5 text-xs">
              <RotateCcw className="h-3 w-3" /> New chat
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl px-4 py-6">
            {messages.length === 0 && !streaming && !thinking ? (
              <div className="flex flex-col items-center justify-center text-center py-24">
                <MessageSquare className="h-10 w-10 text-muted-foreground mb-3" />
                <p className="text-sm text-foreground font-medium mb-1">Ask anything, build anything</p>
                <p className="text-xs text-muted-foreground max-w-sm">
                  Chat normally, or ask the assistant to build a webpage / report / dossier — it will appear in
                  a panel on the right. Use <code className="px-1 py-0.5 bg-muted rounded text-[11px]">@</code> to
                  reference a worksheet.
                </p>
              </div>
            ) : (
              <div className="space-y-5">
                {messages
                  .filter((m) => m.role === "user" || (m.role === "assistant" && m.content))
                  .map((m) => (
                    <div key={m.id} className={m.role === "user" ? "flex justify-end" : ""}>
                      {m.role === "user" ? (
                        <div className="max-w-[85%] rounded-2xl bg-primary text-primary-foreground px-4 py-2 text-sm whitespace-pre-wrap">
                          {m.content}
                          {m.mentions && m.mentions.length > 0 && (
                            <div className="mt-1.5 flex flex-wrap gap-1">
                              {m.mentions.map((x) => (
                                <span
                                  key={x.worksheetId}
                                  className="inline-flex items-center gap-1 rounded-full bg-primary-foreground/20 px-2 py-0.5 text-[10px]"
                                >
                                  📄 {x.title}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div
                          className="prose prose-sm dark:prose-invert max-w-none text-foreground"
                          dangerouslySetInnerHTML={{
                            __html: marked.parse(m.content, { async: false }) as string,
                          }}
                        />
                      )}
                    </div>
                  ))}

                {streaming && (
                  <div
                    className="prose prose-sm dark:prose-invert max-w-none text-foreground"
                    dangerouslySetInnerHTML={{
                      __html: marked.parse(streaming, { async: false }) as string,
                    }}
                  />
                )}

                {thinking && (
                  <div className="text-xs text-muted-foreground italic animate-pulse flex items-center gap-2">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    {thinking}
                  </div>
                )}
                <div ref={endRef} />
              </div>
            )}
          </div>
        </div>

        <WorksheetMentionInput onSend={handleSend} isLoading={isLoading} />
      </div>

      {/* Design panel */}
      <DesignPanel
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
        design={viewingDesign}
        revisionIndex={revisionIndex}
        onChangeRevision={setRevisionIndex}
        onSave={saveDraft}
        saving={saving}
        onRenameTitle={renameTitle}
        savedDesigns={savedDesigns}
        onOpenSaved={(id) => {
          reopenSavedDraft(id);
        }}
        onShare={viewingDesign ? () => setShareOpen(true) : undefined}
      />
      {viewingDesign && (
        <ShareDialog
          open={shareOpen}
          onOpenChange={setShareOpen}
          chatDesignId={viewingDesign.id}
          worksheetTitle={viewingDesign.title || "Design"}
        />
      )}
    </div>
  );
};