const clockEl = document.querySelector("#clock");
const openEl = document.querySelector("#open-state");
const statsEl = document.querySelector("#stats");
const listEl = document.querySelector("#list");
const form = document.querySelector("#add-form");
const numberInput = document.querySelector("#number");
const atInput = document.querySelector("#at");
const formMsg = document.querySelector("#form-msg");
const scanUrlEl = document.querySelector("#scan-url");
const searchInput = document.querySelector("#search");
const qrNote = document.querySelector("#qr-note");
const qrCard = document.querySelector(".qr-card");
let latest = { ids: [] };

function personName(item) {
  if (item.available && !item.hold) return "";
  return item.name || (item.hold && item.hold.name) || "";
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function localStamp(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
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

function formatClock(date = new Date()) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Baghdad",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

function esc(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[char]));
}

function say(text, kind) {
  formMsg.textContent = text;
  formMsg.className = `msg${kind ? ` is-${kind}` : ""}`;
}

function tick() {
  clockEl.textContent = formatClock();
}

if (!atInput.value) atInput.value = localStamp();
tick();
setInterval(tick, 1000);

function paintTable() {
  const query = searchInput.value.trim().toLowerCase();
  const ids = latest.ids.filter((item) => {
    if (!query) return true;
    return item.number.toLowerCase().includes(query) || personName(item).toLowerCase().includes(query);
  });

  if (!latest.ids.length) {
    listEl.innerHTML = '<p class="empty">No IDs yet. Add a number to put it on the desk.</p>';
    return;
  }
  if (!ids.length) {
    listEl.innerHTML = '<p class="empty">No IDs match that search.</p>';
    return;
  }

  const rows = ids.map((item) => {
    const yes = item.available && !item.hold;
    const name = personName(item);
    return `<tr>
      <td class="num">${esc(item.number)}</td>
      <td class="${name ? "who" : "who is-empty"}">${name ? esc(name) : "—"}</td>
      <td><time datetime="${esc(item.at)}">${esc(formatWhen(item.at))}</time></td>
      <td>
        <div class="segment" role="group" aria-label="Status for ${esc(item.number)}">
          <button type="button" class="is-yes" data-set="yes" data-number="${esc(item.number)}" aria-pressed="${yes ? "true" : "false"}">Available</button>
          <button type="button" class="is-no" data-set="no" data-number="${esc(item.number)}" aria-pressed="${yes ? "false" : "true"}">Not available</button>
        </div>
      </td>
      <td><button type="button" class="linkish" data-remove="${esc(item.number)}">Remove</button></td>
    </tr>`;
  }).join("");

  listEl.innerHTML = `<div class="table-wrap">
    <table class="desk-table">
      <thead>
        <tr>
          <th>ID number</th>
          <th>Name</th>
          <th>Date and time</th>
          <th>Status</th>
          <th></th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

function render(data) {
  latest = data;
  const available = data.ids.filter((item) => item.available && !item.hold).length;
  const unavailable = data.ids.length - available;
  openEl.textContent = data.open ? "Open" : "Closed";
  openEl.className = `pill ${data.open ? "is-open" : "is-closed"}`;
  scanUrlEl.textContent = data.scanUrl || "";
  qrCard.classList.toggle("is-closed", !data.open);
  qrNote.textContent = data.open
    ? "Working now. Scan to Take or Put."
    : "Not working now. It does not work before 8:30 AM or after 5:00 PM.";
  statsEl.innerHTML = [
    ["IDs", data.ids.length],
    ["Available", available],
    ["Not available", unavailable],
  ].map(([label, value]) => `<article class="stat"><b>${value}</b><span>${label}</span></article>`).join("");
  paintTable();
}

async function refresh() {
  const response = await fetch("/api/desk");
  if (!response.ok) throw new Error("Could not load the desk.");
  render(await response.json());
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const submit = form.querySelector("button[type=submit]");
  submit.disabled = true;
  say("");
  try {
    const response = await fetch("/api/ids", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        number: numberInput.value,
        at: atInput.value,
        available: form.available.value === "yes",
      }),
    });
    const body = await response.json();
    if (!response.ok) {
      say(body.error || "Could not add that ID.", "bad");
      return;
    }
    form.reset();
    atInput.value = localStamp();
    form.available.value = "yes";
    numberInput.focus();
    say(`${body.item.number} added.`, "ok");
    await refresh();
  } catch (error) {
    say("The desk server is not responding.", "bad");
  } finally {
    submit.disabled = false;
  }
});

listEl.addEventListener("click", async (event) => {
  const status = event.target.closest("[data-set]");
  const remove = event.target.closest("[data-remove]");
  if (!status && !remove) return;
  if (status && status.getAttribute("aria-pressed") === "true") return;
  const number = status ? status.dataset.number : remove.dataset.remove;
  if (remove && !window.confirm(`Remove ID ${number}?`)) return;
  try {
    const response = await fetch(`/api/ids/${encodeURIComponent(number)}`, status
      ? {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ available: status.dataset.set === "yes" }),
        }
      : { method: "DELETE" });
    const body = await response.json();
    if (!response.ok) {
      say(body.error || "Could not update that ID.", "bad");
      return;
    }
    say(remove ? `${number} removed.` : `${number} updated.`, "ok");
    await refresh();
  } catch (error) {
    say("The desk server is not responding.", "bad");
  }
});

searchInput.addEventListener("input", () => paintTable());

refresh().catch(() => say("The desk server is not responding.", "bad"));
setInterval(() => {
  refresh().catch(() => {});
}, 5000);
