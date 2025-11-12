import { type DataChannel } from "./dataChannels/DataChannel.js";

export type RTCNegotiationMessage = {
	description: RTCSessionDescriptionInit;
} | {
	candidate: RTCIceCandidateInit;
}

export namespace RTCNegotiationMessage {
	export function isInstance(message: unknown): message is RTCNegotiationMessage {
		if (typeof message !== "object" || message === null) return false;

		if ("description" in message) return true;
		if ("candidate" in message) return true;

		return false;
	}
}

export function webRTCPerfectNegotiation(
	signaler: DataChannel<RTCNegotiationMessage, RTCNegotiationMessage>,
	pc: RTCPeerConnection,
	polite: boolean
) {
	let makingOffer = false;
	let ignoreOffer = false;

	pc.onnegotiationneeded = async () => {
		makingOffer = true;
		try {
			await pc.setLocalDescription();
			signaler.send({ description: pc.localDescription!.toJSON() });
		} catch (err) {
			console.error(err);
		}
		makingOffer = false;
	}

	signaler.onMessage.addListener(async (message) => {
		try {
			if ("description" in message) {
				const description = message.description;

				const hasOffer = makingOffer || pc.signalingState !== "stable";
				const offerCollision = description.type === "offer" && hasOffer;


				ignoreOffer = !polite && offerCollision;
				if (ignoreOffer) return;

				await pc.setRemoteDescription(description);
				if (description.type === "offer") {
					await pc.setLocalDescription();
					signaler.send({ description: pc.localDescription!.toJSON() });
				}
			}
			if ("candidate" in message) {
				try {
					await pc.addIceCandidate(message.candidate);
				} catch (err) {
					if (!ignoreOffer) throw err;
				}
			}
		} catch (err) {
			console.error(err, signaler, message);
		}
	});

	pc.onicecandidate = e => {
		if (e.candidate) signaler.send({ candidate: e.candidate.toJSON() });
	}
}