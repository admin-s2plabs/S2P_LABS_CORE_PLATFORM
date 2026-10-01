import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { Fragment, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import CheckboxIcon1 from "../../assets/images/checkbox-1.svg";
import CheckboxIcon2 from "../../assets/images/checkbox-2.svg";
import ImplementationInsights from "../../assets/images/implementation-insights-bg-3.png";
import ProductBg from "../../assets/images/product-bg.png";
import ResultsImpacts from "../../assets/images/result-impacts-3.png";
import SuccessStoryImage from "../../assets/images/success-story-3-lg.png";

const solutionsList = [
  {
    id: 1,
    heading: "Centralized data",
    content:
      "Unified all procurement data from PR to PO, giving stakeholders a single, transparent view of procurement operations.",
  },
  {
    id: 2,
    heading: "Automated notifications and alerts",
    content:
      "The system includes automated notifications and alerts to keep stakeholders informed about critical procurement activities. This feature ensures that relevant parties are updated on auction status, supplier response and previous performance, and any deviations from planned procurement activities, enhancing overall situational awareness.",
  },
  {
    id: 3,
    heading: "Reports and real-time analytics dashboard",
    content:
      "S2P Labs single platform one stop solution provided real-time analytics for enhanced approval check and informed decision-making.",
  },
];

const challenges = [
  "Limited transparency across procurement operations: The company faced challenges with inadequate insight into its procurement workflows, leading to overlooked cost-saving opportunities and hindering key stakeholder's ability to monitor auction activities effectively.",
  "Excessive Turnaround Time (TAT): Extended TAT from Purchase Requisition (PR) to Delivery, resulting in delays and impacting procurement timelines.",
  "Difficulties in supplier management: Due to varied systems and limited visibility, of approvals, notifications or mail communication resulted impacting delivery timelines and quality.",
];

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
      <div className="bg-[#E6EDF7] text-center sticky-header">
        <div className="mx-auto max-w-7xl px-4 py-8">
          <h2 className="text-4xl font-semibold mb-0 effective-collaboration-heading mb-5">
            Our approach
          </h2>
          <p className="font-bold">
            To address these challenges, the client implemented S2P Labs'
            platform, integrating all procurement data into a centralized
            dashboard. S2P Labs' auctions module provided the client with
            robust tools to automate and streamline supplier management over
            bids, and real-time analytics.
          </p>
        </div>
      </div>
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
                  <h3 className="relative mb-8 text-3xl font-semibold text-[#1c2045] after:absolute after:left-0 after:-bottom-5 after:h-[2px] after:w-[84px] after:bg-[#368bfc]">
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

export const SSProcurementSavings = () => {
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
              Achieving over 5% savings for a global apparel manufacturer by
              optimizing procurement processes
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
                Overview
              </h3>
            </div>
            <div className="md:col-span-7">
              <p className="mb-0 text-base text-black">
                Our client, a global leader in the apparel manufacturing sector,
                operates a vast network of stores and online channels across
                major markets. Known for its premium quality over 3,500 + stores
                across major markets products, the company has a significant
                presence in both B2C and B2B markets. To streamline operations
                and enhance procurement efficiency, the client sought a digital
                solution that could address their complex procurement needs.
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
                  Reduced turnaround time: S2P Labs' solution decreased TAT
                  from PR to PO from several days to under 24-48 hours,
                  expediting procurement cycles and reducing delays.
                </li>
                <li className="my-10 relative pl-8">
                  <img
                    src={CheckboxIcon2}
                    alt=""
                    className="absolute left-0 top-1 h-5 w-5"
                  />
                  Digitized supplier information: S2P Labs enabled the client to
                  digitize and centralize data for suppliers, fostering a
                  streamlined supplier management experience and boosting active
                  supplier participation for auction over approximately 21%.
                </li>
                <li className="my-10 relative pl-8">
                  <img
                    src={CheckboxIcon2}
                    alt=""
                    className="absolute left-0 top-1 h-5 w-5"
                  />
                  Substantial cost savings: By optimizing procurement operations
                  and enhancing negotiation capabilities, the client managed
                  procurement 5% savings within six months. - Direct savings:
                  Directly impacted the pricing of purchasing items, leading to
                  substantial cost reductions on key procurement activities. -
                  Indirect savings: Significant indirect savings through
                  enhanced operational efficiency, reduced manual processes, and
                  improved supplier collaboration.
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}