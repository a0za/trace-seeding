(() => {
  "use strict";

  const vessels = [
    { name: "35 mm dish", wells: 1, volume: 2 },
    { name: "60 mm dish", wells: 1, volume: 5 },
    { name: "100 mm dish", wells: 1, volume: 10 },
    { name: "6 well plate", wells: 6, volume: 2 },
    { name: "12 well plate", wells: 12, volume: 1 },
  ];
  const word = (english, japanese) => window.word(english, japanese);
  const rangeError = () => word("A value is outside the supported calculation range.", "数値が計算できる範囲を超えています。");
  const numberPattern = /^[+-]?(?:(?:[0-9]+|[0-9]{1,3}(?:,[0-9]{3})+)(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?$/;

  function parseNumber(text) {
    const trimmed = text.trim();
    if (!numberPattern.test(trimmed)) return NaN;
    const value = Number(trimmed.replaceAll(",", ""));
    return Number.isFinite(value) ? value : NaN;
  }

  function measure(counts, dilutionText) {
    if (counts.some(text => !text.trim())) {
      throw Error(word("Enter the four counts to calculate concentration.", "四隅の数を入力すると濃度を計算します。"));
    }
    const numbers = counts.map(parseNumber);
    if (numbers.some(n => !Number.isSafeInteger(n) || n < 0)) {
      throw Error(word("Enter a non-negative whole number for each square.", "各区画の細胞数は0以上の整数で入力してください。"));
    }
    const dilution = parseNumber(dilutionText);
    if (!(dilution >= 1)) {
      throw Error(word("Enter a dilution factor of at least 1.", "希釈倍率は1以上の数値で入力してください。"));
    }
    const mean = numbers.reduce((sum, n) => sum + n, 0) / 4;
    const concentration = mean * 10_000 * dilution;
    if (!Number.isFinite(concentration)) throw Error(rangeError());
    return { counts: numbers, mean, dilution, concentration };
  }

  function difference(lhs, rhs) {
    const delta = lhs - rhs;
    const exponent = Math.floor(Math.log2(Math.max(Math.abs(lhs), Math.abs(rhs))));
    const ulp = Math.max(Number.MIN_VALUE, 2 ** (exponent - 52));
    return Math.abs(delta) <= 4 * ulp ? 0 : delta;
  }

  function calculate(vessel, inputs, concentration) {
    const count = parseNumber(inputs.count);
    if (!Number.isSafeInteger(count) || count < 1) {
      throw Error(word("Enter a whole number of vessels (at least 1).", "枚数は1以上の整数で入力してください。"));
    }
    const wells = Number(inputs.wells);
    if (!Number.isInteger(wells) || wells < 1 || wells > vessel.wells) {
      throw Error(word("Choose the number of wells used per plate.", "使用well数をプレートの範囲内で指定してください。"));
    }
    const target = parseNumber(inputs.target);
    if (!Number.isSafeInteger(target) || target < 1) {
      throw Error(word("Enter a positive whole number of target cells.", "目標細胞数を正の整数で入力してください。"));
    }
    const final = parseNumber(inputs.final);
    if (!(final > 0)) throw Error(word("Enter a final volume greater than zero.", "最終液量は0より大きい数値で入力してください。"));
    if (!(concentration > 0)) {
      throw Error(word("A stock concentration of zero cannot supply the target cells.", "濃度が0のため播種に必要な原液量を計算できません。"));
    }
    const units = count * wells;
    const stock = target / concentration;
    const stockTotal = stock * units;
    const finalTotal = final * units;
    if (!Number.isSafeInteger(units) || !(stock > 0) || !Number.isFinite(stockTotal) || !Number.isFinite(finalTotal)) {
      throw Error(rangeError());
    }
    const mixture = difference(final, stock);
    const medium = mixture >= 0 ? mixture : null;
    const mediumTotal = medium === null ? null : medium * units;
    return { vessel, count, wells, units, target, final, stock, medium, stockTotal, mediumTotal, finalTotal };
  }

  const normalFormat = new Intl.NumberFormat("en-US", { maximumSignificantDigits: 6 });
  const exponentialFormat = new Intl.NumberFormat("en-US", { notation: "scientific", maximumSignificantDigits: 6 });
  const cellsFormat = new Intl.NumberFormat("en-US", {
    notation: "scientific", minimumFractionDigits: 1, maximumFractionDigits: 1, roundingMode: "halfEven",
  });
  const volumeFormats = [0, 1, 2].map(precision => new Intl.NumberFormat("en-US", {
    maximumFractionDigits: precision, roundingMode: "halfEven",
  }));

  function display(value) {
    const magnitude = Math.abs(value);
    const scientific = magnitude !== 0 && (magnitude < 0.0001 || magnitude >= 1e10);
    return (scientific ? exponentialFormat : normalFormat).format(value);
  }

  function volume(ml) {
    if (ml === 0) return "0 mL";
    if (!Number.isFinite(ml) || ml < 0) return "—";
    if (ml < 0.0005) return "< 0.5 µL";
    if (ml < 0.9995) {
      const decimals = ml < 0.01 ? 2 : ml < 0.1 ? 1 : 0;
      return volumeFormats[decimals].format(ml * 1000) + " µL";
    }
    return (ml >= 1e10 ? display(ml) : volumeFormats[1].format(ml)) + " mL";
  }

  function cells(value) {
    if (!Number.isFinite(value) || value < 0) return "—";
    if (value === 0) return "0";
    const [mantissa, exponent] = cellsFormat.format(value).split("E");
    const raised = Array.from(exponent, char => char === "-" ? "⁻" : "⁰¹²³⁴⁵⁶⁷⁸⁹"[Number(char)]).join("");
    return mantissa + " × 10" + raised;
  }
  window.seedingFormat = { display, volume, cells };

  const byId = id => document.getElementById(id);
  const countFields = [1, 2, 3, 4].map(index => byId("count-" + index));
  const rows = new Map();
  const vesselButtons = new Map();

  function tag(name, text, className) {
    const element = document.createElement(name);
    element.textContent = text;
    if (className) element.className = className;
    return element;
  }

  function makeIcon(vessel) {
    const wrapper = document.createElement("span");
    wrapper.className = "vessel-art";
    wrapper.setAttribute("aria-hidden", "true");
    wrapper.innerHTML = window.vesselIcon(vessel);
    return wrapper;
  }

  function localizeCard(row) {
    const { card, vessel, unit } = row;
    const plate = vessel.wells > 1;
    const labels = {
      target: word("Target cells", "目標細胞数") + " (cells/" + unit + ")",
      count: plate ? word("Plates", "プレート枚数") : word("Dishes", "ディッシュ枚数"),
      wells: word("Wells per plate", "使用well数 / plate"),
      final: word("Final volume", "最終液量") + " (mL/" + unit + ")",
    };
    for (const span of card.querySelectorAll("[data-label]")) span.textContent = labels[span.dataset.label];
    const remove = card.querySelector(".remove-vessel");
    remove.textContent = word("Remove", "削除");
    remove.setAttribute("aria-label", word("Remove " + vessel.name, vessel.name + "を削除"));
  }

  function addDestination(vessel, addButton) {
    const card = document.createElement("article");
    card.className = "destination-card";
    card.tabIndex = -1;
    card.setAttribute("aria-label", vessel.name);
    const unit = vessel.wells === 1 ? "dish" : "well";
    card.innerHTML = `
      <div class="card-title"><h3></h3><button type="button" class="remove-vessel"></button></div>
      <div class="fields">
        <label><span data-label="target"></span><input name="target" type="text" inputmode="numeric" placeholder="100000" autocomplete="off"><small class="target-preview"></small></label>
        <label><span data-label="count"></span><input name="count" type="text" inputmode="numeric" value="1" autocomplete="off"></label>
        ${vessel.wells > 1 ? '<label><span data-label="wells"></span><select name="wells"></select></label>' : ""}
        <label><span data-label="final"></span><input name="final" type="text" inputmode="decimal" autocomplete="off"></label>
      </div>
      <div class="row-result"></div>`;
    card.querySelector("h3").append(makeIcon(vessel), tag("span", vessel.name, "vessel-name"));
    const field = name => card.querySelector('[name="' + name + '"]');
    const target = field("target"), count = field("count"), wells = field("wells"), final = field("final");
    final.value = String(vessel.volume);
    if (wells) {
      for (let n = 1; n <= vessel.wells; n++) wells.add(new Option(String(n), String(n)));
      wells.value = String(vessel.wells);
    }
    const row = {
      card, vessel, unit, result: card.querySelector(".row-result"), preview: card.querySelector(".target-preview"),
      read: () => ({ target: target.value, count: count.value, wells: wells ? wells.value : "1", final: final.value }),
    };
    rows.set(card, row);
    localizeCard(row);
    card.querySelector(".remove-vessel").addEventListener("click", () => {
      rows.delete(card);
      card.remove();
      refresh();
      addButton.focus();
    });
    byId("rows").append(card);
    refresh();
    if (window.matchMedia("(pointer: coarse)").matches) {
      card.focus({ preventScroll: true });
      card.scrollIntoView({ block: "nearest" });
    } else {
      target.focus();
    }
  }

  function renderMix(row, line) {
    const table = document.createElement("table");
    table.className = "mix-table";
    table.setAttribute("aria-label", word("Dispensing volumes", "分注量") + " · " + line.vessel.name);
    const header = table.createTHead().insertRow();
    for (const label of [word("Dispense for", "分注の単位"), word("Stock", "原液"), word("Medium", "培地")]) {
      const th = tag("th", label);
      th.scope = "col";
      header.append(th);
    }
    const body = table.createTBody();
    function addAmounts(scope, stock, medium) {
      const tr = body.insertRow();
      const th = tag("th", scope);
      th.scope = "row";
      tr.append(th, tag("td", volume(stock)), tag("td", medium === null ? "—" : volume(medium)));
    }
    addAmounts(word("Per " + row.unit, "1 " + row.unit + "あたり"), line.stock, line.medium);
    if (line.units > 1) {
      const totalScope = row.unit === "dish"
        ? word("Total · " + line.units + " dishes", "計 " + line.units + " 枚")
        : word("Total · " + line.units + " wells", "計 " + line.units + " well");
      addAmounts(totalScope, line.stockTotal, line.mediumTotal);
    }
    row.result.append(table);
    if (line.medium === null) {
      row.result.append(tag("p", word("The required stock volume exceeds the final volume.", "必要な原液量が最終液量を超えています。"), "warning"));
    }
  }

  function refresh() {
    const counts = countFields.map(input => input.value);
    const dilutionText = byId("dilution").value;
    byId("empty").hidden = rows.size > 0;
    byId("reset-counts").disabled = counts.every(text => text === "");
    let measurement = null;
    try {
      measurement = measure(counts, dilutionText);
      byId("concentration").textContent = cells(measurement.concentration);
      const mean = display(measurement.mean), dilution = display(measurement.dilution);
      byId("measurement-note").textContent = word("Mean " + mean + " × dilution " + dilution, "平均 " + mean + " × 希釈倍率 " + dilution) + " × 10,000";
    } catch (error) {
      byId("concentration").textContent = "—";
      byId("measurement-note").textContent = error.message;
    }

    const lines = [];
    let required = 0, finalTotal = 0;
    for (const row of rows.values()) {
      const inputs = row.read();
      const target = parseNumber(inputs.target);
      const showTarget = Number.isSafeInteger(target) && target > 0;
      row.preview.textContent = showTarget ? cells(target) + " cells/" + row.unit : "";
      row.preview.hidden = !showTarget;
      row.result.replaceChildren();
      if (!measurement) continue;
      try {
        const line = calculate(row.vessel, inputs, measurement.concentration);
        lines.push(line);
        required += line.stockTotal;
        finalTotal += line.finalTotal;
        renderMix(row, line);
      } catch (error) {
        row.result.append(tag("p", error.message, "warning"));
      }
    }

    const rawAvailable = byId("available").value.trim();
    const parsed = rawAvailable ? parseNumber(rawAvailable) : null;
    const availableValid = parsed === null || parsed >= 0;
    const available = availableValid ? parsed : null;
    const finite = Number.isFinite(required) && Number.isFinite(finalTotal);
    const valid = Boolean(measurement) && lines.length === rows.size && finite && availableValid;
    const showTotal = valid && rows.size > 0;
    const balance = showTotal && available !== null ? difference(available, required) : null;

    let message = "";
    if (!availableValid) message = word("Enter a non-negative available volume in mL.", "原液の手持ち量は0以上のmLで入力してください。");
    else if (!finite) message = rangeError();
    else if (measurement && lines.length !== rows.size) message = word("Complete each vessel to show the total.", "すべての播種先を入力すると合計を表示します。");
    byId("total-note").textContent = message;
    byId("required").textContent = showTotal ? volume(required) : "—";
    let balanceText = "—";
    if (balance === 0) balanceText = word("Exactly enough", "必要量と一致");
    else if (balance !== null) {
      balanceText = (balance < 0 ? word("Short by ", "不足 ") : word("Remaining ", "残り ")) + volume(Math.abs(balance));
    }
    byId("balance").textContent = balanceText;
    byId("balance").classList.toggle("warning", balance !== null && balance < 0);
    window.seedingState = { counts, measurement, available, availableValid, lines: valid ? lines : [],
      required: valid ? required : null, balance, valid };
    document.dispatchEvent(new CustomEvent("seedingchange", { bubbles: true, detail: window.seedingState }));
  }

  function updateLanguage() {
    for (const [button, vessel] of vesselButtons) {
      button.setAttribute("aria-label", word("Add " + vessel.name, vessel.name + "を追加"));
    }
    for (const row of rows.values()) localizeCard(row);
    refresh();
  }

  for (const vessel of vessels) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "vessel-button";
    const plus = tag("span", "+", "vessel-add");
    plus.setAttribute("aria-hidden", "true");
    button.append(makeIcon(vessel), tag("span", vessel.name, "vessel-name"), plus);
    button.addEventListener("click", () => addDestination(vessel, button));
    byId("vessels").append(button);
    vesselButtons.set(button, vessel);
  }
  byId("reset-counts").addEventListener("click", () => {
    for (const input of countFields) input.value = "";
    refresh();
    countFields[0].focus();
  });
  countFields.forEach((input, index) => {
    input.addEventListener("keydown", event => {
      if (event.key !== "Enter" || event.isComposing) return;
      event.preventDefault();
      const next = countFields[index + 1];
      if (next) next.focus();
      else input.blur();
    });
  });
  for (const field of [...countFields, byId("dilution"), byId("available"), byId("rows")]) {
    field.addEventListener("input", refresh);
  }
  window.refreshSeeding = refresh;
  window.addEventListener("languagechange-ui", updateLanguage, true);
  updateLanguage();
})();
