// Lista dokumentów WZ (z filtrami) oraz wydruk dokumentu wydania.

// Zwraca dokumenty WZ spełniające aktualne filtry (numer, odbiorca, projekt, zakres dat, status).
function filteredIssues() {
  const search = byId("issueFilterSearch").value.trim().toLocaleLowerCase("pl-PL");
  const recipientId = byId("issueFilterRecipient").value;
  const project = byId("issueFilterProject").value.trim().toLocaleLowerCase("pl-PL");
  const from = byId("issueFilterFrom").value;
  const to = byId("issueFilterTo").value;
  const status = byId("issueFilterStatus").value;
  return state.issues.filter(issue => {
    const date = String(issue.issueDate ?? "").slice(0, 10);
    return (!search || String(issue.documentNo ?? "").toLocaleLowerCase("pl-PL").includes(search)) &&
      (!recipientId || String(issue.recipientId) === recipientId) &&
      (!project || String(issue.projectNumber ?? "").toLocaleLowerCase("pl-PL").includes(project)) &&
      (!from || date >= from) &&
      (!to || date <= to) &&
      (!status || issue.status === status);
  });
}

// Wypełnia listę odbiorców w filtrze listy WZ, zachowując wybór.
function populateIssueFilterRecipients() {
  const select = byId("issueFilterRecipient");
  const previous = select.value;
  select.replaceChildren(new Option("Wszyscy odbiorcy", ""));
  state.recipients.forEach(recipient => select.add(new Option(recipient.name, String(recipient.id))));
  select.value = state.recipients.some(recipient => String(recipient.id) === previous) ? previous : "";
}

// Podpina filtry listy WZ.
function initIssueFilters() {
  ["issueFilterSearch", "issueFilterProject", "issueFilterFrom", "issueFilterTo"]
    .forEach(id => byId(id).addEventListener("input", renderIssues));
  ["issueFilterRecipient", "issueFilterStatus"]
    .forEach(id => byId(id).addEventListener("change", renderIssues));
  byId("issueFilterClear").addEventListener("click", () => {
    ["issueFilterSearch", "issueFilterRecipient", "issueFilterProject",
      "issueFilterFrom", "issueFilterTo", "issueFilterStatus"].forEach(id => {
      byId(id).value = "";
    });
    renderIssues();
  });
}

// Renderuje tabelę dokumentów WZ.
function renderIssues() {
  const tbody = byId("issuesTable").tBodies[0];
  tbody.replaceChildren();
  const issues = filteredIssues();
  byId("issueFilterCount").textContent = `Wyświetlono: ${issues.length} z ${state.issues.length}`;
  issues.forEach(issue => {
    const row = document.createElement("tr");
    [issue.documentNo, displayIssueDate(issue.issueDate), issue.companyName, issue.warehouseName, issue.issuedTo, issue.lineCount,
      issue.status === "issued" ? "Wydano" : "Anulowano"]
      .forEach(value => {
        const cell = document.createElement("td");
        cell.textContent = value ?? "";
        row.appendChild(cell);
      });
    const actions = document.createElement("td");
    const print = document.createElement("button");
    print.type = "button";
    print.textContent = "Drukuj";
    print.addEventListener("click", () => run(async () => printIssue(await api.issue(issue.id))));
    actions.appendChild(print);
    if (issue.status === "issued") {
      const edit = document.createElement("button");
      edit.type = "button";
      edit.textContent = "Edytuj";
      edit.addEventListener("click", () => run(async () => editIssue(await api.issue(issue.id))));
      actions.appendChild(edit);
      const cancel = document.createElement("button");
      cancel.type = "button";
      cancel.textContent = "Anuluj";
      cancel.addEventListener("click", () => run(async () => {
        if (!confirm(`Anulować ${issue.documentNo}? Stan zostanie przywrócony ruchem korygującym.`)) return;
        await api.cancelIssue(issue.id);
        await refreshWarehouseData();
        showToast(`Dokument ${issue.documentNo} anulowano.`);
      }));
      actions.appendChild(cancel);
    }
    row.appendChild(actions);
    tbody.appendChild(row);
  });
}

