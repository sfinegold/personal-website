(() => {
  const BLOCK_SECONDS = 10;

  const overlay = document.createElement("div");
  overlay.id = "x-pause-overlay";

  const count = document.createElement("div");
  count.className = "x-pause-count";
  count.textContent = String(BLOCK_SECONDS);

  const label = document.createElement("div");
  label.className = "x-pause-label";
  label.textContent = "Take a breath. x.com opens shortly.";

  overlay.append(count, label);

  // document_start: <body> may not exist yet, so attach to <html>.
  document.documentElement.appendChild(overlay);

  const start = Date.now();
  const timer = setInterval(() => {
    const elapsed = (Date.now() - start) / 1000;
    const remaining = Math.max(0, Math.ceil(BLOCK_SECONDS - elapsed));
    count.textContent = String(remaining);
    if (remaining <= 0) {
      clearInterval(timer);
      overlay.remove();
    }
  }, 200);
})();
