import { toast } from "@/hooks/use-toast";
import { useMutation } from "@tanstack/react-query";
import { ArrowRight, CheckCircle, Heart, Rocket, TrendingUp } from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";

interface FormState {
  name: string;
  email: string;
  message: string;
  resume: File | null;
}

export function CareersPage() {
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

  const reasons = [
    { icon: Rocket, title: "High-Impact Work", description: "Your work directly shapes how thousands of procurement teams operate globally.", color: "bg-violet-50 text-violet-600" },
    { icon: TrendingUp, title: "Rapid Growth", description: "Join a fast-growing startup with real ownership and room to advance.", color: "bg-teal-50 text-teal-600" },
    { icon: Heart, title: "Great Culture", description: "Flexible work, strong team bonds, and a culture that respects your life outside work.", color: "bg-pink-50 text-pink-600" },
  ];

  return (
    <div className="flex flex-col">
      {/* Hero */}
      <section className="relative bg-gradient-to-b from-violet-50 via-white to-white -mt-16 pt-16 pb-16 overflow-hidden">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#7c3aed08_1px,transparent_1px),linear-gradient(to_bottom,#7c3aed08_1px,transparent_1px)] bg-[size:5rem_5rem]" />
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 pt-20 text-center">
          <span className="inline-block px-3 py-1 text-xs font-semibold text-violet-700 bg-violet-50 rounded-full mb-5 uppercase tracking-wider">Careers</span>
          <h1 className="text-4xl lg:text-5xl font-extrabold text-gray-900 leading-tight mb-5">
            Build the Future of{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-600 to-teal-500">Procurement</span>
          </h1>
          <p className="text-lg text-gray-500 max-w-2xl mx-auto">
            Join a passionate team transforming how enterprises buy, source, and manage spend.
          </p>
        </div>
      </section>

      {/* Why S2P Labs */}
      <section className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-3 gap-5">
            {reasons.map((reason, index) => (
              <div key={index} className="bg-white border border-gray-100 rounded-2xl p-6 hover:shadow-md transition-all">
                <div className={`w-11 h-11 ${reason.color} rounded-xl flex items-center justify-center mb-4`}>
                  <reason.icon className="w-5 h-5" />
                </div>
                <h3 className="font-semibold text-gray-900 mb-2">{reason.title}</h3>
                <p className="text-sm text-gray-500">{reason.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 bg-gray-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10">
            <h2 className="text-3xl font-bold text-gray-900 mb-2">Join us</h2>
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

      {/* CTA */}
      <section className="py-20 bg-gradient-to-br from-slate-900 via-violet-950 to-slate-900 text-white">
        <div className="max-w-2xl mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold mb-3">{"Don't See a Fit?"}</h2>
          <p className="text-gray-400 mb-8">{"Send us your resume and we'll reach out when the right opportunity opens up."}</p>
          <Link href="/contact-us" className="inline-flex items-center gap-2 px-7 py-3 bg-violet-600 text-white font-semibold rounded-lg hover:bg-violet-700 transition-colors">
            Get in Touch <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>
    </div>
  );
}
