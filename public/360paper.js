/*
  This code is proprietary information of the
	University of Michigan Information Interaction Lab.
  https://mi2lab.com
*/

let room = "";
let xr = "ar";
let render2d = false;

let running = false;
let capturing = false;

let filterColor, filterTolerance, pickFilter = false;
let inspector = false;

let aframeReady = false;
let sceneEl, cameraEl, hudEl;
let sceneCanvasEl, sceneVideoEl, appCanvasEl;

// elements
const
  trashEl = document.getElementById("trash"),
  screenEl = document.getElementById("screen"),
  foreground2dEl = document.getElementById("foreground2d"),
  midground2dEl = document.getElementById("midground2d"),
  background2dEl = document.getElementById("background2d"),
  filterEl = document.getElementById("filter"),
  captureCanvasEl = document.getElementById("capture-canvas");

const
  appStreamEl = document.querySelector("#webcam"),
  camStreamEl = document.createElement("video");

let liveEl, liveCanvasEl, captureSource = camStreamEl;

let webrtcCam, webrtcApp;

const aframeWindow = document.querySelector("#aframe").contentWindow;
document.querySelector("#aframe").addEventListener("load", function() {
  sceneEl = aframeWindow.document.querySelector("a-scene");
  cameraEl = sceneEl.querySelector("a-camera");
  hudEl = sceneEl.querySelector("#hud");

  let canvasEls = aframeWindow.document.querySelectorAll("canvas");
  sceneCanvasEl = canvasEls[canvasEls.length - 1];
  sceneVideoEl = document.createElement("video");
  sceneVideoEl.setAttribute("autoplay", "");
  sceneVideoEl.srcObject = sceneCanvasEl.captureStream();

  appCanvasEl = document.createElement("canvas");
  appCanvasEl.width = sceneCanvasEl.width;
  appCanvasEl.height = sceneCanvasEl.height;
  appCanvasEl.id = "app-canvas";
  //document.querySelector("#view-pane").appendChild(appCanvasEl); // for debugging

  // instrument elements to send changes
  let els = aframeWindow.document.querySelectorAll("#background, #midground, #foreground, #controller-model, #controller-menu, #face-mask");
  [].forEach.call(els, function(el) {
    el.addEventListener("componentchanged", function(e) {
      if (["position", "rotation"].includes(e.detail.name)) {
        sendChange(webrtcApp, e.detail.target, e.detail.name);
      }
    });
  });

  aframeReady = true;
});

setTimeout(function() {
  if (!aframeReady) {
    alert("something went wrong, aframe not ready");
    location.reload();
  }
}, 5000);

