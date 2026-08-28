import type { Response } from "express";
import { getAIClient, getAIModelName } from "../../services/ai-client";
import {
  ASK_SYSTEM,
  LIGHT_SYSTEM,
  TT_METRICS,
  TT_CLIENTS,
  deriveCompanyName,
  renderRunSheet,
  renderProof,
  renderClose,
  renderCompetitor,
  scopeExclusions,
  audiencePriority,
  lengthForTime,
  maxTokensForTime,
  optionsHint,
  sanitizeReview,
  parseLooseJSON,
} from "./chatbot.prompts";

// ── In-memory sparring sessions (process-scoped, appropriate for demo use) ───
interface SparringSession {
  session_id: string;
  rep_id: string;
  preset: string;
  context: Record<string, any>;
  systemPrompt: string;
  resistance: number;
  persona_label: string;
  turn_count: number;
  transcript: Array<{ role: string; text: string }>;
  scores: any[];
}

export const sparringSessions = new Map<string, SparringSession>();
export const sparringHistory = new Map<string, any[]>();

// ── Core streaming helper ─────────────────────────────────────────────────────

export async function streamReply(
  res: Response,
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  system: string,
  maxTokens = 1500
): Promise<void> {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  (res as any).flushHeaders?.();

  try {
    const client = await getAIClient();
    const modelName = await getAIModelName();

    const stream = await client.chat.completions.create({
      model: modelName,
      max_tokens: maxTokens,
      stream: true,
      messages: [{ role: "system", content: system }, ...messages],
    });

    for await (const chunk of stream) {
      const token = chunk.choices[0]?.delta?.content;
      if (token) res.write(`data: ${JSON.stringify({ t: token })}\n\n`);
    }

    res.write(`event: done\ndata: {}\n\n`);
    res.end();
  } catch (err: any) {
    console.error("Chatbot stream error:", err);
    res.write(`event: error\ndata: ${JSON.stringify({ error: err?.message || "AI stream failed" })}\n\n`);
    res.end();
  }
}

// ── JSON completion helper ────────────────────────────────────────────────────

export async function getJsonCompletion(
  system: string,
  user: string,
  maxTokens = 1600
): Promise<any> {
  const client = await getAIClient();
  const modelName = await getAIModelName();

  const response = await client.chat.completions.create({
    model: modelName,
    max_tokens: maxTokens,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: system + "\nRespond with valid JSON only." },
      { role: "user", content: user },
    ],
  });

  const text = response.choices[0]?.message?.content || "{}";
  return parseLooseJSON(text);
}

// ── /api/chatbot/health ───────────────────────────────────────────────────────

export async function healthCheck(): Promise<{
  ok: boolean;
  provider: string;
  model: string;
}> {
  try {
    await getAIClient();
    const model = await getAIModelName();
    return { ok: true, provider: "configured", model };
  } catch {
    return { ok: false, provider: "none", model: "" };
  }
}

// ── /api/chatbot/ask ──────────────────────────────────────────────────────────

export async function handleAsk(
  res: Response,
  question: string,
  history: Array<{ role: string; content: string }>
): Promise<void> {
  const messages: Array<{ role: "user" | "assistant"; content: string }> = [
    ...history.map((m) => ({
      role: (m.role === "assistant" ? "assistant" : "user") as "user" | "assistant",
      content: String(m.content || "").slice(0, 800),
    })),
    { role: "user", content: question },
  ];
  return streamReply(res, messages, ASK_SYSTEM, 1800);
}

// ── /api/chatbot/train ────────────────────────────────────────────────────────

export async function handleTrain(
  res: Response,
  system: string,
  messages: Array<{ role: string; content: string }>,
  maxTokens: number
): Promise<void> {
  const cleaned: Array<{ role: "user" | "assistant"; content: string }> = messages
    .map((m) => ({
      role: (m.role === "assistant" ? "assistant" : "user") as "user" | "assistant",
      content: String(m.content || "").slice(0, 4000),
    }))
    .filter((m) => m.content.trim());
  return streamReply(res, cleaned, system, maxTokens);
}

