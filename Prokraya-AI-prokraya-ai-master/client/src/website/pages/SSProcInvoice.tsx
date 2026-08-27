import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import CheckboxIcon1 from "../../assets/images/checkbox-1.svg";
import CheckboxIcon2 from "../../assets/images/checkbox-2.svg";
import ImplementationInsights from "../../assets/images/implementation-insights-bg-3.png";
import ProductBg from "../../assets/images/product-bg.png";
import ResultsImpacts from "../../assets/images/result-impacts-3.png";
import SuccessStoryImage from "../../assets/images/success-story-5.jpg";

const challenges = [
    "Prolonged supplier onboarding cycles due to multiple manual approval layers",
    "Heavy dependency on emails, leading to missed communications and repeated follow-ups",
    "Limited real-time visibility into invoice status and approval progress for both internal teams and vendors",
    "Lack of structured audit trails, making compliance tracking and audits time-consuming",
    "Manual invoice validation causing slow, unpredictable turnaround times (TAT)",
]

const solutionsList = [
    {
        id: 1,
        heading: "Automated Vendor & Approval Workflows",
        content:
            "A centralized platform was implemented to automate vendor onboarding and verification through structured document uploads, rule-based validations, and API-driven checks for GST, PAN, MSME, and bank account details. Separate approval workflows for goods (GRN-based) and services (SES-based) ensured faster, accurate validations aligned with distinct business processes.",
    },
    {
        id: 2,
        heading: "Intelligent Invoice Processing & ERP Integration",
        content:
            "OCR-enabled automation digitized invoice submission and validation across PO, GRN, SES, and non-PO invoices, significantly reducing manual effort and errors. Seamless, real-time integration with SAP synchronized purchase orders, GRN/SES data, MIRO postings, and payment status, ensuring end-to-end ERP-aligned processing.",
    },
    {
        id: 3,
        heading: "Phased Deployment & Performance Visibility",
        content:
            "The solution was rolled out in structured phases over 8–10 weeks to ensure smooth adoption across teams and vendors. Real-time TAT dashboards, alerts, and automated escalations improved SLA adherence, reduced processing delays, and delivered complete visibility into the procure-to-pay lifecycle.",
    },
];

