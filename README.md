# WebRTC nodejs video call demo

Simple AF WebRTC video call demo in nodejs

## Usage

### Prerequisites

- Node.js
- OpenSSL

Generate a self-signed certificate and key using the following command:

```bash
./generate_cert.sh
```

or on Windows:

```pwsh
generate_cert.bat
```

Then start the server:

```bash
npm install
npm start
```

With the server running, open a recent version of Firefox, Chrome, or Safari and visit `https://localhost:8443`.

## TLS

Recent versions of Chrome require secure websockets for WebRTC. Thus, this example utilizes HTTPS. Included is a self-signed certificate that must be accepted in the browser for the example to work.
