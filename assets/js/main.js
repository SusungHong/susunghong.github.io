(function () {
  var menuToggle = document.getElementById("menu-toggle");
  var nav = document.getElementById("site-nav");
  var themeToggle = document.getElementById("theme-toggle");
  var root = document.documentElement;
  var header = document.querySelector(".site-header");

  if (header) {
    var SCROLL_THRESHOLD = 36;
    var scrolledClassApplied = false;
    var ticking = false;

    function updateHeaderState() {
      var shouldBeScrolled = window.scrollY > SCROLL_THRESHOLD;
      if (shouldBeScrolled !== scrolledClassApplied) {
        header.classList.toggle("scrolled", shouldBeScrolled);
        scrolledClassApplied = shouldBeScrolled;
      }
      ticking = false;
    }

    function onScroll() {
      if (!ticking) {
        window.requestAnimationFrame(updateHeaderState);
        ticking = true;
      }
    }

    updateHeaderState();
    window.addEventListener("scroll", onScroll, { passive: true });
  }

  function getEffectiveTheme() {
    var explicit = root.getAttribute("data-theme");
    if (explicit === "light" || explicit === "dark") {
      return explicit;
    }
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }

  function updateThemeToggleLabel() {
    if (!themeToggle) return;
    var current = getEffectiveTheme();
    themeToggle.setAttribute(
      "aria-label",
      current === "dark" ? "Switch to light theme" : "Switch to dark theme"
    );
  }

  if (themeToggle) {
    updateThemeToggleLabel();

    themeToggle.addEventListener("click", function () {
      var nextTheme = getEffectiveTheme() === "dark" ? "light" : "dark";
      root.setAttribute("data-theme", nextTheme);
      localStorage.setItem("theme", nextTheme);
      updateThemeToggleLabel();
    });

    window
      .matchMedia("(prefers-color-scheme: dark)")
      .addEventListener("change", function () {
        if (!root.getAttribute("data-theme")) {
          updateThemeToggleLabel();
        }
      });
  }

  if (menuToggle && nav) {
    menuToggle.addEventListener("click", function () {
      nav.classList.toggle("open");
      menuToggle.classList.toggle("active");
    });

    nav.querySelectorAll(".nav-link").forEach(function (link) {
      link.addEventListener("click", function () {
        nav.classList.remove("open");
        menuToggle.classList.remove("active");
      });
    });
  }

  // A quiet door: three quick taps on the Korean name, or the classic code.
  var footerKoreanName = document.querySelector(".footer-korean-name");
  var secretTaps = [];
  var secretCode = [
    "ArrowUp",
    "ArrowUp",
    "ArrowDown",
    "ArrowDown",
    "ArrowLeft",
    "ArrowRight",
    "ArrowLeft",
    "ArrowRight",
    "b",
    "a"
  ];
  var secretProgress = 0;

  function enterPlayroom() {
    window.location.assign("/playroom/");
  }

  if (footerKoreanName) {
    footerKoreanName.addEventListener("click", function () {
      var now = Date.now();
      secretTaps = secretTaps.filter(function (time) {
        return now - time < 2400;
      });
      secretTaps.push(now);
      if (secretTaps.length >= 3) enterPlayroom();
    });
  }

  document.addEventListener("keydown", function (event) {
    if (event.key === secretCode[secretProgress]) {
      secretProgress += 1;
      if (secretProgress === secretCode.length) {
        secretProgress = 0;
        enterPlayroom();
      }
    } else {
      secretProgress = event.key === secretCode[0] ? 1 : 0;
    }
  });
})();
