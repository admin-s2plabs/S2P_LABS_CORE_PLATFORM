import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import CheckboxIcon1 from "../../assets/images/checkbox-1.svg";
import CheckboxIcon2 from "../../assets/images/checkbox-2.svg";
import DetailContainerBody from "../../assets/images/detail-container-bg.png";
import ImplementationInsights from "../../assets/images/implementation-insights-bg-4.png";
import ResultsImpacts1 from "../../assets/images/result-impacts-4-1.png";
import ResultsImpacts2 from "../../assets/images/result-impacts-4-2.png";
import SuccessStoryImage from "../../assets/images/success-story-4-lg.png";

const challenges = [
    "Disconnected systems: Data duplication, inconsistent reporting, and lack of oversight at the group level leading to duplicate efforts and delayed approvals.",
    "Manual supplier onboarding: Time-consuming and inconsistent onboarding processes led to delays in vendor participation and compliance checks.",
    "Invoice bottlenecks: Invoices were manually tracked, increasing the risk of errors, delays, and compliance issues.",
    "Integration: Manual invoice entry with respective approved invoices to Oracle EBS, Vendor mismatches with supplier data from Oracle EBS.",
    "Audit trail enablement: There was no unified audit trail for supplier approvals, PO generation, or invoice processing causing challenges during internal and external audits.",
    "Inefficient PO management: Manual PO creation and tracking resulted in missed deadlines, over-ordering, and poor budget adherence.",
    "Limited spend visibility: Absence of consolidated procurement reporting across geographies restricted spend analysis, savings identification, and vendor performance tracking.",
    "High compliance risk: Lack of documentation and traceability in the procurement lifecycle created exposure to regulatory and internal audit risks.",
];

