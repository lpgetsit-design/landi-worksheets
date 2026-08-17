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

export interface SummarySection {
  heading: string;
  bullets: { text: string; children?: string[] }[];
}

export const DEMO_SUMMARIES: Record<string, SummarySection[]> = {
  "demo-1": [
    {
      heading: "Meeting Context",
      bullets: [
        { text: "Intake with Priya Raman (hiring manager) and Daniel Okafor (finance)" },
        { text: "Backfill for a contractor who left in June — flagged urgent" },
        { text: "Search kicks off this week, first slate expected within ten days" },
      ],
    },
    {
      heading: "Role Requirements",
      bullets: [
        {
          text: "Core technical profile",
          children: [
            "Strong Go or Rust, production experience required",
            "Must own a service end to end, not just feature work",
            "Mentors two junior engineers on the team",
          ],
        },
        {
          text: "Logistics",
          children: [
            "Hybrid — two days per week in the Austin office, non-negotiable",
            "Base band 145–165k plus equity, flexible for an exceptional candidate",
          ],
        },
      ],
    },
    {
      heading: "Next Steps",
      bullets: [
        { text: "Send calibration slate of three profiles by Thursday" },
        { text: "Confirm interview loop format with Priya before first submission" },
        { text: "Daniel to confirm the equity range in writing" },
      ],
    },
  ],
  "demo-2": [
    {
      heading: "Candidate Snapshot",
      bullets: [
        { text: "Marcus Bell — leads the payments integration squad at Cloudline" },
        { text: "Four direct reports, primarily TypeScript and Go" },
        { text: "Still hands-on; wants architecture ownership alongside coding" },
      ],
    },
    {
      heading: "Motivation & Compensation",
      bullets: [
        { text: "Leaving because the roadmap flattened out" },
        { text: "Current base 152k; would move for 165k plus meaningful equity" },
        { text: "Open to hybrid, prefers no more than three office days" },
      ],
    },
    {
      heading: "Recruiter Assessment",
      bullets: [
        { text: "Strong fit for the Northwind backend role on depth and seniority" },
        { text: "Watch item: has not worked in a regulated environment before" },
      ],
    },
  ],
  "demo-3": [
    {
      heading: "Pipeline Status",
      bullets: [
        { text: "Northwind has two finals booked for Thursday from the same referral chain" },
        { text: "Aperture Health search paused pending revised leadership criteria" },
      ],
    },
    {
      heading: "Risks",
      bullets: [
        {
          text: "Competing offer pressure",
          children: ["One finalist holds an offer expiring Friday", "Team agreed to pre-close today"],
        },
      ],
    },
    {
      heading: "Actions",
      bullets: [
        { text: "Grace drafts the offer summary ahead of feedback" },
        { text: "Tom runs the pre-close call this afternoon" },
      ],
    },
  ],
  "demo-4": [
    {
      heading: "Offer Conversation",
      bullets: [
        { text: "Helena Vos is positive on the role overall" },
        { text: "Only open concern is the on-call rotation" },
      ],
    },
    {
      heading: "Actions",
      bullets: [
        { text: "Send the on-call policy in writing (one week in six, stipend paid)" },
        { text: "Candidate indicated she will sign once confirmed" },
      ],
    },
  ],
  "demo-5": [
    {
      heading: "Client Debrief",
      bullets: [
        { text: "Aperture Health valued the depth on HL7 integrations" },
        { text: "Rejected on leadership depth — want a lead of six or more" },
      ],
    },
    {
      heading: "Search Adjustment",
      bullets: [
        { text: "Prioritise team leads over senior individual contributors" },
        { text: "Re-run sourcing with a management-scope filter" },
      ],
    },
  ],
};

/** Prompt the classifier would have picked for each sample conversation. */
export const DEMO_PROMPT_NAMES: Record<string, string> = {
  "demo-1": "Client Intake Call",
  "demo-2": "Candidate Screen",
  "demo-3": "Internal Pipeline Review",
  "demo-4": "Offer & Closing Call",
  "demo-5": "Client Debrief",
  "demo-6": "General Conversation",
};
