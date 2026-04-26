(function () {
  var menuToggle = document.getElementById("menu-toggle");
  var nav = document.getElementById("site-nav");
  var themeToggle = document.getElementById("theme-toggle");
  var root = document.documentElement;

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
})();
