/* auto redirect to https
   Source: http://stackoverflow.com/questions/4723213/detect-http-or-https-then-force-https-in-javascript */
if (location.protocol !== "https:") {
  location.href = "https:" + window.location.href.substring(window.location.protocol.length);
}

var allCameras = [];

const Camera = function(o) {

  // remember who we are :)
  var self = this;

  // merge default options and o
  var options = Object.assign({
    // canvas element on which to draw stream (optional)
    canvas: undefined,

    // video element for stream (optional, will be created if omitted)
    video: undefined,

    // selected camera (default is undefined = rear camera)
    camera: undefined,

    // Does the camera have to be front-facing or back-facing?
    facingMode: undefined,

    // automatically start the camera (default is true)
    autostart: true,

    // autio options (default is false = no audio)
    audio: false,

    // exact video width (optional)
    videoWidth: undefined,

    // exact video height (optional)
    videoHeight: undefined,

    // callback when camera stream was received
    onstream: console.log,

    // callback when there was an error
    onerror: console.error,

    // callback when camera info has updated
    onupdate: function(update) {
      console.info("camera update", update);
    }
  }, o);

  // video element used for streaming (optional)
  self.video = options.video || (function() {
    var video = document.createElement("video");
    video.setAttribute("autoplay", "");
    return video;
  })();

  self.width = self.height = 0;

  self.canvas = options.canvas;

  self.camera = options.camera;

  self.facingMode = options.facingMode;

  /* select next camera */
  self.next = function() {
    self.stop();
    self.start(self.camera + 1);
  };

  /* select previous camera */
  self.prev = function() {
    self.stop();
    self.start(self.camera - 1);
  };

  /* select first camera */
  self.first = function() {
    self.stop();
    self.start(0);
  };

  /* select last camera */
  self.last = function() {
    self.stop();
    self.start(-1);
  };

  if (options.onstart) {
    console.warn("camera onstart has been replaced with onstream");
  }

  self.onstream = options.onstart || options.onstream;

  self.onerror = options.onerror;

  self.onupdate = options.onupdate;

  /* start the camera stream */
  self.start = function(camera) {
    if (allCameras.length == 0) {
      console.error("no cameras found");
      return;
    }

    if (camera != undefined) {
      self.camera = camera;
    }

    if (self.camera == undefined) {
      self.camera = allCameras.length > 0 ? 1 : 0;
    }

    if (self.camera < 0) {
      self.camera += allCameras.length;
    } else if (self.camera >= allCameras.length) {
      self.camera = 0;
    }

    self.description = allCameras[self.camera];

    self.onupdate.call(self, {
      camera: self.camera,
      description: allCameras[self.camera]
    });

    var audioOptions = options.audioOptions || options.audio === true;

    var videoOptions = options.videoOptions || self.description ? {
      deviceId: self.description.deviceId
    } : {};
    if (options.videoWidth) videoOptions.width = {
      exact: options.videoWidth
    };
    if (options.videoHeight) videoOptions.height = {
      exact: options.videoHeight
    };
    if (self.facingMode) {
      if (navigator.mediaDevices.getSupportedConstraints().hasOwnProperty("facingMode")) {
        if (videoOptions.deviceId) {
          delete videoOptions.deviceId;
        }

        videoOptions.facingMode = {
          exact: self.facingMode
        };
      }
    }

    var constraints = {
      audio: audioOptions,
      video: videoOptions
    };

    return navigator.mediaDevices.getUserMedia(constraints)
      .then(function(stream) {
        self.onstream.call(self, stream);

        self.stream = stream;

        self.video.srcObject = self.stream;
        self.video.play();

        setInterval(function() {
          var w = self.video.videoWidth || 0,
            h = self.video.videoHeight || 0;

          if (w != self.width || h != self.height) {
            self.width = w;
            self.height = h;

            self.onupdate.call(self, {
              width: self.width,
              height: self.height
            });
          }
        }, 10);

        if (self.canvas)
          setInterval(function() {
            var ctx = self.canvas.getContext("2d");
            setInterval(function() {
              ctx.drawImage(self.video, 0, 0);
            }, 10);
          });
      })
      .catch(self.onerror);
  };

  /* stop the camera stream */
  self.stop = function() {
    if (self.stream) {
      self.stream.getTracks().forEach(function(track) {
        track.stop();
      });

      self.width = self.height = 0;
    }
  };

  /* take a picture */
  self.snapshot = function() {
    var c = document.createElement("canvas");
    c.width = self.width;
    c.height = self.height;
    var ctx = c.getContext("2d");
    ctx.drawImage(self.video, 0, 0, self.width, self.height);
    return c.toDataURL();
    // garbage collector will kill c, kind of
  };

  navigator.mediaDevices.enumerateDevices()
    .then(function(deviceInfos) {
      allCameras = [];

      for (var i = 0; i !== deviceInfos.length; ++i) {
        var deviceInfo = deviceInfos[i];

        if (deviceInfo.kind === "videoinput")
          allCameras.push({
            deviceId: deviceInfo.deviceId,
            label: deviceInfo.label
          });
      }

      if (options.autostart === false) {
        console.warn("camera autostart is false");
      } else {
        self.start();
      }
    })
    .catch(self.onerror);
};