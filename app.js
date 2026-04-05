const STORAGE_KEY = "b2b-trade-hub-v1";
const VIEW_MODE_KEY = "b2b-trade-view-mode-v1";
const SECTION_KEY = "b2b-trade-section-v1";
const STATUS_COLUMNS = [
  { key: "draft", title: "Черновик" },
  { key: "review", title: "Проверка" },
  { key: "published", title: "Опубликовано" },
  { key: "bidding", title: "Идут торги" },
  { key: "done", title: "Завершено" },
];
const STATUS_SET = new Set(STATUS_COLUMNS.map((item) => item.key));

const cardsEl = document.getElementById("cards");
const statsEl = document.getElementById("stats");
const boardTitleEl = document.getElementById("boardTitle");
const resultCountEl = document.getElementById("resultCount");
const cardTemplate = document.getElementById("cardTemplate");

const searchInput = document.getElementById("searchInput");
const categoryFilter = document.getElementById("categoryFilter");

const createBtn = document.getElementById("createBtn");
const viewSellBtn = document.getElementById("viewSellBtn");
const viewBuyBtn = document.getElementById("viewBuyBtn");
const viewListBtn = document.getElementById("viewListBtn");
const viewKanbanBtn = document.getElementById("viewKanbanBtn");

const lotDialog = document.getElementById("lotDialog");
const lotForm = document.getElementById("lotForm");
const addLotBtn = document.getElementById("addLotBtn");
const lotItems = document.getElementById("lotItems");
const closeDialogBtn = document.getElementById("closeDialogBtn");
const cancelDialogBtn = document.getElementById("cancelDialogBtn");

let listings = loadListings();
let viewMode = loadViewMode();
let section = loadSection();

resetLotBuilder();
render();

searchInput.addEventListener("input", render);
categoryFilter.addEventListener("change", render);

viewSellBtn.addEventListener("click", () => {
  setSection("sell");
});

viewBuyBtn.addEventListener("click", () => {
  setSection("buy");
});

viewListBtn.addEventListener("click", () => {
  setViewMode("list");
});

viewKanbanBtn.addEventListener("click", () => {
  setViewMode("kanban");
});

createBtn.addEventListener("click", openDialog);
addLotBtn.addEventListener("click", () => appendLotRow());
closeDialogBtn.addEventListener("click", closeDialog);
cancelDialogBtn.addEventListener("click", closeDialog);

lotForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const formData = new FormData(lotForm);
  const lots = collectLots();
  if (!lots.length) {
    alert("Добавьте хотя бы один лот: позиция, количество и максимальная цена.");
    return;
  }

  const item = {
    id: crypto.randomUUID(),
    type: String(formData.get("type")),
    status: normalizeStatus(String(formData.get("status"))),
    company: cleanText(formData.get("company")),
    city: cleanText(formData.get("city")),
    category: cleanText(formData.get("category")),
    title: cleanText(formData.get("title")),
    lots,
    description: cleanText(formData.get("description")),
    verified: true,
    rating: randomRating(),
    createdAt: Date.now(),
  };

  listings.unshift(item);
  saveListings();
  closeDialog();
  lotForm.reset();
  resetLotBuilder();

  injectCategory(item.category);
  section = item.type === "buy" ? "buy" : "sell";
  localStorage.setItem(SECTION_KEY, section);
  render();
});

function render() {
  renderCategories();
  renderStats();
  renderBoard();
}

function renderCategories() {
  const current = categoryFilter.value || "all";
  const values = Array.from(new Set(listings.map((item) => item.category))).sort((a, b) => a.localeCompare(b));

  categoryFilter.innerHTML = '<option value="all">Все категории</option>';

  values.forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    categoryFilter.append(option);
  });

  if (["all", ...values].includes(current)) {
    categoryFilter.value = current;
  }
}

