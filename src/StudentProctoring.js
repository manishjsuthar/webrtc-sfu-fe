// StudentProctoring.js
import React, { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { Device } from "mediasoup-client";
import { useParams } from "react-router-dom";
const socket = io("https://localhost:7100/mediasoup");

const StudentProctoring = () => {
  const localVideoRef = useRef(null);
  // const roomName = window.location.pathname.split("/")[1];
  // const roomName = "hello112";
  const { roomName } = useParams();
  let device;

  const getVideoParams = () => ({
    encodings: [
      { rid: "r0", maxBitrate: 100000, scalabilityMode: "S1T3" },
      { rid: "r1", maxBitrate: 300000, scalabilityMode: "S1T3" },
      { rid: "r2", maxBitrate: 900000, scalabilityMode: "S1T3" },
    ],
    codecOptions: { videoGoogleStartBitrate: 1000 },
  });

  useEffect(() => {
    const handleConnectionSuccess = ({ socketId }) => {
      console.log(socketId);
      getLocalStream();
    };

    socket.on("connection-success", handleConnectionSuccess);

    return () => {
      socket.off("connection-success", handleConnectionSuccess);
      // socket.disconnect();
    };
  }, []);

  const getLocalStream = () => {
    navigator.mediaDevices
      .getUserMedia({
        audio: true,
        video: {
          width: { min: 640, max: 1920 },
          height: { min: 400, max: 1080 },
        },
      })
      .then((stream) => streamSuccess(stream))
      .catch((error) => console.error("Error accessing media devices.", error));
  };

  const streamSuccess = (stream) => {
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = stream;
    }
    const audioParams = { track: stream.getAudioTracks()[0] };
    const videoParams = {
      track: stream.getVideoTracks()[0],
      params: getVideoParams(),
    };

    joinRoom(audioParams, videoParams);
  };

  const joinRoom = (audioParams, videoParams) => {
    socket.emit(
      "joinRoom",
      { roomName, role: "student", name: "test", id: 12 },
      (data) => {
        console.log(`Router RTP Capabilities... ${data.rtpCapabilities}`);
        createDevice(data.rtpCapabilities, audioParams, videoParams);
      }
    );
  };

  const createDevice = async (rtpCapabilities1, audioParams, videoParams) => {
    try {
      device = new Device();
      await device.load({ routerRtpCapabilities: rtpCapabilities1 });
      console.log("Device RTP Capabilities", device.rtpCapabilities);
      createSendTransport(device, audioParams, videoParams);
    } catch (error) {
      console.error("Error creating device:", error);
      if (error.name === "UnsupportedError") {
        console.warn("Browser not supported");
      }
    }
  };

  const createSendTransport = (device, audioParams, videoParams) => {
    socket.emit("createWebRtcTransport", { consumer: false }, ({ params }) => {
      if (params.error) {
        console.error(params.error);
        return;
      }

      const producerTransport = device.createSendTransport(params);

      producerTransport.on(
        "connect",
        async ({ dtlsParameters }, callback, errback) => {
          try {
            await socket.emit("transport-connect", { dtlsParameters });
            callback();
          } catch (error) {
            errback(error);
          }
        }
      );

      producerTransport.on("produce", async (parameters, callback, errback) => {
        try {
          await socket.emit(
            "transport-produce",
            {
              kind: parameters.kind,
              rtpParameters: parameters.rtpParameters,
              appData: parameters.appData,
            },
            ({ id, producersExist }) => {
              callback({ id });
              // if (producersExist) getProducers();
            }
          );
        } catch (error) {
          errback(error);
        }
      });

      connectSendTransport(producerTransport, audioParams, videoParams);
    });
  };

  const connectSendTransport = async (
    producerTransport,
    audioParams,
    videoParams
  ) => {
    try {
      const audioProducer = await producerTransport.produce(audioParams);
      const videoProducer = await producerTransport.produce(videoParams);

      // setAudioProducer(audioProducer);
      // setVideoProducer(videoProducer);

      audioProducer.on("trackended", () => console.log("Audio track ended"));
      audioProducer.on("transportclose", () =>
        console.log("Audio transport ended")
      );

      videoProducer.on("trackended", () => console.log("Video track ended"));
      videoProducer.on("transportclose", () =>
        console.log("Video transport ended")
      );
    } catch (error) {
      console.error("Error connecting send transport:", error);
    }
  };

  return (
    <div>
      <h1>Student Proctoring</h1>
      {/* <input
        type="text"
        placeholder="Enter Room ID"
        value={roomName}
        onChange={(e) => setroomName(e.target.value)}
      />
      <button onClick={joinRoom}>Join Room</button> */}
      <video ref={localVideoRef} id="local-video" autoPlay muted />
    </div>
  );
};

export default StudentProctoring;
