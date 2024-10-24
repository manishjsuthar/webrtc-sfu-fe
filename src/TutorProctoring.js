// TutorProctoring.js
import React, { useEffect, useRef, useState } from 'react';
import io from 'socket.io-client';
import * as mediasoupClient from 'mediasoup-client';

const socket = io('http://localhost:3000'); // Replace with your backend URL

const TutorProctoring = () => {
  const [roomId, setRoomId] = useState('');
  const [device, setDevice] = useState(null);
  const [streams, setStreams] = useState([]);
  const videoRefs = useRef([]);

  const joinRoom = () => {
    if (roomId) {
      socket.emit('joinRoom', { roomId });

      const startTutorStream = async () => {
        socket.emit('getRouterRtpCapabilities', async (routerRtpCapabilities) => {
          const device = new mediasoupClient.Device();
          await device.load({ routerRtpCapabilities });
          setDevice(device);

          socket.on('newProducer', async ({ producerId }) => {
            socket.emit('createTransport', async (transportParams) => {
              const recvTransport = device.createRecvTransport(transportParams);

              recvTransport.on('connect', ({ dtlsParameters }, callback, errback) => {
                socket.emit('connectTransport', { dtlsParameters, roomId });
                callback();
              });

              const consumer = await recvTransport.consume({
                producerId,
                rtpCapabilities: device.rtpCapabilities,
              });

              const newStream = new MediaStream();
              newStream.addTrack(consumer.track);

              setStreams((prev) => [...prev, newStream]);
            });
          });
        });
      };

      startTutorStream();
    } else {
      alert('Please enter a room ID');
    }
  };

  return (
    <div>
      <h1>Tutor Proctoring</h1>
      <input
        type="text"
        placeholder="Enter Room ID"
        value={roomId}
        onChange={(e) => setRoomId(e.target.value)}
      />
      <button onClick={joinRoom}>Join Room</button>
      <div>
        {streams.map((stream, index) => (
          <video
            key={index}
            ref={(el) => {
              if (el) el.srcObject = stream;
            }}
            autoPlay
            style={{ width: '300px', height: '200px' }}
          />
        ))}
      </div>
    </div>
  );
};

export default TutorProctoring;
