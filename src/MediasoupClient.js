// import React, { useEffect, useRef, useState } from "react";
// import io from "socket.io-client";
// import * as mediasoupClient from "mediasoup-client";

// const socket = io("https://127.0.0.1:8000/mediasoup");

// const MediasoupClient = () => {
//   // const [roomName, setroomName] = useState("12");
//   const roomName = "12";
//   // const [streams, setStreams] = useState([]);
//   const localVideoRef = useRef(null);

//   let device;
//   let rtpCapabilities;
//   let producerTransport;
//   let consumerTransports = [];
//   let audioProducer;
//   let videoProducer;
//   let consumer;
//   let isProducer = false;

//   // https://mediasoup.org/documentation/v3/mediasoup-client/api/#ProducerOptions
//   // https://mediasoup.org/documentation/v3/mediasoup-client/api/#transport-produce
//   let params = {
//     // mediasoup params
//     encodings: [
//       {
//         rid: "r0",
//         maxBitrate: 100000,
//         scalabilityMode: "S1T3",
//       },
//       {
//         rid: "r1",
//         maxBitrate: 300000,
//         scalabilityMode: "S1T3",
//       },
//       {
//         rid: "r2",
//         maxBitrate: 900000,
//         scalabilityMode: "S1T3",
//       },
//     ],
//     // https://mediasoup.org/documentation/v3/mediasoup-client/api/#ProducerCodecOptions
//     codecOptions: {
//       videoGoogleStartBitrate: 1000,
//     },
//   };

//   let audioParams;
//   let videoParams = { params };
//   let consumingTransports = [];

//   const streamSuccess = (stream) => {
//     localVideoRef.current.srcObject = stream;

//     audioParams = { track: stream.getAudioTracks()[0], ...audioParams };
//     videoParams = { track: stream.getVideoTracks()[0], ...videoParams };

//     joinRoom();
//   };

//   const joinRoom = () => {
//     socket.emit("joinRoom", { roomName }, (data) => {
//       console.log(`Router RTP Capabilities... ${data.rtpCapabilities}`);
//       // we assign to local variable and will be used when
//       // loading the client Device (see createDevice above)
//       rtpCapabilities = data.rtpCapabilities;

//       // once we have rtpCapabilities from the Router, create Device
//       createDevice();
//     });
//   };

//   const getLocalStream = () => {
//     navigator.mediaDevices
//       .getUserMedia({
//         audio: true,
//         video: {
//           width: {
//             min: 640,
//             max: 1920,
//           },
//           height: {
//             min: 400,
//             max: 1080,
//           },
//         },
//       })
//       .then(streamSuccess)
//       .catch((error) => {
//         console.log(error.message);
//       });
//   };

//   // A device is an endpoint connecting to a Router on the
//   // server side to send/recive media
//   const createDevice = async () => {
//     try {
//       device = new mediasoupClient.Device();

//       // https://mediasoup.org/documentation/v3/mediasoup-client/api/#device-load
//       // Loads the device with RTP capabilities of the Router (server side)
//       await device.load({
//         // see getRtpCapabilities() below
//         routerRtpCapabilities: rtpCapabilities,
//       });

//       console.log("Device RTP Capabilities", device.rtpCapabilities);

//       // once the device loads, create transport
//       createSendTransport();
//     } catch (error) {
//       console.log(error);
//       if (error.name === "UnsupportedError")
//         console.warn("browser not supported");
//     }
//   };

//   const createSendTransport = () => {
//     // see server's socket.on('createWebRtcTransport', sender?, ...)
//     // this is a call from Producer, so sender = true
//     socket.emit("createWebRtcTransport", { consumer: false }, ({ params }) => {
//       // The server sends back params needed
//       // to create Send Transport on the client side
//       if (params.error) {
//         console.log(params.error);
//         return;
//       }

//       console.log(params);

//       // creates a new WebRTC Transport to send media
//       // based on the server's producer transport params
//       // https://mediasoup.org/documentation/v3/mediasoup-client/api/#TransportOptions
//       producerTransport = device.createSendTransport(params);

//       // https://mediasoup.org/documentation/v3/communication-between-client-and-server/#producing-media
//       // this event is raised when a first call to transport.produce() is made
//       // see connectSendTransport() below
//       producerTransport.on(
//         "connect",
//         async ({ dtlsParameters }, callback, errback) => {
//           try {
//             // Signal local DTLS parameters to the server side transport
//             // see server's socket.on('transport-connect', ...)
//             await socket.emit("transport-connect", {
//               dtlsParameters,
//             });

//             // Tell the transport that parameters were transmitted.
//             callback();
//           } catch (error) {
//             errback(error);
//           }
//         }
//       );