function init() {

  if (!aframeReady) { // wait if aframe isn't ready yet
    setTimeout(init, 500);
    console.warn("aframe not ready");
    return;
  }

  setRoom(localStorage.getItem("room"));

  $(function() {

    // toolbar

    $("#room").on("change", function() {
      setRoom($(this).val());
    });

    // panes

    initView();

    initScene();

    initCapture();

    initCollect();

    // keyboard shortcuts

    let resizeTimeout;

    $(window).on({
      keydown: function(e) {
        //console.log("keydown", e.keyCode);
        switch (e.keyCode) {
          case 32:
            $("#toggle-2d").click();
            break;
          case 46:
            $("#delete").click();
            break;
        }
      },
      resize: function() {
        if (resizeTimeout) return;
        resizeTimeout = setTimeout(function() {
          var stencilRatio = 1.30185;
          var w = $('#stencil').width() / stencilRatio;
          var h = $('#stencil').height() / stencilRatio;

          resize("#container", w, h);
          //resize("#scene", w, h);
          //resize("#aframe", w, h);

          resizeTimeout = clearTimeout();
        }, 1000);
      },
      beforeunload: storeSession
    });

    $(window).resize(); // let's call resize to be sure

    // drag and drop

    document.addEventListener("dragover", function(e) {
      if (e.preventDefault) {
        e.preventDefault();
      }
      e.dataTransfer.dropEffect = "none";
      return false;
    }, false);

    document.addEventListener("drop", function(e) {
      if (e.preventDefault) {
        e.preventDefault();
      }
      return false;
    }, false);

    document.addEventListener("dragend", function(e) {
      $(trashEl).fadeOut();
    });

    let els = document.querySelectorAll("#screen, #capture-canvas, #resources, .layer");
    els = [].slice.call(els);
    els.push(sceneEl);
    [].forEach.call(els, function(el) {
      if (el.id != "resources") {
        el.addEventListener("dragstart", startDrag, false);
      }

      el.addEventListener("dragover", function(e) {
        if (e.preventDefault) {
          e.preventDefault();
        }
        if (e.stopPropagation) {
          e.stopPropagation();
        }
        e.dataTransfer.dropEffect = "copy";
        return false;
      }, false);

      el.addEventListener("dragenter", function(e) {
        this.classList.add("dragover");
      }, false);

      el.addEventListener("dragleave", function(e) {
        this.classList.remove("dragover");
      }, false);

      el.addEventListener("drop", function(e) {
        if (e.preventDefault) {
          e.preventDefault();
        }
        if (e.stopPropagation) {
          e.stopPropagation();
        }
        this.classList.remove("dragover");
        if (e.dataTransfer) {
          if (e.dataTransfer.files.length) {
            addFileResources(e.dataTransfer.files, function() {
              if (el == captureCanvasEl) { // drop on capture canvas
                setCaptureSource(this);
              } else if (el == screenEl || el == sceneEl) { // drop on screen/scene
                addLayer(el, this.src);
              } else if (el.classList.contains("layer")) { // drop on layer
                if (isLiveSource(el)) {
                  setLiveSource(null);
                }
                el.src = this.src;
              }
            });
          } else {
            let sourceEl = document.querySelector(e.dataTransfer.getData("source"));
            if ((sourceEl == camStreamEl || sourceEl == captureCanvasEl) && el.classList.contains("live-target")) {
              el.src = "live.png";
            } else {
              let src = sourceEl.src || toDataURL(sourceEl);
              if (el.id == "resources") {
                addImageResource(src);
              } else if (el == captureCanvasEl) {
                if (!isLiveSource(sourceEl)) {
                  fromDataURL(src, function() {
                    setCaptureSource(this);
                  });
                } else {
                  setCaptureSource(camStreamEl);
                }
              } else if (el == screenEl || el == sceneEl) {
                if (sourceEl == camStreamEl || sourceEl == captureCanvasEl) {
                  addLayer(el, "live.png");
                } else {
                  addLayer(el, src);
                }
              } else if (el.classList.contains("layer")) {
                if (sourceEl.classList.contains("layer")) { // swap layers
                  let src2 = el.src;
                  el.src = src;
                  sourceEl.src = src2;
                } else { // dropped from resources
                  if (isLiveSource(el)) {
                    setLiveSource(null);
                  }
                  el.src = src;
                }
              }
            }
          }
        }
        return false;
      }, false);
    });

    trashEl.addEventListener("dragover", function(e) {
      if (e.preventDefault) {
        e.preventDefault();
      }
      if (e.stopPropagation) {
        e.stopPropagation();
      }
      e.dataTransfer.dropEffect = "move";
      return false;
    }, false)

    trashEl.addEventListener("drop", function(e) {
      if (e.preventDefault) {
        e.preventDefault();
      }
      let el = document.querySelector(e.dataTransfer.getData("source"));
      if (el == captureCanvasEl) {
        setCaptureSource(camStreamEl);
      } else if ($(el).is(".resource") && el != camStreamEl) {
        if ($(el).is(".selected")) {
          setCaptureSource(camStreamEl);
        }
        $(el).detach();
      } else if (el.classList.contains("layer")) {
        if (isLiveSource(el)) {
          setLiveSource();
        }
        el.src = "empty.png";
      }
      $(this).fadeOut();
      return false;
    }, false);

  });
}

