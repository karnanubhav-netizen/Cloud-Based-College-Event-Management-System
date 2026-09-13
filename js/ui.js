// ==========================================================================
// ui.js
// Small, page-agnostic UI behaviors: mobile nav toggle, active-link marking.
// No Firebase or business logic lives here on purpose.
// ==========================================================================

function initMobileNav() {
  const toggle = document.querySelector("[data-nav-toggle]");
  const panel = document.querySelector("[data-nav-panel]");
  if (!toggle || !panel) return;

  toggle.addEventListener("click", () => {
    const isOpen = panel.classList.toggle("is-open");
    toggle.setAttribute("aria-expanded", String(isOpen));
  });
}

function markActiveNavLink() {
  const links = document.querySelectorAll("[data-nav-link]");
  const currentPath = window.location.pathname.split("/").pop() || "index.html";

  links.forEach((link) => {
    const linkPath = link.getAttribute("href");
    if (linkPath === currentPath) {
      link.setAttribute("aria-current", "page");
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  initMobileNav();
  markActiveNavLink();
});