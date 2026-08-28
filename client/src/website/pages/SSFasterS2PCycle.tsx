import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { Fragment, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import CheckboxIcon1 from "../../assets/images/checkbox-1.svg";
import CheckboxIcon2 from "../../assets/images/checkbox-2.svg";
import ImplementationInsights from "../../assets/images/implementation-insights-bg-1.png";
import ProductBg from "../../assets/images/product-bg.png";
import ResultsImpacts from "../../assets/images/results-impacts-1.png";
import SuccessStoryImage from "../../assets/images/success-story-1-lg.png";

const ScrollContentSwitcher = ({ sections }: { sections: any[] }) => {
  const [activeIndex, setActiveIndex] = useState(0);
  const [responsive, setResponsive] = useState(false);
  const sectionRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const checkScreenSize = () => {
      setResponsive(window.innerWidth < 1024);
    };
    checkScreenSize();
    window.addEventListener("resize", checkScreenSize);
    return () => window.removeEventListener("resize", checkScreenSize);
  }, []);

  useEffect(() => {
    if (responsive) return;
    const handleScroll = () => {
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
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, [activeIndex, responsive]);

  return (
    <div className="w-full">
      <div className="grid grid-cols-1 lg:grid-cols-2">
        {responsive ? (
          <>
            <div className="mb-8">
              <img
                src={ImplementationInsights}
                alt="implementation-highlights"
                className="w-full h-auto"
              />
            </div>

            {sections.map((section) => (
              <Fragment key={`responsive-${section.id}`}>
                <div>
                  <h3 className="my-5 text-3xl font-semibold text-[#1c2045]">
                    {section.heading}
                  </h3>
                  <div>
                    <p className="mt-5 text-base text-gray-700">
                      {section.content}
                    </p>
                    {section.sublist?.length > 0 && (
                      <ul className="my-6 space-y-4">
                        {section.sublist.map((listItem: any) => (
                          <li
                            key={listItem.id}
                            className="relative pl-8 text-gray-700"
                          >
                            <span className="absolute left-0 top-1">
                              <img
                                src="/checkbox-2.svg"
                                alt=""
                                className="w-4 h-4"
                              />
                            </span>
                            {listItem.label}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </Fragment>
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
            <div className="bg-[#f8f9fa] lg:p-12">
              {sections.map((section, idx) => (
                <div
                  key={section.id}
                  ref={(el) => {
                    sectionRefs.current[idx] = el;
                  }}
                  className="min-h-[70vh]"
                >
                  <h3 className="relative mb-8 text-4xl font-semibold text-[#1c2045] after:absolute after:left-0 after:-bottom-5 after:h-[2px] after:w-[84px] after:bg-[#368bfc]">
                    {section.heading}
                  </h3>
                  <p className="mt-5 text-base text-gray-700">
                    {section.content}
                  </p>
                  {section.sublist?.length > 0 && (
                    <ul className="my-10 space-y-4">
                      {section.sublist.map((listItem: any) => (
                        <li
                          key={listItem.id}
                          className="relative pl-8 text-gray-700"
                        >
                          <span className="absolute left-0 top-1">
                            <img
                              src={CheckboxIcon2}
                              alt=""
                              className="h-5 w-5"
                            />
                          </span>
                          {listItem.label}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

const solutionsList = [
  {
    id: 1,
    heading: "Seamless supplier onboarding & management",
    sublist: [
      {
        id: "seamlessupplist1",
        label:
          "Introduced an intuitive onboarding process with validation prompts, draft saving, and version tracking",
      },
      {
        id: "seamlessupplist2",
        label:
          "Rolled out editable supplier data features (e.g., email updates by super admin) with complete audit visibility",
      },
    ],
  },
  {
    id: 2,
    heading: "Centralized bid management",
    sublist: [
      {
        id: "centralizedlist1",
        label:
          "Digitized RFQ and Tender flows, allowing bid creation, publication, evaluation, and awarding all from a single interface",
      },
      {
        id: "centralizedlist2",
        label:
          "Eliminated paper-based processes and enabled dynamic bid status tracking (e.g., Draft, Published, Closed, Awarded",
      },
      {
        id: "centralizedlist3",
        label:
          "Integrated features like bid extensions, proxy bidding, and auto-reminders for suppliers and buyers",
      },
      {
        id: "centralizedlist4",
        label:
          "Supported multi-award functionality and quote comparison tools, making evaluations efficient and compliant",
      },
    ],
  },
  {
    id: 3,
    heading: "Simplified PO and Invoice workflows",
    sublist: [
      {
        id: "simplofiedworkflowlist1",
        label:
          "PO and Invoice flows are configured in Prokraya to overcome ERP usability challenges",
      },
      {
        id: "simplofiedworkflowlist2",
        label:
          "Enabled multiple invoices against one PO, with strict controls to avoid duplication or budget overrun",
      },
      {
        id: "simplofiedworkflowlist3",
        label:
          "Introduced editable invoice fields and resubmission options for rejected invoices with added documentation",
      },
      {
        id: "simplofiedworkflowlist4",
        label:
          "Maintained seamless push to Oracle with audit logs and status tracking",
      },
    ],
  },
  {
    id: 4,
    heading: "Intelligent reporting & supplier analytics",
    sublist: [
      {
        id: "intelligentreportinglist1",
        label:
          "With advanced filtering options by status, supplier, bid type, and date range alongside visible ICV scoring users could quickly generate targeted, audit-ready reports that enabled faster decision-making, streamlined compliance checks, and significantly reduced the time spent on manual data compilation.",
      },
      {
        id: "intelligentreportinglist2",
        label:
          "Integrated ICV metrics to influence supplier selection based on region-specific compliance and financial impact",
      },
      {
        id: "intelligentreportinglist3",
        label:
          "Introduced editable invoice fields and resubmission options for rejected invoices with added documentation",
      },
      {
        id: "intelligentreportinglist4",
        label:
          "Dashboards now offer real-time visibility into supplier activity, bid flow, and invoice status",
      },
    ],
  },
];

const challenges = [
  "No formal supplier onboarding process and supplier communication happened manually through emails",
  "RFQs and tenders were shared over email, making it nearly impossible to track participating suppliers or generate proper evaluation reports",
  "The existing ERP UI was complex and non-intuitive, reducing adoption for POs and invoice processing",
  "Lack of automated audit trails, making it difficult to track changes, actions, or communications",
  "Managing multiple invoices against a single PO was time-consuming and error-prone",
  "Manual evaluation made it difficult to award multiple suppliers efficiently, leading to delays, limited visibility, and risk of overlooking qualified vendors.",
  "The lack of a proper delegation mechanism and user notifications led to delays in task completion and increased turnaround time.",
  "Lack of dynamic report creation demanded heavy manual effort to generate insights.",
  "Supplier performance metrics like ICV (In-Country Value) were not fully integrated into the procurement cycle.",
];

export const SSFasterS2PCycle = () => {
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
                A leading enterprise in the food and agriculture industry faced mounting operational hurdles due to a fragmented and manual procurement process. With over 4,500 external suppliers and a growing list of internal users, the organization struggled with legacy systems, paper-based bidding, and inefficient vendor management. Legacy procurement practices, reliant on manual emails and fragmented workflows, were slowing down operations and exposing the organization to audit and compliance risks. With expanding regional operations and a growing supplier base, the team needed a unified platform to automate procurement, enhance supplier collaboration, and ensure consistency across regulatory environments in Dubai and Qatar..
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
          <div className="text-center">
            <h2 className="mb-7 text-[40px] font-bold tracking-[1.2px] text-black leading-[1.4]">
              Results &amp; Impact
            </h2>
          </div>

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

      <div className="bg-gray-100 py-5 md:py-[70px]">
        <div className="max-w-6xl mx-auto">
          <p className="text-center text-[22px] text-[#3c4043]">
            <span className="font-bold text-blue-600 pr-2">"</span>
            This transformation demonstrates how a flexible, role-aware, and compliance-ready procurement platform can unlock operational agility. By moving away from manual processes and enabling digital collaboration between buyers and suppliers, the organization has built a more transparent, scalable, and efficient procurement foundation.
            <span className="font-bold text-blue-600 pl-2">"</span>
          </p>
        </div>
      </div>
    </>
  );
}