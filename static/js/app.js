Chart.defaults.color = "#8a8a9a";
Chart.defaults.borderColor = "rgba(255,255,255,0.04)";
Chart.defaults.font.family = "'Outfit', sans-serif";

var F1_RED = "#e10600";
var CYAN   = "#00d2ff";
var PURPLE = "#7b2ff7";
var GREEN  = "#00e676";
var ORANGE = "#ff8800";

var charts = {};

function getEl(id) {
    return document.getElementById(id);
}

/* ── Loading overlay with elapsed timer ─────────────────────────── */
var _loaderTimer = null;
var _loaderStart = 0;

function showLoader(message) {
    var overlay = getEl("loadingOverlay");
    if (_loaderTimer) {
        clearInterval(_loaderTimer);
        _loaderTimer = null;
    }
    overlay.classList.add("show");
    _loaderStart = Date.now();

    // Update the main message
    var msgEl = overlay.querySelector(".loader-msg");
    if (!msgEl) {
        msgEl = document.createElement("p");
        msgEl.className = "loader-msg";
        overlay.insertBefore(msgEl, overlay.querySelector(".loader-elapsed"));
    }
    msgEl.textContent = message || "Crunching F1 data...";

    // Show first-load warning if nothing is cached yet
    var warnEl = overlay.querySelector(".loader-warn");
    if (!warnEl) {
        warnEl = document.createElement("p");
        warnEl.className = "loader-warn";
        warnEl.style.cssText = "font-size:0.75rem;color:rgba(255,200,100,0.7);margin-top:4px;";
        overlay.appendChild(warnEl);
    }
    var hasAnyCached = sessionStorage.length > 0;
    warnEl.textContent = hasAnyCached ? "" : "First uncached telemetry or ML load may take 40-60 seconds...";

    // Elapsed timer
    var timerEl = overlay.querySelector(".loader-elapsed");
    if (!timerEl) {
        timerEl = document.createElement("p");
        timerEl.className = "loader-elapsed";
        timerEl.style.cssText = "font-size:0.8rem;color:rgba(255,255,255,0.5);margin-top:8px;";
        overlay.appendChild(timerEl);
    }
    timerEl.textContent = "";
    _loaderTimer = setInterval(function () {
        var elapsed = ((Date.now() - _loaderStart) / 1000).toFixed(0);
        timerEl.textContent = elapsed + "s elapsed";
    }, 1000);
}

function hideLoader() {
    getEl("loadingOverlay").classList.remove("show");
    if (_loaderTimer) { clearInterval(_loaderTimer); _loaderTimer = null; }
}

/* ── AbortController for cancelling in-flight tab requests ──────── */
var _activeController = null;

function cancelActiveFetch() {
    if (_activeController) {
        _activeController.abort();
        _activeController = null;
    }
}

/* ── sessionStorage cache for API responses ─────────────────────── */
function getCachedResponse(url) {
    try {
        var item = sessionStorage.getItem("f1_" + url);
        if (item) return JSON.parse(item);
    } catch (e) {}
    return null;
}

function setCachedResponse(url, data) {
    try {
        sessionStorage.setItem("f1_" + url, JSON.stringify(data));
    } catch (e) {}
}

/* ── Debounce utility ───────────────────────────────────────────── */
function debounce(func, wait) {
    var timeout;
    return function() {
        var context = this, args = arguments;
        clearTimeout(timeout);
        timeout = setTimeout(function() {
            func.apply(context, args);
        }, wait);
    };
}

/* ── Fetch with abort support, timeout, and session caching ─────── */
function fetchJSON(url, opts) {
    opts = opts || {};

    // For GET requests, check sessionStorage cache first
    if (!opts.method || opts.method === "GET") {
        var cached = getCachedResponse(url);
        if (cached) return Promise.resolve(cached);
    }

    // Set up AbortController and Timeout
    cancelActiveFetch();
    _activeController = new AbortController();
    var timeoutId = setTimeout(function() {
        if (_activeController) _activeController.abort("Timeout");
    }, 90000); // 90 second timeout (ML routes can take 40-60s on first load)
    opts.signal = _activeController.signal;

    return fetch(url, opts).then(function (res) {
        clearTimeout(timeoutId);
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
    }).then(function (data) {
        // Cache GET responses
        if (!opts.method || opts.method === "GET") {
            setCachedResponse(url, data);
        }
        return data;
    }).catch(function (err) {
        clearTimeout(timeoutId);
        throw err;
    });
}


document.querySelectorAll(".tab-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
        cancelActiveFetch();
        hideLoader();

        document.querySelectorAll(".tab-btn").forEach(function (b) {
            b.classList.remove("active");
        });
        document.querySelectorAll(".tab-panel").forEach(function (p) {
            p.classList.remove("active");
        });

        btn.classList.add("active");
        getEl("panel-" + btn.dataset.tab).classList.add("active");

        if (btn.dataset.tab === "part1" && !charts.team)  loadPart1();
        if (btn.dataset.tab === "part2" && !charts.speed) loadPart2();
        if (btn.dataset.tab === "part3" && getEl("upcomingRaceSelect").options.length <= 1) loadUpcomingRaces();
        if (btn.dataset.tab === "fantasy" && fantasyDrivers.length === 0) loadFantasyDrivers();
    });
});

fetch("/api/race/live/status")
    .then(function (res) { return res.json(); })
    .then(function (data) {
        var live = getEl("homeLiveStatus");
        if (live) live.textContent = data.live ? "Live Session Active" : "Simulation Ready";
    })
    .catch(function () {});


