// replay_worker.js

var canvas = null;
var ctx = null;
var canvasW = 0;
var canvasH = 0;
var dpr = 1;

var raceData = null;
var trackScale = 1;
var trackOffsetX = 0;
var trackOffsetY = 0;
var trackBounds = { minX: 0, maxX: 1, minY: 0, maxY: 1 };

var currentFrame = 0;
var selectedDrivers = new Set();
var hoveredDriver = null;
var showDRS = true;
var cachedShowDRS = true;
var showDriverNames = true;
var showTelemetry = false;

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

var offscreenTrack = null;
var offscreenTrackCtx = null;

function worldToCanvas(wx, wy) {
    return {
        x: wx * trackScale + trackOffsetX,
        y: wy * trackScale + trackOffsetY,
    };
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

function cacheTrack() {
    if (!raceData) return;
    if (!offscreenTrack) {
        offscreenTrack = new OffscreenCanvas(canvasW * dpr, canvasH * dpr);
        offscreenTrackCtx = offscreenTrack.getContext("2d");
    } else {
        offscreenTrack.width = canvasW * dpr;
        offscreenTrack.height = canvasH * dpr;
    }
    offscreenTrackCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    offscreenTrackCtx.clearRect(0, 0, canvasW, canvasH);

    var bgGrad = offscreenTrackCtx.createRadialGradient(canvasW / 2, canvasH / 2, 0, canvasW / 2, canvasH / 2, canvasW * 0.6);
    bgGrad.addColorStop(0, "#12121c");
    bgGrad.addColorStop(1, "#0a0a0f");
    offscreenTrackCtx.fillStyle = bgGrad;
    offscreenTrackCtx.fillRect(0, 0, canvasW, canvasH);

    var track = raceData.track;
    if (!track || track.length < 2) return;

    offscreenTrackCtx.beginPath();
    var p0 = worldToCanvas(track[0][0], track[0][1]);
    offscreenTrackCtx.moveTo(p0.x, p0.y);
    for (var i = 1; i < track.length; i++) {
        var p = worldToCanvas(track[i][0], track[i][1]);
        offscreenTrackCtx.lineTo(p.x, p.y);
    }
    offscreenTrackCtx.strokeStyle = "rgba(255, 255, 255, 0.08)";
    offscreenTrackCtx.lineWidth = 14;
    offscreenTrackCtx.lineCap = "round";
    offscreenTrackCtx.lineJoin = "round";
    offscreenTrackCtx.stroke();

    if (showDRS && raceData.drsZones) {
        for (var z = 0; z < raceData.drsZones.length; z++) {
            var zone = raceData.drsZones[z];
            if (zone.length < 2) continue;
            offscreenTrackCtx.beginPath();
            var zp0 = worldToCanvas(zone[0][0], zone[0][1]);
            offscreenTrackCtx.moveTo(zp0.x, zp0.y);
            for (var zi = 1; zi < zone.length; zi++) {
                var zp = worldToCanvas(zone[zi][0], zone[zi][1]);
                offscreenTrackCtx.lineTo(zp.x, zp.y);
            }
            offscreenTrackCtx.strokeStyle = "rgba(46, 204, 113, 0.4)";
            offscreenTrackCtx.lineWidth = 16;
            offscreenTrackCtx.stroke();
        }
    }

    offscreenTrackCtx.beginPath();
    offscreenTrackCtx.moveTo(p0.x, p0.y);
    for (var i = 1; i < track.length; i++) {
        var p = worldToCanvas(track[i][0], track[i][1]);
        offscreenTrackCtx.lineTo(p.x, p.y);
    }
    offscreenTrackCtx.strokeStyle = "rgba(255, 255, 255, 0.18)";
    offscreenTrackCtx.lineWidth = 6;
    offscreenTrackCtx.stroke();

    offscreenTrackCtx.beginPath();
    offscreenTrackCtx.moveTo(p0.x, p0.y);
    for (var i = 1; i < track.length; i++) {
        var p = worldToCanvas(track[i][0], track[i][1]);
        offscreenTrackCtx.lineTo(p.x, p.y);
    }
    offscreenTrackCtx.strokeStyle = "rgba(225, 6, 0, 0.12)";
    offscreenTrackCtx.lineWidth = 2;
    offscreenTrackCtx.stroke();

    var sfP = worldToCanvas(track[0][0], track[0][1]);
    var p1 = worldToCanvas(track[1][0], track[1][1]);
    var dx = p1.x - sfP.x;
    var dy = p1.y - sfP.y;
    var len = Math.sqrt(dx*dx + dy*dy) || 1;
    
    offscreenTrackCtx.save();
    offscreenTrackCtx.translate(sfP.x, sfP.y);
    var angle = Math.atan2(dy, dx);
    offscreenTrackCtx.rotate(angle);
    
    offscreenTrackCtx.fillStyle = "#fff";
    offscreenTrackCtx.fillRect(-2, -10, 4, 20);
    offscreenTrackCtx.fillStyle = "#000";
    for (var c = -10; c < 10; c += 4) {
        offscreenTrackCtx.fillRect(0, c, 2, 2);
        offscreenTrackCtx.fillRect(-2, c+2, 2, 2);
    }
    offscreenTrackCtx.restore();
    cachedShowDRS = showDRS;
}

function setRaceData(data) {
    raceData = data;
    driverCurrentPos = {};
    driverTargetPos = {};

    var track = raceData && raceData.track ? raceData.track : [];
    if (track.length > 0) {
        var xs = track.map(function(p) { return p[0]; });
        var ys = track.map(function(p) { return p[1]; });
        trackBounds.minX = Math.min.apply(null, xs);
        trackBounds.maxX = Math.max.apply(null, xs);
        trackBounds.minY = Math.min.apply(null, ys);
        trackBounds.maxY = Math.max.apply(null, ys);
    }

    if (canvasW && canvasH) {
        updateTrackTransform();
        cacheTrack();
        renderFrame();
    }
}

function renderFrame() {
    if (!ctx) return;
    ctx.clearRect(0, 0, canvasW, canvasH);

    if (offscreenTrack) {
        ctx.drawImage(offscreenTrack, 0, 0, canvasW * dpr, canvasH * dpr, 0, 0, canvasW, canvasH);
    }

    drawDrivers();
    drawSafetyCar();
}

function drawDrivers() {
    if (!raceData || !raceData.frames || currentFrame >= raceData.frames.length) return;

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

        if (isOut) ctx.globalAlpha = 0.3;

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
            ctx.font = (isSelected ? "bold " : "") + "10px sans-serif";
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
            ctx.font = "bold 9px monospace";
            ctx.textAlign = "left";
            ctx.fillText((dData.speed || 0) + " km/h", canvasPos.x + 14, canvasPos.y - 12);
            ctx.fillStyle = "#00e676";
            ctx.fillText("G:" + (dData.gear || "-"), canvasPos.x + 14, canvasPos.y - 1);
        }

        ctx.globalAlpha = 1.0;
    }
}