//       producerTransport.on("produce", async (parameters, callback, errback) => {
//         console.log(parameters);

//         try {
//           // tell the server to create a Producer
//           // with the following parameters and produce
//           // and expect back a server side producer id
//           // see server's socket.on('transport-produce', ...)
//           await socket.emit(
//             "transport-produce",
//             {
//               kind: parameters.kind,
//               rtpParameters: parameters.rtpParameters,
//               appData: parameters.appData,
//             },
//             ({ id, producersExist }) => {
//               // Tell the transport that parameters were transmitted and provide it with the
//               // server side producer's id.
//               callback({ id });

//               // if producers exist, then join room
//               if (producersExist) getProducers();
//             }
//           );
//         } catch (error) {
//           errback(error);
//         }
//       });

//       connectSendTransport();
//     });
//   };

//   const connectSendTransport = async () => {
//     // we now call produce() to instruct the producer transport
//     // to send media to the Router
//     // https://mediasoup.org/documentation/v3/mediasoup-client/api/#transport-produce
//     // this action will trigger the 'connect' and 'produce' events above

//     audioProducer = await producerTransport.produce(audioParams);
//     videoProducer = await producerTransport.produce(videoParams);

//     audioProducer.on("trackended", () => {
//       console.log("audio track ended");

//       // close audio track
//     });

//     audioProducer.on("transportclose", () => {
//       console.log("audio transport ended");

//       // close audio track
//     });

//     videoProducer.on("trackended", () => {
//       console.log("video track ended");

//       // close video track
//     });

//     videoProducer.on("transportclose", () => {
//       console.log("video transport ended");

//       // close video track
//     });
//   };

//   const signalNewConsumerTransport = async (remoteProducerId) => {
//     //check if we are already consuming the remoteProducerId
//     if (consumingTransports.includes(remoteProducerId)) return;
//     consumingTransports.push(remoteProducerId);

//     await socket.emit(
//       "createWebRtcTransport",
//       { consumer: true },
//       ({ params }) => {
//         // The server sends back params needed
//         // to create Send Transport on the client side
//         if (params.error) {
//           console.log(params.error);
//           return;
//         }
//         console.log(`PARAMS... ${params}`);

//         let consumerTransport;
//         try {
//           consumerTransport = device.createRecvTransport(params);
//         } catch (error) {
//           // exceptions:
//           // {InvalidStateError} if not loaded
//           // {TypeError} if wrong arguments.
//           console.log(error);
//           return;
//         }

//         consumerTransport.on(
//           "connect",
//           async ({ dtlsParameters }, callback, errback) => {
//             try {
//               // Signal local DTLS parameters to the server side transport
//               // see server's socket.on('transport-recv-connect', ...)
//               await socket.emit("transport-recv-connect", {
//                 dtlsParameters,
//                 serverConsumerTransportId: params.id,
//               });

//               // Tell the transport that parameters were transmitted.
//               callback();
//             } catch (error) {
//               // Tell the transport that something was wrong
//               errback(error);
//             }
//           }
//         );

//         connectRecvTransport(consumerTransport, remoteProducerId, params.id);
//       }
//     );
//   };

//   const getProducers = () => {
//     socket.emit("getProducers", (producerIds) => {
//       console.log(producerIds);
//       // for each of the producer create a consumer
//       // producerIds.forEach(id => signalNewConsumerTransport(id))
//       producerIds.forEach(signalNewConsumerTransport);
//     });
//   };

//   const connectRecvTransport = async (
//     consumerTransport,
//     remoteProducerId,
//     serverConsumerTransportId
//   ) => {
//     // for consumer, we need to tell the server first
//     // to create a consumer based on the rtpCapabilities and consume
//     // if the router can consume, it will send back a set of params as below
//     await socket.emit(
//       "consume",
//       {
//         rtpCapabilities: device.rtpCapabilities,
//         remoteProducerId,
//         serverConsumerTransportId,
//       },
//       async ({ params }) => {
//         if (params.error) {
//           console.log("Cannot Consume");
//           return;
//         }

//         console.log(`Consumer Params ${params}`);
//         // then consume with the local consumer transport
//         // which creates a consumer
//         const consumer = await consumerTransport.consume({
//           id: params.id,
//           producerId: params.producerId,
//           kind: params.kind,
//           rtpParameters: params.rtpParameters,
//         });

//         consumerTransports = [
//           ...consumerTransports,
//           {
//             consumerTransport,
//             serverConsumerTransportId: params.id,
//             producerId: remoteProducerId,
//             consumer,
//           },
//         ];

//         // // create a new div element for the new consumer media
//         // const newElem = document.createElement("div");
//         // newElem.setAttribute("id", `td-${remoteProducerId}`);

