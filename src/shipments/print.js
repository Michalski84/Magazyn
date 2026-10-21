// Wydruk potwierdzenia odbioru przesyłki.
// Otwiera okno wydruku potwierdzenia odbioru przesyłki.
function printReceipt(id) {
  const entry = shipments.find(shipment => String(shipment.id) === String(id));
  if (!entry) return;

  const contents = Array.isArray(entry.zawartosc) ? entry.zawartosc : [];
  const contentsHTML = `
    <table border="1" cellpadding="5" cellspacing="0" style="border-collapse: collapse; width: 100%;">
      <tr style="background-color: #f0f0f0;">
        <th>Nazwa</th><th>Ilość</th><th>Jednostka</th><th>Numer seryjny</th>
      </tr>
      ${contents.map(item => `
        <tr>
          <td>${escapeHTML(item.nazwa)}</td>
          <td>${escapeHTML(item.ilosc)}</td>
          <td>${escapeHTML(item.jednostka)}</td>
          <td>${escapeHTML(item.serial)}</td>
        </tr>
      `).join("")}
    </table>
  `;
  const details = [
    ["Numer ID", entry.numerId],
    ["Firma przewozowa", entry.firma],
    ["Numer listu przewozowego", entry.numerListu],
    ["Data przyjęcia", entry.data],
    ["Adresat", entry.odbiorca],
    ["Nadawca", entry.nadawca],
    ["Rodzaj przesyłki", formatShipmentTypeAndQuantity(entry)],
    ["Zawartość", contentsHTML],
    ["Numer zamówienia", entry.zamowienie],
    ["Numer projektu", entry.projekt]
  ];
  const html = `
    <!DOCTYPE html>
    <html lang="pl">
      <head>
        <meta charset="utf-8">
        <title>Potwierdzenie odbioru</title>
      </head>
      <body style="font-family: Arial, sans-serif; font-size: 11pt;">
        <h1 style="text-align: center; font-size: 18pt; margin-bottom: 48px;">Potwierdzenie odbioru</h1>
        <table border="0" cellpadding="5" cellspacing="0" style="border-collapse: collapse; width: 100%;">
          ${details.map(([label, value]) => `
            <tr>
              <th align="left" valign="top" style="width: 30%;">${label}</th>
              <td>${label === "Zawartość" ? value : escapeHTML(value)}</td>
            </tr>
          `).join("")}
        </table>
        <table border="0" cellpadding="12" cellspacing="0" style="margin-top: 110px; width: 100%; text-align: center;">
          <tr>
            <td style="width: 38%; vertical-align: top;">
              <div style="height: 55px; border-bottom: 1px solid #000;"></div>
              <p>Wystawił</p>
            </td>
            <td style="width: 24%; vertical-align: top;">&nbsp;</td>
            <td style="width: 38%; vertical-align: top;">
              <div style="height: 55px; border-bottom: 1px solid #000;"></div>
              <p>Odebrał</p>
              <div style="height: 35px; margin-top: 30px; border-bottom: 1px solid #000;"></div>
              <p>Data odbioru</p>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    alert("Nie udało się otworzyć okna wydruku.");
    return;
  }
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  setTimeout(() => {
    printWindow.focus();
    printWindow.print();
  }, 300);
}
