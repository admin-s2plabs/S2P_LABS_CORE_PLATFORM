import { AlertTriangle, CheckCircle, Eye, FileCheck, Lock, Server, Shield, Users } from "lucide-react";
import { Helmet } from "react-helmet-async";
import { Link } from "wouter";
import { LogoBlack } from "../components/LogoImport";

export function SecurityPage() {
  const securityFeatures = [
    { icon: Lock, title: "Data Encryption", description: "All data is encrypted in transit (TLS 1.3) and at rest (AES-256) to ensure maximum security.", color: "bg-violet-50 text-violet-600" },
    { icon: Shield, title: "ISO 27001 Certified", description: "Our information security management system meets international standards for data protection.", color: "bg-blue-50 text-blue-600" },
    { icon: Eye, title: "Continuous Monitoring", description: "24/7 security monitoring with real-time threat detection and automated incident response.", color: "bg-teal-50 text-teal-600" },
    { icon: Server, title: "Secure Infrastructure", description: "Enterprise-grade cloud infrastructure with redundancy, backups, and disaster recovery.", color: "bg-indigo-50 text-indigo-600" },
    { icon: FileCheck, title: "Regular Audits", description: "Annual third-party security audits and penetration testing to identify vulnerabilities.", color: "bg-teal-50 text-teal-600" },
    { icon: Users, title: "Access Controls", description: "Role-based access controls (RBAC) and multi-factor authentication (MFA) for all users.", color: "bg-pink-50 text-pink-600" },
  ];

  const complianceStandards = [
    { name: "ISO 27001", description: "Information Security Management" },
    { name: "GDPR", description: "General Data Protection Regulation" },
    { name: "SOC 2 Type II", description: "Service Organization Controls (In Progress)" },
    { name: "CCPA", description: "California Consumer Privacy Act" },
  ];

  const practices = [
    {
      title: "Data Protection",
      items: [
        "End-to-end encryption for all data transmissions using TLS 1.3",
        "AES-256 encryption for data at rest in secure databases",
        "Regular encrypted backups with point-in-time recovery",
        "Secure key management using hardware security modules (HSM)",
      ],
    },
    {
      title: "Access Management",
      items: [
        "Multi-factor authentication (MFA) required for all accounts",
        "Role-based access controls with principle of least privilege",
        "Single Sign-On (SSO) support with SAML 2.0",
        "Comprehensive audit logs for all access and actions",
      ],
    },
    {
      title: "Infrastructure Security",
      items: [
        "Cloud infrastructure hosted on certified secure data centers",
        "Network segmentation and firewall protection",
        "DDoS protection and rate limiting",
        "Regular security patches and updates",
      ],
    },
    {
      title: "Monitoring & Response",
      items: [
        "24/7 security monitoring and threat detection",
        "Automated incident response and alerting",
        "Regular vulnerability scans and penetration testing",
        "Dedicated security team and incident response plan",
      ],
    },
  ];

  return (
    <>
      <Helmet>
        <script
          async
          src="https://www.googletagmanager.com/gtag/js?id=G-KDV6R2SDN2"
        ></script>
        <meta property="og:title" content="Security & Compliance | S2P Labs" />
        <meta property="og:description" content="Enterprise-grade security, compliance, encryption, and governance built into every layer of the S2P Labs platform." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://prokraya.ai/security" />
        <meta property="og:site_name" content="S2P Labs" />
        <meta property="og:image" content={LogoBlack} />
        <meta name="twitter:card" content={LogoBlack} />
        <title>Enterprise Procurement Software Security & Compliance | S2P Labs</title>
        <meta name="description" content="Protect procurement data with enterprise-grade security, ISO 27001 compliance, encryption, access controls, continuous monitoring, and secure cloud infrastructure." />
        <meta name="keywords" content="procurement software security, procurement compliance, ISO 27001, enterprise security, SaaS security, procurement data protection, GDPR compliance, secure procurement platform" />
      </Helmet>

      <div className="flex flex-col">
        {/* Hero */}
        <section className="relative bg-gradient-to-b from-violet-50 via-white to-white -mt-16 pt-16 pb-16 overflow-hidden">
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#7c3aed08_1px,transparent_1px),linear-gradient(to_bottom,#7c3aed08_1px,transparent_1px)] bg-[size:5rem_5rem]" />
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 pt-20 text-center">
            <span className="inline-block px-3 py-1 text-xs font-semibold text-violet-700 bg-violet-50 rounded-full mb-5 uppercase tracking-wider">Security</span>
            <h1 className="text-4xl lg:text-5xl font-extrabold text-gray-900 leading-tight mb-5">
              Your Data Security is{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-600 to-teal-500">Our Priority</span>
            </h1>
            <p className="text-lg text-gray-500 max-w-2xl mx-auto">
              We implement industry-leading security measures to protect your procurement data and ensure compliance with global standards.
            </p>
          </div>
        </section>

        {/* Security Features */}
        <section className="py-20 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-2xl mx-auto mb-12">
              <h2 className="text-3xl font-bold text-gray-900 mb-3">Comprehensive Security Measures</h2>
              <p className="text-gray-500">Multi-layered security architecture protecting your data at every level</p>
            </div>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
              {securityFeatures.map((feature, index) => (
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

        {/* Compliance */}
        <section className="py-20 bg-gray-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-2xl mx-auto mb-12">
              <h2 className="text-3xl font-bold text-gray-900 mb-3">Compliance & Certifications</h2>
              <p className="text-gray-500">We adhere to international security and privacy standards</p>
            </div>
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5">
              {complianceStandards.map((standard, index) => (
                <div key={index} className="bg-white border border-gray-100 rounded-2xl p-6 text-center hover:shadow-md transition-all">
                  <div className="w-12 h-12 bg-violet-50 rounded-xl flex items-center justify-center mx-auto mb-4">
                    <CheckCircle className="w-6 h-6 text-violet-600" />
                  </div>
                  <h3 className="font-semibold text-gray-900 mb-1">{standard.name}</h3>
                  <p className="text-sm text-gray-500">{standard.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Security Practices */}
        <section className="py-20 bg-white">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-3xl font-bold text-gray-900 mb-10 text-center">Our Security Practices</h2>
            <div className="space-y-5">
              {practices.map((practice, index) => (
                <div key={index} className="bg-gray-50 border border-gray-100 rounded-2xl p-7">
                  <h3 className="text-lg font-bold text-gray-900 mb-4">{practice.title}</h3>
                  <ul className="space-y-2.5">
                    {practice.items.map((item, i) => (
                      <li key={i} className="flex items-start gap-3 text-sm text-gray-600">
                        <CheckCircle className="w-4 h-4 text-violet-500 flex-shrink-0 mt-0.5" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Report Vulnerability */}
        <section className="py-20 bg-gray-50">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="bg-white border border-amber-200 rounded-2xl p-8">
              <div className="flex items-start gap-4 mb-6">
                <div className="w-11 h-11 bg-amber-50 rounded-xl flex items-center justify-center flex-shrink-0">
                  <AlertTriangle className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900 mb-1">Report a Security Vulnerability</h2>
                  <p className="text-sm text-gray-500">We take security seriously. If you discover a vulnerability, please report it responsibly.</p>
                </div>
              </div>
              <div className="bg-amber-50 rounded-xl p-5 border border-amber-100">
                <h3 className="font-semibold text-gray-900 mb-3 text-sm">How to Report</h3>
                <ul className="space-y-1.5 text-sm text-gray-600 mb-3">
                  <li>• Reach out via our <Link href="/contact-us" className="text-violet-600 hover:underline">Contact Us</Link> page</li>
                  <li>• Include a detailed description of the vulnerability</li>
                  <li>• Provide steps to reproduce the issue</li>
                  <li>• Do not publicly disclose the vulnerability before it is patched</li>
                </ul>
                <p className="text-xs text-gray-500">We aim to acknowledge reports within 24 hours and provide updates on investigation and remediation.</p>
              </div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-20 bg-gradient-to-br from-slate-900 via-violet-950 to-slate-900 text-white">
          <div className="max-w-2xl mx-auto px-4 text-center">
            <h2 className="text-3xl font-bold mb-3">Ready to Get Started Securely?</h2>
            <p className="text-gray-400 mb-8">Enterprise-grade security built into every layer of S2P Labs</p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link href="/contact-us" className="inline-flex items-center justify-center px-7 py-3 border border-white/20 text-white font-semibold rounded-lg hover:bg-white/10 transition-colors">
                Contact Sales
              </Link>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
