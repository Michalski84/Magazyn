// Rejestracja kont oraz zarządzanie uprawnieniami użytkowników przez administratora.

const accountRoleLabels = {
  admin: "Administrator",
  warehouse: "Magazyn",
  viewer: "Podgląd"
};

function setAccountStatus(id, message, isError = false) {
  const status = document.getElementById(id);
  status.textContent = message;
  status.classList.toggle("account-status--error", isError);
  status.hidden = !message;
}

function setAccountsModalOpen(modal, open) {
  modal.style.display = open ? "flex" : "none";
  modal.setAttribute("aria-hidden", String(!open));
}

function openRegisterModal() {
  const modal = document.getElementById("registerModal");
  const form = document.getElementById("registerForm");
  form.reset();
  document.getElementById("hideRegisterPassword").checked = true;
  document.getElementById("registerPassword").type = "password";
  document.getElementById("registerPasswordConfirmation").type = "password";
  setAccountStatus("registerStatus", "");
  setAccountsModalOpen(modal, true);
  document.getElementById("registerUsername").focus();
}

function closeRegisterModal() {
  setAccountsModalOpen(document.getElementById("registerModal"), false);
  document.getElementById("registerForm").reset();
}

async function loadAdminUsers() {
  const tbody = document.getElementById("accountsTable").tBodies[0];
  const statusId = "accountsStatus";
  setAccountStatus(statusId, "");
  tbody.replaceChildren();
  const loadingCell = tbody.insertRow().insertCell();
  loadingCell.colSpan = 5;
  loadingCell.textContent = "Ładowanie kont...";
  try {
    const users = await window.shipmentApi.admin.users();
    tbody.replaceChildren();
    users.forEach(user => {
      const row = tbody.insertRow();
      row.insertCell().textContent = user.username;
      row.insertCell().textContent = new Date(user.createdAt).toLocaleDateString("pl-PL");

      const roleCell = row.insertCell();
      const role = document.createElement("select");
      role.setAttribute("aria-label", `Uprawnienia konta ${user.username}`);
      Object.entries(accountRoleLabels).forEach(([value, label]) => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = label;
        role.appendChild(option);
      });
      role.value = user.role;
      roleCell.appendChild(role);

      const activeCell = row.insertCell();
      const active = document.createElement("input");
      active.type = "checkbox";
      active.checked = user.active;
      active.setAttribute("aria-label", `Aktywne konto ${user.username}`);
      activeCell.appendChild(active);

      const actionCell = row.insertCell();
      if (user.username === document.getElementById("currentUserName").textContent) {
        actionCell.textContent = "Bieżące konto";
        role.disabled = true;
        active.disabled = true;
        return;
      }

      const save = document.createElement("button");
      save.type = "button";
      save.textContent = "Zapisz";
      save.addEventListener("click", async () => {
        save.disabled = true;
        try {
          await window.shipmentApi.admin.updateUser(user.id, { role: role.value, active: active.checked });
          showToast(`Zapisano konto ${user.username}.`);
          await loadAdminUsers();
        } catch (error) {
          setAccountStatus(statusId, error.message, true);
        } finally {
          save.disabled = false;
        }
      });

      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "Usuń";
      remove.className = "account-delete-button";
      remove.addEventListener("click", async () => {
        if (!confirm(`Usunąć konto ${user.username}?`)) return;
        remove.disabled = true;
        try {
          await window.shipmentApi.admin.deleteUser(user.id);
          showToast(`Usunięto konto ${user.username}.`);
          await loadAdminUsers();
        } catch (error) {
          setAccountStatus(statusId, error.message, true);
        } finally {
          remove.disabled = false;
        }
      });
      actionCell.append(save, remove);
    });
    if (!users.length) {
      const row = tbody.insertRow();
      const cell = row.insertCell();
      cell.colSpan = 5;
      cell.textContent = "Brak kont użytkowników.";
    }
  } catch (error) {
    tbody.replaceChildren();
    setAccountStatus(statusId, error.message, true);
  }
}

function openAccountsModal() {
  setAccountsModalOpen(document.getElementById("accountsModal"), true);
  loadAdminUsers();
}

function closeAccountsModal() {
  setAccountsModalOpen(document.getElementById("accountsModal"), false);
}

function initAccountManagement() {
  const registerModal = document.getElementById("registerModal");
  const accountsModal = document.getElementById("accountsModal");
  document.getElementById("showRegisterButton").addEventListener("click", openRegisterModal);
  document.getElementById("registerCloseButton").addEventListener("click", closeRegisterModal);
  document.getElementById("registerCancelButton").addEventListener("click", closeRegisterModal);
  document.getElementById("manageAccountsButton").addEventListener("click", openAccountsModal);
  document.getElementById("accountsCloseButton").addEventListener("click", closeAccountsModal);

  [registerModal, accountsModal].forEach(modal => {
    modal.addEventListener("click", event => {
      if (event.target !== modal) return;
      if (modal === registerModal) closeRegisterModal();
      else closeAccountsModal();
    });
  });

  document.getElementById("hideRegisterPassword").addEventListener("change", event => {
    const type = event.target.checked ? "password" : "text";
    document.getElementById("registerPassword").type = type;
    document.getElementById("registerPasswordConfirmation").type = type;
  });

  document.getElementById("registerForm").addEventListener("submit", async event => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const button = document.getElementById("registerSubmitButton");
    button.disabled = true;
    setAccountStatus("registerStatus", "");
    try {
      const result = await window.shipmentApi.register(
        document.getElementById("registerUsername").value.trim(),
        document.getElementById("registerPassword").value,
        document.getElementById("registerPasswordConfirmation").value
      );
      closeRegisterModal();
      showToast(result.message);
    } catch (error) {
      setAccountStatus("registerStatus", error.message, true);
    } finally {
      button.disabled = false;
    }
  });

  document.addEventListener("keydown", event => {
    if (event.key !== "Escape") return;
    if (registerModal.style.display !== "none") closeRegisterModal();
    if (accountsModal.style.display !== "none") closeAccountsModal();
  });
}