// ── /api/chatbot/autofill ─────────────────────────────────────────────────────

export async function handleAutofill(text: string): Promise<any> {
  const user =
    `You are auto-filling a sales "Demo Builder" form from unstructured prospect text. Extract what you can and return a SINGLE JSON object with exactly this shape:\n\n` +
    `{\n  "cfg": { /* form fields using the EXACT allowed values below; omit any you can't determine */ },\n` +
    `  "missing": [ { "field": "<key>", "question": "<short question for the rep>", "options": ["..."] } ],\n` +
    `  "assumptions": [ "<short note for anything you inferred rather than read>" ],\n` +
    `  "confidence": { "<key>": 0.0 to 1.0 }\n}\n\n` +
    `FORM FIELDS + ALLOWED VALUES:\n${optionsHint()}\n\n` +
    `RULES:\n` +
    `- If the text EXPLICITLY states a field's value, you MUST put it in cfg.\n` +
    `- engagement: "Channel partner" for resellers/SIs/consultancies; "Direct client" for end buyers.\n` +
    `- region: map locations to the closest region.\n` +
    `- pocName: a real PERSON's name only; never a job title.\n` +
    `- NEVER invent specifics. Put any useful unmapped detail into cfg.notes.\n\n` +
    `PROSPECT TEXT:\n${text}`;

  const parsed = await getJsonCompletion(LIGHT_SYSTEM, user, 1600);
  return sanitizeReview(parsed);
}

// ── /api/chatbot/talktrack ───────────────────────────────────────────────────