function loadPart1() {
    showLoader("Loading race data...");
    fetchJSON("/api/data/team-points")
        .then(function (data) {
            var teamLabels = data.teams.map(function (t) { return t.TeamName; });
            var teamPoints = data.teams.map(function (t) { return t.Points; });
            var teamColors = teamLabels.map(function (_, i) {
                var hue = (i * 36) % 360;
                return "hsl(" + hue + ", 75%, 55%)";
            });

            charts.team = new Chart(getEl("teamChart"), {
                type: "bar",
                data: {
                    labels: teamLabels,
                    datasets: [{
                        label: "Points",
                        data: teamPoints,
                        backgroundColor: teamColors,
                        borderRadius: 6,
                        borderSkipped: false
                    }]
                },
                options: {
                    indexAxis: "y",
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: { x: { grid: { display: false } } }
                }
            });

            var driverLabels = data.drivers.map(function (d) { return d.Abbreviation; });
            var driverPoints = data.drivers.map(function (d) { return d.Points; });

            charts.driver = new Chart(getEl("driverChart"), {
                type: "bar",
                data: {
                    labels: driverLabels,
                    datasets: [{
                        label: "Points",
                        data: driverPoints,
                        backgroundColor: driverLabels.map(function (_, i) {
                            return "hsla(" + ((i * 30 + 10) % 360) + ", 80%, 55%, 0.85)";
                        }),
                        borderRadius: 6,
                        borderSkipped: false
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: { y: { beginAtZero: true, grid: { display: false } } }
                }
            });

            getEl("part1Stats").innerHTML =
                '<div class="stat-item"><div class="stat-val">' + data.race + '</div><div class="stat-label">Grand Prix</div></div>' +
                '<div class="stat-item"><div class="stat-val">' + data.teams.length + '</div><div class="stat-label">Teams</div></div>' +
                '<div class="stat-item"><div class="stat-val">' + data.drivers.length + '</div><div class="stat-label">Classified Drivers</div></div>';
        })
        .catch(function (err) { console.error(err); })
        .finally(hideLoader);
}


function _renderTelemetryCharts(data) {
    var dist1 = data.tel1.distance;
    var dist2 = data.tel2.distance;

    ["speed", "throttle", "brake"].forEach(function (k) {
        if (charts[k]) { charts[k].destroy(); charts[k] = null; }
    });

    function lineOpts(yLabel) {
        return {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 600 },
            plugins: {
                legend: {
                    position: "top",
                    labels: { usePointStyle: true, pointStyle: "circle" }
                }
            },
            elements: { point: { radius: 0 }, line: { borderWidth: 1.5 } },
            scales: {
                x: {
                    type: "linear",
                    title: { display: true, text: "Distance (m)" },
                    ticks: { maxTicksLimit: 10 }
                },
                y: {
                    title: { display: true, text: yLabel },
                    grid: { color: "rgba(255,255,255,0.03)" }
                }
            }
        };
    }

    function xyData(dist, values) {
        return dist.map(function (d, i) { return { x: d, y: values[i] }; });
    }

    charts.speed = new Chart(getEl("speedChart"), {
        type: "line",
        data: {
            datasets: [
                { label: data.d1, data: xyData(dist1, data.tel1.speed), borderColor: F1_RED, backgroundColor: "transparent" },
                { label: data.d2, data: xyData(dist2, data.tel2.speed), borderColor: CYAN,   backgroundColor: "transparent" }
            ]
        },
        options: lineOpts("Speed (km/h)")
    });

    charts.throttle = new Chart(getEl("throttleChart"), {
        type: "line",
        data: {
            datasets: [
                { label: data.d1, data: xyData(dist1, data.tel1.throttle), borderColor: F1_RED, backgroundColor: "transparent" },
                { label: data.d2, data: xyData(dist2, data.tel2.throttle), borderColor: CYAN,   backgroundColor: "transparent" }
            ]
        },
        options: lineOpts("Throttle %")
    });

    charts.brake = new Chart(getEl("brakeChart"), {
        type: "line",
        data: {
            datasets: [
                { label: data.d1, data: xyData(dist1, data.tel1.brake), borderColor: F1_RED, backgroundColor: "transparent", fill: true },
                { label: data.d2, data: xyData(dist2, data.tel2.brake), borderColor: CYAN,   backgroundColor: "transparent", fill: true }
            ]
        },
        options: lineOpts("Brake")
    });
}

function loadPart2() {
    var d1 = getEl("selD1").value;
    var d2 = getEl("selD2").value;
    var baseUrl = "/api/data/telemetry?d1=" + d1 + "&d2=" + d2;

    showLoader("Loading telemetry preview...");

    // Phase 1: Fast preview (every 10th point)
    fetchJSON(baseUrl + "&resolution=preview")
        .then(function (data) {
            _renderTelemetryCharts(data);
            hideLoader();

            // Phase 2: Full resolution in background (silent upgrade)
            fetch(baseUrl + "&resolution=full")
                .then(function (res) { return res.json(); })
                .then(function (fullData) {
                    _renderTelemetryCharts(fullData);
                    setCachedResponse(baseUrl + "&resolution=full", fullData);
                })
                .catch(function () { /* preview is good enough */ });
        })
        .catch(function (err) { console.error(err); })
        .finally(hideLoader);
}

getEl("btnLoadTelemetry").addEventListener("click", loadPart2);


function loadUpcomingRaces() {
    var select = getEl("upcomingRaceSelect");
    if (!select) return;
    
    fetchJSON("/api/ml/upcoming_races")
        .then(function(data) {
            select.innerHTML = "";
            data.races.forEach(function(race) {
                var opt = document.createElement("option");
                opt.value = race;
                opt.textContent = race;
                select.appendChild(opt);
            });
        })
        .catch(function(err) {
            select.innerHTML = "<option>Error loading races</option>";
        });
}

getEl("btnRunBaseline").addEventListener("click", function () {
    var btn = getEl("btnRunBaseline");
    var select = getEl("upcomingRaceSelect");
    var eventName = select ? select.value : "Bahrain Grand Prix";

    btn.disabled = true;
    btn.textContent = "⏳ Training model (fetching 75 years of data)...";
    showLoader("Training ML model — fetching race data...");

    fetchJSON("/api/ml/predict?event_name=" + encodeURIComponent(eventName))
        .then(function (data) {
            getEl("p3Accuracy").textContent   = (data.accuracy * 100).toFixed(1) + "%";
            getEl("p3Model").textContent      = data.model;
            getEl("p3DataPoints").textContent = data.dataPoints;
            getEl("part3Results").style.display = "";

            renderFeatureImportances("fiChart3", data.featureImportances);
            renderPredictions("p3Predictions", data.predictions);
            getEl("part3Charts").style.display = "";
        })
        .catch(function (err) { console.error(err); })
        .finally(function () {
            hideLoader();
            btn.textContent = "🚀 Predict Winner";
            btn.disabled = false;
        });
});


getEl("btnRunAdvanced").addEventListener("click", function () {
    var btn = getEl("btnRunAdvanced");
    btn.disabled = true;
    btn.textContent = "⏳ Tuning hyperparameters...";
    showLoader("Running advanced ML with hyperparameter tuning...");

    fetchJSON("/api/ml/predict-advanced")
        .then(function (data) {
            getEl("p4Accuracy").textContent   = (data.accuracy * 100).toFixed(1) + "%";
            getEl("p4Params").textContent     = JSON.stringify(data.bestParams);
            getEl("p4DataPoints").textContent = data.dataPoints;
            getEl("part4Results").style.display = "";

            renderFeatureImportances("fiChart4", data.featureImportances);
            renderPredictions("p4Predictions", data.predictions);
            getEl("part4Charts").style.display = "";
        })
        .catch(function (err) { console.error(err); })
        .finally(function () {
            hideLoader();
            btn.textContent = "🧠 Run Advanced Model";
            btn.disabled = false;
        });
});


if (getEl("btnSimulateSeason")) {
    getEl("btnSimulateSeason").addEventListener("click", function () {
        var btn = getEl("btnSimulateSeason");
        btn.disabled = true;
        btn.textContent = "⏳ Simulating Rest of Season...";
        showLoader("Simulating rest of season...");

        fetchJSON("/api/ml/simulate-season")
            .then(function (data) {
                getEl("seasonSimResults").style.display = "";

                var htmlStandings = "";
                data.finalStandings.forEach(function (drv, i) {
                    var rankClass = i === 0 ? "gold" : i === 1 ? "silver" : i === 2 ? "bronze" : "";
                    htmlStandings +=
                        '<div class="pred-item" style="margin-bottom: 8px;">' +
                            '<div class="pred-rank ' + rankClass + '">' + drv.rank + '</div>' +
                            '<div class="pred-info">' +
                                '<div class="pred-driver">' + drv.driver + '</div>' +
                                '<div class="pred-team">' + drv.team + '</div>' +
                            '</div>' +
                            '<div class="pred-prob" style="font-weight: 700;">' + drv.points + ' pts</div>' +
                        '</div>';
                });
                getEl("simStandingsList").innerHTML = htmlStandings;

                var htmlRaces = "";
                data.racePredictions.forEach(function (race) {
                    var podiumHtml = race.podium.map(function(p, idx) {
                        var rc = idx === 0 ? "gold" : idx === 1 ? "silver" : "bronze";
                        return '<div class="pred-item" style="padding: 6px; margin-bottom: 4px;">' +
                               '<div class="pred-rank ' + rc + '" style="width: 24px; height: 24px; font-size: 0.8rem; border-radius: 50%; display: flex; align-items: center; justify-content: center;">' + (idx+1) + '</div>' +
                               '<div class="pred-info" style="font-size: 0.9rem;">' + p + '</div></div>';
                    }).join("");
                    
                    htmlRaces += 
                        '<div class="glass-card chart-card">' +
                            '<h4>' + race.eventName + '</h4>' +
                            '<div style="margin-top: 10px;">' + podiumHtml + '</div>' +
                        '</div>';
                });
                getEl("simRacesGrid").innerHTML = htmlRaces;
            })
            .catch(function (err) { console.error(err); })
            .finally(function () {
                hideLoader();
                btn.textContent = "🔮 Simulate Rest of Season";
                btn.disabled = false;
            });
    });
}


function renderFeatureImportances(canvasId, importances) {
    var labels = Object.keys(importances);
    var values = Object.values(importances);

    if (charts[canvasId]) charts[canvasId].destroy();

    charts[canvasId] = new Chart(getEl(canvasId), {
        type: "doughnut",
        data: {
            labels: labels,
            datasets: [{
                data: values,
                backgroundColor: [F1_RED, CYAN, PURPLE, ORANGE, GREEN],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: "bottom",
                    labels: { padding: 14, usePointStyle: true, pointStyle: "circle" }
                }
            }
        }
    });
}

function renderPredictions(containerId, predictions) {
    var html = "";
    for (var i = 0; i < predictions.length; i++) {
        var p = predictions[i];
        var rankClass = i === 0 ? "gold" : i === 1 ? "silver" : i === 2 ? "bronze" : "";
        var formText  = p.form !== undefined ? " · Form: " + p.form + " pts" : "";

        html +=
            '<div class="pred-item">' +
                '<div class="pred-rank ' + rankClass + '">' + (i + 1) + '</div>' +
                '<div class="pred-info">' +
                    '<div class="pred-driver">' + p.driver + '</div>' +
                    '<div class="pred-team">' + p.team + formText + '</div>' +
                '</div>' +
                '<div class="pred-prob">' + (p.podiumProb * 100).toFixed(0) + '%</div>' +
            '</div>';
    }
    getEl(containerId).innerHTML = html;
}


var ttsEnabled = false;
var recognition = null;

function addChatMessage(text, isUser) {
    var container = getEl("chatMessages");
    var div = document.createElement("div");
    div.className = "chat-msg " + (isUser ? "user" : "bot");
    div.innerHTML =
        '<div class="chat-avatar">' + (isUser ? "👤" : "🤖") + '</div>' +
        '<div class="chat-bubble">' + text + '</div>';
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}

function speakText(text) {
    if (!ttsEnabled) return;
    var clean = text.replace(/<[^>]*>/g, "").replace(/&amp;/g, "&");
    var utterance = new SpeechSynthesisUtterance(clean);
    utterance.rate = 1.1;
    utterance.pitch = 0.9;
    speechSynthesis.speak(utterance);
}

function sendChat() {
    var input = getEl("chatInput");
    var msg = input.value.trim();
    if (!msg) return;

    input.value = "";
    addChatMessage(msg, true);

    fetchJSON("/api/chat/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg })
    })
    .then(function (data) {
        var html = data.reply
            .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
            .replace(/\n/g, "<br>");
        addChatMessage(html, false);
        speakText(data.reply);
    })
    .catch(function () {
        addChatMessage("⚠️ Connection error. Is the server running?", false);
    });
}

