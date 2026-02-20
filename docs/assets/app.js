/* =========================================================
   Digital Hawk — tiny site script
   - captures gclid + UTMs
   - personalises headline via ?issue=
   - posts form to endpoint, then redirects to email/?submitted=1
   ========================================================= */

(function () {
  const CFG = window.DH_CONFIG || {};

  function qs(sel, root) {
    return (root || document).querySelector(sel);
  }

  function getUrlParams() {
    const p = new URLSearchParams(window.location.search || "");
    const obj = {
      gclid: p.get("gclid") || "",
      utm_source: p.get("utm_source") || "",
      utm_medium: p.get("utm_medium") || "",
      utm_campaign: p.get("utm_campaign") || "",
      utm_term: p.get("utm_term") || "",
      utm_content: p.get("utm_content") || "",
      issue: p.get("issue") || ""
    };
    return obj;
  }

  function storeParams(params) {
    try {
      const existing = JSON.parse(localStorage.getItem("dh_params") || "{}") || {};
      const merged = { ...existing };
      Object.keys(params).forEach((k) => {
        if (params[k]) merged[k] = params[k];
      });
      localStorage.setItem("dh_params", JSON.stringify(merged));
      return merged;
    } catch {
      return params;
    }
  }

  function readStoredParams() {
    try {
      return JSON.parse(localStorage.getItem("dh_params") || "{}") || {};
    } catch {
      return {};
    }
  }

  function applyIssueCopy(issue) {
    const badgeEl = qs("#dhBadge");
    const hEl = qs("#dhHeadline");
    const sEl = qs("#dhSubhead");

    if (!hEl || !sEl) return;

    const map = {
      "550-5-7-515": {
        badge: "Outlook / Microsoft rejection",
        h: "Fix Outlook 550 5.7.515 rejections",
        s: "Free scan: find the auth/compliance blocker and get the fastest fix path."
      },
      "5-7-26": {
        badge: "Gmail rejection",
        h: "Fix Gmail 5.7.26 rejections",
        s: "Free scan: identify what Gmail is rejecting and what to change next."
      },
      "spf": {
        badge: "SPF issue",
        h: "Fix SPF blockers causing rejections",
        s: "PermError, too many DNS lookups, multiple records — we’ll pinpoint the cause."
      },
      "dmarc": {
        badge: "DMARC issue",
        h: "Fix DMARC missing/invalid issues",
        s: "Free scan: publish a valid DMARC record and align SPF/DKIM correctly."
      },
      "spf-dmarc": {
        badge: "SPF / DKIM / DMARC",
        h: "Stop email rejections caused by SPF/DKIM/DMARC",
        s: "Free scan + fix plan. Submit your domain + the bounce text (optional)."
      }
    };

    const v = (issue || "").trim();
    const key = map[v] ? v : "";
    if (!key) return;

    if (badgeEl) badgeEl.textContent = map[key].badge;
    hEl.textContent = map[key].h;
    sEl.textContent = map[key].s;
  }

  function setHidden(form, name, value) {
    const el = form.querySelector(`input[name="${name}"]`);
    if (el) el.value = value || "";
  }

  function looksConfiguredEndpoint(endpoint) {
    if (!endpoint) return false;
    if (endpoint.includes("REPLACE_ME")) return false;
    if (!/^https?:\/\//i.test(endpoint)) return false;
    return true;
  }

  async function postForm(form) {
    const endpoint = (CFG.formEndpoint || "").trim();
    const statusEl = form.querySelector("[data-dh-status]");

    if (!looksConfiguredEndpoint(endpoint)) {
      if (statusEl) statusEl.textContent = "Set your form endpoint in assets/config.js";
      return;
    }

    // Ensure action is set for fallback
    form.action = endpoint;
    form.method = "POST";

    const fd = new FormData(form);
    const res = await fetch(endpoint, {
      method: "POST",
      body: fd,
      headers: { "Accept": "application/json" }
    });

    if (!res.ok) {
      let msg = "Something went wrong. Please try again.";
      try {
        const json = await res.json();
        if (json && json.errors && json.errors[0] && json.errors[0].message) msg = json.errors[0].message;
      } catch {}
      if (statusEl) statusEl.textContent = msg;
      throw new Error(msg);
    }
  }

  function initForms(params) {
    const forms = Array.from(document.querySelectorAll("[data-dh-form]"));
    if (!forms.length) return;

    forms.forEach((form) => {
      // Set action from config
      const endpoint = (CFG.formEndpoint || "").trim();
      if (looksConfiguredEndpoint(endpoint)) {
        form.action = endpoint;
        form.method = "POST";
      }

      // Fill hidden tracking fields
      const page = window.location.pathname + window.location.search;
      const issue = (params.issue || "").trim();

      setHidden(form, "gclid", params.gclid);
      setHidden(form, "utm_source", params.utm_source);
      setHidden(form, "utm_medium", params.utm_medium);
      setHidden(form, "utm_campaign", params.utm_campaign);
      setHidden(form, "utm_term", params.utm_term);
      setHidden(form, "utm_content", params.utm_content);
      setHidden(form, "page", page);
      setHidden(form, "issue", issue || "general");

      // Also reflect issue into the textarea placeholder (optional)
      const b = form.querySelector("textarea[name='error']");
      if (b && issue && !b.value) {
        b.placeholder = `Paste the bounce/error message (optional)\n\nExample: ${issue}`;
      }

      const btn = form.querySelector("button[type='submit']");
      const statusEl = form.querySelector("[data-dh-status]");
      const thanks = form.getAttribute("data-thanks") || "./?submitted=1";

      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        if (statusEl) statusEl.textContent = "";
        if (btn) btn.disabled = true;

        try {
          await postForm(form);
          window.location.href = thanks;
        } catch {
          if (btn) btn.disabled = false;
        }
      });
    });
  }

  function initYear() {
    const y = qs("#dhYear");
    if (y) y.textContent = String(new Date().getFullYear());
  }

  function initSupportEmail() {
    const email = (CFG.supportEmail || "").trim();
    if (!email) return;
    document.querySelectorAll("[data-dh-email]").forEach((el) => {
      el.textContent = email;
      if (el.tagName.toLowerCase() === "a") el.setAttribute("href", `mailto:${email}`);
    });
  }

  function initSubmittedNotice() {
    const p = new URLSearchParams(window.location.search || "");
    if (p.get("submitted") !== "1") return;
    const status = qs("[data-dh-status]");
    if (status) {
      status.textContent = "Thanks, your request was submitted successfully.";
    }
  }

  document.addEventListener("DOMContentLoaded", function () {
    const stored = storeParams(getUrlParams());
    const params = { ...readStoredParams(), ...stored };

    initYear();
    initSupportEmail();

    applyIssueCopy(params.issue);
    initForms(params);
    initSubmittedNotice();
  });
})();
