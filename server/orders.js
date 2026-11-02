// Zamówienia: każdy użytkownik widzi i edytuje tylko własne zamówienia, administrator wszystkie.
const { pool } = require("./database");
const { requireObject, text, recordId, notFound, invalid } = require("./catalogs/validation");

const STATUSES = ["zlozone", "potwierdzone", "zrealizowane", "anulowane"];
const CURRENCIES = ["PLN", "EUR", "USD"];
const ORDER_COMPANIES = new Set([
  "Maxto Technology",
  "Maxto ITS",
  "Maxto Technology Energy",
  "SES",
  "Maxto Consulting"
]);

const COLUMNS = `
  o.id, o.order_number AS "orderNumber", o.order_date::text AS "orderDate",
  o.supplier, o.company_id AS "companyId", o.company_name AS "companyName",
  o.item_name AS "itemName", o.quantity::float8 AS quantity, o.items, o.project_number AS "projectNumber",
  o.eod_salesforce_number AS "eodSalesforceNumber",
  COALESCE(o.order_value, 0)::float8 AS "orderValue", COALESCE(o.currency, 'PLN') AS currency,
  o.exchange_rate::float8 AS "exchangeRate",
  CASE WHEN o.currency = 'PLN' THEN o.order_value
       ELSE ROUND(o.order_value * o.exchange_rate, 2) END::float8 AS "orderValuePln",
  o.delivery_address AS "deliveryAddress", o.status, o.notes, o.flagged,
  o.user_id AS "userId", o.created_by AS "createdBy",
  o.created_at AS "createdAt", o.updated_at AS "updatedAt"
`;

function isAdmin(user) {
  return user.role === "admin";
}

