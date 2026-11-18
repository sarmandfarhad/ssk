const statusLine = document.querySelector("#status-line");
const panel = document.querySelector("#panel");

let action = "";
let open = false;
let deskIds = [];

function esc(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[char]));
}

function formatWhen(iso) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Baghdad",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(iso));
}

function connectionView(reason) {
  const closed = reason === "closed";
  statusLine.textContent = closed
    ? "This QR code does not work right now."
    : "This number is not available.";
  panel.innerHTML = `<h2 class="result-title">Connection</h2>
    <p class="lede">${closed
      ? "This QR code does not work before 8:30 AM or after 5:00 PM. Nothing can be assigned outside those hours."
      : "Nothing was assigned. The desk and this page stay linked by the one QR code."}</p>`;
}

function choiceView() {
  statusLine.textContent = "Choose Take or Put, then write the name.";
  panel.innerHTML = `<div class="choices">
      <button type="button" class="choice-btn" data-action="take">
        <strong>Take</strong>
        <span>Write one name and select up to 10 IDs.</span>
      </button>
      <button type="button" class="choice-btn" data-action="put">
        <strong>Put</strong>
        <span>Write one name and select up to 10 IDs.</span>
      </button>
    </div>`;
}

function assignView() {
  const taking = action !== "put";
  const label = taking ? "Take" : "Put";
  const choices = deskIds.filter((item) => (taking ? item.available && !item.hold : item.hold));
  statusLine.textContent = `${label} is selected. Write the name and select up to 10 IDs.`;
  if (!choices.length) {
    panel.innerHTML = `<p class="lede">${taking ? "No IDs are available to take." : "No IDs are out to put back."}</p>
      <button class="btn neutral" type="button" id="back">Back</button>`;
    return;
  }
  const boxes = choices.map((item) => `<label class="pick" data-number="${esc(item.number)}" data-name="${esc(item.name || "")}">
      <input class="id-pick" type="checkbox" value="${esc(item.number)}" />
      <span><strong>${esc(item.number)}</strong></span>
    </label>`).join("");
  panel.innerHTML = `<form id="assign-form">
      <p class="muted">${label}</p>
      <label>
        Name
        <input id="scan-name" autocomplete="name" maxlength="60" required />
      </label>
      <label>
        Search
        <input id="id-search" type="search" placeholder="Number or name" autocomplete="off" />
      </label>
      <p id="pick-count" class="muted">0 of 10 selected</p>
      <p id="pick-empty" class="empty" hidden>No IDs match that search.</p>
      <div class="pick-list">${boxes}</div>
      <div class="actions">
        <button class="btn brand" type="submit">Assign</button>
        <button class="btn neutral" type="button" id="back">Back</button>
      </div>
      <p id="scan-msg" class="msg" role="status"></p>
    </form>`;
  document.querySelector("#scan-name").focus();
}

function selectedNumbers() {
  return [...document.querySelectorAll(".id-pick:checked")].map((input) => input.value);
}

function resultView(body) {
  const items = body.items || (body.item ? [body.item] : []);
  const when = items[0] && (items[0].hold ? items[0].hold.at : items[0].lastPut && items[0].lastPut.at);
  const person = items[0] && items[0].name ? items[0].name : "";
  const numbers = items.map((item) => item.number).join(", ");
  const line = body.action === "put"
    ? `${person || "Someone"} put ${numbers} back.`
    : `${person || "Someone"} took ${numbers}.`;
  statusLine.textContent = "Assigned.";
  panel.innerHTML = `<h2 class="result-title">Assigned</h2>
    <p class="lede">${esc(line)}</p>
    <p class="muted">${when ? esc(formatWhen(when)) : ""}</p>
    <button class="btn brand" type="button" id="done">Done</button>`;
}

async function loadHours() {
  const response = await fetch("/api/desk");
  if (!response.ok) throw new Error("offline");
  const data = await response.json();
  open = Boolean(data.open);
  deskIds = data.ids || [];
  action = "";
  if (!open) connectionView("closed");
  else choiceView();
}

async function openAssign(nextAction) {
  const response = await fetch("/api/desk");
  if (!response.ok) throw new Error("offline");
  const data = await response.json();
  open = Boolean(data.open);
  deskIds = data.ids || [];
  if (!open) return connectionView("closed");
  action = nextAction;
  assignView();
}

panel.addEventListener("click", (event) => {
  const choice = event.target.closest("[data-action]");
  if (choice) {
    if (!open) return connectionView("closed");
    openAssign(choice.dataset.action).catch(() => {
      statusLine.textContent = "The desk server is not responding.";
    });
    return;
  }
  if (event.target.id === "back" || event.target.id === "done") {
    action = "";
    if (!open) connectionView("closed");
    else choiceView();
  }
});

panel.addEventListener("input", (event) => {
  if (event.target.id !== "id-search") return;
  const query = event.target.value.trim().toLowerCase();
  let shown = 0;
  document.querySelectorAll(".pick").forEach((row) => {
    const haystack = `${row.dataset.number} ${row.dataset.name || ""}`.toLowerCase();
    const match = !query || haystack.includes(query);
    row.hidden = !match;
    if (match) shown += 1;
  });
  const empty = document.querySelector("#pick-empty");
  if (empty) empty.hidden = shown > 0;
});

panel.addEventListener("change", (event) => {
  if (!event.target.classList.contains("id-pick")) return;
  const checked = document.querySelectorAll(".id-pick:checked");
  const message = document.querySelector("#scan-msg");
  if (checked.length > 10) {
    event.target.checked = false;
    message.textContent = "You can select 10 IDs at one time.";
    message.className = "msg is-bad";
  } else if (message) {
    message.textContent = "";
    message.className = "msg";
  }
  const count = document.querySelector("#pick-count");
  if (count) count.textContent = `${document.querySelectorAll(".id-pick:checked").length} of 10 selected`;
});

panel.addEventListener("submit", async (event) => {
  const form = event.target;
  if (form.id !== "assign-form") return;
  event.preventDefault();
  const message = document.querySelector("#scan-msg");
  const submit = form.querySelector("button[type=submit]");
  submit.disabled = true;
  message.textContent = "";
  message.className = "msg";
  try {
    const response = await fetch("/api/scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        name: document.querySelector("#scan-name").value,
        numbers: selectedNumbers(),
      }),
    });
    const body = await response.json();
    if (body.result === "connection") {
      open = Boolean(body.open);
      connectionView(body.reason);
      return;
    }
    if (!response.ok) {
      message.textContent = body.error || "Could not assign that number.";
      message.className = "msg is-bad";
      return;
    }
    resultView(body);
  } catch (error) {
    message.textContent = "The desk server is not responding.";
    message.className = "msg is-bad";
  } finally {
    if (submit.isConnected) submit.disabled = false;
  }
});

loadHours().catch(() => {
  statusLine.textContent = "The desk server is not responding.";
});

setInterval(() => {
  if (document.querySelector("#assign-form") || document.querySelector("#done")) return;
  fetch("/api/desk")
    .then((response) => response.json())
    .then((data) => {
      if (data.open === open) return;
      open = data.open;
      if (!open) connectionView("closed");
      else choiceView();
    })
    .catch(() => {});
}, 15000);