function initView() {
  screenEl.width = 1920;
  screenEl.height = 1080;

  $("#toggle-inspector").click(function() {
    if (!$(".toggle-edit", aframeWindow.document).length) {
      inspector = true;
      $(this).addClass("selected");
      $("#container").addClass("fullscreen");
      $("#webcam, #screen").hide();
      aframeWindow.postMessage("INJECT_AFRAME_INSPECTOR", window.location);
      setTimeout(function() {
        $(".toggle-edit", aframeWindow.document).click(function() {
          inspector = !inspector;
          $("#toggle-inspector").toggleClass("selected", inspector);
          $("#container").toggleClass("fullscreen", inspector);
          $("#webcam").toggle(!inspector);
          if ($("#toggle-2d").is(".selected")) {
            $("#screen").toggle(!inspector);
          }
          setTimeout(function() {
            $(".toggle-edit", aframeWindow.document).toggle(inspector);
          }, 500);
        });
      }, 500);
    } else {
      $(".toggle-edit", aframeWindow.document)[0].click();
    }
  });

  $("#reset-view").click(function() {
    cameraEl.setAttribute("position", "0 1.6 1");
    cameraEl.setAttribute("rotation", "0 0 0");
  });
}

function initScene() {
  $("#toggle-2d").click(function() {
    $("#toggle-2d").toggleClass("selected");
    let selected = $("#toggle-2d").is(".selected");
    $("#toggle-2d i").toggleClass("fa-eye", selected).toggleClass("fa-eye-slash", !selected);
    $(screenEl).toggle(selected);
    hudEl.setAttribute("visible", selected);
    render2d = selected;
  });

  $("#toggle-360").click(function() {
    $(this).toggleClass("selected");
    let selected = $(this).is(".selected");
    $("i", this).toggleClass("fa-eye", selected).toggleClass("fa-eye-slash", !selected);
    let els = aframeWindow.document.querySelectorAll("#background, #midground, #foreground");
    [].forEach.call(els, function(el) {
      el.setAttribute("visible", selected);
    });
  });

  $("#toggle-arvr").click(function() {
    $(this).toggleClass("selected");
    let selected = $(this).is(".selected");
    $("i", this).toggleClass("fa-eye", selected).toggleClass("fa-eye-slash", !selected);
    let els = aframeWindow.document.querySelectorAll("#controller, #hiro-marker, #kanji-marker, #face-mask");
    [].forEach.call(els, function(el) {
      el.setAttribute("visible", selected);
    });
  });

  $("#foreground2d, #midground2d, #background2d, #foreground, #midground, #background, #controller-model, #controller-menu, #hiro-marker, #kanji-marker, #face-mask").click(function() {
    setCaptureSource(this);
  });

  $("#foreground, #midground, #background, #controller-model, #controller-menu, #hiro-marker, #kanji-marker, #face-mask").on("load", function() {
    if (isLiveSource(this)) {
      setLiveSource(this);
    } else {
      let canvasEl = aframeWindow.document.getElementById(`${this.id}-canvas`);
      if (canvasEl) {
        loadCanvas(canvasEl, this.src);
        sendAction(this.id == "hiro-marker" || this.id == "kanji-marker" || this.id == "face-mask" ? webrtcCam : webrtcApp, "load", {
          target: `#${this.id}`,
          src: this.src
        });
      }
    }
  });

  $("#controller-model").on("load", function() {
    aframeWindow.document.querySelector("#daydream-controller-model").setAttribute("visible", isEmptySource(this));
  });

  $("#foreground2d, #midground2d, #background2d").on("load", function() {
    if (isLiveSource(this)) {
      setLiveSource(this);
    }
  });

  $("#opacity2d").on("input", function(e) {
    $(screenEl).css("opacity", this.value);
  });

  $("#distance").on("input", function(e) {
    aframeWindow.document.getElementById("background").setAttribute("radius", Math.max(0.3, 3 * this.value));
    aframeWindow.document.getElementById("midground").setAttribute("radius", Math.max(0.2, 2 * this.value));
    aframeWindow.document.getElementById("foreground").setAttribute("radius", Math.max(0.1, 1 * this.value));
  });

  $("#opacity").on("input", function(e) {
    let opacity = this.value;
    $(screenEl).css("opacity", opacity);
    let els = aframeWindow.document.querySelectorAll("#background, #midground, #foreground, #hiro-marker, #kanji-marker, #controller-model");
    [].forEach.call(els, function(el) {
      el.setAttribute("opacity", opacity);
    });
  });

  $("#wireframe").on("change", function(e) {
    let wireframe = this.checked ? "true" : "false";
    let els = aframeWindow.document.querySelectorAll("#background, #midground, #foreground, #hiro-marker, #kanji-marker, #controller-model");
    [].forEach.call(els, function(el) {
      el.setAttribute("wireframe", wireframe);
    });
  });
}

