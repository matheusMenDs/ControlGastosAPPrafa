// script.js — versão final com IndexedDB, correções e UI integrada
/* Sections:
 - utils
 - DOM refs + state
 - indexedDB wrapper
 - data sync + render
 - UI events (modal, add, edit, delete, clear month)
 - chart
 - ratomine animation
 - popups
*/

// -------------------- UTILIDADES --------------------
const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

// Lighten hex color by percentage (0-100)
function lighten(hex, percent = 12) {
  const h = String(hex).replace('#','');
  const bigint = parseInt(h.length === 6 ? h : (h.length===8 ? h.slice(0,6) : h.padEnd(6,'f')), 16);
  let r = (bigint >> 16) & 255;
  let g = (bigint >> 8) & 255;
  let b = bigint & 255;
  const amt = Math.round(255 * (percent/100));
  r = Math.min(255, r + amt);
  g = Math.min(255, g + amt);
  b = Math.min(255, b + amt);
  const toHex = (v)=> v.toString(16).padStart(2,'0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

const fmtDate = (iso) => {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
};

const monthKey = (iso) => {
  const d = new Date(iso + "T00:00:00");
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

function todayMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function uid(len = 8) {
  return Math.random().toString(36).slice(2, 2 + len);
}

function escapeHtml(str) {
  return String(str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// Aceita valores monetários em formatos BR (1.234,56) e genéricos (1234.56)
function parseMoneyInput(raw) {
  const s = String(raw || "").trim();
  if (!s) return NaN;
  if (s.includes(',')) {
    const t = s.replace(/\./g, '').replace(',', '.');
    return Number(t);
  }
  if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    return Number(s.replace(/\./g, ''));
  }
  return Number(s);
}

// -------------------- DOM + STATE --------------------
const tableBody = document.getElementById("tableBody");
const totalMonth = document.getElementById("totalMonth");
const itemsCount = document.getElementById("itemsCount");
const profit = document.getElementById("profit");

const filterMonth = document.getElementById("filterMonth");
const filterCategory = document.getElementById("filterCategory");
const searchInput = document.getElementById("searchInput");
const toggleSortBtn = document.getElementById("toggleSort");

const btnNew = document.getElementById("btnNew");
const btnSwitch = document.getElementById("btnSwitch");
const btnFullscreen = document.getElementById("btnFullscreen");

const modal = document.getElementById("modal");
const modalClose = document.getElementById("modalClose");
const btnCancel = document.getElementById("btnCancel");
const expenseForm = document.getElementById("expenseForm");
const dateInput = document.getElementById("dateInput");
const descInput = document.getElementById("descInput");
const catInput = document.getElementById("catInput");
const ownerInput = document.getElementById("ownerInput");
const installmentsInput = document.getElementById("installmentsInput");
const installmentValueType = document.getElementById("installmentValueType");
const cardExtrasRow = document.getElementById("cardExtrasRow");
const valueInput = document.getElementById("valueInput");
const noteInput = document.getElementById("noteInput");
const editingId = document.getElementById("editingId");
const modalTitle = document.getElementById("modalTitle");

// Page 2: due date elements
const dueDateInput = document.getElementById("dueDateInput");
const dueDateText = document.getElementById("dueDateText");
const dueClearBtn = document.getElementById("dueClearBtn");
function dueKey(month){ return `card_due_date_${month}`; }
function updateDueDateUI(){
  if (!isPage2 || !dueDateInput || !dueDateText) return;
  const month = state.filters.month || todayMonth();
  const saved = localStorage.getItem(dueKey(month));
  if (saved) {
    dueDateInput.value = saved;
    dueDateText.textContent = fmtDate(saved);
  } else {
    dueDateInput.value = '';
    dueDateText.textContent = 'Defina o vencimento';
  }
}

const confirmModal = document.getElementById('confirmModal');
const confirmMsgEl = document.getElementById('confirmMsg');
const confirmOkBtn = document.getElementById('confirmOk');
const confirmCancelBtn = document.getElementById('confirmCancel');

let state = {
  expenses: [],
  filters: { month: todayMonth(), category: "", search: "", sortAsc: false },
  editing: null
};
// Page detection
const isPage2 = window.location.pathname.endsWith('index2.html');

if (filterMonth) filterMonth.value = state.filters.month;

// -------------------- API WRAPPER (com suporte a Electron) --------------------
const API_URL = 'http://localhost:3001';

const db = {
  async addExpense(exp) {
    try {
      const res = await fetch(`${API_URL}/api/expenses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(exp)
      });
      if (!res.ok) throw new Error('Falha ao adicionar gasto');
      return await res.json();
    } catch (error) {
      console.error('Erro ao adicionar gasto:', error);
      throw error;
    }
  },
  async putExpense(exp) {
    try {
      const res = await fetch(`${API_URL}/api/expenses/${exp.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(exp)
      });
      if (!res.ok) throw new Error('Falha ao atualizar gasto');
      return await res.json();
    } catch (error) {
      console.error('Erro ao atualizar gasto:', error);
      throw error;
    }
  },
  async deleteExpense(id) {
    try {
      const res = await fetch(`${API_URL}/api/expenses/${id}`, {
        method: 'DELETE'
      });
      if (!res.ok) throw new Error('Falha ao deletar gasto');
      return await res.json();
    } catch (error) {
      console.error('Erro ao deletar gasto:', error);
      throw error;
    }
  },
  async getAllExpenses() {
    try {
      const res = await fetch(`${API_URL}/api/expenses`);
      if (!res.ok) throw new Error('Falha ao carregar gastos');
      return await res.json();
    } catch (error) {
      console.error('Erro ao carregar gastos:', error);
      throw error;
    }
  },
  
};

// -------------------- SYNC DB -> STATE --------------------
async function loadAllFromDB() {
  try {
    const arr = await db.getAllExpenses();
    // Normaliza categoria antiga "Cartão de credito" para "Cartão"
    const normalized = Array.isArray(arr) ? arr.map(e => ({
      ...e,
      category: e.category === "Cartão de credito" ? "Cartão" : e.category
    })) : [];
    state.expenses = normalized.sort((a,b)=> new Date(b.date) - new Date(a.date));
  } catch (e) {
    console.error("DB load failed:", e);
    state.expenses = [];
  }
  render();
}

// -------------------- RENDER --------------------
function applyFilters(list) {
  const { month, category, search } = state.filters;
  return list.filter(e => {
    const okMonth = !month || monthKey(e.date) === month;
    // Página 2: o seletor usa 'category' como dono do Cartão; não filtrar por categoria aqui
    const okCat = isPage2 ? true : (!category || e.category === category);
    const hay = (e.description + " " + (e.note || "")).toLowerCase();
    const okSearch = !search || hay.includes(search.toLowerCase());
    return okMonth && okCat && okSearch;
  });
}

function render() {
  // Apply page-specific filters
  let base = applyFilters(state.expenses);
  if (isPage2) {
    // Page 2: only Cartão, and optionally by owner via filterCategory
    base = base.filter(e => e.category === 'Cartão');
    const ownerFilter = (state.filters.category || '').trim(); // on page2, filterCategory is owner
    if (ownerFilter) {
      const KNOWN_OWNERS = ["eu","rafa","mãe","manu","matheus"]; // normalized lower-case
      const ownerFilterNorm = ownerFilter.toLowerCase();
      if (ownerFilterNorm === 'outros') {
        base = base.filter(e => {
          const itemOwner = ((e.cardOwner || 'Eu') + '').trim().toLowerCase();
          return !KNOWN_OWNERS.includes(itemOwner);
        });
      } else {
        base = base.filter(e => {
          const itemOwner = ((e.cardOwner || 'Eu') + '').trim().toLowerCase();
          return itemOwner === ownerFilterNorm;
        });
      }
    }
  } else {
    // Page 1: if item is Cartão, only show owner 'Eu'
    base = base.filter(e => !(e.category === 'Cartão' && (e.cardOwner || 'Eu') !== 'Eu'));
  }

  const rows = base.sort((a, b) => {
    return state.filters.sortAsc
      ? (new Date(a.date) - new Date(b.date))
      : (new Date(b.date) - new Date(a.date));
  });
  const totalCofre = rows.filter(e => e.category === "Cofre").reduce((s,e)=>s+Number(e.value),0);
  const totalGastos = rows.filter(e => e.category !== "Cofre").reduce((s,e)=>s+Number(e.value),0);

  if (totalMonth) totalMonth.textContent = BRL.format(totalGastos);
  if (profit) profit.textContent = BRL.format(totalCofre);
  if (tableBody) {
    tableBody.innerHTML = rows.map(e => {
      const isGroup = e.installment && Number(e.installment.count) > 1;
      return `
      <tr>
        <td>${fmtDate(e.date)}</td>
        <td>${escapeHtml(e.description)}</td>
        <td><span class="badge ${isPage2 ? 'cartao' : String(e.category).toLowerCase()}">${escapeHtml(isPage2 ? (e.cardOwner || 'Eu') : e.category)}</span></td>
        <td class="right"><span class="value-pill">${BRL.format(e.value)}</span></td>
        <td class="center">
          <div class="row-actions">
            <button class="btn" onclick="editExpense('${e.id}')">Editar</button>
            ${isGroup ? `<button class="btn group-delete" onclick="confirmDeleteGroup('${e.installment.groupId}')" title="Excluir grupo">X</button>` : `<button class="btn placeholder" tabindex="-1">X</button>`}
            <button class="btn danger" onclick="confirmDelete('${e.id}')">Excluir</button>
          </div>
        </td>
      </tr>
    `}).join("");
  }
  if (itemsCount) itemsCount.textContent = String(rows.length);
  if (toggleSortBtn) {
    toggleSortBtn.textContent = state.filters.sortAsc ? 'Mais antiga → Mais nova' : 'Mais nova → Mais antiga';
  }
  renderChart();
}

// -------------------- CRUD via DB --------------------
function newId() { return uid(10); }

async function addExpenseLocal(exp) {
  exp.month = monthKey(exp.date);
  await db.addExpense(exp);
  await loadAllFromDB();
}

async function addExpensesBatch(exps) {
  for (const exp of exps) {
    exp.month = monthKey(exp.date);
    await db.addExpense(exp);
  }
  await loadAllFromDB();
}

async function updateExpenseLocal(id, patch) {
  const existing = state.expenses.find(e=>e.id===id);
  if (!existing) return;
  const updated = { ...existing, ...patch, month: monthKey(patch.date || existing.date) };
  await db.putExpense(updated);
  await loadAllFromDB();
}

async function deleteExpenseLocal(id) {
  await db.deleteExpense(id);
  await loadAllFromDB();
}

function confirmDelete(id) {
  showConfirm('Excluir este gasto?', async () => {
    try {
      await deleteExpenseLocal(id);
    } catch (e) {
      console.error(e);
      showAlert('Falha ao excluir.');
    }
  });
}

function confirmDeleteGroup(groupId) {
  showConfirm('Excluir todas as parcelas deste grupo?', async () => {
    try {
      const toDelete = state.expenses.filter(e => e.installment && e.installment.groupId === groupId).map(e => e.id);
      for (const id of toDelete) {
        await deleteExpenseLocal(id);
      }
    } catch (e) {
      console.error(e);
      showAlert('Falha ao excluir grupo.');
    }
  });
}

// -------------------- MODAL --------------------
function openModal(title = "Novo gasto", prefillDate = null) {
  modal.classList.remove("hidden");
  modalTitle.textContent = title;
  if (prefillDate) dateInput.value = prefillDate;
  setTimeout(() => descInput.focus(), 50);
}

function closeModal() {
  modal.classList.add("hidden");
  expenseForm.reset();
  editingId.value = "";
}

// -------------------- EVENTOS UI --------------------
if (btnNew) {
  btnNew.addEventListener("click", () => {
    // abre o modal com a data do mês selecionado (1º dia) para evitar criação em mês errado
    const m = state.filters.month || todayMonth();
    // se o mês selecionado for o mês atual, pré-preencher com o dia de hoje
    if (m === todayMonth()) {
      const d = new Date();
      const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      openModal("Novo gasto", today);
    } else {
      openModal("Novo gasto", `${m}-01`);
    }
    // Mostrar/ocultar campos de Cartão conforme página/categoria
    if (isPage2) {
      if (cardExtrasRow) cardExtrasRow.style.display = '';
      if (ownerInput) ownerInput.value = 'Eu';
      if (installmentsInput) installmentsInput.value = 1;
      if (installmentValueType) installmentValueType.value = 'total';
    } else if (cardExtrasRow && catInput) {
      cardExtrasRow.style.display = (catInput.value === 'Cartão') ? '' : 'none';
      // Página 1: se Cartão, força dono 'Eu' e desabilita seleção
      if (catInput.value === 'Cartão' && ownerInput) {
        ownerInput.value = 'Eu';
        ownerInput.disabled = true;
        ownerInput.classList.add('no-arrow');
      } else if (ownerInput) {
        ownerInput.disabled = false;
        ownerInput.classList.remove('no-arrow');
      }
    }
  });
}
// Navegação entre páginas idênticas
if (btnSwitch) {
  // Ajusta o texto conforme a página atual
  const isPage1 = window.location.pathname.endsWith("index.html") || window.location.pathname.endsWith("/") || window.location.pathname === "";
  const labelEl = btnSwitch.querySelector('.label');
  const arrowEl = btnSwitch.querySelector('.arrow');
  if (labelEl) labelEl.textContent = isPage1 ? "Cartão" : "Gastos";
  if (arrowEl) arrowEl.textContent = isPage1 ? "→" : "←";
  btnSwitch.title = isPage1 ? "Ir para Cartão" : "Ir para Gastos";
  btnSwitch.addEventListener("click", () => {
    if (isPage1) {
      window.location.href = "./index2.html";
    } else {
      window.location.href = "./index.html";
    }
  });
}
// Fullscreen toggle button
if (btnFullscreen) {
  btnFullscreen.addEventListener('click', () => {
    if (window.electron && typeof window.electron.toggleFullscreen === 'function') {
      window.electron.toggleFullscreen();
    } else {
      const elem = document.documentElement;
      if (!document.fullscreenElement && elem.requestFullscreen) {
        elem.requestFullscreen();
      } else if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  });
}
if (modalClose) modalClose.addEventListener("click", closeModal);
if (btnCancel) btnCancel.addEventListener("click", closeModal);

// Toggle card extras when category changes (Página 1)
if (catInput && cardExtrasRow && !isPage2) {
  catInput.addEventListener('change', () => {
    cardExtrasRow.style.display = (catInput.value === 'Cartão') ? '' : 'none';
    if (ownerInput) {
      if (catInput.value === 'Cartão') {
        ownerInput.value = 'Eu';
        ownerInput.disabled = true;
        ownerInput.classList.add('no-arrow');
      } else {
        ownerInput.disabled = false;
        ownerInput.classList.remove('no-arrow');
      }
    }
  });
}

if (expenseForm) {
  expenseForm.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const [Y, M, D] = (dateInput.value || "").split("-");
    if (!Y || !M || !D) { showAlert("Data inválida"); return; }
    const dateStr = `${Y}-${M}-${D}`;

    const payload = {
      id: editingId.value || newId(),
      date: dateStr,
      description: descInput.value.trim(),
      category: isPage2 ? 'Cartão' : catInput.value,
      value: parseMoneyInput(valueInput.value),
      note: noteInput.value.trim()
    };

    // Owner for Cartão
    if (payload.category === 'Cartão') {
      const owner = ownerInput ? (ownerInput.value || 'Eu') : 'Eu';
      payload.cardOwner = owner;
    }
    // Página 1: garantir que Cartão sempre seja 'Eu'
    if (!isPage2 && payload.category === 'Cartão') {
      payload.cardOwner = 'Eu';
    }

    if (!payload.description || isNaN(payload.value)) {
      showAlert("Preencha tudo corretamente.");
      return;
    }

    try {
      if (editingId.value) {
        // Editing existing
        const existing = state.expenses.find(e=>e.id===editingId.value);
        const nEdit = installmentsInput ? Math.max(1, Number(installmentsInput.value || 1)) : 1;
        if (existing && existing.category === 'Cartão' && existing.installment && Number(existing.installment.count) > 1) {
          // Edit entire group
          const groupId = existing.installment.groupId;
          const n = Math.max(1, Number((installmentsInput && installmentsInput.value) || existing.installment.count || 1));
          const type = (installmentValueType && installmentValueType.value) || 'total';
          const total = parseMoneyInput(valueInput.value);
          const perParcel = type === 'total' ? Math.round((total / n) * 100) / 100 : total;
          const descBase = (descInput.value || '').replace(/\s*\(Parcela\s+\d+\/\d+\)\s*$/i, '');
          const startDate = dateStr; // anchor on provided date
          // remove old group
          const toDelete = state.expenses.filter(e => e.installment && e.installment.groupId === groupId).map(e => e.id);
          for (const idDel of toDelete) { await db.deleteExpense(idDel); }
          // recreate group
          const parcels = [];
          let accumulated = 0;
          for (let i = 0; i < n; i++) {
            const dateObj = new Date(startDate + 'T00:00:00');
            dateObj.setMonth(dateObj.getMonth() + i);
            let value = perParcel;
            if (type === 'total') {
              if (i === n - 1) value = Math.round((total - accumulated) * 100) / 100;
              else accumulated += perParcel;
            }
            parcels.push({
              id: newId(),
              date: `${dateObj.getFullYear()}-${String(dateObj.getMonth()+1).padStart(2,'0')}-${String(dateObj.getDate()).padStart(2,'0')}`,
              description: `${descBase} (Parcela ${i+1}/${n})`,
              category: 'Cartão',
              value,
              note: noteInput.value.trim(),
              cardOwner: ownerInput ? (ownerInput.value || 'Eu') : (existing.cardOwner || 'Eu'),
              installment: { groupId, index: i+1, count: n, valueType: type }
            });
          }
          await addExpensesBatch(parcels);
          closeModal();
          return;
        } else if (existing && existing.category === 'Cartão' && nEdit > 1) {
          // Convert single Cartão into installment group
          const type = (installmentValueType && installmentValueType.value) || 'total';
          const total = parseMoneyInput(valueInput.value);
          const perParcel = type === 'total' ? Math.round((total / nEdit) * 100) / 100 : total;
          const descBase = (descInput.value || '').replace(/\s*\(Parcela\s+\d+\/\d+\)\s*$/i, '');
          const startDate = dateStr;
          const groupId = newId(6);
          // remove the single existing item
          await db.deleteExpense(existing.id);
          const parcels = [];
          let accumulated = 0;
          for (let i = 0; i < nEdit; i++) {
            const dateObj = new Date(startDate + 'T00:00:00');
            dateObj.setMonth(dateObj.getMonth() + i);
            let value = perParcel;
            if (type === 'total') {
              if (i === nEdit - 1) value = Math.round((total - accumulated) * 100) / 100;
              else accumulated += perParcel;
            }
            parcels.push({
              id: newId(),
              date: `${dateObj.getFullYear()}-${String(dateObj.getMonth()+1).padStart(2,'0')}-${String(dateObj.getDate()).padStart(2,'0')}`,
              description: `${descBase} (Parcela ${i+1}/${nEdit})`,
              category: 'Cartão',
              value,
              note: noteInput.value.trim(),
              cardOwner: ownerInput ? (ownerInput.value || 'Eu') : (existing.cardOwner || 'Eu'),
              installment: { groupId, index: i+1, count: nEdit, valueType: type }
            });
          }
          await addExpensesBatch(parcels);
          closeModal();
          return;
        } else {
          // normal single update
          await updateExpenseLocal(payload.id, payload);
        }
      } else {
        // Installments logic for Cartão
        if (payload.category === 'Cartão' && installmentsInput) {
          const n = Math.max(1, Number(installmentsInput.value || 1));
          if (n > 1) {
            const type = installmentValueType ? installmentValueType.value : 'parcela';
            const total = parseMoneyInput(valueInput.value);
            const perParcel = type === 'total' ? Math.round((total / n) * 100) / 100 : total;
            const parcels = [];
            const groupId = newId(6);
            let accumulated = 0;
            for (let i = 0; i < n; i++) {
              const dateObj = new Date(dateStr + 'T00:00:00');
              dateObj.setMonth(dateObj.getMonth() + i);
              let value = perParcel;
              if (type === 'total') {
                // adjust last parcel to match total
                if (i === n - 1) value = Math.round((total - accumulated) * 100) / 100;
                else accumulated += perParcel;
              }
              parcels.push({
                id: newId(),
                date: `${dateObj.getFullYear()}-${String(dateObj.getMonth()+1).padStart(2,'0')}-${String(dateObj.getDate()).padStart(2,'0')}`,
                description: `${(payload.description||'').replace(/\s*\(Parcela\s+\d+\/\d+\)\s*$/i,'')} (Parcela ${i+1}/${n})`,
                category: 'Cartão',
                value,
                note: payload.note,
                cardOwner: payload.cardOwner,
                installment: { groupId, index: i+1, count: n, valueType: type }
              });
            }
            await addExpensesBatch(parcels);
          } else {
            // single cartão; persist chosen value type too
            const type = installmentValueType ? installmentValueType.value : 'total';
            payload.cardValueType = type;
            await addExpenseLocal(payload);
          }
        } else {
          await addExpenseLocal(payload);
        }
      }
      closeModal();
    } catch (e) {
      console.error(e);
      showAlert("Erro ao salvar gasto.");
    }
  });
}

// filtros
if (filterMonth) {
  filterMonth.addEventListener("change", e => {
    state.filters.month = e.target.value;
    render();
    updateDueDateUI();
  });
}
if (filterCategory) {
  filterCategory.addEventListener("change", e => {
    state.filters.category = e.target.value;
    render();
  });
}
if (searchInput) {
  searchInput.addEventListener("input", e => {
    state.filters.search = e.target.value;
    render();
  });
}
if (toggleSortBtn) {
  toggleSortBtn.addEventListener('click', () => {
    state.filters.sortAsc = !state.filters.sortAsc;
    render();
  });
}

// (ação de limpar mês removida)

// -------------------- Editar ----------
function editExpense(id) {
  const e = state.expenses.find(x => x.id === id);
  if (!e) return;
  openModal("Editar gasto", e.date);
  dateInput.value = e.date;
  descInput.value = e.description;
  if (catInput) { catInput.value = e.category; }
  if (ownerInput && e.category === 'Cartão') { ownerInput.value = e.cardOwner || 'Eu'; }
  valueInput.value = e.value;
  noteInput.value = e.note || "";
  editingId.value = e.id;
  // Mostrar extras de cartão quando aplicável
  if (!isPage2 && cardExtrasRow && catInput) {
    cardExtrasRow.style.display = (catInput.value === 'Cartão') ? '' : 'none';
  }
  // Prefill installments when editing parcelamento
  if (installmentsInput) {
    const count = (e.installment && e.installment.count) ? Number(e.installment.count) : 1;
    installmentsInput.value = count;
  }
  if (installmentValueType) {
    if (e.category === 'Cartão') {
      const vType = (e.installment && e.installment.valueType) ? e.installment.valueType : (e.cardValueType || 'total');
      installmentValueType.value = vType;
    } else {
      installmentValueType.value = 'total';
    }
  }
  // Página 1: ao editar cartão, garantir 'Eu' e bloquear seleção
  if (!isPage2 && e.category === 'Cartão' && ownerInput) {
    ownerInput.value = 'Eu';
    ownerInput.disabled = true;
    ownerInput.classList.add('no-arrow');
  }
}

// -------------------- ATALHOS ----------
document.addEventListener("keydown", (e) => {
  const tag = document.activeElement && document.activeElement.tagName;
  if (e.key.toLowerCase() === "n" && !e.ctrlKey && !e.altKey && !e.metaKey) {
    if (!["INPUT","TEXTAREA","SELECT"].includes(tag)) {
      e.preventDefault();
      if (btnNew) btnNew.click();
    }
  }
  if (e.key === "/" && modal && modal.classList.contains("hidden")) {
    e.preventDefault();
    if (searchInput) searchInput.focus();
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
    e.preventDefault();
  }
});

// -------------------- GRÁFICO (Chart.js) --------------------
// Paleta de cores do gráfico por categoria (ajuste aqui facilmente)
const CATEGORY_COLORS = {
  // Página 1 (categorias)
  'Alimentação': '#b98552',
  'Lazer': '#be5b1dff',
  'Cartão': '#3b5844',
    'Gasolina': '#c58921',
  'Pessoal': '#7a5333',
  'Outros': '#8a6b4a',
  'Cofre': '#4a362b',
  // Página 2 (donos)
  'Eu': '#3b5844',     // mesmo tom do Cartão
  'Rafa': '#c58921',   // igual à Gasolina (mais contraste)
  'Mãe': '#6f8c54',    // verde oliva mais claro para diferenciar de Eu
  'Manu': '#b98552',   // igual à Alimentação
  'Matheus': '#7a5333' // marrom médio
};

let chart = null;
function renderChart() {
  if (typeof Chart === "undefined") return;
  const canvas = document.getElementById("chartBar");
  if (!canvas) return;

  let filtered = applyFilters(state.expenses);
  let categories, values;
  if (isPage2) {
    // Only Cartão and apply owner filter when selected
    filtered = filtered.filter(e => e.category === 'Cartão');
    const ownerFilter = (state.filters.category || '').trim().toLowerCase();
    if (ownerFilter) {
      const KNOWN_OWNERS = ["eu","rafa","mãe","manu","matheus"];
      if (ownerFilter === 'outros') {
        filtered = filtered.filter(e => !KNOWN_OWNERS.includes(((e.cardOwner || 'Eu') + '').trim().toLowerCase()));
      } else {
        filtered = filtered.filter(e => ((e.cardOwner || 'Eu') + '').trim().toLowerCase() === ownerFilter);
      }
    }
    const OWNERS = ["Eu","Rafa","Mãe","Manu","Matheus"];
    categories = [...OWNERS, "Outros"]; // inclui Outros
    const ownerSet = new Set(OWNERS);
    values = categories.map(owner => {
      if (owner === "Outros") {
        return filtered
          .filter(e => !ownerSet.has((e.cardOwner || 'Eu')))
          .reduce((s,e)=> s + Number(e.value), 0);
      }
      return filtered
        .filter(e=> (e.cardOwner||'Eu') === owner)
        .reduce((s,e)=> s + Number(e.value), 0);
    });
  } else {
    // Page1 normal categories, but Cartão only 'Eu' owner
    filtered = filtered.filter(e => !(e.category === 'Cartão' && (e.cardOwner||'Eu') !== 'Eu'));
    categories = ["Alimentação","Lazer","Cartão","Gasolina","Pessoal","Outros","Cofre"];
    values = categories.map(cat => filtered.filter(e=>e.category===cat).reduce((s,e)=>s+Number(e.value),0));
  }

  const ctx = canvas.getContext("2d");
  if (chart) { try { chart.destroy(); } catch {} chart = null; }

  chart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: categories,
      datasets: [{
        label: "Valores",
        data: values,
        borderWidth: 1,
        backgroundColor: categories.map(cat => CATEGORY_COLORS[cat] || '#334837'),
        hoverBackgroundColor: categories.map(cat => lighten(CATEGORY_COLORS[cat] || '#334837', 12)),
        borderColor: categories.map(() => '#2e211aff'),
        hoverBorderColor: categories.map(() => '#2e211aff'),
        hoverBorderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => BRL.format(ctx.parsed.y ?? ctx.parsed)
          }
        }
      },
      scales: {
        x: {
          ticks: { color: '#000000' },
          grid: { color: 'rgba(0,0,0,0.20)' },
          border: { color: '#000000' }
        },
        y: {
          beginAtZero: true,
          ticks: { color: '#000000', callback: (v) => BRL.format(v) },
          grid: { color: 'rgba(0,0,0,0.20)' },
          border: { color: '#000000' }
        }
      }
    }
  });
}

