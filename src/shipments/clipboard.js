// Kopiowanie danych przesyłki do schowka (HTML i zwykły tekst).
// Funkcja kopiująca dane jednego rekordu do schowka
function copyToClipboard(id) {
  const entry = shipments.find(shipment => String(shipment.id) === String(id));
  if (!entry) return;
  const contents = Array.isArray(entry.zawartosc) ? entry.zawartosc : [];
  const shipmentId = entry.numerId ?? entry.id;

  const zawartoscHTML = `
    <table border="1" cellpadding="4" cellspacing="0" style="border-collapse: collapse; font-family: Arial; font-size: 14px;">
      <tr style="background-color: #f0f0f0;">
        <th>Nazwa</th>
        <th>Ilość</th>
        <th>Jednostka</th>
        <th>Numer seryjny</th>
      </tr>
      ${contents.map(z => `
        <tr>
          <td>${escapeHTML(z.nazwa)}</td>
          <td>${escapeHTML(z.ilosc)}</td>
          <td>${escapeHTML(z.jednostka)}</td>
          <td>${escapeHTML(z.serial)}</td>
        </tr>
      `).join("")}
    </table>
  `;

  const html = `
    <table border="0" cellpadding="5" cellspacing="0" style="font-family: Arial; font-size: 14px;">
      <tr><th align="left">Numer ID</th><td>${escapeHTML(shipmentId)}</td></tr>
      <tr><th align="left">Firma przewozowa</th><td>${escapeHTML(entry.firma)}</td></tr>
      <tr><th align="left">Numer listu przewozowego</th><td>${escapeHTML(entry.numerListu)}</td></tr>
      <tr><th align="left">Data przyjęcia</th><td>${escapeHTML(entry.data)}</td></tr>
      <tr><th align="left">Adresat</th><td>${escapeHTML(entry.odbiorca)}</td></tr>
      <tr><th align="left">Nadawca</th><td>${escapeHTML(entry.nadawca)}</td></tr>
      <tr><th align="left">Rodzaj przesyłki</th><td>${escapeHTML(formatShipmentTypeAndQuantity(entry))}</td></tr>
      <tr><th align="left">Zawartość</th><td>${zawartoscHTML}</td></tr>
      <tr><th align="left">Numer zamówienia</th><td>${escapeHTML(entry.zamowienie)}</td></tr>
      <tr><th align="left">Numer projektu</th><td>${escapeHTML(entry.projekt)}</td></tr>
    </table>
  `;
  const plainText = [
    `Numer ID: ${shipmentId || ""}`,
    `Firma przewozowa: ${entry.firma || ""}`,
    `Numer listu przewozowego: ${entry.numerListu || ""}`,
    `Data przyjęcia: ${entry.data || ""}`,
    `Adresat: ${entry.odbiorca || ""}`,
    `Nadawca: ${entry.nadawca || ""}`,
    `Rodzaj przesyłki: ${formatShipmentTypeAndQuantity(entry)}`,
    "Zawartość:",
    ...contents.map(item => `${item.nazwa || ""} (${item.ilosc || ""} ${item.jednostka || ""}${item.serial ? `, SN: ${item.serial}` : ""})`),
    `Numer zamówienia: ${entry.zamowienie || ""}`,
    `Numer projektu: ${entry.projekt || ""}`
  ].join("\n");

  const listener = (e) => {
    e.preventDefault();
    e.clipboardData.setData("text/html", html);
    e.clipboardData.setData("text/plain", plainText);
  };

  document.addEventListener("copy", listener);
  let copied;
  try {
    copied = document.execCommand("copy");
  } finally {
    document.removeEventListener("copy", listener);
  }
  showToast(
    copied ? "Dane przesyłki skopiowano do schowka." : "Nie udało się skopiować danych do schowka.",
    copied ? "success" : "error"
  );
}
