const fs = require('fs');
const path = require('path');
const https = require('https');
const WebSocket = require('ws');
const WebSocketServer = WebSocket.Server;

const HTTPS_PORT = 8443;

/**
 * @type {Map<string, WebSocket>}
 */
const users = new Map();
const allUsers = new Set();

// Serve web page based on file path, without using Express
function handleRequest(request, response) {
	// Render the single client html file for any request the HTTP server receives
	console.log('request received: ' + request.url);

	let filePath = request.url === '/' ? 'client/index.html' : `client${request.url}`;
	const extName = path.extname(filePath);
	let contentType = 'text/html';
	switch (extName) {
		case '.js':
			contentType = 'application/javascript';
			break;
		case '.css':
			contentType = 'text/css';
			break;
	}

	fs.readFile(filePath, (error, content) => {
		if (error) {
			if (error.code === 'ENOENT') {
				// File not found
				response.writeHead(404, { 'Content-Type': 'text/html' });
				response.end('<h1>404 Not Found</h1>', 'utf-8');
			} else {
				// Some server error
				response.writeHead(500);
				response.end(`Server Error: ${error.code}`);
			}
		} else {
			// Serve the file
			response.writeHead(200, { 'Content-Type': contentType });
			response.end(content, 'utf-8');
		}
	});
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
		/** @type {{name :string}} */
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
				if (users[data.name]) {
					sendTo(ws, {
						type: 'login',
						success: false,
					});
				} else {
					console.log('save user connection on the server');
					users[data.name] = ws;
					allUsers.add(data.name);

					ws.name = data.name;

					sendTo(ws, {
						type: 'login',
						success: true,
						share: data.share,
						allUsers: Array.from(allUsers),
					});

					notifyUsersChange(data.name);
				}
				break;
			}
			case 'offer': {
				// Calling different user
				console.log('Sending offer to: ', data.name);

				const conn = users[data.name];

				if (conn !== undefined) {
					//setting that UserA connected with UserB
					ws.otherName = data.name;

					sendTo(conn, {
						type: 'offer',
						offer: data.offer,
						name: ws.name,
					});
				} else {
					sendTo(ws, {
						type: 'decline',
						message: 'No such user',
					});
				}
				break;
			}
			case 'answer': {
				// Answering to the offer
				console.log('Sending answer to: ', data.name);
				const conn = users[data.name];
				console.log('answer: ', data.answer);

				if (conn !== undefined) {
					ws.otherName = data.name;
					sendTo(conn, {
						type: 'answer',
						answer: data.answer,
					});
				}
				break;
			}
			case 'decline': {
				// Declining the offer
				console.log('Declining call from: ', data.name);
				const conn = users[data.name];
				sendTo(conn, {
					type: 'decline',
					message: `Declined by user: ${ws.name}`,
				});
				break;
			}
			case 'candidate': {
				console.log('Sending candidate to:', data.name);
				const conn = users[data.name];

				if (conn !== undefined) {
					sendTo(conn, {
						type: 'candidate',
						candidate: data.candidate,
					});
				}
				break;
			}
			case 'hangup': {
				console.log('Hanging up call from', data.name);
				const conn = users[users[data.name]?.otherName];

				if (conn !== undefined) {
					sendTo(conn, {
						type: 'hangup',
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
	});

	ws.on('close', () => {
		if (ws.name) {
			delete users[ws.name];
			allUsers.delete(ws.name);

			if (ws.otherName) {
				console.log('Disconnecting from ', ws.otherName);
				const conn = users[ws.otherName];

				// Notify the other user so he can disconnect his peer connection
				if (conn !== undefined) {
					sendTo(conn, {
						type: 'leave',
					});
				}
			}

			notifyUsersChange(ws.name);
		}
	});
});

/**
 * Send data to a websocket connection
 * @param {WebSocket} connection
 * @param {object} message
 */
function sendTo(connection, message) {
	connection.send(JSON.stringify(message));
}

function notifyUsersChange(newUser) {
	for (const user of allUsers) {
		if (user !== newUser) {
			sendTo(users[user], {
				type: 'users',
				users: Array.from(allUsers),
			});
		}
	}
}

console.log(`Server running. Visit https://localhost:${HTTPS_PORT}

Some important notes:
* Note the HTTPS; there is no HTTP -> HTTPS redirect.
* You'll also need to accept the invalid TLS certificate.
* Some browsers or OSs may not allow the webcam to be used by multiple pages at once. You may need to use two different browsers or machines.\n`);
