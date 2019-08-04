// TODO add subchannels for XD applications

/**
 * XD: Cross-Device Interactions
 * Copyright (C) 2017-2018 Information Interaction Lab
 * @author Michael Nebeling
 */
;
(function(window, document, require, undefined) {
  if (window.XD) {
    console.error("XD already defined");
    return;
  }

  var devices = {};

  var sharedStorage = {};

  var listeners = {
    message: [],
    storage: []
  };

  var XD = window.XD = {

    autosync: false,

    syncing: false,

    events: {
      device: true,
      devices: true,
      click: true,
      mousedown: false,
      mousemove: false,
      mouseup: false,
      protoar: true,
      touchstart: false,
      touchdown: false,
      touchmove: false,
      touchup: false,
      touchend: false,
      devicemotion: false,
      deviceorientation: false,
      orientationchange: false,
      custom: true,
    },

    log: function() { /* ignore */ },

    listeners: listeners,

    trigger: function() { // [event,] msg, [callback]
      if (arguments.length == 0) {
        console.error("invalid call of XD trigger: [event,] msg, [callback]")
        return;
      }
      var msg = arguments[0],
        callback;
      if (typeof msg == "string") {
        msg = arguments[1];
        msg.event = arguments[0];
        callback = arguments[2];
      }
      if (!msg || !msg.event) {
        console.error("invalid call of XD trigger: [event,] msg, [callback]")
        return;
      }
      if (!XD.socket) {
        console.warn("socket not yet ready");
        return;
      }

      if (XD.syncing) {
        console.warn("XD still syncing");
        return;
      }

      if (XD.events[msg.event] !== false) {
        if (XD.deviceId) {
          msg.deviceId = XD.deviceId;
        }

        XD.socket.emit("xd", msg, callback);
        XD.log("XD message sent", msg);
      }
    },

    on: function(event, listener) {
      if (event in listeners) {
        listeners[event].push(listener);
      } else {
        listeners[event] = [listener];
      }

      if (!XD.events[event]) {
        XD.events[event] = true;
      }
    },

    onmessage: function(listener) {
      listeners['message'].push(listener);
    },

    onstorage: function(listener) {
      listeners['storage'].push(listener);
    },

    key: function(index) {
      return sharedStorage[index];
    },

    getItem: function(key, fallback) {
      return sharedStorage[key] || fallback;
    },

    setItem: function(key, data) {
      // TODO should define properties
      if (data !== null) sharedStorage[key] = data;
      else delete sharedStorage[key];
      updateStorage();
      XD.trigger({
        event: "storage",
        important: true,
        func: "set",
        key: key,
        data: data,
      });
    },

    removeItem: function(key) {
      delete sharedStorage[key];
      updateStorage();
      XD.trigger({
        event: "storage",
        important: true,
        func: "set",
        key: key,
      });
    },

    clear: function() {
      sharedStorage = {};
      updateStorage();
    }
  };

  XD.send = function(msg, callback) {
    console.warn("XD.send deprecated, use XD.trigger instead");
    return XD.trigger(msg, callback);
  }

  /* holds a copy of the storage */
  var sharedStorage = {};

  function updateStorage(storage) {
    var updated = false;
    if (storage) {
      // Update storage.
      sharedStorage = storage;
      updated = true;
    } else {
      // Retrieve storage.
      storage = sharedStorage;
    }
    if (updated) {
      callEventListeners('storage', storage);
    }
  }

  function handleEvent(msg) {
    if (msg.event == "click" && msg.target) {
      document.querySelector(msg.target).click();
    } else if (msg.event == "scroll") {
      var body = document.body,
        html = document.documentElement,
        x = msg.x * Math.max(body.scrollWidth, body.offsetWidth, html.clientWidth, html.scrollWidth, html.offsetWidth),
        y = msg.y * Math.max(body.scrollHeight, body.offsetHeight, html.clientHeight, html.scrollHeight, html.offsetHeight);
      body.scrollLeft = x;
      html.scrollLeft = x;
      body.scrollTop = y;
      html.scrollTop = y;
    }
  }

  function baseEvent(e, callback) {
    XD.trigger(e.event || e.type || "custom", e, callback);
  }

  function deviceEvent() {
    baseEvent({
      event: "device",
      important: true,
      type: navigator.userAgent,
      location: location.href,
      screen: {
        width: screen.width,
        height: screen.height
      }
    }, function(deviceId) {
      console.info("XD device", deviceId);
      XD.deviceId = deviceId;
    });
  }

  function pointerEvent(e) {
    var target = e.target.closest("[id]");
    if (target && target.id) {
      baseEvent({
        event: e.type,
        target: '#' + target.id,
        x: e.clientX,
        y: e.clientY
      });
    }
  }

  function scrollEvent(e) {
    var body = document.body,
      html = document.documentElement;
    baseEvent({
      event: e.type,
      x: (body.scrollLeft || html.scrollLeft) / Math.max(body.scrollWidth, body.offsetWidth, html.clientWidth, html.scrollWidth, html.offsetWidth),
      y: (body.scrollTop || html.scrollTop) / Math.max(body.scrollHeight, body.offsetHeight, html.clientHeight, html.scrollHeight, html.offsetHeight)
    });
  }

  function deviceorientationEvent(e) {
    baseEvent({
      event: e.type,
      alpha: e.alpha,
      beta: e.beta,
      gamma: e.gamma,
      absolute: e.absolute,
      orientation: window.orientation
    });
  }

  function devicemotionEvent(e) {
    baseEvent({
      event: e.type,
      acceleration: e.acceleration ? {
        x: e.acceleration.x,
        y: e.acceleration.y,
        z: e.acceleration.z
      } : {},
      accelerationIncludingGravity: e.accelerationIncludingGravity ? {
        x: e.accelerationIncludingGravity.x,
        y: e.accelerationIncludingGravity.y,
        z: e.accelerationIncludingGravity.z
      } : {},
      rotationRate: e.rotationRate ? {
        alpha: e.rotationRate.alpha,
        beta: e.rotationRate.beta,
        gamma: e.rotationRate.gamma,
      } : {}
    });
  }

  function callEventListeners(event, data) {
    if (event in listeners) {
      for (var listener in listeners[event]) {
        listeners[event][listener](data);
      }
    }
  }

  function updateEventListeners(modifier) {
    var func = modifier === false ? window.removeEventListener : window.addEventListener;

    func("load", deviceEvent);

    func("scroll", scrollEvent);

    func("orientationchange", event);
    func("deviceorientation", deviceorientationEvent);
    func("devicemotion", devicemotionEvent);

    func("mousedown", pointerEvent);
    func("mousemove", pointerEvent);
    func("mouseup", pointerEvent);
    func("click", pointerEvent);

    func("touchstart", pointerEvent);
    func("touchdown", pointerEvent);
    func("touchmove", pointerEvent);
    func("touchup", pointerEvent);
    func("touchend", pointerEvent);
  }

  XD.overrideEventListener = true;
  try {
    updateEventListeners();
  } finally {
    XD.overrideEventListener = false;
  }

  require("socket.io").then(function() {
    XD.log("preparing socket");
    XD.socket = io();

    XD.socket.on("connect", function() {
      XD.socket.emit("room", "xd");

      XD.socket.emit("xd", {
        event: "storage",
        func: "get"
      }, updateStorage);

      XD.socket.on("xd", function(msg) {
        if (XD.deviceId && XD.deviceId == msg.deviceId && XD.event != "devices") return;

        /*
        if is objMessage and is "create"==0 "00b"/"remove"==3 "11b"
        */

        var important = msg.important || (msg.event == 'objMessage' && (msg.objMessage.ope == 0 || msg.objMessage.ope == 3));

        // skip unimportant messages during sync
        if (XD.syncing && !important) {
          return;
        }

        // log messages
        if (important) {
          XD.log("important XD message received", msg);
        } else {
          XD.log("XD message received", msg);
        }

        if (XD.events[msg.event]) {
          XD.syncing = true;
          try {
            if (XD.autosync) {
              handleEvent(msg);
            }
            callEventListeners('message', msg);
            switch (msg.event) {
              case "devices":
                if (msg.devices) {
                  XD.devices = msg.devices;
                } else {
                  console.warn("received XD.devices event without devices info");
                }
              case "storage":
                updateStorage(msg.storage);
              default:
                callEventListeners(msg.event, msg);
            }
          } finally {
            setTimeout(function() {
              XD.syncing = false;
            }, 10); // was 10 before and then 5
          }
        } else {
          console.warn("XD event ignored", msg.event);
        }
      });
    });
  });
})(window, document, require);

var window_addEventListener = window.addEventListener;
window.addEventListener = function(event, listener, useCapture) {
  if (/devicemotion|deviceorientation|orientationchange/i.test(event)) {
    if (event in XD.listeners) {
      XD.listeners[event].push(listener);
    } else {
      XD.listeners[event] = [listener];
    }
  }

  window_addEventListener(event, listener, useCapture);
}