function renderStats() {
  const sellCount = listings.filter((item) => item.type === "sell").length;
  const buyCount = listings.filter((item) => item.type === "buy").length;
  const verifiedCount = listings.filter((item) => item.verified).length;
  const avgCheck = averageCheck();

  statsEl.innerHTML = "";

  const stats = [
    { label: "Объявлений о продаже", value: sellCount },
    { label: "Объявлений о покупке", value: buyCount },
    { label: "Проверенных компаний", value: verifiedCount },
    { label: "Средний чек сделки", value: money(avgCheck) },
  ];

  stats.forEach((stat) => {
    const card = document.createElement("article");
    card.className = "stat-card";
    card.innerHTML = `<p>${stat.label}</p><strong>${stat.value}</strong>`;
    statsEl.append(card);
  });
}

function renderBoard() {
  const filtered = getFilteredListings();
  const companyLotCounts = getCompanyLotCountsBySection();
  cardsEl.innerHTML = "";
  cardsEl.classList.toggle("cards-list", viewMode === "list");
  cardsEl.classList.toggle("cards-kanban", viewMode === "kanban");

  viewListBtn.classList.toggle("is-active", viewMode === "list");
  viewKanbanBtn.classList.toggle("is-active", viewMode === "kanban");
  viewSellBtn.classList.toggle("is-active", section === "sell");
  viewBuyBtn.classList.toggle("is-active", section === "buy");

  boardTitleEl.textContent = resolveTitle();
  resultCountEl.textContent = `${filtered.length} результатов`;

  if (!filtered.length) {
    const empty = document.createElement("li");
    empty.className = "empty";
    empty.textContent = "По этим параметрам пока нет объявлений.";
    cardsEl.append(empty);
    return;
  }

  if (viewMode === "kanban") {
    renderKanban(filtered, companyLotCounts);
    return;
  }

  renderList(filtered, companyLotCounts);
}

function renderList(items, companyLotCounts) {
  items.forEach((item, index) => {
    const node = cardTemplate.content.cloneNode(true);
    const card = node.querySelector(".trade-card");
    const typeBadge = node.querySelector(".type-badge");
    const statusBadge = node.querySelector(".status-badge");
    const title = node.querySelector(".card-title");
    const desc = node.querySelector(".card-desc");
    const lotsEl = node.querySelector(".card-lots");
    const meta = node.querySelector(".card-meta");
    const company = node.querySelector(".company");
    const lots = normalizeLots(item.lots);
    const totalUnits = sumLotUnits(lots);
    const totalBudget = sumLotBudget(lots);

    typeBadge.textContent = item.type === "sell" ? "Компания продает" : "Компания покупает";
    typeBadge.classList.add(item.type === "sell" ? "type-sell" : "type-buy");
    statusBadge.textContent = resolveStatusLabel(item.status);
    statusBadge.classList.add(`status-${normalizeStatus(item.status)}`);

    title.textContent = item.title;
    desc.textContent = item.description || "Описание будет предоставлено после отклика.";
    renderLotsPreview(lotsEl, lots);

    meta.innerHTML = [
      `<span>${item.category}</span>`,
      `<span>${lots.length} ${declension(lots.length, ["лот", "лота", "лотов"])}</span>`,
      `<span>${totalUnits} ${declension(totalUnits, ["шт", "шт", "шт"])}</span>`,
      `<span>до ${money(totalBudget)}</span>`,
      `<span>${item.city}</span>`,
    ].join("");

    const listingCount = companyLotCounts.get(item.company) || 1;
    company.textContent = `${item.company} • объявлений: ${listingCount} • рейтинг ${item.rating}`;

    card.style.animationDelay = `${Math.min(index * 35, 210)}ms`;
    cardsEl.append(node);
  });
}

