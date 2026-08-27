// Keep this file minimal and safe for early loading.
if (!globalThis.DOMMatrix) {
  globalThis.DOMMatrix = class DOMMatrix {
    constructor(init?: string | number[]) {
      this.a = 1;
      this.b = 0;
      this.c = 0;
      this.d = 1;
      this.e = 0;
      this.f = 0;
      if (typeof init === "string") {
        // No-op for string initialization.
      } else if (Array.isArray(init)) {
        [this.a, this.b, this.c, this.d, this.e, this.f] = init;
      }
    }
    a: number;
    b: number;
    c: number;
    d: number;
    e: number;
    f: number;
  };
}