export async function handleTalktrack(res: Response, ctx: any): Promise<void> {
  const cfg = ctx.cfg || {};
  const selectedModules: string[] = Array.isArray(cfg.modules) ? cfg.modules : [];
  const isChannel = !!(ctx.meta && ctx.meta.isChannel);
  const hasERP = !!(ctx.meta && ctx.meta.hasERP);
  const hasComp = !!(ctx.meta && ctx.meta.hasComp);
  const includeIntelligence =
    cfg.intelligenceSuite === "Yes" || cfg.intelligenceSuite === true;
  const intellText = includeIntelligence
    ? "\n\nCRITICAL DIRECTIVE: Include a dedicated paragraph explaining PriceIQ (Supplier Cost Intelligence) and Netra (Negotiation Intelligence) under the tagline 'KNOW WHAT YOU SHOULD PAY, BEFORE YOU NEGOTIATE'. This is mandatory."
    : "";
  const catText =
    cfg.categories?.length
      ? `\n\nCRITICAL DIRECTIVE: The prospect procures: ${cfg.categories.join(", ")}. Weave in how Prokraya is suited for these categories.`
      : "";
  let gtmHook = "";
  if (cfg.audience === "CFO / Finance") {
    gtmHook =
      '\n\nGTM HOOK: "We help enterprises reduce procurement spend – and that 11 to 13% that\'s silently compressing your EBITDA doesn\'t show up in budget variance and won\'t fix itself until there\'s a live market benchmark between your team and your suppliers."';
  } else if (cfg.audience === "CPO / Procurement") {
    gtmHook =
      '\n\nGTM HOOK: "Procurement teams negotiating purely on historical data are overpaying by 8–12% because they have no live market benchmark. Your buyers are doing the best they can, but they are negotiating blind."';
  } else {
    gtmHook =
      '\n\nGTM HOOK: "Companies that have adopted live market benchmarking are seeing up to 13% cost reduction dropping straight to their bottom line. Their competitors are still negotiating blind."';
  }

  const companyName = deriveCompanyName(cfg);
  const moduleList = selectedModules.length
    ? selectedModules.join(" → ")
    : "(none selected – narrate the snapshot + close only)";
  const runSheetText = renderRunSheet(ctx.runsheet);
  const proofText = renderProof(ctx.proof);
  const closeText = renderClose(ctx.close);
  const competitorText = renderCompetitor(cfg.competitor, ctx.competitor, hasComp);
  const scopeExcl = scopeExclusions(selectedModules);
  const audPriority = audiencePriority(cfg.audience, isChannel);
  const lengthSpec = lengthForTime(cfg.time);
  const erpRule = hasERP
    ? `ERP IN PLACE – ${cfg.erp}: frame Prokraya as layering ON TOP of ${cfg.erp}. Use "complements and extends ${cfg.erp}" and never imply replacement. Anchor points: ${(ctx.erpPoints || []).join(" | ") || "(layer on top; the system of record stays put)"}.`
    : `NO ERP OF RECORD – do not invent one. Lead with "one platform, one data set."`;

  const prompt =
    `You are a top-tier enterprise pre-sales lead writing the spoken talk track a presenter will say out loud during a live Prokraya demo.\n\n` +
    `CONTEXT:\n` +
    `- Engagement: ${isChannel ? "Channel partner" : "Direct client"}\n` +
    `- Prospect: ${companyName}, ${cfg.size || "(size n/a)"} ${cfg.industry || "(industry n/a)"} in ${cfg.region || "(region n/a)"}\n` +
    `- ERP: ${cfg.erp || "None"}   Competitor: ${hasComp ? cfg.competitor : "None"}   Audience: ${cfg.audience || "Mixed executive"}\n` +
    `- Current state: ${cfg.state || "(mixed / partial)"}   Time: ${cfg.time || "30 min"}\n` +
    `- Modules to cover IN ORDER – cover ONLY these: ${moduleList}\n\n` +
    `THE BLUEPRINT:\n` +
    `- Prospect snapshot: ${ctx.snapshot || "(see context above)"}\n` +
    `- Strategic angle: ${ctx.angle || "(derive from snapshot)"}\n` +
    `- Storyline arc: ${Array.isArray(ctx.arc) ? ctx.arc.join("  ") : (ctx.arc || "")}\n` +
    `- Run sheet (pacing only): ${runSheetText}\n` +
    `- Proof points: ${proofText}\n` +
    `- Close: ${closeText}\n` +
    (competitorText ? `- Competitor counter: ${competitorText}\n` : "") +
    `\nHARD RULES:\n` +
    `- Use ONLY these metrics verbatim: ${TT_METRICS}\n` +
    `- Use ONLY these client names: ${TT_CLIENTS}\n` +
    `- ${erpRule}\n` +
    `- Cover ONLY the selected modules in the given order.${scopeExcl ? " " + scopeExcl : ""}\n` +
    `- Never mention pricing, gain-share, or specific go-live dates.\n\n` +
    `AUDIENCE PRIORITY: ${audPriority}${intellText}${catText}${gtmHook}\n\n` +
    `HOW TO WRITE:\n` +
    `- Open on ${companyName}'s specific situation and pain. Earn the right to demo first.\n` +
    `- Walk modules in exact order, one tight paragraph per module tied to the audience's pain.\n` +
    `- Weave proof points at the single moment of highest relevance.\n` +
    `- Close on the close line and next-step ask.\n` +
    `- Length: ${lengthSpec.minutes}-min demo, ~130 wpm. Write ~${lengthSpec.wordTarget} words. ${lengthSpec.directive}\n` +
    `- TONE: peer-to-peer, confident, human. No exclamation marks, no hype words.\n` +
    `- OUTPUT: spoken prose paragraphs only. No headings, no bullets, no asterisks.`;

  return streamReply(
    res,
    [{ role: "user", content: prompt }],
    LIGHT_SYSTEM,
    maxTokensForTime(cfg.time)
  );
}

// ── /api/chatbot/email ────────────────────────────────────────────────────────

