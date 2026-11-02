// Wydania zewnętrzne (WZ): formularz, edycja dokumentu, dane stron i sposób dostawy.

// Wyświetla dane sprzedawcy i odbiorcy w formularzu WZ.
function renderIssueParties(fromRecipientSelect = false) {
  const warehouse = state.warehouses.find(item => String(item.id) === byId("issueWarehouse").value);
  const selectedEntry = Array.from(byId("issueLines").querySelectorAll("select"))
    .map(select => state.stock.find(item => String(item.stockEntryId) === select.value))
    .find(Boolean);
  const companyId = selectedEntry?.companyId || warehouse?.companyId;
  const company = state.companies.find(item => String(item.id) === String(companyId));
  const recipient = selectedIssueRecipient();
  const address = party => [
    [party.street, party.buildingNumber].filter(Boolean).join(" "),
    [party.postalCode, party.city].filter(Boolean).join(" ")
  ].filter(Boolean).join("\n");
  const sellerDetails = byId("issueSellerDetails");
  const recipientDetails = byId("issueRecipientText");
  sellerDetails.textContent = company
    ? `Sprzedawca: ${company.name}${address(company) ? `\n${address(company)}` : ""}${company.nip ? `\nNIP: ${company.nip}` : ""}`
    : "Sprzedawca: uzupełnij dane spółki w kartotece Spółki.";
  if (!fromRecipientSelect) return;
  recipientDetails.value = recipient
    ? [
      recipient.name,
      address(recipient),
      recipient.address2,
      recipient.contactPerson ? `Kontakt: ${recipient.contactPerson}` : "",
      recipient.phone ? `Tel. ${recipient.phone}` : ""
    ].filter(Boolean).join("\n")
    : "";
  recipientDetails.dataset.generated = recipientDetails.value;
}

// Zwraca id zapisanego odbiorcy tylko gdy tekst odbiorcy nie został zmieniony ręcznie.
function linkedRecipientId() {
  const text = byId("issueRecipientText");
  const recipient = selectedIssueRecipient();
  return recipient && text.value === text.dataset.generated ? String(recipient.id) : "";
}

// Automatycznie uzupełnia numer projektu na podstawie wybranych pozycji.
function updateIssueProject() {
  const field = byId("issueProjectNumber");
  if (state.editingIssueId || field.dataset.manual) return;
  const projects = Array.from(byId("issueLines").querySelectorAll(".issue-line select"))
    .map(select => state.stock.find(item => String(item.stockEntryId) === select.value)?.projectNumber)
    .filter(Boolean);
  field.value = [...new Set(projects)].join(", ");
}

// Przełącza formularz WZ między tworzeniem a edycją.
function setIssueFormMode(issue) {
  const wasEditing = Boolean(state.editingIssueId);
  const editing = Boolean(issue);
  state.editingIssueId = issue ? issue.id : null;
  byId("issueFormTitle").textContent = editing
    ? `Edycja dokumentu ${issue.documentNo}`
    : "Dokument WZ — wydanie towaru";
  byId("issueSubmitButton").textContent = editing ? "Zapisz zmiany" : "Zatwierdź WZ i wydaj towar";
  byId("issueLines").hidden = editing;
  byId("addIssueLineButton").hidden = editing;
  byId("issueCreateNote").hidden = editing;
  byId("issueEditNote").hidden = !editing;
  byId("issueWarehouse").disabled = editing;
  if (wasEditing || editing) {
    byId("issueCreateForm").reset();
    byId("issueLines").replaceChildren();
    byId("issueProjectNumber").dataset.manual = "";
  }
  if (!editing) updateIssueDeliveryFields();
}

// Wypełnia formularz WZ do edycji istniejącego dokumentu.
function editIssue(issue) {
  setIssueFormMode(issue);
  showForm("issueCreateForm");
  byId("issueWarehouse").value = String(issue.warehouseId);
  byId("issueDate").value = issue.issueDate;
  const savedRecipient = state.recipients.find(item => item.id === issue.recipientId);
  byId("issueRecipient").value = savedRecipient ? recipientLabel(savedRecipient) : "";
  byId("issueRecipientText").value = [
    issue.issuedTo,
    issue.recipientAddress,
    issue.recipientAddress2,
    issue.recipientContact ? `Kontakt: ${issue.recipientContact}` : "",
    issue.recipientPhone ? `Tel. ${issue.recipientPhone}` : ""
  ].filter(Boolean).join("\n");
  byId("issueRecipientText").dataset.generated = issue.recipientId ? byId("issueRecipientText").value : "";
  byId("issueProjectNumber").value = issue.projectNumber || "";
  byId("issueDeliveryMethod").value = issue.deliveryMethod || "";
  updateIssueDeliveryFields();
  byId("issueTrackingNumber").value = issue.deliveryTrackingNumber || "";
  byId("issueReceivingPerson").value = issue.receivingPerson || "";
  renderIssueParties();
  byId("issueCreateForm").scrollIntoView({ behavior: "smooth", block: "start" });
}

