import { Calendar, CheckCircle, Clock, Sparkles, Video } from "lucide-react";
import { useEffect } from "react";

export function BookDemoPage() {
  useEffect(() => {
    const head = document.querySelector("head");
    const script = document.createElement("script");
    script.setAttribute(
      "src",
      "https://assets.calendly.com/assets/external/widget.js"
    );
    head?.appendChild(script);
  }, []);

  return (
    <div className="flex flex-col">
      {/* Hero */}
      <section className="relative bg-gradient-to-b from-violet-50 via-white to-white -mt-16 pt-16 pb-16 overflow-hidden">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#7c3aed08_1px,transparent_1px),linear-gradient(to_bottom,#7c3aed08_1px,transparent_1px)] bg-[size:5rem_5rem]" />
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 pt-20 text-center">
          <span className="inline-flex items-center gap-2 px-4 py-1.5 bg-gradient-to-r from-violet-100 to-teal-100 rounded-full text-sm font-medium text-violet-700 mb-6">
            <Sparkles className="w-3.5 h-3.5" />
            Book a Demo
          </span>
          <h1 className="text-4xl lg:text-5xl font-extrabold text-gray-900 leading-tight mb-5">See Prokraya in Action</h1>
          <p className="text-lg text-gray-500 max-w-xl mx-auto">
            Schedule a personalized demo and discover how AI-powered procurement can transform your organization
          </p>
        </div>
      </section>

      {/* Demo Benefits */}
      <section className="py-12 bg-white border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-4 gap-8">
            {[
              { icon: Video, title: "Live Demo", description: "See the platform in action with your use cases", color: "bg-violet-50 text-violet-600" },
              { icon: CheckCircle, title: "Custom Scenarios", description: "We'll showcase features relevant to your needs", color: "bg-teal-50 text-teal-600" },
              { icon: Clock, title: "30 Minutes", description: "Quick, focused session at your convenience", color: "bg-teal-50 text-teal-600" },
              { icon: Calendar, title: "Flexible Schedule", description: "Choose a time that works best for you", color: "bg-blue-50 text-blue-600" },
            ].map((item, index) => (
              <div key={index} className="text-center">
                <div className={`w-12 h-12 ${item.color} rounded-xl flex items-center justify-center mx-auto mb-3`}>
                  <item.icon className="w-6 h-6" />
                </div>
                <h3 className="font-semibold text-gray-900 mb-1">{item.title}</h3>
                <p className="text-gray-500 text-sm">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Form */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-white rounded-2xl p-8 lg:p-10 border border-gray-100 shadow-sm">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Book Your Personalized Demo</h2>
            </div>

            <div
              className="calendly-inline-widget"
              data-url="https://calendly.com/prokraya/book-a-demo?hide_gdpr_banner=1&primary_color=faab18"
              style={{ minWidth: "320px", height: "720px" }}
            />
          </div>
        </div>
      </section>

      {/* What to Expect */}
      <section className="py-20 bg-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">What to Expect</h2>
            <p className="text-gray-500">{"Here's what happens after you book your demo"}</p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              { step: "1", title: "Confirmation", description: "You'll receive an email confirmation with a calendar invite for your demo" },
              { step: "2", title: "Preparation", description: "Our team will review your requirements to personalize your demo experience" },
              { step: "3", title: "Demo Day", description: "Join a 30-minute live demo showcasing Prokraya's AI-powered capabilities" },
            ].map((item, index) => (
              <div key={index} className="text-center">
                <div className="w-14 h-14 bg-gradient-to-br from-violet-600 to-teal-500 rounded-2xl flex items-center justify-center text-white font-bold text-xl mx-auto mb-4">
                  {item.step}
                </div>
                <h3 className="font-semibold text-gray-900 mb-2">{item.title}</h3>
                <p className="text-sm text-gray-500">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonial */}
      {/* <section className="py-16 bg-gradient-to-br from-slate-900 via-violet-950 to-slate-900 text-white">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-3xl text-white/30 mb-4">"</p>
          <blockquote className="text-lg font-medium mb-6 text-gray-200">
            The demo convinced us immediately. Seeing our actual procurement challenges solved in real-time by Prokraya's AI agents was game-changing.
          </blockquote>
          <div className="flex items-center justify-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-violet-500 to-teal-500 rounded-full flex items-center justify-center text-white text-sm font-bold">VM</div>
            <div className="text-left">
              <p className="font-semibold text-white text-sm">Vikram Mehta</p>
              <p className="text-gray-400 text-xs">CPO, Global Manufacturing Corp</p>
            </div>
          </div>
        </div>
      </section> */}
    </div>
  );
}