function orderDate(value) {
  const date = text(value, "data utworzenia", { required: true, max: 10 });
  const parsed = new Date(`${date}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(parsed.getTime()) ||
      parsed.toISOString().slice(0, 10) !== date) {
    invalid("Data utworzenia musi być poprawną datą w formacie RRRR-MM-DD.");
  }
  return date;
}

function status(value) {
  if (!STATUSES.includes(value)) invalid("Nieprawidłowy status zamówienia.");
  return value;
}

function quantity(value) {
  const number = typeof value === "number" ? value : Number(String(value ?? "").replace(",", "."));
  if (!Number.isFinite(number) || number <= 0 || number >= 1e11 ||
      Math.abs(number * 1000 - Math.round(number * 1000)) > 1e-6) {
    invalid("Ilość musi być dodatnią liczbą (do 3 miejsc po przecinku).");
  }
  return number;
}

const UNITS = ["szt.", "opk.", "mb", "km", "kpl."];

// Pozycje zamówienia: lista {name, quantity, unit}; bez `items` używany jest pojedynczy towar.
function orderItems(input) {
  const source = input.items === undefined
    ? [{ name: input.itemName, quantity: input.quantity, unit: "szt." }]
    : input.items;
  if (!Array.isArray(source) || !source.length || source.length > 200) {
    invalid("Zamówienie musi zawierać od 1 do 200 towarów.");
  }
  return source.map(item => {
    requireObject(item, "Towar zamówienia");
    const unit = item.unit || "szt.";
    if (!UNITS.includes(unit)) invalid("Nieprawidłowa jednostka towaru.");
    return { name: text(item.name, "nazwa towaru", { required: true }), quantity: quantity(item.quantity), unit };
  });
}

function decimal(value, field, { required = true, positive = false, scale, limit }) {
  if (value === undefined || value === null || value === "") {
    if (!required) return null;
    invalid(`Nieprawidłowa wartość pola ${field}.`);
  }
  const number = typeof value === "number" ? value : Number(String(value ?? "").replace(",", "."));
  if (!Number.isFinite(number) || number < 0 || (positive && number === 0) || number >= limit ||
      Math.abs(number * (10 ** scale) - Math.round(number * (10 ** scale))) > 1e-6) {
    invalid(`Nieprawidłowa wartość pola ${field}.`);
  }
  return number;
}

async function companyName(companyId) {
  const result = await pool.query("SELECT name FROM companies WHERE id = $1", [recordId(companyId)]);
  if (!result.rowCount) invalid("Wybrana spółka nie istnieje.");
  const name = result.rows[0].name;
  if (!ORDER_COMPANIES.has(name)) invalid("Wybrana spółka nie jest dostępna dla zamówień.");
  return name;
}

// Waliduje pola formularza zamówienia.
async function orderInput(input) {
  requireObject(input, "Dane zamówienia");
  const currency = input.currency || "PLN";
  if (!CURRENCIES.includes(currency)) invalid("Nieprawidłowa waluta zamówienia.");
  const exchangeRate = currency === "PLN"
    ? null
    : decimal(input.exchangeRate, "kurs waluty", { positive: true, scale: 6, limit: 1e8 });
  const items = orderItems(input);
  return {
    items,
    orderNumber: text(input.orderNumber, "numer zamówienia", { required: true, max: 100 }),
    orderDate: orderDate(input.orderDate),
    supplier: text(input.supplier, "dostawca", { required: true }),
    companyId: recordId(input.companyId),
    companyName: await companyName(input.companyId),
    itemName: items.map(item => item.name).join("; "),
    quantity: items[0].quantity,
    projectNumber: text(input.projectNumber ?? "", "numer projektu", { max: 100 }),
    eodSalesforceNumber: text(input.eodSalesforceNumber ?? "", "numer EOD/Salesforce", { max: 100 }),
    orderValue: decimal(input.orderValue, "wartość zamówienia", { scale: 2, limit: 1e12 }),
    currency,
    exchangeRate,
    deliveryAddress: text(input.deliveryAddress, "adres dostawy", { required: true, max: 1000 })
  };
}

// Lista zamówień: własne dla zwykłego użytkownika, wszystkie dla administratora.
async function listOrders(user) {
  const result = await pool.query(`
    SELECT ${COLUMNS}
      FROM orders o
     WHERE $1::boolean OR o.user_id = $2
     ORDER BY o.order_date DESC, o.id DESC
  `, [isAdmin(user), user.id]);
  return result.rows;
}

async function suggestOrders(prefix, user) {
  const normalizedPrefix = text(prefix, "numer zamówienia", { max: 100 });
  if (!normalizedPrefix) return [];
  const year = new Date().getFullYear();
  const pattern = `${normalizedPrefix.replace(/[!%_]/g, "!$&")}%`;
  const result = await pool.query(`
    SELECT o.id, o.order_number AS "orderNumber", o.supplier,
           o.company_name AS "companyName", o.items, o.item_name AS "itemName",
           o.quantity::float8 AS quantity, o.project_number AS "projectNumber"
      FROM orders o
     WHERE ($2::boolean OR o.user_id = $3)
       AND o.created_at >= $4::timestamptz
       AND o.created_at < $5::timestamptz
       AND o.order_number LIKE $1 ESCAPE '!'
     ORDER BY o.order_date DESC, o.id DESC
     LIMIT 10
  `, [pattern, isAdmin(user), user.id,
    `${year}-01-01T00:00:00.000Z`, `${year + 1}-01-01T00:00:00.000Z`]);
  return result.rows;
}

async function getVisibleOrder(id, user) {
  const result = await pool.query(`
    SELECT ${COLUMNS} FROM orders o
     WHERE o.id = $1 AND ($2::boolean OR o.user_id = $3)
  `, [recordId(id), isAdmin(user), user.id]);
  if (!result.rowCount) throw notFound("Nie znaleziono zamówienia.");
  return result.rows[0];
}

async function createOrder(input, user) {
  const order = await orderInput(input);
  const result = await pool.query(`
    INSERT INTO orders (user_id, created_by, order_number, order_date, supplier, company_id,
                        company_name, item_name, quantity, project_number, eod_salesforce_number,
                        order_value, currency, exchange_rate, delivery_address, items)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16::jsonb)
    RETURNING id
  `, [user.id, user.username, order.orderNumber, order.orderDate, order.supplier,
    order.companyId, order.companyName, order.itemName, order.quantity, order.projectNumber,
    order.eodSalesforceNumber, order.orderValue, order.currency, order.exchangeRate, order.deliveryAddress,
    JSON.stringify(order.items)]);
  return getVisibleOrder(result.rows[0].id, user);
}

async function updateOrder(id, input, user) {
  await getVisibleOrder(id, user);
  const order = await orderInput(input);
  const newStatus = input.status === undefined ? null : status(input.status);
  await pool.query(`
    UPDATE orders
       SET order_number = $2, order_date = $3, supplier = $4, company_id = $5, company_name = $6,
           item_name = $7, quantity = $8, project_number = $9, eod_salesforce_number = $10,
           order_value = $11, currency = $12, exchange_rate = $13, delivery_address = $14,
           status = COALESCE($15, status), items = $16::jsonb, updated_at = NOW()
     WHERE id = $1
  `, [recordId(id), order.orderNumber, order.orderDate, order.supplier, order.companyId,
    order.companyName, order.itemName, order.quantity, order.projectNumber, order.eodSalesforceNumber,
    order.orderValue, order.currency, order.exchangeRate, order.deliveryAddress, newStatus,
    JSON.stringify(order.items)]);
  return getVisibleOrder(id, user);
}

// Częściowa zmiana: status, flaga lub notatka.
async function patchOrder(id, input, user) {
  requireObject(input, "Dane zamówienia");
  await getVisibleOrder(id, user);
  const patch = {
    status: input.status === undefined ? null : status(input.status),
    flagged: input.flagged === undefined ? null : input.flagged,
    notes: input.notes === undefined ? null : text(input.notes, "notatka", { max: 5000 })
  };
  if (patch.flagged !== null && typeof patch.flagged !== "boolean") invalid("Nieprawidłowa wartość flagi.");
  if (Object.values(patch).every(value => value === null)) invalid("Brak danych do zmiany.");
  await pool.query(`
    UPDATE orders
       SET status = COALESCE($2, status), flagged = COALESCE($3, flagged),
           notes = COALESCE($4, notes), updated_at = NOW()
     WHERE id = $1
  `, [recordId(id), patch.status, patch.flagged, patch.notes]);
  return getVisibleOrder(id, user);
}

module.exports = { listOrders, suggestOrders, createOrder, updateOrder, patchOrder };