export async function handleEmail(res: Response, ctx: any): Promise<void> {
  const cfg = ctx.cfg || {};
  const includeIntelligence =
    cfg.intelligenceSuite === "Yes" || cfg.intelligenceSuite === true;
  const intellText = includeIntelligence
    ? "\nInclude one sentence referencing how live market benchmarking prevents overpaying."
    : "";
  let gtmHook = "";
  if (cfg.audience === "CFO / Finance") {
    gtmHook =
      "\nEmphasize that 11–13% of spend is silently compressing EBITDA because of missing live market benchmarks.";
  } else if (cfg.audience === "CPO / Procurement") {
    gtmHook =
      "\nEmphasize that buyers are negotiating blind without live market benchmarks, causing 8–12% overpayment.";
  } else {
    gtmHook =
      "\nEmphasize that adopting live market benchmarking yields up to 13% cost reduction straight to the bottom line.";
  }

  const messages: Array<{ role: "user"; content: string }> = [
    {
      role: "user",
      content:
        `You are a senior enterprise sales copywriter for Prokraya.\n` +
        `Rewrite the post-demo FOLLOW-UP EMAIL so it reads bespoke to this prospect.\n\n` +
        `HARD RULES:\n` +
        `- Max 120 words.\n` +
        `- Structure: (a) specific one-line recap of a key point the prospect raised (from REP_NOTES; if absent, recap the core value prop); (b) agreed next step stated plainly; (c) reference to exactly one attachment.\n` +
        `- Subject line: "Follow-up: [topic] - next step" or "[Company] x Prokraya - [agreed item]".\n` +
        `- No re-pitching. Exactly one metric maximum.\n` +
        `- No exclamation marks, no buzzwords.${intellText}${gtmHook}\n\n` +
        `Return subject line on first line, blank line, then body.\n\n` +
        `CONTEXT:\n${JSON.stringify(ctx).slice(0, 9000)}`,
    },
  ];
  return streamReply(res, messages, LIGHT_SYSTEM, 1400);
}

// ── /api/chatbot/salespitch ───────────────────────────────────────────────────

const SALES_SYSTEM_KB = `You are SARTHI – Prokraya's AI Sales Intelligence Engine.

VERIFIED METRICS (use only these): 2.6× ROI; 58% faster procurement cycles; 95%+ AI invoice match accuracy; 6–8 weeks to go live; 7 AI agents; 50+ pre-built ERP connectors.
CONFIRMED CLIENT REFERENCES: DAFZA (Dubai Airport Freezone), Eagle Hills, Hassad Food, IntelliSmart (Government of India), Benetton (United Colors of Benetton). NEVER cite CriticalRiver as a client. NEVER invent client names.

RED LINES – NEVER DO THESE:
- NEVER fabricate metrics, client names, or savings figures
- NEVER cite CriticalRiver as a client reference
- NEVER use: "leverage", "seamless", "empower", "unlock", "holistic", "game-changer"
- NEVER say "disruption" in a CTO conversation

OUTPUT STRUCTURE – use EXACTLY these tags:
[SNAPSHOT] 3–4 sentences: company, region, industry, ERP, persona, pain, why they're looking at Prokraya now.
[HOOK] 3 tracks: **CFO Track:**, **CPO Track:**, **End-User Track:**
[PRICEIQ] 2–3 sentences explaining PriceIQ for this deal.
[NETRA] 2–3 sentences explaining Netra for this deal.
[VALUE] 3 tracks: **CFO Track:**, **CPO Track:**, **End-User Track:**
[CLOSE_1] Specific first action with rationale.
[CLOSE_2] Specific second action (reference client ask if appropriate).
[CLOSE_3] We offer a 3-month free pilot because that is the minimum time needed for the Intelligence Suite to deliver the highest accuracy.
[RISK_1_LABEL] Short label
[RISK_1_BODY] 2 sentences.
[RISK_2_LABEL] Short label
[RISK_2_BODY] 2 sentences.
--- DISCOVERY ---
Repeat 5 times: [DQ_Q] [DQ_WHY] [DQ_LISTEN]
--- OBJECTIONS ---
Repeat 3 times: [OBJ_Q] [OBJ_REFRAME] [OBJ_PROOF] [OBJ_BRIDGE]
--- EMAIL ---
[EMAIL_1_TO] [EMAIL_1_SUBJ] [EMAIL_1_BODY] [EMAIL_2_TO] [EMAIL_2_SUBJ] [EMAIL_2_BODY]
Sign all emails: Vedaanshu Kumar / Prokraya / vedaanshu.kumar@prokraya.com / +1 (408) 333-7765
--- KILL SCRIPTS ---
[KILL_SCRIPT] One punchy cold-call script (max 3 sentences) to unseat the competitor, or "No specific competitor identified."`;

