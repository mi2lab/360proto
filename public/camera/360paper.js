let room;
let mode = document.getElementById("360paper-js").getAttribute("data-mode") || "";
let capturing = false;
let previewing = false;

// elements
const
  gridEl = document.querySelector("#grid"),
  sceneEl = document.querySelector("#scene"),
  cameraEl = document.querySelector("#camera"),
  faceMaskEl = document.querySelector("#face-mask"),
  hiroMarkerEl = document.querySelector("#hiro-marker"),
  kanjiMarkerEl = document.querySelector("#kanji-marker"),
  previewCanvasEl = document.querySelector("#preview-canvas");

let liveCanvasEl;

const
  captureCanvasEl = document.createElement("canvas"),
  captureCanvasCtx = captureCanvasEl.getContext("2d"),
  studioStreamEl = document.createElement("video");

let webrtc;

function init() {

  if (!window.webcamEl) {
    debug("waiting for webcam");
    setTimeout(init, 500);
    return;
  }

  // for debugging
  /*setTimeout(function() { // wait a sec before installing this
    studioStreamEl.setAttribute("autoplay", "");
    studioStreamEl.style.position = "absolute";
    studioStreamEl.style.bottom = 0;
    studioStreamEl.style.width = "128px";
    studioStreamEl.style.height = "78px";
    studioStreamEl.style.zIndex = 100000;
    document.querySelector("body").prepend(studioStreamEl);
  }, 1000);*/

  setRoom(location.hash.substring(1) || localStorage.getItem("room"));

  setInterval(function() {
    if (capturing) {
      captureCanvasCtx.drawImage(webcamEl, 0, 0);
    }
    if (liveCanvasEl && studioStreamEl.srcObject) {
      liveCanvasEl.width = studioStreamEl.videoWidth;
      liveCanvasEl.height = studioStreamEl.videoHeight;
      liveCanvasEl.getContext("2d").drawImage(studioStreamEl, 0, 0);
    }
  }, 1000 / 60);

  let pressing, holding;

  $(function() {

    //$(sceneEl).on("enter-vr", startPreview);
    $(sceneEl).on("exit-vr", stopPreview);

    $("#capture-pane")
      .on("pointerdown", function() {

        if ($("#room").is(":visible")) return; // prevent capture when editing room

        holding = setTimeout(function() {
          if (pressing) {
            stopPreview();
            startCapture();
          }
        }, 1000);

        pressing = true;
      })
      .on("pointerup", function() {
        pressing = false;

        if (capturing) {
          stopCapture();
        } else if (previewing) {
          stopPreview();
        } else {
          $("#take-snapshot").click();
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

    $("#toggle-360").click(function() {
      if (mode != "f") {
        $(gridEl).toggle();
        $(this).toggleClass("selected");
        mode = $(gridEl).is(":visible") ? "360" : "";
      } else {
        location.replace("index.html");
      }
    });

    $("#toggle-vr").click(function() {
      if (mode == "" || mode == "360") {
        mode = "vr";
        $(this).addClass("selected");
        webcamBinocular = true;
      } else {
        location.replace("index.html");
      }
    });

    $("#toggle-marker").click(function() {
      if (mode != "m") {
        location.replace("marker.html");
      } else {
        location.replace("index.html");
      }
    });

    let autoInterval;

    $("#toggle-marker-auto").click(function() {
      if (mode != "ma") {
        mode = "ma";
        autoInterval = setInterval(function() {
          if (hiroMarkerEl.object3D.visible || kanjiMarkerEl.object3D.visible) {
            startCapture();
          } else {
            stopCapture();
          }
        }, 1000 / 60);
      } else {
        mode = "m";
        stopCapture();
        clearInterval(autoInterval);
      }
      $(this).toggleClass("selected", mode == "ma");
    });

    $("#toggle-face").click(function() {
      if (mode != "f") {
        location.replace("face.html");
      } else {
        location.replace("index.html");
      }
    });

    $("#take-snapshot").click(function() {
      startPreview();
      saveDataURL(toDataURL(webcamEl), function(f) {
        sendAction("snapshot", {
          src: f,
          mode: mode // TODO use mode to auto-fill respective layer in Studio
        });
      });
    });

  });

  Device.orientationHandler = function(o) {
    var deg = Math.abs(Math.floor(o.getXDeg()));
    if (deg < 5 && previewing && !waiting) {
      stopPreview();
    }
  };
}

function initWebRTC() {
  debug(`entering room "${room}"`);

  webrtc = new WebRTC({
    //log: true,
    room: `360paper/camera/${room}`,
    stream: captureCanvasEl.captureStream(),
    onstream: function(stream) {
      console.log("got studio stream", stream);
      studioStreamEl.srcObject = stream;
    },
    ondata: function(e) {
      if (e.sender != "360paper/studio") return; // ignore other messages
      console.log("webrtc", e);
      if (e.action == "init") {
        loadCanvas(document.querySelector("#face-mask-canvas"), e.detail.faceMask);
        loadCanvas(document.querySelector("#hiro-marker-canvas"), e.detail.faceMask);
        loadCanvas(document.querySelector("#kanji-marker-canvas"), e.detail.faceMask);
        debug("ready");
      } else if (e.action == "load") {
        loadCanvas(document.querySelector(`${e.detail.target}-canvas`), e.detail.src);
      } else if (e.action == "live") {
        liveCanvasEl = e.detail.target ? document.querySelector(`${e.detail.target}-canvas`) : null;
      }
    }
  });

  setTimeout(function() {
    sendAction("init");
  }, 2500);
}

function setRoom(value) {
  room = value || "";
  $("#room").val(room);

  localStorage.setItem("room", room);
  location.hash = room;

  studioStreamEl.srcObject = null;

  initWebRTC();
}

function startCapture() {
  if (capturing) return;

  $("#capture-pane").addClass("live");

  capturing = true;
  debug("capturing");

  captureCanvasEl.width = webcamEl.videoWidth || webcamEl.width;
  captureCanvasEl.height = webcamEl.videoHeight || webcamEl.height;

  sendAction("capture", {
    width: captureCanvasEl.width,
    height: captureCanvasEl.height
  });
}

function stopCapture() {
  if (!capturing) return;

  $("#capture-pane").removeClass("live");

  capturing = false;
  debug("ready");

  sendAction("capture");
}

function startPreview() {
  if (!previewCanvasEl) return;

  if (mode == "360" || mode == "vr") {
    $(gridEl).fadeOut();

    previewCanvasEl.width = webcamEl.videoWidth || webcamEl.width;
    previewCanvasEl.height = webcamEl.videoHeight || webcamEl.height;
    previewCanvasEl.getContext("2d").drawImage(webcamEl, 0, 0);

    wait();
    previewing = true;
    if (webcamBinocular) {
      sceneEl.enterVR();
    }
  }
}

function stopPreview() {
  if (!previewCanvasEl) return;

  previewCanvasEl.getContext("2d").clearRect(0, 0, previewCanvasEl.width, previewCanvasEl.height);

  sceneEl.exitVR();
  previewing = false;

  $(gridEl).fadeIn();
}

/* helper functions */

function sendAction(action, detail) {
  let data = {
    sender: "360paper/camera",
    action: action
  };
  if (detail) {
    data.detail = detail;
  }
  webrtc.send(data);
}

let waiting;

function wait(millis) {
  if (waiting) done();
  waiting = setTimeout(done, millis || 1000);
}

function done() {
  waiting = clearTimeout(waiting);
}

debug("loading");
require(["jquery", "camera", "device", "webrtc"]).then(init);