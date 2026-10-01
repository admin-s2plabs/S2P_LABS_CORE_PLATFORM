import { Clock, DollarSign, FileText, Shield, Users, Zap } from "lucide-react";
import { Helmet } from "react-helmet-async";
import { Link } from "wouter";
import { CommonShortForm } from "../components/CommonShortForm";
import { LogoBlack } from "../components/LogoImport";

export function PurchaseRequisitionPage() {
  const features = [
    { icon: FileText, title: "Smart PR Creation", description: "Create purchase requisitions with guided assistance and auto-fill based on historical data", color: "bg-violet-50 text-violet-600" },
    { icon: Zap, title: "Automated Approvals", description: "Intelligent routing based on amount, category, and department policies", color: "bg-amber-50 text-amber-600" },
    { icon: Users, title: "Collaborative Workflow", description: "Multi-level approvals with comments, attachments, and notifications", color: "bg-blue-50 text-blue-600" },
    { icon: Shield, title: "Policy Compliance", description: "Built-in policy checks ensure every requisition meets company guidelines", color: "bg-teal-50 text-teal-600" },
    { icon: Clock, title: "Real-Time Tracking", description: "Track PR status from creation to PO conversion with complete visibility", color: "bg-teal-50 text-teal-600" },
    { icon: DollarSign, title: "Budget Control", description: "Automatic budget validation and spend tracking across departments", color: "bg-orange-50 text-orange-600" },
  ];

  return (
    <>
      <Helmet>
        <script
          async
          src="https://www.googletagmanager.com/gtag/js?id=G-KDV6R2SDN2"
        ></script>
        <meta property="og:title" content="Purchase Requisition Software | S2P Labs" /> 
        <meta property="og:description" content="Streamline purchase requests with automated approvals, policy controls, budget validation, and real-time visibility." /> 
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://prokraya.ai/purchase-requisition" />
        <meta property="og:site_name" content="S2P Labs" />
        <meta property="og:image" content={LogoBlack} />
        <meta name="twitter:card" content={LogoBlack} />
        <meta name="twitter:site" content="@prokraya" />
        <title>Purchase Requisition Software | Procurement Request Automation | S2P Labs</title>
        <meta name="description" content="Automate purchase requisitions with intelligent workflows, approval routing, budget controls, and real-time tracking. Reduce approval cycles and improve procurement efficiency." />
        <meta name="keywords" content="purchase requisition software, purchase request management, procurement workflow automation, approval workflow software, procurement request software, PR management software, purchase approval system" />
      </Helmet>

      <div className="flex flex-col">
        {/* Hero */}
        <section className="relative bg-gradient-to-b from-violet-50 via-white to-white -mt-16 pt-16 pb-16 overflow-hidden">
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#7c3aed08_1px,transparent_1px),linear-gradient(to_bottom,#7c3aed08_1px,transparent_1px)] bg-[size:5rem_5rem]" />
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 pt-20 text-center">
            <span className="inline-block px-3 py-1 text-xs font-semibold text-violet-700 bg-violet-50 rounded-full mb-5 uppercase tracking-wider">Purchase Requisition</span>
            <h1 className="text-4xl lg:text-5xl font-extrabold text-gray-900 leading-tight mb-5">
              Purchase Requisition{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-600 to-teal-500">Software</span>
            </h1>
            <p className="text-lg text-gray-500 max-w-2xl mx-auto mb-8">
              Streamline purchase requests with intelligent workflows, automated approvals, and real-time tracking. Reduce approval cycles by up to 70% while maintaining complete control.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link href="/contact-us" className="inline-flex items-center justify-center px-7 py-3 border border-gray-200 text-gray-700 font-semibold rounded-lg hover:bg-gray-50 transition-colors">
                Contact Sales
              </Link>
            </div>
          </div>
        </section>

        {/* Stats */}
        <section className="py-10 bg-gradient-to-r from-violet-600 via-purple-600 to-teal-500">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 text-center text-white">
              {[
                { value: "70%", label: "Faster Approvals" },
                { value: "90%", label: "Reduced Errors" },
                { value: "100%", label: "Budget Visibility" },
                { value: "24/7", label: "System Availability" },
              ].map((stat, i) => (
                <div key={i}>
                  <div className="text-4xl font-extrabold mb-1">{stat.value}</div>
                  <div className="text-white/80 text-sm">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="py-20 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-2xl mx-auto mb-12">
              <h2 className="text-3xl font-bold text-gray-900 mb-3">Powerful Features</h2>
              <p className="text-gray-500">Everything you need for efficient purchase requisition management</p>
            </div>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
              {features.map((feature, index) => (
                <div key={index} className="bg-white border border-gray-100 rounded-2xl p-6 hover:shadow-md transition-all">
                  <div className={`w-11 h-11 ${feature.color} rounded-xl flex items-center justify-center mb-4`}>
                    <feature.icon className="w-5 h-5" />
                  </div>
                  <h3 className="font-semibold text-gray-900 mb-2">{feature.title}</h3>
                  <p className="text-sm text-gray-500">{feature.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* How It Works */}
        <section className="py-20 bg-gray-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-2xl mx-auto mb-12">
              <h2 className="text-3xl font-bold text-gray-900 mb-3">How It Works</h2>
              <p className="text-gray-500">Simple, intelligent, and automated</p>
            </div>
            <div className="grid md:grid-cols-4 gap-5">
              {[
                { step: "1", title: "Create Request", description: "Guided assistance for creating detailed purchase requisitions" },
                { step: "2", title: "Auto Route", description: "Smart routing to appropriate approvers based on rules" },
                { step: "3", title: "Get Approved", description: "Approvers review and approve with one click" },
                { step: "4", title: "Convert to PO", description: "Approved PRs automatically convert to purchase orders" },
              ].map((item, index) => (
                <div key={index} className="bg-white border border-gray-100 rounded-2xl p-6 text-center">
                  <div className="w-12 h-12 bg-gradient-to-br from-violet-600 to-teal-500 rounded-xl flex items-center justify-center text-white font-bold text-lg mx-auto mb-4">
                    {item.step}
                  </div>
                  <h3 className="font-semibold text-gray-900 mb-2">{item.title}</h3>
                  <p className="text-sm text-gray-500">{item.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <CommonShortForm reactedPage="Purchase Requisition" />
      </div>
    </>
  );
}
