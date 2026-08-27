import { useState, useRef, useEffect } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

const countryOptions = [
  { code: "+971", name: "UAE", iso: "AE", flag: "\u{1F1E6}\u{1F1EA}" },
  { code: "+91", name: "India", iso: "IN", flag: "\u{1F1EE}\u{1F1F3}" },
  { code: "+1", name: "USA", iso: "US", flag: "\u{1F1FA}\u{1F1F8}" },
  { code: "+44", name: "UK", iso: "GB", flag: "\u{1F1EC}\u{1F1E7}" },
  { code: "+966", name: "Saudi Arabia", iso: "SA", flag: "\u{1F1F8}\u{1F1E6}" },
  { code: "+974", name: "Qatar", iso: "QA", flag: "\u{1F1F6}\u{1F1E6}" },
  { code: "+965", name: "Kuwait", iso: "KW", flag: "\u{1F1F0}\u{1F1FC}" },
  { code: "+968", name: "Oman", iso: "OM", flag: "\u{1F1F4}\u{1F1F2}" },
  { code: "+973", name: "Bahrain", iso: "BH", flag: "\u{1F1E7}\u{1F1ED}" },
  { code: "+86", name: "China", iso: "CN", flag: "\u{1F1E8}\u{1F1F3}" },
  { code: "+81", name: "Japan", iso: "JP", flag: "\u{1F1EF}\u{1F1F5}" },
  { code: "+82", name: "Korea", iso: "KR", flag: "\u{1F1F0}\u{1F1F7}" },
  { code: "+65", name: "Singapore", iso: "SG", flag: "\u{1F1F8}\u{1F1EC}" },
  { code: "+60", name: "Malaysia", iso: "MY", flag: "\u{1F1F2}\u{1F1FE}" },
  { code: "+62", name: "Indonesia", iso: "ID", flag: "\u{1F1EE}\u{1F1E9}" },
  { code: "+63", name: "Philippines", iso: "PH", flag: "\u{1F1F5}\u{1F1ED}" },
  { code: "+49", name: "Germany", iso: "DE", flag: "\u{1F1E9}\u{1F1EA}" },
  { code: "+33", name: "France", iso: "FR", flag: "\u{1F1EB}\u{1F1F7}" },
  { code: "+39", name: "Italy", iso: "IT", flag: "\u{1F1EE}\u{1F1F9}" },
  { code: "+34", name: "Spain", iso: "ES", flag: "\u{1F1EA}\u{1F1F8}" },
  { code: "+31", name: "Netherlands", iso: "NL", flag: "\u{1F1F3}\u{1F1F1}" },
  { code: "+46", name: "Sweden", iso: "SE", flag: "\u{1F1F8}\u{1F1EA}" },
  { code: "+47", name: "Norway", iso: "NO", flag: "\u{1F1F3}\u{1F1F4}" },
  { code: "+45", name: "Denmark", iso: "DK", flag: "\u{1F1E9}\u{1F1F0}" },
  { code: "+41", name: "Switzerland", iso: "CH", flag: "\u{1F1E8}\u{1F1ED}" },
  { code: "+61", name: "Australia", iso: "AU", flag: "\u{1F1E6}\u{1F1FA}" },
  { code: "+64", name: "New Zealand", iso: "NZ", flag: "\u{1F1F3}\u{1F1FF}" },
  { code: "+27", name: "South Africa", iso: "ZA", flag: "\u{1F1FF}\u{1F1E6}" },
  { code: "+20", name: "Egypt", iso: "EG", flag: "\u{1F1EA}\u{1F1EC}" },
  { code: "+234", name: "Nigeria", iso: "NG", flag: "\u{1F1F3}\u{1F1EC}" },
  { code: "+55", name: "Brazil", iso: "BR", flag: "\u{1F1E7}\u{1F1F7}" },
  { code: "+52", name: "Mexico", iso: "MX", flag: "\u{1F1F2}\u{1F1FD}" },
  { code: "+504", name: "Honduras", iso: "HN", flag: "\u{1F1ED}\u{1F1F3}" },
  { code: "+852", name: "Hong Kong", iso: "HK", flag: "\u{1F1ED}\u{1F1F0}" },
  { code: "+36", name: "Hungary", iso: "HU", flag: "\u{1F1ED}\u{1F1FA}" },
  { code: "+354", name: "Iceland", iso: "IS", flag: "\u{1F1EE}\u{1F1F8}" },
  { code: "+92", name: "Pakistan", iso: "PK", flag: "\u{1F1F5}\u{1F1F0}" },
  { code: "+94", name: "Sri Lanka", iso: "LK", flag: "\u{1F1F1}\u{1F1F0}" },
  { code: "+880", name: "Bangladesh", iso: "BD", flag: "\u{1F1E7}\u{1F1E9}" },
  { code: "+7", name: "Russia", iso: "RU", flag: "\u{1F1F7}\u{1F1FA}" },
  { code: "+90", name: "Turkey", iso: "TR", flag: "\u{1F1F9}\u{1F1F7}" },
  { code: "+48", name: "Poland", iso: "PL", flag: "\u{1F1F5}\u{1F1F1}" },
  { code: "+380", name: "Ukraine", iso: "UA", flag: "\u{1F1FA}\u{1F1E6}" },
  { code: "+962", name: "Jordan", iso: "JO", flag: "\u{1F1EF}\u{1F1F4}" },
  { code: "+961", name: "Lebanon", iso: "LB", flag: "\u{1F1F1}\u{1F1E7}" },
  { code: "+964", name: "Iraq", iso: "IQ", flag: "\u{1F1EE}\u{1F1F6}" },
  { code: "+98", name: "Iran", iso: "IR", flag: "\u{1F1EE}\u{1F1F7}" },
];

