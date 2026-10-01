import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { Fragment, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import CheckboxIcon1 from "../../assets/images/checkbox-1.svg";
import CheckboxIcon2 from "../../assets/images/checkbox-2.svg";
import ImpactCreated from "../../assets/images/impact-created.png";
import ImplementationInsights from "../../assets/images/implementation-insights-bg-1.png";
import ProductBg from "../../assets/images/product-bg.png";
import ResultsImpacts from "../../assets/images/results-impacts-2.png";
import SuccessStoryImage from "../../assets/images/success-story-2-lg.png";

const challenges = [
    "Manual processing of supply, procurement, and all spending: A traditional, hands-on approach was used in managing various aspects of the supply chain, procurement procedures, and overall expenditure within an organization.",
    "Challenge to update and track supplier's data: Faced difficulties in maintaining accurate information amidst changes, dealing with the volume of data, and ensuring regular updates.",
    "Tracking all transactions data unavailable: This deficiency hampered the organization's ability to trace, analyze, and derive insights from the comprehensive details of its financial activities.",
    "All invoicing managed manually: Human efforts were involved in managing and processing invoices.",
    "All engagement between internal and external stakeholders manual: Human intervention was employed in managing.",
    "Manual work of procurement processes: The approach, reliant on human efforts, involves a significant investment of time.",
    "Meeting audit compliance for finance area of concern: The current process made it difficult for the organization to meet audit requirements as the data was scattered.",
    "Analytical data on spend a major challenge: Effectively obtaining analytical data on expenditure posed a substantial challenge.",
    "Lack of interface with ERP.",
];

const solutionsList = [
    {
        id: 1,
        content:
            "Automation enabled 88% increase in greater collaboration between suppliers and employees enhancing, and enriching digital experience. Seamless flow of data between Oracle and S2P Labs.",
    },
    {
        id: 2,
        content:
            "There was a significant 85% increase in visibility for spend analysis and management. This improvement indicates an enhanced ability to monitor and understand expenditure patterns, contributing to more informed and strategic financial decision-making within the organization.",
    },
    {
        id: 3,
        content:
            "A notable enhancement of 79% in operational efficiency was observed among all stakeholders. This improvement signifies a substantial boost in effectiveness and productivity across various individuals or groups involved in the process.",
    },
    {
        id: 4,
        content:
            "Audit compliance eliminated errors, and increased agility. Adhering to audit standards ensured accuracy and contributed to improved adaptability and responsiveness within the operational framework.",
    },
    {
        id: 5,
        content:
            "Implemented 30+ custom Reports and Analytics to make informed decisions provided a diverse range of insightful information, empowering users to make well-informed decisions. This customization ensured a robust reporting system, facilitating data-driven decision-making across various aspects of the implemented solution.",
    },
    {
        id: 6,
        content:
            "The automation of the E-sourcing/contracts module resulted in a remarkable 91% reduction in the manual procurement process. The implementation of automated functionalities enhanced efficiency & minimized manual intervention.",
    },
];

const ScrollContentSwitcher = ({ sections }: { sections: any[] }) => {
    const [activeIndex, setActiveIndex] = useState<number>(0);
    const [responsive, setResponsive] = useState<boolean>(false);
    const sectionRefs = useRef<(HTMLDivElement | null)[]>([]);

    useEffect(() => {
        const handleResize = () => {
            setResponsive(window.innerWidth < 1024);
        };
        handleResize();
        const handleScroll = () => {
            if (window.innerWidth < 1024) return;
            const triggerLine = window.innerHeight / 2;
            sectionRefs.current.forEach((section, index) => {
                if (!section) return;
                const rect = section.getBoundingClientRect();

                if (rect.top <= triggerLine && rect.bottom >= triggerLine) {
                    if (index !== activeIndex) {
                        setTimeout(() => {
                            setActiveIndex(index);
                        }, 200);
                    }
                }
            });
        };
        window.addEventListener("resize", handleResize);
        window.addEventListener("scroll", handleScroll, { passive: true });
        return () => {
            window.removeEventListener("resize", handleResize);
            window.removeEventListener("scroll", handleScroll);
        };
    }, [activeIndex]);

    return (
        <div className="container mx-auto px-4 md:px-0">
            <div className="grid grid-cols-1 lg:grid-cols-12 lg:gap-8 lg:p-12">
                {responsive ? (
                    <>
                        <div className="lg:sticky lg:top-24">
                            <img
                                src={ImplementationInsights}
                                alt="procurement-digital-transformation"
                                className="w-full h-auto"
                            />
                        </div>

                        <div>
                            <h3 className="sticky top-0 border-b-0 pt-[30px] my-5 text-center">
                                Impact Created
                            </h3>
                            {sections.map((section) => (
                                <Fragment key={`responsive-${section.id}`}>
                                    <div>
                                        <p className="mt-10 text-base leading-7">
                                            {section.content}
                                        </p>
                                    </div>
                                </Fragment>
                            ))}
                        </div>
                    </>
                ) : (
                    <>
                        <div className="lg:col-span-7">
                            <h3 className="sticky top-8 my-10 text-center text-2xl font-semibold">
                                Impact Created
                            </h3>

                            {sections.map((section, idx) => (
                                <div
                                    key={section.id}
                                    ref={(el) => {
                                        sectionRefs.current[idx] = el;
                                    }}
                                    className="min-h-[70vh]"
                                >
                                    <p className="mt-10 text-center text-base leading-7">
                                        {section.content}
                                    </p>
                                </div>
                            ))}
                        </div>

                        <div className="lg:col-span-5 sticky top-24 self-start">
                            <img
                                src={ImpactCreated}
                                alt="impact-created"
                                className="w-full h-auto"
                            />
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export const SSProcurementCollaboration = () => {
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
                            Food industry leader automates procurement with 3x faster Request to
                            Payment cycle.
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
                                The customer is a large infrastructure management company in UAE
                                providing customized offices and warehouses for all businesses.
                                Home to more than 5,000 registered companies from across 20
                                industries, it is a major economic catalyst in the city's
                                development.
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            <div className="bg-[#e6edf7] py-14">
                <div className="container mx-auto px-4">
                    <div className="grid grid-cols-1 gap-6 text-center md:grid-cols-2 lg:grid-cols-4">
                        <div className="flex">
                            <div className="flex-1 rounded-lg bg-[#f5f6f8] p-6 shadow-sm">
                                <h3 className="mb-4 text-4xl font-bold">
                                    <span className="text-[#0f8cff]">85%</span>
                                </h3>
                                <p>Increase in visibility for spend analysis</p>
                            </div>
                        </div>

                        <div className="flex">
                            <div className="flex-1 rounded-lg bg-[#f5f6f8] p-6 shadow-sm">
                                <h3 className="mb-4 text-4xl font-bold">
                                    <span className="text-[#0f8cff]">91%</span>
                                </h3>
                                <p>Reduction in the manual procurement process</p>
                            </div>
                        </div>

                        <div className="flex">
                            <div className="flex-1 rounded-lg bg-[#f5f6f8] p-6 shadow-sm">
                                <h3 className="mb-4 text-4xl font-bold">
                                    <span className="text-[#0f8cff]">30+</span>
                                </h3>
                                <p>Custom Reports and Analytics</p>
                            </div>
                        </div>

                        <div className="flex">
                            <div className="flex-1 rounded-lg bg-[#f5f6f8] p-6 shadow-sm">
                                <h3 className="mb-4 text-4xl font-bold">
                                    <span className="text-[#0f8cff]">79%</span>
                                </h3>
                                <p>Enhancement in operational efficiency</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="max-w-6xl mx-auto bg-white py-5 md:py-[70px]">
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

            <div className="bg-gray-100 py-5 md:py-[70px]">
                <div className="max-w-6xl mx-auto">
                    <h2 className="text-[40px] font-semibold text-[#1c2045] leading-[1.4] tracking-[1.2px text-center mb-5">Solution Delivered</h2>
                    <p className="text-center text-[22px] text-[#3c4043]">
                        <span className="font-bold text-blue-600 pr-2">"</span>
                        This transformation demonstrates how a flexible, role-aware, and compliance-ready procurement platform can unlock operational agility. By moving away from manual processes and enabling digital collaboration between buyers and suppliers, the organization has built a more transparent, scalable, and efficient procurement foundation.
                        <span className="font-bold text-blue-600 pl-2">"</span>
                    </p>
                </div>
            </div>

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
                                    Reduced supplier onboarding time from weeks to hours, with greater control and traceability
                                </li>
                                <li className="my-10 relative pl-8">
                                    <img
                                        src={CheckboxIcon2}
                                        alt=""
                                        className="absolute left-0 top-1 h-5 w-5"
                                    />
                                    RFQ response and evaluation cycles shortened by 50% with automation
                                </li>
                                <li className="my-10 relative pl-8">
                                    <img
                                        src={CheckboxIcon2}
                                        alt=""
                                        className="absolute left-0 top-1 h-5 w-5"
                                    />
                                    Audit readiness improved significantly, with structured logs, document versioning, and history views
                                </li>
                                <li className="my-10 relative pl-8">
                                    <img
                                        src={CheckboxIcon2}
                                        alt=""
                                        className="absolute left-0 top-1 h-5 w-5"
                                    />
                                    Invoice processing delays dropped, allowing resubmissions, multiple attachments, and transparent status tracking
                                </li>
                                <li className="my-10 relative pl-8">
                                    <img
                                        src={CheckboxIcon2}
                                        alt=""
                                        className="absolute left-0 top-1 h-5 w-5"
                                    />
                                    User productivity increased due to intuitive workflows, role delegation, and automated notifications
                                </li>
                                <li className="my-10 relative pl-8">
                                    <img
                                        src={CheckboxIcon2}
                                        alt=""
                                        className="absolute left-0 top-1 h-5 w-5"
                                    />
                                    Procurement became data-driven, with ICV scoring and supplier insights influencing smarter decision-making
                                </li>
                            </ul>
                        </div>
                    </div>
                </div>
            </div>

            <ScrollContentSwitcher sections={solutionsList} />

            <div className="bg-gray-100 py-5 md:py-[70px]">
                <div className="max-w-6xl mx-auto">
                    <h2 className="text-[40px] font-semibold text-[#1c2045] leading-[1.4] tracking-[1.2px text-center mb-5">Conclusion</h2>
                    <p className="text-center text-[22px] text-[#3c4043]">
                        S2P Labs played a pivotal role in resolving the organization's challenges, introducing heightened transparency, visibility, and operational efficiency. This transformation resulted in improved decision-making and compliance adherence. The implementation of workflow automation strategically allocated employee time, redirecting their focus towards more strategic tasks. Consequently, overall efficiency increased.
                    </p>
                </div>
            </div>
        </>
    )
}