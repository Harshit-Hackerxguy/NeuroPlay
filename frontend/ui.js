export function setStatus(el, text, type = "info") {
  if (!el) return;
  el.textContent = text;
  el.classList.remove("state-info", "state-success", "state-error", "state-loading", "state-empty");
  el.classList.add(`state-${type}`);
}

export function setButtonLoading(button, loading, loadingText = "Loading...") {
  if (!button) return;

  if (loading) {
    button.dataset.originalText = button.textContent;
    button.textContent = loadingText;
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    return;
  }

  button.textContent = button.dataset.originalText || button.textContent;
  button.disabled = false;
  button.removeAttribute("aria-busy");
}

export function renderEmptyRow(tbody, message, colSpan = 6) {
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="${colSpan}" class="empty-row">${message}</td></tr>`;
}

export function withDelayedLoading(callback, minMs = 220) {
  const start = performance.now();
  return Promise.resolve(callback()).finally(async () => {
    const elapsed = performance.now() - start;
    if (elapsed < minMs) {
      await new Promise((resolve) => setTimeout(resolve, minMs - elapsed));
    }
  });
}
