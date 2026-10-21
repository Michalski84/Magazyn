// Stan modułu magazynu: dostęp do API, skrót do elementów DOM, wspólny obiekt stanu i filtry kolumn.

// Klient API modułu magazynu.
const api = window.shipmentApi.warehouse;

// Skrót pobierania elementu po id.
const byId = id => document.getElementById(id);

// Dane pobrane z serwera oraz stan edycji dokumentu WZ.
const state = {
  companies: [],
  recipients: [],
  projects: [],
  warehouses: [],
  items: [],
  stock: [],
  issues: [],
  movements: [],
  editingIssueId: null
};

// Wiersze stanów aktualnie widoczne w tabeli (po filtrach).
let visibleStock = [];

// Id pozycji magazynowych zaznaczonych ptaszkiem w tabeli stanów (do utworzenia WZ).
const selectedStockIds = new Set();

// Zakładki przełączające moduły aplikacji.
const tabs = document.querySelectorAll(".module-tab");

// Lista wyboru spółki w formularzu przesyłek (używana przy przyjęciu przesyłki).
const warehouseCompanySelect = byId("nazwaSpolkiSelect");

// Wartości filtrów poszczególnych kolumn tabeli stanów.
const columnFilters = {};
