// Podgląd dokumentu WZ przed zatwierdzeniem: okno z danymi stron i pozycjami do sprawdzenia.

// Tworzy element z tekstem (pomocnik budowy okna podglądu).
function previewElement(tag, text, className) {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
}

// Pokazuje podgląd WZ i zwraca obietnicę: true po „Zatwierdź i wydaj”, false po „Wróć do edycji”.
function confirmIssuePreview(lines) {
  return new Promise(resolve => {
    const warehouse = byId("issueWarehouse").selectedOptions[0]?.textContent || "";
    const recipient = byId("issueRecipient").selectedOptions[0]?.textContent || "—";
    const overlay = previewElement("div", undefined, "issue-preview-overlay");
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    const box = previewElement("div", undefined, "issue-preview");
    box.append(previewElement("h3", "Podgląd dokumentu WZ"));

    const header = previewElement("dl", undefined, "issue-preview-header");
    [
      ["Magazyn", warehouse],
      ["Data wydania", byId("issueDate").value || "—"],
      ["Odbiorca", recipient],
      ["Projekt", byId("issueProjectNumber").value || "—"]
    ].forEach(([label, value]) => header.append(previewElement("dt", label), previewElement("dd", value)));
    box.append(header);
    box.append(previewElement("pre", byId("issueSellerDetails").textContent, "issue-preview-party"));
    box.append(previewElement("pre", byId("issueRecipientDetails").textContent, "issue-preview-party"));

    const table = previewElement("table", undefined, "issue-preview-table");
    const head = table.createTHead().insertRow();
    ["Lp.", "Pozycja", "SN", "Ilość"].forEach(title => head.append(previewElement("th", title)));
    const body = table.createTBody();
    let total = 0;
    lines.forEach((line, index) => {
      const stock = state.stock.find(item => String(item.stockEntryId) === String(line.stockEntryId));
      const quantity = Number(line.quantity) || 0;
      total += quantity;
      const row = body.insertRow();
      row.append(
        previewElement("td", String(index + 1)),
        previewElement("td", stock ? stock.name : "—"),
        previewElement("td", line.serialNumber || ""),
        previewElement("td", `${quantity} ${stock?.unit || ""}`.trim())
      );
    });
    box.append(table);
    box.append(previewElement("p", `Pozycji: ${lines.length}, łączna ilość: ${total}`, "issue-preview-total"));

    const actions = previewElement("div", undefined, "issue-preview-actions");
    const confirm = previewElement("button", "Zatwierdź i wydaj towar");
    confirm.type = "button";
    const back = previewElement("button", "Wróć do edycji", "secondary");
    back.type = "button";
    const close = answer => {
      document.removeEventListener("keydown", onKey);
      overlay.remove();
      resolve(answer);
    };
    const onKey = event => {
      if (event.key === "Escape") close(false);
    };
    confirm.addEventListener("click", () => close(true));
    back.addEventListener("click", () => close(false));
    document.addEventListener("keydown", onKey);
    actions.append(back, confirm);
    box.append(actions);
    overlay.append(box);
    document.body.append(overlay);
    confirm.focus();
  });
}
