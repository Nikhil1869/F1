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

function showLoader() {
    getEl("loadingOverlay").classList.add("show");
}

function hideLoader() {
    getEl("loadingOverlay").classList.remove("show");
}

function fetchJSON(url, opts) {
    return fetch(url, opts).then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
    });
}


document.querySelectorAll(".tab-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
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
    });
});


function loadPart1() {
    showLoader();
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


function loadPart2() {
    var d1 = getEl("selD1").value;
    var d2 = getEl("selD2").value;

    showLoader();
    fetchJSON("/api/data/telemetry?d1=" + d1 + "&d2=" + d2)
        .then(function (data) {
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
        })
        .catch(function (err) { console.error(err); })
        .finally(hideLoader);
}

getEl("btnLoadTelemetry").addEventListener("click", loadPart2);


getEl("btnRunBaseline").addEventListener("click", function () {
    var btn = getEl("btnRunBaseline");
    btn.disabled = true;
    btn.textContent = "⏳ Training model...";
    showLoader();

    fetchJSON("/api/ml/predict")
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
            btn.textContent = "🚀 Run Baseline Model";
            btn.disabled = false;
        });
});


getEl("btnRunAdvanced").addEventListener("click", function () {
    var btn = getEl("btnRunAdvanced");
    btn.disabled = true;
    btn.textContent = "⏳ Tuning hyperparameters...";
    showLoader();

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
    })
    .catch(function () {
        addChatMessage("⚠️ Connection error. Is the server running?", false);
    });
}

getEl("btnSendChat").addEventListener("click", sendChat);
getEl("chatInput").addEventListener("keydown", function (e) {
    if (e.key === "Enter") sendChat();
});

loadPart1();