function drawSafetyCar() {
    if (!raceData || !raceData.frames || currentFrame >= raceData.frames.length) return;

    var frame = raceData.frames[currentFrame];
    var sc = frame.safety_car;

    if (!sc) return;

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

    ctx.font = "bold 11px sans-serif";
    ctx.textAlign = "center";
    ctx.fillStyle = "#FFA500";
    ctx.fillText("SC", pos.x, pos.y - 16);

    ctx.globalAlpha = 1.0;
}

self.onmessage = function (e) {
    var msg = e.data;
    
    if (msg.type === "init_canvas" || msg.type === "init") {
        canvas = msg.canvas;
        ctx = canvas.getContext("2d");
        if (msg.raceData) {
            setRaceData(msg.raceData);
        }
    } 
    else if (msg.type === "init_data") {
        setRaceData(msg.raceData);
    }
    else if (msg.type === "append_frames" || msg.type === "update_frames") {
        if (raceData && raceData.frames) {
            raceData.frames = raceData.frames.concat(msg.frames || []);
        }
    }
    else if (msg.type === "resize") {
        if (!ctx) return;
        canvasW = msg.w;
        canvasH = msg.h;
        dpr = msg.dpr;
        
        canvas.width = canvasW * dpr;
        canvas.height = canvasH * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        
        updateTrackTransform();
        if (raceData) cacheTrack();
        renderFrame();
    }
    else if (msg.type === "render") {
        if (!ctx || !raceData) return;
        currentFrame = msg.frame;
        selectedDrivers = new Set(msg.selectedDrivers);
        hoveredDriver = msg.hoveredDriver;
        showDRS = msg.showDRS;
        showDriverNames = msg.showDriverNames;
        showTelemetry = msg.showTelemetry;

        if (showDRS !== cachedShowDRS) {
            cacheTrack();
        }
        renderFrame();
    }
};