export function parsePhoneValue(value: string): {
  countryCode: string | null;
  number: string;
} {
  if (!value) return { countryCode: null, number: "" };
  const trimmed = value.trim();
  for (const country of [...countryOptions].sort(
    (a, b) => b.code.length - a.code.length,
  )) {
    if (trimmed.startsWith(country.code)) {
      return {
        countryCode: country.code,
        number: trimmed.slice(country.code.length).trim(),
      };
    }
  }
  if (trimmed.startsWith("+")) {
    const match = trimmed.match(/^(\+\d{1,4})\s*(.*)/);
    if (match) return { countryCode: match[1], number: match[2] };
  }
  return { countryCode: null, number: trimmed };
}

export function getDialCodeByIso(iso: string): string {
  if (!iso) return "+1";
  const country = countryOptions.find(c => c.iso === iso.toUpperCase());
  return country ? country.code : "+1";
}

const countryPhoneLengths: Record<string, { min: number; max: number }> = {
  "+971": { min: 9, max: 9 },
  "+91": { min: 10, max: 10 },
  "+1": { min: 10, max: 10 },
  "+44": { min: 10, max: 10 },
  "+966": { min: 9, max: 9 },
  "+974": { min: 8, max: 8 },
  "+965": { min: 8, max: 8 },
  "+968": { min: 8, max: 8 },
  "+973": { min: 8, max: 8 },
  "+86": { min: 11, max: 11 },
  "+81": { min: 10, max: 10 },
  "+82": { min: 10, max: 10 },
  "+65": { min: 8, max: 8 },
  "+60": { min: 9, max: 9 },
  "+62": { min: 10, max: 12 },
  "+63": { min: 10, max: 10 },
  "+49": { min: 10, max: 11 },
  "+33": { min: 9, max: 9 },
  "+39": { min: 10, max: 10 },
  "+34": { min: 9, max: 9 },
  "+31": { min: 9, max: 9 },
  "+46": { min: 9, max: 9 },
  "+47": { min: 8, max: 8 },
  "+45": { min: 8, max: 8 },
  "+41": { min: 9, max: 10 },
  "+61": { min: 9, max: 9 },
  "+64": { min: 8, max: 8 },
  "+27": { min: 9, max: 9 },
  "+20": { min: 10, max: 10 },
  "+234": { min: 10, max: 10 },
  "+55": { min: 10, max: 11 },
  "+52": { min: 10, max: 10 },
  "+504": { min: 8, max: 8 },
  "+852": { min: 8, max: 8 },
  "+36": { min: 9, max: 9 },
  "+354": { min: 7, max: 7 },
  "+92": { min: 10, max: 10 },
  "+94": { min: 10, max: 10 },
  "+880": { min: 10, max: 10 },
  "+7": { min: 10, max: 10 },
  "+90": { min: 10, max: 10 },
  "+48": { min: 9, max: 9 },
  "+380": { min: 9, max: 9 },
  "+962": { min: 9, max: 9 },
  "+961": { min: 8, max: 8 },
  "+964": { min: 10, max: 10 },
  "+98": { min: 10, max: 10 },
};

