let room;
let xr = document.getElementById("360paper-js").getAttribute("data-xr") || "vr";
let running = xr == "ar"; // ar is auto running

// elements
const
  sceneEl = document.querySelector("#scene"),
  cameraEl = document.querySelector("#camera"),
  controllerEl = document.querySelector("#controller"),
  backgroundEl = document.querySelector("#background"),
  midgroundEl = document.querySelector("#midground"),
  foregroundEl = document.querySelector("#foreground");

let liveCanvasEl;

let studioStreamEl = document.createElement("video");
studioStreamEl.id = "studio-video";
studioStreamEl.setAttribute("autoplay", "");

let webcamEl, webrtc;

function init() {

  let canvasEls = document.getElementsByTagName("canvas");
  if (xr == "ar") {
    if (canvasEls.length > 1) {
      webcamEl = canvasEls[0];
    }

    if (!webcamEl) {
      debug("waiting for webcam");
      setTimeout(init, 500);
      return;
    }

    /*var v = document.createElement("video");
    v.setAttribute("autoplay", "");
    v.srcObject = webcamEl.captureStream();
    document.querySelector("body").prepend(v);*/

    document.querySelector("body").prepend(studioStreamEl);
  }

  setRoom(location.hash.substring(1) || localStorage.getItem("room"));

  setInterval(function() {
    if (liveCanvasEl && studioStreamEl.srcObject) {
      liveCanvasEl.getContext("2d").drawImage(studioStreamEl, 0, 0, liveCanvasEl.width, liveCanvasEl.height);
    }

    //if (running) {
    sendChange(cameraEl, "position");
    sendChange(cameraEl, "rotation");

    //if (xr == "vr") {
    sendChange(controllerEl, "position");
    sendChange(controllerEl, "rotation");
    //}
    //}
  }, 1000 / 60);

  $(function() {

    sceneEl.addEventListener("exit-vr", function() {
      if ($("#toggle-run").is(".selected")) {
        $("#toggle-run").click();
      }
    });

    $("#room")
      .blur(function() {
        $("#toggle-room").click();
      })
      .change(function() {
        $(this).hide();

        setRoom($(this).val());
      });

    $("#toggle-room").click(function() {
      $(this).toggleClass("selected");
      $("#room").toggle().focus();
    });

    $("#toggle-run").click(function() {
      running = !running;
      debug(running ? "starting" : "ready");

      $(this).toggleClass("selected", running);
      $("i", this).toggleClass("fa-play", !running);
      $("i", this).toggleClass("fa-pause", running);

      if (xr == "vr" && running) {
        sceneEl.enterVR();
      }
    });

    $("#toggle-xr").click(function() {
      if (xr == "vr") {
        location.replace("ar.html");
      } else {
        location.replace("index.html");
      }
    });

    $("#controller-model").on("load", function() {
      document.querySelector("#controller-model").setAttribute("model", isEmptySource(this));
    });
  });
}

function initWebRTC() {
  debug(`entering room "${room}"`);

  webrtc = window.webrtc = new WebRTC({
    //log: true,
    room: `360paper/app/${room}`,
    stream: webcamEl ? webcamEl.captureStream() : null,
    onstream: function(stream) {
      console.log("got studio stream", stream);
      studioStreamEl.srcObject = stream;
      if (xr == "ar") {
        // hide original video to make things faster in AR
        //webcamEl.style.left = -webcamEl.width;
      }
    },
    ondata: function(e) {
      if (e.sender != "360paper/studio") return; // ignore other messages
      console.log("webrtc", e);
      if (e.action == "init") {
        if (xr == "vr") {
          restoreCanvas("background-canvas", e.detail.background);
          restoreCanvas("midground-canvas", e.detail.midground);
          restoreCanvas("foreground-canvas", e.detail.foreground);
          restoreCanvas("controller-model-canvas", e.detail.controllerModel);
          restoreCanvas("controller-menu-canvas", e.detail.controllerMenu);
        }
        if (studioStreamEl.srcObject) {
          debug("ready");
        } else {
          debug("something went wrong");
        }
      } else if (e.action == "load") {
        loadCanvas(document.querySelector(`${e.detail.target}-canvas`), e.detail.src);
        if (e.detail.target == "controller-model-canvas") {
          document.querySelector("#controller-model").setAttribute("visible", !isEmptySource(e.detail.src));
        }
      } else if (e.action == "change") {
        if (e.detail.target) {
          let el = document.querySelector(e.detail.target);
          if (el) {
            el.setAttribute(e.detail.name, JSON.parse(e.detail.value));
          }
        }
      } else if (e.action == "live") {
        liveCanvasEl = e.detail.target ? document.querySelector(`${e.detail.target}-canvas`) : null;
        liveCanvasEl.width = studioStreamEl.videoWidth;
        liveCanvasEl.height = studioStreamEl.videoHeight;
      }
    }
  });

  setTimeout(function() {
    sendAction("init", {
      xr: xr
    });
  }, 2500);
}

function restoreCanvas(id, src) {
  let canvasEl = document.getElementById(id);
  if (isLiveSource(src)) {
    liveCanvasEl = canvasEl;
  } else {
    loadCanvas(canvasEl, src);
  }
}

function setRoom(value) {
  room = value || "";
  $("#room").val(room);

  localStorage.setItem("room", room);
  location.hash = room;

  studioStreamEl.srcObject = null;

  initWebRTC();
}

function sendAction(action, detail) {
  let data = {
    sender: "360paper/app",
    action: action
  };
  if (detail) {
    data.detail = detail;
  }
  webrtc.send(data);
}

function sendChange(el, name) {
  if (el) {
    sendAction("change", {
      name: name,
      value: JSON.stringify(el.getAttribute(name)),
      target: el.id ? "#" + el.id : el.tagName
    });
  }
}

let waiting;

function wait(millis) {
  if (waiting) done();
  waiting = setTimeout(done, millis || 500);
}

function done() {
  waiting = clearTimeout(waiting);
}

debug("loading");
require(["jquery", "webrtc"]).then(init);