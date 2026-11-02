const notesBoardBackupVersion = 1;
const notesBoardMaxImageBytes = 10 * 1024 * 1024;
const notesBoardMaxBackupBytes = 100 * 1024 * 1024;
const notesBoardImageTypePattern = /^image\/(png|jpeg|gif|webp|bmp)$/i;
const notesBoardAllowedFonts = ["Arial", "Georgia", "Times New Roman", "Verdana", "Trebuchet MS", "Courier New"];

function notesBoardSanitizeRichText(html) {
  const template = document.createElement("template");
  template.innerHTML = html;
  const allowedTags = new Set(["B", "STRONG", "I", "EM", "U", "BR", "DIV", "P", "SPAN", "FONT"]);
  const discardedTags = new Set(["SCRIPT", "STYLE", "IFRAME", "OBJECT", "SVG", "MATH"]);
  const validColor = value => /^(#[\da-f]{3,8}|rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\))$/i.test(value);
  const cleanNode = node => {
    if (node.nodeType === Node.TEXT_NODE) return document.createTextNode(node.nodeValue);
    if (node.nodeType !== Node.ELEMENT_NODE) return document.createDocumentFragment();
    if (discardedTags.has(node.tagName)) return document.createDocumentFragment();
    if (!allowedTags.has(node.tagName)) {
      const fragment = document.createDocumentFragment();
      [...node.childNodes].forEach(child => fragment.append(cleanNode(child)));
      return fragment;
    }

    const element = document.createElement(node.tagName.toLowerCase());
    if (node.tagName === "FONT") {
      if (validColor(node.getAttribute("color") || "")) element.setAttribute("color", node.getAttribute("color"));
      if (notesBoardAllowedFonts.includes(node.getAttribute("face"))) element.setAttribute("face", node.getAttribute("face"));
      if (/^[1-7]$/.test(node.getAttribute("size") || "")) element.setAttribute("size", node.getAttribute("size"));
    }
    if (node.tagName === "SPAN") {
      const style = node.style;
      if (validColor(style.color)) element.style.color = style.color;
      if (validColor(style.backgroundColor)) element.style.backgroundColor = style.backgroundColor;
      if (notesBoardAllowedFonts.includes(style.fontFamily.replaceAll('"', ""))) {
        element.style.fontFamily = style.fontFamily;
      }
      if (/^(10|12|14|16|18|24|32)px$/.test(style.fontSize)) element.style.fontSize = style.fontSize;
      if (/^(normal|bold|400|700)$/.test(style.fontWeight)) element.style.fontWeight = style.fontWeight;
      if (/^(normal|italic)$/.test(style.fontStyle)) element.style.fontStyle = style.fontStyle;
      if (/^(none|underline|line-through)$/.test(style.textDecoration)) element.style.textDecoration = style.textDecoration;
    }
    [...node.childNodes].forEach(child => element.append(cleanNode(child)));
    return element;
  };
  const result = document.createDocumentFragment();
  [...template.content.childNodes].forEach(child => result.append(cleanNode(child)));
  const container = document.createElement("div");
  container.append(result);
  return container.innerHTML;
}

function notesBoardBlobToBase64(blob) {
  return blob.arrayBuffer().then(buffer => {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    const chunkSize = 0x8000;
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
    }
    return window.btoa(binary);
  });
}

function notesBoardBase64ToBlob(data, type) {
  if (!notesBoardImageTypePattern.test(type)) throw new Error("Kopia zawiera nieobsługiwany format obrazu.");
  let binary;
  try {
    binary = window.atob(data);
  } catch {
    throw new Error("Kopia zawiera nieprawidłowe dane obrazu.");
  }
  if (binary.length > notesBoardMaxImageBytes) throw new Error("Obraz w kopii przekracza limit 10 MB.");
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type });
}

async function exportNotesBoardBackup(userId) {
  const [notes, images, settings] = await Promise.all([
    notesBoardReadAll("notes", userId),
    notesBoardReadAll("images", userId),
    notesBoardReadSettings(userId)
  ]);
  const referencedImageIds = new Set(notes.flatMap(note => note.imageIds || []));
  const availableImageIds = new Set(images.map(image => image.id));
  if (notes.some(note => (note.imageIds || []).some(id => !availableImageIds.has(id)))) {
    throw new Error("Nie można wyeksportować kopii: brakuje obrazu przypisanego do karteczki.");
  }
  const backupImages = await Promise.all(images.filter(image => referencedImageIds.has(image.id)).map(async image => ({
    id: image.id,
    type: image.blob.type || image.type || "application/octet-stream",
    data: await notesBoardBlobToBase64(image.blob)
  })));
  const payload = {
    format: "magazyn-notes-board",
    version: notesBoardBackupVersion,
    exportedAt: new Date().toISOString(),
    notes: notes.map(({ userId: _owner, ...note }) => note),
    images: backupImages.filter(image => referencedImageIds.has(image.id)),
    settings: settings ? Object.fromEntries(
      Object.entries(settings).filter(([key]) => key !== "userId")
    ) : {}
  };
  const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
  if (blob.size > notesBoardMaxBackupBytes) throw new Error("Kopia przekracza limit 100 MB.");
  return blob;
}