function renderKanban(items, companyLotCounts) {
  STATUS_COLUMNS.forEach((column) => {
    const columnEl = document.createElement("li");
    columnEl.className = "kanban-column";

    const columnItems = items.filter((item) => normalizeStatus(item.status) === column.key);

    const head = document.createElement("div");
    head.className = "kanban-head";

    const title = document.createElement("h3");
    title.className = "kanban-title";
    title.textContent = column.title;
    head.append(title);

    const count = document.createElement("span");
    count.className = "kanban-count";
    count.textContent = String(columnItems.length);
    head.append(count);
    columnEl.append(head);

    const list = document.createElement("ul");
    list.className = "kanban-list";

    if (!columnItems.length) {
      const empty = document.createElement("li");
      empty.className = "kanban-empty";
      empty.textContent = "Нет объявлений";
      list.append(empty);
    } else {
      columnItems.forEach((item, index) => {
        const node = cardTemplate.content.cloneNode(true);
        const card = node.querySelector(".trade-card");
        const typeBadge = node.querySelector(".type-badge");
        const statusBadge = node.querySelector(".status-badge");
        const titleNode = node.querySelector(".card-title");
        const desc = node.querySelector(".card-desc");
        const lotsEl = node.querySelector(".card-lots");
        const meta = node.querySelector(".card-meta");
        const company = node.querySelector(".company");
        const lots = normalizeLots(item.lots);
        const totalUnits = sumLotUnits(lots);
        const totalBudget = sumLotBudget(lots);

        typeBadge.textContent = item.type === "sell" ? "Компания продает" : "Компания покупает";
        typeBadge.classList.add(item.type === "sell" ? "type-sell" : "type-buy");
        card.classList.add(item.type === "sell" ? "trade-sell" : "trade-buy");
        statusBadge.textContent = resolveStatusLabel(item.status);
        statusBadge.classList.add(`status-${normalizeStatus(item.status)}`);

        titleNode.textContent = item.title;
        desc.textContent = item.description || "Описание будет предоставлено после отклика.";
        renderLotsPreview(lotsEl, lots);
        meta.innerHTML = [
          `<span>${item.category}</span>`,
          `<span>${lots.length} ${declension(lots.length, ["лот", "лота", "лотов"])}</span>`,
          `<span>${totalUnits} ${declension(totalUnits, ["шт", "шт", "шт"])}</span>`,
          `<span>до ${money(totalBudget)}</span>`,
          `<span>${item.city}</span>`,
        ].join("");
        const listingCount = companyLotCounts.get(item.company) || 1;
        company.textContent = `${item.company} • объявлений: ${listingCount} • рейтинг ${item.rating}`;

        card.style.animationDelay = `${Math.min(index * 35, 210)}ms`;
        list.append(node);
      });
    }

    columnEl.append(list);
    cardsEl.append(columnEl);
  });
}

function getCompanyLotCountsBySection() {
  const counts = new Map();

  listings.forEach((item) => {
    if (item.type !== section) return;
    const key = item.company;
    counts.set(key, (counts.get(key) || 0) + 1);
  });

  return counts;
}

function getFilteredListings() {
  const query = searchInput.value.trim().toLowerCase();
  const category = categoryFilter.value;

  return listings.filter((item) => {
    const matchesSection = item.type === section;
    const matchesCategory = category === "all" || item.category === category;
    const lotNames = normalizeLots(item.lots)
      .map((lot) => lot.name)
      .join(" ");
    const searchable = `${item.title} ${item.company} ${item.category} ${item.description} ${lotNames}`.toLowerCase();
    const matchesSearch = query.length === 0 || searchable.includes(query);

    return matchesSection && matchesCategory && matchesSearch;
  });
}

function resolveTitle() {
  return section === "buy" ? "Раздел покупок" : "Раздел продаж";
}

function averageCheck() {
  if (!listings.length) return 0;

  const total = listings.reduce((sum, item) => sum + sumLotBudget(normalizeLots(item.lots)), 0);
  return Math.round(total / listings.length);
}

function openDialog() {
  const typeField = lotForm.elements.namedItem("type");
  if (typeField && "value" in typeField) {
    typeField.value = section;
  }
  if (!lotItems.children.length) {
    resetLotBuilder();
  }

  if (typeof lotDialog.showModal === "function") {
    lotDialog.showModal();
    return;
  }

  lotDialog.setAttribute("open", "open");
}