const solutionsList = [
    {
        id: 1,
        heading: "Multi-Region enabled platform",
        content:
            "S2P Labs was deployed with regional configurations for Europe, the Middle East, and Africa, enabling localized workflows while providing global reporting to headquarters supervisors for configurations.",
    },
    {
        id: 2,
        heading: "Oracle DB Integration",
        content:
            "A seamless integration was developed to pull purchase order data directly from the client's Oracle database. This ensured real-time sync and avoided duplication or mismatches in procurement records.",
    },
    {
        id: 3,
        heading: "Supplier onboarding automation",
        content:
            "The supplier registration process was digitized and made self-service friendly. Approval workflows were configured to ensure quicker verification and compliance without compromising internal governance.",
    },
    {
        id: 4,
        heading: "Invoicing push and pull",
        content:
            "A two-way integration was enabled to automatically pull invoice data into the platform and push approved invoices back to the financial system. This allowed real-time tracking of invoice status and reduced turnaround time for payments.",
    },
    {
        id: 5,
        heading: "End-to-End Integration",
        content:
            "Invoices submitted by suppliers via S2P Labs were automatically pushed back to Oracle EBS post-approval for financial processing. Supplier master data was synced from Oracle EBS to S2P Labs, ensuring consistency in vendor information across platforms.",
    },
    {
        id: 6,
        heading: "Audit trail enablement",
        content:
            "Audit logs were embedded in both UI and backend, capturing every step of the process approvals, edits, submissions enabling transparent verification for compliance teams.",
    },
    {
        id: 7,
        heading: "PO tracking automation",
        content:
            "Each PO was tagged with automated status updates, budget allocations, and expected delivery timelines, improving tracking and reducing manual follow-up efforts.",
    },
    {
        id: 8,
        heading: "Role-based dashboards",
        content:
            "Designed real-time dashboards segmented by country, business unit, and user role to deliver actionable procurement insights to stakeholders.",
    },
    {
        id: 9,
        heading: "System adoption enablement",
        content:
            "Simplified UI and training modules were developed to improve adoption among regional teams, reducing resistance and promoting process adherence.",
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
                        The S2P Labs platform was introduced to digitize and unify the end-to-end procurement process with the following key implementations.
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

export const SSProcurementDigitalTransformation = () => {
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
                            How S2P Labs Enabled Salable, Compliant, and Efficient Procurement through integrated digital transformation
                        </h1>
                    </div>
                </div>
            </div>

            <div className="lg:m-[60px] m-[20px]">
                <div className="mx-auto max-w-7xl px-4">
                    <div className="detail-container-body">
                        <div className="grid grid-cols-1 items-center md:grid-cols-2">
                            <div className="bg-[#005f9a] lg:p-[60px] p-[20px] text-white">
                                <p className="mb-0">
                                    S2P Labs S2P platform supported a large real estate and
                                    infrastructure firm in streamlining its procurement operations
                                    <br />
                                    <br />
                                    A leading real estate development firm, operating across multiple
                                    regions with a complex supplier ecosystem, was facing procurement
                                    challenges due to fragmented tools and limited visibility across
                                    its source-to-pay cycle.
                                    <br />
                                    <br />
                                    The organization needed a unified, transparent, and efficient
                                    solution to manage purchasing, supplier onboarding, and invoicing
                                    processes with minimal manual intervention.
                                </p>
                            </div>

                            <div>
                                <img
                                    src={DetailContainerBody}
                                    alt="detail-container-background"
                                    className="h-auto w-full"
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="max-w-6xl mx-auto bg-white pb-5 pt-3 md:pb-[70px] md:pt-[10px]">
                <div className="text-center mb-5">
                    <h3 className="text-[40px] font-semibold text-[#1c2045] leading-[1.4] tracking-[1.2px]">
                        Challenges
                    </h3>
                    <p className="mx-auto max-w-4xl text-gray-600 pb-10">
                        S2P Labs worked in conjunction with the organization's leadership team
                        and business stakeholders to pinpoint the following areas of concern
                        that require attention.
                    </p>
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
                    <div className="text-center">
                        <h2 className="mb-7 text-[40px] font-bold tracking-[1.2px] text-black leading-[1.4]">
                            Results &amp; Impact
                        </h2>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
                        <div className="md:col-span-4">
                            <img
                                src={ResultsImpacts1}
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
                                    A centralized dashboard enabled executives to monitor
                                    procurement KPIs across 10 countries, facilitating better
                                    planning and control.
                                </li>
                                <li className="my-10 relative pl-8">
                                    <img
                                        src={CheckboxIcon2}
                                        alt=""
                                        className="absolute left-0 top-1 h-5 w-5"
                                    />
                                    Reduced PO processing time by over 60% through direct Oracle
                                    sync.
                                </li>
                                <li className="my-10 relative pl-8">
                                    <img
                                        src={CheckboxIcon2}
                                        alt=""
                                        className="absolute left-0 top-1 h-5 w-5"
                                    />
                                    Supplier onboarding turnaround time dropped from several days
                                    to under 48 hours.
                                </li>
                                <li className="my-10 relative pl-8">
                                    <img
                                        src={CheckboxIcon2}
                                        alt=""
                                        className="absolute left-0 top-1 h-5 w-5"
                                    />
                                    Invoice lifecycle became fully traceable, minimizing payment
                                    delays and audit exceptions.
                                </li>
                                <li className="my-10 relative pl-8">
                                    <img
                                        src={CheckboxIcon2}
                                        alt=""
                                        className="absolute left-0 top-1 h-5 w-5"
                                    />
                                    With end-to-end audit logs in both UI and backend, audit
                                    exceptions dropped significantly, improving internal
                                    governance and external compliance alignment.
                                </li>
                            </ul>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
                        <div className="md:col-start-2 md:col-span-6">
                            <ul className="list-none p-0">
                                <li className="my-10 relative pl-8">
                                    <img
                                        src={CheckboxIcon2}
                                        alt=""
                                        className="absolute left-0 top-1 h-5 w-5"
                                    />
                                    A centralized dashboard enabled executives to monitor
                                    procurement KPIs across 10 countries, facilitating better
                                    planning and control.
                                </li>
                                <li className="my-10 relative pl-8">
                                    <img
                                        src={CheckboxIcon2}
                                        alt=""
                                        className="absolute left-0 top-1 h-5 w-5"
                                    />
                                    Reduced PO processing time by over 60% through direct Oracle
                                    sync.
                                </li>
                                <li className="my-10 relative pl-8">
                                    <img
                                        src={CheckboxIcon2}
                                        alt=""
                                        className="absolute left-0 top-1 h-5 w-5"
                                    />
                                    Supplier onboarding turnaround time dropped from several days
                                    to under 48 hours.
                                </li>
                                <li className="my-10 relative pl-8">
                                    <img
                                        src={CheckboxIcon2}
                                        alt=""
                                        className="absolute left-0 top-1 h-5 w-5"
                                    />
                                    Invoice lifecycle became fully traceable, minimizing payment
                                    delays and audit exceptions.
                                </li>
                                <li className="my-10 relative pl-8">
                                    <img
                                        src={CheckboxIcon2}
                                        alt=""
                                        className="absolute left-0 top-1 h-5 w-5"
                                    />
                                    With end-to-end audit logs in both UI and backend, audit
                                    exceptions dropped significantly, improving internal
                                    governance and external compliance alignment.
                                </li>
                            </ul>
                        </div>

                        <div className="md:col-span-4">
                            <img
                                src={ResultsImpacts2}
                                alt="results-impacts"
                                className="w-full h-auto"
                            />
                        </div>
                    </div>
                </div>
            </div>
        </>
    )
}