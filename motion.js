"use strict";

/* Живость страницы: числа, которые набегают, и сравнение двух снимков
   ползунком. Отдельным файлом, а не внутри index.js: там демонстрация с
   эпиполярными линиями, и мешать её арифметику с оформлением незачем.

   Оба куска молча выключаются, если на странице нет их разметки, поэтому
   файл можно подключать на любой странице. */

/* --- числа, которые набегают ------------------------------------------- */

(function () {
  var cells = document.querySelectorAll("[data-count]");
  if (!cells.length) return;

  /* Без наблюдателя числа просто ставятся на место: страница должна быть
     читаемой и в браузере, который ничего не умеет. */
  if (!("IntersectionObserver" in window) ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    cells.forEach(function (cell) { cell.textContent = cell.getAttribute("data-count"); });
    return;
  }

  function run(cell) {
    var target = cell.getAttribute("data-count");
    var decimals = (target.split(".")[1] || "").length;
    var to = parseFloat(target);
    var started = null;
    var span = 1100;

    function step(now) {
      if (started === null) started = now;
      var k = Math.min(1, (now - started) / span);
      /* Замедление к концу: число «приезжает» и останавливается, а не
         обрывается на полном ходу. */
      var eased = 1 - Math.pow(1 - k, 3);
      cell.textContent = (to * eased).toFixed(decimals);
      if (k < 1) requestAnimationFrame(step);
      else cell.textContent = target;
    }
    requestAnimationFrame(step);
  }

  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      io.unobserve(entry.target);
      run(entry.target);
    });
  }, { threshold: 0.6 });

  cells.forEach(function (cell) {
    cell.textContent = "0";
    io.observe(cell);
  });
})();

/* --- сравнение двух снимков -------------------------------------------- */

(function () {
  var boxes = document.querySelectorAll(".swipe");
  if (!boxes.length) return;

  boxes.forEach(function (box) {
    var top = box.querySelector(".swipe__top");
    var handle = box.querySelector(".swipe__handle");
    var input = box.querySelector(".swipe__range");
    if (!top || !handle) return;

    function place(percent) {
      percent = Math.max(0, Math.min(100, percent));
      top.style.clipPath = "inset(0 " + (100 - percent) + "% 0 0)";
      handle.style.left = percent + "%";
      if (input) input.value = percent;
    }

    function fromEvent(ev) {
      var rect = box.getBoundingClientRect();
      var x = (ev.touches ? ev.touches[0].clientX : ev.clientX) - rect.left;
      place((x / rect.width) * 100);
    }

    var dragging = false;
    box.addEventListener("pointerdown", function (ev) {
      dragging = true;
      box.setPointerCapture(ev.pointerId);
      fromEvent(ev);
    });
    box.addEventListener("pointermove", function (ev) { if (dragging) fromEvent(ev); });
    box.addEventListener("pointerup", function () { dragging = false; });
    box.addEventListener("pointercancel", function () { dragging = false; });

    /* Ползунок нужен не для красоты: с клавиатуры прямоугольник не потянешь,
       а стрелками по range -- можно. */
    if (input) {
      input.addEventListener("input", function () { place(parseFloat(input.value)); });
    }
    place(52);
  });
})();
