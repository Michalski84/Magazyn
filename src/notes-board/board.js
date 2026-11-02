const notesBoardColors = {
  yellow: "#f6e58d",
  blue: "#a9d8f5",
  green: "#b8e3b2",
  pink: "#f4b8c2",
  purple: "#d0b8ed"
};
let notesBoardUserId = null;
let notesBoardNotes = [];
let notesBoardSelectedId = null;
let notesBoardImageUrls = [];
let notesBoardLoadToken = 0;
let notesBoardReady = false;
const notesBoardSaveTimers = new Map();
let notesBoardEditorModal = null;
let notesBoardEditorButton = null;

const notesBoardElement = id => document.getElementById(id);
function notesBoardEnsureUser() {
  if (!notesBoardUserId) throw new Error("Nie można otworzyć tablicy bez zalogowanego identyfikatora użytkownika.");
}
const notesBoardNewId = () => window.crypto?.randomUUID
  ? window.crypto.randomUUID()
  : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

function notesBoardCreateNote(x = 80, y = 80, text = "") {
  const now = new Date().toISOString();
  return {
    id: notesBoardNewId(),
    userId: notesBoardUserId,
    text,
    color: "yellow",
    x,
    y,
    width: 260,
    height: 180,
    sizeManual: false,
    createdAt: now,
    updatedAt: now,
    important: false,
    completed: false,
    archived: false,
    imageIds: [],
    imageWidths: {},
    order: notesBoardNotes.reduce((max, note) => Math.max(max, note.order || 0), 0) + 1
  };
}

async function notesBoardPersist(note, rerender = false) {
  note.updatedAt = new Date().toISOString();
  await notesBoardSave("notes", note);
  if (rerender) notesBoardRender();
}

async function notesBoardLoad() {
  if (!notesBoardUserId) return;
  const token = ++notesBoardLoadToken;
  try {
    const [records, settings] = await Promise.all([
      notesBoardReadAll("notes", notesBoardUserId),
      notesBoardReadSettings(notesBoardUserId)
    ]);
    if (token !== notesBoardLoadToken) return;
    notesBoardNotes = records;
    notesBoardApplySettings(settings);
    notesBoardRender();
  } catch (error) {
    showToast(`Nie udało się otworzyć tablicy: ${error.message}`, "error");
  }
}

function notesBoardApplySettings(settings = {}) {
  const values = {
    notesBoardSearch: settings.search || "",
    notesBoardColorFilter: settings.color || "",
    notesBoardImportantFilter: settings.important || "",
  };
  Object.entries(values).forEach(([id, value]) => { notesBoardElement(id).value = value; });
  const canvas = notesBoardElement("notesBoardCanvas");
  canvas.scrollLeft = settings.scrollLeft || 0;
  canvas.scrollTop = settings.scrollTop || 0;
}

let notesBoardSettingsTimer = null;
function notesBoardSaveCurrentViewSettings() {
  const canvas = notesBoardElement("notesBoardCanvas");
  return notesBoardSaveSettings(notesBoardUserId, {
    search: notesBoardElement("notesBoardSearch").value.slice(0, 200),
    color: notesBoardElement("notesBoardColorFilter").value,
    important: notesBoardElement("notesBoardImportantFilter").value,
    scrollLeft: canvas.scrollLeft,
    scrollTop: canvas.scrollTop
  });
}

function notesBoardPersistViewSettings() {
  if (!notesBoardUserId) return;
  clearTimeout(notesBoardSettingsTimer);
  notesBoardSettingsTimer = setTimeout(() => {
    notesBoardSettingsTimer = null;
    notesBoardSaveCurrentViewSettings().catch(error => showToast(`Nie udało się zapisać ustawień tablicy: ${error.message}`, "error"));
  }, 300);
}

