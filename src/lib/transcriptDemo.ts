import type { Transcript, TranscriptSegment } from "@/lib/transcripts";

const now = Date.now();
const ago = (mins: number) => new Date(now - mins * 60_000).toISOString();

function make(
  id: string,
  source: Transcript["source"],
  title: string,
  minsAgo: number,
  duration: number,
  participants: string[],
  segments: TranscriptSegment[],
  status: Transcript["status"] = "ready",
): Transcript {
  return {
    id: `demo-${id}`,
    user_id: "demo",
    source,
    title,
    external_id: null,
    occurred_at: ago(minsAgo),
    duration_seconds: duration,
    participants,
    content_text: segments.map((s) => `${s.speaker}: ${s.text}`).join("\n"),
    segments,
    status,
    error_message: status === "failed" ? "Recording could not be transcribed" : null,
    file_path: null,
    file_name: source === "upload" ? `${title.toLowerCase().replace(/\s+/g, "-")}.vtt` : null,
    file_size: 18_432,
    created_at: ago(minsAgo),
    updated_at: ago(minsAgo),
  };
}

export const DEMO_TRANSCRIPTS: Transcript[] = [
  make("1", "teams", "Intake call — Senior Backend Engineer, Northwind", 42, 1_920,
    ["You", "Priya Raman", "Daniel Okafor"], [
      { speaker: "Priya Raman", text: "Thanks for making time. We're replacing a contractor who left in June, so this one is urgent." },
      { speaker: "You", text: "Understood. What does the ideal profile look like on day one?" },
      { speaker: "Priya Raman", text: "Strong Go or Rust, comfortable owning a service end to end, and someone who can mentor two juniors." },
      { speaker: "Daniel Okafor", text: "Budget lands between 145 and 165, plus equity. We can flex for someone exceptional." },
      { speaker: "You", text: "Remote or hybrid?" },
      { speaker: "Priya Raman", text: "Hybrid, two days in the Austin office. That's non-negotiable for this team." },
    ]),
  make("2", "ringcentral", "Candidate screen — Marcus Bell", 190, 745,
    ["You", "Marcus Bell"], [
      { speaker: "You", text: "Walk me through what you're doing at Cloudline today." },
      { speaker: "Marcus Bell", text: "I lead the payments integration squad — four engineers, mostly TypeScript and Go." },
      { speaker: "You", text: "And what's prompting the move?" },
      { speaker: "Marcus Bell", text: "The roadmap flattened out. I want a role where I'm still writing code but shaping architecture." },
      { speaker: "You", text: "Compensation expectations?" },
      { speaker: "Marcus Bell", text: "I'm at 152 base. I'd move for 165 plus meaningful equity." },
    ]),
  make("3", "teams", "Weekly pipeline review — Enterprise pod", 1_480, 2_640,
    ["You", "Sana Iqbal", "Tom Reyes", "Grace Lin"], [
      { speaker: "Sana Iqbal", text: "Northwind has two finals booked for Thursday, both from the same referral chain." },
      { speaker: "You", text: "Any risk on the offer side?" },
      { speaker: "Tom Reyes", text: "One candidate is holding a competing offer that expires Friday. We should pre-close today." },
      { speaker: "Grace Lin", text: "I'll draft the offer summary so we can move the moment feedback lands." },
    ]),
  make("4", "ringcentral", "Follow-up call — Helena Vos, offer stage", 2_900, 412,
    ["You", "Helena Vos"], [
      { speaker: "Helena Vos", text: "The role sounds right. My hesitation is the on-call rotation." },
      { speaker: "You", text: "It's one week in six, and they pay a stipend. I can get the exact policy in writing." },
      { speaker: "Helena Vos", text: "That would help. If it's one in six I'm comfortable signing." },
    ]),
  make("5", "upload", "Client debrief notes — Aperture Health", 4_320, 0,
    ["You", "Aperture Health"], [
      { speaker: "You", text: "Recapping the debrief: they liked the depth on HL7 integrations." },
      { speaker: "Aperture Health", text: "The concern was leadership experience — they want someone who has run a team of six or more." },
      { speaker: "You", text: "Adjusting the search to prioritise team leads over senior ICs." },
    ]),
  make("6", "ringcentral", "Voicemail — inbound candidate, unknown number", 12, 96,
    ["Unknown caller"], [], "processing"),
];
