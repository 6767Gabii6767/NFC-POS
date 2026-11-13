(function () {
  "use strict";

  const config = window.NFC_POS_CONFIG || { mode: "demo", apiBaseUrl: "" };
  const amountValue = document.getElementById("amount-value");
  const continueButton = document.getElementById("continue-button");
  const confirmButton = document.getElementById("confirm-button");
  const paymentNotice = document.getElementById("payment-notice");
  const confirmNotice = document.getElementById("confirm-notice");
  const confirmAmountValue = document.getElementById("confirm-amount-value");
  const confirmModeValue = document.getElementById("confirm-mode-value");
  const modeLabel = document.getElementById("mode-label");
  const amountHint = document.querySelector(".amount-hint");
  const views = {
    payment: document.getElementById("payment-view"),
    confirm: document.getElementById("confirm-view"),
    history: document.getElementById("history-view")
  };
  const DEMO_STORAGE_KEY = "nfc-pos-demo-transactions-v1";
  const MAX_AMOUNT_BANI = 99_999_999;
  const exampleTransactions = [
    { id: "demo-1", amount: 12500, date: "2026-11-13T09:42:00+02:00", status: "Finalizată" },
    { id: "demo-2", amount: 4990, date: "2026-11-12T16:18:00+02:00", status: "Finalizată" },
    { id: "demo-3", amount: 27500, date: "2026-11-12T11:06:00+02:00", status: "Finalizată" }
  ];

  let amountBani = 0;
  let activeView = "payment";

  if (config.mode === "stripe-test") modeLabel.textContent = "Stripe Test";

  function formatAmount(bani) {
    return (bani / 100).toLocaleString("ro-RO", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  function setNotice(element, message, tone) {
    element.textContent = message;
    element.className = `notice notice-${tone || "info"}`;
    element.hidden = false;
  }

  function clearNotice(element) {
    element.textContent = "";
    element.hidden = true;
  }

  function updateAmount() {
    amountValue.textContent = formatAmount(amountBani);
    continueButton.disabled = amountBani < 100 || amountBani > MAX_AMOUNT_BANI;
    amountHint.classList.toggle("hint-error", amountBani > MAX_AMOUNT_BANI);
    if (amountBani > MAX_AMOUNT_BANI) {
      amountHint.textContent = "Suma maximă este 999.999,99 RON.";
    } else {
      amountHint.textContent = "Valoare minimă: 1,00 RON";
    }
  }

  function showView(name) {
    activeView = name;
    Object.entries(views).forEach(([key, view]) => {
      view.hidden = key !== name;
    });
    document.querySelectorAll(".nav-button").forEach((button) => {
      const active = (name === "confirm" ? "payment" : name) === button.dataset.view;
      button.classList.toggle("is-active", active);
      if (active) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
    if (name === "history") renderHistory();
  }

  function readDemoTransactions() {
    try {
      const saved = JSON.parse(localStorage.getItem(DEMO_STORAGE_KEY) || "[]");
      return Array.isArray(saved) ? saved.filter((item) => Number.isSafeInteger(item.amount)) : [];
    } catch {
      return [];
    }
  }

  function saveDemoTransaction() {
    const transactions = readDemoTransactions();
    transactions.unshift({
      id: `demo-${Date.now()}`,
      amount: amountBani,
      date: new Date().toISOString(),
      status: "Finalizată"
    });
    try {
      localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(transactions.slice(0, 25)));
    } catch {
      // The current demo still completes if local storage is unavailable.
    }
  }

  function formatDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Dată indisponibilă";
    return new Intl.DateTimeFormat("ro-RO", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit"
    }).format(date);
  }

  function transactionMarkup(transaction, label) {
    const row = document.createElement("article");
    row.className = "transaction-row";
    const details = document.createElement("div");
    details.className = "transaction-details";
    const icon = document.createElement("span");
    icon.className = `transaction-icon ${label === "Stripe Test" ? "transaction-icon-stripe" : ""}`;
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = label === "Stripe Test" ? "✓" : "⌁";
    const text = document.createElement("div");
    text.className = "transaction-text";
    const title = document.createElement("strong");
    title.textContent = label === "Stripe Test" ? "Plată Stripe Test" : "Tranzacție demonstrativă";
    const meta = document.createElement("span");
    meta.textContent = `${formatDate(transaction.date)} · ${transaction.status || "Confirmată"}`;
    text.append(title, meta);
    details.append(icon, text);
    const amount = document.createElement("strong");
    amount.className = "transaction-amount";
    amount.textContent = `${formatAmount(transaction.amount)} RON`;
    row.append(details, amount);
    return row;
  }

  function renderDemoTransactions() {
    const list = document.getElementById("demo-transactions");
    const transactions = [...readDemoTransactions(), ...exampleTransactions].slice(0, 8);
    document.getElementById("demo-count").textContent = String(transactions.length);
    list.replaceChildren();
    transactions.forEach((transaction) => list.append(transactionMarkup(transaction, "Demo")));
    if (!transactions.length) {
      list.append(emptyState("Nu există încă tranzacții demonstrative."));
    }
  }

  function emptyState(message) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = message;
    return empty;
  }

  async function renderStripeTransactions() {
    const list = document.getElementById("stripe-transactions");
    const count = document.getElementById("stripe-count");
    list.replaceChildren();
    if (!config.apiBaseUrl) {
      count.textContent = "0";
      list.append(emptyState("Conectează backendul Stripe Test pentru a vedea plățile confirmate."));
      return;
    }
    try {
      const response = await fetch(`${config.apiBaseUrl.replace(/\/$/, "")}/api/transactions`, {
        headers: { Accept: "application/json" }
      });
      if (!response.ok) throw new Error("API indisponibil");
      const data = await response.json();
      const transactions = Array.isArray(data.transactions) ? data.transactions : [];
      count.textContent = String(transactions.length);
      if (!transactions.length) {
        list.append(emptyState("Nu există plăți de test confirmate încă."));
        return;
      }
      transactions.forEach((transaction) => list.append(transactionMarkup({
        amount: transaction.amountBani,
        date: transaction.createdAt,
        status: "Confirmată prin webhook"
      }, "Stripe Test")));
    } catch {
      count.textContent = "—";
      list.append(emptyState("Backendul nu este conectat. Plățile Stripe Test confirmate vor apărea aici."));
    }
  }

  function renderHistory() {
    renderDemoTransactions();
    renderStripeTransactions();
  }

  function submitDemoPayment() {
    saveDemoTransaction();
    setNotice(paymentNotice, `Tranzacție demonstrativă înregistrată pentru ${formatAmount(amountBani)} RON. Nicio plată nu a fost efectuată.`, "success");
    amountBani = 0;
    updateAmount();
    showView("payment");
  }

  async function startStripeCheckout() {
    if (!config.apiBaseUrl) {
      setNotice(confirmNotice, "Backendul Stripe Test nu este configurat. Tranzacția nu a fost pornită.", "error");
      return;
    }
    confirmButton.disabled = true;
    confirmButton.classList.add("is-loading");
    confirmButton.setAttribute("aria-busy", "true");
    clearNotice(confirmNotice);
    try {
      const response = await fetch(`${config.apiBaseUrl.replace(/\/$/, "")}/api/checkout-sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ amountBani })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Nu s-a putut porni Checkout Test.");
      if (!data.url) throw new Error("Backendul nu a returnat un link Checkout valid.");
      window.location.assign(data.url);
    } catch (error) {
      setNotice(confirmNotice, error.message || "Nu am putut contacta backendul.", "error");
      confirmButton.disabled = false;
      confirmButton.classList.remove("is-loading");
      confirmButton.removeAttribute("aria-busy");
    }
  }

  async function checkStripeReturn(sessionId) {
    showView("payment");
    setNotice(paymentNotice, "Verificăm confirmarea plății cu serverul Stripe…", "info");
    if (!sessionId || !config.apiBaseUrl) {
      setNotice(paymentNotice, "Revenirea din Checkout nu confirmă plata. Backendul Stripe trebuie să verifice webhook-ul.", "info");
      return;
    }
    const endpoint = `${config.apiBaseUrl.replace(/\/$/, "")}/api/checkout-sessions/${encodeURIComponent(sessionId)}`;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        const response = await fetch(endpoint, { headers: { Accept: "application/json" } });
        const data = await response.json().catch(() => ({}));
        if (response.ok && data.status === "paid") {
          setNotice(paymentNotice, `Plata de test de ${formatAmount(data.amountBani)} RON a fost confirmată de server prin webhook Stripe.`, "success");
          return;
        }
      } catch {
        // Keep the result pending when the separately hosted backend is unreachable.
      }
      if (attempt < 4) await new Promise((resolve) => window.setTimeout(resolve, 1400));
    }
    setNotice(paymentNotice, "Plata nu este încă confirmată de webhook. Poți verifica din nou istoricul în câteva momente.", "info");
  }

  document.querySelectorAll("[data-key]").forEach((button) => {
    button.addEventListener("click", () => {
      const key = button.dataset.key;
      if (key === "clear") amountBani = 0;
      else if (key === "backspace") amountBani = Math.floor(amountBani / 10);
      else {
        const next = Number(`${amountBani}${key}`);
        if (Number.isSafeInteger(next) && next <= MAX_AMOUNT_BANI) amountBani = next;
        else amountBani = MAX_AMOUNT_BANI + 1;
      }
      clearNotice(paymentNotice);
      updateAmount();
    });
  });

  document.querySelectorAll(".nav-button").forEach((button) => {
    button.addEventListener("click", () => showView(button.dataset.view));
  });

  document.querySelectorAll("[data-view-link]").forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      showView("payment");
    });
  });

  continueButton.addEventListener("click", () => {
    if (amountBani < 100 || amountBani > MAX_AMOUNT_BANI) {
      setNotice(paymentNotice, "Introdu o sumă între 1,00 și 999.999,99 RON.", "error");
      return;
    }
    clearNotice(paymentNotice);
    clearNotice(confirmNotice);
    confirmAmountValue.textContent = formatAmount(amountBani);
    const stripeTest = config.mode === "stripe-test";
    confirmModeValue.textContent = stripeTest ? "Stripe Test" : "Demonstrație";
    document.querySelector(".demo-callout").hidden = stripeTest;
    showView("confirm");
  });

  document.getElementById("edit-amount-button").addEventListener("click", () => showView("payment"));
  document.getElementById("cancel-confirm-button").addEventListener("click", () => showView("payment"));
  confirmButton.addEventListener("click", () => {
    if (config.mode === "stripe-test") startStripeCheckout();
    else submitDemoPayment();
  });

  updateAmount();
  renderHistory();

  const params = new URLSearchParams(window.location.search);
  const paymentState = params.get("payment");
  if (paymentState === "stripe-return") {
    checkStripeReturn(params.get("session_id"));
  } else if (paymentState === "canceled") {
    showView("payment");
    setNotice(paymentNotice, "Checkout-ul de test a fost anulat. Nu s-a înregistrat nicio plată.", "info");
  }
  if (paymentState) {
    window.history.replaceState({}, "", window.location.pathname);
  }
})();
