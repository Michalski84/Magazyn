// Klient API: wspólna funkcja zapytań HTTP oraz metody window.shipmentApi dla wszystkich modułów.
// Pojedyncze zapytanie do /api: obsługuje JSON, błędy serwera i wygaśnięcie sesji (401).
async function apiRequest(path, options = {}) {
  const url = `/api${path}`;
  const method = options.method || "GET";
  const response = await fetch(url, {
    ...options,
    credentials: "same-origin",
    headers: {
      ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
      ...options.headers
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });

  if (response.status === 204) return null;
  const result = await response.json().catch(() => null);
  if (!response.ok) {
    const message = result?.error || `Błąd serwera (${response.status}).`;
    const error = new Error(`${message} [${method} ${url}, HTTP ${response.status}]`);
    error.status = response.status;
    if (response.status === 401 && !path.startsWith("/auth/")) {
      window.dispatchEvent(new Event("session-expired"));
    }
    throw error;
  }
  return result;
}

window.shipmentApi = {
  session: () => apiRequest("/auth/session"),
  register: (username, password, passwordConfirmation) => apiRequest("/auth/register", {
    method: "POST",
    body: { username, password, passwordConfirmation }
  }),
  login: (username, password) => apiRequest("/auth/login", {
    method: "POST",
    body: { username, password }
  }),
  logout: () => apiRequest("/auth/logout", { method: "POST" }),
  audit: (params = {}) => apiRequest(`/admin/audit?${new URLSearchParams(params)}`),
  admin: {
    users: () => apiRequest("/admin/users"),
    updateUser: (id, user) => apiRequest(`/admin/users/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: user
    }),
    deleteUser: id => apiRequest(`/admin/users/${encodeURIComponent(id)}`, { method: "DELETE" })
  },
  list: () => apiRequest("/shipments"),
  create: shipment => apiRequest("/shipments", { method: "POST", body: shipment }),
  update: (id, shipment) => apiRequest(`/shipments/${id}`, { method: "PUT", body: shipment }),
  patch: (id, patch) => apiRequest(`/shipments/${id}`, { method: "PATCH", body: patch }),
  remove: (id, version) => apiRequest(`/shipments/${id}`, {
    method: "DELETE",
    body: { version }
  }),
  import: shipments => apiRequest("/shipments/import", {
    method: "POST",
    body: { shipments }
  }),
  catalogs: {
    companies: () => apiRequest("/catalogs/companies"),
    createCompany: company => apiRequest("/catalogs/companies", { method: "POST", body: company }),
    updateCompany: (id, company) => apiRequest(`/catalogs/companies/${id}`, {
      method: "PUT",
      body: company
    }),
    recipients: () => apiRequest("/catalogs/recipients"),
    createRecipient: recipient => apiRequest("/catalogs/recipients", {
      method: "POST",
      body: recipient
    }),
    updateRecipient: (id, recipient) => apiRequest(`/catalogs/recipients/${id}`, {
      method: "PUT",
      body: recipient
    }),
    projects: () => apiRequest("/catalogs/projects"),
    createProject: project => apiRequest("/catalogs/projects", { method: "POST", body: project }),
    updateProject: (id, project) => apiRequest(`/catalogs/projects/${id}`, {
      method: "PUT",
      body: project
    }),
    deleteCompany: id => apiRequest(`/catalogs/companies/${id}`, { method: "DELETE" }),
    deleteRecipient: id => apiRequest(`/catalogs/recipients/${id}`, { method: "DELETE" }),
    deleteProject: id => apiRequest(`/catalogs/projects/${id}`, { method: "DELETE" })
  },
  orders: {
    list: () => apiRequest("/orders"),
    suggest: prefix => apiRequest(`/orders/suggestions?${new URLSearchParams({ prefix })}`),
    create: order => apiRequest("/orders", { method: "POST", body: order }),
    update: (id, order) => apiRequest(`/orders/${id}`, { method: "PUT", body: order }),
    patch: (id, patch) => apiRequest(`/orders/${id}`, { method: "PATCH", body: patch })
  },
  warehouse: {
    companies: () => apiRequest("/warehouse/companies"),
    warehouses: () => apiRequest("/warehouse/warehouses"),
    createWarehouse: warehouse => apiRequest("/warehouse/warehouses", { method: "POST", body: warehouse }),
    updateWarehouse: (id, warehouse) => apiRequest(`/warehouse/warehouses/${id}`, {
      method: "PUT",
      body: warehouse
    }),
    deleteWarehouse: id => apiRequest(`/warehouse/warehouses/${id}`, { method: "DELETE" }),
    items: companyId => apiRequest(`/warehouse/items${companyId ? `?companyId=${encodeURIComponent(companyId)}` : ""}`),
    createItem: item => apiRequest("/warehouse/items", { method: "POST", body: item }),
    stock: filters => {
      const query = new URLSearchParams(Object.entries(filters || {}).filter(([, value]) => value));
      const suffix = query.toString();
      return apiRequest(`/warehouse/stock${suffix ? `?${suffix}` : ""}`);
    },
    movements: filters => {
      const query = new URLSearchParams(Object.entries(filters || {}).filter(([, value]) => value));
      const suffix = query.toString();
      return apiRequest(`/warehouse/movements${suffix ? `?${suffix}` : ""}`);
    },
    issues: () => apiRequest("/warehouse/issues"),
    issue: id => apiRequest(`/warehouse/issues/${id}`),
    createIssue: issue => apiRequest("/warehouse/issues", { method: "POST", body: issue }),
    updateIssue: (id, issue) => apiRequest(`/warehouse/issues/${id}`, { method: "PUT", body: issue }),
    createTransfer: transfer => apiRequest("/warehouse/transfers", { method: "POST", body: transfer }),
    cancelIssue: id => apiRequest(`/warehouse/issues/${id}/cancel`, { method: "POST" }),
    adjustment: adjustment => apiRequest("/warehouse/adjustments", { method: "POST", body: adjustment }),
    updateStockEntry: (id, data) => apiRequest(`/warehouse/stock/${id}`, { method: "PUT", body: data }),
    deleteStockEntry: id => apiRequest(`/warehouse/stock/${id}`, { method: "DELETE" }),
    receiveShipment: id => apiRequest(`/warehouse/receive-shipment/${id}`, { method: "POST" })
  }
};
