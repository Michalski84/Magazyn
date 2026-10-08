async function apiRequest(path, options = {}) {
  const response = await fetch(`/api${path}`, {
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
    const error = new Error(result?.error || `Błąd serwera (${response.status}).`);
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
  login: (username, password) => apiRequest("/auth/login", {
    method: "POST",
    body: { username, password }
  }),
  logout: () => apiRequest("/auth/logout", { method: "POST" }),
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
  })
};
