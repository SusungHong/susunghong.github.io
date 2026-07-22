(function () {
  "use strict";

  var playroom = document.querySelector("[data-playroom]");
  if (!playroom) return;

  var cards = Array.prototype.slice.call(
    document.querySelectorAll("[data-open-app]")
  );
  var panels = Array.prototype.slice.call(
    document.querySelectorAll("[data-app]")
  );
  var voiceSession = null;

  function openApp(name, updateHistory) {
    var panel = document.querySelector('[data-app="' + name + '"]');
    if (!panel) return;

    panels.forEach(function (item) {
      item.hidden = item !== panel;
    });
    document.querySelector(".app-grid").hidden = true;
    document.querySelector(".playroom-intro").classList.add("is-compact");
    if (updateHistory !== false) {
      history.pushState({ app: name }, "", "#" + name);
    }
    if (window.LittleLife) window.LittleLife.setActive(name === "life");
    panel.scrollIntoView({ behavior: "smooth", block: "start" });
    var heading = panel.querySelector("h2");
    if (heading) heading.focus({ preventScroll: true });
  }

  function closeApps(updateHistory) {
    if (voiceSession) voiceSession.stop();
    if (window.LittleLife) window.LittleLife.setActive(false);
    panels.forEach(function (panel) {
      panel.hidden = true;
    });
    document.querySelector(".app-grid").hidden = false;
    document.querySelector(".playroom-intro").classList.remove("is-compact");
    if (updateHistory !== false) {
      history.pushState({}, "", window.location.pathname);
    }
    playroom.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  cards.forEach(function (card) {
    card.addEventListener("click", function () {
      openApp(card.getAttribute("data-open-app"));
    });
  });

  document.querySelectorAll("[data-close-app]").forEach(function (button) {
    button.addEventListener("click", function () {
      closeApps();
    });
  });

  window.addEventListener("popstate", function () {
    var app = window.location.hash.slice(1);
    if (document.querySelector('[data-app="' + app + '"]')) {
      openApp(app, false);
    } else {
      closeApps(false);
    }
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && !document.querySelector(".app-grid").hidden) {
      return;
    }
    if (event.key === "Escape") closeApps();
  });

  var initialApp = window.location.hash.slice(1);
  if (document.querySelector('[data-app="' + initialApp + '"]')) {
    openApp(initialApp, false);
  }

  function numberValue(id) {
    var rawValue = document.getElementById(id).value.trim();
    return rawValue === "" ? NaN : Number(rawValue);
  }

  function money(value, maximumFractionDigits) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: maximumFractionDigits || 0
    }).format(value);
  }

  function decimal(value, digits) {
    return new Intl.NumberFormat("en-US", {
      maximumFractionDigits: digits == null ? 1 : digits
    }).format(value);
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function realAnnualRate(nominalAnnual, inflationAnnual) {
    return (1 + nominalAnnual / 100) / (1 + inflationAnnual / 100) - 1;
  }

  function realMonthlyRate(nominalAnnual, inflationAnnual) {
    return Math.pow(1 + realAnnualRate(nominalAnnual, inflationAnnual), 1 / 12) - 1;
  }

  function annualWithdrawalNeed(inputs) {
    return inputs.spending / (1 - inputs.withdrawalTax / 100);
  }

  function crashIntervalMonths(inputs) {
    return Math.max(1, Math.round(inputs.crashInterval * 12));
  }

  function firstCrashMonth(inputs) {
    return Math.max(0, Math.round(inputs.crashDelay * 12));
  }

  function nextCrashAfter(month, inputs) {
    if (inputs.crashLoss <= 0) return null;
    var first = firstCrashMonth(inputs);
    var interval = crashIntervalMonths(inputs);
    if (month < first) return first;
    var steps = Math.floor((month - first) / interval);
    var at = first + steps * interval;
    if (at === month) return first + (steps + 1) * interval;
    return first + (steps + 1) * interval;
  }

  function postCrashTrough(inputs) {
    var postRate = realMonthlyRate(inputs.postReturn, inputs.inflation);
    if (postRate <= 0) return Infinity;
    var monthlyNeed = annualWithdrawalNeed(inputs) / 12;
    if (inputs.crashLoss <= 0) return monthlyNeed / postRate;
    var survival = 1 - inputs.crashLoss / 100;
    var interval = crashIntervalMonths(inputs);
    var cycleGrowth = Math.pow(1 + postRate, interval);
    if (survival * cycleGrowth <= 1) return Infinity;
    return (
      (survival * monthlyNeed * (cycleGrowth - 1)) /
      (postRate * (survival * cycleGrowth - 1))
    );
  }

  function requiredBalanceAt(month, inputs) {
    var postRate = realMonthlyRate(inputs.postReturn, inputs.inflation);
    if (postRate <= 0) return Infinity;
    var monthlyNeed = annualWithdrawalNeed(inputs) / 12;
    if (inputs.crashLoss <= 0) return monthlyNeed / postRate;
    var trough = postCrashTrough(inputs);
    if (!Number.isFinite(trough)) return Infinity;
    var survival = 1 - inputs.crashLoss / 100;
    var nextCrash = nextCrashAfter(month, inputs);
    var monthsUntil = nextCrash - month;
    if (monthsUntil <= 0) return trough / survival;
    var growth = Math.pow(1 + postRate, monthsUntil);
    return (
      trough / (survival * growth) +
      (monthlyNeed * (1 - 1 / growth)) / postRate
    );
  }

  function requiredForeverBalance(inputs) {
    return postCrashTrough(inputs);
  }

  function foreverNeedBreakdown(inputs, retirementMonth) {
    var postRate = realMonthlyRate(inputs.postReturn, inputs.inflation);
    var annualGross = annualWithdrawalNeed(inputs);
    var monthlyNeed = annualGross / 12;
    var realAnnual =
      ((1 + inputs.postReturn / 100) / (1 + inputs.inflation / 100) - 1) * 100;
    var plain = postRate > 0 ? monthlyNeed / postRate : Infinity;
    var trough = postCrashTrough(inputs);
    var today = requiredBalanceAt(0, inputs);
    var atRetirement = requiredBalanceAt(retirementMonth, inputs);
    var nextToday = nextCrashAfter(0, inputs);
    var nextAtRetire = nextCrashAfter(retirementMonth, inputs);
    return {
      annualGross: annualGross,
      spending: inputs.spending,
      withdrawalTax: inputs.withdrawalTax,
      realAnnual: realAnnual,
      plain: plain,
      trough: trough,
      today: today,
      atRetirement: atRetirement,
      crashLoss: inputs.crashLoss,
      crashInterval: inputs.crashInterval,
      crashDelay: inputs.crashDelay,
      yearsUntilNextToday:
        nextToday == null ? null : nextToday / 12,
      yearsUntilNextAtRetire:
        nextAtRetire == null ? null : (nextAtRetire - retirementMonth) / 12,
      upliftToday:
        Number.isFinite(plain) && Number.isFinite(today) ? today - plain : Infinity,
      upliftAtRetirement:
        Number.isFinite(plain) && Number.isFinite(atRetirement)
          ? atRetirement - plain
          : Infinity
    };
  }

  function projectPlan(inputs) {
    var balance = inputs.savings;
    var preRate = realMonthlyRate(inputs.preReturn, inputs.inflation);
    var postRate = realMonthlyRate(inputs.postReturn, inputs.inflation);
    var retirementMonth = Math.max(
      0,
      Math.round((inputs.retirementAge - inputs.currentAge) * 12)
    );
    var crashInterval = crashIntervalMonths(inputs);
    var firstCrash = firstCrashMonth(inputs);
    var endAge = Math.max(
      inputs.currentAge + 40,
      inputs.retirementAge + 35
    );
    var endMonth = Math.round((endAge - inputs.currentAge) * 12);
    var timeline = [];
    var crashMonths = [];

    for (var month = 0; month <= endMonth; month += 1) {
      if (
        inputs.crashLoss > 0 &&
        month >= firstCrash &&
        (month - firstCrash) % crashInterval === 0
      ) {
        balance *= 1 - inputs.crashLoss / 100;
        crashMonths.push(month);
      }
      var required = requiredBalanceAt(month, inputs);
      timeline.push({
        month: month,
        balance: Math.max(0, balance),
        required: required
      });
      if (month < retirementMonth) {
        balance = balance * (1 + preRate) + inputs.annualContribution / 12;
      } else {
        balance =
          balance * (1 + postRate) - annualWithdrawalNeed(inputs) / 12;
      }
      balance = Math.max(0, balance);
    }

    var lastBelow = -1;
    timeline.forEach(function (point, index) {
      if (point.balance < point.required) lastBelow = index;
    });
    var crossover =
      lastBelow + 1 < timeline.length ? timeline[lastBelow + 1] : null;
    var specialMonths = [retirementMonth].concat(crashMonths);
    if (crossover) specialMonths.push(crossover.month);
    var path = timeline.filter(function (point) {
      return point.month % 12 === 0 || specialMonths.indexOf(point.month) >= 0;
    });
    var retirementState = timeline[Math.min(retirementMonth, timeline.length - 1)];
    var targetWorks = timeline.slice(retirementMonth).every(function (point) {
      return point.balance >= point.required;
    });

    return {
      path: path,
      timeline: timeline,
      required: retirementState.required,
      requiredToday: timeline[0] ? timeline[0].required : requiredBalanceAt(0, inputs),
      trough: postCrashTrough(inputs),
      retirementMonth: retirementMonth,
      crashMonths: crashMonths,
      retirementState: retirementState,
      targetWorks: targetWorks,
      crossover: crossover
    };
  }

  function earliestRetirement(inputs) {
    var low = 0;
    var high = Math.round((100 - inputs.currentAge) * 12);
    var latestInputs = Object.assign({}, inputs, {
      retirementAge: inputs.currentAge + high / 12
    });
    if (!projectPlan(latestInputs).targetWorks) return null;
    while (low < high) {
      var month = Math.floor((low + high) / 2);
      var trialInputs = Object.assign({}, inputs, {
        retirementAge: inputs.currentAge + month / 12
      });
      if (projectPlan(trialInputs).targetWorks) {
        high = month;
      } else {
        low = month + 1;
      }
    }
    return inputs.currentAge + low / 12;
  }

  function shortMoney(value) {
    if (value >= 1000000) return "$" + decimal(value / 1000000, 1) + "m";
    if (value >= 1000) return "$" + decimal(value / 1000, 0) + "k";
    return money(value);
  }

  function fiChart(plan, inputs) {
    var path = plan.path;
    if (!path || path.length < 2) return "";
    var width = 760;
    var height = 300;
    var left = 62;
    var right = 18;
    var top = 30;
    var bottom = 52;
    var maxBalance = Math.max.apply(
      null,
      path.map(function (point) {
        return Math.max(point.balance, point.required);
      })
    );
    maxBalance = Math.max(maxBalance * 1.08, 1);
    var maxMonth = path[path.length - 1].month;
    function xFor(month) {
      return left + (month / maxMonth) * (width - left - right);
    }
    function yFor(value) {
      return height - bottom - (value / maxBalance) * (height - top - bottom);
    }
    var assetPath = path
      .map(function (point) {
        return (
          (point === path[0] ? "M" : "L") +
          xFor(point.month).toFixed(1) +
          " " +
          yFor(point.balance).toFixed(1)
        );
      })
      .join(" ");
    var requiredPath = path
      .map(function (point) {
        return (
          (point === path[0] ? "M" : "L") +
          xFor(point.month).toFixed(1) +
          " " +
          yFor(point.required).toFixed(1)
        );
      })
      .join(" ");
    var areaPath =
      "M" +
      xFor(path[0].month).toFixed(1) +
      " " +
      (height - bottom) +
      " " +
      assetPath.replace(/^M/, "L") +
      " L" +
      xFor(path[path.length - 1].month).toFixed(1) +
      " " +
      (height - bottom) +
      " Z";
    var grid = "";
    for (var gridIndex = 0; gridIndex <= 4; gridIndex += 1) {
      var gridValue = (maxBalance * gridIndex) / 4;
      var gridY = yFor(gridValue);
      grid +=
        '<line x1="' +
        left +
        '" y1="' +
        gridY +
        '" x2="' +
        (width - right) +
        '" y2="' +
        gridY +
        '" class="chart-grid"/><text x="' +
        (left - 8) +
        '" y="' +
        (gridY + 4) +
        '" text-anchor="end" class="chart-tick">' +
        shortMoney(gridValue) +
        "</text>";
    }
    function marker(month, className) {
      var x = xFor(month);
      return (
        '<line x1="' +
        x +
        '" y1="' +
        top +
        '" x2="' +
        x +
        '" y2="' +
        (height - bottom) +
        '" class="chart-marker ' +
        className +
        '"/>'
      );
    }
    function eventLabel(month, text, className) {
      return {
        month: month,
        text: text,
        className: className,
        x: xFor(month)
      };
    }
    var markers = marker(plan.retirementMonth, "is-retirement");
    var eventLabels = [
      eventLabel(plan.retirementMonth, "Retirement", "is-retirement")
    ];
    if (plan.crashMonths.length) {
      markers += marker(plan.crashMonths[0], "is-crash");
      eventLabels.push(
        eventLabel(plan.crashMonths[0], "Doomsday", "is-crash")
      );
      plan.crashMonths.slice(1).forEach(function (crashMonth) {
        markers += marker(crashMonth, "is-crash");
      });
    }
    if (plan.crossover) {
      markers += marker(plan.crossover.month, "is-crossover");
      if (plan.crossover.month !== plan.retirementMonth) {
        eventLabels.push(
          eventLabel(plan.crossover.month, "FI", "is-crossover")
        );
      } else {
        eventLabels[0].text = "FI / Retirement";
        eventLabels[0].className = "is-crossover";
      }
    }
    eventLabels.sort(function (a, b) {
      return a.x - b.x;
    });
    var labelY = height - bottom + 14;
    var lastLabelRight = -Infinity;
    var labelMarkup = eventLabels
      .map(function (item) {
        var anchor = "middle";
        var x = item.x;
        var approxWidth = item.text.length * 5.2;
        if (x - approxWidth / 2 < lastLabelRight + 4) {
          x = lastLabelRight + 4 + approxWidth / 2;
        }
        if (x + approxWidth / 2 > width - right) {
          x = width - right - approxWidth / 2;
          anchor = "end";
        }
        if (x - approxWidth / 2 < left) {
          x = left + approxWidth / 2;
          anchor = "start";
        }
        lastLabelRight = Math.max(
          lastLabelRight,
          x + (anchor === "end" ? 0 : approxWidth / 2)
        );
        return (
          '<text x="' +
          x.toFixed(1) +
          '" y="' +
          labelY +
          '" text-anchor="' +
          anchor +
          '" class="chart-tick chart-event-label ' +
          item.className +
          '">' +
          item.text +
          "</text>"
        );
      })
      .join("");
    var endAge = Math.round(inputs.currentAge + maxMonth / 12);

    return (
      '<div class="projection-chart">' +
      '<div class="projection-chart__title"><strong>Path to forever-income independence</strong><span>Today’s dollars</span></div>' +
      '<svg viewBox="0 0 ' +
      width +
      " " +
      height +
      '" role="img" aria-label="Projected assets versus the Doomsday-aware forever need from age ' +
      Math.round(inputs.currentAge) +
      " to age " +
      endAge +
      '">' +
      '<defs><linearGradient id="balance-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="var(--accent)" stop-opacity=".32"/><stop offset="100%" stop-color="var(--accent)" stop-opacity="0"/></linearGradient></defs>' +
      grid +
      '<path d="' +
      areaPath +
      '" fill="url(#balance-fill)"/><path d="' +
      requiredPath +
      '" class="chart-line chart-line--required"/><path d="' +
      assetPath +
      '" class="chart-line"/>' +
      markers +
      labelMarkup +
      '<text x="' +
      left +
      '" y="' +
      (height - 10) +
      '" class="chart-tick">Age ' +
      Math.round(inputs.currentAge) +
      '</text><text x="' +
      (width - right) +
      '" y="' +
      (height - 10) +
      '" text-anchor="end" class="chart-tick">Age ' +
      endAge +
      "</text></svg>" +
      '<div class="projection-chart__legend"><span class="is-assets">Projected assets</span><span class="is-required">Forever need (next Doomsday aware)</span></div></div>'
    );
  }

  var retirementForm = document.getElementById("retirement-form");
  retirementForm.addEventListener("submit", function (event) {
    event.preventDefault();
    var result = document.getElementById("retirement-result");
    result.hidden = false;
    result.setAttribute("aria-busy", "true");
    result.innerHTML =
      '<p class="result-label">Calculating</p><h3>Finding when you reach financial independence…</h3>';
    var inputs = {
      currentAge: numberValue("current-age"),
      savings: numberValue("current-savings"),
      afterTaxIncome: numberValue("after-tax-income"),
      spending: numberValue("annual-spending"),
      preReturn: numberValue("pre-return"),
      postReturn: numberValue("post-return"),
      inflation: numberValue("inflation"),
      withdrawalTax: numberValue("withdrawal-tax"),
      retirementAge: numberValue("retirement-age"),
      crashDelay: numberValue("crash-delay"),
      crashInterval: numberValue("crash-interval"),
      crashLoss: numberValue("crash-loss")
    };
    inputs.annualContribution = Math.max(
      0,
      inputs.afterTaxIncome - inputs.spending
    );

    if (
      !Object.keys(inputs).every(function (key) {
        return Number.isFinite(inputs[key]);
      }) ||
      inputs.withdrawalTax >= 100 ||
      inputs.retirementAge < inputs.currentAge ||
      inputs.afterTaxIncome < 0 ||
      inputs.crashDelay < 0 ||
      inputs.crashInterval <= 0 ||
      inputs.crashLoss < 0 ||
      inputs.crashLoss >= 100 ||
      inputs.inflation <= -100 ||
      inputs.preReturn <= -100 ||
      inputs.postReturn <= -100
    ) {
      result.hidden = false;
      result.setAttribute("aria-busy", "false");
      result.innerHTML =
        '<p class="result-error">Please check the assumptions. Retirement cannot precede your current age, Doomsday settings must be valid, losses and taxes must remain below 100%, and returns must be mathematically valid.</p>';
      result.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    if (inputs.afterTaxIncome < inputs.spending) {
      result.hidden = false;
      result.setAttribute("aria-busy", "false");
      result.innerHTML =
        '<p class="result-error">After-tax income is below spending, so there is nothing left to invest before retirement.</p>';
      result.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    if (realAnnualRate(inputs.postReturn, inputs.inflation) <= 0) {
      result.hidden = false;
      result.setAttribute("aria-busy", "false");
      result.innerHTML =
        '<p class="result-error">A forever-income retirement is impossible when the long-run return does not exceed inflation.</p>';
      result.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    if (!Number.isFinite(requiredForeverBalance(inputs))) {
      result.hidden = false;
      result.setAttribute("aria-busy", "false");
      result.innerHTML =
        '<p class="result-error">The portfolio cannot recover between recurring Doomsdays under these return, interval, and loss assumptions—even before funding spending.</p>';
      result.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    var retirementMonth = Math.max(
      0,
      Math.round((inputs.retirementAge - inputs.currentAge) * 12)
    );
    var need = foreverNeedBreakdown(inputs, retirementMonth);
    var earliestAge = earliestRetirement(inputs);
    var plan = projectPlan(inputs);
    result.hidden = false;
    result.setAttribute("aria-busy", "false");
    var retireBalance = plan.retirementState.balance;
    var crossoverAge = plan.crossover
      ? inputs.currentAge + plan.crossover.month / 12
      : null;
    var yearsUntilRetire = Math.max(0, inputs.retirementAge - inputs.currentAge);
    var yearsUntilFi =
      crossoverAge == null
        ? null
        : Math.max(0, crossoverAge - inputs.currentAge);
    var headline =
      crossoverAge == null
        ? "On this retirement path, assets never permanently cover forever spending before the projection ends."
        : "You reach FI at age " +
          decimal(crossoverAge, 1) +
          "—when assets permanently cover forever spending.";
    var detail =
      "Retirement is your chosen age " +
      decimal(inputs.retirementAge, 1) +
      ", when contributions stop and withdrawals begin." +
      (crossoverAge == null
        ? " Try higher savings, lower spending, or a later retirement."
        : " FI is the crossing with the forever-income need" +
          (Math.abs(crossoverAge - inputs.retirementAge) < 0.06
            ? "—here, the same moment as retirement."
            : crossoverAge < inputs.retirementAge
              ? ", before you retire."
              : ", after you retire.") +
          ".") +
      (earliestAge != null &&
      Math.abs(earliestAge - inputs.retirementAge) > 0.06
        ? " The earliest crash-tested retirement age is " +
          decimal(earliestAge, 1) +
          "."
        : "");

    var foreverExplain =
      '<div class="forever-need">' +
      "<h4>Doomsday-safe forever need</h4>" +
      "<p>The dashed line is <em>not</em> flat: at each age it is the balance you’d need to start withdrawing forever and survive the <strong>next</strong> Doomsday (in " +
      decimal(inputs.crashDelay, 1) +
      " years from today, then every " +
      decimal(inputs.crashInterval, 1) +
      " years) plus every crash after that.</p>" +
      '<div class="result-metrics">' +
      "<div><span>Annual spending</span><strong>" +
      money(need.spending) +
      "</strong></div>" +
      "<div><span>Gross withdrawal (after " +
      decimal(need.withdrawalTax, 1) +
      "% tax)</span><strong>" +
      money(need.annualGross) +
      "</strong></div>" +
      "<div><span>Real return in retirement</span><strong>" +
      decimal(need.realAnnual, 2) +
      "%</strong></div>" +
      "<div><span>Need with no crashes</span><strong>" +
      (Number.isFinite(need.plain) ? money(need.plain) : "impossible") +
      "</strong></div>" +
      "<div><span>Next Doomsday</span><strong>" +
      decimal(need.crashDelay, 1) +
      "y · −" +
      decimal(need.crashLoss, 1) +
      "%</strong></div>" +
      "<div><span>Then every</span><strong>" +
      decimal(need.crashInterval, 1) +
      " years</strong></div>" +
      "<div><span>Need today</span><strong>" +
      (Number.isFinite(need.today) ? money(need.today) : "impossible") +
      "</strong></div>" +
      "<div><span>Need at retirement</span><strong>" +
      (Number.isFinite(need.atRetirement)
        ? money(need.atRetirement)
        : "impossible") +
      "</strong></div>" +
      "<div><span>Years to next crash at retirement</span><strong>" +
      (need.yearsUntilNextAtRetire == null
        ? "—"
        : decimal(need.yearsUntilNextAtRetire, 1)) +
      "</strong></div>" +
      "</div>" +
      '<p class="forever-need__math">After each crash you must land at least on the steady trough (' +
      (Number.isFinite(need.trough) ? money(need.trough) : "impossible") +
      "). Working backward from the next scheduled crash—withdrawing until then, then taking the −" +
      decimal(need.crashLoss, 1) +
      "% hit—gives the higher need when Doomsday is close and a lower need right after one.</p>" +
      "</div>";

    result.innerHTML =
      '<p class="result-label">When you get there</p>' +
      "<h3>" +
      headline +
      "</h3>" +
      "<p>" +
      detail +
      "</p>" +
      '<div class="result-metrics">' +
      '<div><span>FI age</span><strong>' +
      (crossoverAge == null ? "—" : decimal(crossoverAge, 1)) +
      "</strong></div>" +
      '<div><span>Years to FI</span><strong>' +
      (yearsUntilFi == null ? "—" : decimal(yearsUntilFi, 1)) +
      "</strong></div>" +
      '<div><span>Retirement age</span><strong>' +
      decimal(inputs.retirementAge, 1) +
      "</strong></div>" +
      '<div><span>Years to retire</span><strong>' +
      decimal(yearsUntilRetire, 1) +
      "</strong></div>" +
      '<div><span>Portfolio at retirement</span><strong>' +
      money(retireBalance) +
      "</strong></div>" +
      '<div><span>Forever need at retirement</span><strong>' +
      money(plan.required) +
      "</strong></div>" +
      '<div><span>Spared yearly</span><strong>' +
      money(inputs.annualContribution) +
      "</strong></div>" +
      "</div>" +
      foreverExplain +
      fiChart(plan, inputs) +
      '<details class="result-details"><summary>How this path was projected</summary><p>Each year before retirement invests what remains of after-tax income after spending (' +
      money(inputs.afterTaxIncome) +
      " − " +
      money(inputs.spending) +
      " = " +
      money(inputs.annualContribution) +
      "). That surplus compounds monthly at a real return of " +
      decimal(
        ((1 + inputs.preReturn / 100) / (1 + inputs.inflation / 100) - 1) *
          100,
        2
      ) +
      "%. <strong>Retirement</strong> is the age you chose. <strong>FI</strong> is when projected assets stay at or above the time-varying forever need (which rises when the next Doomsday is near). After retirement, spending uses a real return of " +
      decimal(
        ((1 + inputs.postReturn / 100) / (1 + inputs.inflation / 100) - 1) *
          100,
        2
      ) +
      "%. Doomsdays land first in " +
      decimal(inputs.crashDelay, 1) +
      " years, then −" +
      decimal(inputs.crashLoss, 1) +
      "% every " +
      decimal(inputs.crashInterval, 1) +
      " years.</p></details>";
    result.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  function median(values) {
    var sorted = values.slice().sort(function (a, b) {
      return a - b;
    });
    var middle = Math.floor(sorted.length / 2);
    return sorted.length % 2
      ? sorted[middle]
      : (sorted[middle - 1] + sorted[middle]) / 2;
  }

  function frequencyToMidi(frequency) {
    return 69 + 12 * Math.log(frequency / 440) / Math.log(2);
  }

  function midiToNote(midi) {
    var names = [
      "C",
      "C♯",
      "D",
      "E♭",
      "E",
      "F",
      "F♯",
      "G",
      "A♭",
      "A",
      "B♭",
      "B"
    ];
    var rounded = Math.round(midi);
    return names[((rounded % 12) + 12) % 12] + (Math.floor(rounded / 12) - 1);
  }

  function signalRms(buffer) {
    var energy = 0;
    for (var index = 0; index < buffer.length; index += 1) {
      energy += buffer[index] * buffer[index];
    }
    return Math.sqrt(energy / buffer.length);
  }

  function parabolicTau(yin, tau) {
    var left = yin[tau - 1];
    var center = yin[tau];
    var right = yin[tau + 1];
    var denominator = 2 * (2 * center - right - left);
    if (!denominator) return tau;
    var shift = (right - left) / denominator;
    return tau + Math.max(-1, Math.min(1, shift));
  }

  function normalizedAutocorr(buffer, tau) {
    var size = buffer.length;
    if (tau < 1 || tau >= size) return 0;
    var sum = 0;
    var energyA = 0;
    var energyB = 0;
    var count = size - tau;
    for (var i = 0; i < count; i += 1) {
      var a = buffer[i];
      var b = buffer[i + tau];
      sum += a * b;
      energyA += a * a;
      energyB += b * b;
    }
    var denom = Math.sqrt(energyA * energyB);
    return denom > 0 ? sum / denom : 0;
  }

  function buildYinBuffer(buffer, maxTau) {
    var size = buffer.length;
    var yin = new Float32Array(maxTau + 1);
    var cumulative = 0;
    var tau;
    var i;
    yin[0] = 1;
    for (tau = 1; tau <= maxTau; tau += 1) {
      var difference = 0;
      for (i = 0; i < size - tau; i += 1) {
        var delta = buffer[i] - buffer[i + tau];
        difference += delta * delta;
      }
      yin[tau] = difference;
      cumulative += difference;
      yin[tau] = cumulative === 0 ? 1 : (difference * tau) / cumulative;
    }
    return yin;
  }

  function detectPitch(buffer, sampleRate, minimumRms, previousFrequency, options) {
    options = options || {};
    var preferHigh = !!options.preferHigh;
    var preferLow = !!options.preferLow;
    var rms = signalRms(buffer);
    if (rms < minimumRms) return null;

    var factor;
    if (preferLow) {
      factor = sampleRate > 48000 ? 2 : 1;
    } else if (preferHigh) {
      factor = sampleRate > 40000 ? 2 : 1;
    } else if (sampleRate > 40000) {
      factor = 2;
    } else if (sampleRate > 24000) {
      factor = 2;
    } else {
      factor = 1;
    }
    if (Number.isFinite(previousFrequency) && previousFrequency > 380) {
      factor = Math.min(factor, 2);
    }
    if (Number.isFinite(previousFrequency) && previousFrequency < 110) {
      factor = 1;
    }
    var workRate = sampleRate / factor;
    var work;
    if (factor === 1) {
      work = buffer;
    } else {
      var length = Math.floor(buffer.length / factor);
      work = new Float32Array(length);
      for (var w = 0; w < length; w += 1) {
        var sum = 0;
        var base = w * factor;
        for (var f = 0; f < factor; f += 1) sum += buffer[base + f];
        work[w] = sum / factor;
      }
    }

    var size = work.length;
    var minFreq = preferHigh ? 120 : preferLow ? 58 : 60;
    var maxFreq = preferHigh ? 1300 : preferLow ? 350 : 1000;
    var minTau = Math.max(2, Math.floor(workRate / maxFreq));
    var maxTau = Math.min(Math.floor(workRate / minFreq), Math.floor(size / 2) - 2);
    if (maxTau <= minTau + 2) return null;

    var yin = buildYinBuffer(work, maxTau);
    var threshold = preferHigh ? 0.28 : preferLow ? 0.26 : 0.22;
    var candidates = [];
    var tau = minTau;

    while (tau < maxTau) {
      if (yin[tau] < threshold) {
        while (tau + 1 < maxTau && yin[tau + 1] < yin[tau]) tau += 1;
        if (tau > minTau && tau < maxTau) {
          var refinedTau = parabolicTau(yin, tau);
          var frequency = workRate / refinedTau;
          if (frequency >= minFreq && frequency <= maxFreq) {
            var clarity = Math.max(0, Math.min(1, 1 - yin[tau]));
            var corr = normalizedAutocorr(work, Math.round(refinedTau));
            candidates.push({
              frequency: frequency,
              clarity: clarity,
              correlation: corr,
              score: clarity * 0.65 + Math.max(0, corr) * 0.35
            });
          }
        }
        tau += 1;
      } else {
        tau += 1;
      }
    }

    if (!candidates.length) {
      var bestTau = -1;
      var bestValue = 1;
      for (tau = minTau; tau < maxTau; tau += 1) {
        if (yin[tau] < bestValue) {
          bestValue = yin[tau];
          bestTau = tau;
        }
      }
      if (bestTau < 0 || bestValue > (preferHigh ? 0.45 : preferLow ? 0.42 : 0.38)) {
        return null;
      }
      while (bestTau + 1 < maxTau && yin[bestTau + 1] < yin[bestTau]) {
        bestTau += 1;
      }
      var fallbackTau = parabolicTau(yin, bestTau);
      var fallbackFrequency = workRate / fallbackTau;
      if (fallbackFrequency < minFreq || fallbackFrequency > maxFreq) return null;
      candidates.push({
        frequency: fallbackFrequency,
        clarity: Math.max(0, Math.min(1, 1 - bestValue)),
        correlation: normalizedAutocorr(work, Math.round(fallbackTau)),
        score: Math.max(0, Math.min(1, 1 - bestValue))
      });
    }

    if (preferHigh && candidates.length > 1) {
      candidates.forEach(function (candidate) {
        candidates.forEach(function (other) {
          if (other === candidate) return;
          var ratio = candidate.frequency / other.frequency;
          if (
            ratio > 1.85 &&
            ratio < 2.15 &&
            candidate.clarity + 0.06 >= other.clarity
          ) {
            candidate.score += 0.12;
          }
        });
      });
    }

    if (preferLow && candidates.length > 1) {
      candidates.forEach(function (candidate) {
        candidates.forEach(function (other) {
          if (other === candidate) return;
          var ratio = candidate.frequency / other.frequency;
          if (
            ratio > 1.85 &&
            ratio < 2.15 &&
            candidate.clarity + 0.05 >= other.clarity
          ) {
            candidate.score += 0.2;
          }
          var multiple = Math.round(ratio);
          if (
            multiple >= 3 &&
            Math.abs(ratio - multiple) < 0.08 * multiple &&
            other.clarity > 0.45
          ) {
            candidate.score -= 0.35;
          }
        });
      });
    }

    function scoreCandidate(candidate) {
      var score = candidate.score;
      if (Number.isFinite(previousFrequency) && previousFrequency > 0) {
        var semitones =
          12 * Math.log(candidate.frequency / previousFrequency) / Math.log(2);
        var absolute = Math.abs(semitones);
        if (absolute <= 1.5) score += 0.24;
        else if (absolute <= 3.2) {
          score +=
            preferHigh && semitones > 0
              ? 0.16
              : preferLow && semitones < 0
                ? 0.14
                : 0.08;
        } else if (Math.abs(absolute - 12) <= 1.2) {
          if (preferHigh && semitones < 0) score -= 0.28;
          else if (preferLow && semitones < 0) score -= 0.34;
          else if (preferLow && semitones > 0) score -= 0.06;
          else score -= 0.16;
        } else if (absolute > 5) {
          if (preferHigh && semitones > 0 && absolute < 8) score -= 0.04;
          else if (preferLow && semitones < 0 && absolute < 8) score -= 0.04;
          else score -= 0.12;
        }
      } else if (preferHigh) {
        score += Math.log(candidate.frequency / 260) * 0.03;
      } else if (preferLow) {
        score -= Math.abs(Math.log(candidate.frequency / 110)) * 0.02;
      } else {
        score -= Math.log(candidate.frequency / 110) * 0.015;
      }
      if (preferLow && candidate.frequency > 240) {
        score -= Math.log(candidate.frequency / 240) * 0.3;
      }
      return score;
    }

    candidates.sort(function (a, b) {
      return scoreCandidate(b) - scoreCandidate(a);
    });

    var chosen = candidates[0];
    var looseGate =
      preferHigh ||
      preferLow ||
      (chosen && chosen.frequency > 400) ||
      (chosen && chosen.frequency < 100);
    var minClarity = looseGate ? 0.45 : 0.55;
    var minCorr = looseGate ? 0.1 : 0.18;
    if (!chosen || chosen.clarity < minClarity || chosen.correlation < minCorr) {
      return null;
    }

    return {
      frequency: chosen.frequency,
      confidence: Math.max(0, Math.min(1, chosen.score)),
      clarity: chosen.clarity,
      rms: rms
    };
  }

  function createPitchTracker(mode) {
    var lastAccepted = NaN;
    var displayMidi = NaN;
    var recent = [];
    var streak = 0;
    var silence = 0;
    var gateOpen = false;
    var trackedFrequency = NaN;
    var trackMode = mode || "natural";

    function reset(nextMode) {
      lastAccepted = NaN;
      displayMidi = NaN;
      recent = [];
      streak = 0;
      silence = 0;
      gateOpen = false;
      trackedFrequency = NaN;
      if (nextMode) trackMode = nextMode;
    }

    function setMode(nextMode) {
      trackMode = nextMode || trackMode;
    }

    function observe(detected, noiseFloor) {
      var highMode = trackMode === "high";
      var lowMode = trackMode === "low";
      var openAt = Math.max(
        highMode ? 0.0018 : lowMode ? 0.0016 : 0.0025,
        noiseFloor * (highMode ? 1.35 : lowMode ? 1.25 : 1.6)
      );
      var closeAt = Math.max(
        highMode ? 0.0012 : lowMode ? 0.0011 : 0.0018,
        noiseFloor * (highMode ? 0.9 : lowMode ? 0.85 : 1.1)
      );
      if (!detected) {
        silence += 1;
        if (
          silence >= (highMode || lowMode ? 12 : 10) ||
          (gateOpen && silence >= (highMode || lowMode ? 8 : 6))
        ) {
          gateOpen = false;
          streak = 0;
          recent = [];
        }
        return { listening: false, displayMidi: displayMidi, sample: null };
      }

      if (!gateOpen && detected.rms < openAt) {
        return { listening: false, displayMidi: displayMidi, sample: null };
      }
      if (gateOpen && detected.rms < closeAt) {
        silence += 1;
        if (silence >= (highMode || lowMode ? 8 : 6)) {
          gateOpen = false;
          streak = 0;
          recent = [];
        }
        return { listening: false, displayMidi: displayMidi, sample: null };
      }

      gateOpen = true;
      silence = 0;
      var rawMidi = frequencyToMidi(detected.frequency);
      var midi = correctOctave(rawMidi, lastAccepted);
      if (
        Number.isFinite(trackedFrequency) &&
        Math.abs(midi - frequencyToMidi(trackedFrequency)) > 8
      ) {
        var flipped = correctOctave(rawMidi, frequencyToMidi(trackedFrequency));
        var trackedMidi = frequencyToMidi(trackedFrequency);
        if (highMode && flipped < trackedMidi - 4 && rawMidi >= trackedMidi - 1) {
          midi = rawMidi;
        } else if (
          lowMode &&
          midi < trackedMidi - 8 &&
          rawMidi >= trackedMidi - 3
        ) {
          midi = rawMidi;
        } else if (
          lowMode &&
          flipped > trackedMidi + 8 &&
          Math.abs(flipped - (trackedMidi + 12)) <= 2
        ) {
          midi = flipped;
        } else if (
          Math.abs(flipped - trackedMidi) < Math.abs(midi - trackedMidi)
        ) {
          midi = flipped;
        }
      }

      if (lowMode && midi < rawMidi - 8) {
        midi = rawMidi;
      }

      var delta = Number.isFinite(lastAccepted) ? midi - lastAccepted : 0;
      var maxStep = highMode || lowMode ? 4.5 : 2.4;
      var softStep = highMode || lowMode ? 6.5 : 4.0;
      if (!Number.isFinite(lastAccepted) || Math.abs(delta) <= maxStep) {
        streak += 1;
      } else if (Math.abs(delta) <= softStep && streak >= 2) {
        streak = Math.max(1, streak - 1);
      } else if (highMode && delta > 0 && delta <= 8 && streak >= 1) {
        streak = Math.max(1, streak);
        recent = recent.slice(-2);
      } else if (lowMode && delta < 0 && delta >= -8 && streak >= 1) {
        streak = Math.max(1, streak);
        recent = recent.slice(-2);
      } else {
        streak = 1;
        recent = [];
      }

      recent.push(midi);
      if (recent.length > (highMode || lowMode ? 4 : 5)) recent.shift();
      var smoothed = median(recent);
      displayMidi = Number.isFinite(displayMidi)
        ? displayMidi * (highMode || lowMode ? 0.35 : 0.45) +
          smoothed * (highMode || lowMode ? 0.65 : 0.55)
        : smoothed;
      lastAccepted = smoothed;
      trackedFrequency = 440 * Math.pow(2, (smoothed - 69) / 12);

      var needStreak = highMode || lowMode ? 1 : 2;
      var sample = null;
      if (
        streak >= needStreak &&
        detected.clarity >= (highMode || lowMode ? 0.42 : 0.52)
      ) {
        sample = {
          midi: smoothed,
          confidence: detected.confidence,
          clarity: detected.clarity
        };
      }

      return {
        listening: streak >= 1,
        displayMidi: displayMidi,
        sample: sample
      };
    }

    return {
      reset: reset,
      setMode: setMode,
      observe: observe,
      get trackedFrequency() {
        return trackedFrequency;
      }
    };
  }

  function trimSeries(values, options) {
    options = options || {};
    if (values.length < 10) return values.slice();
    var mid = median(values);
    var deviations = values.map(function (value) {
      return Math.abs(value - mid);
    });
    var mad = median(deviations) || 1.2;
    var limit = Math.max(options.loose ? 7 : 4.5, mad * (options.loose ? 6.5 : 5));
    return values.filter(function (value) {
      return Math.abs(value - mid) <= limit;
    });
  }

  var VOICE_FAMILIES = [
    { name: "basso profundo", center: 48, low: 36, high: 60, range: "C2–C4" },
    { name: "low bass", center: 50, low: 38, high: 62, range: "D2–D4" },
    { name: "bass", center: 52, low: 40, high: 64, range: "E2–E4" },
    { name: "bass-baritone", center: 54, low: 42, high: 66, range: "F♯2–F♯4" },
    { name: "baritone", center: 55, low: 43, high: 67, range: "G2–G4" },
    { name: "high baritone", center: 57, low: 45, high: 69, range: "A2–A4" },
    { name: "dramatic tenor", center: 59, low: 47, high: 71, range: "B2–B4" },
    { name: "tenor", center: 60, low: 48, high: 72, range: "C3–C5" },
    { name: "high tenor", center: 62, low: 50, high: 74, range: "D3–D5" },
    { name: "countertenor / contralto", center: 65, low: 53, high: 77, range: "F3–F5" },
    { name: "low mezzo-soprano", center: 67, low: 55, high: 79, range: "G3–G5" },
    { name: "mezzo-soprano", center: 69, low: 57, high: 81, range: "A3–A5" },
    { name: "lyric soprano", center: 72, low: 60, high: 84, range: "C4–C6" },
    { name: "high soprano", center: 74, low: 62, high: 86, range: "D4–D6" }
  ];

  function classifyVoice(lowMidi, highMidi, naturalMidi) {
    var rangeCenter = (lowMidi + highMidi) / 2;
    var center = rangeCenter;
    if (
      Number.isFinite(naturalMidi) &&
      naturalMidi >= lowMidi - 2 &&
      naturalMidi <= highMidi + 2
    ) {
      center = naturalMidi * 0.55 + rangeCenter * 0.45;
    }
    var families = VOICE_FAMILIES.slice().sort(function (a, b) {
      function score(family) {
        var centerDistance = Math.abs(center - family.center);
        var lowOverflow = Math.max(0, family.low - lowMidi);
        var highOverflow = Math.max(0, highMidi - family.high);
        var familyTooLow = Math.max(0, lowMidi - family.high);
        var familyTooHigh = Math.max(0, family.low - highMidi);
        return (
          centerDistance +
          (lowOverflow + highOverflow) * 0.55 +
          (familyTooLow + familyTooHigh) * 2.5
        );
      }
      return score(a) - score(b);
    });
    return {
      primary: families[0],
      neighbor: families[1],
      center: center,
      families: VOICE_FAMILIES
    };
  }

  function voiceFamilyRows(classification, observedLow, observedHigh) {
    return (
      '<ul class="voice-families" aria-label="Conventional vocal ranges">' +
      VOICE_FAMILIES.map(function (family) {
        var isPrimary = family.name === classification.primary.name;
        var isNeighbor = family.name === classification.neighbor.name;
        var mark = isPrimary ? " is-primary" : isNeighbor ? " is-neighbor" : "";
        var tag = isPrimary
          ? '<span class="voice-families__tag">best match</span>'
          : isNeighbor
            ? '<span class="voice-families__tag">nearby</span>'
            : "";
        return (
          '<li class="voice-families__item' +
          mark +
          '"><span class="voice-families__name">' +
          family.name +
          '</span><span class="voice-families__range">' +
          family.range +
          "</span>" +
          tag +
          '<span class="voice-families__bar" aria-hidden="true"><i style="left:' +
          Math.max(0, Math.min(100, ((family.low - 36) / 52) * 100)) +
          "%;width:" +
          Math.max(2, Math.min(100, ((family.high - family.low) / 52) * 100)) +
          '%"></i>' +
          (isPrimary
            ? '<em style="left:' +
              Math.max(0, Math.min(100, ((observedLow - 36) / 52) * 100)) +
              "%;width:" +
              Math.max(2, Math.min(100, ((observedHigh - observedLow) / 52) * 100)) +
              '%"></em>'
            : "") +
          "</span></li>"
        );
      }).join("") +
      "</ul>"
    );
  }

  function percentile(values, fraction) {
    if (!values.length) return NaN;
    var sorted = values.slice().sort(function (a, b) {
      return a - b;
    });
    var position = (sorted.length - 1) * fraction;
    var lower = Math.floor(position);
    var upper = Math.ceil(position);
    var weight = position - lower;
    return sorted[lower] * (1 - weight) + sorted[upper] * weight;
  }

  function correctOctave(midi, previousMidi) {
    if (!Number.isFinite(previousMidi)) return midi;
    var candidates = [midi - 24, midi - 12, midi, midi + 12, midi + 24];
    candidates.sort(function (a, b) {
      return Math.abs(a - previousMidi) - Math.abs(b - previousMidi);
    });
    return candidates[0];
  }

  function finishVoiceTest(samples, elapsedSeconds) {
    var result = document.getElementById("voice-result");
    var instruction = document.getElementById("voice-instruction");
    document.getElementById("voice-start").hidden = false;
    document.getElementById("voice-stop").hidden = true;
    document.getElementById("voice-meter-fill").style.width = "0%";
    document.getElementById("voice-phase").textContent = "Complete";
    document.getElementById("voice-countdown").textContent = "0";

    var naturalValues = trimSeries(
      samples.natural.map(function (sample) {
        return sample.midi;
      })
    );
    var lowValues = trimSeries(
      samples.low.map(function (sample) {
        return sample.midi;
      }),
      { loose: true }
    );
    var highValues = trimSeries(
      samples.high.map(function (sample) {
        return sample.midi;
      })
    );
    var allSamples = samples.natural.concat(samples.low, samples.high);
    var usableCount = naturalValues.length + lowValues.length + highValues.length;

    if (usableCount < 24 || lowValues.length < 6 || highValues.length < 6) {
      instruction.textContent =
        "Not enough steady pitch was detected in both glides. Move closer to the microphone and follow each phase.";
      result.hidden = false;
      result.innerHTML =
        '<p class="result-error">I heard too little stable pitch to estimate a range. No audio was saved.</p>';
      return;
    }

    var low = percentile(lowValues, 0.1);
    var high = percentile(highValues, 0.9);
    var natural = naturalValues.length
      ? median(naturalValues)
      : median(lowValues.concat(highValues));
    if (high < low) {
      var swap = high;
      high = low;
      low = swap;
    }
    var classification = classifyVoice(low, high, natural);
    var span = high - low;
    var averageConfidence =
      allSamples.reduce(function (sum, sample) {
        return sum + sample.confidence;
      }, 0) / Math.max(1, allSamples.length);
    var confidence =
      span >= 12 && usableCount >= 70 && averageConfidence >= 0.8
        ? "good"
        : span >= 7 && usableCount >= 35
          ? "moderate"
          : "tentative";

    instruction.textContent =
      "Finished. The pitch samples have been discarded; only this summary remains on screen.";
    result.hidden = false;
    result.innerHTML =
      '<p class="result-label">' +
      confidence +
      " pitch-only estimate</p>" +
      "<h3>Likely " +
      classification.primary.name +
      "</h3>" +
      "<p>Your observed comfortable glide was <strong>" +
      midiToNote(low) +
      "–" +
      midiToNote(high) +
      "</strong> (" +
      decimal(span, 1) +
      " semitones), with a natural sustained note near " +
      midiToNote(natural) +
      ". The closest neighboring family is " +
      classification.neighbor.name +
      ".</p>" +
      '<div class="range-line" aria-label="Detected range"><span style="left:' +
      Math.max(0, Math.min(100, ((low - 36) / 52) * 100)) +
      '%"></span><span style="left:' +
      Math.max(0, Math.min(100, ((high - 36) / 52) * 100)) +
      '%"></span><i style="left:' +
      Math.max(0, Math.min(100, ((low - 36) / 52) * 100)) +
      "%;width:" +
      Math.max(2, Math.min(100, (span / 52) * 100)) +
      '%"></i></div>' +
      '<div class="range-labels"><span>C2</span><span>C4</span><span>E6</span></div>' +
      '<p class="result-small">Conventional vocal ranges for comparison (your glide is the accent bar on the best match):</p>' +
      voiceFamilyRows(classification, low, high) +
      "<p class=\"result-small\">Compared with conventional " +
      classification.primary.range +
      " and " +
      classification.neighbor.range +
      " reference ranges. Endpoints use trimmed percentiles rather than one-off extremes. A teacher may still classify you differently after hearing tessitura and transitions.</p>" +
      '<p class="result-small">Kept ' +
      usableCount +
      " stable samples over " +
      decimal(elapsedSeconds, 1) +
      " seconds; average detector confidence " +
      decimal(averageConfidence * 100, 0) +
      "%.</p>";
  }

  document.getElementById("voice-start").addEventListener("click", function () {
    var startButton = document.getElementById("voice-start");
    var stopButton = document.getElementById("voice-stop");
    var instruction = document.getElementById("voice-instruction");
    var result = document.getElementById("voice-result");
    var note = document.getElementById("voice-note");
    var frequencyLabel = document.getElementById("voice-frequency");
    var orb = document.getElementById("voice-orb");
    var meter = document.getElementById("voice-meter-fill");
    var phaseLabel = document.getElementById("voice-phase");
    var countdown = document.getElementById("voice-countdown");

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      result.hidden = false;
      result.innerHTML =
        '<p class="result-error">Microphone access is unavailable here. Use a modern browser over HTTPS or localhost.</p>';
      return;
    }

    startButton.disabled = true;
    result.hidden = true;
    instruction.textContent = "Requesting microphone permission…";
    phaseLabel.textContent = "Permission";
    countdown.textContent = "15";

    navigator.mediaDevices
      .getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        }
      })
      .then(function (stream) {
        var AudioContext = window.AudioContext || window.webkitAudioContext;
        var context = new AudioContext();
        var analyser = context.createAnalyser();
        analyser.fftSize = 8192;
        analyser.smoothingTimeConstant = 0;
        var source = context.createMediaStreamSource(stream);
        var highpass = context.createBiquadFilter();
        var lowpass = context.createBiquadFilter();
        highpass.type = "highpass";
        highpass.frequency.value = 35;
        highpass.Q.value = 0.5;
        lowpass.type = "lowpass";
        lowpass.frequency.value = 2400;
        lowpass.Q.value = 0.5;
        source.connect(highpass);
        highpass.connect(lowpass);
        lowpass.connect(analyser);
        var buffer = new Float32Array(analyser.fftSize);
        var samples = { natural: [], low: [], high: [] };
        var noiseSamples = [];
        var startedAt = performance.now();
        var animationFrame = null;
        var stopped = false;
        var previousPhase = "";
        var lastAnalyzedAt = 0;
        var noiseFloor = 0.0035;
        var tracker = createPitchTracker();
        var testDuration = 15;

        startButton.hidden = true;
        startButton.disabled = false;
        stopButton.hidden = false;

        function stop() {
          if (stopped) return;
          stopped = true;
          cancelAnimationFrame(animationFrame);
          stream.getTracks().forEach(function (track) {
            track.stop();
          });
          try {
            source.disconnect();
          } catch (error) {}
          context.close();
          orb.classList.remove("is-listening");
          note.textContent = "—";
          frequencyLabel.textContent = "complete";
          voiceSession = null;
          finishVoiceTest(
            samples,
            Math.min(testDuration, (performance.now() - startedAt) / 1000)
          );
        }

        voiceSession = { stop: stop };
        stopButton.onclick = stop;

        function phaseFor(elapsed) {
          if (elapsed < 1) {
            return {
              key: "calibrate",
              label: "Calibrating room",
              instruction: "Stay quiet while I learn the room’s background level."
            };
          }
          if (elapsed < 4) {
            return {
              key: "natural",
              label: "Natural note",
              instruction: "Hold a relaxed “ah” near your natural speaking pitch."
            };
          }
          if (elapsed < 8) {
            return {
              key: "low",
              label: "Glide downward",
              instruction: "Slowly glide lower. Stop before you feel any strain."
            };
          }
          if (elapsed < 11) {
            return {
              key: "rest",
              label: "Reset",
              instruction: "Relax, breathe, and return to your comfortable center."
            };
          }
          return {
            key: "high",
            label: "Glide upward",
            instruction: "Slowly glide higher. Keep the sound easy, not loud."
          };
        }

        function analyze(now) {
          var elapsed = (now - startedAt) / 1000;
          var phase = phaseFor(elapsed);
          meter.style.width =
            Math.min(100, (elapsed / testDuration) * 100) + "%";
          phaseLabel.textContent = phase.label;
          countdown.textContent = String(
            Math.max(0, Math.ceil(testDuration - elapsed))
          );
          instruction.textContent = phase.instruction;

          if (phase.key !== previousPhase) {
            tracker.reset(phase.key);
            previousPhase = phase.key;
            lowpass.frequency.value = phase.key === "low" ? 700 : 2400;
          } else {
            tracker.setMode(phase.key);
          }

          if (now - lastAnalyzedAt >= 40) {
            lastAnalyzedAt = now;
            analyser.getFloatTimeDomainData(buffer);
            if (phase.key === "calibrate") {
              noiseSamples.push(signalRms(buffer));
              if (noiseSamples.length >= 3) {
                noiseFloor = Math.min(
                  0.02,
                  Math.max(0.002, percentile(noiseSamples, 0.8) * 1.25)
                );
              }
              orb.classList.remove("is-listening");
              frequencyLabel.textContent = "measuring quiet";
            } else if (phase.key === "rest") {
              orb.classList.remove("is-listening");
              frequencyLabel.textContent = "breathe";
            } else {
              var preferHigh = phase.key === "high";
              var preferLow = phase.key === "low";
              var detected = detectPitch(
                buffer,
                context.sampleRate,
                Math.max(
                  preferHigh ? 0.0015 : preferLow ? 0.0014 : 0.002,
                  noiseFloor * (preferHigh ? 0.55 : preferLow ? 0.5 : 0.7)
                ),
                tracker.trackedFrequency,
                { preferHigh: preferHigh, preferLow: preferLow }
              );
              var observation = tracker.observe(detected, noiseFloor);
              if (observation.listening && Number.isFinite(observation.displayMidi)) {
                note.textContent = midiToNote(observation.displayMidi);
                frequencyLabel.textContent =
                  Math.round(
                    440 * Math.pow(2, (observation.displayMidi - 69) / 12)
                  ) + " Hz";
                orb.classList.add("is-listening");
              } else {
                orb.classList.remove("is-listening");
                frequencyLabel.textContent = "listening…";
              }
              if (observation.sample && samples[phase.key]) {
                samples[phase.key].push(observation.sample);
              }
            }
          }

          if (elapsed >= testDuration) {
            stop();
          } else {
            animationFrame = requestAnimationFrame(analyze);
          }
        }

        context.resume().then(function () {
          animationFrame = requestAnimationFrame(analyze);
        });
      })
      .catch(function (error) {
        startButton.disabled = false;
        instruction.textContent =
          "Microphone permission was not granted. You can retry whenever you are ready.";
        result.hidden = false;
        result.innerHTML =
          '<p class="result-error">Could not start the microphone (' +
          escapeHtml(error.name || "permission error") +
          "). No audio was captured.</p>";
      });
  });

})();