function validateNotesBoardBackup(payload) {
  if (!payload || payload.format !== "magazyn-notes-board" || payload.version !== notesBoardBackupVersion) {
    throw new Error("Nieobsługiwany format lub wersja kopii tablicy.");
  }
  if (!Array.isArray(payload.notes) || !Array.isArray(payload.images) || payload.notes.length > 5000) {
    throw new Error("Kopia zawiera nieprawidłową listę karteczek lub obrazów.");
  }

  const imageIds = new Set();
  const images = payload.images.map(image => {
    if (!image || typeof image.id !== "string" || image.id.length > 100 ||
        typeof image.type !== "string" || typeof image.data !== "string") {
      throw new Error("Kopia zawiera nieprawidłowy obraz.");
    }
    if (imageIds.has(image.id)) throw new Error("Kopia zawiera powtórzony identyfikator obrazu.");
    imageIds.add(image.id);
    return { id: image.id, type: image.type, blob: notesBoardBase64ToBlob(image.data, image.type) };
  });

  const noteIds = new Set();
  const referencedImageIds = new Set();
  const timestamp = new Date().toISOString();
  const notes = payload.notes.map(note => {
    if (!note || typeof note.id !== "string" || note.id.length > 100 ||
        typeof note.text !== "string" || note.text.length > 20000 ||
          (typeof note.richText !== "undefined" && (typeof note.richText !== "string" || note.richText.length > 100000)) ||
          !["yellow", "blue", "green", "pink", "purple"].includes(note.color) ||
        !Number.isFinite(note.x) || !Number.isFinite(note.y) ||
        !Number.isFinite(note.width) || !Number.isFinite(note.height) ||
        !Array.isArray(note.imageIds) || !note.imageIds.every(id => typeof id === "string" && imageIds.has(id))) {
      throw new Error("Kopia zawiera nieprawidłową karteczkę.");
    }
    if (noteIds.has(note.id)) throw new Error("Kopia zawiera powtórzony identyfikator karteczki.");
    noteIds.add(note.id);
    if (new Set(note.imageIds).size !== note.imageIds.length || note.imageIds.some(id => referencedImageIds.has(id))) {
      throw new Error("Obraz w kopii jest przypisany do więcej niż jednej karteczki.");
    }
    note.imageIds.forEach(id => referencedImageIds.add(id));
    return {
      id: note.id,
      text: note.text,
      richText: typeof note.richText === "string" ? notesBoardSanitizeRichText(note.richText) : "",
      color: note.color,
      x: Math.min(3100, Math.max(0, note.x)),
      y: Math.min(1700, Math.max(0, note.y)),
      width: Math.min(500, Math.max(220, note.width)),
      height: Math.min(700, Math.max(220, note.height)),
      sizeManual: note.sizeManual === true || typeof note.sizeManual === "undefined",
      createdAt: typeof note.createdAt === "string" && Number.isFinite(Date.parse(note.createdAt)) ? note.createdAt : timestamp,
      updatedAt: typeof note.updatedAt === "string" && Number.isFinite(Date.parse(note.updatedAt)) ? note.updatedAt : timestamp,
      important: note.important === true,
      completed: note.completed === true,
      archived: note.archived === true,
      reminderAt: typeof note.reminderAt === "string" && Number.isFinite(Date.parse(note.reminderAt)) ? note.reminderAt : "",
      imageIds: [...new Set(note.imageIds)],
      imageWidths: note.imageWidths && typeof note.imageWidths === "object" && !Array.isArray(note.imageWidths)
        ? Object.fromEntries(Object.entries(note.imageWidths)
          .filter(([id, width]) => note.imageIds.includes(id) && Number.isFinite(width))
          .map(([id, width]) => [id, Math.max(20, Math.min(100, width))]))
        : {},
      order: Number.isFinite(note.order) ? Math.max(1, Math.min(1000000, note.order)) : noteIds.size
    };
  });
  if (images.some(image => !referencedImageIds.has(image.id))) {
    throw new Error("Kopia zawiera obraz, który nie należy do żadnej karteczki.");
  }
  const sourceSettings = payload.settings && typeof payload.settings === "object" && !Array.isArray(payload.settings)
    ? payload.settings
    : {};
  const allowedColors = ["", "yellow", "blue", "green", "pink", "purple"];
  const allowedImportant = ["", "yes", "no"];
  const allowedStatuses = ["active", "completed", "all", "archived"];
  const allowedDeadlines = ["", "upcoming", "overdue", "none"];
  return {
    notes,
    images,
    settings: {
      search: typeof sourceSettings.search === "string" ? sourceSettings.search.slice(0, 200) : "",
      color: allowedColors.includes(sourceSettings.color) ? sourceSettings.color : "",
      important: allowedImportant.includes(sourceSettings.important) ? sourceSettings.important : "",
      status: allowedStatuses.includes(sourceSettings.status) ? sourceSettings.status : "active",
      deadline: allowedDeadlines.includes(sourceSettings.deadline) ? sourceSettings.deadline : "",
      scrollLeft: Number.isFinite(sourceSettings.scrollLeft) ? Math.max(0, Math.min(100000, sourceSettings.scrollLeft)) : 0,
      scrollTop: Number.isFinite(sourceSettings.scrollTop) ? Math.max(0, Math.min(100000, sourceSettings.scrollTop)) : 0
    }
  };
}

async function importNotesBoardBackup(file, userId) {
  if (!file || file.size > notesBoardMaxBackupBytes) throw new Error("Plik kopii przekracza limit 100 MB.");
  let payload;
  try {
    payload = JSON.parse(await file.text());
  } catch {
    throw new Error("Nie udało się odczytać kopii. Wybierz poprawny plik JSON.");
  }
  const validated = validateNotesBoardBackup(payload);
  await notesBoardReplaceUserData(userId, validated.notes, validated.images, validated.settings);
}
