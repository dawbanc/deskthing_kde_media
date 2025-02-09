
import { DeskThing, SocketData } from "deskthing-server";
export { DeskThing };

import { sendImage, sendSampleData } from "./sendingData";
import { sendCurrentPlayingData, setCommand } from "./kde_players.ts";

let lastRequestTime = 0;
let isRequestPending = false;

const handleRequest = async (request: SocketData) => {
  const currentTime = Date.now();

  if (currentTime - lastRequestTime < 2000) {
    return; // Ignore the request
  }
  if (isRequestPending) {
    return; // Ignore the request
  }

  isRequestPending = true; // Set flag to indicate a request is in progress
  lastRequestTime = currentTime; // Update the last request time

  try {
    if (request.request === "song") {
      DeskThing.sendLog("Request for song data received");
      await sendCurrentPlayingData(); // Await the sendCurrentPlayingData function
    } else if (request.request === "refresh") {
      DeskThing.sendLog("Request for refresh received");
      await sendCurrentPlayingData(); // Await the sendCurrentPlayingData function
    } else {
      DeskThing.sendError("Unknown request from client..." + request.request);
    }
  } catch (error) {
    DeskThing.sendError("Error handling request: " + error);
  } finally {
    isRequestPending = false; // Reset the flag in *all* cases (success or error)
  }
};

const handleSet = async (request: SocketData) => {
    DeskThing.sendLog("Set Data: " + request.request + "\nSet Value: " + request.payload);
    await setCommand(request);
}

const start = async () => {
  const Data = await DeskThing.getData();

  sendCurrentPlayingData();

  DeskThing.on("get", handleRequest);
  DeskThing.on("set", handleSet);

};

const stop = async () => {
  DeskThing.sendLog('Server Stopped');
};


// Main Entrypoint of the server
DeskThing.on("start", start);

// Main exit point of the server
DeskThing.on("stop", stop);

