(() => {
  "use strict";

  const STATE_META = {
    implemented: { label: "Implemented", color: "var(--implemented)" },
    validated: { label: "Validated", color: "var(--validated)" },
    complete: { label: "Complete", color: "var(--complete)" },
    blocked: { label: "Blocked", color: "var(--blocked)" },
    not_started: { label: "Not started", color: "var(--not-started)" }
  };

  const numberFormat = new Intl.NumberFormat("en-US");
  const percentFormat = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  });

  let dashboardData = null;
  let activeState = "all";
  let searchText = "";
  let tooltip = null;

  const get = (id) => document.getElementById(id);

  function createElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function formatState(state) {
    return STATE_META[state]?.label || state.replaceAll("_", " ");
  }

  function slug(value) {
    return String(value).trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function initTooltip() {
    tooltip = createElement("div", "tooltip");
    tooltip.setAttribute("role", "tooltip");
    document.body.appendChild(tooltip);
  }

  function showTooltip(event, html) {
    if (!tooltip) initTooltip();
    tooltip.innerHTML = html;
    tooltip.classList.add("visible");
    moveTooltip(event);
  }

  function moveTooltip(event) {
    if (!tooltip) return;
    const offset = 14;
    const bounds = tooltip.getBoundingClientRect();
    let left = event.clientX + offset;
    let top = event.clientY + offset;
    if (left + bounds.width > window.innerWidth - 12) {
      left = event.clientX - bounds.width - offset;
    }
    if (top + bounds.height > window.innerHeight - 12) {
      top = event.clientY - bounds.height - offset;
    }
    tooltip.style.left = `${Math.max(12, left)}px`;
    tooltip.style.top = `${Math.max(12, top)}px`;
  }

  function hideTooltip() {
    tooltip?.classList.remove("visible");
  }

  function svgElement(name, attributes = {}) {
    const element = document.createElementNS("http://www.w3.org/2000/svg", name);
    Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value));
    return element;
  }

  function renderProgressRing(data) {
    const host = get("progress-ring");
    const total = data.headline.total_iterations;
    const highest = data.headline.highest_formally_completed_iteration;
    const progression = Math.min(100, ((highest + 1) / total) * 100);
    const size = 180;
    const center = size / 2;
    const radius = 68;
    const circumference = 2 * Math.PI * radius;
    const dash = (progression / 100) * circumference;

    const svg = svgElement("svg", {
      viewBox: `0 0 ${size} ${size}`,
      role: "img",
      "aria-label": `Formal audit progression through Iteration ${highest} of ${total - 1}`
    });

    const background = svgElement("circle", {
      cx: center,
      cy: center,
      r: radius,
      fill: "none",
      stroke: "var(--surface-muted)",
      "stroke-width": 15
    });
    const progress = svgElement("circle", {
      cx: center,
      cy: center,
      r: radius,
      fill: "none",
      stroke: "var(--complete)",
      "stroke-width": 15,
      "stroke-linecap": "round",
      "stroke-dasharray": `${dash} ${circumference - dash}`,
      transform: `rotate(-90 ${center} ${center})`
    });
    const iterationText = svgElement("text", {
      x: center,
      y: center - 4,
      "text-anchor": "middle",
      class: "chart-value",
      style: "font-size:34px"
    });
    iterationText.textContent = `I${highest}`;
    const caption = svgElement("text", {
      x: center,
      y: center + 22,
      "text-anchor": "middle",
      class: "chart-label"
    });
    caption.textContent = "formally complete";

    svg.append(background, progress, iterationText, caption);
    host.replaceChildren(svg);
  }

  function renderStateChart(data) {
    const host = get("state-chart");
    const legend = get("state-legend");
    const entries = Object.entries(data.state_counts);
    const width = 640;
    const height = 260;
    const left = 52;
    const right = 20;
    const top = 28;
    const bottom = 42;
    const plotWidth = width - left - right;
    const plotHeight = height - top - bottom;
    const max = Math.max(...entries.map(([, value]) => value), 1);
    const gap = 18;
    const barWidth = (plotWidth - gap * (entries.length - 1)) / entries.length;

    const svg = svgElement("svg", { viewBox: `0 0 ${width} ${height}`, role: "img" });

    [0, Math.ceil(max / 2), max].forEach((tick) => {
      const y = top + plotHeight - (tick / max) * plotHeight;
      const line = svgElement("line", {
        x1: left,
        x2: width - right,
        y1: y,
        y2: y,
        class: "chart-gridline"
      });
      const label = svgElement("text", {
        x: left - 12,
        y: y + 4,
        "text-anchor": "end",
        class: "chart-label"
      });
      label.textContent = tick;
      svg.append(line, label);
    });

    entries.forEach(([state, value], index) => {
      const meta = STATE_META[state];
      const x = left + index * (barWidth + gap);
      const barHeight = (value / max) * plotHeight;
      const y = top + plotHeight - barHeight;
      const rect = svgElement("rect", {
        x,
        y,
        width: barWidth,
        height: Math.max(2, barHeight),
        rx: 9,
        fill: meta.color,
        tabindex: 0,
        role: "img",
        "aria-label": `${meta.label}: ${value} iterations`
      });
      const valueLabel = svgElement("text", {
        x: x + barWidth / 2,
        y: y - 9,
        "text-anchor": "middle",
        class: "chart-value"
      });
      valueLabel.textContent = value;
      const category = svgElement("text", {
        x: x + barWidth / 2,
        y: height - 16,
        "text-anchor": "middle",
        class: "chart-label"
      });
      category.textContent = meta.label.split(" ")[0];

      const tooltipText = `<strong>${escapeHtml(meta.label)}</strong><br>${value} of ${data.headline.total_iterations} iterations`;
      rect.addEventListener("mouseenter", (event) => showTooltip(event, tooltipText));
      rect.addEventListener("mousemove", moveTooltip);
      rect.addEventListener("mouseleave", hideTooltip);
      rect.addEventListener("focus", (event) => {
        const bounds = event.target.getBoundingClientRect();
        showTooltip({ clientX: bounds.left + bounds.width / 2, clientY: bounds.top }, tooltipText);
      });
      rect.addEventListener("blur", hideTooltip);
      svg.append(rect, valueLabel, category);
    });

    host.replaceChildren(svg);
    legend.replaceChildren(...entries.map(([state, value]) => {
      const item = createElement("div", "legend-item");
      const swatch = createElement("span", "legend-swatch");
      swatch.style.background = STATE_META[state].color;
      item.append(swatch, document.createTextNode(`${STATE_META[state].label} · ${value}`));
      return item;
    }));
  }

  function renderGateChart(data) {
    const host = get("gate-chart");
    const passed = data.iteration_16.gates.filter((gate) => gate.state === "passed").length;
    get("gate-score").textContent = `${passed}/${data.iteration_16.gates.length} passed`;
    host.replaceChildren(...data.iteration_16.gates.map((gate) => {
      const row = createElement("div", "gate-row");
      const icon = createElement("div", `gate-icon ${gate.state}`, gate.state === "passed" ? "✓" : "○");
      const copy = createElement("div", "gate-copy");
      const title = createElement("strong", null, gate.name);
      const detail = createElement("span", null, gate.detail);
      const state = createElement("span", "gate-state", gate.state);
      copy.append(title, detail);
      row.append(icon, copy, state);
      return row;
    }));
  }

  function renderFilters(data) {
    const host = get("state-filters");
    const options = ["all", ...Object.keys(data.state_counts)];
    host.replaceChildren(...options.map((state) => {
      const label = state === "all" ? "All" : STATE_META[state].label;
      const count = state === "all" ? data.iterations.length : data.state_counts[state];
      const button = createElement("button", `filter-button${state === activeState ? " active" : ""}`, `${label} ${count}`);
      button.type = "button";
      button.dataset.state = state;
      button.setAttribute("aria-pressed", state === activeState ? "true" : "false");
      button.addEventListener("click", () => {
        activeState = state;
        renderFilters(data);
        renderRoadmap(data);
      });
      return button;
    }));
  }

  function renderRoadmap(data) {
    const host = get("roadmap-list");
    const normalizedSearch = searchText.toLowerCase();
    const filtered = data.iterations.filter((item) => {
      const stateMatch = activeState === "all" || item.state === activeState;
      const haystack = `${item.iteration} ${item.name} ${item.phase} ${item.summary} ${(item.evidence || []).join(" ")}`.toLowerCase();
      return stateMatch && haystack.includes(normalizedSearch);
    });

    if (!filtered.length) {
      host.replaceChildren(createElement("div", "empty-state", "No iterations match the selected filters."));
      return;
    }

    host.replaceChildren(...filtered.map((item) => {
      const card = createElement("article", "roadmap-card");
      card.dataset.state = item.state;
      card.id = `iteration-${item.iteration}-card`;

      const number = createElement("div", "iteration-number", String(item.iteration).padStart(2, "0"));
      const body = createElement("div");
      const title = createElement("h3", null, item.name);
      const meta = createElement("div", "roadmap-meta");
      meta.append(
        createElement("span", null, `Phase: ${item.phase}`),
        createElement("span", null, `Evidence: ${item.evidence.length || 0}`)
      );
      const summary = createElement("p", "roadmap-summary", item.summary);
      body.append(title, meta, summary);
      if (item.blocker) {
        const blocker = createElement("p", "roadmap-summary");
        blocker.innerHTML = `<strong>Blocker:</strong> ${escapeHtml(item.blocker)}`;
        body.append(blocker);
      }
      if (item.evidence?.length) {
        const tags = createElement("div", "evidence-tags");
        item.evidence.forEach((evidence) => tags.append(createElement("span", "evidence-tag", evidence)));
        body.append(tags);
      }

      const pill = createElement("span", `status-pill ${item.state}`, formatState(item.state));
      card.append(number, body, pill);
      return card;
    }));
  }

  function renderNormalizationChart(data) {
    const host = get("normalization-chart");
    const notes = get("normalization-notes");
    const rows = data.verified_results.normalization_replay;
    const width = 760;
    const height = 320;
    const left = 72;
    const right = 36;
    const top = 28;
    const bottom = 64;
    const plotWidth = width - left - right;
    const plotHeight = height - top - bottom;
    const groupWidth = plotWidth / rows.length;
    const barWidth = Math.min(130, groupWidth * 0.5);

    const svg = svgElement("svg", { viewBox: `0 0 ${width} ${height}`, role: "img" });
    [0, 25, 50, 75, 100].forEach((tick) => {
      const y = top + plotHeight - (tick / 100) * plotHeight;
      const line = svgElement("line", { x1: left, x2: width - right, y1: y, y2: y, class: "chart-gridline" });
      const label = svgElement("text", { x: left - 12, y: y + 4, "text-anchor": "end", class: "chart-label" });
      label.textContent = `${tick}%`;
      svg.append(line, label);
    });

    rows.forEach((row, index) => {
      const x = left + index * groupWidth + (groupWidth - barWidth) / 2;
      const barHeight = (row.rank_change_rate / 100) * plotHeight;
      const y = top + plotHeight - barHeight;
      const rect = svgElement("rect", {
        x,
        y,
        width: barWidth,
        height: barHeight,
        rx: 12,
        fill: index === 0 ? "var(--primary)" : "var(--validated)",
        tabindex: 0,
        role: "img",
        "aria-label": `${row.run}: ${row.rank_change_rate}% of ranks changed`
      });
      const value = svgElement("text", { x: x + barWidth / 2, y: y - 10, "text-anchor": "middle", class: "chart-value" });
      value.textContent = `${percentFormat.format(row.rank_change_rate)}%`;
      const date = svgElement("text", { x: x + barWidth / 2, y: height - 34, "text-anchor": "middle", class: "chart-label" });
      date.textContent = row.run;
      const count = svgElement("text", { x: x + barWidth / 2, y: height - 15, "text-anchor": "middle", class: "chart-label" });
      count.textContent = `${numberFormat.format(row.rank_changes)} / ${numberFormat.format(row.records)} ranks`;
      const tooltipText = `<strong>${escapeHtml(row.run)}</strong><br>${numberFormat.format(row.rank_changes)} of ${numberFormat.format(row.records)} ranks changed<br>Watchlist: ${row.old_watchlist} → ${row.new_watchlist}`;
      rect.addEventListener("mouseenter", (event) => showTooltip(event, tooltipText));
      rect.addEventListener("mousemove", moveTooltip);
      rect.addEventListener("mouseleave", hideTooltip);
      rect.addEventListener("focus", (event) => {
        const bounds = event.target.getBoundingClientRect();
        showTooltip({ clientX: bounds.left + bounds.width / 2, clientY: bounds.top }, tooltipText);
      });
      rect.addEventListener("blur", hideTooltip);
      svg.append(rect, value, date, count);
    });
    host.replaceChildren(svg);

    notes.replaceChildren(...rows.map((row) => {
      const note = createElement("div", "result-note");
      const heading = createElement("strong", null, row.run);
      const watchlist = `Watchlist ${row.old_watchlist} → ${row.new_watchlist}`;
      const changes = [row.added ? `added ${row.added}` : null, row.removed ? `removed ${row.removed}` : null].filter(Boolean).join(", ");
      const description = createElement("span", null, changes ? `${watchlist}; ${changes}.` : `${watchlist}.`);
      note.append(heading, description);
      return note;
    }));
  }

  function renderEvidenceBars(data) {
    const host = get("evidence-bars");
    const counts = data.verified_results.iteration_15_counts;
    const labels = {
      physical_evidence_rows: "Physical evidence",
      canonical_evidence_rows: "Canonical evidence",
      provider_rows: "Provider rows",
      rationale_rows: "Rationale rows",
      canonical_observations: "Observations",
      candidate_count: "Candidates",
      comparison_rows: "Comparisons"
    };
    const max = Math.max(...Object.values(counts));
    host.replaceChildren(...Object.entries(counts).map(([key, value]) => {
      const row = createElement("div", "bar-row");
      const label = createElement("span", "bar-label", labels[key]);
      const track = createElement("div", "bar-track");
      const fill = createElement("div", "bar-fill");
      fill.style.width = `${(value / max) * 100}%`;
      track.append(fill);
      const number = createElement("span", "bar-value", numberFormat.format(value));
      row.append(label, track, number);
      return row;
    }));
  }

  function resultStat(value, label) {
    const card = createElement("div", "result-stat");
    card.append(createElement("strong", null, value), createElement("span", null, label));
    return card;
  }

  function renderResultStats(data) {
    const provider = data.verified_results.provider_policy;
    get("provider-results").replaceChildren(
      resultStat(provider.original_qualifying, "Original qualifying signals"),
      resultStat(provider.candidate_qualifying, "Candidate qualifying signals"),
      resultStat(provider.changed_decisions, "Changed decisions"),
      resultStat(provider.simulated_rows, "Simulated provider rows"),
      resultStat(provider.real_fresh_rows, "Real-fresh provider rows"),
      resultStat(provider.mu_first_candidate_eligible, "MU first candidate-eligible date")
    );

    const control = data.verified_results.control_reproduction;
    get("control-results").replaceChildren(
      resultStat(control.changed_qualification_count, "Changed qualifications"),
      resultStat(control.score_delta_count, "Score deltas"),
      resultStat(control.mean_absolute_rank_delta.toFixed(1), "Mean absolute rank delta")
    );

    const rationale = data.verified_results.rationale_lineage;
    get("rationale-results").replaceChildren(
      resultStat(rationale.rows, "Rationale rows"),
      resultStat(rationale.complete_rows, "Complete rows"),
      resultStat(rationale.wrong_reason_eligible, "Wrong-reason eligible"),
      resultStat(rationale.fail_closed ? "Yes" : "No", "Fail-closed handling")
    );
  }

  function renderContract(data) {
    const contract = data.iteration_16.frozen_contract;
    const items = [
      [contract.observations, "Frozen observations"],
      [contract.candidates, "Frozen candidates"],
      [contract.comparison_rows, "Comparison rows"],
      [contract.expected_label_rows, "Expected label rows"],
      [contract.horizons.join(" / "), "Trading-session horizons"],
      [contract.benchmark, "Benchmark"],
      [`${contract.round_trip_cost_bps} bps`, "Round-trip cost"],
      [contract.required_market_end_date, "Required market end date"]
    ];
    get("contract-grid").replaceChildren(...items.map(([value, label]) => {
      const card = createElement("div", "contract-item");
      card.append(createElement("strong", null, String(value)), createElement("span", null, label));
      return card;
    }));

    get("pending-measurements").replaceChildren(...data.iteration_16.pending_measurements.map((measurement) => createElement("li", null, measurement)));
  }

  function renderRemainingPlan(data) {
    const host = get("remaining-plan");
    host.replaceChildren(...data.remaining_plan.map((plan) => {
      const card = createElement("article", `remaining-card${plan.iteration === data.headline.current_iteration ? " current" : ""}`);
      const iteration = data.iterations.find((item) => item.iteration === plan.iteration);
      const heading = createElement("h3", null, `Iteration ${plan.iteration} — ${iteration?.name || ""}`);
      const list = createElement("ol");
      plan.steps.forEach((step) => list.append(createElement("li", null, step)));
      card.append(heading, list);
      return card;
    }));
  }

  function renderMilestones(data) {
    const host = get("milestone-table");
    const table = createElement("table", "data-table");
    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");
    ["Milestone", "Pull request", "Merge commit"].forEach((label) => headerRow.append(createElement("th", null, label)));
    thead.append(headerRow);
    const tbody = document.createElement("tbody");
    data.milestones.forEach((milestone) => {
      const row = document.createElement("tr");
      row.append(
        createElement("td", null, milestone.label),
        createElement("td", null, `#${milestone.pr}`)
      );
      const commitCell = document.createElement("td");
      const code = createElement("code", "commit-code", milestone.commit);
      code.title = milestone.commit;
      commitCell.append(code);
      row.append(commitCell);
      tbody.append(row);
    });
    table.append(thead, tbody);
    host.replaceChildren(table);
  }

  function renderSafety(data) {
    const host = get("safety-grid");
    host.replaceChildren(...data.safety.map((item) => {
      const card = createElement("div", "safety-item");
      const label = createElement("span", null, item.label);
      const badge = createElement("span", `boolean-badge ${item.value}`, item.value ? "Yes" : "No");
      card.append(label, badge);
      return card;
    }));
  }

  function renderHeadline(data) {
    get("as-of").textContent = `Status as of ${data.as_of_date}`;
    get("current-blocker").textContent = data.headline.current_blocker;
    get("metric-highest").textContent = `I${data.headline.highest_formally_completed_iteration}`;
    get("metric-current").textContent = `I${data.headline.current_iteration}`;
    get("metric-observations").textContent = numberFormat.format(data.iteration_16.frozen_contract.observations);
    get("metric-comparisons").textContent = numberFormat.format(data.iteration_16.frozen_contract.comparison_rows);
    get("metric-production").textContent = data.headline.production_change_authorized ? "Authorized" : "Not authorized";
    renderProgressRing(data);
  }

  function initSearch(data) {
    const input = get("iteration-search");
    input.addEventListener("input", () => {
      searchText = input.value.trim();
      renderRoadmap(data);
    });
  }

  function initTheme() {
    const saved = localStorage.getItem("mmm-audit-theme");
    const preferredDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
    const initial = saved || (preferredDark ? "dark" : "light");
    document.documentElement.dataset.theme = initial;

    get("theme-toggle").addEventListener("click", () => {
      const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
      document.documentElement.dataset.theme = next;
      localStorage.setItem("mmm-audit-theme", next);
      if (dashboardData) {
        renderProgressRing(dashboardData);
        renderStateChart(dashboardData);
        renderNormalizationChart(dashboardData);
      }
    });
  }

  function initScrollSpy() {
    const links = [...document.querySelectorAll(".nav-link")];
    const sections = links
      .map((link) => document.querySelector(link.getAttribute("href")))
      .filter(Boolean);

    const observer = new IntersectionObserver((entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (!visible) return;
      links.forEach((link) => {
        link.classList.toggle("active", link.getAttribute("href") === `#${visible.target.id}`);
      });
    }, { rootMargin: "-15% 0px -65% 0px", threshold: [0.05, 0.25, 0.6] });

    sections.forEach((section) => observer.observe(section));
  }

  function renderAll(data) {
    dashboardData = data;
    renderHeadline(data);
    renderStateChart(data);
    renderGateChart(data);
    renderFilters(data);
    renderRoadmap(data);
    renderNormalizationChart(data);
    renderEvidenceBars(data);
    renderResultStats(data);
    renderContract(data);
    renderRemainingPlan(data);
    renderMilestones(data);
    renderSafety(data);
    initSearch(data);
    initScrollSpy();
  }

  function showLoadError(error) {
    console.error(error);
    get("as-of").textContent = "Dashboard data unavailable";
    get("current-blocker").textContent = "The dashboard data snapshot could not be loaded. Open dashboard-data.json to verify the file path and JSON syntax.";
    const errorBox = createElement("div", "empty-state", "Unable to load dashboard data. Serve this directory with a local web server or view it through GitHub Pages.");
    get("roadmap-list").replaceChildren(errorBox);
  }

  async function start() {
    initTheme();
    initTooltip();
    try {
      const response = await fetch("dashboard-data.json", { cache: "no-store" });
      if (!response.ok) throw new Error(`Dashboard data request failed: ${response.status}`);
      const data = await response.json();
      renderAll(data);
    } catch (error) {
      showLoadError(error);
    }
  }

  document.addEventListener("DOMContentLoaded", start);
})();
