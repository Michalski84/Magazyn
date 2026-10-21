// Sesja użytkownika: logowanie, wylogowanie, wygaśnięcie sesji oraz pobieranie listy przesyłek.
// Wykonuje operację na serwerze; błędy pokazuje użytkownikowi i odświeża dane przy konflikcie.
async function runServerAction(action) {
  clearAppError();
  try {
    await action();
  } catch (error) {
    showAppError(error.message);
    if (error.status === 409 || error.status === 404) await reloadShipmentList();
    else renderShipments();
    alert(`Nie udało się wykonać operacji: ${error.message}`);
  }
}

// Pobiera listę przesyłek z serwera i renderuje tabelę.
async function loadShipments() {
  shipments = await window.shipmentApi.list();
  clearAppError();
  renderShipments();
}

// Przełącza interfejs z ekranu logowania na aplikację dla zalogowanego użytkownika.
function showSignedIn(user) {
  loginScreen.hidden = true;
  appContent.hidden = false;
  currentUserName.textContent = user.username;
  document.body.dataset.role = user.role || "viewer";
  if (user.role !== "admin" && !document.getElementById("auditModule").hidden) switchModule("shipmentsModule");
  loginError.hidden = true;
  loginError.textContent = "";
  window.dispatchEvent(new Event("user-signed-in"));
}

// Podłącza obsługę logowania, wylogowania, wygaśnięcia sesji i odświeżania listy.
function initSession() {
  // Odświeżanie listy przesyłek (także po przyjęciu przesyłki na magazyn).

  reloadShipmentList = async () => {
    try {
      await loadShipments();
      return true;
    } catch (error) {
      showAppError(`Nie udało się odświeżyć listy przesyłek: ${error.message}`);
      return false;
    }
  };
  window.addEventListener("shipment-inventory-received", () => reloadShipmentList());

  // Formularz logowania.

  loginForm.addEventListener("submit", async event => {
    event.preventDefault();
    loginError.hidden = true;
    const button = loginForm.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      const { user } = await window.shipmentApi.login(loginUsername.value.trim(), loginPassword.value);
      loginPassword.value = "";
      showSignedIn(user);
      try {
        await loadShipments();
      } catch (error) {
        showAppError(`Nie udało się pobrać listy przesyłek: ${error.message}`);
      }
    } catch (error) {
      loginError.textContent = error.message;
      loginError.hidden = false;
    } finally {
      button.disabled = false;
    }
  });

  // Wylogowanie.

  logoutButton.addEventListener("click", () => runServerAction(async () => {
    await window.shipmentApi.logout();
    shipments = [];
    appContent.hidden = true;
    loginScreen.hidden = false;
    loginForm.reset();
    loginUsername.focus();
  }));

  // Komunikat po wygaśnięciu sesji.

  window.addEventListener("session-expired", () => {
    shipments = [];
    appContent.hidden = true;
    loginScreen.hidden = false;
    loginError.textContent = "Sesja wygasła. Zaloguj się ponownie.";
    loginError.hidden = false;
    loginPassword.value = "";
  });

  // Ręczne odświeżenie listy.

  refreshAppButton.addEventListener("click", async () => {
    if (await reloadShipmentList()) showToast("Lista przesyłek została odświeżona.");
  });
}
