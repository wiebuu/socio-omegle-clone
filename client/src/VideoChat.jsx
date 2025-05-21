import React, { useEffect, useRef, useState, useCallback } from 'react';
import socket from './socket';
import './styles.css';

function VideoChat() {
  const [partnerId, setPartnerId] = useState(null);
  const [privateMessage, setPrivateMessage] = useState('');
  const [targetId, setTargetId] = useState('');
  const [chatMessages, setChatMessages] = useState([]);
  const chatEndRef = useRef(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [isAudioOn, setIsAudioOn] = useState(true);
  const [hasNewMessage, setHasNewMessage] = useState(false);

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const peerConnectionRef = useRef(null);

  // Tab restriction logic
  useEffect(() => {
    const TAB_KEY = 'openTabs';
    const TAB_LIMIT = 3;

    const updateTabCount = () => {
      const thisTabId = sessionStorage.getItem('tabId') || Date.now().toString();
      sessionStorage.setItem('tabId', thisTabId);

      const tabs = JSON.parse(localStorage.getItem(TAB_KEY) || '[]');
      const now = Date.now();

      const filteredTabs = tabs.filter(tab => now - tab.timestamp < 5000);
      const exists = filteredTabs.some(tab => tab.id === thisTabId);

      if (!exists) {
        filteredTabs.push({ id: thisTabId, timestamp: now });
      } else {
        filteredTabs.forEach(tab => {
          if (tab.id === thisTabId) {
            tab.timestamp = now;
          }
        });
      }

      if (filteredTabs.length > TAB_LIMIT) {
        alert("You can only open up to 3 tabs of this website at once.");
        window.location.href = "about:blank";
        return;
      }

      localStorage.setItem(TAB_KEY, JSON.stringify(filteredTabs));
    };

    const removeTab = () => {
      const thisTabId = sessionStorage.getItem('tabId');
      const tabs = JSON.parse(localStorage.getItem(TAB_KEY) || '[]');
      const updatedTabs = tabs.filter(tab => tab.id !== thisTabId);
      localStorage.setItem(TAB_KEY, JSON.stringify(updatedTabs));
    };

    updateTabCount();
    const interval = setInterval(updateTabCount, 3000);
    window.addEventListener('beforeunload', removeTab);
    window.addEventListener('unload', removeTab);

    return () => {
      clearInterval(interval);
      removeTab();
      window.removeEventListener('beforeunload', removeTab);
      window.removeEventListener('unload', removeTab);
    };
  }, []);

  const startVideoChat = useCallback((partnerId) => {
    if (!localVideoRef.current || !remoteVideoRef.current) return;

    const peerConnection = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });

    peerConnectionRef.current = peerConnection;

    navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      .then((stream) => {
        localVideoRef.current.srcObject = stream;

        stream.getVideoTracks().forEach(track => {
          track.enabled = isVideoOn;
          peerConnection.addTrack(track, stream);
        });
        stream.getAudioTracks().forEach(track => {
          track.enabled = isAudioOn;
          peerConnection.addTrack(track, stream);
        });

        return peerConnection.createOffer();
      })
      .then((offer) => peerConnection.setLocalDescription(offer))
      .then(() => {
        socket.emit('video_offer', { offer: peerConnection.localDescription, to: partnerId });
      })
      .catch((err) => console.error('Error accessing media devices:', err));

    peerConnection.ontrack = (event) => {
      const remoteVideo = remoteVideoRef.current;
      if (remoteVideo) {
        remoteVideo.srcObject = event.streams[0];
        remoteVideo.muted = false;
      }
    };

    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('ice_candidate', { candidate: event.candidate, to: partnerId });
      }
    };
  }, [isVideoOn, isAudioOn]);

  const handleVideoOffer = useCallback((data) => {
    const { offer, from } = data;

    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }

    peerConnectionRef.current = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });

    peerConnectionRef.current.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('ice_candidate', { candidate: event.candidate, to: from });
      }
    };

    peerConnectionRef.current.ontrack = (event) => {
      if (remoteVideoRef.current) {
        const remoteVideo = remoteVideoRef.current;
        if (remoteVideo) {
          remoteVideo.srcObject = event.streams[0];
          remoteVideo.muted = false;
        }
      }
    };

    peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(offer))
      .then(() => navigator.mediaDevices.getUserMedia({ video: true, audio: true }))
      .then((userStream) => {
        userStream.getVideoTracks().forEach(track => {
          track.enabled = isVideoOn;
          peerConnectionRef.current.addTrack(track, userStream);
        });
        userStream.getAudioTracks().forEach(track => {
          track.enabled = isAudioOn;
          peerConnectionRef.current.addTrack(track, userStream);
        });

        localVideoRef.current.srcObject = userStream;

        return peerConnectionRef.current.createAnswer();
      })
      .then((answer) => peerConnectionRef.current.setLocalDescription(answer))
      .then(() => {
        socket.emit('video_answer', { answer: peerConnectionRef.current.localDescription, to: from });
      })
      .catch((err) => console.error("Error handling video offer: ", err));
  }, [isVideoOn, isAudioOn]);

  useEffect(() => {
    socket.on('connect', () => {
      console.log('Connected to server! ID:', socket.id);
    });

    socket.on('matched', ({ partnerId, isInitiator }) => {
      console.log('Matched with:', partnerId);
      setPartnerId(partnerId);
      setTargetId(partnerId);

      if (isInitiator) {
        startVideoChat(partnerId);
      }
    });

    socket.on('video_offer', handleVideoOffer);
    socket.on('video_answer', handleVideoAnswer);
    socket.on('ice_candidate', handleNewICECandidate);

    socket.on('private_message', ({ from, message }) => {
      if (message) {
        setChatMessages((prevMessages) => [
          ...prevMessages,
          { from, message, type: 'received' }
        ]);
        setHasNewMessage(true);
      }
    });

    socket.on('partner_left', () => {
      setPartnerId(null);
      setTargetId('');
      setChatMessages((prev) => [...prev, { from: 'System', content: 'Partner left.' }]);

      if (remoteVideoRef.current) {
        const video = remoteVideoRef.current;
        video.srcObject = null;
        video.pause();
        video.removeAttribute('src');
        video.load();

        video.muted = true;
        video.loop = true;
        video.src = '/socio-vid.mp4';

        video.oncanplay = () => {
          video.play().catch((e) => console.warn("Autoplay failed:", e));
        };
      }

      setTimeout(() => {
        socket.emit('find_match');
      }, 2000);
    });

    return () => {
      socket.off('connect');
      socket.off('matched');
      socket.off('video_offer');
      socket.off('video_answer');
      socket.off('ice_candidate');
      socket.off('private_message');
      socket.off('partner_left');
    };
  }, [startVideoChat, handleVideoOffer]);

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages]);

  const handleVideoAnswer = (data) => {
    const { answer } = data;
    peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(answer))
      .catch((err) => console.error("Error setting remote description: ", err));
  };

  const handleNewICECandidate = (data) => {
    const { candidate } = data;
    const peerConnection = peerConnectionRef.current;

    if (!peerConnection || peerConnection.signalingState === 'closed') {
      return;
    }

    peerConnection.addIceCandidate(new RTCIceCandidate(candidate))
      .catch((err) => console.error("Error adding ICE candidate: ", err));
  };

  const toggleVideo = () => {
    const stream = localVideoRef.current?.srcObject;
    if (stream) {
      stream.getVideoTracks().forEach(track => {
        track.enabled = !track.enabled;
        setIsVideoOn(track.enabled);
      });
    }
  };

  const toggleAudio = () => {
    const stream = localVideoRef.current?.srcObject;
    if (stream) {
      stream.getAudioTracks().forEach(track => {
        track.enabled = !track.enabled;
        setIsAudioOn(track.enabled);
      });
    }
  };

  const sendPrivateMessage = () => {
    if (privateMessage.trim() !== '' && targetId.trim() !== '') {
      socket.emit('private_message', {
        content: privateMessage,
        to: targetId
      });
      setChatMessages(prev => [
        ...prev,
        { from: 'You', message: privateMessage, type: 'sent' }
      ]);
      setPrivateMessage('');
    }
  };

  const leaveChat = () => {
    setTimeout(() => {
      socket.emit('leave_chat');
    }, 2000);
    setPartnerId(null);
    setTargetId('');
    setChatMessages((prev) => [...prev, { from: 'System', content: 'You left.' }]);

    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }

    if (remoteVideoRef.current) {
      const video = remoteVideoRef.current;
      video.srcObject = null;
      video.pause();
      video.removeAttribute('src');
      video.load();

      video.muted = true;
      video.loop = true;
      video.src = '/socio-vid.mp4';

      video.oncanplay = () => {
        video.play().catch((e) => console.warn("Autoplay failed:", e));
      };
    }
  };

  return (
    <div>
      <div className="video-container">
        <div className="videos-wrapper">
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            loop
            src={!partnerId ? '/socio-vid.mp4' : undefined}
          />
          <video ref={localVideoRef} autoPlay muted playsInline />

          {partnerId && (
            <button
              className={`chat-toggle-btn ${hasNewMessage ? 'chat-icon-glow' : ''}`}
              onClick={() => {
                setChatOpen((prev) => !prev);
                if (hasNewMessage) setHasNewMessage(false);
              }}
            >
              <img
                src={hasNewMessage ? '/new-chat-icon.png' : '/chat-icon.png'}
                alt="Chat"
                className="chat-icon"
              />
            </button>
          )}
        </div>
      </div>

      <div className={`chat-panel ${chatOpen ? 'open' : ''}`}>
        <div className="chat-content">
          {chatMessages.map((msg, index) => (
            <div
              key={index}
              className={`chat-message ${msg.from === 'System' ? 'system' : (msg.type === 'sent' ? 'sent' : 'received')}`}
            >
              <span>{msg.message || msg.content}</span>
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>

        <div className="input-area">
          <input
            type="text"
            placeholder="Type a private message..."
            value={privateMessage}
            onChange={(e) => setPrivateMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                sendPrivateMessage();
              }
            }}
          />
          <button onClick={sendPrivateMessage}>Send</button>
        </div>
      </div>

      {partnerId && !chatOpen && (
        <div className="button-group-inline">
          <button onClick={toggleVideo} className="chat-button">
            <img
              src={isVideoOn ? '/icons/video.png' : '/icons/video-off.png'}
              alt={isVideoOn ? 'Video On' : 'Video Off'}
              className="toggle-icon"
            />
          </button>
          <button onClick={toggleAudio} className="chat-button">
            <img
              src={isAudioOn ? '/icons/mic.png' : '/icons/mic-off.png'}
              alt={isAudioOn ? 'Audio On' : 'Audio Off'}
              className="toggle-icon"
            />
          </button>
          <button onClick={leaveChat} className="chat-button red">Leave</button>
        </div>
      )}
    </div>
  );
}

export default VideoChat;