getEl("btnSendChat").addEventListener("click", sendChat);
getEl("chatInput").addEventListener("keydown", function (e) {
    if (e.key === "Enter") sendChat();
});

if (getEl("btnTTS")) {
    getEl("btnTTS").addEventListener("click", function () {
        ttsEnabled = !ttsEnabled;
        this.style.opacity = ttsEnabled ? "1" : "0.4";
        this.title = ttsEnabled ? "Voice responses ON" : "Voice responses OFF";
    });
    getEl("btnTTS").style.opacity = "0.4";
}

if (getEl("btnVoice") && ("webkitSpeechRecognition" in window || "SpeechRecognition" in window)) {
    var SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";

    recognition.onresult = function (event) {
        var transcript = event.results[0][0].transcript;
        getEl("chatInput").value = transcript;
        sendChat();
    };

    recognition.onerror = function () {
        getEl("btnVoice").style.background = "";
    };

    recognition.onend = function () {
        getEl("btnVoice").style.background = "";
    };

    getEl("btnVoice").addEventListener("click", function () {
        this.style.background = "rgba(225,6,0,0.3)";
        recognition.start();
    });
} else if (getEl("btnVoice")) {
    getEl("btnVoice").style.display = "none";
}


function loadSeason() {
    var year = getEl("seasonYearSelect").value;
    var btn = getEl("btnLoadSeason");
    btn.disabled = true;
    btn.textContent = "⏳ Loading...";
    showLoader("Loading season standings...");

    fetchJSON("/api/season/standings?year=" + year)
        .then(function (data) {
            getEl("seasonRaces").textContent = data.racesLoaded;
            getEl("seasonLeader").textContent = data.leader;
            getEl("seasonDriverCount").textContent = data.totalDrivers;
            getEl("seasonResults").style.display = "";

            if (charts.seasonDriver) charts.seasonDriver.destroy();
            if (charts.seasonTeam) charts.seasonTeam.destroy();

            var driverDatasets = [];
            var colors = ["#e10600","#00d2ff","#7b2ff7","#00e676","#ff8800","#ff6b9d","#ffc906","#39b54a","#ff4081","#00bcd4"];
            var idx = 0;
            for (var drv in data.driverProgression) {
                driverDatasets.push({
                    label: drv,
                    data: data.driverProgression[drv],
                    borderColor: colors[idx % colors.length],
                    backgroundColor: "transparent",
                    borderWidth: 2,
                    pointRadius: 2,
                    tension: 0.3
                });
                idx++;
            }

            charts.seasonDriver = new Chart(getEl("seasonDriverChart"), {
                type: "line",
                data: { labels: data.rounds, datasets: driverDatasets },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    plugins: { legend: { position: "bottom", labels: { usePointStyle: true, pointStyle: "circle", padding: 12 } } },
                    elements: { point: { radius: 2 } },
                    scales: {
                        x: { ticks: { maxRotation: 45 } },
                        y: { title: { display: true, text: "Points" }, beginAtZero: true }
                    }
                }
            });

            var teamDatasets = [];
            idx = 0;
            for (var t in data.teamProgression) {
                teamDatasets.push({
                    label: t,
                    data: data.teamProgression[t],
                    borderColor: colors[idx % colors.length],
                    backgroundColor: "transparent",
                    borderWidth: 2,
                    pointRadius: 2,
                    tension: 0.3
                });
                idx++;
            }

            charts.seasonTeam = new Chart(getEl("seasonTeamChart"), {
                type: "line",
                data: { labels: data.rounds, datasets: teamDatasets },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    plugins: { legend: { position: "bottom", labels: { usePointStyle: true, pointStyle: "circle", padding: 12 } } },
                    elements: { point: { radius: 2 } },
                    scales: {
                        x: { ticks: { maxRotation: 45 } },
                        y: { title: { display: true, text: "Points" }, beginAtZero: true }
                    }
                }
            });
        })
        .catch(function (err) { console.error(err); })
        .finally(function () {
            hideLoader();
            btn.textContent = "Load Season Data";
            btn.disabled = false;
        });
}

