import type { TourStep } from "./TourOverlay";

export const dashboardSteps: TourStep[] = [
  {
    target: "center",
    title: "Welcome to Worksheets",
    content:
      "This isn't your typical CRM — it's an AI-powered workspace where you write freely in your own style. We handle the metadata, tagging, and organisation in the background so you can focus on what matters.",
  },
  {
    target: "[data-tour='new-worksheet']",
    title: "Create a Worksheet",
    content:
      "Start a new worksheet anytime. Think of worksheets as flexible documents — they can be notes, skills profiles, prompts, templates, or designed web pages. You decide what each one becomes.",
    placement: "bottom",
  },
  {
    target: "[data-tour='search-bar']",
    title: "Intelligent Search",
    content:
      "Search isn't just keyword matching — paste a full job description and AI will find semantically relevant documents. It understands context, not just words.",
    placement: "bottom",
  },
  {
    target: "[data-tour='type-filter']",
    title: "Filter by Document Type",
    content:
      "Each worksheet has a type that AI uses to understand your intent. Filter your library by Notes, Skills, Prompts, or Templates to find what you need quickly.",
    placement: "bottom",
  },
  {
    target: "[data-tour='worksheet-list']",
    title: "Your Document Library",
    content:
      "All your worksheets appear here with summaries, dates, and linked CRM entities. Hover over any document for a quick preview — AI generates summaries automatically so you never have to.",
    placement: "top",
  },
];

export const worksheetSteps: TourStep[] = [
  {
    target: "center",
    title: "The Worksheet Editor",
    content:
      "This is where the magic happens. Write naturally — the AI watches your content and handles metadata, summaries, and entity linking in the background. No forms to fill out.",
  },
  {
    target: "[data-tour='doc-type']",
    title: "Document Type",
    content:
      "Set the type to help AI understand context. A 'Skill' worksheet will be matched against candidate profiles. A 'Template' becomes reusable. The AI assistant can also change this for you.",
    placement: "bottom",
  },
  {
    target: "[data-tour='summary-btn']",
    title: "AI-Generated Summary",
    content:
      "Click here to see an AI-generated summary of your worksheet. It's created automatically and updates when you regenerate — you never need to write executive summaries manually.",
    placement: "bottom",
  },
  {
    target: "[data-tour='editor-toggle']",
    title: "Editor Panel",
    content:
      "The rich text editor supports tables, task lists, CRM entity mentions (type / to insert), and file attachments. Everything you write is saved as you type.",
    placement: "bottom",
  },
  {
    target: "[data-tour='design-toggle']",
    title: "Design Mode",
    content:
      "Toggle the Design panel to have AI build a complete web page from your content — candidate profiles, job specs, branded documents. It creates full HTML with custom styling.",
    placement: "bottom",
  },
  {
    target: "[data-tour='chat-toggle']",
    title: "AI Assistant",
    content:
      "Your AI co-pilot. Ask it to edit your worksheet, build a design, look up CRM data, search candidates or jobs, and more. Select text in the editor and the AI can rewrite just that part.",
    placement: "left",
  },
  {
    target: "[data-tour='attachments-toggle']",
    title: "File Attachments",
    content:
      "Attach files like CVs, contracts, or images. AI automatically generates titles and descriptions for each attachment — and they're available to the AI assistant for context.",
    placement: "left",
  },
  {
    target: "[data-tour='share-btn']",
    title: "Share Externally",
    content:
      "Generate a secure, trackable link to share a worksheet or design with anyone outside the system. You can set expiry dates and track when recipients view it.",
    placement: "bottom",
  },
];
