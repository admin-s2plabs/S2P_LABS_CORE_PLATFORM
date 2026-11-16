/** Page footer for the public sign-in / supplier sign-up pages. */
export function AuthFooter() {
  return (
    <footer className="border-t border-primary/10 bg-card/60 backdrop-blur px-4 py-2.5 text-center text-xs text-muted-foreground">
      <p>Copyright © {new Date().getFullYear()} S2P Labs Tech Private Limited, All rights reserved.</p>
    </footer>
  );
}
