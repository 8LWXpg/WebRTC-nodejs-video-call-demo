/** @type {RTCPeerConnection} */
let yourConn;
let candidateQueue = [];

let localUser;
let localStream;
let connectedUser;

const peerConnectionConfig = {
	iceServers: [{ urls: 'stun:stun.stunprotocol.org:3478' }, { urls: 'stun:stun.l.google.com:19302' }],
};

let serverConnection = new WebSocket('wss://' + window.location.hostname + ':8443');

serverConnection.onopen = () => {
	console.log('Connected to the signaling server');
};

serverConnection.onmessage = gotMessageFromServer;

/** @type {HTMLVideoElement} */
const remoteVideo = document.getElementById('remoteVideo');
const localVideo = document.getElementById('localVideo');
const usernameInput = document.getElementById('usernameInput');
const showUsername = document.getElementById('showLocalUserName');
const showRemoteUsername = document.getElementById('showRemoteUserName');
const showAllUsers = document.getElementById('allUsers');
const callToUsernameInput = document.getElementById('callToUsernameInput');
const callOngoing = document.getElementById('callOngoing');
const callInitiator = document.getElementById('callInitiator');
const callReceiver = document.getElementById('callReceiver');

// #region page elements
/**
 * @param {HTMLInputElement} self
 */
function loginClick(self) {
	if (/Mobi|Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)) {
		self.outerHTML = /* html */ `
		<button class="primary" onclick="share('m')">Share Media</button>`;
	} else {
		self.outerHTML = /* html */ `
		<button class="primary" onclick="share('m')">Share Media</button>
		<button class="primary" onclick="share('s')">Share Screen</button>`;
	}
}

/**
 * Initiate call to any user i.e. send message to server
 */
function callBtnClick() {
	const callToUsername = callToUsernameInput.value;

	if (callToUsername.length > 0) {
		connectedUser = callToUsername;
		console.log('create an offer to ', callToUsername);
		console.log('connection state', yourConn.connectionState);
		console.log('signalling state', yourConn.signalingState);
		yourConn
			.createOffer()
			.then((offer) => {
				yourConn.setLocalDescription(offer).then(
					send({
						type: 'offer',
						name: connectedUser,
						offer: offer,
					})
				);

				callOngoing.style.display = 'block';
				callInitiator.style.display = 'none';
			})
			.catch((error) => {
				alert('Error when creating an offer', error);
				console.error('Error when creating an offer', error);
			});
	} else alert("username can't be blank!");
}

function hangUpClick() {
	send({
		type: 'hangup',
		name: localUser,
	});

	connectedUser = null;
	remoteVideo.src = null;
	remoteVideo.hidden = true;
	showRemoteUsername.innerHTML = '';

	callOngoing.style.display = 'none';
	callInitiator.style.display = 'block';
}

window.addEventListener('beforeunload', () => {
	serverConnection.close();
});
// #endregion

/**
 * Handle messages received from server
 * @param {*} message
 */
function gotMessageFromServer(message) {
	console.log('Got message', message.data);
	const data = JSON.parse(message.data);

	switch (data.type) {
		case 'login':
			handleLogin(data.success, data.allUsers, data.share);
			break;
		//when somebody wants to call us
		case 'offer':
			handleOffer(data.offer, data.name);
			break;
		case 'answer':
			handleAnswer(data.answer);
			break;
		case 'decline':
			handleDecline(data.message);
			break;
		//when a remote peer sends an ice candidate to us
		case 'candidate':
			handleCandidate(data.candidate);
			break;
		case 'leave':
			handleLeave();
			break;
		case 'hangup':
			handelHangUp();
			break;
		case 'users':
			refreshUserList(data.users);
			break;
		default:
			break;
	}

	serverConnection.onerror = errorHandler;
}

// #region utility functions
function getUserMediaSuccess(stream) {
	localStream = stream;
	localVideo.srcObject = stream;
	yourConn = new RTCPeerConnection(peerConnectionConfig);

	console.log('connection state inside getusermedia', yourConn.connectionState);

	setupConnection(stream);
}

function setupConnection(stream) {
	yourConn.onicecandidate = (event) => {
		console.log('onicecandidate: ', event.candidate);
		if (event.candidate) {
			send({
				type: 'candidate',
				name: connectedUser,
				candidate: event.candidate,
			});
		}
	};
	yourConn.ontrack = (event) => {
		console.log('got remote stream');
		showRemoteUsername.innerHTML = connectedUser;
		remoteVideo.srcObject = event.streams[0];
	};
	yourConn.addStream(stream);
}