const ScrollContentSwitcher = ({ sections }: { sections: any }) => {
    const [activeIndex, setActiveIndex] = useState(0);
    const sectionRefs = useRef<(HTMLDivElement | null)[]>([]);
    const [responsive, setResponsive] = useState(false);

    useEffect(() => {
        const handleResize = () => {
            setResponsive(window.innerWidth < 1024);
        };
        handleResize();
        window.addEventListener("resize", handleResize);
        if (window.innerWidth >= 1024) {
            const handleScroll = () => {
                const triggerLine = window.innerHeight / 2;
                sectionRefs.current?.forEach((section, index) => {
                    if (!section) return;
                    const rect = section?.getBoundingClientRect();
                    if (
                        rect.top <= triggerLine &&
                        rect.bottom >= triggerLine &&
                        index !== activeIndex
                    ) {
                        setTimeout(() => {
                            setActiveIndex(index);
                        }, 200);
                    }
                });
            };
            window.addEventListener("scroll", handleScroll, {
                passive: true,
            });
            return () => {
                window.removeEventListener("scroll", handleScroll);
                window.removeEventListener("resize", handleResize);
            };
        }
        return () => {
            window.removeEventListener("resize", handleResize);
        };
    }, [activeIndex]);

    return (
        <div className="w-full">
            <div className="bg-[#E6EDF7] text-center sticky-header">
                <div className="mx-auto max-w-7xl px-4 py-6 text-center">
                    <h2 className="text-4xl font-semibold mb-0 effective-collaboration-heading mb-5">
                        Our approach
                    </h2>
                    <p className="mb-0 font-bold">
                        We adopted an automation-first approach by implementing a centralized procurement and vendor management platform. Manual, email-based processes were replaced with structured workflows, OCR-driven invoice processing, and real-time ERP and compliance integrations, ensuring faster turnaround times, better visibility, and stronger control across the procure-to-pay cycle.
                    </p>
                </div>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2">
                {responsive ? (
                    <>
                        <div className="lg:sticky lg:top-0">
                            <img
                                src={ImplementationInsights}
                                alt="procurement-digital-transformation"
                                className="h-auto w-full"
                            />
                        </div>

                        {sections.map((section: any) => (
                            <div
                                key={`responsive-${section.id}`}
                                className="px-4 lg:px-6"
                            >
                                <h3 className="my-5 text-2xl font-semibold">
                                    {section.heading}
                                </h3>
                                <p className="mt-5">{section.content}</p>
                            </div>
                        ))}
                    </>
                ) : (
                    <>
                        <div className="relative">
                            <div
                                className="sticky top-[64px] h-[calc(100vh-64px)] w-full bg-center bg-no-repeat bg-cover"
                                style={{
                                    backgroundImage: `url(${ImplementationInsights})`,
                                }}
                            />
                        </div>
                        <div className="bg-[#f8f9fa] p-12">
                            {sections.map((section: any, idx: number) => (
                                <div
                                    key={section.id}
                                    ref={(el) => (sectionRefs.current[idx] = el)}
                                    className="min-h-[70vh]"
                                >
                                    <h3 className="relative mb-8 text-3xl font-semibold text-[#1c2045] after:absolute after:left-0 after:-bottom-5 after:h-[2px] after:w-[84px] after:bg-[#368bfc]">
                                        {section.heading}
                                    </h3>
                                    <p className="mt-5 text-base text-gray-700">
                                        {section.content}
                                    </p>
                                </div>
                            ))}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export const SSProcInvoice = () => {
    const [, navigate] = useLocation();

    const backToSuccessStories = () => {
        navigate("/success-stories");
    };

    return (
        <>
            <div className="relative">
                <div
                    className="relative h-[500px] w-full bg-cover bg-center bg-no-repeat"
                    style={{ backgroundImage: `url(${SuccessStoryImage})` }}
                >
                    <div className="absolute inset-0 bg-[linear-gradient(90deg,#000000_24.72%,rgba(248,249,250,0.1)_100%)]" />
                    <div className="relative z-10 top-4 left-2 md:top-[30px] md:left-[60px] w-[44px] md:w-[50px]">
                        <Button
                            className="inline-flex items-center justify-center gap-2 bg-white border border-violet-200 text-violet-700 text-sm font-semibold hover:bg-violet-50 transition-colors"
                            type="button"
                            onClick={backToSuccessStories}
                        >
                            <ArrowLeft />
                        </Button>
                    </div>
                    <div className="left-[20px] md:left-[60px] absolute top-[45%] -translate-y-[42%] z-10 max-w-[90%] md:max-w-[60%] px-4 md:px-0">
                        <h1 className="relative text-4xl lg:text-5xl font-extrabold text-gray-900 text-white tracking-[1.2px] mb-0 drop-shadow-md">
                            Transforming procurement & vendor invoice management through
                            automation
                        </h1>
                    </div>
                </div>
            </div>

            <div className="relative py-[30px] md:py-14">
                <div
                    className="absolute inset-0 bg-cover bg-left bg-no-repeat"
                    style={{
                        backgroundImage: `url(${ProductBg})`,
                    }}
                />
                <div className="relative z-10 mx-auto max-w-7xl px-4">
                    <div className="grid grid-cols-1 items-center gap-8 md:grid-cols-12">
                        <div className="md:col-span-4">
                            <h3 className="text-center text-[32px] font-light text-[#021028]">
                                Background
                            </h3>
                        </div>
                        <div className="md:col-span-7">
                            <p className="mb-0 text-base text-black">
                                A leading smart infrastructure organization managing large-scale
                                procurement operations faced increasing complexity in supplier
                                onboarding, invoice validation, and payment processing. With a
                                vendor base of 1,500-1,800 suppliers across materials and
                                services, the organization relied heavily on manual,
                                email-driven workflows that lacked transparency, traceability,
                                and control. Frequent requirement changes, fragmented
                                communication, and compliance challenges highlighted the need
                                for a modern, scalable procurement automation platform.
                            </p>
                        </div>
                    </div>
                </div>
            </div>

<div className="max-w-6xl mx-auto bg-white py-5 md:py-[70px]">
                <div className="text-center mb-5">
                    <h3 className="text-[40px] font-semibold text-[#1c2045] leading-[1.4] tracking-[1.2px]">
                        Challenges
                    </h3>
                </div>
                <ul className="list-none grid grid-cols-1 md:grid-cols-3 gap-6">
                    {challenges.map((item, index) => (
                        <li className="relative pl-8 text-[#111121]" key={index}>
                            <span className="absolute left-0 top-1">
                                <img className="h-4 w-4" src={CheckboxIcon1} alt="" />
                            </span>
                            {item}
                        </li>
                    ))}
                </ul>
            </div>

            <ScrollContentSwitcher sections={solutionsList} />

            <div className="py-5 md:py-[70px]">
                <div className="container-fluid md:px-0">
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
                        <div className="md:col-span-4">
                            <img
                                src={ResultsImpacts}
                                alt="results-impacts"
                                className="w-full h-auto"
                            />
                        </div>

                        <div className="md:col-span-7">
                            <ul className="list-none p-0">
                                <li className="my-10 relative pl-8">
                                    <img
                                        src={CheckboxIcon2}
                                        alt=""
                                        className="absolute left-0 top-1 h-5 w-5"
                                    />
                                    Significantly faster vendor onboarding through automated validations
                                </li>
                                <li className="my-10 relative pl-8">
                                    <img
                                        src={CheckboxIcon2}
                                        alt=""
                                        className="absolute left-0 top-1 h-5 w-5"
                                    />
                                    Reduced invoice processing time (TAT) with structured OCR
                                </li>
                                <li className="my-10 relative pl-8">
                                    <img
                                        src={CheckboxIcon2}
                                        alt=""
                                        className="absolute left-0 top-1 h-5 w-5"
                                    />
                                    Complete real-time visibility into vendor and invoice status
                                </li>
                                <li className="my-10 relative pl-8">
                                    <img
                                        src={CheckboxIcon2}
                                        alt=""
                                        className="absolute left-0 top-1 h-5 w-5"
                                    />
                                    Improved audit readiness with digital trails and compliance logs
                                </li>
                                <li className="my-10 relative pl-8">
                                    <img
                                        src={CheckboxIcon2}
                                        alt=""
                                        className="absolute left-0 top-1 h-5 w-5"
                                    />
                                    Lower manual workload and error rates
                                </li>
                                <li className="my-10 relative pl-8">
                                    <img
                                        src={CheckboxIcon2}
                                        alt=""
                                        className="absolute left-0 top-1 h-5 w-5"
                                    />
                                    Enhanced vendor experience through transparency and faster responses
                                </li>
                            </ul>
                        </div>
                    </div>
                </div>
            </div>
        </>
    )
}