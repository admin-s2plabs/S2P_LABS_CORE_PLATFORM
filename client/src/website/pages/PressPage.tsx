import { ArrowRight, Calendar, ExternalLink } from "lucide-react";
import { Link } from "wouter";

export function PressPage() {
  const pressItems = [
    { title: "S2P Labs Raises Series A to Accelerate Procurement Platform", outlet: "TechCrunch", date: "Mar 2026", tag: "Funding" },
    { title: "How S2P Labs is Transforming Enterprise Procurement", outlet: "Forbes", date: "Feb 2026", tag: "Feature" },
    { title: "S2P Labs Named a Top Procurement Technology Company to Watch in 2026", outlet: "Spend Matters", date: "Jan 2026", tag: "Award" },
    { title: "Modern Source-to-Pay: A Conversation with S2P Labs' Founders", outlet: "Supply Chain Dive", date: "Dec 2025", tag: "Interview" },
  ];

  return (
    <div className="flex flex-col">
      {/* Hero */}
      <section className="relative bg-gradient-to-b from-violet-50 via-white to-white -mt-16 pt-16 pb-16 overflow-hidden">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#7c3aed08_1px,transparent_1px),linear-gradient(to_bottom,#7c3aed08_1px,transparent_1px)] bg-[size:5rem_5rem]" />
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 pt-20 text-center">
          <span className="inline-block px-3 py-1 text-xs font-semibold text-violet-700 bg-violet-50 rounded-full mb-5 uppercase tracking-wider">Press & Media</span>
          <h1 className="text-4xl lg:text-5xl font-extrabold text-gray-900 leading-tight mb-5">Latest News & Press</h1>
          <p className="text-lg text-gray-500 max-w-2xl mx-auto">
            Stay up to date with the latest S2P Labs announcements, coverage, and media resources.
          </p>
        </div>
      </section>

      {/* Press Items */}
      <section className="py-20 bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="space-y-4">
            {pressItems.map((item, index) => (
              <div key={index} className="bg-white border border-gray-100 rounded-2xl p-6 hover:shadow-md transition-all flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-medium bg-violet-50 text-violet-700">{item.tag}</span>
                    <div className="flex items-center gap-1 text-xs text-gray-400">
                      <Calendar className="w-3 h-3" />
                      {item.date}
                    </div>
                  </div>
                  <h3 className="font-semibold text-gray-900 mb-1">{item.title}</h3>
                  <p className="text-sm text-gray-500">{item.outlet}</p>
                </div>
                <ExternalLink className="w-4 h-4 text-gray-400 flex-shrink-0 mt-1" />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Press Contact */}
      <section className="py-20 bg-gradient-to-br from-slate-900 via-violet-950 to-slate-900 text-white">
        <div className="max-w-2xl mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold mb-3">Press Inquiries</h2>
          <p className="text-gray-400 mb-8">For media inquiries, interviews, or press kit requests, please get in touch.</p>
          <Link href="/contact-us" className="inline-flex items-center gap-2 px-7 py-3 bg-violet-600 text-white font-semibold rounded-lg hover:bg-violet-700 transition-colors">
            Contact Press Team <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>
    </div>
  );
}