if (getEl("btnLoadSeason")) {
    getEl("btnLoadSeason").addEventListener("click", loadSeason);
}


var fantasyPicks = new Set();
var fantasyDrivers = [];

function loadFantasyDrivers() {
    fetchJSON("/api/fantasy/drivers")
        .then(function (data) {
            fantasyDrivers = data.drivers;
            renderFantasyGrid();
        })
        .catch(function (err) { console.error(err); });
}

function renderFantasyGrid() {
    var grid = getEl("fantasyGrid");
    if (!grid) return;
    var html = "";
    for (var i = 0; i < fantasyDrivers.length; i++) {
        var d = fantasyDrivers[i];
        var selected = fantasyPicks.has(d.driver);
        html +=
            '<div class="fantasy-driver-card ' + (selected ? "selected" : "") + '" data-driver="' + d.driver + '">' +
                '<div class="fd-name">' + d.driver + '</div>' +
                '<div class="fd-team">' + d.team + '</div>' +
            '</div>';
    }
    grid.innerHTML = html;

    grid.querySelectorAll(".fantasy-driver-card").forEach(function (card) {
        card.addEventListener("click", function () {
            var drv = this.dataset.driver;
            if (fantasyPicks.has(drv)) {
                fantasyPicks.delete(drv);
            } else if (fantasyPicks.size < 5) {
                fantasyPicks.add(drv);
            }
            renderFantasyGrid();
            getEl("fantasySelected").textContent = "Selected: " + fantasyPicks.size + " / 5";
            getEl("btnSimulateFantasy").disabled = fantasyPicks.size !== 5;
        });
    });
}

