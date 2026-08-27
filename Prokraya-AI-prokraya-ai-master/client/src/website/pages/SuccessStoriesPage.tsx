import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowRight, Download, Loader2 } from "lucide-react";
import { useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "wouter";
import strategyBg from "../../assets/images/brochure-bg.png";
import successStory1 from "../../assets/images/success-story-1.png";
import successStory2 from "../../assets/images/success-story-2.png";
import successStory3 from "../../assets/images/success-story-3.png";
import successStory4 from "../../assets/images/success-story-4.png";
import successStory5 from "../../assets/images/success-story-5.jpg";
import Prokraya_Apparel_Industry_Case_Study from "../../assets/success-story-docs/Prokraya_Apparel_Industry_Case_Study.pdf";
import Prokraya_Brochure from "../../assets/success-story-docs/Prokraya_Brochure.pdf";
import Prokraya_Food_Industry_Case_Study from "../../assets/success-story-docs/Prokraya_Food_Industry_Case_Study.pdf";
import Prokraya_Infrastructure_Management_Case_Study from "../../assets/success-story-docs/Prokraya_Infrastructure_Management_Case_Study.pdf";
import Prokraya_Procurement_Invoice_Case_Study from "../../assets/success-story-docs/Prokraya_Procurement_Invoice_Case_Study.pdf";
import Prokraya_Real_Estate_Infrastructure_Case_Study from "../../assets/success-story-docs/Prokraya_Real_Estate_Infrastructure_Case_Study.pdf";
import { LogoBlack } from "../components/LogoImport";

interface SuccessStory {
  text: React.ReactNode;
  img: string;
  url: string;
  downloadedCS?: string;
}

export function SuccessStoriesPage() {
  const { toast } = useToast();
  const successStoriesItems: SuccessStory[] = [
    {
      downloadedCS: "Hassad",
      img: successStory1,
      url: "/ss-faster-s2p-cycle",
      text: (
        <>
          Food industry leader{" "}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-600 to-violet-400 font-bold">automates procurement</span> with{" "}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-600 to-teal-500 font-bold">3x faster</span> Request to Payment cycle.
        </>
      ),
    },
    {
      downloadedCS: "Dafza",
      img: successStory2,
      url: "/ss-procurement-collaboration",
      text: (
        <>
          Enabling{" "}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-600 to-violet-400 font-bold">88% increase in collaboration</span>{" "}
          between supplier and the organization
        </>
      ),
    },
    {
      downloadedCS: "UCB",
      img: successStory3,
      url: "/ss-procurement-savings",
      text: (
        <>
          Achieving over <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-600 to-violet-400 font-bold">5% savings</span> for a
          global apparel manufacturer by{" "}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-600 to-teal-500 font-bold">optimizing procurement</span> processes
        </>
      ),
    },
    {
      downloadedCS: "EagleHills",
      img: successStory4,
      url: "/ss-procurement-digital-transformation",
      text: (
        <>
          How Prokraya <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-600 to-violet-400 font-bold">enabled</span> scalable,
          compliant, and <span className="text-transparent bg-clip-text bg-gradient-to-r from-teal-500 to-teal-400 font-bold">efficient</span> procurement
          through integrated{" "}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-600 to-teal-500 font-bold">digital transformation</span>
        </>
      ),
    },
    {
      downloadedCS: "intellismart",
      img: successStory5,
      url: "/ss-proc-invoice",
      text: (
        <>
          Transforming{" "}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-600 to-violet-400 font-bold">
            procurement & vendor invoice management
          </span>{" "}
          through automation
        </>
      ),
    },
  ];

  const metrics = [
    { value: "500+", label: "Organizations" },
    { value: "₹2.5B+", label: "Spend Managed" },
    { value: "70%", label: "Average Time Savings" },
    { value: "15%", label: "Average Cost Reduction" },
  ];

  const [formData, setFormData] = useState({
    name: "",
    email: "",
  });
  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const [currentSuccessStory, setCurrentSuccessStory] = useState<SuccessStory | "brochure" | null>(null);
  const [scrollPosition, setScrollPosition] = useState(0);

  const { data: ipAddress = "" } = useQuery({
    queryKey: ["geo-info"],
    queryFn: async () => {
      const response = await fetch("https://ipapi.co/json/");
      const data = await response.json();
      return data.ip;
    },
  });

  const toggleDownloadModal = () => {
    if (!showDownloadModal) {
      setScrollPosition(window.scrollY);
    } else {
      setTimeout(() => {
        window.scrollTo(0, scrollPosition);
      }, 100);
    }
    setShowDownloadModal(!showDownloadModal);
    setFormData({
      ...formData,
      name: "",
      email: "",
    });
  };

  const downloadSuccessStory = (e: any, successStoryItem: SuccessStory | "brochure") => {
    toggleDownloadModal();
    setCurrentSuccessStory(successStoryItem);
  };

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const validateEmail = (email: string) => {
    const re =
      /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
    return re.test(email);
  };

  const getFileName = (downloadedCS?: string) => {
    if (downloadedCS === "Hassad") {
      return {
        name: "Prokraya_Food_Industry_Case_Study",
        file: Prokraya_Food_Industry_Case_Study
      };
    } else if (downloadedCS === "Dafza") {
      return {
        name: "Prokraya_Infrastructure_Management_Case_Study",
        file: Prokraya_Infrastructure_Management_Case_Study
      };
    } else if (downloadedCS === "UCB") {
      return {
        name: "Prokraya_Apparel_Industry_Case_Study",
        file: Prokraya_Apparel_Industry_Case_Study
      };
    } else if (downloadedCS === "EagleHills") {
      return {
        name: "Prokraya_Real_Estate_Infrastructure_Case_Study",
        file: Prokraya_Real_Estate_Infrastructure_Case_Study
      };
    } else if (downloadedCS === "intellismart") {
      return {
        name: "Prokraya_Procurement_Invoice_Case_Study",
        file: Prokraya_Procurement_Invoice_Case_Study
      };
    }
  };

  const submitBrochure = async () => {
    if (formData.name === "" || formData.name.trim() === "") {
      toast({ title: "Validation Error", description: "Please enter your name.", variant: "destructive" });
      return;
    }
    if (!validateEmail(formData.email)) {
      toast({ title: "Validation Error", description: "Please enter a valid email address.", variant: "destructive" });
      return;
    }
    submitBrochureHandler.mutate();
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

  const makeRightChoiceMutation = useMutation({
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

  const submitBrochureHandler = useMutation({
    mutationFn: async () => {
      const sheetData = {
        sheetName:
          currentSuccessStory === "brochure" ? "Brochure" : "Case studies",
        name: formData.name,
        email: formData.email,
        ipAddress: ipAddress,
        ...(currentSuccessStory !== "brochure" &&
          currentSuccessStory?.downloadedCS && {
          downloadedCS: currentSuccessStory.downloadedCS,
        }),
      };
      const result = await googleSheetMutation.mutateAsync(sheetData);
      if (result !== "Success") {
        throw new Error("Failed to submit request");
      }
      const payload = {
        contactName: formData.name,
        email: formData.email,
      };
      const response = await makeRightChoiceMutation.mutateAsync(payload);
      if (
        !response.success
      ) {
        throw new Error("Failed to submit request");
      }
      return response;
    },
    onSuccess: (data) => {
      const link = document.createElement("a");
      const file =
        currentSuccessStory === "brochure"
          ? {
            name: "Prokraya_Brochure.pdf",
            file: Prokraya_Brochure,
          }
          : getFileName(currentSuccessStory?.downloadedCS);
      if (!file) return;
      if (file) {
        link.href = file.file;
        link.download = file.name;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
      setFormData({
        ...formData,
        name: "",
        email: "",
      });
      toggleDownloadModal();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: "Error processing your request!", variant: "destructive" });
      toggleDownloadModal();
    },
  });

  return (
    <>
      <Helmet>
        <script
          async
          src="https://www.googletagmanager.com/gtag/js?id=G-KDV6R2SDN2"
        ></script>
        <meta property="og:title" content="Procurement Success Stories | Prokraya" />
        <meta property="og:description" content="See how organizations improve procurement efficiency, reduce costs, and achieve measurable results with Prokraya." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://prokraya.ai/success-stories" />
        <meta property="og:site_name" content="Prokraya" />
        <meta property="og:image" content={LogoBlack} />
        <meta name="twitter:card" content={LogoBlack} />
        <meta name="twitter:site" content="@prokraya" />
        <title>Procurement Success Stories & Case Studies | Prokraya</title>
        <meta name="description" content="Explore procurement success stories and customer case studies. Learn how organizations reduce costs, improve efficiency, automate workflows, and transform procurement with Prokraya." />
        <meta name="keywords" content="procurement case studies, procurement success stories, procurement transformation, procurement automation ROI, digital procurement transformation, source to pay case study, procurement savings" />
      </Helmet>

      <div className="flex flex-col">
        {/* Hero */}
        <section className="relative bg-gradient-to-b from-violet-50 via-white to-white -mt-16 pt-16 pb-16 overflow-hidden">
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#7c3aed08_1px,transparent_1px),linear-gradient(to_bottom,#7c3aed08_1px,transparent_1px)] bg-[size:5rem_5rem]" />
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 pt-20 text-center">
            <span className="inline-block px-3 py-1 text-xs font-semibold text-violet-700 bg-violet-50 rounded-full mb-5 uppercase tracking-wider">Success Stories</span>
            <h1 className="text-4xl lg:text-5xl font-extrabold text-gray-900 leading-tight mb-5">
              Customer{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-600 to-teal-500">Success Stories</span>
            </h1>
            <p className="text-lg text-gray-500 max-w-2xl mx-auto">
              See how leading organizations are transforming procurement with Prokraya's AI-powered platform
            </p>
          </div>
        </section>

        {/* Metrics */}
        <section className="py-10 bg-gradient-to-r from-violet-600 via-purple-600 to-teal-500">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 text-center text-white">
              {metrics.map((metric, index) => (
                <div key={index}>
                  <div className="text-4xl font-extrabold mb-1">{metric.value}</div>
                  <div className="text-white/80 text-sm">{metric.label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {successStoriesItems.map((successStory, index) => (
          <div
            key={index}
            className="relative flex items-center py-5 lg:py-16 bg-[url('src/assets/images/product-bg-slide.jpg')] bg-cover bg-center"
          >
            <div className="container mx-auto px-4 lg:px-0">
              <div className="grid items-center gap-8 md:grid-cols-12">
                <div
                  className={`md:col-span-7 ${index % 2 === 0 ? "md:order-1" : "md:order-2"
                    }`}
                >
                  <div className="lg:ml-[70px] mb-8 md:mb-0">
                    <h1 className="mb-7 text-3xl font-semibold leading-[1.4] tracking-wide text-black lg:text-[40px]">
                      {successStory.text}
                    </h1>

                    <div className="flex flex-col sm:flex-row gap-3">
                      <Link
                        to={successStory.url}
                        className="inline-flex items-center justify-center gap-2 px-6 py-2.5 bg-violet-600 text-white text-sm font-semibold rounded-lg hover:bg-violet-700 transition-colors shadow-md shadow-violet-200"
                      >
                        Read More
                        <ArrowRight className="w-4 h-4" />
                      </Link>
                      <Button
                        className="inline-flex items-center justify-center gap-2 px-6 py-2.5 bg-white border border-violet-200 text-violet-700 text-sm font-semibold rounded-lg hover:bg-violet-50 transition-colors"
                        onClick={(e) => downloadSuccessStory(e, successStory)}
                      >
                        Download
                        <Download className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
                <div
                  className={`md:col-span-5 ${index % 2 === 0 ? "md:order-2" : "md:order-1"
                    }`}
                >
                  <img
                    src={successStory.img}
                    alt={successStory.url}
                    className={`w-full rounded-[14px] max-w-[430px] ${index % 2 === 0 ? "" : "ml-auto"
                      }`}
                  />
                </div>
              </div>
            </div>
          </div>
        ))}

        <div className="bg-gray-100 pb-0 md:pb-0">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col items-center py-12 md:flex-row md:py-16">
              <div className="w-full md:w-1/2">
                <h2 className="text-3xl font-bold leading-tight text-gray-900 md:text-5xl">
                  From <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-600 to-violet-400 font-bold">strategy to execution</span>, we
                  simplify <span className="text-transparent bg-clip-text bg-gradient-to-r from-teal-500 to-teal-400 font-bold">procurement</span> for
                  lasting <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-600 to-teal-500 font-bold">impact</span>.
                </h2>

                <p className="mt-6 mb-8 text-base leading-7 text-gray-600">
                  At Prokraya, we help businesses source smarter and grow faster. Learn
                  how Prokraya delivers smart, efficient procurement solutions that
                  drive results. Get the full story in our brochure.
                </p>

                <Button
                  className="px-5 py-2 bg-violet-600 text-white text-sm font-semibold rounded-lg hover:bg-violet-700 transition-colors shadow-sm"
                  onClick={(e) => downloadSuccessStory(e, "brochure")}
                >
                  Download Brochure
                  <Download className="w-4 h-4" />
                </Button>
              </div>
              <div className="mt-10 flex w-full justify-center md:mt-0 md:w-1/2">
                <img
                  src={strategyBg}
                  alt="strategy-bg"
                  className="h-auto max-w-full"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Stories */}
        {/* <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="space-y-10">
            {stories.map((story, index) => (
              <article key={index} className="bg-gray-50 border border-gray-100 rounded-2xl overflow-hidden">
                <div className="grid lg:grid-cols-5 gap-0">
                  <div className="lg:col-span-2 p-8 bg-white border-r border-gray-100">
                    <div className="text-5xl mb-4">{story.logo}</div>
                    <h2 className="text-xl font-bold text-gray-900 mb-1">{story.company}</h2>
                    <div className="flex items-center gap-2 text-gray-500 text-sm mb-6">
                      <Building2 className="w-3.5 h-3.5" />
                      <span>{story.industry}</span>
                    </div>
                    <div className="bg-gray-50 rounded-xl p-5">
                      <Quote className="w-6 h-6 text-violet-400 mb-3" />
                      <p className="text-sm text-gray-600 italic mb-4">"{story.quote}"</p>
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-gradient-to-br from-violet-600 to-teal-500 rounded-full flex items-center justify-center text-white text-xs font-bold">
                          {story.person.split(" ")[0][0]}{story.person.split(" ")[1][0]}
                        </div>
                        <div>
                          <p className="font-semibold text-gray-900 text-sm">{story.person}</p>
                          <p className="text-xs text-gray-500">{story.title}</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="lg:col-span-3 p-8 space-y-6">
                    {[
                      { label: "Challenge", content: story.challenge, color: "bg-red-50 text-red-700 border-red-100", dot: "bg-red-500" },
                      { label: "Solution", content: story.solution, color: "bg-blue-50 text-blue-700 border-blue-100", dot: "bg-blue-500" },
                    ].map((item, i) => (
                      <div key={i}>
                        <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold border ${item.color} mb-2`}>{item.label}</span>
                        <p className="text-sm text-gray-600">{item.content}</p>
                      </div>
                    ))}
                    <div>
                      <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold bg-teal-50 text-teal-700 border border-teal-100 mb-3">Results</span>
                      <div className="grid md:grid-cols-2 gap-2">
                        {story.results.map((result, i) => (
                          <div key={i} className="flex items-start gap-2 bg-white border border-gray-100 rounded-lg p-3">
                            <TrendingUp className="w-4 h-4 text-teal-500 flex-shrink-0 mt-0.5" />
                            <span className="text-xs text-gray-700">{result}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section> */}

        {/* Industries */}
        {/* <section className="py-16 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Trusted Across Industries</h2>
            <p className="text-gray-500">Organizations of all sizes rely on Prokraya</p>
          </div>
          <div className="grid md:grid-cols-3 lg:grid-cols-6 gap-4">
            {[
              { icon: "🏭", name: "Manufacturing" },
              { icon: "💻", name: "Technology" },
              { icon: "🏥", name: "Healthcare" },
              { icon: "🏢", name: "Real Estate" },
              { icon: "🏦", name: "Financial Services" },
              { icon: "🛍️", name: "Retail" },
            ].map((industry, index) => (
              <div key={index} className="bg-white border border-gray-100 rounded-xl p-5 text-center hover:shadow-md transition-all">
                <div className="text-3xl mb-2">{industry.icon}</div>
                <div className="text-sm font-medium text-gray-700">{industry.name}</div>
              </div>
            ))}
          </div>
        </div>
      </section> */}

        {/* CTA */}
        <section className="py-20 bg-gradient-to-br from-slate-900 via-violet-950 to-slate-900 text-white">
          <div className="max-w-2xl mx-auto px-4 text-center">
            <h2 className="text-3xl font-bold mb-3">Ready to Write Your Success Story?</h2>
            <p className="text-gray-400 mb-8">Join hundreds of organizations transforming their procurement</p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link href="/book-demo" className="inline-flex items-center justify-center gap-2 px-7 py-3 bg-violet-600 text-white font-semibold rounded-lg hover:bg-violet-700 transition-colors">
                Book a Demo <ArrowRight className="w-4 h-4" />
              </Link>
              <Link href="/contact-us" className="inline-flex items-center justify-center px-7 py-3 border border-white/20 text-white font-semibold rounded-lg hover:bg-white/10 transition-colors">
                Contact Sales
              </Link>
            </div>
          </div>
        </section>

        <Sheet open={showDownloadModal} onOpenChange={toggleDownloadModal}>
          <SheetContent
            side="right"
            className="left-1/2 top-1/2 right-auto h-[80vh] max-h-[64vh] w-[700px] max-w-[90vw] sm:max-w-[700px] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg"
          >
            <SheetHeader className="mb-6">
              <SheetTitle>
                Get our{" "}
                {currentSuccessStory === "brochure"
                  ? "brochure"
                  : "success story"}
              </SheetTitle>
              <SheetDescription>
                {currentSuccessStory === "brochure"
                  ? "At Prokraya, we help businesses source smarter & grow with procurement solutions. Discover more in our brochure."
                  : currentSuccessStory?.text}
              </SheetDescription>
            </SheetHeader>

            <div className="grid gap-6 md:grid-cols-12 items-center">
              {/* Image */}
              <div className="md:col-span-5">
                <img
                  className="w-full rounded-lg h-[250px]"
                  src={
                    currentSuccessStory === "brochure"
                      ? strategyBg
                      : currentSuccessStory?.img
                  }
                  alt={
                    currentSuccessStory === "brochure"
                      ? "brochure-bg"
                      : currentSuccessStory?.url
                  }
                />
              </div>

              {/* Form */}
              <div className="md:col-span-7 space-y-4">
                <div>
                  <Input
                    type="text"
                    placeholder="Name"
                    value={formData?.name}
                    name="name"
                    onChange={(event) =>
                      handleInputChange(event)
                    }
                    disabled={submitBrochureHandler.isPending}
                  />
                </div>

                <div>
                  <Input
                    type="email"
                    placeholder="Email ID"
                    name="email"
                    value={formData?.email}
                    onChange={(event) =>
                      handleInputChange(event)
                    }
                    disabled={submitBrochureHandler.isPending}
                  />
                </div>

                <Button
                  onClick={submitBrochure}
                  disabled={submitBrochureHandler.isPending}
                  className="w-full"
                >
                  {submitBrochureHandler.isPending && (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  )}
                  Submit
                </Button>
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
}
