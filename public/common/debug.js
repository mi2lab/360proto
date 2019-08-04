(function() {
  var debugEl = document.createElement("div");
  debugEl.setAttribute("id", "debug");
  debugEl.style.background = "red";
  debugEl.style.color = "white";
  debugEl.style.padding = "10px";
  debugEl.style.position = "absolute";
  debugEl.style.right = "0";
  debugEl.style.opacity = 0.6;
  debugEl.style.zIndex = 10000;
  debugEl.style.maxWidth = "27%";
  debugEl.style.fontFamily = "monospace";

  window.debug = function() {
    if (arguments) {
      debugEl.innerHTML = Array.from(arguments).map(function(arg) {
        return (typeof arg === "string" ? arg : JSON.stringify(arg));
      });
      console.log(debugEl.innerHTML);
    } else {
      return debugEl;
    }
  }

  window.addEventListener("load", function() {
    document.querySelector("body").prepend(debugEl);
  });
})();