export async function handleSalesPitch(res: Response, ctx: any): Promise<void> {
  const cfg = ctx.cfg || {};
  const catText =
    cfg.categories?.length
      ? `\n\nThe prospect procures: ${cfg.categories.join(", ")}. Weave in how Prokraya is uniquely suited for these categories.`
      : "";
  let gtmHook = "";
  if (cfg.audience === "CFO / Finance") {
    gtmHook =
      '\n\nGTM HOOK: "That 11 to 13% compressing your EBITDA every quarter doesn\'t show up in budget variance and won\'t fix itself until there\'s a live market benchmark between your team and your suppliers."';
  } else if (cfg.audience === "CPO / Procurement") {
    gtmHook =
      '\n\nGTM HOOK: "Procurement teams negotiating on historical data are overpaying 8 to 13% on key categories every quarter because the supplier always knows your history better than you know the market."';
  } else {
    gtmHook =
      '\n\nGTM HOOK: "Companies that have adopted live market benchmarking are seeing up to 13% cost reduction dropping straight to their bottom line. Their competitors are still negotiating blind."';
  }

  const messages: Array<{ role: "user"; content: string }> = [
    {
      role: "user",
      content:
        `Generate a closing-grade sales playbook using the output structure above.\n\n` +
        `The target competitor is: "${cfg.competitor || "None / Unknown"}"\n\n` +
        `CONTEXT:\n${JSON.stringify(ctx).slice(0, 9000)}${catText}${gtmHook}`,
    },
  ];
  return streamReply(res, messages, SALES_SYSTEM_KB, 4000);
}

// ── /api/chatbot/speakernotes ─────────────────────────────────────────────────

export async function handleSpeakerNotes(
  res: Response,
  ctx: any,
  time: string
): Promise<void> {
  const prompt =
    `You are an elite enterprise presentation strategist.\n\n` +
    `Generate slide-by-slide speaker notes for all 12 Prokraya slides for a ${time} presentation.\n\n` +
    `RULES:\n` +
    `- Clear, executive-ready, insightful (not descriptive).\n` +
    `- NO bullet points, asterisks, or list markers – prose paragraphs only.\n` +
    `- For "7 min": one highly concise, high-impact paragraph per slide.\n` +
    `- For "15 min": detailed multi-paragraph narrative per slide.\n` +
    `- Never use: "revolutionize", "streamline", "cutting-edge", "robust", "comprehensive", "next-generation".\n\n` +
    `THE 12 SLIDES:\n` +
    `Slide 1: Intelligent Source-to-Pay Platform (Intro/Tagline)\n` +
    `Slide 2: At a Glance (5 core metrics and pillars)\n` +
    `Slide 3: Transform Your Procurement (Before vs After)\n` +
    `Slide 4: Enterprise-Grade Capabilities (The 6 modules)\n` +
    `Slide 5: Core Platform Features (Approvals, logs, security)\n` +
    `Slide 6: Integration Architecture (SAP, Oracle, Dynamics, NetSuite connectors)\n` +
    `Slide 7: AI Agents Powering Intelligent Procurement (The 7 specialized agents)\n` +
    `Slide 8: AI-Driven Capabilities (37 features, OCR, fraud detection)\n` +
    `Slide 9: Business Outcomes & Stakeholder Benefits\n` +
    `Slide 10: Differentiators That Deliver Value (Free suppliers, ERP-agnostic)\n` +
    `Slide 11: Key Clientele (DAFZA, Hassad, Benetton, Eagle Hills)\n` +
    `Slide 12: Thank You (Contact and closing question)\n\n` +
    `Format each slide as: ### Slide N: [Title] followed by prose paragraphs. Use ONLY facts from Prokraya's verified data.\n\n` +
    `PROSPECT CONTEXT:\n${JSON.stringify(ctx).slice(0, 9000)}`;

  return streamReply(
    res,
    [{ role: "user", content: prompt }],
    LIGHT_SYSTEM,
    2600
  );
}

