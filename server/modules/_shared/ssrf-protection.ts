export function isUrlSafe(urlString: string): { safe: boolean; error?: string } {
  try {
    const url = new URL(urlString);

    if (!["http:", "https:"].includes(url.protocol)) {
      return { safe: false, error: "Only HTTP/HTTPS protocols are allowed" };
    }

    const blockedHostnames = [
      "localhost",
      "127.0.0.1",
      "0.0.0.0",
      "::1",
      "169.254.169.254",
      "metadata.google.internal",
      "100.100.100.200",
    ];

    if (blockedHostnames.includes(url.hostname.toLowerCase())) {
      return { safe: false, error: "Internal/localhost URLs are not allowed" };
    }

    const placeholderDomains = [
      "url.com", "example.com", "example.org", "example.net",
      "website.com", "domain.com", "test.com", "sample.com",
      "yourwebsite.com", "yourcompany.com", "company.com",
      "mywebsite.com", "placeholder.com", "abc.com", "xyz.com",
      "123.com", "site.com", "web.com", "fake.com", "dummy.com",
      "foo.com", "bar.com",
    ];

    const hostnameClean = url.hostname.toLowerCase().replace(/^www\./, "");
    if (placeholderDomains.includes(hostnameClean)) {
      return { safe: false, error: "Placeholder/test URL - not a real company website" };
    }

    const hostname = url.hostname;
    const ipv4Match = hostname.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
    if (ipv4Match) {
      const [, a, b] = ipv4Match.map(Number);
      if (a === 10 ||
          (a === 172 && b >= 16 && b <= 31) ||
          (a === 192 && b === 168) ||
          a === 127 ||
          a === 0) {
        return { safe: false, error: "Private/internal IP addresses are not allowed" };
      }
    }

    if (hostname.endsWith(".local") ||
        hostname.endsWith(".internal") ||
        hostname.endsWith(".corp") ||
        hostname.includes("replit.dev")) {
      return { safe: false, error: "Internal domain names are not allowed" };
    }

    return { safe: true };
  } catch {
    return { safe: false, error: "Invalid URL format" };
  }
}