function notesBoardApplyFilters() {
  const search = notesBoardElement("notesBoardSearch").value.trim().toLocaleLowerCase("pl");
  const color = notesBoardElement("notesBoardColorFilter").value;
  const important = notesBoardElement("notesBoardImportantFilter").value;
  return notesBoardNotes
    .filter(note => {
      if (search && !note.text.toLocaleLowerCase("pl").includes(search)) return false;
      if (color && note.color !== color) return false;
      if (important === "yes" && !note.important) return false;
      if (important === "no" && note.important) return false;
      return true;
    })
    .sort((a, b) => (a.order || 0) - (b.order || 0));
}

function notesBoardButton(label, title, action, className = "") {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.title = title;
  button.className = className;
  button.addEventListener("click", event => {
    event.stopPropagation();
    Promise.resolve(action()).catch(error => showToast(error.message, "error"));
  });
  return button;
}

function notesBoardEditorText(editor) {
  return typeof editor.innerText === "string" ? editor.innerText : editor.textContent;
}

function notesBoardOpenEditor(modal, button, editor) {
  notesBoardCloseEditor();
  notesBoardEditorModal = modal;
  notesBoardEditorButton = button;
  modal.hidden = false;
  modal.style.left = `${Math.max(8, (window.innerWidth - modal.offsetWidth) / 2)}px`;
  modal.style.top = `${Math.max(8, (window.innerHeight - modal.offsetHeight) / 2)}px`;
  button.setAttribute("aria-expanded", "true");
  button.setAttribute("aria-label", "Zamknij edytor tekstu");
  editor.focus();
}

function notesBoardCloseEditor() {
  if (!notesBoardEditorModal) return;
  notesBoardEditorModal.hidden = true;
  notesBoardEditorButton?.setAttribute("aria-expanded", "false");
  notesBoardEditorButton?.setAttribute("aria-label", "Edytuj tekst");
  notesBoardEditorModal = null;
  notesBoardEditorButton = null;
}

window.addEventListener("keydown", event => {
  if (event.key === "Escape") notesBoardCloseEditor();
});