function simulateFantasy() {
    var btn = getEl("btnSimulateFantasy");
    btn.disabled = true;
    btn.textContent = "⏳ Simulating...";
    showLoader("Simulating fantasy race...");

    fetchJSON("/api/fantasy/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ drivers: Array.from(fantasyPicks) })
    })
    .then(function (data) {
        getEl("fantasyScore").textContent = data.userScore + " pts";
        getEl("fantasyBest").textContent = data.bestScore + " pts";
        getEl("fantasyRating").textContent = data.rating;
        getEl("fantasyResults").style.display = "";

        var html = "";
        for (var i = 0; i < data.userTeam.length; i++) {
            var p = data.userTeam[i];
            html +=
                '<div class="pred-item">' +
                    '<div class="pred-rank">P' + p.predictedPosition + '</div>' +
                    '<div class="pred-info">' +
                        '<div class="pred-driver">' + p.driver + '</div>' +
                        '<div class="pred-team">' + p.team + '</div>' +
                    '</div>' +
                    '<div class="pred-prob">' + p.points + ' pts</div>' +
                '</div>';
        }
        getEl("fantasyTeamResults").innerHTML = html;

        if (charts.fantasyGrid) charts.fantasyGrid.destroy();
        if (charts.fantasyScore) charts.fantasyScore.destroy();
        if (charts.fantasyProb) charts.fantasyProb.destroy();

        var teamLabels = data.userTeam.map(function(d) { return d.driver; });
        var teamPositions = data.userTeam.map(function(d) { return d.predictedPosition; });
        var teamPoints = data.userTeam.map(function(d) { return d.points; });

        var posColors = teamPositions.map(function(pos) {
            if (pos <= 3) return "#00e676";
            if (pos <= 6) return "#ffc906";
            if (pos <= 10) return "#ff8800";
            return "#e10600";
        });

        charts.fantasyGrid = new Chart(getEl("fantasyGridChart"), {
            type: "bar",
            data: {
                labels: teamLabels,
                datasets: [{
                    label: "Predicted Position",
                    data: teamPositions,
                    backgroundColor: posColors,
                    borderRadius: 6,
                    borderSkipped: false
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: {
                        reverse: true,
                        title: { display: true, text: "Grid Position" },
                        min: 1,
                        ticks: { stepSize: 1 }
                    },
                    x: { grid: { display: false } }
                }
            }
        });

        var gap = data.bestScore - data.userScore;
        charts.fantasyScore = new Chart(getEl("fantasyScoreChart"), {
            type: "doughnut",
            data: {
                labels: ["Your Score", "Gap to Best"],
                datasets: [{
                    data: [data.userScore, gap > 0 ? gap : 0],
                    backgroundColor: [F1_RED, "rgba(255,255,255,0.08)"],
                    borderWidth: 0,
                    hoverOffset: 8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: "65%",
                plugins: {
                    legend: {
                        position: "bottom",
                        labels: { usePointStyle: true, pointStyle: "circle", padding: 14 }
                    }
                }
            }
        });

        var top10 = data.fullGrid || [];
        var probLabels = top10.map(function(d) { return d.driver; });
        var probValues = top10.map(function(d) { return (d.podiumProb * 100).toFixed(1); });
        var isMyPick = top10.map(function(d) { return fantasyPicks.has(d.driver); });
        var probColors = isMyPick.map(function(mine) {
            return mine ? F1_RED : "rgba(0, 210, 255, 0.7)";
        });

        charts.fantasyProb = new Chart(getEl("fantasyProbChart"), {
            type: "bar",
            data: {
                labels: probLabels,
                datasets: [{
                    label: "Podium Probability %",
                    data: probValues,
                    backgroundColor: probColors,
                    borderRadius: 4,
                    borderSkipped: false
                }]
            },
            options: {
                indexAxis: "y",
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: function(ctx) {
                                return ctx.raw + "% podium chance" + (fantasyPicks.has(ctx.label) ? " ⭐ YOUR PICK" : "");
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        title: { display: true, text: "Podium Probability %" },
                        min: 0, max: 100,
                        grid: { color: "rgba(255,255,255,0.03)" }
                    },
                    y: { grid: { display: false } }
                }
            }
        });
    })
    .catch(function (err) { console.error(err); })
    .finally(function () {
        hideLoader();
        btn.textContent = "🎲 Simulate Race";
        btn.disabled = false;
    });
}

if (getEl("btnSimulateFantasy")) {
    getEl("btnSimulateFantasy").addEventListener("click", simulateFantasy);
}


/* ═══════════════════════════════════════════════ */
/*  CHART EXPORT — Download any chart as PNG       */
/* ═══════════════════════════════════════════════ */

function exportChart(chartKey, filename) {
    var chart = charts[chartKey];
    if (!chart) return;
    var url = chart.toBase64Image("image/png", 1);
    var a = document.createElement("a");
    a.href = url;
    a.download = (filename || chartKey) + ".png";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

function addExportButton(canvasId, chartKey, filename) {
    var canvas = getEl(canvasId);
    if (!canvas) return;
    var card = canvas.closest(".chart-card");
    if (!card) return;
    // Remove existing export btn if any
    var existing = card.querySelector(".chart-export-btn");
    if (existing) existing.remove();

    var btn = document.createElement("button");
    btn.className = "chart-export-btn";
    btn.title = "Download as PNG";
    btn.innerHTML = "📥";
    btn.addEventListener("click", function (e) {
        e.stopPropagation();
        exportChart(chartKey, filename || chartKey);
    });
    card.appendChild(btn);
}


/* ═══════════════════════════════════════════════ */
/*  HEAD TO HEAD — Driver Comparison               */
/* ═══════════════════════════════════════════════ */

var h2hDriversLoaded = {};

function loadH2HDrivers() {
    var year = getEl("h2hYear").value;
    if (h2hDriversLoaded[year]) return;

    fetchJSON("/api/h2h/drivers?year=" + year)
        .then(function (data) {
            var sel1 = getEl("h2hD1");
            var sel2 = getEl("h2hD2");
            sel1.innerHTML = "";
            sel2.innerHTML = "";

            data.drivers.forEach(function (d, i) {
                var opt1 = document.createElement("option");
                opt1.value = d.driver;
                opt1.textContent = d.driver + " — " + d.team;
                sel1.appendChild(opt1);

                var opt2 = document.createElement("option");
                opt2.value = d.driver;
                opt2.textContent = d.driver + " — " + d.team;
                sel2.appendChild(opt2);

                if (i === 1) opt2.selected = true;
            });
            h2hDriversLoaded[year] = true;
        })
        .catch(function () {
            getEl("h2hD1").innerHTML = "<option>Error</option>";
            getEl("h2hD2").innerHTML = "<option>Error</option>";
        });
}

function loadH2H() {
    var year = getEl("h2hYear").value;
    var d1 = getEl("h2hD1").value;
    var d2 = getEl("h2hD2").value;
    var btn = getEl("btnCompareH2H");

    if (d1 === d2) {
        alert("Please select two different drivers.");
        return;
    }

    btn.disabled = true;
    btn.textContent = "⏳ Comparing...";
    showLoader("Comparing drivers head-to-head...");

    fetchJSON("/api/h2h/compare?year=" + year + "&d1=" + d1 + "&d2=" + d2)
        .then(function (data) {
            getEl("h2hResults").style.display = "";

            // Banner
            getEl("h2hCode1").textContent = data.d1.code;
            getEl("h2hTeam1").textContent = data.d1.team;
            getEl("h2hWins1").textContent = data.headToHead.d1Wins;
            getEl("h2hCode2").textContent = data.d2.code;
            getEl("h2hTeam2").textContent = data.d2.team;
            getEl("h2hWins2").textContent = data.headToHead.d2Wins;

            // Stats grid
            var stats = [
                { label: "Wins", v1: data.d1.stats.wins, v2: data.d2.stats.wins },
                { label: "Podiums", v1: data.d1.stats.podiums, v2: data.d2.stats.podiums },
                { label: "Avg Finish", v1: data.d1.stats.avgFinish, v2: data.d2.stats.avgFinish, lower: true },
                { label: "Avg Grid", v1: data.d1.stats.avgGrid, v2: data.d2.stats.avgGrid, lower: true },
                { label: "Points", v1: data.d1.stats.points, v2: data.d2.stats.points },
                { label: "Best Finish", v1: data.d1.stats.bestFinish, v2: data.d2.stats.bestFinish, lower: true },
                { label: "DNFs", v1: data.d1.stats.dnfs, v2: data.d2.stats.dnfs, lower: true },
                { label: "Races", v1: data.d1.stats.races, v2: data.d2.stats.races },
            ];

            var statsHtml = "";
            stats.forEach(function (s) {
                var total = Math.abs(s.v1) + Math.abs(s.v2);
                var pctLeft = total > 0 ? (Math.abs(s.v1) / total * 100) : 50;
                statsHtml +=
                    '<div class="h2h-stat-card">' +
                        '<div class="h2h-stat-val left">' + s.v1 + '</div>' +
                        '<div style="flex:1;text-align:center;">' +
                            '<div class="h2h-stat-label">' + s.label + '</div>' +
                            '<div class="h2h-stat-bar">' +
                                '<div class="h2h-bar-fill-left" style="width:' + pctLeft + '%"></div>' +
                                '<div class="h2h-bar-fill-right" style="width:' + (100 - pctLeft) + '%"></div>' +
                            '</div>' +
                        '</div>' +
                        '<div class="h2h-stat-val right">' + s.v2 + '</div>' +
                    '</div>';
            });
            getEl("h2hStatsGrid").innerHTML = statsHtml;

            // Radar Chart
            if (charts.h2hRadar) charts.h2hRadar.destroy();
            var radarLabels = ["Speed", "Consistency", "Qualifying", "Race Pace", "Overtaking"];
            var r1 = data.d1.radar;
            var r2 = data.d2.radar;

            charts.h2hRadar = new Chart(getEl("h2hRadarChart"), {
                type: "radar",
                data: {
                    labels: radarLabels,
                    datasets: [
                        {
                            label: data.d1.code,
                            data: [r1.speed, r1.consistency, r1.qualifying, r1.racePace, r1.overtaking],
                            borderColor: F1_RED,
                            backgroundColor: "rgba(225, 6, 0, 0.15)",
                            borderWidth: 2,
                            pointBackgroundColor: F1_RED,
                            pointRadius: 4,
                        },
                        {
                            label: data.d2.code,
                            data: [r2.speed, r2.consistency, r2.qualifying, r2.racePace, r2.overtaking],
                            borderColor: CYAN,
                            backgroundColor: "rgba(0, 210, 255, 0.15)",
                            borderWidth: 2,
                            pointBackgroundColor: CYAN,
                            pointRadius: 4,
                        },
                    ],
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        r: {
                            beginAtZero: true,
                            max: 100,
                            ticks: { display: false },
                            grid: { color: "rgba(255,255,255,0.06)" },
                            angleLines: { color: "rgba(255,255,255,0.06)" },
                            pointLabels: {
                                font: { size: 11, weight: "600", family: "'Outfit', sans-serif" },
                                color: "#9a9ab0",
                            },
                        },
                    },
                    plugins: {
                        legend: {
                            position: "bottom",
                            labels: { usePointStyle: true, pointStyle: "circle", padding: 14 },
                        },
                    },
                },
            });
            addExportButton("h2hRadarChart", "h2hRadar", "h2h_radar_" + d1 + "_vs_" + d2);

            // Race-by-Race Chart
            if (charts.h2hRace) charts.h2hRace.destroy();
            var rbrLabels = data.raceByRace.map(function (r) { return r.event; });
            var rbrD1 = data.raceByRace.map(function (r) { return r.d1Pos; });
            var rbrD2 = data.raceByRace.map(function (r) { return r.d2Pos; });

            charts.h2hRace = new Chart(getEl("h2hRaceChart"), {
                type: "line",
                data: {
                    labels: rbrLabels,
                    datasets: [
                        {
                            label: data.d1.code,
                            data: rbrD1,
                            borderColor: F1_RED,
                            backgroundColor: "rgba(225, 6, 0, 0.1)",
                            borderWidth: 2.5,
                            pointRadius: 4,
                            pointBackgroundColor: F1_RED,
                            tension: 0.2,
                            fill: false,
                        },
                        {
                            label: data.d2.code,
                            data: rbrD2,
                            borderColor: CYAN,
                            backgroundColor: "rgba(0, 210, 255, 0.1)",
                            borderWidth: 2.5,
                            pointRadius: 4,
                            pointBackgroundColor: CYAN,
                            tension: 0.2,
                            fill: false,
                        },
                    ],
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: "bottom",
                            labels: { usePointStyle: true, pointStyle: "circle", padding: 14 },
                        },
                    },
                    scales: {
                        y: {
                            reverse: true,
                            min: 1,
                            title: { display: true, text: "Finish Position" },
                            ticks: { stepSize: 1 },
                            grid: { color: "rgba(255,255,255,0.03)" },
                        },
                        x: {
                            ticks: { maxRotation: 45 },
                        },
                    },
                },
            });
            addExportButton("h2hRaceChart", "h2hRace", "h2h_races_" + d1 + "_vs_" + d2);
        })
        .catch(function (err) { console.error(err); })
        .finally(function () {
            hideLoader();
            btn.textContent = "⚔️ Compare";
            btn.disabled = false;
        });
}

