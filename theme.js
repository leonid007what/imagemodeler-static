"use strict";

/* Тема: три состояния — системная, явно светлая, явно тёмная.
   Тот же ключ хранения, что и на лендинге, чтобы выбор не сбрасывался
   при переходе между страницами. */
(function () {
  var root = document.documentElement;
  var saved = null;
  try { saved = localStorage.getItem("im-theme"); } catch (e) {}
  if (saved === "light" || saved === "dark") root.setAttribute("data-theme", saved);

  document.addEventListener("click", function (ev) {
    var btn = ev.target.closest && ev.target.closest(".theme-btn");
    if (!btn) return;
    var dark = getComputedStyle(root).getPropertyValue("--ground").trim().toLowerCase() === "#0e1013";
    var next = dark ? "light" : "dark";
    root.setAttribute("data-theme", next);
    try { localStorage.setItem("im-theme", next); } catch (e) {}
  });
})();

/* Кнопки «скопировать» — одна обработка на всю страницу. */
(function () {
  document.addEventListener("click", function (ev) {
    var btn = ev.target.closest && ev.target.closest(".copy");
    if (!btn) return;
    var src = document.getElementById(btn.getAttribute("data-copy"));
    if (!src) return;
    var text = src.textContent.trim();
    var done = function () {
      var was = btn.textContent;
      btn.textContent = "скопировано";
      setTimeout(function () { btn.textContent = was; }, 1400);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () {});
    } else {
      var ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); done(); } catch (e) {}
      document.body.removeChild(ta);
    }
  });
})();
