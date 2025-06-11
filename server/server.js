import { readFileSync } from 'fs';
import { createServer } from 'https';
import WebSocket, { WebSocketServer } from 'ws';
import express from 'express';

const app = express();
const HTTPS_PORT = 8443;
app.use(express.static('client'));

const server = createServer(
	{
		key: readFileSync('key.pem'),
		cert: readFileSync('cert.pem'),
	},
	app
);
server.listen(HTTPS_PORT, '0.0.0.0');

// Create a server for handling websocket calls
const wss = new WebSocketServer({ server: server });

/** @type {Map<string, WebSocket>} */
const users = new Map();
/** @type {Set<string>} */
const allUsers = new Set();

wss.on('connection', (ws) => {
	ws.on('message', (message) => {
		/** @type {{name :string, type: string}} */
		let data = JSON.parse(message);
		console.log(data);

		// switching type of the user message
		switch (data.type) {
			// register user
			case 'login': {
				if (users[data.name]) {
					sendTo(ws, {
						type: 'login',
						success: false,
					});
				} else {
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
			// calling different user
			case 'offer': {
				const conn = users[data.name];

				if (conn !== undefined) {
					// pass offer to other user
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
			// answering to the offer
			case 'answer': {
				const conn = users[data.name];

				if (conn !== undefined) {
					ws.otherName = data.name;
					sendTo(conn, {
						type: 'answer',
						answer: data.answer,
					});
				}
				break;
			}
			// declining the offer
			case 'decline': {
				const conn = users[data.name];
				sendTo(conn, {
					type: 'decline',
					message: `Declined by user: ${ws.name}`,
				});
				break;
			}
			case 'candidate': {
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
				const conn = users[users[data.name]?.otherName];

				if (conn !== undefined) {
					sendTo(conn, {
						type: 'hangup',
					});
				}
				break;
			}
			default: {
				console.log('Command not found: ', data.type);
				break;
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
						type: 'hangup',
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
	allUsers.forEach((user) => {
		if (user !== newUser) {
			sendTo(users[user], {
				type: 'users',
				users: Array.from(allUsers),
			});
		}
	});
}

console.log(`Server running on https://localhost:${HTTPS_PORT}`);