function initCapture() {
  camStreamEl.setAttribute("autoplay", "");
  makeResource(camStreamEl);
  setCaptureSource(camStreamEl);

  $(captureCanvasEl).on("click mousemove touchmove", function(e) {
    let color = filterColor;

    if (pickFilter || e.type == "click") {
      let offset = $(this).offset(),
        x = (e.pageX - offset.left) * captureCanvasEl.width / captureCanvasEl.clientWidth, // adjust coordinates if render size different from client size
        y = (e.clientY - offset.top) * captureCanvasEl.height / captureCanvasEl.clientHeight,
        data = captureCanvasEl.getContext('2d').getImageData(x, y, 1, 1).data;

      color = rgbToHex(data[0], data[1], data[2]);

      $("#filter-color").val(color); // won't trigger change
    }
    if (e.type == "click") {
      filterColor = hexToRgb(color);

      $(filterEl).prop("checked", true);
      $("#pick-filter").removeClass("selected");

      pickFilter = false;
    }
  });

  filterColor = hexToRgb($("#filter-color").val());
  filterTolerance = $("#filter-tolerance").val();

  $("#filter-color").on("change", function() {
    filterColor = hexToRgb(this.value);
    if (!pickFilter) {
      $(filterEl).prop("checked", true);
    }
  });

  $("#filter-tolerance").on("input", function() {
    filterTolerance = $("#filter-tolerance").val();
    $(filterEl).prop("checked", true);
  });

  $("#pick-filter").click(function() {
    pickFilter = !pickFilter;
    $(this).toggleClass("selected", pickFilter);
  });

  $("#take-snapshot").click(function() {
    addImageResource(captureCanvasEl.toDataURL());
  });
}

function initCollect() {
  $("#upload-resource").on("change", function(e) {
    addFileResources(e.target.files);
  });

  $("#download-resource").click(function() {
    let $selected = $("#resources .selected");
    if (!$selected.length) {
      $selected = $("#resources").children();
    }
    $selected.each(function(index, resource) {
      let canvasEl;
      if (resource.userData && resource.userData.largeCanvas) {
        canvasEl = resource.userData.largeCanvas;
      } else {
        canvasEl = document.createElement("canvas");
        canvasEl.width = resource.videoWidth || resource.naturalWidth;
        canvasEl.height = resource.videoHeight || resource.naturalHeight;
        canvasEl.getContext("2d").drawImage(resource, 0, 0);
      }

      canvasEl.toBlob(function(blob) {
        saveAs(blob, "res" + index);
      });
    });
  });

  $("#remove-resource").click(function() {
    let $resource = $("#resources img.selected");
    if ($resource.length) {
      setCaptureSource(camStreamEl);
      $resource.remove();
    } else {
      if (confirm("Remove all resources?")) {
        setCaptureSource(camStreamEl);
        $("#resources img").remove();
      }
    }
  });
}