function closeDialog() {
  if (typeof lotDialog.close === "function") {
    lotDialog.close();
    return;
  }

  lotDialog.removeAttribute("open");
}

function loadListings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return demoData();

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || !parsed.length) return demoData();

    return parsed.map(normalizeListing).sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    return demoData();
  }
}

function loadViewMode() {
  const mode = localStorage.getItem(VIEW_MODE_KEY);
  return mode === "kanban" ? "kanban" : "list";
}

function loadSection() {
  const value = localStorage.getItem(SECTION_KEY);
  return value === "buy" ? "buy" : "sell";
}

function setViewMode(mode) {
  viewMode = mode === "kanban" ? "kanban" : "list";
  localStorage.setItem(VIEW_MODE_KEY, viewMode);
  render();
}

function setSection(value) {
  section = value === "buy" ? "buy" : "sell";
  localStorage.setItem(SECTION_KEY, section);
  render();
}

function saveListings() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(listings));
}

function demoData() {
  return [
    {
      id: crypto.randomUUID(),
      type: "sell",
      company: "АО СеверМет Индастри",
      city: "Екатеринбург",
      category: "Металл и сырье",
      title: "Листовая сталь 09Г2С",
      lots: [
        { name: "Листовая сталь 09Г2С", quantity: 180, maxPrice: 74200 },
        { name: "Уголок стальной 50x50", quantity: 90, maxPrice: 51800 },
      ],
      status: "published",
      description: "Поставка партиями, сертификаты качества, отгрузка за 48 часов.",
      verified: true,
      rating: "4.9",
      createdAt: Date.now() - 1000 * 60 * 45,
    },
    {
      id: crypto.randomUUID(),
      type: "buy",
      company: "ООО ГринЛогистик",
      city: "Казань",
      category: "Логистика",
      title: "Закупка дизельных тягачей Euro-6",
      lots: [
        { name: "Тягачи Euro-6", quantity: 8, maxPrice: 5150000 },
        { name: "Сервисные контракты", quantity: 8, maxPrice: 180000 },
      ],
      status: "review",
      description: "Нужны тягачи не старше 2022 года, пробег до 150 тыс. км.",
      verified: true,
      rating: "4.8",
      createdAt: Date.now() - 1000 * 60 * 90,
    },
    {
      id: crypto.randomUUID(),
      type: "sell",
      company: "ООО ПромАвтоматика",
      city: "Москва",
      category: "ИТ и автоматизация",
      title: "PLC-контроллеры Siemens S7-1200",
      lots: [
        { name: "PLC S7-1200 CPU", quantity: 120, maxPrice: 38900 },
        { name: "Модули ввода/вывода", quantity: 240, maxPrice: 12800 },
      ],
      status: "bidding",
      description: "Оригинал, полный комплект документации, помощь в интеграции.",
      verified: true,
      rating: "4.7",
      createdAt: Date.now() - 1000 * 60 * 130,
    },
    {
      id: crypto.randomUUID(),
      type: "buy",
      company: "ЗАО Биомед Партнер",
      city: "Санкт-Петербург",
      category: "Оборудование",
      title: "Линия фасовки для пищевого производства",
      lots: [
        { name: "Линия фасовки", quantity: 1, maxPrice: 28900000 },
        { name: "Пуско-наладка", quantity: 1, maxPrice: 950000 },
      ],
      status: "draft",
      description: "Требуется монтаж под ключ и обучение персонала.",
      verified: true,
      rating: "4.9",
      createdAt: Date.now() - 1000 * 60 * 170,
    },
  ];
}

function injectCategory(value) {
  if (!value) return;

  const exists = Array.from(categoryFilter.options).some((option) => option.value === value);
  if (exists) return;

  const option = document.createElement("option");
  option.value = value;
  option.textContent = value;
  categoryFilter.append(option);
}

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeLots(lots) {
  if (!Array.isArray(lots)) return [];

  return lots
    .map((lot) => ({
      name: cleanText(lot?.name),
      quantity: normalizePositiveInt(lot?.quantity),
      maxPrice: normalizePositiveInt(lot?.maxPrice),
    }))
    .filter((lot) => lot.name && lot.quantity > 0 && lot.maxPrice > 0);
}

