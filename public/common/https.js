/* auto redirect to https
   adapted from http://stackoverflow.com/questions/4723213/detect-http-or-https-then-force-https-in-javascript */
if (location.hostname != "localhost" && location.hostname != "127.0.0.1" && location.protocol != "https:") {
	location.href = "https:" + window.location.href.substring(window.location.protocol.length);
}