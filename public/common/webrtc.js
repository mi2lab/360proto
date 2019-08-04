;
(function(root, factory) {
  if (typeof define === "function" && define.amd) {
    // AMD. Register as an anonymous module.
    define([], factory);
  } else if (typeof exports === "object") {
    // Node. Does not work with strict CommonJS, but
    // only CommonJS-like environments that support module.exports,
    // like Node.
    module.exports = factory();
  } else {
    // Browser globals (root is window)
    root.WebRTC = factory();
  }
}(this, function() {
  "use strict";

  window.RTCPeerConnection = window.RTCPeerConnection || window.webkitRTCPeerConnection || window.mozRTCPeerConnection;
  window.RTCIceCandidate = window.RTCIceCandidate || window.mozRTCIceCandidate || window.webkitRTCIceCandidate;
  window.RTCSessionDescription = window.RTCSessionDescription || window.mozRTCSessionDescription || window.webkitRTCSessionDescription;
  window.URL = window.URL || window.mozURL || window.webkitURL;
  window.navigator.getUserMedia = window.navigator.getUserMedia || window.navigator.webkitGetUserMedia || window.navigator.mozGetUserMedia;

  function WebRTC(options) {

    // private vars

    const _peerConnections = {};
    const _peerConnectionConfig = {
      iceServers: [{
          urls: "stun:stun.services.mozilla.com"
        },
        {
          urls: "stun:stun.l.google.com:19302"
        }
      ]
    };

    let _id;
    let _channel;
    let _socket;
    let _streams;
    let _video;

    const self = this;

    // private functions

    const _createConnection = function(clientId) {
      if (clientId != _id) {
        WebRTC.log("creating WebRTC connection with", clientId);
      } else {
        WebRTC.log("initializing WebRTC connection");
      }

      var peerConnection = _peerConnections[clientId] = new RTCPeerConnection(_peerConnectionConfig);

      peerConnection.onicecandidate = function(event) {
        WebRTC.log("got ICE candidate", event);

        if (event.candidate) {
          _socket.emit("webRTC", {
            forId: clientId,
            ice: event.candidate,
            id: _id
          });
        }
      };

      if (_streams.length) {
        for (let stream in _streams) {
          self.addStream(_streams[stream], clientId);
        }
      }

      peerConnection.onaddstream = function(event) {
        if (_video) {
          _video.srcObject = event.stream;
        }

        _onstream(event.stream);
      };

      peerConnection.ondatachannel = function(event) {
        // console.log("ondatachannel", event);
        event.channel.onmessage = function(event) {
          // console.log("onmessage", event);
          _ondata(JSON.parse(event.data));
        }
      };

      if (clientId != _id) {
        peerConnection.channel = peerConnection.createDataChannel(_channel);
        peerConnection.channel.onopen = peerConnection.channel.onclose = function(event) {
          WebRTC.log("WebRTC channel status changed", event);
        };
        peerConnection.channel.onmessage = function(event) {
          WebRTC.log("WebRTC message received", event);
          _ondata(JSON.parse(event.data));
        };
      }

      peerConnection.createOffer(function(description) {
        _gotDescription(description, clientId);
      }, console.error);

      return peerConnection;
    };

    const _gotDescription = function(description, clientId) {
      WebRTC.log("got WebRTC description", description);

      _peerConnections[clientId].setLocalDescription(description, function() {
        _socket.emit("webRTC", {
          forId: clientId,
          id: _id,
          sdp: description
        });
      }, console.warn);
    };

    let _onstream = function(stream) {
      WebRTC.log("WebRTC stream received", stream);
    };

    // public functions

    this.addStream = function(stream, clientId) {
      if (!clientId) {
        if (_streams.filter(function(candidate) {
            return candidate.id === stream.id;
          }).length === 0) {
          _streams.push(stream);
        }

        for (let remoteId in _peerConnections) {
          self.addStream(stream, remoteId);
        }
      } else {
        WebRTC.log("adding WebRTC stream", stream, "to client", clientId);

        _peerConnections[clientId].addStream(stream);
      }

      return WebRTC;
    };

    this.send = function(data) {
      try {
        var message = JSON.stringify(data);
        WebRTC.log("WebRTC send message", message);
        for (let remoteId in _peerConnections) {
          if (_peerConnections[remoteId].channel && _peerConnections[remoteId].channel.readyState === "open") {
            _peerConnections[remoteId].channel.send(message);
          }
        }
      } catch (e) {
        console.warn(e);
      }
      /*var localConnection = _peerConnectionConfig[_id];
      if (localConnection && localConnection.channel && localConnection.channel.readyState === "open") {
      	localConnection.channel.send(message);
      }
      else {
      	console.warn("WebRTC data channel not ready yet");
      }*/
    }

    let _ondata = function(data) {
      WebRTC.log("WebRTC data received", data);
    };

    this.init = function(a, b) {
      if (typeof a === "string") {
        console.warn("init function has changed: init(options)");
        b.id = a;
        a = b;
      }

      const options = a;

      WebRTC.log = typeof options.log === "function" ? options.log : options.log === true ? console.log : function(msg) { /* ignore msg */ };

      _id = options.id || "client" + Math.floor(Math.random() * 1000);
      _video = options.video;
      _channel = options.channel || "default";
      _streams = options.stream ? [options.stream] : [];
      _onstream = options.onstream || _onstream;
      _ondata = options.ondata || _ondata;
      _socket = options.socket;

      WebRTC.log("WebRTC init", _id);

      var required = ["socket.io"];

      if (options.useAdapter !== false) {
        required.push("//webrtc.github.io/adapter/adapter-latest.js");
      }

      require(required, true).then(function() {
        if (!_socket) {
          WebRTC.log("WebRTC preparing socket");

          _socket = io();

          _socket.on("connect", function() {
            var room = options.room || "webRTC";
            _socket.emit("room", room);
            console.log("WebRTC connected to room", room)
          });
        }

        WebRTC.log("WebRTC creating connections");

        _socket.on("webRTC", function(msg) {
          const clientId = msg.id;

          /*if (clientId && clientId === _id) {
          	return;
          }*/

          WebRTC.log("WebRTC got message from server", msg);

          let peerConnection = _peerConnections[clientId];

          if (!peerConnection) {
            peerConnection = _createConnection(clientId);
          }

          /*if (msg.broadcaster) {
          	_socket.emit("webRTC", {
          		id: _id,
          		init: true
          	});
          }*/

          try {
            if (msg.ice && msg.forId === _id) {
              WebRTC.log("WebRTC received ice candidate", msg.ice);
              if (peerConnection.remoteDescription && peerConnection.remoteDescription.type) {
                peerConnection.addIceCandidate(new RTCIceCandidate(msg.ice));
              } else {
                console.warn("WebRTC remote description not set yet!");
              }
            }

            if (msg.sdp && msg.forId === _id) {
              WebRTC.log("WebRTC received sdp", msg.sdp);
              peerConnection.setRemoteDescription(new RTCSessionDescription(msg.sdp), function() {
                if (msg.sdp.type === "offer") {
                  peerConnection.createAnswer(function(description) {
                    _gotDescription(description, clientId);
                  }, console.warn);
                }
              }, console.warn);
            }
          } catch (e) {
            console.error(e);
          }
        });

        _socket.emit("webRTC", {
          broadcaster: !!options.stream,
          id: _id,
          init: true
        });
      });

      return WebRTC;
    };

    if (options) {
      this.init(options);
    }
  }

  return WebRTC;
}));