import { useTranslation } from "react-i18next";
import { Languages } from "lucide-react";

export function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const isArabic = i18n.language === "ar";

  const toggle = () => {
    i18n.changeLanguage(isArabic ? "en" : "ar");
  };

  return (
    <button
      onClick={toggle}
      data-testid="button-language-switcher"
      className="flex items-center gap-2 w-full px-3 py-2 rounded-md text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-sidebar-accent transition-colors"
      title={isArabic ? "Switch to English" : "التبديل إلى العربية"}
    >
      <Languages className="h-3.5 w-3.5 shrink-0" />
      <span className="flex-1 text-left rtl:text-right">
        {isArabic ? "English" : "عربي"}
      </span>
      <span className="text-[10px] font-semibold uppercase tracking-wider bg-primary/10 text-primary px-1.5 py-0.5 rounded">
        {isArabic ? "EN" : "AR"}
      </span>
    </button>
  );
}