// Otwiera formularz WZ z pozycjami zaznaczonymi w tabeli stanów (domyślnie pełny stan każdej pozycji).
function openIssueFormWithEntries(entries) {
  setIssueFormMode(null);
  showForm("issueCreateForm");
  byId("issueWarehouse").value = String(entries[0].warehouseId);
  byId("issueDate").value ||= today();
  updateIssueItemOptions();
  byId("issueLines").replaceChildren();
  entries.forEach(stock => addIssueLine({ stockEntryId: stock.stockEntryId, quantity: stock.quantityOnHand }));
  byId("issueProjectNumber").dataset.manual = "";
  updateIssueProject();
  renderIssueParties();
  byId("issueCreateForm").scrollIntoView({ behavior: "smooth", block: "start" });
}

// Pokazuje pola zależne od sposobu dostawy.
function updateIssueDeliveryFields() {
  const method = byId("issueDeliveryMethod").value;
  const trackingField = byId("issueTrackingNumberField");
  const receivingField = byId("issueReceivingPersonField");
  const trackingInput = byId("issueTrackingNumber");
  const receivingInput = byId("issueReceivingPerson");
  trackingField.hidden = method !== "courier";
  receivingField.hidden = method !== "personal_pickup";
  trackingInput.required = method === "courier";
  receivingInput.required = method === "personal_pickup";
  if (method !== "courier") trackingInput.value = "";
  if (method !== "personal_pickup") receivingInput.value = "";
}

// Podpina formularz WZ i jego pola.
function initWarehouseIssues() {
  byId("showIssueFormButton").addEventListener("click", () => {
    setIssueFormMode(null);
    showForm("issueCreateForm");
    byId("issueDate").value ||= today();
    updateIssueItemOptions();
    if (!byId("issueLines").children.length) addIssueLine();
  });
  byId("issueWarehouse").addEventListener("change", updateIssueItemOptions);
  byId("issueWarehouse").addEventListener("change", renderIssueParties);
  byId("issueRecipient").addEventListener("change", () => renderIssueParties(true));
  byId("issueLines").addEventListener("change", renderIssueParties);
  byId("issueDeliveryMethod").addEventListener("change", updateIssueDeliveryFields);
  byId("issueLines").addEventListener("change", updateIssueProject);
  byId("issueWarehouse").addEventListener("change", updateIssueProject);
  byId("issueProjectNumber").addEventListener("input", event => {
    event.target.dataset.manual = event.target.value ? "1" : "";
  });
  byId("addIssueLineButton").addEventListener("click", () => addIssueLine());
  byId("issueCreateForm").addEventListener("submit", event => {
    event.preventDefault();
    const form = event.currentTarget;
    run(async () => {
      if (state.editingIssueId) {
        const issue = await api.updateIssue(state.editingIssueId, {
          issueDate: byId("issueDate").value,
          recipientId: linkedRecipientId(),
          recipientText: byId("issueRecipientText").value,
          projectNumber: byId("issueProjectNumber").value,
          deliveryMethod: byId("issueDeliveryMethod").value,
          deliveryTrackingNumber: byId("issueTrackingNumber").value,
          receivingPerson: byId("issueReceivingPerson").value
        });
        setIssueFormMode(null);
        form.hidden = true;
        await refreshWarehouseData();
        showToast(`Zapisano zmiany w dokumencie ${issue.documentNo}.`);
        return;
      }
      const lines = Array.from(byId("issueLines").querySelectorAll(".issue-line")).map(row => ({
        stockEntryId: row.querySelector("select").value,
        quantity: row.querySelector("input[type=number]").value,
        serialNumber: row.querySelector(".issue-line-serial").value
      }));
      if (!await confirmIssuePreview(lines)) return;
      const issue = await api.createIssue({
        warehouseId: byId("issueWarehouse").value,
        issueDate: byId("issueDate").value,
        recipientId: linkedRecipientId(),
        recipientText: byId("issueRecipientText").value,
        projectNumber: byId("issueProjectNumber").value,
        deliveryMethod: byId("issueDeliveryMethod").value,
        deliveryTrackingNumber: byId("issueTrackingNumber").value,
        receivingPerson: byId("issueReceivingPerson").value,
        lines
      });
      form.reset();
      byId("issueLines").innerHTML = "";
      byId("issueProjectNumber").dataset.manual = "";
      updateIssueDeliveryFields();
      form.hidden = true;
      selectedStockIds.clear();
      await refreshWarehouseData();
      showToast(`Wydano towar dokumentem ${issue.documentNo}.`);
      printIssue(issue);
    });
  });
}