// ── /api/chatbot/sparring/* ───────────────────────────────────────────────────

function getPersonaSetup(
  preset: string,
  context: Record<string, any>
): { systemPrompt: string; resistanceStart: number; role: string; name: string } {
  let resistanceStart = 50;
  let style = "";
  let role = "Manager";
  const name = context.pocName || "Alex";

  if (preset === "hostile") {
    resistanceStart = 85;
    role = context.audience || "Director of Procurement";
    style = "Defensive of incumbent, interrupts, dismissive of weak answers";
  } else if (preset === "boardroom") {
    resistanceStart = 90;
    role = context.audience || "CFO";
    style = "Panel: CFO → Procurement → IT Security. Each persona owns a different core objection.";
  } else {
    resistanceStart = 60;
    role = context.audience || "Procurement Manager";
    style = "Wants proof, asks fair questions, will listen";
  }

  const systemPrompt =
    `You are ${name}, ${role} at ${context.company || "the prospect company"}, a company in the ${context.industry || "enterprise"} industry currently using ${context.erp || "legacy ERP"} for procurement. You are being pitched a new S2P platform by a Prokraya sales rep.\n\n` +
    `Ground rules:\n` +
    `1. Never break character. Never mention you are an AI.\n` +
    `2. Every objection must reference something specific to the company's situation.\n` +
    `3. You have a resistance level, starting at ${resistanceStart}/100. Strong, specific, evidence-based answers lower resistance. Vague answers raise it.\n` +
    `4. When resistance drops below 30, show real interest and move toward next steps.\n` +
    `5. Draw objections from: budget/ROI, switching cost, integration, security/compliance, multi-stakeholder buy-in, user adoption, feature parity vs named competitors.\n` +
    `6. Keep replies to 2–4 sentences – like a real person on a call.\n` +
    `Style: ${style}`;

  return { systemPrompt, resistanceStart, role, name };
}

export async function startSparring(
  repId: string,
  context: Record<string, any>,
  preset: string
): Promise<{ session_id: string; persona_label: string; opening_message: string }> {
  const sessionId = crypto.randomUUID();
  const setup = getPersonaSetup(preset, context);

  const client = await getAIClient();
  const modelName = await getAIModelName();

  const response = await client.chat.completions.create({
    model: modelName,
    max_tokens: 300,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          setup.systemPrompt +
          '\nRespond with a JSON object: { "reply": "Your opening hostile challenge" }',
      },
      { role: "user", content: "I am the Prokraya sales rep. We are starting the meeting now." },
    ],
  });

  const text = response.choices[0]?.message?.content || '{"reply":"Pitch me."}';
  const parsed = parseLooseJSON(text);
  const openingMessage = parsed.reply || "Pitch me.";

  const session: SparringSession = {
    session_id: sessionId,
    rep_id: repId,
    preset,
    context,
    systemPrompt: setup.systemPrompt,
    resistance: setup.resistanceStart,
    persona_label: `${setup.name} (${setup.role})`,
    turn_count: 0,
    transcript: [{ role: "AI", text: openingMessage }],
    scores: [],
  };

  sparringSessions.set(sessionId, session);
  return { session_id: sessionId, persona_label: session.persona_label, opening_message: openingMessage };
}

