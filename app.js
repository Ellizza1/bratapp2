const STORAGE_KEY = "b2b-trade-hub-v1";

const cardsEl = document.getElementById("cards");
const statsEl = document.getElementById("stats");
const boardTitleEl = document.getElementById("boardTitle");
const resultCountEl = document.getElementById("resultCount");
const cardTemplate = document.getElementById("cardTemplate");

const searchInput = document.getElementById("searchInput");
const typeFilter = document.getElementById("typeFilter");
const categoryFilter = document.getElementById("categoryFilter");

const createBtn = document.getElementById("createBtn");
const viewSellBtn = document.getElementById("viewSellBtn");
const viewBuyBtn = document.getElementById("viewBuyBtn");

const lotDialog = document.getElementById("lotDialog");
const lotForm = document.getElementById("lotForm");
const closeDialogBtn = document.getElementById("closeDialogBtn");
const cancelDialogBtn = document.getElementById("cancelDialogBtn");

let listings = loadListings();

render();

searchInput.addEventListener("input", render);
typeFilter.addEventListener("change", render);
categoryFilter.addEventListener("change", render);

viewSellBtn.addEventListener("click", () => {
  typeFilter.value = "sell";
  render();
});

viewBuyBtn.addEventListener("click", () => {
  typeFilter.value = "buy";
  render();
});

createBtn.addEventListener("click", openDialog);
closeDialogBtn.addEventListener("click", closeDialog);
cancelDialogBtn.addEventListener("click", closeDialog);

lotForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const formData = new FormData(lotForm);
  const price = Number(formData.get("price"));
  const quantity = Number(formData.get("quantity"));

  const item = {
    id: crypto.randomUUID(),
    type: String(formData.get("type")),
    company: cleanText(formData.get("company")),
    city: cleanText(formData.get("city")),
    category: cleanText(formData.get("category")),
    title: cleanText(formData.get("title")),
    price: Number.isFinite(price) ? price : 0,
    quantity: Number.isFinite(quantity) ? quantity : 0,
    unit: cleanText(formData.get("unit")),
    description: cleanText(formData.get("description")),
    verified: true,
    rating: randomRating(),
    createdAt: Date.now(),
  };

  listings.unshift(item);
  saveListings();
  closeDialog();
  lotForm.reset();

  injectCategory(item.category);
  typeFilter.value = item.type;
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
    { label: "Лотов на продаже", value: sellCount },
    { label: "Заявок на закупку", value: buyCount },
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
  cardsEl.innerHTML = "";

  boardTitleEl.textContent = resolveTitle();
  resultCountEl.textContent = `${filtered.length} результатов`;

  if (!filtered.length) {
    const empty = document.createElement("li");
    empty.className = "empty";
    empty.textContent = "По этим параметрам пока нет объявлений.";
    cardsEl.append(empty);
    return;
  }

  filtered.forEach((item, index) => {
    const node = cardTemplate.content.cloneNode(true);
    const card = node.querySelector(".trade-card");
    const typeBadge = node.querySelector(".type-badge");
    const title = node.querySelector(".card-title");
    const desc = node.querySelector(".card-desc");
    const meta = node.querySelector(".card-meta");
    const company = node.querySelector(".company");

    typeBadge.textContent = item.type === "sell" ? "Компания продает" : "Компания покупает";
    typeBadge.classList.add(item.type === "sell" ? "type-sell" : "type-buy");

    title.textContent = item.title;
    desc.textContent = item.description || "Описание будет предоставлено после отклика.";

    meta.innerHTML = [
      `<span>${item.category}</span>`,
      `<span>${item.quantity} ${item.unit}</span>`,
      `<span>${money(item.price)} / ${item.unit}</span>`,
      `<span>${item.city}</span>`,
    ].join("");

    company.textContent = `${item.company} • рейтинг ${item.rating}`;

    card.style.animationDelay = `${Math.min(index * 35, 210)}ms`;
    cardsEl.append(node);
  });
}

function getFilteredListings() {
  const query = searchInput.value.trim().toLowerCase();
  const type = typeFilter.value;
  const category = categoryFilter.value;

  return listings.filter((item) => {
    const matchesType = type === "all" || item.type === type;
    const matchesCategory = category === "all" || item.category === category;
    const searchable = `${item.title} ${item.company} ${item.category} ${item.description}`.toLowerCase();
    const matchesSearch = query.length === 0 || searchable.includes(query);

    return matchesType && matchesCategory && matchesSearch;
  });
}

function resolveTitle() {
  if (typeFilter.value === "sell") return "Лента активов на продаже";
  if (typeFilter.value === "buy") return "Лента заявок на закупку";
  return "Все объявления";
}

function averageCheck() {
  if (!listings.length) return 0;

  const total = listings.reduce((sum, item) => sum + item.price * item.quantity, 0);
  return Math.round(total / listings.length);
}

function openDialog() {
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

    return parsed.sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    return demoData();
  }
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
      price: 74200,
      quantity: 180,
      unit: "т",
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
      price: 5150000,
      quantity: 8,
      unit: "шт",
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
      price: 38900,
      quantity: 120,
      unit: "шт",
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
      price: 28900000,
      quantity: 1,
      unit: "компл",
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

function randomRating() {
  return (4.5 + Math.random() * 0.5).toFixed(1);
}

function money(value) {
  return new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: 0,
  }).format(value) + " ₽";
}
