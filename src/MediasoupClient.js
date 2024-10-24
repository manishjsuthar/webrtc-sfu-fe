import React, { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { Device } from "mediasoup-client";
const socket = io("https://localhost:4200/mediasoup");

const MediasoupComponent = () => {
  const localVideoRef = useRef(null);
  const videoContainerRef = useRef(null);
  const roomName = window.location.pathname.split("/")[1];
  let device;
  let consumingTransports = [];
  let consumerTransports = [];

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

    const handleNewProducer = ({ producerId }) =>
      signalNewConsumerTransport(producerId);
    const handleProducerClose = ({ remoteProducerId }) =>
      handleProducerClosed(remoteProducerId);

    socket.on("connection-success", handleConnectionSuccess);
    socket.on("new-producer", handleNewProducer);
    socket.on("producer-closed", handleProducerClose);

    return () => {
      socket.off("connection-success", handleConnectionSuccess);
      socket.off("new-producer", handleNewProducer);
      socket.off("producer-closed", handleProducerClose);
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
    socket.emit("joinRoom", { roomName }, (data) => {
      console.log(`Router RTP Capabilities... ${data.rtpCapabilities}`);
      createDevice(data.rtpCapabilities, audioParams, videoParams);
    });
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
              if (producersExist) getProducers();
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

  const signalNewConsumerTransport = async (remoteProducerId) => {
    if (consumingTransports.includes(remoteProducerId)) return;
    consumingTransports.push(remoteProducerId);

    try {
      await socket.emit(
        "createWebRtcTransport",
        { consumer: true },
        ({ params }) => {
          if (params.error) {
            console.error(params.error);
            return;
          }

          let consumerTransport;
          try {
            consumerTransport = device.createRecvTransport(params);
          } catch (error) {
            // exceptions:
            // {InvalidStateError} if not loaded
            // {TypeError} if wrong arguments.
            console.log("signalNewConsumerTransport ", error);
            return;
          }

          consumerTransport.on(
            "connect",
            async ({ dtlsParameters }, callback, errback) => {
              try {
                // Signal local DTLS parameters to the server side transport
                // see server's socket.on('transport-recv-connect', ...)
                await socket.emit("transport-recv-connect", {
                  dtlsParameters,
                  serverConsumerTransportId: params.id,
                });

                // Tell the transport that parameters were transmitted.
                callback();
              } catch (error) {
                // Tell the transport that something was wrong
                errback(error);
              }
            }
          );

          connectRecvTransport(consumerTransport, remoteProducerId, params.id);
        }
      );
    } catch (error) {
      console.error("Error signaling new consumer transport:", error);
    }
  };

  const getProducers = () => {
    socket.emit("getProducers", (producerIds) => {
      console.log(producerIds);
      producerIds.forEach(signalNewConsumerTransport);
    });
  };

  const connectRecvTransport = async (
    consumerTransport,
    remoteProducerId,
    serverConsumerTransportId
  ) => {
    try {
      await socket.emit(
        "consume",
        {
          rtpCapabilities: device.rtpCapabilities,
          remoteProducerId,
          serverConsumerTransportId,
        },
        async ({ params }) => {
          if (params.error) {
            console.error("Cannot consume:", params.error);
            return;
          }

          const consumer = await consumerTransport.consume({
            id: params.id,
            producerId: params.producerId,
            kind: params.kind,
            rtpParameters: params.rtpParameters,
          });

          consumerTransports = [
            ...consumerTransports,
            {
              consumerTransport,
              serverConsumerTransportId: params.id,
              producerId: remoteProducerId,
              consumer,
            },
          ];

          // Create a new div element for the new consumer media
          const newElem = document.createElement("div");
          newElem.setAttribute("id", `td-${remoteProducerId}`);

          if (params.kind === "audio") {
            newElem.innerHTML =
              '<audio id="' + remoteProducerId + '" autoplay></audio>';
          } else {
            newElem.setAttribute("class", "remoteVideo");
            newElem.innerHTML =
              '<video id="' +
              remoteProducerId +
              '" autoplay class="video"></video>';
          }

          videoContainerRef.current.appendChild(newElem);

          // Set the media stream for the consumer
          const { track } = consumer;
          document.getElementById(remoteProducerId).srcObject = new MediaStream(
            [track]
          );

          // Resume the consumer
          socket.emit("consumer-resume", {
            serverConsumerId: params.serverConsumerId,
          });
        }
      );
    } catch (error) {
      console.error("Error connecting receive transport:", error);
    }
  };

  const handleProducerClosed = (remoteProducerId) => {
    const producerToClose = consumerTransports.find(
      (transportData) => transportData.producerId === remoteProducerId
    );

    if (producerToClose) {
      producerToClose.consumerTransport.close();
      producerToClose.consumer.close();

      // remove the consumer transport from the list
      consumerTransports = consumerTransports.filter(
        (transportData) => transportData.producerId !== remoteProducerId
      );

      videoContainerRef.current.removeChild(
        document.getElementById(`td-${remoteProducerId}`)
      );
    }
  };

  return (
    <div>
      <h1>Proctoring</h1>
      <video ref={localVideoRef} id="local-video" autoPlay />
      <div ref={videoContainerRef} id="video-container" />
    </div>
  );
};

export default MediasoupComponent;
