/** @type {RTCPeerConnection} */
let yourConn;
let candidateQueue = [];

let localUser;
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

/**
 * @param {HTMLInputElement} self
 */
function loginClick(self) {
	self.outerHTML = /* html */ `
		<button class="primary" onclick="share('m')">Share Media</button>
		<button class="primary" onclick="share('s')">Share Screen</button>`;
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

/**
 * Register user for first time i.e. Prepare ground for webrtc call to happen
 * @param {boolean} success
 * @param {Array[string]} allUsers
 * @param {'m'|'s'} share
 */
function handleLogin(success, allUsers, share) {
	if (success === false) {
		alert('Oops...try a different username');
	} else {
		const allAvailableUsers = allUsers.join(', ');
		console.log('All available users', allAvailableUsers);
		showAllUsers.innerHTML = 'Available users: ' + allAvailableUsers;
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
}

function getUserMediaSuccess(stream) {
	const localStream = stream;
	localVideo.srcObject = stream;
	yourConn = new RTCPeerConnection(peerConnectionConfig);

	const connectionState = yourConn.connectionState;
	console.log('connection state inside getusermedia', connectionState);

	yourConn.onicecandidate = (event) => {
		console.log('onicecandidate inside getusermedia success', event.candidate);
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
	yourConn.addStream(localStream);
}

/**
 * Initiate call to any user i.e. send message to server
 */
function callBtnClick() {
	console.log('inside call button');

	const callToUsername = callToUsernameInput.value;

	if (callToUsername.length > 0) {
		connectedUser = callToUsername;
		console.log('create an offer to ', callToUsername);
		console.log('connection state', yourConn.connectionState);
		console.log('signalling state', yourConn.signalingState);
		yourConn
			.createOffer()
			.then(async (offer) => {
				send({
					type: 'offer',
					name: connectedUser,
					offer: offer,
				});

				await yourConn.setLocalDescription(offer);
				callOngoing.style.display = 'block';
				callInitiator.style.display = 'none';
			})
			.catch((error) => {
				alert('Error when creating an offer', error);
				console.log('Error when creating an offer', error);
			});
	} else alert("username can't be blank!");
}

/* START: Recieved call from server i.e. recieve messages from server  */
function gotMessageFromServer(message) {
	console.log('Got message', message.data);
	const data = JSON.parse(message.data);

	switch (data.type) {
		case 'login':
			handleLogin(data.success, data.allUsers, data.share);
			break;
		//when somebody wants to call us
		case 'offer':
			console.log('inside offer');
			handleOffer(data.offer, data.name);
			break;
		case 'answer':
			console.log('inside answer');
			handleAnswer(data.answer);
			break;
		//when a remote peer sends an ice candidate to us
		case 'candidate':
			console.log('inside handle candidate');
			handleCandidate(data.candidate);
			break;
		case 'leave':
			handleLeave();
			break;
		default:
			break;
	}

	serverConnection.onerror = function (err) {
		console.log('Got error', err);
	};
}

function send(msg) {
	console.log('msg sended to server:\n', msg);
	serverConnection.send(JSON.stringify(msg));
}

function gotRemoteStream(event) {
	console.log('got remote stream');
	showRemoteUsername.innerHTML = connectedUser;
	remoteVideo.srcObject = event.streams[0];
}

function errorHandler(error) {
	console.error(error);
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
			.then(async (answer) => {
				await yourConn.setLocalDescription(answer).then(() => {
					send({
						type: 'answer',
						name: connectedUser,
						answer: answer,
					});
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
	}

	// Add new event listeners
	answerBtn.addEventListener('click', handleAnswerClick);
	declineBtn.addEventListener('click', handleDeclineClick);
}

//when we got an answer from a remote user
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

//when we got an ice candidate from a remote user
function handleCandidate(candidate) {
	if (yourConn.remoteDescription) {
		yourConn.addIceCandidate(new RTCIceCandidate(candidate)).catch(errorHandler);
	} else {
		candidateQueue.push(candidate);
	}
}

//hang up
function hangUp() {
	send({
		type: 'leave',
		name: localUser,
	});

	handleLeave();

	callOngoing.style.display = 'none';
	callInitiator.style.display = 'block';
}

function handleLeave() {
	connectedUser = null;
	remoteVideo.src = null;
	remoteVideo.hidden = true;
	showRemoteUsername.innerHTML = '';
	console.log('connection state before', yourConn.connectionState);
	console.log('signalling state before', yourConn.signalingState);
	yourConn.close();
	yourConn.onicecandidate = null;
	console.log('connection state after', yourConn.connectionState);
	console.log('signalling state after', yourConn.signalingState);
}
