"use strict";

(() => {
  const languageKey = "trace-seeding.language";
  let preferred;
  try { preferred = localStorage.getItem(languageKey); } catch { /* Browser storage is optional. */ }
  const browserJapanese = (navigator.languages?.[0] || navigator.language).toLowerCase().startsWith("ja");
  let language = ["en", "ja"].includes(preferred) ? preferred : browserJapanese ? "ja" : "en";

  window.word = (english, japanese) => language === "ja" ? japanese : english;
  const text = [...document.querySelectorAll("[data-ja]")].map(element => ({ element, en: element.textContent }));
  const labels = [...document.querySelectorAll("[data-aria-ja]")].map(element => ({ element, en: element.getAttribute("aria-label") }));
  function applyLanguage() {
    document.documentElement.lang = language;
    document.title = window.word("Cell Seeding Calculator | TЯace", "細胞濃度・播種量の計算 | TЯace");
    for (const { element, en } of text) element.textContent = window.word(en, element.dataset.ja);
    for (const { element, en } of labels) element.setAttribute("aria-label", window.word(en, element.dataset.ariaJa));
    for (const button of document.querySelectorAll("[data-lang]")) {
      button.setAttribute("aria-pressed", String(button.dataset.lang === language));
    }
  }
  applyLanguage();
  for (const button of document.querySelectorAll("[data-lang]")) {
    button.addEventListener("click", () => {
      if (button.dataset.lang === language) return;
      language = button.dataset.lang;
      try { localStorage.setItem(languageKey, language); } catch { /* The session selection still applies. */ }
      applyLanguage();
      window.dispatchEvent(new Event("languagechange-ui"));
    });
  }

  // The worksheet uses the device's calendar date, including near local midnight.
  const now = new Date();
  const pad = number => String(number).padStart(2, "0");
  document.getElementById("date").value = [now.getFullYear(), pad(now.getMonth() + 1), pad(now.getDate())].join("-");

  // Draw the same culture vessels used in the notebook on screen and on paper.
  window.vesselIcon = vessel => {
    let body;
    if (vessel.wells === 1) {
      const width = vessel.name.startsWith("35") ? 26 : vessel.name.startsWith("60") ? 34 : 42;
      const x = (48 - width) / 2, radius = width / 2;
      body = `<path d="M${x} 14a${radius} 7 0 0 1 ${width} 0v5a${radius} 7 0 0 1 -${width} 0z" fill="#efc3c5"/>
        <ellipse cx="24" cy="14" rx="${radius}" ry="7" fill="#fff9f6"/>
        <ellipse cx="24" cy="15" rx="${radius - 2}" ry="5" fill="#e9a7aa" stroke="none"/>`;
    } else {
      const columns = vessel.wells === 6 ? 3 : 4, rows = vessel.wells / columns;
      const stepX = 36 / columns, stepY = 22 / rows;
      const radius = Math.min(stepX, stepY) * .37;
      let wells = "";
      for (let i = 0; i < vessel.wells; i++) {
        const x = 6 + (i % columns + .5) * stepX, y = 5 + (Math.floor(i / columns) + .5) * stepY;
        wells += `<circle cx="${x}" cy="${y}" r="${radius}" fill="#f2babe" stroke="#8da39b" stroke-width=".7"/>`;
      }
      body = `<rect x="3" y="3" width="42" height="26" rx="4" fill="#e2eeea"/><rect x="5" y="5" width="38" height="22" rx="3" fill="#fff" stroke="none"/>${wells}`;
    }
    return `<svg class="vessel-icon" width="48" height="32" viewBox="0 0 48 32" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg" stroke="#61786c" stroke-width="1.15">${body}</svg>`;
  };
})();
