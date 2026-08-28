import { useState } from "react";
import { Search, ChevronDown, Send } from "lucide-react";

export function HelpCenterPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [question, setQuestion] = useState("");

  const faqs = [
    { question: "What is Prokraya?", answer: "Prokraya is an AI-powered Source-to-Pay platform that automates your entire procurement lifecycle with intelligent agents and workflows." },
    { question: "How do AI agents work?", answer: "Our AI agents autonomously monitor triggers and events in your procurement process, automatically executing actions like RFQ creation, bid analysis, contract renewals, and supplier risk assessments." },
    { question: "What integrations are supported?", answer: "Prokraya integrates with major ERP systems including SAP, Oracle, Microsoft Dynamics, NetSuite, QuickBooks, Workday, and supports custom API integrations." },
    { question: "Is my data secure?", answer: "Yes, we are ISO 27001 certified and GDPR compliant. We use enterprise-grade security measures including encryption at rest and in transit, regular security audits, and role-based access controls." },
    { question: "How long does implementation take?", answer: "Implementation typically takes 4-8 weeks depending on your requirements and existing systems. Our team provides full support throughout the onboarding process." },
    { question: "Do you offer training?", answer: "Yes, we provide comprehensive training for your team including live sessions, video tutorials, and detailed documentation to ensure successful adoption." },
    { question: "What support options are available?", answer: "We offer 24/7 customer support via email, chat, and phone. Enterprise customers also get dedicated account managers and priority support." },
    { question: "Can I try Prokraya before purchasing?", answer: "Yes, we offer a free trial and demo sessions. Contact our sales team to schedule a personalized demo of the platform." },
  ];

  const handleSubmitQuestion = (e: React.FormEvent) => {
    e.preventDefault();
    alert("Thank you for your question! Our team will get back to you within 24 hours.");
    setQuestion("");
  };

  return (
    <div className="flex flex-col">
      {/* Hero */}
      <section className="relative bg-gradient-to-b from-violet-50 via-white to-white -mt-16 pt-16 pb-16 overflow-hidden">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#7c3aed08_1px,transparent_1px),linear-gradient(to_bottom,#7c3aed08_1px,transparent_1px)] bg-[size:5rem_5rem]" />
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 pt-20 text-center">
          <span className="inline-block px-3 py-1 text-xs font-semibold text-violet-700 bg-violet-50 rounded-full mb-5 uppercase tracking-wider">Help Center</span>
          <h1 className="text-4xl lg:text-5xl font-extrabold text-gray-900 leading-tight mb-5">How Can We Help You?</h1>
          <p className="text-lg text-gray-500 mb-8">Search our knowledge base or browse FAQs below</p>
          <div className="max-w-lg mx-auto relative">
            <input
              type="text"
              placeholder="Search for answers..."
              className="w-full px-5 py-3 pr-12 border border-gray-200 rounded-xl bg-white focus:ring-2 focus:ring-violet-500 focus:border-transparent outline-none text-sm"
            />
            <Search className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          </div>
        </div>
      </section>

      {/* FAQs */}
      <section className="py-20 bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-gray-900 mb-10 text-center">Frequently Asked Questions</h2>
          <div className="space-y-3">
            {faqs.map((faq, index) => (
              <div
                key={index}
                className="bg-white rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow overflow-hidden"
              >
                <button
                  onClick={() => setOpenFaq(openFaq === index ? null : index)}
                  className="w-full px-6 py-5 flex items-center justify-between text-left"
                >
                  <span className="font-semibold text-gray-900 pr-4">{faq.question}</span>
                  <ChevronDown
                    className={`w-5 h-5 text-violet-600 flex-shrink-0 transition-transform ${openFaq === index ? "rotate-180" : ""}`}
                  />
                </button>
                {openFaq === index && (
                  <div className="px-6 pb-5 text-sm text-gray-600 leading-relaxed">
                    {faq.answer}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Post a Question */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-white rounded-3xl border border-gray-100 p-8 shadow-sm">
            <h2 className="text-3xl font-bold text-gray-900 mb-3 text-center">Still Have Questions?</h2>
            <p className="text-gray-500 text-center mb-8">
              {"Can't find what you're looking for? Send us your question and we'll get back to you within 24 hours."}
            </p>

            <form onSubmit={handleSubmitQuestion} className="space-y-5">
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1.5">Name</label>
                <input
                  type="text"
                  id="name"
                  required
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500 text-sm"
                />
              </div>
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
                <input
                  type="email"
                  id="email"
                  required
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500 text-sm"
                />
              </div>
              <div>
                <label htmlFor="question" className="block text-sm font-medium text-gray-700 mb-1.5">Your Question</label>
                <textarea
                  id="question"
                  rows={5}
                  required
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder="Describe your question in detail..."
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none text-sm"
                />
              </div>
              <button
                type="submit"
                className="w-full px-8 py-4 bg-violet-600 text-white rounded-xl font-semibold hover:bg-violet-700 transition-colors flex items-center justify-center gap-2"
              >
                Submit Question
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>
      </section>
    </div>
  );
}