function initWebRTC() {
  debug(`entering room "${room}"`);

  webrtcCam = new WebRTC({
    //log: true,
    room: `360paper/camera/${room}`,
    stream: captureCanvasEl.captureStream(),
    onstream: function(stream) {
      console.log("got camera stream", stream);
      camStreamEl.srcObject = stream;
      setCaptureSource(camStreamEl);
    },
    ondata: function(e) {
      if (e.sender == "360paper/studio") return; // ignore own messages
      // console.log("webrtcCam", e);
      if (e.action == "init") {
        if (camStreamEl.srcObject) {
          setTimeout(function() {
            sendAction(webrtcCam, "init", {
              faceMask: document.querySelector("#face-mask").src,
              hiroMarker: document.querySelector("#hiro-marker").src,
              kanjiMarker: document.querySelector("#kanji-marker").src
            });
            debug("camera ready");
          }, 2500);
        } else {
          debug("something went wrong, camera not ready");
        }
      } else if (e.action == "capture") {
        if (e.detail) {
          setCaptureSource(camStreamEl);
          capturing = true;
          debug("capturing");
          $(camStreamEl).addClass("live");
          captureCanvasEl.width = tempCanvasEl.width = e.detail.width;
          captureCanvasEl.height = tempCanvasEl.height = e.detail.height;
        } else {
          capturing = false;
          $(camStreamEl).removeClass("live");
          debug("camera ready");
        }
      } else if (e.action == "snapshot") {
        addImageResource(e.detail.src);
      }
    }
  });

  webrtcApp = new WebRTC({
    //log: true,
    room: `360paper/app/${room}`,
    stream: appCanvasEl.captureStream(),
    onstream: function(stream) {
      console.log("got app stream", stream);
      appStreamEl.srcObject = stream;
      //setCaptureSource(appStreamEl);
    },
    ondata: function(e) {
      if (e.sender == "360paper/studio") return; // ignore own messages
      //console.log("webrtcApp", e);
      if (e.action == "init") {
        xr = e.detail.xr;

        let done = xr == "ar" ? appStreamEl.srcObject != null : true;
        if (done) {
          setTimeout(function() {
            sendAction(webrtcApp, "init", {
              background: document.querySelector("#background").src,
              midground: document.querySelector("#midground").src,
              foreground: document.querySelector("#foreground").src,
              controllerModel: document.querySelector("#controller-model").src,
              controllerMenu: document.querySelector("#controller-menu").src,
            });
            debug("app ready");
          }, 2500);
        } else {
          debug("something went wrong, app not ready");
        }
      } else if (e.action == "change") {
        if (e.detail.target) {
          let el = aframeWindow.document.querySelector(e.detail.target);
          if (el) {
            el.setAttribute(e.detail.name, JSON.parse(e.detail.value));
          }
        }
      }
    }
  });
}

// animate

const
  screenCtx = screenEl.getContext("2d"),
  captureCanvasCtx = captureCanvasEl.getContext("2d"),
  tempCanvasEl = document.createElement("canvas"),
  tempCanvasCtx = tempCanvasEl.getContext("2d");

function within(value, target, threshold) {
  return value == 0 ? true : Math.abs(target - value) < threshold;
}