function errorHandler(error) {
	console.error(error);
}

function send(msg) {
	console.log('sending:\n', msg);
	serverConnection.send(JSON.stringify(msg));
}

/**
 * @param {'m'|'s'} mediaType
 */
function share(mediaType) {
	localUser = usernameInput.value;
	showUsername.innerHTML = localUser;
	if (localUser.length > 0) {
		send({
			type: 'login',
			name: localUser,
			share: mediaType,
		});
	}
}
// #endregion

/**
 * Register user for first time i.e. Prepare ground for WebRTC call to happen
 * @param {boolean} success
 * @param {string[]} allUsers
 * @param {'m'|'s'} share
 */
function handleLogin(success, allUsers, share) {
	if (success === false) {
		alert('Oops...try a different username');
		return;
	}

	refreshUserList(allUsers);
	document.getElementById('myName').hidden = true;
	document.getElementById('otherElements').hidden = false;

	switch (share) {
		case 'm':
			navigator.mediaDevices
				.getUserMedia({
					video: true,
					audio: true,
				})
				.then(getUserMediaSuccess)
				.catch(errorHandler);
			break;
		case 's':
			navigator.mediaDevices.getDisplayMedia().then(getUserMediaSuccess).catch(errorHandler);
			break;
	}
}

// create an answer for an offer
function handleOffer(offer, name) {
	callInitiator.style.display = 'none';
	callReceiver.style.display = 'block';

	// Remove existing event listeners
	answerBtn.removeEventListener('click', handleAnswerClick);
	declineBtn.removeEventListener('click', handleDeclineClick);

	// Define the event handler functions
	function handleAnswerClick() {
		connectedUser = name;
		yourConn
			.setRemoteDescription(new RTCSessionDescription(offer))
			.then(() => {
				while (candidateQueue.length) {
					const candidate = candidateQueue.shift();
					yourConn.addIceCandidate(new RTCIceCandidate(candidate)).catch(errorHandler);
				}
			})
			.catch(errorHandler);

		// Create an answer to an offer
		yourConn
			.createAnswer()
			.then((answer) => yourConn.setLocalDescription(answer))
			.then(() => {
				send({
					type: 'answer',
					name: connectedUser,
					answer: yourConn.localDescription,
				});
				callReceiver.style.display = 'none';
				callOngoing.style.display = 'block';
			})
			.catch((error) => {
				alert('Error when creating an answer: ' + error);
			});
	}

	function handleDeclineClick() {
		callInitiator.style.display = 'block';
		callReceiver.style.display = 'none';
		send({
			type: 'decline',
			name: name,
		});
	}

	// Add new event listeners
	answerBtn.addEventListener('click', handleAnswerClick);
	declineBtn.addEventListener('click', handleDeclineClick);
}

// When got an answer from a remote user
function handleAnswer(answer) {
	console.log('answer: ', answer);
	yourConn
		.setRemoteDescription(new RTCSessionDescription(answer))
		.then(() => {
			while (candidateQueue.length) {
				const candidate = candidateQueue.shift();
				yourConn.addIceCandidate(new RTCIceCandidate(candidate)).catch(errorHandler);
			}
		})
		.catch(errorHandler);
}

function handleDecline(message) {
	callInitiator.style.display = 'block';
	callReceiver.style.display = 'none';
	callOngoing.style.display = 'none';
	alert(message);
}

//when we got an ice candidate from a remote user
function handleCandidate(candidate) {
	if (yourConn.remoteDescription) {
		yourConn.addIceCandidate(new RTCIceCandidate(candidate)).catch(errorHandler);
	} else {
		candidateQueue.push(candidate);
	}
}

/** Handle peer leaves */
function handleLeave() {
	handelHangUp();
}

function handelHangUp() {
	connectedUser = null;
	remoteVideo.src = null;
	remoteVideo.hidden = true;
	showRemoteUsername.innerHTML = '';

	callOngoing.style.display = 'none';
	callInitiator.style.display = 'block';

	yourConn.close();

	// Reset the connection
	yourConn = new RTCPeerConnection(peerConnectionConfig);
	setupConnection(localStream);
}

/**
 * @param {string[]} users
 */
function refreshUserList(users) {
	const allAvailableUsers = users.join(', ');
	console.log('All available users', allAvailableUsers);
	showAllUsers.innerHTML = 'Available users: ' + allAvailableUsers;
}
