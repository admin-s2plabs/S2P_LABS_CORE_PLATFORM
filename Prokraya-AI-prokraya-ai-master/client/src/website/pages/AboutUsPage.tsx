import { ArrowRight, Eye, Lightbulb, Lock, Star, Target } from "lucide-react";
import { Helmet } from "react-helmet-async";
import { Link } from "wouter";
import { LogoBlack } from "../components/LogoImport";

export function AboutUsPage() {
  return (
    <>
      <Helmet>
        <script
          async
          src="https://www.googletagmanager.com/gtag/js?id=G-KDV6R2SDN2"
        ></script>
        <meta property="og:title" content="About Prokraya | AI-Powered Procurement Software Company" />
        <meta property="og:description" content="We're building the future of procurement with AI agents, autonomous workflows, and enterprise-grade procurement automation." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://prokraya.ai/about-us" />
        <meta property="og:site_name" content="Prokraya" />
        <meta property="og:image" content={LogoBlack} />
        <meta name="twitter:card" content={LogoBlack} />
        <meta name="twitter:site" content="@prokraya" />
        <title>About Prokraya | AI-Powered Procurement Software Company</title>
        <meta name="description" content="Learn about Prokraya's mission to transform enterprise procurement through AI-powered automation, autonomous workflows, and intelligent procurement agents." />
        <meta name="keywords" content="Prokraya, AI procurement company, procurement software company, source to pay platform, procurement automation, AI procurement agents, enterprise procurement technology" />
      </Helmet>
      
      <div className="flex flex-col">
        {/* Hero */}
        <section className="relative bg-gradient-to-b from-violet-50 via-white to-white -mt-16 pt-16 pb-16 overflow-hidden">
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#7c3aed08_1px,transparent_1px),linear-gradient(to_bottom,#7c3aed08_1px,transparent_1px)] bg-[size:5rem_5rem]" />
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 pt-20 text-center">
            <span className="inline-block px-3 py-1 text-xs font-semibold text-violet-700 bg-violet-50 rounded-full mb-5 uppercase tracking-wider">
              About Us
            </span>
            <h1 className="text-4xl lg:text-5xl font-extrabold text-gray-900 leading-tight mb-5">About Prokraya</h1>
            <p className="text-lg text-gray-500 max-w-2xl mx-auto">
              {"We are on a mission to revolutionize procurement through AI-powered intelligence and automation."}
            </p>
          </div>
        </section>

        {/* Mission */}
        <section className="py-20 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid lg:grid-cols-2 gap-12 items-center">
              <div>
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-11 h-11 bg-violet-50 rounded-xl flex items-center justify-center">
                    <Target className="w-5 h-5 text-violet-600" />
                  </div>
                  <h2 className="text-2xl font-bold text-gray-900">Our Mission</h2>
                </div>
                <p className="text-gray-600 mb-5 leading-relaxed">
                  <b>Eliminating Manual Effort</b><br />
                  Automate procurement workflows and repetitive tasks to reduce operational burden, improve accuracy, and free teams to focus on strategic decision-making.<br /><br />
                  <b>Ensuring Secure AI Execution</b><br />
                  Deliver enterprise-grade governance, compliance, and security controls that enable organizations to confidently deploy and scale AI-driven procurement operations.<br /><br />
                  <b>Serving Enterprise-Scale Organizations</b><br />
                  Provide a robust, scalable platform designed to meet the complexity, volume, and requirements of large global enterprises.
                </p>
              </div>
              <div className="relative">
                <div className="absolute -inset-1 bg-gradient-to-r from-violet-400 to-teal-400 rounded-3xl blur opacity-30" />
                <img
                  src="https://images.unsplash.com/photo-1739298061740-5ed03045b280?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080"
                  alt="Team collaboration"
                  className="relative rounded-3xl shadow-xl w-full"
                />
              </div>
            </div>

            <div className="grid md:grid-cols-3 gap-6 mt-14">
              {[
                { value: "10,000+", label: "Procurement Processes Automated Daily", color: "text-violet-600", bg: "bg-violet-50" },
                { value: "500+", label: "Organizations Empowered", color: "text-teal-600", bg: "bg-teal-50" },
                { value: "99.9%", label: "Platform Uptime", color: "text-teal-600", bg: "bg-teal-50" },
              ].map((stat, i) => (
                <div key={i} className={`${stat.bg} rounded-2xl p-8 text-center border border-white`}>
                  <div className={`text-5xl font-extrabold ${stat.color} mb-2`}>{stat.value}</div>
                  <p className="text-gray-600">{stat.label}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Vision */}
        <section className="py-20 bg-gray-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid lg:grid-cols-2 gap-12 items-start">
              <div className="bg-gradient-to-br from-violet-600 to-teal-500 rounded-2xl p-10 text-white">
                <Eye className="w-12 h-12 text-white/70 mb-5" />
                <h2 className="text-3xl font-bold mb-5 pb-5">Our Vision</h2>
                <p className="text-white/85 leading-relaxed pb-5 mb-5">
                  To transform enterprise procurement from a reactive, manual process into an autonomous AI-powered operating system that intelligently orchestrates sourcing, supplier management, and decision-making delivering speed, efficiency, compliance, and strategic value at scale.
                </p>
              </div>
              <div>
                <h3 className="text-xl font-bold text-gray-900 mb-6">What We Stand For</h3>
                <div className="space-y-5">
                  {[
                    { icon: Lightbulb, title: "AI Agents That Execute, Not Just Assist", desc: "Beyond chatbots and copilots, Prokraya's AI agents take action executing procurement workflows, coordinating tasks, and driving outcomes autonomously.", color: "bg-violet-50 text-violet-600" },
                    { icon: Star, title: "Single-Tenant, Security-First by Design", desc: "Built for enterprise trust with dedicated environments, data isolation, and rigorous security controls that protect sensitive procurement operations.", color: "bg-teal-50 text-teal-600" },
                    { icon: Lock, title: "Policy-Driven, Fully Auditable AI", desc: "Every action is governed by business policies, approval frameworks, and complete audit trails delivering transparency, compliance, and control at every step.", color: "bg-teal-50 text-teal-600" },
                  ].map((item, i) => (
                    <div key={i} className="flex gap-4 p-3 bg-white rounded-xl border border-gray-100">
                      <div className={`w-10 h-10 ${item.color} rounded-lg flex items-center justify-center flex-shrink-0`}>
                        <item.icon className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="font-semibold text-gray-900 mb-1">{item.title}</h4>
                        <p className="text-sm text-gray-500">{item.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Leadership */}
        {/* <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <div className="flex items-center justify-center gap-2 mb-3">
              <Users className="w-5 h-5 text-violet-600" />
              <span className="text-xs font-semibold text-violet-700 uppercase tracking-wider">Leadership Team</span>
            </div>
            <h2 className="text-3xl font-bold text-gray-900 mb-3">Meet the Team Driving Procurement Innovation</h2>
            <p className="text-gray-500">Experienced leaders building the future of AI-powered procurement</p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {team.map((member, index) => (
              <div key={index} className="bg-white border border-gray-100 rounded-2xl p-6 text-center hover:shadow-md transition-all">
                <div className="w-20 h-20 bg-gradient-to-br from-violet-600 to-teal-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <span className="text-2xl font-bold text-white">{member.initials}</span>
                </div>
                <h3 className="font-semibold text-gray-900 mb-1">{member.name}</h3>
                <p className="text-sm text-gray-500">{member.role}</p>
              </div>
            ))}
          </div>
        </div>
      </section> */}

        {/* CTA */}
        <section className="py-20 bg-gradient-to-br from-slate-900 via-violet-950 to-slate-900 text-white">
          <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h2 className="text-3xl font-bold mb-3">Join Us on This Journey</h2>
            <p className="text-gray-400 mb-8">Let's transform procurement together</p>
            <Link
              to="/book-demo"
              className="inline-flex items-center gap-2 px-7 py-3 bg-violet-600 text-white font-semibold rounded-lg hover:bg-violet-700 transition-colors"
            >
              Book a Demo
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </section>
      </div>
    </>
  );
}
