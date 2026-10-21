// Odwołania do elementów DOM modułu przesyłek oraz stałe konfiguracyjne (nagłówki Excela).
const recipientNameInput = document.getElementById("recipientNameInput");

const form = document.getElementById("shipmentForm");
const addZawartoscButton = document.getElementById("addZawartoscButton");

const tableBody = document.querySelector("#shipmentsTable tbody");
const globalSearchInput = document.getElementById("globalSearchInput");
const resetFiltersButton = document.getElementById("resetFiltersButton");
const searchFilters = document.querySelectorAll(".search-filter");
const companySearchFilter = document.getElementById("companySearchFilter");
const tableColumnToggles = document.querySelectorAll(".table-column-toggle");
const shipmentNumberColorsToggle = document.getElementById("shipmentNumberColorsToggle");
const statusFilter = document.getElementById("statusFilter");
const shipmentSort = document.getElementById("shipmentSort");
const datePeriodFilter = document.getElementById("datePeriodFilter");
const dateRangeControls = document.getElementById("dateRangeControls");
const monthControls = document.getElementById("monthControls");
const dateFrom = document.getElementById("dateFrom");
const dateTo = document.getElementById("dateTo");
const shipmentMonth = document.getElementById("shipmentMonth");
const exportExcelButton = document.getElementById("exportExcelButton");
const exportVisibleExcelButton = document.getElementById("exportVisibleExcelButton");
const importExcelButton = document.getElementById("importExcelButton");
const importExcelFile = document.getElementById("importExcelFile");
const refreshAppButton = document.getElementById("refreshAppButton");
const notesModal = document.getElementById("notesModal");
const notesTextarea = document.getElementById("notesTextarea");
const notesSaveButton = document.getElementById("notesSaveButton");
const notesEditButton = document.getElementById("notesEditButton");
const notesDeleteButton = document.getElementById("notesDeleteButton");
const notesCloseButton = document.getElementById("notesCloseButton");
const appContent = document.getElementById("appContent");
const loginScreen = document.getElementById("loginScreen");
const loginForm = document.getElementById("loginForm");
const loginError = document.getElementById("loginError");
const loginUsername = document.getElementById("loginUsername");
const loginPassword = document.getElementById("loginPassword");
const logoutButton = document.getElementById("logoutButton");
const currentUserName = document.getElementById("currentUserName");
const appError = document.getElementById("appError");
const themeToggleButton = document.getElementById("themeToggleButton");
const excelHeaders = [
  "Numer ID", "Nazwa Spółki", "Firma przewozowa", "Numer listu", "Data przyjęcia", "Adresat", "Nadawca",
  "Rodzaj przesyłki", "Ilość przesyłek", "Zawartość", "Numer zamówienia", "Numer projektu", "Status",
  "Imię i nazwisko odbiorcy", "Notatki"
];
const scrollBehavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";

const companySelect = document.getElementById("nazwaSpolkiSelect");
const otherCompanyContainer = document.getElementById("otherCompanyContainer");
const otherCompanyInput = document.getElementById("otherCompanyInput");
