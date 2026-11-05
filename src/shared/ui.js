// Wspólne elementy interfejsu: komunikaty (toast), motyw jasny/ciemny, przewijanie strony i ochrona HTML.
let scrollAnimationFrame = null;

let toastTimeout = null;
const themeStorageKey = "shipment-register-theme";
const savedTheme = localStorage.getItem(themeStorageKey);
if (savedTheme === "light") document.body.dataset.theme = "light";

// Pokazuje na 3 sekundy komunikat (toast): sukces, błąd lub ostrzeżenie o usunięciu.
function showToast(message, type = "success") {
  const toast = document.getElementById("toastNotification");
  if (!toast) return;

  clearTimeout(toastTimeout);
  toast.textContent = message;
  toast.classList.toggle("toast-notification--error", type === "error");
  toast.classList.toggle("toast-notification--danger", type === "danger");
  toast.hidden = false;
  toastTimeout = setTimeout(() => {
    toast.hidden = true;
  }, 3000);
}

// Zabezpiecza tekst przed wstrzyknięciem HTML przy budowaniu fragmentów kodu.
function escapeHTML(value) {
  const entities = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return String(value ?? "").replace(/[&<>"']/g, character => entities[character]);
}

// Płynnie przewija stronę do wskazanej pozycji (respektuje ustawienie ograniczenia animacji).
function scrollPageTo(targetPosition) {
  if (scrollBehavior === "auto") {
    window.scrollTo({ top: targetPosition, behavior: "auto" });
    return;
  }

  if (scrollAnimationFrame !== null) cancelAnimationFrame(scrollAnimationFrame);
  const startPosition = window.scrollY;
  const distance = targetPosition - startPosition;
  const startTime = performance.now();
  const duration = 250;

  function animateScroll(currentTime) {
    const progress = Math.min((currentTime - startTime) / duration, 1);
    const easedProgress = 1 - (1 - progress) ** 3;
    window.scrollTo(0, startPosition + distance * easedProgress);
    scrollAnimationFrame = progress < 1 ? requestAnimationFrame(animateScroll) : null;
  }

  scrollAnimationFrame = requestAnimationFrame(animateScroll);
}

// Wyświetla komunikat błędu na górze aplikacji.
function showAppError(message) {
  appError.textContent = message;
  appError.hidden = false;
}

// Ukrywa komunikat błędu aplikacji.
function clearAppError() {
  appError.textContent = "";
  appError.hidden = true;
}

// Odświeża etykietę i stan przycisku przełączającego motyw jasny/ciemny.
function updateThemeToggle() {
  const isLightTheme = document.body.dataset.theme === "light";
  themeToggleButton.textContent = isLightTheme ? "Tryb ciemny" : "Tryb jasny";
  themeToggleButton.setAttribute("aria-pressed", String(isLightTheme));
  themeToggleButton.setAttribute(
    "aria-label",
    isLightTheme ? "Przełącz na tryb ciemny" : "Przełącz na tryb jasny"
  );
}

let submitGuardInstalled = false;

// Blokuje ponowne wysłanie formularza (kliknięcie, Enter), dopóki trwa jego zapis na serwerze.
function initSubmitGuard() {
  if (submitGuardInstalled) return;
  submitGuardInstalled = true;
  document.addEventListener("submit", event => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    if (form.dataset.submitting === "1") {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }

    form.dataset.submitting = "1";
    const buttons = Array.from(form.querySelectorAll("button")).filter(button =>
      button.type === "submit" && !button.disabled);
    buttons.forEach(button => { button.disabled = true; });

    // Zwalnia formularz po zakończeniu zapisów lub od razu, gdy walidacja przerwała wysyłkę.
    const release = () => {
      delete form.dataset.submitting;
      buttons.forEach(button => { button.disabled = false; });
    };
    Promise.resolve().then(() => {
      if (!(window.shipmentApi?.writesInFlight?.() > 0)) return release();
      const timer = setInterval(() => {
        if (window.shipmentApi.writesInFlight() > 0) return;
        clearInterval(timer);
        release();
      }, 100);
    });
  }, true);
}

// Podłącza przełącznik motywu i przyciski przewijania na początek/koniec strony.
function initUi() {
  initTableColumnResizing();
  initSubmitGuard();

  // Przełącznik motywu jasny/ciemny.

  updateThemeToggle();
  themeToggleButton.addEventListener("click", () => {
    const nextTheme = document.body.dataset.theme === "light" ? "dark" : "light";
    document.body.dataset.theme = nextTheme;
    localStorage.setItem(themeStorageKey, nextTheme);
    updateThemeToggle();
  });

  // Przyciski przewijania strony.

  document.getElementById("scrollToTop").addEventListener("click", function () {
    scrollPageTo(0);
  });

  document.getElementById("scrollToBottom").addEventListener("click", function () {
    scrollPageTo(document.documentElement.scrollHeight);
  });
}