function notesBoardRenderCard(note) {
  const card = document.createElement("article");
  card.className = `notes-board-card notes-board-card--${note.color}`;
  if (note.important) card.classList.add("notes-board-card--important");
  if (note.completed) card.classList.add("notes-board-card--completed");
  if (note.id === notesBoardSelectedId) card.classList.add("notes-board-card--selected");
  card.dataset.noteId = note.id;
  card.style.left = `${note.x}px`;
  card.style.top = `${note.y}px`;
  if (note.sizeManual) {
    card.style.width = `${note.width}px`;
    card.style.height = `${note.height}px`;
  }
  card.style.zIndex = String(note.order || 1);
  card.addEventListener("pointerdown", () => {
    notesBoardSelectedId = note.id;
    document.querySelectorAll(".notes-board-card--selected").forEach(item => item.classList.remove("notes-board-card--selected"));
    card.classList.add("notes-board-card--selected");
  });

  const header = document.createElement("header");
  header.className = "notes-board-card-header";
  header.title = "Przeciągnij, aby przesunąć karteczkę";
  let cardOptions;
  const optionsButton = notesBoardButton("📌", "Pokaż opcje karteczki", () => {
    cardOptions.hidden = !cardOptions.hidden;
    optionsButton.setAttribute("aria-expanded", String(!cardOptions.hidden));
    optionsButton.setAttribute("aria-label", cardOptions.hidden ? "Pokaż opcje karteczki" : "Ukryj opcje karteczki");
  }, "notes-board-options-toggle");
  const pinSeed = Array.from(String(note.id)).reduce((sum, char) => sum + char.charCodeAt(0), 0);
  optionsButton.style.setProperty("--notes-board-pin-hue", `${(pinSeed * 47) % 360}deg`);
  optionsButton.setAttribute("aria-expanded", "false");
  optionsButton.setAttribute("aria-label", "Pokaż opcje karteczki");
  header.append(optionsButton);
  card.append(header);

  cardOptions = document.createElement("section");
  cardOptions.className = "notes-board-card-options";
  cardOptions.hidden = true;
  cardOptions.setAttribute("aria-label", "Opcje karteczki");

  const editor = document.createElement("div");
  editor.className = "notes-board-text";
  editor.setAttribute("contenteditable", "true");
  editor.setAttribute("role", "textbox");
  editor.setAttribute("aria-label", "Treść karteczki");
  editor.setAttribute("aria-multiline", "true");
  editor.spellcheck = true;
  if (note.richText) editor.innerHTML = notesBoardSanitizeRichText(note.richText);
  else editor.textContent = note.text;
  card.append(editor);
  let lastValidHtml = editor.innerHTML;
  const fitText = () => {
    editor.style.height = "auto";
    editor.style.height = `${Math.max(64, editor.scrollHeight)}px`;
  };
  if (typeof requestAnimationFrame === "function") requestAnimationFrame(fitText);
  else setTimeout(fitText, 0);

  const toolbar = document.createElement("div");
  toolbar.className = "notes-board-format-toolbar";
  toolbar.setAttribute("role", "toolbar");
  toolbar.setAttribute("aria-label", "Formatowanie tekstu");
  let savedRange = null;
  const rememberSelection = () => {
    const selection = window.getSelection();
    if (selection?.rangeCount && editor.contains(selection.anchorNode)) {
      savedRange = selection.getRangeAt(0).cloneRange();
    }
  };
  const restoreSelection = () => {
    editor.focus();
    if (!savedRange || !editor.contains(savedRange.commonAncestorContainer)) return;
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(savedRange);
  };
  let saveTimer;
  const saveEditor = () => {
    const plainText = notesBoardEditorText(editor);
    const richText = notesBoardSanitizeRichText(editor.innerHTML);
    if (plainText.length > 20000 || richText.length > 100000) {
      editor.innerHTML = lastValidHtml;
      showToast(plainText.length > 20000
        ? "Treść karteczki nie może przekraczać 20 000 znaków."
        : "Formatowanie karteczki przekracza dozwolony rozmiar.", "error");
      fitText();
      return;
    }
    note.text = plainText;
    note.richText = richText;
    lastValidHtml = richText;
    fitText();
    clearTimeout(saveTimer);
    clearTimeout(notesBoardSaveTimers.get(note.id));
    saveTimer = setTimeout(() => {
      notesBoardSaveTimers.delete(note.id);
      notesBoardPersist(note).catch(error => showToast(error.message, "error"));
    }, 450);
    notesBoardSaveTimers.set(note.id, saveTimer);
  };
  const addFormatButton = (label, title, command) => {
    const button = notesBoardButton(label, title, () => {
      restoreSelection();
      document.execCommand(command);
      saveEditor();
    }, "notes-board-format-button");
    button.setAttribute("aria-label", title);
    button.addEventListener("mousedown", event => {
      rememberSelection();
      event.preventDefault();
    });
    toolbar.append(button);
  };
  addFormatButton("B", "Pogrubienie", "bold");
  addFormatButton("U", "Podkreślenie", "underline");
  addFormatButton("I", "Kursywa", "italic");

  const fontSelect = document.createElement("select");
  fontSelect.className = "notes-board-format-select";
  fontSelect.setAttribute("aria-label", "Krój pisma");
  fontSelect.add(new Option("Czcionka", ""));
  notesBoardAllowedFonts.forEach(font => fontSelect.add(new Option(font, font)));
  fontSelect.addEventListener("mousedown", rememberSelection);
  fontSelect.addEventListener("change", () => {
    if (!fontSelect.value) return;
    restoreSelection();
    document.execCommand("fontName", false, fontSelect.value);
    fontSelect.value = "";
    saveEditor();
  });
  toolbar.append(fontSelect);

  const sizeSelect = document.createElement("select");
  sizeSelect.className = "notes-board-format-select";
  sizeSelect.setAttribute("aria-label", "Wielkość czcionki");
  sizeSelect.add(new Option("Rozmiar", ""));
  [10, 12, 14, 16, 18, 24, 32].forEach(size => sizeSelect.add(new Option(`${size} px`, String(size))));
  sizeSelect.addEventListener("mousedown", rememberSelection);
  sizeSelect.addEventListener("change", () => {
    if (!sizeSelect.value) return;
    restoreSelection();
    const commandSize = [10, 12, 14, 16, 18, 24, 32].indexOf(Number(sizeSelect.value)) + 1;
    document.execCommand("fontSize", false, String(commandSize));
    sizeSelect.value = "";
    saveEditor();
  });
  toolbar.append(sizeSelect);

  const addColorControl = (label, command, initialColor, colors) => {
    const colorControl = document.createElement("div");
    colorControl.className = "notes-board-format-color";
    colorControl.setAttribute("role", "group");
    colorControl.setAttribute("aria-label", label);
    let activeColor = initialColor;
    const iconButton = document.createElement("button");
    iconButton.type = "button";
    iconButton.className = command === "foreColor"
      ? "notes-board-format-color-icon notes-board-format-color-icon--text"
      : "notes-board-format-color-icon notes-board-format-color-icon--highlight";
    iconButton.textContent = command === "foreColor" ? "A" : "▰";
    iconButton.title = `${label}: zastosuj wybrany kolor`;
    iconButton.setAttribute("aria-label", `${label}: zastosuj wybrany kolor`);
    iconButton.style.setProperty("--notes-board-active-color", activeColor);
    iconButton.addEventListener("mousedown", event => {
      rememberSelection();
      event.preventDefault();
    });
    iconButton.addEventListener("click", () => {
      restoreSelection();
      document.execCommand(command, false, activeColor);
      saveEditor();
    });
    const dropdownButton = document.createElement("button");
    dropdownButton.type = "button";
    dropdownButton.className = "notes-board-format-color-dropdown";
    dropdownButton.textContent = "▾";
    dropdownButton.title = `Wybierz ${label.toLocaleLowerCase("pl")}`;
    dropdownButton.setAttribute("aria-label", `Wybierz ${label.toLocaleLowerCase("pl")}`);
    const palette = document.createElement("div");
    palette.className = "notes-board-color-palette";
    palette.hidden = true;
    palette.setAttribute("role", "group");
    palette.setAttribute("aria-label", `${label} — kolory podstawowe`);
    dropdownButton.addEventListener("click", () => {
      palette.hidden = !palette.hidden;
      dropdownButton.setAttribute("aria-expanded", String(!palette.hidden));
    });
    const swatches = document.createElement("div");
    swatches.className = "notes-board-color-swatches";
    colors.forEach(({ name, value }) => {
      const swatch = document.createElement("button");
      swatch.type = "button";
      swatch.className = "notes-board-color-swatch";
      swatch.style.backgroundColor = value;
      swatch.title = name;
      swatch.setAttribute("aria-label", `${label}: ${name}`);
      swatch.addEventListener("mousedown", event => {
        rememberSelection();
        event.preventDefault();
      });
      swatch.addEventListener("click", () => {
        activeColor = value;
        iconButton.style.setProperty("--notes-board-active-color", activeColor);
        restoreSelection();
        document.execCommand(command, false, value);
        saveEditor();
        palette.hidden = true;
        dropdownButton.setAttribute("aria-expanded", "false");
      });
      swatches.append(swatch);
    });
    const input = document.createElement("input");
    input.type = "color";
    input.value = initialColor;
    input.setAttribute("aria-label", `${label} — wybierz własny kolor`);
    input.addEventListener("mousedown", rememberSelection);
    input.addEventListener("input", () => {
      activeColor = input.value;
      iconButton.style.setProperty("--notes-board-active-color", activeColor);
      restoreSelection();
      document.execCommand(command, false, input.value);
      saveEditor();
      palette.hidden = true;
      dropdownButton.setAttribute("aria-expanded", "false");
    });
    palette.append(swatches, input);
    colorControl.append(iconButton, dropdownButton, palette);
    toolbar.append(colorControl);
  };
  const basicColors = [
    { name: "Czarny", value: "#000000" },
    { name: "Biały", value: "#ffffff" },
    { name: "Czerwony", value: "#e53935" },
    { name: "Pomarańczowy", value: "#fb8c00" },
    { name: "Żółty", value: "#fdd835" },
    { name: "Zielony", value: "#43a047" },
    { name: "Niebieski", value: "#1e88e5" },
    { name: "Fioletowy", value: "#8e24aa" }
  ];
  addColorControl("Kolor tekstu", "foreColor", "#222222", basicColors);
  addColorControl("Kolor tła tekstu", "hiliteColor", "#fff59d", basicColors);

  editor.addEventListener("paste", event => {
    event.preventDefault();
    const text = event.clipboardData?.getData("text/plain") || "";
    rememberSelection();
    restoreSelection();
    document.execCommand("insertText", false, text);
    saveEditor();
  });
  editor.addEventListener("mouseup", rememberSelection);
  editor.addEventListener("keyup", rememberSelection);
  editor.addEventListener("input", saveEditor);
  const editorModal = document.createElement("section");
  editorModal.className = "notes-board-editor-modal";
  editorModal.hidden = true;
  editorModal.dataset.noteId = note.id;
  editorModal.setAttribute("role", "dialog");
  editorModal.setAttribute("aria-modal", "true");
  editorModal.setAttribute("aria-label", "Edycja tekstu karteczki");
  const editorHeader = document.createElement("header");
  editorHeader.className = "notes-board-editor-header";
  editorHeader.title = "Przeciągnij, aby przesunąć okno";
  const editorTitle = document.createElement("h3");
  editorTitle.textContent = "Edytuj tekst karteczki";
  const closeEditorButton = notesBoardButton("×", "Zamknij edytor tekstu", notesBoardCloseEditor, "notes-board-editor-close");
  closeEditorButton.setAttribute("aria-label", "Zamknij edytor tekstu");
  editorHeader.append(editorTitle, closeEditorButton);
  editorModal.append(editorHeader, toolbar);
  editorHeader.addEventListener("pointerdown", event => {
    if (event.button !== 0 || event.target.closest("button")) return;
    event.preventDefault();
    const bounds = editorModal.getBoundingClientRect();
    const startX = event.clientX;
    const startY = event.clientY;
    const originalX = bounds.left;
    const originalY = bounds.top;
    editorHeader.setPointerCapture(event.pointerId);
    const move = moveEvent => {
      const maxLeft = Math.max(0, window.innerWidth - editorModal.offsetWidth);
      const maxTop = Math.max(0, window.innerHeight - editorModal.offsetHeight);
      editorModal.style.left = `${Math.max(0, Math.min(maxLeft, originalX + moveEvent.clientX - startX))}px`;
      editorModal.style.top = `${Math.max(0, Math.min(maxTop, originalY + moveEvent.clientY - startY))}px`;
    };
    const finish = () => {
      editorHeader.removeEventListener("pointermove", move);
      editorHeader.removeEventListener("pointerup", finish);
      editorHeader.removeEventListener("pointercancel", finish);
    };
    editorHeader.addEventListener("pointermove", move);
    editorHeader.addEventListener("pointerup", finish, { once: true });
    editorHeader.addEventListener("pointercancel", finish, { once: true });
  });
  document.body.append(editorModal);

  const imageList = document.createElement("div");
  imageList.className = "notes-board-images";
  const imageOptions = document.createElement("div");
  imageOptions.className = "notes-board-image-options";
  (note.imageIds || []).forEach(imageId => {
    notesBoardGet("images", imageId).then(image => {
      if (!card.isConnected || !image || image.userId !== notesBoardUserId) return;
      const imageUrl = URL.createObjectURL(image.blob);
      notesBoardImageUrls.push(imageUrl);
      const figure = document.createElement("figure");
      figure.className = "notes-board-image";
      const img = document.createElement("img");
      img.src = imageUrl;
      img.alt = "Obraz do notatki";
      img.style.width = `${Math.max(20, Math.min(100, note.imageWidths?.[imageId] || 100))}%`;
      const actions = document.createElement("div");
      actions.className = "notes-board-image-actions";
      const width = document.createElement("input");
      width.type = "range";
      width.min = "20";
      width.max = "100";
      width.value = String(note.imageWidths?.[imageId] || 100);
      width.setAttribute("aria-label", "Rozmiar obrazu");
      width.addEventListener("input", () => { img.style.width = `${width.value}%`; });
      width.addEventListener("change", async () => {
        note.imageWidths = { ...(note.imageWidths || {}), [imageId]: Number(width.value) };
        await notesBoardPersist(note);
      });
      actions.append(width, notesBoardButton("Usuń obraz", "Usuń obraz z karteczki", async () => {
        note.imageIds = note.imageIds.filter(id => id !== imageId);
        delete note.imageWidths[imageId];
        await notesBoardDelete("images", imageId);
        await notesBoardPersist(note, true);
      }, "notes-board-small-button"));
      figure.append(img);
      imageOptions.append(actions);
      imageList.append(figure);
    }).catch(error => showToast(`Nie udało się odczytać obrazu: ${error.message}`, "error"));
  });
  const createdAt = document.createElement("time");
  createdAt.className = "notes-board-created";
  createdAt.dateTime = note.createdAt;
  createdAt.textContent = `Utworzono: ${new Date(note.createdAt).toLocaleString("pl-PL")}`;
  card.append(createdAt);

  const statusActions = document.createElement("div");
  statusActions.className = "notes-board-option-actions";
  const editTextButton = notesBoardButton("Edytuj tekst", "Otwórz edytor tekstu", () => {
    notesBoardOpenEditor(editorModal, editTextButton, editor);
  }, "notes-board-small-button");
  statusActions.append(
    notesBoardButton(note.important ? "★ Ważna" : "☆ Oznacz jako ważną", "Przełącz ważność", async () => {
      note.important = !note.important;
      await notesBoardPersist(note, true);
    }, "notes-board-small-button"),
    editTextButton,
    notesBoardButton("Usuń", "Usuń karteczkę", async () => {
      if (!window.confirm("Usunąć tę karteczkę wraz z jej obrazami?")) return;
      clearTimeout(notesBoardSaveTimers.get(note.id));
      notesBoardSaveTimers.delete(note.id);
      for (const imageId of note.imageIds || []) await notesBoardDelete("images", imageId);
      await notesBoardDelete("notes", note.id);
      notesBoardNotes = notesBoardNotes.filter(item => item.id !== note.id);
      if (notesBoardSelectedId === note.id) notesBoardSelectedId = null;
      notesBoardRender();
    }, "notes-board-small-button notes-board-delete-button")
  );
  cardOptions.append(statusActions);

  const controls = document.createElement("div");
  controls.className = "notes-board-card-controls";
  const colorSelect = document.createElement("select");
  colorSelect.setAttribute("aria-label", "Kolor karteczki");
  Object.keys(notesBoardColors).forEach(color => {
    const option = document.createElement("option");
    option.value = color;
    option.textContent = { yellow: "Żółty", blue: "Niebieski", green: "Zielony", pink: "Różowy", purple: "Fioletowy" }[color];
    colorSelect.append(option);
  });
  colorSelect.value = note.color;
  colorSelect.addEventListener("change", async () => {
    note.color = colorSelect.value;
    await notesBoardPersist(note, true);
  });
  controls.append(colorSelect);
  cardOptions.append(controls, imageList, imageOptions);

  card.append(cardOptions);

  header.addEventListener("pointerdown", event => {
    if (event.button !== 0 || event.target.closest("button")) return;
    event.preventDefault();
    const startX = event.clientX;
    const startY = event.clientY;
    const originalX = note.x;
    const originalY = note.y;
    note.order = Math.max(0, ...notesBoardNotes.map(item => item.order || 0)) + 1;
    card.style.zIndex = String(note.order);
    header.setPointerCapture(event.pointerId);
    const move = moveEvent => {
      note.x = Math.max(0, originalX + moveEvent.clientX - startX);
      note.y = Math.max(0, originalY + moveEvent.clientY - startY);
      card.style.left = `${note.x}px`;
      card.style.top = `${note.y}px`;
    };
    const finish = async () => {
      header.removeEventListener("pointermove", move);
      header.removeEventListener("pointerup", finish);
      header.removeEventListener("pointercancel", finish);
      await notesBoardPersist(note);
    };
    header.addEventListener("pointermove", move);
    header.addEventListener("pointerup", finish, { once: true });
    header.addEventListener("pointercancel", finish, { once: true });
  });

  card.addEventListener("pointerdown", event => {
    if (event.button !== 0 || event.target.closest("button, input, select, textarea")) return;
    const bounds = card.getBoundingClientRect();
    if (event.clientX < bounds.right - 20 || event.clientY < bounds.bottom - 20) return;
    const finishResize = async () => {
      card.removeEventListener("pointerup", finishResize);
      card.removeEventListener("pointercancel", finishResize);
      note.width = Math.max(220, Math.min(700, card.offsetWidth));
      note.height = Math.max(150, Math.min(900, card.offsetHeight));
      note.sizeManual = true;
      card.style.width = `${note.width}px`;
      card.style.height = `${note.height}px`;
      await notesBoardPersist(note);
    };
    card.addEventListener("pointerup", finishResize, { once: true });
    card.addEventListener("pointercancel", finishResize, { once: true });
  });
  return card;
}

