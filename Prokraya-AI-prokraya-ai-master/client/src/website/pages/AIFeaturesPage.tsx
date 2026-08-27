import { ArrowRight, Brain, CheckCircle, MessageSquare, Sparkles, TrendingUp, Zap } from 'lucide-react';
import { Helmet } from 'react-helmet-async';
import { Link } from 'wouter';
import { LogoBlack } from '../components/LogoImport';

export function AIFeaturesPage() {
  return (
    <>
      <Helmet>
        <script
          async
          src="https://www.googletagmanager.com/gtag/js?id=G-KDV6R2SDN2"
        ></script>
        <meta property="og:title" content="AI Procurement Features | Prokraya" />
        <meta property="og:description" content="Discover AI capabilities that automate sourcing, supplier management, contracts, invoicing, compliance, and spend analytics." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://prokraya.ai/ai-features" />
        <meta property="og:site_name" content="Prokraya" />
        <meta property="og:image" content={LogoBlack} />
        <meta name="twitter:card" content={LogoBlack} />
        <meta name="twitter:site" content="@prokraya" />
        <title>AI Procurement Software Features | Procurement AI Capabilities | Prokraya</title>
        <meta name="description" content="Explore AI-powered procurement features including natural language processing, document intelligence, predictive analytics, smart matching, anomaly detection, and workflow automation." />
        <meta name="keywords" content="procurement AI, AI procurement software, procurement automation AI, predictive procurement analytics, document intelligence, procurement workflow automation, AI sourcing, procurement intelligence" />
      </Helmet>

      <div className="flex flex-col">
        {/* Hero Section */}
        <section className="relative bg-gradient-to-b from-violet-50 via-white to-white -mt-16 pt-16 pb-16 overflow-hidden">
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#7c3aed08_1px,transparent_1px),linear-gradient(to_bottom,#7c3aed08_1px,transparent_1px)] bg-[size:5rem_5rem]" />
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 pt-20 text-center">
            <span className="inline-flex items-center gap-2 px-4 py-1.5 bg-gradient-to-r from-violet-100 to-teal-100 rounded-full text-sm font-medium text-violet-700 mb-6">
              <Sparkles className="w-3.5 h-3.5" />
              Powered by Advanced AI
            </span>
            <h1 className="text-4xl lg:text-5xl font-extrabold text-gray-900 leading-tight mb-5">
              AI Features{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-600 to-teal-500">That Make Procurement Smarter</span>
            </h1>
            <p className="text-lg text-gray-500 mb-8 max-w-2xl mx-auto">
              From natural language queries to predictive analytics, our AI capabilities are built into every part of the procurement process.
            </p>
            <Link
              to="/book-demo"
              className="inline-flex items-center gap-2 px-7 py-3 bg-violet-600 text-white font-semibold rounded-lg hover:bg-violet-700 transition-colors shadow-md shadow-violet-200"
            >
              See Agents in Action
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </section>

        {/* Core AI Features */}
        <section className="py-20">
          <div className="max-w-7xl mx-auto px-6">
            <div className="text-center mb-12">
              <h2 className="text-4xl font-bold mb-4">Core AI Capabilities</h2>
              <p className="text-gray-600 max-w-2xl mx-auto">
                Cutting-edge AI technology embedded throughout the platform
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-8">
              <div className="bg-white p-8 rounded-lg shadow-sm border border-gray-200">
                <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mb-4">
                  <MessageSquare className="w-6 h-6 text-purple-600" />
                </div>
                <h3 className="font-bold text-xl mb-3">Natural Language Processing</h3>
                <p className="text-gray-600 mb-4">
                  Ask questions in plain English and get instant, accurate answers.
                </p>
                <ul className="space-y-2 text-sm text-gray-600">
                  <li className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-teal-500 mt-0.5 flex-shrink-0" />
                    <span>Conversational queries</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-teal-500 mt-0.5 flex-shrink-0" />
                    <span>Context understanding</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-teal-500 mt-0.5 flex-shrink-0" />
                    <span>Multi-language support</span>
                  </li>
                </ul>
              </div>

              <div className="bg-white p-8 rounded-lg shadow-sm border border-gray-200">
                <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mb-4">
                  <Brain className="w-6 h-6 text-purple-600" />
                </div>
                <h3 className="font-bold text-xl mb-3">Document Intelligence</h3>
                <p className="text-gray-600 mb-4">
                  Extract, analyze, and understand information from any document.
                </p>
                <ul className="space-y-2 text-sm text-gray-600">
                  <li className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-teal-500 mt-0.5 flex-shrink-0" />
                    <span>OCR extraction</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-teal-500 mt-0.5 flex-shrink-0" />
                    <span>Clause detection</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-teal-500 mt-0.5 flex-shrink-0" />
                    <span>Risk identification</span>
                  </li>
                </ul>
              </div>

              <div className="bg-white p-8 rounded-lg shadow-sm border border-gray-200">
                <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mb-4">
                  <TrendingUp className="w-6 h-6 text-purple-600" />
                </div>
                <h3 className="font-bold text-xl mb-3">Predictive Analytics</h3>
                <p className="text-gray-600 mb-4">
                  Forecast demand, pricing trends, and supplier risks before they happen.
                </p>
                <ul className="space-y-2 text-sm text-gray-600">
                  <li className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-teal-500 mt-0.5 flex-shrink-0" />
                    <span>Demand forecasting</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-teal-500 mt-0.5 flex-shrink-0" />
                    <span>Price predictions</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-teal-500 mt-0.5 flex-shrink-0" />
                    <span>Risk scoring</span>
                  </li>
                </ul>
              </div>

              <div className="bg-white p-8 rounded-lg shadow-sm border border-gray-200">
                <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mb-4">
                  <Zap className="w-6 h-6 text-purple-600" />
                </div>
                <h3 className="font-bold text-xl mb-3">Smart Matching</h3>
                <p className="text-gray-600 mb-4">
                  Automatically match POs, invoices, and receipts with high accuracy.
                </p>
                <ul className="space-y-2 text-sm text-gray-600">
                  <li className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-teal-500 mt-0.5 flex-shrink-0" />
                    <span>Fuzzy matching</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-teal-500 mt-0.5 flex-shrink-0" />
                    <span>Tolerance rules</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-teal-500 mt-0.5 flex-shrink-0" />
                    <span>Exception handling</span>
                  </li>
                </ul>
              </div>

              <div className="bg-white p-8 rounded-lg shadow-sm border border-gray-200">
                <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mb-4">
                  <Brain className="w-6 h-6 text-purple-600" />
                </div>
                <h3 className="font-bold text-xl mb-3">Auto-Classification</h3>
                <p className="text-gray-600 mb-4">
                  AI categorizes spend, suppliers, and items automatically.
                </p>
                <ul className="space-y-2 text-sm text-gray-600">
                  <li className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-teal-500 mt-0.5 flex-shrink-0" />
                    <span>Category assignment</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-teal-500 mt-0.5 flex-shrink-0" />
                    <span>Taxonomy management</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-teal-500 mt-0.5 flex-shrink-0" />
                    <span>Continuous learning</span>
                  </li>
                </ul>
              </div>

              <div className="bg-white p-8 rounded-lg shadow-sm border border-gray-200">
                <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mb-4">
                  <Sparkles className="w-6 h-6 text-purple-600" />
                </div>
                <h3 className="font-bold text-xl mb-3">Recommendation Engine</h3>
                <p className="text-gray-600 mb-4">
                  Get personalized recommendations for suppliers, pricing, and processes.
                </p>
                <ul className="space-y-2 text-sm text-gray-600">
                  <li className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-teal-500 mt-0.5 flex-shrink-0" />
                    <span>Supplier suggestions</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-teal-500 mt-0.5 flex-shrink-0" />
                    <span>Savings opportunities</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-teal-500 mt-0.5 flex-shrink-0" />
                    <span>Process improvements</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* Advanced Features */}
        <section className="bg-gradient-to-br from-purple-50 to-pink-50 py-20">
          <div className="max-w-7xl mx-auto px-6">
            <div className="text-center mb-12">
              <h2 className="text-4xl font-bold mb-4">Advanced AI Capabilities</h2>
            </div>

            <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
              <div className="bg-white p-8 rounded-lg shadow-sm">
                <h3 className="font-bold text-xl mb-4">Anomaly Detection</h3>
                <p className="text-gray-600 mb-4">
                  AI continuously monitors for unusual patterns, fraud, and compliance violations.
                </p>
                <ul className="space-y-2 text-sm text-gray-600">
                  <li>• Duplicate invoice detection</li>
                  <li>• Pricing anomalies</li>
                  <li>• Fraudulent activity alerts</li>
                  <li>• Compliance violations</li>
                </ul>
              </div>

              <div className="bg-white p-8 rounded-lg shadow-sm">
                <h3 className="font-bold text-xl mb-4">Market Intelligence</h3>
                <p className="text-gray-600 mb-4">
                  Real-time insights from market data, pricing trends, and supplier information.
                </p>
                <ul className="space-y-2 text-sm text-gray-600">
                  <li>• Price benchmarking</li>
                  <li>• Market trends</li>
                  <li>• Supplier discovery</li>
                  <li>• Competitive analysis</li>
                </ul>
              </div>

              <div className="bg-white p-8 rounded-lg shadow-sm">
                <h3 className="font-bold text-xl mb-4">Workflow Automation</h3>
                <p className="text-gray-600 mb-4">
                  AI suggests and creates optimal workflows based on your procurement patterns.
                </p>
                <ul className="space-y-2 text-sm text-gray-600">
                  <li>• Smart routing</li>
                  <li>• Approval optimization</li>
                  <li>• Process mining</li>
                  <li>• Bottleneck detection</li>
                </ul>
              </div>

              <div className="bg-white p-8 rounded-lg shadow-sm">
                <h3 className="font-bold text-xl mb-4">Risk Assessment</h3>
                <p className="text-gray-600 mb-4">
                  Comprehensive risk analysis across suppliers, contracts, and spending.
                </p>
                <ul className="space-y-2 text-sm text-gray-600">
                  <li>• Financial risk scoring</li>
                  <li>• Compliance risk alerts</li>
                  <li>• Supply chain disruptions</li>
                  <li>• Concentration risk</li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="bg-gradient-to-r from-purple-600 to-pink-600 text-white py-16">
          <div className="max-w-4xl mx-auto px-6 text-center">
            <h2 className="text-3xl font-bold mb-4">Experience AI-Powered Procurement</h2>
            <p className="text-lg opacity-90 mb-6">
              See how our AI features can transform your procurement operations
            </p>
            <Link href="/book-demo" className="inline-block bg-white text-purple-600 px-8 py-3 rounded-lg font-semibold hover:bg-gray-100 transition-colors">
              Schedule a Demo
            </Link>
          </div>
        </section>
      </div>
    </>
  );
}
