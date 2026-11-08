// Apply the saved theme before the page paints (no flash of the wrong colors).
try {
  var t = localStorage.getItem("tn-theme");
  if (t === "green" || t === "mono" || t === "dusk") document.documentElement.setAttribute("data-theme", t);
} catch (e) {}