export async function sendSparringMessage(
  sessionId: string,
  repMessage: string
): Promise<{ persona_reply: string; resistance_level: number }> {
  const session = sparringSessions.get(sessionId);
  if (!session) throw new Error("Session not found");

  session.transcript.push({ role: "Rep", text: repMessage });
  session.turn_count++;

  const transcriptText = session.transcript.map((t) => `${t.role}: ${t.text}`).join("\n");
  const evalPrompt =
    `You are evaluating the rep's last message, AND generating the AI persona's reply.\n` +
    `Current AI Resistance: ${session.resistance}/100.\n` +
    `Transcript:\n${transcriptText}\n\n` +
    `Respond with JSON:\n` +
    `{\n  "reply": "2–4 sentence persona reply",\n  "evaluation": {\n    "specificity_evidence": 1-5,\n    "technique": 1-5,\n    "outcome_framing": 1-5,\n    "composure_tone": 1-5,\n    "stakeholder_fit": 1-5,\n    "resistance_delta": -20 to 15,\n    "rationale": "one sentence"\n  }\n}`;

  const client = await getAIClient();
  const modelName = await getAIModelName();

  const response = await client.chat.completions.create({
    model: modelName,
    max_tokens: 600,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: session.systemPrompt },
      { role: "user", content: evalPrompt },
    ],
  });

  const text = response.choices[0]?.message?.content || '{"reply":"I need more specifics.","evaluation":{"resistance_delta":0}}';
  const aiResponse = parseLooseJSON(text);

  const reply = aiResponse.reply || "I need more specifics.";
  const evaluation = aiResponse.evaluation || { resistance_delta: 0 };

  session.transcript.push({ role: "AI", text: reply });
  session.scores.push(evaluation);
  session.resistance = Math.max(0, Math.min(100, session.resistance + (evaluation.resistance_delta || 0)));

  return { persona_reply: reply, resistance_level: session.resistance };
}

export async function endSparring(sessionId: string): Promise<{ debrief: any }> {
  const session = sparringSessions.get(sessionId);
  if (!session) throw new Error("Session not found");

  const transcriptText = session.transcript.map((t) => `${t.role}: ${t.text}`).join("\n");
  const debriefPrompt =
    `Generate a comprehensive coaching debrief based on this sparring transcript.\n` +
    `Transcript:\n${transcriptText}\n\n` +
    `Respond with JSON:\n` +
    `{\n  "overall_score": 0-50,\n  "category_breakdown": { "specificity": 0-10, "technique": 0-10, "outcome_framing": 0-10, "composure": 0-10, "stakeholder_fit": 0-10 },\n  "strengths": ["quote", "quote"],\n  "weaknesses": ["quote", "quote"],\n  "biggest_miss": "the single highest-resistance moment and what caused it",\n  "model_answers": [{ "original_rep_quote": "...", "better_rewrite": "..." }]\n}`;

  const client = await getAIClient();
  const modelName = await getAIModelName();

  const response = await client.chat.completions.create({
    model: modelName,
    max_tokens: 1000,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: "You are an elite enterprise sales coach." },
      { role: "user", content: debriefPrompt },
    ],
  });

  const text = response.choices[0]?.message?.content || "{}";
  const aiResponse = parseLooseJSON(text);
  aiResponse.transcript = session.transcript;

  // Persist to history
  if (!sparringHistory.has(session.rep_id)) sparringHistory.set(session.rep_id, []);
  sparringHistory.get(session.rep_id)!.push({
    session_id: sessionId,
    account_name: session.context.company,
    preset: session.preset,
    overall_score: aiResponse.overall_score || 0,
  });

  sparringSessions.delete(sessionId);
  return { debrief: aiResponse };
}

export function getSparringHistory(repId: string): any[] {
  return sparringHistory.get(repId) || [];
}
