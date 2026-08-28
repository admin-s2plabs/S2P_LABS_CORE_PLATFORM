import { ArrowRight, Book, Code2, ExternalLink, Zap } from "lucide-react";
import { Link } from "wouter";

export function DocumentationPage() {
  const sections = [
    { icon: Book, title: "Getting Started", description: "Quick setup guides, onboarding steps, and first-run walkthroughs.", color: "bg-violet-50 text-violet-600", links: ["Platform Overview", "User Onboarding", "Admin Setup"] },
    { icon: Code2, title: "API Reference", description: "Full REST API documentation with request/response examples.", color: "bg-teal-50 text-teal-600", links: ["Authentication", "Endpoints", "Webhooks"] },
    { icon: Zap, title: "AI Agents", description: "Configure, monitor, and extend Prokraya AI agents for your workflows.", color: "bg-teal-50 text-teal-600", links: ["Agent Configuration", "Triggers & Events", "Custom Workflows"] },
  ];

  return (
    <div className="flex flex-col">
      {/* Hero */}
      <section className="relative bg-gradient-to-b from-violet-50 via-white to-white -mt-16 pt-16 pb-16 overflow-hidden">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#7c3aed08_1px,transparent_1px),linear-gradient(to_bottom,#7c3aed08_1px,transparent_1px)] bg-[size:5rem_5rem]" />
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 pt-20 text-center">
          <span className="inline-block px-3 py-1 text-xs font-semibold text-violet-700 bg-violet-50 rounded-full mb-5 uppercase tracking-wider">Documentation</span>
          <h1 className="text-4xl lg:text-5xl font-extrabold text-gray-900 leading-tight mb-5">Developer & User Docs</h1>
          <p className="text-lg text-gray-500 max-w-2xl mx-auto">
            Complete guides, API references, and integration documentation for Prokraya.
          </p>
        </div>
      </section>

      {/* Doc Sections */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-3 gap-5">
            {sections.map((section, index) => (
              <div key={index} className="bg-white border border-gray-100 rounded-2xl p-6 hover:shadow-md transition-all">
                <div className={`w-11 h-11 ${section.color} rounded-xl flex items-center justify-center mb-4`}>
                  <section.icon className="w-5 h-5" />
                </div>
                <h3 className="font-semibold text-gray-900 mb-2">{section.title}</h3>
                <p className="text-sm text-gray-500 mb-4">{section.description}</p>
                <ul className="space-y-1.5">
                  {section.links.map((link, i) => (
                    <li key={i}>
                      <button className="flex items-center gap-1.5 text-sm text-violet-600 hover:text-violet-700 font-medium">
                        <ExternalLink className="w-3 h-3" />
                        {link}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-gradient-to-br from-slate-900 via-violet-950 to-slate-900 text-white">
        <div className="max-w-2xl mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold mb-3">Need Help?</h2>
          <p className="text-gray-400 mb-8">Our support team is available 24/7 to help you get the most out of Prokraya.</p>
          <Link href="/help-center" className="inline-flex items-center gap-2 px-7 py-3 bg-violet-600 text-white font-semibold rounded-lg hover:bg-violet-700 transition-colors">
            Visit Help Center <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>
    </div>
  );
}