function notesBoardRender() {
  const stage = notesBoardElement("notesBoardStage");
  if (!stage) return;
  notesBoardCloseEditor();
  document.querySelectorAll(".notes-board-editor-modal").forEach(modal => modal.remove());
  notesBoardImageUrls.forEach(url => URL.revokeObjectURL(url));
  notesBoardImageUrls = [];
  stage.replaceChildren();
  notesBoardApplyFilters().forEach(note => stage.append(notesBoardRenderCard(note)));
  if (!stage.childElementCount) {
    const empty = document.createElement("p");
    empty.className = "notes-board-empty";
    empty.textContent = "Brak karteczek pasujących do wybranych filtrów.";
    stage.append(empty);
  }
}

async function notesBoardAdd(text = "") {
  notesBoardEnsureUser();
  const canvas = notesBoardElement("notesBoardCanvas");
  const note = notesBoardCreateNote(canvas.scrollLeft + 40, canvas.scrollTop + 40, text);
  notesBoardNotes.push(note);
  notesBoardSelectedId = note.id;
  await notesBoardPersist(note);
  notesBoardRender();
}

async function notesBoardFlushPendingSaves() {
  const pendingNotes = [];
  for (const [id, timer] of notesBoardSaveTimers) {
    clearTimeout(timer);
    const note = notesBoardNotes.find(item => item.id === id);
    if (note) pendingNotes.push(note);
  }
  notesBoardSaveTimers.clear();
  await Promise.all(pendingNotes.map(note => notesBoardPersist(note)));
}