export function digitsOnly(str: string) {
  return str.replace(/\D/g, "");
}

export function hasPhoneDigits(value: string): boolean {
  if (!value) return false;
  const { number } = parsePhoneValue(value);
  return digitsOnly(number).length > 0;
}

export function validatePhoneNumber(value: string): boolean {
  if (!value) return false;
  const { countryCode, number } = parsePhoneValue(value);
  const digits = digitsOnly(number);
  const limits = countryCode ? countryPhoneLengths[countryCode] : null;
  if (limits) {
    return digits.length >= limits.min && digits.length <= limits.max;
  }
  return digits.length >= 7 && digits.length <= 15;
}

export function getPhoneValidationMessage(value: string) {
  const { countryCode } = parsePhoneValue(value || "");
  const limits = countryCode ? countryPhoneLengths[countryCode] : null;
  if (limits) {
    if (limits.min === limits.max) {
      return `Phone number must be exactly ${limits.min} digits for ${countryCode}`;
    }
    return `Phone number must be between ${limits.min} and ${limits.max} digits for ${countryCode}`;
  }
  return "Please enter a valid phone number";
}

interface PhoneInputProps {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void | Promise<void>;
  placeholder?: string;
  defaultCountryCode?: string;
  "data-testid"?: string;
  className?: string;
  disabled?: boolean;
}

