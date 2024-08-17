/** @type {RTCPeerConnection} */
let yourConn;

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
	const name = usernameInput.value;
	showUsername.innerHTML = name;
	if (name.length > 0) {
		send({
			type: 'login',
			name: name,
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
				candidate: event.candidate,
			});
		}
	};
	yourConn.ontrack = gotRemoteStream;
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
		console.log('nameToCall', connectedUser);
		console.log('create an offer to-', connectedUser);

		const connectionState2 = yourConn.connectionState;
		console.log('connection state before call beginning', connectionState2);
		const signallingState2 = yourConn.signalingState;
		//console.log('connection state after',connectionState1)
		console.log('signalling state after', signallingState2);
		yourConn
			.createOffer()
			.then(async (offer) => {
				send({
					type: 'offer',
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
	//attach the other peer username to our messages
	if (connectedUser) {
		msg.name = connectedUser;
	}
	console.log('msg before sending to server', msg);
	serverConnection.send(JSON.stringify(msg));
}

/* START: Create an answer for an offer i.e. send message to server */
function handleOffer(offer, name) {
	callInitiator.style.display = 'none';
	callReceiver.style.display = 'block';

	/* Call answer functionality starts */
	answerBtn.addEventListener('click', () => {
		connectedUser = name;
		yourConn.setRemoteDescription(new RTCSessionDescription(offer));

		// Create an answer to an offer
		yourConn
			.createAnswer()
			.then(async (answer) => {
				await yourConn.setLocalDescription(answer).then(() => {
					send({
						type: 'answer',
						answer: answer,
					});
				});
				callReceiver.style.display = 'none';
				callOngoing.style.display = 'block';
			})
			.catch((error) => {
				alert('Error when creating an answer: ' + error);
			});
	});
	/* Call answer functionality ends */
	/* Call decline functionality starts */
	declineBtn.addEventListener('click', () => {
		callInitiator.style.display = 'block';
		callReceiver.style.display = 'none';
	});

	/*Call decline functionality ends */
}

function gotRemoteStream(event) {
	console.log('got remote stream');
	showRemoteUsername.innerHTML = connectedUser;
	remoteVideo.srcObject = event.streams[0];
}

function errorHandler(error) {
	console.log(error);
}

//when we got an answer from a remote user
function handleAnswer(answer) {
	console.log('answer: ', answer);
	yourConn.setRemoteDescription(new RTCSessionDescription(answer));
}

//when we got an ice candidate from a remote user
function handleCandidate(candidate) {
	yourConn.addIceCandidate(new RTCIceCandidate(candidate));
}

//hang up
function hangUp() {
	send({
		type: 'leave',
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
	const connectionState = yourConn.connectionState;
	const signallingState = yourConn.signalingState;
	console.log('connection state before', connectionState);
	console.log('signalling state before', signallingState);
	yourConn.close();
	yourConn.onicecandidate = null;
	const connectionState1 = yourConn.connectionState;
	const signallingState1 = yourConn.signalingState;
	console.log('connection state after', connectionState1);
	console.log('signalling state after', signallingState1);
}
