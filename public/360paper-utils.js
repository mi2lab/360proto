/*
  This code is proprietary information of the
	University of Michigan Information Interaction Lab.
  https://mi2lab.com
*/

function loadCanvas(canvasEl, src) {
  if (canvasEl && src) {
    var imgEl = document.createElement("img");
    imgEl.onload = function() {
      canvasEl.width = imgEl.naturalWidth;
      canvasEl.height = imgEl.naturalHeight;
      canvasEl.getContext("2d").drawImage(imgEl, 0, 0);
      console.log("canvas loaded", canvasEl.width, canvasEl.height);
    };
    imgEl.src = src;
  }
  return canvasEl;
}

function toDataURL(src) {
  // src is canvas
  if (src.toDataURL) {
    return src.toDataURL();
  }

  var canvasEl = document.createElement("canvas");
  canvasEl.width = src.videoWidth || src.naturalWidth || src.width;
  canvasEl.height = src.videoHeight || src.naturalHeight || src.height;
  canvasEl.getContext("2d").drawImage(src, 0, 0);

  return canvasEl.toDataURL();
}

function saveDataURL(src, cb) {
  $.post('/saveImgTmp', {
    dataUrl: src,
    persist: true
  }, function(result) {
    (cb || console.log)(JSON.parse(result).fileName);
  });
}

function isDataURL(src) {
  return src && src.substring(0, 5) == "data:";
}

function fromDataURL(src, cb, persist) {
  var imgEl = document.createElement("img");

  imgEl.setAttribute("disabled", "");
  imgEl.style.opacity = 0.1;

  function done() {
    imgEl.removeAttribute("disabled");
    imgEl.style.opacity = 1.0;
    if (typeof cb === "function") {
      cb.call(imgEl);
    }
  }

  // let's first create the image from the dataURL
  imgEl.src = src;
  if (isDataURL(src) && (persist || cb === true)) {
    saveDataURL(src, function(f) {
      console.log("image uploaded", f);
      // create second image for preloading from server
      var imgEl2 = document.createElement("img");
      imgEl2.src = f;
      imgEl2.onload = function() {
        // replace with URL once stored and loaded from server
        imgEl.src = f;
        done();
      };
    });
  } else {
    imgEl.onload = done;
  }
  return imgEl;
}

function isLiveSource(value) {
  if (value && value.src) {
    value = value.src;
  }
  return value && value.indexOf ? value.indexOf("live.png") != -1 : false;
}

function isEmptySource(value) {
  if (!value) return true;

  if (value.src) {
    value = value.src;
  }
  return value.indexOf ? value.indexOf("empty.png") != -1 : false;
}