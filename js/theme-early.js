// Apply the saved theme and Day / Night before the page paints (no flash of the wrong colors).
try {
  var t = localStorage.getItem("tn-theme");
  if (t === "green" || t === "mono" || t === "dusk") document.documentElement.setAttribute("data-theme", t);
  if (localStorage.getItem("tn-mode") === "day") document.documentElement.setAttribute("data-mode", "day");
} catch (e) {}

// The page's icons follow the theme too (browser tab, and the icon used when it's added to a home screen).
try {
  var th = localStorage.getItem("tn-theme");
  th = th === "mono" || th === "dusk" ? "-" + th : "";
  if (th) {
    var links = document.querySelectorAll('link[rel="icon"], link[rel="apple-touch-icon"]');
    for (var i = 0; i < links.length; i++) links[i].href = links[i].getAttribute("href").replace(/\.png$/, th + ".png");
  }
} catch (e) {}
