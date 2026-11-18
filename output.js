(() => {
  "use strict";

  const byId = id => document.getElementById(id);
  const word = window.word;
  const dateInput = byId("date");
  const saveButton = byId("export-note");
  const printButton = byId("print");
  const status = byId("note-status");
  const sheet = byId("print-sheet");
  const notePrefix = "trace-seeding.note.v1.";
  const sessionNotes = new Map();
  let savePending = false;
  let notesRendered = false;

  function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  }

  function hasDate() {
    return Boolean(dateInput.value) && dateInput.validity.valid;
  }

  function countedSquares(state) {
    return state.counts.map(value => Number(String(value).replaceAll(",", "")));
  }

  function readNotes() {
    const notes = new Map(sessionNotes);
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key || !key.startsWith(notePrefix)) continue;
        let note;
        try { note = JSON.parse(localStorage.getItem(key)); } catch { continue; }
        if (!note || typeof note.date !== "string" || !Number.isFinite(note.created) ||
            !Number.isFinite(note.concentration) || !Array.isArray(note.counts) ||
            note.counts.length !== 4 || !note.counts.every(Number.isSafeInteger) ||
            !(note.available === null || Number.isFinite(note.available))) continue;
        notes.set(key, note);
      }
    } catch { /* A browser with storage disabled can still share notes from this session. */ }
    return [...notes.entries()].map(([key, note]) => ({ ...note, key }))
      .sort((a, b) => b.date.localeCompare(a.date) || b.created - a.created);
  }

  function noteLines(note) {
    const fmt = window.seedingFormat;
    const [tl, tr, bl, br] = note.counts;
    const lines = [
      fmt.cells(note.concentration) + " cells/mL",
      note.date,
      word("Top left", "左上") + " " + tl + "    " + word("Top right", "右上") + " " + tr,
      word("Bottom left", "左下") + " " + bl + "    " + word("Bottom right", "右下") + " " + br
    ];
    if (note.available !== null) {
      lines.push(word("Total suspension volume", "懸濁液の総量") + "  " + fmt.volume(note.available));
    }
    return lines;
  }

  async function copyNote(note, card) {
    const text = noteLines(note).join("\n");
    try {
      await navigator.clipboard.writeText(text);
      status.textContent = word("Note copied.", "付箋をコピーしました。");
    } catch {
      // The manual version also works in browsers without clipboard permission.
      let field = card.querySelector(".note-copy-text");
      if (!field) {
        field = element("textarea", undefined, "note-copy-text");
        field.readOnly = true;
        field.rows = 5;
        field.style.width = "100%";
        field.setAttribute("aria-label", word("Note text to copy", "コピーする付箋の内容"));
        card.append(field);
      }
      field.value = text;
      field.focus();
      field.select();
      field.setSelectionRange(0, field.value.length);
      status.textContent = word("Select Copy to copy the note.", "選択した文章をコピーできます。");
    }
  }

  function action(label, onClick) {
    const button = element("button", label);
    button.type = "button";
    button.addEventListener("click", onClick);
    return button;
  }

  function deleteNote(note) {
    if (!window.confirm(word("Delete the note dated " + note.date + "?", note.date + "の付箋を削除しますか？"))) return;
    if (!sessionNotes.delete(note.key)) {
      try { localStorage.removeItem(note.key); }
      catch {
        status.textContent = word("This note could not be deleted.", "付箋を削除できませんでした。");
        return;
      }
    }
    renderNotes();
    byId("notes").querySelector("summary").focus({ preventScroll: true });
    status.textContent = word("Note deleted.", "付箋を削除しました。");
  }

  function renderNotes() {
    if (!window.seedingFormat) return;
    const list = byId("note-list");
    const notes = readNotes();
    const cards = document.createDocumentFragment();
    for (const note of notes) {
      const [concentration, date, top, bottom, available] = noteLines(note);
      const card = element("article", undefined, "saved-note");
      const day = element("time", date, "note-date");
      day.dateTime = note.date;
      const counts = element("p", top, "note-counts");
      counts.append(element("br"), document.createTextNode(bottom));
      card.append(day, element("h3", concentration, "note-concentration"), counts);
      if (available) card.append(element("p", available, "note-volume"));
      const actions = element("div", undefined, "note-actions");
      actions.append(action(word("Copy", "コピー"), () => copyNote(note, card)));
      if (typeof navigator.share === "function") {
        actions.append(action(word("Share", "共有"), async () => {
          try {
            await navigator.share({ text: noteLines(note).join("\n") });
          } catch (error) {
            if (error.name !== "AbortError") await copyNote(note, card);
          }
        }));
      }
      const remove = action(word("Delete", "削除"), () => deleteNote(note));
      remove.className = "note-delete";
      actions.append(remove);
      card.append(actions);
      cards.append(card);
    }
    if (!notes.length) cards.append(element("p", word("No saved notes yet.", "保存した付箋はありません。"), "muted"));
    list.replaceChildren(cards);
    const count = byId("note-count");
    if (count) count.textContent = String(notes.length);
    notesRendered = true;
  }

  function saveNote() {
    const state = window.seedingState;
    if (!state?.measurement || !state.availableValid || !hasDate() || savePending) return;
    const note = { date: dateInput.value, counts: countedSquares(state),
      concentration: state.measurement.concentration, available: state.available, created: Date.now() };
    const key = notePrefix + (typeof crypto.randomUUID === "function" ? crypto.randomUUID() :
      note.created + "-" + crypto.getRandomValues(new Uint32Array(2)).join("-"));
    let persisted = true;
    try { localStorage.setItem(key, JSON.stringify(note)); }
    catch { sessionNotes.set(key, note); persisted = false; }
    renderNotes();
    byId("notes").open = true;
    status.textContent = persisted
      ? word("Note saved in this browser.", "このブラウザに付箋を保存しました。")
      : word("Note available for this session. Copy or share it to keep it.", "付箋は今回の表示中のみ有効です。コピーまたは共有で保存できます。");
    savePending = true;
    updateActions();
    setTimeout(() => { savePending = false; updateActions(); }, 1500);
  }

  function printChamber(state) {
    const figure = element("div", undefined, "print-chamber");
    const diagram = byId("chamber-art").cloneNode(true);
    diagram.removeAttribute("id");
    diagram.classList.add("print-grid");
    figure.append(diagram);
    for (const [i, count] of countedSquares(state).entries()) {
      figure.append(element("span", count, "print-corner corner-" + i));
    }
    return figure;
  }

  function printTable(lines) {
    const fmt = window.seedingFormat;
    const table = element("table");
    const heads = [
      word("Vessel and count", "容器・枚数"), word("Target cell count", "目標細胞数"),
      word("Final volume", "最終液量"), word("Dispense for", "分注の単位"),
      word("Stock suspension", "原液"), word("Medium to add", "追加する培地")
    ];
    const heading = table.createTHead().insertRow();
    for (const title of heads) {
      const th = element("th", title);
      th.scope = "col";
      heading.append(th);
    }
    for (const line of lines) {
      const { vessel, count, wells, units, target, final, stock, medium, stockTotal, mediumTotal } = line;
      const isPlate = vessel.wells > 1;
      const unit = isPlate ? "well" : "dish";
      const body = table.createTBody();
      const row = body.insertRow();
      const vesselCell = element("th");
      vesselCell.scope = "rowgroup";
      const label = element("div", undefined, "print-vessel");
      const artwork = element("span", undefined, "print-vessel-icon");
      artwork.innerHTML = window.vesselIcon(vessel);
      const name = element("span", vessel.name + " × " + count);
      if (isPlate) {
        name.append(element("br"), document.createTextNode(word(
          wells + " of " + vessel.wells + " wells per plate", "1枚あたり " + wells + "/" + vessel.wells + " well")));
      }
      label.append(artwork, name);
      vesselCell.append(label);
      const cells = element("td", fmt.cells(target) + " cells/" + unit);
      const volume = element("td", fmt.volume(final) + "/" + unit);
      for (const cell of [vesselCell, cells, volume]) cell.rowSpan = units > 1 ? 2 : 1;
      row.append(vesselCell, cells, volume);
      function transfer(tr, scope, amount, diluent) {
        tr.append(element("td", scope), element("td", fmt.volume(amount), "print-stock"),
          element("td", diluent === null || diluent < 0 ? "—" : fmt.volume(diluent), "print-medium"));
      }
      transfer(row, word("Per " + unit, "1 " + unit + "あたり"), stock, medium);
      if (units > 1) transfer(body.insertRow(), word(
        "Total for " + units + (isPlate ? " wells" : " dishes"), "計 " + units + (isPlate ? " well" : " 枚")), stockTotal, mediumTotal);
      if (medium === null || medium < 0) {
        const warning = body.insertRow().insertCell();
        warning.colSpan = heads.length;
        warning.textContent = word("The required stock volume exceeds the final volume.", "必要な原液量が最終液量を超えています。");
      }
    }
    return table;
  }

  function buildPrintSheet() {
    const state = window.seedingState;
    sheet.replaceChildren();
    if (!state?.valid || !hasDate()) {
      sheet.append(element("p", word("Complete the measurement, date and seeding inputs before printing.",
        "測定日とカウント、入力中の播種先を確認してから印刷してください。")));
      return false;
    }
    const fmt = window.seedingFormat;
    const heading = element("div", undefined, "print-heading");
    const date = element("time", dateInput.value);
    date.dateTime = dateInput.value;
    heading.append(element("strong", "TЯace · " + word("Cell seeding calculator", "細胞濃度・播種量の計算")), date);
    const summary = element("div", undefined, "print-overview");
    const info = element("div", undefined, "print-count-info");
    info.append(element("p", word("Large Neubauer squares (1 mm², 0.1 mm deep)", "ノイバウエル計算盤の大区画（1 mm²、深さ0.1 mm）")),
      element("p", word("Mean ", "平均 ") + fmt.display(state.measurement.mean) + word(" × dilution factor ", " × 希釈倍率 ") +
        fmt.display(state.measurement.dilution) + " × 10,000"));
    const stock = element("div", undefined, "print-totals");
    stock.append(element("p", word("Stock cell concentration", "細胞懸濁液（原液）の濃度") + "　" + fmt.cells(state.measurement.concentration) + " cells/mL"));
    if (state.lines.length) stock.append(element("p", word("Total stock required", "必要な原液の合計") + "　" + fmt.volume(state.required)));
    if (state.available !== null) stock.append(element("p", word("Available stock", "原液の手持ち量") + "　" + fmt.volume(state.available)));
    if (state.balance !== null) {
      const balance = state.balance === 0 ? word("Exactly enough", "必要量と一致") :
        (state.balance < 0 ? word("Short by ", "不足 ") : word("Remaining ", "残り ")) + fmt.volume(Math.abs(state.balance));
      stock.append(element("p", balance));
    }
    summary.append(printChamber(state), info, stock);
    sheet.append(heading, summary);
    if (state.lines.length) sheet.append(printTable(state.lines));
    return true;
  }

  function updateActions() {
    const state = window.seedingState;
    saveButton.disabled = !state?.measurement || !state.availableValid || !hasDate() || savePending;
    printButton.disabled = !state?.valid || !hasDate();
  }
  function onUpdate() {
    updateActions();
    if (!notesRendered) renderNotes();
  }
  saveButton.addEventListener("click", saveNote);
  printButton.addEventListener("click", () => { if (buildPrintSheet()) window.print(); });
  document.addEventListener("seedingchange", onUpdate);
  dateInput.addEventListener("input", updateActions);
  dateInput.addEventListener("change", updateActions);
  window.addEventListener("languagechange-ui", () => { status.textContent = ""; renderNotes(); });
  window.addEventListener("storage", event => {
    if (event.key === null || event.key.startsWith(notePrefix)) renderNotes();
  });
  window.addEventListener("beforeprint", buildPrintSheet);
  window.matchMedia("print").addEventListener("change", event => { if (event.matches) buildPrintSheet(); });
  onUpdate();
})();
