import { toast } from "@/hooks/use-toast";
import { useMutation } from "@tanstack/react-query";
import { Award, CheckCircle, Coffee, Heart, Lightbulb, TrendingUp, Users } from "lucide-react";
import { useState } from "react";
import { Helmet } from "react-helmet-async";
import { LogoBlack } from "../components/LogoImport";
import TestimonialCarousel from "../components/TestimonialCarousel";

interface FormState {
  name: string;
  email: string;
  message: string;
  resume: File | null;
}

function ApplicationForm() {
  const [submitted, setSubmitted] = useState<boolean>(false);
  const [formData, setFormData] = useState<FormState>({
    name: "",
    email: "",
    message: "",
    resume: null,
  });

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    setFormData((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  };

  const validateEmail = (email: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  const handleFileChange = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    setFormData((prev) => ({
      ...prev,
      resume: e.target.files?.[0] || null,
    }));
  };

  const submitApplication = async (data: FormState) => {
    const formData = new FormData();
    if (data.resume) {
      formData.append("resume", data.resume);
    }
    formData.append(
      "career",
      JSON.stringify({
        contactName: data.name,
        email: data.email,
        message: data.message,
        mobile: "",
        user: "",
      })
    );
    const response = await fetch("/api/career", {
      method: "POST",
      body: formData,
    });
    if (!response.ok) {
      throw new Error("Failed to submit application");
    }
    return response.json();
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (formData.name === "") {
      toast({ title: "Validation Failure!", description: "Please enter Name to continue!", variant: "destructive" });
      return;
    }
    if (formData.email === "" || !validateEmail(formData.email)) {
      toast({ title: "Validation Failure!", description: "Please enter Email ID to continue!", variant: "destructive" });
      return;
    }
    if (formData.resume === null) {
      toast({ title: "Validation Failure!", description: "Please upload resume to continue!", variant: "destructive" });
      return;
    }
    if (!mutation.isPending) mutation.mutate(formData);
  };

  const mutation = useMutation({
    mutationFn: submitApplication,
    onSuccess: () => {
      setSubmitted(true);
      toast({ title: "Application submitted successfully, We will get back to you soon!!" });
      setFormData({
        name: "",
        email: "",
        message: "",
        resume: null,
      });
    },
    onError: (error) => {
      toast({ title: "Application submission failed!", variant: "destructive" });
    },
  });

  return (
    <section className="py-16 bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-10">
          <h2 className="text-3xl font-bold text-gray-900 mb-2">Join us</h2>
          <p className="text-gray-500 text-sm mb-7">Send us your details and we'll be in touch about opportunities at S2P Labs.</p>
        </div>
        <div className="container mx-auto max-w-7xl px-4">

          {submitted ? (
            <div className="flex flex-col items-center gap-3 py-8">
              <div className="w-12 h-12 bg-violet-50 rounded-full flex items-center justify-center">
                <CheckCircle className="w-6 h-6 text-violet-600" />
              </div>
              <p className="font-semibold text-gray-900">Application received!</p>
              <p className="text-sm text-gray-500 text-center">Thanks for your interest. We'll review your details and reach out shortly.</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
                <div className="lg:col-span-3">
                  <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleInputChange}
                    placeholder="Name"
                    className="h-16 w-full rounded-lg border border-transparent bg-white px-5 shadow-md outline-none transition focus:border-blue-500"
                    disabled={mutation.isPending}
                  />
                </div>

                <div className="lg:col-span-3">
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleInputChange}
                    placeholder="Email ID"
                    className="h-16 w-full rounded-lg border border-transparent bg-white px-5 shadow-md outline-none transition focus:border-blue-500"
                    disabled={mutation.isPending}
                  />
                </div>

                <div className="lg:col-span-6">
                  <label className="flex h-16 w-full cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-gray-400 bg-white text-blue-600 transition hover:border-blue-500">
                    <span className="truncate px-4">
                      {formData.resume
                        ? formData.resume.name
                        : "Upload Resume"}
                    </span>

                    <input
                      type="file"
                      name="resume"
                      accept=".pdf,.doc,.docx"
                      onChange={handleFileChange}
                      className="hidden"
                      disabled={mutation.isPending}
                    />
                  </label>
                </div>

                <div className="lg:col-span-10">
                  <textarea
                    rows={6}
                    name="message"
                    value={formData.message}
                    onChange={handleInputChange}
                    placeholder="Message / Comments (optional)"
                    className="w-full rounded-lg border border-transparent bg-white p-5 shadow-md outline-none resize-none transition focus:border-blue-500"
                    disabled={mutation.isPending}
                  />
                </div>

                <div className="flex items-center justify-center lg:col-span-2 lg:justify-end">
                  <button
                    type="submit"
                    disabled={mutation.isPending}
                    className="h-12 min-w-[140px] rounded-xl bg-blue-600 px-8 font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {mutation.isPending ? "Sending..." : "Send"}
                  </button>
                </div>
              </div>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}

const testimonialSlides = [
  {
    id: 1,
    name: "Chanti Singam Reddy",
    description: "Prokarya fosters a strong professional culture focused on delivering value and smart solutions. Its team works seamlessly to create scalable, dependable products with real-world impact.",
    designation: "Senior Technical Lead"
  }, {
    id: 2,
    name: "Karthikeya Manchikanti",
    description: "Our strong team of bug hunters rigorously tests every aspect of the application. Through immersive approach, we refine each release to deliver a smooth, trustworthy product.",
    designation: "QA Lead"
  }, {
    id: 3,
    name: "Adarsh Devulapally",
    description: "Prokarya is a client-focused company driven by innovation, quality, and growth. The solutions simplify processes and help clients work more efficiently.",
    designation: "Senior Product Manager"
  }
];

export function WorkCulturePage() {
  const values = [
    { icon: Lightbulb, title: "Innovation & Creativity", description: "We encourage bold ideas and experimentation. Every team member has the freedom to innovate.", color: "bg-violet-50 text-violet-600" },
    { icon: Users, title: "Collaboration", description: "We believe in the power of teamwork. Our best solutions come from diverse perspectives working together.", color: "bg-teal-50 text-teal-600" },
    { icon: TrendingUp, title: "Growth Mindset", description: "Continuous learning is at our core. We invest in our people's professional and personal development.", color: "bg-teal-50 text-teal-600" },
    { icon: Heart, title: "Work-Life Balance", description: "We understand that happy employees create great products. Flexible work and wellness are priorities.", color: "bg-pink-50 text-pink-600" },
  ];

  const perks = [
    "Flexible work hours and remote options",
    "Comprehensive health insurance",
    "Learning and development budget",
    "Modern office spaces",
    "Team outings and events",
    "Performance bonuses",
    "Stock options for key roles",
    "Wellness programs",
  ];

  return (
    <>
      <Helmet>
        <script
          async
          src="https://www.googletagmanager.com/gtag/js?id=G-KDV6R2SDN2"
        ></script>
        <meta property="og:title" content="Careers at S2P Labs | Life & Culture" />
        <meta property="og:description" content="Join a team transforming procurement. Discover our culture, values, benefits, and career opportunities." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://prokraya.ai/work-culture" />
        <meta property="og:site_name" content="S2P Labs" />
        <meta property="og:image" content={LogoBlack} />
        <meta name="twitter:card" content={LogoBlack} />
        <meta name="twitter:site" content="@prokraya" />
        <title>Careers at S2P Labs | Work & Culture in Procurement Innovation</title>
        <meta name="description" content="Explore careers at S2P Labs. Join a team building the future of procurement with a culture focused on innovation, collaboration, growth, and impact." />
        <meta name="keywords" content="S2P Labs careers, procurement technology jobs, software careers, product management jobs, engineering careers, SaaS careers, procurement innovation, work culture" />
      </Helmet>

      <div className="flex flex-col">
        {/* Hero */}
        <section className="relative bg-gradient-to-b from-violet-50 via-white to-white -mt-16 pt-16 pb-16 overflow-hidden">
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#7c3aed08_1px,transparent_1px),linear-gradient(to_bottom,#7c3aed08_1px,transparent_1px)] bg-[size:5rem_5rem]" />
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 pt-20 text-center">
            <span className="inline-block px-3 py-1 text-xs font-semibold text-violet-700 bg-violet-50 rounded-full mb-5 uppercase tracking-wider">Work & Culture</span>
            <h1 className="text-4xl lg:text-5xl font-extrabold text-gray-900 leading-tight mb-5">Life at S2P Labs</h1>
            <p className="text-lg text-gray-500 max-w-2xl mx-auto">
              Join a team that's passionate about transforming procurement while fostering a culture of innovation, collaboration, and growth
            </p>
          </div>
        </section>

        {/* Values */}
        <section className="py-20 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <h2 className="text-4xl font-bold text-gray-900 mb-3">Our Core Values</h2>
              <p className="text-gray-500">The principles that guide everything we do</p>
            </div>
            <div className="grid md:grid-cols-2 gap-5">
              {values.map((value, index) => (
                <div key={index} className="bg-white border border-gray-100 rounded-2xl p-7 hover:shadow-md transition-all">
                  <div className={`w-12 h-12 ${value.color} rounded-xl flex items-center justify-center mb-4`}>
                    <value.icon className="w-6 h-6" />
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 mb-2">{value.title}</h3>
                  <p className="text-gray-500">{value.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Culture Highlights */}
        <section className="py-20 bg-gray-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid lg:grid-cols-2 gap-12 items-center">
              <div>
                <h2 className="text-2xl font-bold text-gray-900 mb-7">What Makes Us Different</h2>
                <div className="space-y-5">
                  {[
                    { icon: Coffee, title: "Async-First Culture", desc: "We respect your time and focus. Work when you're most productive, not just when it's 9-5.", color: "bg-violet-50 text-violet-600" },
                    { icon: Award, title: "Impact-Driven Work", desc: "Your work directly impacts thousands of organizations and millions in procurement efficiency.", color: "bg-teal-50 text-teal-600" },
                    { icon: Users, title: "Diverse & Inclusive", desc: "We celebrate diversity and create an environment where everyone can thrive and be themselves.", color: "bg-teal-50 text-teal-600" },
                  ].map((item, i) => (
                    <div key={i} className="flex gap-4 p-5 bg-white rounded-xl border border-gray-100">
                      <div className={`w-10 h-10 ${item.color} rounded-lg flex items-center justify-center flex-shrink-0`}>
                        <item.icon className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-900 mb-1">{item.title}</h3>
                        <p className="text-sm text-gray-500">{item.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <TestimonialCarousel carouselItems={testimonialSlides} />
            </div>
          </div>
        </section>

        {/* Perks */}
        <section className="py-20 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <h2 className="text-4xl font-bold text-gray-900 mb-3">Benefits & Perks</h2>
              <p className="text-gray-500">We invest in your well-being and growth</p>
            </div>
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
              {perks.map((perk, index) => (
                <div key={index} className="bg-gray-50 border border-gray-100 rounded-xl p-5 flex items-center gap-3">
                  <CheckCircle className="w-5 h-5 text-violet-500 flex-shrink-0" />
                  <p className="text-sm font-medium text-gray-700">{perk}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Application Form */}
        <ApplicationForm />
      </div>
    </>
  );
}
