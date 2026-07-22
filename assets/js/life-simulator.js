(function () {
  "use strict";

  var root = document.getElementById("life-simulator");
  if (!root) return;

  var canvas = document.getElementById("life-canvas");
  var context = canvas.getContext("2d");
  var toggleButton = document.getElementById("life-toggle");
  var resetButton = document.getElementById("life-reset");
  var zoomInButton = document.getElementById("life-zoom-in");
  var zoomOutButton = document.getElementById("life-zoom-out");
  var fitButton = document.getElementById("life-fit");
  var populationLabel = document.getElementById("life-population");
  var speciesLabel = document.getElementById("life-species");
  var generationLabel = document.getElementById("life-generation");
  var yearLabel = document.getElementById("life-year");
  var inspector = document.getElementById("life-inspector-content");
  var inspectorEyebrow = document.querySelector("#life-inspector .app-eyebrow");
  var viewportWidth = 900;
  var viewportHeight = 560;
  var width = 2400;
  var height = 1500;
  var fixedStep = 1 / 30;
  var active = window.location.hash === "#life";
  var reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var userPaused = reducedMotion;
  var speed = 1;
  var frameId = null;
  var previousTime = 0;
  var accumulator = 0;
  var selectedId = null;
  var selectedFormKey = null;
  var lastFormsSignature = "";
  var nextCreatureId = 1;
  var world = null;
  var camera = { x: width / 2, y: height / 2, zoom: 0.6 };
  var drag = null;
  var paramsRoot = document.getElementById("life-params");
  var topologySelect = document.getElementById("life-topology");
  var currentTopology = "open";

  // ── Topology generators ───────────────────────────────────
  // Each returns { zones: [...], bridges: [...] }.
  // A zone is { type: 'rect', x, y, w, h } or { type: 'circle', cx, cy, r }.
  // A bridge is always { type: 'rect', x, y, w, h }.
  // "open" returns null (no terrain restrictions).

  function generateTerrain(key, w, h, random) {
    if (key === "open") return null;
    var gen = TOPOLOGIES[key];
    if (!gen) return null;
    return gen(w, h, random);
  }

  var TOPOLOGIES = {
    open: null,

    archipelago: function (w, h, random) {
      var zones = [];
      var bridges = [];
      var cols = 4;
      var rows = 3;
      var wallThick = Math.min(w, h) * 0.06;
      var corridorW = (w - wallThick * (cols + 1)) / cols;
      var corridorH = (h - wallThick * (rows + 1)) / rows;
      var bridgeW = 44;
      var rng = random || Math.random;

      for (var row = 0; row < rows; row++) {
        for (var col = 0; col < cols; col++) {
          var zx = wallThick + col * (corridorW + wallThick);
          var zy = wallThick + row * (corridorH + wallThick);
          zones.push({ type: "rect", x: zx, y: zy, w: corridorW, h: corridorH });
        }
      }

      function cellIndex(r, c) {
        return r * cols + c;
      }

      var edges = [];
      for (var r = 0; r < rows; r++) {
        for (var c = 0; c < cols; c++) {
          if (c < cols - 1) {
            edges.push({ r1: r, c1: c, r2: r, c2: c + 1, type: "h" });
          }
          if (r < rows - 1) {
            edges.push({ r1: r, c1: c, r2: r + 1, c2: c, type: "v" });
          }
        }
      }

      // Fisher-Yates random shuffle of candidate edges
      for (var i = edges.length - 1; i > 0; i--) {
        var j = Math.floor(rng() * (i + 1));
        var tmp = edges[i];
        edges[i] = edges[j];
        edges[j] = tmp;
      }

      // Disjoint Set Union to build spanning tree (guarantees 100% connectivity)
      var parent = [];
      for (var k = 0; k < rows * cols; k++) parent[k] = k;
      function find(node) {
        var curr = node;
        while (curr !== parent[curr]) curr = parent[curr];
        var root = curr;
        curr = node;
        while (curr !== root) {
          var nxt = parent[curr];
          parent[curr] = root;
          curr = nxt;
        }
        return root;
      }

      var selectedEdges = [];
      var remainingEdges = [];

      for (var e = 0; e < edges.length; e++) {
        var edge = edges[e];
        var u = cellIndex(edge.r1, edge.c1);
        var v = cellIndex(edge.r2, edge.c2);
        var rootU = find(u);
        var rootV = find(v);
        if (rootU !== rootV) {
          parent[rootU] = rootV;
          selectedEdges.push(edge);
        } else {
          remainingEdges.push(edge);
        }
      }

      // Randomly pick 2-4 extra loop bridges from remaining edges
      var extraLoops = Math.floor(2 + rng() * 3);
      for (var re = 0; re < Math.min(extraLoops, remainingEdges.length); re++) {
        selectedEdges.push(remainingEdges[re]);
      }

      selectedEdges.forEach(function (edge) {
        var zx1 = wallThick + edge.c1 * (corridorW + wallThick);
        var zy1 = wallThick + edge.r1 * (corridorH + wallThick);
        if (edge.type === "h") {
          bridges.push({
            type: "rect",
            x: zx1 + corridorW,
            y: zy1 + corridorH / 2 - bridgeW / 2,
            w: wallThick,
            h: bridgeW
          });
        } else {
          bridges.push({
            type: "rect",
            x: zx1 + corridorW / 2 - bridgeW / 2,
            y: zy1 + corridorH,
            w: bridgeW,
            h: wallThick
          });
        }
      });

      return { zones: zones, bridges: bridges };
    },

    ring: function (w, h) {
      var zones = [];
      var bridges = [];
      var cx = w / 2;
      var cy = h / 2;
      var outerR = Math.min(w, h) * 0.46;
      var innerR = outerR * 0.62;
      var centerR = innerR * 0.45;
      var bridgeW = 34;
      // Dense overlapping circles to form a smooth, seamless circular ring (no mochinut bulges)
      var ringSteps = 90;
      var ringR = (outerR - innerR) / 2;
      var ringMid = (outerR + innerR) / 2;
      for (var j = 0; j < ringSteps; j++) {
        var a2 = (j / ringSteps) * Math.PI * 2;
        zones.push({ type: "circle", cx: cx + Math.cos(a2) * ringMid, cy: cy + Math.sin(a2) * ringMid, r: ringR });
      }
      // Center island
      zones.push({ type: "circle", cx: cx, cy: cy, r: centerR });
      // Radial bridges (4 spokes)
      var spokes = 4;
      for (var s = 0; s < spokes; s++) {
        var sa = (s / spokes) * Math.PI * 2;
        var bx = cx + Math.cos(sa) * (centerR - 4);
        var by = cy + Math.sin(sa) * (centerR - 4);
        var bLen = innerR - centerR + 8;
        // Axis-aligned bridge bounding box
        var nx = Math.cos(sa);
        var ny = Math.sin(sa);
        var perpX = -ny;
        var perpY = nx;
        var hw = bridgeW / 2;
        var x0 = Math.min(bx - perpX * hw, bx + perpX * hw, bx + nx * bLen - perpX * hw, bx + nx * bLen + perpX * hw);
        var y0 = Math.min(by - perpY * hw, by + perpY * hw, by + ny * bLen - perpY * hw, by + ny * bLen + perpY * hw);
        var x1 = Math.max(bx - perpX * hw, bx + perpX * hw, bx + nx * bLen - perpX * hw, bx + nx * bLen + perpX * hw);
        var y1 = Math.max(by - perpY * hw, by + perpY * hw, by + ny * bLen - perpY * hw, by + ny * bLen + perpY * hw);
        bridges.push({ type: "rect", x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
      }
      return { zones: zones, bridges: bridges };
    },

    konigsberg: function (w, h) {
      var zones = [];
      var bridges = [];
      var bridgeW = 44;

      // Coordinates for North Bank, South Bank, Kneiphof, and East Island
      var padX = w * 0.05;
      var padY = h * 0.05;

      var northH = h * 0.27;
      var southY = h * 0.68;
      var southH = h * 0.27;

      var middleY = h * 0.42;
      var middleH = h * 0.16;

      var kneiphofX = w * 0.18;
      var kneiphofW = w * 0.36;

      var eastX = w * 0.68;
      var eastW = w * 0.22;

      // 1. North Bank (Top landmass)
      zones.push({ type: "rect", x: padX, y: padY, w: w - padX * 2, h: northH });

      // 2. South Bank (Bottom landmass)
      zones.push({ type: "rect", x: padX, y: southY, w: w - padX * 2, h: southH });

      // 3. Kneiphof Island (Central-left landmass)
      zones.push({ type: "rect", x: kneiphofX, y: middleY, w: kneiphofW, h: middleH });

      // 4. East Island / Lomse (Central-right landmass)
      zones.push({ type: "rect", x: eastX, y: middleY, w: eastW, h: middleH });

      // === The 7 Bridges of Königsberg ===

      // Bridge 1 (Krämerbrücke): North Bank <-> Kneiphof (left)
      bridges.push({
        type: "rect",
        x: kneiphofX + kneiphofW * 0.25 - bridgeW / 2,
        y: padY + northH,
        w: bridgeW,
        h: middleY - (padY + northH)
      });

      // Bridge 2 (Schmiedebrücke): North Bank <-> Kneiphof (right)
      bridges.push({
        type: "rect",
        x: kneiphofX + kneiphofW * 0.75 - bridgeW / 2,
        y: padY + northH,
        w: bridgeW,
        h: middleY - (padY + northH)
      });

      // Bridge 3 (Grüne Brücke): South Bank <-> Kneiphof (left)
      bridges.push({
        type: "rect",
        x: kneiphofX + kneiphofW * 0.25 - bridgeW / 2,
        y: middleY + middleH,
        w: bridgeW,
        h: southY - (middleY + middleH)
      });

      // Bridge 4 (Köttelbrücke): South Bank <-> Kneiphof (right)
      bridges.push({
        type: "rect",
        x: kneiphofX + kneiphofW * 0.75 - bridgeW / 2,
        y: middleY + middleH,
        w: bridgeW,
        h: southY - (middleY + middleH)
      });

      // Bridge 5 (Holzbrücke): North Bank <-> East Island
      bridges.push({
        type: "rect",
        x: eastX + eastW * 0.5 - bridgeW / 2,
        y: padY + northH,
        w: bridgeW,
        h: middleY - (padY + northH)
      });

      // Bridge 6 (Hohe Brücke): South Bank <-> East Island
      bridges.push({
        type: "rect",
        x: eastX + eastW * 0.5 - bridgeW / 2,
        y: middleY + middleH,
        w: bridgeW,
        h: southY - (middleY + middleH)
      });

      // Bridge 7 (Honigbrücke): Kneiphof <-> East Island
      bridges.push({
        type: "rect",
        x: kneiphofX + kneiphofW,
        y: middleY + middleH / 2 - bridgeW / 2,
        w: eastX - (kneiphofX + kneiphofW),
        h: bridgeW
      });

      return { zones: zones, bridges: bridges };
    },

    spiral: function (w, h) {
      var zones = [];
      var bridges = [];
      var cx = w / 2;
      var cy = h / 2;
      var maxR = Math.min(w, h) * 0.44;
      var minR = 60;
      var turns = 3.2;
      var totalAngle = turns * Math.PI * 2;
      var circleR = Math.min(w, h) * 0.05;

      // Sample points along Archimedean spiral
      for (var a = 0; a <= totalAngle; a += 0.05) {
        var r = minR + (a / totalAngle) * (maxR - minR);
        var x = cx + Math.cos(a) * r;
        var y = cy + Math.sin(a) * r;
        zones.push({ type: "circle", cx: x, cy: y, r: circleR });
      }

      return { zones: zones, bridges: bridges };
    }
  };

  function isOnLand(px, py, terrain) {
    if (!terrain) return true;
    var allShapes = terrain.zones.concat(terrain.bridges);
    for (var i = 0; i < allShapes.length; i++) {
      var s = allShapes[i];
      if (s.type === "rect") {
        if (px >= s.x && px <= s.x + s.w && py >= s.y && py <= s.y + s.h) return true;
      } else if (s.type === "circle") {
        var dx = px - s.cx;
        var dy = py - s.cy;
        if (dx * dx + dy * dy <= s.r * s.r) return true;
      }
    }
    return false;
  }

  function nearestLandPoint(px, py, terrain) {
    if (!terrain) return { x: px, y: py };
    var bestDist = Infinity;
    var bestX = px;
    var bestY = py;
    var allShapes = terrain.zones.concat(terrain.bridges);
    for (var i = 0; i < allShapes.length; i++) {
      var s = allShapes[i];
      var cx, cy, dist;
      if (s.type === "rect") {
        cx = clamp(px, s.x, s.x + s.w);
        cy = clamp(py, s.y, s.y + s.h);
      } else {
        var dx = px - s.cx;
        var dy = py - s.cy;
        var d = Math.hypot(dx, dy);
        if (d < 1e-6) {
          cx = s.cx;
          cy = s.cy;
        } else {
          var clamped = Math.min(d, s.r);
          cx = s.cx + (dx / d) * clamped;
          cy = s.cy + (dy / d) * clamped;
        }
      }
      dist = (px - cx) * (px - cx) + (py - cy) * (py - cy);
      if (dist < bestDist) {
        bestDist = dist;
        bestX = cx;
        bestY = cy;
      }
    }
    return { x: bestX, y: bestY };
  }

  function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
  }

  function lerp(a, b, amount) {
    return a + (b - a) * amount;
  }

  function distanceSquared(a, b) {
    var dx = a.x - b.x;
    var dy = a.y - b.y;
    return dx * dx + dy * dy;
  }

  var PARAM_DEFS = [
    { key: "worldWidth", group: "World", label: "Map width", min: 800, max: 4800, step: 100, value: 2400 },
    { key: "worldHeight", group: "World", label: "Map height", min: 500, max: 3000, step: 100, value: 1500 },
    { key: "startCreatures", group: "World", label: "Start creatures", min: 10, max: 300, step: 1, value: 100 },
    { key: "startPlants", group: "World", label: "Start plants", min: 100, max: 3000, step: 50, value: 1500 },
    { key: "maxPopulation", group: "World", label: "Max population", min: 50, max: 800, step: 10, value: 300 },
    { key: "doomsdayInterval", group: "World", label: "Doomsday interval (years)", min: 1, max: 200, step: 1, value: 50 },
    { key: "doomsdayWarn", group: "World", label: "Doomsday warning (years)", min: 0.1, max: 5, step: 0.1, value: 0.3 },
    { key: "doomsdayRadius", group: "World", label: "Doomsday radius", min: 40, max: 800, step: 10, value: 280 },
    { key: "moveBase", group: "Movement", label: "Move base", min: 5, max: 60, step: 1, value: 20 },
    { key: "moveSpeedScale", group: "Movement", label: "Speed scale", min: 5, max: 50, step: 1, value: 15 },
    { key: "metabolismBase", group: "Metabolism", label: "Base cost", min: 0, max: 5, step: 0.1, value: 0.1 },
    { key: "metabolismSize", group: "Metabolism", label: "Size cost", min: 0, max: 3, step: 0.1, value: 0.1 },
    { key: "metabolismKinetic", group: "Metabolism", label: "Kinetic cost", min: 0, max: 0.01, step: 0.0001, value: 0.001 },
    { key: "metabolismIntelligence", group: "Metabolism", label: "Intel cost", min: 0, max: 0.01, step: 0.0001, value: 0.001 },
    { key: "metabolismVision", group: "Metabolism", label: "Vision cell cost", min: 0, max: 0.01, step: 0.0001, value: 0.001 },
    { key: "biteSize", group: "Food", label: "Bite size", min: 0.01, max: 5, step: 0.01, value: 0.03 },
    { key: "plantGrowth", group: "Food", label: "Plant growth", min: 0.01, max: 5, step: 0.1, value: 1 },
    { key: "carcassDecay", group: "Food", label: "Carrion decay", min: 0.05, max: 1, step: 0.05, value: 0.3 },
    { key: "carcassLeftover", group: "Food", label: "Carcass leftover %", min: 0.05, max: 1, step: 0.05, value: 0.3 },
    { key: "reproEnergy", group: "Reproduction", label: "Pair energy %", min: 0.2, max: 0.95, step: 0.05, value: 0.6 },
    { key: "pairPay", group: "Reproduction", label: "Pair pay %", min: 0.1, max: 0.9, step: 0.05, value: 0.5 },
    { key: "soloReproEnergy", group: "Reproduction", label: "Solo energy %", min: 0.5, max: 0.99, step: 0.05, value: 0.9 },
    { key: "soloPay", group: "Reproduction", label: "Solo pay %", min: 0.3, max: 0.95, step: 0.05, value: 0.7 },
    { key: "soloChance", group: "Reproduction", label: "Solo chance", min: 0, max: 0.02, step: 0.001, value: 0.002 },
    { key: "bodyRadiusScale", group: "Body", label: "Body size scale", min: 1, max: 20, step: 1, value: 5 },
    { key: "sidesScale", group: "Body", label: "Sides scale", min: 1, max: 15, step: 1, value: 5 },
    { key: "energyTankScale", group: "Body", label: "Energy tank scale", min: 10, max: 300, step: 10, value: 100 },
    { key: "energyTankBias", group: "Body", label: "Energy tank bias", min: 0, max: 200, step: 10, value: 50 },
    { key: "dietBins", group: "Forms", label: "Diet bins", min: 2, max: 80, step: 1, value: 10 },
    { key: "sizeBins", group: "Forms", label: "Size bins", min: 2, max: 40, step: 1, value: 4 },
    { key: "mutationStrength", group: "Genetics", label: "Mutation", min: 0.02, max: 0.5, step: 0.02, value: 0.1 },
    { key: "crossoverPickRate", group: "Genetics", label: "Crossover pick %", min: 0, max: 1, step: 0.05, value: 0.7 },
    { key: "founderDietMin", group: "Founders", label: "Founder diet min", min: 0, max: 1, step: 0.05, value: 0 },
    { key: "founderDietMax", group: "Founders", label: "Founder diet max", min: 0, max: 1, step: 0.05, value: 0.1 },
    { key: "founderSizeMin", group: "Founders", label: "Founder size min", min: 0.1, max: 2, step: 0.1, value: 0.8 },
    { key: "founderSizeMax", group: "Founders", label: "Founder size max", min: 0.1, max: 3, step: 0.1, value: 1.2 },
    { key: "founderSpeedMin", group: "Founders", label: "Founder speed min", min: 0.1, max: 4, step: 0.1, value: 1 },
    { key: "founderSpeedMax", group: "Founders", label: "Founder speed max", min: 0.1, max: 5, step: 0.1, value: 3 },
    { key: "founderIntelMin", group: "Founders", label: "Founder intel min", min: 0, max: 6, step: 1, value: 0 },
    { key: "founderIntelMax", group: "Founders", label: "Founder intel max", min: 0, max: 6, step: 1, value: 1 }
  ];

  var params = {};
  PARAM_DEFS.forEach(function (def) {
    params[def.key] = def.value;
  });

  var geneNames = ["diet", "size", "speed", "intelligence"];
  var BRAIN_ROWS = 2;
  var BRAIN_COLS = 2;
  var VISION_GREEN_HUE = 142;
  var VISION_RED_HUE = 364;

  function geneRangesFor(name) {
    if (name === "diet") return [0, 1];
    if (name === "size") return [0.05, Infinity];
    if (name === "speed") return [0.05, Infinity];
    if (name === "intelligence") return [0, Infinity];
    return [0, 1];
  }

  function intelligenceLevel(genome) {
    return Math.max(0, Math.round(genome.intelligence || 0));
  }

  function visionCellCount(level) {
    if (level < 2) return 0;
    return Math.pow(2, level - 2);
  }

  function emptyBrain() {
    var matrix = [];
    for (var row = 0; row < BRAIN_ROWS; row += 1) {
      matrix.push([0, 0]);
    }
    return matrix;
  }

  function randomBrain(random) {
    return [
      [random(), 0],
      [0, random()]
    ];
  }

  function crossoverBrain(first, second, strength, random) {
    var child = emptyBrain();
    for (var row = 0; row < BRAIN_ROWS; row += 1) {
      for (var col = 0; col < BRAIN_COLS; col += 1) {
        var blended =
          random() < params.crossoverPickRate
            ? random() < 0.5
              ? first[row][col]
              : second[row][col]
            : (first[row][col] + second[row][col]) / 2;
        if (random() <= clamp(strength * 1.5, 0.1, 0.6)) {
          var scale = random() < 0.1 ? 0.3 : 0.15;
          blended += gaussian(random) * scale;
        }
        child[row][col] = blended;
      }
    }
    return child;
  }

  function ensureVisionBrains(genome, random) {
    var need = visionCellCount(intelligenceLevel(genome));
    if (!genome.visionBrains) genome.visionBrains = [];
    while (genome.visionBrains.length < need) {
      genome.visionBrains.push(randomBrain(random));
    }
    if (genome.visionBrains.length > need) {
      genome.visionBrains = genome.visionBrains.slice(0, need);
    }
    return genome.visionBrains;
  }

  function crossoverVisionBrains(first, second, childIntel, strength, random) {
    var need = visionCellCount(childIntel);
    var a = first.visionBrains || [];
    var b = second.visionBrains || [];
    var child = [];
    for (var index = 0; index < need; index += 1) {
      var left = a[index] || randomBrain(random);
      var right = b[index] || randomBrain(random);
      child.push(crossoverBrain(left, right, strength, random));
    }
    return child;
  }

  function applyBrain(matrix, ix, iy) {
    return {
      x: ix * matrix[0][0] + iy * matrix[1][0],
      y: ix * matrix[0][1] + iy * matrix[1][1]
    };
  }

  function rayCircleHit(ox, oy, dx, dy, range, cx, cy, radius) {
    var fx = ox - cx;
    var fy = oy - cy;
    var b = 2 * (fx * dx + fy * dy);
    var c = fx * fx + fy * fy - radius * radius;
    var disc = b * b - 4 * c;
    if (disc < 0) return null;
    var root = Math.sqrt(disc);
    var t1 = (-b - root) / 2;
    var t2 = (-b + root) / 2;
    if (t1 >= 0 && t1 <= range) return t1;
    if (t2 >= 0 && t2 <= range) return t2;
    return null;
  }

  function castVisionRay(creature, rayAngle) {
    var range = creatureBodyRadius(creature.genome) * 3;
    var dx = Math.cos(rayAngle);
    var dy = Math.sin(rayAngle);
    var ox = creature.x;
    var oy = creature.y;
    var bestT = range + 1;
    var bestColor = 0;

    world.plants.forEach(function (plant) {
      if (plant.energy < 1) return;
      var hit = rayCircleHit(
        ox,
        oy,
        dx,
        dy,
        range,
        plant.x,
        plant.y,
        plantDrawRadius(plant)
      );
      if (hit != null && hit < bestT) {
        bestT = hit;
        bestColor = visionColorFromHue(142);
      }
    });

    world.carcasses.forEach(function (carcass) {
      if (carcass.energy < 1) return;
      var hit = rayCircleHit(
        ox,
        oy,
        dx,
        dy,
        range,
        carcass.x,
        carcass.y,
        carrionDrawRadius(carcass)
      );
      if (hit != null && hit < bestT) {
        bestT = hit;
        bestColor = visionColorFromHue(28);
      }
    });

    var midX = ox + dx * range * 0.5;
    var midY = oy + dy * range * 0.5;
    var neighbors = world.hash.query(midX, midY, range * 0.5 + 48);
    neighbors.forEach(function (other) {
      if (!other.alive || other.id === creature.id) return;
      var hit = rayCircleHit(
        ox,
        oy,
        dx,
        dy,
        range,
        other.x,
        other.y,
        creatureBodyRadius(other.genome)
      );
      if (hit != null && hit < bestT) {
        bestT = hit;
        bestColor = visionColorFromHue(dietHue(other.genome.diet));
      }
    });

    if (bestT > range) return [0, 0];
    return [bestColor, 1 / (1 + bestT * bestT)];
  }

  function steerAngle(creature, random) {
    var angle = creature.angle;
    var sample = random() * Math.PI * 2;
    var outX = Math.cos(sample);
    var outY = Math.sin(sample);
    var level = intelligenceLevel(creature.genome);

    if (level >= 1) {
      var heading = applyBrain(
        creature.genome.brain,
        Math.cos(angle),
        Math.sin(angle)
      );
      outX += heading.x;
      outY += heading.y;
    }

    if (level >= 2) {
      var cells = visionCellCount(level);
      var brains = ensureVisionBrains(creature.genome, random);
      for (var cell = 0; cell < cells; cell += 1) {
        var rayAngle = angle + (cell * Math.PI * 2) / cells;
        var sense = castVisionRay(creature, rayAngle);
        var vision = applyBrain(brains[cell], sense[0], sense[1]);
        outX += vision.x;
        outY += vision.y;
      }
    }

    var length = Math.hypot(outX, outY);
    if (length < 1e-6) return angle;
    return Math.atan2(outY, outX);
  }

  function creatureBodyRadius(genome) {
    return Math.max(2, params.bodyRadiusScale * genome.size);
  }

  function creatureSides(genome) {
    return Math.max(3, Math.round(3 + genome.speed * params.sidesScale));
  }

  function dietHue(diet) {
    var t = clamp(diet, 0, 1);
    if (t <= 0.5) return 146 + (262 - 146) * (t / 0.5);
    return 262 + (364 - 262) * ((t - 0.5) / 0.5);
  }

  // Vision tint: green → 1 (highest), red → 0 (lowest), along the diet hue arc.
  function visionColorFromHue(hueDegrees) {
    var hue = ((hueDegrees % 360) + 360) % 360;
    if (hue < 90) hue += 360;
    var t = clamp(
      (hue - VISION_GREEN_HUE) / (VISION_RED_HUE - VISION_GREEN_HUE),
      0,
      1
    );
    return 1 - t;
  }

  function dietStyle(genome) {
    var hue = dietHue(genome.diet);
    return {
      hue: hue,
      fill: "hsl(" + hue.toFixed(0) + ", 52%, 48%)",
      stroke: "hsl(" + hue.toFixed(0) + ", 65%, 38%)"
    };
  }

  function formParts(genome) {
    var dietBin = Math.round(genome.diet * params.dietBins);
    var sizeBin = Math.round(genome.size * params.sizeBins);
    var speedBin = creatureSides(genome);
    var intel = intelligenceLevel(genome);
    return {
      key: [dietBin, sizeBin, speedBin, intel].join("-"),
      label:
        "diet " +
        genome.diet.toFixed(2) +
        " · size " +
        genome.size.toFixed(2) +
        " · speed " +
        genome.speed.toFixed(2) +
        " · intel " +
        intel,
      binLabel:
        "diet " +
        dietBin +
        " · size " +
        sizeBin +
        " · speed " +
        speedBin +
        " · intel " +
        intel
    };
  }

  function cladeKey(genome) {
    return formParts(genome).key;
  }

  function regularPolygonVertices(x, y, radius, sides, rotation) {
    var vertices = [];
    for (var side = 0; side < sides; side += 1) {
      var angle = rotation + (side / sides) * Math.PI * 2;
      vertices.push({
        x: x + Math.cos(angle) * radius,
        y: y + Math.sin(angle) * radius
      });
    }
    return vertices;
  }

  function creatureVertices(creature) {
    var sides = creatureSides(creature.genome);
    return regularPolygonVertices(
      creature.x,
      creature.y,
      creatureBodyRadius(creature.genome),
      sides,
      creature.angle + Math.PI / sides
    );
  }

  function projectPolygon(vertices, axisX, axisY) {
    var minimum = Infinity;
    var maximum = -Infinity;
    for (var index = 0; index < vertices.length; index += 1) {
      var projection = vertices[index].x * axisX + vertices[index].y * axisY;
      if (projection < minimum) minimum = projection;
      if (projection > maximum) maximum = projection;
    }
    return { min: minimum, max: maximum };
  }

  function polygonsOverlap(first, second) {
    var shapes = [first, second];
    var smallestOverlap = Infinity;
    var axisX = 0;
    var axisY = 0;

    for (var shapeIndex = 0; shapeIndex < 2; shapeIndex += 1) {
      var shape = shapes[shapeIndex];
      for (var edge = 0; edge < shape.length; edge += 1) {
        var current = shape[edge];
        var next = shape[(edge + 1) % shape.length];
        var edgeX = next.x - current.x;
        var edgeY = next.y - current.y;
        var length = Math.hypot(edgeX, edgeY) || 1;
        var normalX = -edgeY / length;
        var normalY = edgeX / length;
        var a = projectPolygon(first, normalX, normalY);
        var b = projectPolygon(second, normalX, normalY);
        if (a.max < b.min || b.max < a.min) return null;
        var overlap = Math.min(a.max, b.max) - Math.max(a.min, b.min);
        if (overlap < smallestOverlap) {
          smallestOverlap = overlap;
          axisX = normalX;
          axisY = normalY;
        }
      }
    }

    var firstCenterX = 0;
    var firstCenterY = 0;
    var secondCenterX = 0;
    var secondCenterY = 0;
    for (var i = 0; i < first.length; i += 1) {
      firstCenterX += first[i].x;
      firstCenterY += first[i].y;
    }
    for (var j = 0; j < second.length; j += 1) {
      secondCenterX += second[j].x;
      secondCenterY += second[j].y;
    }
    firstCenterX /= first.length;
    firstCenterY /= first.length;
    secondCenterX /= second.length;
    secondCenterY /= second.length;
    if (
      (secondCenterX - firstCenterX) * axisX +
      (secondCenterY - firstCenterY) * axisY <
      0
    ) {
      axisX = -axisX;
      axisY = -axisY;
    }

    return {
      overlap: smallestOverlap,
      axisX: axisX,
      axisY: axisY
    };
  }

  function pointInsidePolygon(point, vertices) {
    var inside = false;
    for (
      var index = 0, previous = vertices.length - 1;
      index < vertices.length;
      previous = index, index += 1
    ) {
      var current = vertices[index];
      var prior = vertices[previous];
      var intersects =
        current.y > point.y !== prior.y > point.y &&
        point.x <
        ((prior.x - current.x) * (point.y - current.y)) /
        ((prior.y - current.y) || 1e-9) +
        current.x;
      if (intersects) inside = !inside;
    }
    return inside;
  }

  function closestPointOnSegment(px, py, ax, ay, bx, by) {
    var abx = bx - ax;
    var aby = by - ay;
    var lengthSquared = abx * abx + aby * aby;
    if (lengthSquared <= 1e-9) return { x: ax, y: ay };
    var amount = clamp(((px - ax) * abx + (py - ay) * aby) / lengthSquared, 0, 1);
    return { x: ax + abx * amount, y: ay + aby * amount };
  }

  function circleHitsCreature(cx, cy, radius, creature) {
    var vertices = creatureVertices(creature);
    if (pointInsidePolygon({ x: cx, y: cy }, vertices)) return true;
    var radius2 = radius * radius;
    for (var edge = 0; edge < vertices.length; edge += 1) {
      var start = vertices[edge];
      var end = vertices[(edge + 1) % vertices.length];
      var closest = closestPointOnSegment(cx, cy, start.x, start.y, end.x, end.y);
      var dx = cx - closest.x;
      var dy = cy - closest.y;
      if (dx * dx + dy * dy <= radius2) return true;
    }
    return false;
  }

  function pointHitsCreature(point, creature) {
    return pointInsidePolygon(point, creatureVertices(creature));
  }

  function plantDrawRadius(plant) {
    return 1 + (plant.energy / plant.maximum) * 2;
  }

  function carrionDrawRadius(carcass) {
    return 2 + Math.min(3, carcass.energy / 30);
  }

  function creaturesTouching(first, second) {
    return !!polygonsOverlap(creatureVertices(first), creatureVertices(second));
  }

  function constrainCreatureToMap(creature) {
    var vertices = creatureVertices(creature);
    var minX = Infinity;
    var maxX = -Infinity;
    var minY = Infinity;
    var maxY = -Infinity;
    for (var index = 0; index < vertices.length; index += 1) {
      var vertex = vertices[index];
      if (vertex.x < minX) minX = vertex.x;
      if (vertex.x > maxX) maxX = vertex.x;
      if (vertex.y < minY) minY = vertex.y;
      if (vertex.y > maxY) maxY = vertex.y;
    }
    if (minX < 0) creature.x -= minX;
    if (maxX > width) creature.x -= maxX - width;
    if (minY < 0) creature.y -= minY;
    if (maxY > height) creature.y -= maxY - height;
    // Terrain constraint: ensure ALL vertices stay on land
    if (world && world.terrain) {
      // First snap the center if it's off-land
      if (!isOnLand(creature.x, creature.y, world.terrain)) {
        var snapped = nearestLandPoint(creature.x, creature.y, world.terrain);
        creature.x = snapped.x;
        creature.y = snapped.y;
      }
      // Then check every vertex — push creature so no part overhangs water
      vertices = creatureVertices(creature);
      var pushX = 0;
      var pushY = 0;
      for (var vi = 0; vi < vertices.length; vi++) {
        var v = vertices[vi];
        if (!isOnLand(v.x, v.y, world.terrain)) {
          var snap = nearestLandPoint(v.x, v.y, world.terrain);
          var dx = snap.x - v.x;
          var dy = snap.y - v.y;
          // Keep the largest push in each direction
          if (Math.abs(dx) > Math.abs(pushX)) pushX = dx;
          if (Math.abs(dy) > Math.abs(pushY)) pushY = dy;
        }
      }
      if (pushX !== 0 || pushY !== 0) {
        creature.x += pushX;
        creature.y += pushY;
      }
    }
  }

  function resolveCreatureCollisions() {
    var resolved = new Set();
    world.creatures.forEach(function (creature) {
      var radius = creatureBodyRadius(creature.genome) + 20;
      var nearby = world.hash.query(creature.x, creature.y, radius);
      nearby.forEach(function (other) {
        if (!other.alive || other === creature) return;
        var key =
          creature.id < other.id
            ? creature.id + ":" + other.id
            : other.id + ":" + creature.id;
        if (resolved.has(key)) return;
        resolved.add(key);
        var hit = polygonsOverlap(
          creatureVertices(creature),
          creatureVertices(other)
        );
        if (!hit) return;
        var push = hit.overlap / 2 + 0.05;
        creature.x -= hit.axisX * push;
        creature.y -= hit.axisY * push;
        other.x += hit.axisX * push;
        other.y += hit.axisY * push;
        constrainCreatureToMap(creature);
        constrainCreatureToMap(other);
      });
    });
  }

  function angleDifference(a, b) {
    var difference = a - b;
    while (difference > Math.PI) difference -= Math.PI * 2;
    while (difference < -Math.PI) difference += Math.PI * 2;
    return difference;
  }

  function hashSeed(seed) {
    var value = seed >>> 0;
    return function () {
      value += 0x6d2b79f5;
      var result = value;
      result = Math.imul(result ^ (result >>> 15), result | 1);
      result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
      return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
    };
  }

  function gaussian(random) {
    var first = Math.max(1e-9, random());
    var second = random();
    return Math.sqrt(-2 * Math.log(first)) * Math.cos(Math.PI * 2 * second);
  }

  function SpatialHash(cellSize) {
    this.cellSize = cellSize;
    this.cells = new Map();
  }

  SpatialHash.prototype.clear = function () {
    this.cells.clear();
  };

  SpatialHash.prototype.key = function (x, y) {
    return Math.floor(x / this.cellSize) + ":" + Math.floor(y / this.cellSize);
  };

  SpatialHash.prototype.insert = function (item) {
    var key = this.key(item.x, item.y);
    if (!this.cells.has(key)) this.cells.set(key, []);
    this.cells.get(key).push(item);
  };

  SpatialHash.prototype.query = function (x, y, radius) {
    var results = [];
    var minX = Math.floor((x - radius) / this.cellSize);
    var maxX = Math.floor((x + radius) / this.cellSize);
    var minY = Math.floor((y - radius) / this.cellSize);
    var maxY = Math.floor((y + radius) / this.cellSize);
    for (var cellX = minX; cellX <= maxX; cellX += 1) {
      for (var cellY = minY; cellY <= maxY; cellY += 1) {
        var bucket = this.cells.get(cellX + ":" + cellY);
        if (bucket) results.push.apply(results, bucket);
      }
    }
    return results;
  };

  function randomGenome(random) {
    var dietMin = Math.min(params.founderDietMin, params.founderDietMax);
    var dietMax = Math.max(params.founderDietMin, params.founderDietMax);
    var intelMin = Math.min(params.founderIntelMin, params.founderIntelMax);
    var intelMax = Math.max(params.founderIntelMin, params.founderIntelMax);
    var genome = {
      diet: lerp(dietMin, dietMax, random()),
      size: lerp(params.founderSizeMin, params.founderSizeMax, random()),
      speed: lerp(params.founderSpeedMin, params.founderSpeedMax, random()),
      intelligence: Math.round(lerp(intelMin, intelMax, random())),
      brain: randomBrain(random),
      visionBrains: []
    };
    genome.intelligence = Math.max(0, Math.round(genome.intelligence));
    ensureVisionBrains(genome, random);
    return genome;
  }

  function founderGenome(random) {
    return randomGenome(random);
  }

  function geneSpan(name, value) {
    var range = geneRangesFor(name);
    if (Number.isFinite(range[1])) return range[1] - range[0];
    return Math.max(0.5, Math.abs(value) * 0.5 + 0.25);
  }

  function mutateValue(name, value, strength, random) {
    var range = geneRangesFor(name);
    if (name === "intelligence") {
      value = Math.round(value);
      if (random() > clamp(strength * 1.5, 0.1, 0.6)) {
        return clamp(value, range[0], range[1]);
      }
      var step = random() < 0.15 ? 2 : 1;
      var next = value + (random() < 0.5 ? -step : step);
      return clamp(next, range[0], range[1]);
    }
    if (random() > clamp(strength * 1.5, 0.1, 0.6)) return value;
    var scale = random() < 0.1 ? 0.3 : 0.15;
    var nextValue = value + gaussian(random) * geneSpan(name, value) * scale;
    if (Number.isFinite(range[1])) {
      return clamp(nextValue, range[0], range[1]);
    }
    return Math.max(range[0], nextValue);
  }

  function crossover(first, second, random, forcedMutation) {
    var strength = clamp(
      params.mutationStrength + (forcedMutation || 0),
      0.01,
      0.3
    );
    var child = {};
    geneNames.forEach(function (name) {
      var blended =
        random() < params.crossoverPickRate
          ? random() < 0.5
            ? first[name]
            : second[name]
          : (first[name] + second[name]) / 2;
      child[name] = mutateValue(name, blended, strength, random);
    });
    child.intelligence = Math.max(0, Math.round(child.intelligence));
    child.brain = crossoverBrain(first.brain, second.brain, strength, random);
    child.visionBrains = crossoverVisionBrains(
      first,
      second,
      child.intelligence,
      strength,
      random
    );
    return child;
  }

  function findOpenPoint(random, options) {
    options = options || {};
    var margin = options.margin == null ? 30 : options.margin;
    var preferX = options.x;
    var preferY = options.y;
    var jitter = options.jitter == null ? 0 : options.jitter;
    var terrain = world ? world.terrain : null;
    var maxTries = terrain ? 200 : 1;
    for (var attempt = 0; attempt < maxTries; attempt++) {
      var x =
        Number.isFinite(preferX)
          ? preferX + (jitter ? gaussian(random) * jitter : 0)
          : margin + random() * (width - margin * 2);
      var y =
        Number.isFinite(preferY)
          ? preferY + (jitter ? gaussian(random) * jitter : 0)
          : margin + random() * (height - margin * 2);
      x = clamp(x, margin, width - margin);
      y = clamp(y, margin, height - margin);
      if (isOnLand(x, y, terrain)) return { x: x, y: y };
    }
    // Fallback: snap to nearest land
    var fallbackX = Number.isFinite(preferX) ? preferX : width / 2;
    var fallbackY = Number.isFinite(preferY) ? preferY : height / 2;
    var snapped = nearestLandPoint(fallbackX, fallbackY, terrain);
    return { x: clamp(snapped.x, margin, width - margin), y: clamp(snapped.y, margin, height - margin) };
  }

  function createCreature(genome, x, y, generation, parents, random) {
    var maximumEnergy =
      params.energyTankScale * genome.size + params.energyTankBias;
    return {
      id: nextCreatureId++,
      x: x,
      y: y,
      angle: random() * Math.PI * 2,
      genome: genome,
      generation: generation || 0,
      parents: parents || [],
      age: random() * 50,
      energy: maximumEnergy * lerp(0.8, 1, random()),
      maximumEnergy: maximumEnergy,
      targetId: null,
      alive: true
    };
  }

  function makeWorld(seed) {
    width = params.worldWidth;
    height = params.worldHeight;
    var random = hashSeed(seed);

    var nextWorld = {
      seed: seed,
      random: random,
      creatures: [],
      plants: [],
      carcasses: [],
      hash: new SpatialHash(64),
      days: 0,
      births: 0,
      deaths: 0,
      nextDoomsdayDay: Math.max(1, params.doomsdayInterval * 365),
      blast: null,
      warning: null,
      plantSpawnCredit: 0,
      terrain: generateTerrain(currentTopology, width, height, random)
    };
    world = nextWorld;

    for (var plantIndex = 0; plantIndex < params.startPlants; plantIndex += 1) {
      var plantPoint = findOpenPoint(random, {
        margin: 8
      });
      var plant = {
        x: plantPoint.x,
        y: plantPoint.y,
        energy: 0,
        maximum: 20 + random() * 20,
        phase: random() * Math.PI * 2
      };
      plant.energy = plant.maximum * random();
      nextWorld.plants.push(plant);
    }

    for (var creatureIndex = 0; creatureIndex < params.startCreatures; creatureIndex += 1) {
      var genome = founderGenome(random);
      var spawn = findOpenPoint(random, {
        margin: 30
      });
      nextWorld.creatures.push(
        createCreature(genome, spawn.x, spawn.y, 0, [], random)
      );
    }
    selectedId = null;
    selectedFormKey = null;
    lastFormsSignature = "";
    camera.x = width / 2;
    camera.y = height / 2;
    camera.zoom = Math.max(0.6, minCameraZoom());
    clampCamera();
    updateInspector();
  }


  function plantYield(diet, amount) {
    return amount * (1 - clamp(diet, 0, 1));
  }

  function meatYield(diet, amount) {
    return amount * clamp(diet, 0, 1);
  }

  function biteSize(predatorMaxEnergy, available) {
    return Math.min(available, predatorMaxEnergy * params.biteSize);
  }

  function interactOnContact(creature) {
    var genome = creature.genome;
    var diet = clamp(genome.diet, 0, 1);
    var reach = creatureBodyRadius(genome) + 5;
    var reach2 = reach * reach;
    var index;

    for (index = 0; index < world.plants.length; index += 1) {
      var plant = world.plants[index];
      if (plant.energy < 1) continue;
      if (diet >= 1) continue;
      if (distanceSquared(creature, plant) > reach2) continue;
      if (!circleHitsCreature(plant.x, plant.y, plantDrawRadius(plant), creature)) {
        continue;
      }
      var plantBite = plant.energy;
      plant.energy = 0;
      creature.energy += plantYield(diet, plantBite);
      break;
    }

    for (index = 0; index < world.carcasses.length; index += 1) {
      var carcass = world.carcasses[index];
      if (carcass.energy < 1) continue;
      if (diet <= 0) continue;
      if (distanceSquared(creature, carcass) > reach2) continue;
      var carrionRadius = carrionDrawRadius(carcass);
      if (!circleHitsCreature(carcass.x, carcass.y, carrionRadius, creature)) {
        continue;
      }
      var carrionBite = carcass.energy;
      carcass.energy = 0;
      creature.energy += meatYield(diet, carrionBite);
      break;
    }

    var contactRadius = reach + 20;
    var nearby = world.hash.query(creature.x, creature.y, contactRadius);

    for (index = 0; index < nearby.length; index += 1) {
      var other = nearby[index];
      if (!other.alive || other === creature) continue;
      if (!creaturesTouching(creature, other)) continue;

      if (
        creature.energy / creature.maximumEnergy > params.reproEnergy &&
        other.energy / other.maximumEnergy > params.reproEnergy &&
        cladeKey(genome) === cladeKey(other.genome)
      ) {
        reproduce(creature, other);
        return;
      }

      if (diet > other.genome.diet) {
        var damage = biteSize(creature.maximumEnergy, other.energy);
        other.energy -= damage;
        creature.energy += meatYield(diet, damage);
        return;
      }
    }

    if (
      creature.energy / creature.maximumEnergy > params.soloReproEnergy &&
      world.random() < params.soloChance
    ) {
      reproduce(creature, creature);
    }
  }

  function reproduce(first, second) {
    if (world.creatures.length >= params.maxPopulation) return;
    var childGenome = crossover(first.genome, second.genome, world.random, 0);
    var sameParent = first === second;
    var firstPay = first.energy * (sameParent ? params.soloPay : params.pairPay);
    var secondPay = sameParent ? 0 : second.energy * params.pairPay;
    first.energy -= firstPay;
    second.energy -= secondPay;
    var birth = findOpenPoint(world.random, {
      x: sameParent ? first.x : (first.x + second.x) / 2,
      y: sameParent ? first.y : (first.y + second.y) / 2,
      jitter: 8,
      margin: 30
    });
    var child = createCreature(
      childGenome,
      birth.x,
      birth.y,
      Math.max(first.generation, second.generation) + 1,
      sameParent ? [first.id] : [first.id, second.id],
      world.random
    );
    child.age = 0;
    child.energy = Math.min(child.maximumEnergy, firstPay + secondPay);
    world.creatures.push(child);
    world.births += 1;
  }

  function updateCreature(creature, dt) {
    var genome = creature.genome;
    creature.targetId = null;

    creature.angle = steerAngle(creature, world.random);

    var moveSpeed =
      (params.moveBase + genome.speed * params.moveSpeedScale) /
      Math.sqrt(genome.size);
    var velocity = moveSpeed;
    creature.x += Math.cos(creature.angle) * velocity * dt;
    creature.y += Math.sin(creature.angle) * velocity * dt;
    var preX = creature.x;
    var preY = creature.y;
    constrainCreatureToMap(creature);
    // Bounce angle if terrain constraint moved the creature
    if (world && world.terrain && (Math.abs(creature.x - preX) > 0.1 || Math.abs(creature.y - preY) > 0.1)) {
      creature.angle = creature.angle + Math.PI * (0.6 + world.random() * 0.8);
    }
    var vertices = creatureVertices(creature);
    var minX = Infinity;
    var maxX = -Infinity;
    var minY = Infinity;
    var maxY = -Infinity;
    for (var vertexIndex = 0; vertexIndex < vertices.length; vertexIndex += 1) {
      var vertex = vertices[vertexIndex];
      if (vertex.x < minX) minX = vertex.x;
      if (vertex.x > maxX) maxX = vertex.x;
      if (vertex.y < minY) minY = vertex.y;
      if (vertex.y > maxY) maxY = vertex.y;
    }
    if (minX <= 0.5 || maxX >= width - 0.5) creature.angle = Math.PI - creature.angle;
    if (minY <= 0.5 || maxY >= height - 0.5) creature.angle = -creature.angle;
    constrainCreatureToMap(creature);
    interactOnContact(creature);

    var level = intelligenceLevel(genome);
    var visionCells = visionCellCount(level);
    var baseCost = params.metabolismBase + genome.size * params.metabolismSize;
    var mass = Math.max(0.2, genome.size);
    var kineticCost =
      0.5 * mass * Math.pow(velocity, 2) * params.metabolismKinetic;
    var intelCost = level * params.metabolismIntelligence;
    var visionCost = visionCells * params.metabolismVision;
    creature.energy -=
      (baseCost + kineticCost + intelCost + visionCost) * dt;
    creature.energy = Math.min(creature.maximumEnergy, creature.energy);
    creature.age += dt * 30;

    if (creature.energy <= 0) {
      creature.alive = false;
    }
  }

  function pickDoomsdayTarget() {
    var radius = params.doomsdayRadius;
    var margin = Math.min(radius, Math.min(width, height) * 0.45);
    return {
      x: margin + world.random() * Math.max(1, width - margin * 2),
      y: margin + world.random() * Math.max(1, height - margin * 2),
      radius: radius
    };
  }

  function armDoomsdayWarning() {
    if (world.warning) return;
    var target = pickDoomsdayTarget();
    world.warning = {
      x: target.x,
      y: target.y,
      radius: target.radius,
      dropDay: world.nextDoomsdayDay
    };
  }

  function triggerDoomsday() {
    var target = world.warning || pickDoomsdayTarget();
    var cx = target.x;
    var cy = target.y;
    var radius = target.radius || params.doomsdayRadius;
    var r2 = radius * radius;
    var center = { x: cx, y: cy };

    world.creatures.forEach(function (creature) {
      if (!creature.alive) return;
      if (distanceSquared(creature, center) <= r2) {
        creature.alive = false;
        creature.vaporized = true;
      }
    });
    world.plants = world.plants.filter(function (plant) {
      return distanceSquared(plant, center) > r2;
    });
    world.carcasses = world.carcasses.filter(function (carcass) {
      return distanceSquared(carcass, center) > r2;
    });
    world.warning = null;
    world.blast = { x: cx, y: cy, radius: radius, age: 0 };
  }

  function updateWorld(dt) {
    world.days += dt * 30;

    if (world.blast) {
      world.blast.age += dt;
      if (world.blast.age > 0.9) world.blast = null;
    }

    var intervalDays = Math.max(365, params.doomsdayInterval * 365);
    var warnLead = Math.min(
      Math.max(1, params.doomsdayWarn * 365),
      Math.max(1, intervalDays - 1)
    );
    if (
      !world.warning &&
      !world.blast &&
      world.days >= world.nextDoomsdayDay - warnLead &&
      world.days < world.nextDoomsdayDay
    ) {
      armDoomsdayWarning();
    }

    if (world.days >= world.nextDoomsdayDay) {
      triggerDoomsday();
      world.nextDoomsdayDay = world.days + intervalDays;
    }

    world.plants.forEach(function (plant) {
      plant.energy = Math.min(
        plant.maximum,
        plant.energy + params.plantGrowth * dt
      );
    });

    var plantDeficit = params.startPlants - world.plants.length;
    if (plantDeficit > 0) {
      var spawnRate = Math.max(2, params.startPlants * 0.04);
      world.plantSpawnCredit =
        (world.plantSpawnCredit || 0) + spawnRate * dt * 30;
      while (
        world.plantSpawnCredit >= 1 &&
        world.plants.length < params.startPlants
      ) {
        world.plantSpawnCredit -= 1;
        var plantPoint = findOpenPoint(world.random, { margin: 8 });
        var sprout = {
          x: plantPoint.x,
          y: plantPoint.y,
          energy: 0,
          maximum: 20 + world.random() * 20,
          phase: world.random() * Math.PI * 2
        };
        sprout.energy = sprout.maximum * world.random() * 0.25;
        world.plants.push(sprout);
      }
    } else {
      world.plantSpawnCredit = 0;
    }

    world.carcasses.forEach(function (carcass) {
      carcass.energy -= dt * params.carcassDecay;
    });
    world.carcasses = world.carcasses.filter(function (carcass) {
      return carcass.energy > 0;
    });

    world.hash.clear();
    world.creatures.forEach(function (creature) {
      if (creature.alive) world.hash.insert(creature);
    });
    var snapshot = world.creatures.slice();
    snapshot.forEach(function (creature) {
      if (creature.alive) updateCreature(creature, dt);
    });

    world.hash.clear();
    world.creatures.forEach(function (creature) {
      if (creature.alive) world.hash.insert(creature);
    });
    resolveCreatureCollisions();
    world.creatures.forEach(function (creature) {
      if (creature.alive) constrainCreatureToMap(creature);
    });

    world.creatures.forEach(function (creature) {
      if (!creature.alive) {
        if (!creature.vaporized) {
          world.carcasses.push({
            x: creature.x,
            y: creature.y,
            energy: Math.max(5, creature.maximumEnergy * params.carcassLeftover)
          });
        }
        world.deaths += 1;
      }
    });
    world.creatures = world.creatures.filter(function (creature) {
      return creature.alive;
    });

    if (selectedId && !world.creatures.some(function (creature) {
      return creature.id === selectedId;
    })) {
      selectedId = null;
    }
  }

  function drawEnvironment() {
    var terrain = world ? world.terrain : null;
    if (!terrain) {
      context.fillStyle = "#0b1524";
      context.fillRect(0, 0, width, height);
      return;
    }
    // Water
    context.fillStyle = "#060d18";
    context.fillRect(0, 0, width, height);
    var allShapes = terrain.zones.concat(terrain.bridges);
    // Pass 1: draw shore outlines (these go on top of water)
    context.strokeStyle = "hsla(210, 40%, 28%, 0.55)";
    context.lineWidth = 2.5;
    for (var j = 0; j < allShapes.length; j++) {
      var sh = allShapes[j];
      if (sh.type === "rect") {
        context.strokeRect(sh.x, sh.y, sh.w, sh.h);
      } else if (sh.type === "circle") {
        context.beginPath();
        context.arc(sh.cx, sh.cy, sh.r, 0, Math.PI * 2);
        context.stroke();
      }
    }
    // Pass 2: fill land on top — covers internal strokes where shapes overlap,
    // leaving only the water-facing edges visible as shorelines
    context.fillStyle = "#0b1524";
    for (var i = 0; i < allShapes.length; i++) {
      var s = allShapes[i];
      if (s.type === "rect") {
        context.fillRect(s.x, s.y, s.w, s.h);
      } else if (s.type === "circle") {
        context.beginPath();
        context.arc(s.cx, s.cy, s.r, 0, Math.PI * 2);
        context.fill();
      }
    }
  }

  function drawBlast() {
    if (world.warning) {
      var warn = world.warning;
      var pulse = 0.55 + 0.45 * Math.sin(performance.now() * 0.012);
      context.beginPath();
      context.arc(warn.x, warn.y, warn.radius, 0, Math.PI * 2);
      context.fillStyle =
        "hsla(0, 85%, 48%, " + (0.12 * pulse).toFixed(3) + ")";
      context.fill();
      context.lineWidth = 2 + 2 * pulse;
      context.strokeStyle =
        "hsla(0, 95%, 58%, " + (0.55 + 0.4 * pulse).toFixed(3) + ")";
      context.setLineDash([10, 8]);
      context.stroke();
      context.setLineDash([]);
    }
    if (!world.blast) return;
    var blast = world.blast;
    var fade = clamp(1 - blast.age / 0.9, 0, 1);
    context.beginPath();
    context.arc(blast.x, blast.y, blast.radius, 0, Math.PI * 2);
    context.fillStyle = "hsla(14, 88%, 48%, " + (0.28 * fade).toFixed(3) + ")";
    context.fill();
    context.lineWidth = 2.5 + 4 * fade;
    context.strokeStyle = "hsla(38, 100%, 68%, " + (0.85 * fade).toFixed(3) + ")";
    context.stroke();
  }

  function drawResources() {
    world.plants.forEach(function (plant) {
      if (plant.energy < 1) return;
      var radius = plantDrawRadius(plant);
      context.beginPath();
      context.arc(plant.x, plant.y, radius, 0, Math.PI * 2);
      context.fillStyle = "hsla(142 48% 34% / .7)";
      context.fill();
    });
    world.carcasses.forEach(function (carcass) {
      context.beginPath();
      context.arc(
        carcass.x,
        carcass.y,
        carrionDrawRadius(carcass),
        0,
        Math.PI * 2
      );
      context.fillStyle = "hsla(28 55% 38% / .7)";
      context.fill();
    });
  }

  function polygonPath(x, y, radius, sides, rotation) {
    context.beginPath();
    for (var side = 0; side < sides; side += 1) {
      var angle = rotation + (side / sides) * Math.PI * 2;
      var pointX = x + Math.cos(angle) * radius;
      var pointY = y + Math.sin(angle) * radius;
      if (side === 0) context.moveTo(pointX, pointY);
      else context.lineTo(pointX, pointY);
    }
    context.closePath();
  }

  function drawCreature(creature) {
    var genome = creature.genome;
    var radius = creatureBodyRadius(genome);
    var sides = creatureSides(genome);
    var selected = creature.id === selectedId;
    var formMarked =
      selectedFormKey && cladeKey(genome) === selectedFormKey;
    var style = dietStyle(genome);

    context.save();
    context.translate(creature.x, creature.y);
    context.rotate(creature.angle);

    polygonPath(0, 0, radius, sides, Math.PI / sides);
    context.fillStyle = selected
      ? "hsl(" + style.hue.toFixed(0) + ", 58%, 56%)"
      : style.fill;
    context.fill();
    if (formMarked) {
      context.lineWidth = selected ? 3.2 : 2.6;
      context.strokeStyle = "hsla(48, 96%, 62%, 0.95)";
    } else {
      context.lineWidth = selected ? 2.4 : 1.4;
      context.strokeStyle = selected ? "hsla(0, 0%, 92%, 0.9)" : style.stroke;
    }
    context.stroke();

    context.restore();
  }

  function render() {
    context.setTransform(
      Math.min(2, window.devicePixelRatio || 1),
      0,
      0,
      Math.min(2, window.devicePixelRatio || 1),
      0,
      0
    );
    context.clearRect(0, 0, viewportWidth, viewportHeight);
    context.save();
    context.translate(viewportWidth / 2, viewportHeight / 2);
    context.scale(camera.zoom, camera.zoom);
    context.translate(-camera.x, -camera.y);
    drawEnvironment();
    drawBlast();
    drawResources();
    world.creatures.forEach(drawCreature);
    context.restore();
  }

  function traitBar(label, value, text) {
    return (
      '<div class="gene-row"><span>' +
      label +
      '</span><i><b style="width:' +
      clamp(value * 100, 2, 100) +
      '%"></b></i><strong>' +
      text +
      "</strong></div>"
    );
  }

  function rankedForms() {
    var counts = new Map();
    var samples = new Map();
    world.creatures.forEach(function (creature) {
      var key = cladeKey(creature.genome);
      counts.set(key, (counts.get(key) || 0) + 1);
      if (!samples.has(key)) samples.set(key, creature.genome);
    });
    return Array.from(counts.entries())
      .map(function (entry) {
        var genome = samples.get(entry[0]);
        return {
          key: entry[0],
          count: entry[1],
          genome: genome,
          label: formParts(genome).binLabel
        };
      })
      .sort(function (a, b) {
        return b.count - a.count || a.key.localeCompare(b.key);
      });
  }

  function formPreview(genome) {
    var cell = 24;
    var canvas = document.createElement("canvas");
    canvas.width = cell;
    canvas.height = cell;
    var ctx = canvas.getContext("2d");
    var sides = creatureSides(genome);
    var worldRadius = creatureBodyRadius(genome);
    var minRadius = cell * 0.12;
    var maxRadius = cell * 0.45;
    var radius = clamp(worldRadius * (cell / 40), minRadius, maxRadius);
    var style = dietStyle(genome);
    var rotation = Math.PI / sides;
    ctx.clearRect(0, 0, cell, cell);
    ctx.translate(cell / 2, cell / 2);
    ctx.beginPath();
    for (var side = 0; side < sides; side += 1) {
      var angle = rotation + (side / sides) * Math.PI * 2;
      var x = Math.cos(angle) * radius;
      var y = Math.sin(angle) * radius;
      if (side === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = style.fill;
    ctx.fill();
    ctx.lineWidth = Math.max(0.8, radius * 0.12);
    ctx.strokeStyle = style.stroke;
    ctx.stroke();
    return (
      '<img class="form-preview" src="' +
      canvas.toDataURL("image/png") +
      '" width="' +
      cell +
      '" height="' +
      cell +
      '" alt="">'
    );
  }

  function updateInspector() {
    if (!world) {
      if (inspectorEyebrow) inspectorEyebrow.textContent = "Dominating forms";
      lastFormsSignature = "";
      inspector.innerHTML =
        "<h3>No world yet</h3><p>Start or reset the simulation to see which forms take over.</p>";
      return;
    }
    if (!selectedId) {
      if (inspectorEyebrow) inspectorEyebrow.textContent = "Dominating forms";
      var total = world.creatures.length;
      if (!total) {
        lastFormsSignature = "";
        inspector.innerHTML =
          "<h3>Extinct</h3><p>No creatures left. Try a new world.</p>";
        return;
      }
      var ranked = rankedForms();
      var top = ranked.slice(0, 10);
      var signature =
        String(selectedFormKey || "") +
        "|" +
        total +
        "|" +
        ranked.length +
        "|" +
        top
          .map(function (form) {
            return form.key + ":" + form.count;
          })
          .join(",");
      var existingList = inspector.querySelector(".form-rank-list");
      if (signature === lastFormsSignature && existingList) {
        existingList.querySelectorAll("[data-form-key]").forEach(function (row) {
          row.classList.toggle(
            "is-active",
            row.getAttribute("data-form-key") === selectedFormKey
          );
        });
        return;
      }
      var scrollTop = existingList ? existingList.scrollTop : 0;
      lastFormsSignature = signature;
      var rows = top
        .map(function (form, index) {
          var share = form.count / total;
          var active = form.key === selectedFormKey ? " is-active" : "";
          return (
            '<button type="button" class="form-rank' +
            active +
            '" data-form-key="' +
            form.key +
            '">' +
            '<span class="form-rank__index">' +
            (index + 1) +
            "</span>" +
            formPreview(form.genome) +
            '<div class="form-rank__body">' +
            "<strong>" +
            form.label +
            "</strong>" +
            '<i><b style="width:' +
            clamp(share * 100, 2, 100) +
            '%"></b></i>' +
            "</div>" +
            '<em class="form-rank__count">' +
            form.count +
            " · " +
            Math.round(share * 100) +
            "%</em>" +
            "</button>"
          );
        })
        .join("");
      inspector.innerHTML =
        "<h3>Top " +
        top.length +
        " of " +
        ranked.length +
        "</h3>" +
        '<p class="organism-action">By population share</p>' +
        '<div class="form-rank-list">' +
        rows +
        "</div>" +
        '<p class="genome-note">Click a form to outline matching creatures on the map. Click a creature to inspect it.</p>';
      var list = inspector.querySelector(".form-rank-list");
      if (list) list.scrollTop = scrollTop;
      return;
    }
    lastFormsSignature = "";
    selectedFormKey = null;
    if (inspectorEyebrow) inspectorEyebrow.textContent = "Selected organism";
    var creature = world.creatures.find(function (item) {
      return item.id === selectedId;
    });
    if (!creature) {
      selectedId = null;
      updateInspector();
      return;
    }
    var genome = creature.genome;
    var form = formParts(genome);
    var ageYears = creature.age / 365;
    var level = intelligenceLevel(genome);
    inspector.innerHTML =
      "<h3>Organism " +
      creature.id +
      "</h3>" +
      '<div class="organism-facts"><span>generation <strong>' +
      creature.generation +
      "</strong></span><span>age <strong>" +
      ageYears.toFixed(1) +
      "y</strong></span><span>form <strong>" +
      form.label +
      "</strong></span><span>parents <strong>" +
      (creature.parents.length ? creature.parents.join(" + ") : "founder") +
      "</strong></span></div>" +
      traitBar(
        "energy",
        creature.energy / creature.maximumEnergy,
        Math.max(0, creature.energy).toFixed(0) +
        " / " +
        creature.maximumEnergy.toFixed(0)
      ) +
      traitBar(
        "size",
        1 - 1 / (1 + genome.size),
        genome.size.toFixed(2)
      ) +
      traitBar(
        "speed",
        1 - 1 / (1 + genome.speed),
        genome.speed.toFixed(2)
      ) +
      traitBar("diet", genome.diet, genome.diet.toFixed(2)) +
      traitBar(
        "intel",
        1 - 1 / (1 + level),
        String(level)
      ) +
      '<p class="genome-note">Intel 0 = random walk; 1 = heading 2×2 + random; ≥2 adds radial vision cells (green→high / red→low color + 1/(1+d²) brightness). Diet 0 plants only; diet 1 meat only. Higher diet eats lower on contact.</p>';
  }

  function updateLabels() {
    populationLabel.textContent = String(world.creatures.length);
    var forms = new Set(
      world.creatures.map(function (creature) {
        return cladeKey(creature.genome);
      })
    );
    speciesLabel.textContent = String(forms.size);
    var maximumGeneration = world.creatures.reduce(function (maximum, creature) {
      return Math.max(maximum, creature.generation);
    }, 0);
    generationLabel.textContent = String(maximumGeneration);
    yearLabel.textContent = (world.days / 365).toFixed(1);
    updateInspector();
  }

  function frame(time) {
    if (!active || userPaused) {
      frameId = null;
      render();
      updateLabels();
      return;
    }
    if (!previousTime) previousTime = time;
    accumulator += Math.min(0.12, (time - previousTime) / 1000) * speed;
    previousTime = time;
    var steps = 0;
    while (accumulator >= fixedStep && steps < 10) {
      updateWorld(fixedStep);
      accumulator -= fixedStep;
      steps += 1;
    }
    render();
    if (Math.floor(time / 250) !== Math.floor((time - 16) / 250)) updateLabels();
    frameId = requestAnimationFrame(frame);
  }

  function formatParamValue(def, value) {
    if (def.step < 0.001) return value.toFixed(4);
    if (def.step < 0.01) return value.toFixed(3);
    if (def.step < 1) return value.toFixed(2);
    return String(Math.round(value));
  }

  function buildParamsPanel() {
    if (!paramsRoot) return;
    var groups = [];
    var groupMap = {};
    PARAM_DEFS.forEach(function (def) {
      if (!groupMap[def.group]) {
        groupMap[def.group] = [];
        groups.push(def.group);
      }
      groupMap[def.group].push(def);
    });

    paramsRoot.innerHTML =
      '<div class="life-params__header">' +
      "<h3>Simulation controls</h3>" +
      '<p>Live tunables — most apply immediately. Map size, starts, and founders need New world.</p>' +
      '<button class="sim-button" type="button" id="life-params-reset">Reset defaults</button>' +
      "</div>" +
      groups
        .map(function (group) {
          return (
            '<fieldset class="life-params__group">' +
            "<legend>" +
            group +
            "</legend>" +
            '<div class="life-params__grid">' +
            groupMap[group]
              .map(function (def) {
                return (
                  '<label class="life-param" for="life-param-' +
                  def.key +
                  '">' +
                  "<span>" +
                  def.label +
                  '</span><em data-life-param-value="' +
                  def.key +
                  '">' +
                  formatParamValue(def, params[def.key]) +
                  "</em>" +
                  '<input id="life-param-' +
                  def.key +
                  '" type="range" min="' +
                  def.min +
                  '" max="' +
                  def.max +
                  '" step="' +
                  def.step +
                  '" value="' +
                  params[def.key] +
                  '" data-life-param="' +
                  def.key +
                  '">' +
                  "</label>"
                );
              })
              .join("") +
            "</div></fieldset>"
          );
        })
        .join("");

    paramsRoot.querySelectorAll("[data-life-param]").forEach(function (input) {
      input.addEventListener("input", function () {
        var key = input.getAttribute("data-life-param");
        var def = PARAM_DEFS.find(function (item) {
          return item.key === key;
        });
        var value = Number(input.value);
        params[key] = value;
        var valueLabel = paramsRoot.querySelector(
          '[data-life-param-value="' + key + '"]'
        );
        if (valueLabel && def) {
          valueLabel.textContent = formatParamValue(def, value);
        }
        if (key === "dietBins" || key === "sizeBins") updateLabels();
        if (
          world &&
          (key === "doomsdayInterval" || key === "doomsdayWarn")
        ) {
          var intervalDays = Math.max(365, params.doomsdayInterval * 365);
          world.warning = null;
          world.nextDoomsdayDay = world.days + intervalDays;
        }
      });
    });

    var resetParams = document.getElementById("life-params-reset");
    if (resetParams) {
      resetParams.addEventListener("click", function () {
        PARAM_DEFS.forEach(function (def) {
          params[def.key] = def.value;
          var input = document.getElementById("life-param-" + def.key);
          if (input) input.value = String(def.value);
          var valueLabel = paramsRoot.querySelector(
            '[data-life-param-value="' + def.key + '"]'
          );
          if (valueLabel) {
            valueLabel.textContent = formatParamValue(def, def.value);
          }
        });
        updateLabels();
      });
    }
  }

  function startLoop() {
    if (!active || userPaused || frameId) return;
    previousTime = 0;
    frameId = requestAnimationFrame(frame);
  }

  function stopLoop() {
    if (frameId) cancelAnimationFrame(frameId);
    frameId = null;
    previousTime = 0;
  }

  function setActive(nextActive) {
    active = nextActive;
    if (active) {
      render();
      updateLabels();
      startLoop();
    } else {
      stopLoop();
    }
  }

  function minCameraZoom() {
    return Math.max(viewportWidth / width, viewportHeight / height);
  }

  function clampCamera() {
    var minimumZoom = minCameraZoom();
    if (camera.zoom < minimumZoom) camera.zoom = minimumZoom;
    var halfWidth = viewportWidth / (camera.zoom * 2);
    var halfHeight = viewportHeight / (camera.zoom * 2);
    camera.x = clamp(camera.x, halfWidth, width - halfWidth);
    camera.y = clamp(camera.y, halfHeight, height - halfHeight);
  }

  function screenToWorld(clientX, clientY) {
    var bounds = canvas.getBoundingClientRect();
    var screenX = ((clientX - bounds.left) / bounds.width) * viewportWidth;
    var screenY = ((clientY - bounds.top) / bounds.height) * viewportHeight;
    return {
      x: camera.x + (screenX - viewportWidth / 2) / camera.zoom,
      y: camera.y + (screenY - viewportHeight / 2) / camera.zoom,
      screenX: screenX,
      screenY: screenY
    };
  }

  function setZoom(nextZoom, clientX, clientY) {
    var before =
      Number.isFinite(clientX) && Number.isFinite(clientY)
        ? screenToWorld(clientX, clientY)
        : null;
    camera.zoom = clamp(nextZoom, minCameraZoom(), 3.2);
    if (before) {
      camera.x = before.x - (before.screenX - viewportWidth / 2) / camera.zoom;
      camera.y = before.y - (before.screenY - viewportHeight / 2) / camera.zoom;
    }
    clampCamera();
    render();
  }

  function fitWorld() {
    camera.x = width / 2;
    camera.y = height / 2;
    camera.zoom = minCameraZoom();
    clampCamera();
    render();
  }

  function resizeCanvas() {
    var ratio = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = viewportWidth * ratio;
    canvas.height = viewportHeight * ratio;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    render();
  }

  toggleButton.addEventListener("click", function () {
    userPaused = !userPaused;
    toggleButton.textContent = userPaused ? "Resume" : "Pause";
    toggleButton.classList.toggle("is-active", userPaused);
    if (userPaused) {
      stopLoop();
      render();
      updateLabels();
    } else {
      startLoop();
    }
  });

  document.querySelectorAll("[data-life-speed]").forEach(function (button) {
    button.addEventListener("click", function () {
      speed = Number(button.getAttribute("data-life-speed"));
      document.querySelectorAll("[data-life-speed]").forEach(function (item) {
        item.classList.toggle("is-active", item === button);
      });
    });
  });

  resetButton.addEventListener("click", function () {
    makeWorld((Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0);
    render();
    updateLabels();
  });

  if (topologySelect) {
    topologySelect.addEventListener("change", function () {
      currentTopology = topologySelect.value;
      makeWorld((Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0);
      render();
      updateLabels();
    });
  }

  zoomInButton.addEventListener("click", function () {
    setZoom(camera.zoom * 1.25);
  });

  zoomOutButton.addEventListener("click", function () {
    setZoom(camera.zoom / 1.25);
  });

  fitButton.addEventListener("click", fitWorld);

  canvas.addEventListener(
    "wheel",
    function (event) {
      event.preventDefault();
      setZoom(
        camera.zoom * Math.exp(-event.deltaY * 0.0012),
        event.clientX,
        event.clientY
      );
    },
    { passive: false }
  );

  canvas.addEventListener("pointerdown", function (event) {
    drag = {
      clientX: event.clientX,
      clientY: event.clientY,
      cameraX: camera.x,
      cameraY: camera.y,
      moved: false
    };
    canvas.setPointerCapture(event.pointerId);
  });

  canvas.addEventListener("pointermove", function (event) {
    if (!drag) return;
    var bounds = canvas.getBoundingClientRect();
    var deltaX =
      ((event.clientX - drag.clientX) / bounds.width) *
      viewportWidth /
      camera.zoom;
    var deltaY =
      ((event.clientY - drag.clientY) / bounds.height) *
      viewportHeight /
      camera.zoom;
    drag.moved = drag.moved || Math.abs(deltaX) + Math.abs(deltaY) > 3;
    camera.x = drag.cameraX - deltaX;
    camera.y = drag.cameraY - deltaY;
    clampCamera();
    render();
  });

  canvas.addEventListener("pointerup", function (event) {
    if (drag && drag.moved) canvas.dataset.dragged = "true";
    drag = null;
    canvas.releasePointerCapture(event.pointerId);
  });

  canvas.addEventListener("click", function (event) {
    if (canvas.dataset.dragged === "true") {
      delete canvas.dataset.dragged;
      return;
    }
    var point = screenToWorld(event.clientX, event.clientY);
    var nearest = null;
    world.creatures.forEach(function (creature) {
      if (!pointHitsCreature(point, creature)) return;
      if (
        !nearest ||
        distanceSquared(point, creature) < distanceSquared(point, nearest)
      ) {
        nearest = creature;
      }
    });
    selectedId = nearest ? nearest.id : null;
    if (selectedId) selectedFormKey = null;
    lastFormsSignature = "";
    updateInspector();
    render();
  });

  inspector.addEventListener("click", function (event) {
    var row = event.target.closest("[data-form-key]");
    if (!row || !inspector.contains(row)) return;
    var key = row.getAttribute("data-form-key");
    selectedFormKey = selectedFormKey === key ? null : key;
    selectedId = null;
    lastFormsSignature = "";
    updateInspector();
    render();
  });

  window.addEventListener("resize", resizeCanvas, { passive: true });
  buildParamsPanel();
  makeWorld((Date.now() ^ 0x51f15e) >>> 0);
  resizeCanvas();
  toggleButton.textContent = userPaused ? "Start" : "Pause";
  window.LittleLife = { setActive: setActive };
  if (active) setActive(true);
})();