function normalizeListing(item) {
  const lots = normalizeLots(item?.lots);
  if (lots.length) {
    return { ...item, lots };
  }

  const fallbackName = cleanText(item?.title) || "Позиция";
  const fallbackQuantity = normalizePositiveInt(item?.quantity);
  const fallbackMaxPrice = normalizePositiveInt(item?.price);

  return {
    ...item,
    lots: [{ name: fallbackName, quantity: fallbackQuantity, maxPrice: fallbackMaxPrice }],
  };
}

function normalizePositiveInt(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return Math.round(parsed);
}

function sumLotUnits(lots) {
  return lots.reduce((sum, lot) => sum + lot.quantity, 0);
}

function sumLotBudget(lots) {
  return lots.reduce((sum, lot) => sum + lot.quantity * lot.maxPrice, 0);
}

function renderLotsPreview(target, lots) {
  target.innerHTML = "";

  const preview = lots.slice(0, 3);
  preview.forEach((lot) => {
    const row = document.createElement("li");
    row.textContent = `${lot.name}: ${lot.quantity} шт, до ${money(lot.maxPrice)}`;
    target.append(row);
  });

  if (lots.length > preview.length) {
    const more = document.createElement("li");
    more.className = "lot-more";
    more.textContent = `+ еще ${lots.length - preview.length} ${declension(lots.length - preview.length, ["лот", "лота", "лотов"])}`;
    target.append(more);
  }
}

function collectLots() {
  const rows = Array.from(lotItems.querySelectorAll(".lot-row"));
  const lots = rows.map((row) => {
    const name = cleanText(row.querySelector('[name="lotName"]')?.value);
    const quantity = normalizePositiveInt(row.querySelector('[name="lotQuantity"]')?.value);
    const maxPrice = normalizePositiveInt(row.querySelector('[name="lotMaxPrice"]')?.value);
    return { name, quantity, maxPrice };
  });

  return lots.filter((lot) => lot.name && lot.quantity > 0 && lot.maxPrice > 0);
}

function appendLotRow(initial = {}) {
  const row = document.createElement("div");
  row.className = "lot-row";
  row.innerHTML = `
    <input name="lotName" type="text" maxlength="80" placeholder="Позиция (например, Карандаши)" required value="${escapeHtml(cleanText(initial.name))}" />
    <input name="lotQuantity" type="number" min="1" required value="${normalizePositiveInt(initial.quantity || 1)}" />
    <input name="lotMaxPrice" type="number" min="1" required value="${normalizePositiveInt(initial.maxPrice || 1)}" />
    <button type="button" class="icon-btn lot-remove" aria-label="Удалить лот">×</button>
  `;

  const removeBtn = row.querySelector(".lot-remove");
  removeBtn.addEventListener("click", () => {
    if (lotItems.children.length <= 1) return;
    row.remove();
  });

  lotItems.append(row);
}

function resetLotBuilder() {
  lotItems.innerHTML = "";
  appendLotRow();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function declension(value, forms) {
  const n = Math.abs(value) % 100;
  const n1 = n % 10;
  if (n > 10 && n < 20) return forms[2];
  if (n1 > 1 && n1 < 5) return forms[1];
  if (n1 === 1) return forms[0];
  return forms[2];
}

function normalizeStatus(status) {
  return STATUS_SET.has(status) ? status : "draft";
}

function resolveStatusLabel(status) {
  const normalized = normalizeStatus(status);
  const column = STATUS_COLUMNS.find((item) => item.key === normalized);
  return column ? column.title : "Черновик";
}

function randomRating() {
  return (4.5 + Math.random() * 0.5).toFixed(1);
}

function money(value) {
  return new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: 0,
  }).format(value) + " ₽";
}