async function notesBoardPasteImage(file) {
  notesBoardEnsureUser();
  if (!notesBoardImageTypePattern.test(file.type)) throw new Error("Format obrazu nie jest obsługiwany. Użyj PNG, JPEG, GIF, WebP lub BMP.");
  if (file.size > notesBoardMaxImageBytes) throw new Error("Obraz przekracza limit 10 MB.");
  let note = notesBoardNotes.find(item => item.id === notesBoardSelectedId);
  if (!note) {
    await notesBoardAdd();
    note = notesBoardNotes.find(item => item.id === notesBoardSelectedId);
  }
  if (!note) throw new Error("Nie udało się utworzyć karteczki dla obrazu.");
  const image = { id: notesBoardNewId(), userId: notesBoardUserId, blob: file, type: file.type, createdAt: new Date().toISOString() };
  await notesBoardSave("images", image);
  note.imageIds = [...(note.imageIds || []), image.id];
  try {
    await notesBoardPersist(note);
  } catch (error) {
    note.imageIds = note.imageIds.filter(id => id !== image.id);
    await notesBoardDelete("images", image.id);
    throw error;
  }
  notesBoardRender();
}

function notesBoardInit() {
  if (notesBoardReady) return;
  notesBoardReady = true;
  notesBoardElement("notesBoardAddButton").addEventListener("click", () => {
    notesBoardAdd().catch(error => showToast(error.message, "error"));
  });
  ["notesBoardSearch", "notesBoardColorFilter", "notesBoardImportantFilter"]
    .forEach(id => {
      notesBoardElement(id).addEventListener("input", () => {
        notesBoardRender();
        notesBoardPersistViewSettings();
      });
    });
  notesBoardElement("notesBoardCanvas").addEventListener("scroll", notesBoardPersistViewSettings, { passive: true });
  notesBoardElement("notesBoardExportButton").addEventListener("click", async () => {
    try {
      notesBoardEnsureUser();
      await notesBoardFlushPendingSaves();
      if (notesBoardSettingsTimer) {
        clearTimeout(notesBoardSettingsTimer);
        notesBoardSettingsTimer = null;
        await notesBoardSaveCurrentViewSettings();
      }
      const blob = await exportNotesBoardBackup(notesBoardUserId);
      const link = document.createElement("a");
      const objectUrl = URL.createObjectURL(blob);
      link.href = objectUrl;
      link.download = `tablica-notatek-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      showToast("Kopia tablicy została wyeksportowana.");
    } catch (error) {
      showToast(`Nie udało się wyeksportować kopii: ${error.message}`, "error");
    }
  });
  notesBoardElement("notesBoardImportButton").addEventListener("click", () => notesBoardElement("notesBoardImportFile").click());
  notesBoardElement("notesBoardImportFile").addEventListener("change", async event => {
    const [file] = event.target.files;
    event.target.value = "";
    if (!file) return;
    if (!window.confirm("Import zastąpi wszystkie karteczki i obrazy bieżącego konta. Kontynuować?")) return;
    try {
      notesBoardEnsureUser();
      await notesBoardFlushPendingSaves();
      clearTimeout(notesBoardSettingsTimer);
      notesBoardSettingsTimer = null;
      await importNotesBoardBackup(file, notesBoardUserId);
      notesBoardSelectedId = null;
      await notesBoardLoad();
      showToast("Kopia tablicy została zaimportowana.");
    } catch (error) {
      showToast(`Nie udało się zaimportować kopii: ${error.message}`, "error");
    }
  });
  document.addEventListener("paste", event => {
    if (notesBoardElement("notesBoardModule").hidden || appContent.hidden) return;
    const file = [...(event.clipboardData?.items || [])]
      .filter(item => item.kind === "file" && item.type.startsWith("image/"))
      .map(item => item.getAsFile())
      .find(Boolean);
    if (!file) return;
    event.preventDefault();
    notesBoardPasteImage(file).catch(error => showToast(`Nie udało się wkleić obrazu: ${error.message}`, "error"));
  });
  window.addEventListener("user-signed-in", event => {
    const nextUserId = event.detail?.userId || document.body.dataset.userId || null;
    if (notesBoardUserId && notesBoardUserId !== nextUserId) {
      notesBoardFlushPendingSaves().catch(error => showToast(`Nie udało się zapisać karteczek przed zmianą konta: ${error.message}`, "error"));
      clearTimeout(notesBoardSettingsTimer);
      notesBoardSettingsTimer = null;
    }
    notesBoardUserId = nextUserId;
    notesBoardNotes = [];
    notesBoardSelectedId = null;
    notesBoardLoadToken += 1;
    notesBoardRender();
    notesBoardLoad();
  });
  window.addEventListener("module-selected", event => {
    if (event.detail === "notesBoardModule") notesBoardLoad();
  });
}

document.addEventListener("DOMContentLoaded", notesBoardInit);
