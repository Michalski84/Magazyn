// Punkt wejścia modułu przesyłek: po załadowaniu strony podłącza zdarzenia i uruchamia aplikację.
document.addEventListener("DOMContentLoaded", function () {
  // Podłączenie obsługi zdarzeń poszczególnych fragmentów interfejsu.
  initSignature();
  initUi();
  initSession();
  initNotes();
  initExcel();
  initTable();
  initForm();
  initFilters();

  // Start aplikacji: pusty formularz, sprawdzenie sesji i pobranie listy przesyłek.
  addZawartoscField();
  loginUsername.focus();

  window.shipmentApi.session().then(async ({ user }) => {
    if (!user) return;
    showSignedIn(user);
    try {
      await loadShipments();
    } catch (error) {
      showAppError(`Nie udało się pobrać listy przesyłek: ${error.message}`);
    }
  }).catch(error => {
    loginError.textContent = `Nie udało się połączyć z serwerem: ${error.message}`;
    loginError.hidden = false;
  });

  // Rejestracja service workera.
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").catch(error => {
      showAppError(`Nie udało się zaktualizować obsługi pamięci podręcznej: ${error.message}`);
    });
  }

  // Automatyczne odświeżanie listy co 30 sekund, gdy karta jest widoczna.
  window.setInterval(() => {
    if (!document.hidden && !appContent.hidden) reloadShipmentList();
  }, 30_000);
});
