/* Digital Hawk — lightweight frontend helpers
   - loads Google tag (gtag) for Ads
   - captures gclid + UTM params to hidden fields
   - submits scan forms to DH_CONFIG.formEndpoint then redirects to email/thanks
*/

(function () {
  "use strict";

  var CFG = (window.DH_CONFIG || {});
  var PARAM_KEYS = ["gclid", "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"];

  function nowMs() { return Date.now ? Date.now() : new Date().getTime(); }

  function safeGetStorage(storage, key) {
    try { return storage.getItem(key); } catch (e) { return null; }
  }
  function safeSetStorage(storage, key, value) {
    try { storage.setItem(key, value); } catch (e) {}
  }

  function readParamsFromUrl() {
    var out = {};
    try {
      var sp = new URLSearchParams(window.location.search || "");
      PARAM_KEYS.forEach(function (k) {
        var v = sp.get(k);
        if (v) out[k] = v;
      });
    } catch (e) {}
    return out;
  }

  function readStoredParams() {
    var raw = safeGetStorage(window.localStorage, "dh_params_v1");
    if (!raw) return {};
    try {
      var obj = JSON.parse(raw);
      // Expire after 30 days
      if (obj && obj._ts && (nowMs() - obj._ts) > (30 * 24 * 60 * 60 * 1000)) return {};
      return obj || {};
    } catch (e) {
      return {};
    }
  }

  function storeParams(params) {
    var existing = readStoredParams();
    var merged = Object.assign({}, existing, params);
    merged._ts = nowMs();
    safeSetStorage(window.localStorage, "dh_params_v1", JSON.stringify(merged));
    return merged;
  }

  function applyHiddenFields(params) {
    // Fill any <input type="hidden" name="utm_source" ...> etc
    PARAM_KEYS.forEach(function (k) {
      var els = document.querySelectorAll('input[type="hidden"][name="' + k + '"]');
      els.forEach(function (el) { el.value = params[k] || ""; });
    });

    // Helpful extra fields
    var extras = {
      landing_path: window.location.pathname,
      landing_url: window.location.href,
      referrer: document.referrer || "",
      user_timezone: Intl && Intl.DateTimeFormat ? Intl.DateTimeFormat().resolvedOptions().timeZone : ""
    };

    Object.keys(extras).forEach(function (k) {
      var els = document.querySelectorAll('input[type="hidden"][name="' + k + '"]');
      els.forEach(function (el) { el.value = extras[k] || ""; });
    });
  }

  function setTextById(id, text) {
    var el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  // Google tag (gtag) loader for Ads
  function loadGoogleTag() {
    if (!CFG.googleAdsId || CFG.googleAdsId.indexOf("AW-") !== 0 || CFG.googleAdsId.indexOf("REPLACE") !== -1) return;

    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
    window.gtag("js", new Date());
    window.gtag("config", CFG.googleAdsId);

    var s = document.createElement("script");
    s.async = true;
    s.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(CFG.googleAdsId);
    document.head.appendChild(s);
  }

  function fireConversionIfThanksPage() {
    if (!window.gtag) return;
    if (!CFG.googleAdsConversionLabel || CFG.googleAdsConversionLabel.indexOf("REPLACE") !== -1) return;

    var path = (window.location.pathname || "").replace(/\/+$/, "");
    if (/\/email\/thanks$/.test(path)) {
      window.gtag("event", "conversion", {
        send_to: CFG.googleAdsId + "/" + CFG.googleAdsConversionLabel
      });
    }
  }

  function siteRootPrefix() {
    var path = window.location.pathname || "/";
    var markers = ["/email/", "/contact/", "/privacy/"];

    for (var i = 0; i < markers.length; i += 1) {
      var idx = path.indexOf(markers[i]);
      if (idx !== -1) return path.slice(0, idx + 1);
    }

    var exactMarkers = ["/email", "/contact", "/privacy"];
    for (var j = 0; j < exactMarkers.length; j += 1) {
      if (path === exactMarkers[j]) return "/";
      if (path.endsWith(exactMarkers[j])) {
        return path.slice(0, path.length - exactMarkers[j].length) || "/";
      }
    }

    if (path.endsWith("/")) return path;
    var lastSlash = path.lastIndexOf("/");
    return lastSlash >= 0 ? path.slice(0, lastSlash + 1) : "/";
  }

  function toSitePath(relativePath) {
    var clean = (relativePath || "").replace(/^\/+/, "");
    var prefix = siteRootPrefix();
    if (!prefix.endsWith("/")) prefix += "/";
    return prefix + clean;
  }

  // Form submission
  function initScanForms(params) {
    var forms = document.querySelectorAll('form[data-dh-form="scan"]');
    if (!forms.length) return;

    forms.forEach(function (form) {
      // Fill support email if present
      var replyTo = form.querySelector('input[name="_replyto"]');
      if (replyTo && !replyTo.value) {
        // (This field name is supported by some form providers; safe to include.)
      }

      form.addEventListener("submit", async function (e) {
        // If endpoint isn't configured, allow normal submission (or block with message)
        var endpoint = CFG.formEndpoint || "";
        if (!endpoint || endpoint.indexOf("REPLACE") !== -1) return;

        e.preventDefault();

        var btn = form.querySelector('button[type="submit"]');
        var status = form.querySelector('[data-dh-status]');
        if (btn) { btn.disabled = true; btn.dataset._orig = btn.textContent; btn.textContent = "Submitting…"; }
        if (status) status.textContent = "";

        try {
          var fd = new FormData(form);

          // Ensure params are included (in case hidden fields were added after initial paint)
          PARAM_KEYS.forEach(function (k) {
            if (!fd.get(k) && params[k]) fd.set(k, params[k]);
          });

          var res = await fetch(endpoint, {
            method: "POST",
            body: fd,
            headers: { "Accept": "application/json" }
          });

          if (res.ok) {
            window.location.href = toSitePath("email/thanks/");
            return;
          }

          // Try to extract JSON error
          var msg = "Something went wrong. Please email " + (CFG.supportEmail || "support@digitalhawk.ai") + ".";
          try {
            var j = await res.json();
            if (j && j.error) msg = j.error;
          } catch (err) {}

          if (status) status.textContent = msg;
        } catch (err2) {
          if (status) status.textContent = "Network error. Please try again or email " + (CFG.supportEmail || "support@digitalhawk.ai") + ".";
        } finally {
          if (btn) { btn.disabled = false; btn.textContent = btn.dataset._orig || "Submit"; }
        }
      });
    });
  }

  function boot() {
    // Dynamic year
    var y = new Date().getFullYear();
    setTextById("dhYear", String(y));

    // Capture URL params then persist to localStorage
    var fromUrl = readParamsFromUrl();
    var merged = storeParams(fromUrl);

    // Fill hidden fields (forms may exist on multiple pages)
    applyHiddenFields(merged);

    // Load Ads tag and fire conversion if on /email/thanks
    loadGoogleTag();
    fireConversionIfThanksPage();

    // Hook scan forms
    initScanForms(merged);

    // Fill email placeholders
    var emailEls = document.querySelectorAll("[data-dh-email]");
    emailEls.forEach(function (el) {
      if (CFG.supportEmail) el.textContent = CFG.supportEmail;
    });
    var emailLinks = document.querySelectorAll('a[data-dh-email-link]');
    emailLinks.forEach(function (a) {
      if (CFG.supportEmail) a.href = "mailto:" + CFG.supportEmail;
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
