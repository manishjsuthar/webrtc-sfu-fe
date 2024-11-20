import React, { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { Device } from "mediasoup-client";
import { useParams } from "react-router-dom";
const socket = io("https://turn.skillifyai.in/mediasoup");

const StudentProctoring = () => {
  const localVideoRef = useRef(null);
  const { roomName } = useParams();
  const [username, setusername] = useState("");
  const [isRecordingStarted, setisRecordingStarted] = useState(false);
  let device;
  const mediaRecordedChunks = [];
  const screenRecordedChunks = [];
  const mediaRecorder = useRef(null);
  const screenRecorder = useRef(null);
  const canvasRef = useRef(null);
  const [snapshots, setSnapshots] = useState([]);

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
      // getLocalStream();
    };

    socket.on("connection-success", handleConnectionSuccess);

    return () => {
      socket.off("connection-success", handleConnectionSuccess);
      // socket.disconnect();
    };
  }, []);

  const getLocalStream = (userId) => {
    navigator.mediaDevices
      .getUserMedia({
        audio: true,
        video: {
          width: { min: 640, max: 1920 },
          height: { min: 400, max: 1080 },
        },
      })
      .then((stream) => streamSuccess(stream, userId))
      .catch((error) => console.error("Error accessing media devices.", error));
  };

  const takeRandomSnapshot = () => {
    if (localVideoRef.current && canvasRef.current) {
      const video = localVideoRef.current;
      const canvas = canvasRef.current;
      const context = canvas.getContext("2d");

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      context.drawImage(video, 0, 0, canvas.width, canvas.height);

      const imageData = canvas.toDataURL("image/png");
      setSnapshots((prevSnapshots) => [...prevSnapshots, imageData]);

      const randomDelay = Math.random() * (6000 - 3000) + 2000; // Random delay between 3s and 6s
      setTimeout(takeRandomSnapshot, randomDelay);
    }
  };

  const startRecording = () => {
    if (localVideoRef.current && localVideoRef.current.srcObject) {
      setisRecordingStarted(true);
      const mediaStream = localVideoRef.current.srcObject;

      try {
        const media = new MediaRecorder(mediaStream, {
          mimeType: "video/webm; codecs=vp9",
        });

        mediaRecorder.current = media;

        mediaRecorder.current.ondataavailable = (event) => {
          if (event.data && event.data.size > 0) {
            uploadFile(event.data)
            mediaRecordedChunks.push(event.data);
          }
        };

        mediaRecorder.current.onstop = () => {
          // const blob = new Blob(mediaRecordedChunks, { type: "video/webm" });
          // const url = URL.createObjectURL(blob);
          // // Save the URL or handle it as needed
          // console.log("Recording stopped, blob URL: ", url);
          // if (mediaRecordedChunks.length > 0) {
          //   const fullBlob = new Blob(mediaRecordedChunks, {
          //     type: "video/webm",
          //   });
          //   uploadFile(fullBlob);
          //   downloadVideo("user");
          // }
        };

        // Start recording
        mediaRecorder.current.start(2500);
      } catch (error) {
        console.error("Error starting MediaRecorder:", error);
      }
    } else {
      console.error("No media stream available for recording.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorder.current && mediaRecorder.current.state === "recording") {
      stopScreenRecording();
      mediaRecorder.current.stop();
      setisRecordingStarted(false);
    } else {
      console.error("MediaRecorder is not active or not initialized.");
    }
  };

  // async function uploadChunkToS3(blob) {
  //   const params = {
  //     Bucket: "your-s3-bucket-name",
  //     Key: `videos/recording-${Date.now()}.webm`,
  //     Body: blob,
  //     ContentType: "video/webm",
  //   };

  //   try {
  //     await s3.upload(params).promise();
  //     console.log("Chunk uploaded successfully");
  //   } catch (error) {
  //     console.error("Error uploading chunk:", error);
  //   }
  // }

  const uploadFile = async (blob) => {
    const formData = new FormData();
    formData.append("file", blob, `webcam-record-${Date.now()}.webm`);
    formData.append("uploadType", "recordings/webcam");

    //add user Data also

    await fetch("https://stagingapi.skillifyai.in/file/upload", {
      headers: {
        authtoken:
          "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI2NzI3YjFkMTIwMjU4OWM0YjIyNzhhOTAiLCJyb2xlcyI6WyJzdHVkZW50Il0sImlrIjoicHJvY3RvcmluZyIsImlhdCI6MTczMTkwODc1OCwiZXhwIjoxNzMxOTk1MTU4fQ.7Rkvv41h99K_M4LvUuLlyCCAO6ipW6KcxT5Sl3oYxNA",
        instancekey: "proctoring",
      },
      method: "POST",
      body: formData,
    });
  };

  function downloadVideo(recordType) {
    const blob = new Blob(
      recordType === "screen" ? screenRecordedChunks : mediaRecordedChunks,
      { type: "video/webm" }
    );
    const url = URL.createObjectURL(blob);

    const downloadLink = document.createElement("a");
    downloadLink.href = url;
    downloadLink.download = `${
      recordType === "screen" && "screen-"
    }recording-${Date.now()}.webm`;
    downloadLink.textContent = "Download video";

    document.body.appendChild(downloadLink);
    downloadLink.click();

    setTimeout(() => {
      URL.revokeObjectURL(url);
      document.body.removeChild(downloadLink);
    }, 100);
  }

  async function startScreenRecording() {
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
      });
      const media = new MediaRecorder(screenStream, {
        mimeType: "video/webm; codecs=vp9",
      });

      screenRecorder.current = media;

      screenRecorder.current.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          screenRecordedChunks.push(event.data);
        }
      };

      screenRecorder.current.onstop = () => {
        // const blob = new Blob(screenRecordedChunks, { type: "video/webm" });
        // const url = URL.createObjectURL(blob);
        // // Save the URL or handle it as needed
        // console.log("Recording stopped, blob URL: ", url);
        downloadVideo("screen");
      };

      // Start recording
      screenRecorder.current.start();
    } catch (error) {
      console.error("Error starting Screen MediaRecorder:", error);
    }
  }

  const stopScreenRecording = () => {
    if (
      screenRecorder.current &&
      screenRecorder.current.state === "recording"
    ) {
      screenRecorder.current.stop();

      console.log("Screen Recording stopped");
    } else {
      console.error("Screen MediaRecorder is not active or not initialized.");
    }
  };

  const streamSuccess = (stream, userId) => {
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = stream;
      takeRandomSnapshot();
    }
    const audioParams = { track: stream.getAudioTracks()[0] };
    const videoParams = {
      track: stream.getVideoTracks()[0],
      params: getVideoParams(),
    };

    joinRoom(audioParams, videoParams, userId);
  };

  const joinRoom = (audioParams, videoParams, userId) => {
    socket.emit(
      "joinRoom",
      { roomName, role: "student", name: "test", id: userId },
      (data) => {
        console.log(`Router RTP Capabilities... ${data.rtpCapabilities}`);
        createDevice(data.rtpCapabilities, audioParams, videoParams);
        startRecording();
        startScreenRecording();
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
      <h3>Snapshots:</h3>
      <div style={{ display: "flex", flexWrap: "wrap" }}>
        {snapshots.map((snapshot, index) => (
          <img
            key={index}
            src={snapshot}
            alt={`snapshot-${index}`}
            style={{ width: "100px", margin: "5px" }}
          />
        ))}
      </div>
      <canvas ref={canvasRef} style={{ display: "none" }} />
      {!isRecordingStarted ? (
        <>
          <input
            type="text"
            placeholder="Enter User ID"
            value={username}
            onChange={(e) => setusername(e.target.value)}
          />
          <button
            onClick={() => {
              username.length
                ? getLocalStream(username)
                : alert("Userid is required");
            }}
          >
            Join Room
          </button>
        </>
      ) : (
        <button onClick={() => stopRecording()}>Stop recording</button>
      )}
      <video ref={localVideoRef} id="local-video" autoPlay muted />
    </div>
  );
};

export default StudentProctoring;