// -------------------- POPUPS (custom) --------------------
function showAlert(msg) {
  showConfirm(msg, ()=>{}, { okOnly:true });
}

function showConfirm(message, onConfirm = ()=>{}, opts={}) {
  if (!confirmModal || !confirmMsgEl || !confirmOkBtn || !confirmCancelBtn) {
    if (opts.okOnly) { alert(message); onConfirm(); return; }
    if (confirm(message)) onConfirm();
    return;
  }
  confirmMsgEl.textContent = message;
  confirmModal.style.display = 'flex';
  confirmModal.setAttribute('aria-hidden','false');

  function cleanup() {
    confirmModal.style.display = 'none';
    confirmModal.setAttribute('aria-hidden','true');
    confirmOkBtn.removeEventListener('click', okHandler);
    confirmCancelBtn.removeEventListener('click', cancelHandler);
  }
  function okHandler(){ cleanup(); onConfirm(); }
  function cancelHandler(){ cleanup(); }

  confirmOkBtn.addEventListener('click', okHandler);
  confirmCancelBtn.addEventListener('click', cancelHandler);

  if (opts.okOnly) {
    confirmCancelBtn.style.display = 'none';
    confirmOkBtn.textContent = 'Ok';
  } else {
    confirmCancelBtn.style.display = '';
    confirmOkBtn.textContent = 'Confirmar';
  }
}

