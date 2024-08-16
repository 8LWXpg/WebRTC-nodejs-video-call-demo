const fs = require('fs');
const https = require('https');
const WebSocket = require('ws');
const WebSocketServer = WebSocket.Server;

const HTTPS_PORT = 8443;

//all connected to the server users
let users = {};
let allUsers = new Set();
// ----------------------------------------------------------------------------------------

// Create a server for the client html page
function handleRequest(request, response) {
	// Render the single client html file for any request the HTTP server receives
	console.log('request received: ' + request.url);

	if (request.url === '/') {
		response.writeHead(200, { 'Content-Type': 'text/html' });
		response.end(fs.readFileSync('client/index.html'));
	} else if (request.url === '/webrtc.js') {
		response.writeHead(200, { 'Content-Type': 'application/javascript' });
		response.end(fs.readFileSync('client/webrtc.js'));
	}
}

const httpsServer = https.createServer(
	{
		key: fs.readFileSync('key.pem'),
		cert: fs.readFileSync('cert.pem'),
	},
	handleRequest
);
httpsServer.listen(HTTPS_PORT, '0.0.0.0');

// ----------------------------------------------------------------------------------------

// Create a server for handling websocket calls
const wss = new WebSocketServer({ server: httpsServer });

wss.on('connection', (ws) => {
	ws.on('message', (message) => {
		let data;

		//accepting only JSON messages
		try {
			data = JSON.parse(message);
		} catch (e) {
			console.log('Invalid JSON');
			data = {};
		}

		console.log('received data:', data);
		//switching type of the user message
		switch (data.type) {
			//when a user tries to login
			case 'login': {
				console.log('User logged', data.name);
				console.log('if anyone is logged in with this username then refuse');
				if (users[data.name]) {
					sendTo(ws, {
						type: 'login',
						success: false,
					});
				} else {
					console.log('save user connection on the server');
					users[data.name] = ws;
					allUsers.add(data.name);

					//console.log('all available users',JSON.stringify(users))
					ws.name = data.name;

					sendTo(ws, {
						type: 'login',
						success: true,
						allUsers: allUsers,
					});
				}
				break;
			}
			case 'offer': {
				//for ex. UserA wants to call UserB
				console.log('Sending offer to: ', data.name);

				//if UserB exists then send him offer details
				const conn = users[data.name];

				if (conn != null) {
					//setting that UserA connected with UserB
					ws.otherName = data.name;

					sendTo(conn, {
						type: 'offer',
						offer: data.offer,
						name: ws.name,
					});
				}
				break;
			}
			case 'answer': {
				console.log('Sending answer to: ', data.name);
				//for ex. UserB answers UserA
				const conn = users[data.name];
				console.log('answer: ', data.answer);

				if (conn != null) {
					ws.otherName = data.name;
					sendTo(conn, {
						type: 'answer',
						answer: data.answer,
					});
				}
				break;
			}
			case 'candidate': {
				console.log('Sending candidate to:', data.name);
				const conn = users[data.name];

				if (conn != null) {
					sendTo(conn, {
						type: 'candidate',
						candidate: data.candidate,
					});
				}
				break;
			}
			case 'leave': {
				console.log('Disconnecting from', data.name);
				const conn = users[data.name];

				//notify the other user so he can disconnect his peer connection
				if (conn != null) {
					sendTo(conn, {
						type: 'leave',
					});
				}
				break;
			}
			default: {
				sendTo(ws, {
					type: 'error',
					message: 'Command not found: ' + data.type,
				});
			}
		}
		//wss.broadcast(message);
	});

	ws.on('close', () => {
		if (ws.name) {
			delete users[ws.name];

			if (ws.otherName) {
				console.log('Disconnecting from ', ws.otherName);
				const conn = users[ws.otherName];

				if (conn != null) {
					sendTo(conn, {
						type: 'leave',
					});
				}
			}
		}
	});

	//ws.send("Hello world");
});

function sendTo(connection, message) {
	connection.send(JSON.stringify(message));
}

console.log(
	'Server running. Visit https://localhost:' +
		HTTPS_PORT +
		" in Firefox/Chrome.\n\n\
Some important notes:\n\
  * Note the HTTPS; there is no HTTP -> HTTPS redirect.\n\
  * You'll also need to accept the invalid TLS certificate.\n\
  * Some browsers or OSs may not allow the webcam to be used by multiple pages at once. You may need to use two different browsers or machines.\n"
);
