

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

    var trackBounds = { minX: 0, maxX: 1, minY: 0, maxY: 1 };
    var trackScale = 1;
    var trackOffsetX = 0;
    var trackOffsetY = 0;
    var canvasW = 0;
    var canvasH = 0;

    var driverCurrentPos = {};
    var driverTargetPos = {};

    var TYRE_COLORS = {
        SOFT: "#FF3333",
        MEDIUM: "#FFC906",
        HARD: "#EBEBEB",
        INTERMEDIATE: "#39B54A",
        WET: "#00AEEF",
        UNKNOWN: "#888888",
    };

    function init() {
        loadSessions(yearSelect.value);
        yearSelect.addEventListener("change", function () {
            loadSessions(yearSelect.value);
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
        sessionModal.style.display = "none";
        showLoader("Loading race data for Round " + round + "... This may take a moment.");

        fetch("/api/replay/load?year=" + year + "&round=" + round)
            .then(function (res) { return res.json(); })
            .then(function (data) {
                if (data.error) {
                    alert("Error loading race: " + data.error);
                    sessionModal.style.display = "";
                    hideLoader();
                    return;
                }
                raceData = data;
                initReplay();
                hideLoader();
            })
            .catch(function (err) {
                alert("Failed to load race data: " + err.message);
                sessionModal.style.display = "";
                hideLoader();
            });
    }

    function initReplay() {
        replayContainer.style.display = "";
        eventTitle.textContent = raceData.eventName + " " + raceData.year;
        progressLapEnd.textContent = "Lap " + raceData.totalLaps;

        computeTrackBounds();
        resizeCanvas();

        currentFrame = 0;
        isPlaying = false;
        selectedDrivers.clear();
        driverCurrentPos = {};
        driverTargetPos = {};

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

        canvas.width = canvasW * dpr;
        canvas.height = canvasH * dpr;
        canvas.style.width = canvasW + "px";
        canvas.style.height = canvasH + "px";
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        updateTrackTransform();

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
        ctx.clearRect(0, 0, canvasW, canvasH);

        var bgGrad = ctx.createRadialGradient(canvasW / 2, canvasH / 2, 0, canvasW / 2, canvasH / 2, canvasW * 0.6);
        bgGrad.addColorStop(0, "#12121c");
        bgGrad.addColorStop(1, "#0a0a0f");
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, canvasW, canvasH);

        if (!raceData || !raceData.track || raceData.track.length === 0) {
            ctx.fillStyle = "#555";
            ctx.font = "16px 'Outfit', sans-serif";
            ctx.textAlign = "center";
            ctx.fillText("No track data available", canvasW / 2, canvasH / 2);
            return;
        }

        drawTrack();
        drawDrivers();
        drawSafetyCar();
    }

    function drawTrack() {
        var track = raceData.track;
        if (track.length < 2) return;

        ctx.beginPath();
        var p0 = worldToCanvas(track[0][0], track[0][1]);
        ctx.moveTo(p0.x, p0.y);
        for (var i = 1; i < track.length; i++) {
            var p = worldToCanvas(track[i][0], track[i][1]);
            ctx.lineTo(p.x, p.y);
        }
        ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
        ctx.lineWidth = 14;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        for (var i = 1; i < track.length; i++) {
            var p = worldToCanvas(track[i][0], track[i][1]);
            ctx.lineTo(p.x, p.y);
        }
        ctx.strokeStyle = "rgba(255, 255, 255, 0.18)";
        ctx.lineWidth = 6;
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        for (var i = 1; i < track.length; i++) {
            var p = worldToCanvas(track[i][0], track[i][1]);
            ctx.lineTo(p.x, p.y);
        }
        ctx.strokeStyle = "rgba(225, 6, 0, 0.12)";
        ctx.lineWidth = 2;
        ctx.stroke();

        var sfP = worldToCanvas(track[0][0], track[0][1]);
        ctx.beginPath();
        ctx.arc(sfP.x, sfP.y, 8, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(225, 6, 0, 0.3)";
        ctx.fill();
        ctx.beginPath();
        ctx.arc(sfP.x, sfP.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = "#e10600";
        ctx.fill();
    }

    function drawDrivers() {
        if (!raceData.frames || currentFrame >= raceData.frames.length) return;

        var frame = raceData.frames[currentFrame];
        if (!frame || !frame.drivers) return;

        var driverKeys = Object.keys(frame.drivers);

        driverKeys.sort(function (a, b) {
            var pa = frame.drivers[a].position || 99;
            var pb = frame.drivers[b].position || 99;
            return pb - pa;
        });

        for (var i = 0; i < driverKeys.length; i++) {
            var drv = driverKeys[i];
            var dData = frame.drivers[drv];
            var info = raceData.drivers[drv];
            if (!info) continue;

            var targetX = dData.x;
            var targetY = dData.y;
            if (targetX === undefined || targetY === undefined) continue;

            if (!driverCurrentPos[drv]) {
                driverCurrentPos[drv] = { x: targetX, y: targetY };
            }
            driverTargetPos[drv] = { x: targetX, y: targetY };

            var cp = driverCurrentPos[drv];
            var tp = driverTargetPos[drv];
            var lerpRate = 0.15;
            cp.x += (tp.x - cp.x) * lerpRate;
            cp.y += (tp.y - cp.y) * lerpRate;

            var canvasPos = worldToCanvas(cp.x, cp.y);
            var isSelected = selectedDrivers.has(drv) || hoveredDriver === drv;
            var isOut = dData.isOut || info.isRetired;
            var teamColor = info.teamColor || "#FFFFFF";
            var radius = isSelected ? 8 : 6;

            if (isOut) {

                ctx.globalAlpha = 0.3;
            }

            if (isSelected) {
                ctx.beginPath();
                ctx.arc(canvasPos.x, canvasPos.y, 18, 0, Math.PI * 2);
                ctx.fillStyle = teamColor.replace(")", ", 0.2)").replace("rgb", "rgba");
                try {
                    var grd = ctx.createRadialGradient(canvasPos.x, canvasPos.y, 0, canvasPos.x, canvasPos.y, 18);
                    grd.addColorStop(0, teamColor + "44");
                    grd.addColorStop(1, "transparent");
                    ctx.fillStyle = grd;
                } catch (e) {}
                ctx.fill();
            }

            ctx.beginPath();
            ctx.arc(canvasPos.x, canvasPos.y, radius, 0, Math.PI * 2);
            ctx.fillStyle = teamColor;
            ctx.fill();

            ctx.beginPath();
            ctx.arc(canvasPos.x, canvasPos.y, radius + 2, 0, Math.PI * 2);
            ctx.strokeStyle = isSelected ? "#fff" : "rgba(255,255,255,0.3)";
            ctx.lineWidth = isSelected ? 2 : 1;
            ctx.stroke();

            if (showDriverNames || isSelected) {
                ctx.font = (isSelected ? "bold " : "") + "10px 'Outfit', sans-serif";
                ctx.textAlign = "center";
                ctx.fillStyle = isSelected ? "#fff" : "rgba(255,255,255,0.7)";
                ctx.fillText(drv, canvasPos.x, canvasPos.y - radius - 6);
            }

            if (dData.position && dData.position <= 3) {
                var badge = dData.position === 1 ? "🥇" : dData.position === 2 ? "🥈" : "🥉";
                ctx.font = "10px sans-serif";
                ctx.fillText(badge, canvasPos.x + radius + 8, canvasPos.y + 4);
            }

            if (showTelemetry || isSelected) {
                ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
                ctx.fillRect(canvasPos.x + 10, canvasPos.y - 24, 60, 32);
                ctx.fillStyle = "#fff";
                ctx.font = "bold 9px 'JetBrains Mono', monospace";
                ctx.textAlign = "left";
                ctx.fillText((dData.speed || 0) + " km/h", canvasPos.x + 14, canvasPos.y - 12);
                ctx.fillStyle = "#00e676";
                ctx.fillText("G:" + (dData.gear || "-"), canvasPos.x + 14, canvasPos.y - 1);
            }

            ctx.globalAlpha = 1.0;
        }
    }

    function drawSafetyCar() {
        if (!raceData.frames || currentFrame >= raceData.frames.length) return;

        var frame = raceData.frames[currentFrame];
        var sc = frame.safety_car;

        if (!sc) {
            scBanner.style.display = "none";
            return;
        }

        scBanner.style.display = "flex";
        if (sc.phase === "deploying") {
            scText.textContent = "SC DEPLOYING";
        } else if (sc.phase === "returning") {
            scText.textContent = "SC IN";
        } else {
            scText.textContent = "SAFETY CAR";
        }

        var pos = worldToCanvas(sc.x, sc.y);
        var alpha = sc.alpha || 1.0;

        ctx.globalAlpha = alpha;

        var scGlowRadius = 20 + Math.sin(Date.now() / 300) * 5;
        var scGrad = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, scGlowRadius);
        scGrad.addColorStop(0, "rgba(255, 165, 0, 0.3)");
        scGrad.addColorStop(1, "transparent");
        ctx.fillStyle = scGrad;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, scGlowRadius, 0, Math.PI * 2);
        ctx.fill();

        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 8, 0, Math.PI * 2);
        ctx.fillStyle = "#FFA500";
        ctx.fill();

        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 11, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(255, 165, 0, 0.7)";
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.font = "bold 11px 'Outfit', sans-serif";
        ctx.textAlign = "center";
        ctx.fillStyle = "#FFA500";
        ctx.fillText("SC", pos.x, pos.y - 16);

        ctx.globalAlpha = 1.0;
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
                    '<div class="lb-tyre" style="background:' + tyreColor + '" title="' + e.compound + '"></div>' +
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

    function updateInsights() {
        if (selectedDrivers.size === 0) {
            insightsContent.innerHTML =
                '<div class="insights-placeholder">' +
                    '<div class="placeholder-icon">🏎️</div>' +
                    '<p>Select a driver from the leaderboard to view telemetry</p>' +
                '</div>';
            return;
        }

        var frame = raceData.frames[currentFrame];
        var html = "";

        selectedDrivers.forEach(function (drv) {
            var info = raceData.drivers[drv];
            var data = frame ? frame.drivers[drv] : null;
            if (!info) return;

            var speedVal = data && data.speed !== undefined ? Math.round(data.speed) : "—";
            var gearVal = data && data.gear !== undefined ? data.gear : "—";
            var drsVal = data && data.drs !== undefined ? data.drs : 0;
            var throttleVal = data && data.throttle !== undefined ? data.throttle : 0;
            var brakeVal = data && data.brake !== undefined ? data.brake : 0;

            var drsLabel = drsVal > 8 ? "OPEN" : "CLOSED"; 
            var drsClass = drsVal > 8 ? "drs-active" : "drs-inactive";
            var compound = data ? (data.compound || "UNKNOWN") : "UNKNOWN";
            var lapNum = data ? (data.lapNumber || "—") : "—";
            var tyreColor = TYRE_COLORS[compound] || TYRE_COLORS.UNKNOWN;

            var throttlePct = Math.min(100, Math.max(0, throttleVal));
            var brakePct = Math.min(100, Math.max(0, brakeVal));

            html +=
                '<div class="insight-driver-card">' +
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
                            '<div class="insight-stat-value speed-val">' + speedVal + '<small> km/h</small></div>' +
                        '</div>' +
                        '<div class="insight-stat">' +
                            '<div class="insight-stat-label">Gear</div>' +
                            '<div class="insight-stat-value gear-val">' + gearVal + '</div>' +
                        '</div>' +
                        '<div class="insight-stat">' +
                            '<div class="insight-stat-label">DRS</div>' +
                            '<div class="insight-stat-value ' + drsClass + '">' + drsLabel + '</div>' +
                        '</div>' +
                    '</div>' +
                    '<div class="insight-telemetry-bars">' +
                        '<div class="telemetry-bar-wrapper">' +
                            '<div class="telemetry-bar-label">THR</div>' +
                            '<div class="telemetry-bar-bg"><div class="telemetry-bar-fill throttle-fill" style="width:' + throttlePct + '%;"></div></div>' +
                        '</div>' +
                        '<div class="telemetry-bar-wrapper">' +
                            '<div class="telemetry-bar-label">BRK</div>' +
                            '<div class="telemetry-bar-bg"><div class="telemetry-bar-fill brake-fill" style="width:' + brakePct + '%;"></div></div>' +
                        '</div>' +
                    '</div>' +
                    '<div class="insight-telemetry">' +
                        '<h4>TYRE: ' + compound + '</h4>' +
                        '<div style="display:flex;align-items:center;gap:8px;">' +
                            '<div class="lb-tyre" style="background:' + tyreColor + ';width:18px;height:18px;"></div>' +
                            '<span style="font-size:0.8rem;color:var(--text-secondary);">' + compound + '</span>' +
                        '</div>' +
                    '</div>' +
                '</div>';
        });

        insightsContent.innerHTML = html;
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
        if (!raceData || !raceData.frames) return;
        currentFrame++;
        if (currentFrame >= raceData.frames.length) {
            currentFrame = raceData.frames.length - 1;
            pause();
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
        if (!raceData || !raceData.frames) return;

        var frame = raceData.frames[currentFrame];
        var lap = frame ? frame.lap : 0;
        var totalLaps = raceData.totalLaps;

        currentLapEl.textContent = lap + "/" + totalLaps;

        var progress = raceData.frames.length > 1
            ? (currentFrame / (raceData.frames.length - 1)) * 100
            : 0;
        progressFill.style.width = progress + "%";
        progressThumb.style.left = progress + "%";

        if (currentFrame % 3 === 0) {
            updateLeaderboard();
            updateInsights();
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

    function setupKeyboard() {
        document.addEventListener("keydown", function (e) {

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
        });
    }

    init();
})();