// -------------------- MARIPO (logo) --------------------
(function initMaripo(){
  const el = document.querySelector('.maripo');
  if (!el) return;
  el.classList.add('idle');
  el.addEventListener('mouseenter', ()=>{ el.classList.remove('idle'); el.classList.add('hovering'); });
  el.addEventListener('mouseleave', ()=>{ el.classList.remove('hovering'); el.classList.add('idle'); });

  function maybePlay(){
    const delay = 6000 + Math.random()*5000;
    setTimeout(()=>{
      if (Math.random() < 0.17) {
        el.classList.add('play');
        setTimeout(()=> el.classList.remove('play'), 900);
      }
      maybePlay();
    }, delay);
  }
  maybePlay();
})();

// -------------------- BOOT --------------------
(async function boot(){
  try {
    await loadAllFromDB();
  } catch (e) {
    console.error("Boot error:", e);
    showAlert("Erro ao conectar ao servidor. Certifique-se de que ele está rodando em http://localhost:3001");
    state.expenses = [];
    render();
  }

  // Página 2: carregar e sincronizar vencimento da fatura
  if (isPage2 && dueDateInput && dueDateText) {
    updateDueDateUI();
    dueDateInput.addEventListener('change', () => {
      const iso = dueDateInput.value;
      const month = state.filters.month || todayMonth();
      if (iso) {
        localStorage.setItem(dueKey(month), iso);
        dueDateText.textContent = fmtDate(iso);
      } else {
        localStorage.removeItem(dueKey(month));
        dueDateText.textContent = 'Defina o vencimento';
      }
    });

    if (dueClearBtn) {
      dueClearBtn.addEventListener('click', () => {
        const month = state.filters.month || todayMonth();
        localStorage.removeItem(dueKey(month));
        dueDateInput.value = '';
        dueDateText.textContent = 'Defina o vencimento';
      });
    }
  }
})();

// expose functions used in HTML
window.editExpense = editExpense;
window.confirmDelete = confirmDelete;
window.confirmDeleteGroup = confirmDeleteGroup;
// sair removido