// Formatuje datę dokumentu do wyświetlenia.
function displayIssueDate(value) {
  const date = String(value ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return value ?? "";
  const [year, month, day] = date.split("-");
  return `${day}.${month}.${year}`;
}

// Otwiera wydruk dokumentu WZ.
function printIssue(issue) {
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    showToast("Przeglądarka zablokowała okno wydruku dokumentu WZ.", "error");
    return;
  }
  const lines = issue.lines.map((line, index) => `
    <tr><td>${index + 1}</td><td>${escapeHTML(line.name)}</td>
    <td>${escapeHTML(line.quantity)}</td><td>${escapeHTML(line.unit)}</td>
    <td>${escapeHTML(line.serialNumber || "—")}</td></tr>
  `).join("");
  const formatAddress = address => escapeHTML(address)
    .replace(/\r?\n/g, "<br>")
    .replace(/,\s*/g, "<br>");
  const sellerLines = [
    escapeHTML(issue.sellerName || issue.companyName),
    formatAddress(issue.sellerAddress),
    issue.sellerNip ? `NIP: ${escapeHTML(issue.sellerNip)}` : ""
  ].filter(Boolean).join("<br>");
  const recipientLines = [
    escapeHTML(issue.issuedTo),
    formatAddress(issue.recipientAddress),
    escapeHTML(issue.recipientAddress2),
    issue.recipientContact ? `Osoba kontaktowa: ${escapeHTML(issue.recipientContact)}` : "",
    issue.recipientPhone ? `Tel.: ${escapeHTML(issue.recipientPhone)}` : ""
  ].filter(Boolean).join("<br>");
  const deliveryLabels = {
    courier: "Kurier",
    personal_pickup: "Odbiór osobisty",
    own_transport: "Transport własny",
    dedicated_transport: "Transport dedykowany"
  };
  const deliveryDetails = [
    `<strong>Sposób dostawy:</strong> ${escapeHTML(deliveryLabels[issue.deliveryMethod] || issue.deliveryMethod || "—")}`,
    issue.deliveryMethod === "courier" && issue.deliveryTrackingNumber
      ? `Numer listu przewozowego: ${escapeHTML(issue.deliveryTrackingNumber)}` : "",
    issue.deliveryMethod === "personal_pickup" && issue.receivingPerson
      ? `Nazwisko osoby odbierającej: ${escapeHTML(issue.receivingPerson)}` : ""
  ].filter(Boolean).join("<br>");
  const issueDate = /^\d{4}-\d{2}-\d{2}$/.test(issue.issueDate)
    ? new Date(`${issue.issueDate}T00:00:00`).toLocaleDateString("pl-PL")
    : issue.issueDate;
  printWindow.document.write(`<!doctype html><html lang="pl"><meta charset="utf-8">
    <title>${escapeHTML(issue.documentNo)}</title>
    <style>
      body{font:14px Arial,sans-serif;margin:32px}
      .parties{display:flex;gap:32px;margin:24px 0}
      .party{flex:1;border:1px solid #888;padding:12px;line-height:1.5}
      .party h2{margin:0 0 8px;font-size:13px;text-transform:uppercase;color:#555}
      .document-details{display:flex;gap:32px;margin:18px 0}
      .document-details>div{flex:1}
      table.lines{border-collapse:collapse;width:100%}
      table.lines th,table.lines td{border:1px solid #888;padding:7px;text-align:left}
      .signatures{margin-top:90px;width:100%;table-layout:fixed;text-align:center}
      .signatures td{width:50%;vertical-align:top}
      .signature-line{display:block;width:80%;height:1em;margin:0 auto 4px;border-bottom:1px dotted #000}
    </style>
    <body>
    <h1 style="text-align:center">Wydanie zewnętrzne ${escapeHTML(issue.documentNo)}</h1>
    <p style="text-align:center">Data: <strong>${escapeHTML(issueDate)}</strong> &nbsp;|&nbsp;
    Magazyn: <strong>${escapeHTML(issue.warehouseName)}</strong>
    ${issue.status === "cancelled" ? "&nbsp;|&nbsp; <strong>ANULOWANO</strong>" : ""}</p>
    <div class="parties">
      <div class="party"><h2>Sprzedawca</h2>${sellerLines}</div>
      <div class="party"><h2>Odbiorca</h2>${recipientLines}</div>
    </div>
    <div class="document-details">
      <div><strong>Projekt:</strong> ${escapeHTML(issue.projectNumber || "—")}</div>
      <div>${deliveryDetails}</div>
    </div>
    <table class="lines">
    <thead><tr><th>Lp.</th><th>Nazwa towaru</th><th>Ilość</th><th>Jednostka</th><th>SN</th></tr></thead>
    <tbody>${lines}</tbody></table>
    <table class="signatures"><tr>
    <td><span class="signature-line"></span>Wydał</td>
    <td><span class="signature-line"></span>Odebrał<br><br>
    <span class="signature-line"></span>Data odbioru</td>
    </tr></table><script>window.onload=()=>window.print()<\/script></body></html>`);
  printWindow.document.close();
}
