import React, { useEffect, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';

const Call = () => {
  const { roomName } = useParams();
  const localVideoRef = useRef();
  const remoteVideoRef = useRef();
  const peerConnectionRef = useRef(null);
  const socketRef = useRef();
  const messageQueue = useRef([]);
  const iceCandidateQueue = useRef([]);
  const offerQueue = useRef([]);
  const processingOffer = useRef(false);

  const handleOffer = useCallback(async (offer) => {
    try {
      if (peerConnectionRef.current.signalingState !== 'stable' || processingOffer.current) {
        console.warn('Signaling state is not stable or already processing an offer. Queuing the offer.');
        offerQueue.current.push(offer);
        return;
      }

      processingOffer.current = true;
      await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await peerConnectionRef.current.createAnswer();
      await peerConnectionRef.current.setLocalDescription(answer);
      queueMessage({
        type: 'answer',
        answer: peerConnectionRef.current.localDescription,
      });

      // Process any queued ICE candidates
      while (iceCandidateQueue.current.length > 0) {
        const candidate = iceCandidateQueue.current.shift();
        try {
          await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (error) {
          console.error('Error adding received ice candidate', error);
        }
      }
      processingOffer.current = false;

      // Process any queued offers
      if (offerQueue.current.length > 0) {
        const nextOffer = offerQueue.current.shift();
        handleOffer(nextOffer);
      }
    } catch (error) {
      console.error('Error handling offer:', error);
      processingOffer.current = false;
    }
  }, []);

  const createPeerConnection = useCallback(() => {
    const config = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
      ],
    };

    const peerConnection = new RTCPeerConnection(config);

    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        console.log('Sending ICE candidate:', event.candidate);
        queueMessage({
          type: 'ice-candidate',
          candidate: event.candidate,
        });
      }
    };

    peerConnection.ontrack = (event) => {
      console.log('Received remote track:', event.streams[0]);
      remoteVideoRef.current.srcObject = event.streams[0];
    };

    peerConnection.onsignalingstatechange = () => {
      console.log('Signaling state changed:', peerConnection.signalingState);
      if (peerConnection.signalingState === 'stable') {
        console.log('Signaling state is stable. Processing queued offers.');
        while (offerQueue.current.length > 0) {
          const offer = offerQueue.current.shift();
          handleOffer(offer);
        }
      }
    };

    return peerConnection;
  }, [handleOffer]);

  const handleSignalingData = useCallback(async (data) => {
    console.log('Received signaling data:', data);
    switch (data.type) {
      case 'offer':
        console.log('Received offer:', data.offer);
        handleOffer(data.offer);
        break;
      case 'answer':
        console.log('Received answer:', data.answer);
        if (peerConnectionRef.current.signalingState !== 'have-local-offer') {
          console.warn('Signaling state is not have-local-offer');
          return;
        }
        await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(data.answer));

        // Process any queued ICE candidates
        while (iceCandidateQueue.current.length > 0) {
          const candidate = iceCandidateQueue.current.shift();
          try {
            await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate));
          } catch (error) {
            console.error('Error adding received ice candidate', error);
          }
        }
        break;
      case 'ice-candidate':
        console.log('Received ICE candidate:', data.candidate);
        if (peerConnectionRef.current.remoteDescription) {
          try {
            await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(data.candidate));
          } catch (error) {
            console.error('Error adding received ice candidate', error);
          }
        } else {
          iceCandidateQueue.current.push(data.candidate);
        }
        break;
      default:
        break;
    }
  }, [handleOffer]);

  useEffect(() => {
    const wsURL = `${process.env.REACT_APP_WEBSOCKET_URL}${roomName}/`;

    socketRef.current = new WebSocket(wsURL);

    socketRef.current.onopen = () => {
      console.log('WebSocket Connection Established');
      messageQueue.current.forEach((message) => socketRef.current.send(JSON.stringify(message)));
      messageQueue.current = [];
    };

    socketRef.current.onmessage = (e) => {
      const message = JSON.parse(e.data);
      handleSignalingData(message);
    };

    const constraints = {
      video: true,
      audio: true,
    };

    navigator.mediaDevices.getUserMedia(constraints)
      .then(stream => {
        console.log('Local stream obtained');
        localVideoRef.current.srcObject = stream;
        peerConnectionRef.current = createPeerConnection();
        stream.getTracks().forEach(track => {
          peerConnectionRef.current.addTrack(track, stream);
        });
        // Create an offer after setting up the local stream
        peerConnectionRef.current.onnegotiationneeded = async () => {
          console.log('Negotiation needed');
          const offer = await peerConnectionRef.current.createOffer();
          await peerConnectionRef.current.setLocalDescription(offer);
          queueMessage({
            type: 'offer',
            offer: peerConnectionRef.current.localDescription,
          });
        };
      })
      .catch(error => {
        console.error('Error accessing media devices:', error);
      });

    return () => {
      socketRef.current.close();
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
      }
    };
  }, [roomName, createPeerConnection, handleSignalingData]);

  const queueMessage = (message) => {
    if (socketRef.current.readyState === WebSocket.OPEN) {
      console.log('Sending message:', message);
      socketRef.current.send(JSON.stringify(message));
    } else {
      messageQueue.current.push(message);
    }
  };

  return (
    <div className="call-container">
      <div className="video-container">
        <video ref={localVideoRef} autoPlay playsInline muted className="local-video"></video>
        <video ref={remoteVideoRef} autoPlay playsInline className="remote-video"></video>
      </div>
    </div>
  );
};

export default Call