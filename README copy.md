# WebRTC nodejs video call demo

based on [sauravkp/WebRTC-nodejs-video-call-demo](https://github.com/sauravkp/WebRTC-nodejs-video-call-demo)

## Usage

The signaling server uses Node.js and `ws` and can be started as such:

```bash
npm install
npm start
```

With the server running, open a recent version of Firefox, Chrome, or Safari and visit `https://localhost:8443`.

* Note the HTTPS! There is no redirect from HTTP to HTTPS.
* Some browsers or OSs may not allow the webcam to be used by multiple pages at once. You may need to use two different browsers or machines.

## TLS

Recent versions of Chrome require secure websockets for WebRTC. Thus, this example utilizes HTTPS. Included is a self-signed certificate that must be accepted in the browser for the example to work.


## Update
This is a demo version build some time ago for learning purposes only. A new production ready version of this application with a detailed documentation is now available in [this repo](https://github.com/sauravkp/cignal). Please take a look and feel free to build a real application with it if you find it useful.
