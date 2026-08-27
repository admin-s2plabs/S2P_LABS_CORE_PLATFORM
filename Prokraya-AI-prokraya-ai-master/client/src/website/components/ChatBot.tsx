import { ArrowRight, Bot, ChevronLeft, MessageCircle, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";

type MessageRole = "bot" | "user";
type View = "welcome" | "diagnose" | "explore" | "roi" | "compare" | "sales";
type DiagnoseStep = 0 | 1 | 2 | 3 | 4 | 5; // 5 = results shown

interface Message {
  role: MessageRole;
  text: string;
}

interface LeadData {
  currentSystem?: string;
  companySize?: string;
  painPoint?: string;
  modules?: string[];
  industry?: string;
  name?: string;
  email?: string;
  company?: string;
  intent?: string;
}

const DIAGNOSE_QUESTIONS = [
  {
    text: "How do you currently manage procurement?",
    options: ["Excel / Spreadsheets", "ERP System", "Email / Manual", "Existing Procurement Tool"],
    key: "currentSystem",
  },
  {
    text: "What is your company size?",
    options: ["1–50 employees", "51–200 employees", "200+ employees"],
    key: "companySize",
  },
  {
    text: "What is your biggest procurement challenge?",
    options: ["Manual approvals", "Supplier management", "Invoice delays", "Spend visibility", "Contract tracking"],
    key: "painPoint",
  },
  {
    text: "Which modules are you most interested in?",
    options: ["Supplier Management", "Purchase Requisition", "Sourcing", "Contract Management", "Invoicing", "Spend Analytics", "AI Procurement"],
    key: "modules",
    multi: true,
  },
  {
    text: "What is your industry?",
    options: ["Manufacturing", "Retail / E-commerce", "Healthcare", "Construction", "IT Services", "Other"],
    key: "industry",
  },
];

const EXPLORE_LINKS = [
  { label: "What is Prokraya?", path: "/about-us" },
  { label: "Supplier Management", path: "/supplier-relationship-management" },
  { label: "Purchase Requisition", path: "/purchase-requistion-software" },
  { label: "Sourcing", path: "/esourcing-software" },
  { label: "Contract Management", path: "/contract-management-software" },
  { label: "Invoicing", path: "/einvoicing-software" },
  { label: "Spend Analytics", path: "/spend-analytics-software" },
  { label: "AI Agents", path: "/ai-agents" },
  { label: "Success Stories", path: "/success-stories" },
  { label: "Security", path: "/security" },
];

function buildRecommendation(lead: LeadData): string {
  const parts: string[] = [];
  if (lead.painPoint === "Manual approvals") parts.push("automate multi-level approval workflows");
  else if (lead.painPoint === "Supplier management") parts.push("improve 360° supplier visibility and risk monitoring");
  else if (lead.painPoint === "Invoice delays") parts.push("reduce invoice processing time with AI-powered 3-way matching");
  else if (lead.painPoint === "Spend visibility") parts.push("gain real-time spend analytics and savings insights");
  else if (lead.painPoint === "Contract tracking") parts.push("streamline contract lifecycle and renewal alerts");
  else parts.push("automate your end-to-end procurement process");

  if (lead.currentSystem === "Excel / Spreadsheets") parts.push("replace error-prone spreadsheets with a structured S2P platform");
  if (lead.currentSystem === "Email / Manual") parts.push("eliminate email-based procurement with automated workflows");

  return `Based on your answers, Prokraya can help you ${parts.slice(0, 2).join(", and ")}.${lead.modules?.length ? ` You showed interest in: ${lead.modules.slice(0, 3).join(", ")}.` : ""} Our platform is purpose-built for ${lead.industry ?? "your industry"}.`;
}

function saveLead(lead: LeadData, intent: string, sourcePage: any, summary: string) {
  try {
    const existing = JSON.parse(sessionStorage.getItem("prokraya_leads") ?? "[]");
    existing.push({
      timestamp: new Date().toISOString(),
      name: lead.name ?? "",
      email: lead.email ?? "",
      company: lead.company ?? "",
      industry: lead.industry ?? "",
      companySize: lead.companySize ?? "",
      modulesInterested: (lead.modules ?? []).join("; "),
      painPoint: lead.painPoint ?? "",
      currentSystem: lead.currentSystem ?? "",
      intent,
      sourcePage,
      conversationSummary: summary,
    });
    sessionStorage.setItem("prokraya_leads", JSON.stringify(existing));
  } catch {
    // silently fail if sessionStorage unavailable
  }
}

export function ChatBot() {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>("welcome");
  const [messages, setMessages] = useState<Message[]>([]);
  const [diagnoseStep, setDiagnoseStep] = useState<DiagnoseStep>(0);
  const [leadData, setLeadData] = useState<LeadData>({});
  const [isTyping, setIsTyping] = useState(false);
  const [salesStep, setSalesStep] = useState<"name" | "email" | "company" | "done">("name");
  const [inputValue, setInputValue] = useState("");
  const [multiSelect, setMultiSelect] = useState<string[]>([]);
  const [hasBounced, setHasBounced] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const location = useLocation();

  // Attention bounce after 8s
  useEffect(() => {
    const t = setTimeout(() => setHasBounced(true), 8000);
    return () => clearTimeout(t);
  }, []);

  // Reset bounce after animation
  useEffect(() => {
    if (hasBounced) {
      const t = setTimeout(() => setHasBounced(false), 1000);
      return () => clearTimeout(t);
    }
  }, [hasBounced]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  function pushBot(text: string, delay = 600) {
    setIsTyping(true);
    setTimeout(() => {
      setIsTyping(false);
      setMessages((prev) => [...prev, { role: "bot", text }]);
    }, delay);
  }

  function pushUser(text: string) {
    setMessages((prev) => [...prev, { role: "user", text }]);
  }

  function openChat() {
    setOpen(true);
    if (messages.length === 0) {
      setTimeout(() => {
        setMessages([{
          role: "bot",
          text: "Hi 👋 Looking for a smarter procurement or S2P solution? I can help you explore Prokraya, calculate savings, compare solutions, or book a demo.",
        }]);
      }, 300);
    }
  }

  function reset() {
    setView("welcome");
    setDiagnoseStep(0);
    setLeadData({});
    setSalesStep("name");
    setInputValue("");
    setMultiSelect([]);
    setMessages([{
      role: "bot",
      text: "Hi 👋 Looking for a smarter procurement or S2P solution? I can help you explore Prokraya, calculate savings, compare solutions, or book a demo.",
    }]);
  }

  function handleMainOption(option: string) {
    pushUser(option);
    if (option === "Diagnose My Procurement Process") {
      setView("diagnose");
      setDiagnoseStep(0);
      pushBot(DIAGNOSE_QUESTIONS[0].text);
    } else if (option === "Explore Prokraya") {
      setView("explore");
      pushBot("Here are the key areas of Prokraya you can explore:");
    } else if (option === "ROI & Savings") {
      setView("roi");
      pushBot("💰 S2P platforms like Prokraya typically deliver:\n\n• 60–80% reduction in manual processing time\n• ~$15 saved per invoice processed automatically\n• 30–40% reduction in maverick spend\n• 50% faster purchase requisition to PO cycle\n• Improved contract compliance and renewal tracking\n\nWant to calculate your specific savings?");
    } else if (option === "Compare Solutions") {
      setView("compare");
      pushBot("See how Prokraya stacks up. Choose a comparison:");
    } else if (option === "Talk to Sales") {
      setView("sales");
      setSalesStep("name");
      pushBot("I'd love to connect you with our team! What's your name?");
    }
  }

  function handleDiagnoseAnswer(answer: string) {
    const q = DIAGNOSE_QUESTIONS[diagnoseStep];
    if (q.multi) {
      // handled separately
      return;
    }
    pushUser(answer);
    const updated = { ...leadData, [q.key]: answer };
    setLeadData(updated);

    const next = (diagnoseStep + 1) as DiagnoseStep;
    if (next < DIAGNOSE_QUESTIONS.length) {
      setDiagnoseStep(next);
      pushBot(DIAGNOSE_QUESTIONS[next].text);
    } else {
      setDiagnoseStep(5);
      const rec = buildRecommendation(updated);
      pushBot(rec, 800);
      saveLead(updated, "Demo Request", location, rec);
    }
  }

  function handleMultiConfirm() {
    if (multiSelect.length === 0) return;
    const answer = multiSelect.join(", ");
    pushUser(answer);
    const updated = { ...leadData, modules: multiSelect };
    setLeadData(updated);
    setMultiSelect([]);

    const next = (diagnoseStep + 1) as DiagnoseStep;
    if (next < DIAGNOSE_QUESTIONS.length) {
      setDiagnoseStep(next);
      pushBot(DIAGNOSE_QUESTIONS[next].text);
    } else {
      setDiagnoseStep(5);
      const rec = buildRecommendation(updated);
      pushBot(rec, 800);
      saveLead(updated, "Demo Request", location, rec);
    }
  }

  function handleSalesInput() {
    if (!inputValue.trim()) return;
    const val = inputValue.trim();
    setInputValue("");

    if (salesStep === "name") {
      pushUser(val);
      setLeadData((p) => ({ ...p, name: val }));
      setSalesStep("email");
      pushBot(`Nice to meet you, ${val}! What's your work email?`);
    } else if (salesStep === "email") {
      pushUser(val);
      setLeadData((p) => ({ ...p, email: val }));
      setSalesStep("company");
      pushBot("Great! And what company are you from?");
    } else if (salesStep === "company") {
      pushUser(val);
      const updated = { ...leadData, company: val };
      setLeadData(updated);
      setSalesStep("done");
      saveLead(updated, "Demo Request", location, `Sales contact: ${updated.name}, ${updated.email}, ${val}`);
      pushBot(`Thanks! Our team will reach out to you at ${leadData.email} shortly. You can also book a demo directly below.`, 800);
    }
  }

  const currentQuestion = diagnoseStep < DIAGNOSE_QUESTIONS.length ? DIAGNOSE_QUESTIONS[diagnoseStep] : null;

  return (
    <>
      {/* Floating Button */}
      <button
        onClick={open ? () => setOpen(false) : openChat}
        className={`fixed bottom-6 right-6 z-50 w-14 h-14 bg-violet-600 hover:bg-violet-700 text-white rounded-full shadow-lg shadow-violet-300 flex items-center justify-center transition-all ${hasBounced ? "animate-bounce" : ""}`}
        aria-label="Open chat assistant"
      >
        {open ? <X className="w-5 h-5" /> : <MessageCircle className="w-6 h-6" />}
      </button>

      {/* Chat Window */}
      {open && (
        <div className="fixed bottom-24 right-6 z-50 w-[360px] bg-white rounded-2xl shadow-2xl shadow-violet-200/50 border border-gray-100 flex flex-col overflow-hidden max-h-[540px]">
          {/* Header */}
          <div className="bg-gradient-to-r from-violet-600 to-violet-700 px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center">
                <Bot className="w-4 h-4 text-white" />
              </div>
              <div>
                <p className="text-white text-sm font-semibold">Prokraya Assistant</p>
                <p className="text-violet-200 text-xs">Procurement AI Guide</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {view !== "welcome" && (
                <button onClick={reset} className="text-violet-200 hover:text-white transition-colors" title="Start over">
                  <ChevronLeft className="w-4 h-4" />
                </button>
              )}
              <button onClick={() => setOpen(false)} className="text-violet-200 hover:text-white transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50/50">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                {msg.role === "bot" && (
                  <div className="w-6 h-6 bg-violet-100 rounded-full flex items-center justify-center mr-2 mt-1 flex-shrink-0">
                    <Bot className="w-3 h-3 text-violet-600" />
                  </div>
                )}
                <div
                  className={`max-w-[78%] px-3 py-2 rounded-2xl text-xs leading-relaxed whitespace-pre-line ${
                    msg.role === "bot"
                      ? "bg-white border border-gray-100 text-gray-700 rounded-tl-sm shadow-sm"
                      : "bg-violet-600 text-white rounded-tr-sm"
                  }`}
                >
                  {msg.text}
                </div>
              </div>
            ))}

            {isTyping && (
              <div className="flex justify-start">
                <div className="w-6 h-6 bg-violet-100 rounded-full flex items-center justify-center mr-2 mt-1 flex-shrink-0">
                  <Bot className="w-3 h-3 text-violet-600" />
                </div>
                <div className="bg-white border border-gray-100 rounded-2xl rounded-tl-sm px-4 py-2.5 shadow-sm">
                  <div className="flex gap-1 items-center">
                    <span className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Options Area */}
          {!isTyping && (
            <div className="border-t border-gray-100 bg-white px-3 py-3">

              {/* Welcome options */}
              {view === "welcome" && messages.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  {["Diagnose My Procurement Process", "Explore Prokraya", "ROI & Savings", "Compare Solutions", "Talk to Sales"].map((opt) => (
                    <button
                      key={opt}
                      onClick={() => handleMainOption(opt)}
                      className="text-left px-3 py-2 rounded-lg border border-violet-100 bg-violet-50 text-xs font-medium text-violet-700 hover:bg-violet-100 hover:border-violet-200 transition-colors"
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              )}

              {/* Diagnose questions */}
              {view === "diagnose" && diagnoseStep < DIAGNOSE_QUESTIONS.length && !isTyping && (
                <div className="flex flex-col gap-1.5">
                  {currentQuestion?.multi ? (
                    <>
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {currentQuestion.options.map((opt) => (
                          <button
                            key={opt}
                            onClick={() =>
                              setMultiSelect((prev) =>
                                prev.includes(opt) ? prev.filter((x) => x !== opt) : [...prev, opt]
                              )
                            }
                            className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                              multiSelect.includes(opt)
                                ? "bg-violet-600 text-white border-violet-600"
                                : "bg-violet-50 text-violet-700 border-violet-100 hover:bg-violet-100"
                            }`}
                          >
                            {opt}
                          </button>
                        ))}
                      </div>
                      {multiSelect.length > 0 && (
                        <button
                          onClick={handleMultiConfirm}
                          className="w-full py-1.5 bg-violet-600 text-white text-xs font-semibold rounded-lg hover:bg-violet-700 transition-colors"
                        >
                          Confirm selection →
                        </button>
                      )}
                    </>
                  ) : (
                    currentQuestion?.options.map((opt) => (
                      <button
                        key={opt}
                        onClick={() => handleDiagnoseAnswer(opt)}
                        className="text-left px-3 py-2 rounded-lg border border-violet-100 bg-violet-50 text-xs font-medium text-violet-700 hover:bg-violet-100 hover:border-violet-200 transition-colors"
                      >
                        {opt}
                      </button>
                    ))
                  )}
                </div>
              )}

              {/* Diagnose result CTAs */}
              {view === "diagnose" && diagnoseStep === 5 && !isTyping && (
                <div className="flex flex-col gap-2">
                  <Link
                    to="/book-demo"
                    onClick={() => setOpen(false)}
                    className="flex items-center justify-center gap-2 py-2.5 bg-violet-600 text-white text-xs font-semibold rounded-lg hover:bg-violet-700 transition-colors"
                  >
                    Book a Demo <ArrowRight className="w-3 h-3" />
                  </Link>
                  <button onClick={reset} className="text-xs text-gray-400 hover:text-violet-600 transition-colors text-center">
                    ← Start over
                  </button>
                </div>
              )}

              {/* Explore links */}
              {view === "explore" && !isTyping && (
                <div className="flex flex-wrap gap-1.5">
                  {EXPLORE_LINKS.map((link) => (
                    <Link
                      key={link.path}
                      to={link.path}
                      onClick={() => setOpen(false)}
                      className="px-2.5 py-1 rounded-full border border-violet-100 bg-violet-50 text-xs font-medium text-violet-700 hover:bg-violet-100 transition-colors"
                    >
                      {link.label}
                    </Link>
                  ))}
                </div>
              )}

              {/* ROI CTAs */}
              {view === "roi" && !isTyping && (
                <div className="flex flex-col gap-2">
                  <Link
                    to="/roi-calculator"
                    onClick={() => setOpen(false)}
                    className="flex items-center justify-center gap-2 py-2.5 bg-violet-600 text-white text-xs font-semibold rounded-lg hover:bg-violet-700 transition-colors"
                  >
                    Calculate My ROI <ArrowRight className="w-3 h-3" />
                  </Link>
                  <Link
                    to="/book-demo"
                    onClick={() => setOpen(false)}
                    className="flex items-center justify-center gap-2 py-2.5 border border-violet-200 text-violet-700 text-xs font-semibold rounded-lg hover:bg-violet-50 transition-colors"
                  >
                    Book a Demo
                  </Link>
                </div>
              )}

              {/* Compare options */}
              {view === "compare" && !isTyping && (
                <div className="flex flex-col gap-1.5">
                  {[
                    { label: "Prokraya vs Excel", desc: "Structure, automation & visibility vs manual" },
                    { label: "Prokraya vs ERP-only", desc: "Purpose-built S2P vs generic ERP modules" },
                    { label: "Prokraya vs Enterprise Tools", desc: "AI-native, fast implementation vs legacy" },
                  ].map((item) => (
                    <button
                      key={item.label}
                      onClick={() => {
                        pushUser(item.label);
                        const comparisons: Record<string, string> = {
                          "Prokraya vs Excel": "Excel requires manual data entry, offers no automation, lacks audit trails, and breaks at scale. Prokraya offers structured workflows, AI automation, real-time spend visibility, and seamless supplier collaboration, all in one platform.",
                          "Prokraya vs ERP-only": "ERP procurement modules are rigid and lack AI features, supplier portals, and sourcing automation. Prokraya is purpose-built for S2P with native AI agents, faster implementation (4–8 weeks), and lower operational effort.",
                          "Prokraya vs Enterprise Tools": "Legacy enterprise tools have high TCO, long implementation timelines, and complex UIs. Prokraya delivers AI-native automation, faster go-live, intuitive UX, and lower cost, purpose-built for mid-market to enterprise.",
                        };
                        pushBot(comparisons[item.label] + "\n\nWant to see this in action?");
                      }}
                      className="text-left px-3 py-2 rounded-lg border border-violet-100 bg-violet-50 hover:bg-violet-100 transition-colors"
                    >
                      <p className="text-xs font-semibold text-violet-700">{item.label}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{item.desc}</p>
                    </button>
                  ))}
                  <Link
                    to="/book-demo"
                    onClick={() => setOpen(false)}
                    className="flex items-center justify-center gap-2 py-2.5 bg-violet-600 text-white text-xs font-semibold rounded-lg hover:bg-violet-700 transition-colors mt-1"
                  >
                    Book a Demo <ArrowRight className="w-3 h-3" />
                  </Link>
                </div>
              )}

              {/* Sales input */}
              {view === "sales" && salesStep !== "done" && !isTyping && (
                <div className="flex gap-2">
                  <input
                    type={salesStep === "email" ? "email" : "text"}
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSalesInput()}
                    placeholder={
                      salesStep === "name" ? "Your name..." :
                      salesStep === "email" ? "Work email..." : "Company name..."
                    }
                    className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-violet-500"
                    autoFocus
                  />
                  <button
                    onClick={handleSalesInput}
                    className="px-3 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition-colors"
                  >
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* Sales done CTAs */}
              {view === "sales" && salesStep === "done" && !isTyping && (
                <div className="flex flex-col gap-2">
                  <Link
                    to="/book-demo"
                    onClick={() => setOpen(false)}
                    className="flex items-center justify-center gap-2 py-2.5 bg-violet-600 text-white text-xs font-semibold rounded-lg hover:bg-violet-700 transition-colors"
                  >
                    Book a Demo <ArrowRight className="w-3 h-3" />
                  </Link>
                  <Link
                    to="/contact-us"
                    onClick={() => setOpen(false)}
                    className="flex items-center justify-center gap-2 py-2.5 border border-violet-200 text-violet-700 text-xs font-semibold rounded-lg hover:bg-violet-50 transition-colors"
                  >
                    Contact Sales
                  </Link>
                </div>
              )}

              {/* Persistent bottom CTAs (always visible after first interaction on non-welcome views) */}
              {view !== "welcome" && diagnoseStep !== 5 && salesStep !== "done" && view !== "sales" && view !== "roi" && view !== "compare" && (
                <div className="flex gap-2 pt-2 border-t border-gray-100 mt-2">
                  <Link
                    to="/book-demo"
                    onClick={() => setOpen(false)}
                    className="flex-1 py-2 bg-violet-600 text-white text-xs font-semibold rounded-lg hover:bg-violet-700 transition-colors text-center"
                  >
                    Book a Demo
                  </Link>
                  <Link
                    to="/contact-us"
                    onClick={() => setOpen(false)}
                    className="flex-1 py-2 border border-gray-200 text-gray-600 text-xs font-semibold rounded-lg hover:bg-gray-50 transition-colors text-center"
                  >
                    Talk to Sales
                  </Link>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
}