if (getEl("h2hYear")) {
    getEl("h2hYear").addEventListener("change", debounce(function () {
        h2hDriversLoaded = {};
        loadH2HDrivers();
    }, 300));
}
if (getEl("btnCompareH2H")) {
    getEl("btnCompareH2H").addEventListener("click", debounce(loadH2H, 300));
}


/* ═══════════════════════════════════════════════ */
/*  LAP TIMES — Race Analysis                      */
/* ═══════════════════════════════════════════════ */

var ltData = null;
var ltSelectedDrivers = new Set();
var LT_DRIVER_COLORS = [
    "#e10600", "#00d2ff", "#7b2ff7", "#00e676", "#ff8800",
    "#ff6b9d", "#ffc906", "#39b54a", "#ff4081", "#00bcd4",
    "#e040fb", "#b388ff", "#82b1ff", "#a7ffeb", "#ffe57f",
];

function loadLTSessions() {
    var year = getEl("ltYear").value;
    fetchJSON("/api/laptimes/sessions?year=" + year)
        .then(function (data) {
            var sel = getEl("ltRace");
            sel.innerHTML = "";
            data.events.forEach(function (ev) {
                var opt = document.createElement("option");
                opt.value = ev.round;
                opt.textContent = "R" + ev.round + " — " + ev.name;
                sel.appendChild(opt);
            });
        })
        .catch(function () {
            getEl("ltRace").innerHTML = "<option>Error</option>";
        });
}