export function PhoneInput({
  value,
  onChange,
  onBlur,
  placeholder = "501234567",
  defaultCountryCode = "+1",
  "data-testid": testId,
  className,
  disabled,
}: PhoneInputProps) {
  const parsed = parsePhoneValue(value);
  const [selectedCode, setSelectedCode] = useState(
    parsed.countryCode || defaultCountryCode,
  );
  const [phoneNumber, setPhoneNumber] = useState(parsed.number);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [openUpward, setOpenUpward] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (value && value.trim()) {
      const p = parsePhoneValue(value);
      if (p.countryCode) {
        setSelectedCode(p.countryCode);
      }
      setPhoneNumber(p.number);
    } else if (!value) {
      // If value is explicitly cleared, reset to default country code
      setSelectedCode(defaultCountryCode);
      setPhoneNumber("");
    }
  }, [value, defaultCountryCode]);


  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setDropdownOpen(false);
        setSearch("");
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (dropdownOpen && searchRef.current) {
      searchRef.current.focus();
    }
  }, [dropdownOpen]);

  const selectedCountry = countryOptions.find((c) => c.code === selectedCode);

  const handleCodeChange = (code: string) => {
    setSelectedCode(code);
    setDropdownOpen(false);
    setSearch("");
    const combined = phoneNumber ? `${code} ${phoneNumber}` : code;
    onChange(combined);
  };

  const handleNumberChange = (num: string) => {
    // Only allow digits (no spaces, letters, symbols) in the phone number portion.
    const sanitized = num.replace(/\D/g, "");

    // Check country limits to prevent typing more than the max length
    const limits = countryPhoneLengths[selectedCode];
    let finalNumber = sanitized;
    if (limits && sanitized.length > limits.max) {
      finalNumber = sanitized.slice(0, limits.max);
    } else if (!limits && sanitized.length > 15) {
      // Default fallback max length if not defined
      finalNumber = sanitized.slice(0, 15);
    }

    setPhoneNumber(finalNumber);
    const combined = finalNumber ? `${selectedCode} ${finalNumber}` : selectedCode;
    onChange(combined);
  };

  const filteredOptions = search
    ? countryOptions.filter(
      (c) =>
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.code.includes(search),
    )
    : countryOptions;

  return (
    <div
      className={cn(
        "relative flex items-center h-9 border rounded-md bg-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-1",
        className,
      )}
      ref={dropdownRef}
    >
      <button
        type="button"
        className="flex items-center gap-1 px-2 h-full border-r bg-muted/50 rounded-l-md text-sm shrink-0 hover-elevate"
        onClick={() => {
          if (!disabled) {
            if (!dropdownOpen && triggerRef.current) {
              const rect = triggerRef.current.getBoundingClientRect();
              const spaceBelow = window.innerHeight - rect.bottom;
              setOpenUpward(spaceBelow < 260);
            }
            setDropdownOpen(!dropdownOpen);
          }
        }}
        data-testid={testId ? `${testId}-country` : undefined}
        disabled={disabled}
        ref={triggerRef}
        aria-haspopup="listbox"
        aria-expanded={dropdownOpen}
        aria-label="Select country code"
      >
        <span className="text-base leading-none">
          {selectedCountry?.flag || "\u{1F30D}"}
        </span>
        <span className="text-muted-foreground text-xs">{selectedCode}</span>
        <ChevronDown className="h-3 w-3 text-muted-foreground" />
      </button>

      {dropdownOpen && (
        <div
          className={cn(
            "absolute left-0 z-50 min-w-[14rem] w-64 max-w-[18rem] max-h-60 overflow-auto rounded-md border bg-popover shadow-md",
            openUpward ? "bottom-full mb-1" : "top-full mt-1"
          )}
          role="listbox"
          aria-label="Country codes"
        >
          <div className="sticky top-0 z-10 bg-popover p-1.5 border-b">
            <input
              ref={searchRef}
              type="text"
              placeholder="Search country..."
              className="w-full px-2 py-1 text-sm bg-background border rounded-md outline-none"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              data-testid={testId ? `${testId}-search` : undefined}
              aria-label="Search countries"
            />
          </div>
          {filteredOptions.map((country) => (
            <button
              key={country.code + country.name}
              type="button"
              role="option"
              aria-selected={country.code === selectedCode}
              className={cn(
                "flex items-center gap-2 w-full px-3 py-1.5 text-sm hover-elevate text-left",
                country.code === selectedCode && "bg-accent",
              )}
              onClick={() => handleCodeChange(country.code)}
              data-testid={
                testId ? `${testId}-option-${country.code}` : undefined
              }
            >
              <span className="text-base leading-none">{country.flag}</span>
              <span>{country.name}</span>
              <span className="text-muted-foreground ml-auto">
                {country.code}
              </span>
            </button>
          ))}
          {filteredOptions.length === 0 && (
            <div className="px-3 py-2 text-sm text-muted-foreground">
              No countries found
            </div>
          )}
        </div>
      )}

      <input
        type="tel"
        inputMode="numeric"
        pattern="[0-9]*"
        placeholder={placeholder}
        className="flex-1 h-full px-3 bg-transparent outline-none text-sm"
        value={phoneNumber}
        onChange={(e) => handleNumberChange(e.target.value)}
        onBlur={onBlur}
        disabled={disabled}
        data-testid={testId}
      />
    </div>
  );
}

export { countryOptions };
