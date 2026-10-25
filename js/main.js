/* Shared behaviour: band switcher, mobile nav, filters, copy-to-clipboard, maps. */
(function () {
  "use strict";

  const root = document.documentElement;
  const BANDS = ["rgb", "nir", "ndwi"];
  const STORE = "pkm-band";

  /* ---------- band combination (site theme) ---------- */
  function setBand(band, persist) {
    if (!BANDS.includes(band)) band = "rgb";
    root.dataset.band = band;
    document.querySelectorAll(".band button[data-band]").forEach((b) => {
      b.setAttribute("aria-pressed", String(b.dataset.band === band));
    });
    if (persist) {
      try { localStorage.setItem(STORE, band); } catch (e) { /* storage unavailable: ignore */ }
    }
    document.dispatchEvent(new CustomEvent("bandchange", { detail: { band } }));
  }

  document.querySelectorAll(".band button[data-band]").forEach((b) => {
    b.addEventListener("click", () => setBand(b.dataset.band, true));
  });

  // Keyboard shortcut: press 1 / 2 / 3 to switch bands (ignored while typing).
  document.addEventListener("keydown", (e) => {
    if (e.target && /^(input|textarea|select)$/i.test(e.target.tagName)) return;
    const i = ["1", "2", "3"].indexOf(e.key);
    if (i >= 0 && !e.metaKey && !e.ctrlKey && !e.altKey) setBand(BANDS[i], true);
  });

  setBand(root.dataset.band || "rgb", false);

  /* ---------- mobile nav ---------- */
  const head = document.querySelector(".site-head");
  const toggle = document.querySelector(".nav-toggle");
  if (head && toggle) {
    toggle.addEventListener("click", () => {
      const open = head.classList.toggle("open");
      toggle.setAttribute("aria-expanded", String(open));
      toggle.textContent = open ? "Close" : "Menu";
    });
  }

  /* ---------- toast ---------- */
  let toastEl = null, toastTimer = null;
  function toast(msg) {
    if (!toastEl) {
      toastEl = document.createElement("div");
      toastEl.className = "toast";
      toastEl.setAttribute("role", "status");
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2200);
  }

  /* ---------- copy citation ---------- */
  document.querySelectorAll("[data-copy]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const src = document.querySelector(btn.dataset.copy);
      const text = src ? src.textContent.replace(/\s+/g, " ").trim() : "";
      try {
        await navigator.clipboard.writeText(text);
        toast("Citation copied");
      } catch (e) {
        // Fallback for browsers without clipboard access (e.g. file:// in some setups)
        const ta = document.createElement("textarea");
        ta.value = text; ta.setAttribute("readonly", "");
        ta.style.position = "fixed"; ta.style.opacity = "0";
        document.body.appendChild(ta); ta.select();
        try { document.execCommand("copy"); toast("Citation copied"); }
        catch (err) { toast("Select the text to copy it"); }
        document.body.removeChild(ta);
      }
    });
  });

  /* ---------- generic tag filters ----------
     <div class="filters" data-filter-for="#list"> <button class="pill" data-value="all">…
     list items carry data-tags="a b c"; several filter groups can target the same list (AND). */
  const groups = document.querySelectorAll(".filters[data-filter-for]");
  const active = new Map(); // group element -> selected value

  function applyFilters(listSel) {
    const list = document.querySelector(listSel);
    if (!list) return;
    const sels = [...groups].filter((g) => g.dataset.filterFor === listSel).map((g) => active.get(g) || "all");
    let shown = 0;
    list.querySelectorAll("[data-tags]").forEach((item) => {
      const tags = item.dataset.tags.split(/\s+/);
      const ok = sels.every((v) => v === "all" || tags.includes(v));
      item.hidden = !ok;
      if (ok) shown++;
    });
    // year markers: hide when no visible item follows them before the next marker
    list.querySelectorAll(".year-mark").forEach((m) => {
      let n = m.nextElementSibling, any = false;
      while (n && !n.classList.contains("year-mark")) { if (!n.hidden) { any = true; break; } n = n.nextElementSibling; }
      m.hidden = !any;
    });
    const total = list.querySelectorAll("[data-tags]").length;
    document.querySelectorAll(`.count[data-count-for="${listSel}"]`).forEach((c) => {
      c.textContent = shown === total ? `${total} items` : `${shown} of ${total}`;
    });
  }

  groups.forEach((g) => {
    active.set(g, "all");
    g.querySelectorAll(".pill").forEach((p) => {
      p.addEventListener("click", () => {
        active.set(g, p.dataset.value);
        g.querySelectorAll(".pill").forEach((q) => q.setAttribute("aria-pressed", String(q === p)));
        applyFilters(g.dataset.filterFor);
      });
    });
    applyFilters(g.dataset.filterFor);
  });

  /* ---------- maps (Leaflet + Esri World Imagery) ----------
     makeSiteMap(frameEl, sites, { listEl }) — sites: [{name, where, note, lat, lng, id}] */
  window.makeSiteMap = function (frame, sites, opts) {
    opts = opts || {};
    const mapEl = frame.querySelector(".map");
    if (!window.L || !mapEl) { frame.classList.add("no-map"); return null; }

    const map = L.map(mapEl, { scrollWheelZoom: false, zoomControl: true, attributionControl: true });
    L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
      maxZoom: 18,
      attribution: "Imagery &copy; Esri &amp; partners"
    }).addTo(map);
    L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}", {
      maxZoom: 18, opacity: 0.9
    }).addTo(map);

    const markers = new Map();
    const icon = (activeState) => L.divIcon({ className: "", html: `<div class="site-marker${activeState ? " active" : ""}"></div>`, iconSize: [14, 14], iconAnchor: [7, 7] });

    sites.forEach((s) => {
      const m = L.marker([s.lat, s.lng], { icon: icon(false), title: s.name }).addTo(map);
      m.bindPopup(`<b>${s.name}</b><br>${s.where}${s.note ? "<br><span style='opacity:.8'>" + s.note + "</span>" : ""}`);
      m.on("click", () => highlight(s.id, false));
      markers.set(s.id, m);
    });

    const bounds = L.latLngBounds(sites.map((s) => [s.lat, s.lng]));
    map.fitBounds(bounds.pad(0.25));

    let current = null;
    function highlight(id, fly) {
      current = id;
      markers.forEach((m, key) => m.setIcon(icon(key === id)));
      document.querySelectorAll(`[data-site]`).forEach((el) => {
        const on = el.dataset.site === id;
        if (el.tagName === "BUTTON") el.setAttribute("aria-pressed", String(on));
        el.classList.toggle("active", on);
      });
      const m = markers.get(id);
      if (m) {
        if (fly) map.flyTo(m.getLatLng(), Math.max(map.getZoom(), 9), { duration: 0.8 });
        m.openPopup();
      }
    }

    document.querySelectorAll("[data-site]").forEach((el) => {
      const go = () => highlight(el.dataset.site, true);
      el.addEventListener("click", go);
      if (el.tagName !== "BUTTON") {
        el.setAttribute("tabindex", "0");
        el.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } });
      }
    });

    // keep the map honest after layout changes (theme switch, resize, sticky columns)
    setTimeout(() => map.invalidateSize(), 300);
    window.addEventListener("resize", () => map.invalidateSize());

    return { map, highlight, reset: () => map.fitBounds(bounds.pad(0.25)) };
  };

  /* ---------- footer year ---------- */
  document.querySelectorAll("[data-year]").forEach((el) => { el.textContent = new Date().getFullYear(); });
})();