(function animate() {
  requestAnimationFrame(animate);

  if (captureCanvasEl.width && captureCanvasEl.height) {
    tempCanvasCtx.drawImage(captureSource, 0, 0, tempCanvasEl.width, tempCanvasEl.height);

    let image = tempCanvasCtx.getImageData(0, 0, tempCanvasEl.width, tempCanvasEl.height),
      bmp = image.data;

    // filterEl
    if (filterEl.checked) {
      for (let x = 0; x < tempCanvasEl.width; ++x) {
        for (let y = 0; y < tempCanvasEl.height; ++y) {
          let i = (x + y * tempCanvasEl.width) * 4;
          if (within(bmp[i], filterColor.r, filterTolerance) &&
            within(bmp[i + 1], filterColor.g, filterTolerance) &&
            within(bmp[i + 2], filterColor.b, filterTolerance)) {
            bmp[i + 3] = 0;
          }
        }
      }
    }

    tempCanvasCtx.putImageData(image, 0, 0);

    captureCanvasCtx.clearRect(0, 0, captureCanvasEl.width, captureCanvasEl.height);
    captureCanvasCtx.drawImage(tempCanvasEl, 0, 0, captureCanvasEl.width, captureCanvasEl.height);

    if (liveCanvasEl) {
      let liveCanvasCtx = liveCanvasEl.getContext("2d");
      liveCanvasCtx.clearRect(0, 0, liveCanvasEl.width, liveCanvasEl.height);
      liveCanvasCtx.drawImage(captureCanvasEl, 0, 0, liveCanvasEl.width, liveCanvasEl.height);
    }
  }

  screenCtx.clearRect(0, 0, screenEl.width, screenEl.height);
  if (render2d) {
    screenCtx.drawImage(liveEl == background2dEl ? captureCanvasEl : background2dEl, 0, 0, screenEl.width, screenEl.height);
    screenCtx.drawImage(liveEl == midground2dEl ? captureCanvasEl : midground2dEl, 0, 0, screenEl.width, screenEl.height);
    screenCtx.drawImage(liveEl == foreground2dEl ? captureCanvasEl : foreground2dEl, 0, 0, screenEl.width, screenEl.height);
  }

  if (xr == "vr" && hudEl) {
    var hudCanvasEl = aframeWindow.document.getElementById("hud-canvas"),
      hudCanvasCtx = hudCanvasEl.getContext("2d");
    hudCanvasCtx.clearRect(0, 0, hudCanvasEl.width, hudCanvasEl.height);
    hudCanvasCtx.drawImage(screenEl, 0, 0, hudCanvasEl.width, hudCanvasEl.height);
  } else if (xr == "ar" && appCanvasEl) {
    let appCanvasCtx = appCanvasEl.getContext("2d");
    appCanvasCtx.clearRect(0, 0, appCanvasEl.width, appCanvasEl.height); // webcam should be streamed but just to be sure
    appCanvasCtx.drawImage(appStreamEl, 0, 0, appCanvasEl.width, appCanvasEl.height);
    appCanvasCtx.drawImage(sceneVideoEl, 0, 0, appCanvasEl.width, appCanvasEl.height);
    appCanvasCtx.globalAlpha = opacity.value;
    appCanvasCtx.drawImage(screenEl, 0, 0, appCanvasEl.width, appCanvasEl.height);
  }
})();

/* helper functions */

function loadSession() {
  let session;

  try {
    session = JSON.parse(localStorage.getItem(`${room}-session`));
    [].forEach.call(session.resources, addImageResource);
  } catch (e) {
    console.warn("error loading session", e);
  }

  return session;
}

function storeSession() {
  let session = {
    resources: []
  };

  $("#resources img").each(function() {
    session.resources.push(this.src);
  });

  localStorage.setItem(`${room}-session`, JSON.stringify(session));

  return session;
}

function setRoom(value) {
  room = value;
  localStorage.setItem("room", room);
  $("#room").val(room);

  camStreamEl.srcObject = null;
  appStreamEl.srcObject = null;

  loadSession();

  initWebRTC();
}

function setCaptureSource(value) {
  if (capturing) {
    console.error("can't change capture source while capturing");
    return captureSource;
  }
  let temp = captureSource;
  $(captureSource).removeClass("selected");
  if (value == captureSource || isLiveSource(value)) {
    captureSource = camStreamEl;
  } else {
    captureSource = value;
  }
  $(captureSource).addClass("selected");
  let w = captureSource.videoWidth || captureSource.naturalWidth || captureSource.width,
    h = captureSource.videoHeight || captureSource.naturalHeight || captureSource.height;
  if (w > 1920) {
    let aspectRatio = (w / h);
    w = 1920;
    h = 1920 / aspectRatio;
  }
  resize(captureCanvasEl, w, h, false);
  resize(tempCanvasEl, w, h, false);
  if (liveCanvasEl) {
    resize(liveCanvasEl, w, h, false);
  }
  return temp;
}

