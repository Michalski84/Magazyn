const tableColumnWidthsStorageKey = "table-column-widths";
let activeColumnResize = null;

function tableResizeStorageId(table) {
  if (table.id) return table.id;
  return `table-${[...document.querySelectorAll("table")].indexOf(table)}`;
}

function getTableHeader(table) {
  const row = table.tHead?.rows[0];
  return row ? [...row.cells] : [];
}

function getColumnWidths(table, columnCount) {
  const colgroup = table.querySelector(":scope > colgroup");
  if (colgroup?.children.length === columnCount) {
    return [...colgroup.children].map(col => Number.parseFloat(col.style.width));
  }

  const tableWidth = table.getBoundingClientRect().width;
  return getTableHeader(table).map(cell => cell.getBoundingClientRect().width / tableWidth * 100);
}

function applyColumnWidths(table, widths) {
  const headerCells = getTableHeader(table);
  if (headerCells.length !== widths.length) return;

  let colgroup = table.querySelector(":scope > colgroup");
  if (!colgroup) {
    colgroup = document.createElement("colgroup");
    table.insertBefore(colgroup, table.firstChild);
  }
  colgroup.replaceChildren(...widths.map(width => {
    const col = document.createElement("col");
    col.style.width = `${width}%`;
    return col;
  }));
  table.style.tableLayout = "fixed";
}

function loadSavedColumnWidths(table, columnCount) {
  const savedWidths = JSON.parse(localStorage.getItem(tableColumnWidthsStorageKey) || "{}");
  const widths = savedWidths[tableResizeStorageId(table)];
  if (!Array.isArray(widths) || widths.length !== columnCount ||
      widths.some(width => !Number.isFinite(width) || width <= 0)) return null;
  return widths;
}

function saveColumnWidths(table, widths) {
  const savedWidths = JSON.parse(localStorage.getItem(tableColumnWidthsStorageKey) || "{}");
  savedWidths[tableResizeStorageId(table)] = widths;
  localStorage.setItem(tableColumnWidthsStorageKey, JSON.stringify(savedWidths));
}

function ensureResizableTable(table) {
  if (table.closest("form")) return;
  const headerCells = getTableHeader(table);
  if (headerCells.length < 2) return;

  const savedWidths = loadSavedColumnWidths(table, headerCells.length);
  if (savedWidths) applyColumnWidths(table, savedWidths);

  headerCells.forEach((cell, index) => {
    if (cell.querySelector(":scope > .column-resize-handle")) return;
    const handle = document.createElement("button");
    handle.type = "button";
    handle.className = "column-resize-handle";
    handle.tabIndex = -1;
    handle.setAttribute("aria-hidden", "true");
    cell.appendChild(handle);
  });
}

function resizeColumnPair(table, index, delta) {
  const widths = getColumnWidths(table, getTableHeader(table).length);
  if (widths.length < 2 || widths.some(width => !Number.isFinite(width))) return null;

  const neighborIndex = index < widths.length - 1 ? index + 1 : index - 1;
  const direction = neighborIndex > index ? 1 : -1;
  const pairWidth = widths[index] + widths[neighborIndex];
  const minWidth = Math.min(44 / table.getBoundingClientRect().width * 100, pairWidth / 2);
  const change = Math.max(minWidth - widths[index], Math.min(pairWidth - minWidth - widths[index], delta * direction));
  widths[index] += change;
  widths[neighborIndex] -= change;
  applyColumnWidths(table, widths);
  return widths;
}

function initTableColumnResizing() {
  document.querySelectorAll("table").forEach(ensureResizableTable);

  const observer = new MutationObserver(records => {
    records.forEach(record => {
      const parentTable = record.target.closest?.("thead")?.closest("table");
      if (parentTable) ensureResizableTable(parentTable);
      record.addedNodes.forEach(node => {
        if (node.nodeType !== Node.ELEMENT_NODE) return;
        if (node.matches("table")) ensureResizableTable(node);
        node.querySelectorAll?.("table").forEach(ensureResizableTable);
      });
    });
  });
  observer.observe(document.body, { childList: true, subtree: true });

  document.addEventListener("pointerdown", event => {
    const handle = event.target.closest(".column-resize-handle");
    if (!handle || event.button !== 0) return;

    const table = handle.closest("table");
    const headerCells = getTableHeader(table);
    const index = headerCells.indexOf(handle.closest("th"));
    if (index < 0) return;

    event.preventDefault();
    activeColumnResize = {
      table,
      index,
      startX: event.clientX,
      widths: getColumnWidths(table, headerCells.length)
    };
    applyColumnWidths(table, activeColumnResize.widths);
    handle.setPointerCapture?.(event.pointerId);
    document.body.classList.add("is-resizing-table-column");
  });

  document.addEventListener("pointermove", event => {
    if (!activeColumnResize) return;
    const delta = (event.clientX - activeColumnResize.startX) /
      activeColumnResize.table.getBoundingClientRect().width * 100;
    activeColumnResize.startX = event.clientX;
    activeColumnResize.widths = resizeColumnPair(
      activeColumnResize.table,
      activeColumnResize.index,
      delta
    );
  });

  function finishColumnResize() {
    if (!activeColumnResize) return;
    saveColumnWidths(activeColumnResize.table, activeColumnResize.widths);
    activeColumnResize = null;
    document.body.classList.remove("is-resizing-table-column");
  }

  document.addEventListener("pointerup", finishColumnResize);
  document.addEventListener("pointercancel", finishColumnResize);

}