//         // if (params.kind == "audio") {
//         //   //append to the audio container
//         //   newElem.innerHTML =
//         //     '<audio id="' + remoteProducerId + '" autoplay></audio>';
//         // } else {
//         //   //append to the video container
//         //   newElem.setAttribute("class", "remoteVideo");
//         //   newElem.innerHTML =
//         //     '<video id="' +
//         //     remoteProducerId +
//         //     '" autoplay class="video" ></video>';
//         // }

//         // videoContainer.appendChild(newElem);

//         // // destructure and retrieve the video track from the producer
//         // const { track } = consumer;

//         // document.getElementById(remoteProducerId).srcObject = new MediaStream([
//         //   track,
//         // ]);

//         const newStream = new MediaStream();
//         newStream.addTrack(consumer.track);

//         // setStreams((prev) => [...prev, newStream]);

//         // the server consumer started with media paused
//         // so we need to inform the server to resume
//         socket.emit("consumer-resume", {
//           serverConsumerId: params.serverConsumerId,
//         });
//       }
//     );
//   };

//   useEffect(() => {
//     socket.on("connection-success", ({ socketId }) => {
//       console.log("socketId", socketId);
//       getLocalStream();
//     });

//     // server informs the client of a new producer just joined
//     socket.on("new-producer", ({ producerId }) =>
//       signalNewConsumerTransport(producerId)
//     );

//     socket.on("producer-closed", ({ remoteProducerId }) => {
//       // server notification is received when a producer is closed
//       // we need to close the client-side consumer and associated transport
//       const producerToClose = consumerTransports.find(
//         (transportData) => transportData.producerId === remoteProducerId
//       );
//       producerToClose.consumerTransport.close();
//       producerToClose.consumer.close();

//       // remove the consumer transport from the list
//       consumerTransports = consumerTransports.filter(
//         (transportData) => transportData.producerId !== remoteProducerId
//       );

//       // // remove the video div element
//       // videoContainer.removeChild(
//       //   document.getElementById(`td-${remoteProducerId}`)
//       // );
//     });
//   }, []);

//   return (
//     <div>
//       <h1> Proctoring</h1>
//       {/* <input
//         type="text"
//         placeholder="Enter Room ID"
//         value={roomName}
//         onChange={(e) => setroomName(e.target.value)}
//       />
//       <button onClick={() => joinRoom()}>Join Room</button> */}
//       <video
//         ref={localVideoRef}
//         autoPlay
//         muted
//         style={{ width: "300px", height: "200px" }}
//       />
//       {/* <div>
//         {streams.map((stream, index) => (
//           <video
//             key={index}
//             ref={(el) => {
//               if (el) el.srcObject = stream;
//             }}
//             autoPlay
//             style={{ width: "300px", height: "200px" }}
//           />
//         ))}
//       </div> */}
//     </div>
//   );
// };

// export default MediasoupClient;

import React, { useState, useEffect, useRef } from "react";
import io from "socket.io-client";
import * as mediasoupClient from "mediasoup-client";

const socket = io("https://127.0.0.1:8000/mediasoup");

