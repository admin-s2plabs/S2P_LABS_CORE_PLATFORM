import { toast } from "@/hooks/use-toast";
import { useMutation } from "@tanstack/react-query";
import {
  ArrowRight,
  CheckCircle,
  Clock,
} from "lucide-react";
import { useState } from "react";
import { Helmet } from "react-helmet-async";
import { LogoBlack } from "../components/LogoImport";

function SalesForm() {
  const [submitted, setSubmitted] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    contactNumber: "",
    companyName: "",
    role: "",
  });

  const validateEmail = (email: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  const googleSheetMutation = useMutation({
    mutationFn: async (sheetData: any) => {
      const res = await fetch("/api/addScriptGoogle", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(sheetData),
      });
      if (!res.ok) {
        throw new Error("Failed to submit");
      }
      return await res.text();
    },
  });

  const contactUsMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await fetch("/api/saasmgmt/contactsUs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        throw new Error("Failed to submit request");
      }
      return res.json();
    },
  });

  const salesMutation = useMutation({
    mutationFn: async () => {
      if (!formData.name.trim()) {
        throw new Error("Name is required");
      }
      if (!validateEmail(formData.email)) {
        throw new Error("Valid email is required");
      }
      if (formData.contactNumber.length < 10) {
        throw new Error("Valid contact number is required");
      }
      if (!formData.companyName.trim()) {
        throw new Error("Company name is required");
      }
      if (!formData.role) {
        throw new Error("Role is required");
      }
      const sheetData = {
        sheetName: "Sales",
        name: formData.name,
        email: formData.email,
        contactNo: formData.contactNumber,
        companyName: formData.companyName,
        role: formData.role,
        comments: "",
      };
      const result = await googleSheetMutation.mutateAsync(sheetData);
      if (result !== "Success") {
        throw new Error("Failed to submit request");
      }
      const payload = {
        companyName: formData.companyName,
        contactUs: "Sales",
        firstName: formData.name,
        lastName: "",
        email: formData.email,
        mobile: formData.contactNumber,
        message: "",
        existingUser: false,
        role: formData.role,
      };
      const response = await contactUsMutation.mutateAsync(payload);
      if (!response.success) {
        throw new Error("Failed to submit request");
      }
      return response;
    },
    onSuccess: () => {
      setSubmitted(true);
      setFormData({
        name: "",
        email: "",
        contactNumber: "",
        companyName: "",
        role: "",
      });
      toast({
        title: "Success",
        description:
          "Thank you for showing interest. We will get back to you soon!",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to submit",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    setFormData((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!salesMutation.isPending) salesMutation.mutate();
  };

  if (submitted) {
    return (
      <div className="flex flex-col items-center gap-3 py-8">
        <CheckCircle className="w-8 h-8 text-violet-600" />
        <p className="font-semibold text-gray-900">Message sent!</p>
        <p className="text-sm text-gray-500 text-center">
          Our sales team will reach out within 24 hours.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1.5">
          Name *
        </label>
        <input
          type="text"
          name="name"
          required
          value={formData.name}
          onChange={handleChange}
          placeholder="John Smith"
          className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-violet-500 focus:border-transparent outline-none"
          disabled={salesMutation.isPending}
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1.5">
          Email *
        </label>
        <input
          type="email"
          name="email"
          required
          value={formData.email}
          onChange={handleChange}
          placeholder="john@company.com"
          className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-violet-500 focus:border-transparent outline-none"
          disabled={salesMutation.isPending}
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1.5">
          Contact Number *
        </label>
        <input
          type="tel"
          name="contactNumber"
          required
          value={formData.contactNumber}
          onChange={handleChange}
          placeholder="+91 98765 43210"
          className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-violet-500 focus:border-transparent outline-none"
          disabled={salesMutation.isPending}
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1.5">
          Company Name *
        </label>
        <input
          type="text"
          name="companyName"
          required
          value={formData.companyName}
          onChange={handleChange}
          placeholder="Acme Corporation"
          className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-violet-500 focus:border-transparent outline-none"
          disabled={salesMutation.isPending}
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1.5">
          Role *
        </label>
        <select
          name="role"
          required
          value={formData.role}
          onChange={handleChange}
          className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-violet-500 focus:border-transparent outline-none"
          disabled={salesMutation.isPending}
        >
          <option value="">Select your role</option>
          <option value="C-Suite / Executive">C-Suite / Executive</option>
          <option value="VP / Director">VP / Director</option>
          <option value="Procurement Manager">Procurement Manager</option>
          <option value="Finance Manager">Finance Manager</option>
          <option value="IT Manager">IT Manager</option>
          <option value="Operations Manager">Operations Manager</option>
          <option value="Other">Other</option>
        </select>
      </div>

      <button
        type="submit"
        disabled={salesMutation.isPending}
        className="w-full py-2.5 bg-violet-600 text-white text-sm font-semibold rounded-lg hover:bg-violet-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
      >
        {salesMutation.isPending ? "Submitting..." : "Contact Sales"}
        {!salesMutation.isPending && <ArrowRight className="w-4 h-4" />}
      </button>
    </form>
  );
}

function BuyerSupplierForm() {
  const [submitted, setSubmitted] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    contactNumber: "",
    companyName: "",
    userType: "",
    comments: "",
  });

  const validateEmail = (email: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  const googleSheetMutation = useMutation({
    mutationFn: async (sheetData: any) => {
      const res = await fetch("/api/addScriptGoogle", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(sheetData),
      });
      if (!res.ok) {
        throw new Error("Failed to submit");
      }
      return res.text();
    },
  });

  const contactUsMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await fetch("/api/saasmgmt/contactsUs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        throw new Error("Failed to submit request");
      }
      return res.json();
    },
  });

  const buyerSupplierMutation = useMutation({
    mutationFn: async () => {
      if (!formData.name.trim()) {
        throw new Error("Name is required");
      }
      if (!validateEmail(formData.email)) {
        throw new Error("Valid email is required");
      }
      if (formData.contactNumber && formData.contactNumber.length < 10) {
        throw new Error("Valid contact number is required");
      }
      if (!formData.companyName.trim()) {
        throw new Error("Company name is required");
      }
      if (!formData.userType) {
        throw new Error("User type is required");
      }
      const sheetData = {
        sheetName: formData.userType === "Buyer" ? "Buyer" : "Supplier",
        name: formData.name,
        email: formData.email,
        contactNo: formData.contactNumber,
        companyName: formData.companyName,
        userType: formData.userType,
        comments: formData.comments,
      };
      const sheetResponse = await googleSheetMutation.mutateAsync(sheetData);
      if (sheetResponse !== "Success") {
        throw new Error("Failed to submit to Google Sheet");
      }
      const payload = {
        companyName: formData.companyName,
        contactUs: formData.userType === "Buyer" ? "Buyer" : "Supplier",
        firstName: formData.name,
        lastName: "",
        email: formData.email,
        mobile: formData.contactNumber,
        message: formData.comments,
        existingUser: false,
        role: formData.userType,
      };
      const response = await contactUsMutation.mutateAsync(payload);
      if (!response.success) {
        throw new Error("Failed to submit request");
      }
      return response;
    },
    onSuccess: () => {
      setSubmitted(true);
      setFormData({
        name: "",
        email: "",
        contactNumber: "",
        companyName: "",
        userType: "",
        comments: "",
      });
      toast({
        title: "Success",
        description:
          "Thank you for showing interest. We will get back to you soon!",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to submit",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >,
  ) => {
    setFormData((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!buyerSupplierMutation.isPending) buyerSupplierMutation.mutate();
  };

  if (submitted) {
    return (
      <div className="flex flex-col items-center gap-3 py-8">
        <CheckCircle className="w-8 h-8 text-violet-600" />
        <p className="font-semibold text-gray-900">Message sent!</p>
        <p className="text-sm text-gray-500 text-center">
          We'll be in touch shortly.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1.5">
          Name *
        </label>
        <input
          type="text"
          name="name"
          required
          value={formData.name}
          onChange={handleChange}
          placeholder="Your full name"
          className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-violet-500 focus:border-transparent outline-none"
          disabled={buyerSupplierMutation.isPending}
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1.5">
          Email *
        </label>
        <input
          type="email"
          name="email"
          required
          value={formData.email}
          onChange={handleChange}
          placeholder="you@company.com"
          className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-violet-500 focus:border-transparent outline-none"
          disabled={buyerSupplierMutation.isPending}
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1.5">
          Contact Number
        </label>
        <input
          type="tel"
          name="contactNumber"
          value={formData.contactNumber}
          onChange={handleChange}
          placeholder="+91 98765 43210"
          className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-violet-500 focus:border-transparent outline-none"
          disabled={buyerSupplierMutation.isPending}
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1.5">
          Company Name *
        </label>
        <input
          type="text"
          name="companyName"
          required
          value={formData.companyName}
          onChange={handleChange}
          placeholder="Your company"
          className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-violet-500 focus:border-transparent outline-none"
          disabled={buyerSupplierMutation.isPending}
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1.5">
          User Type *
        </label>
        <select
          name="userType"
          required
          value={formData.userType}
          onChange={handleChange}
          className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-violet-500 focus:border-transparent outline-none"
          disabled={buyerSupplierMutation.isPending}
        >
          <option value="">Select user type</option>
          <option value="Buyer">Buyer</option>
          <option value="Supplier">Supplier / Vendor</option>
        </select>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1.5">
          Comments
        </label>
        <textarea
          rows={3}
          name="comments"
          value={formData.comments}
          onChange={handleChange}
          placeholder="Any questions or comments..."
          className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-violet-500 focus:border-transparent outline-none resize-none"
          disabled={buyerSupplierMutation.isPending}
        />
      </div>

      <button
        type="submit"
        disabled={buyerSupplierMutation.isPending}
        className="w-full py-2.5 bg-violet-600 text-white text-sm font-semibold rounded-lg hover:bg-violet-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
      >
        {buyerSupplierMutation.isPending ? "Submitting..." : "Send Message"}

        {!buyerSupplierMutation.isPending && <ArrowRight className="w-4 h-4" />}
      </button>
    </form>
  );
}

export function ContactUsPage() {
  const [activeTab, setActiveTab] = useState<"sales" | "buyer">("sales");

  return (
    <>
      <Helmet>
        <script
          async
          src="https://www.googletagmanager.com/gtag/js?id=G-KDV6R2SDN2"
        ></script>
        <meta property="og:title" content="Contact S2P Labs" />
        <meta property="og:description" content="Connect with procurement automation experts and discover how S2P Labs can transform your Source-to-Pay processes." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://prokraya.ai/contact" />
        <meta property="og:site_name" content="S2P Labs" />
        <meta property="og:image" content={LogoBlack} />
        <meta name="twitter:card" content={LogoBlack} />
        <title>Contact S2P Labs | Talk to Procurement Automation Experts</title>
        <meta name="description" content="Contact S2P Labs to learn how procurement software can streamline sourcing, supplier management, invoicing, contracts, and spend analytics. Speak with our team." />
        <meta name="keywords" content="contact procurement software company, procurement software demo, procurement automation consultation, source to pay software contact, procurement technology experts, procurement platform" />
      </Helmet>

      <div className="flex flex-col">
        {/* Hero */}
        <section className="relative bg-gradient-to-b from-violet-50 via-white to-white -mt-16 pt-16 pb-12 overflow-hidden">
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#7c3aed08_1px,transparent_1px),linear-gradient(to_bottom,#7c3aed08_1px,transparent_1px)] bg-[size:5rem_5rem]" />
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 pt-20 text-center">
            <span className="inline-block px-3 py-1 text-xs font-semibold text-violet-700 bg-violet-50 rounded-full mb-5 uppercase tracking-wider">
              Contact
            </span>
            <h1 className="text-3xl lg:text-4xl font-extrabold text-gray-900 leading-tight mb-4">Get in Touch</h1>
            <p className="text-lg text-gray-500 max-w-2xl mx-auto mb-8">
              {"Have questions? We're here to help. Reach out to our team and we'll get back to you shortly."}
            </p>
            <div className="flex flex-wrap justify-center gap-3 mt-5">
              <span className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-100 rounded-full text-sm text-gray-600">
                <Clock className="w-4 h-4 text-violet-500" /> 24-hour response time
              </span>
            </div>
          </div>
        </section>

        {/* Contact Info + Tabbed Forms */}
        <section className="py-16 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid lg:grid-cols-2 gap-12">
              {/* Info */}
              <div>
                <h2 className="text-xl font-bold text-gray-900 mb-3">Contact Information</h2>
                <p className="text-gray-500 text-sm mb-7">Use the form to reach our team during business hours.</p>

                <div className="space-y-5">
                  {[
                    { icon: Clock, color: "bg-violet-50 text-violet-600", title: "Business Hours", lines: ["Monday – Friday: 9:00 AM – 6:00 PM IST"] },
                  ].map((item, i) => (
                    <div key={i} className="flex items-start gap-4">
                      <div className={`w-10 h-10 ${item.color} rounded-xl flex items-center justify-center flex-shrink-0`}>
                        <item.icon className="w-4 h-4" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-900 mb-0.5 text-sm">{item.title}</h3>
                        {item.lines.map((line, li) => (
                          <p key={li} className="text-gray-500 text-sm">{line}</p>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Tabbed Forms */}
              <div>
                {/* Tabs */}
                <div className="flex gap-1 p-1 bg-gray-100 rounded-xl mb-6">
                  <button
                    onClick={() => setActiveTab("sales")}
                    className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-colors ${activeTab === "sales" ? "bg-white text-violet-700 shadow-sm" : "text-gray-500 hover:text-gray-700"
                      }`}
                  >
                    Sales
                  </button>
                  <button
                    onClick={() => setActiveTab("buyer")}
                    className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-colors ${activeTab === "buyer" ? "bg-white text-violet-700 shadow-sm" : "text-gray-500 hover:text-gray-700"
                      }`}
                  >
                    Buyer & Supplier
                  </button>
                </div>

                <div className="bg-gray-50 rounded-2xl p-7 border border-gray-100">
                  <h2 className="text-lg font-bold text-gray-900 mb-5">
                    {activeTab === "sales" ? "Talk to Sales" : "Buyer & Supplier Enquiry"}
                  </h2>
                  {activeTab === "sales" ? <SalesForm /> : <BuyerSupplierForm />}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="py-16 bg-gray-50">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Frequently Asked Questions</h2>
              <p className="text-gray-500 text-sm">Quick answers to common questions</p>
            </div>
            <div className="space-y-3">
              {[
                { q: "How quickly can I expect a response?", a: "Our team typically responds within 24 hours during business days." },
                { q: "Do you offer product demonstrations?", a: "Yes! We offer personalized product demos tailored to your organization's needs. Reach out using the form above to request one." },
                { q: "What is your implementation timeline?", a: "Implementation timelines vary based on your requirements, but most organizations go live within 4-8 weeks." },
                { q: "Do you provide training and support?", a: "Absolutely. We provide comprehensive onboarding, training, and ongoing support to ensure your success." },
              ].map((faq, index) => (
                <div key={index} className="bg-white p-5 rounded-xl border border-gray-100">
                  <h3 className="font-semibold text-gray-900 mb-1.5 text-sm">{faq.q}</h3>
                  <p className="text-xs text-gray-500">{faq.a}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
 