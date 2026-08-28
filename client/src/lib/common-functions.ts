import { toast } from "@/hooks/use-toast";

interface Document {
  id: number;
  file_name: string;
  file_path: string;
  created_by: string;
  created_date: string;
  filename?: string;
  doc_name?: string;
  doc_path?: string;
  attach_name?: string;
}
export function formatDate(dateString: Date | string | null | undefined, includeTime: boolean = false): string {
    if (!dateString) return "-";

    const orgDetails = JSON.parse(localStorage.getItem("orgDetails") || "{}");
    const format = orgDetails.date_format || "DD-MMM-YYYY";

    const date = new Date(dateString);
    if (isNaN(date.getTime())) return "-";

    const day = String(date.getDate()).padStart(2, "0");
    const month = date.getMonth(); // 0-based
    const year = date.getFullYear();
    const shortYear = String(year).slice(-2);

    const monthShort = date.toLocaleString("en-IN", { month: "short" }); // Jan
    const monthLong = date.toLocaleString("en-IN", { month: "long" }); // January
    const monthNum = String(month + 1).padStart(2, "0");

    const time = date.toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
    });

    let formattedDate = "";

    switch (format) {
        case "DD.MM.YYYY":
            formattedDate = `${day}.${monthNum}.${year}`;
            break;
        case "YYYYMMDD":
            formattedDate = `${year}${monthNum}${day}`;
            break;
        case "DDMMYYYY":
            formattedDate = `${day}${monthNum}${year}`;
            break;
        case "Month DD, YYYY":
            formattedDate = `${monthLong} ${day}, ${year}`;
            break;
        case "DD Month YYYY":
            formattedDate = `${day} ${monthLong} ${year}`;
            break;
        case "MMM-YYYY":
            formattedDate = `${monthShort}-${year}`;
            break;
        case "Month YYYY":
            formattedDate = `${monthLong} ${year}`;
            break;
        case "DD/MM/YY":
            formattedDate = `${day}/${monthNum}/${shortYear}`;
            break;
        case "MM/DD/YY":
            formattedDate = `${monthNum}/${day}/${shortYear}`;
            break;
        case "DD-MM-YYYY":
            formattedDate = `${day}-${monthNum}-${year}`;
            break;
        case "MM-DD-YYYY":
            formattedDate = `${monthNum}-${day}-${year}`;
            break;
        default:
            formattedDate = `${day} ${monthShort} ${year}`;
            break;
    }

    if (includeTime) {
        return `${formattedDate} ${time}`;
    }
    return formattedDate;
}

export function formatDateTime(dateString: Date | string | null | undefined): string {
  if (!dateString) return "-";
  return new Date(dateString).toLocaleDateString("en-IN", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export function formatCurrency(
    amount: string | number | null | undefined,
    currency: string | null | undefined,
    locale?: string
): string {
    if (amount === null || amount === undefined || amount === "") {
        return "0.00";
    }
    const number =
        typeof amount === "number" ? amount : Number(amount);
    if (!Number.isFinite(number)) {
        return "0.00";
    }
    try {
        const resolvedLocale =
            locale ||
            (currency === "INR"
                ? "en-IN"
                : currency === "AED"
                    ? "ar-AE"
                    : "en-US");
        return new Intl.NumberFormat(resolvedLocale, {
            style: "currency",
            currency: currency || "INR",
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        }).format(number);
    } catch (error) {
        return `${currency || "INR"} ${number.toFixed(2)}`;
    }
}

   const getAuthHeaders = (): Record<string, string> => {
      try {
        const parsed = JSON.parse(localStorage.getItem("prokraya-auth") || "{}");
        return {
          "x-user-email": parsed.userId || "",
          "x-user-name": parsed.userName || "",
        };
      } catch {
        return {};
      }
    };


    const fetchDocumentBlob = async (downloadUrl: string): Promise<Blob> => {
      const res = await fetch(downloadUrl, {
        headers: getAuthHeaders(),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch document");
      return res.blob();
    };

    export function handleDownloadDocument(doc: Document, downloadUrl: string) {
      try {
        fetchDocumentBlob(downloadUrl).then((blob) => {
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = doc.file_name || doc.filename || doc.doc_name || doc.attach_name || "document";
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        });
      } catch {
        toast({ title: "Failed to download document", variant: "destructive" });
      }
    };