const MediasoupComponent = () => {
  const [rtpCapabilities, setRtpCapabilities] = useState(null);
  const [device, setDevice] = useState(null);
  const [producerTransport, setProducerTransport] = useState(null);
  const [consumerTransports, setConsumerTransports] = useState([]);
  const [audioProducer, setAudioProducer] = useState(null);
  const [videoProducer, setVideoProducer] = useState(null);

  const localVideo = useRef(null);
  const videoContainer = useRef(null);

  const roomName = "12";

  const params = {
    encodings: [
      { rid: "r0", maxBitrate: 100000, scalabilityMode: "S1T3" },
      { rid: "r1", maxBitrate: 300000, scalabilityMode: "S1T3" },
      { rid: "r2", maxBitrate: 900000, scalabilityMode: "S1T3" },
    ],
    codecOptions: { videoGoogleStartBitrate: 1000 },
  };

  useEffect(() => {
    socket.on("connection-success", ({ socketId }) => {
      console.log("socketId ", socketId);
      getLocalStream();
    });

    socket.on("new-producer", ({ producerId }) => {
      signalNewConsumerTransport(producerId);
    });

    socket.on("producer-closed", ({ remoteProducerId }) => {
      handleProducerClosed(remoteProducerId);
    });

    // return () => {
    //   socket.disconnect();
    // };
  }, []);

  const getLocalStream = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: {
          width: { min: 640, max: 1920 },
          height: { min: 400, max: 1080 },
        },
      });
      streamSuccess(stream);
    } catch (error) {
      console.log("Error accessing local stream", error);
    }
  };

  let audioParams;
  let videoParams = { params };

  const streamSuccess = (stream) => {
    if (localVideo.current) {
      localVideo.current.srcObject = stream;
    }
    audioParams = { track: stream.getAudioTracks()[0], ...audioParams };
    videoParams = { track: stream.getVideoTracks()[0], ...videoParams };
    joinRoom(audioParams, videoParams);
  };

  const joinRoom = (audioParams, videoParams) => {
    socket.emit("joinRoom", { roomName }, (data) => {
      console.log("RTP Capabilities from server:", data.rtpCapabilities);
      setRtpCapabilities(data.rtpCapabilities);
      createDevice(audioParams, videoParams);
    });
  };

  const createDevice = async (audioParams, videoParams) => {
    try {
      const device = new mediasoupClient.Device();
      await device.load({ routerRtpCapabilities: rtpCapabilities });
      setDevice(device);
      createSendTransport(device, audioParams, videoParams);
    } catch (error) {
      console.error("Error creating device", error);
    }
  };

  const createSendTransport = (device, audioParams, videoParams) => {
    socket.emit("createWebRtcTransport", { consumer: false }, ({ params }) => {
      if (params.error) {
        console.log("Error creating transport", params.error);
        return;
      }

      const transport = device.createSendTransport(params);
      setProducerTransport(transport);

      transport.on("connect", async ({ dtlsParameters }, callback, errback) => {
        try {
          await socket.emit("transport-connect", { dtlsParameters });
          callback();
        } catch (error) {
          errback(error);
        }
      });

      transport.on(
        "produce",
        async ({ kind, rtpParameters, appData }, callback, errback) => {
          try {
            await socket.emit(
              "transport-produce",
              { kind, rtpParameters, appData },
              ({ id }) => {
                callback({ id });
                getProducers(); // Fetch the list of producers once the transport is connected
              }
            );
          } catch (error) {
            errback(error);
          }
        }
      );

      connectSendTransport(transport, audioParams, videoParams);
    });
  };

  const connectSendTransport = async (transport, audioParams, videoParams) => {
    const audioProducer = await transport.produce(audioParams);
    const videoProducer = await transport.produce(videoParams);

    setAudioProducer(audioProducer);
    setVideoProducer(videoProducer);
  };

  // Define getProducers to fetch the producers in the room
  const getProducers = () => {
    socket.emit("getProducers", (producers) => {
      producers.forEach((producerId) => signalNewConsumerTransport(producerId));
    });
  };

  const signalNewConsumerTransport = (remoteProducerId) => {
    socket.emit("createWebRtcTransport", { consumer: true }, ({ params }) => {
      const transport = device.createRecvTransport(params);
      transport.on("connect", async ({ dtlsParameters }, callback, errback) => {
        try {
          await socket.emit("transport-recv-connect", { dtlsParameters });
          callback();
        } catch (error) {
          errback(error);
        }
      });

      connectRecvTransport(transport, remoteProducerId);
    });
  };

  const connectRecvTransport = async (transport, remoteProducerId) => {
    socket.emit(
      "consume",
      { rtpCapabilities: device.rtpCapabilities, remoteProducerId },
      async ({ params }) => {
        const consumer = await transport.consume({
          id: params.id,
          producerId: params.producerId,
          kind: params.kind,
          rtpParameters: params.rtpParameters,
        });

        setConsumerTransports((prev) => [
          ...prev,
          {
            consumerTransport: transport,
            consumer,
            producerId: remoteProducerId,
          },
        ]);

        const newMediaElement = document.createElement(
          params.kind === "audio" ? "audio" : "video"
        );
        newMediaElement.srcObject = new MediaStream([consumer.track]);
        newMediaElement.autoplay = true;
        newMediaElement.id = remoteProducerId;

        if (videoContainer.current) {
          videoContainer.current.appendChild(newMediaElement);
        }

        socket.emit("consumer-resume", {
          serverConsumerId: params.serverConsumerId,
        });
      }
    );
  };

  const handleProducerClosed = (remoteProducerId) => {
    const consumerToClose = consumerTransports.find(
      (t) => t.producerId === remoteProducerId
    );
    if (consumerToClose) {
      consumerToClose.consumerTransport.close();
      consumerToClose.consumer.close();
      setConsumerTransports((prev) =>
        prev.filter((t) => t.producerId !== remoteProducerId)
      );
      if (videoContainer.current) {
        const elem = document.getElementById(remoteProducerId);
        if (elem) {
          videoContainer.current.removeChild(elem);
        }
      }
    }
  };

  return (
    <div>
      <video
        ref={localVideo}
        autoPlay
        muted
        style={{ width: "300px", height: "200px" }}
      />
      <div ref={videoContainer}></div>
    </div>
  );
};

export default MediasoupComponent;
