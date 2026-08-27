import { toast } from "@/hooks/use-toast";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import { useState } from "react";

export function CommonShortForm({ reactedPage }: { reactedPage: string }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  const { data: ipAddress = "" } = useQuery({
    queryKey: ["geo-info"],
    queryFn: async () => {
      const response = await fetch("https://ipapi.co/json/");
      const data = await response.json();
      return data.ip;
    },
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
      const res = await fetch("/api/makeRightChoice", {
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

  const shortFormUpdate = useMutation({
    mutationFn: async () => {
      if (!name.trim()) {
        throw new Error("Name is required");
      }
      if (!validateEmail(email)) {
        throw new Error("Valid email is required");
      }
      const sheetData = {
        sheetName: "Contact us",
        name: name,
        email: email,
        reactedPage: reactedPage,
        ipAddress: ipAddress,
      };
      const sheetResponse =
        await googleSheetMutation.mutateAsync(sheetData);
      if (sheetResponse !== "Success") {
        throw new Error("Failed to submit to Google Sheet");
      }
      const payload = {
        contactName: name,
        email: email,
      };
      const response =
        await contactUsMutation.mutateAsync(payload);
      if (
        !response.success
      ) {
        throw new Error("Failed to submit request");
      }
      return response;
    },
    onSuccess: () => {
      setName("");
      setEmail("");
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!shortFormUpdate.isPending) shortFormUpdate.mutate();
  }

  return (
    <section className="py-14 bg-violet-600">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <h2 className="text-2xl font-bold text-white mb-2">Simplifying Procurement Every Step of the Way</h2>
        <p className="text-violet-200 text-sm mb-8">For smarter decisions, faster savings. Contact us today.</p>

        <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3 justify-center">
          <input
            type="text"
            placeholder="Your Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="px-4 py-2.5 rounded-lg text-sm bg-white/10 border border-white/20 text-white placeholder-violet-200 focus:outline-none focus:ring-2 focus:ring-white/40 min-w-0 flex-1"
            disabled={shortFormUpdate.isPending}
          />
          <input
            type="email"
            placeholder="Work Email ID"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="px-4 py-2.5 rounded-lg text-sm bg-white/10 border border-white/20 text-white placeholder-violet-200 focus:outline-none focus:ring-2 focus:ring-white/40 min-w-0 flex-1"
            disabled={shortFormUpdate.isPending}
          />
          <button
            type="submit"
            className="inline-flex items-center justify-center gap-2 px-6 py-2.5 bg-white text-violet-700 text-sm font-semibold rounded-lg hover:bg-violet-50 transition-colors flex-shrink-0"
          >
            {shortFormUpdate.isPending
              ? "Submitting..."
              : "Contact Us"}
            {!shortFormUpdate.isPending && (
              <ArrowRight className="w-4 h-4" />
            )}
          </button>
        </form>
      </div>
    </section>
  );
}
