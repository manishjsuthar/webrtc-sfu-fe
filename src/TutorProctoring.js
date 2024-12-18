// TutorProctoring.js
import React, { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { Device } from "mediasoup-client";
import { useParams } from "react-router-dom";
const socket = io("https://localhost:7100/mediasoup");

const TutorProctoring = () => {
  const videoContainerRef = useRef(null);
  // const roomName = window.location.pathname.split("/")[1];
  // const roomName = "hello112";
  const { roomName } = useParams();
  let device;
  let consumingTransports = [];
  let consumerTransports = [];
  const [socketStreamId, setsocketStreamId] = useState("");

  useEffect(() => {
    const handleConnectionSuccess = ({ socketId }) => {
      console.log(socketId);
      joinRoom();
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

  const joinRoom = () => {
    socket.emit("joinRoom", { roomName }, (data) => {
      console.log(`Router RTP Capabilities... ${data.rtpCapabilities}`);
      createDevice(data.rtpCapabilities);
    });
  };

  const createDevice = async (rtpCapabilities1) => {
    try {
      device = new Device();
      await device.load({ routerRtpCapabilities: rtpCapabilities1 });
      console.log("Device RTP Capabilities", device.rtpCapabilities);
      getProducers();
    } catch (error) {
      console.error("Error creating device:", error);
      if (error.name === "UnsupportedError") {
        console.warn("Browser not supported");
      }
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
          console.log(params.kind, "remoteProducerId ", remoteProducerId);

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

  const resumeProducerStream = (socketId, kind) => {
    if (!socketId) {
      console.log("please provide socket id");
      return;
    }
    socket.emit("resumeProducerStream", { socketId, kind }, (response) => {
      if (response.success) {
        console.log("Producer stream resumed");
        // Handle video playback, etc.
      } else {
        console.error("Failed to select producer stream:", response.error);
      }
    });
  };

  const pauseProducerStream = (socketId, kind) => {
    if (!socketId) {
      console.log("please provide producer id");
      return;
    }
    socket.emit("pauseProducerStream", { socketId, kind }, (response) => {
      if (response.success) {
        console.log("Producer stream paused");
        // Update UI accordingly
      } else {
        console.error("Failed to deselect producer stream:", response.error);
      }
    });
  };

  return (
    <div>
      <h1>Tutor Proctoring</h1>
      <input
        type="text"
        placeholder="Enter socker ID"
        value={socketStreamId}
        onChange={(e) => setsocketStreamId(e.target.value)}
      />
      <button onClick={() => resumeProducerStream(socketStreamId, "video")}>
        Resume Stream
      </button>
      <button onClick={() => pauseProducerStream(socketStreamId, "video")}>
        Pause Stream
      </button>
      <div ref={videoContainerRef} id="video-container" />
    </div>
  );
};

export default TutorProctoring;
