import { CheckCircle, ChevronDown, Facebook, Instagram, Linkedin, LogIn, Menu, Shield, Twitter, X, Youtube } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import LogoBlack from "../../assets/images/s2plabs_logo.jpeg";
import LogoWhite from "../../assets/images/s2plabs_logo.jpeg";
import { ImageWithFallback } from "./ImageWithFallback";

export function Layout({ children }: any) {
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [mobileDropdown, setMobileDropdown] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [location] = useLocation();
  const prevLocation = useRef(location);

  useEffect(() => {
    if (prevLocation.current !== location) {
      window.scrollTo({
        top: 0,
        behavior: "instant",
      });
      prevLocation.current = location;
    }
  }, [location]);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const companyLinks = [
    { name: "About Us", path: "/about-us" },
    { name: "Work & Culture", path: "/work-culture" },
  ];

  const productLinks = [
    { name: "Supplier Management", path: "/supplier-relationship-management" },
    { name: "Purchase Requisition", path: "/purchase-requistion-software" },
    { name: "Sourcing", path: "/esourcing-software" },
    { name: "Contract Management", path: "/contract-management-software" },
    { name: "Invoicing", path: "/einvoicing-software" },
    { name: "Spend Analytics", path: "/spend-analytics-software" },
  ];

  const resourceLinks = [
    { name: "Blogs", path: "/blogs" },
    { name: "Success Stories", path: "/success-stories" },
    { name: "Security", path: "/security" },
  ];

  const navGroups = [
    { label: "Company", key: "company", links: companyLinks },
    { label: "Product", key: "product", links: productLinks },
    { label: "Resources", key: "resources", links: resourceLinks },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <header
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          isScrolled
            ? "bg-white/95 backdrop-blur-md border-b border-gray-100 shadow-sm"
            : "bg-transparent"
        }`}
      >
        <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <Link href="/" className="flex items-center">
              <ImageWithFallback
                src={LogoBlack}
                alt="S2P Labs"
                className="h-8 w-auto"
              />
            </Link>

            {/* Desktop Navigation */}
            <div className="hidden lg:flex items-center gap-0">
              {navGroups.map(({ label, key, links }) => (
                <div
                  key={key}
                  className="relative"
                  onMouseEnter={() => setOpenMenu(key)}
                  onMouseLeave={() => setOpenMenu(null)}
                >
                  <button className="flex items-center gap-1 px-4 py-2 text-sm font-medium text-gray-700 hover:text-violet-600 transition-colors">
                    {label}
                    <ChevronDown
                      className={`w-3.5 h-3.5 transition-transform ${
                        openMenu === key ? "rotate-180" : ""
                      }`}
                    />
                  </button>

                  <div className={`absolute top-full left-0 mt-1 w-52 bg-white border border-gray-100 rounded-xl shadow-lg py-1 z-50 transition-all duration-200 ${
                    openMenu === key
                      ? "opacity-100 visible"
                      : "opacity-0 invisible"
                  }`}>
                    {links.map((link) => (
                      <Link
                        key={link.name}
                        href={link.path}
                        onClick={() => setOpenMenu(null)}
                        className="block px-4 py-2.5 text-sm text-gray-600 hover:text-violet-600 hover:bg-violet-50 transition-colors"
                      >
                        {link.name}
                      </Link>
                    ))}
                  </div>
                </div>
              ))}

              <Link
                href="/contact-us"
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-violet-600 transition-colors"
              >
                Contact
              </Link>

              <Link
                href="/login"
                className="ml-3 px-4 py-2 inline-flex items-center justify-center gap-2 px-6 py-2 bg-white border border-violet-200 text-violet-700 text-sm font-semibold rounded-lg hover:bg-violet-50 transition-colors"
              >
                <LogIn className="w-3.5 h-3.5" />
                Login
              </Link>

            </div>

            {/* Mobile Toggle */}
            <button
              className="lg:hidden p-2"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? (
                <X className="w-5 h-5 text-gray-700" />
              ) : (
                <Menu className="w-5 h-5 text-gray-700" />
              )}
            </button>
          </div>

          {/* Mobile Menu */}
          {mobileMenuOpen && (
            <div className="lg:hidden py-4 border-t border-gray-100 bg-white">
              <div className="flex flex-col gap-1">
                {navGroups.map(({ label, key, links }) => (
                  <div key={key}>
                    <button
                      type="button"
                      className="flex items-center justify-between w-full px-4 py-2.5 text-sm font-medium text-gray-700"
                      onClick={() =>
                        setMobileDropdown(
                          mobileDropdown === key ? null : key
                        )
                      }
                    >
                      {label}

                      <ChevronDown
                        className={`w-4 h-4 transition-transform ${mobileDropdown === key ? "rotate-180" : ""
                          }`}
                      />
                    </button>

                    {mobileDropdown === key && (
                      <div className="ml-4 flex flex-col gap-1 py-1">
                        {links.map((link) => (
                          <Link
                            key={link.name}
                            href={link.path}
                            className="px-4 py-2 text-sm text-gray-600 hover:text-violet-600"
                            onClick={() => {
                              setMobileMenuOpen(false);
                              setMobileDropdown(null);
                            }}
                          >
                            {link.name}
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                ))}

                <Link
                  href="/contact-us"
                  className="px-4 py-2.5 text-sm font-medium text-gray-700"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Contact
                </Link>

                <Link
                  href="/login"
                  className="px-4 py-2.5 text-sm font-medium text-gray-700 flex items-center gap-2"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <LogIn className="w-4 h-4" />
                  Login
                </Link>

              </div>
            </div>
          )}
        </nav>
      </header>

      <main className="flex-1 pt-16">
        {children}
      </main>

      {/* Footer */}
      <footer className="bg-[#0f0e2a] text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-14 pb-10">

          {/* Main grid */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-8 mb-12">

            {/* Brand */}
            <div className="col-span-2 md:col-span-3 lg:col-span-2">
              <Link href="/" className="inline-flex mb-4">
                <ImageWithFallback src={LogoWhite} alt="S2P Labs" className="h-9 w-auto" />
              </Link>
              <p className="text-gray-400 text-sm leading-relaxed mb-5 max-w-xs">
                Source-to-Pay platform that automates the entire procurement lifecycle, from sourcing to payments.
              </p>
              <div className="flex gap-2 mb-6">
                <span className="flex items-center gap-1.5 px-2.5 py-1 bg-white/10 rounded-md text-xs text-gray-300">
                  <Shield className="w-3 h-3 text-violet-400" /> ISO 27001
                </span>
                <span className="flex items-center gap-1.5 px-2.5 py-1 bg-white/10 rounded-md text-xs text-gray-300">
                  <CheckCircle className="w-3 h-3 text-violet-400" /> GDPR
                </span>
              </div>
              {/* Social links */}
              <div className="flex items-center gap-2 mt-6">
                {[
                  { icon: Linkedin, label: "LinkedIn" },
                  { icon: Youtube, label: "YouTube" },
                  { icon: Twitter, label: "X (Twitter)" },
                  { icon: Instagram, label: "Instagram" },
                  { icon: Facebook, label: "Facebook" },
                ].map(({ icon: Icon, label }) => (
                  <button
                    type="button"
                    key={label}
                    aria-label={label}
                    className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/10 hover:bg-violet-600 text-gray-400 hover:text-white transition-all"
                  >
                    <Icon className="w-3.5 h-3.5" />
                  </button>
                ))}
              </div>
            </div>

            {/* Company */}
            <div>
              <h3 className="text-xs font-semibold text-white mb-4 uppercase tracking-widest">Company</h3>
              <ul className="space-y-2.5">
                {companyLinks.map((link) => (
                  <li key={link.name}>
                    <Link href={link.path} className="text-gray-400 hover:text-violet-400 transition-colors text-sm">
                      {link.name}
                    </Link>
                  </li>
                ))}
                <li>
                  <Link href="/contact-us" className="text-gray-400 hover:text-violet-400 transition-colors text-sm">Contact Us</Link>
                </li>
              </ul>
            </div>

            {/* Product */}
            <div>
              <h3 className="text-xs font-semibold text-white mb-4 uppercase tracking-widest">Product</h3>
              <ul className="space-y-2.5">
                {productLinks.map((link) => (
                  <li key={link.name}>
                    <Link href={link.path} className="text-gray-400 hover:text-violet-400 transition-colors text-sm">
                      {link.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h3 className="text-xs font-semibold text-white mb-4 uppercase tracking-widest">Resources</h3>
              <ul className="space-y-2.5">
                {resourceLinks.map((link) => (
                  <li key={link.name}>
                    <Link href={link.path} className="text-gray-400 hover:text-violet-400 transition-colors text-sm">
                      {link.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

          </div>

          {/* Bottom bar */}
          <div className="border-t border-white/10 pt-6 flex flex-col sm:flex-row justify-between items-center gap-3">
            <p className="text-gray-500 text-xs">&copy; 2026 S2P Labs. All rights reserved.</p>
            <div className="flex items-center gap-4 text-xs text-gray-500">
              <Link href="/privacy-policy" className="hover:text-gray-300 transition-colors">Privacy Policy</Link>
              <Link href="/terms-of-service" className="hover:text-gray-300 transition-colors">Terms of Service</Link>
              <Link href="/cookie-policy" className="hover:text-gray-300 transition-colors">Cookie Policy</Link>
            </div>
            <div className="flex items-center gap-3 text-xs text-gray-500">
              <span className="flex items-center gap-1"><CheckCircle className="w-3 h-3 text-white/60" /> GDPR Compliant</span>
              <span className="text-gray-600">|</span>
              <span className="flex items-center gap-1"><Shield className="w-3 h-3 text-white/60" /> ISO 27001</span>
            </div>
          </div>

        </div>
      </footer>
    </div>
  );
}