function addLayer(el, src) {
  let
    suffix = el == screenEl ? "2d" : "",
    backgroundEl = document.querySelector(`#background${suffix}`),
    midgroundEl = document.querySelector(`#midground${suffix}`),
    foregroundEl = document.querySelector(`#foreground${suffix}`);

  if (isEmptySource(backgroundEl)) {
    backgroundEl.src = src;
  } else
  if (isEmptySource(midgroundEl)) {
    midgroundEl.src = src;
  } else {
    foregroundEl.src = src;
  }

  if (el == screenEl && !$("#toggle-2d").is(".selected")) {
    $("#toggle-2d").click();
  } else if (el == sceneEl && !$("#toggle-360").is(".selected")) {
    $("#toggle-360").click();
  }
}

function startDrag(e) {
  if (this.hasAttribute("disabled")) {
    if (e.preventDefault) {
      e.preventDefault();
    }
    if (e.stopPropagation) {
      e.stopPropagation();
    }
    return;
  }
  $(trashEl).fadeIn();
  e.dataTransfer.setData("source", this.id ? "#" + this.id : this.tagName);
}

function setLiveSource(el) {
  if (el == liveEl) return;

  if (liveEl) {
    liveEl.src = "empty.png";
  }

  liveEl = el;
  if (liveEl) {
    liveCanvasEl = aframeWindow.document.getElementById(`${liveEl.id}-canvas`);
    liveCanvasEl.width = captureCanvasEl.width;
    liveCanvasEl.height = captureCanvasEl.height;
  } else {
    liveCanvasEl = null;
  }

  let target = liveEl ? `#${liveEl.id}` : null;
  sendAction(webrtcCam, "live", {
    target: target
  });
  sendAction(webrtcApp, "live", {
    target: target
  });
}

let rescnt = 0;

function makeResource(resource) {
  let $resource = $(resource);
  $resource[0].addEventListener("dragstart", startDrag, false);
  $resource.attr({
    id: `resource${++rescnt}`,
    draggable: true
  }).addClass("resource").click(function() {
    setCaptureSource(this);
  });
  if ($resource[0] == camStreamEl) {
    $resource.prependTo("#resources");
  } else {
    $resource.appendTo("#resources");
  }

  return $resource;
}

function addImageResource(src) {
  return makeResource(fromDataURL(src, true));
}

function addFileResource(f, cb) {
  let reader = new FileReader();
  reader.onload = function() {
    let fileType = f.name.split('.')[1],
      result;

    if ((/(gif|jpg|jpeg|png)$/i).test(fileType)) {
      result = fromDataURL(reader.result, cb, true);
      makeResource(result);
    }
  };
  reader.readAsDataURL(f);
}

function addFileResources(f, cb) {
  for (let i = 0; i < f.length; ++i) {
    addFileResource(f[i], cb);
  }
}

function rgbToHex(r, g, b) {
  return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

function hexToRgb(hex) {
  var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
}

function resize(el, w, h, css) {
  $(el).attr({
    width: w,
    height: h
  });
  if (css !== false) {
    $(el).css({
      width: w,
      height: h
    });
  }
}

function sendAction(peer, action, detail) {
  let data = {
    sender: "360paper/studio",
    action: action,
  };
  if (detail) {
    data.detail = detail;
  }
  peer.send(data);
}

function sendChange(peer, el, name) {
  if (el) {
    sendAction(peer, "change", {
      name: name,
      value: JSON.stringify(el.getAttribute(name)),
      target: el.id ? "#" + el.id : el.tagName
    });
  }
}

require(["jquery", "camera", "device", "webrtc"]).then(function() {
  if (Device.mobile && confirm("Switch to 360paper App?")) {
    window.location = "./app";
  }
}).then(init);