function loadLapTimes() {
    var year = getEl("ltYear").value;
    var round = getEl("ltRace").value;
    var btn = getEl("btnLoadLapTimes");

    btn.disabled = true;
    btn.textContent = "⏳ Loading lap data...";
    showLoader("Analyzing lap time data...");

    fetchJSON("/api/laptimes/analysis?year=" + year + "&round=" + round)
        .then(function (data) {
            ltData = data;
            getEl("ltResults").style.display = "";

            // Pre-select top 5 drivers
            ltSelectedDrivers.clear();
            data.drivers.slice(0, 5).forEach(function (d) {
                ltSelectedDrivers.add(d.driver);
            });

            renderLTDriverGrid();
            renderLTCharts();
            renderLTFastest();
        })
        .catch(function (err) { console.error(err); })
        .finally(function () {
            hideLoader();
            btn.textContent = "⏱️ Analyze";
            btn.disabled = false;
        });
}

function renderLTDriverGrid() {
    var grid = getEl("ltDriverGrid");
    var html = "";
    ltData.drivers.forEach(function (d) {
        var active = ltSelectedDrivers.has(d.driver) ? " active" : "";
        html +=
            '<label class="driver-checkbox' + active + '" data-driver="' + d.driver + '">' +
                '<span class="check-dot"></span>' +
                '<input type="checkbox" ' + (active ? "checked" : "") + '>' +
                d.driver +
            '</label>';
    });
    grid.innerHTML = html;

    grid.querySelectorAll(".driver-checkbox").forEach(function (el) {
        el.addEventListener("click", function () {
            var drv = this.dataset.driver;
            if (ltSelectedDrivers.has(drv)) {
                ltSelectedDrivers.delete(drv);
            } else {
                ltSelectedDrivers.add(drv);
            }
            renderLTDriverGrid();
            renderLTCharts();
        });
    });
}

function renderLTCharts() {
    if (!ltData) return;

    var compoundColors = ltData.compoundColors || {
        SOFT: "#e10600", MEDIUM: "#ffc906", HARD: "#f0f0f0",
        INTERMEDIATE: "#43b02a", WET: "#0072c6", UNKNOWN: "#888888",
    };

    // Lap time scatter chart
    if (charts.ltLap) charts.ltLap.destroy();
    var datasets = [];
    var colorIdx = 0;

    ltSelectedDrivers.forEach(function (drv) {
        var laps = ltData.driverLaps[drv];
        if (!laps) return;
        var color = LT_DRIVER_COLORS[colorIdx % LT_DRIVER_COLORS.length];
        colorIdx++;

        var pointColors = laps.map(function (l) {
            return compoundColors[l.compound] || "#888";
        });

        datasets.push({
            label: drv,
            data: laps.map(function (l) { return { x: l.lap, y: l.time }; }),
            borderColor: color,
            backgroundColor: color,
            pointBackgroundColor: pointColors,
            pointBorderColor: color,
            pointRadius: 3.5,
            pointBorderWidth: 1,
            borderWidth: 1.5,
            showLine: true,
            tension: 0.1,
            fill: false,
        });
    });

    charts.ltLap = new Chart(getEl("ltLapChart"), {
        type: "scatter",
        data: { datasets: datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 400 },
            plugins: {
                legend: {
                    position: "bottom",
                    labels: { usePointStyle: true, pointStyle: "circle", padding: 12 },
                },
                tooltip: {
                    callbacks: {
                        label: function (ctx) {
                            var drv = ctx.dataset.label;
                            var laps = ltData.driverLaps[drv];
                            var lap = laps ? laps[ctx.dataIndex] : null;
                            var compound = lap ? lap.compound : "?";
                            return drv + " — Lap " + ctx.parsed.x + ": " + ctx.parsed.y.toFixed(3) + "s (" + compound + ")";
                        },
                    },
                },
            },
            scales: {
                x: {
                    title: { display: true, text: "Lap Number" },
                    ticks: { stepSize: 5 },
                },
                y: {
                    title: { display: true, text: "Lap Time (s)" },
                    grid: { color: "rgba(255,255,255,0.03)" },
                },
            },
        },
    });
    addExportButton("ltLapChart", "ltLap", "laptimes_" + ltData.eventName);

    // Compound bar chart
    if (charts.ltCompound) charts.ltCompound.destroy();
    var compStats = ltData.compoundStats || {};
    var compLabels = Object.keys(compStats);
    var compAvgs = compLabels.map(function (c) { return compStats[c].avg; });
    var compBgColors = compLabels.map(function (c) { return compStats[c].color || "#888"; });

    charts.ltCompound = new Chart(getEl("ltCompoundChart"), {
        type: "bar",
        data: {
            labels: compLabels,
            datasets: [{
                label: "Avg Lap Time (s)",
                data: compAvgs,
                backgroundColor: compBgColors,
                borderRadius: 6,
                borderSkipped: false,
            }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: {
                    title: { display: true, text: "Seconds" },
                    grid: { color: "rgba(255,255,255,0.03)" },
                },
                x: { grid: { display: false } },
            },
        },
    });
    addExportButton("ltCompoundChart", "ltCompound", "compound_pace_" + ltData.eventName);

    // Stint degradation chart
    if (charts.ltStint) charts.ltStint.destroy();
    var stintDatasets = [];
    colorIdx = 0;

    ltSelectedDrivers.forEach(function (drv) {
        var stints = ltData.driverStints[drv];
        var laps = ltData.driverLaps[drv];
        if (!laps) return;
        var color = LT_DRIVER_COLORS[colorIdx % LT_DRIVER_COLORS.length];
        colorIdx++;

        // Group laps by stint for coloring
        if (stints && stints.length > 0) {
            stints.forEach(function (stint, si) {
                var stintLaps = laps.filter(function (l) {
                    return l.lap >= stint.startLap && l.lap <= stint.endLap;
                });
                var compColor = compoundColors[stint.compound] || color;
                stintDatasets.push({
                    label: drv + " — " + stint.compound + " (Stint " + (si + 1) + ")",
                    data: stintLaps.map(function (l) { return { x: l.lap, y: l.time }; }),
                    borderColor: compColor,
                    backgroundColor: "transparent",
                    borderWidth: 2,
                    pointRadius: 2.5,
                    pointBackgroundColor: compColor,
                    tension: 0.2,
                    showLine: true,
                });
            });
        }
    });

    charts.ltStint = new Chart(getEl("ltStintChart"), {
        type: "scatter",
        data: { datasets: stintDatasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 400 },
            plugins: {
                legend: {
                    position: "bottom",
                    labels: { usePointStyle: true, pointStyle: "circle", padding: 10, font: { size: 10 } },
                },
            },
            scales: {
                x: {
                    title: { display: true, text: "Lap Number" },
                    ticks: { stepSize: 5 },
                },
                y: {
                    title: { display: true, text: "Lap Time (s)" },
                    grid: { color: "rgba(255,255,255,0.03)" },
                },
            },
        },
    });
    addExportButton("ltStintChart", "ltStint", "stint_degradation_" + ltData.eventName);
}

