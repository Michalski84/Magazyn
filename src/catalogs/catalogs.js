// Moduły katalogów: spółki, odbiorcy i lista projektów (formularze, tabele, dodawanie, edycja, usuwanie).
document.addEventListener("DOMContentLoaded", () => {
  const api = window.shipmentApi.catalogs;
  // Konfiguracja każdego katalogu: identyfikatory elementów, pola, komunikaty i operacje API.
  const catalogs = {
    companies: {
      module: "companiesModule",
      form: "companyCatalogForm",
      title: "companyCatalogTitle",
      table: "companiesCatalogTable",
      fields: ["name", "street", "buildingNumber", "postalCode", "city", "nip"],
      columns: ["name", "street", "buildingNumber", "postalCode", "city", "nip"],
      addedMessage: "Spółka została dodana.",
      updatedMessage: "Dane spółki zostały zaktualizowane.",
      list: api.companies,
      create: api.createCompany,
      update: api.updateCompany,
      remove: api.deleteCompany,
      removedMessage: "Spółka została usunięta."
    },
    recipients: {
      module: "recipientsModule",
      form: "recipientCatalogForm",
      title: "recipientCatalogTitle",
      table: "recipientsCatalogTable",
      fields: ["name", "street", "buildingNumber", "postalCode", "city", "address2", "contactPerson", "phone"],
      columns: ["name", "street", "buildingNumber", "postalCode", "city", "address2", "contactPerson", "phone"],
      addedMessage: "Odbiorca został dodany.",
      updatedMessage: "Dane odbiorcy zostały zaktualizowane.",
      list: api.recipients,
      create: api.createRecipient,
      update: api.updateRecipient,
      remove: api.deleteRecipient,
      removedMessage: "Odbiorca został usunięty."
    },
    projects: {
      module: "projectsModule",
      form: "projectCatalogForm",
      title: "projectCatalogTitle",
      table: "projectsCatalogTable",
      fields: ["projectNumber", "companyId", "shortName", "fullName", "endDate"],
      columns: ["projectNumber", "companyName", "shortName", "fullName", "endDate"],
      addedMessage: "Projekt został dodany.",
      updatedMessage: "Projekt został zaktualizowany.",
      list: api.projects,
      create: api.createProject,
      update: api.updateProject,
      remove: api.deleteProject,
      removedMessage: "Projekt został usunięty."
    }
  };
  const entries = { companies: [], recipients: [], projects: [] };

  Object.entries(catalogs).forEach(([key, config]) => {
    const form = document.getElementById(config.form);
    const title = document.getElementById(config.title);
    const tbody = document.querySelector(`#${config.table} tbody`);

    document.querySelector(`[data-catalog-add="${key}"]`).addEventListener("click", () => {
      form.reset();
      form.elements.id.value = "";
      title.textContent = key === "companies" ? "Nowa spółka" : key === "recipients" ? "Nowy odbiorca" : "Nowy projekt";
      form.hidden = false;
      form.scrollIntoView({ behavior: "smooth", block: "start" });
      form.elements[config.fields[0]].focus();
    });

    form.addEventListener("submit", event => {
      event.preventDefault();
      run(async () => {
        const id = form.elements.id.value;
        const values = Object.fromEntries(config.fields.map(field => [field, form.elements[field].value]));
        await (id ? config.update(id, values) : config.create(values));
        window.dispatchEvent(new Event("catalogs-updated"));
        form.reset();
        form.hidden = true;
        await refresh();
        showToast(id ? config.updatedMessage : config.addedMessage);
      });
    });

    form.querySelector("[data-catalog-cancel]").addEventListener("click", () => {
      form.reset();
      form.hidden = true;
    });

    // Rysuje tabelę katalogu; w wierszu przyciski „Edytuj” (wypełnia formularz) i „Usuń” (z potwierdzeniem).
    function render() {
      tbody.replaceChildren();
      entries[key].forEach(record => {
        const row = document.createElement("tr");
        config.columns.forEach(field => {
          const cell = document.createElement("td");
          cell.textContent = field === "companyName"
            ? entries.companies.find(company => String(company.id) === String(record.companyId))?.name ?? ""
            : String(record[field] ?? "");
          if (key === "projects" && field === "projectNumber") {
            cell.title = record.shortName;
            cell.setAttribute("aria-label", `${record.projectNumber} — ${record.shortName}`);
          }
          row.appendChild(cell);
        });
        const role = document.body.dataset.role;
        const canEdit = role === "admin" || (role === "warehouse" && key === "companies");
        const canDelete = role === "admin";
        const actions = document.createElement("td");
        const edit = document.createElement("button");
        edit.type = "button";
        edit.textContent = "Edytuj";
        edit.hidden = !canEdit;
        edit.addEventListener("click", () => {
          form.reset();
          form.elements.id.value = record.id;
          config.fields.forEach(field => {
            form.elements[field].value = record[field] || "";
          });
          title.textContent = key === "companies" ? "Edytuj spółkę" : key === "recipients" ? "Edytuj odbiorcę" : "Edytuj projekt";
          form.hidden = false;
          form.scrollIntoView({ behavior: "smooth", block: "start" });
          form.elements[config.fields[0]].focus();
        });
        actions.appendChild(edit);
        const remove = document.createElement("button");
        remove.type = "button";
        remove.textContent = "Usuń";
        remove.hidden = !canDelete;
        remove.addEventListener("click", () => {
          const label = record.name || record.projectNumber;
          if (!confirm(`Usunąć „${label}”? Tej operacji nie można cofnąć.`)) return;
          run(async () => {
            await config.remove(record.id);
            window.dispatchEvent(new Event("catalogs-updated"));
            if (!form.hidden && form.elements.id.value === String(record.id)) {
              form.reset();
              form.hidden = true;
            }
            await refresh();
            showToast(config.removedMessage);
          });
        });
        actions.appendChild(remove);
        row.appendChild(actions);
        tbody.appendChild(row);
      });
    }
    config.render = render;
  });

  // Odświeżanie danych po zalogowaniu i po wejściu w moduł katalogu.
  window.addEventListener("user-signed-in", refresh);
  window.addEventListener("module-selected", event => {
    if (Object.values(catalogs).some(catalog => catalog.module === event.detail)) refresh();
  });

  // Uzupełnia listę spółek w formularzu projektu, zachowując wybraną wartość.
  function fillProjectCompanySelect() {
    const select = document.getElementById("projectCatalogForm").elements.companyId;
    const selected = select.value;
    select.replaceChildren(new Option("Wybierz spółkę", ""));
    entries.companies.forEach(company => select.add(new Option(company.name, company.id)));
    select.value = selected;
  }

  // Pobiera wszystkie katalogi z API i rysuje ich tabele.
  async function refresh() {
    try {
      const [companies, recipients, projects] = await Promise.all([
        catalogs.companies.list(),
        catalogs.recipients.list(),
        catalogs.projects.list()
      ]);
      Object.assign(entries, { companies, recipients, projects });
      fillProjectCompanySelect();
      Object.values(catalogs).forEach(config => config.render());
    } catch (error) {
      showToast(`Nie udało się pobrać kartotek: ${error.message}`, "error");
    }
  }

  // Wykonuje akcję i pokazuje błąd jako komunikat zamiast wyjątku.
  async function run(action) {
    try {
      await action();
    } catch (error) {
      showToast(error.message, "error");
    }
  }

  // Udostępnia odświeżanie katalogów innym modułom (np. po zmianie słowników w magazynie).
  window.refreshCatalogData = refresh;
});
