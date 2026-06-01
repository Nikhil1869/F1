

(function () {
    "use strict";

    var canvas = document.getElementById("trackCanvas");
    var ctx = canvas.getContext("2d");
    var sessionModal = document.getElementById("sessionModal");
    var sessionList = document.getElementById("sessionList");
    var yearSelect = document.getElementById("yearSelect");
    var replayContainer = document.getElementById("replayContainer");
    var eventTitle = document.getElementById("eventTitle");
    var currentLapEl = document.getElementById("currentLap");
    var playbackSpeedEl = document.getElementById("playbackSpeed");
    var leaderboardList = document.getElementById("leaderboardList");
    var insightsContent = document.getElementById("insightsContent");
    var progressFill = document.getElementById("progressFill");
    var progressThumb = document.getElementById("progressThumb");
    var progressBar = document.getElementById("progressBar");
    var progressBarContainer = document.getElementById("progressBarContainer");
    var progressLapEnd = document.getElementById("progressLapEnd");
    var scBanner = document.getElementById("scBanner");
    var scText = document.getElementById("scText");
    var legendOverlay = document.getElementById("legendOverlay");
    var loadingOverlay = document.getElementById("loadingOverlay");
    var loadingText = document.getElementById("loadingText");
    var speedLabel = document.getElementById("speedLabel");
    var playIcon = document.getElementById("playIcon");
    var pauseIcon = document.getElementById("pauseIcon");

    var raceData = null;
    var currentFrame = 0;
    var isPlaying = false;
    var speed = 1.0;
    var speeds = [0.5, 1.0, 2.0, 4.0];
    var speedIndex = 1;
    var showDRS = true;
    var showProgressBar = true;
    var showDriverNames = true;
    var hoveredDriver = null;
    var showTelemetry = false;
    var selectedDrivers = new Set();
    var animationId = null;
    var lastTimestamp = 0;
    var frameAccumulator = 0;
    var frameInterval = 500; 
    var telemetryChart = null;

    var trackBounds = { minX: 0, maxX: 1, minY: 0, maxY: 1 };
    var trackScale = 1;
    var trackOffsetX = 0;
    var trackOffsetY = 0;
    var canvasW = 0;
    var canvasH = 0;

    var driverCurrentPos = {};
    var driverTargetPos = {};

    var worker = null;
    var activeReplayRequest = 0;
    var telemetryLoadDone = false;
    var telemetryTotalChunks = 0;
    var telemetryLoadedChunks = 0;
    var replayStarted = false;

    var TYRE_COLORS = {
        SOFT: "#FF3333",
        MEDIUM: "#FFC906",
        HARD: "#EBEBEB",
        INTERMEDIATE: "#39B54A",
        WET: "#00AEEF",
        UNKNOWN: "#888888",
    };

    function init() {
        if (!worker && window.Worker && canvas.transferControlToOffscreen) {
            worker = new Worker("/static/js/replay_worker.js");
            worker.onerror = function (err) {
                console.error("Replay worker failed", err);
            };
            var offscreen = canvas.transferControlToOffscreen();
            worker.postMessage({ type: "init_canvas", canvas: offscreen }, [offscreen]);
        }
        loadSessions(yearSelect.value);
        yearSelect.addEventListener("change", function () {
            var context = this, args = arguments;
            clearTimeout(this.debounceTimer);
            this.debounceTimer = setTimeout(function() {
                loadSessions(yearSelect.value);
            }, 300);
        });
        setupControls();
        setupKeyboard();
        resizeCanvas();
        window.addEventListener("resize", resizeCanvas);
    }

    function showLoader(text) {
        loadingText.textContent = text || "Loading...";
        loadingOverlay.classList.add("show");
    }

    function fetchJSON(url, timeoutMs) {
        var controller = new AbortController();
        var timeout = setTimeout(function () {
            controller.abort();
        }, timeoutMs || 30000);

        return fetch(url, { signal: controller.signal })
            .then(function (res) {
                return res.json().then(function (data) {
                    return { ok: res.ok, status: res.status, data: data };
                });
            })
            .finally(function () {
                clearTimeout(timeout);
            });
    }

    function showActionLoader(text, buttonText, onClick) {
        loadingText.innerHTML =
            '<span>' + text + '</span><br><br>' +
            '<button id="btnReplayAction" class="btn-primary" type="button">' + buttonText + '</button>';
        loadingOverlay.classList.add("show");

        var btn = document.getElementById("btnReplayAction");
        if (btn) {
            btn.addEventListener("click", onClick);
        }
    }

    function showStartReplayLoader(text) {
        showActionLoader(text, "Start Replay", function () {
            replayStarted = true;
            hideLoader();
            play();
        });
    }

    function updateTelemetryLoader(chunkIndex, totalChunks) {
        var current = Math.min(chunkIndex + 1, totalChunks || chunkIndex + 1);
        var total = totalChunks || "?";
        var message = "Loading telemetry chunk " + current + "/" + total + "...";

        if (replayStarted || !loadingOverlay.classList.contains("show")) {
            return;
        }

        if (raceData && raceData.frames && raceData.frames.length > 0) {
            showStartReplayLoader(message);
        } else {
            showLoader(message);
        }
    }

    function hideLoader() {
        loadingOverlay.classList.remove("show");
    }

    function loadSessions(year) {
        sessionList.innerHTML =
            '<div class="session-loading"><div class="spinner"></div><p>Loading race calendar...</p></div>';

        fetch("/api/replay/sessions?year=" + year)
            .then(function (res) { return res.json(); })
            .then(function (data) {
                if (data.error) {
                    sessionList.innerHTML = '<p style="color:var(--f1-red);padding:20px;">Error: ' + data.error + '</p>';
                    return;
                }
                renderSessionList(data.events, year);
            })
            .catch(function (err) {
                sessionList.innerHTML = '<p style="color:var(--f1-red);padding:20px;">Failed to load sessions</p>';
            });
    }

    function renderSessionList(events, year) {
        var html = "";
        for (var i = 0; i < events.length; i++) {
            var ev = events[i];
            html +=
                '<div class="session-item" data-round="' + ev.round + '" data-year="' + year + '">' +
                    '<div class="session-item-info">' +
                        '<span class="session-round">R' + ev.round + '</span>' +
                        '<div>' +
                            '<div class="session-name">' + ev.name + '</div>' +
                            '<div class="session-country">' + ev.country + '</div>' +
                        '</div>' +
                    '</div>' +
                    '<span class="session-date">' + (ev.date || "") + '</span>' +
                '</div>';
        }
        sessionList.innerHTML = html;

        sessionList.querySelectorAll(".session-item").forEach(function (item) {
            item.addEventListener("click", function () {
                var round = parseInt(item.dataset.round);
                var yr = parseInt(item.dataset.year);
                startReplay(yr, round);
            });
        });
    }

    function startReplay(year, round) {
        var requestId = ++activeReplayRequest;
        pause();
        replayStarted = false;
        telemetryLoadDone = false;
        telemetryTotalChunks = 0;
        telemetryLoadedChunks = 0;
        currentFrame = 0;

        sessionModal.style.display = "none";
        showLoader("Loading session data...");

        fetchJSON("/api/replay/basic?year=" + year + "&round=" + round + "&session=R", 15000)
            .then(function (result) {
                if (requestId !== activeReplayRequest) return;
                var basicData = result.data || {};
                if (basicData.error) {
                    alert("Could not load session data: " + basicData.error);
                    sessionModal.style.display = "";
                    hideLoader();
                    return;
                }

                raceData = basicData;
                raceData.frames = [];
                raceData.totalFrames = 0;
                replayContainer.style.display = "";
                eventTitle.textContent = raceData.eventName + " " + raceData.year;
                currentLapEl.textContent = "-/" + (raceData.sessionInfo.totalLaps || "-");
                leaderboardList.innerHTML = "";
                insightsContent.innerHTML =
                    '<div class="insights-placeholder">' +
                        '<div class="placeholder-icon">...</div>' +
                        '<p>Load full telemetry to start replay analysis</p>' +
                    '</div>';

                showActionLoader("Session data ready.", "Load Full Telemetry", function () {
                    showLoader("Fetching detailed telemetry...");
                    loadTelemetryChunk(year, round, 0, requestId);
                });
            })
            .catch(function (err) {
                if (requestId !== activeReplayRequest) return;
                var msg = err.name === "AbortError"
                    ? "Session data request timed out. Please check your connection and try again."
                    : "Failed to load session data: " + err.message;
                alert(msg);
                sessionModal.style.display = "";
                hideLoader();
            });
    }

    function loadTelemetryChunk(year, round, chunkIndex, requestId) {
        if (requestId !== activeReplayRequest) return;

        updateTelemetryLoader(chunkIndex, telemetryTotalChunks);

        fetchJSON("/api/replay/telemetry?year=" + year + "&round=" + round + "&session=R&chunk=" + chunkIndex, 30000)
            .then(function (result) {
                if (requestId !== activeReplayRequest) return;
                var chunkData = result.data || {};

                if (result.status === 202 || chunkData.status === "queued" || chunkData.status === "running") {
                    showLoader(chunkData.message || "Fetching detailed telemetry...");
                    setTimeout(function () {
                        loadTelemetryChunk(year, round, chunkIndex, requestId);
                    }, chunkData.retryAfterMs || 2500);
                    return;
                }

                if (!result.ok || chunkData.error) {
                    alert(chunkData.message || ("Error loading telemetry: " + (chunkData.error || result.status)));
                    if (chunkIndex === 0) {
                        sessionModal.style.display = "";
                        hideLoader();
                    }
                    return;
                }

                telemetryTotalChunks = chunkData.totalChunks || telemetryTotalChunks || 1;
                telemetryLoadedChunks = Math.max(telemetryLoadedChunks, chunkIndex + 1);
                updateTelemetryLoader(chunkIndex, telemetryTotalChunks);

                if (chunkIndex === 0) {
                    raceData.track = chunkData.track;
                    raceData.drsZones = chunkData.drsZones;
                    raceData.drivers = chunkData.drivers;
                    raceData.sessionInfo = chunkData.sessionInfo;
                    raceData.totalLaps = chunkData.totalLaps;
                    raceData.totalFrames = chunkData.totalFrames || (chunkData.frames || []).length;
                    raceData.dt = chunkData.dt;
                    raceData.sampleRate = chunkData.sampleRate;
                    raceData.raceControlMessages = chunkData.raceControlMessages || [];
                    raceData.frames = chunkData.frames || [];

                    initReplay();
                    showStartReplayLoader("Loading telemetry chunk 1/" + telemetryTotalChunks + "...");
                } else {
                    raceData.frames = raceData.frames.concat(chunkData.frames || []);
                    if (worker) {
                        worker.postMessage({ type: "append_frames", frames: chunkData.frames || [] });
                    }
                    updateUI();
                    renderFrame();
                }

                if (chunkData.hasMore || chunkIndex + 1 < telemetryTotalChunks) {
                    setTimeout(function () {
                        loadTelemetryChunk(year, round, chunkIndex + 1, requestId);
                    }, 0);
                } else {
                    telemetryLoadDone = true;
                    if (!replayStarted && loadingOverlay.classList.contains("show")) {
                        showStartReplayLoader("Replay ready. " + telemetryTotalChunks + "/" + telemetryTotalChunks + " chunks loaded.");
                    }
                }
            })
            .catch(function (err) {
                console.error("Failed to load chunk " + chunkIndex, err);
                if (requestId !== activeReplayRequest) return;
                if (chunkIndex === 0) {
                    var msg = err.name === "AbortError"
                        ? "Detailed telemetry is taking too long to respond. The server may still be preparing it; please try again in a moment."
                        : "Failed to prepare replay: " + err.message;
                    alert(msg);
                    sessionModal.style.display = "";
                    hideLoader();
                }
            });
    }

    function initReplay() {
        replayContainer.style.display = "";
        eventTitle.textContent = raceData.eventName + " " + raceData.year;
        progressLapEnd.textContent = "Lap " + raceData.totalLaps;

        currentFrame = 0;
        isPlaying = false;
        selectedDrivers.clear();
        lastInsightDrivers = "";
        driverCurrentPos = {};
        driverTargetPos = {};

        computeTrackBounds();

        if (worker) {
            worker.postMessage({ type: "init_data", raceData: raceData });
        }

        resizeCanvas();
        updatePlayPauseIcon();

        // Setup Session Banner
        if (raceData.sessionInfo) {
            document.getElementById("sessionBanner").style.display = "flex";
            document.getElementById("bannerCountry").textContent = raceData.sessionInfo.country || "";
            document.getElementById("bannerEvent").textContent = raceData.sessionInfo.eventName || "";
            document.getElementById("bannerYear").textContent = raceData.sessionInfo.year || "";
            let d = raceData.sessionInfo.date;
            document.getElementById("bannerDate").textContent = d ? d.split(" ")[0] : "";
            document.getElementById("bannerLength").textContent = ((raceData.sessionInfo.circuitLength || 0) / 1000).toFixed(2) + " km";
        }
        
        // Setup Weather Widget
        if (raceData.frames && raceData.frames.length > 0 && raceData.frames[0].weather) {
            document.getElementById("weatherWidget").style.display = "block";
        } else {
            document.getElementById("weatherWidget").style.display = "none";
        }
        
        // Clear Race Control Feed
        document.getElementById("raceControlFeed").innerHTML = '<div class="rc-placeholder">Waiting for messages...</div>';

        updateLeaderboard();

        var driverSelect = document.getElementById("driverSelectorDropdown");
        if (driverSelect) {
            driverSelect.innerHTML = '<option value="">Driver...</option>';
            Object.keys(raceData.drivers).sort().forEach(function(drv) {
                driverSelect.innerHTML += '<option value="' + drv + '">' + drv + '</option>';
            });
        }

        var lapSelect = document.getElementById("lapSelector");
        if (lapSelect) {
            lapSelect.innerHTML = '<option value="">Lap 1</option>';
            for(var i=2; i<=raceData.totalLaps; i++) {
                lapSelect.innerHTML += '<option value="' + i + '">Lap ' + i + '</option>';
            }
        }

        frameInterval = (raceData.dt || 0.5) * 1000;

        renderFrame();
        updateUI();
    }

    function computeTrackBounds() {
        if (!raceData || !raceData.track || raceData.track.length === 0) return;

        var xs = raceData.track.map(function (p) { return p[0]; });
        var ys = raceData.track.map(function (p) { return p[1]; });

        trackBounds.minX = Math.min.apply(null, xs);
        trackBounds.maxX = Math.max.apply(null, xs);
        trackBounds.minY = Math.min.apply(null, ys);
        trackBounds.maxY = Math.max.apply(null, ys);
    }

    function resizeCanvas() {
        var rect = canvas.parentElement.getBoundingClientRect();
        var dpr = window.devicePixelRatio || 1;
        canvasW = rect.width;
        canvasH = rect.height - 100; 
        if (canvasH < 200) canvasH = 200;

        if (worker) {
            worker.postMessage({ type: "resize", w: canvasW, h: canvasH, dpr: dpr });
        } else {
            canvas.width = canvasW * dpr;
            canvas.height = canvasH * dpr;
            canvas.style.width = canvasW + "px";
            canvas.style.height = canvasH + "px";
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            updateTrackTransform();
        }

        if (raceData) renderFrame();
    }

    function updateTrackTransform() {
        var tw = trackBounds.maxX - trackBounds.minX || 1;
        var th = trackBounds.maxY - trackBounds.minY || 1;
        var padding = 60;

        var scaleX = (canvasW - padding * 2) / tw;
        var scaleY = (canvasH - padding * 2) / th;
        trackScale = Math.min(scaleX, scaleY);

        trackOffsetX = (canvasW - tw * trackScale) / 2 - trackBounds.minX * trackScale;
        trackOffsetY = (canvasH - th * trackScale) / 2 - trackBounds.minY * trackScale;
    }

    function worldToCanvas(wx, wy) {
        return {
            x: wx * trackScale + trackOffsetX,
            y: wy * trackScale + trackOffsetY,
        };
    }

    function renderFrame() {
        if (worker) {
            worker.postMessage({
                type: "render",
                frame: currentFrame,
                selectedDrivers: Array.from(selectedDrivers),
                hoveredDriver: hoveredDriver,
                showDRS: showDRS,
                showDriverNames: showDriverNames,
                showTelemetry: showTelemetry
            });
        }
    }

    function updateLeaderboard() {
        if (!raceData || !raceData.frames || currentFrame >= raceData.frames.length) return;
        var frame = raceData.frames[currentFrame];
        if (!frame || !frame.drivers) return;

        var entries = [];
        for (var drv in raceData.drivers) {
            var info = raceData.drivers[drv];
            var frameData = frame.drivers[drv] || {};
            entries.push({
                abbr: drv,
                position: frameData.position || info.position || 99,
                team: info.team || "Unknown",
                teamColor: info.teamColor || "#FFF",
                compound: frameData.compound || "UNKNOWN",
                tyreLife: frameData.tyreLife || 0,
                isOut: frameData.isOut || info.isRetired || false,
                speed: frameData.speed || 0,
                gear: frameData.gear || 0,
                drs: frameData.drs || 0,
                lapNumber: frameData.lapNumber || 0,
            });
        }

        entries.sort(function (a, b) { return a.position - b.position; });

        var html = "";
        for (var i = 0; i < entries.length; i++) {
            var e = entries[i];
            var posClass = e.position === 1 ? "p1" : e.position === 2 ? "p2" : e.position === 3 ? "p3" : "";
            var selClass = selectedDrivers.has(e.abbr) ? "selected" : "";
            var outClass = e.isOut ? "is-out" : "";
            var tyreColor = TYRE_COLORS[e.compound] || TYRE_COLORS.UNKNOWN;

            html +=
                '<div class="lb-driver ' + selClass + ' ' + outClass + '" data-driver="' + e.abbr + '">' +
                    '<span class="lb-pos ' + posClass + '">' + (e.isOut ? "" : e.position) + '</span>' +
                    '<div class="lb-color-bar" style="background:' + e.teamColor + '"></div>' +
                    '<div class="lb-info">' +
                        '<div class="lb-name">' + e.abbr + '</div>' +
                        '<div class="lb-team">' + e.team + '</div>' +
                    '</div>' +
                    '<div class="lb-tyre-info" style="display:flex; flex-direction:column; align-items:center; min-width: 25px;">' +
                        '<div class="lb-tyre" style="background:' + tyreColor + '; margin-bottom: 2px;" title="' + e.compound + '"></div>' +
                        '<div class="lb-tyre-life" style="font-size: 0.65rem; color: #888; font-family: \'JetBrains Mono\', monospace;" title="Tyre Life Laps">L' + e.tyreLife + '</div>' +
                    '</div>' +
                    (e.isOut ? '<span class="lb-out-badge">OUT</span>' : '') +
                '</div>';
        }

        leaderboardList.innerHTML = html;

        leaderboardList.querySelectorAll(".lb-driver").forEach(function (el) {
            el.addEventListener("click", function (ev) {
                var drv = el.dataset.driver;
                if (ev.shiftKey) {

                    if (selectedDrivers.has(drv)) {
                        selectedDrivers.delete(drv);
                    } else {
                        selectedDrivers.add(drv);
                    }
                } else {

                    if (selectedDrivers.has(drv) && selectedDrivers.size === 1) {
                        selectedDrivers.clear();
                    } else {
                        selectedDrivers.clear();
                        selectedDrivers.add(drv);
                    }
                }
                updateLeaderboard();
                updateInsights();
                renderFrame();
            });
        });
    }

    var lastInsightDrivers = "";

    function updateInsights() {
        var currentDriversStr = Array.from(selectedDrivers).sort().join(",");
        var isDOMStructureSame = (lastInsightDrivers === currentDriversStr) && (currentDriversStr !== "");

        if (selectedDrivers.size === 0) {
            if (lastInsightDrivers !== "") {
                insightsContent.innerHTML =
                    '<div class="insights-placeholder">' +
                        '<div class="placeholder-icon">🏎️</div>' +
                        '<p>Select a driver from the leaderboard to view telemetry</p>' +
                    '</div>';
                lastInsightDrivers = "";
                if (telemetryChart) {
                    telemetryChart.destroy();
                    telemetryChart = null;
                }
            }
            return;
        }

        var frame = raceData.frames[currentFrame];

        // Only rebuild HTML if the selected drivers have changed
        if (!isDOMStructureSame) {
            var html = "";
            selectedDrivers.forEach(function (drv) {
                var info = raceData.drivers[drv];
                if (!info) return;

                html +=
                    '<div class="insight-driver-card" data-driver="' + drv + '">' +
                        '<div class="insight-driver-header">' +
                            '<div class="insight-team-color" style="background:' + (info.teamColor || '#fff') + '"></div>' +
                            '<div>' +
                                '<div class="insight-driver-name">' + drv + '</div>' +
                                '<div class="insight-driver-team">' + (info.team || "") + '</div>' +
                            '</div>' +
                        '</div>' +
                        '<div class="insight-stats">' +
                            '<div class="insight-stat">' +
                                '<div class="insight-stat-label">Speed</div>' +
                                '<div class="insight-stat-value js-speed-val"><span class="val">—</span><small> km/h</small></div>' +
                            '</div>' +
                            '<div class="insight-stat">' +
                                '<div class="insight-stat-label">Gear</div>' +
                                '<div class="insight-stat-value js-gear-val">—</div>' +
                            '</div>' +
                            '<div class="insight-stat">' +
                                '<div class="insight-stat-label">DRS</div>' +
                                '<div class="insight-stat-value js-drs-val">CLOSED</div>' +
                            '</div>' +
                        '</div>' +
                        ((selectedDrivers.size === 1) ? 
                        '<div class="insight-chart-container" style="margin-top:10px; height:200px; position:relative;"><canvas id="telemetryChartCanvas"></canvas></div>' : 
                        '<div class="insight-telemetry-bars">' +
                            '<div class="telemetry-bar-wrapper">' +
                                '<div class="telemetry-bar-label">THR</div>' +
                                '<div class="telemetry-bar-bg"><div class="telemetry-bar-fill js-throttle-fill" style="width:0%;"></div></div>' +
                            '</div>' +
                            '<div class="telemetry-bar-wrapper">' +
                                '<div class="telemetry-bar-label">BRK</div>' +
                                '<div class="telemetry-bar-bg"><div class="telemetry-bar-fill js-brake-fill" style="width:0%;"></div></div>' +
                            '</div>' +
                        '</div>') +
                        '<div class="insight-telemetry js-tyre-info">' +
                            '<h4 class="js-tyre-h4">TYRE: UNKNOWN</h4>' +
                            '<div style="display:flex;align-items:center;gap:8px;">' +
                                '<div class="lb-tyre js-tyre-color" style="background:var(--text-secondary);width:18px;height:18px;"></div>' +
                                '<span class="js-tyre-span" style="font-size:0.8rem;color:var(--text-secondary);">UNKNOWN | Health: 100%</span>' +
                            '</div>' +
                        '</div>' +
                    '</div>';
            });
            insightsContent.innerHTML = html;
            lastInsightDrivers = currentDriversStr;

            if (telemetryChart) {
                telemetryChart.destroy();
                telemetryChart = null;
            }
        }

        // Efficiently update values inside existing DOM nodes
        selectedDrivers.forEach(function (drv) {
            var data = frame ? frame.drivers[drv] : null;
            var card = insightsContent.querySelector('.insight-driver-card[data-driver="' + drv + '"]');
            if (!data || !card) return;

            var speedVal = data.speed !== undefined ? Math.round(data.speed) : "—";
            var gearVal = data.gear !== undefined ? data.gear : "—";
            var drsVal = data.drs !== undefined ? data.drs : 0;
            var throttleVal = data.throttle !== undefined ? data.throttle : 0;
            var brakeVal = data.brake !== undefined ? data.brake : 0;

            var drsLabel = drsVal > 8 ? "OPEN" : "CLOSED"; 
            var drsClass = drsVal > 8 ? "drs-active" : "drs-inactive";
            var compound = data.compound || "UNKNOWN";
            var tyreHealth = data.tyreHealth || 100;
            var tyreColor = TYRE_COLORS[compound] || TYRE_COLORS.UNKNOWN;

            var throttlePct = Math.min(100, Math.max(0, throttleVal));
            var brakePct = Math.min(100, Math.max(0, brakeVal));

            card.querySelector('.js-speed-val .val').textContent = speedVal;
            card.querySelector('.js-gear-val').textContent = gearVal;
            
            var drsEl = card.querySelector('.js-drs-val');
            drsEl.textContent = drsLabel;
            drsEl.className = 'insight-stat-value js-drs-val ' + drsClass;

            if (selectedDrivers.size > 1) {
                card.querySelector('.js-throttle-fill').style.width = throttlePct + '%';
                card.querySelector('.js-brake-fill').style.width = brakePct + '%';
            }

            card.querySelector('.js-tyre-h4').textContent = 'TYRE: ' + compound;
            card.querySelector('.js-tyre-color').style.background = tyreColor;
            card.querySelector('.js-tyre-span').textContent = compound + ' | Health: ' + tyreHealth + '%';
        });

        if (selectedDrivers.size === 1) {
            renderTelemetryChart(Array.from(selectedDrivers)[0]);
        }
    }

    function renderTelemetryChart(drv) {
        var canvas = document.getElementById("telemetryChartCanvas");
        if (!canvas) return;

        var frame = raceData.frames[currentFrame];
        var currentT = frame.t;
        var startT = Math.max(0, currentT - 30);
        
        var labels = [];
        var dataSpeed = [];
        var dataGear = [];
        var dataThrottle = [];
        var dataBrake = [];
        
        // Find start index approximately (assuming 0.5s intervals)
        var startIdx = Math.max(0, currentFrame - 60);
        
        for (var i = startIdx; i <= currentFrame; i++) {
            var f = raceData.frames[i];
            if (f.t < startT) continue;
            var d = f.drivers[drv];
            if (!d) continue;
            labels.push(f.t.toFixed(1));
            dataSpeed.push(d.speed);
            dataGear.push(d.gear * 30); // scale gear for visualization
            dataThrottle.push(d.throttle);
            dataBrake.push(d.brake);
        }

        if (!telemetryChart) {
            Chart.defaults.color = 'rgba(255, 255, 255, 0.7)';
            Chart.defaults.font.family = "'JetBrains Mono', monospace";
            telemetryChart = new Chart(canvas, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [
                        { label: 'Speed', data: dataSpeed, borderColor: '#fff', borderWidth: 2, pointRadius: 0, tension: 0.1, yAxisID: 'y' },
                        { label: 'Gear (*30)', data: dataGear, borderColor: '#555', borderWidth: 1, pointRadius: 0, stepline: true, yAxisID: 'y' },
                        { label: 'Throttle', data: dataThrottle, borderColor: '#2ecc71', borderWidth: 1.5, pointRadius: 0, tension: 0.1, yAxisID: 'y1' },
                        { label: 'Brake', data: dataBrake, borderColor: '#e74c3c', borderWidth: 1.5, pointRadius: 0, tension: 0.1, yAxisID: 'y1' }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    animation: false,
                    interaction: { mode: 'index', intersect: false },
                    plugins: { legend: { display: false }, tooltip: { enabled: false } },
                    scales: {
                        x: { display: false },
                        y: { display: true, min: 0, max: 350, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { stepSize: 100 } },
                        y1: { display: false, min: 0, max: 100 }
                    }
                }
            });
        } else {
            telemetryChart.data.labels = labels;
            telemetryChart.data.datasets[0].data = dataSpeed;
            telemetryChart.data.datasets[1].data = dataGear;
            telemetryChart.data.datasets[2].data = dataThrottle;
            telemetryChart.data.datasets[3].data = dataBrake;
            telemetryChart.update('none');
        }
    }

    function play() {
        if (isPlaying) return;
        isPlaying = true;
        lastTimestamp = performance.now();
        frameAccumulator = 0;
        updatePlayPauseIcon();
        tick();
    }

    function pause() {
        isPlaying = false;
        updatePlayPauseIcon();
        if (animationId) {
            cancelAnimationFrame(animationId);
            animationId = null;
        }
    }

    function togglePlayPause() {
        if (isPlaying) pause();
        else play();
    }

    function tick() {
        if (!isPlaying) return;

        var now = performance.now();
        var delta = now - lastTimestamp;
        lastTimestamp = now;

        frameAccumulator += delta * speed;

        while (frameAccumulator >= frameInterval) {
            frameAccumulator -= frameInterval;
            advanceFrame();
        }

        renderFrame();
        animationId = requestAnimationFrame(tick);
    }

    function advanceFrame() {
        if (!raceData || !raceData.frames || raceData.frames.length === 0) return;
        currentFrame++;
        if (currentFrame >= raceData.frames.length) {
            currentFrame = raceData.frames.length - 1;
            if (telemetryLoadDone) {
                pause();
            } else {
                frameAccumulator = 0;
            }
        }
        updateUI();
    }

    function rewind() {
        if (!raceData || !raceData.frames) return;

        var framesPerLap = Math.max(1, Math.floor(raceData.frames.length / raceData.totalLaps));
        currentFrame = Math.max(0, currentFrame - framesPerLap);
        updateUI();
        renderFrame();
    }

    function fastForward() {
        if (!raceData || !raceData.frames) return;
        var framesPerLap = Math.max(1, Math.floor(raceData.frames.length / raceData.totalLaps));
        currentFrame = Math.min(raceData.frames.length - 1, currentFrame + framesPerLap);
        updateUI();
        renderFrame();
    }

    function restart() {
        currentFrame = 0;
        driverCurrentPos = {};
        driverTargetPos = {};
        updateUI();
        renderFrame();
        if (!isPlaying) play();
    }

    function cycleSpeed() {
        speedIndex = (speedIndex + 1) % speeds.length;
        speed = speeds[speedIndex];
        updateSpeedDisplay();
    }

    function setSpeed(idx) {
        if (idx >= 0 && idx < speeds.length) {
            speedIndex = idx;
            speed = speeds[speedIndex];
            updateSpeedDisplay();
        }
    }

    function increaseSpeed() {
        if (speedIndex < speeds.length - 1) {
            speedIndex++;
            speed = speeds[speedIndex];
            updateSpeedDisplay();
        }
    }

    function decreaseSpeed() {
        if (speedIndex > 0) {
            speedIndex--;
            speed = speeds[speedIndex];
            updateSpeedDisplay();
        }
    }

    function updateUI() {
        if (!raceData || !raceData.frames || raceData.frames.length === 0) return;

        var frame = raceData.frames[currentFrame];
        if (!frame) return;
        var lap = frame ? frame.lap : 0;
        var totalLaps = raceData.totalLaps;

        currentLapEl.textContent = lap + "/" + totalLaps;

        var progressTotal = raceData.totalFrames || raceData.frames.length;
        var progress = progressTotal > 1
            ? (currentFrame / (progressTotal - 1)) * 100
            : 0;
        progressFill.style.width = progress + "%";
        progressThumb.style.left = progress + "%";

        if (currentFrame % 3 === 0) {
            updateLeaderboard();
            updateInsights();
        } else if (selectedDrivers.size === 1) {
            renderTelemetryChart(Array.from(selectedDrivers)[0]);
        }

        // Update Weather
        if (frame.weather) {
            document.getElementById("wAir").textContent = frame.weather.air_temp + "°C";
            document.getElementById("wTrack").textContent = frame.weather.track_temp + "°C";
            document.getElementById("wHum").textContent = frame.weather.humidity + "%";
            document.getElementById("wWind").textContent = frame.weather.wind_speed + " km/h";
            document.getElementById("wWindDir").style.transform = "rotate(" + frame.weather.wind_direction + "deg)";
            document.getElementById("wRain").textContent = frame.weather.rainfall ? "Yes" : "No";
        }

        // Update Race Control Messages
        if (raceData.raceControlMessages && raceData.raceControlMessages.length > 0) {
            var rcFeed = document.getElementById("raceControlFeed");
            // Find messages up to current time
            var t = frame.t;
            var visibleMsgs = raceData.raceControlMessages.filter(function(m) { return m.time <= t; });
            
            // To optimize, only update if length changed
            if (rcFeed.dataset.msgCount != visibleMsgs.length) {
                if (visibleMsgs.length === 0) {
                    rcFeed.innerHTML = '<div class="rc-placeholder">Waiting for messages...</div>';
                } else {
                    var html = "";
                    for (var i = visibleMsgs.length - 1; i >= 0; i--) {
                        var m = visibleMsgs[i];
                        var catClass = "";
                        var flagLower = (m.flag || "").toLowerCase();
                        if (flagLower.includes("yellow")) catClass = "cat-flag";
                        else if (flagLower.includes("red")) catClass = "cat-penalty";
                        else if (flagLower.includes("green")) catClass = "cat-drs";
                        else if (m.category === "SafetyCar") catClass = "cat-safetycar";
                        else if (m.category === "Drs") catClass = "cat-drs";
                        else if (m.category === "CarInvestigation") catClass = "cat-investigation";
                        
                        var mins = Math.floor(m.time / 60);
                        var secs = Math.floor(m.time % 60);
                        var timeStr = (mins < 10 ? "0" : "") + mins + ":" + (secs < 10 ? "0" : "") + secs;
                        
                        html += '<div class="rc-msg ' + catClass + '">';
                        html += '<span class="rc-time">T+' + timeStr + ' | ' + m.category + '</span>';
                        html += '<span class="rc-text">' + m.message + '</span>';
                        html += '</div>';
                    }
                    rcFeed.innerHTML = html;
                }
                rcFeed.dataset.msgCount = visibleMsgs.length;
            }
        }
    }

    function updatePlayPauseIcon() {
        playIcon.style.display = isPlaying ? "none" : "block";
        pauseIcon.style.display = isPlaying ? "block" : "none";
    }

    function updateSpeedDisplay() {
        speedLabel.textContent = speed + "x";
        playbackSpeedEl.textContent = speed + "x";
    }

    function setupControls() {
        document.getElementById("btnPlayPause").addEventListener("click", togglePlayPause);
        document.getElementById("btnRewind").addEventListener("click", rewind);
        document.getElementById("btnForward").addEventListener("click", fastForward);
        document.getElementById("btnRestart").addEventListener("click", restart);
        
        var speedBtns = document.querySelectorAll(".speed-btn");
        if (speedBtns.length > 0) {
            speedBtns.forEach(function(btn) {
                btn.addEventListener("click", function() {
                    speedBtns.forEach(function(b) { b.classList.remove("active"); });
                    btn.classList.add("active");
                    speed = parseFloat(btn.dataset.speed);
                    speedIndex = speeds.indexOf(speed);
                    if(speedIndex === -1) speedIndex = 1;
                });
            });
        }

        var tt = document.getElementById("telemetryToggle");
        if (tt) {
            tt.addEventListener("change", function(e) {
                showTelemetry = e.target.checked;
                renderFrame();
            });
        }

        var dsd = document.getElementById("driverSelectorDropdown");
        if (dsd) {
            dsd.addEventListener("mouseover", function(e) {
                if(e.target.tagName === 'OPTION' && e.target.value) { hoveredDriver = e.target.value; renderFrame(); }
            });
            dsd.addEventListener("mouseout", function() {
                hoveredDriver = null; renderFrame();
            });
            dsd.addEventListener("change", function(e) {
                if (e.target.value) {
                    selectedDrivers.clear();
                    selectedDrivers.add(e.target.value);
                } else {
                    selectedDrivers.clear();
                }
                updateLeaderboard();
                updateInsights();
                renderFrame();
            });
        }

        var ls = document.getElementById("lapSelector");
        if (ls) {
            ls.addEventListener("change", function(e) {
                var targetLap = parseInt(e.target.value);
                if (isNaN(targetLap)) return;
                var targetFrame = raceData.frames.findIndex(function(f) { return f.lap >= targetLap; });
                if (targetFrame !== -1) {
                    currentFrame = targetFrame;
                    updateUI();
                    renderFrame();
                }
            });
        }

        document.getElementById("legendToggle").addEventListener("click", function () {
            legendOverlay.style.display = legendOverlay.style.display === "none" ? "flex" : "none";
        });
        document.getElementById("legendClose").addEventListener("click", function () {
            legendOverlay.style.display = "none";
        });

        progressBar.addEventListener("click", function (e) {
            if (!raceData || !raceData.frames) return;
            var rect = progressBar.getBoundingClientRect();
            var pct = (e.clientX - rect.left) / rect.width;
            pct = Math.max(0, Math.min(1, pct));
            currentFrame = Math.floor(pct * (raceData.frames.length - 1));
            updateUI();
            renderFrame();
        });
    }

    var keyboardHandler = function (e) {
        if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT") return;
        if (!raceData) return;

        switch (e.key) {
            case " ":
                e.preventDefault();
                togglePlayPause();
                break;
            case "ArrowLeft":
                e.preventDefault();
                rewind();
                break;
            case "ArrowRight":
                e.preventDefault();
                fastForward();
                break;
            case "ArrowUp":
                e.preventDefault();
                increaseSpeed();
                break;
            case "ArrowDown":
                e.preventDefault();
                decreaseSpeed();
                break;
            case "1":
                setSpeed(0);
                break;
            case "2":
                setSpeed(1);
                break;
            case "3":
                setSpeed(2);
                break;
            case "4":
                setSpeed(3);
                break;
            case "r":
            case "R":
                restart();
                break;
            case "d":
            case "D":
                showDRS = !showDRS;
                renderFrame();
                break;
            case "b":
            case "B":
                showProgressBar = !showProgressBar;
                progressBarContainer.style.display = showProgressBar ? "" : "none";
                break;
            case "l":
            case "L":
                showDriverNames = !showDriverNames;
                renderFrame();
                break;
            case "h":
            case "H":
                legendOverlay.style.display = legendOverlay.style.display === "none" ? "flex" : "none";
                break;
        }
    };

    function setupKeyboard() {
        // Prevent duplicate bindings on Turbo Drive navigations
        document.removeEventListener("keydown", keyboardHandler);
        document.addEventListener("keydown", keyboardHandler);
    }

    // Cleanup when Turbo Drive navigates away
    document.addEventListener("turbo:before-render", function() {
        if (animationId) {
            cancelAnimationFrame(animationId);
            animationId = null;
        }
        isPlaying = false;
        document.removeEventListener("keydown", keyboardHandler);
    }, { once: true });

    init();
})();