function renderLTFastest() {
    if (!ltData || !ltData.fastestLaps) return;
    var html = "";
    ltData.fastestLaps.forEach(function (lap) {
        var rankClass = lap.rank === 1 ? "gold" : lap.rank === 2 ? "silver" : lap.rank === 3 ? "bronze" : "";
        html +=
            '<div class="pred-item">' +
                '<div class="pred-rank ' + rankClass + '">' + lap.rank + '</div>' +
                '<div class="pred-info">' +
                    '<div class="pred-driver">' + lap.driver + '</div>' +
                    '<div class="pred-team">' +
                        '<span class="compound-badge compound-' + lap.compound + '"></span>' +
                        lap.compound + ' · Lap ' + lap.lap +
                    '</div>' +
                '</div>' +
                '<div class="pred-prob" style="color:var(--accent-cyan);font-variant-numeric:tabular-nums;">' + lap.timeFormatted + '</div>' +
            '</div>';
    });
    getEl("ltFastestList").innerHTML = html;
}

if (getEl("ltYear")) {
    getEl("ltYear").addEventListener("change", debounce(loadLTSessions, 300));
}
if (getEl("btnLoadLapTimes")) {
    getEl("btnLoadLapTimes").addEventListener("click", debounce(loadLapTimes, 300));
}


/* ═══════════════════════════════════════════════ */
/*  CALENDAR — Race Calendar + Countdown           */
/* ═══════════════════════════════════════════════ */

var countdownInterval = null;

function loadCalendar() {
    var year = getEl("calYear").value;
    var btn = getEl("btnLoadCalendar");

    btn.disabled = true;
    btn.textContent = "⏳ Loading...";
    showLoader("Loading race calendar...");

    fetchJSON("/api/calendar/season?year=" + year)
        .then(function (data) {
            getEl("calResults").style.display = "";
            getEl("calCompleted").textContent = data.completedRaces;
            getEl("calRemaining").textContent = data.totalRaces - data.completedRaces;
            getEl("calTotal").textContent = data.totalRaces;

            // Countdown
            if (data.nextRace) {
                getEl("countdownCard").style.display = "";
                getEl("countdownRace").textContent = data.nextRace.flag + " " + data.nextRace.name;
                getEl("countdownMeta").textContent = data.nextRace.date + " · " + data.nextRace.country;

                if (countdownInterval) clearInterval(countdownInterval);
                var remaining = data.nextRace.countdownSeconds;

                function updateCountdown() {
                    if (remaining <= 0) {
                        getEl("cdDays").textContent = "00";
                        getEl("cdHours").textContent = "00";
                        getEl("cdMins").textContent = "00";
                        getEl("cdSecs").textContent = "00";
                        if (countdownInterval) clearInterval(countdownInterval);
                        return;
                    }
                    var d = Math.floor(remaining / 86400);
                    var h = Math.floor((remaining % 86400) / 3600);
                    var m = Math.floor((remaining % 3600) / 60);
                    var s = remaining % 60;
                    getEl("cdDays").textContent = String(d).padStart(2, "0");
                    getEl("cdHours").textContent = String(h).padStart(2, "0");
                    getEl("cdMins").textContent = String(m).padStart(2, "0");
                    getEl("cdSecs").textContent = String(s).padStart(2, "0");
                    remaining--;
                }
                updateCountdown();
                countdownInterval = setInterval(updateCountdown, 1000);
            } else {
                getEl("countdownCard").style.display = "none";
            }

            // Race cards
            var html = "";
            data.races.forEach(function (race) {
                var statusClass = race.status;
                var podiumHtml = "";
                if (race.status === "completed" && race.podium.length > 0) {
                    podiumHtml = '<div class="race-podium">';
                    race.podium.forEach(function (p, i) {
                        var posClass = i === 0 ? "p1" : i === 1 ? "p2" : "p3";
                        podiumHtml +=
                            '<div class="race-podium-item">' +
                                '<span class="race-podium-pos ' + posClass + '">P' + (i + 1) + '</span>' +
                                '<span>' + p.driver + '</span>' +
                            '</div>';
                    });
                    podiumHtml += '</div>';
                } else if (race.status === "next") {
                    podiumHtml = '<div class="race-upcoming-label">🏁 Next up on the calendar</div>';
                } else {
                    podiumHtml = '<div class="race-upcoming-label">Upcoming</div>';
                }

                html +=
                    '<div class="race-card ' + statusClass + '">' +
                        '<div class="race-card-header">' +
                            '<span class="race-round">R' + race.round + '</span>' +
                            '<span class="race-flag">' + race.flag + '</span>' +
                            '<span class="race-name">' + race.name.replace(" Grand Prix", " GP") + '</span>' +
                        '</div>' +
                        '<div class="race-date">📅 ' + race.date + '</div>' +
                        podiumHtml +
                    '</div>';
            });
            getEl("calGrid").innerHTML = html;
        })
        .catch(function (err) { console.error(err); })
        .finally(function () {
            hideLoader();
            btn.textContent = "📅 Load Calendar";
            btn.disabled = false;
        });
}

if (getEl("btnLoadCalendar")) {
    getEl("btnLoadCalendar").addEventListener("click", loadCalendar);
}


/* ═══════════════════════════════════════════════ */
/*  TAB INIT — Wire up new tabs                    */
/* ═══════════════════════════════════════════════ */

// Re-bind tab click handlers to include new tabs
document.querySelectorAll(".tab-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
        if (btn.dataset.tab === "h2h" && !h2hDriversLoaded[getEl("h2hYear").value]) loadH2HDrivers();
        if (btn.dataset.tab === "laptimes" && getEl("ltRace").options.length <= 1) loadLTSessions();
    });
});

// Defer Part1 load so the page shell renders first
requestAnimationFrame(function () {
    loadPart1();
});

